import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const ownerEmail = request.headers.get("x-owner-email")?.trim().toLowerCase();
  const expectedOwnerEmail = process.env.POS_OWNER_EMAIL?.trim().toLowerCase();

  if (expectedOwnerEmail && ownerEmail !== expectedOwnerEmail) {
    return NextResponse.json({ ok: false, message: "Owner summary is not authorized." }, { status: 401 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const [
      { data: shops, error: shopsError },
      { data: productKeys, error: productKeysError },
      { data: profiles, error: profilesError },
      { data: devices, error: devicesError },
      { data: licenses, error: licensesError }
    ] = await Promise.all([
      supabase.from("shops").select("id, name, email, phone, address, plan_name, license_status, created_at"),
      supabase.from("product_keys").select("id, shop_id, key_preview, status, allowed_devices, activated_at, expires_at"),
      supabase.from("profiles").select("id, shop_id, name, email, phone, role, is_active, last_login_at, created_at"),
      supabase.from("device_activations").select("id, shop_id, product_key_id, browser_info, activated_at, last_seen_at"),
      supabase.from("licenses").select("id, shop_id, status, expires_at, last_payment_at, auto_lock_days_after_expiry, locked_at, lock_reason")
    ]);

    if (shopsError) throw shopsError;
    if (productKeysError) throw productKeysError;
    if (profilesError) throw profilesError;
    if (devicesError) throw devicesError;
    if (licensesError) throw licensesError;

    return NextResponse.json({
      ok: true,
      shops: shops ?? [],
      productKeys: productKeys ?? [],
      profiles: profiles ?? [],
      devices: devices ?? [],
      licenses: licenses ?? []
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Unable to load owner cloud summary." },
      { status: 500 }
    );
  }
}
