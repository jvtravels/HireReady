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
import {
  createSttConfidenceState,
  updateSttConfidence,
  resetSttConfidence,
  snapshotSttConfidence,
} from "./_stt-confidence";
import { captureClientEvent } from "./posthogClient";

export interface STTCallbacks {
  setCurrentTranscript: (text: string) => void;
  setMicError: (msg: string) => void;
  setSpeechUnavailable: (v: boolean) => void;
  setShowCaptions: (v: boolean) => void;
  toast: (msg: string, type?: ToastType) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  interviewEndedRef: React.MutableRefObject<boolean>;
  /**
   * Optional: notified when STT confidence indicates the LLM may be
   * grading misheard text. UI can use this to show a "speak clearly"
   * hint or log to service_usage. Fires at most once per turn (when
   * the heuristic crosses the threshold). Caller is responsible for
   * resetting state when a new turn begins.
   */
  onLowSttConfidence?: (snapshot: { mean: number; min: number; lowFraction: number }) => void;
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
  /** Bump to force STT to stop + restart cleanly. Wired to the
   *  Space-to-start-speaking shortcut + the "Tap to start" button so
   *  users have an explicit trigger when auto-start fails silently. */
  restartTrigger = 0,
) {
  const recognitionRestartCountRef = useRef(0);
  const deepgramRetryRef = useRef(0);
  /* B-EMP3 (2026-08-20): Chrome's Web Speech API "network" error is a
   * well-documented transient blip (it round-trips audio to Google's
   * servers even though the API is "free" client-side) — it fires and
   * clears within seconds on a healthy connection. Treating it as fatal
   * on the FIRST occurrence (previous behavior) permanently disabled
   * voice input for the rest of the interview on one hiccup. Tolerate a
   * few before giving up, matching the existing no-speech retry pattern. */
  const networkErrorCountRef = useRef(0);

  // Start/stop speech recognition based on phase
  useEffect(() => {
    if (phase === "listening" && !isMuted && !speechUnavailable) {
      recognitionRestartCountRef.current = 0;
      deepgramRetryRef.current = 0;
      networkErrorCountRef.current = 0;
      let stopped = false;

      // Billable-STT instrumentation. Deepgram/Sarvam bill by audio (≈ wall-clock
      // the mic streams), but until now we logged only the *provider name*, never
      // duration — so per-session STT cost was unmeasurable. Stamp the moment this
      // listening turn opens and emit the elapsed seconds (tagged with whichever
      // provider actually served) on cleanup, so PostHog carries a real cost proxy.
      const listenStartMs = Date.now();
      let activeSttProvider = "deepgram";

      let deepgramCleanup: (() => void) | null = null;
      let sarvamCleanup: (() => void) | null = null;

      // Rolling-silence safety timer. Hoisted above all STT branches so
      // every provider's onTranscript can re-arm it. Previous version was
      // a fixed 30s timer from listening-start, which yanked users into
      // text mode mid-answer for any STAR response longer than 30s.
      let safetyTimer: ReturnType<typeof setTimeout> | null = null;
      const SAFETY_SILENCE_MS = 30_000;
      const armSafetyTimer = () => {
        if (safetyTimer) clearTimeout(safetyTimer);
        safetyTimer = setTimeout(() => {
          if (!stopped && !callbacks.interviewEndedRef.current && phase === "listening") {
            console.warn("[interview] Listening safety timeout — enabling text fallback");
            handleFallbackToText("Having trouble hearing you? Type your answer instead.");
          }
        }, SAFETY_SILENCE_MS);
      };

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
        console.warn("[STT] Trying Sarvam AI fallback...");
        const handle = await createSarvamSTT({
          onTranscript: (finalText, interim) => {
            if (!stopped) {
              if (finalText || interim) armSafetyTimer();
              // preservedFinalText carries any partial answer captured by
              // Deepgram before it dropped — without prefixing it here, the
              // candidate's earlier sentences disappear from the visible
              // transcript the moment Sarvam takes over.
              callbacks.setCurrentTranscript(preservedFinalText + finalText + interim);
            }
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
          activeSttProvider = "sarvam";
          captureClientEvent("stt_provider_used", { provider: "sarvam", fellThroughFrom: "deepgram" });
        } else {
          // Previously this branch only logged to console — users hit Web
          // Speech with no signal in PostHog and no toast, masking a real
          // failure pattern (e.g. Sarvam token endpoint regressions).
          console.warn("[Sarvam] setup failed, falling back to Web Speech API");
          callbacks.toast("Speech recognition switched to browser fallback.", "info");
          captureClientEvent("stt_setup_failed", { provider: "sarvam", fellThroughTo: "webspeech" });
          startWebSpeechAPI();
        }
      };

      // Preserve transcript across Deepgram reconnects — without this, the
      // user's words spoken before the disconnect are lost on retry and they
      // have to repeat themselves.
      let preservedFinalText = "";
      let lastFinalText = "";

      // Arm the silence timer for the listening phase. Re-armed on every
      // transcript update from any STT provider below.
      armSafetyTimer();

      // Per-turn STT confidence tracker. Resets each time we open a
      // fresh Deepgram handle (which corresponds to a new "listening"
      // phase entry). Fires onLowSttConfidence at most once per turn
      // when the heuristic threshold is crossed, so the UI doesn't
      // flicker the "low confidence" hint on/off as new chunks land.
      const sttConf = createSttConfidenceState();
      let lowConfFired = false;

      const tryDeepgram = async () => {
        if (stopped) return;
        lastFinalText = "";
        resetSttConfidence(sttConf);
        lowConfFired = false;
        const handle = await createDeepgramSTT({
          onTranscript: (finalText, interim) => {
            if (stopped) return;
            // Any speech detected → re-arm the silence timer. Without this
            // a 60s STAR answer would trip the 30s safety and yank the user
            // into text mode mid-thought.
            if ((finalText && finalText !== lastFinalText) || interim) {
              armSafetyTimer();
            }
            lastFinalText = finalText;
            callbacks.setCurrentTranscript(preservedFinalText + finalText + interim);
          },
          onConfidence: (confidence) => {
            if (stopped) return;
            updateSttConfidence(sttConf, confidence);
            if (lowConfFired || !callbacks.onLowSttConfidence) return;
            const snap = snapshotSttConfidence(sttConf);
            if (snap.shouldHint) {
              lowConfFired = true;
              callbacks.onLowSttConfidence({
                mean: snap.mean,
                min: snap.min,
                lowFraction: snap.lowFraction,
              });
            }
          },
          onError: (error) => {
            if (stopped) return;
            if (error === "not-allowed") {
              handleMicDenied();
            } else {
              console.warn("[Deepgram] error, falling back to Sarvam AI:", error);
              // Emit a distinguishable PostHog signal so ops can tell
              // "Deepgram 429" apart from "Deepgram WS dropped" — both
              // surface as `error` here but the recovery and incidence
              // patterns differ. The toast on Sarvam fallback already
              // tells the user, so we don't re-toast.
              captureClientEvent("stt_provider_error", { provider: "deepgram", reason: typeof error === "string" ? error.slice(0, 60) : "unknown", fellThroughTo: "sarvam" });
              refs.deepgramRef.current = null;
              trySarvam();
            }
          },
          onEnd: () => {
            if (stopped || callbacks.interviewEndedRef.current) return;
            // Roll the partial finalText forward so the next handle continues
            // the user's answer instead of starting fresh.
            preservedFinalText += lastFinalText;
            refs.deepgramRef.current = null;
            if (navigator.onLine && deepgramRetryRef.current < 2) {
              deepgramRetryRef.current++;
              const backoffMs = 1000 * Math.pow(2, deepgramRetryRef.current - 1);
              console.warn(`[Deepgram] connection ended, retrying in ${backoffMs}ms (attempt ${deepgramRetryRef.current}/2)`);
              callbacks.toast("Reconnecting speech recognition...", "info");
              setTimeout(() => { if (!stopped) tryDeepgram(); }, backoffMs);
            } else {
              console.warn("[Deepgram] retries exhausted, falling back to Sarvam AI");
              captureClientEvent("stt_provider_error", { provider: "deepgram", reason: "ws_ended_retries_exhausted", fellThroughTo: "sarvam" });
              trySarvam();
            }
          },
        });
        if (stopped) { handle?.abort(); return; }
        if (handle) {
          refs.deepgramRef.current = handle;
          deepgramCleanup = () => { handle.stop(); refs.deepgramRef.current = null; };
          activeSttProvider = "deepgram";
          captureClientEvent("stt_provider_used", { provider: "deepgram" });
        } else {
          console.warn("[Deepgram] setup failed, falling back to Sarvam AI");
          captureClientEvent("stt_setup_failed", { provider: "deepgram", fellThroughTo: "sarvam" });
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
            networkErrorCountRef.current += 1;
            if (networkErrorCountRef.current >= 3) {
              handleFallbackToText("Speech recognition network error. Type your answer below.");
            } else {
              console.warn(`[speech] transient network error (${networkErrorCountRef.current}/3), letting onend retry`);
            }
          } else if (error !== "aborted") {
            handleFallbackToText("Microphone issue detected. Try unmuting or refreshing.");
          }
        };
        // Wrap onresult to reset counters AND re-arm the silence safety
        // timer on successful speech.
        recognition.onresult = ((origOnResult) => {
          return (event: SpeechRecognitionEvent) => {
            refs.noSpeechCountRef.current = 0;
            recognitionRestartCountRef.current = 0;
            networkErrorCountRef.current = 0;
            armSafetyTimer();
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
        try {
          recognition.start();
          activeSttProvider = "webspeech";
          captureClientEvent("stt_provider_used", { provider: "webspeech", fellThroughFrom: "sarvam" });
        } catch (e) {
          console.warn("Speech recognition failed to start:", e);
          callbacks.setMicError("Could not start speech recognition. Try refreshing.");
          captureClientEvent("stt_setup_failed", { provider: "webspeech" });
        }
        refs.recognitionRef.current = recognition;
      }

      tryDeepgram();

      return () => {
        if (safetyTimer) clearTimeout(safetyTimer);
        stopped = true;
        // Emit billable STT seconds for this listening turn (webspeech is free,
        // but log it anyway so the provider mix is complete). Only when the mic
        // actually streamed for a beat — sub-second blips are setup churn, not cost.
        const seconds = Math.round((Date.now() - listenStartMs) / 1000);
        if (seconds >= 1) {
          captureClientEvent("stt_listening_seconds", { provider: activeSttProvider, seconds });
        }
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
    // The hook receives `refs` and `callbacks` as bag objects whose .current values are written via mutation; including the bags as deps would re-bind the STT chain on every parent render. Phase/mute/speechUnavailable/restartTrigger are the actual triggers that should rewire STT.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, isMuted, speechUnavailable, restartTrigger]);

  // Capture mic stream for waveform visualizer.
  // Delayed 800ms so Deepgram's own getUserMedia resolves first — on Android
  // MIUI a concurrent second getUserMedia triggers a redundant OS permission
  // dialog mid-interview. The stream is optional (waveform only); missing it
  // is silent.
  useEffect(() => {
    if (phase !== "listening" || isMuted) { refs.micStreamRef.current = null; return; }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        refs.micStreamRef.current = stream;
      }).catch(() => {});
    }, 800);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      refs.micStreamRef.current?.getTracks().forEach(t => t.stop());
      refs.micStreamRef.current = null;
    };
    // refs.micStreamRef is mutated, not consumed — including it as a dep would rebind the mic on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, isMuted]);
}
