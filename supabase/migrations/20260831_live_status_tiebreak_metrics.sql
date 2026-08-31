drop function if exists public.group_live_status(uuid,bigint);

create function public.group_live_status(p_group_id uuid, p_gameweek_id bigint)
returns table(
  user_id uuid,
  display_name text,
  points integer,
  exact_scores integer,
  team_score_hits integer,
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
  with open_fixture_set as (
    select f.id
    from public.fixtures f
    where f.gameweek_id = p_gameweek_id
      and now() < f.kickoff
  ),
  open_fixture_count as (
    select count(*)::integer as total
    from open_fixture_set
  ),
  metrics as (
    select
      p.user_id,
      coalesce(sum(p.points), 0)::integer as prediction_points,
      count(*) filter (
        where p.predicted_home=f.home_goals
          and p.predicted_away=f.away_goals
          and f.status in ('FT','AET','PEN')
      )::integer as exact_scores,
      coalesce(sum(
        (p.predicted_home=f.home_goals)::int
        + (p.predicted_away=f.away_goals)::int
      ) filter (where f.status in ('FT','AET','PEN')),0)::integer as team_score_hits
    from public.predictions p
    join public.fixtures f on f.id=p.fixture_id
    where p.group_id=p_group_id
      and f.gameweek_id=p_gameweek_id
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
    (coalesce(m.prediction_points, 0) + coalesce(ad.adjustment_points, 0))::integer,
    coalesce(m.exact_scores,0)::integer,
    coalesce(m.team_score_hits,0)::integer,
    coalesce(op.submitted, 0)::integer,
    ofc.total::integer,
    (ofc.total = 0 or coalesce(op.submitted, 0) >= ofc.total)::boolean
  from public.group_members gm
  left join public.profiles pr on pr.id = gm.user_id
  left join metrics m on m.user_id = gm.user_id
  left join open_picks op on op.user_id = gm.user_id
  left join adj ad on ad.user_id = gm.user_id
  cross join open_fixture_count ofc
  where gm.group_id = p_group_id
  order by
    (coalesce(m.prediction_points, 0) + coalesce(ad.adjustment_points, 0)) desc,
    coalesce(m.exact_scores,0) desc,
    coalesce(m.team_score_hits,0) desc,
    coalesce(pr.display_name, 'Player') asc;
end;
$$;

revoke all on function public.group_live_status(uuid, bigint) from public;
revoke all on function public.group_live_status(uuid, bigint) from anon;
grant execute on function public.group_live_status(uuid, bigint) to authenticated;
