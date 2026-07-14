import { NextResponse } from "next/server";
import { hashProductKey, previewProductKey, stableUuid } from "@/lib/cloud-sync";
import { saveBrandProfileSnapshot } from "@/lib/supabase/brand-assets";
import { getAuthorizedOwnerSession } from "@/lib/supabase/owner-session";
import type { DemoAppState, ProductKeyStatus, User } from "@/types/pos";

type SyncRequest = {
  state?: Partial<
    Pick<DemoAppState, "brand" | "categories" | "licenses" | "productKeys" | "settingsByShop" | "shops">
  > & {
    users?: Pick<User, "email" | "isActive" | "role">[];
  };
};

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "shop"
  );
}

function normalizeStatus(status: ProductKeyStatus) {
  return status === "active" || status === "expired" || status === "locked" || status === "revoked"
    ? status
    : "unused";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isMissingOwnerBillingColumnsError(error: { code?: string; message?: string }) {
  return (
    error.code === "PGRST204" ||
    /billing_cycle|package_price|total_paid|last_owner_payment_at|country|city|auto_payment_enabled|cancelled_at/i.test(error.message ?? "")
  );
}

export async function POST(request: Request) {
  let body: SyncRequest;

  try {
    body = (await request.json()) as SyncRequest;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid owner sync payload." }, { status: 400 });
  }

  if (!body.state) {
    return NextResponse.json({ ok: false, message: "Owner state is required." }, { status: 400 });
  }

  const state = body.state;
  const shops = (state.shops ?? []).filter((shop) => shop.id && shop.name);
  const shopIdMap = new Map(shops.map((shop) => [shop.id, isUuid(shop.id) ? shop.id : stableUuid(`shop:${shop.id}`)]));
  const now = new Date().toISOString();

  try {
    const authorization = await getAuthorizedOwnerSession(request, ["super_admin"]);
    if (!authorization) {
      return NextResponse.json({ ok: false, message: "Owner sync is not authorized." }, { status: 401 });
    }
    const { supabase } = authorization;

    if (state.brand) {
      await saveBrandProfileSnapshot(supabase, state.brand);
    }

    if (shops.length > 0) {
      const shopRows = shops.map((shop) => {
        const cloudShopId = shopIdMap.get(shop.id)!;

        return {
          id: cloudShopId,
          name: shop.name,
          slug: shop.slug || `${slugify(shop.name)}-${cloudShopId.slice(0, 6)}`,
          email: shop.email ?? null,
          website: shop.website ?? null,
          phone: shop.phone ?? "",
          address: shop.address ?? "",
          country: shop.country ?? "Saudi Arabia",
          city: shop.city ?? "",
          currency: shop.currency || "SAR",
          timezone: shop.timezone || "Asia/Riyadh",
          plan_name: shop.planName || "Starter",
          billing_cycle: shop.billingCycle ?? "monthly",
          package_price: Math.max(0, Number(shop.packagePrice ?? 0)),
          total_paid: Math.max(0, Number(shop.totalPaid ?? 0)),
          last_owner_payment_at: shop.lastOwnerPaymentAt ?? null,
          auto_payment_enabled: shop.autoPaymentEnabled ?? false,
          cancelled_at: shop.cancelledAt ?? null,
          license_status: shop.licenseStatus || "trial",
          created_at: shop.createdAt || now,
          updated_at: now
        };
      });
      const { error } = await supabase.from("shops").upsert(shopRows, { onConflict: "id" });

      if (error) {
        if (!isMissingOwnerBillingColumnsError(error)) {
          throw error;
        }

        const fallbackRows = shopRows.map(
          ({ billing_cycle, package_price, total_paid, last_owner_payment_at, country, city, auto_payment_enabled, cancelled_at, ...row }) => row
        );
        const { error: fallbackError } = await supabase.from("shops").upsert(fallbackRows, { onConflict: "id" });

        if (fallbackError) {
          throw fallbackError;
        }
      }
    }

    const licenseRows = (state.licenses ?? [])
      .filter((license) => shopIdMap.has(license.shopId))
      .map((license) => ({
        id: isUuid(license.id) ? license.id : stableUuid(`license:${license.shopId}`),
        shop_id: shopIdMap.get(license.shopId)!,
        status: license.status,
        expires_at: license.expiresAt ?? null,
        last_payment_at: license.lastPaymentAt ?? null,
        auto_lock_days_after_expiry: license.autoLockDaysAfterExpiry ?? 7,
        locked_at: license.lockedAt ?? null,
        lock_reason: license.lockReason ?? null,
        updated_at: now
      }));

    if (licenseRows.length > 0) {
      const { error } = await supabase.from("licenses").upsert(licenseRows, { onConflict: "id" });

      if (error) {
        throw error;
      }
    }

    const productKeyRows = (state.productKeys ?? [])
      .filter((productKey) => shopIdMap.has(productKey.shopId) && productKey.key.trim().length >= 30)
      .map((productKey) => ({
        id: stableUuid(`product-key:${productKey.key.trim()}`),
        shop_id: shopIdMap.get(productKey.shopId)!,
        key_hash: hashProductKey(productKey.key),
        key_preview: previewProductKey(productKey.key),
        status: normalizeStatus(productKey.status),
        allowed_devices: Math.max(1, Math.round(productKey.allowedDevices || 1)),
        created_at: productKey.createdAt ?? now,
        activated_at: productKey.activatedAt ?? null,
        expires_at: productKey.expiresAt ?? null,
        revoked_at: productKey.revokedAt ?? null,
        locked_at: productKey.lockedAt ?? null
      }));

    if (productKeyRows.length > 0) {
      const { error } = await supabase.from("product_keys").upsert(productKeyRows, { onConflict: "key_hash" });

      if (error) {
        throw error;
      }
    }

    const settingsRows = shops.map((shop) => {
      const settings = state.settingsByShop?.[shop.id];
      const pos = settings?.pos;

      return {
        shop_id: shopIdMap.get(shop.id)!,
        shop_name: pos?.shopName || shop.name,
        logo_url: pos?.logoUrl ?? null,
        address: pos?.address ?? shop.address ?? "",
        phone: pos?.phone ?? shop.phone ?? "",
        email: pos?.email ?? shop.email ?? null,
        website: pos?.website ?? shop.website ?? null,
        currency: pos?.currency || shop.currency || "SAR",
        vat_number: pos?.vatNumber ?? null,
        receipt_qr_url: null,
        printer_settings: settings?.printer ?? {},
        receipt_settings: settings?.receipt ?? {},
        tax_settings: settings?.tax ?? {},
        updated_at: now
      };
    });

    if (settingsRows.length > 0) {
      const { error } = await supabase.from("pos_settings").upsert(settingsRows, { onConflict: "shop_id" });

      if (error) {
        throw error;
      }
    }

    const categoryRows = (state.categories ?? [])
      .filter((category) => shopIdMap.has(category.shopId))
      .map((category) => ({
        id: stableUuid(`category:${category.id}`),
        shop_id: shopIdMap.get(category.shopId)!,
        name: category.name,
        description: category.description ?? null,
        created_at: category.createdAt ?? now
      }));

    if (categoryRows.length > 0) {
      const { error } = await supabase.from("product_categories").upsert(categoryRows, { onConflict: "id" });

      if (error) {
        throw error;
      }
    }

    return NextResponse.json({
      brandSynced: Boolean(state.brand),
      ok: true,
      productKeysSynced: productKeyRows.length,
      shopsSynced: shops.length
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Owner sync failed." },
      { status: 500 }
    );
  }
}
