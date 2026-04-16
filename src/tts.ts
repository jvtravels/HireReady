/* ─── Text-to-Speech Service ─── */
/* Primary: Azure TTS (Indian English neural voices) via /api/azure-tts proxy
   Fallback: Cartesia TTS via WebSocket + /api/tts REST proxy
   Last resort: Browser Web Speech API */

import { safeUUID } from "./utils";

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
  } catch { /* expected: audio unlock may fail before user gesture */ }
}

const TTS_SETTINGS_KEY = "hirestepx_tts";

export interface TTSSettings {
  provider: "azure" | "cartesia" | "browser";
  voiceId: string;
  voiceName: string;
  language?: string;
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
  if (language in _fetchPromises) return _fetchPromises[language];

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
  provider: "azure",
  voiceId: "en-IN-NeerjaNeural",
  voiceName: "Neerja (Indian English)",
  language: "en_IN",
};

export function loadTTSSettings(): TTSSettings {
  try {
    const raw = localStorage.getItem(TTS_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Migrate old providers to Azure
      if (parsed.provider === "elevenlabs" || parsed.provider === "google" || parsed.provider === "cartesia") {
        parsed.provider = "azure";
        parsed.voiceId = DEFAULT_SETTINGS.voiceId;
        parsed.voiceName = DEFAULT_SETTINGS.voiceName;
      }
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch { /* expected: localStorage/JSON.parse may fail */ }
  return DEFAULT_SETTINGS;
}

export function saveTTSSettings(settings: TTSSettings) {
  try {
    localStorage.setItem(TTS_SETTINGS_KEY, JSON.stringify(settings));
  } catch { /* expected: localStorage may be unavailable */ }
}

/** Set TTS language for the current session */
export function setTTSLanguage(lang: string) {
  const settings = loadTTSSettings();
  settings.language = lang;
  saveTTSSettings(settings);
}

/* ─── Cartesia API Key Cache ─── */
let _cachedApiKey: string | null = null;
let _apiKeyExpiry = 0;
const API_KEY_TTL = 5 * 60 * 1000; // 5 min

let _refreshPromise: Promise<string | null> | null = null;

async function getCartesiaApiKey(): Promise<string | null> {
  // Refresh at 80% TTL to avoid mid-session expiry
  const refreshAt = _apiKeyExpiry - API_KEY_TTL * 0.2;
  if (_cachedApiKey && refreshAt > 0 && Date.now() < refreshAt) return _cachedApiKey;
  // Deduplicate concurrent refresh calls
  if (_refreshPromise) return _refreshPromise;
  _refreshPromise = (async () => {
    try {
      const { authHeaders } = await import("./supabase");
      const headers = await authHeaders();
      const res = await fetch("/api/tts-token", { method: "POST", headers });
      if (!res.ok) return null;
      const data = await res.json();
      _cachedApiKey = data.apiKey || null;
      _apiKeyExpiry = Date.now() + API_KEY_TTL;
      return _cachedApiKey;
    } catch {
      return null;
    } finally {
      _refreshPromise = null;
    }
  })();
  return _refreshPromise;
}

/* ─── TTS Audio Pre-fetch Cache (LRU, max 10, 5-min TTL) ─── */
const PREFETCH_MAX = 10;
const PREFETCH_TTL = 5 * 60 * 1000; // 5 minutes
const _prefetchCache = new Map<string, { promise: Promise<Blob | null>; createdAt: number }>();

/** Clear the entire prefetch cache — call on memory pressure or page cleanup */
export function clearPrefetchCache(): void {
  _prefetchCache.clear();
}

/* Pre-fetch TTS audio for a text so it's ready when needed */
export async function prefetchTTS(text: string): Promise<void> {
  if (!text) return;
  const existing = _prefetchCache.get(text);
  if (existing && Date.now() - existing.createdAt < PREFETCH_TTL) return;
  const settings = loadTTSSettings();
  if (settings.provider === "browser") return;

  // Evict expired entries first
  for (const [key, entry] of _prefetchCache) {
    if (Date.now() - entry.createdAt >= PREFETCH_TTL) _prefetchCache.delete(key);
  }
  // LRU eviction: remove the oldest entry (first inserted in Map iteration order)
  while (_prefetchCache.size >= PREFETCH_MAX) {
    const oldest = _prefetchCache.keys().next().value;
    if (oldest !== undefined) _prefetchCache.delete(oldest);
    else break;
  }

  const promise = (async (): Promise<Blob | null> => {
    try {
      const { authHeaders } = await import("./supabase");
      const headers = await authHeaders();
      // Use Azure TTS endpoint (primary) for prefetch
      const endpoint = settings.provider === "azure" ? "/api/azure-tts" : "/api/tts";
      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({ text, voiceId: settings.voiceId }),
      });
      if (!res.ok) return null;
      const blob = await res.blob();
      // Validate non-empty audio
      if (!blob || blob.size < 100) return null;
      return blob;
    } catch {
      return null;
    }
  })();

  _prefetchCache.set(text, { promise, createdAt: Date.now() });
}

function consumePrefetch(text: string): Promise<Blob | null> | undefined {
  const entry = _prefetchCache.get(text);
  if (!entry) return undefined;
  _prefetchCache.delete(text);
  if (Date.now() - entry.createdAt >= PREFETCH_TTL) return undefined; // expired
  return entry.promise;
}

/* ─── WebSocket Streaming TTS (persistent connection) ─── */
const CARTESIA_WS_URL = "wss://api.cartesia.ai/tts/websocket";
const WS_SAMPLE_RATE = 24000;
const WS_IDLE_TIMEOUT = 30_000; // close idle connection after 30s

// Persistent WebSocket pool — reuse across questions
let _persistentWs: WebSocket | null = null;
let _persistentWsApiKey: string | null = null;
let _wsIdleTimer: ReturnType<typeof setTimeout> | null = null;
let _wsMessageHandler: ((event: MessageEvent) => void) | null = null;

// Utterance queue — prevents concurrent WebSocket messages from interleaving
let _utteranceQueue: Promise<void> = Promise.resolve();

function resetWsIdleTimer() {
  if (_wsIdleTimer) clearTimeout(_wsIdleTimer);
  _wsIdleTimer = setTimeout(() => {
    if (_persistentWs && _persistentWs.readyState === WebSocket.OPEN) {
      _persistentWs.close();
    }
    _persistentWs = null;
  }, WS_IDLE_TIMEOUT);
}

async function getOrCreateWs(apiKey: string): Promise<WebSocket | null> {
  // Reuse if open and same key
  if (_persistentWs && _persistentWs.readyState === WebSocket.OPEN && _persistentWsApiKey === apiKey) {
    resetWsIdleTimer();
    return _persistentWs;
  }
  // Close stale or dead connection (CLOSED / CLOSING / mismatched key)
  if (_persistentWs) {
    if (_persistentWs.readyState === WebSocket.CLOSED || _persistentWs.readyState === WebSocket.CLOSING) {
      console.info("[TTS-WS] detected CLOSED/CLOSING socket, creating fresh connection");
    }
    try { _persistentWs.close(); } catch { /* expected: WebSocket may already be closed */ }
    _persistentWs = null;
    _persistentWsApiKey = null;
  }

  return new Promise((resolve) => {
    const wsUrl = `${CARTESIA_WS_URL}?api_key=${apiKey}&cartesia_version=2026-03-01`;
    const ws = new WebSocket(wsUrl);
    const timeout = setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        ws.close();
        resolve(null);
      }
    }, 5000);

    ws.onopen = () => {
      clearTimeout(timeout);
      _persistentWs = ws;
      _persistentWsApiKey = apiKey;
      resetWsIdleTimer();
      resolve(ws);
    };
    ws.onerror = () => {
      clearTimeout(timeout);
      resolve(null);
    };
    ws.onclose = () => {
      if (_persistentWs === ws) {
        _persistentWs = null;
          }
    };
  });
}

async function speakWithWebSocket(
  text: string,
  voiceId: string,
  onEnd: () => void,
  onError: () => void,
  gender?: "male" | "female",
): Promise<{ cancel: () => void }> {
  // Serialize utterances to prevent WebSocket message interleaving
  let resolveQueue: () => void;
  const prevQueue = _utteranceQueue;
  _utteranceQueue = new Promise(r => { resolveQueue = r; });
  await prevQueue;
  const markDone = () => resolveQueue!();
  const wrappedOnEnd = () => { markDone(); onEnd(); };
  const wrappedOnError = () => { markDone(); onError(); };
  return _speakWithWebSocketInner(text, voiceId, wrappedOnEnd, wrappedOnError, markDone, false, gender);
}

async function _speakWithWebSocketInner(
  text: string,
  voiceId: string,
  onEnd: () => void,
  onError: () => void,
  markDone: () => void,
  isRetry: boolean,
  gender?: "male" | "female",
): Promise<{ cancel: () => void }> {
  let settled = false;
  const settle = (cb: () => void) => { if (!settled) { settled = true; cb(); } };
  let audioCtx: AudioContext | null = null;
  let cancelled = false;
  const closeCtx = () => { try { audioCtx?.close(); } catch { /* expected: AudioContext cleanup errors are non-critical */ } audioCtx = null; };

  let nextStartTime = 0;
  let chunksReceived = 0;
  let allChunksReceived = false;
  let chunksPlayed = 0;
  let totalChunksScheduled = 0;

  const checkPlaybackComplete = () => {
    if (allChunksReceived && chunksPlayed >= totalChunksScheduled) {
      resetWsIdleTimer();
      settle(onEnd);
    }
  };

  try {
    const apiKey = await getCartesiaApiKey();
    if (!apiKey) {
      console.warn("[TTS-WS] no API key, falling back to REST");
      return speakWithProxy(text, voiceId, onEnd, onError, gender);
    }

    let ws = await getOrCreateWs(apiKey);
    if ((!ws || ws.readyState !== WebSocket.OPEN) && !isRetry) {
      // First attempt failed — try one more time with a fresh connection
      console.warn("[TTS-WS] connection failed, attempting one reconnect");
      _persistentWs = null;
      _persistentWsApiKey = null;
      ws = await getOrCreateWs(apiKey);
    }
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.warn("[TTS-WS] connection failed after retry, falling back to REST");
      return speakWithProxy(text, voiceId, onEnd, onError, gender);
    }

    audioCtx = new AudioContext({ sampleRate: WS_SAMPLE_RATE });
    nextStartTime = audioCtx.currentTime;
    const capturedCtx = audioCtx;
    const contextId = safeUUID();

    // Timeout: if no data in 10s, fall back
    const wsTimeout = setTimeout(() => {
      if (chunksReceived === 0 && !cancelled) {
        console.warn("[TTS-WS] timeout — no data received, falling back to REST");
        closeCtx();
        settle(() => {});
        speakWithProxy(text, voiceId, onEnd, onError, gender);
      }
    }, 10000);

    // Set message handler for this utterance
    const handler = (event: MessageEvent) => {
      if (cancelled) return;
      clearTimeout(wsTimeout);

      try {
        const msg = JSON.parse(event.data);

        if (msg.type === "chunk" && msg.data) {
          chunksReceived++;
          const binaryStr = atob(msg.data);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
          }
          const float32 = new Float32Array(bytes.buffer);

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
            /* first chunk received — playback starts automatically */
          }
        } else if (msg.type === "done" || msg.done) {
          allChunksReceived = true;
          // Don't close WS — reuse for next question
          if (totalChunksScheduled === 0) settle(onEnd);
          else checkPlaybackComplete();
        } else if (msg.type === "error") {
          console.warn("[TTS-WS] server error:", msg);
          clearTimeout(wsTimeout);
          closeCtx();
          settle(() => {});
          speakWithProxy(text, voiceId, onEnd, onError, gender);
        }
      } catch (e) {
        console.warn("[TTS-WS] message parse error:", e);
      }
    };

    // Replace previous handler
    if (_wsMessageHandler) ws.removeEventListener("message", _wsMessageHandler);
    ws.addEventListener("message", handler);
    _wsMessageHandler = handler;

    // Handle connection loss mid-utterance (including partial playback)
    const closeHandler = () => {
      clearTimeout(wsTimeout);
      if (cancelled) return;
      if (!allChunksReceived) {
        if (chunksReceived === 0 && !isRetry) {
          // No chunks received — attempt ONE reconnect before falling back to REST
          console.warn("[TTS-WS] closed before any chunks, attempting reconnect (1 retry)");
          closeCtx();
          // Force-clear the dead socket so getOrCreateWs creates a fresh one
          _persistentWs = null;
          _speakWithWebSocketInner(text, voiceId, onEnd, onError, markDone, true, gender)
            .then((retryHandle) => {
              // Propagate the new cancel handle up to _activeCancel
              _activeCancel = retryHandle.cancel;
            });
        } else if (chunksReceived === 0 && isRetry) {
          // Already retried once — fall back to REST
          console.warn("[TTS-WS] reconnect also failed, falling back to REST");
          closeCtx();
          speakWithProxy(text, voiceId, onEnd, onError, gender);
        } else {
          // Partial playback — some chunks received but connection dropped.
          // Mark as done so remaining queued chunks play out, then onEnd fires.
          console.warn(`[TTS-WS] closed after ${chunksReceived} chunks (partial), completing playback`);
          allChunksReceived = true;
          checkPlaybackComplete();
        }
      }
    };
    ws.addEventListener("close", closeHandler, { once: true });

    // Send the utterance
    ws.send(JSON.stringify({
      context_id: contextId,
      model_id: "sonic-3",
      transcript: text.trim().slice(0, 2000),
      voice: { mode: "id", id: voiceId },
      language: loadTTSSettings().language || "en_IN",
      output_format: {
        container: "raw",
        encoding: "pcm_f32le",
        sample_rate: WS_SAMPLE_RATE,
      },
      add_timestamps: false,
    }));

  } catch (err: unknown) {
    console.warn("[TTS-WS] setup error:", err instanceof Error ? err.message : err);
    closeCtx();
    return speakWithProxy(text, voiceId, onEnd, onError, gender);
  }

  const capturedCtx = audioCtx;
  return {
    cancel: () => {
      cancelled = true;
      settled = true;
      markDone(); // Release utterance queue so next utterance can proceed
      // Detach message handler to prevent stale callbacks
      if (_wsMessageHandler && _persistentWs) {
        _persistentWs.removeEventListener("message", _wsMessageHandler);
        _wsMessageHandler = null;
      }
      // Don't close the WS — just stop the audio
      try { capturedCtx?.close(); } catch { /* expected: AudioContext cleanup errors are non-critical */ }
      resetWsIdleTimer();
    },
  };
}

/* ─── Cartesia TTS via REST Server Proxy (fallback) ─── */
async function speakWithProxy(
  text: string,
  voiceId: string,
  onEnd: () => void,
  onError: () => void,
  gender?: "male" | "female",
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
      blob = await cached;
    }

    if (!blob) {
      const { authHeaders } = await import("./supabase");
      const headers = await authHeaders();

      const res = await fetch("/api/tts", {
        method: "POST",
        headers,
        body: JSON.stringify({ text, voiceId, language: loadTTSSettings().language, ...(gender ? { gender } : {}) }),
        signal: controller.signal,
      });

      if (!res.ok) {
        settle(onError);
        return { cancel: () => {} };
      }

      blob = await res.blob();
    }

    // Validate non-empty audio blob
    if (!blob || blob.size < 100) {
      console.warn("[TTS] empty or invalid audio blob");
      settle(onError);
      return { cancel: () => {} };
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
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") return { cancel: () => {} };
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

/* ─── Azure TTS (primary provider — Indian English neural voices) ─── */
async function speakWithAzure(
  text: string,
  onEnd: () => void,
  onError: () => void,
  gender?: "male" | "female",
  voiceId?: string,
): Promise<{ cancel: () => void }> {
  const controller = new AbortController();
  let audio: HTMLAudioElement | null = null;
  let settled = false;
  const settle = (cb: () => void) => { if (!settled) { settled = true; cb(); } };

  try {
    const { authHeaders } = await import("./supabase");
    const headers = await authHeaders();

    const timeout = setTimeout(() => controller.abort(), 15_000);
    const res = await fetch("/api/azure-tts", {
      method: "POST",
      headers,
      body: JSON.stringify({
        text: text.trim().slice(0, 2000),
        voiceId: voiceId || loadTTSSettings().voiceId,
        gender,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.warn("[TTS-Azure] API error:", res.status);
      settle(onError);
      return { cancel: () => {} };
    }

    const blob = await res.blob();
    if (!blob || blob.size < 100) {
      console.warn("[TTS-Azure] empty audio");
      settle(onError);
      return { cancel: () => {} };
    }

    const url = URL.createObjectURL(blob);
    audio = new Audio(url);
    audio.onended = () => { URL.revokeObjectURL(url); settle(onEnd); };
    audio.onerror = () => { URL.revokeObjectURL(url); settle(onError); };
    await audio.play();
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") return { cancel: () => {} };
    console.warn("[TTS-Azure] error:", err instanceof Error ? err.message : err);
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
  // Prefer Indian English voices, fall back to US English
  const preferred = voices.find(
    (v) =>
      v.lang === "en-IN" ||
      v.name.includes("Indian") ||
      v.name.includes("Hindi"),
  ) || voices.find(
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
      console.warn("Browser TTS silent failure — no speech detected after 2s");
      onError();
    }
  }, 2000);
  const origOnEnd = utter.onend;
  utter.onend = (ev) => { fired = true; clearTimeout(safetyTimer); origOnEnd?.call(utter, ev); };
  const origOnErr = utter.onerror;
  utter.onerror = (ev) => { fired = true; clearTimeout(safetyTimer); origOnErr?.call(utter, ev); };

  window.speechSynthesis.speak(utter);

  return {
    cancel: () => { fired = true; clearTimeout(safetyTimer); window.speechSynthesis.cancel(); },
  };
}

/* ─── Cleanup for page unload ─── */
let _activeCancel: (() => void) | null = null;
export function cleanupTTS() {
  _activeCancel?.();
  _activeCancel = null;
  clearPrefetchCache();
  // Close persistent WebSocket and remove listeners
  if (_persistentWs) {
    if (_wsMessageHandler) {
      _persistentWs.removeEventListener("message", _wsMessageHandler);
      _wsMessageHandler = null;
    }
    try { _persistentWs.close(); } catch { /* expected: WebSocket may already be closed */ }
    _persistentWs = null;
  }
  if (_wsIdleTimer) { clearTimeout(_wsIdleTimer); _wsIdleTimer = null; }
}

/* ─── Speak with a specific voice (for panel interviews) ─── */
export async function speakAs(
  text: string,
  voiceId: string,
  onEnd: () => void,
  onError: () => void,
  gender?: "male" | "female",
): Promise<{ cancel: () => void }> {
  const settings = loadTTSSettings();
  if (settings.provider === "browser") {
    return speak(text, onEnd, onError);
  }

  let handle: { cancel: () => void };

  const cartesiaFallback = async () => {
    console.warn("Trying Cartesia TTS fallback (speakAs)");
    handle = await speakWithWebSocket(text, voiceId, onEnd, async () => {
      console.warn("Cartesia WS failed (speakAs), trying REST");
      handle = await speakWithProxy(text, voiceId, onEnd, () => {
        console.warn("Cartesia REST also failed (speakAs), falling back to browser TTS");
        const browserHandle = speakWithBrowser(text, onEnd, onError);
        handle = browserHandle;
        _activeCancel = browserHandle.cancel;
      }, gender);
      _activeCancel = handle.cancel;
    }, gender);
    _activeCancel = handle.cancel;
  };

  // Azure primary → Cartesia fallback → Browser fallback
  handle = await speakWithAzure(text, onEnd, async () => {
    console.warn("Azure TTS failed (speakAs), trying Cartesia");
    await cartesiaFallback();
  }, gender, voiceId);

  _activeCancel = handle.cancel;
  return handle;
}

/* ─── Unified speak function ─── */
export async function speak(
  text: string,
  onEnd: () => void,
  onError: () => void,
  gender?: "male" | "female",
): Promise<{ cancel: () => void }> {
  const settings = loadTTSSettings();
  let handle: { cancel: () => void };

  // Cartesia fallback chain (before browser TTS)
  const cartesiaFallback = async () => {
    console.warn("Trying Cartesia TTS fallback");
    const cartesiaVoice = DEFAULT_VOICE_ID;
    const prefetchEntry = _prefetchCache.get(text);
    const hasPrefetch = !!prefetchEntry && Date.now() - prefetchEntry.createdAt < PREFETCH_TTL;
    if (hasPrefetch) {
      handle = await speakWithProxy(text, cartesiaVoice, onEnd, () => {
        console.warn("Cartesia REST also failed, falling back to browser TTS");
        const browserHandle = speakWithBrowser(text, onEnd, onError);
        handle = browserHandle;
        _activeCancel = browserHandle.cancel;
      });
    } else {
      handle = await speakWithWebSocket(text, cartesiaVoice, onEnd, async () => {
        console.warn("Cartesia WS failed, trying REST");
        handle = await speakWithProxy(text, cartesiaVoice, onEnd, () => {
          console.warn("Cartesia REST also failed, falling back to browser TTS");
          const browserHandle = speakWithBrowser(text, onEnd, onError);
          handle = browserHandle;
          _activeCancel = browserHandle.cancel;
        });
        _activeCancel = handle.cancel;
      });
    }
    _activeCancel = handle.cancel;
  };

  if (settings.provider === "browser") {
    handle = speakWithBrowser(text, onEnd, onError);
  } else {
    // Azure primary → Cartesia fallback → Browser fallback
    handle = await speakWithAzure(text, onEnd, async () => {
      console.warn("Azure TTS failed, trying Cartesia fallback");
      await cartesiaFallback();
    }, gender);
  }

  _activeCancel = handle.cancel;
  return handle;
}
