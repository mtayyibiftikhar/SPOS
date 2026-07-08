import type { Bill, BusinessDay, CashMovement, DayClose, Expense, Refund, Shift } from "@/types/pos";

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export type ShiftCashSummary = {
  billCount: number;
  openingCash: number;
  cashSales: number;
  cashRefunds: number;
  cashIn: number;
  cashOut: number;
  expectedCash: number;
  countedCash: number | null;
  difference: number | null;
};

export type BusinessDaySummary = {
  billCount: number;
  shiftCount: number;
  openingCash: number;
  totalSales: number;
  cashSales: number;
  cardSales: number;
  accountSales: number;
  refunds: number;
  cashIn: number;
  cashOut: number;
  expenses: number;
  netSales: number;
  expectedCash: number;
};

function isSalesBill(bill: Bill) {
  return bill.status !== "cancelled";
}

function resolveRefundBusinessDate(refund: Pick<Refund, "businessDate" | "returnDate">, timeZone: string) {
  return refund.businessDate ?? getBusinessDateInTimezone(timeZone, new Date(refund.returnDate));
}

export function getBusinessDateInTimezone(timeZone: string, value = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(value);
}

export function resolveBusinessDate(value: { businessDate?: string; createdAt: string }, timeZone: string) {
  return value.businessDate ?? getBusinessDateInTimezone(timeZone, new Date(value.createdAt));
}

export function getActiveBusinessDay(businessDays: BusinessDay[], shopId?: string | null) {
  if (!shopId) {
    return null;
  }

  return businessDays.find((day) => day.shopId === shopId && !day.endedAt) ?? null;
}

export function getActiveShift(shifts: Shift[], shopId?: string | null, cashierId?: string | null) {
  if (!shopId || !cashierId) {
    return null;
  }

  return shifts.find((shift) => shift.shopId === shopId && shift.cashierId === cashierId && !shift.endedAt) ?? null;
}

export function getLatestClosedShift(shifts: Shift[], shopId?: string | null, cashierId?: string | null) {
  if (!shopId || !cashierId) {
    return null;
  }

  return (
    shifts
      .filter((shift) => shift.shopId === shopId && shift.cashierId === cashierId && Boolean(shift.endedAt))
      .sort((left, right) => (right.endedAt ?? "").localeCompare(left.endedAt ?? ""))[0] ?? null
  );
}

export function getLatestDayClose(dayCloses: DayClose[], shopId?: string | null) {
  if (!shopId) {
    return null;
  }

  return (
    dayCloses
      .filter((dayClose) => dayClose.shopId === shopId)
      .sort((left, right) => right.closedAt.localeCompare(left.closedAt))[0] ?? null
  );
}

export function calculateShiftSummary({
  shift,
  bills,
  cashMovements,
  refunds = []
}: {
  shift: Shift;
  bills: Bill[];
  cashMovements: CashMovement[];
  refunds?: Refund[];
}): ShiftCashSummary {
  const shiftBills = bills.filter((bill) => bill.shiftId === shift.id && isSalesBill(bill));
  const movementLines = cashMovements.filter((movement) => movement.shiftId === shift.id);
  const shiftRefunds = refunds.filter((refund) => refund.shiftId === shift.id);
  const cashSales = roundMoney(
    shiftBills
      .filter((bill) => bill.paymentMethod === "cash")
      .reduce((sum, bill) => sum + bill.total, 0)
  );
  const cashRefunds = roundMoney(
    Math.abs(
      shiftRefunds
        .filter((refund) => refund.paymentMethod === "cash")
        .reduce((sum, refund) => sum + refund.amount, 0)
    )
  );
  const cashIn = roundMoney(
    movementLines
      .filter((movement) => movement.type === "cash_in")
      .reduce((sum, movement) => sum + movement.amount, 0)
  );
  const cashOut = roundMoney(
    movementLines
      .filter((movement) => movement.type === "cash_out")
      .reduce((sum, movement) => sum + movement.amount, 0)
  );
  const expectedCash = roundMoney(shift.openingCash + cashSales + cashIn - cashOut - cashRefunds);
  const countedCash = shift.countedCash ?? null;
  const difference =
    countedCash === null || countedCash === undefined ? null : roundMoney(countedCash - expectedCash);

  return {
    billCount: shiftBills.length,
    openingCash: roundMoney(shift.openingCash),
    cashSales,
    cashRefunds,
    cashIn,
    cashOut,
    expectedCash,
    countedCash,
    difference
  };
}

export function calculateBusinessDaySummary({
  businessDate,
  shopId,
  timeZone,
  bills,
  cashMovements,
  shifts,
  expenses = [],
  refunds = []
}: {
  businessDate: string;
  shopId: string;
  timeZone: string;
  bills: Bill[];
  cashMovements: CashMovement[];
  shifts: Shift[];
  expenses?: Expense[];
  refunds?: Refund[];
}): BusinessDaySummary {
  const dayBills = bills.filter(
    (bill) =>
      bill.shopId === shopId &&
      resolveBusinessDate(bill, timeZone) === businessDate &&
      isSalesBill(bill)
  );
  const dayRefunds = refunds.filter(
    (refund) =>
      refund.shopId === shopId &&
      resolveRefundBusinessDate(refund, timeZone) === businessDate
  );
  const dayShifts = shifts.filter((shift) => shift.shopId === shopId && shift.businessDate === businessDate);
  const dayMovements = cashMovements.filter(
    (movement) => movement.shopId === shopId && movement.businessDate === businessDate
  );
  const dayExpenses = expenses.filter(
    (expense) => expense.shopId === shopId && expense.businessDate === businessDate
  );
  const openingCash = roundMoney(dayShifts.reduce((sum, shift) => sum + shift.openingCash, 0));
  const totalSales = roundMoney(dayBills.reduce((sum, bill) => sum + bill.total, 0));
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
  const cashIn = roundMoney(
    dayMovements
      .filter((movement) => movement.type === "cash_in")
      .reduce((sum, movement) => sum + movement.amount, 0)
  );
  const cashOut = roundMoney(
    dayMovements
      .filter((movement) => movement.type === "cash_out")
      .reduce((sum, movement) => sum + movement.amount, 0)
  );
  const refundsTotal = roundMoney(Math.abs(dayRefunds.reduce((sum, refund) => sum + refund.amount, 0)));
  const expenseTotal = roundMoney(dayExpenses.reduce((sum, expense) => sum + expense.amount, 0));
  const cashRefunds = roundMoney(
    Math.abs(
      dayRefunds
        .filter((refund) => refund.paymentMethod === "cash")
        .reduce((sum, refund) => sum + refund.amount, 0)
    )
  );
  const netSales = roundMoney(totalSales - refundsTotal);
  const expectedCash = roundMoney(openingCash + cashSales + cashIn - cashOut - cashRefunds);

  return {
    billCount: dayBills.length,
    shiftCount: dayShifts.length,
    openingCash,
    totalSales,
    cashSales,
    cardSales,
    accountSales,
    refunds: refundsTotal,
    cashIn,
    cashOut,
    expenses: expenseTotal,
    netSales,
    expectedCash
  };
}
