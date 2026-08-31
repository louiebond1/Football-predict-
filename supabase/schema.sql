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
  payments_required boolean not null default true,
  winner_prize text,
  loser_punishment text,
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

drop policy if exists "profiles self read" on public.profiles;
drop policy if exists "profiles self insert" on public.profiles;
drop policy if exists "profiles self update" on public.profiles;
create policy "profiles self read" on public.profiles for select to authenticated using (id=(select auth.uid()));
create policy "profiles self insert" on public.profiles for insert to authenticated with check (id=(select auth.uid()));
create policy "profiles self update" on public.profiles for update to authenticated using (id=(select auth.uid())) with check (id=(select auth.uid()));

drop policy if exists "members see groups" on public.groups;
drop policy if exists "treasurer updates group" on public.groups;
create policy "members see groups" on public.groups for select to authenticated using (exists(select 1 from public.group_members gm where gm.group_id=id and gm.user_id=(select auth.uid())));
create policy "treasurer updates group" on public.groups for update to authenticated using (treasurer_id=(select auth.uid())) with check (treasurer_id=(select auth.uid()));

-- SECURITY DEFINER breaks the RLS recursion that a plain self-referencing
-- subquery on group_members would cause (checking the policy would require
-- re-checking the policy). Runs as the function owner, bypassing RLS only
-- for this internal lookup.
create or replace function public.is_group_member(p_group_id uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists(select 1 from public.group_members where group_id=p_group_id and user_id=auth.uid());
$$;
grant execute on function public.is_group_member(uuid) to authenticated;

drop policy if exists "members see membership" on public.group_members;
create policy "members see membership" on public.group_members for select to authenticated using (public.is_group_member(group_id));

drop policy if exists "authenticated read gameweeks" on public.gameweeks;
drop policy if exists "authenticated read fixtures" on public.fixtures;
create policy "authenticated read gameweeks" on public.gameweeks for select to authenticated using (true);
create policy "authenticated read fixtures" on public.fixtures for select to authenticated using (true);

drop policy if exists "members see group gameweeks" on public.group_gameweeks;
create policy "members see group gameweeks" on public.group_gameweeks for select to authenticated using (exists(select 1 from public.group_members gm where gm.group_id=group_id and gm.user_id=(select auth.uid())));

drop policy if exists "members see payments" on public.payments;
drop policy if exists "user claims own payment" on public.payments;
drop policy if exists "treasurer confirms payment" on public.payments;
create policy "members see payments" on public.payments for select to authenticated using (exists(select 1 from public.group_members gm where gm.group_id=group_id and gm.user_id=(select auth.uid())));
create policy "user claims own payment" on public.payments for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy "treasurer confirms payment" on public.payments for update to authenticated using (
  exists(select 1 from public.groups g where g.id=group_id and g.treasurer_id=(select auth.uid()))
) with check (
  exists(select 1 from public.groups g where g.id=group_id and g.treasurer_id=(select auth.uid()))
);

drop policy if exists "members see predictions after kickoff or own" on public.predictions;
drop policy if exists "users insert own prediction" on public.predictions;
drop policy if exists "users update own unlocked prediction" on public.predictions;
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
  and exists(
    select 1 from public.fixtures f2
    join public.payments pay on pay.group_id=predictions.group_id and pay.gameweek_id=f2.gameweek_id and pay.user_id=(select auth.uid())
    where f2.id=predictions.fixture_id and pay.confirmed_paid_at is not null
  )
);
create policy "users update own unlocked prediction" on public.predictions for update to authenticated using (
  user_id=(select auth.uid()) and exists(select 1 from public.fixtures f where f.id=fixture_id and now()<f.kickoff)
) with check (
  user_id=(select auth.uid())
  and exists(
    select 1 from public.fixtures f2
    join public.payments pay on pay.group_id=predictions.group_id and pay.gameweek_id=f2.gameweek_id and pay.user_id=(select auth.uid())
    where f2.id=predictions.fixture_id and pay.confirmed_paid_at is not null
  )
);

-- Scoring: recompute prediction points whenever a fixture result / first scorer is written.
create or replace function public.score_fixture_predictions()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('FT','AET','PEN') and new.home_goals is not null and new.away_goals is not null then
    update public.predictions p
    set points = public.calculate_prediction_points(
      p.predicted_home, p.predicted_away, new.home_goals, new.away_goals,
      p.first_scorer_player_id, new.first_scorer_player_id
    )
    where p.fixture_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists fixtures_score_predictions on public.fixtures;
create trigger fixtures_score_predictions
  after insert or update of home_goals, away_goals, first_scorer_player_id, status on public.fixtures
  for each row execute function public.score_fixture_predictions();

-- Ensures a group has a payments row per member for the currently active gameweek.
-- Callable by any authenticated group member; bypasses RLS via security definer since
-- groups/group_members/payments have no direct client insert policies (mutations are
-- routed through controlled functions only).
create or replace function public.ensure_current_gameweek(p_group_id uuid)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_gameweek_id bigint;
  v_stake integer;
begin
  if not exists(select 1 from public.group_members where group_id=p_group_id and user_id=auth.uid()) then
    raise exception 'not a member of this group';
  end if;

  select id into v_gameweek_id from public.gameweeks
    where league_id=39 and ends_at >= now() - interval '1 day'
    order by starts_at asc limit 1;
  if v_gameweek_id is null then
    select id into v_gameweek_id from public.gameweeks where league_id=39 order by starts_at desc limit 1;
  end if;
  if v_gameweek_id is null then
    raise exception 'fixtures are still syncing, try again shortly';
  end if;

  insert into public.group_gameweeks (group_id, gameweek_id)
  values (p_group_id, v_gameweek_id)
  on conflict (group_id, gameweek_id) do nothing;

  select stake_pence into v_stake from public.groups where id=p_group_id;

  insert into public.payments (group_id, gameweek_id, user_id, amount_pence)
  select p_group_id, v_gameweek_id, gm.user_id, v_stake
  from public.group_members gm
  where gm.group_id = p_group_id
  on conflict (group_id, gameweek_id, user_id) do nothing;

  return v_gameweek_id;
end;
$$;

create or replace function public.create_group(p_name text, p_stake_pence integer default 500)
returns public.groups language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  v_group public.groups;
begin
  loop
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists(select 1 from public.groups where join_code=v_code);
  end loop;

  insert into public.groups (name, join_code, stake_pence, treasurer_id)
  values (p_name, v_code, coalesce(p_stake_pence,500), auth.uid())
  returning * into v_group;

  insert into public.group_members (group_id, user_id, role) values (v_group.id, auth.uid(), 'treasurer');
  perform public.ensure_current_gameweek(v_group.id);
  return v_group;
end;
$$;

create or replace function public.join_group(p_join_code text)
returns public.groups language plpgsql security definer set search_path = public as $$
declare
  v_group public.groups;
begin
  select * into v_group from public.groups where join_code=upper(trim(p_join_code));
  if v_group.id is null then
    raise exception 'invalid join code';
  end if;
  insert into public.group_members (group_id, user_id, role) values (v_group.id, auth.uid(), 'member')
  on conflict (group_id, user_id) do nothing;
  perform public.ensure_current_gameweek(v_group.id);
  return v_group;
end;
$$;

create or replace function public.settle_gameweek(p_group_id uuid, p_gameweek_id bigint)
returns public.group_gameweeks language plpgsql security definer set search_path = public as $$
declare
  v_row public.group_gameweeks;
  v_winner uuid;
  v_unfinished int;
begin
  if not exists(select 1 from public.groups where id=p_group_id and treasurer_id=auth.uid()) then
    raise exception 'only the treasurer can settle a gameweek';
  end if;
  select count(*) into v_unfinished from public.fixtures
    where gameweek_id=p_gameweek_id and status is distinct from 'FT' and status is distinct from 'AET' and status is distinct from 'PEN';
  if v_unfinished > 0 then
    raise exception 'not all fixtures are finished yet';
  end if;

  with pred_totals as (
    select p.user_id, sum(p.points) as pts
    from public.predictions p
    join public.fixtures f on f.id=p.fixture_id
    join public.group_members gm on gm.group_id=p.group_id and gm.user_id=p.user_id
    where p.group_id=p_group_id and f.gameweek_id=p_gameweek_id
    group by p.user_id
  ), adj_totals as (
    select pa.user_id, sum(pa.delta) as pts
    from public.point_adjustments pa
    join public.group_members gm on gm.group_id=pa.group_id and gm.user_id=pa.user_id
    where pa.group_id=p_group_id and pa.gameweek_id=p_gameweek_id
    group by pa.user_id
  )
  -- Only counts current group_members: a removed/departed member's
  -- historical predictions stay in the table (kept for settled Gameweeks'
  -- records) but no longer make them eligible to win a later settlement.
  select coalesce(pt.user_id, at.user_id) into v_winner
  from pred_totals pt full outer join adj_totals at on at.user_id=pt.user_id
  order by coalesce(pt.pts,0) + coalesce(at.pts,0) desc
  limit 1;

  insert into public.group_gameweeks (group_id, gameweek_id, winner_user_id, settled_at)
  values (p_group_id, p_gameweek_id, v_winner, now())
  on conflict (group_id, gameweek_id) do update set winner_user_id=excluded.winner_user_id, settled_at=excluded.settled_at
  returning * into v_row;
  return v_row;
end;
$$;

-- Treasurer-only manual scoring corrections. Never alters the underlying
-- prediction rows; kept as a separate, always-visible audit trail and
-- folded into group_leaderboard/settle_gameweek at read time.
create table if not exists public.point_adjustments (
  id bigint generated always as identity primary key,
  group_id uuid not null references public.groups(id) on delete cascade,
  gameweek_id bigint not null references public.gameweeks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  delta integer not null check (delta <> 0 and delta between -50 and 50),
  reason text not null check (char_length(reason) >= 3),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.point_adjustments enable row level security;

drop policy if exists "members see point adjustments" on public.point_adjustments;
drop policy if exists "treasurer inserts point adjustments" on public.point_adjustments;
create policy "members see point adjustments" on public.point_adjustments for select to authenticated using (
  exists(select 1 from public.group_members gm where gm.group_id=group_id and gm.user_id=(select auth.uid()))
);
create policy "treasurer inserts point adjustments" on public.point_adjustments for insert to authenticated with check (
  created_by=(select auth.uid())
  and exists(select 1 from public.groups g where g.id=group_id and g.treasurer_id=(select auth.uid()))
);

-- "For fun" groups: when payments_required is off, everyone's payment
-- counts as confirmed automatically (new rows and existing ones), so the
-- payment-gated prediction policy never blocks anyone in such a group.
alter table public.groups add column if not exists payments_required boolean not null default true;
alter table public.groups add column if not exists winner_prize text;
alter table public.groups add column if not exists loser_punishment text;

create or replace function public.apply_group_payment_mode()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_required boolean;
begin
  select g.payments_required into v_required from public.groups g where g.id = new.group_id;
  if v_required is false then
    new.confirmed_paid_at := coalesce(new.confirmed_paid_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists apply_group_payment_mode on public.payments;
create trigger apply_group_payment_mode
before insert on public.payments
for each row execute function public.apply_group_payment_mode();

create or replace function public.sync_group_payment_mode()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.payments_required is distinct from old.payments_required then
    if new.payments_required is false then
      update public.payments set confirmed_paid_at = coalesce(confirmed_paid_at, now()) where group_id = new.id;
    else
      update public.payments set confirmed_paid_at = null where group_id = new.id and confirmed_by is null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_group_payment_mode on public.groups;
create trigger sync_group_payment_mode
after update of payments_required on public.groups
for each row execute function public.sync_group_payment_mode();

create or replace function public.admin_transfer_treasurer(p_group_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists(select 1 from public.groups where id=p_group_id and treasurer_id=auth.uid()) then
    raise exception 'only the current treasurer can transfer treasurer control';
  end if;
  if not exists(select 1 from public.group_members where group_id=p_group_id and user_id=p_user_id) then
    raise exception 'target user is not a member of this group';
  end if;
  update public.groups set treasurer_id=p_user_id where id=p_group_id;
  update public.group_members set role='treasurer' where group_id=p_group_id and user_id=p_user_id;
  update public.group_members set role='member' where group_id=p_group_id and user_id=auth.uid() and user_id<>p_user_id;
end;
$$;

-- Removing a member drops their *unsettled* predictions/payments/point
-- adjustments (so they stop counting toward an in-progress Gameweek they
-- can no longer be paid out for) but leaves anything tied to an already
-- settled Gameweek untouched, preserving history/records.
create or replace function public.admin_remove_member(p_group_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists(select 1 from public.groups where id=p_group_id and treasurer_id=auth.uid()) then
    raise exception 'only the treasurer can remove members';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'transfer treasurer control before removing yourself';
  end if;
  if not exists(select 1 from public.group_members where group_id=p_group_id and user_id=p_user_id) then
    raise exception 'target user is not a member of this group';
  end if;

  delete from public.payments pay
  where pay.group_id=p_group_id and pay.user_id=p_user_id
    and not exists(
      select 1 from public.group_gameweeks gg
      where gg.group_id=p_group_id and gg.gameweek_id=pay.gameweek_id and gg.settled_at is not null
    );

  delete from public.predictions p
  using public.fixtures f
  where p.fixture_id=f.id
    and p.group_id=p_group_id and p.user_id=p_user_id
    and not exists(
      select 1 from public.group_gameweeks gg
      where gg.group_id=p_group_id and gg.gameweek_id=f.gameweek_id and gg.settled_at is not null
    );

  delete from public.point_adjustments pa
  where pa.group_id=p_group_id and pa.user_id=p_user_id
    and not exists(
      select 1 from public.group_gameweeks gg
      where gg.group_id=p_group_id and gg.gameweek_id=pa.gameweek_id and gg.settled_at is not null
    );

  delete from public.group_members where group_id=p_group_id and user_id=p_user_id;
end;
$$;

create or replace function public.leave_group(p_group_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
begin
  if not exists(select 1 from public.group_members where group_id=p_group_id and user_id=v_user) then
    raise exception 'you are not a member of this group';
  end if;
  if exists(select 1 from public.groups where id=p_group_id and treasurer_id=v_user) then
    raise exception 'transfer treasurer control to another member before leaving';
  end if;

  delete from public.payments pay
  where pay.group_id=p_group_id and pay.user_id=v_user
    and not exists(
      select 1 from public.group_gameweeks gg
      where gg.group_id=p_group_id and gg.gameweek_id=pay.gameweek_id and gg.settled_at is not null
    );

  delete from public.predictions p
  using public.fixtures f
  where p.fixture_id=f.id
    and p.group_id=p_group_id and p.user_id=v_user
    and not exists(
      select 1 from public.group_gameweeks gg
      where gg.group_id=p_group_id and gg.gameweek_id=f.gameweek_id and gg.settled_at is not null
    );

  delete from public.point_adjustments pa
  where pa.group_id=p_group_id and pa.user_id=v_user
    and not exists(
      select 1 from public.group_gameweeks gg
      where gg.group_id=p_group_id and gg.gameweek_id=pa.gameweek_id and gg.settled_at is not null
    );

  delete from public.group_members where group_id=p_group_id and user_id=v_user;
end;
$$;

create or replace function public.admin_regenerate_join_code(p_group_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_code text;
begin
  if not exists(select 1 from public.groups where id=p_group_id and treasurer_id=auth.uid()) then
    raise exception 'only the treasurer can regenerate the invite code';
  end if;
  loop
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists(select 1 from public.groups where join_code=v_code);
  end loop;
  update public.groups set join_code=v_code where id=p_group_id;
  return v_code;
end;
$$;

grant execute on function public.ensure_current_gameweek(uuid) to authenticated;
grant execute on function public.create_group(text, integer) to authenticated;
grant execute on function public.join_group(text) to authenticated;
grant execute on function public.settle_gameweek(uuid, bigint) to authenticated;
grant execute on function public.admin_transfer_treasurer(uuid, uuid) to authenticated;
grant execute on function public.admin_remove_member(uuid, uuid) to authenticated;
grant execute on function public.admin_regenerate_join_code(uuid) to authenticated;
grant execute on function public.leave_group(uuid) to authenticated;

create or replace view public.group_leaderboard
with (security_invoker = true) as
with pred_points as (
  select
    p.group_id, p.user_id, f.gameweek_id,
    sum(p.points) as points,
    count(*) filter (where p.predicted_home = f.home_goals and p.predicted_away = f.away_goals and f.status in ('FT','AET','PEN')) as exact_scores,
    count(*) filter (where p.first_scorer_player_id = f.first_scorer_player_id and f.status in ('FT','AET','PEN')) as scorer_hits
  from public.predictions p
  join public.fixtures f on f.id = p.fixture_id
  group by p.group_id, p.user_id, f.gameweek_id
), adj as (
  select group_id, user_id, gameweek_id, sum(delta) as total
  from public.point_adjustments
  group by group_id, user_id, gameweek_id
), combined as (
  select
    coalesce(pp.group_id, a.group_id) as group_id,
    coalesce(pp.user_id, a.user_id) as user_id,
    coalesce(pp.gameweek_id, a.gameweek_id) as gameweek_id,
    coalesce(pp.points,0) + coalesce(a.total,0) as points,
    coalesce(pp.exact_scores,0) as exact_scores,
    coalesce(pp.scorer_hits,0) as scorer_hits
  from pred_points pp
  full outer join adj a on a.group_id=pp.group_id and a.user_id=pp.user_id and a.gameweek_id=pp.gameweek_id
)
select c.group_id, c.user_id, pr.display_name, c.gameweek_id, c.points, c.exact_scores, c.scorer_hits
from combined c
left join public.profiles pr on pr.id = c.user_id;

-- -----------------------------------------------------------------------------
-- Audit hardening postlude. Keep this at the END of the file so a full rerun
-- always finishes in the secure canonical state even on projects with legacy
-- policy names/triggers from earlier KickPot builds.
-- -----------------------------------------------------------------------------

create or replace function public.is_group_treasurer(p_group_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.groups g
    where g.id=p_group_id and g.treasurer_id=auth.uid()
  );
$$;

create or replace function public.same_group_user(p_other_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(
    select 1
    from public.group_members me
    join public.group_members them on them.group_id=me.group_id
    where me.user_id=auth.uid() and them.user_id=p_other_user
  );
$$;

grant execute on function public.is_group_treasurer(uuid) to authenticated;
grant execute on function public.same_group_user(uuid) to authenticated;

drop policy if exists "profiles group members read" on public.profiles;
create policy "profiles group members read" on public.profiles for select to authenticated
using (public.same_group_user(public.profiles.id));

drop policy if exists "members see group gameweeks" on public.group_gameweeks;
create policy "members see group gameweeks" on public.group_gameweeks for select to authenticated
using (public.is_group_member(public.group_gameweeks.group_id));

drop policy if exists "members see payments" on public.payments;
create policy "members see payments" on public.payments for select to authenticated
using (public.is_group_member(public.payments.group_id));

drop policy if exists "treasurer confirms payments" on public.payments;
drop policy if exists "treasurer confirms payment" on public.payments;
create policy "treasurer confirms payment" on public.payments for update to authenticated
using (public.is_group_treasurer(public.payments.group_id))
with check (public.is_group_treasurer(public.payments.group_id));

drop policy if exists "user claims own payment" on public.payments;
create policy "user claims own payment" on public.payments for update to authenticated
using (
  public.payments.user_id=(select auth.uid())
  and public.is_group_member(public.payments.group_id)
)
with check (
  public.payments.user_id=(select auth.uid())
  and public.is_group_member(public.payments.group_id)
);

create or replace function public.guard_payment_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return new; end if;
  if public.is_group_treasurer(old.group_id) then return new; end if;
  if old.user_id is distinct from auth.uid() then
    raise exception 'cannot update another member payment';
  end if;
  if new.group_id is distinct from old.group_id
     or new.gameweek_id is distinct from old.gameweek_id
     or new.user_id is distinct from old.user_id
     or new.amount_pence is distinct from old.amount_pence
     or new.confirmed_paid_at is distinct from old.confirmed_paid_at
     or new.confirmed_by is distinct from old.confirmed_by then
    raise exception 'members can only change their own payment claim';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_payment_update on public.payments;
create trigger guard_payment_update before update on public.payments
for each row execute function public.guard_payment_update();

drop policy if exists "members see predictions after kickoff or own" on public.predictions;
create policy "members see predictions after kickoff or own" on public.predictions for select to authenticated
using (
  public.is_group_member(public.predictions.group_id)
  and (
    public.predictions.user_id=(select auth.uid())
    or exists(
      select 1 from public.fixtures f
      where f.id=public.predictions.fixture_id and now()>=f.kickoff
    )
  )
);

drop policy if exists "paid users insert own prediction" on public.predictions;
drop policy if exists "paid users update own unlocked prediction" on public.predictions;
drop policy if exists "users insert own prediction" on public.predictions;
drop policy if exists "users update own unlocked prediction" on public.predictions;

create policy "users insert own prediction" on public.predictions for insert to authenticated
with check (
  public.predictions.user_id=(select auth.uid())
  and public.is_group_member(public.predictions.group_id)
  and exists(
    select 1 from public.fixtures f
    where f.id=public.predictions.fixture_id and now()<f.kickoff
  )
  and exists(
    select 1
    from public.fixtures f2
    join public.payments pay
      on pay.group_id=public.predictions.group_id
     and pay.gameweek_id=f2.gameweek_id
     and pay.user_id=(select auth.uid())
    where f2.id=public.predictions.fixture_id and pay.confirmed_paid_at is not null
  )
);

create policy "users update own unlocked prediction" on public.predictions for update to authenticated
using (
  public.predictions.user_id=(select auth.uid())
  and public.is_group_member(public.predictions.group_id)
  and exists(
    select 1 from public.fixtures f
    where f.id=public.predictions.fixture_id and now()<f.kickoff
  )
)
with check (
  public.predictions.user_id=(select auth.uid())
  and public.is_group_member(public.predictions.group_id)
  and exists(
    select 1
    from public.fixtures f2
    join public.payments pay
      on pay.group_id=public.predictions.group_id
     and pay.gameweek_id=f2.gameweek_id
     and pay.user_id=(select auth.uid())
    where f2.id=public.predictions.fixture_id and pay.confirmed_paid_at is not null
  )
);

drop policy if exists "members see point adjustments" on public.point_adjustments;
drop policy if exists "treasurer adds point adjustments" on public.point_adjustments;
drop policy if exists "treasurer inserts point adjustments" on public.point_adjustments;
create policy "members see point adjustments" on public.point_adjustments for select to authenticated
using (public.is_group_member(public.point_adjustments.group_id));
create policy "treasurer inserts point adjustments" on public.point_adjustments for insert to authenticated
with check (
  public.point_adjustments.created_by=(select auth.uid())
  and public.is_group_treasurer(public.point_adjustments.group_id)
  and exists(
    select 1 from public.group_members gm
    where gm.group_id=public.point_adjustments.group_id
      and gm.user_id=public.point_adjustments.user_id
  )
);

drop trigger if exists score_predictions_on_fixture_update on public.fixtures;

revoke all on table public.profiles, public.groups, public.group_members, public.gameweeks,
  public.fixtures, public.group_gameweeks, public.payments, public.predictions,
  public.point_adjustments from anon;
revoke all on table public.profiles, public.groups, public.group_members, public.gameweeks,
  public.fixtures, public.group_gameweeks, public.payments, public.predictions,
  public.point_adjustments from authenticated;

grant select, insert, update on public.profiles to authenticated;
grant select, update on public.groups to authenticated;
grant select on public.group_members to authenticated;
grant select on public.gameweeks to authenticated;
grant select on public.fixtures to authenticated;
grant select on public.group_gameweeks to authenticated;
grant select, update on public.payments to authenticated;
grant select, insert, update on public.predictions to authenticated;
grant select, insert on public.point_adjustments to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant select on public.group_leaderboard to authenticated;

revoke execute on function public.ensure_current_gameweek(uuid) from public, anon;
revoke execute on function public.create_group(text, integer) from public, anon;
revoke execute on function public.join_group(text) from public, anon;
revoke execute on function public.settle_gameweek(uuid, bigint) from public, anon;
revoke execute on function public.admin_transfer_treasurer(uuid, uuid) from public, anon;
revoke execute on function public.admin_remove_member(uuid, uuid) from public, anon;
revoke execute on function public.admin_regenerate_join_code(uuid) from public, anon;
revoke execute on function public.leave_group(uuid) from public, anon;

grant execute on function public.ensure_current_gameweek(uuid) to authenticated;
grant execute on function public.create_group(text, integer) to authenticated;
grant execute on function public.join_group(text) to authenticated;
grant execute on function public.settle_gameweek(uuid, bigint) to authenticated;
grant execute on function public.admin_transfer_treasurer(uuid, uuid) to authenticated;
grant execute on function public.admin_remove_member(uuid, uuid) to authenticated;
grant execute on function public.admin_regenerate_join_code(uuid) to authenticated;
grant execute on function public.leave_group(uuid) to authenticated;
