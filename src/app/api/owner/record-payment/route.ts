import { NextResponse } from "next/server";
import { stableUuid } from "@/lib/cloud-sync";
import { isMissingOwnerExtension } from "@/lib/supabase/owner-authorization";
import { getAuthorizedOwnerSession } from "@/lib/supabase/owner-session";

type PaymentPayload = {
  amount?: number;
  billingCycle?: "monthly" | "quarterly" | "yearly";
  expiresAt?: string;
  packageId?: string;
  packagePrice?: number;
  shopId?: string;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(request: Request) {
  let body: PaymentPayload;

  try {
    body = (await request.json()) as PaymentPayload;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid payment payload." }, { status: 400 });
  }

  const requestedShopId = body.shopId?.trim() ?? "";
  const amount = Number(body.amount ?? 0);

  if (!requestedShopId || !Number.isFinite(amount) || amount <= 0 || !body.expiresAt) {
    return NextResponse.json({ ok: false, message: "Store, payment amount, and renewed expiry are required." }, { status: 400 });
  }

  try {
    const authorization = await getAuthorizedOwnerSession(request, ["super_admin"]);
    if (!authorization) {
      return NextResponse.json({ ok: false, message: "Owner payment access is not authorized." }, { status: 401 });
    }
    const { supabase } = authorization;

    const candidateIds = Array.from(new Set([requestedShopId, stableUuid(`shop:${requestedShopId}`)])).filter(isUuid);
    const { data: shop, error: shopError } = await supabase
      .from("shops")
      .select("id, total_paid")
      .in("id", candidateIds)
      .limit(1)
      .maybeSingle();

    if (shopError) throw shopError;
    if (!shop) return NextResponse.json({ ok: false, message: "Cloud store was not found." }, { status: 404 });

    const now = new Date().toISOString();
    const expiresAt = new Date(`${body.expiresAt}T23:59:59`).toISOString();
    const paymentResult = await supabase.from("owner_subscription_payments").insert({
      shop_id: shop.id,
      package_id: body.packageId ?? null,
      amount,
      currency: "SAR",
      status: "paid",
      payment_method: "manual",
      period_start: now,
      period_end: expiresAt,
      note: `Manual ${body.billingCycle ?? "monthly"} renewal`
    });
    const paymentRecorded = !paymentResult.error;

    if (paymentResult.error && !isMissingOwnerExtension(paymentResult.error)) {
      throw paymentResult.error;
    }

    const shopUpdate = {
      total_paid: Math.max(0, Number(shop.total_paid ?? 0)) + amount,
      package_price: Math.max(0, Number(body.packagePrice ?? 0)),
      billing_cycle: body.billingCycle ?? "monthly",
      last_owner_payment_at: now,
      license_status: "active",
      cancelled_at: null,
      updated_at: now
    };
    let { error: shopUpdateError } = await supabase
      .from("shops")
      .update(shopUpdate)
      .eq("id", shop.id);

    if (shopUpdateError && isMissingOwnerExtension(shopUpdateError)) {
      const { cancelled_at, ...legacyShopUpdate } = shopUpdate;
      ({ error: shopUpdateError } = await supabase.from("shops").update(legacyShopUpdate).eq("id", shop.id));
    }

    if (shopUpdateError) throw shopUpdateError;

    const { error: licenseError } = await supabase
      .from("licenses")
      .update({ status: "active", expires_at: expiresAt, last_payment_at: now, locked_at: null, lock_reason: null, updated_at: now })
      .eq("shop_id", shop.id);

    if (licenseError) throw licenseError;

    return NextResponse.json({ ok: true, paymentRecorded });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Unable to record owner payment." },
      { status: 500 }
    );
  }
}
