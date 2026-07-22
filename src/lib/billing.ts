import type {
  Bill,
  CheckoutCustomerInput,
  Customer,
  DiscountType,
  Locale,
  PaymentMethod,
  Product,
  TaxMode
} from "@/types/pos";
import { sanitizePhoneDigits } from "@/lib/phone";

type CalculationItem = {
  discountType?: DiscountType;
  discountValue?: number;
  quantity: number;
  unitPrice: number;
  taxable?: boolean;
};

export function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function normalizeDiscountValue(
  discountType: DiscountType,
  discountValue: number,
  maxFixedAmount: number
) {
  const safeValue = Number.isFinite(discountValue) ? Math.max(0, discountValue) : 0;
  const limit = discountType === "percentage" ? 100 : Math.max(0, maxFixedAmount);

  return roundMoney(Math.min(safeValue, limit));
}

export function calculateDiscountAmount(
  subtotal: number,
  discountType: DiscountType,
  discountValue: number
) {
  const normalizedDiscountValue = normalizeDiscountValue(discountType, discountValue, subtotal);

  if (normalizedDiscountValue <= 0) {
    return 0;
  }

  if (discountType === "percentage") {
    return roundMoney(Math.min(subtotal, subtotal * (normalizedDiscountValue / 100)));
  }

  return roundMoney(Math.min(subtotal, normalizedDiscountValue));
}

export function calculateBillTotals({
  discountType,
  discountValue,
  items,
  taxEnabled,
  taxMode,
  taxRate
}: {
  items: CalculationItem[];
  discountType: DiscountType;
  discountValue: number;
  taxEnabled: boolean;
  taxRate: number;
  taxMode: TaxMode;
}) {
  const lineSummaries = items.map((item) => {
    const grossLineTotal = roundMoney(item.unitPrice * Math.max(item.quantity, 0));
    const itemDiscount = calculateDiscountAmount(
      grossLineTotal,
      item.discountType ?? "fixed",
      item.discountValue ?? 0
    );

    return {
      grossLineTotal,
      itemDiscount,
      lineTotal: roundMoney(Math.max(0, grossLineTotal - itemDiscount)),
      taxable: item.taxable !== false
    };
  });
  const grossSubtotal = roundMoney(
    lineSummaries.reduce((sum, item) => sum + item.grossLineTotal, 0)
  );
  const itemDiscountAmount = roundMoney(
    lineSummaries.reduce((sum, item) => sum + item.itemDiscount, 0)
  );
  const subtotal = roundMoney(
    lineSummaries.reduce((sum, item) => sum + item.lineTotal, 0)
  );
  const taxableSubtotal = roundMoney(
    lineSummaries.reduce((sum, item) => {
      if (!item.taxable) {
        return sum;
      }

      return sum + item.lineTotal;
    }, 0)
  );
  const discountAmount = calculateDiscountAmount(subtotal, discountType, discountValue);
  const discountedSubtotal = roundMoney(Math.max(0, subtotal - discountAmount));
  const taxableDiscountShare =
    subtotal > 0 ? roundMoney((discountAmount * taxableSubtotal) / subtotal) : 0;
  const discountedTaxableSubtotal = roundMoney(Math.max(0, taxableSubtotal - taxableDiscountShare));

  if (!taxEnabled || taxRate <= 0) {
    return {
      grossSubtotal,
      itemDiscountAmount,
      subtotal,
      discountAmount,
      taxAmount: 0,
      total: discountedSubtotal
    };
  }

  if (taxMode === "inclusive") {
    const taxAmount = roundMoney(discountedTaxableSubtotal * (taxRate / (100 + taxRate)));

    return {
      grossSubtotal,
      itemDiscountAmount,
      subtotal,
      discountAmount,
      taxAmount,
      total: discountedSubtotal
    };
  }

  const taxAmount = roundMoney(discountedTaxableSubtotal * (taxRate / 100));

  return {
    grossSubtotal,
    itemDiscountAmount,
    subtotal,
    discountAmount,
    taxAmount,
    total: roundMoney(discountedSubtotal + taxAmount)
  };
}

export function findCustomerPhoneConflict(
  customers: Customer[],
  currentShopId: string,
  customerId: string | undefined,
  phone: string | undefined
) {
  const normalizedPhone = phone?.trim();

  if (!normalizedPhone) {
    return null;
  }

  return (
    customers.find(
      (item) =>
        item.shopId === currentShopId &&
        item.phone?.trim() === normalizedPhone &&
        item.id !== customerId
    ) ?? null
  );
}

export function calculatePaymentAllocation(
  total: number,
  paymentMethod: PaymentMethod,
  paymentAmounts?: { cash?: number; card?: number }
) {
  const safeTotal = roundMoney(Math.max(0, total));

  if (!paymentAmounts) {
    const paidAmount = paymentMethod === "account" ? 0 : safeTotal;

    return {
      cashAmount: paymentMethod === "cash" ? paidAmount : 0,
      cardAmount: paymentMethod === "card" ? paidAmount : 0,
      paidAmount,
      dueAmount: roundMoney(safeTotal - paidAmount),
      paymentMethod,
      isValid: true
    };
  }

  const rawCash = Number(paymentAmounts.cash ?? 0);
  const rawCard = Number(paymentAmounts.card ?? 0);
  const cashAmount = roundMoney(Math.max(0, Number.isFinite(rawCash) ? rawCash : 0));
  const cardAmount = roundMoney(Math.max(0, Number.isFinite(rawCard) ? rawCard : 0));
  const paidAmount = roundMoney(cashAmount + cardAmount);
  const dueAmount = roundMoney(Math.max(0, safeTotal - paidAmount));
  const resolvedPaymentMethod: PaymentMethod =
    dueAmount > 0 ? "account" : cardAmount > 0 && cashAmount <= 0 ? "card" : "cash";

  return {
    cashAmount,
    cardAmount,
    paidAmount,
    dueAmount,
    paymentMethod: resolvedPaymentMethod,
    isValid: paidAmount <= safeTotal
  };
}

export function calculatePaidAndDue(total: number, paymentMethod: PaymentMethod) {
  const { paidAmount, dueAmount } = calculatePaymentAllocation(total, paymentMethod);

  return { paidAmount, dueAmount };
}

export function getBillStatus(paymentMethod: PaymentMethod, dueAmount: number): Bill["status"] {
  if (paymentMethod === "account" || dueAmount > 0) {
    return "due";
  }

  return "paid";
}

export function generateBillNumber(existingBillsCount: number) {
  return `REC-${String(existingBillsCount + 1).padStart(6, "0")}`;
}

export function findExistingCustomer(
  customers: Customer[],
  currentShopId: string,
  customer: CheckoutCustomerInput
) {
  const phone = customer.phone?.trim();
  const name = customer.name?.trim().toLowerCase();

  if (customer.id) {
    return customers.find((item) => item.id === customer.id && item.shopId === currentShopId) ?? null;
  }

  if (phone) {
    const byPhone = customers.find((item) => item.shopId === currentShopId && item.phone?.trim() === phone);

    if (byPhone) {
      return byPhone;
    }
  }

  if (name) {
    return (
      customers.find((item) => item.shopId === currentShopId && item.name.trim().toLowerCase() === name) ?? null
    );
  }

  return null;
}

export function customerMatchesSearch(customer: Customer, rawQuery: string) {
  const query = rawQuery.normalize("NFKC").trim().toLocaleLowerCase();

  if (!query) {
    return false;
  }

  const textMatch = [customer.name, customer.email, customer.phone, customer.whatsapp]
    .filter(Boolean)
    .some((value) => value!.normalize("NFKC").toLocaleLowerCase().includes(query));

  if (textMatch) {
    return true;
  }

  const queryDigits = sanitizePhoneDigits(query).replace(/^0+/, "");

  if (queryDigits.length < 3) {
    return false;
  }

  return [customer.phone, customer.whatsapp]
    .filter(Boolean)
    .some((value) => sanitizePhoneDigits(value!).replace(/^0+/, "").includes(queryDigits));
}

export function isWalkInCustomerName(value?: string) {
  const normalized = (value ?? "")
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase()
    .replace(/[\s-]+/g, " ");

  return !normalized || normalized === "walk in customer";
}

export function shouldPersistCustomer(customer: CheckoutCustomerInput) {
  return !isWalkInCustomerName(customer.name);
}

export function normalizeCustomer(customer: CheckoutCustomerInput) {
  return {
    id: customer.id,
    name: customer.name?.trim() || "Walk-in Customer",
    phone: customer.phone?.trim() || undefined,
    email: customer.email?.trim() || undefined,
    whatsapp: customer.whatsapp?.trim() || undefined
  };
}

export function getLocalizedProductName(product: Product, locale: Locale) {
  return product.name[locale] || product.name.en;
}
