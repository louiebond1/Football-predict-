create or replace function public.rename_group(p_group_id uuid, p_name text)
returns public.groups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := trim(coalesce(p_name, ''));
  v_group public.groups;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if char_length(v_name) < 2 or char_length(v_name) > 40 then
    raise exception 'Group name must be between 2 and 40 characters';
  end if;

  select * into v_group
  from public.groups
  where id = p_group_id;

  if not found then
    raise exception 'Group not found';
  end if;

  if v_group.treasurer_id <> auth.uid() then
    raise exception 'Only the Treasurer can rename this group';
  end if;

  update public.groups
  set name = v_name
  where id = p_group_id
  returning * into v_group;

  return v_group;
end;
$$;

revoke all on function public.rename_group(uuid, text) from public;
revoke all on function public.rename_group(uuid, text) from anon;
grant execute on function public.rename_group(uuid, text) to authenticated;
