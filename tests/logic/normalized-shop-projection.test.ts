import assert from "node:assert/strict";
import test from "node:test";
import { syncNormalizedShopProjection } from "../../src/lib/server/normalized-shop-projection";
import type { DemoAppState } from "../../src/types/pos";

test("normalized projection maps POS string ids into consistent cloud UUID references", async () => {
  const inserted = new Map<string, Array<Record<string, unknown>>>();
  const client = {
    from(table: string) {
      return {
        select() {
          return {
            async eq() {
              return {
                data: table === "product_categories"
                  ? [{ id: "11111111-1111-4111-8111-111111111111", name: "general" }]
                  : [],
                error: null
              };
            }
          };
        },
        async upsert(rows: Array<Record<string, unknown>>) {
          inserted.set(table, rows);
          return { error: null };
        }
      };
    }
  };
  const shopId = "980c8ec9-d921-41e8-943a-b3d3d6bb2d3c";
  const state: Partial<DemoAppState> = {
    categories: [{ id: "category_general", shopId, name: "General", createdAt: "2026-07-29T08:00:00.000Z" }],
    products: [{
      id: "product_test",
      shopId,
      categoryId: "category_general",
      barcode: "12345",
      barcodes: ["12345", "54321"],
      kind: "product",
      name: { en: "Test", ar: "", ur: "" },
      salePrice: 10,
      costPrice: 4,
      stockQuantity: 2,
      reorderLevel: 0,
      taxable: true,
      quickTab: true,
      status: "active",
      createdAt: "2026-07-29T08:00:00.000Z",
      updatedAt: "2026-07-29T08:00:00.000Z"
    }],
    customers: [],
    businessDays: [],
    shifts: [],
    bills: [],
    billItems: [],
    payments: [],
    refunds: [],
    refundItems: [],
    users: []
  };

  const result = await syncNormalizedShopProjection(client as never, shopId, state);
  const category = inserted.get("product_categories")?.[0];
  const product = inserted.get("products")?.[0];
  const barcodes = inserted.get("product_barcodes") ?? [];

  assert.equal(result.products, 1);
  assert.equal(category?.id, "11111111-1111-4111-8111-111111111111");
  assert.equal(product?.category_id, category?.id);
  assert.equal(barcodes.length, 2);
  assert.ok(barcodes.every((entry) => entry.product_id === product?.id));
  assert.equal(barcodes.filter((entry) => entry.is_primary).length, 1);
});
