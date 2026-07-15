import assert from "node:assert/strict";
import test from "node:test";
import { applyCriticalShopMutation } from "../../src/lib/server/shop-snapshot-mutations";
import type { Bill, BillItem, Customer, DemoAppState, Product } from "../../src/types/pos";

const SHOP_ID = "shop_transactional";
const USER_ID = "user_cashier";
const ADMIN_ID = "user_admin";
const BUSINESS_DATE = "2026-07-14";
const NOW = "2026-07-14T08:00:00.000Z";

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: "product_1",
    shopId: SHOP_ID,
    barcode: "628100000001",
    barcodes: ["628100000001"],
    kind: "product",
    name: { en: "Coffee", ar: "", ur: "" },
    salePrice: 50,
    costPrice: 20,
    stockQuantity: 5,
    reorderLevel: 1,
    taxable: false,
    quickTab: true,
    status: "active",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides
  };
}

function customer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: "customer_1",
    shopId: SHOP_ID,
    name: "Aisha",
    phone: "+966500000001",
    email: "aisha@example.com",
    createdAt: NOW,
    ...overrides
  };
}

function bill(overrides: Partial<Bill> = {}): Bill {
  return {
    id: "bill_existing",
    shopId: SHOP_ID,
    customerId: "customer_1",
    businessDate: BUSINESS_DATE,
    shiftId: "shift_admin",
    number: "REC-000009",
    status: "paid",
    customerName: "Aisha",
    customerPhone: "+966500000001",
    subtotal: 100,
    itemDiscountAmount: 0,
    discountType: "fixed",
    discountValue: 20,
    discountAmount: 20,
    taxRate: 0,
    taxMode: "inclusive",
    taxAmount: 0,
    total: 80,
    paidAmount: 80,
    dueAmount: 0,
    paymentMethod: "cash",
    cashierId: ADMIN_ID,
    createdAt: NOW,
    ...overrides
  };
}

function billItem(overrides: Partial<BillItem> = {}): BillItem {
  return {
    id: "bill_item_existing",
    billId: "bill_existing",
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

function openState(overrides: Partial<DemoAppState> = {}): Partial<DemoAppState> {
  return {
    products: [product()],
    customers: [customer()],
    bills: [],
    billItems: [],
    refunds: [],
    refundItems: [],
    payments: [],
    ledgerEntries: [],
    inventoryAdjustments: [],
    inventoryBatches: [],
    customerAccountPayments: [],
    receiptSequencesByShop: { [SHOP_ID]: 1 },
    accountPaymentSequencesByShop: { [SHOP_ID]: 1 },
    businessDays: [
      {
        id: "day_1",
        shopId: SHOP_ID,
        businessDate: BUSINESS_DATE,
        startedBy: ADMIN_ID,
        startedAt: NOW
      }
    ],
    shifts: [
      {
        id: "shift_cashier",
        shopId: SHOP_ID,
        businessDayId: "day_1",
        businessDate: BUSINESS_DATE,
        cashierId: USER_ID,
        openingCash: 0,
        startedAt: NOW
      },
      {
        id: "shift_admin",
        shopId: SHOP_ID,
        businessDayId: "day_1",
        businessDate: BUSINESS_DATE,
        cashierId: ADMIN_ID,
        openingCash: 0,
        startedAt: NOW
      }
    ],
    ...overrides
  };
}

function cashSale(quantity = 1) {
  return {
    type: "create_bill" as const,
    payload: {
      customer: {},
      items: [{ productId: "product_1", quantity, unitPrice: 50 }],
      discountType: "fixed" as const,
      discountValue: 0,
      paymentMethod: "cash" as const
    }
  };
}

test("sequential authoritative sales receive unique numbers and reduce stock once", () => {
  const first = applyCriticalShopMutation(openState(), cashSale(1), {
    role: "cashier",
    shopId: SHOP_ID,
    userId: USER_ID
  });
  const second = applyCriticalShopMutation(first.state, cashSale(2), {
    role: "cashier",
    shopId: SHOP_ID,
    userId: USER_ID
  });

  assert.equal(first.result.ok, true);
  assert.equal(second.result.ok, true);
  assert.deepEqual(second.state.bills?.map((entry) => entry.number), ["REC-000002", "REC-000001"]);
  assert.equal(second.state.products?.[0].stockQuantity, 2);
  assert.equal(second.state.inventoryAdjustments?.length, 2);
});

test("authoritative checkout blocks overselling and preserves an existing customer", () => {
  const preserved = applyCriticalShopMutation(
    openState({ receiptSequencesByShop: { [SHOP_ID]: 1 } }),
    {
      ...cashSale(1),
      payload: {
        ...cashSale(1).payload,
        customer: { id: "customer_1" }
      }
    },
    { role: "cashier", shopId: SHOP_ID, userId: USER_ID }
  );
  const rejected = applyCriticalShopMutation(openState(), cashSale(6), {
    role: "cashier",
    shopId: SHOP_ID,
    userId: USER_ID
  });

  assert.equal(preserved.state.bills?.[0].customerName, "Aisha");
  assert.equal(preserved.state.customers?.[0].phone, "+966500000001");
  assert.equal(rejected.result.ok, false);
  assert.match(rejected.result.message ?? "", /not enough stock/i);
  assert.equal(rejected.state.products?.[0].stockQuantity, 5);
});

test("account settlement cannot exceed the selected bill balance", () => {
  const accountBill = bill({ discountAmount: 0, discountValue: 0, paidAmount: 0, dueAmount: 100, total: 100, status: "due", paymentMethod: "account" });
  const state = openState({ bills: [accountBill] });
  const rejected = applyCriticalShopMutation(
    state,
    { type: "settle_customer_account", payload: { amount: 101, customerId: "customer_1", method: "cash" } },
    { role: "shop_admin", shopId: SHOP_ID, userId: ADMIN_ID }
  );
  const accepted = applyCriticalShopMutation(
    state,
    { type: "settle_customer_account", payload: { amount: 40, customerId: "customer_1", method: "card" } },
    { role: "shop_admin", shopId: SHOP_ID, userId: ADMIN_ID }
  );

  assert.equal(rejected.result.ok, false);
  assert.equal(accepted.result.ok, true);
  assert.equal(accepted.result.number, "PAY-000001");
  assert.equal(accepted.state.bills?.[0].paidAmount, 40);
  assert.equal(accepted.state.bills?.[0].dueAmount, 60);
});

test("refund aggregates duplicate item requests and includes whole-bill discount", () => {
  const state = openState({ bills: [bill()], billItems: [billItem()] });
  const rejected = applyCriticalShopMutation(
    state,
    {
      type: "create_refund",
      payload: {
        billId: "bill_existing",
        payoutMethod: "cash",
        reason: "Duplicate request",
        items: [
          { billItemId: "bill_item_existing", quantity: 2 },
          { billItemId: "bill_item_existing", quantity: 1 }
        ]
      }
    },
    { role: "shop_admin", shopId: SHOP_ID, userId: ADMIN_ID }
  );
  const accepted = applyCriticalShopMutation(
    state,
    {
      type: "create_refund",
      payload: {
        billId: "bill_existing",
        payoutMethod: "cash",
        reason: "One returned",
        items: [{ billItemId: "bill_item_existing", quantity: 1 }]
      }
    },
    { role: "shop_admin", shopId: SHOP_ID, userId: ADMIN_ID }
  );

  assert.equal(rejected.result.ok, false);
  assert.equal(accepted.result.ok, true);
  assert.equal(accepted.state.refunds?.[0].amount, -40);
  assert.equal(accepted.state.refundItems?.[0].refundAmount, -40);
  assert.equal(accepted.state.products?.[0].stockQuantity, 6);
});

test("only one business day can be open for a shop", () => {
  const initial = openState({ businessDays: [], shifts: [] });
  const started = applyCriticalShopMutation(
    initial,
    { type: "start_business_day", payload: { businessDate: BUSINESS_DATE, openingNote: "Morning" } },
    { role: "shop_admin", shopId: SHOP_ID, userId: ADMIN_ID }
  );
  const duplicate = applyCriticalShopMutation(
    started.state,
    { type: "start_business_day", payload: { businessDate: "2026-07-15" } },
    { role: "shop_admin", shopId: SHOP_ID, userId: ADMIN_ID }
  );

  assert.equal(started.result.ok, true);
  assert.equal(started.state.businessDays?.length, 1);
  assert.equal(started.state.businessDays?.[0].businessDate, BUSINESS_DATE);
  assert.equal(duplicate.result.ok, false);
  assert.match(duplicate.result.message ?? "", /close the current business day/i);
});

test("open shift capacity follows the active product-key device limit", () => {
  const state = openState({
    shifts: [],
    productKeys: [
      {
        id: "key_1",
        key: "SPOS-KSA-TEST-DEVICE-LIMIT",
        shopId: SHOP_ID,
        status: "active",
        allowedDevices: 1,
        createdAt: NOW
      }
    ]
  });
  const first = applyCriticalShopMutation(
    state,
    {
      type: "start_shift",
      payload: { deviceActivationId: "device_1", deviceBrowserInfo: "Till one", openingCash: 25 }
    },
    { role: "cashier", shopId: SHOP_ID, userId: USER_ID }
  );
  const blocked = applyCriticalShopMutation(
    first.state,
    {
      type: "start_shift",
      payload: { deviceActivationId: "device_2", deviceBrowserInfo: "Till two", openingCash: 10 }
    },
    { role: "shop_admin", shopId: SHOP_ID, userId: ADMIN_ID }
  );
  const increased = {
    ...first.state,
    productKeys: first.state.productKeys?.map((key) => ({ ...key, allowedDevices: 2 }))
  };
  const second = applyCriticalShopMutation(
    increased,
    {
      type: "start_shift",
      payload: { deviceActivationId: "device_2", deviceBrowserInfo: "Till two", openingCash: 10 }
    },
    { role: "shop_admin", shopId: SHOP_ID, userId: ADMIN_ID }
  );

  assert.equal(first.result.ok, true);
  assert.equal(first.state.shifts?.[0].deviceActivationId, "device_1");
  assert.equal(blocked.result.ok, false);
  assert.match(blocked.result.message ?? "", /only 1 open shift/i);
  assert.equal(second.result.ok, true);
  assert.equal(second.state.shifts?.filter((shift) => !shift.endedAt).length, 2);
});

test("authoritative device capacity overrides a stale cached product-key limit", () => {
  const state = openState({
    shifts: [],
    productKeys: [
      {
        id: "key_1",
        key: "SPOS-KSA-STALE-DEVICE-LIMIT",
        shopId: SHOP_ID,
        status: "active",
        allowedDevices: 1,
        createdAt: NOW
      }
    ]
  });
  const first = applyCriticalShopMutation(
    state,
    {
      type: "start_shift",
      payload: { deviceActivationId: "device_1", deviceBrowserInfo: "Till one", openingCash: 25 }
    },
    { allowedShiftCount: 2, role: "cashier", shopId: SHOP_ID, userId: USER_ID }
  );
  const second = applyCriticalShopMutation(
    first.state,
    {
      type: "start_shift",
      payload: { deviceActivationId: "device_2", deviceBrowserInfo: "Till two", openingCash: 10 }
    },
    { allowedShiftCount: 2, role: "shop_admin", shopId: SHOP_ID, userId: ADMIN_ID }
  );

  assert.equal(first.result.ok, true);
  assert.equal(second.result.ok, true);
  assert.equal(second.state.shifts?.filter((shift) => !shift.endedAt).length, 2);
});

test("ending a shift records authoritative expected cash and variance", () => {
  const state = openState({
    bills: [bill({ shiftId: "shift_cashier", total: 80, paidAmount: 80 })],
    shifts: [
      {
        id: "shift_cashier",
        shopId: SHOP_ID,
        businessDayId: "day_1",
        businessDate: BUSINESS_DATE,
        cashierId: USER_ID,
        openingCash: 10,
        startedAt: NOW
      }
    ],
    cashMovements: [
      {
        id: "cash_in_1",
        shopId: SHOP_ID,
        businessDate: BUSINESS_DATE,
        shiftId: "shift_cashier",
        createdBy: USER_ID,
        type: "cash_in",
        amount: 5,
        reason: "Float",
        createdAt: NOW
      },
      {
        id: "cash_out_1",
        shopId: SHOP_ID,
        businessDate: BUSINESS_DATE,
        shiftId: "shift_cashier",
        createdBy: USER_ID,
        type: "cash_out",
        amount: 3,
        reason: "Drawer correction",
        createdAt: NOW
      }
    ]
  });
  const closed = applyCriticalShopMutation(
    state,
    { type: "end_shift", payload: { countedCash: 90, note: "Counted" } },
    { role: "cashier", shopId: SHOP_ID, userId: USER_ID }
  );

  assert.equal(closed.result.ok, true);
  assert.equal(closed.state.shifts?.[0].expectedCash, 92);
  assert.equal(closed.state.shifts?.[0].difference, -2);
  assert.ok(closed.state.shifts?.[0].endedAt);
});

test("business day cannot close with an open shift and records totals after shifts close", () => {
  const state = openState({ bills: [bill()] });
  const blocked = applyCriticalShopMutation(
    state,
    { type: "close_business_day", payload: { countedCash: 80 } },
    { role: "shop_admin", shopId: SHOP_ID, userId: ADMIN_ID }
  );
  const allShiftsClosed = {
    ...state,
    shifts: state.shifts?.map((shift) => ({ ...shift, endedAt: "2026-07-14T16:00:00.000Z" }))
  };
  const closed = applyCriticalShopMutation(
    allShiftsClosed,
    { type: "close_business_day", payload: { countedCash: 80, note: "Balanced" } },
    { role: "shop_admin", shopId: SHOP_ID, userId: ADMIN_ID }
  );

  assert.equal(blocked.result.ok, false);
  assert.match(blocked.result.message ?? "", /close all open shifts/i);
  assert.equal(closed.result.ok, true);
  assert.equal(closed.state.dayCloses?.[0].totalSales, 80);
  assert.equal(closed.state.dayCloses?.[0].expectedCash, 80);
  assert.equal(closed.state.dayCloses?.[0].cashDifference, 0);
  assert.ok(closed.state.businessDays?.[0].endedAt);
});

test("refund permissions and payout limits are server enforced", () => {
  const partiallyPaid = bill({ paidAmount: 20, dueAmount: 60, status: "due", paymentMethod: "account" });
  const state = openState({ bills: [partiallyPaid], billItems: [billItem()] });
  const cashierAttempt = applyCriticalShopMutation(
    state,
    {
      type: "create_refund",
      payload: { billId: "bill_existing", payoutMethod: "cash", reason: "Return", items: [{ billItemId: "bill_item_existing", quantity: 1 }] }
    },
    { role: "cashier", shopId: SHOP_ID, userId: USER_ID }
  );
  const cashAttempt = applyCriticalShopMutation(
    state,
    {
      type: "create_refund",
      payload: { billId: "bill_existing", payoutMethod: "cash", reason: "Return", items: [{ billItemId: "bill_item_existing", quantity: 1 }] }
    },
    { role: "shop_admin", shopId: SHOP_ID, userId: ADMIN_ID }
  );
  const accountAdjustment = applyCriticalShopMutation(
    state,
    {
      type: "create_refund",
      payload: { billId: "bill_existing", payoutMethod: "account", reason: "Return", items: [{ billItemId: "bill_item_existing", quantity: 1 }] }
    },
    { role: "shop_admin", shopId: SHOP_ID, userId: ADMIN_ID }
  );

  assert.equal(cashierAttempt.result.ok, false);
  assert.equal(cashAttempt.result.ok, false);
  assert.match(cashAttempt.result.message ?? "", /cannot exceed the amount already paid/i);
  assert.equal(accountAdjustment.result.ok, true);
  assert.equal(accountAdjustment.state.bills?.[0].dueAmount, 20);
});
