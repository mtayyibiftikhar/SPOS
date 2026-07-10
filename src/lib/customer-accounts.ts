import type { Bill, CustomerAccountPayment } from "@/types/pos";

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function getCustomerOpenBills(bills: Bill[], customerId: string) {
  return bills
    .filter(
      (bill) =>
        bill.customerId === customerId &&
        bill.dueAmount > 0 &&
        bill.status !== "cancelled" &&
        bill.status !== "refunded"
    )
    .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
}

export function getCustomerAccountMetrics({
  bills,
  customerId,
  settlements
}: {
  bills: Bill[];
  customerId: string;
  settlements: CustomerAccountPayment[];
}) {
  const customerBills = bills
    .filter((bill) => bill.customerId === customerId)
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  const openBills = getCustomerOpenBills(bills, customerId);
  const totalSales = roundMoney(
    customerBills
      .filter((bill) => bill.status !== "cancelled")
      .reduce((sum, bill) => sum + bill.total, 0)
  );
  const totalPaid = roundMoney(
    customerBills
      .filter((bill) => bill.status !== "cancelled")
      .reduce((sum, bill) => sum + bill.paidAmount, 0)
  );
  const outstandingBalance = roundMoney(openBills.reduce((sum, bill) => sum + bill.dueAmount, 0));
  const settlementTotal = roundMoney(settlements.reduce((sum, settlement) => sum + settlement.amount, 0));

  return {
    billCount: customerBills.length,
    openBillCount: openBills.length,
    lastBillAt: customerBills[0]?.createdAt,
    openBills,
    outstandingBalance,
    settlementTotal,
    totalPaid,
    totalSales
  };
}

export function applySettlementToBills({
  amount,
  bills,
  customerId,
  billIds
}: {
  amount: number;
  bills: Bill[];
  customerId: string;
  billIds?: string[];
}) {
  const updatedBillsById: Record<string, Bill> = {};
  const allocations: Array<{ billId: string; amount: number }> = [];
  const targetBillIds = new Set((billIds ?? []).filter(Boolean));
  const dueBills = getCustomerOpenBills(bills, customerId).filter((bill) =>
    targetBillIds.size > 0 ? targetBillIds.has(bill.id) : true
  );
  let remaining = roundMoney(amount);

  dueBills.forEach((bill) => {
    if (remaining <= 0) {
      return;
    }

    const appliedAmount = roundMoney(Math.min(remaining, bill.dueAmount));

    if (appliedAmount <= 0) {
      return;
    }

    const nextDueAmount = roundMoney(bill.dueAmount - appliedAmount);
    const nextPaidAmount = roundMoney(bill.paidAmount + appliedAmount);

    updatedBillsById[bill.id] = {
      ...bill,
      dueAmount: nextDueAmount,
      paidAmount: nextPaidAmount,
      status: nextDueAmount <= 0 ? "paid" : "due"
    };

    allocations.push({
      billId: bill.id,
      amount: appliedAmount
    });

    remaining = roundMoney(remaining - appliedAmount);
  });

  return {
    allocations,
    appliedAmount: roundMoney(amount - remaining),
    updatedBillsById
  };
}
