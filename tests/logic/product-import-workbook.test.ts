import assert from "node:assert/strict";
import test from "node:test";
import { unzipSync } from "fflate";
import {
  applyProductImportDefaults,
  createProductImportWorkbook,
  PRODUCT_IMPORT_HEADERS,
  readProductImportWorkbook
} from "../../src/lib/product-import-workbook";

test("product import workbook contains strict dropdown validation", () => {
  const workbook = createProductImportWorkbook();
  const files = unzipSync(workbook);
  const sheet = new TextDecoder().decode(files["xl/worksheets/sheet1.xml"]);

  assert.match(sheet, /sqref="D2:D1001"/);
  assert.match(sheet, /allowBlank="1"[^>]*sqref="D2:D1001"/);
  assert.match(sheet, /&quot;product,service&quot;/);
  assert.match(sheet, /sqref="L2:L1001"/);
  assert.match(sheet, /sqref="M2:M1001"/);
  assert.match(sheet, /&quot;true,false&quot;/);
  assert.match(sheet, /sqref="N2:N1001"/);
  assert.match(sheet, /&quot;active,inactive&quot;/);
});

test("blank product type and category receive safe import defaults", () => {
  const row = Object.fromEntries(PRODUCT_IMPORT_HEADERS.map((header) => [header, ""])) as Record<(typeof PRODUCT_IMPORT_HEADERS)[number], string>;
  const result = applyProductImportDefaults(row);

  assert.equal(result.type, "product");
  assert.equal(result.category, "General");
  assert.equal(result.arabic_name, "");
  assert.equal(result.urdu_name, "");
});

test("generated product workbook reads back with exact headers and text barcodes", () => {
  const rows = readProductImportWorkbook(createProductImportWorkbook());

  assert.deepEqual(rows[0], [...PRODUCT_IMPORT_HEADERS]);
  assert.equal(rows[1][3], "product");
  assert.equal(rows[1][7], "6281234567890");
  assert.equal(rows[1][11], "true");
  assert.equal(rows[1][12], "true");
});
