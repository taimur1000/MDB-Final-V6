-- ═══════════════════════════════════════════════════════════════════════════
--  VEKTOR SOLUTIONS LLC — Supabase Database Setup v6
--  Run this entire file in: supabase.com → SQL Editor → New Query → Run
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. USERS TABLE ───────────────────────────────────────────────────────────
create table if not exists users (
  id          uuid default gen_random_uuid() primary key,
  email       text unique not null,
  full_name   text not null,
  title       text,          -- e.g. "Dr. Thomas Miller MD"
  specialty   text,
  practice    text,
  city        text,
  state       text,
  role        text default 'doctor' check (role in ('doctor', 'admin')),
  verified    boolean default false,
  sheet_url   text,          -- Google Sheet URL (for future use)
  created_at  timestamptz default now()
);

-- ── 2. OTP CODES TABLE ───────────────────────────────────────────────────────
create table if not exists otp_codes (
  id          uuid default gen_random_uuid() primary key,
  email       text not null,
  code        text not null,
  expires_at  timestamptz not null,
  attempts    integer default 0,
  used        boolean default false,
  created_at  timestamptz default now()
);

-- Index for fast OTP lookup
create index if not exists idx_otp_email_used
  on otp_codes(email, used);

-- ── 3. ROW LEVEL SECURITY ────────────────────────────────────────────────────
-- All access goes through your Vercel API using the service_role key.
-- No direct public access allowed.
alter table users     enable row level security;
alter table otp_codes enable row level security;

create policy "No public access — users"
  on users for all using (false);

create policy "No public access — otp_codes"
  on otp_codes for all using (false);


-- ═══════════════════════════════════════════════════════════════════════════
--  SEED DATA — Add your users below before going live
-- ═══════════════════════════════════════════════════════════════════════════

-- Admin user (Vektor staff — always verified)
insert into users (email, full_name, title, role, verified)
values ('support@veksol.com', 'Vektor Admin', 'Vektor Solutions LLC', 'admin', true)
on conflict (email) do nothing;


-- ── ADD DOCTORS HERE ─────────────────────────────────────────────────────────
-- Copy and edit these lines for each doctor.
-- Set verified = true once their account is ready.
-- Set verified = false if they should see the "pending approval" screen.

-- insert into users (email, full_name, title, specialty, practice, city, state, verified)
-- values
--   (
--     'dr.miller@millermedicine.com',
--     'Thomas Miller',
--     'Dr. Thomas Miller MD',
--     'Internal Medicine',
--     'Miller Medical Group',
--     'Chicago',
--     'IL',
--     true   -- true = can access dashboard | false = pending approval screen
--   );

-- insert into users (email, full_name, title, specialty, practice, city, state, verified)
-- values
--   (
--     'dr.chen@mhclinic.com',
--     'Sarah Chen',
--     'Dr. Sarah Chen MD',
--     'Mental Health',
--     'MH Clinic',
--     'Los Angeles',
--     'CA',
--     true
--   );
