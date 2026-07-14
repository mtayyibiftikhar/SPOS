-- Owner business controls and normalized high-growth records.
-- The POS snapshot remains a compatibility cache; these tables are the queryable source for owner billing and attendance.

alter table public.shops add column if not exists country text not null default 'Saudi Arabia';
alter table public.shops add column if not exists city text not null default '';
alter table public.shops add column if not exists auto_payment_enabled boolean not null default false;
alter table public.shops add column if not exists cancelled_at timestamptz;

create table if not exists public.owner_packages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  billing_cycle text not null check (billing_cycle in ('monthly', 'quarterly', 'yearly')),
  duration_days integer not null check (duration_days > 0),
  price numeric(12,2) not null default 0 check (price >= 0),
  currency text not null default 'SAR',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.owner_subscription_payments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  package_id uuid references public.owner_packages(id) on delete set null,
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null default 'SAR',
  status text not null check (status in ('paid', 'pending', 'cancelled')),
  payment_method text,
  period_start timestamptz,
  period_end timestamptz,
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.product_barcodes (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  barcode text not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (shop_id, barcode)
);

create table if not exists public.payroll_rates (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  hourly_rate numeric(12,2) not null default 0 check (hourly_rate >= 0),
  default_daily_hours numeric(6,2) not null default 8 check (default_daily_hours > 0),
  effective_from date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, user_id, effective_from)
);

create table if not exists public.attendance_qr_sessions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  business_date date not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  business_date date not null,
  clock_in_at timestamptz not null,
  clock_out_at timestamptz,
  scheduled_hours numeric(6,2) not null default 8 check (scheduled_hours > 0),
  paid_hours numeric(6,2) check (paid_hours >= 0),
  hourly_rate numeric(12,2) not null default 0 check (hourly_rate >= 0),
  source text not null default 'manual' check (source in ('qr', 'manual', 'admin_bypass')),
  clock_in_latitude numeric(10,7),
  clock_in_longitude numeric(10,7),
  clock_out_latitude numeric(10,7),
  clock_out_longitude numeric(10,7),
  clock_in_selfie_url text,
  clock_out_selfie_url text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists attendance_one_open_record_per_user
  on public.attendance_records(shop_id, user_id)
  where clock_out_at is null;
create index if not exists attendance_shop_date_idx on public.attendance_records(shop_id, business_date desc);
create index if not exists attendance_user_date_idx on public.attendance_records(user_id, business_date desc);
create index if not exists owner_payments_status_date_idx on public.owner_subscription_payments(status, created_at desc);
create index if not exists owner_payments_shop_date_idx on public.owner_subscription_payments(shop_id, created_at desc);
create index if not exists shops_status_created_idx on public.shops(license_status, created_at desc);
create index if not exists shops_location_idx on public.shops(country, city);
create index if not exists product_barcodes_lookup_idx on public.product_barcodes(shop_id, barcode);
create index if not exists shop_snapshots_updated_idx on public.shop_cloud_snapshots(updated_at desc);
create unique index if not exists owner_packages_name_cycle_idx on public.owner_packages(lower(name), billing_cycle);

alter table public.owner_packages enable row level security;
alter table public.owner_subscription_payments enable row level security;
alter table public.product_barcodes enable row level security;
alter table public.payroll_rates enable row level security;
alter table public.attendance_qr_sessions enable row level security;
alter table public.attendance_records enable row level security;

create or replace function public.is_shop_admin(target_shop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_owner() or exists (
    select 1
    from public.profiles profile
    where profile.id = auth.uid()
      and profile.shop_id = target_shop_id
      and profile.is_active = true
      and profile.role = 'shop_admin'
  );
$$;

drop policy if exists "owners manage packages" on public.owner_packages;
create policy "owners manage packages" on public.owner_packages for all
  using (public.is_owner()) with check (public.is_owner());

drop policy if exists "owners manage subscription payments" on public.owner_subscription_payments;
create policy "owners manage subscription payments" on public.owner_subscription_payments for all
  using (public.is_owner()) with check (public.is_owner());

drop policy if exists "owner or tenant product barcodes" on public.product_barcodes;
create policy "owner or tenant product barcodes" on public.product_barcodes for all
  using (public.is_owner() or public.is_shop_member(shop_id))
  with check (public.is_owner() or public.is_shop_member(shop_id));

drop policy if exists "owner or tenant payroll rates" on public.payroll_rates;
create policy "owner or tenant payroll rates" on public.payroll_rates for all
  using (public.is_shop_admin(shop_id))
  with check (public.is_shop_admin(shop_id));

drop policy if exists "owner or tenant attendance qr" on public.attendance_qr_sessions;
create policy "owner or tenant attendance qr" on public.attendance_qr_sessions for all
  using (public.is_shop_admin(shop_id))
  with check (public.is_shop_admin(shop_id));

drop policy if exists "owner or tenant attendance" on public.attendance_records;
drop policy if exists "attendance read" on public.attendance_records;
create policy "attendance read" on public.attendance_records for select
  using (public.is_shop_admin(shop_id) or user_id = auth.uid());

drop policy if exists "attendance create" on public.attendance_records;
create policy "attendance create" on public.attendance_records for insert
  with check (public.is_shop_admin(shop_id) or (user_id = auth.uid() and public.is_shop_member(shop_id)));

drop policy if exists "attendance update" on public.attendance_records;
create policy "attendance update" on public.attendance_records for update
  using (public.is_shop_admin(shop_id) or user_id = auth.uid())
  with check (public.is_shop_admin(shop_id) or user_id = auth.uid());

drop policy if exists "attendance delete" on public.attendance_records;
create policy "attendance delete" on public.attendance_records for delete
  using (public.is_shop_admin(shop_id));
