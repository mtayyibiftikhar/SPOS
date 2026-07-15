import "server-only";

import { createHash, randomBytes } from "node:crypto";

export function createSecureAttendanceToken() {
  return randomBytes(32).toString("base64url");
}

export function hashAttendanceToken(token: string) {
  return createHash("sha256").update(token.trim()).digest("hex");
}
