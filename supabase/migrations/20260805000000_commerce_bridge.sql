-- Signed WooCommerce commerce bridge state and one-time device activation codes.

alter table public.shops add column if not exists setup_email text;
alter table public.shops add column if not exists country text not null default 'Saudi Arabia';
alter table public.shops add column if not exists city text not null default '';
alter table public.shops add column if not exists session_version bigint not null default 0;

create table if not exists public.commerce_bridge_requests (
  request_id uuid primary key,
  connector_profile text not null,
  action text not null,
  shop_id uuid references public.shops(id) on delete cascade,
  payload_hash text not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists commerce_bridge_requests_shop_idx
  on public.commerce_bridge_requests(shop_id, created_at desc);

create table if not exists public.commerce_device_activation_codes (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  product_key_id uuid not null references public.product_keys(id) on delete cascade,
  code_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists commerce_device_codes_active_idx
  on public.commerce_device_activation_codes(shop_id, expires_at desc)
  where used_at is null;

alter table public.commerce_bridge_requests enable row level security;
alter table public.commerce_device_activation_codes enable row level security;

revoke all on table public.commerce_bridge_requests from public, anon, authenticated;
revoke all on table public.commerce_device_activation_codes from public, anon, authenticated;
grant all on table public.commerce_bridge_requests to service_role;
grant all on table public.commerce_device_activation_codes to service_role;

create or replace function public.activate_product_key_device_with_code(
  p_code_hash text,
  p_product_key_id uuid,
  p_shop_id uuid,
  p_device_fingerprint text,
  p_browser_info text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code_id uuid;
  v_result jsonb;
begin
  select id into v_code_id
  from public.commerce_device_activation_codes
  where code_hash = p_code_hash
    and product_key_id = p_product_key_id
    and shop_id = p_shop_id
    and used_at is null
    and expires_at > now()
  for update;

  if v_code_id is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_activation_code');
  end if;

  v_result := public.activate_product_key_device(
    p_product_key_id,
    p_shop_id,
    p_device_fingerprint,
    p_browser_info
  );

  if coalesce((v_result->>'ok')::boolean, false) then
    update public.commerce_device_activation_codes set used_at = now() where id = v_code_id;
  end if;

  return v_result;
end;
$$;

revoke all on function public.activate_product_key_device_with_code(text, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.activate_product_key_device_with_code(text, uuid, uuid, text, text) to service_role;
