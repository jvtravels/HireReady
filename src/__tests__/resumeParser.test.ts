import { describe, it, expect } from "vitest";
import { extractResumeText, parseResumeData } from "../resumeParser";

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

describe("parseResumeData", () => {
  it("extracts name from first line", () => {
    const result = parseResumeData("John Smith\nSoftware Engineer\nExperience:\n- Built APIs");
    expect(result.name).toBe("John Smith");
  });

  it("extracts email address", () => {
    const result = parseResumeData("John Smith\njohn@example.com\nExperience");
    expect(result.email).toBe("john@example.com");
  });

  it("extracts phone number", () => {
    const result = parseResumeData("Jane Doe\n555-123-4567\nExperience");
    expect(result.phone).toBe("555-123-4567");
  });

  it("extracts skills from skills section", () => {
    const text = "John Smith\n\nSkills:\nJavaScript, Python, React, Node.js\n\nExperience:";
    const result = parseResumeData(text);
    expect(result.skills.length).toBeGreaterThan(0);
    expect(result.skills).toContain("JavaScript");
  });

  it("handles empty resume text", () => {
    const result = parseResumeData("");
    expect(result.name).toBe("");
    expect(result.skills).toEqual([]);
    expect(result.experience).toEqual([]);
  });

  it("extracts experience and education entries", () => {
    const text = `Jane Doe
jane@test.com

Experience:
Software Engineer at Google
- Built distributed systems
- Led team of 5 engineers

Education:
BS Computer Science, Stanford University`;
    const result = parseResumeData(text);
    expect(result.experience.length).toBeGreaterThan(0);
    expect(result.education.length).toBeGreaterThan(0);
  });
});
