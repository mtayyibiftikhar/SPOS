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

export function calculateDiscountAmount(
  subtotal: number,
  discountType: DiscountType,
  discountValue: number
) {
  if (discountValue <= 0) {
    return 0;
  }

  if (discountType === "percentage") {
    return roundMoney(Math.min(subtotal, subtotal * (discountValue / 100)));
  }

  return roundMoney(Math.min(subtotal, discountValue));
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

export function calculatePaidAndDue(total: number, paymentMethod: PaymentMethod) {
  if (paymentMethod === "account") {
    return {
      paidAmount: 0,
      dueAmount: total
    };
  }

  return {
    paidAmount: total,
    dueAmount: 0
  };
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

export function shouldPersistCustomer(customer: CheckoutCustomerInput) {
  return Boolean(
    customer.name?.trim() || customer.phone?.trim() || customer.email?.trim() || customer.whatsapp?.trim()
  );
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
