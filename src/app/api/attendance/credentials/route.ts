import { NextResponse } from "next/server";
import {
  hashAttendancePin,
  isValidAttendancePin,
  isValidEmployeeCode,
  normalizeEmployeeCode
} from "@/lib/server/attendance-pin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isShopSessionCurrent, readShopUserSession } from "@/lib/supabase/shop-session";

type CredentialPayload = {
  employeeCode?: string;
  fingerprintEnabled?: boolean;
  personalBiometricEnabled?: boolean;
  pin?: string;
  pinEnabled?: boolean;
  userId?: string;
};

async function authorize(request: Request) {
  const session = readShopUserSession(request);
  if (!session || session.role !== "shop_admin") return null;
  const supabase = createSupabaseAdminClient();
  if (!(await isShopSessionCurrent(supabase, session))) return null;
  return { session, supabase };
}

export async function GET(request: Request) {
  try {
    const authorization = await authorize(request);
    if (!authorization) return NextResponse.json({ ok: false, message: "Attendance enrollment is not authorized." }, { status: 401 });
    const { session, supabase } = authorization;
    const { data, error } = await supabase
      .from("attendance_employee_credentials")
      .select("id, user_id, employee_code, pin_enabled, fingerprint_enabled, fingerprint_enrolled_at, personal_biometric_enabled, personal_passkey_count, locked_until, updated_at")
      .eq("shop_id", session.shopId);
    if (error) throw error;
    return NextResponse.json({ ok: true, credentials: data ?? [] });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Unable to load attendance enrollment." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let body: CredentialPayload;
  try {
    body = (await request.json()) as CredentialPayload;
  } catch {
    return NextResponse.json({ ok: false, message: "A valid attendance enrollment is required." }, { status: 400 });
  }

  const userId = body.userId?.trim() ?? "";
  const employeeCode = normalizeEmployeeCode(body.employeeCode ?? "");
  const pin = body.pin?.trim() ?? "";
  if (!userId || !isValidEmployeeCode(employeeCode)) {
    return NextResponse.json({ ok: false, message: "Enter a unique employee ID using 3 to 20 letters, numbers, or hyphens." }, { status: 400 });
  }
  if (pin && !isValidAttendancePin(pin)) {
    return NextResponse.json({ ok: false, message: "Attendance PIN must contain 4 to 6 digits." }, { status: 400 });
  }

  try {
    const authorization = await authorize(request);
    if (!authorization) return NextResponse.json({ ok: false, message: "Attendance enrollment is not authorized." }, { status: 401 });
    const { session, supabase } = authorization;
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, name, is_active")
      .eq("id", userId)
      .eq("shop_id", session.shopId)
      .eq("is_active", true)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile) return NextResponse.json({ ok: false, message: "Active employee was not found." }, { status: 404 });
    const { data: existingCredential, error: existingCredentialError } = await supabase
      .from("attendance_employee_credentials")
      .select("pin_hash")
      .eq("shop_id", session.shopId)
      .eq("user_id", userId)
      .maybeSingle();
    if (existingCredentialError) throw existingCredentialError;
    if (body.pinEnabled !== false && !pin && !existingCredential?.pin_hash) {
      return NextResponse.json({ ok: false, message: "Create a 4 to 6 digit attendance PIN for this employee." }, { status: 400 });
    }

    const values: Record<string, unknown> = {
      employee_code: employeeCode,
      fingerprint_enabled: Boolean(body.fingerprintEnabled),
      personal_biometric_enabled: Boolean(body.personalBiometricEnabled),
      pin_enabled: body.pinEnabled !== false,
      shop_id: session.shopId,
      updated_at: new Date().toISOString(),
      user_id: userId
    };
    if (pin) values.pin_hash = hashAttendancePin(pin);
    if (body.pinEnabled === false) values.pin_hash = null;
    const { data, error } = await supabase
      .from("attendance_employee_credentials")
      .upsert({ ...values, created_by: session.userId }, { onConflict: "shop_id,user_id" })
      .select("id, user_id, employee_code, pin_enabled, fingerprint_enabled, fingerprint_enrolled_at, personal_biometric_enabled, personal_passkey_count, locked_until, updated_at")
      .single();
    if (error) throw error;

    await supabase.from("audit_logs").insert({
      action: "attendance.credential.update",
      actor_id: session.userId,
      detail: `Updated attendance enrollment for ${profile.name}.`,
      shop_id: session.shopId,
      target_id: userId
    });
    return NextResponse.json({ ok: true, credential: data, message: "Attendance enrollment saved." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save attendance enrollment.";
    const conflict = /duplicate|unique|attendance_employee_code_unique/i.test(message);
    return NextResponse.json({ ok: false, message: conflict ? "That employee ID is already assigned in this store." : message }, { status: conflict ? 409 : 500 });
  }
}
