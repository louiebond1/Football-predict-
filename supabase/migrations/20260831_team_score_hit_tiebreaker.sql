create or replace function public.settle_gameweek(p_group_id uuid, p_gameweek_id bigint)
returns public.group_gameweeks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.group_gameweeks;
  v_winner uuid;
  v_winners uuid[] := '{}'::uuid[];
  v_unfinished int;
  v_top_points bigint;
  v_top_exact bigint;
  v_top_team_hits bigint;
begin
  if not exists(select 1 from public.groups where id=p_group_id and treasurer_id=auth.uid()) then
    raise exception 'only the treasurer can settle a gameweek';
  end if;

  select count(*) into v_unfinished
  from public.fixtures
  where gameweek_id=p_gameweek_id
    and status is distinct from 'FT'
    and status is distinct from 'AET'
    and status is distinct from 'PEN';

  if v_unfinished > 0 then
    raise exception 'not all fixtures are finished yet';
  end if;

  with pred_totals as (
    select
      p.user_id,
      sum(p.points)::bigint as points,
      count(*) filter (
        where p.predicted_home=f.home_goals
          and p.predicted_away=f.away_goals
          and f.status in ('FT','AET','PEN')
      )::bigint as exact_scores,
      coalesce(sum(
        (p.predicted_home=f.home_goals)::int
        + (p.predicted_away=f.away_goals)::int
      ) filter (where f.status in ('FT','AET','PEN')), 0)::bigint as team_score_hits
    from public.predictions p
    join public.fixtures f on f.id=p.fixture_id
    join public.group_members gm on gm.group_id=p.group_id and gm.user_id=p.user_id
    where p.group_id=p_group_id and f.gameweek_id=p_gameweek_id
    group by p.user_id
  ), adj_totals as (
    select pa.user_id, sum(pa.delta)::bigint as adjustment
    from public.point_adjustments pa
    join public.group_members gm on gm.group_id=pa.group_id and gm.user_id=pa.user_id
    where pa.group_id=p_group_id and pa.gameweek_id=p_gameweek_id
    group by pa.user_id
  ), scores as (
    select
      pt.user_id,
      pt.points + coalesce(at.adjustment,0) as points,
      pt.exact_scores,
      pt.team_score_hits
    from pred_totals pt
    left join adj_totals at on at.user_id=pt.user_id
  ), top_points as (
    select max(points) as points from scores
  ), top_exact as (
    select max(s.exact_scores) as exact_scores
    from scores s, top_points tp
    where s.points=tp.points
  ), top_team_hits as (
    select max(s.team_score_hits) as team_score_hits
    from scores s, top_points tp, top_exact te
    where s.points=tp.points and s.exact_scores=te.exact_scores
  )
  select
    tp.points,
    te.exact_scores,
    th.team_score_hits,
    coalesce(array_agg(s.user_id order by s.user_id) filter (
      where s.points=tp.points
        and s.exact_scores=te.exact_scores
        and s.team_score_hits=th.team_score_hits
    ), '{}'::uuid[])
  into v_top_points, v_top_exact, v_top_team_hits, v_winners
  from top_points tp
  left join top_exact te on true
  left join top_team_hits th on true
  left join scores s
    on s.points=tp.points
   and s.exact_scores=te.exact_scores
   and s.team_score_hits=th.team_score_hits
  group by tp.points, te.exact_scores, th.team_score_hits;

  if cardinality(v_winners)=1 then
    v_winner := v_winners[1];
  else
    v_winner := null;
  end if;

  insert into public.group_gameweeks (
    group_id, gameweek_id, winner_user_id, winner_user_ids, settlement_kind, settled_at
  )
  values (
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
    winner_user_id=excluded.winner_user_id,
    winner_user_ids=excluded.winner_user_ids,
    settlement_kind=excluded.settlement_kind,
    settled_at=excluded.settled_at
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.settle_gameweek(uuid,bigint) to authenticated;

create or replace view public.group_leaderboard
with (security_invoker=true)
as
with pred_points as (
  select
    p.group_id,
    p.user_id,
    f.gameweek_id,
    sum(p.points) as points,
    count(*) filter (
      where p.predicted_home=f.home_goals
        and p.predicted_away=f.away_goals
        and f.status in ('FT','AET','PEN')
    ) as exact_scores,
    count(*) filter (
      where p.first_scorer_player_id=f.first_scorer_player_id
        and p.first_scorer_player_id is not null
        and f.first_scorer_player_id is not null
        and f.status in ('FT','AET','PEN')
    ) as scorer_hits,
    coalesce(sum(
      (p.predicted_home=f.home_goals)::int
      + (p.predicted_away=f.away_goals)::int
    ) filter (where f.status in ('FT','AET','PEN')), 0) as team_score_hits
  from public.predictions p
  join public.fixtures f on f.id=p.fixture_id
  group by p.group_id,p.user_id,f.gameweek_id
), adj as (
  select pa.group_id, pa.user_id, pa.gameweek_id, sum(pa.delta) as total
  from public.point_adjustments pa
  group by pa.group_id,pa.user_id,pa.gameweek_id
), combined as (
  select
    coalesce(pp.group_id,a.group_id) as group_id,
    coalesce(pp.user_id,a.user_id) as user_id,
    coalesce(pp.gameweek_id,a.gameweek_id) as gameweek_id,
    coalesce(pp.points,0::bigint)+coalesce(a.total,0::bigint) as points,
    coalesce(pp.exact_scores,0::bigint) as exact_scores,
    coalesce(pp.scorer_hits,0::bigint) as scorer_hits,
    coalesce(pp.team_score_hits,0::bigint) as team_score_hits
  from pred_points pp
  full outer join adj a
    on a.group_id=pp.group_id
   and a.user_id=pp.user_id
   and a.gameweek_id=pp.gameweek_id
), current_member_rows as (
  select
    gm.group_id,
    gm.user_id,
    gg.gameweek_id,
    0::bigint as points,
    0::bigint as exact_scores,
    0::bigint as scorer_hits,
    0::bigint as team_score_hits
  from public.group_members gm
  join public.group_gameweeks gg
    on gg.group_id=gm.group_id
   and gg.settled_at is null
  where not exists (
    select 1 from combined c
    where c.group_id=gm.group_id
      and c.user_id=gm.user_id
      and c.gameweek_id=gg.gameweek_id
  )
), all_rows as (
  select * from combined
  union all
  select * from current_member_rows
)
select
  r.group_id,
  r.user_id,
  pr.display_name,
  r.gameweek_id,
  r.points,
  r.exact_scores,
  r.scorer_hits,
  r.team_score_hits
from all_rows r
left join public.profiles pr on pr.id=r.user_id;

grant select on public.group_leaderboard to authenticated;
