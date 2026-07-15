import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateBillTotals,
  calculateDiscountAmount,
  calculatePaidAndDue,
  normalizeDiscountValue
} from "../../src/lib/billing";
import { calculateBusinessDaySummary, calculateShiftSummary } from "../../src/lib/cash-control";
import { findBarcodeConflict, findCategoryNameConflict, normalizeBarcode } from "../../src/lib/catalog";
import { applySettlementToBills } from "../../src/lib/customer-accounts";
import { getLedgerControlTotals, buildSaleLedgerEntries } from "../../src/lib/accounting";
import { combinePhoneNumber, sanitizePhoneDigits, splitPhoneNumber } from "../../src/lib/phone";
import { calculateBillRefundState, calculateSalesReportSummary } from "../../src/lib/refunds";
import { createPublicReceiptToken } from "../../src/lib/public-receipts";
import { clearShopDataScope } from "../../src/lib/shop-data-reset";
import type {
  Bill,
  BillItem,
  BusinessDay,
  CashMovement,
  Expense,
  Product,
  ProductCategory,
  Refund,
  RefundItem,
  Shift
} from "../../src/types/pos";

const SHOP_ID = "shop_test";
const BUSINESS_DATE = "2026-07-14";

function bill(overrides: Partial<Bill> = {}): Bill {
  return {
    id: "bill_1",
    shopId: SHOP_ID,
    businessDate: BUSINESS_DATE,
    shiftId: "shift_1",
    number: "REC-000001",
    status: "paid",
    subtotal: 100,
    discountType: "fixed",
    discountValue: 0,
    discountAmount: 0,
    taxRate: 15,
    taxMode: "inclusive",
    taxAmount: 13.04,
    total: 100,
    paidAmount: 100,
    dueAmount: 0,
    paymentMethod: "cash",
    cashierId: "user_1",
    createdAt: "2026-07-14T08:00:00.000Z",
    ...overrides
  };
}

function billItem(overrides: Partial<BillItem> = {}): BillItem {
  return {
    id: "item_1",
    billId: "bill_1",
    productId: "product_1",
    productName: { en: "Coffee", ar: "", ur: "" },
    productKind: "product",
    quantity: 2,
    unitPrice: 50,
    costPrice: 20,
    discountType: "fixed",
    discountValue: 0,
    discountAmount: 0,
    grossLineTotal: 100,
    lineTotal: 100,
    ...overrides
  };
}

test("discounts are clamped to the eligible amount and never become negative", () => {
  assert.equal(normalizeDiscountValue("percentage", 140, 100), 100);
  assert.equal(normalizeDiscountValue("percentage", -10, 100), 0);
  assert.equal(normalizeDiscountValue("fixed", 125, 80), 80);
  assert.equal(calculateDiscountAmount(80, "fixed", 125), 80);
  assert.equal(calculateDiscountAmount(80, "percentage", 25), 20);
});

test("inclusive VAT preserves the charged total and excludes non-taxable lines", () => {
  const totals = calculateBillTotals({
    items: [
      { quantity: 1, unitPrice: 115, taxable: true },
      { quantity: 1, unitPrice: 20, taxable: false }
    ],
    discountType: "fixed",
    discountValue: 0,
    taxEnabled: true,
    taxRate: 15,
    taxMode: "inclusive"
  });

  assert.deepEqual(totals, {
    grossSubtotal: 135,
    itemDiscountAmount: 0,
    subtotal: 135,
    discountAmount: 0,
    taxAmount: 15,
    total: 135
  });
});

test("exclusive VAT applies after item and whole-bill discounts", () => {
  const totals = calculateBillTotals({
    items: [
      { quantity: 2, unitPrice: 50, taxable: true, discountType: "fixed", discountValue: 10 },
      { quantity: 1, unitPrice: 10, taxable: false }
    ],
    discountType: "percentage",
    discountValue: 10,
    taxEnabled: true,
    taxRate: 15,
    taxMode: "exclusive"
  });

  assert.equal(totals.grossSubtotal, 110);
  assert.equal(totals.itemDiscountAmount, 10);
  assert.equal(totals.subtotal, 100);
  assert.equal(totals.discountAmount, 10);
  assert.equal(totals.taxAmount, 12.15);
  assert.equal(totals.total, 102.15);
});

test("account payments remain due while cash and card are fully paid", () => {
  assert.deepEqual(calculatePaidAndDue(75, "account"), { paidAmount: 0, dueAmount: 75 });
  assert.deepEqual(calculatePaidAndDue(75, "cash"), { paidAmount: 75, dueAmount: 0 });
  assert.deepEqual(calculatePaidAndDue(75, "card"), { paidAmount: 75, dueAmount: 0 });
});

test("shift expected cash uses only its bills, movements, and cash refunds", () => {
  const shift: Shift = {
    id: "shift_1",
    shopId: SHOP_ID,
    businessDate: BUSINESS_DATE,
    cashierId: "user_1",
    openingCash: 100,
    countedCash: 225,
    startedAt: "2026-07-14T07:00:00.000Z"
  };
  const movements: CashMovement[] = [
    {
      id: "cash_in",
      shopId: SHOP_ID,
      businessDate: BUSINESS_DATE,
      shiftId: shift.id,
      createdBy: "user_1",
      type: "cash_in",
      amount: 20,
      reason: "Float",
      createdAt: "2026-07-14T08:00:00.000Z"
    },
    {
      id: "cash_out",
      shopId: SHOP_ID,
      businessDate: BUSINESS_DATE,
      shiftId: shift.id,
      createdBy: "user_1",
      type: "cash_out",
      amount: 10,
      reason: "Drawer removal",
      createdAt: "2026-07-14T09:00:00.000Z"
    }
  ];
  const refunds: Refund[] = [
    {
      id: "refund_1",
      shopId: SHOP_ID,
      originalBillId: "bill_1",
      originalSaleDate: BUSINESS_DATE,
      businessDate: BUSINESS_DATE,
      shiftId: shift.id,
      paymentMethod: "cash",
      createdBy: "user_1",
      returnDate: "2026-07-14T10:00:00.000Z",
      reason: "Return",
      amount: -5,
      profitAdjustment: -2
    }
  ];

  const summary = calculateShiftSummary({
    shift,
    bills: [bill({ total: 120 }), bill({ id: "bill_card", paymentMethod: "card", total: 999 })],
    cashMovements: movements,
    refunds
  });

  assert.equal(summary.cashSales, 120);
  assert.equal(summary.cashRefunds, 5);
  assert.equal(summary.expectedCash, 225);
  assert.equal(summary.difference, 0);
});

test("business-day summary includes all shifts for the date and keeps expenses separate", () => {
  const shifts: Shift[] = [
    {
      id: "shift_1",
      shopId: SHOP_ID,
      businessDate: BUSINESS_DATE,
      cashierId: "user_1",
      openingCash: 50,
      startedAt: "2026-07-14T07:00:00.000Z"
    },
    {
      id: "shift_2",
      shopId: SHOP_ID,
      businessDate: BUSINESS_DATE,
      cashierId: "user_2",
      openingCash: 25,
      startedAt: "2026-07-14T09:00:00.000Z"
    }
  ];
  const expenses: Expense[] = [
    {
      id: "expense_1",
      shopId: SHOP_ID,
      businessDate: BUSINESS_DATE,
      categoryName: "Utilities",
      amount: 30,
      paymentMethod: "bank",
      createdBy: "user_1",
      createdAt: "2026-07-14T11:00:00.000Z"
    }
  ];
  const summary = calculateBusinessDaySummary({
    businessDate: BUSINESS_DATE,
    shopId: SHOP_ID,
    timeZone: "Asia/Riyadh",
    bills: [bill({ id: "cash", total: 100 }), bill({ id: "card", total: 60, paymentMethod: "card" })],
    cashMovements: [],
    shifts,
    expenses,
    refunds: []
  });

  assert.equal(summary.shiftCount, 2);
  assert.equal(summary.billCount, 2);
  assert.equal(summary.totalSales, 160);
  assert.equal(summary.expenses, 30);
  assert.equal(summary.expectedCash, 175);
});

test("selected customer settlement never exceeds receipt dues", () => {
  const bills = [
    bill({ id: "old", customerId: "customer_1", dueAmount: 40, paidAmount: 0, total: 40, status: "due" }),
    bill({
      id: "new",
      customerId: "customer_1",
      dueAmount: 30,
      paidAmount: 0,
      total: 30,
      status: "due",
      createdAt: "2026-07-14T10:00:00.000Z"
    })
  ];
  const result = applySettlementToBills({ amount: 100, bills, customerId: "customer_1", billIds: ["new"] });

  assert.equal(result.appliedAmount, 30);
  assert.deepEqual(result.allocations, [{ billId: "new", amount: 30 }]);
  assert.equal(result.updatedBillsById.new.dueAmount, 0);
  assert.equal(result.updatedBillsById.new.status, "paid");
  assert.equal(result.updatedBillsById.old, undefined);
});

test("refund state tracks partial quantities and prevents a second full refund", () => {
  const items = [billItem({ id: "item_1", quantity: 3 })];
  const refunds: Refund[] = [
    {
      id: "refund_1",
      shopId: SHOP_ID,
      originalBillId: "bill_1",
      originalSaleDate: BUSINESS_DATE,
      businessDate: BUSINESS_DATE,
      paymentMethod: "cash",
      createdBy: "admin",
      returnDate: "2026-07-14T12:00:00.000Z",
      reason: "Return",
      amount: -100,
      profitAdjustment: -60
    }
  ];
  const refundItems: RefundItem[] = [
    {
      id: "refund_item_1",
      refundId: "refund_1",
      billItemId: "item_1",
      productId: "product_1",
      productName: { en: "Coffee", ar: "", ur: "" },
      quantity: 2,
      unitPrice: 50,
      costPrice: 20,
      refundAmount: 100,
      profitAdjustment: 60
    }
  ];

  const partial = calculateBillRefundState({ billId: "bill_1", billItems: items, refunds, refundItems });
  assert.equal(partial.refundableItems[0].remainingQuantity, 1);
  assert.equal(partial.isFullyRefunded, false);

  refundItems.push({ ...refundItems[0], id: "refund_item_2", quantity: 1 });
  const complete = calculateBillRefundState({ billId: "bill_1", billItems: items, refunds, refundItems });
  assert.equal(complete.refundableItems[0].remainingQuantity, 0);
  assert.equal(complete.isFullyRefunded, true);
});

test("a return today adjusts today's report without rewriting yesterday's sale", () => {
  const summary = calculateSalesReportSummary({
    businessDate: BUSINESS_DATE,
    shopId: SHOP_ID,
    timeZone: "Asia/Riyadh",
    bills: [bill({ total: 1_000 })],
    billItems: [billItem({ quantity: 10, unitPrice: 100, costPrice: 60, grossLineTotal: 1_000, lineTotal: 1_000 })],
    refunds: [
      {
        id: "refund_old_sale",
        shopId: SHOP_ID,
        originalBillId: "yesterday_bill",
        originalSaleDate: "2026-07-13",
        businessDate: BUSINESS_DATE,
        paymentMethod: "cash",
        createdBy: "admin",
        returnDate: "2026-07-14T12:00:00.000Z",
        reason: "Return",
        amount: -100,
        profitAdjustment: -40
      }
    ]
  });

  assert.equal(summary.grossSales, 1_000);
  assert.equal(summary.returnsFromPreviousDays, 100);
  assert.equal(summary.netSales, 900);
  assert.equal(summary.grossProfit, 400);
  assert.equal(summary.netProfit, 360);
});

test("sale ledger entries balance debits and credits", () => {
  const entries = buildSaleLedgerEntries({
    bill: bill({ customerId: "customer_1" }),
    billItems: [billItem()],
    createdBy: "user_1",
    idFactory: (() => {
      let sequence = 0;
      return () => `ledger_${++sequence}`;
    })()
  });
  const controls = getLedgerControlTotals(entries);

  assert.equal(controls.debit, controls.credit);
  assert.equal(controls.difference, 0);
});

test("catalog uniqueness is case-insensitive and checks secondary barcodes", () => {
  const categories: ProductCategory[] = [
    { id: "cat_1", shopId: SHOP_ID, name: "Milk", createdAt: "2026-07-14T00:00:00.000Z" }
  ];
  const products: Product[] = [
    {
      id: "product_1",
      shopId: SHOP_ID,
      barcode: "6281000000001",
      barcodes: ["6281000000002"],
      kind: "product",
      name: { en: "Milk", ar: "", ur: "" },
      salePrice: 10,
      costPrice: 5,
      stockQuantity: 1,
      reorderLevel: 1,
      taxable: true,
      quickTab: false,
      status: "active",
      createdAt: "2026-07-14T00:00:00.000Z",
      updatedAt: "2026-07-14T00:00:00.000Z"
    }
  ];

  assert.equal(findCategoryNameConflict(categories, SHOP_ID, "  MILK  ")?.id, "cat_1");
  assert.equal(findBarcodeConflict(products, SHOP_ID, "6281 0000 00002")?.id, "product_1");
  assert.equal(normalizeBarcode("abc-628100000000299"), "6281000000002");
});

test("phone helpers preserve country code and sanitize formatting", () => {
  assert.equal(sanitizePhoneDigits("05 381-13039"), "0538113039");
  assert.equal(combinePhoneNumber("+966", "538 113 039"), "+966538113039");
  assert.deepEqual(splitPhoneNumber("+966538113039"), { countryCode: "+966", localNumber: "538113039" });
});

test("public receipt tokens are long, URL-safe, and unique", () => {
  const tokens = new Set<string>();

  for (let index = 0; index < 500; index += 1) {
    const token = createPublicReceiptToken(tokens);
    assert.match(token, /^[A-Za-z0-9]{22}$/);
    assert.equal(tokens.has(token), false);
    tokens.add(token);
  }
});

test("bills-only reset preserves attendance while clearing sales and register data", () => {
  const reset = clearShopDataScope(
    {
      bills: [bill()],
      billItems: [billItem()],
      businessDays: [
        {
          id: "day_1",
          shopId: SHOP_ID,
          businessDate: BUSINESS_DATE,
          status: "open",
          startedBy: "user_1",
          startedAt: "2026-07-14T07:00:00.000Z"
        } as BusinessDay
      ],
      shifts: [
        {
          id: "shift_1",
          shopId: SHOP_ID,
          businessDate: BUSINESS_DATE,
          cashierId: "user_1",
          openingCash: 0,
          startedAt: "2026-07-14T07:00:00.000Z"
        }
      ],
      attendanceRecords: [
        {
          id: "attendance_1",
          shopId: SHOP_ID,
          userId: "user_1",
          businessDate: BUSINESS_DATE,
          clockInAt: "2026-07-14T07:00:00.000Z",
          status: "open",
          source: "qr",
          scheduledHours: 8,
          hourlyRate: 20,
          createdAt: "2026-07-14T07:00:00.000Z"
        }
      ],
      attendanceQrSessions: [
        {
          id: "qr_1",
          shopId: SHOP_ID,
          userId: "user_1",
          businessDate: BUSINESS_DATE,
          token: "token",
          expiresAt: "2026-07-14T07:10:00.000Z",
          createdAt: "2026-07-14T07:00:00.000Z"
        }
      ],
      receiptSequencesByShop: { [SHOP_ID]: 8 },
      accountPaymentSequencesByShop: { [SHOP_ID]: 4 }
    },
    SHOP_ID,
    "bills",
    { skipAudit: true }
  );

  assert.equal(reset.bills?.length, 0);
  assert.equal(reset.businessDays?.length, 0);
  assert.equal(reset.shifts?.length, 0);
  assert.equal(reset.attendanceRecords?.length, 1);
  assert.equal(reset.attendanceQrSessions?.length, 1);
  assert.equal(reset.receiptSequencesByShop?.[SHOP_ID], 1);
});

test("entire-data reset clears attendance and payroll but preserves shop identity fields", () => {
  const reset = clearShopDataScope(
    {
      shops: [
        {
          id: SHOP_ID,
          name: "Test Shop",
          slug: "test-shop",
          phone: "",
          address: "",
          currency: "SAR",
          timezone: "Asia/Riyadh",
          planName: "Monthly",
          licenseStatus: "active",
          createdAt: "2026-07-14T00:00:00.000Z"
        }
      ],
      attendanceRecords: [
        {
          id: "attendance_1",
          shopId: SHOP_ID,
          userId: "user_1",
          businessDate: BUSINESS_DATE,
          clockInAt: "2026-07-14T07:00:00.000Z",
          status: "open",
          source: "qr",
          scheduledHours: 8,
          hourlyRate: 20,
          createdAt: "2026-07-14T07:00:00.000Z"
        }
      ],
      payrollRates: [
        {
          id: "payroll_1",
          shopId: SHOP_ID,
          userId: "user_1",
          hourlyRate: 20,
          defaultDailyHours: 8,
          currency: "SAR",
          createdAt: "2026-07-14T00:00:00.000Z",
          updatedAt: "2026-07-14T00:00:00.000Z"
        }
      ]
    },
    SHOP_ID,
    "all",
    { skipAudit: true }
  );

  assert.equal(reset.shops?.length, 1);
  assert.equal(reset.attendanceRecords?.length, 0);
  assert.equal(reset.payrollRates?.length, 0);
});
