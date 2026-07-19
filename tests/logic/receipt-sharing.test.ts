import assert from "node:assert/strict";
import test from "node:test";
import { buildPolishedReceiptMessage } from "../../src/lib/receipt-sharing";

const baseReceipt = {
  customerName: "Muhammad Tayyib",
  storeName: "Ashan POS",
  receiptNumber: "REC-000012",
  createdAt: "2026-07-19T15:20:00.000Z",
  currency: "SAR",
  locale: "en" as const,
  items: [
    {
      name: "Icecream",
      quantity: 1,
      unitPrice: 20,
      lineTotal: 20
    }
  ],
  subtotal: 20,
  discountAmount: 0,
  taxLabel: "VAT",
  taxAmount: 2.61,
  total: 20,
  paidAmount: 20,
  dueAmount: 0,
  digitalReceiptUrl: "https://shop.globalfsms.com/r/test-token"
};

test("WhatsApp receipt message includes polished purchase details and the verified link", () => {
  const message = buildPolishedReceiptMessage({
    ...baseReceipt,
    channel: "whatsapp"
  });

  assert.match(message, /\*Thank you for shopping with us, Muhammad Tayyib!\*/);
  assert.match(message, /🧾 \*Receipt Details\*/);
  assert.match(message, /\*Icecream\*/);
  assert.match(message, /VAT: \*SAR\s?2\.61\*/);
  assert.match(message, /https:\/\/shop\.globalfsms\.com\/r\/test-token/);
});

test("Email receipt message stays readable without WhatsApp markdown", () => {
  const message = buildPolishedReceiptMessage({
    ...baseReceipt,
    channel: "email"
  });

  assert.match(message, /Thank you for shopping with us, Muhammad Tayyib!/);
  assert.doesNotMatch(message, /\*Receipt Details\*/);
  assert.match(message, /View or download your verified digital receipt:/);
});

test("Receipt message reports full and partial refund state", () => {
  const fullRefund = buildPolishedReceiptMessage({
    ...baseReceipt,
    channel: "whatsapp",
    refund: {
      isFullyRefunded: true,
      totalRefundAmount: 20
    }
  });
  const partialRefund = buildPolishedReceiptMessage({
    ...baseReceipt,
    channel: "email",
    refund: {
      isFullyRefunded: false,
      totalRefundAmount: 10
    }
  });

  assert.match(fullRefund, /\*Fully refunded\*/);
  assert.match(fullRefund, /Refunded amount: \*SAR\s?20\.00\*/);
  assert.match(partialRefund, /Partially refunded/);
});
