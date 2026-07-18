import { NextResponse } from "next/server";
import { hashAttendanceToken } from "@/lib/server/attendance-token";
import { optimizePosImage } from "@/lib/server/optimize-pos-image";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { uploadPrivatePosAsset } from "@/lib/supabase/storage-assets";
import type { DemoAppState } from "@/types/pos";

const MAX_SELFIE_INPUT_BYTES = 5 * 1024 * 1024;
const MAX_SELFIE_STORED_BYTES = 180 * 1024;

function clean(value: FormDataEntryValue | string | null | undefined) {
  return typeof value === "string" ? value.trim() : "";
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
    supabase
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
  const latitude = Number(clean(formData.get("latitude")));
  const longitude = Number(clean(formData.get("longitude")));
  const accuracy = Number(clean(formData.get("accuracy")) || 0);
  const selfie = formData.get("selfie");

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

    const { data: existingOpen, error: existingError } = await resolved.supabase
      .from("attendance_records")
      .select("id")
      .eq("shop_id", shopId)
      .eq("user_id", userId)
      .is("clock_out_at", null)
      .maybeSingle();

    if (existingError) throw existingError;
    if (existingOpen) {
      return NextResponse.json({ ok: false, message: "This employee is already clocked in." }, { status: 409 });
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
            fileName: `clock-in-${userId}.webp`,
            folder: `shops/${shopId}/attendance/${businessDate}/${userId}`
          });
        })()
      : null;
    const { data: payrollRate } = await resolved.supabase
      .from("payroll_rates")
      .select("hourly_rate, default_daily_hours")
      .eq("shop_id", shopId)
      .eq("user_id", userId)
      .lte("effective_from", businessDate)
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle();
    const now = new Date().toISOString();
    const { data: attendance, error: insertError } = await resolved.supabase
      .from("attendance_records")
      .insert({
        business_date: businessDate,
        clock_in_at: now,
        clock_in_latitude: hasValidLocation ? latitude : null,
        clock_in_longitude: hasValidLocation ? longitude : null,
        clock_in_selfie_url: uploaded?.url ?? null,
        hourly_rate: Number(payrollRate?.hourly_rate ?? 0),
        note: hasValidLocation && accuracy > 0 ? `Location accuracy: ${Math.round(accuracy)}m` : null,
        scheduled_hours: Number(payrollRate?.default_daily_hours ?? 8),
        shop_id: shopId,
        source: "qr",
        user_id: userId
      })
      .select("id")
      .single();

    if (insertError) throw insertError;

    await Promise.all([
      resolved.supabase.from("attendance_qr_sessions").update({ used_at: now }).eq("id", resolved.qrSession.id),
      resolved.supabase.from("audit_logs").insert({
        action: "attendance.clock_in.qr_scan",
        actor_id: userId,
        detail: `Verified QR clock-in captured for ${resolved.profile.name}.`,
        shop_id: shopId,
        target_id: attendance.id
      })
    ]);

    return NextResponse.json({ ok: true, attendanceId: attendance.id, message: "Clock-in saved securely." });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Unable to save attendance." },
      { status: 500 }
    );
  }
}
