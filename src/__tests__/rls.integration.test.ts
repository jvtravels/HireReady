import { describe, it, expect, beforeAll, afterAll } from "vitest";

/**
 * RLS integration tests — run against a real Supabase instance.
 *
 * These tests verify that Row-Level Security policies declared in
 * supabase-schema.sql actually block cross-user access at the DB layer.
 * A regression here means any authenticated user can read or write another
 * user's data by calling the REST API directly (bypassing client code).
 *
 * Setup — opt-in. These tests only run when all three env vars are set:
 *   TEST_SUPABASE_URL=https://<your-test-project>.supabase.co
 *   TEST_SUPABASE_ANON_KEY=<anon key of the test project>
 *   TEST_SUPABASE_SERVICE_ROLE_KEY=<service role key of the test project>
 *
 * Without these, `describe.skipIf(...)` skips the whole suite — local dev
 * stays fast, and the default CI run doesn't need a database. To enable
 * in CI, set the three secrets on a dedicated branch or workflow.
 *
 * IMPORTANT: point at a dedicated test project, not production. These
 * tests create ephemeral users and sessions in the cleanup step but
 * service-role mistakes could damage live data.
 */

const SUPABASE_URL = process.env.TEST_SUPABASE_URL || "";
const ANON_KEY = process.env.TEST_SUPABASE_ANON_KEY || "";
const SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY || "";
const RLS_ENABLED = Boolean(SUPABASE_URL && ANON_KEY && SERVICE_KEY);

async function signUpUser(email: string, password: string): Promise<{ userId: string; accessToken: string }> {
  const signupRes = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON_KEY },
    body: JSON.stringify({ email, password, data: { custom_email_verified: true } }),
  });
  if (!signupRes.ok) {
    const errText = await signupRes.text();
    throw new Error(`signUp failed: ${signupRes.status} ${errText}`);
  }
  const { user, session } = await signupRes.json();
  if (!user?.id || !session?.access_token) {
    throw new Error("signUp returned incomplete payload");
  }
  return { userId: user.id, accessToken: session.access_token };
}

async function deleteUser(userId: string): Promise<void> {
  // service-role delete via admin API
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  }).catch(() => { /* test tear-down is best-effort */ });
}

async function insertSessionAsService(userId: string, sessionId: string): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/sessions`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      id: sessionId,
      user_id: userId,
      type: "behavioral",
      difficulty: "standard",
      date: new Date().toISOString(),
    }),
  });
  if (!res.ok) throw new Error(`insertSession failed: ${res.status}`);
}

describe.skipIf(!RLS_ENABLED)("RLS: cross-user isolation (integration)", () => {
  let aliceId = "";
  let aliceToken = "";
  let bobId = "";
  let bobToken = "";
  const aliceSessionId = `rls-test-alice-${Date.now()}`;

  beforeAll(async () => {
    const uniq = Date.now();
    const alice = await signUpUser(`rls-alice-${uniq}@test.hirestepx.com`, "TestPass123!");
    const bob   = await signUpUser(`rls-bob-${uniq}@test.hirestepx.com`,   "TestPass123!");
    aliceId = alice.userId;
    aliceToken = alice.accessToken;
    bobId = bob.userId;
    bobToken = bob.accessToken;
    await insertSessionAsService(aliceId, aliceSessionId);
  }, 30_000);

  afterAll(async () => {
    await Promise.all([deleteUser(aliceId), deleteUser(bobId)]);
  });

  it("Bob's SELECT on sessions returns zero Alice rows", async () => {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/sessions?user_id=eq.${encodeURIComponent(aliceId)}&select=id`,
      { headers: { apikey: ANON_KEY, Authorization: `Bearer ${bobToken}` } },
    );
    expect(res.ok).toBe(true);
    const rows = await res.json();
    expect(rows).toEqual([]);
  });

  it("Alice's SELECT on her own sessions returns her row", async () => {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/sessions?user_id=eq.${encodeURIComponent(aliceId)}&select=id`,
      { headers: { apikey: ANON_KEY, Authorization: `Bearer ${aliceToken}` } },
    );
    expect(res.ok).toBe(true);
    const rows = await res.json();
    expect(rows.some((r: { id: string }) => r.id === aliceSessionId)).toBe(true);
  });

  it("Bob cannot INSERT a session with Alice's user_id (RLS check clause)", async () => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/sessions`, {
      method: "POST",
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${bobToken}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        id: `rls-impersonation-${Date.now()}`,
        user_id: aliceId, // trying to write as Alice
        type: "behavioral",
        difficulty: "standard",
        date: new Date().toISOString(),
      }),
    });
    // Postgres returns 403 (policy violation) when auth.uid() != user_id
    expect(res.ok).toBe(false);
    expect([401, 403]).toContain(res.status);
  });

  it("Bob cannot DELETE Alice's session", async () => {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/sessions?id=eq.${encodeURIComponent(aliceSessionId)}`,
      { method: "DELETE", headers: { apikey: ANON_KEY, Authorization: `Bearer ${bobToken}` } },
    );
    // PostgREST returns 200 with empty body for no-match; the row should NOT be gone
    const check = await fetch(
      `${SUPABASE_URL}/rest/v1/sessions?id=eq.${encodeURIComponent(aliceSessionId)}&select=id`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
    );
    const rows = await check.json();
    expect(rows.some((r: { id: string }) => r.id === aliceSessionId)).toBe(true);
    // Suppress unused-var warning — `res` proves the request was issued.
    expect([200, 204, 403, 401]).toContain(res.status);
  });

  it("Bob cannot SELECT Alice's profile", async () => {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(aliceId)}&select=email,name,session_credits`,
      { headers: { apikey: ANON_KEY, Authorization: `Bearer ${bobToken}` } },
    );
    expect(res.ok).toBe(true);
    const rows = await res.json();
    expect(rows).toEqual([]);
  });

  it("Bob cannot UPDATE Alice's profile (e.g. grant himself session_credits by writing as Alice)", async () => {
    // First: confirm Alice has zero credits via service role
    const before = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(aliceId)}&select=session_credits`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
    );
    const [beforeRow] = await before.json();
    const startingCredits = beforeRow?.session_credits ?? 0;

    // Bob's attempt — PATCH with his token on Alice's row
    await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(aliceId)}`,
      {
        method: "PATCH",
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${bobToken}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ session_credits: 999 }),
      },
    );
    // Regardless of status code — verify the underlying row didn't change.
    const after = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(aliceId)}&select=session_credits`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
    );
    const [afterRow] = await after.json();
    expect(afterRow?.session_credits).toBe(startingCredits);
  });
});

// When RLS is disabled, leave one describe behind so vitest doesn't complain
// about an empty test file. This is the only assertion we can run without
// a real Supabase project; it exists to document the opt-in pattern.
describe("RLS integration — setup documentation", () => {
  it("skipped unless TEST_SUPABASE_URL/ANON_KEY/SERVICE_ROLE_KEY are set", () => {
    if (RLS_ENABLED) {
      expect(SUPABASE_URL).toMatch(/^https?:\/\//);
    } else {
      expect(RLS_ENABLED).toBe(false);
    }
  });
});
