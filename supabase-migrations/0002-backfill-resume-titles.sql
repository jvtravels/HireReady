-- Migration 0002 — Repair resume titles that were left equal to the
-- domain code ("general", "pm", etc.) on rows created before
-- persistResumeVersion started saving file_name as the title.
--
-- Fix in-place by promoting the latest version's file_name into
-- resumes.title. Skip rows that already have a "real" title (any
-- non-empty value that doesn't equal the domain).
--
-- Idempotent — re-running is a no-op.
--
-- HOW TO APPLY:
--   1. Open Supabase SQL Editor
--   2. Paste the whole file
--   3. Run
--   4. Should report N rows updated (one per legacy resume per user)
--
-- AFTER APPLY:
--   The catalogue card title falls back to file_name from the version
--   row first, so this migration is technically optional — visually,
--   nothing changes. But any future feature that reads resumes.title
--   directly (e.g. server-side templating, exports) will get the
--   correct human filename instead of the domain code.

with latest_version as (
  select distinct on (resume_id) resume_id, file_name
  from resume_versions
  where file_name is not null and file_name <> ''
  order by resume_id, version_number desc
)
update resumes r
set
  title = lv.file_name,
  updated_at = now()
from latest_version lv
where lv.resume_id = r.id
  and (r.title is null or r.title = '' or r.title = r.domain);

-- Sanity peek — should return 0 rows after the update lands.
-- Comment in if you want a verification:
-- select id, domain, title from resumes where title = domain or title is null or title = '';
