import assert from "node:assert/strict";
import test from "node:test";
import {
  hashAttendancePin,
  isValidAttendancePin,
  isValidEmployeeCode,
  normalizeEmployeeCode,
  verifyAttendancePin
} from "../../src/lib/server/attendance-pin";

test("attendance PIN accepts only four to six digits", () => {
  assert.equal(isValidAttendancePin("1234"), true);
  assert.equal(isValidAttendancePin("123456"), true);
  assert.equal(isValidAttendancePin("12a4"), false);
  assert.equal(isValidAttendancePin("1234567"), false);
});

test("attendance PIN hashes are salted and verifiable", () => {
  const first = hashAttendancePin("4826");
  const second = hashAttendancePin("4826");
  assert.notEqual(first, second);
  assert.equal(verifyAttendancePin("4826", first), true);
  assert.equal(verifyAttendancePin("4827", first), false);
});

test("employee codes are normalized and restricted", () => {
  assert.equal(normalizeEmployeeCode(" emp 0042 "), "EMP-0042");
  assert.equal(isValidEmployeeCode("EMP-0042"), true);
  assert.equal(isValidEmployeeCode("x"), false);
  assert.equal(isValidEmployeeCode("EMP_42"), false);
});
