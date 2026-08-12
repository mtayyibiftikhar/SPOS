-- Store-bound attendance kiosk credentials and verification evidence.

create table if not exists public.attendance_employee_credentials (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  employee_code text not null,
  pin_hash text,
  pin_enabled boolean not null default true,
  fingerprint_enabled boolean not null default false,
  fingerprint_enrollment_ref text,
  fingerprint_enrolled_at timestamptz,
  personal_biometric_enabled boolean not null default false,
  personal_passkey_count integer not null default 0 check (personal_passkey_count >= 0),
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, user_id)
);

create unique index if not exists attendance_employee_code_unique
  on public.attendance_employee_credentials(shop_id, lower(employee_code));

alter table public.attendance_employee_credentials enable row level security;

drop policy if exists "attendance credentials admin read" on public.attendance_employee_credentials;
create policy "attendance credentials admin read" on public.attendance_employee_credentials for select
  using (public.is_shop_admin(shop_id) or user_id = auth.uid());

drop policy if exists "attendance credentials admin manage" on public.attendance_employee_credentials;
create policy "attendance credentials admin manage" on public.attendance_employee_credentials for all
  using (public.is_shop_admin(shop_id)) with check (public.is_shop_admin(shop_id));

alter table public.attendance_records
  add column if not exists verification_method text,
  add column if not exists verification_strength text,
  add column if not exists attendance_device_id text,
  add column if not exists clock_in_accuracy numeric(10,2),
  add column if not exists clock_out_accuracy numeric(10,2);

alter table public.attendance_records drop constraint if exists attendance_records_source_check;
alter table public.attendance_records add constraint attendance_records_source_check
  check (source in ('qr', 'manual', 'admin_bypass', 'kiosk_pin', 'fingerprint', 'passkey'));

alter table public.attendance_records drop constraint if exists attendance_records_verification_strength_check;
alter table public.attendance_records add constraint attendance_records_verification_strength_check
  check (verification_strength is null or verification_strength in ('basic', 'medium', 'high'));

create index if not exists attendance_credentials_shop_code_idx
  on public.attendance_employee_credentials(shop_id, lower(employee_code));
