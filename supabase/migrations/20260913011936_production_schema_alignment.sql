-- Reconcile production-only closeout features without rewriting historical data.
create table if not exists public.gameweek_standings_snapshots (
 group_id uuid not null references public.groups(id),
 gameweek_id bigint not null references public.gameweeks(id),
 user_id uuid not null,
 display_name text,
 final_rank integer not null,
 points bigint not null default 0,
 exact_scores bigint not null default 0,
 scorer_hits bigint not null default 0,
 team_score_hits bigint not null default 0,
 created_at timestamptz not null default now(),
 snapshot_kind text not null default 'final',
 primary key(group_id,gameweek_id,user_id)
);
alter table public.gameweek_standings_snapshots enable row level security;
revoke all on public.gameweek_standings_snapshots from anon,authenticated;
grant select on public.gameweek_standings_snapshots to authenticated;
drop policy if exists "members see gameweek standings snapshots" on public.gameweek_standings_snapshots;
create policy "members see gameweek standings snapshots" on public.gameweek_standings_snapshots for select to authenticated using(public.is_group_member(group_id));
CREATE OR REPLACE FUNCTION public.snapshot_gameweek_standings(p_group_id uuid, p_gameweek_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.gameweek_standings_snapshots (
    group_id, gameweek_id, user_id, display_name, final_rank,
    points, exact_scores, scorer_hits, team_score_hits, created_at
  )
  with participant_keys as (
    select gm.user_id
    from public.group_members gm
    where gm.group_id = p_group_id
  ), pred_totals as (
    select
      p.user_id,
      coalesce(sum(p.points), 0)::bigint as points,
      count(*) filter (
        where p.predicted_home = f.home_goals
          and p.predicted_away = f.away_goals
          and f.status in ('FT','AET','PEN')
      )::bigint as exact_scores,
      count(*) filter (
        where p.first_scorer_player_id = f.first_scorer_player_id
          and p.first_scorer_player_id is not null
          and f.first_scorer_player_id is not null
          and f.status in ('FT','AET','PEN')
      )::bigint as scorer_hits,
      coalesce(sum(
        (p.predicted_home = f.home_goals)::int
        + (p.predicted_away = f.away_goals)::int
      ) filter (where f.status in ('FT','AET','PEN')), 0)::bigint as team_score_hits
    from public.predictions p
    join public.fixtures f on f.id = p.fixture_id
    join public.group_members gm on gm.group_id=p.group_id and gm.user_id=p.user_id
    where p.group_id = p_group_id and f.gameweek_id = p_gameweek_id
    group by p.user_id
  ), adj_totals as (
    select
      pa.user_id,
      coalesce(sum(pa.delta), 0)::bigint as adjustment
    from public.point_adjustments pa
    join public.group_members gm on gm.group_id=pa.group_id and gm.user_id=pa.user_id
    where pa.group_id = p_group_id and pa.gameweek_id = p_gameweek_id
    group by pa.user_id
  ), scores as (
    select
      pk.user_id,
      coalesce(pt.points, 0) + coalesce(at.adjustment, 0) as points,
      coalesce(pt.exact_scores, 0) as exact_scores,
      coalesce(pt.scorer_hits, 0) as scorer_hits,
      coalesce(pt.team_score_hits, 0) as team_score_hits
    from participant_keys pk
    left join pred_totals pt on pt.user_id = pk.user_id
    left join adj_totals at on at.user_id = pk.user_id
  ), ranked as (
    select
      s.*,
      dense_rank() over (
        order by s.points desc, s.exact_scores desc, s.team_score_hits desc
      )::integer as final_rank
    from scores s
  )
  select
    p_group_id,
    p_gameweek_id,
    r.user_id,
    pr.display_name,
    r.final_rank,
    r.points,
    r.exact_scores,
    r.scorer_hits,
    r.team_score_hits,
    now()
  from ranked r
  left join public.profiles pr on pr.id = r.user_id
  on conflict(group_id,gameweek_id,user_id) do nothing;
end;
$function$;

CREATE OR REPLACE FUNCTION public.settle_gameweek(p_group_id uuid, p_gameweek_id bigint)
 RETURNS public.group_gameweeks
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_row public.group_gameweeks;
  v_winner uuid;
  v_winners uuid[] := '{}'::uuid[];
  v_fixture_count int;
  v_unfinished int;
  v_top_points bigint;
  v_top_exact bigint;
  v_top_team_hits bigint;
begin
  if not exists (
    select 1 from public.groups
    where id = p_group_id and treasurer_id = auth.uid()
  ) then
    raise exception 'only the treasurer can close a gameweek';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_group_id::text||':'||p_gameweek_id::text,0));
  select * into v_row
  from public.group_gameweeks
  where group_id = p_group_id and gameweek_id = p_gameweek_id;

  if v_row.settled_at is not null then
    return v_row;
  end if;

  select count(*), count(*) filter (where status is null or status not in ('FT','AET','PEN') or home_goals is null or away_goals is null)
    into v_fixture_count, v_unfinished
  from public.fixtures
  where gameweek_id = p_gameweek_id;

  if v_fixture_count = 0 then
    raise exception 'this gameweek has no fixtures';
  end if;
  if v_unfinished > 0 then
    raise exception 'not all fixtures are finished yet';
  end if;

  with pred_totals as (
    select
      p.user_id,
      coalesce(sum(p.points),0)::bigint as points,
      count(*) filter (
        where p.predicted_home=f.home_goals
          and p.predicted_away=f.away_goals
          and f.status in ('FT','AET','PEN')
      )::bigint as exact_scores,
      coalesce(sum(
        (p.predicted_home=f.home_goals)::int
        + (p.predicted_away=f.away_goals)::int
      ) filter (where f.status in ('FT','AET','PEN')),0)::bigint as team_score_hits
    from public.predictions p
    join public.fixtures f on f.id=p.fixture_id
    join public.group_members gm on gm.group_id=p.group_id and gm.user_id=p.user_id
    where p.group_id=p_group_id and f.gameweek_id=p_gameweek_id
    group by p.user_id
  ), adj_totals as (
    select pa.user_id, coalesce(sum(pa.delta),0)::bigint as adjustment
    from public.point_adjustments pa
    join public.group_members gm on gm.group_id=pa.group_id and gm.user_id=pa.user_id
    where pa.group_id=p_group_id and pa.gameweek_id=p_gameweek_id
    group by pa.user_id
  ), eligible as (
    select
      coalesce(pt.user_id, at.user_id) as user_id,
      coalesce(pt.points,0) + coalesce(at.adjustment,0) as points,
      coalesce(pt.exact_scores,0) as exact_scores,
      coalesce(pt.team_score_hits,0) as team_score_hits
    from pred_totals pt
    full outer join adj_totals at on at.user_id=pt.user_id
  ), top_row as (
    select * from eligible
    order by points desc, exact_scores desc, team_score_hits desc, user_id
    limit 1
  )
  select points, exact_scores, team_score_hits
    into v_top_points, v_top_exact, v_top_team_hits
  from top_row;

  if v_top_points is not null then
    with pred_totals as (
      select
        p.user_id,
        coalesce(sum(p.points),0)::bigint as points,
        count(*) filter (
          where p.predicted_home=f.home_goals
            and p.predicted_away=f.away_goals
            and f.status in ('FT','AET','PEN')
        )::bigint as exact_scores,
        coalesce(sum(
          (p.predicted_home=f.home_goals)::int
          + (p.predicted_away=f.away_goals)::int
        ) filter (where f.status in ('FT','AET','PEN')),0)::bigint as team_score_hits
      from public.predictions p
      join public.fixtures f on f.id=p.fixture_id
      join public.group_members gm on gm.group_id=p.group_id and gm.user_id=p.user_id
      where p.group_id=p_group_id and f.gameweek_id=p_gameweek_id
      group by p.user_id
    ), adj_totals as (
      select pa.user_id, coalesce(sum(pa.delta),0)::bigint as adjustment
      from public.point_adjustments pa
      join public.group_members gm on gm.group_id=pa.group_id and gm.user_id=pa.user_id
      where pa.group_id=p_group_id and pa.gameweek_id=p_gameweek_id
      group by pa.user_id
    ), eligible as (
      select
        coalesce(pt.user_id, at.user_id) as user_id,
        coalesce(pt.points,0) + coalesce(at.adjustment,0) as points,
        coalesce(pt.exact_scores,0) as exact_scores,
        coalesce(pt.team_score_hits,0) as team_score_hits
      from pred_totals pt
      full outer join adj_totals at on at.user_id=pt.user_id
    )
    select coalesce(array_agg(user_id order by user_id), '{}'::uuid[])
      into v_winners
    from eligible
    where points = v_top_points
      and exact_scores = v_top_exact
      and team_score_hits = v_top_team_hits;
  end if;

  if cardinality(v_winners) = 1 then
    v_winner := v_winners[1];
  else
    v_winner := null;
  end if;

  insert into public.group_gameweeks (
    group_id, gameweek_id, winner_user_id, winner_user_ids, settlement_kind, settled_at
  ) values (
    p_group_id,
    p_gameweek_id,
    v_winner,
    v_winners,
    case
      when cardinality(v_winners)=0 then 'no_winner'
      when cardinality(v_winners)=1 then 'winner'
      else 'draw'
    end,
    now()
  )
  on conflict (group_id, gameweek_id) do update set
    winner_user_id = excluded.winner_user_id,
    winner_user_ids = excluded.winner_user_ids,
    settlement_kind = excluded.settlement_kind,
    settled_at = excluded.settled_at
  returning * into v_row;

  perform public.snapshot_gameweek_standings(p_group_id, p_gameweek_id);
  return v_row;
end;
$function$;

CREATE OR REPLACE FUNCTION public.ensure_current_gameweek(p_group_id uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_gameweek_id bigint;
  v_stake integer;
begin
  if not exists(select 1 from public.group_members where group_id=p_group_id and user_id=auth.uid()) then
    raise exception 'not a member of this group';
  end if;

  -- The active gameweek is the earliest Premier League gameweek that still
  -- contains at least one non-final fixture. This deliberately keeps a group
  -- on (for example) Matchday 3 until every Matchday 3 fixture is FT/AET/PEN,
  -- even if the upstream football provider has already exposed Matchday 4.
  select g.id into v_gameweek_id
  from public.gameweeks g
  where g.league_id = 39
    and g.season=(select max(season) from public.gameweeks where league_id=39)
    and exists (
      select 1
      from public.fixtures f
      where f.gameweek_id = g.id
        and (f.status is null or f.status not in ('FT','AET','PEN'))
    )
  order by g.starts_at asc nulls last, g.id asc
  limit 1;

  -- Fallback only for a freshly-created database before fixtures have synced.
  if v_gameweek_id is null then
    select id into v_gameweek_id
    from public.gameweeks
    where league_id = 39
    order by starts_at desc nulls last, id desc
    limit 1;
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
$function$;

revoke all on function public.snapshot_gameweek_standings(uuid,bigint) from public,anon,authenticated;
revoke all on function public.settle_gameweek(uuid,bigint) from public,anon;
grant execute on function public.settle_gameweek(uuid,bigint) to authenticated;
alter function public.calculate_prediction_points(integer,integer,integer,integer,bigint,bigint) set search_path='';
revoke all on function public.apply_group_payment_mode() from public,anon,authenticated;
revoke all on function public.sync_group_payment_mode() from public,anon,authenticated;
