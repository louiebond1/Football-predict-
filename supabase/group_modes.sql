alter table public.groups add column if not exists payments_required boolean not null default true;
alter table public.groups add column if not exists winner_prize text;
alter table public.groups add column if not exists loser_punishment text;

create or replace function public.apply_group_payment_mode()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_required boolean;
begin
  select g.payments_required into v_required
  from public.groups g
  where g.id = new.group_id;

  if v_required is false then
    new.confirmed_paid_at := coalesce(new.confirmed_paid_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists apply_group_payment_mode on public.payments;
create trigger apply_group_payment_mode
before insert on public.payments
for each row execute function public.apply_group_payment_mode();

create or replace function public.sync_group_payment_mode()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.payments_required is distinct from old.payments_required then
    if new.payments_required is false then
      update public.payments
      set confirmed_paid_at = coalesce(confirmed_paid_at, now())
      where group_id = new.id;
    else
      update public.payments
      set confirmed_paid_at = null
      where group_id = new.id
        and confirmed_by is null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_group_payment_mode on public.groups;
create trigger sync_group_payment_mode
after update of payments_required on public.groups
for each row execute function public.sync_group_payment_mode();
