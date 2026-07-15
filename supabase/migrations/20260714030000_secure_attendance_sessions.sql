alter table public.attendance_qr_sessions
  add column if not exists user_id uuid references public.profiles(id) on delete cascade,
  add column if not exists used_at timestamptz;

create index if not exists attendance_qr_shop_user_date_idx
  on public.attendance_qr_sessions(shop_id, user_id, business_date, expires_at desc);
