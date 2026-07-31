import assert from "node:assert/strict";
import test from "node:test";
import {
  findCategoryNameConflict,
  normalizeCatalogName,
  normalizeSpreadsheetBarcode,
  unwrapSpreadsheetText
} from "../../src/lib/catalog";

test("spreadsheet barcodes survive Excel text formulas and scientific notation", () => {
  assert.equal(normalizeSpreadsheetBarcode('="6281234567890"'), "6281234567890");
  assert.equal(normalizeSpreadsheetBarcode("6.28123456789E+12"), "6281234567890");
  assert.equal(normalizeSpreadsheetBarcode("'0123456789012"), "0123456789012");
  assert.equal(unwrapSpreadsheetText('="6281|6282"'), "6281|6282");
  assert.equal(normalizeSpreadsheetBarcode("barcode"), undefined);
});

test("category matching ignores case and repeated whitespace", () => {
  const categories = [{
    id: "category-car-wash",
    shopId: "shop-1",
    name: "Car Wash",
    createdAt: "2026-07-31T00:00:00.000Z"
  }];

  assert.equal(normalizeCatalogName("  CAR   wash "), "car wash");
  assert.equal(findCategoryNameConflict(categories, "shop-1", "car wash")?.id, "category-car-wash");
  assert.equal(findCategoryNameConflict(categories, "shop-1", "Car Accessories"), null);
});
