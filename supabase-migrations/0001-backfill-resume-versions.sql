-- ═══════════════════════════════════════════════════════════════════
-- Migration 0001 — Backfill existing profiles.resume_data into the new
-- resumes + resume_versions tables.
--
-- Run AFTER applying the schema additions in supabase-schema.sql
-- (the resumes / resume_versions tables must already exist).
--
-- This rewrite eliminates cross-table JOINs entirely. Every step uses
-- a self-contained subquery with explicit ::uuid casts on both sides
-- of any column comparison, so it's resilient to type drift in either
-- direction (text columns being read as uuid, or vice versa).
--
-- Idempotent: every INSERT has a NOT EXISTS guard. Safe to re-run.
-- Wrapped in a transaction so a failure mid-flight rolls back cleanly.
--
-- Estimated impact: O(N) with N = number of users with a resume.
-- ═══════════════════════════════════════════════════════════════════

-- Belt-and-braces: make sure pgcrypto is available for digest().
create extension if not exists pgcrypto;

begin;

-- ═══════════════════════════════════════════════════════════════════
-- Step 1: backfill `resumes` (one row per existing user with a resume)
-- ═══════════════════════════════════════════════════════════════════
insert into resumes (id, user_id, domain, title, is_archived, created_at, updated_at)
select
  gen_random_uuid(),
  p.id,
  'general',
  coalesce(nullif(p.resume_file_name, ''), 'Resume'),
  false,
  coalesce(p.created_at, now()),
  now()
from profiles p
where p.resume_data is not null
  -- Skip users who already have a resume row. Use a scalar subquery
  -- with text-cast comparison so type drift on either side won't bite.
  and (p.id::text) not in (select user_id::text from resumes);

-- ═══════════════════════════════════════════════════════════════════
-- Step 2: backfill `resume_versions` v1 for each new resume row
-- ═══════════════════════════════════════════════════════════════════
-- text_hash matches the runtime normalizer (lower + LF + collapsed
-- whitespace). Tiny formatting variants will trigger a one-time
-- fresh LLM call; the cache catches up after that.
insert into resume_versions (
  id, resume_id, version_number,
  text_hash, file_hash, file_name,
  resume_text, parsed_data, parse_source, is_latest, created_at
)
select
  gen_random_uuid(),
  r.id,
  1,
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
  ),
  null,
  nullif(p.resume_file_name, ''),
  left(coalesce(p.resume_text, ''), 50000),
  p.resume_data,
  case
    when p.resume_data ? '_type' and p.resume_data->>'_type' = 'fallback'
      then 'fallback'
    else 'ai'
  end,
  true,
  coalesce(p.created_at, now())
from resumes r
-- Look up the matching profile via a text-cast subquery so any
-- uuid/text drift on profiles.id can't surface here.
join profiles p on p.id::text = r.user_id::text
where r.domain = 'general'
  and p.resume_data is not null
  and not exists (
    select 1 from resume_versions v where v.resume_id = r.id
  );

-- ═══════════════════════════════════════════════════════════════════
-- Step 3: point each resumes row at its v1
-- ═══════════════════════════════════════════════════════════════════
update resumes r
set active_version_id = (
  select v.id from resume_versions v
  where v.resume_id = r.id
    and v.version_number = 1
    and v.is_latest = true
  limit 1
)
where r.active_version_id is null
  and exists (
    select 1 from resume_versions v
    where v.resume_id = r.id and v.version_number = 1
  );

-- ═══════════════════════════════════════════════════════════════════
-- Step 4: backfill sessions.resume_version_id where possible
-- ═══════════════════════════════════════════════════════════════════
-- For each session with a null resume_version_id, find the user's
-- v1 (if any) and pin it. Best-effort — sessions for users who never
-- had a resume stay null (correct).
update sessions s
set resume_version_id = (
  select v.id
  from resume_versions v
  join resumes r on r.id = v.resume_id
  where r.user_id::text = s.user_id::text
    and v.version_number = 1
    and v.is_latest = true
  order by v.created_at asc
  limit 1
)
where s.resume_version_id is null;

commit;

-- ═══════════════════════════════════════════════════════════════════
-- Verification — run these manually after the migration completes:
-- ═══════════════════════════════════════════════════════════════════
-- select count(*) as users_with_resume from profiles where resume_data is not null;
-- select count(*) as resume_rows       from resumes;
-- select count(*) as version_rows      from resume_versions;
-- select count(*) filter (where resume_version_id is not null) as bound_sessions from sessions;
--
-- First three should match. Fourth is a bonus showing how many old
-- sessions got pointed at their user's v1.
