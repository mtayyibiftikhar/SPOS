create or replace function public.activate_product_key_device(
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
  v_activation_id uuid;
  v_allowed_devices integer;
  v_device_count integer;
  v_expires_at timestamptz;
  v_license_auto_lock_days integer;
  v_license_expires_at timestamptz;
  v_license_status text;
  v_now timestamptz := clock_timestamp();
  v_status public.product_key_status;
begin
  if coalesce(trim(p_device_fingerprint), '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_device');
  end if;

  select status, allowed_devices, expires_at
    into v_status, v_allowed_devices, v_expires_at
    from public.product_keys
   where id = p_product_key_id and shop_id = p_shop_id
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'key_not_found');
  end if;

  if v_status in ('revoked', 'locked', 'expired') then
    return jsonb_build_object('ok', false, 'reason', v_status::text);
  end if;

  if v_expires_at is not null and v_expires_at < v_now then
    update public.product_keys set status = 'expired' where id = p_product_key_id;
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;

  select status::text, expires_at, auto_lock_days_after_expiry
    into v_license_status, v_license_expires_at, v_license_auto_lock_days
    from public.licenses
   where shop_id = p_shop_id
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_license');
  end if;

  if v_license_status = 'locked' then
    return jsonb_build_object('ok', false, 'reason', 'license_locked');
  end if;

  if v_license_status = 'expired' then
    return jsonb_build_object('ok', false, 'reason', 'license_expired');
  end if;

  if v_license_expires_at is not null and v_license_expires_at < v_now then
    if floor(extract(epoch from (v_now - v_license_expires_at)) / 86400)
      >= greatest(0, coalesce(v_license_auto_lock_days, 0)) then
      return jsonb_build_object('ok', false, 'reason', 'license_locked');
    end if;

    return jsonb_build_object('ok', false, 'reason', 'license_expired');
  end if;

  select id
    into v_activation_id
    from public.device_activations
   where product_key_id = p_product_key_id
     and device_fingerprint = p_device_fingerprint
   limit 1;

  if v_activation_id is not null then
    update public.device_activations
       set browser_info = coalesce(nullif(trim(p_browser_info), ''), browser_info),
           last_seen_at = v_now
     where id = v_activation_id;

    update public.product_keys
       set status = 'active',
           activated_at = coalesce(activated_at, v_now)
     where id = p_product_key_id;

    return jsonb_build_object('ok', true, 'activation_id', v_activation_id, 'existing', true);
  end if;

  select count(*)::integer
    into v_device_count
    from public.device_activations
   where product_key_id = p_product_key_id;

  if v_device_count >= greatest(1, coalesce(v_allowed_devices, 1)) then
    return jsonb_build_object('ok', false, 'reason', 'device_limit');
  end if;

  insert into public.device_activations(
    shop_id,
    product_key_id,
    device_fingerprint,
    browser_info,
    activated_at,
    last_seen_at
  )
  values (
    p_shop_id,
    p_product_key_id,
    p_device_fingerprint,
    nullif(trim(p_browser_info), ''),
    v_now,
    v_now
  )
  returning id into v_activation_id;

  update public.product_keys
     set status = 'active',
         activated_at = coalesce(activated_at, v_now)
   where id = p_product_key_id;

  return jsonb_build_object('ok', true, 'activation_id', v_activation_id, 'existing', false);
end;
$$;

revoke all on function public.activate_product_key_device(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.activate_product_key_device(uuid, uuid, text, text) to service_role;
