import assert from "node:assert/strict";
import test from "node:test";
import { buildReceiptPdfDocument } from "../../src/lib/receipt-export";
import type { Bill, POSSettings, Shop } from "../../src/types/pos";

test("receipt PDFs use the stable same-origin shop logo URL", () => {
  const document = buildReceiptPdfDocument({
    bill: {
      createdAt: "2026-07-30T09:00:00.000Z",
      discountAmount: 0,
      dueAmount: 0,
      itemDiscountAmount: 0,
      number: "REC-000001",
      paidAmount: 10,
      paymentMethod: "cash",
      publicToken: "public-receipt-token-example",
      status: "paid",
      subtotal: 10,
      taxAmount: 0,
      total: 10
    } as Bill,
    brand: undefined,
    cashier: null,
    items: [],
    posSettings: {
      logoUrl: "https://project.supabase.co/storage/v1/object/sign/pos-assets/shops/shop-1/shop-logo/logo.webp?token=expired",
      shopName: "Test Shop",
      vatNumber: "1234567890"
    } as POSSettings,
    receiptSettings: undefined,
    shop: { currency: "SAR" } as Shop
  });

  assert.equal(
    document.logoUrl,
    "/api/pos-assets/shops/shop-1/shop-logo/logo.webp"
  );
  assert.deepEqual(document.headerLines, ["Test Shop", "VAT No. 1234567890"]);
});
