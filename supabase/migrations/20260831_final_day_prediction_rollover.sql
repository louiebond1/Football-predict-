create or replace function public.ensure_group_gameweek(gid uuid, gwid bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  stake integer;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.group_members where group_id=gid and user_id=uid) then raise exception 'Not a group member'; end if;
  if not exists(select 1 from public.gameweeks where id=gwid) then raise exception 'Gameweek not found'; end if;
  select stake_pence into stake from public.groups where id=gid;
  if stake is null then raise exception 'Group not found'; end if;

  insert into public.group_gameweeks(group_id,gameweek_id)
  values(gid,gwid)
  on conflict(group_id,gameweek_id) do nothing;

  insert into public.payments(group_id,gameweek_id,user_id,amount_pence)
  select gid,gwid,gm.user_id,stake
  from public.group_members gm
  where gm.group_id=gid
  on conflict(group_id,gameweek_id,user_id) do nothing;
end;
$$;

revoke execute on function public.ensure_group_gameweek(uuid,bigint) from public, anon;
grant execute on function public.ensure_group_gameweek(uuid,bigint) to authenticated;
