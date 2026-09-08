import { describe, it, expect } from "vitest";
import { browserVoiceGender } from "../tts";

describe("browserVoiceGender", () => {
  it("recognizes common female vendor voice names", () => {
    expect(browserVoiceGender("Samantha")).toBe("female");
    expect(browserVoiceGender("Microsoft Zira Desktop")).toBe("female");
    expect(browserVoiceGender("Google UK English Female")).toBe("female");
    expect(browserVoiceGender("Veena")).toBe("female");
    expect(browserVoiceGender("Karen")).toBe("female");
    expect(browserVoiceGender("Victoria")).toBe("female");
    expect(browserVoiceGender("Moira")).toBe("female");
    expect(browserVoiceGender("Tessa")).toBe("female");
    expect(browserVoiceGender("Fiona")).toBe("female");
  });

  it("recognizes common male vendor voice names", () => {
    expect(browserVoiceGender("Daniel")).toBe("male");
    expect(browserVoiceGender("Rishi")).toBe("male");
    expect(browserVoiceGender("Microsoft David Desktop")).toBe("male");
    expect(browserVoiceGender("Alex")).toBe("male");
    expect(browserVoiceGender("Fred")).toBe("male");
    expect(browserVoiceGender("Aaron")).toBe("male");
    expect(browserVoiceGender("Arthur")).toBe("male");
    expect(browserVoiceGender("Google UK English Male")).toBe("male");
  });

  it("is case-insensitive", () => {
    expect(browserVoiceGender("SAMANTHA")).toBe("female");
    expect(browserVoiceGender("daniel")).toBe("male");
  });

  it("returns undefined for names with no recognizable gender hint", () => {
    expect(browserVoiceGender("Google 中文")).toBeUndefined();
    expect(browserVoiceGender("en-IN-Standard-A")).toBeUndefined();
    expect(browserVoiceGender("")).toBeUndefined();
  });
});
