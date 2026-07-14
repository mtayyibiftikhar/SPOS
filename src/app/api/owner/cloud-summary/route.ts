import { NextResponse } from "next/server";
import { loadBrandProfileSnapshot } from "@/lib/supabase/brand-assets";
import { isMissingOwnerExtension } from "@/lib/supabase/owner-authorization";
import { getAuthorizedOwnerSession } from "@/lib/supabase/owner-session";

function isMissingOwnerBillingColumnsError(error: { code?: string; message?: string }) {
  return (
    error.code === "PGRST204" ||
    /billing_cycle|package_price|total_paid|last_owner_payment_at|country|city|auto_payment_enabled|cancelled_at/i.test(error.message ?? "")
  );
}

export async function GET(request: Request) {
  try {
    const authorization = await getAuthorizedOwnerSession(request);
    if (!authorization) {
      return NextResponse.json({ ok: false, message: "Owner summary is not authorized." }, { status: 401 });
    }
    const { supabase } = authorization;
    const shopsResult = await supabase
      .from("shops")
      .select("id, name, email, phone, address, country, city, plan_name, billing_cycle, package_price, total_paid, last_owner_payment_at, auto_payment_enabled, cancelled_at, license_status, created_at");
    const shops =
      shopsResult.error && isMissingOwnerBillingColumnsError(shopsResult.error)
        ? await supabase.from("shops").select("id, name, email, phone, address, plan_name, license_status, created_at")
        : shopsResult;
    const [
      { data: productKeys, error: productKeysError },
      { data: profiles, error: profilesError },
      { data: devices, error: devicesError },
      { data: licenses, error: licensesError },
      brand
    ] = await Promise.all([
      supabase.from("product_keys").select("id, shop_id, key_preview, status, allowed_devices, activated_at, expires_at"),
      supabase.from("profiles").select("id, shop_id, name, email, phone, role, is_active, last_login_at, created_at"),
      supabase.from("device_activations").select("id, shop_id, product_key_id, browser_info, activated_at, last_seen_at"),
      supabase.from("licenses").select("id, shop_id, status, expires_at, last_payment_at, auto_lock_days_after_expiry, locked_at, lock_reason"),
      loadBrandProfileSnapshot(supabase).catch(() => null)
    ]);

    if (shops.error) throw shops.error;
    if (productKeysError) throw productKeysError;
    if (profilesError) throw profilesError;
    if (devicesError) throw devicesError;
    if (licensesError) throw licensesError;

    const [{ data: packages, error: packagesError }, { data: subscriptionPayments, error: subscriptionPaymentsError }] =
      await Promise.all([
        supabase
          .from("owner_packages")
          .select("id, name, billing_cycle, duration_days, price, currency, is_active, created_at, updated_at")
          .order("price", { ascending: true }),
        supabase
          .from("owner_subscription_payments")
          .select("id, shop_id, package_id, amount, currency, status, payment_method, period_start, period_end, note, created_at")
          .order("created_at", { ascending: false })
      ]);

    if (packagesError && !isMissingOwnerExtension(packagesError)) throw packagesError;
    if (subscriptionPaymentsError && !isMissingOwnerExtension(subscriptionPaymentsError)) throw subscriptionPaymentsError;

    return NextResponse.json({
      ok: true,
      shops: shops.data ?? [],
      brand,
      packages: packages ?? [],
      subscriptionPayments: subscriptionPayments ?? [],
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
