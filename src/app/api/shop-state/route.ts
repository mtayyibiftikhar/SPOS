import { NextResponse } from "next/server";
import {
  calculateScheduledAttendanceClosure,
  DEFAULT_SHIFT_END_TIME,
  DEFAULT_SHIFT_START_TIME
} from "@/lib/attendance";
import { closeExpiredAttendanceRecords } from "@/lib/server/attendance-rollover";
import { applyCriticalShopMutation, type CriticalShopMutation } from "@/lib/server/shop-snapshot-mutations";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadBrandProfileSnapshot } from "@/lib/supabase/brand-assets";
import { readShopDeviceSession, readShopUserSession } from "@/lib/supabase/shop-session";
import type { DemoAppState, ProductKey, UserRole } from "@/types/pos";

const SNAPSHOT_BUCKET = "shop-cloud-snapshots";

type ShopStateRequest = {
  expectedRevision?: number;
  mutation?: CriticalShopMutation;
  operationId?: string;
  shopId?: string;
  state?: Partial<DemoAppState>;
};

function clean(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function isMissingSnapshotTableError(error: { code?: string; message?: string }) {
  return error.code === "42P01" || error.code === "PGRST205" || /shop_cloud_snapshots/i.test(error.message ?? "");
}

function isMissingTransactionalSnapshotError(error: { code?: string; message?: string }) {
  return (
    error.code === "42883" ||
    error.code === "PGRST202" ||
    /commit_shop_cloud_snapshot|revision/i.test(error.message ?? "")
  );
}

async function closeOpenAttendanceForBusinessDay(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  shopId: string,
  businessDate: string,
  actorId: string
) {
  const { data: openRecords, error: recordsError } = await supabase
    .from("attendance_records")
    .select("*")
    .eq("shop_id", shopId)
    .eq("business_date", businessDate)
    .is("clock_out_at", null);

  if (recordsError) throw recordsError;
  if (!openRecords?.length) return;

  const now = new Date();
  const closures = openRecords.flatMap((record) => {
    const closure = calculateScheduledAttendanceClosure(
      {
        businessDate: String(record.business_date),
        clockInAt: String(record.clock_in_at),
        overnightShift: Boolean(record.overnight_shift),
        scheduledHours: Number(record.scheduled_hours ?? 8),
        shiftEndTime: String(record.shift_end_time ?? DEFAULT_SHIFT_END_TIME),
        shiftStartTime: String(record.shift_start_time ?? DEFAULT_SHIFT_START_TIME)
      },
      now
    );

    return closure ? [{ closure, record }] : [];
  });

  if (!closures.length) return;

  const updates = await Promise.all(
    closures.map(({ closure, record }) =>
      supabase
        .from("attendance_records")
        .update({
          clock_out_at: closure.clockOutAt,
          note: record.note || "Auto closed at the employee's scheduled shift end.",
          paid_hours: closure.paidHours,
          updated_at: now.toISOString()
        })
        .eq("id", record.id)
        .eq("shop_id", shopId)
    )
  );
  const failedUpdate = updates.find((update) => update.error);

  if (failedUpdate?.error) throw failedUpdate.error;

  const { error: auditError } = await supabase.from("audit_logs").insert({
    action: "attendance.day_close",
    actor_id: actorId,
    detail: `${closures.length} eligible attendance record(s) auto closed for ${businessDate}.`,
    shop_id: shopId,
    target_id: businessDate
  });

  if (auditError) throw auditError;
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
  await closeExpiredAttendanceRecords(supabase, shopId);

  const [
    { data: shop, error: shopError },
    { data: license, error: licenseError },
    { data: productKeys, error: productKeysError },
    { data: devices, error: devicesError },
    { data: settings, error: settingsError },
    { data: profiles, error: profilesError },
    { data: auditLogs, error: auditLogsError },
    { data: attendanceRecords, error: attendanceRecordsError },
    { data: payrollRates, error: payrollRatesError }
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
      .limit(75),
    supabase
      .from("attendance_records")
      .select("*")
      .eq("shop_id", shopId)
      .order("clock_in_at", { ascending: false })
      .limit(500),
    supabase
      .from("payroll_rates")
      .select("*")
      .eq("shop_id", shopId)
      .order("effective_from", { ascending: false })
  ]);

  if (shopError) throw shopError;
  if (licenseError) throw licenseError;
  if (productKeysError) throw productKeysError;
  if (devicesError) throw devicesError;
  if (settingsError) throw settingsError;
  if (profilesError) throw profilesError;
  if (auditLogsError) throw auditLogsError;
  if (attendanceRecordsError) throw attendanceRecordsError;
  if (payrollRatesError) throw payrollRatesError;

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
    attendanceRecords:
      attendanceRecords?.map((record) => ({
        id: record.id,
        shopId: record.shop_id,
        userId: record.user_id,
        businessDate: record.business_date,
        status: record.clock_out_at ? "closed" : "open",
        source: record.source,
        clockInAt: record.clock_in_at,
        clockOutAt: record.clock_out_at ?? undefined,
        clockInLocation:
          record.clock_in_latitude != null && record.clock_in_longitude != null
            ? {
                latitude: Number(record.clock_in_latitude),
                longitude: Number(record.clock_in_longitude),
                capturedAt: record.clock_in_at
              }
            : undefined,
        clockOutLocation:
          record.clock_out_latitude != null && record.clock_out_longitude != null && record.clock_out_at
            ? {
                latitude: Number(record.clock_out_latitude),
                longitude: Number(record.clock_out_longitude),
                capturedAt: record.clock_out_at
              }
            : undefined,
        clockInSelfieUrl: record.clock_in_selfie_url ?? undefined,
        clockOutSelfieUrl: record.clock_out_selfie_url ?? undefined,
        scheduledHours: Number(record.scheduled_hours ?? 8),
        shiftStartTime: record.shift_start_time ?? DEFAULT_SHIFT_START_TIME,
        shiftEndTime: record.shift_end_time ?? DEFAULT_SHIFT_END_TIME,
        overnightShift: Boolean(record.overnight_shift),
        paidHours: record.paid_hours == null ? undefined : Number(record.paid_hours),
        hourlyRate: Number(record.hourly_rate ?? 0),
        note: record.note ?? undefined,
        editedAt: record.updated_at ?? undefined,
        createdAt: record.created_at
      })) ?? [],
    payrollRates:
      payrollRates?.map((rate) => ({
        id: rate.id,
        shopId: rate.shop_id,
        userId: rate.user_id,
        hourlyRate: Number(rate.hourly_rate ?? 0),
        defaultDailyHours: Number(rate.default_daily_hours ?? 8),
        shiftStartTime: rate.shift_start_time ?? DEFAULT_SHIFT_START_TIME,
        shiftEndTime: rate.shift_end_time ?? DEFAULT_SHIFT_END_TIME,
        overnightShift: Boolean(rate.overnight_shift),
        currency: currentState.shops?.find((entry) => entry.id === shopId)?.currency ?? "SAR",
        createdAt: rate.created_at,
        updatedAt: rate.updated_at
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
                autoDayRolloverEnabled: Boolean((currentState.settingsByShop?.[shop.id]?.pos as { autoDayRolloverEnabled?: boolean } | undefined)?.autoDayRolloverEnabled),
                attendanceEnabled:
                  (currentState.settingsByShop?.[shop.id]?.pos as { attendanceEnabled?: boolean } | undefined)
                    ?.attendanceEnabled ?? true,
                attendanceAllowQrLink:
                  (currentState.settingsByShop?.[shop.id]?.pos as { attendanceAllowQrLink?: boolean } | undefined)
                    ?.attendanceAllowQrLink ?? true,
                attendanceRequireLocation:
                  (currentState.settingsByShop?.[shop.id]?.pos as { attendanceRequireLocation?: boolean } | undefined)
                    ?.attendanceRequireLocation ?? true,
                attendanceRequireSelfie:
                  (currentState.settingsByShop?.[shop.id]?.pos as { attendanceRequireSelfie?: boolean } | undefined)
                    ?.attendanceRequireSelfie ?? false
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
  const settingsByShop = {
    ...(ownerState.settingsByShop ?? {})
  };

  for (const [shopId, currentSettings] of Object.entries(currentState.settingsByShop ?? {})) {
    const ownerSettings = settingsByShop[shopId];

    settingsByShop[shopId] = ownerSettings
      ? {
          ...ownerSettings,
          ...currentSettings,
          pos: {
            ...ownerSettings.pos,
            ...currentSettings.pos
          },
          printer: {
            ...ownerSettings.printer,
            ...currentSettings.printer
          },
          receipt: {
            ...ownerSettings.receipt,
            ...currentSettings.receipt
          },
          tax: {
            ...ownerSettings.tax,
            ...currentSettings.tax
          }
        }
      : currentSettings;
  }

  return {
    ...currentState,
    ...ownerState,
    brand: brand ? ({ ...(currentState.brand ?? {}), ...brand } as DemoAppState["brand"]) : currentState.brand,
    settingsByShop
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

async function authorizeShopStateAccess(request: Request, shopId: string, requireUser = false) {
  const supabase = createSupabaseAdminClient();
  const shopCanAccessCloudState = await assertShopCanAccessCloudState(supabase, shopId);

  if (!shopCanAccessCloudState.ok) {
    return { ...shopCanAccessCloudState, role: null, supabase, userId: null };
  }

  const userSession = readShopUserSession(request);

  if (userSession?.shopId === shopId) {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("id, shop_id, email, role, is_active")
      .eq("shop_id", shopId)
      .eq("id", userSession.userId)
      .eq("email", userSession.email)
      .eq("role", userSession.role)
      .eq("is_active", true)
      .neq("role", "super_admin")
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (profile) {
      return { ok: true, role: profile.role as UserRole, supabase, userId: profile.id };
    }
  }

  if (requireUser) {
    return { ok: false, message: "A signed-in shop user is required to save cloud data.", status: "unauthorized" as const, role: null, supabase, userId: null };
  }

  const deviceSession = readShopDeviceSession(request);

  if (deviceSession?.shopId === shopId) {
    const [{ data: keyRow, error: keyError }, { data: activation, error: activationError }] = await Promise.all([
      supabase
      .from("product_keys")
      .select("id, shop_id, status")
      .eq("id", deviceSession.productKeyId)
      .eq("shop_id", shopId)
      .maybeSingle(),
      supabase
        .from("device_activations")
        .select("id")
        .eq("product_key_id", deviceSession.productKeyId)
        .eq("shop_id", shopId)
        .eq("device_fingerprint", deviceSession.deviceFingerprint)
        .maybeSingle()
    ]);

    if (keyError) throw keyError;
    if (activationError) throw activationError;

    if (activation && keyRow && !["revoked", "locked", "expired"].includes(keyRow.status)) {
      return { ok: true, role: null, supabase, userId: null };
    }
  }

  return { ok: false, message: "Shop cloud state is not authorized.", status: "unauthorized" as const, role: null, supabase, userId: null };
}

async function commitCriticalMutation(
  authorization: Awaited<ReturnType<typeof authorizeShopStateAccess>> & {
    ok: true;
    role: UserRole;
    userId: string;
  },
  shopId: string,
  operationId: string,
  mutation: CriticalShopMutation
) {
  const { data: snapshot, error: snapshotError } = await authorization.supabase
    .from("shop_cloud_snapshots")
    .select("state, revision")
    .eq("shop_id", shopId)
    .maybeSingle();

  if (snapshotError) {
    if (isMissingSnapshotTableError(snapshotError) || isMissingTransactionalSnapshotError(snapshotError)) {
      return NextResponse.json(
        { ok: false, message: "The transactional shop-state migration must be applied before checkout." },
        { status: 503 }
      );
    }

    throw snapshotError;
  }

  let revision = Math.max(0, Number(snapshot?.revision ?? 0));
  let latestState = ((snapshot?.state as Partial<DemoAppState> | null) ?? {}) as Partial<DemoAppState>;
  let allowedShiftCount: number | undefined;

  if (mutation.type === "start_shift") {
    const { data: productKeys, error: productKeysError } = await authorization.supabase
      .from("product_keys")
      .select("status, allowed_devices")
      .eq("shop_id", shopId);

    if (productKeysError) throw productKeysError;

    allowedShiftCount = Math.max(
      1,
      (productKeys ?? [])
        .filter((key) => !["revoked", "locked", "expired"].includes(key.status))
        .reduce((highest, key) => Math.max(highest, Number(key.allowed_devices ?? 1)), 0)
    );
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const attendanceBusinessDate =
      mutation.type === "close_business_day"
        ? latestState.businessDays?.find((day) => day.shopId === shopId && !day.endedAt)?.businessDate
        : undefined;
    const mutationResult = applyCriticalShopMutation(latestState, mutation, {
      allowedShiftCount,
      role: authorization.role,
      shopId,
      userId: authorization.userId
    });

    if (!mutationResult.result.ok) {
      const status = mutation.type === "create_refund" && authorization.role !== "shop_admin" ? 403 : 400;
      return NextResponse.json(mutationResult.result, { status });
    }

    const { data, error } = await authorization.supabase.rpc("commit_shop_cloud_snapshot", {
      p_expected_revision: revision,
      p_operation_id: operationId,
      p_result: mutationResult.result,
      p_shop_id: shopId,
      p_state: mutationResult.state,
      p_updated_by: authorization.userId
    });

    if (error) {
      if (isMissingSnapshotTableError(error) || isMissingTransactionalSnapshotError(error)) {
        return NextResponse.json(
          { ok: false, message: "The transactional shop-state migration must be applied before checkout." },
          { status: 503 }
        );
      }

      throw error;
    }

    const commit = (data ?? {}) as {
      conflict?: boolean;
      duplicate?: boolean;
      ok?: boolean;
      result?: Record<string, unknown>;
      revision?: number;
      state?: Partial<DemoAppState>;
    };

    if (commit.conflict) {
      revision = Math.max(0, Number(commit.revision ?? revision));
      latestState = commit.state ?? latestState;
      continue;
    }

    if (attendanceBusinessDate) {
      await closeOpenAttendanceForBusinessDay(
        authorization.supabase,
        shopId,
        attendanceBusinessDate,
        authorization.userId
      );
    }

    return NextResponse.json({
      duplicate: Boolean(commit.duplicate),
      ok: commit.ok !== false,
      result: commit.result ?? mutationResult.result,
      revision: Math.max(revision + 1, Number(commit.revision ?? revision + 1)),
      state: commit.state ?? mutationResult.state
    });
  }

  return NextResponse.json(
    { conflict: true, ok: false, message: "The shop changed on another device. Please retry." },
    { status: 409 }
  );
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
      .select("state, updated_at, revision")
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
          revision: 0,
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
      revision: Number(data?.revision ?? 0),
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

  if (!shopId || (!body.state && !body.mutation)) {
    return NextResponse.json({ ok: false, message: "Shop id and state or mutation are required." }, { status: 400 });
  }

  try {
    const authorization = await authorizeShopStateAccess(request, shopId, true);

    if (!authorization.ok) {
      const statusCode = authorization.status === "locked" ? 423 : authorization.status === "expired" ? 402 : 401;

      return NextResponse.json(
        { ok: false, licenseStatus: authorization.status, message: authorization.message },
        { status: statusCode }
      );
    }

    if (body.mutation) {
      if (!authorization.userId || !authorization.role) {
        return NextResponse.json({ ok: false, message: "A signed-in shop user is required." }, { status: 401 });
      }

      const operationId = clean(body.operationId);

      if (!operationId) {
        return NextResponse.json({ ok: false, message: "Operation id is required." }, { status: 400 });
      }

      return commitCriticalMutation(
        authorization as typeof authorization & { ok: true; role: UserRole; userId: string },
        shopId,
        operationId,
        body.mutation
      );
    }

    if (!body.state) {
      return NextResponse.json({ ok: false, message: "Shop state is required." }, { status: 400 });
    }

    const expectedRevision = Math.max(0, Math.trunc(Number(body.expectedRevision ?? 0)));
    const operationId = clean(body.operationId) || crypto.randomUUID();
    const { data, error } = await authorization.supabase.rpc("commit_shop_cloud_snapshot", {
      p_expected_revision: expectedRevision,
      p_operation_id: operationId,
      p_result: {},
      p_shop_id: shopId,
      p_state: body.state,
      p_updated_by: authorization.userId
    });

    if (error) {
      if (isMissingSnapshotTableError(error) || isMissingTransactionalSnapshotError(error)) {
        await saveSnapshotToStorage(authorization.supabase, shopId, body.state);

        return NextResponse.json({ ok: true, revision: expectedRevision + 1, storageFallback: true });
      }

      throw error;
    }

    const commit = (data ?? {}) as {
      conflict?: boolean;
      duplicate?: boolean;
      ok?: boolean;
      result?: Record<string, unknown>;
      revision?: number;
      state?: Partial<DemoAppState>;
    };

    if (commit.conflict) {
      return NextResponse.json(
        {
          conflict: true,
          ok: false,
          revision: Number(commit.revision ?? expectedRevision),
          state: commit.state ?? {}
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      duplicate: Boolean(commit.duplicate),
      ok: commit.ok !== false,
      revision: Number(commit.revision ?? expectedRevision + 1),
      state: commit.state ?? body.state
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Unable to save shop cloud state." },
      { status: 500 }
    );
  }
}
