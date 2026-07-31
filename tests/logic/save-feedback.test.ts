import assert from "node:assert/strict";
import test from "node:test";
import { shouldShowGlobalSaveFeedback } from "../../src/lib/save-feedback";

test("global save feedback stays out of billing and receipt flows", () => {
  assert.equal(shouldShowGlobalSaveFeedback("/billing"), false);
  assert.equal(shouldShowGlobalSaveFeedback("/bills/bill-1"), false);
  assert.equal(shouldShowGlobalSaveFeedback("/bills/payments/payment-1"), false);
  assert.equal(shouldShowGlobalSaveFeedback("/refunds/refund-1"), false);
});

test("explicit catalog and settings saves can show feedback", () => {
  assert.equal(shouldShowGlobalSaveFeedback("/products"), true);
  assert.equal(shouldShowGlobalSaveFeedback("/inventory"), true);
  assert.equal(shouldShowGlobalSaveFeedback("/settings/shop"), true);
  assert.equal(shouldShowGlobalSaveFeedback("/customers"), true);
});
