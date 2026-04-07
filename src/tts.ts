/* ─── Text-to-Speech Service ─── */
/* Uses server-side Cartesia TTS proxy (ultra-low latency) with Web Speech API fallback */

/* Unlock audio playback — call this on a user gesture (button click)
   before navigating to pages that auto-play audio. This creates a
   silent AudioContext that satisfies the browser's autoplay policy. */
let _audioUnlocked = false;
export function unlockAudio() {
  if (_audioUnlocked) return;
  try {
    const ctx = new AudioContext();
    const buf = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start();
    // Also play a silent HTML5 audio to unlock that pathway
    const audio = new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=");
    audio.volume = 0;
    audio.play().catch(() => {});
    _audioUnlocked = true;
  } catch {}
}

const TTS_SETTINGS_KEY = "hirloop_tts";

export interface TTSSettings {
  provider: "cartesia" | "browser";
  voiceId: string;
  voiceName: string;
}

export interface CartesiaVoice {
  id: string;
  name: string;
  desc: string;
  gender: string;
}

/* Default voice — confirmed working Cartesia voice */
const DEFAULT_VOICE_ID = "e07c00bc-4134-4eae-9ea4-1a55fb45746b";

/* Fallback voice list (used until dynamic fetch completes) */
export const CARTESIA_VOICES: CartesiaVoice[] = [
  { id: DEFAULT_VOICE_ID, name: "Default", desc: "Professional, clear voice", gender: "female" },
];

/* Dynamically loaded voices from /api/voices */
const _voiceCache: Record<string, CartesiaVoice[]> = {};
const _fetchPromises: Record<string, Promise<CartesiaVoice[]>> = {};

export function fetchCartesiaVoices(language = "en_IN"): Promise<CartesiaVoice[]> {
  if (_voiceCache[language]) return Promise.resolve(_voiceCache[language]);
  if (_fetchPromises[language]) return _fetchPromises[language];

  _fetchPromises[language] = fetch(`/api/voices?language=${encodeURIComponent(language)}`)
    .then(res => res.ok ? res.json() : [])
    .then((voices: CartesiaVoice[]) => {
      if (voices.length > 0) _voiceCache[language] = voices;
      return _voiceCache[language] || CARTESIA_VOICES;
    })
    .catch(() => CARTESIA_VOICES);

  return _fetchPromises[language];
}

export function getCachedVoices(language = "en_IN"): CartesiaVoice[] {
  return _voiceCache[language] || CARTESIA_VOICES;
}

const DEFAULT_SETTINGS: TTSSettings = {
  provider: "cartesia",
  voiceId: DEFAULT_VOICE_ID,
  voiceName: "Default",
};

export function loadTTSSettings(): TTSSettings {
  try {
    const raw = localStorage.getItem(TTS_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Migrate old providers to Cartesia
      if (parsed.provider === "elevenlabs" || parsed.provider === "google") {
        parsed.provider = "cartesia";
        parsed.voiceId = DEFAULT_SETTINGS.voiceId;
        parsed.voiceName = DEFAULT_SETTINGS.voiceName;
      }
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch {}
  return DEFAULT_SETTINGS;
}

export function saveTTSSettings(settings: TTSSettings) {
  try {
    localStorage.setItem(TTS_SETTINGS_KEY, JSON.stringify(settings));
  } catch {}
}

/* ─── Cartesia API Key Cache ─── */
let _cachedApiKey: string | null = null;
let _apiKeyExpiry = 0;

async function getCartesiaApiKey(): Promise<string | null> {
  if (_cachedApiKey && Date.now() < _apiKeyExpiry) return _cachedApiKey;
  try {
    const { authHeaders } = await import("./supabase");
    const headers = await authHeaders();
    const res = await fetch("/api/tts-token", { method: "POST", headers });
    if (!res.ok) return null;
    const data = await res.json();
    _cachedApiKey = data.apiKey || null;
    _apiKeyExpiry = Date.now() + 5 * 60 * 1000; // cache 5 min
    return _cachedApiKey;
  } catch {
    return null;
  }
}

/* ─── TTS Audio Pre-fetch Cache ─── */
const _prefetchCache = new Map<string, Promise<Blob | null>>();

/* Pre-fetch TTS audio for a text so it's ready when needed */
export async function prefetchTTS(text: string): Promise<void> {
  if (!text || _prefetchCache.has(text)) return;
  const settings = loadTTSSettings();
  if (settings.provider !== "cartesia") return;

  const promise = (async (): Promise<Blob | null> => {
    try {
      const { authHeaders } = await import("./supabase");
      const headers = await authHeaders();
      const res = await fetch("/api/tts", {
        method: "POST",
        headers,
        body: JSON.stringify({ text, voiceId: settings.voiceId }),
      });
      if (!res.ok) return null;
      return await res.blob();
    } catch {
      return null;
    }
  })();

  _prefetchCache.set(text, promise);
}

function consumePrefetch(text: string): Promise<Blob | null> | undefined {
  const cached = _prefetchCache.get(text);
  if (cached) _prefetchCache.delete(text);
  return cached;
}

/* ─── WebSocket Streaming TTS ─── */
const CARTESIA_WS_URL = "wss://api.cartesia.ai/tts/websocket";
const WS_SAMPLE_RATE = 24000; // PCM output sample rate

async function speakWithWebSocket(
  text: string,
  voiceId: string,
  onEnd: () => void,
  onError: () => void,
): Promise<{ cancel: () => void }> {
  let settled = false;
  const settle = (cb: () => void) => { if (!settled) { settled = true; cb(); } };
  let ws: WebSocket | null = null;
  let audioCtx: AudioContext | null = null;
  let cancelled = false;

  // Audio scheduling state
  let nextStartTime = 0;
  let chunksReceived = 0;
  let allChunksReceived = false;
  let chunksPlayed = 0;
  let totalChunksScheduled = 0;

  const checkPlaybackComplete = () => {
    if (allChunksReceived && chunksPlayed >= totalChunksScheduled) {
      console.log(`[TTS-WS] playback complete, ${chunksReceived} chunks`);
      settle(onEnd);
    }
  };

  try {
    const apiKey = await getCartesiaApiKey();
    if (!apiKey) {
      console.warn("[TTS-WS] no API key, falling back to REST");
      return speakWithProxy(text, voiceId, onEnd, onError);
    }

    audioCtx = new AudioContext({ sampleRate: WS_SAMPLE_RATE });
    nextStartTime = audioCtx.currentTime;

    const contextId = crypto.randomUUID();
    const wsUrl = `${CARTESIA_WS_URL}?api_key=${apiKey}&cartesia_version=2024-06-10`;

    ws = new WebSocket(wsUrl);
    const capturedWs = ws;
    const capturedCtx = audioCtx;

    // Timeout: if no data in 10s, fall back
    const wsTimeout = setTimeout(() => {
      if (chunksReceived === 0 && !cancelled) {
        console.warn("[TTS-WS] timeout — no data received, falling back to REST");
        capturedWs.close();
        settle(() => {});
        speakWithProxy(text, voiceId, onEnd, onError);
      }
    }, 10000);

    ws.onopen = () => {
      console.log("[TTS-WS] connected, sending text");
      capturedWs.send(JSON.stringify({
        context_id: contextId,
        model_id: "sonic-3",
        transcript: text.trim().slice(0, 2000),
        voice: { mode: "id", id: voiceId },
        language: "en",
        output_format: {
          container: "raw",
          encoding: "pcm_f32le",
          sample_rate: WS_SAMPLE_RATE,
        },
        add_timestamps: false,
      }));
    };

    ws.onmessage = (event) => {
      if (cancelled) return;
      clearTimeout(wsTimeout);

      try {
        const msg = JSON.parse(event.data);

        if (msg.type === "chunk" && msg.data) {
          chunksReceived++;
          // Decode base64 PCM data
          const binaryStr = atob(msg.data);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
          }
          const float32 = new Float32Array(bytes.buffer);

          // Create audio buffer and schedule playback
          const buffer = capturedCtx.createBuffer(1, float32.length, WS_SAMPLE_RATE);
          buffer.getChannelData(0).set(float32);

          const source = capturedCtx.createBufferSource();
          source.buffer = buffer;
          source.connect(capturedCtx.destination);

          const scheduleTime = Math.max(capturedCtx.currentTime, nextStartTime);
          source.start(scheduleTime);
          nextStartTime = scheduleTime + buffer.duration;
          totalChunksScheduled++;

          source.onended = () => {
            chunksPlayed++;
            checkPlaybackComplete();
          };

          if (chunksReceived === 1) {
            console.log(`[TTS-WS] first chunk received, playing immediately`);
          }
        } else if (msg.type === "done" || msg.done) {
          console.log(`[TTS-WS] all chunks received (${chunksReceived})`);
          allChunksReceived = true;
          capturedWs.close();
          // If no chunks were scheduled (empty text), end now
          if (totalChunksScheduled === 0) settle(onEnd);
          else checkPlaybackComplete();
        }
      } catch (e) {
        console.warn("[TTS-WS] message parse error:", e);
      }
    };

    ws.onerror = (e) => {
      clearTimeout(wsTimeout);
      console.warn("[TTS-WS] error, falling back to REST:", e);
      if (!cancelled && chunksReceived === 0) {
        // No audio played yet — fall back to REST seamlessly
        speakWithProxy(text, voiceId, onEnd, onError);
      } else {
        settle(onError);
      }
    };

    ws.onclose = () => {
      clearTimeout(wsTimeout);
      if (!allChunksReceived && chunksReceived === 0 && !cancelled) {
        console.warn("[TTS-WS] closed before data, falling back to REST");
        speakWithProxy(text, voiceId, onEnd, onError);
      }
    };
  } catch (err: any) {
    console.warn("[TTS-WS] setup error:", err?.message || err);
    return speakWithProxy(text, voiceId, onEnd, onError);
  }

  const capturedWs = ws;
  const capturedCtx = audioCtx;
  return {
    cancel: () => {
      cancelled = true;
      settled = true;
      try { capturedWs?.close(); } catch {}
      try { capturedCtx?.close(); } catch {}
    },
  };
}

/* ─── Cartesia TTS via REST Server Proxy (fallback) ─── */
async function speakWithProxy(
  text: string,
  voiceId: string,
  onEnd: () => void,
  onError: () => void,
): Promise<{ cancel: () => void }> {
  const controller = new AbortController();
  let audio: HTMLAudioElement | null = null;
  let settled = false;
  const settle = (cb: () => void) => { if (!settled) { settled = true; cb(); } };

  try {
    let blob: Blob | null = null;

    // Check pre-fetch cache first
    const cached = consumePrefetch(text);
    if (cached) {
      console.log("[TTS] using pre-fetched audio");
      blob = await cached;
    }

    if (!blob) {
      console.log("[TTS] starting REST fetch...");
      const { authHeaders } = await import("./supabase");
      const headers = await authHeaders();

      const res = await fetch("/api/tts", {
        method: "POST",
        headers,
        body: JSON.stringify({ text, voiceId }),
        signal: controller.signal,
      });

      if (!res.ok) {
        settle(onError);
        return { cancel: () => {} };
      }

      blob = await res.blob();
    }

    const url = URL.createObjectURL(blob);
    audio = new Audio(url);

    audio.onended = () => {
      URL.revokeObjectURL(url);
      settle(onEnd);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      settle(onError);
    };

    await audio.play();
    console.log("[TTS] playing via REST fallback");
  } catch (err: any) {
    if (err.name === "AbortError") return { cancel: () => {} };
    settle(onError);
    return { cancel: () => {} };
  }

  const capturedAudio = audio;
  return {
    cancel: () => {
      controller.abort();
      settled = true;
      if (capturedAudio) {
        capturedAudio.pause();
        capturedAudio.onended = null;
        capturedAudio.onerror = null;
      }
    },
  };
}

/* ─── Browser TTS (fallback) ─── */
function speakWithBrowser(
  text: string,
  onEnd: () => void,
  onError: () => void,
): { cancel: () => void } {
  if (!window.speechSynthesis) {
    console.warn("Browser speech synthesis not available");
    onError();
    return { cancel: () => {} };
  }

  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = 1.0;
  utter.pitch = 1.0;
  utter.volume = 1.0;
  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find(
    (v) =>
      v.name.includes("Samantha") ||
      v.name.includes("Google US English") ||
      v.name.includes("Daniel") ||
      (v.lang === "en-US" && v.localService),
  );
  if (preferred) utter.voice = preferred;
  utter.onend = onEnd;
  utter.onerror = (e) => {
    console.warn("Browser TTS error:", e);
    onError();
  };

  let fired = false;
  const safetyTimer = setTimeout(() => {
    if (!fired && window.speechSynthesis.speaking === false) {
      fired = true;
      console.warn("Browser TTS silent failure — no speech detected after 5s");
      onError();
    }
  }, 5000);
  const origOnEnd = utter.onend;
  utter.onend = (ev) => { fired = true; clearTimeout(safetyTimer); origOnEnd?.call(utter, ev); };
  const origOnErr = utter.onerror;
  utter.onerror = (ev) => { fired = true; clearTimeout(safetyTimer); origOnErr?.call(utter, ev); };

  window.speechSynthesis.speak(utter);

  return {
    cancel: () => { fired = true; clearTimeout(safetyTimer); window.speechSynthesis.cancel(); },
  };
}

/* ─── Unified speak function ─── */
export async function speak(
  text: string,
  onEnd: () => void,
  onError: () => void,
): Promise<{ cancel: () => void }> {
  const settings = loadTTSSettings();

  if (settings.provider === "cartesia") {
    // Check if we have a pre-fetched blob — use REST path directly for cache hits
    const hasPrefetch = _prefetchCache.has(text);
    if (hasPrefetch) {
      return speakWithProxy(text, settings.voiceId, onEnd, () => {
        console.warn("Cartesia REST failed, falling back to browser TTS");
        speakWithBrowser(text, onEnd, onError);
      });
    }
    // Primary: WebSocket streaming (~50ms first-chunk vs 800-1500ms REST)
    return speakWithWebSocket(text, settings.voiceId, onEnd, () => {
      console.warn("Cartesia WebSocket failed, falling back to browser TTS");
      speakWithBrowser(text, onEnd, onError);
    });
  }

  return speakWithBrowser(text, onEnd, onError);
}
