/* ─── Text-to-Speech Service ─── */
/* Primary:   Sarvam AI TTS  (Indian English / Hinglish, Bulbul model) via /api/sarvam-tts
   Fallback:  Cartesia TTS   (low-latency PCM streaming) via WebSocket + /api/tts REST
   3rd:       Azure TTS      (Indian English neural) via /api/azure-tts
   Last resort: Browser Web Speech API */

/* ─────────────────────────────────────────────────────────────────────
 * TTS KILL-SWITCH (2026-05-17)
 *
 * Temporarily disabled while iterating on the product so we don't burn
 * Sarvam / Cartesia / Azure tokens during manual QA. When TTS_DISABLED
 * is true:
 *   - speak() and speakAs() resolve immediately and call onEnd() so the
 *     interview state machine advances without waiting for audio.
 *   - prefetchTTS() is a no-op (no upstream API calls).
 *   - cancelTTS() / hardMuteTTS() / cleanupTTS() remain safe to call.
 *
 * To re-enable: flip TTS_DISABLED to false. No other change needed —
 * the provider chain (Sarvam → Cartesia → Azure → browser) is intact.
 * ───────────────────────────────────────────────────────────────────── */
const TTS_DISABLED = false;

/* Whether spoken AI output is currently off. The interview engine reads this
 * to default the answer composer to text mode — otherwise the UI shows a live
 * "Listening" mic/waveform while the AI never speaks, which reads as broken.
 * Mirrors TTS_DISABLED; flip the kill-switch above and this follows. */
export const VOICE_OUTPUT_DISABLED: boolean = TTS_DISABLED;

/* Estimate how long the question would have taken to speak so the
 * caption typewriter has a duration to pace against while the kill-
 * switch is on. ~160 wpm matches our Sarvam/Cartesia delivery pace;
 * floor at 1800ms so very short prompts still type instead of popping. */
function syntheticReadDurationMs(text: string): number {
  const words = (text || "").trim().split(/\s+/).filter(Boolean).length || 1;
  return Math.max(1800, Math.round((words / 160) * 60_000));
}

import { safeUUID } from "./utils";

/* Module-level Window augmentation — exposes the Cartesia AudioContext so
 * useMobileAudioResilience in Interview.tsx can resume it after iOS Safari
 * suspends the page. Was previously read/written via `as unknown as` casts;
 * a typed global removes the cast and gets IDE autocomplete + safety. */
declare global {
  interface Window {
    __hirestepxAudioCtx?: AudioContext;
  }
}

/* Unlock audio playback — call this on a user gesture (button click)
   before navigating to pages that auto-play audio. This creates a
   silent AudioContext that satisfies the browser's autoplay policy. */
let _audioUnlocked = false;
/** Track if autoplay is blocked — once detected, skip all TTS providers immediately */
let _autoplayBlocked = false;
export function isAutoplayBlocked(): boolean { return _autoplayBlocked; }

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
    audio.play().then(() => {
      _autoplayBlocked = false;
    }).catch(() => {});
    _audioUnlocked = true;
    _autoplayBlocked = false;
  } catch { /* expected: audio unlock may fail before user gesture */ }
}

/** Call on any user click/tap inside the interview page to retry unlocking audio */
export function retryUnlockAudio() {
  _audioUnlocked = false;
  _autoplayBlocked = false;
  unlockAudio();
}

/** Reset the autoplay-blocked flag without recreating the AudioContext.
 *  Used when the tab returns to foreground — gives the next TTS attempt a
 *  fresh shot before we declare playback dead and show the recovery overlay. */
export function clearAutoplayBlock() {
  _autoplayBlocked = false;
}

/** Check if a play() error is an autoplay policy block */
function isAutoplayError(err: unknown): boolean {
  if (err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "AbortError")) return true;
  if (err instanceof Error && /not.allowed|interact.*document|autoplay/i.test(err.message)) return true;
  return false;
}

const TTS_SETTINGS_KEY = "hirestepx_tts";

export interface TTSSettings {
  provider: "sarvam" | "cartesia" | "azure" | "browser";
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
  provider: "sarvam",
  voiceId: "priya",
  voiceName: "Priya (Sarvam Indian English)",
  language: "en_IN",
};

export function loadTTSSettings(): TTSSettings {
  try {
    const raw = localStorage.getItem(TTS_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Migrate legacy providers → Sarvam (current primary). Azure stays
      // as a valid explicit choice but isn't the default anymore.
      if (parsed.provider === "elevenlabs" || parsed.provider === "google") {
        parsed.provider = "sarvam";
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
      // tts-token now returns a short-lived Cartesia access token (not the raw
      // key). Track its real expiry so we refresh before the WS handshake would
      // be rejected; fall back to API_KEY_TTL if the server omits expiresAt.
      _cachedApiKey = data.token || data.apiKey || null;
      _apiKeyExpiry = typeof data.expiresAt === "number" ? data.expiresAt : Date.now() + API_KEY_TTL;
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

/* Pre-fetch TTS audio for a text so it's ready when needed.
   Pass gender so the correct voice (male/female) is cached. */
export async function prefetchTTS(text: string, gender?: "male" | "female"): Promise<void> {
  if (TTS_DISABLED) return; // kill-switch: skip upstream prefetch
  if (!text) return;
  // Sanitize first so prefetch keys collide on equivalent text — caller
  // and speak() both apply the same transform.
  text = sanitizeForTTS(text);
  if (!text) return;
  // Cache key includes gender so male/female prefetches don't clash
  const cacheKey = gender ? `${gender}::${text}` : text;
  const existing = _prefetchCache.get(cacheKey);
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
      // Prefetch hits whichever provider is currently configured as primary.
      // Sarvam is the default; explicit Azure/Cartesia overrides honored.
      const endpoint =
        settings.provider === "sarvam" ? "/api/sarvam-tts" :
        settings.provider === "azure"  ? "/api/azure-tts"  :
        /* cartesia */                    "/api/tts";
      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({ text, voiceId: settings.voiceId, ...(gender ? { gender } : {}) }),
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

  _prefetchCache.set(cacheKey, { promise, createdAt: Date.now() });
}

function consumePrefetch(text: string, gender?: "male" | "female"): Promise<Blob | null> | undefined {
  const cacheKey = gender ? `${gender}::${text}` : text;
  const entry = _prefetchCache.get(cacheKey);
  if (!entry) {
    // Fall back to non-gendered key (e.g. prefetched from SessionSetup without gender)
    // Only consume (delete) the fallback if no gender was requested — otherwise just read it
    // so other panel members can still use the non-gendered entry
    const fallback = _prefetchCache.get(text);
    if (!fallback) return undefined;
    if (Date.now() - fallback.createdAt >= PREFETCH_TTL) { _prefetchCache.delete(text); return undefined; }
    if (!gender) _prefetchCache.delete(text); // Only delete if non-gendered request
    return fallback.promise;
  }
  _prefetchCache.delete(cacheKey);
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
      console.warn("[TTS-WS] detected CLOSED/CLOSING socket, creating fresh connection");
    }
    try { _persistentWs.close(); } catch { /* expected: WebSocket may already be closed */ }
    _persistentWs = null;
    _persistentWsApiKey = null;
  }

  return new Promise((resolve) => {
    // `apiKey` is now a short-lived Cartesia access token; the WS authenticates
    // it via the access_token query param (not api_key).
    const wsUrl = `${CARTESIA_WS_URL}?access_token=${encodeURIComponent(apiKey)}&cartesia_version=2026-03-01`;
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
  onDurationKnown?: (ms: number) => void,
  onAudioStarted?: () => void,
): Promise<{ cancel: () => void }> {
  // Serialize utterances to prevent WebSocket message interleaving
  let resolveQueue: () => void;
  const prevQueue = _utteranceQueue;
  _utteranceQueue = new Promise(r => { resolveQueue = r; });
  await prevQueue;
  const markDone = () => resolveQueue!();
  const wrappedOnEnd = () => { markDone(); onEnd(); };
  const wrappedOnError = () => { markDone(); onError(); };
  return _speakWithWebSocketInner(text, voiceId, wrappedOnEnd, wrappedOnError, markDone, false, gender, onDurationKnown, onAudioStarted);
}

async function _speakWithWebSocketInner(
  text: string,
  voiceId: string,
  onEnd: () => void,
  onError: () => void,
  markDone: () => void,
  isRetry: boolean,
  gender?: "male" | "female",
  onDurationKnown?: (ms: number) => void,
  onAudioStarted?: () => void,
): Promise<{ cancel: () => void }> {
  let audioStartedFired = false;
  const fireAudioStarted = () => {
    if (audioStartedFired || !onAudioStarted) return;
    audioStartedFired = true;
    try { onAudioStarted(); } catch { /* consumer error must not break TTS */ }
  };
  let settled = false;
  let cancelled = false;
  const settle = (cb: () => void) => { if (!settled && !cancelled) { settled = true; cb(); } };
  let audioCtx: AudioContext | null = null;
  const closeCtx = () => { try { audioCtx?.close(); } catch { /* expected: AudioContext cleanup errors are non-critical */ } audioCtx = null; };

  let nextStartTime = 0;
  let chunksReceived = 0;
  let allChunksReceived = false;
  let chunksPlayed = 0;
  let totalChunksScheduled = 0;
  let totalPcmBytes = 0;
  let durationReported = false;

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
      return speakWithProxy(text, voiceId, onEnd, onError, gender, onDurationKnown, onAudioStarted);
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
      return speakWithProxy(text, voiceId, onEnd, onError, gender, onDurationKnown, onAudioStarted);
    }

    audioCtx = new AudioContext({ sampleRate: WS_SAMPLE_RATE });
    nextStartTime = audioCtx.currentTime;
    // Expose on window so Interview.tsx's useMobileAudioResilience hook can
    // resume it after backgrounding / rotation on iOS Safari, which otherwise
    // suspends it silently and breaks mid-interview TTS.
    try { window.__hirestepxAudioCtx = audioCtx; } catch { /* SSR / restricted */ }
    const capturedCtx = audioCtx;
    const contextId = safeUUID();

    // Timeout: if no data in 10s, fall back
    const wsTimeout = setTimeout(() => {
      if (chunksReceived === 0 && !cancelled) {
        console.warn("[TTS-WS] timeout — no data received, falling back to REST");
        closeCtx();
        markDone(); // release _utteranceQueue before proxy; prevents deadlock if proxy throws
        settle(() => {});
        speakWithProxy(text, voiceId, onEnd, onError, gender, onDurationKnown, onAudioStarted);
      }
    }, 10000);

    // Set message handler for this utterance
    const handler = (event: MessageEvent) => {
      if (cancelled) return;
      clearTimeout(wsTimeout);

      try {
        const msg = JSON.parse(event.data);

        // Drop chunks belonging to a previous utterance — when speak() is called
        // back-to-back rapidly, in-flight chunks from the prior context can leak
        // into the new handler and play garbled audio.
        if (msg.context_id && msg.context_id !== contextId) return;

        if (msg.type === "chunk" && msg.data) {
          chunksReceived++;
          const binaryStr = atob(msg.data);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
          }
          const float32 = new Float32Array(bytes.buffer);
          totalPcmBytes += bytes.length;

          // Emit a coarse estimate now so consumers (avatar mouth animation)
          // have a duration during playback. The accurate value supersedes
          // it at "done" — consumers must accept the later update.
          if (!durationReported && onDurationKnown) {
            const estimatedTotalMs = (text.split(/\s+/).length / 150) * 60 * 1000;
            onDurationKnown(Math.max(2000, estimatedTotalMs));
            durationReported = true;
          }

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
            /* first chunk received — playback starts automatically.
             * Fire onAudioStarted so the UI can synchronize text
             * reveal with the actual audio onset. */
            fireAudioStarted();
          }
        } else if (msg.type === "done" || msg.done) {
          allChunksReceived = true;
          // Report accurate duration from total PCM bytes: bytes / (sampleRate * 4 bytes per float32)
          if (onDurationKnown && totalPcmBytes > 0) {
            const accurateMs = (totalPcmBytes / (WS_SAMPLE_RATE * 4)) * 1000;
            onDurationKnown(accurateMs);
          }
          // Don't close WS — reuse for next question
          if (totalChunksScheduled === 0) settle(onEnd);
          else checkPlaybackComplete();
        } else if (msg.type === "error") {
          console.warn("[TTS-WS] server error:", msg);
          clearTimeout(wsTimeout);
          closeCtx();
          settle(() => {});
          speakWithProxy(text, voiceId, onEnd, onError, gender, onDurationKnown, onAudioStarted);
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
          _speakWithWebSocketInner(text, voiceId, onEnd, onError, markDone, true, gender, onDurationKnown, onAudioStarted)
            .then((retryHandle) => {
              // Propagate the new cancel handle up to _activeCancel
              _activeCancel = retryHandle.cancel;
            });
        } else if (chunksReceived === 0 && isRetry) {
          // Already retried once — fall back to REST
          console.warn("[TTS-WS] reconnect also failed, falling back to REST");
          closeCtx();
          speakWithProxy(text, voiceId, onEnd, onError, gender, onDurationKnown, onAudioStarted);
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
    return speakWithProxy(text, voiceId, onEnd, onError, gender, onDurationKnown, onAudioStarted);
  }

  const capturedCtx = audioCtx;
  return {
    cancel: () => {
      if (cancelled) return; // Prevent double-cancel race
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
  onDurationKnown?: (ms: number) => void,
  onAudioStarted?: () => void,
): Promise<{ cancel: () => void }> {
  // If autoplay is blocked, skip immediately
  if (_autoplayBlocked) {
    onEnd();
    return { cancel: () => {} };
  }

  const controller = new AbortController();
  let audio: HTMLAudioElement | null = null;
  let settled = false;
  const settle = (cb: () => void) => { if (!settled) { settled = true; cb(); } };
  let audioStartedFired = false;
  const fireAudioStarted = () => {
    if (audioStartedFired || !onAudioStarted) return;
    audioStartedFired = true;
    try { onAudioStarted(); } catch { /* consumer error must not break TTS */ }
  };

  try {
    let blob: Blob | null = null;

    // Check pre-fetch cache first (pass gender for gender-keyed cache lookups)
    const cached = consumePrefetch(text, gender);
    if (cached) {
      blob = await cached;
    }

    if (!blob) {
      const { authHeaders } = await import("./supabase");
      const headers = await authHeaders();

      // Matches Sarvam (line ~766) and Azure (line ~879) timeout. Without
      // this, a hung Cartesia REST call could stall the interview forever
      // — the orchestrator's onError fallback to Azure never fires because
      // the await on res.blob() never settles.
      const timeout = setTimeout(() => controller.abort(), 15_000);
      let res: Response;
      try {
        res = await fetch("/api/tts", {
          method: "POST",
          headers,
          body: JSON.stringify({ text, voiceId, language: loadTTSSettings().language, ...(gender ? { gender } : {}) }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

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

    audio.onloadedmetadata = () => {
      if (audio && isFinite(audio.duration) && audio.duration > 0 && onDurationKnown) {
        onDurationKnown(audio.duration * 1000);
      }
    };
    audio.onplaying = fireAudioStarted;
    audio.onended = () => {
      URL.revokeObjectURL(url);
      settle(onEnd);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      settle(onError);
    };

    await audio.play();
    /* Fallback fire: some browsers don't dispatch `playing` reliably when
     * audio is fully buffered from a blob URL. play() resolving is a strong
     * signal playback has begun. Single-fire guarded by fireAudioStarted. */
    fireAudioStarted();
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      if (!settled) settle(onError); // Timeout abort — trigger fallback
      return { cancel: () => {} };
    }
    if (isAutoplayError(err)) {
      _autoplayBlocked = true;
      settle(onEnd);
      return { cancel: () => {} };
    }
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

/* ─── Sarvam AI TTS (primary provider — Indian English / Hinglish Bulbul voices) ─── */
async function speakWithSarvam(
  text: string,
  onEnd: () => void,
  onError: () => void,
  gender?: "male" | "female",
  voiceId?: string,
  onDurationKnown?: (ms: number) => void,
  onAudioStarted?: () => void,
): Promise<{ cancel: () => void }> {
  if (_autoplayBlocked) {
    console.warn("[TTS-Sarvam] autoplay blocked, skipping");
    onEnd();
    return { cancel: () => {} };
  }

  const controller = new AbortController();
  let audio: HTMLAudioElement | null = null;
  let settled = false;
  const settle = (cb: () => void) => { if (!settled) { settled = true; cb(); } };
  let audioStartedFired = false;
  const fireAudioStarted = () => {
    if (audioStartedFired || !onAudioStarted) return;
    audioStartedFired = true;
    try { onAudioStarted(); } catch { /* consumer error must not break TTS */ }
  };

  try {
    let blob: Blob | null = null;

    // Reuse prefetch cache — primary-provider prefetch hits /api/sarvam-tts.
    const cached = consumePrefetch(text, gender);
    if (cached) {
      blob = await cached;
    }

    if (!blob) {
      const { authHeaders } = await import("./supabase");
      const headers = await authHeaders();

      const timeout = setTimeout(() => controller.abort(), 15_000);
      const res = await fetch("/api/sarvam-tts", {
        method: "POST",
        headers,
        body: JSON.stringify({
          text: text.trim().slice(0, 1500),
          voiceId: voiceId,
          gender,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        console.warn("[TTS-Sarvam] API error:", res.status);
        settle(onError);
        return { cancel: () => {} };
      }

      blob = await res.blob();
    }

    if (!blob || blob.size < 100) {
      console.warn("[TTS-Sarvam] empty audio");
      settle(onError);
      return { cancel: () => {} };
    }

    const url = URL.createObjectURL(blob);
    audio = new Audio(url);
    audio.onloadedmetadata = () => {
      if (audio && isFinite(audio.duration) && audio.duration > 0 && onDurationKnown) {
        onDurationKnown(audio.duration * 1000);
      }
    };
    audio.onplaying = fireAudioStarted;
    audio.onended = () => { URL.revokeObjectURL(url); settle(onEnd); };
    audio.onerror = () => { URL.revokeObjectURL(url); settle(onError); };
    await audio.play();
    /* Same blob-Audio "playing" event quirk as Azure path. */
    fireAudioStarted();
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      if (!settled) settle(onError);
      return { cancel: () => {} };
    }
    if (isAutoplayError(err)) {
      console.warn("[TTS-Sarvam] autoplay blocked by browser policy — disabling voice for session");
      _autoplayBlocked = true;
      settle(onEnd);
      return { cancel: () => {} };
    }
    console.warn("[TTS-Sarvam] error:", err instanceof Error ? err.message : err);
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

/* ─── Azure TTS (3rd-tier provider — Indian English neural voices) ─── */
async function speakWithAzure(
  text: string,
  onEnd: () => void,
  onError: () => void,
  gender?: "male" | "female",
  voiceId?: string,
  onDurationKnown?: (ms: number) => void,
  onAudioStarted?: () => void,
): Promise<{ cancel: () => void }> {
  // If autoplay is already known to be blocked, skip immediately
  if (_autoplayBlocked) {
    console.warn("[TTS-Azure] autoplay blocked, skipping");
    onEnd(); // Treat as silent success — let interview proceed without voice
    return { cancel: () => {} };
  }

  const controller = new AbortController();
  let audio: HTMLAudioElement | null = null;
  let settled = false;
  const settle = (cb: () => void) => { if (!settled) { settled = true; cb(); } };
  let audioStartedFired = false;
  const fireAudioStarted = () => {
    if (audioStartedFired || !onAudioStarted) return;
    audioStartedFired = true;
    try { onAudioStarted(); } catch { /* consumer error must not break TTS */ }
  };

  try {
    let blob: Blob | null = null;

    // Check prefetch cache first — avoids duplicate request on cold start (Q1)
    const cached = consumePrefetch(text, gender);
    if (cached) {
      blob = await cached;
    }

    if (!blob) {
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

      blob = await res.blob();
    }

    if (!blob || blob.size < 100) {
      console.warn("[TTS-Azure] empty audio");
      settle(onError);
      return { cancel: () => {} };
    }

    const url = URL.createObjectURL(blob);
    audio = new Audio(url);
    audio.onloadedmetadata = () => {
      if (audio && isFinite(audio.duration) && audio.duration > 0 && onDurationKnown) {
        onDurationKnown(audio.duration * 1000);
      }
    };
    audio.onplaying = fireAudioStarted;
    audio.onended = () => { URL.revokeObjectURL(url); settle(onEnd); };
    audio.onerror = () => { URL.revokeObjectURL(url); settle(onError); };
    await audio.play();
    /* Fallback: blob-backed Audio often skips `playing` event. play()
     * resolving is the most reliable signal that decode succeeded and
     * playback has started. Single-fire guarded by fireAudioStarted. */
    fireAudioStarted();
  } catch (err: unknown) {
    // Timeout abort (not user-cancel) — trigger fallback chain
    if (err instanceof Error && err.name === "AbortError") {
      if (!settled) settle(onError);
      return { cancel: () => {} };
    }
    // Detect autoplay policy block — skip ALL TTS providers, proceed silently
    if (isAutoplayError(err)) {
      console.warn("[TTS-Azure] autoplay blocked by browser policy — disabling voice for session");
      _autoplayBlocked = true;
      settle(onEnd); // Silent success — let interview proceed without voice
      return { cancel: () => {} };
    }
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

// The Web Speech API exposes no gender field on SpeechSynthesisVoice, only
// a name/lang string. Match common vendor naming conventions so the final
// fallback tier doesn't hand back a voice of the wrong (or just different)
// gender from whatever Sarvam/Cartesia/Azure used earlier in the session —
// see B-EMP4 in speakWithBrowser below.
const BROWSER_FEMALE_VOICE_HINTS = ["female", "samantha", "veena", "zira", "karen", "victoria", "moira", "tessa", "fiona"];
const BROWSER_MALE_VOICE_HINTS = ["male", "daniel", "rishi", "david", "alex", "fred", "aaron", "arthur"];
export function browserVoiceGender(name: string): "male" | "female" | undefined {
  const lower = name.toLowerCase();
  if (BROWSER_FEMALE_VOICE_HINTS.some((h) => lower.includes(h))) return "female";
  if (BROWSER_MALE_VOICE_HINTS.some((h) => lower.includes(h))) return "male";
  return undefined;
}

/* ─── Browser TTS (fallback) ─── */
function speakWithBrowser(
  text: string,
  onEnd: () => void,
  onError: () => void,
  onAudioStarted?: () => void,
  gender?: "male" | "female",
): { cancel: () => void } {
  // If autoplay is blocked, skip — browser TTS also requires user gesture
  if (_autoplayBlocked) {
    onEnd();
    return { cancel: () => {} };
  }
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
  // Prefer Indian English voices, fall back to US English. MVP is
  // English-only; Hindi voice fallback removed (was hinting Hindi
  // pronunciation when no Indian-English voice was available).
  // B-EMP4 (2026-08-20): rank by gender match first so this last-resort
  // tier doesn't audibly swap the interviewer's voice identity when Sarvam/
  // Cartesia/Azure have already spoken in a specific gender this session.
  const genderMatches = gender ? voices.filter((v) => browserVoiceGender(v.name) === gender) : voices;
  const pool = genderMatches.length > 0 ? genderMatches : voices;
  const preferred = pool.find(
    (v) =>
      v.lang === "en-IN" ||
      v.name.includes("Indian"),
  ) || pool.find(
    (v) =>
      v.name.includes("Samantha") ||
      v.name.includes("Google US English") ||
      v.name.includes("Daniel") ||
      (v.lang === "en-US" && v.localService),
  );
  if (preferred) utter.voice = preferred;
  let fired = false;
  let speechStarted = false;
  utter.onstart = () => {
    speechStarted = true;
    try { onAudioStarted?.(); } catch { /* consumer error must not break TTS */ }
  };
  utter.onend = () => { if (!fired) { fired = true; clearTimeout(safetyTimer); onEnd(); } };
  utter.onerror = (e) => {
    if (!fired) { fired = true; clearTimeout(safetyTimer); console.warn("Browser TTS error:", e); onError(); }
  };

  // Safety timer: only fire if speech never started (some browsers report speaking=false immediately)
  const safetyTimer = setTimeout(() => {
    if (!fired && !speechStarted) {
      fired = true;
      console.warn("Browser TTS silent failure — speech never started after 2s");
      onError();
    }
  }, 2000);

  window.speechSynthesis.speak(utter);

  return {
    cancel: () => { fired = true; clearTimeout(safetyTimer); window.speechSynthesis.cancel(); },
  };
}

/* ─── Cleanup for page unload ─── */
let _activeCancel: (() => void) | null = null;
/** Version counter — prevents stale fallback chains from overwriting the current cancel handle */
let _ttsGeneration = 0;

// Auto-cleanup on page unload to prevent WebSocket/AudioContext leaks
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => cleanupTTS());
  // Also clean up when navigating away (SPA route changes via pagehide)
  window.addEventListener("pagehide", () => cleanupTTS());
}

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

/**
 * Hard-mute the TTS pipeline NOW. Used by skipSpeaking() to silence
 * already-buffered audio that the regular cancel() handler can't yank
 * fast enough. Cartesia's WebSocket has up to ~1.5s of pre-decoded
 * PCM in flight when you cancel; Azure has the entire sentence
 * pre-rendered. Both leak after the user pressed Space.
 *
 * Suspend (not close) the AudioContext: suspend silences output
 * within a frame and is reversible — the next speak() call resumes it
 * and works normally. Closing would force a costly recreate cycle.
 *
 * Also stops every <audio> element on the page that's currently
 * playing — Azure speakWithBrowser path uses HTMLAudioElement.
 */
export function hardMuteTTS() {
  // 1. Cancel the current handle (idempotent w/ cleanupTTS)
  _activeCancel?.();
  _activeCancel = null;

  // 2. Suspend the Cartesia AudioContext immediately (silences in-flight PCM)
  try {
    const ctx = window.__hirestepxAudioCtx;
    if (ctx && ctx.state !== "closed") {
      ctx.suspend().catch(() => { /* best effort */ });
    }
  } catch { /* SSR / restricted */ }

  // 3. Pause any HTMLAudioElement currently rendering Azure / browser TTS
  try {
    document.querySelectorAll("audio").forEach((el) => {
      try { el.pause(); } catch { /* expected */ }
    });
  } catch { /* DOM unavailable */ }

  // 4. Cancel native speechSynthesis (browser TTS fallback)
  try {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  } catch { /* expected */ }
}

/* ─── Speak with a specific voice (for panel interviews) ─── */
import {
  startTtsAttempt,
  recordTtsAttempt,
  recordTtsAudioStarted,
  finalizeTtsAttempt,
  type TtsTier,
} from "./_tts-telemetry";

export async function speakAs(
  text: string,
  voiceId: string,
  onEnd: () => void,
  onError: () => void,
  gender?: "male" | "female",
  onDurationKnown?: (ms: number) => void,
  onAudioStarted?: () => void,
): Promise<{ cancel: () => void }> {
  // Kill-switch: resolve as silent success so panel-mode state machine
  // advances without waiting for audio. onError is intentionally NOT
  // called — that would trigger a fallback chain we don't want either.
  if (TTS_DISABLED) {
    // Synthesize the audio lifecycle so the caption typewriter still
    // reveals + paces. Without onAudioStarted, LiveCaptions stays hidden
    // behind its 1.2s fallback timer and then pops in un-typed; without
    // onDurationKnown the typing animation has no target duration.
    const syntheticMs = syntheticReadDurationMs(text);
    queueMicrotask(() => {
      try { onAudioStarted?.(); } catch { /* consumer error must not break TTS */ }
      try { onDurationKnown?.(syntheticMs); } catch { /* consumer error must not break TTS */ }
    });
    const endTimer = setTimeout(() => { try { onEnd(); } catch { /* consumer error must not break TTS */ } }, syntheticMs);
    return { cancel: () => clearTimeout(endTimer) };
  }
  text = addBreathCues(sanitizeForTTS(text));
  const settings = loadTTSSettings();
  if (settings.provider === "browser") {
    return speak(text, onEnd, onError, undefined, undefined, onAudioStarted);
  }

  // Per-call telemetry attempt — emits one `tts_provider_used` event with
  // the full fallback chain so we can see Sarvam→Cartesia→Azure escalation
  // in PostHog. See _tts-telemetry.ts.
  const attempt = startTtsAttempt({ text, voiceId, gender });
  const wrapStart = (tier: TtsTier) => () => {
    recordTtsAudioStarted(attempt, tier);
    try { onAudioStarted?.(); } catch { /* consumer error must not break TTS */ }
  };
  const wrapEnd = () => { finalizeTtsAttempt(attempt, "ok"); try { onEnd(); } catch { /* consumer */ } };
  const wrapError = () => { finalizeTtsAttempt(attempt, "error"); try { onError(); } catch { /* consumer */ } };

  // Versioned cancel: each new speakAs/speak call gets a generation ID.
  // Stale fallback chains won't overwrite the current cancel handle.
  const gen = ++_ttsGeneration;
  const setCancel = (fn: () => void) => {
    if (gen === _ttsGeneration) _activeCancel = () => { finalizeTtsAttempt(attempt, "cancelled"); fn(); };
  };

  let handle: { cancel: () => void };

  // Last-leg fallback: Azure → Browser.
  const azureFallback = async () => {
    console.warn("Trying Azure TTS fallback (speakAs)");
    recordTtsAttempt(attempt, "azure");
    handle = await speakWithAzure(text, wrapEnd, () => {
      console.warn("Azure TTS also failed (speakAs), falling back to browser TTS");
      recordTtsAttempt(attempt, "browser");
      const browserHandle = speakWithBrowser(text, wrapEnd, wrapError, wrapStart("browser"), gender);
      handle = browserHandle;
      setCancel(browserHandle.cancel);
    }, gender, voiceId, onDurationKnown, wrapStart("azure"));
    setCancel(handle.cancel);
  };

  // Cartesia (2nd) → Azure → Browser.
  const cartesiaFallback = async () => {
    console.warn("Trying Cartesia TTS fallback (speakAs)");
    recordTtsAttempt(attempt, "cartesia-ws");
    handle = await speakWithWebSocket(text, voiceId, wrapEnd, async () => {
      console.warn("Cartesia WS failed (speakAs), trying REST");
      recordTtsAttempt(attempt, "cartesia-rest");
      handle = await speakWithProxy(text, voiceId, wrapEnd, async () => {
        console.warn("Cartesia REST also failed (speakAs), trying Azure");
        await azureFallback();
      }, gender, onDurationKnown, wrapStart("cartesia-rest"));
      setCancel(handle.cancel);
    }, gender, onDurationKnown, wrapStart("cartesia-ws"));
    setCancel(handle.cancel);
  };

  // Sarvam primary → Cartesia → Azure → Browser.
  recordTtsAttempt(attempt, "sarvam");
  handle = await speakWithSarvam(text, wrapEnd, async () => {
    console.warn("Sarvam TTS failed (speakAs), trying Cartesia");
    await cartesiaFallback();
  }, gender, voiceId, onDurationKnown, wrapStart("sarvam"));

  setCancel(handle.cancel);
  // Wrap returned cancel so external callers also finalize as "cancelled".
  const outerCancel = () => { finalizeTtsAttempt(attempt, "cancelled"); handle.cancel(); };
  return { cancel: outerCancel };
}

/* ─── Unified speak function ─── */
import { stripProsodyMarkup, renderForCartesia } from "./_prosody";

/* Prosody-rendering feature flag. When ON, `_emphasis_` and `[pause]`
   markers in the LLM output get rendered to provider-native cadence
   (Cartesia respects ellipsis as a measurable pause, so the renderer
   converts `[pause]` → `… ` and drops the inline emphasis markers
   since Cartesia doesn't expose SSML on the realtime endpoint). When
   OFF, markers are stripped entirely — the safe default until we've
   verified the rendered audio sounds right on real devices.

   Same shape as the backchannels flag — flip via DevTools or the
   exported helper below. */
const PROSODY_FLAG_KEY = "hsx-prosody";
function isProsodyEnabled(): boolean {
  try { return typeof localStorage !== "undefined" && localStorage.getItem(PROSODY_FLAG_KEY) === "on"; }
  catch { return false; }
}
export function setProsodyEnabled(enabled: boolean): void {
  try {
    if (typeof localStorage === "undefined") return;
    if (enabled) localStorage.setItem(PROSODY_FLAG_KEY, "on");
    else localStorage.removeItem(PROSODY_FLAG_KEY);
  } catch { /* localStorage may be blocked (Safari private mode) */ }
}

/**
 * Strip markdown / collapse whitespace before sending text to TTS providers.
 * Saves billable characters on the free tier and removes literal "**" / "##"
 * that some engines pronounce. Idempotent.
 *
 * Prosody markup handling: when the feature flag is ON, `[pause]` and
 * friends are converted to provider-native pauses (ellipsis for the
 * Cartesia/browser path). When OFF (default), they're stripped — same
 * defensive guard as before, so a model emitting markup before we
 * live-test never speaks "underscore time underscore" literally.
 */
// Indic / non-Latin script ranges that, when present, cause TTS providers
// (Cartesia, Azure) to auto-detect language and switch voice mid-sentence.
// The most common offender is Devanagari leaking from the LLM output (the
// model occasionally code-switches to Hindi when the candidate's STT had
// Hindi tokens in it). Stripping these here pins the AI's voice to en-IN
// regardless of provider language-detection. We do NOT touch the candidate's
// own answer text — only what the AI is about to say.
//
// Uses Unicode property escapes (the `u` flag + `\p{Script=…}`) for clarity
// and to avoid the eslint no-misleading-character-class warning on raw
// codepoint ranges that include surrogate pairs.
const NON_LATIN_SCRIPT_RE = /[\p{Script=Devanagari}\p{Script=Bengali}\p{Script=Gurmukhi}\p{Script=Gujarati}\p{Script=Oriya}\p{Script=Tamil}\p{Script=Telugu}\p{Script=Kannada}\p{Script=Malayalam}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const NON_LATIN_SCRIPT_STRIP_RE = /[\p{Script=Devanagari}\p{Script=Bengali}\p{Script=Gurmukhi}\p{Script=Gujarati}\p{Script=Oriya}\p{Script=Tamil}\p{Script=Telugu}\p{Script=Kannada}\p{Script=Malayalam}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu;

/**
 * Expand Indian-currency abbreviations so TTS pronounces them as words
 * rather than spelling out the letter.
 *
 * Bug report 11 follow-up F (2026-05-14): "₹1L" was rendered to TTS
 * verbatim and Azure / Cartesia / browser SpeechSynthesis read the "L"
 * as the LETTER ELL ("one ell" / "twenty four point five ell pee ay"),
 * which broke comprehension in salary-negotiation flows. We keep the
 * compact form on-screen (the UI surfaces ₹1L deliberately for density)
 * and only expand on the speech-synthesis path. Pure, idempotent: a
 * second pass over already-expanded text is a no-op because the
 * patterns require the L/Cr/LPA tokens.
 *
 * Order matters:
 *   1. Multi-letter compound tokens first (`LPA`, `Cr`, `Cr.`) so
 *      `25 LPA` doesn't get partially matched as `25 L` + stray `PA`.
 *   2. Single-letter `L` last, anchored so it only fires when adjacent
 *      to a number (optionally with ₹). Bare prose containing the
 *      letter L (e.g. "ESOPs vest over 4 years") is untouched.
 *
 * Pluralization: 1 → singular ("1 lakh"), everything else → plural.
 * Fractional values pluralize ("1.5 lakhs") per the spec. */
export function expandCurrencyForSpeech(text: string): string {
  if (!text) return text;
  let out = text;

  // Step 1 — `LPA` / `lpa` standalone or after a number (with or without ₹).
  // Pattern catches: "₹24.5 LPA", "25LPA", "25 lpa", "lpa" standalone in a
  // sentence. The number-prefixed form pluralizes; the standalone form just
  // expands the acronym.
  out = out.replace(
    /(₹\s*)?(\d+(?:\.\d+)?)\s*LPA\b/gi,
    (_m, _r, n: string) => {
      const num = parseFloat(n);
      const word = num === 1 ? "lakh per annum" : "lakhs per annum";
      return `${n} ${word}`;
    },
  );
  out = out.replace(/\bLPA\b/g, "lakhs per annum");

  // Step 2 — Crore: `₹1Cr`, `1 Cr`, `1cr`, `1Cr.`. Decimals → plural.
  out = out.replace(
    /(₹\s*)?(\d+(?:\.\d+)?)\s*Cr\b\.?/gi,
    (_m, _r, n: string) => {
      const num = parseFloat(n);
      const word = num === 1 ? "crore" : "crores";
      return `${n} ${word}`;
    },
  );

  // Step 3 — Lakhs single-letter `L` form: `₹1L`, `₹1.5L`, `1L`, `1 L`.
  // Anchored: number REQUIRED on the left (so prose "L" letter survives).
  // Right boundary is non-letter so we don't eat into "LPA" (already
  // handled in step 1, but a defensive negative lookahead protects
  // against future re-orderings). The (?!P) lookahead handles a
  // hypothetical LPA we missed; (?!\w) ensures we don't eat into other
  // tokens like "Lacs" or "Lakh".
  out = out.replace(
    /(₹\s*)?(\d+(?:\.\d+)?)\s*L(?![A-Za-z])/gi,
    (_m, _r, n: string) => {
      const num = parseFloat(n);
      const word = num === 1 ? "lakh" : "lakhs";
      return `${n} ${word}`;
    },
  );

  // Step 4 — strip leftover ₹ before a number now that abbreviations are
  // expanded ("₹25 lakhs per annum" → "25 lakhs per annum"). Without this
  // some engines read ₹ as "indian rupee" out of order. We keep the ₹ in
  // the on-screen text — this only runs on the speech path.
  out = out.replace(/₹\s*(\d)/g, "$1 rupees ").replace(/\s{2,}/g, " ");
  // The simpler "₹25 lakhs" reads naturally as "25 lakhs"; the rupees
  // injection only matters when no unit follows. Collapse the redundant
  // form: "25 rupees lakhs" → "25 lakhs". Same idea for crore.
  out = out
    .replace(/\brupees\s+(lakh|lakhs|crore|crores)\b/gi, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();

  // Step 5 (Phase 33, 2026-05-14) — international currencies + K/M/B
  // magnitude suffixes. Before this block we only expanded ₹/LPA/Cr/L;
  // any international offer ($120K, €80K, £75K, ¥10M) reached the TTS
  // engine raw, which read "$" as literal "dollar sign" and skipped the
  // K/M/B suffix entirely. Order matters: handle magnitude suffix +
  // currency symbol together so we know singular vs plural.
  //
  // Symbol → unit:
  //   $ → dollars,  € → euros,  £ → pounds,  ¥ → yen
  //
  // Magnitude → expansion:
  //   K → thousand,  M → million,  B → billion
  //
  // Examples:
  //   "$120K"     → "120 thousand dollars"
  //   "€1.5M"     → "1.5 million euros"
  //   "£75,000"   → "75,000 pounds"
  //   "¥10M"      → "10 million yen"
  //   "USD 200K"  → "200 thousand dollars"
  const SYMBOL_TO_WORD: Record<string, { singular: string; plural: string }> = {
    $: { singular: "dollar", plural: "dollars" },
    "€": { singular: "euro", plural: "euros" },
    "£": { singular: "pound", plural: "pounds" },
    "¥": { singular: "yen", plural: "yen" }, // 'yen' is invariant
  };
  const MAG: Record<string, string> = { K: "thousand", M: "million", B: "billion" };

  // 5a — symbol-prefix form: "$120K", "€ 1.5M", "$75"
  // The (?:\s*([KMB])\b)? group keeps the trailing whitespace inside the
  // optional magnitude — when no K/M/B is present we don't consume the
  // space, so "$1 per share" → "1 dollar per share" not "1 dollarper share".
  out = out.replace(
    /([$€£¥])\s*(\d+(?:[\d,]*\d)?(?:\.\d+)?)(?:\s*([KMB])\b)?/g,
    (_m, sym: string, n: string, mag: string | undefined) => {
      const cleanN = n.replace(/,/g, "");
      const num = parseFloat(cleanN);
      const isOne = num === 1;
      const unit = SYMBOL_TO_WORD[sym];
      const word = isOne ? unit.singular : unit.plural;
      if (mag) return `${n} ${MAG[mag]} ${word}`;
      return `${n} ${word}`;
    },
  );

  // 5b — ISO code prefix form: "USD 200K", "EUR 80,000", "GBP 50K". Case-
  // sensitive on the code so we don't mangle prose like "Eur". The space
  // is required to avoid matching "USDA" / "EURope".
  const CODE_TO_SYM: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", JPY: "¥" };
  out = out.replace(
    /\b(USD|EUR|GBP|JPY)\s+(\d+(?:[\d,]*\d)?(?:\.\d+)?)(?:\s*([KMB])\b)?/g,
    (_m, code: string, n: string, mag: string | undefined) => {
      const sym = CODE_TO_SYM[code];
      const cleanN = n.replace(/,/g, "");
      const num = parseFloat(cleanN);
      const unit = SYMBOL_TO_WORD[sym];
      const word = num === 1 ? unit.singular : unit.plural;
      if (mag) return `${n} ${MAG[mag]} ${word}`;
      return `${n} ${word}`;
    },
  );

  return out;
}

function sanitizeForTTS(text: string): string {
  if (!text) return text;
  // Render or strip prosody markup first — the markdown stripper below
  // would otherwise treat _word_ italic as content to preserve.
  const prosodyHandled = isProsodyEnabled() ? renderForCartesia(text) : stripProsodyMarkup(text);
  let cleaned = prosodyHandled
    .replace(/```[\s\S]*?```/g, " ")          // fenced code blocks
    .replace(/`([^`]+)`/g, "$1")              // inline code
    .replace(/\*\*([^*]+)\*\*/g, "$1")        // bold
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "$1") // italic
    .replace(/^#{1,6}\s+/gm, "")              // headings
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")  // links
    .replace(/[ \t]+/g, " ")                  // collapse spaces
    .replace(/\s*\n\s*/g, " ")                // collapse newlines
    .trim();
  // Expand Indian currency abbreviations BEFORE the non-Latin-script
  // guard so the expansion text remains pure ASCII.
  cleaned = expandCurrencyForSpeech(cleaned);
  // Hindi-voice-leak guard. If any non-Latin script slipped through (LLM
  // code-switching), strip it and warn so we can trace which prompt let
  // it through. Replacement char is " " so we don't merge words.
  if (NON_LATIN_SCRIPT_RE.test(cleaned)) {
    console.warn("[tts] non-Latin script detected in AI output — stripping to pin en-IN voice");
    cleaned = cleaned.replace(NON_LATIN_SCRIPT_STRIP_RE, " ").replace(/\s{2,}/g, " ").trim();
  }
  return cleaned;
}

/**
 * Insert breath pauses into long clauses so synthesized speech doesn't read
 * as a wall of words. Real humans pause every 8-14 words; most TTS engines
 * (Cartesia included) respect commas and ellipses as breath cues.
 */
function addBreathCues(text: string): string {
  if (!text || text.length < 80) return text;
  // Replace "..." → "… " (Cartesia respects ellipsis as a longer pause)
  let out = text.replace(/\.{3,}/g, "… ");
  // Insert a comma before connector words when the preceding clause is >12 words
  // and there's no comma already.
  out = out.replace(/(\b\w+(?:\s+\w+){11,})\s+(but|and|so|because|then|however|although)\b/gi, "$1, $2");
  return out;
}

/** All available Sarvam female voices — exported so the interview engine
 *  can pick one at session-start for consistent within-session variety. */
// Kept in lockstep with VOICES.female in server-handlers/sarvam-tts.ts
// (bulbul:v3 roster — v2's manisha/anushka/vidya/arya no longer exist).
export const SARVAM_FEMALE_VOICES = ["priya", "ritu", "neha", "pooja", "simran", "kavya", "ishita", "shreya", "roopa", "tanya", "shruti", "suhani", "kavitha", "rupali"] as const;

export async function speak(
  text: string,
  onEnd: () => void,
  onError: () => void,
  gender?: "male" | "female",
  onDurationKnown?: (ms: number) => void,
  onAudioStarted?: () => void,
  voiceId?: string,
): Promise<{ cancel: () => void }> {
  // Kill-switch: resolve as silent success so the interview state
  // machine advances without waiting for audio. See top-of-file
  // TTS_DISABLED comment for the re-enable path.
  if (TTS_DISABLED) {
    // See speakAs() above for why we synthesize the full lifecycle, not
    // just onEnd: the caption typewriter needs onAudioStarted to reveal
    // and onDurationKnown to pace itself.
    const syntheticMs = syntheticReadDurationMs(text);
    queueMicrotask(() => {
      try { onAudioStarted?.(); } catch { /* consumer error must not break TTS */ }
      try { onDurationKnown?.(syntheticMs); } catch { /* consumer error must not break TTS */ }
    });
    const endTimer = setTimeout(() => { try { onEnd(); } catch { /* consumer error must not break TTS */ } }, syntheticMs);
    return { cancel: () => clearTimeout(endTimer) };
  }
  text = addBreathCues(sanitizeForTTS(text));
  const settings = loadTTSSettings();
  let handle: { cancel: () => void };

  // Per-call telemetry — see _tts-telemetry.ts. One `tts_provider_used`
  // PostHog event per spoken utterance captures the full fallback chain
  // so we can see Sarvam→Cartesia→Azure escalation cost in production.
  const attempt = startTtsAttempt({ text, gender });
  const wrapStart = (tier: TtsTier) => () => {
    recordTtsAudioStarted(attempt, tier);
    try { onAudioStarted?.(); } catch { /* consumer error must not break TTS */ }
  };
  const wrapEnd = () => { finalizeTtsAttempt(attempt, "ok"); try { onEnd(); } catch { /* consumer */ } };
  const wrapError = () => { finalizeTtsAttempt(attempt, "error"); try { onError(); } catch { /* consumer */ } };

  // Versioned cancel to prevent stale fallback chains from overwriting current handle
  const gen = ++_ttsGeneration;
  const setCancel = (fn: () => void) => {
    if (gen === _ttsGeneration) _activeCancel = () => { finalizeTtsAttempt(attempt, "cancelled"); fn(); };
  };

  // Azure (3rd-tier) → Browser final fallback.
  // Pass voiceId through so Azure's pickVoice() hashes the same interviewer
  // identity, keeping the voice consistent across a session even when the
  // provider tier changes mid-session.
  const azureFallback = async () => {
    console.warn("Trying Azure TTS fallback");
    recordTtsAttempt(attempt, "azure");
    handle = await speakWithAzure(text, wrapEnd, () => {
      console.warn("Azure TTS also failed, falling back to browser TTS");
      recordTtsAttempt(attempt, "browser");
      const browserHandle = speakWithBrowser(text, wrapEnd, wrapError, wrapStart("browser"), gender);
      handle = browserHandle;
      setCancel(browserHandle.cancel);
    }, gender, voiceId, onDurationKnown, wrapStart("azure"));
    setCancel(handle.cancel);
  };

  // Cartesia (2nd-tier) → Azure → Browser. Tries WS first for low latency,
  // REST as same-tier retry, then escalates to Azure.
  const cartesiaFallback = async () => {
    console.warn("Trying Cartesia TTS fallback");
    // Pin an Indian-English Cartesia voice so the accent doesn't shift
    // jarringly when Sarvam fails over.
    // DEFAULT_VOICE_ID is female — only override it when we find an exact
    // gender match from the dynamic list. Falling back to enInVoices[0]
    // without a gender check caused jarring female→male voice switches
    // when Sarvam failed and Cartesia's first en_IN voice happened to be male.
    // Find a gender-matched Cartesia voice. If none exists for the requested
    // gender, skip Cartesia entirely so Azure (which selects by gender) handles
    // it — playing a known-wrong-gender voice is worse than the next fallback.
    let cartesiaVoice: string | null = null;
    try {
      const enInVoices = await fetchCartesiaVoices("en_IN");
      const genderMatches = gender ? enInVoices.filter(v => v.gender === gender) : enInVoices;
      if (genderMatches.length > 0) {
        // Hash voiceId (the session's seeded Sarvam voice name) to a stable
        // index into the gender-matched pool, so the same interviewer keeps
        // the same Cartesia voice across the whole session instead of
        // everyone landing on genderMatches[0].
        if (voiceId) {
          const hash = voiceId.split("").reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0);
          cartesiaVoice = genderMatches[Math.abs(hash) % genderMatches.length].id;
        } else {
          cartesiaVoice = genderMatches[0].id;
        }
      } else if (!gender) {
        cartesiaVoice = enInVoices[0]?.id || DEFAULT_VOICE_ID;
      }
      // gender specified but no match → cartesiaVoice stays null → skip to Azure
    } catch { cartesiaVoice = DEFAULT_VOICE_ID; /* network error: try with default */ }
    if (cartesiaVoice === null) {
      console.warn("Cartesia TTS fallback: no gender-matched voice, skipping to Azure");
      await azureFallback();
      return;
    }
    const prefetchEntry = _prefetchCache.get(text);
    const hasPrefetch = !!prefetchEntry && Date.now() - prefetchEntry.createdAt < PREFETCH_TTL;
    if (hasPrefetch) {
      recordTtsAttempt(attempt, "cartesia-rest");
      handle = await speakWithProxy(text, cartesiaVoice, wrapEnd, async () => {
        console.warn("Cartesia REST also failed, trying Azure");
        await azureFallback();
      }, undefined, onDurationKnown, wrapStart("cartesia-rest"));
    } else {
      recordTtsAttempt(attempt, "cartesia-ws");
      handle = await speakWithWebSocket(text, cartesiaVoice, wrapEnd, async () => {
        console.warn("Cartesia WS failed, trying REST");
        recordTtsAttempt(attempt, "cartesia-rest");
        handle = await speakWithProxy(text, cartesiaVoice, wrapEnd, async () => {
          console.warn("Cartesia REST also failed, trying Azure");
          await azureFallback();
        }, undefined, onDurationKnown, wrapStart("cartesia-rest"));
        setCancel(handle.cancel);
      }, undefined, onDurationKnown, wrapStart("cartesia-ws"));
    }
    setCancel(handle.cancel);
  };

  if (settings.provider === "browser") {
    recordTtsAttempt(attempt, "browser");
    handle = speakWithBrowser(text, wrapEnd, wrapError, wrapStart("browser"), gender);
  } else {
    // Sarvam primary → Cartesia → Azure → Browser. Each layer escalates
    // on `onError`; `onEnd` short-circuits the chain on success or on
    // autoplay-block (treated as silent success).
    recordTtsAttempt(attempt, "sarvam");
    handle = await speakWithSarvam(text, wrapEnd, async () => {
      console.warn("Sarvam TTS failed, trying Cartesia fallback");
      await cartesiaFallback();
    }, gender, voiceId, onDurationKnown, wrapStart("sarvam"));
  }

  setCancel(handle.cancel);
  // Wrap returned cancel so external callers also finalize as "cancelled".
  const outerCancel = () => { finalizeTtsAttempt(attempt, "cancelled"); handle.cancel(); };
  return { cancel: outerCancel };
}
