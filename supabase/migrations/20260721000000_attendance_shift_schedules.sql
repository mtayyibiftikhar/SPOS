alter table public.payroll_rates
  add column if not exists shift_start_time text not null default '08:00',
  add column if not exists shift_end_time text not null default '16:00',
  add column if not exists overnight_shift boolean not null default false;

alter table public.attendance_records
  add column if not exists shift_start_time text not null default '08:00',
  add column if not exists shift_end_time text not null default '16:00',
  add column if not exists overnight_shift boolean not null default false;

alter table public.payroll_rates
  drop constraint if exists payroll_rates_shift_start_time_check,
  drop constraint if exists payroll_rates_shift_end_time_check,
  add constraint payroll_rates_shift_start_time_check
    check (shift_start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  add constraint payroll_rates_shift_end_time_check
    check (shift_end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

alter table public.attendance_records
  drop constraint if exists attendance_records_shift_start_time_check,
  drop constraint if exists attendance_records_shift_end_time_check,
  add constraint attendance_records_shift_start_time_check
    check (shift_start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  add constraint attendance_records_shift_end_time_check
    check (shift_end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

create index if not exists attendance_records_open_shop_idx
  on public.attendance_records (shop_id, business_date)
  where clock_out_at is null;
