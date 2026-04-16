/* ─── Interview Speech-to-Text Hook ─── */
/* Manages the STT fallback chain: Deepgram Nova-3 → Sarvam AI → Web Speech API.
   Also handles mic stream capture for waveform visualization.
   Extracted from useInterviewEngine. */

import { useEffect, useRef } from "react";
import { createDeepgramSTT, type DeepgramSTTHandle } from "./deepgramSTT";
import { createSarvamSTT, type SarvamSTTHandle } from "./sarvamSTT";
import { createSpeechRecognition } from "./speechRecognition";
import type { SpeechRecognitionInstance, SpeechRecognitionEvent } from "./speechRecognition";
import type { ToastType } from "./Toast";

export interface STTCallbacks {
  setCurrentTranscript: (text: string) => void;
  setMicError: (msg: string) => void;
  setSpeechUnavailable: (v: boolean) => void;
  setShowCaptions: (v: boolean) => void;
  toast: (msg: string, type?: ToastType) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  interviewEndedRef: React.MutableRefObject<boolean>;
}

export interface STTRefs {
  recognitionRef: React.MutableRefObject<SpeechRecognitionInstance | null>;
  deepgramRef: React.MutableRefObject<DeepgramSTTHandle | null>;
  sarvamRef: React.MutableRefObject<SarvamSTTHandle | null>;
  noSpeechCountRef: React.MutableRefObject<number>;
  micStreamRef: React.MutableRefObject<MediaStream | null>;
}

/**
 * Manages the full STT lifecycle: starts/stops recognition based on phase,
 * handles the Deepgram → Sarvam → Web Speech API fallback chain,
 * and captures the mic stream for waveform visualization.
 */
export function useInterviewSTT(
  phase: string,
  isMuted: boolean,
  speechUnavailable: boolean,
  callbacks: STTCallbacks,
  refs: STTRefs,
) {
  const recognitionRestartCountRef = useRef(0);
  const deepgramRetryRef = useRef(0);

  // Start/stop speech recognition based on phase
  useEffect(() => {
    if (phase === "listening" && !isMuted && !speechUnavailable) {
      recognitionRestartCountRef.current = 0;
      deepgramRetryRef.current = 0;
      let stopped = false;

      let deepgramCleanup: (() => void) | null = null;
      let sarvamCleanup: (() => void) | null = null;

      const handleMicDenied = () => {
        callbacks.setMicError("Microphone access denied. Check browser permissions.");
        callbacks.setSpeechUnavailable(true);
        callbacks.setShowCaptions(true);
        setTimeout(() => callbacks.textareaRef.current?.focus(), 100);
      };

      const handleFallbackToText = (msg: string) => {
        callbacks.setSpeechUnavailable(true);
        callbacks.setMicError(msg);
        setTimeout(() => callbacks.textareaRef.current?.focus(), 100);
      };

      // Fallback chain: Deepgram Nova-3 → Sarvam AI → Web Speech API
      const trySarvam = async () => {
        if (stopped) return;
        console.info("[STT] Trying Sarvam AI fallback...");
        const handle = await createSarvamSTT({
          onTranscript: (finalText, interim) => {
            if (!stopped) callbacks.setCurrentTranscript(finalText + interim);
          },
          onError: (error) => {
            if (stopped) return;
            if (error === "not-allowed") {
              handleMicDenied();
            } else {
              console.warn("[Sarvam] error, falling back to Web Speech API:", error);
              callbacks.toast("Speech recognition switched to browser fallback.", "info");
              refs.sarvamRef.current = null;
              startWebSpeechAPI();
            }
          },
          onEnd: () => {
            if (stopped || callbacks.interviewEndedRef.current) return;
            refs.sarvamRef.current = null;
            console.warn("[Sarvam] connection ended, falling back to Web Speech API");
            callbacks.toast("Speech recognition switched to browser fallback.", "info");
            startWebSpeechAPI();
          },
        });
        if (stopped) { handle?.abort(); return; }
        if (handle) {
          refs.sarvamRef.current = handle;
          sarvamCleanup = () => { handle.stop(); refs.sarvamRef.current = null; };
        } else {
          console.warn("[Sarvam] setup failed, falling back to Web Speech API");
          startWebSpeechAPI();
        }
      };

      const tryDeepgram = async () => {
        if (stopped) return;
        const handle = await createDeepgramSTT({
          onTranscript: (finalText, interim) => {
            if (!stopped) callbacks.setCurrentTranscript(finalText + interim);
          },
          onError: (error) => {
            if (stopped) return;
            if (error === "not-allowed") {
              handleMicDenied();
            } else {
              console.warn("[Deepgram] error, falling back to Sarvam AI:", error);
              refs.deepgramRef.current = null;
              trySarvam();
            }
          },
          onEnd: () => {
            if (stopped || callbacks.interviewEndedRef.current) return;
            refs.deepgramRef.current = null;
            if (navigator.onLine && deepgramRetryRef.current < 2) {
              deepgramRetryRef.current++;
              const backoffMs = 1000 * Math.pow(2, deepgramRetryRef.current - 1);
              console.warn(`[Deepgram] connection ended, retrying in ${backoffMs}ms (attempt ${deepgramRetryRef.current}/2)`);
              callbacks.toast("Reconnecting speech recognition...", "info");
              setTimeout(() => { if (!stopped) tryDeepgram(); }, backoffMs);
            } else {
              console.warn("[Deepgram] retries exhausted, falling back to Sarvam AI");
              trySarvam();
            }
          },
        });
        if (stopped) { handle?.abort(); return; }
        if (handle) {
          refs.deepgramRef.current = handle;
          deepgramCleanup = () => { handle.stop(); refs.deepgramRef.current = null; };
        } else {
          trySarvam();
        }
      };

      function startWebSpeechAPI() {
        if (stopped) return;
        const recognition = createSpeechRecognition();
        if (!recognition) {
          callbacks.setSpeechUnavailable(true);
          return;
        }
        let finalText = "";
        recognition.onresult = (event: SpeechRecognitionEvent) => {
          let interim = "";
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            if (result.isFinal) {
              finalText += result[0].transcript + " ";
            } else {
              interim = result[0].transcript;
            }
          }
          callbacks.setCurrentTranscript(finalText + interim);
        };
        recognition.onerror = (event: { error: string }) => {
          const error = event?.error || "unknown";
          if (error === "not-allowed") {
            handleMicDenied();
          } else if (error === "no-speech") {
            refs.noSpeechCountRef.current += 1;
            if (refs.noSpeechCountRef.current >= 3) {
              handleFallbackToText("No speech detected after multiple attempts. Type your answer below.");
            }
          } else if (error === "network") {
            handleFallbackToText("Speech recognition network error. Type your answer below.");
          } else if (error !== "aborted") {
            handleFallbackToText("Microphone issue detected. Try unmuting or refreshing.");
          }
        };
        // Wrap onresult to reset counters on successful speech
        recognition.onresult = ((origOnResult) => {
          return (event: SpeechRecognitionEvent) => {
            refs.noSpeechCountRef.current = 0;
            recognitionRestartCountRef.current = 0;
            origOnResult(event);
          };
        })(recognition.onresult);
        recognition.onend = () => {
          if (callbacks.interviewEndedRef.current) return;
          if (!stopped) {
            recognitionRestartCountRef.current++;
            if (recognitionRestartCountRef.current > 5) {
              console.warn("[speech] too many restarts, falling back to text input");
              handleFallbackToText("Speech recognition keeps stopping. Type your answer below.");
              callbacks.toast("Mic issues detected — switching to text input.", "info");
              return;
            }
            try { recognition.start(); } catch (e) {
              console.warn("[speech] restart failed, enabling text fallback:", e);
              handleFallbackToText("Speech recognition stopped unexpectedly. Type your answer below.");
            }
          }
        };
        try { recognition.start(); } catch (e) {
          console.warn("Speech recognition failed to start:", e);
          callbacks.setMicError("Could not start speech recognition. Try refreshing.");
        }
        refs.recognitionRef.current = recognition;
      }

      tryDeepgram();

      const safetyTimer = setTimeout(() => {
        if (!stopped && !callbacks.interviewEndedRef.current && phase === "listening") {
          console.warn("[interview] Listening safety timeout — enabling text fallback");
          handleFallbackToText("Having trouble hearing you? Type your answer instead.");
        }
      }, 30_000);

      return () => {
        clearTimeout(safetyTimer);
        stopped = true;
        deepgramCleanup?.();
        sarvamCleanup?.();
        refs.recognitionRef.current?.stop();
        refs.recognitionRef.current = null;
      };
    } else {
      refs.deepgramRef.current?.abort();
      refs.deepgramRef.current = null;
      refs.sarvamRef.current?.abort();
      refs.sarvamRef.current = null;
      refs.recognitionRef.current?.stop();
      refs.recognitionRef.current = null;
      return;
    }
  }, [phase, isMuted, speechUnavailable]);

  // Capture mic stream for waveform visualizer
  useEffect(() => {
    if (phase !== "listening" || isMuted) { refs.micStreamRef.current = null; return; }
    let cancelled = false;
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
      refs.micStreamRef.current = stream;
    }).catch(() => {});
    return () => {
      cancelled = true;
      refs.micStreamRef.current?.getTracks().forEach(t => t.stop());
      refs.micStreamRef.current = null;
    };
  }, [phase, isMuted]);
}
