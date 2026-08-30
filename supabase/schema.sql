-- KickPot initial schema. Run in the Supabase SQL editor once a project is connected.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  created_at timestamptz not null default now()
);

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  join_code text not null unique,
  stake_pence integer not null default 500 check (stake_pence >= 0),
  treasurer_id uuid not null references auth.users(id),
  bank_account_name text,
  bank_sort_code text,
  bank_account_number text,
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('member','treasurer')),
  joined_at timestamptz not null default now(),
  primary key (group_id,user_id)
);

create table if not exists public.gameweeks (
  id bigint generated always as identity primary key,
  league_id integer not null default 39,
  season integer not null,
  round_name text not null,
  starts_at timestamptz,
  ends_at timestamptz,
  unique(league_id,season,round_name)
);

create table if not exists public.fixtures (
  id bigint primary key,
  gameweek_id bigint references public.gameweeks(id) on delete cascade,
  kickoff timestamptz not null,
  home_team_id bigint,
  home_team_name text not null,
  away_team_id bigint,
  away_team_name text not null,
  status text,
  home_goals integer,
  away_goals integer,
  first_scorer_player_id bigint,
  first_scorer_name text,
  updated_at timestamptz not null default now()
);

create table if not exists public.group_gameweeks (
  group_id uuid not null references public.groups(id) on delete cascade,
  gameweek_id bigint not null references public.gameweeks(id) on delete cascade,
  winner_user_id uuid references auth.users(id),
  settled_at timestamptz,
  primary key (group_id,gameweek_id)
);

create table if not exists public.payments (
  group_id uuid not null references public.groups(id) on delete cascade,
  gameweek_id bigint not null references public.gameweeks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_pence integer not null,
  claimed_paid_at timestamptz,
  confirmed_paid_at timestamptz,
  confirmed_by uuid references auth.users(id),
  primary key(group_id,gameweek_id,user_id)
);

create table if not exists public.predictions (
  group_id uuid not null references public.groups(id) on delete cascade,
  fixture_id bigint not null references public.fixtures(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  predicted_home integer not null check(predicted_home between 0 and 20),
  predicted_away integer not null check(predicted_away between 0 and 20),
  first_scorer_player_id bigint,
  first_scorer_name text,
  submitted_at timestamptz not null default now(),
  points integer not null default 0,
  primary key(group_id,fixture_id,user_id)
);

create or replace function public.calculate_prediction_points(ph int, pa int, ah int, aa int, predicted_scorer bigint, actual_scorer bigint)
returns int language sql immutable as $$
  select
    case when ph=ah and pa=aa then 3 when sign(ph-pa)=sign(ah-aa) then 1 else 0 end
    + case when predicted_scorer is not null and actual_scorer is not null and predicted_scorer=actual_scorer then 2 else 0 end;
$$;

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.gameweeks enable row level security;
alter table public.fixtures enable row level security;
alter table public.group_gameweeks enable row level security;
alter table public.payments enable row level security;
alter table public.predictions enable row level security;

create policy "profiles self read" on public.profiles for select to authenticated using (id=(select auth.uid()));
create policy "profiles self insert" on public.profiles for insert to authenticated with check (id=(select auth.uid()));
create policy "profiles self update" on public.profiles for update to authenticated using (id=(select auth.uid())) with check (id=(select auth.uid()));

create policy "members see groups" on public.groups for select to authenticated using (exists(select 1 from public.group_members gm where gm.group_id=id and gm.user_id=(select auth.uid())));
create policy "treasurer updates group" on public.groups for update to authenticated using (treasurer_id=(select auth.uid())) with check (treasurer_id=(select auth.uid()));

create policy "members see membership" on public.group_members for select to authenticated using (exists(select 1 from public.group_members me where me.group_id=group_id and me.user_id=(select auth.uid())));

create policy "authenticated read gameweeks" on public.gameweeks for select to authenticated using (true);
create policy "authenticated read fixtures" on public.fixtures for select to authenticated using (true);

create policy "members see group gameweeks" on public.group_gameweeks for select to authenticated using (exists(select 1 from public.group_members gm where gm.group_id=group_id and gm.user_id=(select auth.uid())));

create policy "members see payments" on public.payments for select to authenticated using (exists(select 1 from public.group_members gm where gm.group_id=group_id and gm.user_id=(select auth.uid())));
create policy "user claims own payment" on public.payments for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));

create policy "members see predictions after kickoff or own" on public.predictions for select to authenticated using (
  user_id=(select auth.uid()) or (
    exists(select 1 from public.group_members gm where gm.group_id=group_id and gm.user_id=(select auth.uid()))
    and exists(select 1 from public.fixtures f where f.id=fixture_id and now()>=f.kickoff)
  )
);
create policy "users insert own prediction" on public.predictions for insert to authenticated with check (
  user_id=(select auth.uid())
  and exists(select 1 from public.group_members gm where gm.group_id=group_id and gm.user_id=(select auth.uid()))
  and exists(select 1 from public.fixtures f where f.id=fixture_id and now()<f.kickoff)
);
create policy "users update own unlocked prediction" on public.predictions for update to authenticated using (
  user_id=(select auth.uid()) and exists(select 1 from public.fixtures f where f.id=fixture_id and now()<f.kickoff)
) with check (user_id=(select auth.uid()));
