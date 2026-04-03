/* ─── Text-to-Speech Service ─── */
/* Uses server-side Google Cloud TTS proxy (free for users) with Web Speech API fallback */

const TTS_SETTINGS_KEY = "hireready_tts";

export interface TTSSettings {
  provider: "google" | "browser";
  voiceId: string;
  voiceName: string;
}

export const GOOGLE_VOICES = [
  { id: "en-US-Neural2-F", name: "Aria", desc: "Warm, professional female — great for interviews", gender: "female" },
  { id: "en-US-Neural2-C", name: "Claire", desc: "Calm, composed female", gender: "female" },
  { id: "en-US-Neural2-H", name: "Harper", desc: "Friendly, clear female", gender: "female" },
  { id: "en-US-Neural2-E", name: "Evelyn", desc: "Soft, approachable female", gender: "female" },
  { id: "en-US-Neural2-D", name: "James", desc: "Clear, neutral male — natural interviewer", gender: "male" },
  { id: "en-US-Neural2-A", name: "Marcus", desc: "Deep, authoritative male", gender: "male" },
  { id: "en-US-Neural2-I", name: "Nathan", desc: "Conversational, warm male", gender: "male" },
  { id: "en-US-Neural2-J", name: "Oliver", desc: "Professional, measured male", gender: "male" },
];

const DEFAULT_SETTINGS: TTSSettings = {
  provider: "google",
  voiceId: "en-US-Neural2-F", // Aria
  voiceName: "Aria",
};

export function loadTTSSettings(): TTSSettings {
  try {
    const raw = localStorage.getItem(TTS_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Migrate old ElevenLabs settings to Google
      if (parsed.provider === "elevenlabs") {
        parsed.provider = "google";
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

/* ─── Google Cloud TTS via Server Proxy ─── */
async function speakWithProxy(
  text: string,
  voiceId: string,
  onEnd: () => void,
  onError: () => void,
): Promise<{ cancel: () => void }> {
  const controller = new AbortController();
  let audio: HTMLAudioElement | null = null;

  try {
    // Dynamically import to avoid circular deps
    const { authHeaders } = await import("./supabase");
    const headers = await authHeaders();
    const res = await fetch("/api/tts", {
      method: "POST",
      headers,
      body: JSON.stringify({ text, voiceName: voiceId }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.warn("TTS proxy error:", res.status);
      onError();
      return { cancel: () => {} };
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    audio = new Audio(url);
    audio.onended = () => {
      URL.revokeObjectURL(url);
      onEnd();
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      onError();
    };
    audio.play();
  } catch (err: any) {
    if (err.name !== "AbortError") {
      console.warn("TTS proxy failed:", err);
      onError();
    }
    return { cancel: () => {} };
  }

  return {
    cancel: () => {
      controller.abort();
      if (audio) {
        audio.pause();
        audio.src = "";
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
  utter.onerror = onError;
  window.speechSynthesis.speak(utter);

  return {
    cancel: () => window.speechSynthesis.cancel(),
  };
}

/* ─── Unified speak function ─── */
export async function speak(
  text: string,
  onEnd: () => void,
  onError: () => void,
): Promise<{ cancel: () => void }> {
  const settings = loadTTSSettings();

  if (settings.provider === "google") {
    // Try proxy first; if it fails, fall back to browser TTS
    return speakWithProxy(text, settings.voiceId, onEnd, () => {
      console.warn("Google TTS proxy failed, falling back to browser TTS");
      speakWithBrowser(text, onEnd, onError);
    });
  }

  return speakWithBrowser(text, onEnd, onError);
}
