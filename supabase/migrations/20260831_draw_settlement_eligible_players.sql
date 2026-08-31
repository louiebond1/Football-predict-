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
    select p.user_id,
           sum(p.points)::bigint as points,
           count(*) filter (
             where p.predicted_home=f.home_goals
               and p.predicted_away=f.away_goals
               and f.status in ('FT','AET','PEN')
           )::bigint as exact_scores
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
    select coalesce(pt.user_id, at.user_id) as user_id,
           coalesce(pt.points,0) + coalesce(at.adjustment,0) as points,
           coalesce(pt.exact_scores,0) as exact_scores
    from pred_totals pt
    full outer join adj_totals at on at.user_id=pt.user_id
  ), top_points as (
    select max(points) as points from scores
  ), top_exact as (
    select max(s.exact_scores) as exact_scores
    from scores s, top_points tp
    where s.points=tp.points
  )
  select
    tp.points,
    te.exact_scores,
    coalesce(array_agg(s.user_id order by s.user_id) filter (
      where s.points=tp.points and s.exact_scores=te.exact_scores
    ), '{}'::uuid[])
  into v_top_points, v_top_exact, v_winners
  from top_points tp
  left join top_exact te on true
  left join scores s on s.points=tp.points and s.exact_scores=te.exact_scores
  group by tp.points, te.exact_scores;

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
