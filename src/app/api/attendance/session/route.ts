import { NextResponse } from "next/server";
import { createSecureAttendanceToken, hashAttendanceToken } from "@/lib/server/attendance-token";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { readShopUserSession } from "@/lib/supabase/shop-session";
import type { DemoAppState } from "@/types/pos";

const SESSION_TTL_MS = 10 * 60 * 1000;

type SessionRequest = {
  businessDate?: string;
};

function isBusinessDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
export async function POST(request: Request) {
  const session = readShopUserSession(request);

  if (!session) {
    return NextResponse.json({ ok: false, message: "Sign in before creating an attendance QR." }, { status: 401 });
  }

  let body: SessionRequest;

  try {
    body = (await request.json()) as SessionRequest;
  } catch {
    return NextResponse.json({ ok: false, message: "A valid attendance request is required." }, { status: 400 });
  }

  const businessDate = body.businessDate?.trim() ?? "";

  if (!isBusinessDate(businessDate)) {
    return NextResponse.json({ ok: false, message: "A valid business date is required." }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const [{ data: profile, error: profileError }, { data: snapshot, error: snapshotError }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, shop_id, is_active")
        .eq("id", session.userId)
        .eq("shop_id", session.shopId)
        .eq("is_active", true)
        .maybeSingle(),
      supabase.from("shop_cloud_snapshots").select("state").eq("shop_id", session.shopId).maybeSingle()
    ]);

    if (profileError) throw profileError;
    if (snapshotError) throw snapshotError;
    if (!profile) {
      return NextResponse.json({ ok: false, message: "This employee account is no longer active." }, { status: 403 });
    }

    const state = (snapshot?.state ?? {}) as Partial<DemoAppState>;
    const openBusinessDay = state.businessDays?.some(
      (day) => day.shopId === session.shopId && day.businessDate === businessDate && !day.endedAt
    );

    if (!openBusinessDay) {
      return NextResponse.json({ ok: false, message: "Open the business day before creating an attendance QR." }, { status: 409 });
    }

    const token = createSecureAttendanceToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    const now = new Date().toISOString();

    await supabase
      .from("attendance_qr_sessions")
      .delete()
      .eq("shop_id", session.shopId)
      .eq("user_id", session.userId)
      .is("used_at", null);

    const { error: insertError } = await supabase.from("attendance_qr_sessions").insert({
      business_date: businessDate,
      created_at: now,
      created_by: session.userId,
      expires_at: expiresAt,
      shop_id: session.shopId,
      token_hash: hashAttendanceToken(token),
      user_id: session.userId
    });

    if (insertError) throw insertError;

    const scanUrl = new URL("/time-clock/scan", request.url);
    scanUrl.searchParams.set("shopId", session.shopId);
    scanUrl.searchParams.set("userId", session.userId);
    scanUrl.searchParams.set("businessDate", businessDate);
    scanUrl.searchParams.set("token", token);

    return NextResponse.json({ ok: true, expiresAt, scanUrl: scanUrl.toString() });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Unable to create attendance QR." },
      { status: 500 }
    );
  }
}
