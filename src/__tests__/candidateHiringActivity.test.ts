import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

const withAuthAndRateLimit = vi.fn();
const slogError = vi.fn();

vi.mock("../../server-handlers/_shared", () => ({
  withAuthAndRateLimit: (...args: unknown[]) => withAuthAndRateLimit(...args),
  corsHeaders: () => ({}),
  withRequestId: (h: Record<string, string>) => h,
  slog: { error: (...args: unknown[]) => slogError(...args) },
}));

const { default: handler } = await import("../../server-handlers/candidate-hiring-activity");

function req() {
  return new Request("https://x.test/api/candidate-hiring-activity", { method: "GET" });
}

beforeEach(() => {
  vi.restoreAllMocks();
  withAuthAndRateLimit.mockResolvedValue({ auth: { userId: "u1" }, headers: {} });
});

describe("candidate-hiring-activity handler", () => {
  it("returns 401 when unauthenticated", async () => {
    withAuthAndRateLimit.mockResolvedValue({ auth: { userId: null }, headers: {} });
    const res = await handler(req());
    expect(res.status).toBe(401);
  });

  it("short-circuits with discoverable:false without querying matches", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ is_discoverable_to_employers: false }],
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const res = await handler(req());
    const body = await res.json();
    expect(body).toEqual({ discoverable: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns shortlisted/unlocked counts and recent matches, excluding closed non-unlocked ones", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [{ is_discoverable_to_employers: true }] })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            id: "m1",
            unlocked: true,
            unlocked_at: "2026-08-01T00:00:00Z",
            match_score: 90,
            created_at: "2026-07-01T00:00:00Z",
            employer_requirements: {
              title: "Backend Engineer",
              location: "Bengaluru",
              status: "closed",
              work_mode: "hybrid",
              budget_min: 12,
              budget_max: 18,
              experience_min: 2,
              experience_max: 4,
              skills: ["Node.js"],
              employers: { company_name: "Acme" },
            },
          },
          {
            id: "m2",
            unlocked: false,
            unlocked_at: null,
            match_score: 70,
            created_at: "2026-07-02T00:00:00Z",
            employer_requirements: {
              title: "SDE II",
              location: "Remote",
              status: "closed",
              work_mode: "remote",
              budget_min: null,
              budget_max: null,
              experience_min: null,
              experience_max: null,
              skills: null,
              employers: null,
            },
          },
          {
            id: "m3",
            unlocked: false,
            unlocked_at: null,
            match_score: 55,
            created_at: "2026-07-03T00:00:00Z",
            employer_requirements: {
              title: "Frontend Engineer",
              location: "Pune",
              status: "ready",
              work_mode: null,
              budget_min: null,
              budget_max: null,
              experience_min: null,
              experience_max: null,
              skills: [],
              employers: { company_name: "Beta" },
            },
          },
        ],
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    const res = await handler(req());
    const body = await res.json();

    expect(body.discoverable).toBe(true);
    // m1 (unlocked, closed) counts; m2 (not unlocked, closed) is dropped; m3 (ready) counts.
    expect(body.shortlistedCount).toBe(2);
    expect(body.unlockedCount).toBe(1);
    expect(body.recent.map((r: { roleTitle: string }) => r.roleTitle)).toEqual([
      "Backend Engineer",
      "Frontend Engineer",
    ]);
    expect(body.recent[0].companyName).toBe("Acme");
    expect(body.recent[0].unlockedAt).toBe("2026-08-01");
  });

  it("returns 500 and logs when the profile read fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;
    const res = await handler(req());
    expect(res.status).toBe(500);
    expect(slogError).toHaveBeenCalled();
  });
});
