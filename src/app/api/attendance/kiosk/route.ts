import { NextResponse } from "next/server";
import { calculateElapsedAttendanceHours, DEFAULT_SHIFT_END_TIME, DEFAULT_SHIFT_START_TIME } from "@/lib/attendance";
import { normalizeEmployeeCode, verifyAttendancePin } from "@/lib/server/attendance-pin";
import { closeExpiredAttendanceRecords } from "@/lib/server/attendance-rollover";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isShopSessionCurrent, readShopDeviceSession } from "@/lib/supabase/shop-session";
import type { DemoAppState } from "@/types/pos";

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

async function resolveDevice(request: Request) {
  const session = readShopDeviceSession(request);
  if (!session) return null;
  const supabase = createSupabaseAdminClient();
  if (!(await isShopSessionCurrent(supabase, session))) return null;
  return { session, supabase };
}

export async function GET(request: Request) {
  try {
    const resolved = await resolveDevice(request);
    if (!resolved) return NextResponse.json({ ok: false, message: "Activate this POS device before using attendance kiosk." }, { status: 401 });
    const { session, supabase } = resolved;
    const [{ data: shop, error: shopError }, { data: snapshot, error: snapshotError }] = await Promise.all([
      supabase.from("shops").select("id, name").eq("id", session.shopId).maybeSingle(),
      supabase.from("shop_cloud_snapshots").select("state").eq("shop_id", session.shopId).maybeSingle()
    ]);
    if (shopError) throw shopError;
    if (snapshotError) throw snapshotError;
    if (!shop) return NextResponse.json({ ok: false, message: "Store was not found." }, { status: 404 });
    const state = (snapshot?.state ?? {}) as Partial<DemoAppState>;
    const settings = state.settingsByShop?.[session.shopId]?.pos;
    const openDay = state.businessDays?.find((day) => day.shopId === session.shopId && !day.endedAt);
    return NextResponse.json({
      ok: true,
      shopName: shop.name,
      businessDate: openDay?.businessDate ?? null,
      attendanceEnabled: settings?.attendanceEnabled !== false,
      pinEnabled: settings?.attendanceAllowKioskPin ?? true,
      fingerprintEnabled: settings?.attendanceAllowFingerprint ?? false
    });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Unable to load attendance kiosk." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let body: { employeeCode?: string; pin?: string };
  try {
    body = (await request.json()) as { employeeCode?: string; pin?: string };
  } catch {
    return NextResponse.json({ ok: false, message: "Enter employee ID and attendance PIN." }, { status: 400 });
  }
  const employeeCode = normalizeEmployeeCode(body.employeeCode ?? "");
  const pin = body.pin?.trim() ?? "";

  try {
    const resolved = await resolveDevice(request);
    if (!resolved) return NextResponse.json({ ok: false, message: "This attendance device is not activated." }, { status: 401 });
    const { session, supabase } = resolved;
    const [{ data: credential, error: credentialError }, { data: snapshot, error: snapshotError }] = await Promise.all([
      supabase
        .from("attendance_employee_credentials")
        .select("id, user_id, pin_hash, pin_enabled, failed_attempts, locked_until, profiles!inner(name, is_active)")
        .eq("shop_id", session.shopId)
        .ilike("employee_code", employeeCode)
        .maybeSingle(),
      supabase.from("shop_cloud_snapshots").select("state").eq("shop_id", session.shopId).maybeSingle()
    ]);
    if (credentialError) throw credentialError;
    if (snapshotError) throw snapshotError;
    const nowMs = Date.now();
    if (!credential || !credential.pin_enabled || !credential.pin_hash) {
      return NextResponse.json({ ok: false, message: "Employee ID or attendance PIN is incorrect." }, { status: 401 });
    }
    if (credential.locked_until && Date.parse(credential.locked_until) > nowMs) {
      return NextResponse.json({ ok: false, message: "Attendance PIN is temporarily locked. Ask an administrator or try later." }, { status: 423 });
    }
    if (!verifyAttendancePin(pin, credential.pin_hash)) {
      const failures = Number(credential.failed_attempts ?? 0) + 1;
      const lockedUntil = failures >= MAX_FAILED_ATTEMPTS ? new Date(nowMs + LOCK_MINUTES * 60_000).toISOString() : null;
      await supabase.from("attendance_employee_credentials").update({ failed_attempts: lockedUntil ? 0 : failures, locked_until: lockedUntil, updated_at: new Date().toISOString() }).eq("id", credential.id);
      return NextResponse.json({ ok: false, message: lockedUntil ? "Too many incorrect attempts. Attendance PIN is locked for 15 minutes." : "Employee ID or attendance PIN is incorrect." }, { status: lockedUntil ? 423 : 401 });
    }

    const state = (snapshot?.state ?? {}) as Partial<DemoAppState>;
    const settings = state.settingsByShop?.[session.shopId]?.pos;
    const openDay = state.businessDays?.find((day) => day.shopId === session.shopId && !day.endedAt);
    if (settings?.attendanceEnabled === false || settings?.attendanceAllowKioskPin === false) {
      return NextResponse.json({ ok: false, message: "PIN attendance kiosk is disabled for this store." }, { status: 403 });
    }
    if (!openDay) return NextResponse.json({ ok: false, message: "Open the business day before recording attendance." }, { status: 409 });
    await closeExpiredAttendanceRecords(supabase, session.shopId);
    await supabase.from("attendance_employee_credentials").update({ failed_attempts: 0, locked_until: null, updated_at: new Date().toISOString() }).eq("id", credential.id);

    const { data: openRecord, error: openError } = await supabase
      .from("attendance_records")
      .select("id, clock_in_at")
      .eq("shop_id", session.shopId)
      .eq("user_id", credential.user_id)
      .is("clock_out_at", null)
      .order("clock_in_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (openError) throw openError;
    const now = new Date().toISOString();
    const profileValue = credential.profiles as unknown as { name?: string; is_active?: boolean } | Array<{ name?: string; is_active?: boolean }>;
    const profile = Array.isArray(profileValue) ? profileValue[0] : profileValue;
    if (!profile?.is_active) return NextResponse.json({ ok: false, message: "This employee account is inactive." }, { status: 403 });

    if (openRecord) {
      const paidHours = calculateElapsedAttendanceHours(openRecord.clock_in_at, now);
      const { error } = await supabase.from("attendance_records").update({ clock_out_at: now, paid_hours: paidHours, updated_at: now }).eq("id", openRecord.id);
      if (error) throw error;
      await supabase.from("audit_logs").insert({ action: "attendance.clock_out.kiosk_pin", actor_id: credential.user_id, detail: `PIN kiosk clock-out captured for ${profile.name}.`, shop_id: session.shopId, target_id: openRecord.id });
      return NextResponse.json({ ok: true, action: "clock_out", employeeName: profile.name, occurredAt: now, message: `${profile.name} checked out successfully.` });
    }

    const { data: payrollRate, error: rateError } = await supabase.from("payroll_rates").select("*").eq("shop_id", session.shopId).eq("user_id", credential.user_id).lte("effective_from", openDay.businessDate).order("effective_from", { ascending: false }).limit(1).maybeSingle();
    if (rateError) throw rateError;
    const { data: attendance, error } = await supabase.from("attendance_records").insert({
      attendance_device_id: session.productKeyId,
      business_date: openDay.businessDate,
      clock_in_at: now,
      hourly_rate: Number(payrollRate?.hourly_rate ?? 0),
      note: "Verified on the store attendance kiosk using employee ID and PIN.",
      overnight_shift: Boolean(payrollRate?.overnight_shift),
      scheduled_hours: Number(payrollRate?.default_daily_hours ?? 8),
      shift_end_time: payrollRate?.shift_end_time ?? DEFAULT_SHIFT_END_TIME,
      shift_start_time: payrollRate?.shift_start_time ?? DEFAULT_SHIFT_START_TIME,
      shop_id: session.shopId,
      source: "kiosk_pin",
      user_id: credential.user_id,
      verification_method: "kiosk_pin",
      verification_strength: "medium"
    }).select("id").single();
    if (error) throw error;
    await supabase.from("audit_logs").insert({ action: "attendance.clock_in.kiosk_pin", actor_id: credential.user_id, detail: `PIN kiosk clock-in captured for ${profile.name}.`, shop_id: session.shopId, target_id: attendance.id });
    return NextResponse.json({ ok: true, action: "clock_in", employeeName: profile.name, occurredAt: now, message: `${profile.name} checked in successfully.` });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Unable to record kiosk attendance." }, { status: 500 });
  }
}
