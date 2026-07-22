import type { Bill, BillItem } from "@/types/pos";

const RECEIPT_HANDOFF_PREFIX = "simple-pos:fresh-receipt:";
const RECEIPT_HANDOFF_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type FreshReceiptHandoff = {
  bill: Bill;
  items: BillItem[];
  savedAt: number;
};

function getReceiptHandoffKey(billId: string) {
  return `${RECEIPT_HANDOFF_PREFIX}${billId}`;
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
