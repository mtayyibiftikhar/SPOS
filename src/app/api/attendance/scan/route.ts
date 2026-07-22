import { NextResponse } from "next/server";
import { hashAttendanceToken } from "@/lib/server/attendance-token";
import { closeExpiredAttendanceRecords } from "@/lib/server/attendance-rollover";
import { isMissingAttendanceScheduleColumns } from "@/lib/server/attendance-schema";
import { optimizePosImage } from "@/lib/server/optimize-pos-image";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { readShopUserSession } from "@/lib/supabase/shop-session";
import { uploadPrivatePosAsset } from "@/lib/supabase/storage-assets";
import { DEFAULT_SHIFT_END_TIME, DEFAULT_SHIFT_START_TIME } from "@/lib/attendance";
import type { DemoAppState } from "@/types/pos";

const MAX_SELFIE_INPUT_BYTES = 5 * 1024 * 1024;
const MAX_SELFIE_STORED_BYTES = 180 * 1024;

function clean(value: FormDataEntryValue | string | null | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function withoutScheduleColumns(values: Record<string, unknown>) {
  const { overnight_shift: _overnight, shift_end_time: _shiftEnd, shift_start_time: _shiftStart, ...legacy } = values;

  return legacy;
}

async function resolveSession(shopId: string, userId: string, businessDate: string, token: string) {
  const supabase = createSupabaseAdminClient();
  const { data: qrSession, error: sessionError } = await supabase
    .from("attendance_qr_sessions")
    .select("id, shop_id, user_id, business_date, expires_at, used_at")
    .eq("shop_id", shopId)
    .eq("user_id", userId)
    .eq("business_date", businessDate)
    .eq("token_hash", hashAttendanceToken(token))
    .maybeSingle();

  if (sessionError) throw sessionError;
  if (!qrSession || qrSession.used_at || new Date(qrSession.expires_at).getTime() <= Date.now()) return null;

  const [
    { data: shop, error: shopError },
    { data: profile, error: profileError },
    { data: license, error: licenseError },
    { data: snapshot, error: snapshotError }
  ] =
    await Promise.all([
      supabase.from("shops").select("id, name").eq("id", shopId).maybeSingle(),
      supabase.from("profiles").select("id, name, is_active").eq("id", userId).eq("shop_id", shopId).maybeSingle(),
      supabase.from("licenses").select("status, expires_at").eq("shop_id", shopId).maybeSingle(),
      supabase.from("shop_cloud_snapshots").select("state").eq("shop_id", shopId).maybeSingle()
    ]);

  if (shopError) throw shopError;
  if (profileError) throw profileError;
  if (licenseError) throw licenseError;
  if (snapshotError) throw snapshotError;
  if (!shop || !profile?.is_active || !license || ["locked", "expired"].includes(license.status)) return null;
  if (license.expires_at && new Date(license.expires_at).getTime() < Date.now()) return null;

  const state = (snapshot?.state ?? {}) as Partial<DemoAppState>;
  const settings = state.settingsByShop?.[shopId]?.pos;

  return {
    profile,
    qrSession,
    requireLocation: settings?.attendanceRequireLocation ?? true,
    requireSelfie: settings?.attendanceRequireSelfie ?? false,
    shop,
    shopId,
    supabase,
    userId
  };
}

async function resolveDirectSession(request: Request, businessDate: string) {
  const userSession = readShopUserSession(request);

  if (!userSession) return null;

  const supabase = createSupabaseAdminClient();
  const [
    { data: shop, error: shopError },
    { data: profile, error: profileError },
    { data: license, error: licenseError },
    { data: snapshot, error: snapshotError }
  ] = await Promise.all([
    supabase.from("shops").select("id, name").eq("id", userSession.shopId).maybeSingle(),
    supabase
      .from("profiles")
      .select("id, name, is_active")
      .eq("id", userSession.userId)
      .eq("shop_id", userSession.shopId)
      .maybeSingle(),
    supabase.from("licenses").select("status, expires_at").eq("shop_id", userSession.shopId).maybeSingle(),
    supabase.from("shop_cloud_snapshots").select("state").eq("shop_id", userSession.shopId).maybeSingle()
  ]);

  if (shopError) throw shopError;
  if (profileError) throw profileError;
  if (licenseError) throw licenseError;
  if (snapshotError) throw snapshotError;
  if (!shop || !profile?.is_active || !license || ["locked", "expired"].includes(license.status)) return null;
  if (license.expires_at && new Date(license.expires_at).getTime() < Date.now()) return null;

  const state = (snapshot?.state ?? {}) as Partial<DemoAppState>;
  const settings = state.settingsByShop?.[userSession.shopId]?.pos;
  const openBusinessDay = state.businessDays?.some(
    (day) => day.shopId === userSession.shopId && day.businessDate === businessDate && !day.endedAt
  );

  if (!openBusinessDay || settings?.attendanceEnabled === false || settings?.attendanceAllowQrLink !== false) {
    return null;
  }

  return {
    profile,
    qrSession: null,
    requireLocation: settings?.attendanceRequireLocation ?? true,
    requireSelfie: settings?.attendanceRequireSelfie ?? false,
    shop,
    shopId: userSession.shopId,
    supabase,
    userId: userSession.userId
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const shopId = clean(url.searchParams.get("shopId"));
  const userId = clean(url.searchParams.get("userId"));
  const businessDate = clean(url.searchParams.get("businessDate"));
  const token = clean(url.searchParams.get("token"));

  if (!shopId || !userId || !businessDate || token.length < 32) {
    return NextResponse.json({ ok: false, message: "This attendance link is invalid." }, { status: 400 });
  }

  try {
    const resolved = await resolveSession(shopId, userId, businessDate, token);

    if (!resolved) {
      return NextResponse.json(
        { ok: false, message: "This clock-in link is no longer active. Refresh the POS time-clock screen for a new QR." },
        { status: 410 }
      );
    }

    return NextResponse.json({
      ok: true,
      businessDate,
      employeeName: resolved.profile.name,
      expiresAt: resolved.qrSession.expires_at,
      requireLocation: resolved.requireLocation,
      requireSelfie: resolved.requireSelfie,
      shopName: resolved.shop.name
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Unable to validate attendance link." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, message: "A valid attendance submission is required." }, { status: 400 });
  }

  const shopId = clean(formData.get("shopId"));
  const userId = clean(formData.get("userId"));
  const businessDate = clean(formData.get("businessDate"));
  const token = clean(formData.get("token"));
  const direct = clean(formData.get("direct")) === "1";
  const latitude = Number(clean(formData.get("latitude")));
  const longitude = Number(clean(formData.get("longitude")));
  const accuracy = Number(clean(formData.get("accuracy")) || 0);
  const selfie = formData.get("selfie");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate) || (!direct && (!shopId || !userId || token.length < 32))) {
    return NextResponse.json({ ok: false, message: "This attendance link is invalid." }, { status: 400 });
  }

  try {
    const resolved = direct
      ? await resolveDirectSession(request, businessDate)
      : await resolveSession(shopId, userId, businessDate, token);

    if (!resolved) {
      return NextResponse.json(
        {
          ok: false,
          message: direct
            ? "This on-device clock-in is not available. Refresh the POS and check the attendance settings."
            : "This clock-in link is no longer active. Refresh the POS time-clock screen for a new QR."
        },
        { status: direct ? 403 : 410 }
      );
    }

    const resolvedShopId = direct ? resolved.shopId : shopId;
    const resolvedUserId = direct ? resolved.userId : userId;

    const hasValidLocation =
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      Math.abs(latitude) <= 90 &&
      Math.abs(longitude) <= 180;
    const hasValidSelfie =
      selfie instanceof File && selfie.type.startsWith("image/") && selfie.size <= MAX_SELFIE_INPUT_BYTES;
    const selfieFile = hasValidSelfie ? (selfie as File) : null;

    if (resolved.requireLocation && !hasValidLocation) {
      return NextResponse.json({ ok: false, message: "A valid clock-in location is required." }, { status: 400 });
    }

    if (resolved.requireSelfie && !hasValidSelfie) {
      return NextResponse.json({ ok: false, message: "A selfie image up to 5 MB is required." }, { status: 400 });
    }

    await closeExpiredAttendanceRecords(resolved.supabase, resolvedShopId);

    const { data: existingOpen, error: existingError } = await resolved.supabase
      .from("attendance_records")
      .select("id")
      .eq("shop_id", resolvedShopId)
      .eq("user_id", resolvedUserId)
      .is("clock_out_at", null)
      .maybeSingle();

    if (existingError) throw existingError;
    if (existingOpen) {
      return NextResponse.json({ ok: true, attendanceId: existingOpen.id, message: "This employee is already clocked in." });
    }

    const uploaded = selfieFile
      ? await (async () => {
          const optimized = await optimizePosImage(
            Buffer.from(await selfieFile.arrayBuffer()),
            { width: 640, height: 640 },
            MAX_SELFIE_STORED_BYTES
          );

          return uploadPrivatePosAsset(resolved.supabase, {
            buffer: optimized.buffer,
            contentType: optimized.contentType,
            fileName: `clock-in-${resolvedUserId}.webp`,
            folder: `shops/${resolvedShopId}/attendance/${businessDate}/${resolvedUserId}`
          });
        })()
      : null;
    const { data: payrollRate, error: payrollRateError } = await resolved.supabase
      .from("payroll_rates")
      .select("*")
      .eq("shop_id", resolvedShopId)
      .eq("user_id", resolvedUserId)
      .lte("effective_from", businessDate)
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (payrollRateError) throw payrollRateError;
    const now = new Date().toISOString();
    const values = {
        business_date: businessDate,
        clock_in_at: now,
        clock_in_latitude: hasValidLocation ? latitude : null,
        clock_in_longitude: hasValidLocation ? longitude : null,
        clock_in_selfie_url: uploaded?.url ?? null,
        hourly_rate: Number(payrollRate?.hourly_rate ?? 0),
        note: hasValidLocation && accuracy > 0 ? `Location accuracy: ${Math.round(accuracy)}m` : null,
        scheduled_hours: Number(payrollRate?.default_daily_hours ?? 8),
        shop_id: resolvedShopId,
        shift_end_time: payrollRate?.shift_end_time ?? DEFAULT_SHIFT_END_TIME,
        shift_start_time: payrollRate?.shift_start_time ?? DEFAULT_SHIFT_START_TIME,
        overnight_shift: Boolean(payrollRate?.overnight_shift),
        source: direct ? "manual" : "qr",
        user_id: resolvedUserId
      };
    const saveAttendance = (payload: Record<string, unknown>) =>
      resolved.supabase.from("attendance_records").insert(payload).select("id").single();
    let { data: attendance, error: insertError } = await saveAttendance(values);

    if (isMissingAttendanceScheduleColumns(insertError)) {
      ({ data: attendance, error: insertError } = await saveAttendance(withoutScheduleColumns(values)));
    }

    if (insertError) throw insertError;
    if (!attendance) throw new Error("Unable to save attendance.");

    const { error: auditError } = await resolved.supabase.from("audit_logs").insert({
      action: direct ? "attendance.clock_in.pos_device" : "attendance.clock_in.qr_scan",
      actor_id: resolvedUserId,
      detail: direct
        ? `On-device clock-in captured for ${resolved.profile.name}.`
        : `Verified QR clock-in captured for ${resolved.profile.name}.`,
      shop_id: resolvedShopId,
      target_id: attendance.id
    });

    if (auditError) throw auditError;

    if (resolved.qrSession) {
      const { error: sessionUpdateError } = await resolved.supabase
        .from("attendance_qr_sessions")
        .update({ used_at: now })
        .eq("id", resolved.qrSession.id);

      if (sessionUpdateError) throw sessionUpdateError;
    }

    return NextResponse.json({ ok: true, attendanceId: attendance.id, message: "Clock-in saved securely." });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Unable to save attendance." },
      { status: 500 }
    );
  }
}
