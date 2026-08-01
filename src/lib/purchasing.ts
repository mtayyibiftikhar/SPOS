export type PurchaseValuationLine = {
  costPrice: number;
  quantity: number;
  receivedAmount?: number;
  receivedQuantity?: number;
};

export function roundPurchaseMoney(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

export function getPurchaseOrderValuation(lines: PurchaseValuationLine[]) {
  const orderedTotal = roundPurchaseMoney(
    lines.reduce((sum, line) => sum + Math.max(0, line.quantity) * Math.max(0, line.costPrice), 0)
  );
  const receivedTotal = roundPurchaseMoney(
    lines.reduce((sum, line) => {
      const receivedQuantity = Math.min(Math.max(0, line.quantity), Math.max(0, line.receivedQuantity ?? 0));
      return sum + (line.receivedAmount ?? receivedQuantity * Math.max(0, line.costPrice));
    }, 0)
  );
  const remainingCommitment = roundPurchaseMoney(
    lines.reduce((sum, line) => {
      const receivedQuantity = Math.min(Math.max(0, line.quantity), Math.max(0, line.receivedQuantity ?? 0));
      return sum + Math.max(0, line.quantity - receivedQuantity) * Math.max(0, line.costPrice);
    }, 0)
  );

  return {
    orderedTotal,
    receivedTotal,
    remainingCommitment,
    revisedTotal: roundPurchaseMoney(receivedTotal + remainingCommitment)
  };
}

export function getWeightedAverageCost(
  currentQuantity: number,
  currentCost: number,
  receivedQuantity: number,
  receivedCost: number
) {
  const existingQuantity = Math.max(0, currentQuantity);
  const addedQuantity = Math.max(0, receivedQuantity);
  const totalQuantity = existingQuantity + addedQuantity;

  if (totalQuantity <= 0) return roundPurchaseMoney(receivedCost);

  return roundPurchaseMoney(
    (existingQuantity * Math.max(0, currentCost) + addedQuantity * Math.max(0, receivedCost)) / totalQuantity
  );
}

export function reconcileSupplierBalance(
  currentBalance: number,
  previousOrderTotal: number,
  revisedOrderTotal: number,
  paymentNow = 0
) {
  return roundPurchaseMoney(currentBalance + revisedOrderTotal - previousOrderTotal - paymentNow);
}
