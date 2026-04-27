import { describe, it, expect, vi } from "vitest";
import {
  normalizeResumeText,
  computeResumeTextHash,
  findCachedResumeVersion,
  persistResumeVersion,
  resolveActiveResumeVersionId,
} from "../../server-handlers/_resume-versioning";

/**
 * Resume v2 — coverage for the hash dedup + version persistence logic
 * extracted from analyze-resume + save-session. The cache-hit path is
 * the highest-leverage piece (cuts LLM cost on re-uploads), so test
 * the hashing + lookup with the most edge cases.
 */

const SUPABASE_URL = "https://test.supabase.co";
const SERVICE_KEY = "service-key";

function ok(body: unknown = {}, status = 200): Response {
  return { ok: true, status, json: async () => body, text: async () => JSON.stringify(body) } as Response;
}
function notOk(status = 500, body: unknown = { error: "x" }): Response {
  return { ok: false, status, json: async () => body, text: async () => JSON.stringify(body) } as Response;
}

describe("normalizeResumeText", () => {
  it("collapses tab/space runs to a single space", () => {
    expect(normalizeResumeText("hello   \t  world")).toBe("hello world");
  });

  it("converts CRLF and CR to LF", () => {
    expect(normalizeResumeText("a\r\nb\rc")).toBe("a\nb\nc");
  });

  it("collapses 3+ blank lines to two", () => {
    expect(normalizeResumeText("a\n\n\n\nb")).toBe("a\n\nb");
  });

  it("lowercases — case-only changes shouldn't trigger fresh LLM calls", () => {
    expect(normalizeResumeText("Hello World")).toBe("hello world");
  });

  it("Unicode normalization (NFC) — composed vs decomposed forms collide", () => {
    // "é" can be a single codepoint or e + combining acute. After NFC
    // both produce the same byte sequence so the hash matches.
    const composed = "café";
    const decomposed = "cafe\u0301";
    expect(normalizeResumeText(composed)).toBe(normalizeResumeText(decomposed));
  });

  it("returns empty string for empty / null-ish input", () => {
    expect(normalizeResumeText("")).toBe("");
    expect(normalizeResumeText("   \n\n  ")).toBe("");
  });
});

describe("computeResumeTextHash", () => {
  it("returns 64-char lowercase hex", async () => {
    const h = await computeResumeTextHash("hello world");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("identical inputs produce identical hashes", async () => {
    const a = await computeResumeTextHash("Senior Engineer at Acme");
    const b = await computeResumeTextHash("Senior Engineer at Acme");
    expect(a).toBe(b);
  });

  it("different inputs produce different hashes", async () => {
    const a = await computeResumeTextHash("alpha");
    const b = await computeResumeTextHash("beta");
    expect(a).not.toBe(b);
  });

  it("CRLF vs LF line endings produce identical hashes", async () => {
    // Common case — same resume saved on Windows vs Mac shouldn't
    // bust the cache.
    const lf = "Hello World\nLine 2\nLine 3";
    const crlf = "Hello World\r\nLine 2\r\nLine 3";
    expect(await computeResumeTextHash(lf)).toBe(await computeResumeTextHash(crlf));
  });

  it("case-only changes produce identical hashes", async () => {
    expect(await computeResumeTextHash("Senior Engineer")).toBe(await computeResumeTextHash("SENIOR ENGINEER"));
  });

  it("internal whitespace runs collapse to single space", async () => {
    expect(await computeResumeTextHash("Hello   World")).toBe(await computeResumeTextHash("Hello World"));
    expect(await computeResumeTextHash("Hello\tWorld")).toBe(await computeResumeTextHash("Hello World"));
  });

  it("4+ blank lines collapse to two (paragraph spacing tolerance)", async () => {
    const a = "para 1\n\nparagraph 2";
    const b = "para 1\n\n\n\n\nparagraph 2";
    expect(await computeResumeTextHash(a)).toBe(await computeResumeTextHash(b));
  });

  it("BUT a different paragraph break (1 line vs 2 lines) is a meaningful change", async () => {
    // Adding a section break IS semantic — should be a different hash.
    // Documenting the boundary so a future tweak doesn't blur sections.
    const a = "para 1\nparagraph 2";
    const b = "para 1\n\nparagraph 2";
    expect(await computeResumeTextHash(a)).not.toBe(await computeResumeTextHash(b));
  });

  it("genuinely different content produces different hashes (cache-MISS guard)", async () => {
    const a = "Skills: React, TypeScript, Node";
    const b = "Skills: React, TypeScript, Node, Postgres"; // one new skill
    expect(await computeResumeTextHash(a)).not.toBe(await computeResumeTextHash(b));
  });
});

describe("findCachedResumeVersion", () => {
  it("returns null when env config is missing", async () => {
    const result = await findCachedResumeVersion("", "", "user-1", "abc");
    expect(result).toBe(null);
  });

  it("returns null on HTTP failure (graceful degrade)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(notOk(500));
    const result = await findCachedResumeVersion(SUPABASE_URL, SERVICE_KEY, "user-1", "h", fetchMock as unknown as typeof fetch);
    expect(result).toBe(null);
  });

  it("returns null when no row matches the hash", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok([]));
    const result = await findCachedResumeVersion(SUPABASE_URL, SERVICE_KEY, "user-1", "h", fetchMock as unknown as typeof fetch);
    expect(result).toBe(null);
  });

  it("returns the cached row when text_hash matches", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok([{
      id: "ver-1",
      resume_id: "res-1",
      version_number: 2,
      text_hash: "abc",
      parsed_data: { headline: "Senior PM" },
      parse_source: "ai",
      is_latest: true,
      created_at: "2026-04-01T00:00:00Z",
    }]));
    const result = await findCachedResumeVersion(SUPABASE_URL, SERVICE_KEY, "user-1", "abc", fetchMock as unknown as typeof fetch);
    expect(result?.id).toBe("ver-1");
    expect(result?.parsed_data).toEqual({ headline: "Senior PM" });
  });

  it("filters by user_id via inner-join (no cross-user leakage)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok([]));
    await findCachedResumeVersion(SUPABASE_URL, SERVICE_KEY, "user-1", "abc", fetchMock as unknown as typeof fetch);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("text_hash=eq.abc");
    expect(url).toContain("resumes.user_id=eq.user-1");
    expect(url).toContain("resumes!inner");
  });

  it("URL-encodes user-supplied parameters (defence-in-depth)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok([]));
    await findCachedResumeVersion(SUPABASE_URL, SERVICE_KEY, "user with space", "ab/c", fetchMock as unknown as typeof fetch);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("ab%2Fc");
    expect(url).toContain("user%20with%20space");
  });
});

describe("persistResumeVersion", () => {
  it("creates resume row + v1 when no existing resume for the (user, domain)", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(ok([])) // findRes — no resume yet
      .mockResolvedValueOnce(ok([{ id: "res-new" }])) // createRes
      .mockResolvedValueOnce(ok([])) // numRes — no versions yet
      .mockResolvedValueOnce(ok([{ id: "ver-new" }])) // insertRes
      .mockResolvedValueOnce(ok({})); // active_version_id update

    const result = await persistResumeVersion(SUPABASE_URL, SERVICE_KEY, {
      userId: "user-1",
      domain: "pm",
      textHash: "h",
      resumeText: "...",
      parsedData: { headline: "PM" },
      parseSource: "ai",
    }, fetchMock as unknown as typeof fetch);

    expect(result).toEqual({ resumeId: "res-new", versionId: "ver-new", versionNumber: 1 });
  });

  it("reuses existing resume + bumps version_number on subsequent uploads", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(ok([{ id: "res-1" }])) // findRes — exists
      .mockResolvedValueOnce(ok([{ version_number: 2 }])) // numRes — last was v2
      .mockResolvedValueOnce(ok({})) // PATCH is_latest=false
      .mockResolvedValueOnce(ok([{ id: "ver-3" }])) // insertRes
      .mockResolvedValueOnce(ok({})); // active_version_id update

    const result = await persistResumeVersion(SUPABASE_URL, SERVICE_KEY, {
      userId: "user-1",
      domain: "pm",
      textHash: "h",
      resumeText: "...",
      parsedData: {},
      parseSource: "ai",
    }, fetchMock as unknown as typeof fetch);

    expect(result?.versionNumber).toBe(3);
    expect(result?.versionId).toBe("ver-3");

    // Verify the is_latest flip targets only this resume's prior versions
    const flipCall = fetchMock.mock.calls[2];
    expect(flipCall[0]).toContain("resume_versions");
    expect(flipCall[0]).toContain("resume_id=eq.res-1");
    expect(flipCall[0]).toContain("is_latest=eq.true");
    expect(flipCall[1].method).toBe("PATCH");
    expect(JSON.parse(flipCall[1].body)).toEqual({ is_latest: false });
  });

  it("skips the is_latest flip on first version (nothing to flip)", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(ok([{ id: "res-1" }]))
      .mockResolvedValueOnce(ok([])) // no versions → nextNumber stays 1
      .mockResolvedValueOnce(ok([{ id: "ver-1" }]))
      .mockResolvedValueOnce(ok({}));

    const result = await persistResumeVersion(SUPABASE_URL, SERVICE_KEY, {
      userId: "user-1", domain: "pm", textHash: "h", resumeText: "...", parsedData: {}, parseSource: "ai",
    }, fetchMock as unknown as typeof fetch);

    expect(result?.versionNumber).toBe(1);
    // 4 calls total, no PATCH for is_latest
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls.every(call => !((call[1] as { method?: string })?.method === "PATCH" && (call[0] as string).includes("is_latest")))).toBe(true);
  });

  it("returns null when resume row creation fails", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(ok([])) // no existing resume
      .mockResolvedValueOnce(notOk(500)); // create fails

    const result = await persistResumeVersion(SUPABASE_URL, SERVICE_KEY, {
      userId: "u", domain: "pm", textHash: "h", resumeText: "...", parsedData: {}, parseSource: "ai",
    }, fetchMock as unknown as typeof fetch);
    expect(result).toBe(null);
  });

  it("returns null on missing config", async () => {
    expect(await persistResumeVersion("", "", { userId: "u", domain: "pm", textHash: "h", resumeText: "...", parsedData: {}, parseSource: "ai" })).toBe(null);
  });

  it("caps resume_text at 50,000 chars before insert", async () => {
    const huge = "x".repeat(80_000);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(ok([{ id: "res-1" }]))
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok([{ id: "ver-1" }]))
      .mockResolvedValueOnce(ok({}));

    await persistResumeVersion(SUPABASE_URL, SERVICE_KEY, {
      userId: "u", domain: "pm", textHash: "h", resumeText: huge, parsedData: {}, parseSource: "ai",
    }, fetchMock as unknown as typeof fetch);

    // The insert call is the third one in this branch (no flip → 4 total)
    const insertCall = fetchMock.mock.calls[2];
    const body = JSON.parse(insertCall[1].body);
    expect(body[0].resume_text.length).toBe(50_000);
  });
});

describe("resolveActiveResumeVersionId", () => {
  it("returns null when env / userId missing", async () => {
    expect(await resolveActiveResumeVersionId("", "", "u")).toBe(null);
    expect(await resolveActiveResumeVersionId(SUPABASE_URL, SERVICE_KEY, "")).toBe(null);
  });

  it("returns the active_version_id when found for the requested domain", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(ok([{ active_version_id: "ver-active" }]));
    const result = await resolveActiveResumeVersionId(SUPABASE_URL, SERVICE_KEY, "u", "pm", fetchMock as unknown as typeof fetch);
    expect(result).toBe("ver-active");
  });

  it("falls back to non-domain-specific resume if domain-tagged one is missing", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(ok([])) // no PM-tagged resume
      .mockResolvedValueOnce(ok([{ active_version_id: "ver-general" }])); // any active resume

    const result = await resolveActiveResumeVersionId(SUPABASE_URL, SERVICE_KEY, "u", "pm", fetchMock as unknown as typeof fetch);
    expect(result).toBe("ver-general");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Second call has no domain filter
    expect(fetchMock.mock.calls[1][0]).not.toContain("domain=");
  });

  it("returns null when user has no resume at all", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok([]));
    const result = await resolveActiveResumeVersionId(SUPABASE_URL, SERVICE_KEY, "u", undefined, fetchMock as unknown as typeof fetch);
    expect(result).toBe(null);
  });

  it("filters out archived resumes", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok([]));
    await resolveActiveResumeVersionId(SUPABASE_URL, SERVICE_KEY, "u", "pm", fetchMock as unknown as typeof fetch);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("is_archived=eq.false");
  });

  it("URL-encodes the user id and domain", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok([]));
    await resolveActiveResumeVersionId(SUPABASE_URL, SERVICE_KEY, "user with space", "p&m", fetchMock as unknown as typeof fetch);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("user%20with%20space");
    expect(url).toContain("p%26m");
  });

  it("graceful degrade on fetch error (returns null, doesn't throw)", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network"));
    const result = await resolveActiveResumeVersionId(SUPABASE_URL, SERVICE_KEY, "u", undefined, fetchMock as unknown as typeof fetch);
    expect(result).toBe(null);
  });
});
