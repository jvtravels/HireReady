-- ═══════════════════════════════════════════════════════
-- Level Up Interviews — Supabase Schema
-- Run this in Supabase SQL Editor (Dashboard > SQL)
-- ═══════════════════════════════════════════════════════

-- 1. Profiles (extends auth.users)
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  name text not null default '',
  email text not null default '',
  target_role text default '',
  target_company text default '',
  industry text default '',
  interview_date text default '',
  experience_level text default '',
  learning_style text default 'direct',
  resume_file_name text default '',
  resume_text text default '',
  practice_timestamps jsonb default '[]'::jsonb,
  avatar_url text default '',
  subscription_tier text default 'free' check (subscription_tier in ('free', 'starter', 'pro')),
  subscription_start timestamptz,
  subscription_end timestamptz,
  cancel_at_period_end boolean default false,
  subscription_paused boolean default false,
  razorpay_payment_id text,
  razorpay_subscription_id text,
  has_completed_onboarding boolean default false,
  preferred_session_length integer,
  interview_types jsonb default '[]'::jsonb,
  resume_data jsonb,
  created_at timestamptz default now()
);

-- 2. Interview sessions
create table if not exists sessions (
  id text primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  date timestamptz default now(),
  type text not null,
  difficulty text not null,
  focus text default '',
  duration integer default 0,
  score integer default 0,
  questions integer default 0,
  transcript jsonb default '[]'::jsonb,
  ai_feedback text default '',
  skill_scores jsonb,
  created_at timestamptz default now()
);

-- 3. Calendar events
create table if not exists calendar_events (
  id text primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  title text not null,
  company text default '',
  date text not null,
  time text default '',
  type text default 'interview',
  notes text default '',
  created_at timestamptz default now()
);

-- 4. Feedback
create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  session_id text references sessions(id) on delete cascade not null,
  rating text check (rating in ('helpful', 'too_harsh', 'too_generous', 'inaccurate')) not null,
  comment text default '',
  session_score integer default 0,
  session_type text default '',
  created_at timestamptz default now()
);

-- 5. Payments
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  razorpay_payment_id text unique not null,
  razorpay_order_id text default '',
  plan text not null,
  tier text not null,
  amount integer not null,
  currency text default 'INR',
  status text default 'completed',
  subscription_start timestamptz,
  subscription_end timestamptz,
  created_at timestamptz default now()
);

-- ═══════════════════════════════════════════════════════
-- Row Level Security (RLS)
-- Users can only access their own data
-- ═══════════════════════════════════════════════════════

alter table profiles enable row level security;
alter table sessions enable row level security;
alter table calendar_events enable row level security;
alter table feedback enable row level security;
alter table payments enable row level security;

-- Profiles: users can read/update their own profile
create policy "Users can view own profile" on profiles
  for select using (auth.uid() = id);
create policy "Users can update own profile" on profiles
  for update using (auth.uid() = id);
create policy "Users can insert own profile" on profiles
  for insert with check (auth.uid() = id);

-- Sessions: users can CRUD their own sessions
create policy "Users can view own sessions" on sessions
  for select using (auth.uid() = user_id);
create policy "Users can insert own sessions" on sessions
  for insert with check (auth.uid() = user_id);
create policy "Users can delete own sessions" on sessions
  for delete using (auth.uid() = user_id);

-- Calendar: users can CRUD their own events
create policy "Users can view own events" on calendar_events
  for select using (auth.uid() = user_id);
create policy "Users can insert own events" on calendar_events
  for insert with check (auth.uid() = user_id);
create policy "Users can delete own events" on calendar_events
  for delete using (auth.uid() = user_id);
create policy "Users can update own events" on calendar_events
  for update using (auth.uid() = user_id);

-- Feedback: users can CRUD their own feedback
create policy "Users can view own feedback" on feedback
  for select using (auth.uid() = user_id);
create policy "Users can insert own feedback" on feedback
  for insert with check (auth.uid() = user_id);
create policy "Users can update own feedback" on feedback
  for update using (auth.uid() = user_id);
create policy "Users can delete own feedback" on feedback
  for delete using (auth.uid() = user_id);

-- Payments: users can only view their own payments (insert via service role only)
create policy "Users can view own payments" on payments
  for select using (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════
-- Auto-create profile on signup
-- ═══════════════════════════════════════════════════════

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name', '')
  );
  return new;
end;
$$ language plpgsql security definer;

-- Trigger: fire after signup
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
