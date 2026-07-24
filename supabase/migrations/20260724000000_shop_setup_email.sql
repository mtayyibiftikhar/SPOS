alter table public.shops
  add column if not exists setup_email text;

update public.shops
set setup_email = email
where setup_email is null;
