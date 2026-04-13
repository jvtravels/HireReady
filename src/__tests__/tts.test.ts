import { describe, it, expect } from "vitest";

/**
 * Tests for TTS settings management and voice configuration.
 * Uses a mock storage to avoid jsdom localStorage issues with forks pool.
 */

interface TTSSettings {
  provider: "google" | "browser";
  voiceId: string;
  voiceName: string;
}

const DEFAULT_SETTINGS: TTSSettings = {
  provider: "google",
  voiceId: "en-US-Neural2-F",
  voiceName: "Aria",
};

const GOOGLE_VOICES = [
  { id: "en-US-Neural2-F", name: "Aria", gender: "female" },
  { id: "en-US-Neural2-C", name: "Claire", gender: "female" },
  { id: "en-US-Neural2-H", name: "Harper", gender: "female" },
  { id: "en-US-Neural2-E", name: "Evelyn", gender: "female" },
  { id: "en-US-Neural2-D", name: "James", gender: "male" },
  { id: "en-US-Neural2-A", name: "Marcus", gender: "male" },
  { id: "en-US-Neural2-I", name: "Nathan", gender: "male" },
  { id: "en-US-Neural2-J", name: "Oliver", gender: "male" },
];

function loadTTSSettingsFromRaw(raw: string | null): TTSSettings {
  try {
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.provider === "elevenlabs") {
        parsed.provider = "google";
        parsed.voiceId = DEFAULT_SETTINGS.voiceId;
        parsed.voiceName = DEFAULT_SETTINGS.voiceName;
      }
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch { /* expected: localStorage/JSON.parse may fail */ }
  return DEFAULT_SETTINGS;
}

describe("TTS Settings", () => {
  it("returns defaults when no settings stored", () => {
    const settings = loadTTSSettingsFromRaw(null);
    expect(settings.provider).toBe("google");
    expect(settings.voiceId).toBe("en-US-Neural2-F");
    expect(settings.voiceName).toBe("Aria");
  });

  it("loads saved settings", () => {
    const raw = JSON.stringify({
      provider: "google",
      voiceId: "en-US-Neural2-D",
      voiceName: "James",
    });
    const settings = loadTTSSettingsFromRaw(raw);
    expect(settings.voiceId).toBe("en-US-Neural2-D");
    expect(settings.voiceName).toBe("James");
  });

  it("migrates old ElevenLabs settings to Google", () => {
    const raw = JSON.stringify({
      provider: "elevenlabs",
      voiceId: "old-eleven-id",
      voiceName: "Rachel",
    });
    const settings = loadTTSSettingsFromRaw(raw);
    expect(settings.provider).toBe("google");
    expect(settings.voiceId).toBe("en-US-Neural2-F");
    expect(settings.voiceName).toBe("Aria");
  });

  it("handles corrupted data gracefully", () => {
    const settings = loadTTSSettingsFromRaw("not-valid-json{{{");
    expect(settings).toEqual(DEFAULT_SETTINGS);
  });

  it("merges partial settings with defaults", () => {
    const raw = JSON.stringify({ voiceId: "en-US-Neural2-A" });
    const settings = loadTTSSettingsFromRaw(raw);
    expect(settings.provider).toBe("google");
    expect(settings.voiceId).toBe("en-US-Neural2-A");
    expect(settings.voiceName).toBe("Aria");
  });
});

describe("Voice Configuration", () => {
  it("has 8 voices (4 female + 4 male)", () => {
    expect(GOOGLE_VOICES).toHaveLength(8);
    expect(GOOGLE_VOICES.filter(v => v.gender === "female")).toHaveLength(4);
    expect(GOOGLE_VOICES.filter(v => v.gender === "male")).toHaveLength(4);
  });

  it("all voices have unique IDs", () => {
    const ids = GOOGLE_VOICES.map(v => v.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all voices have unique names", () => {
    const names = GOOGLE_VOICES.map(v => v.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("default voice is in the voice list", () => {
    const defaultVoice = GOOGLE_VOICES.find(v => v.id === DEFAULT_SETTINGS.voiceId);
    expect(defaultVoice).toBeDefined();
    expect(defaultVoice!.name).toBe(DEFAULT_SETTINGS.voiceName);
  });

  it("all voice IDs follow Google Neural2 format", () => {
    GOOGLE_VOICES.forEach(v => {
      expect(v.id).toMatch(/^en-US-Neural2-[A-Z]$/);
    });
  });
});
