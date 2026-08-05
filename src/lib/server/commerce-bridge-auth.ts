import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type CommerceBridgeAuthorization = {
  idempotencyKey: string;
  profile: string;
  secret: string;
};

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function authorizeCommerceBridgeRequest(
  request: Request,
  method: string,
  path: string,
  body: string
): CommerceBridgeAuthorization | null {
  const expectedProfile = process.env.COMMERCE_BRIDGE_PROFILE?.trim();
  const secret = process.env.COMMERCE_BRIDGE_API_KEY?.trim();
  const profile = request.headers.get("x-gfcb-profile")?.trim();
  const timestampRaw = request.headers.get("x-gfcb-timestamp")?.trim();
  const signature = request.headers.get("x-gfcb-signature")?.trim();
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  const timestamp = Number(timestampRaw);

  if (
    !expectedProfile ||
    !secret ||
    profile !== expectedProfile ||
    !signature ||
    !idempotencyKey ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey) ||
    !Number.isFinite(timestamp) ||
    Math.abs(Math.floor(Date.now() / 1000) - timestamp) > 300
  ) {
    return null;
  }

  const canonicalBodyHash = createHash("sha256").update(body).digest("hex");
  const canonical = `${method.toUpperCase()}\n${path}\n${timestampRaw}\n${canonicalBodyHash}`;
  const expected = createHmac("sha256", secret).update(canonical).digest("hex");
  return safeEqual(expected, signature) ? { idempotencyKey, profile, secret } : null;
}
