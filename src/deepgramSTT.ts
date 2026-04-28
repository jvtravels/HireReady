/* Deepgram real-time STT via WebSocket — with Web Speech API fallback */

let _cachedApiKey: string | null = null;
let _apiKeyExpiry = 0;
const API_KEY_TTL = 5 * 60 * 1000; // 5 min
const STORAGE_KEY = "hirestepx_deepgram_token";

/**
 * Rehydrate from sessionStorage on first call — survives page reloads
 * mid-interview (e.g. a user on flaky mobile who refreshes after a
 * disconnect). sessionStorage (not localStorage) so the token dies with
 * the tab, keeping it off disk.
 */
function rehydrateFromStorage() {
  if (_cachedApiKey || typeof sessionStorage === "undefined") return;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { apiKey?: string; expiresAt?: number };
    if (parsed.apiKey && parsed.expiresAt && Date.now() < parsed.expiresAt - API_KEY_TTL * 0.2) {
      _cachedApiKey = parsed.apiKey;
      _apiKeyExpiry = parsed.expiresAt;
    }
  } catch { /* corrupted cache — ignore */ }
}

async function getDeepgramApiKey(): Promise<string | null> {
  rehydrateFromStorage();
  if (_cachedApiKey && Date.now() < _apiKeyExpiry - API_KEY_TTL * 0.2) return _cachedApiKey;
  try {
    const { authHeaders } = await import("./supabase");
    const headers = await authHeaders();
    const res = await fetch("/api/stt-token", { method: "POST", headers });
    if (!res.ok) {
      // Fallback: use stale-but-present token if we have one. Offline
      // reconnect path — better to let the old token fail at Deepgram
      // than bail entirely.
      return _cachedApiKey;
    }
    const data = await res.json();
    _cachedApiKey = data.apiKey || null;
    _apiKeyExpiry = data.expiresAt || (Date.now() + API_KEY_TTL);
    try {
      if (typeof sessionStorage !== "undefined" && _cachedApiKey) {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ apiKey: _cachedApiKey, expiresAt: _apiKeyExpiry }));
      }
    } catch { /* restricted storage */ }
    return _cachedApiKey;
  } catch {
    return _cachedApiKey; // network fail → stale fallback
  }
}

export interface DeepgramSTTHandle {
  stop: () => void;
  abort: () => void;
}

export interface DeepgramSTTCallbacks {
  onTranscript: (finalText: string, interim: string) => void;
  onError: (error: string) => void;
  onEnd: () => void;
  /** Fired when Deepgram VAD detects speech start. Use for barge-in (cancel TTS). */
  onSpeechStarted?: () => void;
}

/**
 * Opens a Deepgram WebSocket, captures mic audio, and streams transcripts.
 * Returns a handle to stop/abort, or null if setup fails.
 */
export async function createDeepgramSTT(
  callbacks: DeepgramSTTCallbacks,
): Promise<DeepgramSTTHandle | null> {
  const apiKey = await getDeepgramApiKey();
  if (!apiKey) {
    console.warn("[Deepgram] No API key available");
    return null;
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    console.warn("[Deepgram] getUserMedia failed:", err);
    callbacks.onError("not-allowed");
    return null;
  }

  // Determine sample rate from the mic track
  const trackSettings = stream.getAudioTracks()[0]?.getSettings();
  const sampleRate = trackSettings?.sampleRate || 48000;
  if (!trackSettings?.sampleRate) {
    console.warn("[Deepgram] Could not detect mic sample rate, defaulting to 48kHz");
  } else if (sampleRate !== 16000 && sampleRate !== 48000) {
    console.warn("[Deepgram] Detected non-standard sample rate:", sampleRate);
  }

  const dgLang = "multi";
  // utterance_end_ms=1000 lets us detect "user genuinely paused" via UtteranceEnd
  // events without raising endpointing (which would clip mid-sentence).
  // vad_events=true emits SpeechStarted for barge-in. filler_words=false strips
  // "um/uh" so transcripts going to the LLM are cleaner.
  const wsUrl =
    `wss://api.deepgram.com/v1/listen` +
    `?model=nova-3` +
    `&language=${dgLang}` +
    `&smart_format=true` +
    `&interim_results=true` +
    `&punctuate=true` +
    `&endpointing=300` +
    `&utterance_end_ms=1000` +
    `&vad_events=true` +
    `&filler_words=false` +
    `&encoding=linear16` +
    `&sample_rate=${sampleRate}` +
    `&channels=1`;

  let ws: WebSocket;
  try {
    ws = new WebSocket(wsUrl, ["token", apiKey]);
  } catch (err) {
    console.warn("[Deepgram] WebSocket creation failed:", err);
    stream.getTracks().forEach(t => t.stop());
    return null;
  }

  let aborted = false;
  let finalText = "";
  let audioCtx: AudioContext | null = null;
  let processorNode: AudioWorkletNode | ScriptProcessorNode | null = null;
  let sourceNode: MediaStreamAudioSourceNode | null = null;

  function cleanup() {
    aborted = true;
    processorNode?.disconnect();
    sourceNode?.disconnect();
    audioCtx?.close().catch(() => {});
    stream.getTracks().forEach(t => t.stop());
    audioCtx = null;
    processorNode = null;
    sourceNode = null;
  }

  function stopGracefully() {
    if (aborted) return;
    // Send CloseStream message to Deepgram, then close
    try {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "CloseStream" }));
      }
    } catch { /* expected: WebSocket send may fail if connection is closing */ }
    cleanup();
    // Allow Deepgram to send final results before closing
    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    }, 500);
  }

  function abortNow() {
    if (aborted) return;
    cleanup();
    try { ws.close(); } catch { /* expected: WebSocket may already be closed */ }
  }

  /** Set up audio capture using AudioWorklet (preferred) with ScriptProcessorNode fallback */
  async function setupAudioCapture(ctx: AudioContext, source: MediaStreamAudioSourceNode) {
    // Try AudioWorklet first — it runs off the main thread and is the modern API
    try {
      if (ctx.audioWorklet) {
        const workletCode = `
class PCMProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const float32 = input[0];
    const int16 = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    this.port.postMessage(int16.buffer, [int16.buffer]);
    return true;
  }
}
registerProcessor('pcm-processor', PCMProcessor);
`;
        const blob = new Blob([workletCode], { type: "application/javascript" });
        const url = URL.createObjectURL(blob);
        await ctx.audioWorklet.addModule(url);
        URL.revokeObjectURL(url);

        const workletNode = new AudioWorkletNode(ctx, "pcm-processor");
        workletNode.port.onmessage = (e: MessageEvent) => {
          if (aborted || ws.readyState !== WebSocket.OPEN) return;
          ws.send(e.data);
        };

        source.connect(workletNode);
        // Route to a muted gain node — keeps the graph live without playing the
        // mic back through the speakers (which caused feedback on weak-AEC headsets).
        const sink = ctx.createGain();
        sink.gain.value = 0;
        workletNode.connect(sink);
        sink.connect(ctx.destination);
        processorNode = workletNode;
        console.warn("[Deepgram] Using AudioWorklet for audio capture");
        return;
      }
    } catch (err) {
      console.warn("[Deepgram] AudioWorklet setup failed, falling back to ScriptProcessorNode:", err);
    }

    // Fallback: ScriptProcessorNode (deprecated but widely supported)
    // Buffer size 4096 gives ~85ms chunks at 48kHz — good latency/overhead balance
    const scriptNode = ctx.createScriptProcessor(4096, 1, 1);

    scriptNode.onaudioprocess = (e: AudioProcessingEvent) => {
      if (aborted || ws.readyState !== WebSocket.OPEN) return;
      const float32 = e.inputBuffer.getChannelData(0);
      // Convert float32 [-1,1] to int16 PCM
      const int16 = new Int16Array(float32.length);
      for (let i = 0; i < float32.length; i++) {
        const s = Math.max(-1, Math.min(1, float32[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      ws.send(int16.buffer);
    };

    source.connect(scriptNode);
    // ScriptProcessorNode requires a connection to destination to fire its
    // onaudioprocess callback in some browsers. Route through a muted gain
    // to avoid mic feedback.
    const sink = ctx.createGain();
    sink.gain.value = 0;
    scriptNode.connect(sink);
    sink.connect(ctx.destination);
    processorNode = scriptNode;
    console.warn("[Deepgram] Using ScriptProcessorNode fallback for audio capture");
  }

  ws.onopen = () => {
    if (aborted) { ws.close(); return; }

    audioCtx = new AudioContext({ sampleRate });
    sourceNode = audioCtx.createMediaStreamSource(stream);

    setupAudioCapture(audioCtx, sourceNode).catch((err) => {
      console.warn("[Deepgram] Audio capture setup failed:", err);
      callbacks.onError("audio-setup");
    });
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === "Results") {
        const alt = msg.channel?.alternatives?.[0];
        const transcript = alt?.transcript || "";
        if (!transcript) return;

        if (msg.is_final) {
          finalText += transcript + " ";
          callbacks.onTranscript(finalText, "");
        } else {
          callbacks.onTranscript(finalText, transcript);
        }
      } else if (msg.type === "SpeechStarted") {
        callbacks.onSpeechStarted?.();
      } else if (msg.type === "Error") {
        console.warn("[Deepgram] server error:", msg);
      }
    } catch (e) {
      console.warn("[Deepgram] message parse error:", e);
    }
  };

  ws.onerror = () => {
    if (!aborted) {
      console.warn("[Deepgram] WebSocket error");
      callbacks.onError("network");
    }
  };

  ws.onclose = () => {
    cleanup();
    if (!aborted) callbacks.onEnd();
  };

  return { stop: stopGracefully, abort: abortNow };
}
