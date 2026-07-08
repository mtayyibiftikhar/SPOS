import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type ActivationRequest = {
  browserInfo?: string;
  deviceFingerprint?: string;
  productKey?: string;
};

function hashProductKey(value: string) {
  return createHash("sha256").update(value.trim()).digest("hex");
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
      .select("id, shop_id, status, allowed_devices, expires_at")
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

    return NextResponse.json({
      ok: true,
      licenseStatus,
      shopId: productKeyRow.shop_id
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Activation failed.";

    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
