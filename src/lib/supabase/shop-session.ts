import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

export const SHOP_DEVICE_SESSION_COOKIE = "spos_shop_device";
export const SHOP_USER_SESSION_COOKIE = "spos_shop_user";
export const SHOP_DEVICE_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
export const SHOP_USER_SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

export type ShopDeviceSession = {
  deviceFingerprint: string;
  expiresAt: number;
  kind: "device";
  productKeyId: string;
  shopId: string;
};

export type ShopUserSession = {
  email: string;
  expiresAt: number;
  kind: "user";
  role: "shop_admin" | "cashier" | "support";
  shopId: string;
  userId: string;
};

type ShopSession = ShopDeviceSession | ShopUserSession;

function getSessionSecret() {
  const secret = process.env.SHOP_SESSION_SECRET || process.env.OWNER_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secret) throw new Error("Shop session signing is not configured.");
  return secret;
}

function sign(value: string) {
  return createHmac("sha256", getSessionSecret()).update(value).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function readCookie(request: Request, name: string) {
  const cookieHeader = request.headers.get("cookie") ?? "";

  for (const entry of cookieHeader.split(";")) {
    const separatorIndex = entry.indexOf("=");
    if (separatorIndex < 0) continue;

    if (entry.slice(0, separatorIndex).trim() === name) {
      return decodeURIComponent(entry.slice(separatorIndex + 1).trim());
    }
  }

  return null;
}

function createToken<TSession extends ShopSession>(session: Omit<TSession, "expiresAt">, maxAge: number) {
  const payload = {
    ...session,
    expiresAt: Math.floor(Date.now() / 1000) + maxAge
  } as TSession;
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");

  return `${encoded}.${sign(encoded)}`;
}

function verifyToken<TSession extends ShopSession>(token: string | null, expectedKind: TSession["kind"]) {
  if (!token) return null;

  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra || !safeEqual(signature, sign(encoded))) return null;

  try {
    const session = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as TSession;

    if (
      session.kind !== expectedKind ||
      !session.shopId ||
      !Number.isFinite(session.expiresAt) ||
      session.expiresAt <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

export function createShopDeviceSessionToken(session: Omit<ShopDeviceSession, "expiresAt">) {
  return createToken<ShopDeviceSession>(session, SHOP_DEVICE_SESSION_MAX_AGE_SECONDS);
}

export function createShopUserSessionToken(session: Omit<ShopUserSession, "expiresAt">) {
  return createToken<ShopUserSession>(session, SHOP_USER_SESSION_MAX_AGE_SECONDS);
}

export function readShopDeviceSession(request: Request) {
  return verifyToken<ShopDeviceSession>(readCookie(request, SHOP_DEVICE_SESSION_COOKIE), "device");
}

export function readShopUserSession(request: Request) {
  return verifyToken<ShopUserSession>(readCookie(request, SHOP_USER_SESSION_COOKIE), "user");
}

export const shopSessionCookieOptions = (maxAge: number) => ({
  httpOnly: true,
  maxAge,
  path: "/",
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production"
});
