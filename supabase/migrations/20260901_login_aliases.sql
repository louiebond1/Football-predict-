-- The invite-password-auth edge function maps a player's real login email to a
-- synthetic, disposable Supabase Auth email (so their real email is never the
-- account's Auth identity and PIN resets can rotate it without touching Auth).
-- This table has always been required by that function but was created only
-- on the live database, not tracked here - captured now so schema.sql/migrations
-- stay the source of truth.
create table if not exists public.login_aliases (
  user_id uuid primary key references auth.users(id) on delete cascade,
  login_email text not null unique,
  auth_email text not null unique,
  created_at timestamptz not null default now()
);

alter table public.login_aliases enable row level security;
revoke all on table public.login_aliases from public, anon, authenticated;

comment on table public.login_aliases is 'Service-role-only mapping from a KickPot login email to the synthetic Supabase Auth email used by the PIN-login edge function.';
