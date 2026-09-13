-- Additive hardening: no user records are deleted or rewritten by this migration.
-- Table RLS handles membership/payment/kickoff; column grants protect derived data.
revoke insert, update on public.predictions from authenticated;
grant insert (group_id,fixture_id,user_id,predicted_home,predicted_away)
  on public.predictions to authenticated;
grant update (group_id,fixture_id,user_id,predicted_home,predicted_away)
  on public.predictions to authenticated;

create or replace function public.guard_prediction_identity()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.group_id is distinct from old.group_id
     or new.fixture_id is distinct from old.fixture_id
     or new.user_id is distinct from old.user_id then
    raise exception 'prediction identity cannot change';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_prediction_identity on public.predictions;
create trigger guard_prediction_identity before update on public.predictions
for each row execute function public.guard_prediction_identity();

-- Restrictive policy composes with existing allow policies, including For Fun.
drop policy if exists prediction_target_unlocked on public.predictions;
create policy prediction_target_unlocked on public.predictions as restrictive
for update to authenticated using (true) with check (
  exists(select 1 from public.fixtures f where f.id=predictions.fixture_id and now()<f.kickoff)
);

revoke update on public.groups from authenticated;
grant update(name,stake_pence,bank_account_name,bank_sort_code,bank_account_number,
  payments_required,winner_prize,loser_punishment) on public.groups to authenticated;

create or replace function public.guard_payment_update()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then return new; end if;
  if new.group_id is distinct from old.group_id
     or new.gameweek_id is distinct from old.gameweek_id
     or new.user_id is distinct from old.user_id then
    raise exception 'payment identity cannot change';
  end if;
  if public.is_group_treasurer(old.group_id) then return new; end if;
  if old.user_id is distinct from auth.uid() then raise exception 'cannot update another member payment'; end if;
  if new.amount_pence is distinct from old.amount_pence
     or new.confirmed_paid_at is distinct from old.confirmed_paid_at
     or new.confirmed_by is distinct from old.confirmed_by then
    raise exception 'members can only change their own payment claim';
  end if;
  return new;
end;
$$;

create or replace function public.score_fixture_predictions()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  update public.predictions p set points = case
    when new.status in ('FT','AET','PEN') and new.home_goals is not null and new.away_goals is not null
    then public.calculate_prediction_points(p.predicted_home,p.predicted_away,new.home_goals,new.away_goals,p.first_scorer_player_id,new.first_scorer_player_id)
    else 0 end
  where p.fixture_id=new.id;
  return new;
end;
$$;

-- Atomic admission before password verification; concurrent requests cannot lose increments.
create or replace function public.consume_login_attempt(p_identifier_hash text)
returns boolean language plpgsql security definer set search_path='' as $$
declare r public.auth_login_limits;
begin
  if length(p_identifier_hash)<>64 then raise exception 'invalid identifier'; end if;
  insert into public.auth_login_limits(identifier_hash,attempts,window_started_at,updated_at)
  values(p_identifier_hash,0,now(),now()) on conflict do nothing;
  select * into r from public.auth_login_limits where identifier_hash=p_identifier_hash for update;
  if r.blocked_until > now() then return false; end if;
  if r.window_started_at <= now()-interval '15 minutes' then
    r.attempts:=0; r.window_started_at:=now();
  end if;
  if r.attempts>=5 then return false; end if;
  update public.auth_login_limits set attempts=r.attempts+1,window_started_at=r.window_started_at,
    updated_at=now(),blocked_until=null where identifier_hash=p_identifier_hash;
  return true;
end;
$$;
revoke all on function public.consume_login_attempt(text) from public,anon,authenticated;
grant execute on function public.consume_login_attempt(text) to service_role;
revoke all on function public.guard_prediction_identity() from public,anon,authenticated;
revoke all on function public.guard_payment_update() from public,anon,authenticated;
revoke all on function public.score_fixture_predictions() from public,anon,authenticated;

create index if not exists predictions_fixture_lookup on public.predictions(fixture_id);
create index if not exists fixtures_gameweek_kickoff on public.fixtures(gameweek_id,kickoff);
create index if not exists group_members_user_lookup on public.group_members(user_id,group_id);
