create or replace function public.group_live_status(p_group_id uuid, p_gameweek_id bigint)
returns table(
  user_id uuid,
  display_name text,
  points integer,
  picks_submitted integer,
  fixtures_total integer,
  picks_locked boolean
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not exists (
    select 1
    from public.group_members gm
    where gm.group_id = p_group_id
      and gm.user_id = auth.uid()
  ) then
    raise exception 'not a member of this group';
  end if;

  return query
  with all_fixture_set as (
    select f.id
    from public.fixtures f
    where f.gameweek_id = p_gameweek_id
  ),
  open_fixture_set as (
    select f.id
    from public.fixtures f
    where f.gameweek_id = p_gameweek_id
      and now() < f.kickoff
  ),
  open_fixture_count as (
    select count(*)::integer as total
    from open_fixture_set
  ),
  live_points as (
    select p.user_id, coalesce(sum(p.points), 0)::integer as prediction_points
    from public.predictions p
    join all_fixture_set fs on fs.id = p.fixture_id
    where p.group_id = p_group_id
    group by p.user_id
  ),
  open_picks as (
    select p.user_id, count(*)::integer as submitted
    from public.predictions p
    join open_fixture_set fs on fs.id = p.fixture_id
    where p.group_id = p_group_id
    group by p.user_id
  ),
  adj as (
    select pa.user_id, coalesce(sum(pa.delta), 0)::integer as adjustment_points
    from public.point_adjustments pa
    where pa.group_id = p_group_id
      and pa.gameweek_id = p_gameweek_id
    group by pa.user_id
  )
  select
    gm.user_id,
    coalesce(pr.display_name, 'Player')::text,
    (coalesce(lp.prediction_points, 0) + coalesce(ad.adjustment_points, 0))::integer,
    coalesce(op.submitted, 0)::integer,
    ofc.total::integer,
    (ofc.total = 0 or coalesce(op.submitted, 0) >= ofc.total)::boolean
  from public.group_members gm
  left join public.profiles pr on pr.id = gm.user_id
  left join live_points lp on lp.user_id = gm.user_id
  left join open_picks op on op.user_id = gm.user_id
  left join adj ad on ad.user_id = gm.user_id
  cross join open_fixture_count ofc
  where gm.group_id = p_group_id
  order by
    (coalesce(lp.prediction_points, 0) + coalesce(ad.adjustment_points, 0)) desc,
    coalesce(pr.display_name, 'Player') asc;
end;
$$;

revoke all on function public.group_live_status(uuid, bigint) from public;
revoke all on function public.group_live_status(uuid, bigint) from anon;
grant execute on function public.group_live_status(uuid, bigint) to authenticated;

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
    ) as scorer_hits
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
    coalesce(pp.scorer_hits,0::bigint) as scorer_hits
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
    0::bigint as scorer_hits
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
  r.scorer_hits
from all_rows r
left join public.profiles pr on pr.id=r.user_id;

grant select on public.group_leaderboard to authenticated;
