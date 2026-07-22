import type {
  AccountingLedgerEntry,
  Bill,
  BillItem,
  CashMovement,
  CustomerAccountPayment,
  DemoAppState,
  Expense,
  Payment,
  PaymentMethod,
  Refund,
  RefundItem
} from "@/types/pos";
import { getBusinessDateInTimezone } from "@/lib/cash-control";

type EntryInput = Omit<AccountingLedgerEntry, "id">;
type LedgerIdFactory = (index: number) => string;

const accounts = {
  cash: { code: "1000", name: "Cash on hand" },
  card: { code: "1010", name: "Card clearing" },
  bank: { code: "1020", name: "Bank" },
  receivable: { code: "1100", name: "Accounts receivable" },
  inventory: { code: "1200", name: "Inventory asset" },
  vatPayable: { code: "2100", name: "VAT payable" },
  sales: { code: "4000", name: "Sales revenue" },
  salesReturns: { code: "4100", name: "Sales returns and refunds" },
  cogs: { code: "5000", name: "Cost of goods sold" },
  expenses: { code: "6000", name: "Operating expenses" },
  cashInClearing: { code: "3100", name: "Cash in clearing" },
  cashOutClearing: { code: "6100", name: "Cash out / owner withdrawal" }
} as const;

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function makeLedgerId(referenceType: string, referenceId: string, index: number) {
  const safeReference = referenceId.replace(/[^a-zA-Z0-9_-]/g, "");
  return `ledger_${referenceType}_${safeReference}_${index + 1}`;
}

function getPaymentAccount(method: PaymentMethod | "bank") {
  if (method === "cash") {
    return accounts.cash;
  }

  if (method === "card") {
    return accounts.card;
  }

  if (method === "bank") {
    return accounts.bank;
  }

  return accounts.receivable;
}

function createEntries(referenceType: string, referenceId: string, rows: EntryInput[], idFactory?: LedgerIdFactory) {
  return rows
    .filter((row) => row.debit > 0 || row.credit > 0)
    .map((row, index) => ({
      ...row,
      debit: roundMoney(row.debit),
      credit: roundMoney(row.credit),
      id: idFactory ? idFactory(index) : makeLedgerId(referenceType, referenceId, index)
    }));
}

function getBillCostOfGoods(items: BillItem[]) {
  return roundMoney(
    items
      .filter((item) => item.productKind === "product")
      .reduce((sum, item) => sum + item.costPrice * item.quantity, 0)
  );
}

function getRefundCost(items: RefundItem[], billItems?: BillItem[]) {
  return roundMoney(
    items.reduce((sum, item) => {
      const originalItem = billItems?.find((entry) => entry.id === item.billItemId);
      const productKind = originalItem?.productKind ?? "product";

      return productKind === "product" ? sum + item.costPrice * item.quantity : sum;
    }, 0)
  );
}

export function buildSaleLedgerEntries({
  bill,
  billItems,
  payments,
  createdBy,
  idFactory
}: {
  bill: Bill;
  billItems: BillItem[];
  payments?: Payment[];
  createdBy: string;
  idFactory?: LedgerIdFactory;
}) {
  const revenue = roundMoney(Math.max(0, bill.total - bill.taxAmount));
  const costOfGoods = getBillCostOfGoods(billItems);
  const paymentRows: EntryInput[] = [];
  const recordedPayments = (payments ?? []).filter(
    (payment) => payment.billId === bill.id && payment.amount > 0
  );

  if (recordedPayments.length > 0) {
    recordedPayments.forEach((payment) => {
      const paymentAccount = getPaymentAccount(payment.method);
      paymentRows.push({
        shopId: bill.shopId,
        businessDate: bill.businessDate ?? bill.createdAt.slice(0, 10),
        shiftId: bill.shiftId,
        accountCode: paymentAccount.code,
        accountName: paymentAccount.name,
        debit: payment.amount,
        credit: 0,
        memo: `${paymentAccount.name} received for ${bill.number}`,
        referenceType: "bill",
        referenceId: bill.id,
        billId: bill.id,
        customerId: bill.customerId,
        createdBy,
        createdAt: payment.createdAt
      });
    });
  } else if (bill.paidAmount > 0) {
    const paymentAccount = getPaymentAccount(bill.paymentMethod === "account" ? "cash" : bill.paymentMethod);
    paymentRows.push({
      shopId: bill.shopId,
      businessDate: bill.businessDate ?? bill.createdAt.slice(0, 10),
      shiftId: bill.shiftId,
      accountCode: paymentAccount.code,
      accountName: paymentAccount.name,
      debit: bill.paidAmount,
      credit: 0,
      memo: `${paymentAccount.name} received for ${bill.number}`,
      referenceType: "bill",
      referenceId: bill.id,
      billId: bill.id,
      customerId: bill.customerId,
      createdBy,
      createdAt: bill.createdAt
    });
  }

  if (bill.dueAmount > 0) {
    paymentRows.push({
      shopId: bill.shopId,
      businessDate: bill.businessDate ?? bill.createdAt.slice(0, 10),
      shiftId: bill.shiftId,
      accountCode: accounts.receivable.code,
      accountName: accounts.receivable.name,
      debit: bill.dueAmount,
      credit: 0,
      memo: `Amount due for ${bill.number}`,
      referenceType: "bill",
      referenceId: bill.id,
      billId: bill.id,
      customerId: bill.customerId,
      createdBy,
      createdAt: bill.createdAt
    });
  }

  const rows: EntryInput[] = [
    ...paymentRows,
    {
      shopId: bill.shopId,
      businessDate: bill.businessDate ?? bill.createdAt.slice(0, 10),
      shiftId: bill.shiftId,
      accountCode: accounts.sales.code,
      accountName: accounts.sales.name,
      debit: 0,
      credit: revenue,
      memo: `Sale revenue ${bill.number}`,
      referenceType: "bill",
      referenceId: bill.id,
      billId: bill.id,
      customerId: bill.customerId,
      createdBy,
      createdAt: bill.createdAt
    },
    {
      shopId: bill.shopId,
      businessDate: bill.businessDate ?? bill.createdAt.slice(0, 10),
      shiftId: bill.shiftId,
      accountCode: accounts.vatPayable.code,
      accountName: accounts.vatPayable.name,
      debit: 0,
      credit: bill.taxAmount,
      memo: `VAT on sale ${bill.number}`,
      referenceType: "bill",
      referenceId: bill.id,
      billId: bill.id,
      customerId: bill.customerId,
      createdBy,
      createdAt: bill.createdAt
    },
    {
      shopId: bill.shopId,
      businessDate: bill.businessDate ?? bill.createdAt.slice(0, 10),
      shiftId: bill.shiftId,
      accountCode: accounts.cogs.code,
      accountName: accounts.cogs.name,
      debit: costOfGoods,
      credit: 0,
      memo: `COGS ${bill.number}`,
      referenceType: "bill",
      referenceId: bill.id,
      billId: bill.id,
      customerId: bill.customerId,
      createdBy,
      createdAt: bill.createdAt
    },
    {
      shopId: bill.shopId,
      businessDate: bill.businessDate ?? bill.createdAt.slice(0, 10),
      shiftId: bill.shiftId,
      accountCode: accounts.inventory.code,
      accountName: accounts.inventory.name,
      debit: 0,
      credit: costOfGoods,
      memo: `Inventory relieved ${bill.number}`,
      referenceType: "bill",
      referenceId: bill.id,
      billId: bill.id,
      customerId: bill.customerId,
      createdBy,
      createdAt: bill.createdAt
    }
  ];

  return createEntries("bill", bill.id, rows, idFactory);
}

export function buildCustomerSettlementLedgerEntries({
  payment,
  createdBy,
  idFactory
}: {
  payment: CustomerAccountPayment;
  createdBy: string;
  idFactory?: LedgerIdFactory;
}) {
  const paymentAccount = getPaymentAccount(payment.method);
  const rows: EntryInput[] = [
    {
      shopId: payment.shopId,
      businessDate: payment.businessDate ?? payment.createdAt.slice(0, 10),
      shiftId: payment.shiftId,
      accountCode: paymentAccount.code,
      accountName: paymentAccount.name,
      debit: payment.amount,
      credit: 0,
      memo: `Customer payment ${payment.number}`,
      referenceType: "customer_payment",
      referenceId: payment.id,
      customerId: payment.customerId,
      paymentId: payment.id,
      createdBy,
      createdAt: payment.createdAt
    },
    {
      shopId: payment.shopId,
      businessDate: payment.businessDate ?? payment.createdAt.slice(0, 10),
      shiftId: payment.shiftId,
      accountCode: accounts.receivable.code,
      accountName: accounts.receivable.name,
      debit: 0,
      credit: payment.amount,
      memo: `Receivable settled ${payment.number}`,
      referenceType: "customer_payment",
      referenceId: payment.id,
      customerId: payment.customerId,
      paymentId: payment.id,
      createdBy,
      createdAt: payment.createdAt
    }
  ];

  return createEntries("customer_payment", payment.id, rows, idFactory);
}

export function buildRefundLedgerEntries({
  bill,
  refund,
  refundItems,
  billItems,
  createdBy,
  idFactory
}: {
  bill: Bill;
  refund: Refund;
  refundItems: RefundItem[];
  billItems: BillItem[];
  createdBy: string;
  idFactory?: LedgerIdFactory;
}) {
  const refundTotal = Math.abs(refund.amount);
  const taxRatio = bill.total > 0 ? bill.taxAmount / bill.total : 0;
  const taxRefund = roundMoney(refundTotal * taxRatio);
  const netRefund = roundMoney(Math.max(0, refundTotal - taxRefund));
  const returnedCost = getRefundCost(refundItems, billItems);
  const paymentAccount = getPaymentAccount(refund.paymentMethod);
  const rows: EntryInput[] = [
    {
      shopId: refund.shopId,
      businessDate: refund.businessDate ?? refund.returnDate.slice(0, 10),
      shiftId: refund.shiftId,
      accountCode: accounts.salesReturns.code,
      accountName: accounts.salesReturns.name,
      debit: netRefund,
      credit: 0,
      memo: `Refund ${bill.number}`,
      referenceType: "refund",
      referenceId: refund.id,
      billId: bill.id,
      customerId: bill.customerId,
      refundId: refund.id,
      createdBy,
      createdAt: refund.returnDate
    },
    {
      shopId: refund.shopId,
      businessDate: refund.businessDate ?? refund.returnDate.slice(0, 10),
      shiftId: refund.shiftId,
      accountCode: accounts.vatPayable.code,
      accountName: accounts.vatPayable.name,
      debit: taxRefund,
      credit: 0,
      memo: `VAT reversed ${bill.number}`,
      referenceType: "refund",
      referenceId: refund.id,
      billId: bill.id,
      customerId: bill.customerId,
      refundId: refund.id,
      createdBy,
      createdAt: refund.returnDate
    },
    {
      shopId: refund.shopId,
      businessDate: refund.businessDate ?? refund.returnDate.slice(0, 10),
      shiftId: refund.shiftId,
      accountCode: paymentAccount.code,
      accountName: paymentAccount.name,
      debit: 0,
      credit: refundTotal,
      memo: `Refund payout ${bill.number}`,
      referenceType: "refund",
      referenceId: refund.id,
      billId: bill.id,
      customerId: bill.customerId,
      refundId: refund.id,
      createdBy,
      createdAt: refund.returnDate
    },
    {
      shopId: refund.shopId,
      businessDate: refund.businessDate ?? refund.returnDate.slice(0, 10),
      shiftId: refund.shiftId,
      accountCode: accounts.inventory.code,
      accountName: accounts.inventory.name,
      debit: returnedCost,
      credit: 0,
      memo: `Inventory returned ${bill.number}`,
      referenceType: "refund",
      referenceId: refund.id,
      billId: bill.id,
      customerId: bill.customerId,
      refundId: refund.id,
      createdBy,
      createdAt: refund.returnDate
    },
    {
      shopId: refund.shopId,
      businessDate: refund.businessDate ?? refund.returnDate.slice(0, 10),
      shiftId: refund.shiftId,
      accountCode: accounts.cogs.code,
      accountName: accounts.cogs.name,
      debit: 0,
      credit: returnedCost,
      memo: `COGS reversed ${bill.number}`,
      referenceType: "refund",
      referenceId: refund.id,
      billId: bill.id,
      customerId: bill.customerId,
      refundId: refund.id,
      createdBy,
      createdAt: refund.returnDate
    }
  ];

  return createEntries("refund", refund.id, rows, idFactory);
}

export function buildExpenseLedgerEntries({
  expense,
  createdBy,
  idFactory
}: {
  expense: Expense;
  createdBy: string;
  idFactory?: LedgerIdFactory;
}) {
  const paymentAccount = getPaymentAccount(expense.paymentMethod);
  const rows: EntryInput[] = [
    {
      shopId: expense.shopId,
      businessDate: expense.businessDate,
      shiftId: expense.shiftId,
      accountCode: accounts.expenses.code,
      accountName: accounts.expenses.name,
      debit: expense.amount,
      credit: 0,
      memo: `Expense ${expense.categoryName}`,
      referenceType: "expense",
      referenceId: expense.id,
      createdBy,
      createdAt: expense.createdAt
    },
    {
      shopId: expense.shopId,
      businessDate: expense.businessDate,
      shiftId: expense.shiftId,
      accountCode: paymentAccount.code,
      accountName: paymentAccount.name,
      debit: 0,
      credit: expense.amount,
      memo: `Expense paid ${expense.categoryName}`,
      referenceType: "expense",
      referenceId: expense.id,
      createdBy,
      createdAt: expense.createdAt
    }
  ];

  return createEntries("expense", expense.id, rows, idFactory);
}

export function buildCashMovementLedgerEntries({
  movement,
  createdBy,
  idFactory
}: {
  movement: CashMovement;
  createdBy: string;
  idFactory?: LedgerIdFactory;
}) {
  const isCashIn = movement.type === "cash_in";
  const rows: EntryInput[] = [
    {
      shopId: movement.shopId,
      businessDate: movement.businessDate,
      shiftId: movement.shiftId,
      accountCode: isCashIn ? accounts.cash.code : accounts.cashOutClearing.code,
      accountName: isCashIn ? accounts.cash.name : accounts.cashOutClearing.name,
      debit: movement.amount,
      credit: 0,
      memo: movement.reason,
      referenceType: "cash_movement",
      referenceId: movement.id,
      createdBy,
      createdAt: movement.createdAt
    },
    {
      shopId: movement.shopId,
      businessDate: movement.businessDate,
      shiftId: movement.shiftId,
      accountCode: isCashIn ? accounts.cashInClearing.code : accounts.cash.code,
      accountName: isCashIn ? accounts.cashInClearing.name : accounts.cash.name,
      debit: 0,
      credit: movement.amount,
      memo: movement.reason,
      referenceType: "cash_movement",
      referenceId: movement.id,
      createdBy,
      createdAt: movement.createdAt
    }
  ];

  return createEntries("cash_movement", movement.id, rows, idFactory);
}

export function rebuildAccountingLedger(state: DemoAppState) {
  const ledgerEntries: AccountingLedgerEntry[] = [];

  state.bills.forEach((bill) => {
    const billItems = state.billItems.filter((item) => item.billId === bill.id);
    const payments = state.payments.filter((payment) => payment.billId === bill.id);
    ledgerEntries.push(...buildSaleLedgerEntries({ bill, billItems, payments, createdBy: bill.cashierId }));
  });

  state.customerAccountPayments.forEach((payment) => {
    ledgerEntries.push(
      ...buildCustomerSettlementLedgerEntries({
        payment,
        createdBy: payment.createdBy
      })
    );
  });

  state.refunds.forEach((refund) => {
    const bill = state.bills.find((entry) => entry.id === refund.originalBillId);

    if (!bill) {
      return;
    }

    ledgerEntries.push(
      ...buildRefundLedgerEntries({
        bill,
        refund,
        refundItems: state.refundItems.filter((item) => item.refundId === refund.id),
        billItems: state.billItems.filter((item) => item.billId === bill.id),
        createdBy: refund.createdBy
      })
    );
  });

  state.expenses.forEach((expense) => {
    ledgerEntries.push(...buildExpenseLedgerEntries({ expense, createdBy: expense.createdBy }));
  });

  state.cashMovements
    .filter((movement) => !movement.reason.startsWith("Expense:"))
    .forEach((movement) => {
      ledgerEntries.push(...buildCashMovementLedgerEntries({ movement, createdBy: movement.createdBy }));
    });

  return ledgerEntries.sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

export function summarizeLedgerByAccount(entries: AccountingLedgerEntry[]) {
  const accountsByCode = new Map<
    string,
    {
      accountCode: string;
      accountName: string;
      credit: number;
      debit: number;
      net: number;
    }
  >();

  entries.forEach((entry) => {
    const current = accountsByCode.get(entry.accountCode) ?? {
      accountCode: entry.accountCode,
      accountName: entry.accountName,
      debit: 0,
      credit: 0,
      net: 0
    };

    current.debit = roundMoney(current.debit + entry.debit);
    current.credit = roundMoney(current.credit + entry.credit);
    current.net = roundMoney(current.debit - current.credit);
    accountsByCode.set(entry.accountCode, current);
  });

  return Array.from(accountsByCode.values()).sort((left, right) => left.accountCode.localeCompare(right.accountCode));
}

export function getLedgerControlTotals(entries: AccountingLedgerEntry[]) {
  const debit = roundMoney(entries.reduce((sum, entry) => sum + entry.debit, 0));
  const credit = roundMoney(entries.reduce((sum, entry) => sum + entry.credit, 0));

  return {
    debit,
    credit,
    difference: roundMoney(debit - credit)
  };
}

export function resolveBusinessDateForAccounting(timeZone: string, value = new Date()) {
  return getBusinessDateInTimezone(timeZone, value);
}
