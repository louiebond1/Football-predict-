create table if not exists public.auth_login_limits (
  identifier_hash text primary key,
  attempts integer not null default 0 check (attempts >= 0),
  window_started_at timestamptz not null default now(),
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.auth_login_limits enable row level security;
revoke all on table public.auth_login_limits from public, anon, authenticated;

comment on table public.auth_login_limits is 'Service-role-only throttling state for KickPot PIN/password authentication attempts.';
