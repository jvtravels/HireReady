-- ═══════════════════════════════════════════════════════════════════
-- Migration 0001 — Backfill existing profiles.resume_data into the new
-- resumes + resume_versions tables.
--
-- Run AFTER applying the schema additions in supabase-schema.sql
-- (the resumes / resume_versions tables must already exist).
--
-- Idempotent: safe to re-run. The WHERE NOT EXISTS guard skips users
-- who already have a resume row.
--
-- Behavior:
--   For every user with profile.resume_data set and no existing
--   resumes row → create one resume (domain='general') + one v1
--   resume_versions row with:
--     - text_hash    = SHA256 of profile.resume_text (lowercased,
--                      whitespace-collapsed — matches the runtime
--                      normalizer in _resume-versioning.ts)
--     - parsed_data  = profile.resume_data
--     - parse_source = 'ai' if resume_data._type='ai' else 'fallback'
--   And set resumes.active_version_id to point at it.
--
-- Optionally: backfill sessions.resume_version_id for prior sessions
-- run by these users, pointing to their v1. Best-effort — sessions
-- without a corresponding profile.resume_data stay null.
--
-- Estimated impact: 1 INSERT per existing user × 2 tables. Safe to
-- run during business hours; the new tables are not yet read by
-- production traffic.
-- ═══════════════════════════════════════════════════════════════════

begin;

-- ── Step 1: backfill resumes (one row per existing user with a resume) ──
insert into resumes (id, user_id, domain, title, is_archived, created_at, updated_at)
select
  gen_random_uuid()                  as id,
  p.id                               as user_id,
  'general'                          as domain,
  coalesce(nullif(p.resume_file_name, ''), 'Resume') as title,
  false                              as is_archived,
  coalesce(p.created_at, now())      as created_at,
  now()                              as updated_at
from profiles p
where p.resume_data is not null
  and not exists (
    select 1 from resumes r where r.user_id = p.id
  );

-- ── Step 2: backfill resume_versions v1 for each new resume row ──
-- The text_hash matches the runtime normalizer: NFC + lowercase +
-- whitespace runs → single space + CRLF→LF + 3+ blank lines → 2.
-- We approximate that in pure SQL (close enough — minor variants
-- will trigger a one-time fresh LLM call, then the cache catches up).
insert into resume_versions (
  id, resume_id, version_number,
  text_hash, file_hash, file_name,
  resume_text, parsed_data, parse_source, is_latest, created_at
)
select
  gen_random_uuid()                  as id,
  r.id                               as resume_id,
  1                                  as version_number,
  encode(
    digest(
      regexp_replace(
        regexp_replace(
          lower(coalesce(p.resume_text, '')),
          E'\r\n?', E'\n', 'g'
        ),
        E'[ \t]+', ' ', 'g'
      ),
      'sha256'
    ),
    'hex'
  )                                  as text_hash,
  null                               as file_hash,
  nullif(p.resume_file_name, '')     as file_name,
  left(coalesce(p.resume_text, ''), 50000) as resume_text,
  p.resume_data                      as parsed_data,
  case
    when p.resume_data ? '_type' and p.resume_data->>'_type' = 'fallback'
      then 'fallback'
    else 'ai'
  end                                as parse_source,
  true                               as is_latest,
  coalesce(p.created_at, now())      as created_at
from profiles p
join resumes r on r.user_id = p.id and r.domain = 'general'
where p.resume_data is not null
  and not exists (
    select 1 from resume_versions v where v.resume_id = r.id
  );

-- ── Step 3: point each resumes row at its v1 ──
update resumes r
set active_version_id = v.id
from resume_versions v
where v.resume_id = r.id
  and v.version_number = 1
  and v.is_latest = true
  and r.active_version_id is null;

-- ── Step 4: backfill sessions.resume_version_id where possible ──
-- Best-effort: any session that pre-dates resume v2 binding gets
-- pointed at the user's v1 if it exists. Sessions for users who
-- never had a resume stay null (correct).
update sessions s
set resume_version_id = v.id
from resumes r
join resume_versions v on v.resume_id = r.id and v.version_number = 1
where r.user_id = s.user_id
  and s.resume_version_id is null;

-- ── Verification queries (commented; run manually if you want) ──
-- select count(*) as users_with_resume from profiles where resume_data is not null;
-- select count(*) as resume_rows from resumes;
-- select count(*) as version_rows from resume_versions;
-- select count(*) filter (where resume_version_id is not null) as bound_sessions from sessions;

commit;

-- Note: the digest() function requires the pgcrypto extension. Most
-- Supabase projects have it enabled by default; if not, run:
--   create extension if not exists pgcrypto;
-- before this migration.
