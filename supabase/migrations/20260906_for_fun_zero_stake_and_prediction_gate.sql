create or replace function public.create_group(p_name text, p_stake_pence integer default 500)
returns public.groups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_group public.groups;
  v_stake integer := greatest(coalesce(p_stake_pence, 500), 0);
begin
  loop
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists(select 1 from public.groups where join_code = v_code);
  end loop;

  insert into public.groups (name, join_code, stake_pence, treasurer_id, payments_required)
  values (p_name, v_code, v_stake, auth.uid(), v_stake > 0)
  returning * into v_group;

  insert into public.group_members (group_id, user_id, role)
  values (v_group.id, auth.uid(), 'treasurer');

  perform public.ensure_current_gameweek(v_group.id);
  return v_group;
end;
$$;

-- £0/week is always For Fun. This also repairs any groups created under the old default.
update public.groups
set payments_required = false
where stake_pence = 0 and payments_required is distinct from false;

drop policy if exists "users insert own prediction" on public.predictions;
create policy "users insert own prediction"
on public.predictions for insert to authenticated
with check (
  user_id = (select auth.uid())
  and public.is_group_member(group_id)
  and exists (
    select 1 from public.fixtures f
    where f.id = predictions.fixture_id and now() < f.kickoff
  )
  and (
    exists (
      select 1 from public.groups g
      where g.id = predictions.group_id and g.payments_required = false
    )
    or exists (
      select 1
      from public.fixtures f2
      join public.payments pay
        on pay.group_id = predictions.group_id
       and pay.gameweek_id = f2.gameweek_id
       and pay.user_id = (select auth.uid())
      where f2.id = predictions.fixture_id
        and pay.confirmed_paid_at is not null
    )
  )
);

drop policy if exists "users update own unlocked prediction" on public.predictions;
create policy "users update own unlocked prediction"
on public.predictions for update to authenticated
using (
  user_id = (select auth.uid())
  and public.is_group_member(group_id)
  and exists (
    select 1 from public.fixtures f
    where f.id = predictions.fixture_id and now() < f.kickoff
  )
)
with check (
  user_id = (select auth.uid())
  and public.is_group_member(group_id)
  and (
    exists (
      select 1 from public.groups g
      where g.id = predictions.group_id and g.payments_required = false
    )
    or exists (
      select 1
      from public.fixtures f2
      join public.payments pay
        on pay.group_id = predictions.group_id
       and pay.gameweek_id = f2.gameweek_id
       and pay.user_id = (select auth.uid())
      where f2.id = predictions.fixture_id
        and pay.confirmed_paid_at is not null
    )
  )
);
