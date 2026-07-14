alter table public.profiles
  drop constraint if exists profile_shop_required_for_shop_roles;

alter table public.profiles
  add constraint profile_shop_required_for_shop_roles check (
    (role = 'super_admin' and shop_id is null) or
    (role in ('shop_admin', 'cashier') and shop_id is not null) or
    role = 'support'
  );

create index if not exists profiles_owner_team_idx
  on public.profiles (role, is_active)
  where shop_id is null;
