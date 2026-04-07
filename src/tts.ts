/* ─── Text-to-Speech Service ─── */
/* Uses server-side Cartesia TTS proxy (ultra-low latency) with Web Speech API fallback */

const TTS_SETTINGS_KEY = "hirloop_tts";

export interface TTSSettings {
  provider: "cartesia" | "browser";
  voiceId: string;
  voiceName: string;
}

export const CARTESIA_VOICES = [
  { id: "79a125e8-cd45-4c13-8a67-188112f4dd22", name: "Aria", desc: "Warm, professional female — great for interviews", gender: "female" },
  { id: "b7d50908-b17c-442d-ad8d-810c63997ed9", name: "Claire", desc: "Calm, composed female", gender: "female" },
  { id: "a0e99841-438c-4a64-b679-ae501e7d6091", name: "Harper", desc: "Friendly, clear female", gender: "female" },
  { id: "694f9389-aac1-45b6-b726-9d9369183238", name: "Evelyn", desc: "Soft, approachable female", gender: "female" },
  { id: "ee7ea9f8-c0c1-498c-9f62-dc2da49a6f98", name: "James", desc: "Clear, neutral male — natural interviewer", gender: "male" },
  { id: "fb26447f-308b-471e-8b00-4ef9e4c4ebe6", name: "Marcus", desc: "Deep, authoritative male", gender: "male" },
  { id: "63ff761f-c1e8-414b-b969-a1cb9a4e1313", name: "Nathan", desc: "Conversational, warm male", gender: "male" },
  { id: "820a3788-2b37-46b6-9571-9d2054466c5b", name: "Oliver", desc: "Professional, measured male", gender: "male" },
];

const DEFAULT_SETTINGS: TTSSettings = {
  provider: "cartesia",
  voiceId: "79a125e8-cd45-4c13-8a67-188112f4dd22", // Aria
  voiceName: "Aria",
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

/* ─── Cartesia TTS via Server Proxy ─── */
async function speakWithProxy(
  text: string,
  voiceId: string,
  onEnd: () => void,
  onError: () => void,
): Promise<{ cancel: () => void }> {
  const controller = new AbortController();
  let audio: HTMLAudioElement | null = null;

  try {
    const { authHeaders } = await import("./supabase");
    const headers = await authHeaders();
    const res = await fetch("/api/tts", {
      method: "POST",
      headers,
      body: JSON.stringify({ text, voiceId }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.warn("TTS proxy error:", res.status);
      onError();
      return { cancel: () => {} };
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    let revoked = false;
    const revokeUrl = () => { if (!revoked) { revoked = true; URL.revokeObjectURL(url); } };
    audio = new Audio(url);
    audio.onended = () => { revokeUrl(); onEnd(); };
    audio.onerror = () => { revokeUrl(); onError(); };
    audio.play().catch(() => {
      revokeUrl();
      onError();
    });
  } catch (err: any) {
    if (err.name !== "AbortError") {
      console.warn("TTS proxy failed:", err);
      onError();
    }
    return { cancel: () => {} };
  }

  const capturedAudio = audio;
  return {
    cancel: () => {
      controller.abort();
      if (capturedAudio) {
        capturedAudio.pause();
        capturedAudio.onended = null;
        capturedAudio.onerror = null;
        capturedAudio.src = "";
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
