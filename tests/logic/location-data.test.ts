import assert from "node:assert/strict";
import test from "node:test";
import { normalizeLocationNames } from "../../src/lib/location-data";

test("normalizeLocationNames trims, sorts, and removes case-insensitive duplicates", () => {
  assert.deepEqual(
    normalizeLocationNames([" Riyadh ", "Jeddah", "riyadh", "", "Abha", null]),
    ["Abha", "Jeddah", "Riyadh"]
  );
});

test("normalizeLocationNames rejects malformed location payloads", () => {
  assert.deepEqual(normalizeLocationNames(null), []);
  assert.deepEqual(normalizeLocationNames({ name: "Riyadh" }), []);
});
