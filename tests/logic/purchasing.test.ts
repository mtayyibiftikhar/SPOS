import assert from "node:assert/strict";
import test from "node:test";
import {
  getPurchaseOrderValuation,
  getPurchasePaymentStatus,
  getWeightedAverageCost,
  reconcileSupplierBalance
} from "../../src/lib/purchasing";

test("partial receipt values actual goods and keeps unreceived units at ordered cost", () => {
  const valuation = getPurchaseOrderValuation([{
    costPrice: 10,
    quantity: 6,
    receivedAmount: 24,
    receivedQuantity: 4
  }]);

  assert.deepEqual(valuation, {
    orderedTotal: 60,
    receivedTotal: 24,
    remainingCommitment: 20,
    revisedTotal: 44
  });
});

test("received promotional stock uses weighted average inventory cost", () => {
  assert.equal(getWeightedAverageCost(10, 10, 5, 6), 8.67);
  assert.equal(getWeightedAverageCost(0, 10, 5, 6), 6);
});

test("supplier balance reconciles receipt price changes and payments", () => {
  assert.equal(reconcileSupplierBalance(50, 60, 44, 0), 34);
  assert.equal(reconcileSupplierBalance(50, 60, 44, 40), -6);
});

test("a cancelled zero-value PO with no payment remains unpaid", () => {
  assert.equal(getPurchasePaymentStatus(0, 0), "unpaid");
  assert.equal(getPurchasePaymentStatus(24, 0), "unpaid");
  assert.equal(getPurchasePaymentStatus(24, 10), "partial");
  assert.equal(getPurchasePaymentStatus(24, 24), "paid");
});
