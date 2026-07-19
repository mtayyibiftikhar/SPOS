import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { readShopUserSession } from "@/lib/supabase/shop-session";
import type { AttendanceRecord, DemoAppState } from "@/types/pos";

type AttendanceAction = "clock_in" | "clock_out" | "close_day" | "save_adjustment" | "save_payroll_rate";

type AttendanceRequest = {
  action?: AttendanceAction;
  businessDate?: string;
  clockInAt?: string;
  clockOutAt?: string;
  defaultDailyHours?: number;
  hourlyRate?: number;
  id?: string;
  note?: string;
  paidHours?: number;
  password?: string;
  scheduledHours?: number;
  source?: "admin_bypass" | "manual";
  userId?: string;
};

const RIYADH_TIME_ZONE = "Asia/Riyadh";

function currentRiyadhDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: RIYADH_TIME_ZONE,
    year: "numeric"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}`;
}

function createSupabaseAuthClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) throw new Error("Supabase auth environment variables are not configured.");

  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

function validDate(value: string | undefined) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

const attendanceSelect =
  "id, shop_id, user_id, business_date, clock_in_at, clock_out_at, scheduled_hours, paid_hours, hourly_rate, source, clock_in_latitude, clock_in_longitude, clock_out_latitude, clock_out_longitude, clock_in_selfie_url, clock_out_selfie_url, note, created_at";

function normalizeAttendanceRecord(record: Record<string, unknown>): AttendanceRecord {
  const clockInAt = String(record.clock_in_at);
  const clockOutAt = record.clock_out_at ? String(record.clock_out_at) : undefined;

  return {
    id: String(record.id),
    shopId: String(record.shop_id),
    userId: String(record.user_id),
    businessDate: String(record.business_date),
    status: clockOutAt ? "closed" : "open",
    source: record.source === "manual" || record.source === "admin_bypass" ? record.source : "qr",
    clockInAt,
    clockOutAt,
    clockInLocation:
      record.clock_in_latitude != null && record.clock_in_longitude != null
        ? {
            latitude: Number(record.clock_in_latitude),
            longitude: Number(record.clock_in_longitude),
            capturedAt: clockInAt
          }
        : undefined,
    clockOutLocation:
      record.clock_out_latitude != null && record.clock_out_longitude != null && clockOutAt
        ? {
            latitude: Number(record.clock_out_latitude),
            longitude: Number(record.clock_out_longitude),
            capturedAt: clockOutAt
          }
        : undefined,
    clockInSelfieUrl: record.clock_in_selfie_url ? String(record.clock_in_selfie_url) : undefined,
    clockOutSelfieUrl: record.clock_out_selfie_url ? String(record.clock_out_selfie_url) : undefined,
    scheduledHours: Number(record.scheduled_hours ?? 8),
    paidHours: record.paid_hours == null ? undefined : Number(record.paid_hours),
    hourlyRate: Number(record.hourly_rate ?? 0),
    note: record.note ? String(record.note) : undefined,
    createdAt: record.created_at ? String(record.created_at) : clockInAt
  };
}

export async function GET(request: Request) {
  const session = readShopUserSession(request);

  if (!session) {
    return NextResponse.json({ ok: false, message: "Sign in before reading attendance time." }, { status: 401 });
  }

  const now = new Date();

  return NextResponse.json({
    currentDate: currentRiyadhDate(now),
    currentTime: now.toISOString(),
    ok: true,
    timeZone: RIYADH_TIME_ZONE
  });
}

export async function POST(request: Request) {
  const session = readShopUserSession(request);

  if (!session) {
    return NextResponse.json({ ok: false, message: "Sign in before updating attendance." }, { status: 401 });
  }

  let body: AttendanceRequest;

  try {
    body = (await request.json()) as AttendanceRequest;
  } catch {
    return NextResponse.json({ ok: false, message: "A valid attendance request is required." }, { status: 400 });
  }

  const targetUserId = body.userId?.trim() || session.userId;

  if (!body.action) {
    return NextResponse.json({ ok: false, message: "Choose a clock-in or clock-out action." }, { status: 400 });
  }

  if (targetUserId !== session.userId && session.role !== "shop_admin") {
    return NextResponse.json({ ok: false, message: "Only the shop admin can update another employee." }, { status: 403 });
  }

  if (["clock_in", "close_day", "save_adjustment", "save_payroll_rate"].includes(body.action) && session.role !== "shop_admin") {
    return NextResponse.json({ ok: false, message: "Only the shop admin can bypass verified clock-in." }, { status: 403 });
  }

  try {
    const supabase = createSupabaseAdminClient();

    if (body.action === "close_day") {
      if (!validDate(body.businessDate)) {
        return NextResponse.json({ ok: false, message: "A valid business date is required." }, { status: 400 });
      }

      const { data: openRecords, error: recordsError } = await supabase
        .from("attendance_records")
        .select("id, scheduled_hours, note")
        .eq("shop_id", session.shopId)
        .eq("business_date", body.businessDate)
        .is("clock_out_at", null);

      if (recordsError) throw recordsError;

      if (openRecords?.length) {
        const closedAt = new Date().toISOString();
        const updates = await Promise.all(
          openRecords.map((record) =>
            supabase
              .from("attendance_records")
              .update({
                clock_out_at: closedAt,
                note: record.note || "Auto closed by business-day rollover using scheduled hours.",
                paid_hours: Number(record.scheduled_hours ?? 8),
                updated_at: closedAt
              })
              .eq("id", record.id)
              .eq("shop_id", session.shopId)
          )
        );
        const failedUpdate = updates.find((update) => update.error);

        if (failedUpdate?.error) throw failedUpdate.error;

        await supabase.from("audit_logs").insert({
          action: "attendance.day_rollover",
          actor_id: session.userId,
          detail: `${openRecords.length} open attendance record(s) auto closed for ${body.businessDate}.`,
          shop_id: session.shopId,
          target_id: body.businessDate
        });
      }

      return NextResponse.json({
        ok: true,
        message: openRecords?.length
          ? `${openRecords.length} attendance record(s) closed using scheduled hours.`
          : "No open attendance records required closing."
      });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, name, is_active")
      .eq("id", targetUserId)
      .eq("shop_id", session.shopId)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profile?.is_active) {
      return NextResponse.json({ ok: false, message: "Employee not found or inactive." }, { status: 404 });
    }

    if (body.action === "save_payroll_rate") {
      const hourlyRate = Number(body.hourlyRate);
      const defaultDailyHours = Number(body.defaultDailyHours);

      if (!Number.isFinite(hourlyRate) || hourlyRate < 0 || !Number.isFinite(defaultDailyHours) || defaultDailyHours <= 0) {
        return NextResponse.json({ ok: false, message: "Enter a valid hourly rate and default hours." }, { status: 400 });
      }

      const { data: snapshot, error: snapshotError } = await supabase
        .from("shop_cloud_snapshots")
        .select("state")
        .eq("shop_id", session.shopId)
        .maybeSingle();

      if (snapshotError) throw snapshotError;
      const state = (snapshot?.state ?? {}) as Partial<DemoAppState>;
      const effectiveFrom =
        state.businessDays?.find((day) => day.shopId === session.shopId && !day.endedAt)?.businessDate ??
        currentRiyadhDate();
      const now = new Date().toISOString();
      const { data: savedRate, error: rateError } = await supabase
        .from("payroll_rates")
        .upsert(
          {
            default_daily_hours: Math.round(defaultDailyHours * 100) / 100,
            effective_from: effectiveFrom,
            hourly_rate: Math.round(hourlyRate * 100) / 100,
            shop_id: session.shopId,
            updated_at: now,
            user_id: targetUserId
          },
          { onConflict: "shop_id,user_id,effective_from" }
        )
        .select("id, shop_id, user_id, hourly_rate, default_daily_hours, created_at, updated_at")
        .single();

      if (rateError) throw rateError;

      await supabase.from("audit_logs").insert({
        action: "attendance.payroll_rate.update",
        actor_id: session.userId,
        detail: `Payroll rate updated for ${profile.name}.`,
        shop_id: session.shopId,
        target_id: targetUserId
      });

      return NextResponse.json({
        ok: true,
        message: "Payroll rate saved.",
        rate: {
          id: savedRate.id,
          shopId: savedRate.shop_id,
          userId: savedRate.user_id,
          hourlyRate: Number(savedRate.hourly_rate),
          defaultDailyHours: Number(savedRate.default_daily_hours),
          currency: "SAR",
          createdAt: savedRate.created_at,
          updatedAt: savedRate.updated_at
        }
      });
    }

    if (body.action === "save_adjustment") {
      const note = body.note?.trim() ?? "";
      const clockInAt = body.clockInAt?.trim() ?? "";
      const clockOutAt = body.clockOutAt?.trim() || null;
      const scheduledHours = Number(body.scheduledHours ?? 8);
      const paidHours = body.paidHours == null ? null : Number(body.paidHours);
      const hourlyRate = Number(body.hourlyRate ?? 0);

      if (!note) {
        return NextResponse.json({ ok: false, message: "Enter a reason for this attendance adjustment." }, { status: 400 });
      }
      if (!validDate(body.businessDate) || !clockInAt || !Number.isFinite(Date.parse(clockInAt))) {
        return NextResponse.json({ ok: false, message: "Select a valid work date and clock-in time." }, { status: 400 });
      }
      if (body.businessDate! > currentRiyadhDate()) {
        return NextResponse.json({ ok: false, message: "Future attendance records are not allowed." }, { status: 400 });
      }
      const serverNow = Date.now();
      const futureTolerance = 2 * 60 * 1000;
      if (Date.parse(clockInAt) > serverNow + futureTolerance || (clockOutAt && Date.parse(clockOutAt) > serverNow + futureTolerance)) {
        return NextResponse.json({ ok: false, message: "Clock-in and clock-out cannot be in the future." }, { status: 400 });
      }
      if (clockOutAt && (!Number.isFinite(Date.parse(clockOutAt)) || Date.parse(clockOutAt) <= Date.parse(clockInAt))) {
        return NextResponse.json({ ok: false, message: "Clock-out must be after clock-in." }, { status: 400 });
      }
      if (!Number.isFinite(scheduledHours) || scheduledHours <= 0 || (paidHours != null && (!Number.isFinite(paidHours) || paidHours < 0))) {
        return NextResponse.json({ ok: false, message: "Enter valid scheduled and paid hours." }, { status: 400 });
      }

      const values = {
        business_date: body.businessDate,
        clock_in_at: clockInAt,
        clock_out_at: clockOutAt,
        hourly_rate: Math.max(0, hourlyRate),
        note,
        paid_hours: clockOutAt ? paidHours : null,
        scheduled_hours: scheduledHours,
        shop_id: session.shopId,
        source: "manual",
        updated_at: new Date().toISOString(),
        user_id: targetUserId
      };
      const query = body.id
        ? supabase.from("attendance_records").update(values).eq("id", body.id).eq("shop_id", session.shopId)
        : supabase.from("attendance_records").insert(values);
      const { data: savedRecord, error: saveError } = await query.select(attendanceSelect).single();

      if (saveError) throw saveError;

      await supabase.from("audit_logs").insert({
        action: body.id ? "attendance.adjust" : "attendance.manual_create",
        actor_id: session.userId,
        detail: `Attendance adjusted for ${profile.name}. Reason: ${note}`,
        shop_id: session.shopId,
        target_id: savedRecord.id
      });

      return NextResponse.json({
        ok: true,
        message: "Attendance adjustment saved.",
        record: normalizeAttendanceRecord(savedRecord as Record<string, unknown>)
      });
    }

    if (body.action === "clock_out") {
      if (targetUserId === session.userId) {
        const password = body.password?.trim() ?? "";

        if (!password) {
          return NextResponse.json({ ok: false, message: "Enter your password to confirm clock-out." }, { status: 400 });
        }

        const authClient = createSupabaseAuthClient();
        const { data: authData, error: authError } = await authClient.auth.signInWithPassword({
          email: session.email,
          password
        });

        if (authError || authData.user?.id !== session.userId) {
          return NextResponse.json({ ok: false, message: "Password is incorrect." }, { status: 401 });
        }
      }

      const { data: openRecord, error: openError } = await supabase
        .from("attendance_records")
        .select(attendanceSelect)
        .eq("shop_id", session.shopId)
        .eq("user_id", targetUserId)
        .is("clock_out_at", null)
        .order("clock_in_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (openError) throw openError;
      if (!openRecord) {
        return NextResponse.json({ ok: false, message: "No open clock-in found for this employee." }, { status: 409 });
      }

      const clockOutAt = new Date().toISOString();
      const elapsedHours = Math.max(0, (Date.parse(clockOutAt) - Date.parse(openRecord.clock_in_at)) / 3_600_000);
      const paidHours = Math.round(elapsedHours * 100) / 100;
      const note = body.note?.trim() || openRecord.note || null;
      const { data: updated, error: updateError } = await supabase
        .from("attendance_records")
        .update({ clock_out_at: clockOutAt, paid_hours: paidHours, note, updated_at: clockOutAt })
        .eq("id", openRecord.id)
        .eq("shop_id", session.shopId)
        .select(attendanceSelect)
        .single();

      if (updateError) throw updateError;

      await supabase.from("audit_logs").insert({
        action: targetUserId === session.userId ? "attendance.clock_out" : "attendance.clock_out.manual",
        actor_id: session.userId,
        detail: `Clock-out saved for ${profile.name}.`,
        shop_id: session.shopId,
        target_id: targetUserId
      });

      return NextResponse.json({
        ok: true,
        message: "Clock-out saved.",
        record: normalizeAttendanceRecord(updated as Record<string, unknown>)
      });
    }

    const [{ data: existingOpen, error: existingError }, { data: snapshot, error: snapshotError }] =
      await Promise.all([
        supabase
          .from("attendance_records")
          .select(attendanceSelect)
          .eq("shop_id", session.shopId)
          .eq("user_id", targetUserId)
          .is("clock_out_at", null)
          .order("clock_in_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase.from("shop_cloud_snapshots").select("state").eq("shop_id", session.shopId).maybeSingle()
      ]);

    if (existingError) throw existingError;
    if (snapshotError) throw snapshotError;
    if (existingOpen) {
      return NextResponse.json({
        ok: true,
        message: "Employee is already clocked in.",
        record: normalizeAttendanceRecord(existingOpen as Record<string, unknown>)
      });
    }

    const state = (snapshot?.state ?? {}) as Partial<DemoAppState>;
    const openDay = state.businessDays?.find((day) => day.shopId === session.shopId && !day.endedAt);

    if (!openDay) {
      return NextResponse.json({ ok: false, message: "Open the business day before clocking in." }, { status: 409 });
    }

    const { data: payrollRate, error: rateError } = await supabase
      .from("payroll_rates")
      .select("hourly_rate, default_daily_hours")
      .eq("shop_id", session.shopId)
      .eq("user_id", targetUserId)
      .lte("effective_from", openDay.businessDate)
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (rateError) throw rateError;

    const now = new Date().toISOString();
    const { data: inserted, error: insertError } = await supabase
      .from("attendance_records")
      .insert({
        business_date: openDay.businessDate,
        clock_in_at: now,
        hourly_rate: Number(payrollRate?.hourly_rate ?? 0),
        note: body.note?.trim() || "Admin bypassed attendance capture.",
        scheduled_hours: Number(payrollRate?.default_daily_hours ?? 8),
        shop_id: session.shopId,
        source: body.source === "manual" ? "manual" : "admin_bypass",
        user_id: targetUserId
      })
      .select(attendanceSelect)
      .single();

    if (insertError) throw insertError;

    await supabase.from("audit_logs").insert({
      action: body.source === "manual" ? "attendance.clock_in.manual" : "attendance.clock_in.bypass",
      actor_id: session.userId,
      detail: `Clock-in capture bypassed for ${profile.name}.`,
      shop_id: session.shopId,
      target_id: targetUserId
    });

    return NextResponse.json({
      ok: true,
      message: "Admin bypass saved.",
      record: normalizeAttendanceRecord(inserted as Record<string, unknown>)
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Unable to update attendance." },
      { status: 500 }
    );
  }
}
