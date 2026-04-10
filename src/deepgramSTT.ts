/* Deepgram real-time STT via WebSocket — with Web Speech API fallback */

let _cachedApiKey: string | null = null;
let _apiKeyExpiry = 0;
const API_KEY_TTL = 5 * 60 * 1000; // 5 min

async function getDeepgramApiKey(): Promise<string | null> {
  if (_cachedApiKey && Date.now() < _apiKeyExpiry - API_KEY_TTL * 0.2) return _cachedApiKey;
  try {
    const { authHeaders } = await import("./supabase");
    const headers = await authHeaders();
    const res = await fetch("/api/stt-token", { method: "POST", headers });
    if (!res.ok) return null;
    const data = await res.json();
    _cachedApiKey = data.apiKey || null;
    // Use server-provided expiry if available, otherwise fall back to local TTL
    _apiKeyExpiry = data.expiresAt || (Date.now() + API_KEY_TTL);
    return _cachedApiKey;
  } catch {
    return null;
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
}

/**
 * Opens a Deepgram WebSocket, captures mic audio, and streams transcripts.
 * Returns a handle to stop/abort, or null if setup fails.
 */
export async function createDeepgramSTT(
  callbacks: DeepgramSTTCallbacks,
  options?: { language?: string },
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

  const dgLang = options?.language === "hi" || options?.language === "hinglish" ? "hi" : "en-US";
  const wsUrl =
    `wss://api.deepgram.com/v1/listen` +
    `?model=nova-2` +
    `&language=${dgLang}` +
    `&smart_format=true` +
    `&interim_results=true` +
    `&punctuate=true` +
    `&endpointing=300` +
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
  let scriptNode: ScriptProcessorNode | null = null;
  let sourceNode: MediaStreamAudioSourceNode | null = null;

  function cleanup() {
    aborted = true;
    scriptNode?.disconnect();
    sourceNode?.disconnect();
    audioCtx?.close().catch(() => {});
    stream.getTracks().forEach(t => t.stop());
    audioCtx = null;
    scriptNode = null;
    sourceNode = null;
  }

  function stopGracefully() {
    if (aborted) return;
    // Send CloseStream message to Deepgram, then close
    try {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "CloseStream" }));
      }
    } catch {}
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
    try { ws.close(); } catch {}
  }

  ws.onopen = () => {
    if (aborted) { ws.close(); return; }

    // Set up audio capture via ScriptProcessorNode
    audioCtx = new AudioContext({ sampleRate });
    sourceNode = audioCtx.createMediaStreamSource(stream);
    // Buffer size 4096 gives ~85ms chunks at 48kHz — good latency/overhead balance
    scriptNode = audioCtx.createScriptProcessor(4096, 1, 1);

    scriptNode.onaudioprocess = (e) => {
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

    sourceNode.connect(scriptNode);
    scriptNode.connect(audioCtx.destination);
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
