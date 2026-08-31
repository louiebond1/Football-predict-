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
