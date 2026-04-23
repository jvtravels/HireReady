-- ═══════════════════════════════════════════════════════════════
-- RLS (Row Level Security) Audit & Hardening Migration
-- ═══════════════════════════════════════════════════════════════
-- Run this in Supabase SQL Editor to:
--   1. Enable RLS on tables that may be missing it
--   2. Add policies for user-scoped tables
--   3. Ensure resume columns exist on profiles
-- Safe to run multiple times (uses IF NOT EXISTS / IF EXISTS).
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. Ensure resume columns exist on profiles ─────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS resume_file_name TEXT DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS resume_text TEXT DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS resume_data JSONB;

-- ─── 1b. Soft-delete column for 7-day deletion grace period ──────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS profiles_deleted_at_idx ON profiles(deleted_at) WHERE deleted_at IS NOT NULL;

-- ─── 1c. Cap resume_text at 200 KB (~50k chars) to prevent abuse ──
-- Guard against >200KB resume uploads bloating the profiles table
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS resume_text_max_length;
ALTER TABLE profiles ADD CONSTRAINT resume_text_max_length
  CHECK (resume_text IS NULL OR length(resume_text) <= 200000);

-- ─── 1d. Indexes for session count & date-range queries ───────────
-- These are critical at scale (used by /api/evaluate quota checks)
CREATE INDEX IF NOT EXISTS idx_sessions_user_created
  ON sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_user_date
  ON sessions(user_id, date DESC);
-- Speed up admin queries / leaderboards (optional)
CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions(created_at DESC);

-- ─── 2. Enable RLS on all user-scoped tables ────────────────────
ALTER TABLE IF EXISTS profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS interview_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS llm_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS service_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS referrals ENABLE ROW LEVEL SECURITY;

-- ─── 3. interview_turns: users can only read/write their own turns ─
DROP POLICY IF EXISTS "interview_turns_select_own" ON interview_turns;
CREATE POLICY "interview_turns_select_own" ON interview_turns
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "interview_turns_insert_own" ON interview_turns;
CREATE POLICY "interview_turns_insert_own" ON interview_turns
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "interview_turns_update_own" ON interview_turns;
CREATE POLICY "interview_turns_update_own" ON interview_turns
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "interview_turns_delete_own" ON interview_turns;
CREATE POLICY "interview_turns_delete_own" ON interview_turns
  FOR DELETE USING (auth.uid() = user_id);

-- ─── 4. llm_usage: users can only read their own usage ──────────
DROP POLICY IF EXISTS "llm_usage_select_own" ON llm_usage;
CREATE POLICY "llm_usage_select_own" ON llm_usage
  FOR SELECT USING (auth.uid() = user_id);

-- Writes should only be via service role (server-side)
DROP POLICY IF EXISTS "llm_usage_no_client_writes" ON llm_usage;
CREATE POLICY "llm_usage_no_client_writes" ON llm_usage
  FOR ALL USING (false) WITH CHECK (false);

-- ─── 5. service_usage: users can only read their own ────────────
DROP POLICY IF EXISTS "service_usage_select_own" ON service_usage;
CREATE POLICY "service_usage_select_own" ON service_usage
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "service_usage_no_client_writes" ON service_usage;
CREATE POLICY "service_usage_no_client_writes" ON service_usage
  FOR ALL USING (false) WITH CHECK (false);

-- ─── 6. referrals: users can read referrals they made ───────────
DROP POLICY IF EXISTS "referrals_select_own" ON referrals;
CREATE POLICY "referrals_select_own" ON referrals
  FOR SELECT USING (auth.uid() = referrer_user_id OR auth.uid() = referred_user_id);

-- ─── 7. Verify RLS is enabled (returns any tables WITHOUT RLS) ──
-- Run this to audit: SELECT tablename FROM pg_tables
--   WHERE schemaname = 'public' AND rowsecurity = false;

-- ─── 8. Audit log table (for compliance/security monitoring) ────
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event TEXT NOT NULL,
  details JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Users can only read their own audit events
DROP POLICY IF EXISTS "audit_log_select_own" ON audit_log;
CREATE POLICY "audit_log_select_own" ON audit_log
  FOR SELECT USING (auth.uid() = user_id);

-- Only service role can write
DROP POLICY IF EXISTS "audit_log_no_client_writes" ON audit_log;
CREATE POLICY "audit_log_no_client_writes" ON audit_log
  FOR INSERT WITH CHECK (false);

-- Index for common queries
CREATE INDEX IF NOT EXISTS audit_log_user_id_idx ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS audit_log_event_idx ON audit_log(event);
CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON audit_log(created_at DESC);

-- ─── 9. Data retention — via pg_cron (requires Supabase Pro or self-hosted) ─
-- Uncomment each job after verifying pg_cron is available (`CREATE EXTENSION IF NOT EXISTS pg_cron;`)

-- Hard-delete accounts soft-deleted 7+ days ago
-- SELECT cron.schedule('hard-delete-accounts', '0 3 * * *', $$
--   DELETE FROM profiles WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '7 days';
-- $$);

-- Purge llm_usage older than 30 days (cost telemetry only)
-- SELECT cron.schedule('cleanup-llm-usage', '0 3 * * *', $$
--   DELETE FROM llm_usage WHERE created_at < NOW() - INTERVAL '30 days';
-- $$);

-- Purge service_usage older than 30 days
-- SELECT cron.schedule('cleanup-service-usage', '0 3 * * *', $$
--   DELETE FROM service_usage WHERE created_at < NOW() - INTERVAL '30 days';
-- $$);

-- Purge audit_log older than 12 months
-- SELECT cron.schedule('cleanup-audit-log', '0 4 * * 0', $$
--   DELETE FROM audit_log WHERE created_at < NOW() - INTERVAL '12 months';
-- $$);

-- Purge interview_turns older than 180 days (keep recent transcripts only)
-- SELECT cron.schedule('cleanup-interview-turns', '30 3 * * *', $$
--   DELETE FROM interview_turns WHERE created_at < NOW() - INTERVAL '180 days';
-- $$);
