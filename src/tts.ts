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

/* ─── Cartesia TTS via Server Proxy ─── */
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
      console.log("[TTS] starting fetch...");
      const { authHeaders } = await import("./supabase");
      const headers = await authHeaders();

      const res = await fetch("/api/tts", {
        method: "POST",
        headers,
        body: JSON.stringify({ text, voiceId }),
        signal: controller.signal,
      });
      console.log("[TTS] fetch done, status:", res.status);

      if (!res.ok) {
        settle(onError);
        return { cancel: () => {} };
      }

      blob = await res.blob();
    }

    console.log("[TTS] blob ready, size:", blob.size, "type:", blob.type);

    const url = URL.createObjectURL(blob);
    audio = new Audio(url);

    audio.onended = () => {
      console.log("[TTS] playback ended");
      URL.revokeObjectURL(url);
      settle(onEnd);
    };
    audio.onerror = () => {
      console.warn("[TTS] audio element error");
      URL.revokeObjectURL(url);
      settle(onError);
    };

    await audio.play();
    console.log("[TTS] playing");
  } catch (err: any) {
    if (err.name === "AbortError") {
      console.log("[TTS] aborted");
      return { cancel: () => {} };
    }
    console.warn("[TTS] error:", err?.message || err);
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
    return speakWithProxy(text, settings.voiceId, onEnd, () => {
      console.warn("Cartesia TTS proxy failed, falling back to browser TTS");
      speakWithBrowser(text, onEnd, onError);
    });
  }

  return speakWithBrowser(text, onEnd, onError);
}
