import {
  buildCustomerSettlementLedgerEntries,
  buildRefundLedgerEntries,
  buildSaleLedgerEntries
} from "@/lib/accounting";
import {
  calculateBillTotals,
  calculateDiscountAmount,
  calculatePaymentAllocation,
  findCustomerPhoneConflict,
  findExistingCustomer,
  getBillStatus,
  normalizeCustomer,
  normalizeDiscountValue,
  shouldPersistCustomer
} from "@/lib/billing";
import {
  calculateBusinessDaySummary,
  calculateShiftSummary,
  getActiveBusinessDay,
  getActiveShift,
  getBusinessDateInTimezone
} from "@/lib/cash-control";
import { applySettlementToBills, getCustomerAccountMetrics } from "@/lib/customer-accounts";
import { createPublicReceiptToken } from "@/lib/public-receipts";
import { calculateBillRefundState } from "@/lib/refunds";
import { calculateScheduledAttendanceClosure } from "@/lib/attendance";
import { createId } from "@/lib/utils";
import type {
  Bill,
  BillItem,
  CheckoutBillInput,
  CreateRefundInput,
  Customer,
  CustomerAccountPayment,
  DemoAppState,
  Payment,
  Product,
  Refund,
  RefundItem,
  UserRole
} from "@/types/pos";

export type CriticalShopMutation =
  | { type: "create_bill"; payload: CheckoutBillInput }
  | { type: "create_refund"; payload: CreateRefundInput }
  | { type: "start_business_day"; payload: { businessDate?: string; openingNote?: string } }
  | { type: "close_business_day"; payload: { countedCash: number; note?: string } }
  | {
      type: "start_shift";
      payload: {
        deviceActivationId?: string;
        deviceBrowserInfo?: string;
        openingCash: number;
      };
    }
  | { type: "end_shift"; payload: { countedCash: number; note?: string } }
  | {
      type: "settle_customer_account";
      payload: {
        amount: number;
        billIds?: string[];
        customerId: string;
        method: "cash" | "card";
        note?: string;
      };
    };

export type CriticalMutationResult = {
  appliedAmount?: number;
  billId?: string;
  message?: string;
  number?: string;
  ok: boolean;
  paymentId?: string;
  refundId?: string;
};

type MutationContext = {
  allowedShiftCount?: number;
  role: UserRole;
  shopId: string;
  userId: string;
};

function startBusinessDayMutation(
  state: Partial<DemoAppState>,
  payload: Extract<CriticalShopMutation, { type: "start_business_day" }>["payload"],
  context: MutationContext
) {
  if (context.role !== "shop_admin") {
    return { result: { ok: false, message: "Only the shop admin can start the business day." }, state };
  }

  if (getActiveBusinessDay(state.businessDays ?? [], context.shopId)) {
    return { result: { ok: false, message: "Close the current business day before starting a new one." }, state };
  }

  const shop = state.shops?.find((entry) => entry.id === context.shopId);
  const now = new Date();
  const businessDate = payload.businessDate?.trim() || getBusinessDateInTimezone(shop?.timezone ?? "Asia/Riyadh", now);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) {
    return { result: { ok: false, message: "Enter a valid business date." }, state };
  }

  return {
    result: { ok: true },
    state: {
      ...state,
      businessDays: [
        {
          id: createId("day"),
          shopId: context.shopId,
          businessDate,
          openingNote: payload.openingNote?.trim() || undefined,
          startedBy: context.userId,
          startedAt: now.toISOString()
        },
        ...(state.businessDays ?? [])
      ]
    }
  };
}

function closeBusinessDayMutation(
  state: Partial<DemoAppState>,
  payload: Extract<CriticalShopMutation, { type: "close_business_day" }>["payload"],
  context: MutationContext
) {
  if (context.role !== "shop_admin") {
    return { result: { ok: false, message: "Only the shop admin can close the business day." }, state };
  }

  const countedCash = Math.round(payload.countedCash * 100) / 100;
  if (!Number.isFinite(countedCash) || countedCash < 0) {
    return { result: { ok: false, message: "Enter a valid counted cash amount." }, state };
  }

  const openDay = getActiveBusinessDay(state.businessDays ?? [], context.shopId);
  if (!openDay) return { result: { ok: false, message: "Start the business day before closing it." }, state };

  const openShifts = (state.shifts ?? []).filter(
    (shift) => shift.shopId === context.shopId && shift.businessDate === openDay.businessDate && !shift.endedAt
  );
  if (openShifts.length > 0) {
    return { result: { ok: false, message: "Close all open shifts before ending the business day." }, state };
  }

  const shop = state.shops?.find((entry) => entry.id === context.shopId);
  const summary = calculateBusinessDaySummary({
    bills: state.bills ?? [],
    businessDate: openDay.businessDate,
    cashMovements: state.cashMovements ?? [],
    customerAccountPayments: state.customerAccountPayments ?? [],
    expenses: state.expenses ?? [],
    refunds: state.refunds ?? [],
    shifts: state.shifts ?? [],
    shopId: context.shopId,
    timeZone: shop?.timezone ?? "Asia/Riyadh"
  });
  const closedAt = new Date().toISOString();

  return {
    result: { ok: true },
    state: {
      ...state,
      businessDays: (state.businessDays ?? []).map((day) =>
        day.id === openDay.id ? { ...day, endedAt: closedAt } : day
      ),
      attendanceRecords: (state.attendanceRecords ?? []).map((record) => {
        const closure =
          record.shopId === context.shopId &&
          record.businessDate === openDay.businessDate &&
          !record.clockOutAt
            ? calculateScheduledAttendanceClosure(record, new Date(closedAt))
            : null;

        return closure
          ? {
              ...record,
              status: "auto_closed" as const,
              clockOutAt: closure.clockOutAt,
              paidHours: closure.paidHours,
              note: record.note || "Auto closed at the employee's scheduled shift end.",
              editedBy: context.userId,
              editedAt: closedAt
            }
          : record;
      }),
      dayCloses: [
        {
          id: createId("day_close"),
          shopId: context.shopId,
          businessDate: openDay.businessDate,
          totalSales: summary.totalSales,
          cashSales: summary.cashSales,
          cardSales: summary.cardSales,
          accountSales: summary.accountSales,
          accountPaymentsReceived: summary.accountPaymentsReceived,
          accountCashPayments: summary.accountCashPayments,
          accountCardPayments: summary.accountCardPayments,
          refunds: summary.refunds,
          expenses: summary.expenses,
          netSales: summary.netSales,
          expectedCash: summary.expectedCash,
          countedCash,
          cashDifference: Math.round((countedCash - summary.expectedCash) * 100) / 100,
          note: payload.note?.trim() || undefined,
          closedAt
        },
        ...(state.dayCloses ?? [])
      ]
    }
  };
}

function startShiftMutation(
  state: Partial<DemoAppState>,
  payload: Extract<CriticalShopMutation, { type: "start_shift" }>["payload"],
  context: MutationContext
) {
  if (!context.role || !["shop_admin", "cashier"].includes(context.role)) {
    return { result: { ok: false, message: "Only shop users can start shifts." }, state };
  }

  const openingCash = Math.round(payload.openingCash * 100) / 100;
  if (!Number.isFinite(openingCash) || openingCash < 0) {
    return { result: { ok: false, message: "Enter a valid opening cash amount." }, state };
  }

  const openDay = getActiveBusinessDay(state.businessDays ?? [], context.shopId);
  if (!openDay) return { result: { ok: false, message: "Start the business day before starting a shift." }, state };
  if (getActiveShift(state.shifts ?? [], context.shopId, context.userId)) {
    return { result: { ok: false, message: "Close the current shift before starting a new one." }, state };
  }

  const openShifts = (state.shifts ?? []).filter(
    (shift) => shift.shopId === context.shopId && shift.businessDate === openDay.businessDate && !shift.endedAt
  );
  const snapshotShiftLimit = (state.productKeys ?? [])
    .filter((key) => key.shopId === context.shopId && !["revoked", "locked", "expired"].includes(key.status))
    .reduce((highest, key) => Math.max(highest, key.allowedDevices), 0);
  const allowedShifts = Math.max(1, context.allowedShiftCount ?? snapshotShiftLimit);

  if (openShifts.length >= allowedShifts) {
    return {
      result: {
        ok: false,
        message: `Only ${allowedShifts} open shift${allowedShifts === 1 ? "" : "s"} allowed for this shop today. Close a shift before opening another.`
      },
      state
    };
  }

  return {
    result: { ok: true },
    state: {
      ...state,
      shifts: [
        {
          id: createId("shift"),
          shopId: context.shopId,
          businessDayId: openDay.id,
          businessDate: openDay.businessDate,
          cashierId: context.userId,
          deviceActivationId: payload.deviceActivationId,
          deviceBrowserInfo: payload.deviceBrowserInfo,
          openingCash,
          startedAt: new Date().toISOString()
        },
        ...(state.shifts ?? [])
      ]
    }
  };
}

function endShiftMutation(
  state: Partial<DemoAppState>,
  payload: Extract<CriticalShopMutation, { type: "end_shift" }>["payload"],
  context: MutationContext
) {
  const countedCash = Math.round(payload.countedCash * 100) / 100;
  if (!Number.isFinite(countedCash) || countedCash < 0) {
    return { result: { ok: false, message: "Enter a valid counted cash amount." }, state };
  }

  const activeShift = getActiveShift(state.shifts ?? [], context.shopId, context.userId);
  if (!activeShift) return { result: { ok: false, message: "Start a shift before trying to close it." }, state };
  const summary = calculateShiftSummary({
    bills: state.bills ?? [],
    cashMovements: state.cashMovements ?? [],
    customerAccountPayments: state.customerAccountPayments ?? [],
    refunds: state.refunds ?? [],
    shift: activeShift
  });
  const endedAt = new Date().toISOString();

  return {
    result: { ok: true },
    state: {
      ...state,
      shifts: (state.shifts ?? []).map((shift) =>
        shift.id === activeShift.id
          ? {
              ...shift,
              countedCash,
              expectedCash: summary.expectedCash,
              difference: Math.round((countedCash - summary.expectedCash) * 100) / 100,
              note: payload.note?.trim() || undefined,
              endedAt
            }
          : shift
      )
    }
  };
}

function nextSequence(rows: Array<{ number: string }>, prefix: string, fallback: number) {
  const highest = rows.reduce((value, row) => {
    const match = row.number.match(new RegExp(`^${prefix}-(\\d+)$`));
    return match ? Math.max(value, Number(match[1])) : value;
  }, 0);

  return Math.max(fallback, highest + 1);
}

function consumeInventoryBatches(
  batches: NonNullable<Partial<DemoAppState>["inventoryBatches"]>,
  productId: string,
  quantity: number
) {
  let remaining = quantity;
  const nextRemaining = new Map<string, number>();

  batches
    .filter((batch) => batch.productId === productId && batch.remainingQuantity > 0)
    .sort((left, right) => (left.expiryDate || left.receivedAt).localeCompare(right.expiryDate || right.receivedAt))
    .forEach((batch) => {
      if (remaining <= 0) return;
      const consumed = Math.min(batch.remainingQuantity, remaining);
      nextRemaining.set(batch.id, Math.round((batch.remainingQuantity - consumed) * 100) / 100);
      remaining = Math.round((remaining - consumed) * 100) / 100;
    });

  return batches.map((batch) =>
    nextRemaining.has(batch.id) ? { ...batch, remainingQuantity: nextRemaining.get(batch.id)! } : batch
  );
}

function createBillMutation(
  state: Partial<DemoAppState>,
  payload: CheckoutBillInput,
  context: MutationContext
): { result: CriticalMutationResult; state: Partial<DemoAppState> } {
  const products = state.products ?? [];
  const customers = state.customers ?? [];
  const bills = state.bills ?? [];
  const businessDays = state.businessDays ?? [];
  const shifts = state.shifts ?? [];
  const activeBusinessDay = getActiveBusinessDay(businessDays, context.shopId);
  const activeShift = getActiveShift(shifts, context.shopId, context.userId);
  const settings = state.settingsByShop?.[context.shopId];
  const shop = state.shops?.find((entry) => entry.id === context.shopId);
  const availableProducts = products.filter((product) => product.shopId === context.shopId);
  const validItems = payload.items
    .map((item) => {
      const product = availableProducts.find((candidate) => candidate.id === item.productId);
      const unitPrice = Math.round(Math.max(item.unitPrice, 0) * 100) / 100;
      const discountType = item.discountType ?? "fixed";
      const gross = Math.round(unitPrice * Math.max(item.quantity, 0) * 100) / 100;
      const discountValue = normalizeDiscountValue(discountType, item.discountValue ?? 0, gross);

      if (!product || product.status !== "active" || item.quantity <= 0 || unitPrice <= 0) return null;
      return { discountType, discountValue, product, quantity: item.quantity, unitPrice };
    })
    .filter(
      (item): item is {
        discountType: "fixed" | "percentage";
        discountValue: number;
        product: Product;
        quantity: number;
        unitPrice: number;
      } => item !== null
    );

  if (validItems.length === 0) {
    return { result: { ok: false, message: "Add at least one product or service." }, state };
  }

  if (!activeBusinessDay) {
    return { result: { ok: false, message: "Start the business day before creating bills." }, state };
  }

  if (!activeShift) {
    return { result: { ok: false, message: "Start your shift before creating bills." }, state };
  }

  const requestedStock = validItems.reduce<Record<string, number>>((result, item) => {
    if (item.product.kind === "product") result[item.product.id] = (result[item.product.id] ?? 0) + item.quantity;
    return result;
  }, {});
  const oversold = validItems.find(
    (item) => item.product.kind === "product" && (requestedStock[item.product.id] ?? 0) > item.product.stockQuantity
  );

  if (oversold) {
    return { result: { ok: false, message: `Not enough stock for ${oversold.product.name.en}.` }, state };
  }

  const normalizedCustomer = normalizeCustomer(payload.customer);
  const existingCustomer = findExistingCustomer(customers, context.shopId, payload.customer);
  const normalizedCustomerData = {
    name: payload.customer.name?.trim() || existingCustomer?.name || normalizedCustomer.name,
    phone: normalizedCustomer.phone || existingCustomer?.phone,
    email: normalizedCustomer.email || existingCustomer?.email,
    whatsapp: normalizedCustomer.whatsapp || existingCustomer?.whatsapp
  };
  const phoneConflict = findCustomerPhoneConflict(
    customers,
    context.shopId,
    existingCustomer?.id ?? payload.customer.id,
    normalizedCustomerData.phone
  );

  if (phoneConflict) {
    return { result: { ok: false, message: "Another customer already uses this phone number." }, state };
  }

  const discountBase = Math.round(
    validItems.reduce((sum, item) => {
      const gross = Math.round(item.unitPrice * item.quantity * 100) / 100;
      return sum + Math.max(0, gross - calculateDiscountAmount(gross, item.discountType, item.discountValue));
    }, 0) * 100
  ) / 100;
  const billDiscountValue = normalizeDiscountValue(payload.discountType, payload.discountValue, discountBase);
  const tax = settings?.tax;
  const totals = calculateBillTotals({
    discountType: payload.discountType,
    discountValue: billDiscountValue,
    items: validItems.map((item) => ({
      discountType: item.discountType,
      discountValue: item.discountValue,
      quantity: item.quantity,
      taxable: item.product.taxable,
      unitPrice: item.unitPrice
    })),
    taxEnabled: tax?.enabled ?? false,
    taxMode: tax?.mode ?? "inclusive",
    taxRate: tax?.rate ?? 0
  });
  const paymentAllocation = calculatePaymentAllocation(
    totals.total,
    payload.paymentMethod,
    payload.paymentAmounts
  );
  if (!paymentAllocation.isValid) {
    return { result: { ok: false, message: "Payment amounts cannot exceed the bill total." }, state };
  }

  const { paidAmount, dueAmount } = paymentAllocation;
  if (dueAmount > 0 && (!normalizedCustomerData.name.trim() || !normalizedCustomerData.phone?.trim())) {
    return {
      result: { ok: false, message: "Account / pay later requires a saved customer with a name and phone number." },
      state
    };
  }
  const createdAt = new Date().toISOString();
  let customer: Customer | undefined = existingCustomer ?? undefined;
  let nextCustomers = customers;
  if (shouldPersistCustomer(payload.customer)) {
    if (existingCustomer) {
      customer = { ...existingCustomer, ...normalizedCustomerData };
      nextCustomers = customers.map((entry) => (entry.id === existingCustomer.id ? customer! : entry));
    } else {
      customer = {
        id: createId("cust"),
        shopId: context.shopId,
        ...normalizedCustomerData,
        createdAt
      };
      nextCustomers = [customer, ...customers];
    }
  }

  const sequence = nextSequence(
    bills.filter((bill) => bill.shopId === context.shopId),
    "REC",
    state.receiptSequencesByShop?.[context.shopId] ?? 1
  );
  const billId = createId("bill");
  const bill: Bill = {
    id: billId,
    shopId: context.shopId,
    publicToken: createPublicReceiptToken(bills.map((entry) => entry.publicToken)),
    customerId: customer?.id,
    businessDate:
      activeBusinessDay.businessDate ??
      getBusinessDateInTimezone(shop?.timezone ?? "Asia/Riyadh", new Date(createdAt)),
    shiftId: activeShift.id,
    number: `REC-${String(sequence).padStart(6, "0")}`,
    status: getBillStatus(paymentAllocation.paymentMethod, dueAmount),
    customerName: customer?.name ?? normalizedCustomerData.name,
    customerPhone: customer?.phone ?? normalizedCustomerData.phone,
    customerEmail: customer?.email ?? normalizedCustomerData.email,
    customerWhatsapp: customer?.whatsapp ?? normalizedCustomerData.whatsapp,
    subtotal: totals.subtotal,
    itemDiscountAmount: totals.itemDiscountAmount,
    discountType: payload.discountType,
    discountValue: billDiscountValue,
    discountAmount: totals.discountAmount,
    taxName: tax?.enabled ? tax.name : undefined,
    taxRate: tax?.enabled ? tax.rate : 0,
    taxMode: tax?.mode ?? "inclusive",
    taxAmount: totals.taxAmount,
    total: totals.total,
    paidAmount,
    dueAmount,
    paymentMethod: paymentAllocation.paymentMethod,
    cashierId: context.userId,
    createdAt
  };
  const billItems: BillItem[] = validItems.map((item) => {
    const gross = Math.round(item.unitPrice * item.quantity * 100) / 100;
    const discountAmount = calculateDiscountAmount(gross, item.discountType, item.discountValue);
    return {
      id: createId("bill_item"),
      billId,
      productId: item.product.id,
      productName: item.product.name,
      productKind: item.product.kind,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      costPrice: item.product.costPrice,
      discountType: item.discountType,
      discountValue: item.discountValue,
      discountAmount,
      grossLineTotal: gross,
      lineTotal: Math.round((gross - discountAmount) * 100) / 100
    };
  });
  const nextProducts = products.map((product) => {
    const sold = requestedStock[product.id] ?? 0;
    return sold > 0
      ? { ...product, stockQuantity: Math.round((product.stockQuantity - sold) * 100) / 100, updatedAt: createdAt }
      : product;
  });
  const inventoryAdjustments = Object.entries(requestedStock).map(([productId, quantity]) => {
    const product = products.find((entry) => entry.id === productId)!;

    return {
      id: createId("inv_adj"),
      shopId: context.shopId,
      productId,
      type: "sale" as const,
      quantity,
      beforeQuantity: product.stockQuantity,
      afterQuantity: Math.round((product.stockQuantity - quantity) * 100) / 100,
      reason: `Sale ${bill.number}`,
      referenceId: billId,
      createdBy: context.userId,
      createdAt
    };
  });
  const paymentRecords: Payment[] = [
    ...(paymentAllocation.cashAmount > 0
      ? [{ id: createId("payment"), billId, method: "cash" as const, amount: paymentAllocation.cashAmount, createdAt }]
      : []),
    ...(paymentAllocation.cardAmount > 0
      ? [{ id: createId("payment"), billId, method: "card" as const, amount: paymentAllocation.cardAmount, createdAt }]
      : [])
  ];

  return {
    result: { ok: true, billId },
    state: {
      ...state,
      customers: nextCustomers,
      products: nextProducts,
      bills: [bill, ...bills],
      billItems: [...billItems, ...(state.billItems ?? [])],
      payments: [...paymentRecords, ...(state.payments ?? [])],
      ledgerEntries: [
        ...buildSaleLedgerEntries({
          bill,
          billItems,
          payments: paymentRecords,
          createdBy: context.userId,
          idFactory: () => createId("ledger")
        }),
        ...(state.ledgerEntries ?? [])
      ],
      inventoryAdjustments: [...inventoryAdjustments, ...(state.inventoryAdjustments ?? [])],
      inventoryBatches: Object.entries(requestedStock).reduce(
        (rows, [productId, quantity]) => consumeInventoryBatches(rows, productId, quantity),
        state.inventoryBatches ?? []
      ),
      receiptSequencesByShop: {
        ...(state.receiptSequencesByShop ?? {}),
        [context.shopId]: sequence + 1
      }
    }
  };
}

function settleCustomerMutation(
  state: Partial<DemoAppState>,
  payload: Extract<CriticalShopMutation, { type: "settle_customer_account" }>["payload"],
  context: MutationContext
): { result: CriticalMutationResult; state: Partial<DemoAppState> } {
  const bills = state.bills ?? [];
  const customer = state.customers?.find(
    (entry) => entry.id === payload.customerId && entry.shopId === context.shopId
  );
  const openDay = getActiveBusinessDay(state.businessDays ?? [], context.shopId);
  const activeShift = getActiveShift(state.shifts ?? [], context.shopId, context.userId);
  const amount = Math.round(payload.amount * 100) / 100;

  if (!openDay) return { result: { ok: false, message: "Start the business day before receiving account payments." }, state };
  if (!activeShift) return { result: { ok: false, message: "Start your shift before receiving account payments." }, state };
  if (!customer) return { result: { ok: false, message: "Customer not found." }, state };
  if (!Number.isFinite(amount) || amount <= 0) {
    return { result: { ok: false, message: "Enter a settlement amount greater than zero." }, state };
  }

  const metrics = getCustomerAccountMetrics({
    bills,
    customerId: customer.id,
    settlements: (state.customerAccountPayments ?? []).filter(
      (entry) => entry.shopId === context.shopId && entry.customerId === customer.id
    )
  });
  const selected = new Set((payload.billIds ?? []).filter(Boolean));
  const limit = selected.size > 0
    ? Math.round(metrics.openBills.filter((bill) => selected.has(bill.id)).reduce((sum, bill) => sum + bill.dueAmount, 0) * 100) / 100
    : metrics.outstandingBalance;

  if (limit <= 0) return { result: { ok: false, message: "Select at least one open account bill." }, state };
  if (amount > limit) return { result: { ok: false, message: "Settlement amount cannot exceed outstanding balance." }, state };

  const applied = applySettlementToBills({ amount, bills, customerId: customer.id, billIds: payload.billIds });
  if (applied.appliedAmount <= 0) return { result: { ok: false, message: "Unable to apply the settlement." }, state };

  const createdAt = new Date().toISOString();
  const sequence = nextSequence(
    (state.customerAccountPayments ?? []).filter((entry) => entry.shopId === context.shopId),
    "PAY",
    state.accountPaymentSequencesByShop?.[context.shopId] ?? 1
  );
  const paymentId = createId("custpay");
  const payment: CustomerAccountPayment = {
    id: paymentId,
    shopId: context.shopId,
    customerId: customer.id,
    number: `PAY-${String(sequence).padStart(6, "0")}`,
    businessDate: openDay.businessDate,
    shiftId: activeShift.id,
    amount: applied.appliedAmount,
    method: payload.method,
    allocations: applied.allocations.map((allocation) => ({
      billId: allocation.billId,
      billNumber: bills.find((bill) => bill.id === allocation.billId)?.number ?? allocation.billId,
      amount: allocation.amount
    })),
    note: payload.note?.trim() || undefined,
    createdBy: context.userId,
    createdAt
  };

  return {
    result: { ok: true, appliedAmount: payment.amount, paymentId, number: payment.number },
    state: {
      ...state,
      accountPaymentSequencesByShop: {
        ...(state.accountPaymentSequencesByShop ?? {}),
        [context.shopId]: sequence + 1
      },
      customerAccountPayments: [payment, ...(state.customerAccountPayments ?? [])],
      bills: bills.map((bill) => applied.updatedBillsById[bill.id] ?? bill),
      payments: [
        ...applied.allocations.map((allocation) => ({
          id: createId("payment"),
          billId: allocation.billId,
          method: payload.method,
          amount: allocation.amount,
          createdAt
        })),
        ...(state.payments ?? [])
      ],
      ledgerEntries: [
        ...buildCustomerSettlementLedgerEntries({ payment, createdBy: context.userId, idFactory: () => createId("ledger") }),
        ...(state.ledgerEntries ?? [])
      ]
    }
  };
}

function createRefundMutation(
  state: Partial<DemoAppState>,
  payload: CreateRefundInput,
  context: MutationContext
): { result: CriticalMutationResult; state: Partial<DemoAppState> } {
  if (context.role !== "shop_admin") {
    return { result: { ok: false, message: "Only the shop admin can create refunds." }, state };
  }

  const bills = state.bills ?? [];
  const bill = bills.find((entry) => entry.id === payload.billId && entry.shopId === context.shopId);
  if (!bill) return { result: { ok: false, message: "The original bill could not be found." }, state };
  if (bill.status === "cancelled") return { result: { ok: false, message: "Cancelled bills cannot be refunded." }, state };
  if (payload.payoutMethod === "account" && !bill.customerId) {
    return { result: { ok: false, message: "Account adjustment refunds require a saved customer." }, state };
  }

  const openDay = getActiveBusinessDay(state.businessDays ?? [], context.shopId);
  const activeShift = getActiveShift(state.shifts ?? [], context.shopId, context.userId);
  if (!openDay) return { result: { ok: false, message: "Start the business day before creating refunds." }, state };
  if (!activeShift) return { result: { ok: false, message: "Start your shift before creating refunds." }, state };
  const reason = payload.reason.trim();
  if (!reason) return { result: { ok: false, message: "Add a refund reason before saving." }, state };

  const billItems = (state.billItems ?? []).filter((item) => item.billId === bill.id);
  const refundState = calculateBillRefundState({
    billId: bill.id,
    billItems,
    refunds: state.refunds ?? [],
    refundItems: state.refundItems ?? []
  });
  if (refundState.isFullyRefunded) {
    return { result: { ok: false, message: "This bill has already been fully refunded." }, state };
  }

  const requestedQuantities = payload.items.reduce<Record<string, number>>((quantities, entry) => {
    quantities[entry.billItemId] = Math.round(((quantities[entry.billItemId] ?? 0) + entry.quantity) * 100) / 100;
    return quantities;
  }, {});
  const selected = Object.entries(requestedQuantities).map(([billItemId, quantity]) => {
    const item = billItems.find((candidate) => candidate.id === billItemId);
    const remaining = Math.max(
      0,
      (item?.quantity ?? 0) - (refundState.refundedQuantitiesByBillItemId[billItemId] ?? 0)
    );

    return item && Number.isFinite(quantity) && quantity > 0 && quantity <= remaining
      ? { item, quantity }
      : null;
  });

  if (selected.length === 0 || selected.some((entry) => entry === null)) {
    return { result: { ok: false, message: "A refund quantity exceeds the remaining sold quantity." }, state };
  }

  const validSelected = selected.filter((entry): entry is { item: BillItem; quantity: number } => entry !== null);
  const allRefundQuantities = { ...refundState.refundedQuantitiesByBillItemId };
  validSelected.forEach((entry) => {
    allRefundQuantities[entry.item.id] = (allRefundQuantities[entry.item.id] ?? 0) + entry.quantity;
  });
  const fullyRefunded =
    billItems.length > 0 && billItems.every((item) => (allRefundQuantities[item.id] ?? 0) >= item.quantity);
  const lineRevenueTotal = billItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const billRevenueScale = lineRevenueTotal > 0 ? bill.total / lineRevenueTotal : 1;
  const alreadyRefunded = Math.abs(
    (state.refunds ?? [])
      .filter((entry) => entry.originalBillId === bill.id)
      .reduce((sum, entry) => sum + entry.amount, 0)
  );
  const remainingBillValue = Math.max(0, Math.round((bill.total - alreadyRefunded) * 100) / 100);
  const selectedRefundValue = Math.round(
    validSelected.reduce(
      (sum, entry) => sum + (entry.item.lineTotal / Math.max(entry.item.quantity, 1)) * billRevenueScale * entry.quantity,
      0
    ) * 100
  ) / 100;
  const refundValue = fullyRefunded ? remainingBillValue : Math.min(remainingBillValue, selectedRefundValue);

  if (refundValue <= 0) {
    return { result: { ok: false, message: "This bill has no refundable value remaining." }, state };
  }

  const priorPaidRefunds = Math.abs(
    (state.refunds ?? [])
      .filter(
        (entry) =>
          entry.originalBillId === bill.id && (entry.paymentMethod === "cash" || entry.paymentMethod === "card")
      )
      .reduce((sum, entry) => sum + entry.amount, 0)
  );
  const refundablePaidAmount = Math.max(0, Math.round((bill.paidAmount - priorPaidRefunds) * 100) / 100);

  if ((payload.payoutMethod === "cash" || payload.payoutMethod === "card") && refundValue > refundablePaidAmount) {
    return {
      result: { ok: false, message: "Cash or card refund cannot exceed the amount already paid on this bill." },
      state
    };
  }

  if (payload.payoutMethod === "account" && refundValue > bill.dueAmount) {
    return {
      result: { ok: false, message: "Account adjustment cannot exceed this bill's current due amount." },
      state
    };
  }

  const createdAt = new Date().toISOString();
  const refundId = createId("refund");
  const billedUnitRevenue = (item: BillItem) =>
    (item.quantity > 0 ? item.lineTotal / item.quantity : item.unitPrice) * billRevenueScale;
  const amount = -refundValue;
  const profitAdjustment = Math.round(
    validSelected.reduce(
      (sum, entry) => sum - (billedUnitRevenue(entry.item) - entry.item.costPrice) * entry.quantity,
      0
    ) * 100
  ) / 100;
  const shop = state.shops?.find((entry) => entry.id === context.shopId);
  const refund: Refund = {
    id: refundId,
    shopId: context.shopId,
    originalBillId: bill.id,
    originalSaleDate: bill.businessDate ?? getBusinessDateInTimezone(shop?.timezone ?? "Asia/Riyadh", new Date(bill.createdAt)),
    businessDate: openDay.businessDate,
    shiftId: activeShift.id,
    paymentMethod: payload.payoutMethod,
    createdBy: context.userId,
    returnDate: createdAt,
    reason,
    amount,
    profitAdjustment
  };
  const refundItems: RefundItem[] = validSelected.map((entry) => ({
    id: createId("refund_item"),
    refundId,
    billItemId: entry.item.id,
    productId: entry.item.productId,
    productName: entry.item.productName,
    quantity: entry.quantity,
    unitPrice: Math.round(billedUnitRevenue(entry.item) * 100) / 100,
    costPrice: entry.item.costPrice,
    refundAmount: Math.round(-(billedUnitRevenue(entry.item) * entry.quantity) * 100) / 100,
    profitAdjustment: Math.round(-((billedUnitRevenue(entry.item) - entry.item.costPrice) * entry.quantity) * 100) / 100
  }));
  const products = state.products ?? [];
  const stockAdjustments = products.flatMap((product) => {
    if (product.kind !== "product") return [];
    const quantity = refundItems.filter((item) => item.productId === product.id).reduce((sum, item) => sum + item.quantity, 0);
    return quantity > 0
      ? [{
          id: createId("inv_adj"),
          shopId: context.shopId,
          productId: product.id,
          type: "refund" as const,
          quantity,
          beforeQuantity: product.stockQuantity,
          afterQuantity: product.stockQuantity + quantity,
          reason: `Refund ${bill.number}: ${reason}`,
          referenceId: refundId,
          createdBy: context.userId,
          createdAt
        }]
      : [];
  });
  return {
    result: { ok: true, refundId },
    state: {
      ...state,
      refunds: [refund, ...(state.refunds ?? [])],
      refundItems: [...refundItems, ...(state.refundItems ?? [])],
      products: products.map((product) => {
        const returned = refundItems.filter((item) => item.productId === product.id).reduce((sum, item) => sum + item.quantity, 0);
        return returned > 0 ? { ...product, stockQuantity: product.stockQuantity + returned, updatedAt: createdAt } : product;
      }),
      inventoryAdjustments: [...stockAdjustments, ...(state.inventoryAdjustments ?? [])],
      inventoryBatches: [
        ...stockAdjustments.map((adjustment) => ({
          id: createId("batch"),
          shopId: context.shopId,
          productId: adjustment.productId,
          referenceId: refundId,
          batchNumber: `RETURN-${bill.number}`,
          quantity: adjustment.quantity,
          remainingQuantity: adjustment.quantity,
          costPrice: products.find((product) => product.id === adjustment.productId)?.costPrice ?? 0,
          receivedAt: createdAt,
          createdBy: context.userId
        })),
        ...(state.inventoryBatches ?? [])
      ],
      bills: bills.map((entry) => {
        if (entry.id !== bill.id) return entry;
        const dueAmount = payload.payoutMethod === "account"
          ? Math.max(0, Math.round((entry.dueAmount - refundValue) * 100) / 100)
          : entry.dueAmount;

        return {
          ...entry,
          dueAmount: fullyRefunded ? 0 : dueAmount,
          status: fullyRefunded ? "refunded" : dueAmount > 0 ? "due" : entry.status
        };
      }),
      ledgerEntries: [
        ...buildRefundLedgerEntries({
          bill,
          billItems,
          refund,
          refundItems,
          createdBy: context.userId,
          idFactory: () => createId("ledger")
        }),
        ...(state.ledgerEntries ?? [])
      ]
    }
  };
}

export function applyCriticalShopMutation(
  state: Partial<DemoAppState>,
  mutation: CriticalShopMutation,
  context: MutationContext
): { result: CriticalMutationResult; state: Partial<DemoAppState> } {
  if (mutation.type === "start_business_day") return startBusinessDayMutation(state, mutation.payload, context);
  if (mutation.type === "close_business_day") return closeBusinessDayMutation(state, mutation.payload, context);
  if (mutation.type === "start_shift") return startShiftMutation(state, mutation.payload, context);
  if (mutation.type === "end_shift") return endShiftMutation(state, mutation.payload, context);
  if (mutation.type === "create_bill") return createBillMutation(state, mutation.payload, context);
  if (mutation.type === "create_refund") return createRefundMutation(state, mutation.payload, context);
  return settleCustomerMutation(state, mutation.payload, context);
}
