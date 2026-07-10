import type { AccountingLedgerEntry, DemoAppState } from "@/types/pos";

export type OwnerClearShopDataScope = "all" | "bills" | "products";

export const ownerClearShopDataScopeLabels: Record<OwnerClearShopDataScope, string> = {
  all: "Entire POS data",
  bills: "Bills and sales data only",
  products: "Products and inventory data only"
};

export const ownerClearShopDataScopeDescriptions: Record<OwnerClearShopDataScope, string> = {
  all: "Clears catalog, inventory, customers, bills, refunds, cash control, expenses, reports, and account balances. Store, users, settings, license, key, and devices stay active.",
  bills: "Clears bills, bill items, payments, refunds, customer account payments, sales ledger rows, day close summaries, and receipt sequences. Products and customers stay saved.",
  products: "Clears products, categories, product trash, inventory, suppliers, and purchase orders. Existing historical bill receipts stay untouched."
};

type ResettableState = Partial<DemoAppState>;

function rowsWithoutShop<TItem extends { shopId?: string }>(rows: TItem[] | undefined, shopId: string) {
  return (rows ?? []).filter((row) => row.shopId !== shopId);
}

function omitShopKey<TValue>(record: Record<string, TValue> | undefined, shopId: string) {
  const next = { ...(record ?? {}) };
  delete next[shopId];
  return next;
}

function clearBillingLedgerRows(rows: AccountingLedgerEntry[] | undefined, shopId: string, clearEverything: boolean) {
  if (clearEverything) {
    return rowsWithoutShop(rows, shopId);
  }

  return (rows ?? []).filter(
    (entry) =>
      entry.shopId !== shopId ||
      !["bill", "customer_payment", "refund"].includes(entry.referenceType)
  );
}

export function clearShopDataScope<TState extends ResettableState>(
  state: TState,
  shopId: string,
  scope: OwnerClearShopDataScope,
  options: {
    actorId?: string;
    createdAt?: string;
    shopName?: string;
  } = {}
) {
  const clearBills = scope === "all" || scope === "bills";
  const clearProducts = scope === "all" || scope === "products";
  const billIds = new Set((state.bills ?? []).filter((bill) => bill.shopId === shopId).map((bill) => bill.id));
  const refundIds = new Set((state.refunds ?? []).filter((refund) => refund.shopId === shopId).map((refund) => refund.id));
  const purchaseOrderIds = new Set(
    (state.purchaseOrders ?? []).filter((purchaseOrder) => purchaseOrder.shopId === shopId).map((purchaseOrder) => purchaseOrder.id)
  );
  const next: ResettableState = { ...state };
  const createdAt = options.createdAt ?? new Date().toISOString();
  const scopeLabel = ownerClearShopDataScopeLabels[scope].toLowerCase();

  if (clearProducts) {
    next.categories = rowsWithoutShop(state.categories, shopId);
    next.products = rowsWithoutShop(state.products, shopId);
    next.inventoryAdjustments = rowsWithoutShop(state.inventoryAdjustments, shopId);
    next.inventoryBatches = rowsWithoutShop(state.inventoryBatches, shopId);
    next.suppliers = rowsWithoutShop(state.suppliers, shopId);
    next.purchaseOrders = rowsWithoutShop(state.purchaseOrders, shopId);
    next.purchaseOrderItems = (state.purchaseOrderItems ?? []).filter((item) => !purchaseOrderIds.has(item.purchaseOrderId));
    next.deletedProducts = rowsWithoutShop(state.deletedProducts, shopId);
  }

  if (clearBills) {
    next.customerAccountPayments = rowsWithoutShop(state.customerAccountPayments, shopId);
    next.bills = rowsWithoutShop(state.bills, shopId);
    next.billItems = (state.billItems ?? []).filter((item) => !billIds.has(item.billId));
    next.refunds = rowsWithoutShop(state.refunds, shopId);
    next.refundItems = (state.refundItems ?? []).filter((item) => !refundIds.has(item.refundId));
    next.payments = (state.payments ?? []).filter((payment) => !billIds.has(payment.billId));
    next.ledgerEntries = clearBillingLedgerRows(state.ledgerEntries, shopId, scope === "all");
    next.dayCloses = rowsWithoutShop(state.dayCloses, shopId);
    next.receiptSequencesByShop = {
      ...omitShopKey(state.receiptSequencesByShop, shopId),
      [shopId]: 1
    };
    next.accountPaymentSequencesByShop = {
      ...omitShopKey(state.accountPaymentSequencesByShop, shopId),
      [shopId]: 1
    };
  }

  if (scope === "all") {
    next.customers = rowsWithoutShop(state.customers, shopId);
    next.businessDays = rowsWithoutShop(state.businessDays, shopId);
    next.shifts = rowsWithoutShop(state.shifts, shopId);
    next.cashMovements = rowsWithoutShop(state.cashMovements, shopId);
    next.expenseCategories = rowsWithoutShop(state.expenseCategories, shopId);
    next.expenses = rowsWithoutShop(state.expenses, shopId);
    next.supportTickets = rowsWithoutShop(state.supportTickets, shopId);
    next.supportSessions = rowsWithoutShop(state.supportSessions, shopId);
  }

  next.auditLogs = [
    {
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      shopId,
      actorId: options.actorId ?? "owner",
      action: "owner.shop_data.clear",
      targetId: shopId,
      detail: `Cleared ${scopeLabel} for ${options.shopName ?? "store"}.`,
      createdAt
    },
    ...(state.auditLogs ?? [])
  ];

  return next as TState;
}
