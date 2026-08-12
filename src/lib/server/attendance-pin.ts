import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const PIN_PATTERN = /^\d{4,6}$/;
const EMPLOYEE_CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{2,19}$/;

export function normalizeEmployeeCode(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "-");
}

export function isValidEmployeeCode(value: string) {
  return EMPLOYEE_CODE_PATTERN.test(normalizeEmployeeCode(value));
}

export function isValidAttendancePin(value: string) {
  return PIN_PATTERN.test(value.trim());
}

export function hashAttendancePin(pin: string) {
  if (!isValidAttendancePin(pin)) throw new Error("Attendance PIN must contain 4 to 6 digits.");
  const salt = randomBytes(16).toString("hex");
  const digest = scryptSync(pin.trim(), salt, 32).toString("hex");
  return `scrypt:${salt}:${digest}`;
}

export function verifyAttendancePin(pin: string, storedHash: string) {
  if (!isValidAttendancePin(pin)) return false;
  const [algorithm, salt, digest] = storedHash.split(":");
  if (algorithm !== "scrypt" || !salt || !/^[a-f0-9]{64}$/i.test(digest ?? "")) return false;
  const expected = Buffer.from(digest, "hex");
  const actual = scryptSync(pin.trim(), salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
