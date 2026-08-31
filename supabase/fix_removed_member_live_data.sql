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
