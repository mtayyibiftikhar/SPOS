import type { Bill, BillItem, Refund, RefundItem } from "@/types/pos";

const RECEIPT_HANDOFF_PREFIX = "simple-pos:fresh-receipt:";
const REFUND_RECEIPT_HANDOFF_PREFIX = "simple-pos:fresh-refund-receipt:";
const RECEIPT_HANDOFF_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type FreshReceiptHandoff = {
  bill: Bill;
  items: BillItem[];
  savedAt: number;
};

export type FreshRefundReceiptHandoff = {
  bill: Bill;
  billItems: BillItem[];
  refund: Refund;
  refundItems: RefundItem[];
  savedAt: number;
};

function getReceiptHandoffKey(billId: string) {
  return `${RECEIPT_HANDOFF_PREFIX}${billId}`;
}

function getRefundReceiptHandoffKey(refundId: string) {
  return `${REFUND_RECEIPT_HANDOFF_PREFIX}${refundId}`;
}

export function saveFreshReceiptHandoff(bill: Bill, items: BillItem[]) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(
      getReceiptHandoffKey(bill.id),
      JSON.stringify({ bill, items, savedAt: Date.now() } satisfies FreshReceiptHandoff)
    );
  } catch {
    // Cloud state remains the source of truth if session storage is unavailable.
  }
}

export function loadFreshReceiptHandoff(billId: string): FreshReceiptHandoff | null {
  if (typeof window === "undefined") {
    return null;
  }

  const storageKey = getReceiptHandoffKey(billId);

  try {
    const rawValue = window.sessionStorage.getItem(storageKey);

    if (!rawValue) {
      return null;
    }

    const handoff = JSON.parse(rawValue) as FreshReceiptHandoff;
    const isValid =
      handoff.bill?.id === billId &&
      Array.isArray(handoff.items) &&
      Number.isFinite(handoff.savedAt) &&
      Date.now() - handoff.savedAt <= RECEIPT_HANDOFF_MAX_AGE_MS;

    if (!isValid) {
      window.sessionStorage.removeItem(storageKey);
      return null;
    }

    return handoff;
  } catch {
    window.sessionStorage.removeItem(storageKey);
    return null;
  }
}

export function saveFreshRefundReceiptHandoff(
  refund: Refund,
  refundItems: RefundItem[],
  bill: Bill,
  billItems: BillItem[]
) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(
      getRefundReceiptHandoffKey(refund.id),
      JSON.stringify({ bill, billItems, refund, refundItems, savedAt: Date.now() } satisfies FreshRefundReceiptHandoff)
    );
  } catch {
    // Cloud state remains the source of truth if session storage is unavailable.
  }
}

export function loadFreshRefundReceiptHandoff(refundId: string): FreshRefundReceiptHandoff | null {
  if (typeof window === "undefined") {
    return null;
  }

  const storageKey = getRefundReceiptHandoffKey(refundId);

  try {
    const rawValue = window.sessionStorage.getItem(storageKey);

    if (!rawValue) {
      return null;
    }

    const handoff = JSON.parse(rawValue) as FreshRefundReceiptHandoff;
    const isValid =
      handoff.refund?.id === refundId &&
      handoff.bill?.id === handoff.refund.originalBillId &&
      Array.isArray(handoff.refundItems) &&
      Array.isArray(handoff.billItems) &&
      Number.isFinite(handoff.savedAt) &&
      Date.now() - handoff.savedAt <= RECEIPT_HANDOFF_MAX_AGE_MS;

    if (!isValid) {
      window.sessionStorage.removeItem(storageKey);
      return null;
    }

    return handoff;
  } catch {
    window.sessionStorage.removeItem(storageKey);
    return null;
  }
}
