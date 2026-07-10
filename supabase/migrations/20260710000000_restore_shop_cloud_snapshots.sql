create table if not exists public.shop_cloud_snapshots (
  shop_id uuid primary key references public.shops(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

alter table public.shop_cloud_snapshots enable row level security;

drop policy if exists "shop_cloud_snapshots tenant read" on public.shop_cloud_snapshots;
create policy "shop_cloud_snapshots tenant read" on public.shop_cloud_snapshots
  for select using (public.is_shop_member(shop_id));

drop policy if exists "shop_cloud_snapshots tenant write" on public.shop_cloud_snapshots;
create policy "shop_cloud_snapshots tenant write" on public.shop_cloud_snapshots
  for all using (public.is_shop_member(shop_id))
  with check (public.is_shop_member(shop_id));

create index if not exists idx_shop_cloud_snapshots_updated on public.shop_cloud_snapshots(updated_at desc);
