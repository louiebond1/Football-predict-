-- Per-member prediction submission counts for a group's gameweek, without
-- exposing the actual predicted scores (those stay hidden pre-kickoff per
-- the existing "members see predictions after kickoff or own" policy).
-- Used by the Live Table to show "X/Y picks locked" / "Not submitted".

create or replace function public.group_pick_status(p_group_id uuid, p_gameweek_id bigint)
returns table(user_id uuid, submitted_count bigint)
language sql stable security definer set search_path = '' as $$
  select
    gm.user_id,
    count(p.fixture_id) as submitted_count
  from public.group_members gm
  left join public.predictions p
    on p.group_id = gm.group_id
    and p.user_id = gm.user_id
    and p.fixture_id in (select id from public.fixtures where gameweek_id = p_gameweek_id)
  where gm.group_id = p_group_id
    and public.is_group_member(p_group_id)
  group by gm.user_id;
$$;

grant execute on function public.group_pick_status(uuid, bigint) to authenticated;
