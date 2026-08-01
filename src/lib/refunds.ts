import type {
  Bill,
  BillItem,
  Customer,
  Expense,
  PaymentMethod,
  Refund,
  RefundItem
} from "@/types/pos";

export function buildRefundCustomerHistory(bill: Bill, customer: Customer, assignedAt: string) {
  const history = [...(bill.customerHistory ?? [])];
  const currentName = bill.customerName?.trim();
  const changedCustomer = bill.customerId !== customer.id || currentName !== customer.name.trim();

  if (!changedCustomer) return history;

  if (currentName && !history.some((entry) => entry.customerId === bill.customerId && entry.name === currentName)) {
    history.push({
      assignedAt: bill.createdAt,
      customerId: bill.customerId,
      email: bill.customerEmail,
      name: currentName,
      phone: bill.customerPhone,
      source: "sale",
      vatNumber: bill.customerVatNumber
    });
  }

  history.push({
    assignedAt,
    customerId: customer.id,
    email: customer.email,
    name: customer.name,
    phone: customer.phone,
    source: "refund_reassignment",
    vatNumber: customer.vatNumber
  });

  return history;
}

export function formatRefundReceiptNumber(refundId: string) {
  const compactId = refundId.replace(/[^a-z0-9]/gi, "").toUpperCase();
  return `REF-${compactId.slice(-8).padStart(8, "0")}`;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function calculateRefundQuote({
  bill,
  billItems,
  previousQuantitiesByBillItemId = {},
  priorRefunds,
  selectedItems
}: {
  bill: Bill;
  billItems: BillItem[];
  previousQuantitiesByBillItemId?: Record<string, number>;
  priorRefunds: Refund[];
  selectedItems: Array<{ billItemId: string; quantity: number }>;
}) {
  const selectedQuantities = selectedItems.reduce<Record<string, number>>((quantities, entry) => {
    quantities[entry.billItemId] = roundMoney((quantities[entry.billItemId] ?? 0) + entry.quantity);
    return quantities;
  }, {});
  const lineRevenueTotal = billItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const billRevenueScale = lineRevenueTotal > 0 ? bill.total / lineRevenueTotal : 1;
  const alreadyRefunded = Math.abs(
    priorRefunds
      .filter((entry) => entry.originalBillId === bill.id)
      .reduce((sum, entry) => sum + entry.amount, 0)
  );
  const priorPaidRefunds = Math.abs(
    priorRefunds
      .filter(
        (entry) =>
          entry.originalBillId === bill.id && (entry.paymentMethod === "cash" || entry.paymentMethod === "card")
      )
      .reduce((sum, entry) => sum + entry.amount, 0)
  );
  const selectedRefundValue = roundMoney(
    billItems.reduce((sum, item) => {
      const quantity = selectedQuantities[item.id] ?? 0;
      const unitRevenue = (item.lineTotal / Math.max(item.quantity, 1)) * billRevenueScale;
      return sum + unitRevenue * quantity;
    }, 0)
  );
  const remainingBillValue = Math.max(0, roundMoney(bill.total - alreadyRefunded));
  const fullyRefunded =
    billItems.length > 0 &&
    billItems.every(
      (item) =>
        (previousQuantitiesByBillItemId[item.id] ?? 0) + (selectedQuantities[item.id] ?? 0) >= item.quantity
    );
  const refundValue = fullyRefunded ? remainingBillValue : Math.min(remainingBillValue, selectedRefundValue);

  return {
    billRevenueScale,
    fullyRefunded,
    refundValue,
    remainingBillValue,
    refundablePaidAmount: Math.max(0, roundMoney(bill.paidAmount - priorPaidRefunds)),
    selectedQuantities,
    selectedRefundValue
  };
}

function resolveBillBusinessDate(bill: Pick<Bill, "businessDate" | "createdAt">, timeZone: string) {
  if (bill.businessDate) {
    return bill.businessDate;
  }

  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(bill.createdAt));
}

export function resolveRefundBusinessDate(refund: Pick<Refund, "businessDate" | "returnDate">, timeZone: string) {
  if (refund.businessDate) {
    return refund.businessDate;
  }

  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(refund.returnDate));
}

export function calculateBillItemProfit(
  item: Pick<BillItem, "quantity" | "unitPrice" | "costPrice"> & Partial<Pick<BillItem, "lineTotal">>,
  quantity = item.quantity
) {
  const netUnitRevenue = item.quantity > 0 && item.lineTotal !== undefined ? item.lineTotal / item.quantity : item.unitPrice;

  return roundMoney((netUnitRevenue - item.costPrice) * quantity);
}

export function calculateBillRefundState({
  billId,
  billItems,
  refunds,
  refundItems
}: {
  billId: string;
  billItems: BillItem[];
  refunds: Refund[];
  refundItems: RefundItem[];
}) {
  const billRefunds = refunds.filter((refund) => refund.originalBillId === billId);
  const refundIds = new Set(billRefunds.map((refund) => refund.id));
  const relatedRefundItems = refundItems.filter((refundItem) => refundIds.has(refundItem.refundId));
  const refundedQuantitiesByBillItemId = relatedRefundItems.reduce<Record<string, number>>((accumulator, refundItem) => {
    accumulator[refundItem.billItemId] = (accumulator[refundItem.billItemId] ?? 0) + refundItem.quantity;
    return accumulator;
  }, {});
  const refundableItems = billItems.map((item) => {
    const refundedQuantity = refundedQuantitiesByBillItemId[item.id] ?? 0;
    return {
      item,
      refundedQuantity,
      remainingQuantity: Math.max(0, item.quantity - refundedQuantity)
    };
  });
  const totalRefundAmount = roundMoney(Math.abs(billRefunds.reduce((sum, refund) => sum + refund.amount, 0)));
  const totalProfitAdjustment = roundMoney(
    Math.abs(billRefunds.reduce((sum, refund) => sum + refund.profitAdjustment, 0))
  );
  const isFullyRefunded =
    refundableItems.length > 0 &&
    refundableItems.every((entry) => entry.remainingQuantity === 0);

  return {
    billRefunds,
    relatedRefundItems,
    refundedQuantitiesByBillItemId,
    refundableItems,
    totalRefundAmount,
    totalProfitAdjustment,
    isFullyRefunded
  };
}

export type SalesReportSummary = {
  billCount: number;
  refundCount: number;
  grossSales: number;
  refunds: number;
  returnsFromPreviousDays: number;
  sameDayReturns: number;
  netSales: number;
  expenses: number;
  grossProfit: number;
  profitAdjustments: number;
  netProfit: number;
  cashSales: number;
  cardSales: number;
  accountSales: number;
  cashRefunds: number;
  cardRefunds: number;
  accountRefunds: number;
};

function sumRefundsByMethod(refunds: Refund[], method: PaymentMethod) {
  return roundMoney(
    Math.abs(
      refunds
        .filter((refund) => refund.paymentMethod === method)
        .reduce((sum, refund) => sum + refund.amount, 0)
    )
  );
}

export function calculateSalesReportSummary({
  businessDate,
  shopId,
  timeZone,
  bills,
  billItems,
  expenses = [],
  refunds
}: {
  businessDate: string;
  shopId: string;
  timeZone: string;
  bills: Bill[];
  billItems: BillItem[];
  expenses?: Expense[];
  refunds: Refund[];
}) {
  const dayBills = bills.filter(
    (bill) =>
      bill.shopId === shopId &&
      bill.status !== "cancelled" &&
      resolveBillBusinessDate(bill, timeZone) === businessDate
  );
  const dayBillIds = new Set(dayBills.map((bill) => bill.id));
  const dayBillItems = billItems.filter((item) => dayBillIds.has(item.billId));
  const dayRefunds = refunds.filter(
    (refund) =>
      refund.shopId === shopId &&
      resolveRefundBusinessDate(refund, timeZone) === businessDate
  );
  const dayExpenses = expenses.filter(
    (expense) =>
      expense.shopId === shopId &&
      expense.businessDate === businessDate
  );
  const grossSales = roundMoney(dayBills.reduce((sum, bill) => sum + bill.total, 0));
  const totalRefunds = roundMoney(Math.abs(dayRefunds.reduce((sum, refund) => sum + refund.amount, 0)));
  const returnsFromPreviousDays = roundMoney(
    Math.abs(
      dayRefunds
        .filter((refund) => refund.originalSaleDate !== businessDate)
        .reduce((sum, refund) => sum + refund.amount, 0)
    )
  );
  const sameDayReturns = roundMoney(
    Math.abs(
      dayRefunds
        .filter((refund) => refund.originalSaleDate === businessDate)
        .reduce((sum, refund) => sum + refund.amount, 0)
    )
  );
  const grossProfit = roundMoney(
    dayBillItems.reduce((sum, item) => sum + calculateBillItemProfit(item), 0)
  );
  const profitAdjustments = roundMoney(
    Math.abs(dayRefunds.reduce((sum, refund) => sum + refund.profitAdjustment, 0))
  );
  const expenseTotal = roundMoney(dayExpenses.reduce((sum, expense) => sum + expense.amount, 0));
  const cashSales = roundMoney(
    dayBills
      .filter((bill) => bill.paymentMethod === "cash")
      .reduce((sum, bill) => sum + bill.total, 0)
  );
  const cardSales = roundMoney(
    dayBills
      .filter((bill) => bill.paymentMethod === "card")
      .reduce((sum, bill) => sum + bill.total, 0)
  );
  const accountSales = roundMoney(
    dayBills
      .filter((bill) => bill.paymentMethod === "account")
      .reduce((sum, bill) => sum + bill.total, 0)
  );

  return {
    billCount: dayBills.length,
    refundCount: dayRefunds.length,
    grossSales,
    refunds: totalRefunds,
    returnsFromPreviousDays,
    sameDayReturns,
    netSales: roundMoney(grossSales - totalRefunds),
    expenses: expenseTotal,
    grossProfit,
    profitAdjustments,
    netProfit: roundMoney(grossProfit - profitAdjustments - expenseTotal),
    cashSales,
    cardSales,
    accountSales,
    cashRefunds: sumRefundsByMethod(dayRefunds, "cash"),
    cardRefunds: sumRefundsByMethod(dayRefunds, "card"),
    accountRefunds: sumRefundsByMethod(dayRefunds, "account")
  } satisfies SalesReportSummary;
}

export function calculateSalesReportSummaryRange({
  dateFrom,
  dateTo,
  shopId,
  timeZone,
  bills,
  billItems,
  expenses = [],
  refunds
}: {
  dateFrom: string;
  dateTo: string;
  shopId: string;
  timeZone: string;
  bills: Bill[];
  billItems: BillItem[];
  expenses?: Expense[];
  refunds: Refund[];
}) {
  const dayBills = bills.filter((bill) => {
    if (bill.shopId !== shopId || bill.status === "cancelled") {
      return false;
    }

    const businessDate = resolveBillBusinessDate(bill, timeZone);
    return businessDate >= dateFrom && businessDate <= dateTo;
  });
  const dayBillIds = new Set(dayBills.map((bill) => bill.id));
  const dayBillItems = billItems.filter((item) => dayBillIds.has(item.billId));
  const dayRefunds = refunds.filter((refund) => {
    if (refund.shopId !== shopId) {
      return false;
    }

    const businessDate = resolveRefundBusinessDate(refund, timeZone);
    return businessDate >= dateFrom && businessDate <= dateTo;
  });
  const dayExpenses = expenses.filter((expense) => {
    if (expense.shopId !== shopId) {
      return false;
    }

    return expense.businessDate >= dateFrom && expense.businessDate <= dateTo;
  });
  const grossSales = roundMoney(dayBills.reduce((sum, bill) => sum + bill.total, 0));
  const totalRefunds = roundMoney(Math.abs(dayRefunds.reduce((sum, refund) => sum + refund.amount, 0)));
  const returnsFromPreviousDays = roundMoney(
    Math.abs(
      dayRefunds
        .filter((refund) => refund.originalSaleDate !== resolveRefundBusinessDate(refund, timeZone))
        .reduce((sum, refund) => sum + refund.amount, 0)
    )
  );
  const sameDayReturns = roundMoney(
    Math.abs(
      dayRefunds
        .filter((refund) => refund.originalSaleDate === resolveRefundBusinessDate(refund, timeZone))
        .reduce((sum, refund) => sum + refund.amount, 0)
    )
  );
  const grossProfit = roundMoney(
    dayBillItems.reduce((sum, item) => sum + calculateBillItemProfit(item), 0)
  );
  const profitAdjustments = roundMoney(
    Math.abs(dayRefunds.reduce((sum, refund) => sum + refund.profitAdjustment, 0))
  );
  const expenseTotal = roundMoney(dayExpenses.reduce((sum, expense) => sum + expense.amount, 0));
  const cashSales = roundMoney(
    dayBills
      .filter((bill) => bill.paymentMethod === "cash")
      .reduce((sum, bill) => sum + bill.total, 0)
  );
  const cardSales = roundMoney(
    dayBills
      .filter((bill) => bill.paymentMethod === "card")
      .reduce((sum, bill) => sum + bill.total, 0)
  );
  const accountSales = roundMoney(
    dayBills
      .filter((bill) => bill.paymentMethod === "account")
      .reduce((sum, bill) => sum + bill.total, 0)
  );

  return {
    billCount: dayBills.length,
    refundCount: dayRefunds.length,
    grossSales,
    refunds: totalRefunds,
    returnsFromPreviousDays,
    sameDayReturns,
    netSales: roundMoney(grossSales - totalRefunds),
    expenses: expenseTotal,
    grossProfit,
    profitAdjustments,
    netProfit: roundMoney(grossProfit - profitAdjustments - expenseTotal),
    cashSales,
    cardSales,
    accountSales,
    cashRefunds: sumRefundsByMethod(dayRefunds, "cash"),
    cardRefunds: sumRefundsByMethod(dayRefunds, "card"),
    accountRefunds: sumRefundsByMethod(dayRefunds, "account")
  } satisfies SalesReportSummary;
}
