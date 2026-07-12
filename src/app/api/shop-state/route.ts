import { NextResponse } from "next/server";
import { hashProductKey } from "@/lib/cloud-sync";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadBrandProfileSnapshot } from "@/lib/supabase/brand-assets";
import type { DemoAppState, ProductKey } from "@/types/pos";

const SNAPSHOT_BUCKET = "shop-cloud-snapshots";

type ShopStateRequest = {
  shopId?: string;
  state?: Partial<DemoAppState>;
};

function clean(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function isMissingSnapshotTableError(error: { code?: string; message?: string }) {
  return error.code === "42P01" || error.code === "PGRST205" || /shop_cloud_snapshots/i.test(error.message ?? "");
}

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

async function loadOwnerControlledShopState(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  shopId: string,
  currentState: Partial<DemoAppState>
) {
  const [
    { data: shop, error: shopError },
    { data: license, error: licenseError },
    { data: productKeys, error: productKeysError },
    { data: devices, error: devicesError },
    { data: settings, error: settingsError },
    { data: profiles, error: profilesError },
    { data: auditLogs, error: auditLogsError }
  ] = await Promise.all([
    supabase
      .from("shops")
      .select(
        "id, name, slug, email, website, phone, address, currency, timezone, plan_name, billing_cycle, package_price, total_paid, last_owner_payment_at, license_status, created_at"
      )
      .eq("id", shopId)
      .maybeSingle(),
    supabase
      .from("licenses")
      .select("id, shop_id, status, expires_at, last_payment_at, auto_lock_days_after_expiry, locked_at, lock_reason")
      .eq("shop_id", shopId)
      .maybeSingle(),
    supabase
      .from("product_keys")
      .select("id, shop_id, status, allowed_devices, activated_at, expires_at, revoked_at, locked_at")
      .eq("shop_id", shopId),
    supabase
      .from("device_activations")
      .select("id, shop_id, product_key_id, browser_info, activated_at, last_seen_at")
      .eq("shop_id", shopId),
    supabase
      .from("pos_settings")
      .select("shop_id, shop_name, logo_url, address, phone, email, website, currency, vat_number, printer_settings, receipt_settings, tax_settings")
      .eq("shop_id", shopId)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("id, shop_id, name, email, phone, role, is_active, last_login_at, created_at")
      .eq("shop_id", shopId),
    supabase
      .from("audit_logs")
      .select("id, shop_id, action, target_id, detail, created_at")
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false })
      .limit(75)
  ]);

  if (shopError) throw shopError;
  if (licenseError) throw licenseError;
  if (productKeysError) throw productKeysError;
  if (devicesError) throw devicesError;
  if (settingsError) throw settingsError;
  if (profilesError) throw profilesError;
  if (auditLogsError) throw auditLogsError;

  const existingProductKeys = currentState.productKeys?.filter((key) => key.shopId === shopId) ?? [];
  const authoritativeProductKeys = (productKeys ?? []).reduce<ProductKey[]>((keys, keyRow) => {
    const existingKey =
      existingProductKeys.find((key) => key.id === keyRow.id) ??
      ((productKeys ?? []).length === 1 ? existingProductKeys[0] : undefined);

    if (!existingKey?.key) {
      return keys;
    }

    keys.push({
      ...existingKey,
      id: keyRow.id,
      shopId: keyRow.shop_id,
      status: keyRow.status,
      allowedDevices: Math.max(1, Number(keyRow.allowed_devices ?? existingKey.allowedDevices ?? 1)),
      activatedAt: keyRow.activated_at ?? existingKey.activatedAt,
      expiresAt: keyRow.expires_at ?? undefined,
      revokedAt: keyRow.revoked_at ?? undefined,
      lockedAt: keyRow.locked_at ?? undefined
    });

    return keys;
  }, []);

  return {
    ...(shop
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
              billingCycle: shop.billing_cycle ?? undefined,
              packagePrice: Number(shop.package_price ?? 0),
              totalPaid: Number(shop.total_paid ?? 0),
              lastOwnerPaymentAt: shop.last_owner_payment_at ?? undefined,
              licenseStatus: shop.license_status,
              createdAt: shop.created_at ?? new Date().toISOString()
            }
          ]
        }
      : {}),
    ...(license
      ? {
          licenses: [
            {
              id: license.id,
              shopId: license.shop_id,
              status: license.status,
              expiresAt: license.expires_at ?? undefined,
              lastPaymentAt: license.last_payment_at ?? undefined,
              autoLockDaysAfterExpiry: license.auto_lock_days_after_expiry ?? 7,
              lockedAt: license.locked_at ?? undefined,
              lockReason: license.lock_reason ?? undefined
            }
          ]
        }
      : {}),
    ...(authoritativeProductKeys.length > 0 ? { productKeys: authoritativeProductKeys } : {}),
    deviceActivations:
      devices?.map((device) => ({
        id: device.id,
        shopId: device.shop_id,
        productKeyId: device.product_key_id,
        browserInfo: device.browser_info ?? "Unknown device",
        activatedAt: device.activated_at ?? new Date().toISOString(),
        lastSeenAt: device.last_seen_at ?? new Date().toISOString()
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
        createdAt: profile.created_at ?? new Date().toISOString()
      })) ?? [],
    auditLogs:
      auditLogs?.map((log) => ({
        id: log.id,
        shopId: log.shop_id ?? undefined,
        actorId: "owner",
        action: log.action,
        targetId: log.target_id ?? undefined,
        detail: log.detail ?? undefined,
        createdAt: log.created_at ?? new Date().toISOString()
      })) ?? [],
    ...(shop
      ? {
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
                autoDayRolloverEnabled: Boolean((currentState.settingsByShop?.[shop.id]?.pos as { autoDayRolloverEnabled?: boolean } | undefined)?.autoDayRolloverEnabled)
              },
              printer:
                settings?.printer_settings ??
                currentState.settingsByShop?.[shop.id]?.printer ?? {
                  receiptSize: "80mm",
                  autoPrintAfterSale: false
                },
              receipt:
                settings?.receipt_settings ??
                currentState.settingsByShop?.[shop.id]?.receipt ?? {
                  footerText: `Thank you for visiting ${shop.name}.`,
                  showTax: true,
                  showCustomer: true,
                  showCashier: true,
                  showVatNumber: true,
                  showSecondaryLanguage: false,
                  secondaryLanguage: "ar",
                  receiptSize: "80mm"
                },
              tax:
                settings?.tax_settings ??
                currentState.settingsByShop?.[shop.id]?.tax ?? {
                  enabled: true,
                  name: "VAT",
                  rate: 15,
                  mode: "inclusive",
                  showOnReceipt: true
                }
            }
          }
        }
      : {})
  } satisfies Partial<DemoAppState>;
}

function mergeOwnerControlledShopState(
  currentState: Partial<DemoAppState>,
  ownerState: Partial<DemoAppState>,
  brand: Partial<DemoAppState["brand"]> | null
) {
  return {
    ...currentState,
    ...ownerState,
    brand: brand ? ({ ...(currentState.brand ?? {}), ...brand } as DemoAppState["brand"]) : currentState.brand,
    settingsByShop: {
      ...(currentState.settingsByShop ?? {}),
      ...(ownerState.settingsByShop ?? {})
    }
  } satisfies Partial<DemoAppState>;
}

async function assertShopCanAccessCloudState(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  shopId: string
) {
  const [{ data: shop, error: shopError }, { data: license, error: licenseError }] = await Promise.all([
    supabase.from("shops").select("id, license_status").eq("id", shopId).maybeSingle(),
    supabase
      .from("licenses")
      .select("id, status, expires_at, auto_lock_days_after_expiry")
      .eq("shop_id", shopId)
      .maybeSingle()
  ]);

  if (shopError) {
    throw shopError;
  }

  if (licenseError) {
    throw licenseError;
  }

  if (!shop || !license) {
    return {
      ok: false,
      message: "Shop or license was not found.",
      status: "missing" as const
    };
  }

  const licenseStatus = resolveEffectiveLicenseStatus(license);

  if (licenseStatus === "locked") {
    await supabase
      .from("licenses")
      .update({
        locked_at: new Date().toISOString(),
        lock_reason: "Automatically locked during shop cloud state check.",
        status: "locked"
      })
      .eq("id", license.id);

    return {
      ok: false,
      message: "Your POS is temporarily locked. Please contact support.",
      status: "locked" as const
    };
  }

  if (licenseStatus === "expired") {
    await supabase.from("licenses").update({ status: "expired" }).eq("id", license.id);

    return {
      ok: false,
      message: "Your POS license has expired. Please contact support.",
      status: "expired" as const
    };
  }

  return {
    ok: true,
    message: null,
    status: licenseStatus
  };
}

async function ensureSnapshotBucket(supabase: ReturnType<typeof createSupabaseAdminClient>) {
  const { error } = await supabase.storage.createBucket(SNAPSHOT_BUCKET, {
    public: false
  });

  if (error && !/already exists|duplicate/i.test(error.message)) {
    throw error;
  }
}

async function loadSnapshotFromStorage(supabase: ReturnType<typeof createSupabaseAdminClient>, shopId: string) {
  const { data, error } = await supabase.storage.from(SNAPSHOT_BUCKET).download(`${shopId}/state.json`);

  if (error) {
    if (/not found|does not exist|object|bucket/i.test(error.message)) {
      return null;
    }

    throw error;
  }

  const text = await data.text();

  return text ? (JSON.parse(text) as Partial<DemoAppState>) : null;
}

async function saveSnapshotToStorage(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  shopId: string,
  state: Partial<DemoAppState>
) {
  await ensureSnapshotBucket(supabase);

  const { error } = await supabase.storage.from(SNAPSHOT_BUCKET).upload(`${shopId}/state.json`, JSON.stringify(state), {
    contentType: "application/json",
    upsert: true
  });

  if (error) {
    throw error;
  }
}

async function authorizeShopStateAccess(request: Request, shopId: string) {
  const supabase = createSupabaseAdminClient();
  const userId = clean(request.headers.get("x-user-id"));
  const userEmail = clean(request.headers.get("x-user-email")).toLowerCase();
  const productKey = clean(request.headers.get("x-product-key"));
  const shopCanAccessCloudState = await assertShopCanAccessCloudState(supabase, shopId);

  if (!shopCanAccessCloudState.ok) {
    return { ...shopCanAccessCloudState, supabase, userId: null };
  }

  if (userId) {
    let query = supabase
      .from("profiles")
      .select("id, shop_id, email, role, is_active")
      .eq("shop_id", shopId)
      .eq("id", userId)
      .eq("is_active", true)
      .neq("role", "super_admin");

    if (userEmail) {
      query = query.eq("email", userEmail);
    }

    const { data: profile, error } = await query.maybeSingle();

    if (error) {
      throw error;
    }

    if (profile) {
      return { ok: true, supabase, userId: profile.id };
    }
  }

  if (productKey.length >= 30) {
    const { data: keyRow, error } = await supabase
      .from("product_keys")
      .select("id, shop_id, status")
      .eq("key_hash", hashProductKey(productKey))
      .eq("shop_id", shopId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (keyRow && keyRow.status !== "revoked" && keyRow.status !== "locked" && keyRow.status !== "expired") {
      return { ok: true, supabase, userId: null };
    }
  }

  return { ok: false, message: "Shop cloud state is not authorized.", status: "unauthorized" as const, supabase, userId: null };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const shopId = clean(url.searchParams.get("shopId") ?? request.headers.get("x-shop-id"));

  if (!shopId) {
    return NextResponse.json({ ok: false, message: "Shop id is required." }, { status: 400 });
  }

  try {
    const authorization = await authorizeShopStateAccess(request, shopId);

    if (!authorization.ok) {
      const statusCode = authorization.status === "locked" ? 423 : authorization.status === "expired" ? 402 : 401;

      return NextResponse.json(
        { ok: false, licenseStatus: authorization.status, message: authorization.message },
        { status: statusCode }
      );
    }

    const { data, error } = await authorization.supabase
      .from("shop_cloud_snapshots")
      .select("state, updated_at")
      .eq("shop_id", shopId)
      .maybeSingle();

    if (error) {
      if (isMissingSnapshotTableError(error)) {
        const state = await loadSnapshotFromStorage(authorization.supabase, shopId);
        const brand = await loadBrandProfileSnapshot(authorization.supabase).catch(() => null);
        const ownerState = await loadOwnerControlledShopState(authorization.supabase, shopId, (state ?? {}) as Partial<DemoAppState>);

        return NextResponse.json({
          ok: true,
          state: mergeOwnerControlledShopState((state ?? {}) as Partial<DemoAppState>, ownerState, brand),
          storageFallback: true,
          updatedAt: null
        });
      }

      throw error;
    }

    const brand = await loadBrandProfileSnapshot(authorization.supabase).catch(() => null);
    const snapshotState = ((data?.state as Partial<DemoAppState> | null) ?? {}) as Partial<DemoAppState>;
    const ownerState = await loadOwnerControlledShopState(authorization.supabase, shopId, snapshotState);

    return NextResponse.json({
      ok: true,
      state: mergeOwnerControlledShopState(snapshotState, ownerState, brand),
      updatedAt: data?.updated_at ?? null
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Unable to load shop cloud state." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  let body: ShopStateRequest;

  try {
    body = (await request.json()) as ShopStateRequest;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid shop state payload." }, { status: 400 });
  }

  const shopId = clean(body.shopId ?? request.headers.get("x-shop-id"));

  if (!shopId || !body.state) {
    return NextResponse.json({ ok: false, message: "Shop id and state are required." }, { status: 400 });
  }

  try {
    const authorization = await authorizeShopStateAccess(request, shopId);

    if (!authorization.ok) {
      const statusCode = authorization.status === "locked" ? 423 : authorization.status === "expired" ? 402 : 401;

      return NextResponse.json(
        { ok: false, licenseStatus: authorization.status, message: authorization.message },
        { status: statusCode }
      );
    }

    const { error } = await authorization.supabase.from("shop_cloud_snapshots").upsert(
      {
        shop_id: shopId,
        state: body.state,
        updated_by: authorization.userId,
        updated_at: new Date().toISOString()
      },
      { onConflict: "shop_id" }
    );

    if (error) {
      if (isMissingSnapshotTableError(error)) {
        await saveSnapshotToStorage(authorization.supabase, shopId, body.state);

        return NextResponse.json({ ok: true, storageFallback: true });
      }

      throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Unable to save shop cloud state." },
      { status: 500 }
    );
  }
}
