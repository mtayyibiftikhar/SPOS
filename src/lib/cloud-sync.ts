import { createHash } from "node:crypto";

export function hashProductKey(value: string) {
  return createHash("sha256").update(value.trim()).digest("hex");
}

export function stableUuid(seed: string) {
  const hex = createHash("sha256").update(seed).digest("hex");
  const variant = ((Number.parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, "0");

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `${variant}${hex.slice(18, 20)}`,
    hex.slice(20, 32)
  ].join("-");
}

export function previewProductKey(value: string) {
  const normalized = value.trim();

  if (normalized.length <= 12) {
    return normalized;
  }

  return `${normalized.slice(0, 8)}...${normalized.slice(-4)}`;
}
