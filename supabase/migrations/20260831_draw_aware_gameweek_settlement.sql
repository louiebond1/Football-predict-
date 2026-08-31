alter table public.group_gameweeks
  add column if not exists winner_user_ids uuid[] not null default '{}'::uuid[];

alter table public.group_gameweeks
  add column if not exists settlement_kind text not null default 'pending';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'group_gameweeks_settlement_kind_check'
      and conrelid = 'public.group_gameweeks'::regclass
  ) then
    alter table public.group_gameweeks
      add constraint group_gameweeks_settlement_kind_check
      check (settlement_kind in ('pending','winner','draw','no_winner'));
  end if;
end $$;

update public.group_gameweeks
set winner_user_ids = array[winner_user_id],
    settlement_kind = 'winner'
where settled_at is not null
  and winner_user_id is not null
  and cardinality(winner_user_ids) = 0;

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

  select max(points) into v_top_points
  from public.group_leaderboard
  where group_id=p_group_id and gameweek_id=p_gameweek_id;

  if v_top_points is not null then
    select max(exact_scores) into v_top_exact
    from public.group_leaderboard
    where group_id=p_group_id
      and gameweek_id=p_gameweek_id
      and points=v_top_points;

    select coalesce(array_agg(user_id order by user_id), '{}'::uuid[])
      into v_winners
    from public.group_leaderboard
    where group_id=p_group_id
      and gameweek_id=p_gameweek_id
      and points=v_top_points
      and exact_scores=v_top_exact;
  end if;

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
