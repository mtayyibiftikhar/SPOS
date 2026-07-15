-- Keep the live shop record aligned with the owner billing APIs.
-- These columns were part of the original shared-tenant migration, but older
-- projects created before that revision may not have received the ALTERs.

alter table public.shops
  add column if not exists billing_cycle text not null default 'monthly',
  add column if not exists package_price numeric(12,2) not null default 0,
  add column if not exists total_paid numeric(12,2) not null default 0,
  add column if not exists last_owner_payment_at timestamptz;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.shops'::regclass
       and conname = 'shops_billing_cycle_check'
  ) then
    alter table public.shops
      add constraint shops_billing_cycle_check
      check (billing_cycle in ('monthly', 'quarterly', 'yearly'));
  end if;
end $$;
