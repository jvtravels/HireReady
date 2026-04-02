import { describe, it, expect } from "vitest";
import { extractResumeText } from "../resumeParser";

function makeFile(content: string, name: string, type = "text/plain"): File {
  return new File([content], name, { type });
}

describe("extractResumeText", () => {
  it("extracts text from a .txt file", async () => {
    const file = makeFile("John Doe\nSoftware Engineer\n5 years experience", "resume.txt");
    const text = await extractResumeText(file);
    expect(text).toContain("John Doe");
    expect(text).toContain("Software Engineer");
  });

  it("cleans up excessive whitespace", async () => {
    const file = makeFile("Hello   World\n\n\n\nNext line", "resume.txt");
    const text = await extractResumeText(file);
    expect(text).toBe("Hello World\n\nNext line");
  });

  it("caps text at 5000 characters", async () => {
    const longText = "A".repeat(6000);
    const file = makeFile(longText, "resume.txt");
    const text = await extractResumeText(file);
    expect(text.length).toBe(5000);
  });

  it("rejects unsupported file types", async () => {
    const file = makeFile("data", "resume.png", "image/png");
    await expect(extractResumeText(file)).rejects.toThrow("Unsupported file type");
  });

  it("handles empty .txt files", async () => {
    const file = makeFile("", "empty.txt");
    const text = await extractResumeText(file);
    expect(text).toBe("");
  });
});
