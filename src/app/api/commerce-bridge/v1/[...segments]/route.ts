import { createHash, createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { hashProductKey, previewProductKey, stableUuid } from "@/lib/cloud-sync";
import { authorizeCommerceBridgeRequest } from "@/lib/server/commerce-bridge-auth";
import { sendCommerceBridgeWebhook } from "@/lib/server/commerce-bridge-webhook";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type RouteContext = { params: Promise<{ segments: string[] }> };
type Json = Record<string, unknown>;

function clean(value: unknown, max = 191) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function keyFor(secret: string, requestId: string, purpose = "product-key") {
  return `GFSMS-${createHmac("sha256", secret).update(`${purpose}:${requestId}`).digest("base64url")}`;
}

function activationCodeFor(secret: string, requestId: string) {
  const digest = createHmac("sha256", secret).update(`activation-code:${requestId}`).digest();
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(digest.subarray(0, 8), (byte) => alphabet[byte % alphabet.length]).join("");
}

function slugify(value: string, suffix: string) {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "store";
  return `${slug.slice(0, 70)}-${suffix.slice(0, 8)}`;
}

async function parseAndAuthorize(request: Request) {
  const bodyText = await request.text();
  const path = new URL(request.url).pathname;
  const authorization = authorizeCommerceBridgeRequest(request, request.method, path, bodyText);
  if (!authorization) return { error: NextResponse.json({ ok: false, message: "Commerce bridge authorization failed." }, { status: 401 }) };
  let body: Json = {};
  if (bodyText) {
    try { body = JSON.parse(bodyText) as Json; }
    catch { return { error: NextResponse.json({ ok: false, message: "Invalid JSON payload." }, { status: 400 }) }; }
  }
  return { authorization, body, bodyText };
}

async function existingRequest(requestId: string, action: string, payloadHash: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("commerce_bridge_requests").select("request_id,action,shop_id,payload_hash,completed_at").eq("request_id", requestId).maybeSingle();
  if (error) throw error;
  if (data && (data.action !== action || data.payload_hash !== payloadHash)) return { conflict: true, data };
  return { conflict: false, data };
}

async function recordRequest(requestId: string, profile: string, action: string, shopId: string | null, payloadHash: string) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("commerce_bridge_requests").upsert({ request_id: requestId, connector_profile: profile, action, shop_id: shopId, payload_hash: payloadHash, completed_at: new Date().toISOString() }, { onConflict: "request_id" });
  if (error) throw error;
}

async function createStore(body: Json, auth: NonNullable<ReturnType<typeof authorizeCommerceBridgeRequest>>, bodyText: string) {
  const storeId = clean(body.store_uuid);
  const storeName = clean(body.store_name);
  const email = clean(body.contact_email).toLowerCase();
  const deviceLimit = Math.max(1, Math.min(1000, Math.round(Number(body.device_limit) || 1)));
  if (!isUuid(storeId) || storeName.length < 2 || !/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ ok: false, message: "Valid store UUID, name, and contact email are required." }, { status: 400 });

  const payloadHash = createHash("sha256").update(bodyText).digest("hex");
  const previous = await existingRequest(auth.idempotencyKey, "create_store", payloadHash);
  if (previous.conflict) return NextResponse.json({ ok: false, message: "Idempotency key payload conflict." }, { status: 409 });

  const supabase = createSupabaseAdminClient();
  const productKey = keyFor(auth.secret, auth.idempotencyKey);
  const productKeyId = stableUuid(`commerce-product-key:${auth.idempotencyKey}`);
  const now = new Date().toISOString();
  const endsAt = clean(body.ends_at) || null;
  const isTrial = clean(body.billing_cycle) === "trial" || clean(body.plan_key) === "trial";
  const billingCycle = ["monthly", "quarterly", "yearly"].includes(clean(body.billing_cycle)) ? clean(body.billing_cycle) : "monthly";
  const country = clean(body.country, 80) || "Saudi Arabia";

  const { error: shopError } = await supabase.from("shops").upsert({ id: storeId, name: storeName, slug: slugify(storeName, storeId), setup_email: email, email, phone: clean(body.contact_phone, 40), address: "", country, city: "", currency: clean(body.currency, 3) || "SAR", timezone: clean(body.timezone, 100) || "Asia/Riyadh", plan_name: clean(body.plan_key, 100) || "Starter", billing_cycle: billingCycle, package_price: 0, license_status: isTrial ? "trial" : "active", updated_at: now }, { onConflict: "id" });
  if (shopError) throw shopError;
  const { error: licenseError } = await supabase.from("licenses").upsert({ id: stableUuid(`commerce-license:${storeId}`), shop_id: storeId, status: isTrial ? "trial" : "active", expires_at: endsAt, locked_at: null, lock_reason: null, updated_at: now }, { onConflict: "shop_id" });
  if (licenseError) throw licenseError;
  const { error: keyError } = await supabase.from("product_keys").upsert({ id: productKeyId, shop_id: storeId, key_hash: hashProductKey(productKey), key_preview: previewProductKey(productKey), status: "unused", allowed_devices: deviceLimit, expires_at: endsAt, revoked_at: null, locked_at: null, created_at: now }, { onConflict: "key_hash" });
  if (keyError) throw keyError;
  const { error: settingsError } = await supabase.from("pos_settings").upsert({ shop_id: storeId, shop_name: storeName, address: "", phone: clean(body.contact_phone, 40), email, currency: clean(body.currency, 3) || "SAR", printer_settings: { receiptSize: "80mm", autoPrintAfterSale: false }, receipt_settings: { footerText: `Thank you for visiting ${storeName}.`, showTax: true, showCustomer: true, showCashier: true, showVatNumber: true, receiptSize: "80mm" }, tax_settings: { enabled: true, name: "VAT", rate: 15, mode: "inclusive", showOnReceipt: true }, updated_at: now }, { onConflict: "shop_id" });
  if (settingsError) throw settingsError;
  await recordRequest(auth.idempotencyKey, auth.profile, "create_store", storeId, payloadHash);
  await supabase.from("audit_logs").insert({ action: "commerce.store.provisioned", detail: `Store provisioned by ${auth.profile}.`, shop_id: storeId, target_id: storeId });
  const origin = process.env.NEXT_PUBLIC_POS_URL?.replace(/\/$/, "") || "";
  return NextResponse.json({ ok: true, store_id: storeId, status: isTrial ? "trialing" : "active", product_key: productKey, open_pos_url: origin ? `${origin}/login` : "/login" });
}

async function getStore(storeId: string) {
  const supabase = createSupabaseAdminClient();
  const [{ data: shop, error: shopError }, { data: license, error: licenseError }, { data: keys, error: keysError }, { data: devices, error: devicesError }] = await Promise.all([
    supabase.from("shops").select("id,name,email,phone,currency,timezone,plan_name,billing_cycle,license_status,updated_at").eq("id", storeId).maybeSingle(),
    supabase.from("licenses").select("status,expires_at,locked_at,lock_reason").eq("shop_id", storeId).maybeSingle(),
    supabase.from("product_keys").select("id,status,allowed_devices,key_preview,created_at,activated_at,expires_at").eq("shop_id", storeId).order("created_at", { ascending: false }),
    supabase.from("device_activations").select("id,product_key_id,browser_info,activated_at,last_seen_at").eq("shop_id", storeId).order("activated_at", { ascending: false })
  ]);
  if (shopError || licenseError || keysError || devicesError) throw shopError || licenseError || keysError || devicesError;
  if (!shop) return NextResponse.json({ ok: false, message: "Store not found." }, { status: 404 });
  return NextResponse.json({ ok: true, store: shop, license, product_keys: keys ?? [], devices: devices ?? [] });
}

async function performAction(storeId: string, body: Json, bodyText: string, auth: NonNullable<ReturnType<typeof authorizeCommerceBridgeRequest>>) {
  const action = clean(body.action, 64);
  const payloadHash = createHash("sha256").update(bodyText).digest("hex");
  const previous = await existingRequest(auth.idempotencyKey, action, payloadHash);
  if (previous.conflict) return NextResponse.json({ ok: false, message: "Idempotency key payload conflict." }, { status: 409 });
  const supabase = createSupabaseAdminClient();
  const { data: shop, error: shopError } = await supabase.from("shops").select("id,name,session_version").eq("id", storeId).maybeSingle();
  if (shopError) throw shopError;
  if (!shop) return NextResponse.json({ ok: false, message: "Store not found." }, { status: 404 });
  let response: Json = { ok: true };

  if (action === "update_device_allowance") {
    const limit = Math.max(1, Math.min(1000, Math.round(Number(body.device_limit) || 1)));
    const { data: key } = await supabase.from("product_keys").select("id").eq("shop_id", storeId).in("status", ["unused", "active"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!key) return NextResponse.json({ ok: false, message: "Active product key not found." }, { status: 409 });
    const { error } = await supabase.from("product_keys").update({ allowed_devices: limit }).eq("id", key.id);
    if (error) throw error;
    response = { ok: true, device_limit: limit };
  } else if (action === "update_access") {
    const requested = clean(body.status, 32);
    const locked = ["locked", "suspended", "expired", "manual_review"].includes(requested);
    const expired = requested === "expired";
    const licenseStatus = expired ? "expired" : locked ? "locked" : "active";
    const now = new Date().toISOString();
    const { error: licenseError } = await supabase.from("licenses").update({ status: licenseStatus, expires_at: clean(body.ends_at) || null, locked_at: locked ? now : null, lock_reason: locked ? clean(body.reason, 500) || "Commerce entitlement unavailable." : null, updated_at: now }).eq("shop_id", storeId);
    if (licenseError) throw licenseError;
    const { error: shopUpdateError } = await supabase.from("shops").update({ license_status: licenseStatus, updated_at: now }).eq("id", storeId);
    if (shopUpdateError) throw shopUpdateError;
    const { error: keysError } = await supabase.from("product_keys").update({ status: locked ? "locked" : "active", locked_at: locked ? now : null }).eq("shop_id", storeId).neq("status", "revoked");
    if (keysError) throw keysError;
    response = { ok: true, status: requested };
  } else if (action === "rotate_key") {
    const productKey = keyFor(auth.secret, auth.idempotencyKey, "rotated-product-key");
    const now = new Date().toISOString();
    const { data: current } = await supabase.from("product_keys").select("allowed_devices,expires_at").eq("shop_id", storeId).neq("status", "revoked").order("created_at", { ascending: false }).limit(1).maybeSingle();
    await supabase.from("product_keys").update({ status: "revoked", revoked_at: now }).eq("shop_id", storeId).neq("status", "revoked");
    const { error } = await supabase.from("product_keys").insert({ id: stableUuid(`commerce-rotated-key:${auth.idempotencyKey}`), shop_id: storeId, key_hash: hashProductKey(productKey), key_preview: previewProductKey(productKey), status: "unused", allowed_devices: current?.allowed_devices ?? 1, expires_at: current?.expires_at ?? null, created_at: now });
    if (error && error.code !== "23505") throw error;
    await supabase.from("device_activations").delete().eq("shop_id", storeId);
    response = { ok: true, product_key: productKey };
  } else if (action === "create_activation_code") {
    const { data: key } = await supabase.from("product_keys").select("id").eq("shop_id", storeId).in("status", ["unused", "active"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!key) return NextResponse.json({ ok: false, message: "Active product key not found." }, { status: 409 });
    const code = activationCodeFor(auth.secret, auth.idempotencyKey);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const { error } = await supabase.from("commerce_device_activation_codes").upsert({ id: stableUuid(`commerce-device-code:${auth.idempotencyKey}`), shop_id: storeId, product_key_id: key.id, code_hash: createHash("sha256").update(code).digest("hex"), expires_at: expiresAt }, { onConflict: "code_hash" });
    if (error) throw error;
    response = { ok: true, activation_code: code, expires_at: expiresAt };
  } else if (action === "revoke_device") {
    const deviceId = clean(body.device_id);
    const { error } = await supabase.from("device_activations").delete().eq("id", deviceId).eq("shop_id", storeId);
    if (error) throw error;
  } else if (action === "logout_all") {
    const { error: devicesError } = await supabase.from("device_activations").delete().eq("shop_id", storeId);
    if (devicesError) throw devicesError;
    const { error: versionError } = await supabase.from("shops").update({ session_version: Number(shop.session_version ?? 0) + 1, updated_at: new Date().toISOString() }).eq("id", storeId);
    if (versionError) throw versionError;
  } else if (action === "reset_admin_password") {
    const password = typeof body.new_password === "string" ? body.new_password : "";
    if (password.length < 12) return NextResponse.json({ ok: false, message: "POS password must contain at least 12 characters." }, { status: 400 });
    const { data: admin, error: adminError } = await supabase.from("profiles").select("id").eq("shop_id", storeId).eq("role", "shop_admin").eq("is_active", true).order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (adminError) throw adminError;
    if (!admin) return NextResponse.json({ ok: false, message: "The first POS administrator has not completed store installation yet." }, { status: 409 });
    const { error: passwordError } = await supabase.auth.admin.updateUserById(admin.id, { password });
    if (passwordError) throw passwordError;
    if (body.logout_all) {
      await supabase.from("device_activations").delete().eq("shop_id", storeId);
      await supabase.from("shops").update({ session_version: Number(shop.session_version ?? 0) + 1, updated_at: new Date().toISOString() }).eq("id", storeId);
    }
  } else {
    return NextResponse.json({ ok: false, message: "Unsupported commerce bridge action." }, { status: 400 });
  }

  await recordRequest(auth.idempotencyKey, auth.profile, action, storeId, payloadHash);
  await supabase.from("audit_logs").insert({ action: `commerce.${action}`, detail: `Signed commerce bridge action from ${auth.profile}.`, shop_id: storeId, target_id: storeId });
  const eventType = action === "revoke_device"
    ? "device_revoked"
    : action === "update_access" && ["locked", "suspended", "expired", "manual_review"].includes(clean(body.status, 32))
      ? "store_access_blocked"
      : action === "update_access"
        ? "store_access_restored"
        : "store_updated";
  await sendCommerceBridgeWebhook(auth.idempotencyKey, {
    event_type: eventType,
    store_id: storeId,
    ...(action === "revoke_device" ? { device_id: clean(body.device_id) } : {}),
    action
  });
  return NextResponse.json(response);
}

export async function GET(request: Request, context: RouteContext) {
  const parsed = await parseAndAuthorize(request);
  if ("error" in parsed) return parsed.error;
  const { segments } = await context.params;
  if (segments.length === 1 && segments[0] === "status") return NextResponse.json({ ok: true, profile: parsed.authorization.profile, service: "commerce-bridge", version: 1 });
  if (segments.length === 2 && segments[0] === "stores" && isUuid(segments[1])) return getStore(segments[1]);
  return NextResponse.json({ ok: false, message: "Commerce bridge route not found." }, { status: 404 });
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const parsed = await parseAndAuthorize(request);
    if ("error" in parsed) return parsed.error;
    const { segments } = await context.params;
    if (segments.length === 1 && segments[0] === "stores") return await createStore(parsed.body, parsed.authorization, parsed.bodyText);
    if (segments.length === 3 && segments[0] === "stores" && isUuid(segments[1]) && segments[2] === "actions") return await performAction(segments[1], parsed.body, parsed.bodyText, parsed.authorization);
    return NextResponse.json({ ok: false, message: "Commerce bridge route not found." }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Commerce bridge request failed." }, { status: 500 });
  }
}
