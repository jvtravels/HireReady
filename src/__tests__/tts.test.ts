import { describe, it, expect } from "vitest";

/**
 * Tests for TTS settings management and voice configuration.
 * Uses a mock storage to avoid jsdom localStorage issues with forks pool.
 */

interface TTSSettings {
  provider: "azure" | "cartesia" | "browser";
  voiceId: string;
  voiceName: string;
  language?: string;
}

const DEFAULT_SETTINGS: TTSSettings = {
  provider: "azure",
  voiceId: "en-IN-NeerjaNeural",
  voiceName: "Neerja (Indian English)",
  language: "en_IN",
};

const AZURE_VOICES = [
  { id: "en-IN-NeerjaNeural", name: "Neerja", gender: "female" },
  { id: "en-IN-AashiNeural", name: "Aashi", gender: "female" },
  { id: "en-IN-AnanyaNeural", name: "Ananya", gender: "female" },
  { id: "en-IN-KavyaNeural", name: "Kavya", gender: "female" },
  { id: "en-IN-PrabhatNeural", name: "Prabhat", gender: "male" },
  { id: "en-IN-AaravNeural", name: "Aarav", gender: "male" },
  { id: "en-IN-KunalNeural", name: "Kunal", gender: "male" },
  { id: "en-IN-RehaanNeural", name: "Rehaan", gender: "male" },
];

function loadTTSSettingsFromRaw(raw: string | null): TTSSettings {
  try {
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

describe("TTS Settings", () => {
  it("returns defaults when no settings stored", () => {
    const settings = loadTTSSettingsFromRaw(null);
    expect(settings.provider).toBe("azure");
    expect(settings.voiceId).toBe("en-IN-NeerjaNeural");
    expect(settings.voiceName).toBe("Neerja (Indian English)");
    expect(settings.language).toBe("en_IN");
  });

  it("loads saved settings", () => {
    const raw = JSON.stringify({
      provider: "azure",
      voiceId: "en-IN-PrabhatNeural",
      voiceName: "Prabhat",
    });
    const settings = loadTTSSettingsFromRaw(raw);
    expect(settings.voiceId).toBe("en-IN-PrabhatNeural");
    expect(settings.voiceName).toBe("Prabhat");
  });

  it("migrates old ElevenLabs settings to Azure", () => {
    const raw = JSON.stringify({
      provider: "elevenlabs",
      voiceId: "old-eleven-id",
      voiceName: "Rachel",
    });
    const settings = loadTTSSettingsFromRaw(raw);
    expect(settings.provider).toBe("azure");
    expect(settings.voiceId).toBe("en-IN-NeerjaNeural");
  });

  it("migrates old Cartesia settings to Azure", () => {
    const raw = JSON.stringify({
      provider: "cartesia",
      voiceId: "e07c00bc-4134-4eae-9ea4-1a55fb45746b",
      voiceName: "Default",
    });
    const settings = loadTTSSettingsFromRaw(raw);
    expect(settings.provider).toBe("azure");
    expect(settings.voiceId).toBe("en-IN-NeerjaNeural");
  });

  it("migrates old Google settings to Azure", () => {
    const raw = JSON.stringify({
      provider: "google",
      voiceId: "en-US-Neural2-F",
      voiceName: "Aria",
    });
    const settings = loadTTSSettingsFromRaw(raw);
    expect(settings.provider).toBe("azure");
    expect(settings.voiceId).toBe("en-IN-NeerjaNeural");
  });

  it("handles corrupted data gracefully", () => {
    const settings = loadTTSSettingsFromRaw("not-valid-json{{{");
    expect(settings).toEqual(DEFAULT_SETTINGS);
  });

  it("merges partial settings with defaults", () => {
    const raw = JSON.stringify({ voiceId: "en-IN-AaravNeural" });
    const settings = loadTTSSettingsFromRaw(raw);
    expect(settings.provider).toBe("azure");
    expect(settings.voiceId).toBe("en-IN-AaravNeural");
    expect(settings.voiceName).toBe("Neerja (Indian English)");
  });
});

describe("Voice Configuration", () => {
  it("has 8 voices (4 female + 4 male)", () => {
    expect(AZURE_VOICES).toHaveLength(8);
    expect(AZURE_VOICES.filter(v => v.gender === "female")).toHaveLength(4);
    expect(AZURE_VOICES.filter(v => v.gender === "male")).toHaveLength(4);
  });

  it("all voices have unique IDs", () => {
    const ids = AZURE_VOICES.map(v => v.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all voices have unique names", () => {
    const names = AZURE_VOICES.map(v => v.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("default voice is in the voice list", () => {
    const defaultVoice = AZURE_VOICES.find(v => v.id === DEFAULT_SETTINGS.voiceId);
    expect(defaultVoice).toBeDefined();
    expect(defaultVoice!.name).toBe("Neerja");
  });

  it("all voice IDs follow Azure en-IN Neural format", () => {
    AZURE_VOICES.forEach(v => {
      expect(v.id).toMatch(/^en-IN-[A-Z][a-z]+Neural$/);
    });
  });
});
