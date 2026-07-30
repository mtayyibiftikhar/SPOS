import assert from "node:assert/strict";
import test from "node:test";
import {
  loadFreshRefundReceiptHandoff,
  saveFreshRefundReceiptHandoff
} from "../../src/lib/receipt-handoff";
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
  assert.match(message, /\*RECEIPT DETAILS\*/);
  assert.match(message, /\*Icecream\*/);
  assert.match(message, /VAT: \*SAR\s?2\.61\*/);
  assert.match(message, /https:\/\/shop\.globalfsms\.com\/r\/test-token/);
  assert.doesNotMatch(message, /�|ðŸ|â€¢|Ã—/);
});

test("Email receipt message stays readable without WhatsApp markdown", () => {
  const message = buildPolishedReceiptMessage({
    ...baseReceipt,
    channel: "email"
  });

  assert.match(message, /Thank you for shopping with us, Muhammad Tayyib!/);
  assert.doesNotMatch(message, /\*RECEIPT DETAILS\*/);
  assert.match(message, /VIEW OR DOWNLOAD YOUR VERIFIED DIGITAL RECEIPT/);
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

test("fresh partial refund receipt survives the navigation handoff", () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const values = new Map<string, string>();

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      sessionStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        removeItem: (key: string) => values.delete(key),
        setItem: (key: string, value: string) => values.set(key, value)
      }
    }
  });

  try {
    const refund = {
      id: "refund_partial",
      originalBillId: "bill_partial"
    } as Parameters<typeof saveFreshRefundReceiptHandoff>[0];
    const refundItems = [{ id: "refund_item_partial", refundId: refund.id }] as Parameters<
      typeof saveFreshRefundReceiptHandoff
    >[1];
    const bill = { id: "bill_partial" } as Parameters<typeof saveFreshRefundReceiptHandoff>[2];
    const billItems = [{ id: "bill_item_partial", billId: bill.id }] as Parameters<
      typeof saveFreshRefundReceiptHandoff
    >[3];

    saveFreshRefundReceiptHandoff(refund, refundItems, bill, billItems);
    const restored = loadFreshRefundReceiptHandoff(refund.id);

    assert.equal(restored?.refund.id, refund.id);
    assert.equal(restored?.bill.id, bill.id);
    assert.equal(restored?.refundItems[0].id, refundItems[0].id);
    assert.equal(restored?.billItems[0].id, billItems[0].id);
  } finally {
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", originalWindow);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  }
});
