import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedOwner } from "@/lib/supabase/owner-authorization";

export const OWNER_SESSION_COOKIE = "spos_owner_session";
export const OWNER_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

export type OwnerSession = {
  email: string;
  expiresAt: number;
  role: "super_admin" | "support";
};

function getSessionSecret() {
  const secret = process.env.OWNER_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secret) {
    throw new Error("Owner session signing is not configured.");
  }

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

    const key = entry.slice(0, separatorIndex).trim();

    if (key === name) {
      return decodeURIComponent(entry.slice(separatorIndex + 1).trim());
    }
  }

  return null;
}

export function createOwnerSessionToken(payload: Omit<OwnerSession, "expiresAt">) {
  const session: OwnerSession = {
    ...payload,
    email: payload.email.trim().toLowerCase(),
    expiresAt: Math.floor(Date.now() / 1000) + OWNER_SESSION_MAX_AGE_SECONDS
  };
  const encodedPayload = Buffer.from(JSON.stringify(session)).toString("base64url");

  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function verifyOwnerSessionToken(token: string | null | undefined) {
  if (!token) return null;

  const [encodedPayload, signature, extra] = token.split(".");

  if (!encodedPayload || !signature || extra || !safeEqual(signature, sign(encodedPayload))) {
    return null;
  }

  try {
    const session = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as OwnerSession;

    if (
      !session.email ||
      !["super_admin", "support"].includes(session.role) ||
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

export async function getAuthorizedOwnerSession(
  request: Request,
  allowedRoles: OwnerSession["role"][] = ["super_admin", "support"]
) {
  const session = verifyOwnerSessionToken(readCookie(request, OWNER_SESSION_COOKIE));

  if (!session || !allowedRoles.includes(session.role)) return null;

  const supabase = createSupabaseAdminClient();

  if (!(await isAuthorizedOwner(supabase, session.email))) {
    return null;
  }

  return { session, supabase };
}
