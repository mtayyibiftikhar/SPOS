import { NextResponse } from "next/server";
import { hashProductKey } from "@/lib/cloud-sync";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type ActivationRequest = {
  browserInfo?: string;
  deviceFingerprint?: string;
  productKey?: string;
};

function resolveEffectiveLicenseStatus(license: {
  auto_lock_days_after_expiry?: number | null;
  expires_at?: string | null;
  status: "trial" | "active" | "expired" | "locked";
}) {
  if (license.status === "locked") {
    return "locked";
  }

  if (!license.expires_at) {
    return license.status;
  }

  const expiresAt = new Date(license.expires_at);

  if (!Number.isFinite(expiresAt.getTime()) || Date.now() <= expiresAt.getTime()) {
    return license.status;
  }

  const daysExpired = Math.floor((Date.now() - expiresAt.getTime()) / 86_400_000);
  const autoLockDays = license.auto_lock_days_after_expiry ?? 0;

  return daysExpired >= autoLockDays ? "locked" : "expired";
}

export async function POST(request: Request) {
  let body: ActivationRequest;

  try {
    body = (await request.json()) as ActivationRequest;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid activation payload." }, { status: 400 });
  }

  const productKey = body.productKey?.trim();
  const deviceFingerprint = body.deviceFingerprint?.trim();

  if (!productKey || !deviceFingerprint) {
    return NextResponse.json(
      { ok: false, message: "Product key and device fingerprint are required." },
      { status: 400 }
    );
  }

  if (productKey.length < 30) {
    return NextResponse.json({ ok: false, message: "Product key must be at least 30 characters." }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const keyHash = hashProductKey(productKey);
    const { data: productKeyRow, error: productKeyError } = await supabase
      .from("product_keys")
      .select("id, shop_id, status, allowed_devices, created_at, activated_at, expires_at")
      .eq("key_hash", keyHash)
      .maybeSingle();

    if (productKeyError) {
      throw productKeyError;
    }

    if (!productKeyRow) {
      return NextResponse.json({ ok: false, message: "Invalid product key." }, { status: 404 });
    }

    if (["revoked", "locked", "expired"].includes(productKeyRow.status)) {
      return NextResponse.json(
        { ok: false, message: `This product key is ${productKeyRow.status}.` },
        { status: 403 }
      );
    }

    if (productKeyRow.expires_at && new Date(productKeyRow.expires_at).getTime() < Date.now()) {
      await supabase.from("product_keys").update({ status: "expired" }).eq("id", productKeyRow.id);

      return NextResponse.json({ ok: false, message: "This product key has expired." }, { status: 403 });
    }

    const { data: license, error: licenseError } = await supabase
      .from("licenses")
      .select("id, status, expires_at, auto_lock_days_after_expiry")
      .eq("shop_id", productKeyRow.shop_id)
      .maybeSingle();

    if (licenseError) {
      throw licenseError;
    }

    if (!license) {
      return NextResponse.json({ ok: false, message: "No license is attached to this shop." }, { status: 403 });
    }

    const licenseStatus = resolveEffectiveLicenseStatus(license);

    if (licenseStatus === "locked") {
      await supabase
        .from("licenses")
        .update({
          locked_at: new Date().toISOString(),
          lock_reason: "Automatically locked during product key activation check.",
          status: "locked"
        })
        .eq("id", license.id);

      return NextResponse.json(
        { ok: false, message: "Your POS is temporarily locked. Please contact support." },
        { status: 403 }
      );
    }

    if (licenseStatus === "expired") {
      await supabase.from("licenses").update({ status: "expired" }).eq("id", license.id);

      return NextResponse.json(
        { ok: false, message: "Your POS license has expired. Please contact support." },
        { status: 403 }
      );
    }

    const { data: existingActivation, error: existingActivationError } = await supabase
      .from("device_activations")
      .select("id")
      .eq("product_key_id", productKeyRow.id)
      .eq("device_fingerprint", deviceFingerprint)
      .maybeSingle();

    if (existingActivationError) {
      throw existingActivationError;
    }

    if (!existingActivation) {
      const { count, error: countError } = await supabase
        .from("device_activations")
        .select("id", { count: "exact", head: true })
        .eq("product_key_id", productKeyRow.id);

      if (countError) {
        throw countError;
      }

      if ((count ?? 0) >= productKeyRow.allowed_devices) {
        return NextResponse.json(
          { ok: false, message: "This product key has reached its device limit." },
          { status: 403 }
        );
      }
    }

    const browserInfo =
      body.browserInfo?.trim() || request.headers.get("user-agent") || "Unknown browser";
    const now = new Date().toISOString();
    const activationPayload: Record<string, string> = {
      browser_info: browserInfo,
      device_fingerprint: deviceFingerprint,
      last_seen_at: now,
      product_key_id: productKeyRow.id,
      shop_id: productKeyRow.shop_id
    };

    if (!existingActivation) {
      activationPayload.activated_at = now;
    }

    await supabase.from("device_activations").upsert(activationPayload, {
      onConflict: "product_key_id,device_fingerprint"
    });

    const productKeyUpdate: Record<string, string> = {
      status: "active"
    };

    if (productKeyRow.status === "unused") {
      productKeyUpdate.activated_at = now;
    }

    await supabase.from("product_keys").update(productKeyUpdate).eq("id", productKeyRow.id);

    await supabase.from("audit_logs").insert({
      action: "product_key.activate",
      detail: `Device activated from ${browserInfo}.`,
      shop_id: productKeyRow.shop_id,
      target_id: productKeyRow.id
    });

    const [
      { data: shop },
      { data: refreshedLicense },
      { data: settings },
      { data: categories },
      { data: activationRow },
      { data: profiles }
    ] = await Promise.all([
      supabase
        .from("shops")
        .select("id, name, slug, email, website, phone, address, currency, timezone, plan_name, license_status, created_at")
        .eq("id", productKeyRow.shop_id)
        .maybeSingle(),
      supabase
        .from("licenses")
        .select("id, shop_id, status, expires_at, last_payment_at, auto_lock_days_after_expiry, locked_at, lock_reason")
        .eq("shop_id", productKeyRow.shop_id)
        .maybeSingle(),
      supabase
        .from("pos_settings")
        .select("shop_id, shop_name, logo_url, address, phone, email, website, currency, vat_number, receipt_qr_url, printer_settings, receipt_settings, tax_settings")
        .eq("shop_id", productKeyRow.shop_id)
        .maybeSingle(),
      supabase
        .from("product_categories")
        .select("id, shop_id, name, description, created_at")
        .eq("shop_id", productKeyRow.shop_id),
      supabase
        .from("device_activations")
        .select("id, shop_id, product_key_id, browser_info, activated_at, last_seen_at")
        .eq("product_key_id", productKeyRow.id)
        .eq("device_fingerprint", deviceFingerprint)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("id, shop_id, name, email, phone, role, is_active, last_login_at, created_at")
        .eq("shop_id", productKeyRow.shop_id)
    ]);

    return NextResponse.json({
      ok: true,
      cloudState: shop
        ? {
            shops: [
              {
                id: shop.id,
                name: shop.name,
                slug: shop.slug,
                email: shop.email ?? undefined,
                website: shop.website ?? undefined,
                phone: shop.phone ?? "",
                address: shop.address ?? "",
                currency: shop.currency ?? "SAR",
                timezone: shop.timezone ?? "Asia/Riyadh",
                planName: shop.plan_name ?? "Starter",
                licenseStatus: shop.license_status,
                createdAt: shop.created_at ?? now
              }
            ],
            licenses: refreshedLicense
              ? [
                  {
                    id: refreshedLicense.id,
                    shopId: refreshedLicense.shop_id,
                    status: refreshedLicense.status,
                    expiresAt: refreshedLicense.expires_at ?? undefined,
                    lastPaymentAt: refreshedLicense.last_payment_at ?? undefined,
                    autoLockDaysAfterExpiry: refreshedLicense.auto_lock_days_after_expiry ?? 7,
                    lockedAt: refreshedLicense.locked_at ?? undefined,
                    lockReason: refreshedLicense.lock_reason ?? undefined
                  }
                ]
              : [],
            productKeys: [
              {
                id: productKeyRow.id,
                key: productKey,
                status: "active",
                shopId: productKeyRow.shop_id,
                allowedDevices: productKeyRow.allowed_devices,
                createdAt: productKeyRow.created_at ?? now,
                activatedAt: productKeyRow.activated_at ?? now,
                expiresAt: productKeyRow.expires_at ?? undefined
              }
            ],
            deviceActivations: activationRow
              ? [
                  {
                    id: activationRow.id,
                    shopId: activationRow.shop_id,
                    productKeyId: activationRow.product_key_id,
                    browserInfo: activationRow.browser_info ?? browserInfo,
                    activatedAt: activationRow.activated_at ?? now,
                    lastSeenAt: activationRow.last_seen_at ?? now
                  }
                ]
              : [],
            categories:
              categories?.map((category) => ({
                id: category.id,
                shopId: category.shop_id,
                name: category.name,
                description: category.description ?? undefined,
                createdAt: category.created_at ?? now
              })) ?? [],
            users:
              profiles?.map((profile) => ({
                id: profile.id,
                shopId: profile.shop_id ?? undefined,
                name: profile.name,
                email: profile.email,
                phone: profile.phone ?? undefined,
                role: profile.role,
                isActive: profile.is_active,
                lastLoginAt: profile.last_login_at ?? undefined,
                createdAt: profile.created_at ?? now
              })) ?? [],
            settingsByShop: {
              [shop.id]: {
                pos: {
                  shopName: settings?.shop_name ?? shop.name,
                  logoUrl: settings?.logo_url ?? undefined,
                  address: settings?.address ?? shop.address ?? "",
                  phone: settings?.phone ?? shop.phone ?? "",
                  email: settings?.email ?? shop.email ?? undefined,
                  website: settings?.website ?? shop.website ?? undefined,
                  currency: settings?.currency ?? shop.currency ?? "SAR",
                  vatNumber: settings?.vat_number ?? undefined,
                  receiptQrUrl: settings?.receipt_qr_url ?? undefined,
                  autoDayRolloverEnabled: false
                },
                printer: settings?.printer_settings ?? {
                  receiptSize: "80mm",
                  autoPrintAfterSale: false
                },
                receipt: settings?.receipt_settings ?? {
                  footerText: `Thank you for visiting ${shop.name}.`,
                  showTax: true,
                  showCustomer: true,
                  showCashier: true,
                  showVatNumber: true,
                  showSecondaryLanguage: false,
                  secondaryLanguage: "ar",
                  receiptSize: "80mm"
                },
                tax: settings?.tax_settings ?? {
                  enabled: true,
                  name: "VAT",
                  rate: 15,
                  mode: "inclusive",
                  showOnReceipt: true
                }
              }
            }
          }
        : null,
      hasShopAdmin: profiles?.some((profile) => profile.role === "shop_admin" && profile.is_active) ?? false,
      licenseStatus,
      shopId: productKeyRow.shop_id
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Activation failed.";

    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
