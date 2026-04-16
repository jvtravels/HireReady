/* Sarvam AI real-time STT via WebSocket — fallback after Deepgram */
/* Indian English + Hindi + Hinglish code-switching via Saaras V3 */

let _cachedApiKey: string | null = null;
let _apiKeyExpiry = 0;
const API_KEY_TTL = 5 * 60 * 1000; // 5 min

async function getSarvamApiKey(): Promise<string | null> {
  if (_cachedApiKey && Date.now() < _apiKeyExpiry - API_KEY_TTL * 0.2) return _cachedApiKey;
  try {
    const { authHeaders } = await import("./supabase");
    const headers = await authHeaders();
    const res = await fetch("/api/sarvam-token", { method: "POST", headers });
    if (!res.ok) return null;
    const data = await res.json();
    _cachedApiKey = data.apiKey || null;
    _apiKeyExpiry = data.expiresAt || (Date.now() + API_KEY_TTL);
    return _cachedApiKey;
  } catch {
    return null;
  }
}

export interface SarvamSTTHandle {
  stop: () => void;
  abort: () => void;
}

export interface SarvamSTTCallbacks {
  onTranscript: (finalText: string, interim: string) => void;
  onError: (error: string) => void;
  onEnd: () => void;
}

/**
 * Opens a Sarvam AI WebSocket, captures mic audio, and streams transcripts.
 * Uses Saaras V3 model with codemix mode for Hindi-English code-switching.
 * Returns a handle to stop/abort, or null if setup fails.
 */
export async function createSarvamSTT(
  callbacks: SarvamSTTCallbacks,
): Promise<SarvamSTTHandle | null> {
  const apiKey = await getSarvamApiKey();
  if (!apiKey) {
    console.warn("[Sarvam] No API key available");
    return null;
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
  } catch (err) {
    console.warn("[Sarvam] getUserMedia failed:", err);
    callbacks.onError("not-allowed");
    return null;
  }

  // Sarvam expects 16kHz PCM — we'll resample if needed
  const TARGET_SAMPLE_RATE = 16000;

  const wsUrl =
    `wss://api.sarvam.ai/speech-to-text/ws` +
    `?language-code=en-IN` +
    `&model=saaras:v3` +
    `&mode=codemix` +
    `&sample_rate=${TARGET_SAMPLE_RATE}` +
    `&input_audio_codec=pcm_s16le` +
    `&high_vad_sensitivity=true` +
    `&vad_signals=true`;

  let ws: WebSocket;
  try {
    // Sarvam uses subprotocol for auth
    ws = new WebSocket(wsUrl, [`api-subscription-key.${apiKey}`]);
  } catch (err) {
    console.warn("[Sarvam] WebSocket creation failed:", err);
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
    cleanup();
    // Sarvam doesn't have a CloseStream message — just close the socket
    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    }, 300);
  }

  function abortNow() {
    if (aborted) return;
    cleanup();
    try { ws.close(); } catch { /* expected */ }
  }

  /** Convert Float32 [-1,1] to Int16 PCM then base64 encode */
  function float32ToBase64PCM(float32: Float32Array): string {
    const int16 = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    const bytes = new Uint8Array(int16.buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /** Downsample from source sample rate to 16kHz */
  function downsample(buffer: Float32Array, fromRate: number, toRate: number): Float32Array {
    if (fromRate === toRate) return buffer;
    const ratio = fromRate / toRate;
    const newLength = Math.round(buffer.length / ratio);
    const result = new Float32Array(newLength);
    for (let i = 0; i < newLength; i++) {
      const srcIdx = i * ratio;
      const low = Math.floor(srcIdx);
      const high = Math.min(low + 1, buffer.length - 1);
      const frac = srcIdx - low;
      result[i] = buffer[low] * (1 - frac) + buffer[high] * frac;
    }
    return result;
  }

  /** Set up audio capture — AudioWorklet preferred, ScriptProcessorNode fallback */
  async function setupAudioCapture(ctx: AudioContext, source: MediaStreamAudioSourceNode) {
    const ctxRate = ctx.sampleRate;

    try {
      if (ctx.audioWorklet) {
        const workletCode = `
class SarvamPCMProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    this.port.postMessage(input[0]);
    return true;
  }
}
registerProcessor('sarvam-pcm-processor', SarvamPCMProcessor);
`;
        const blob = new Blob([workletCode], { type: "application/javascript" });
        const url = URL.createObjectURL(blob);
        await ctx.audioWorklet.addModule(url);
        URL.revokeObjectURL(url);

        const workletNode = new AudioWorkletNode(ctx, "sarvam-pcm-processor");
        workletNode.port.onmessage = (e: MessageEvent) => {
          if (aborted || ws.readyState !== WebSocket.OPEN) return;
          const float32 = e.data as Float32Array;
          const resampled = downsample(float32, ctxRate, TARGET_SAMPLE_RATE);
          const base64 = float32ToBase64PCM(resampled);
          ws.send(JSON.stringify({
            audio: { data: base64, encoding: "pcm_s16le", sample_rate: TARGET_SAMPLE_RATE },
          }));
        };

        source.connect(workletNode);
        workletNode.connect(ctx.destination);
        processorNode = workletNode;
        console.warn("[Sarvam] Using AudioWorklet for audio capture");
        return;
      }
    } catch (err) {
      console.warn("[Sarvam] AudioWorklet setup failed, falling back to ScriptProcessorNode:", err);
    }

    // Fallback: ScriptProcessorNode
    const scriptNode = ctx.createScriptProcessor(4096, 1, 1);
    scriptNode.onaudioprocess = (e: AudioProcessingEvent) => {
      if (aborted || ws.readyState !== WebSocket.OPEN) return;
      const float32 = e.inputBuffer.getChannelData(0);
      const resampled = downsample(float32, ctxRate, TARGET_SAMPLE_RATE);
      const base64 = float32ToBase64PCM(resampled);
      ws.send(JSON.stringify({
        audio: { data: base64, encoding: "pcm_s16le", sample_rate: TARGET_SAMPLE_RATE },
      }));
    };

    source.connect(scriptNode);
    scriptNode.connect(ctx.destination);
    processorNode = scriptNode;
    console.warn("[Sarvam] Using ScriptProcessorNode fallback for audio capture");
  }

  ws.onopen = () => {
    if (aborted) { ws.close(); return; }

    // Use device's native sample rate — we'll downsample to 16kHz in the processor
    audioCtx = new AudioContext();
    sourceNode = audioCtx.createMediaStreamSource(stream);

    setupAudioCapture(audioCtx, sourceNode).catch((err) => {
      console.warn("[Sarvam] Audio capture setup failed:", err);
      callbacks.onError("audio-setup");
    });
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);

      if (msg.type === "data" && msg.data?.transcript) {
        const transcript = msg.data.transcript;
        // Sarvam returns per-utterance final transcripts (VAD-segmented)
        finalText += transcript + " ";
        callbacks.onTranscript(finalText, "");
      } else if (msg.type === "speech_start") {
        // User started speaking — could show UI indicator
      } else if (msg.type === "speech_end") {
        // User stopped speaking — transcript will arrive shortly
      } else if (msg.type === "error") {
        console.warn("[Sarvam] server error:", msg);
        callbacks.onError("server");
      }
    } catch (e) {
      console.warn("[Sarvam] message parse error:", e);
    }
  };

  ws.onerror = () => {
    if (!aborted) {
      console.warn("[Sarvam] WebSocket error");
      callbacks.onError("network");
    }
  };

  ws.onclose = () => {
    cleanup();
    if (!aborted) callbacks.onEnd();
  };

  return { stop: stopGracefully, abort: abortNow };
}
