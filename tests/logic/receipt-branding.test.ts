import assert from "node:assert/strict";
import test from "node:test";
import { buildReceiptPdfDocument, buildUnifiedReceiptPdfDocument } from "../../src/lib/receipt-export";
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

test("refund and account PDFs share the canonical receipt structure", () => {
  const common = {
    receiptSize: "80mm" as const,
    shopName: "Test Shop",
    shopAddress: "Riyadh",
    shopPhone: "+966500000000",
    shopVatNumber: "1234567890",
    shopLogoUrl: "/api/pos-assets/shops/shop-1/shop-logo/logo.webp",
    metadata: [
      { label: "Receipt number", value: "TEST-000001" },
      { label: "Payment method", value: "Cash" }
    ],
    customer: {
      name: "Customer One",
      phone: "+966511111111",
      email: "customer@example.com",
      whatsapp: "+966522222222",
      vatNumber: "9988776655",
      address: "Riyadh"
    },
    items: [{ name: "Receipt line", quantity: "1", unitPrice: "SAR 10.00", total: "SAR 10.00" }],
    totals: [{ label: "Total", value: "SAR 10.00", strong: true }],
    qrCodeUrl: "https://example.com/receipt-qr.png",
    ownerBrand: {
      companyName: "POS Platform",
      logoUrl: "/owner-logo.png",
      receiptImprintEnabled: true,
      receiptImprintText: "Powered by POS Platform"
    }
  };
  const refund = buildUnifiedReceiptPdfDocument({ ...common, receiptNumber: "REF-000001", receiptType: "Refund receipt" });
  const account = buildUnifiedReceiptPdfDocument({ ...common, receiptNumber: "PAY-000001", receiptType: "Account payment receipt" });

  assert.deepEqual(refund.headerLines, account.headerLines);
  assert.equal(refund.logoUrl, account.logoUrl);
  assert.equal(refund.qrCodeUrl, account.qrCodeUrl);
  assert.deepEqual(refund.ownerImprintLines, account.ownerImprintLines);
  assert.deepEqual(
    refund.elements.slice(1).map((element) => element.type),
    account.elements.slice(1).map((element) => element.type)
  );
  assert.ok(JSON.stringify(refund.elements).includes("WhatsApp +966522222222"));
  assert.ok(JSON.stringify(account.elements).includes("VAT No. 9988776655"));
});
