import assert from "node:assert/strict";
import test from "node:test";
import { buildCsv, normalizeCsvHeader, parseCsv } from "../../src/lib/csv";

test("CSV parser handles quoted commas, quotes, and line breaks", () => {
  const rows = parseCsv('name,note\r\n"Tea, large","Line one\nLine ""two"""');

  assert.deepEqual(rows, [
    ["name", "note"],
    ["Tea, large", 'Line one\nLine "two"']
  ]);
});

test("CSV builder round trips values used by product and inventory exports", () => {
  const input = [
    ["product_id", "additional_barcodes"],
    ["prod-1", "123|456"],
    ["prod-2", "quoted, value"]
  ];

  assert.deepEqual(parseCsv(buildCsv(input)), input);
});

test("CSV headers are normalized consistently", () => {
  assert.equal(normalizeCsvHeader("\uFEFFAdditional Barcodes "), "additional_barcodes");
});
