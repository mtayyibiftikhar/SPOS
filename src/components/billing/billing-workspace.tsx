"use client";

import type { ReactNode } from "react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  CheckCircle2,
  CircleAlert,
  Clock3,
  CreditCard,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Trash2
} from "lucide-react";
import { usePosApp } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PhoneNumberField } from "@/components/ui/phone-number-field";
import {
  calculateBillTotals,
  calculateDiscountAmount,
  calculatePaidAndDue,
  getLocalizedProductName,
  normalizeDiscountValue
} from "@/lib/billing";
import { paymentMethodLabelKeys } from "@/lib/i18n";
import { combinePhoneNumber, DEFAULT_PHONE_COUNTRY_CODE, sanitizePhoneDigits, splitPhoneNumber } from "@/lib/phone";
import { cn, formatCurrency } from "@/lib/utils";
import type { Customer, DiscountType, PaymentMethod, Product } from "@/types/pos";

type WorkflowStep = "build" | "customer" | "payment";

type CartLine = {
  discountType: DiscountType;
  discountValueInput: string;
  productId: string;
  quantity: number;
  unitPriceInput: string;
};

type CustomerForm = {
  id?: string;
  email: string;
  name: string;
  phoneCountryCode: string;
  phoneNumber: string;
  whatsappCountryCode: string;
  whatsappNumber: string;
  whatsappSameAsPhone: boolean;
};

type StepPillProps = {
  active?: boolean;
  complete?: boolean;
  index: number;
  label: string;
};

type StatusChipProps = {
  icon: typeof CheckCircle2;
  label: string;
  tone: "neutral" | "success" | "warning";
};

const paymentOptions: Array<{
  icon: typeof Banknote;
  method: PaymentMethod;
}> = [
  { method: "cash", icon: Banknote },
  { method: "card", icon: CreditCard },
  { method: "account", icon: Clock3 }
];

const UNCATEGORIZED_QUICK_CATEGORY_ID = "__quick_uncategorized__";

function createEmptyCustomerForm(): CustomerForm {
  return {
    email: "",
    name: "",
    phoneCountryCode: DEFAULT_PHONE_COUNTRY_CODE,
    phoneNumber: "",
    whatsappCountryCode: DEFAULT_PHONE_COUNTRY_CODE,
    whatsappNumber: "",
    whatsappSameAsPhone: true
  };
}

function toCustomerForm(customer: Customer): CustomerForm {
  const phone = splitPhoneNumber(customer.phone);
  const whatsapp = splitPhoneNumber(customer.whatsapp ?? customer.phone);

  return {
    id: customer.id,
    email: customer.email ?? "",
    name: customer.name,
    phoneCountryCode: phone.countryCode,
    phoneNumber: phone.localNumber,
    whatsappCountryCode: whatsapp.countryCode,
    whatsappNumber: whatsapp.localNumber,
    whatsappSameAsPhone: (customer.whatsapp ?? customer.phone ?? "") === (customer.phone ?? "")
  };
}

function formatEditablePrice(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function sanitizePriceInput(value: string) {
  const onlyDigitsAndDots = value.replace(/[^\d.]/g, "");
  const [wholePart = "", decimalPart] = onlyDigitsAndDots.split(".");

  return decimalPart === undefined ? wholePart : `${wholePart}.${decimalPart.slice(0, 2)}`;
}

function clampDiscountInput(discountType: DiscountType, value: string, maxFixedAmount: number) {
  const sanitizedValue = sanitizePriceInput(value);
  const parsedValue = Number.parseFloat(sanitizedValue);
  const normalizedValue = normalizeDiscountValue(
    discountType,
    Number.isFinite(parsedValue) ? parsedValue : 0,
    maxFixedAmount
  );

  return formatEditablePrice(normalizedValue);
}

function StatusChip({ icon: Icon, label, tone }: StatusChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em]",
        tone === "success" && "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
        tone === "warning" && "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
        tone === "neutral" && "bg-slate-100 text-slate-700 ring-1 ring-slate-200"
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

function StepPill({ active, complete, index, label }: StepPillProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em]",
        active && "bg-slate-950 text-white",
        complete && !active && "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
        !active && !complete && "bg-slate-100 text-slate-600 ring-1 ring-slate-200"
      )}
    >
      <span
        className={cn(
          "inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px]",
          active && "bg-white/15 text-white",
          complete && !active && "bg-emerald-100 text-emerald-700",
          !active && !complete && "bg-white text-slate-600"
        )}
      >
        {index}
      </span>
      {label}
    </div>
  );
}

function SummaryRow({
  label,
  strong = false,
  value
}: {
  label: string;
  strong?: boolean;
  value: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3 text-sm", strong ? "text-slate-950" : "text-slate-600")}>
      <span>{label}</span>
      <span className={cn("font-medium", strong && "text-base font-semibold")}>{value}</span>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-[240px] items-center justify-center rounded-[26px] border border-dashed border-slate-300 bg-slate-50/80 px-6 text-center">
      <div>
        <ShoppingBag className="mx-auto h-6 w-6 text-slate-400" />
        <p className="mt-3 max-w-sm text-sm leading-6 text-slate-600">{label}</p>
      </div>
    </div>
  );
}

function SectionEyebrow({ children }: { children: ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">{children}</p>;
}

export function BillingWorkspace() {
  const router = useRouter();
  const {
    createBill,
    currentBusinessDay,
    currentSettings,
    currentShift,
    currentShop,
    currentShopId,
    locale,
    session,
    startBusinessDay,
    startShift,
    state,
    t
  } = usePosApp();

  const [workflowStep, setWorkflowStep] = useState<WorkflowStep>("build");
  const [customerSearch, setCustomerSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [customerForm, setCustomerForm] = useState<CustomerForm>(createEmptyCustomerForm);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discountType, setDiscountType] = useState<DiscountType>("fixed");
  const [discountValue, setDiscountValue] = useState("0");
  const [openingCash, setOpeningCash] = useState("0");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [error, setError] = useState<string | null>(null);
  const [setupFeedback, setSetupFeedback] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedQuickCategoryId, setSelectedQuickCategoryId] = useState<string | null>(null);

  const deferredCustomerSearch = useDeferredValue(customerSearch);

  const shopProducts = state.products.filter(
    (product) => product.shopId === currentShopId && product.status === "active"
  );
  const shopCategories = state.categories.filter((category) => category.shopId === currentShopId);
  const savedCustomers = state.customers.filter((customer) => customer.shopId === currentShopId);
  const currency = currentShop?.currency ?? "SAR";
  const taxEnabled = currentSettings?.tax.enabled ?? false;
  const taxLabel = currentSettings?.tax.name ?? t("common.tax");
  const checkoutBlocked = !currentBusinessDay || !currentShift;
  const customerSearchHasValue = deferredCustomerSearch.trim().length > 0;
  const productSearchHasValue = productSearch.trim().length > 0;

  const productById = useMemo(
    () =>
      shopProducts.reduce<Record<string, Product>>((accumulator, product) => {
        accumulator[product.id] = product;
        return accumulator;
      }, {}),
    [shopProducts]
  );

  const favoriteProducts = useMemo(
    () =>
      [...shopProducts]
        .filter((product) => product.quickTab)
        .sort((left, right) => left.name.en.localeCompare(right.name.en)),
    [shopProducts]
  );

  const quickCategories = useMemo(() => {
    const productsByCategory = favoriteProducts.reduce<Record<string, Product[]>>((accumulator, product) => {
      const categoryId = product.categoryId || UNCATEGORIZED_QUICK_CATEGORY_ID;

      accumulator[categoryId] = [...(accumulator[categoryId] ?? []), product];
      return accumulator;
    }, {});

    const categorized = shopCategories
      .map((category) => ({
        id: category.id,
        imageUrl: category.imageUrl,
        name: category.name,
        products: productsByCategory[category.id] ?? []
      }))
      .filter((category) => category.products.length > 0);
    const uncategorizedProducts = productsByCategory[UNCATEGORIZED_QUICK_CATEGORY_ID] ?? [];

    return uncategorizedProducts.length > 0
      ? [
          ...categorized,
          {
            id: UNCATEGORIZED_QUICK_CATEGORY_ID,
            imageUrl: undefined,
            name: t("common.noCategory"),
            products: uncategorizedProducts
          }
        ]
      : categorized;
  }, [favoriteProducts, shopCategories, t]);

  const selectedQuickCategory = selectedQuickCategoryId
    ? quickCategories.find((category) => category.id === selectedQuickCategoryId) ?? null
    : null;
  const selectedQuickProducts = selectedQuickCategory?.products ?? [];

  const matchedCustomers = useMemo(() => {
    const query = deferredCustomerSearch.trim().toLowerCase();

    if (!query) {
      return [];
    }

    return savedCustomers
      .filter((customer) =>
        [customer.name, customer.phone, customer.whatsapp]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(query))
      )
      .slice(0, 6);
  }, [deferredCustomerSearch, savedCustomers]);

  const searchResults = useMemo(() => {
    const query = productSearch.trim().toLowerCase();

    if (!query) {
      return [];
    }

    return [...shopProducts]
      .sort((left, right) => Number(right.quickTab) - Number(left.quickTab))
      .filter((product) =>
        [product.name.en, product.name.ar, product.name.ur, product.barcode]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(query))
      )
      .slice(0, 8);
  }, [productSearch, shopProducts]);

  const cartProducts = useMemo(
    () =>
      cart
        .map((line) => {
          const product = productById[line.productId];

          if (!product) {
            return null;
          }

          const parsedUnitPrice = Number.parseFloat(line.unitPriceInput);
          const unitPrice = Number.isFinite(parsedUnitPrice) ? Math.round(parsedUnitPrice * 100) / 100 : 0;
          const grossLineTotal = Math.round(unitPrice * line.quantity * 100) / 100;
          const parsedDiscountValue = Number.parseFloat(line.discountValueInput);
          const discountValue = normalizeDiscountValue(
            line.discountType,
            Number.isFinite(parsedDiscountValue) ? parsedDiscountValue : 0,
            grossLineTotal
          );
          const discountAmount = calculateDiscountAmount(grossLineTotal, line.discountType, discountValue);

          return {
            discountAmount,
            discountType: line.discountType,
            discountValue,
            discountValueInput: line.discountValueInput,
            grossLineTotal,
            lineTotal: Math.round((grossLineTotal - discountAmount) * 100) / 100,
            product,
            quantity: line.quantity,
            unitPrice,
            unitPriceInput: line.unitPriceInput
          };
        })
        .filter(
          (
            line
          ): line is {
            discountAmount: number;
            discountType: DiscountType;
            discountValue: number;
            discountValueInput: string;
            grossLineTotal: number;
            lineTotal: number;
            product: Product;
            quantity: number;
            unitPrice: number;
            unitPriceInput: string;
          } => line !== null
        ),
    [cart, productById]
  );

  const cartQuantityByProductId = useMemo(
    () =>
      cart.reduce<Record<string, number>>((accumulator, line) => {
        accumulator[line.productId] = line.quantity;
        return accumulator;
      }, {}),
    [cart]
  );

  const cartItemCount = useMemo(() => cart.reduce((total, line) => total + line.quantity, 0), [cart]);

  const totals = calculateBillTotals({
    items: cartProducts.map((line) => ({
      discountType: line.discountType,
      discountValue: line.discountValue,
      quantity: line.quantity,
      taxable: line.product.taxable,
      unitPrice: line.unitPrice
    })),
    discountType,
    discountValue: Number(discountValue || 0),
    taxEnabled,
    taxMode: currentSettings?.tax.mode ?? "inclusive",
    taxRate: currentSettings?.tax.rate ?? 0
  });

  const paymentSummary = calculatePaidAndDue(totals.total, paymentMethod);
  const normalizedCustomerName = customerForm.name.trim();
  const normalizedCustomerPhone = combinePhoneNumber(customerForm.phoneCountryCode, customerForm.phoneNumber);
  const normalizedCustomerWhatsapp = customerForm.whatsappSameAsPhone
    ? normalizedCustomerPhone
    : combinePhoneNumber(customerForm.whatsappCountryCode, customerForm.whatsappNumber);
  const accountCustomerReady = Boolean(normalizedCustomerName && normalizedCustomerPhone);
  const accountPaymentBlocked = paymentMethod === "account" && !accountCustomerReady;
  const cartHasInvalidPrice = cartProducts.some((line) => line.unitPrice <= 0);
  const blockerMessage = !currentBusinessDay
    ? t("billing.dayRequired")
    : !currentShift
      ? t("billing.shiftRequired")
      : null;
  const headerMessage = setupFeedback ?? error ?? blockerMessage ?? setupHint();
  const shouldShowHeaderMessage = Boolean(setupFeedback || error || blockerMessage);

  function setupHint() {
    if (!currentBusinessDay) {
      return t("billing.openShiftDayHint");
    }

    if (!currentShift) {
      return t("billing.shiftRequired");
    }

    return t("billing.counterCompactHint");
  }

  const customerDisplayName = normalizedCustomerName || t("billing.walkInCustomer");
  const getLineDiscountLimit = (line: CartLine) => {
    const parsedUnitPrice = Number.parseFloat(line.unitPriceInput);
    const unitPrice = Number.isFinite(parsedUnitPrice) ? Math.max(0, Math.round(parsedUnitPrice * 100) / 100) : 0;

    return Math.round(unitPrice * line.quantity * 100) / 100;
  };

  useEffect(() => {
    const nextDiscountValue = clampDiscountInput(discountType, discountValue, totals.subtotal);

    if (nextDiscountValue !== discountValue) {
      setDiscountValue(nextDiscountValue);
    }
  }, [discountType, discountValue, totals.subtotal]);

  useEffect(() => {
    if (
      selectedQuickCategoryId &&
      !quickCategories.some((category) => category.id === selectedQuickCategoryId)
    ) {
      setSelectedQuickCategoryId(null);
    }
  }, [quickCategories, selectedQuickCategoryId]);

  const isProductStockBlocked = (product: Product) =>
    product.kind === "product" && (cartQuantityByProductId[product.id] ?? 0) >= product.stockQuantity;
  const getStockBlockedMessage = (product: Product) =>
    product.stockQuantity <= 0
      ? t("billing.outOfStock", { name: getLocalizedProductName(product, locale) })
      : t("billing.stockLimitReached", {
          name: getLocalizedProductName(product, locale),
          stock: product.stockQuantity
        });

  const addProductToCart = (product: Product) => {
    const quantityInCart = cartQuantityByProductId[product.id] ?? 0;

    if (product.kind === "product" && quantityInCart >= product.stockQuantity) {
      setError(getStockBlockedMessage(product));
      return;
    }

    setCart((current) => {
      const existing = current.find((line) => line.productId === product.id);

      if (!existing) {
        return [
          ...current,
          {
            discountType: "fixed",
            discountValueInput: "0",
            productId: product.id,
            quantity: 1,
            unitPriceInput: formatEditablePrice(product.salePrice)
          }
        ];
      }

      return current.map((line) =>
        line.productId === product.id ? { ...line, quantity: line.quantity + 1 } : line
      );
    });

    setProductSearch("");
    setError(null);
  };

  const updateLineQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      setCart((current) => current.filter((line) => line.productId !== productId));
      return;
    }

    setCart((current) =>
      current.map((line) => {
        if (line.productId !== productId) {
          return line;
        }

        const nextLine = { ...line, quantity };

        return {
          ...nextLine,
          discountValueInput: clampDiscountInput(
            nextLine.discountType,
            nextLine.discountValueInput,
            getLineDiscountLimit(nextLine)
          )
        };
      })
    );
  };

  const updateLineUnitPriceInput = (productId: string, value: string) => {
    const sanitizedValue = sanitizePriceInput(value);

    setCart((current) =>
      current.map((line) => {
        if (line.productId !== productId) {
          return line;
        }

        const nextLine = { ...line, unitPriceInput: sanitizedValue };

        return {
          ...nextLine,
          discountValueInput: clampDiscountInput(
            nextLine.discountType,
            nextLine.discountValueInput,
            getLineDiscountLimit(nextLine)
          )
        };
      })
    );
  };

  const updateLineDiscount = (
    productId: string,
    patch: Partial<Pick<CartLine, "discountType" | "discountValueInput">>
  ) => {
    setCart((current) =>
      current.map((line) => {
        if (line.productId !== productId) {
          return line;
        }

        const nextDiscountType = patch.discountType ?? line.discountType;
        const nextDiscountValueInput = patch.discountValueInput ?? line.discountValueInput;
        const nextLine = {
          ...line,
          ...patch,
          discountType: nextDiscountType
        };

        return {
          ...nextLine,
          discountValueInput: clampDiscountInput(
            nextDiscountType,
            nextDiscountValueInput,
            getLineDiscountLimit(nextLine)
          )
        };
      })
    );
  };

  const restoreLineUnitPrice = (productId: string) => {
    const fallback = productById[productId];

    if (!fallback) {
      return;
    }

    setCart((current) =>
      current.map((line) => {
        if (line.productId !== productId) {
          return line;
        }

        const parsedValue = Number.parseFloat(line.unitPriceInput);

        if (Number.isFinite(parsedValue) && parsedValue > 0) {
          const nextLine = {
            ...line,
            unitPriceInput: formatEditablePrice(Math.round(parsedValue * 100) / 100)
          };

          return {
            ...nextLine,
            discountValueInput: clampDiscountInput(
              nextLine.discountType,
              nextLine.discountValueInput,
              getLineDiscountLimit(nextLine)
            )
          };
        }

        const nextLine = {
          ...line,
          unitPriceInput: formatEditablePrice(fallback.salePrice)
        };

        return {
          ...nextLine,
          discountValueInput: clampDiscountInput(
            nextLine.discountType,
            nextLine.discountValueInput,
            getLineDiscountLimit(nextLine)
          )
        };
      })
    );
  };

  const selectCustomer = (customer: Customer) => {
    setCustomerForm(toCustomerForm(customer));
    setCustomerSearch("");
    setError(null);
  };

  const clearCustomer = () => {
    setCustomerForm(createEmptyCustomerForm());
    setCustomerSearch("");
  };

  const translateCreateBillError = (message?: string) => {
    switch (message) {
      case "Session unavailable.":
        return t("billing.sessionUnavailable");
      case "Add at least one product or service.":
        return t("billing.emptyCart");
      case "Start the business day before creating bills.":
        return t("billing.dayRequired");
      case "Start your shift before creating bills.":
        return t("billing.shiftRequired");
      case "Another customer already uses this phone number.":
        return t("billing.uniquePhoneError");
      case "Account / pay later requires a saved customer with a name and phone number.":
        return t("billing.accountCustomerRequired");
      default:
        return message?.startsWith("Not enough stock") ? message : t("billing.createError");
    }
  };

  const translateSetupMessage = (message?: string) => {
    switch (message) {
      case "Session unavailable.":
        return t("billing.sessionUnavailable");
      case "Only the shop admin can start the business day.":
        return t("billing.dayAdminNeeded");
      case "Only shop users can start shifts.":
        return t("cashControl.shiftUnavailable");
      case "Start the business day before starting a shift.":
      case "Start the business day before creating bills.":
        return t("billing.dayRequired");
      case "Start your shift before creating bills.":
        return t("billing.shiftRequired");
      case "Unable to start the business day.":
        return t("cashControl.dayStartError");
      case "Unable to start the shift.":
        return t("cashControl.shiftStartError");
      default:
        return message ?? t("billing.createError");
    }
  };

  const handleStartDay = () => {
    setSetupFeedback(null);
    setError(null);

    const result = startBusinessDay({});

    if (!result.ok) {
      setSetupFeedback(translateSetupMessage(result.message));
      return;
    }

    setSetupFeedback(t("cashControl.dayStarted"));
  };

  const handleStartShift = () => {
    setSetupFeedback(null);
    setError(null);

    const normalizedOpeningCash = Number(openingCash || 0);

    if (Number.isNaN(normalizedOpeningCash) || normalizedOpeningCash < 0) {
      setSetupFeedback(t("cashControl.invalidCashValue"));
      return;
    }

    const result = startShift({ openingCash: normalizedOpeningCash });

    if (!result.ok) {
      setSetupFeedback(translateSetupMessage(result.message));
      return;
    }

    setSetupFeedback(t("cashControl.shiftStarted"));
  };

  const handleProductSearchEnter = () => {
    if (searchResults.length === 0) {
      return;
    }

    addProductToCart(searchResults[0]);
  };

  const proceedToCustomerStep = () => {
    setError(null);

    if (cartProducts.length === 0) {
      setError(t("billing.emptyCart"));
      return;
    }

    if (cartHasInvalidPrice) {
      setError(t("billing.createError"));
      return;
    }

    if (checkoutBlocked) {
      setError(blockerMessage ?? t("billing.createError"));
      return;
    }

    setWorkflowStep("customer");
  };

  const proceedToPayment = () => {
    setError(null);

    if (cartProducts.length === 0) {
      setError(t("billing.emptyCart"));
      setWorkflowStep("build");
      return;
    }

    if (cartHasInvalidPrice) {
      setError(t("billing.createError"));
      return;
    }

    if (checkoutBlocked) {
      setError(blockerMessage ?? t("billing.createError"));
      setWorkflowStep("build");
      return;
    }

    setWorkflowStep("payment");
  };

  const submitBill = () => {
    setError(null);

    if (cartProducts.length === 0) {
      setError(t("billing.emptyCart"));
      setWorkflowStep("build");
      return;
    }

    if (cartHasInvalidPrice) {
      setError(t("billing.createError"));
      return;
    }

    if (checkoutBlocked) {
      setError(blockerMessage ?? t("billing.createError"));
      setWorkflowStep("build");
      return;
    }

    if (accountPaymentBlocked) {
      setError(t("billing.accountCustomerRequired"));
      return;
    }

    setIsSubmitting(true);

    const normalizedBillDiscountValue = Number(clampDiscountInput(discountType, discountValue, totals.subtotal));
    const payload = {
      customer: {
        email: customerForm.email.trim(),
        id: customerForm.id,
        name: normalizedCustomerName,
        phone: normalizedCustomerPhone,
        whatsapp: normalizedCustomerWhatsapp
      },
      discountType,
      discountValue: normalizedBillDiscountValue,
      items: cartProducts.map((line) => ({
        discountType: line.discountType,
        discountValue: line.discountValue,
        productId: line.product.id,
        quantity: line.quantity,
        unitPrice: line.unitPrice
      })),
      paymentMethod
    } as const;

    const result = createBill(payload);

    if (!result.ok || !result.billId) {
      setError(translateCreateBillError(result.message));
      setIsSubmitting(false);
      return;
    }

    setCart([]);
    setProductSearch("");
    clearCustomer();
    setDiscountType("fixed");
    setDiscountValue("0");
    setPaymentMethod("cash");
    setWorkflowStep("build");
    setIsSubmitting(false);
    router.push(`/bills/${result.billId}?fresh=1`);
  };

  const renderCartRows = () => {
    if (cartProducts.length === 0) {
      return <EmptyState label={t("billing.emptyCart")} />;
    }

    return (
      <div className="space-y-2.5">
        <div className="hidden rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 xl:grid xl:grid-cols-[minmax(0,1.35fr)_112px_168px_112px_124px_44px] xl:items-center">
          <span>{t("common.items")}</span>
          <span>{t("common.salePrice")}</span>
          <span>{t("common.discount")}</span>
          <span className="text-center">{t("common.quantity")}</span>
          <span className="text-right">{t("common.total")}</span>
          <span />
        </div>

        {cartProducts.map((line) => (
          <div
            key={line.product.id}
            className="rounded-[22px] border border-slate-200 bg-white px-3 py-3 shadow-[0_12px_26px_rgba(15,23,42,0.05)]"
          >
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_112px_168px_112px_124px_44px] xl:items-center">
              <div className="min-w-0">
                <div className="flex items-start justify-between gap-3 xl:block">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-950">
                      {getLocalizedProductName(line.product, locale)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">{line.product.barcode || t("billing.manualSearchOnly")}</p>
                  </div>

                  <button
                    className="inline-flex h-9 w-9 items-center justify-center rounded-[12px] border border-red-200 bg-white text-red-600 transition hover:bg-red-50 xl:hidden"
                    onClick={() => updateLineQuantity(line.product.id, 0)}
                    type="button"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 xl:hidden">
                  {t("common.salePrice")}
                </label>
                <Input
                  className="h-10 rounded-[14px] border-slate-200 bg-slate-50 px-3 text-sm text-slate-950"
                  inputMode="decimal"
                  value={line.unitPriceInput}
                  onBlur={() => restoreLineUnitPrice(line.product.id)}
                  onChange={(event) => updateLineUnitPriceInput(line.product.id, event.target.value)}
                />
              </div>

              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 xl:hidden">
                  {t("common.discount")}
                </label>
                <div className="grid grid-cols-[1fr_72px] gap-1.5">
                  <div className="grid grid-cols-2 rounded-[14px] border border-slate-200 bg-slate-50 p-1">
                    <button
                      className={cn(
                        "rounded-[10px] px-2 py-2 text-[11px] font-semibold transition",
                        line.discountType === "fixed" ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-white"
                      )}
                      onClick={() => updateLineDiscount(line.product.id, { discountType: "fixed" })}
                      type="button"
                    >
                      {t("common.fixed")}
                    </button>
                    <button
                      className={cn(
                        "rounded-[10px] px-2 py-2 text-[11px] font-semibold transition",
                        line.discountType === "percentage" ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-white"
                      )}
                      onClick={() => updateLineDiscount(line.product.id, { discountType: "percentage" })}
                      type="button"
                    >
                      %
                    </button>
                  </div>
                  <Input
                    className="h-10 rounded-[14px] border-slate-200 bg-slate-50 px-2 text-sm text-slate-950"
                    inputMode="decimal"
                    value={line.discountValueInput}
                    onChange={(event) =>
                      updateLineDiscount(line.product.id, {
                        discountValueInput: sanitizePriceInput(event.target.value) || "0"
                      })
                    }
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 xl:hidden">
                  {t("common.quantity")}
                </label>
                <div className="inline-flex h-10 w-full items-center justify-between rounded-[14px] border border-slate-200 bg-slate-50 px-1.5">
                  <button
                    className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] text-slate-700 transition hover:bg-slate-100"
                    onClick={() => updateLineQuantity(line.product.id, line.quantity - 1)}
                    type="button"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="min-w-[2.1rem] text-center text-sm font-semibold text-slate-950">{line.quantity}</span>
                  <button
                    className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] text-slate-700 transition hover:bg-slate-100"
                    onClick={() => updateLineQuantity(line.product.id, line.quantity + 1)}
                    type="button"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="rounded-[16px] bg-emerald-50 px-3 py-2 text-right ring-1 ring-emerald-100">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-700 xl:hidden">
                  {t("common.total")}
                </p>
                <p className="text-base font-semibold text-slate-950">
                  {formatCurrency(line.lineTotal, currency, locale)}
                </p>
                {line.discountAmount > 0 ? (
                  <p className="mt-0.5 text-[11px] font-medium text-emerald-700">
                    -{formatCurrency(line.discountAmount, currency, locale)}
                  </p>
                ) : null}
              </div>

              <button
                className="hidden h-9 w-9 items-center justify-center rounded-[12px] border border-red-200 bg-white text-red-600 transition hover:bg-red-50 xl:inline-flex"
                onClick={() => updateLineQuantity(line.product.id, 0)}
                type="button"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderOrderSummaryList = (compact = false) => {
    if (cartProducts.length === 0) {
      return <EmptyState label={t("billing.emptyCart")} />;
    }

    return (
      <div className={cn("space-y-2", compact && "space-y-1.5")}>
        {cartProducts.map((line) => (
          <div
            key={`summary-${line.product.id}`}
            className={cn(
              "rounded-[20px] border border-slate-200 bg-white px-3 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.04)]",
              compact && "rounded-[18px] px-3 py-2.5"
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-950">
                  {getLocalizedProductName(line.product, locale)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {line.quantity} x {formatCurrency(line.unitPrice, currency, locale)}
                </p>
                {line.discountAmount > 0 ? (
                  <p className="mt-1 text-xs font-medium text-emerald-700">
                    {t("common.discount")}: -{formatCurrency(line.discountAmount, currency, locale)}
                  </p>
                ) : null}
              </div>
              <p className="text-sm font-semibold text-slate-950">
                {formatCurrency(line.lineTotal, currency, locale)}
              </p>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderStepHeader = ({
    backAction,
    backLabel,
    step
  }: {
    backAction: () => void;
    backLabel: string;
    step: Exclude<WorkflowStep, "build">;
  }) => {
    const isCustomerStep = step === "customer";

    return (
      <Card className="rounded-[28px] border-white/70 bg-white/92 px-4 py-3 shadow-[0_18px_44px_rgba(15,23,42,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button className="h-10 rounded-[14px] bg-slate-950 px-4 text-white hover:bg-slate-900" onClick={backAction}>
            <span className="inline-flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              {backLabel}
            </span>
          </Button>

          <div className="flex flex-wrap items-center gap-2">
            <StepPill complete index={1} label={t("billing.stepCart")} />
            <StepPill
              active={isCustomerStep}
              complete={step === "payment"}
              index={2}
              label={t("billing.stepCustomer")}
            />
            <StepPill active={step === "payment"} index={3} label={t("billing.stepPayment")} />
          </div>
        </div>
      </Card>
    );
  };

  const buildView = (
    <div className="mx-auto flex w-full max-w-[1920px] flex-col gap-3 xl:h-[90dvh] xl:overflow-hidden">
      <Card className="rounded-[28px] border-white/70 bg-white/92 px-4 py-3 shadow-[0_18px_44px_rgba(15,23,42,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2.5">
            <h1 className="font-display text-[1.9rem] font-semibold tracking-[-0.05em] text-slate-950">
              {t("nav.billing")}
            </h1>
            <StatusChip
              icon={currentBusinessDay ? CheckCircle2 : CircleAlert}
              label={currentBusinessDay ? t("billing.dayReady") : t("billing.dayMissing")}
              tone={currentBusinessDay ? "success" : "warning"}
            />
            <StatusChip
              icon={currentShift ? CheckCircle2 : CircleAlert}
              label={currentShift ? t("billing.shiftReady") : t("billing.shiftMissing")}
              tone={currentShift ? "success" : "warning"}
            />
            {session ? (
              <StatusChip
                icon={CheckCircle2}
                label={t("billing.currentCashier", { name: session.name })}
                tone="neutral"
              />
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!currentBusinessDay ? (
              session?.role === "shop_admin" ? (
                <Button
                  className="h-10 rounded-[14px] bg-slate-950 px-4 text-white hover:bg-slate-900"
                  onClick={handleStartDay}
                >
                  {t("cashControl.startDay")}
                </Button>
              ) : (
                <div className="rounded-[14px] border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
                  {t("billing.dayAdminNeeded")}
                </div>
              )
            ) : null}

            {!currentShift && currentBusinessDay ? (
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex min-w-[150px] items-center gap-2 rounded-[14px] border border-emerald-200 bg-emerald-50 px-3">
                  <Banknote className="h-4 w-4 text-emerald-700" />
                  <Input
                    className="h-10 border-0 bg-transparent px-0 text-sm text-slate-950 shadow-none focus:ring-0"
                    inputMode="decimal"
                    placeholder={t("cashControl.openingCash")}
                    value={openingCash}
                    onChange={(event) => setOpeningCash(event.target.value)}
                  />
                </div>
                <Button
                  className="h-10 rounded-[14px] bg-emerald-600 px-4 text-white hover:bg-emerald-700"
                  onClick={handleStartShift}
                >
                  {t("cashControl.startShift")}
                </Button>
              </div>
            ) : null}
          </div>
        </div>

        {shouldShowHeaderMessage ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[18px] bg-slate-50 px-3 py-2.5 text-sm">
            <CircleAlert
              className={cn(
                "h-4 w-4",
                error ? "text-red-600" : setupFeedback ? "text-emerald-600" : "text-amber-600"
              )}
            />
            <span
              className={cn(
                "font-medium",
                error ? "text-red-700" : setupFeedback ? "text-emerald-700" : "text-slate-700"
              )}
            >
              {headerMessage}
            </span>
          </div>
        ) : null}
      </Card>

      <div className="grid flex-1 min-h-0 gap-3 xl:grid-cols-[minmax(0,1.8fr)_320px]">
        <Card className="grid min-h-[560px] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-[30px] border-white/70 bg-white/95 shadow-[0_24px_60px_rgba(15,23,42,0.07)] xl:min-h-0">
          <div className="border-b border-slate-200 px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <SectionEyebrow>{t("billing.cartBoardTitle")}</SectionEyebrow>
                <h2 className="mt-1 font-display text-[1.6rem] font-semibold tracking-[-0.04em] text-slate-950">
                  {t("billing.cartTitle")}
                </h2>
                <p className="mt-1 text-sm text-slate-600">{t("billing.cartBoardDesc")}</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="rounded-[16px] bg-slate-950 px-3 py-2 text-white shadow-[0_16px_28px_rgba(15,23,42,0.16)]">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/65">
                    {cartItemCount} {t("common.items")}
                  </p>
                  <p className="mt-1 text-lg font-semibold">
                    {formatCurrency(totals.total, currency, locale)}
                  </p>
                </div>
              </div>
            </div>

            <div className="relative mt-4">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                className="h-11 rounded-[16px] border-slate-200 bg-slate-50 pl-11 text-sm text-slate-950"
                placeholder={t("billing.productSearchCompact")}
                value={productSearch}
                onChange={(event) => setProductSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleProductSearchEnter();
                  }
                }}
              />

              {productSearchHasValue ? (
                <div className="absolute inset-x-0 top-[calc(100%+0.55rem)] z-20 rounded-[20px] border border-slate-200 bg-white p-2 shadow-[0_22px_50px_rgba(15,23,42,0.14)]">
                  {searchResults.length > 0 ? (
                    <div className="space-y-1.5">
                      {searchResults.map((product) => {
                        const stockBlocked = isProductStockBlocked(product);

                        return (
                          <button
                            key={product.id}
                            className={cn(
                              "flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-2.5 text-left transition",
                              stockBlocked ? "cursor-not-allowed bg-slate-50 opacity-60" : "hover:bg-slate-50"
                            )}
                            disabled={stockBlocked}
                            onClick={() => addProductToCart(product)}
                            type="button"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-950">
                                {getLocalizedProductName(product, locale)}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                {stockBlocked
                                  ? getStockBlockedMessage(product)
                                  : product.barcode || t("billing.manualSearchOnly")}
                              </p>
                            </div>
                            <p className="text-sm font-semibold text-slate-950">
                              {formatCurrency(product.salePrice, currency, locale)}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="px-3 py-2 text-sm text-slate-600">{t("billing.noProductsFound")}</p>
                  )}
                </div>
              ) : null}
            </div>
          </div>

          <div className="min-h-0 overflow-y-auto px-4 py-4">{renderCartRows()}</div>

          <div className="border-t border-slate-200 px-4 py-4">
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-center">
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-[16px] border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {t("common.subtotal")}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-950">
                    {formatCurrency(totals.subtotal, currency, locale)}
                  </p>
                </div>
                <div className="rounded-[16px] border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {taxEnabled ? taxLabel : t("common.items")}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-950">
                    {taxEnabled ? formatCurrency(totals.taxAmount, currency, locale) : cartItemCount}
                  </p>
                </div>
                <div className="rounded-[16px] border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                    {t("common.total")}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-950">
                    {formatCurrency(totals.total, currency, locale)}
                  </p>
                </div>
              </div>

              <Button
                className="h-12 rounded-[18px] bg-emerald-600 text-base font-semibold text-white hover:bg-emerald-700"
                disabled={cartProducts.length === 0 || checkoutBlocked}
                onClick={proceedToCustomerStep}
              >
                <span className="inline-flex items-center gap-2">
                  {t("billing.continueToCustomer")}
                  <ArrowRight className="h-4 w-4" />
                </span>
              </Button>
            </div>
          </div>
        </Card>

        <Card className="grid min-h-[560px] grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-[30px] border-white/70 bg-white/95 shadow-[0_24px_60px_rgba(15,23,42,0.07)] xl:min-h-0">
          <div className="border-b border-slate-200 px-4 py-4">
            <SectionEyebrow>{t("billing.quickProductsTitle")}</SectionEyebrow>
            <div className="mt-1 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-[1.5rem] font-semibold tracking-[-0.04em] text-slate-950">
                  {selectedQuickCategory ? selectedQuickCategory.name : t("billing.quickCategoriesTitle")}
                </h2>
              </div>
              {selectedQuickCategory ? (
                <button
                  className="inline-flex h-10 shrink-0 items-center justify-center rounded-[14px] border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                  onClick={() => setSelectedQuickCategoryId(null)}
                  type="button"
                >
                  <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                  {t("billing.backToCategories")}
                </button>
              ) : null}
            </div>
          </div>

          <div className="min-h-0 overflow-y-auto px-4 py-4">
            {quickCategories.length > 0 && !selectedQuickCategory ? (
              <div className="grid grid-cols-2 gap-3">
                {quickCategories.map((category) => (
                  <button
                    key={category.id}
                    className="group overflow-hidden rounded-[22px] border border-slate-200 bg-white p-1.5 text-left shadow-[0_12px_26px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-[0_16px_32px_rgba(15,23,42,0.08)]"
                    onClick={() => setSelectedQuickCategoryId(category.id)}
                    type="button"
                  >
                    <div className="relative h-[6.8rem] overflow-hidden rounded-[17px] bg-[radial-gradient(circle_at_top_right,_rgba(16,185,129,0.22),_transparent_42%),linear-gradient(145deg,#f8fafc_0%,#eef4ef_100%)]">
                      {category.imageUrl ? (
                        <img src={category.imageUrl} alt={category.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <span className="font-display text-4xl font-semibold tracking-[-0.04em] text-slate-300">
                            {category.name.slice(0, 2).toUpperCase()}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="px-1.5 pb-2 pt-2">
                      <p className="line-clamp-1 text-center text-sm font-semibold text-slate-950">{category.name}</p>
                    </div>
                  </button>
                ))}
              </div>
            ) : quickCategories.length > 0 && selectedQuickCategory ? (
              selectedQuickProducts.length > 0 ? (
                <div className="space-y-2.5">
                  {selectedQuickProducts.map((product) => {
                    const quantityInCart = cartQuantityByProductId[product.id] ?? 0;
                    const stockBlocked = isProductStockBlocked(product);

                    return (
                      <div
                        key={product.id}
                        className={cn(
                          "grid w-full grid-cols-[68px_minmax(0,1fr)] gap-3 rounded-[22px] border border-slate-200 bg-white p-3 text-left shadow-[0_12px_26px_rgba(15,23,42,0.05)] transition",
                          stockBlocked
                            ? "opacity-70"
                            : "hover:-translate-y-0.5 hover:shadow-[0_16px_30px_rgba(15,23,42,0.08)]"
                        )}
                      >
                        <div className="flex h-[68px] items-center justify-center overflow-hidden rounded-[18px] bg-[radial-gradient(circle_at_top_right,_rgba(16,185,129,0.18),_transparent_42%),linear-gradient(145deg,#f8fafc_0%,#eef4ef_100%)]">
                          {product.imageUrl ? (
                            <img
                              src={product.imageUrl}
                              alt={getLocalizedProductName(product, locale)}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <span className="font-display text-2xl font-semibold tracking-[-0.04em] text-slate-300">
                              {getLocalizedProductName(product, locale).slice(0, 2).toUpperCase()}
                            </span>
                          )}
                        </div>

                        <div className="flex min-w-0 flex-col justify-between">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="line-clamp-2 text-sm font-semibold text-slate-950">
                                {getLocalizedProductName(product, locale)}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                {product.barcode || t("billing.manualSearchOnly")}
                              </p>
                            </div>
                            {quantityInCart > 0 ? (
                              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-700 ring-1 ring-emerald-200">
                                {quantityInCart}
                              </span>
                            ) : null}
                          </div>

                          <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                            <p className="self-start pt-1 text-[0.95rem] font-semibold leading-none text-slate-950">
                              {formatCurrency(product.salePrice, currency, locale)}
                            </p>

                            {quantityInCart > 0 ? (
                              <div className="inline-flex h-8 w-[96px] items-center justify-between rounded-full border border-emerald-200 bg-emerald-50 px-1 shadow-inner shadow-emerald-100/60">
                                <button
                                  className="inline-flex h-6 w-6 items-center justify-center rounded-full text-emerald-700 transition hover:bg-white"
                                  onClick={() => {
                                    updateLineQuantity(product.id, quantityInCart - 1);
                                  }}
                                  type="button"
                                >
                                  <Minus className="h-3.5 w-3.5" />
                                </button>
                                <span className="min-w-[1.4rem] text-center text-sm font-semibold text-emerald-900">
                                  {quantityInCart}
                                </span>
                                <button
                                  className="inline-flex h-6 w-6 items-center justify-center rounded-full text-emerald-700 transition hover:bg-white disabled:opacity-40"
                                  disabled={stockBlocked}
                                  onClick={() => addProductToCart(product)}
                                  type="button"
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ) : (
                              <Button
                                className="h-8 min-w-[78px] rounded-full bg-emerald-600 px-3 text-xs font-semibold text-white shadow-[0_10px_20px_rgba(5,150,105,0.2)] hover:bg-emerald-700"
                                disabled={stockBlocked}
                                onClick={() => addProductToCart(product)}
                              >
                                <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                                  <Plus className="h-3.5 w-3.5" />
                                  {stockBlocked ? t("products.reorderNeeded") : t("common.add")}
                                </span>
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState label={t("billing.quickCategoryEmpty")} />
              )
            ) : (
              <EmptyState label={t("billing.emptyQuickTab")} />
            )}
          </div>
        </Card>
      </div>
    </div>
  );

  const customerView = (
    <div className="mx-auto flex w-full max-w-[1920px] flex-col gap-3 xl:h-[90dvh] xl:overflow-hidden">
      {renderStepHeader({
        backAction: () => setWorkflowStep("build"),
        backLabel: t("billing.backToSale"),
        step: "customer"
      })}

      <div className="grid flex-1 min-h-0 gap-3 xl:grid-cols-[minmax(0,1.6fr)_360px]">
        <Card className="grid min-h-[620px] grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-[30px] border-white/70 bg-white/95 shadow-[0_24px_60px_rgba(15,23,42,0.07)] xl:min-h-0">
          <div className="border-b border-slate-200 px-4 py-4">
            <SectionEyebrow>{t("common.customer")}</SectionEyebrow>
            <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="font-display text-[1.6rem] font-semibold tracking-[-0.04em] text-slate-950">
                  {customerDisplayName}
                </h1>
                <p className="mt-1 text-sm text-slate-600">{t("billing.customerStepDesc")}</p>
              </div>

              <Button className="h-10 rounded-[14px] px-4 text-sm" variant="secondary" onClick={clearCustomer}>
                {t("common.clearForm")}
              </Button>
            </div>
          </div>

          <div className="min-h-0 overflow-y-auto px-4 py-4">
            <div className="relative">
              <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                {t("billing.customerSearchCompact")}
              </label>
              <Search className="pointer-events-none absolute left-4 top-[calc(50%+0.65rem)] h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                className="h-11 rounded-[16px] border-slate-200 bg-slate-50 pl-11 text-sm text-slate-950"
                placeholder={t("billing.customerSearchCompact")}
                value={customerSearch}
                onChange={(event) => setCustomerSearch(event.target.value)}
              />

              {customerSearchHasValue ? (
                <div className="absolute inset-x-0 top-[calc(100%+0.55rem)] z-20 rounded-[20px] border border-slate-200 bg-white p-2 shadow-[0_22px_50px_rgba(15,23,42,0.14)]">
                  {matchedCustomers.length > 0 ? (
                    <div className="space-y-1.5">
                      {matchedCustomers.map((customer) => (
                        <button
                          key={customer.id}
                          className="block w-full rounded-2xl px-3 py-2.5 text-left transition hover:bg-slate-50"
                          onClick={() => selectCustomer(customer)}
                          type="button"
                        >
                          <p className="text-sm font-semibold text-slate-950">{customer.name}</p>
                          <p className="mt-1 text-xs text-slate-500">{customer.phone || customer.whatsapp}</p>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="px-3 py-2 text-sm text-slate-600">{t("billing.noSavedCustomers")}</p>
                  )}
                </div>
              ) : null}
            </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <div className="lg:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-slate-700">{t("common.customerName")}</label>
                  <Input
                    className="rounded-[16px] border-slate-200 bg-slate-50"
                    value={customerForm.name}
                  onChange={(event) =>
                    setCustomerForm((current) => ({
                      ...current,
                      name: event.target.value
                    }))
                  }
                />
              </div>

                <PhoneNumberField
                  countryCode={customerForm.phoneCountryCode}
                  label={t("common.phone")}
                  number={customerForm.phoneNumber}
                  onCountryCodeChange={(value) =>
                    setCustomerForm((current) => ({
                      ...current,
                      phoneCountryCode: value,
                      whatsappCountryCode: current.whatsappSameAsPhone ? value : current.whatsappCountryCode
                    }))
                  }
                  onNumberChange={(value) =>
                    setCustomerForm((current) => ({
                      ...current,
                      phoneNumber: sanitizePhoneDigits(value),
                      whatsappNumber: current.whatsappSameAsPhone ? sanitizePhoneDigits(value) : current.whatsappNumber
                    }))
                  }
                />

                <PhoneNumberField
                  countryCode={customerForm.whatsappSameAsPhone ? customerForm.phoneCountryCode : customerForm.whatsappCountryCode}
                  disabled={customerForm.whatsappSameAsPhone}
                  label={t("common.whatsapp")}
                  number={customerForm.whatsappSameAsPhone ? customerForm.phoneNumber : customerForm.whatsappNumber}
                  onCountryCodeChange={(value) =>
                    setCustomerForm((current) => ({
                      ...current,
                      whatsappCountryCode: value
                    }))
                  }
                  onNumberChange={(value) =>
                    setCustomerForm((current) => ({
                      ...current,
                      whatsappNumber: sanitizePhoneDigits(value)
                    }))
                  }
                />

              <div className="lg:col-span-2">
                <label className="mb-2 block text-sm font-medium text-slate-700">{t("common.email")}</label>
                <Input
                  className="rounded-[16px] border-slate-200 bg-slate-50"
                  value={customerForm.email}
                  onChange={(event) =>
                    setCustomerForm((current) => ({
                      ...current,
                      email: event.target.value
                    }))
                  }
                />
              </div>
            </div>

                <label className="mt-5 inline-flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-950">
                  <input
                    checked={customerForm.whatsappSameAsPhone}
                    className="h-4 w-4"
                    onChange={(event) =>
                      setCustomerForm((current) => ({
                        ...current,
                        whatsappCountryCode: event.target.checked ? current.phoneCountryCode : current.whatsappCountryCode,
                        whatsappNumber: event.target.checked ? current.phoneNumber : current.whatsappNumber,
                        whatsappSameAsPhone: event.target.checked
                      }))
                    }
                type="checkbox"
              />
              {t("common.whatsappSameAsPhone")}
            </label>

            <div className="mt-5 rounded-[22px] border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {t("billing.walkInAutoHint")}
            </div>
          </div>
        </Card>

        <Card className="grid min-h-[620px] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-[30px] border-white/70 bg-white/95 shadow-[0_24px_60px_rgba(15,23,42,0.07)] xl:min-h-0">
          <div className="border-b border-slate-200 px-4 py-4">
            <SectionEyebrow>{t("billing.summaryLabel")}</SectionEyebrow>
            <h2 className="mt-1 font-display text-[1.4rem] font-semibold tracking-[-0.04em] text-slate-950">
              {t("billing.summaryTitle")}
            </h2>
            <p className="mt-1 text-sm text-slate-600">{t("billing.summaryDesc")}</p>
          </div>

          <div className="min-h-0 overflow-y-auto px-4 py-4">
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                  {t("common.discountType")}
                </label>
                <div className="inline-flex w-full gap-1 rounded-[16px] border border-slate-200 bg-slate-50 p-1">
                  <button
                    className={cn(
                      "flex-1 rounded-[12px] px-3 py-2 text-sm font-semibold transition",
                      discountType === "fixed" ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-white"
                    )}
                    onClick={() => {
                      setDiscountType("fixed");
                      setDiscountValue((current) => clampDiscountInput("fixed", current, totals.subtotal));
                    }}
                    type="button"
                  >
                    {t("common.fixed")}
                  </button>
                  <button
                    className={cn(
                      "flex-1 rounded-[12px] px-3 py-2 text-sm font-semibold transition",
                      discountType === "percentage" ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-white"
                    )}
                    onClick={() => {
                      setDiscountType("percentage");
                      setDiscountValue((current) => clampDiscountInput("percentage", current, totals.subtotal));
                    }}
                    type="button"
                  >
                    {t("common.percentage")}
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                  {t("common.discountValue")}
                </label>
                <Input
                  className="rounded-[16px] border-slate-200 bg-slate-50"
                  inputMode="decimal"
                  value={discountValue}
                  onChange={(event) =>
                    setDiscountValue(clampDiscountInput(discountType, event.target.value, totals.subtotal))
                  }
                />
              </div>

              <div>
                <SectionEyebrow>{t("common.items")}</SectionEyebrow>
                <div className="mt-2">{renderOrderSummaryList(true)}</div>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200 px-4 py-4">
            <div className="space-y-2.5 rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4">
              <SummaryRow label={t("common.subtotal")} value={formatCurrency(totals.subtotal, currency, locale)} />
              {totals.itemDiscountAmount > 0 ? (
                <SummaryRow label={t("common.itemDiscounts")} value={formatCurrency(totals.itemDiscountAmount, currency, locale)} />
              ) : null}
              <SummaryRow label={t("common.discount")} value={formatCurrency(totals.discountAmount, currency, locale)} />
              {taxEnabled ? (
                <SummaryRow label={taxLabel} value={formatCurrency(totals.taxAmount, currency, locale)} />
              ) : null}
              <SummaryRow label={t("common.total")} strong value={formatCurrency(totals.total, currency, locale)} />
            </div>

            {error ? <p className="mt-3 text-sm font-medium text-red-700">{error}</p> : null}

            <Button
              className="mt-3 h-12 w-full rounded-[18px] bg-emerald-600 text-base font-semibold text-white hover:bg-emerald-700"
              onClick={proceedToPayment}
            >
              <span className="inline-flex items-center gap-2">
                {t("billing.continueToPayment")}
                <ArrowRight className="h-4 w-4" />
              </span>
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );

  const paymentView = (
    <div className="mx-auto flex w-full max-w-[1920px] flex-col gap-3 xl:h-[90dvh] xl:overflow-hidden">
      {renderStepHeader({
        backAction: () => setWorkflowStep("customer"),
        backLabel: t("billing.backToCustomer"),
        step: "payment"
      })}

      <div className="grid flex-1 min-h-0 gap-3 xl:grid-cols-[minmax(0,1.7fr)_360px]">
        <Card className="grid min-h-[620px] grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-[30px] border-white/70 bg-white/95 shadow-[0_24px_60px_rgba(15,23,42,0.07)] xl:min-h-0">
          <div className="border-b border-slate-200 px-4 py-4">
            <SectionEyebrow>{t("billing.reviewAndPay")}</SectionEyebrow>
            <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="font-display text-[1.6rem] font-semibold tracking-[-0.04em] text-slate-950">
                  {t("billing.paymentStepTitle")}
                </h1>
                <p className="mt-1 text-sm text-slate-600">{t("billing.paymentStepDesc")}</p>
              </div>

              <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-right">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {t(paymentMethodLabelKeys[paymentMethod])}
                </p>
                <p className="mt-1 text-lg font-semibold text-slate-950">
                  {formatCurrency(totals.total, currency, locale)}
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-2 md:grid-cols-[minmax(0,1.2fr)_1fr_1fr]">
              <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{t("common.customer")}</p>
                <p className="mt-1 text-sm font-semibold text-slate-950">{customerDisplayName}</p>
                <p className="mt-1 text-xs text-slate-500">{normalizedCustomerPhone || t("billing.walkInAutoHint")}</p>
              </div>
              <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{t("common.paidAmount")}</p>
                <p className="mt-1 text-sm font-semibold text-slate-950">
                  {formatCurrency(paymentSummary.paidAmount, currency, locale)}
                </p>
              </div>
              <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{t("common.dueAmount")}</p>
                <p className="mt-1 text-sm font-semibold text-slate-950">
                  {formatCurrency(paymentSummary.dueAmount, currency, locale)}
                </p>
              </div>
            </div>
          </div>

          <div className="min-h-0 overflow-y-auto px-4 py-4">{renderOrderSummaryList()}</div>
        </Card>

        <Card className="grid min-h-[620px] grid-rows-[auto_auto_1fr_auto] overflow-hidden rounded-[30px] border-white/70 bg-white/95 shadow-[0_24px_60px_rgba(15,23,42,0.07)] xl:min-h-0">
          <div className="border-b border-slate-200 px-4 py-4">
            <SectionEyebrow>{t("common.paymentMethod")}</SectionEyebrow>
            <h2 className="mt-1 font-display text-[1.4rem] font-semibold tracking-[-0.04em] text-slate-950">
              {t("billing.checkoutTitle")}
            </h2>
          </div>

          <div className="border-b border-slate-200 px-4 py-4">
            <div className="grid grid-cols-3 gap-2">
              {paymentOptions.map(({ icon: Icon, method }) => {
                const active = paymentMethod === method;

                return (
                  <button
                    key={method}
                    className={cn(
                      "rounded-[20px] border px-3 py-3 text-center transition",
                      active
                        ? "border-slate-950 bg-slate-950 text-white shadow-[0_16px_30px_rgba(15,23,42,0.18)]"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                    )}
                    onClick={() => {
                      setPaymentMethod(method);
                      setError(null);
                    }}
                    type="button"
                  >
                    <Icon className="mx-auto h-5 w-5" />
                    <span className="mt-2 block text-[11px] font-semibold uppercase tracking-[0.18em]">
                      {t(paymentMethodLabelKeys[method])}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="min-h-0 px-4 py-4">
            <div className="space-y-2.5 rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4">
              <SummaryRow label={t("common.subtotal")} value={formatCurrency(totals.subtotal, currency, locale)} />
              {totals.itemDiscountAmount > 0 ? (
                <SummaryRow label={t("common.itemDiscounts")} value={formatCurrency(totals.itemDiscountAmount, currency, locale)} />
              ) : null}
              <SummaryRow label={t("common.discount")} value={formatCurrency(totals.discountAmount, currency, locale)} />
              {taxEnabled ? (
                <SummaryRow label={taxLabel} value={formatCurrency(totals.taxAmount, currency, locale)} />
              ) : null}
              <SummaryRow label={t("common.paidAmount")} value={formatCurrency(paymentSummary.paidAmount, currency, locale)} />
              <SummaryRow label={t("common.dueAmount")} value={formatCurrency(paymentSummary.dueAmount, currency, locale)} />
              <SummaryRow label={t("common.total")} strong value={formatCurrency(totals.total, currency, locale)} />
            </div>

            <div className="mt-4 rounded-[22px] border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {paymentMethod === "account"
                ? accountPaymentBlocked
                  ? t("billing.accountCustomerRequired")
                  : t("billing.accountCustomerHint")
                : t("billing.paidSaleHint")}
            </div>
          </div>

          <div className="border-t border-slate-200 px-4 py-4">
            {error ? <p className="mb-3 text-sm font-medium text-red-700">{error}</p> : null}

            <Button
              className="h-12 w-full rounded-[18px] bg-emerald-600 text-base font-semibold text-white hover:bg-emerald-700"
              disabled={isSubmitting || accountPaymentBlocked}
              onClick={submitBill}
            >
              <span className="inline-flex items-center gap-2">
                {isSubmitting ? t("billing.creatingBill") : t("billing.confirmAndCreate")}
                <ArrowRight className="h-4 w-4" />
              </span>
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );

  if (workflowStep === "customer") {
    return customerView;
  }

  if (workflowStep === "payment") {
    return paymentView;
  }

  return buildView;
}
