"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  BarChart3,
  Boxes,
  CalendarDays,
  Download,
  Package,
  ReceiptText,
  ShoppingBag,
  Truck,
  Users2,
  WalletCards
} from "lucide-react";
import { usePosApp } from "@/components/providers/app-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getLedgerControlTotals, summarizeLedgerByAccount } from "@/lib/accounting";
import { calculateShiftSummary, getBusinessDateInTimezone } from "@/lib/cash-control";
import { calculateBillItemProfit, calculateSalesReportSummaryRange } from "@/lib/refunds";
import {
  buildProfitLossFileName,
  createStructuredReportPdfBlob,
  downloadBlob,
  type StructuredReportSection
} from "@/lib/report-export";
import { cn, formatBusinessDate, formatCurrency, formatDateTime } from "@/lib/utils";
import type {
  Locale,
  Refund,
  Supplier
} from "@/types/pos";

type RangePreset = "today" | "yesterday" | "week" | "month" | "year" | "custom";
type ReportView =
  | "overview"
  | "sales"
  | "profit"
  | "employee"
  | "dayShift"
  | "inventory"
  | "suppliers"
  | "expenses"
  | "refunds"
  | "tax";

type MoneyRow = {
  detail?: string;
  label: string;
  value: string;
};

const MAX_ROWS = 12;

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function parseBusinessDate(dateString: string) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatBusinessDateValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function shiftBusinessDate(dateString: string, days: number) {
  const nextDate = parseBusinessDate(dateString);
  nextDate.setUTCDate(nextDate.getUTCDate() + days);
  return formatBusinessDateValue(nextDate);
}

function getStartOfWeek(dateString: string) {
  const nextDate = parseBusinessDate(dateString);
  const dayOfWeek = nextDate.getUTCDay();
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  nextDate.setUTCDate(nextDate.getUTCDate() + diff);
  return formatBusinessDateValue(nextDate);
}

function getStartOfMonth(dateString: string) {
  const nextDate = parseBusinessDate(dateString);
  nextDate.setUTCDate(1);
  return formatBusinessDateValue(nextDate);
}

function getStartOfYear(dateString: string) {
  const nextDate = parseBusinessDate(dateString);
  nextDate.setUTCMonth(0, 1);
  return formatBusinessDateValue(nextDate);
}

function getRangeFromPreset(preset: Exclude<RangePreset, "custom">, todayBusinessDate: string) {
  switch (preset) {
    case "today":
      return { dateFrom: todayBusinessDate, dateTo: todayBusinessDate };
    case "yesterday": {
      const previousDay = shiftBusinessDate(todayBusinessDate, -1);
      return { dateFrom: previousDay, dateTo: previousDay };
    }
    case "week":
      return { dateFrom: getStartOfWeek(todayBusinessDate), dateTo: todayBusinessDate };
    case "month":
      return { dateFrom: getStartOfMonth(todayBusinessDate), dateTo: todayBusinessDate };
    case "year":
      return { dateFrom: getStartOfYear(todayBusinessDate), dateTo: todayBusinessDate };
  }

  return { dateFrom: todayBusinessDate, dateTo: todayBusinessDate };
}

function getEntryBusinessDate(isoDate: string, timeZone: string, explicitBusinessDate?: string) {
  return explicitBusinessDate ?? getBusinessDateInTimezone(timeZone, new Date(isoDate));
}

function isTaxAuthorityPaymentText(value: string) {
  return /\b(vat|tax|zakat|authority|government)\b/i.test(value);
}

function localizedName(name: { en?: string; ar?: string; ur?: string } | undefined, locale: Locale) {
  if (!name) {
    return "Item";
  }

  return name[locale] || name.en || name.ar || name.ur || "Item";
}

function compactRows<T>(rows: T[], maxRows = MAX_ROWS) {
  return rows.slice(0, maxRows);
}

function toFileSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "shop";
}

function isInRange(value: string, from: string, to: string) {
  return value >= from && value <= to;
}

function SummaryRow({ label, value, detail }: MoneyRow) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm font-medium text-slate-600">{label}</p>
        <p className="text-right text-sm font-semibold text-slate-950">{value}</p>
      </div>
      {detail ? <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p> : null}
    </div>
  );
}

function MetricCard({
  accent = "default",
  label,
  value
}: {
  accent?: "default" | "green" | "yellow" | "blue";
  label: string;
  value: string | number;
}) {
  return (
    <Card
      className={cn(
        "min-h-[112px] p-5",
        accent === "green" && "border-emerald-200 bg-emerald-50/70",
        accent === "yellow" && "border-amber-200 bg-amber-50/80",
        accent === "blue" && "border-sky-200 bg-sky-50/80"
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-4 font-display text-3xl font-semibold tracking-[-0.04em] text-slate-950">{value}</p>
    </Card>
  );
}

function ReportPanel({
  children,
  icon,
  title,
  right
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  right?: React.ReactNode;
  title: string;
}) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white">
            {icon}
          </div>
          <h2 className="font-display text-2xl font-semibold tracking-[-0.04em] text-slate-950">{title}</h2>
        </div>
        {right}
      </div>
      <div className="p-5">{children}</div>
    </Card>
  );
}

function EmptyReport({ label }: { label: string }) {
  return (
    <div className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50/80 p-8 text-center text-sm text-slate-500">
      {label}
    </div>
  );
}

export function ReportsOverview() {
  const searchParams = useSearchParams();
  const { currentSettings, currentShop, locale, state, t } = usePosApp();
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [rangePreset, setRangePreset] = useState<RangePreset>("today");

  const timeZone = currentShop?.timezone ?? "Asia/Riyadh";
  const currency = currentShop?.currency ?? "SAR";
  const todayBusinessDate = getBusinessDateInTimezone(timeZone, new Date());
  const [customFrom, setCustomFrom] = useState(todayBusinessDate);
  const [customTo, setCustomTo] = useState(todayBusinessDate);
  const requestedView = searchParams.get("view");
  const activeView: ReportView =
    requestedView === "sales" ||
    requestedView === "profit" ||
    requestedView === "employee" ||
    requestedView === "dayShift" ||
    requestedView === "inventory" ||
    requestedView === "suppliers" ||
    requestedView === "expenses" ||
    requestedView === "refunds" ||
    requestedView === "tax"
      ? requestedView
      : "overview";

  const selectedRange = useMemo(() => {
    if (rangePreset !== "custom") {
      return getRangeFromPreset(rangePreset, todayBusinessDate);
    }

    const normalizedFrom = customFrom || todayBusinessDate;
    const normalizedTo = customTo || normalizedFrom;

    if (normalizedFrom <= normalizedTo) {
      return { dateFrom: normalizedFrom, dateTo: normalizedTo };
    }

    return { dateFrom: normalizedTo, dateTo: normalizedFrom };
  }, [customFrom, customTo, rangePreset, todayBusinessDate]);

  const selectedRangeLabel = useMemo(() => {
    if (selectedRange.dateFrom === selectedRange.dateTo) {
      return formatBusinessDate(selectedRange.dateFrom, locale);
    }

    return `${formatBusinessDate(selectedRange.dateFrom, locale)} - ${formatBusinessDate(selectedRange.dateTo, locale)}`;
  }, [locale, selectedRange.dateFrom, selectedRange.dateTo]);

  const periodBills = useMemo(
    () =>
      state.bills
        .filter((bill) => {
          if (!currentShop || bill.shopId !== currentShop.id || bill.status === "cancelled") {
            return false;
          }

          const businessDate = getEntryBusinessDate(bill.createdAt, timeZone, bill.businessDate);
          return isInRange(businessDate, selectedRange.dateFrom, selectedRange.dateTo);
        })
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()),
    [currentShop, selectedRange.dateFrom, selectedRange.dateTo, state.bills, timeZone]
  );

  const billById = useMemo(() => new Map(state.bills.map((bill) => [bill.id, bill])), [state.bills]);
  const periodBillIds = useMemo(() => new Set(periodBills.map((bill) => bill.id)), [periodBills]);

  const periodBillItems = useMemo(
    () => state.billItems.filter((item) => periodBillIds.has(item.billId)),
    [periodBillIds, state.billItems]
  );

  const periodRefunds = useMemo(
    () =>
      state.refunds
        .filter((refund) => {
          if (!currentShop || refund.shopId !== currentShop.id) {
            return false;
          }

          const businessDate = getEntryBusinessDate(refund.returnDate, timeZone, refund.businessDate);
          return isInRange(businessDate, selectedRange.dateFrom, selectedRange.dateTo);
        })
        .sort((left, right) => new Date(right.returnDate).getTime() - new Date(left.returnDate).getTime()),
    [currentShop, selectedRange.dateFrom, selectedRange.dateTo, state.refunds, timeZone]
  );

  const periodRefundIds = useMemo(() => new Set(periodRefunds.map((refund) => refund.id)), [periodRefunds]);
  const periodRefundItems = useMemo(
    () => state.refundItems.filter((item) => periodRefundIds.has(item.refundId)),
    [periodRefundIds, state.refundItems]
  );

  const periodExpenses = useMemo(
    () =>
      state.expenses
        .filter(
          (expense) =>
            expense.shopId === currentShop?.id &&
            isInRange(expense.businessDate, selectedRange.dateFrom, selectedRange.dateTo)
        )
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()),
    [currentShop?.id, selectedRange.dateFrom, selectedRange.dateTo, state.expenses]
  );

  const periodMovements = useMemo(
    () =>
      state.cashMovements
        .filter(
          (movement) =>
            movement.shopId === currentShop?.id &&
            isInRange(movement.businessDate, selectedRange.dateFrom, selectedRange.dateTo)
        )
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()),
    [currentShop?.id, selectedRange.dateFrom, selectedRange.dateTo, state.cashMovements]
  );

  const periodShifts = useMemo(
    () =>
      state.shifts
        .filter(
          (shift) =>
            shift.shopId === currentShop?.id &&
            isInRange(shift.businessDate, selectedRange.dateFrom, selectedRange.dateTo)
        )
        .sort((left, right) => new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime()),
    [currentShop?.id, selectedRange.dateFrom, selectedRange.dateTo, state.shifts]
  );

  const periodDayCloses = useMemo(
    () =>
      state.dayCloses
        .filter(
          (dayClose) =>
            dayClose.shopId === currentShop?.id &&
            isInRange(dayClose.businessDate, selectedRange.dateFrom, selectedRange.dateTo)
        )
        .sort((left, right) => new Date(right.closedAt).getTime() - new Date(left.closedAt).getTime()),
    [currentShop?.id, selectedRange.dateFrom, selectedRange.dateTo, state.dayCloses]
  );

  const financialSummary = useMemo(() => {
    if (!currentShop) {
      return null;
    }

    return calculateSalesReportSummaryRange({
      dateFrom: selectedRange.dateFrom,
      dateTo: selectedRange.dateTo,
      shopId: currentShop.id,
      timeZone,
      bills: state.bills,
      billItems: state.billItems,
      expenses: state.expenses,
      refunds: state.refunds
    });
  }, [currentShop, selectedRange.dateFrom, selectedRange.dateTo, state.billItems, state.bills, state.expenses, state.refunds, timeZone]);

  const productById = useMemo(() => new Map(state.products.map((product) => [product.id, product])), [state.products]);
  const categoryById = useMemo(() => new Map(state.categories.map((category) => [category.id, category])), [state.categories]);
  const supplierById = useMemo(() => new Map(state.suppliers.map((supplier) => [supplier.id, supplier])), [state.suppliers]);

  const expenseReportSummary = useMemo(
    () => ({
      bankExpenses: periodExpenses.filter((expense) => expense.paymentMethod === "bank").reduce((sum, expense) => sum + expense.amount, 0),
      cardExpenses: periodExpenses.filter((expense) => expense.paymentMethod === "card").reduce((sum, expense) => sum + expense.amount, 0),
      cashExpenses: periodExpenses.filter((expense) => expense.paymentMethod === "cash").reduce((sum, expense) => sum + expense.amount, 0),
      cashIn: periodMovements.filter((movement) => movement.type === "cash_in").reduce((sum, movement) => sum + movement.amount, 0),
      cashOut: periodMovements.filter((movement) => movement.type === "cash_out").reduce((sum, movement) => sum + movement.amount, 0),
      totalExpenses: periodExpenses.reduce((sum, expense) => sum + expense.amount, 0)
    }),
    [periodExpenses, periodMovements]
  );

  const salesByItem = useMemo(() => {
    const rows = new Map<string, { discount: number; gross: number; name: string; profit: number; quantity: number; refunds: number; net: number }>();

    periodBillItems.forEach((item) => {
      const entry = rows.get(item.productId) ?? {
        name: localizedName(item.productName, locale),
        quantity: 0,
        gross: 0,
        discount: 0,
        refunds: 0,
        profit: 0,
        net: 0
      };

      entry.quantity += item.quantity;
      entry.gross += item.grossLineTotal;
      entry.discount += item.discountAmount;
      entry.net += item.lineTotal;
      entry.profit += calculateBillItemProfit(item);
      rows.set(item.productId, entry);
    });

    periodRefundItems.forEach((item) => {
      const entry = rows.get(item.productId) ?? {
        name: localizedName(item.productName, locale),
        quantity: 0,
        gross: 0,
        discount: 0,
        refunds: 0,
        profit: 0,
        net: 0
      };

      entry.refunds += Math.abs(item.refundAmount);
      entry.net -= Math.abs(item.refundAmount);
      entry.profit -= Math.abs(item.profitAdjustment);
      rows.set(item.productId, entry);
    });

    return Array.from(rows.entries())
      .map(([productId, row]) => ({ productId, ...row }))
      .sort((left, right) => right.net - left.net);
  }, [locale, periodBillItems, periodRefundItems]);

  const salesByCategory = useMemo(() => {
    const rows = new Map<string, { gross: number; name: string; quantity: number; refunds: number; net: number }>();

    salesByItem.forEach((item) => {
      const product = productById.get(item.productId);
      const category = product?.categoryId ? categoryById.get(product.categoryId) : undefined;
      const key = category?.id ?? "uncategorized";
      const entry = rows.get(key) ?? {
        name: category?.name ?? "No category",
        quantity: 0,
        gross: 0,
        refunds: 0,
        net: 0
      };

      entry.quantity += item.quantity;
      entry.gross += item.gross;
      entry.refunds += item.refunds;
      entry.net += item.net;
      rows.set(key, entry);
    });

    return Array.from(rows.values()).sort((left, right) => right.net - left.net);
  }, [categoryById, productById, salesByItem]);

  const salesByCustomer = useMemo(() => {
    const rows = new Map<string, { billCount: number; gross: number; name: string; refunds: number; net: number; phone?: string }>();

    periodBills.forEach((bill) => {
      const key = bill.customerId ?? bill.customerPhone ?? "walk-in";
      const entry = rows.get(key) ?? {
        name: bill.customerName || "Walk-in Customer",
        phone: bill.customerPhone,
        billCount: 0,
        gross: 0,
        refunds: 0,
        net: 0
      };

      entry.billCount += 1;
      entry.gross += bill.total;
      entry.net += bill.total;
      rows.set(key, entry);
    });

    periodRefunds.forEach((refund) => {
      const bill = billById.get(refund.originalBillId);
      const key = bill?.customerId ?? bill?.customerPhone ?? "walk-in";
      const entry = rows.get(key) ?? {
        name: bill?.customerName || "Walk-in Customer",
        phone: bill?.customerPhone,
        billCount: 0,
        gross: 0,
        refunds: 0,
        net: 0
      };

      entry.refunds += Math.abs(refund.amount);
      entry.net -= Math.abs(refund.amount);
      rows.set(key, entry);
    });

    return Array.from(rows.values()).sort((left, right) => right.net - left.net);
  }, [billById, periodBills, periodRefunds]);

  const employeePerformance = useMemo(() => {
    const rows = new Map<string, { billCount: number; gross: number; name: string; productMap: Map<string, number>; refunds: number; net: number }>();

    periodBills.forEach((bill) => {
      const user = state.users.find((candidate) => candidate.id === bill.cashierId);
      const entry = rows.get(bill.cashierId) ?? {
        name: user?.name ?? "Unknown employee",
        billCount: 0,
        gross: 0,
        refunds: 0,
        net: 0,
        productMap: new Map<string, number>()
      };

      entry.billCount += 1;
      entry.gross += bill.total;
      entry.net += bill.total;
      periodBillItems
        .filter((item) => item.billId === bill.id)
        .forEach((item) => {
          const name = localizedName(item.productName, locale);
          entry.productMap.set(name, (entry.productMap.get(name) ?? 0) + item.quantity);
        });
      rows.set(bill.cashierId, entry);
    });

    periodRefunds.forEach((refund) => {
      const entry = rows.get(refund.createdBy) ?? {
        name: state.users.find((candidate) => candidate.id === refund.createdBy)?.name ?? "Unknown employee",
        billCount: 0,
        gross: 0,
        refunds: 0,
        net: 0,
        productMap: new Map<string, number>()
      };

      entry.refunds += Math.abs(refund.amount);
      entry.net -= Math.abs(refund.amount);
      rows.set(refund.createdBy, entry);
    });

    return Array.from(rows.entries())
      .map(([userId, row]) => ({
        userId,
        ...row,
        products: Array.from(row.productMap.entries())
          .sort((left, right) => right[1] - left[1])
          .slice(0, 5)
          .map(([name, quantity]) => `${name} x ${quantity}`)
          .join(", ")
      }))
      .sort((left, right) => right.net - left.net);
  }, [locale, periodBillItems, periodBills, periodRefunds, state.users]);

  const inventoryProducts = useMemo(
    () =>
      state.products
        .filter((product) => product.shopId === currentShop?.id && product.kind === "product")
        .sort((left, right) => localizedName(left.name, locale).localeCompare(localizedName(right.name, locale))),
    [currentShop?.id, locale, state.products]
  );

  const inventorySummary = useMemo(
    () => ({
      itemCount: inventoryProducts.length,
      unitsOnHand: inventoryProducts.reduce((sum, product) => sum + product.stockQuantity, 0),
      costValue: inventoryProducts.reduce((sum, product) => sum + product.stockQuantity * product.costPrice, 0),
      salesValue: inventoryProducts.reduce((sum, product) => sum + product.stockQuantity * product.salePrice, 0),
      lowStockCount: inventoryProducts.filter((product) => product.stockQuantity <= product.reorderLevel).length
    }),
    [inventoryProducts]
  );

  const lowStockProducts = useMemo(
    () => inventoryProducts.filter((product) => product.stockQuantity <= product.reorderLevel),
    [inventoryProducts]
  );

  const inventoryByCategory = useMemo(() => {
    const rows = new Map<string, { cost: number; name: string; products: number; units: number; value: number }>();

    inventoryProducts.forEach((product) => {
      const category = product.categoryId ? categoryById.get(product.categoryId) : undefined;
      const key = category?.id ?? "uncategorized";
      const entry = rows.get(key) ?? {
        name: category?.name ?? "No category",
        products: 0,
        units: 0,
        cost: 0,
        value: 0
      };

      entry.products += 1;
      entry.units += product.stockQuantity;
      entry.cost += product.stockQuantity * product.costPrice;
      entry.value += product.stockQuantity * product.salePrice;
      rows.set(key, entry);
    });

    return Array.from(rows.values()).sort((left, right) => right.cost - left.cost);
  }, [categoryById, inventoryProducts]);

  const purchaseOrdersInRange = useMemo(
    () =>
      state.purchaseOrders.filter((order) => {
        if (order.shopId !== currentShop?.id) {
          return false;
        }

        const businessDate = getEntryBusinessDate(order.createdAt, timeZone);
        return isInRange(businessDate, selectedRange.dateFrom, selectedRange.dateTo);
      }),
    [currentShop?.id, selectedRange.dateFrom, selectedRange.dateTo, state.purchaseOrders, timeZone]
  );

  const supplierSummary = useMemo(() => {
    const rows = new Map<
      string,
      {
        balance: number;
        name: string;
        orderCount: number;
        ordered: number;
        paid: number;
        receivedQuantity: number;
      }
    >();

    const ensure = (supplier?: Supplier, fallbackName = "General supplier") => {
      const key = supplier?.id ?? fallbackName;
      const entry = rows.get(key) ?? {
        name: supplier?.name ?? fallbackName,
        balance: supplier?.accountBalance ?? 0,
        orderCount: 0,
        ordered: 0,
        paid: 0,
        receivedQuantity: 0
      };
      rows.set(key, entry);
      return entry;
    };

    state.suppliers
      .filter((supplier) => supplier.shopId === currentShop?.id)
      .forEach((supplier) => ensure(supplier));

    purchaseOrdersInRange.forEach((order) => {
      const supplier = order.supplierId ? supplierById.get(order.supplierId) : undefined;
      const entry = ensure(supplier, order.supplierName || "General supplier");

      entry.orderCount += 1;
      entry.ordered += order.totalAmount ?? 0;
      entry.paid += order.paidAmount ?? 0;
    });

    state.purchaseOrderItems.forEach((item) => {
      const order = purchaseOrdersInRange.find((candidate) => candidate.id === item.purchaseOrderId);
      if (!order) {
        return;
      }

      const supplier = order.supplierId ? supplierById.get(order.supplierId) : undefined;
      const entry = ensure(supplier, order.supplierName || "General supplier");
      entry.receivedQuantity += item.receivedQuantity ?? 0;
    });

    return Array.from(rows.values()).sort((left, right) => right.ordered - left.ordered);
  }, [currentShop?.id, purchaseOrdersInRange, state.purchaseOrderItems, state.suppliers, supplierById]);

  const refundsByItem = useMemo(() => {
    const rows = new Map<string, { amount: number; category: string; name: string; profit: number; quantity: number }>();

    periodRefundItems.forEach((item) => {
      const product = productById.get(item.productId);
      const category = product?.categoryId ? categoryById.get(product.categoryId) : undefined;
      const entry = rows.get(item.productId) ?? {
        name: localizedName(item.productName, locale),
        category: category?.name ?? "No category",
        amount: 0,
        profit: 0,
        quantity: 0
      };

      entry.quantity += item.quantity;
      entry.amount += Math.abs(item.refundAmount);
      entry.profit += Math.abs(item.profitAdjustment);
      rows.set(item.productId, entry);
    });

    return Array.from(rows.values()).sort((left, right) => right.amount - left.amount);
  }, [categoryById, locale, periodRefundItems, productById]);

  const refundsByCategory = useMemo(() => {
    const rows = new Map<string, { amount: number; items: number; name: string; profit: number; quantity: number }>();

    refundsByItem.forEach((item) => {
      const entry = rows.get(item.category) ?? {
        name: item.category,
        items: 0,
        quantity: 0,
        amount: 0,
        profit: 0
      };

      entry.items += 1;
      entry.quantity += item.quantity;
      entry.amount += item.amount;
      entry.profit += item.profit;
      rows.set(item.category, entry);
    });

    return Array.from(rows.values()).sort((left, right) => right.amount - left.amount);
  }, [refundsByItem]);

  const dayReportRows = useMemo(() => {
    const rows = new Map<string, { bills: number; expenses: number; refunds: number; sales: number; shifts: number }>();
    const ensure = (businessDate: string) => {
      const entry = rows.get(businessDate) ?? {
        bills: 0,
        sales: 0,
        refunds: 0,
        expenses: 0,
        shifts: 0
      };
      rows.set(businessDate, entry);
      return entry;
    };

    periodBills.forEach((bill) => {
      const entry = ensure(getEntryBusinessDate(bill.createdAt, timeZone, bill.businessDate));
      entry.bills += 1;
      entry.sales += bill.total;
    });
    periodRefunds.forEach((refund) => {
      ensure(getEntryBusinessDate(refund.returnDate, timeZone, refund.businessDate)).refunds += Math.abs(refund.amount);
    });
    periodExpenses.forEach((expense) => {
      ensure(expense.businessDate).expenses += expense.amount;
    });
    periodShifts.forEach((shift) => {
      ensure(shift.businessDate).shifts += 1;
    });

    return Array.from(rows.entries())
      .map(([businessDate, row]) => ({
        businessDate,
        ...row,
        net: row.sales - row.refunds - row.expenses
      }))
      .sort((left, right) => right.businessDate.localeCompare(left.businessDate));
  }, [periodBills, periodExpenses, periodRefunds, periodShifts, timeZone]);

  const shiftReportRows = useMemo(
    () =>
      periodShifts.map((shift) => {
        const summary = calculateShiftSummary({
          shift,
          bills: state.bills,
          cashMovements: state.cashMovements,
          refunds: state.refunds
        });
        const cashier = state.users.find((user) => user.id === shift.cashierId);

        return {
          shift,
          cashierName: cashier?.name ?? "Unknown cashier",
          summary
        };
      }),
    [periodShifts, state.bills, state.cashMovements, state.refunds, state.users]
  );

  const taxSummary = useMemo(() => {
    const refundTaxAmount = (refund: Refund) => {
      const originalBill = billById.get(refund.originalBillId);

      if (!originalBill || originalBill.total <= 0 || originalBill.taxAmount <= 0) {
        return 0;
      }

      return roundMoney(Math.abs(originalBill.taxAmount * (refund.amount / originalBill.total)));
    };
    const invoiceTax = roundMoney(periodBills.reduce((sum, bill) => sum + bill.taxAmount, 0));
    const refundTax = roundMoney(periodRefunds.reduce((sum, refund) => sum + refundTaxAmount(refund), 0));
    const customerPaidTax = roundMoney(
      periodBills.reduce((sum, bill) => {
        if (bill.total <= 0 || bill.taxAmount <= 0) {
          return sum;
        }

        return sum + bill.taxAmount * (Math.min(Math.max(bill.paidAmount, 0), bill.total) / bill.total);
      }, 0)
    );
    const netPayableTax = roundMoney(invoiceTax - refundTax);
    const cashTax = roundMoney(periodBills.filter((bill) => bill.paymentMethod === "cash").reduce((sum, bill) => sum + bill.taxAmount, 0));
    const cardTax = roundMoney(periodBills.filter((bill) => bill.paymentMethod === "card").reduce((sum, bill) => sum + bill.taxAmount, 0));
    const accountTax = roundMoney(periodBills.filter((bill) => bill.paymentMethod === "account").reduce((sum, bill) => sum + bill.taxAmount, 0));
    const cashRefundTax = roundMoney(periodRefunds.filter((refund) => refund.paymentMethod === "cash").reduce((sum, refund) => sum + refundTaxAmount(refund), 0));
    const cardRefundTax = roundMoney(periodRefunds.filter((refund) => refund.paymentMethod === "card").reduce((sum, refund) => sum + refundTaxAmount(refund), 0));
    const accountRefundTax = roundMoney(periodRefunds.filter((refund) => refund.paymentMethod === "account").reduce((sum, refund) => sum + refundTaxAmount(refund), 0));
    const taxCashOutPayments = roundMoney(
      periodMovements
        .filter((movement) => movement.type === "cash_out" && isTaxAuthorityPaymentText(movement.reason))
        .reduce((sum, movement) => sum + movement.amount, 0)
    );
    const authorityPaidTax = roundMoney(Math.min(netPayableTax, taxCashOutPayments));

    return {
      invoiceTax,
      refundTax,
      netPayableTax,
      customerPaidTax,
      customerDueTax: roundMoney(Math.max(0, netPayableTax - customerPaidTax)),
      authorityPaidTax,
      remainingPayableTax: roundMoney(netPayableTax - authorityPaidTax),
      cashTax,
      cardTax,
      accountTax,
      cashRefundTax,
      cardRefundTax,
      accountRefundTax
    };
  }, [billById, periodBills, periodMovements, periodRefunds]);

  const filteredLedgerEntries = useMemo(
    () =>
      state.ledgerEntries
        .filter(
          (entry) =>
            entry.shopId === currentShop?.id &&
            isInRange(entry.businessDate, selectedRange.dateFrom, selectedRange.dateTo)
        )
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()),
    [currentShop?.id, selectedRange.dateFrom, selectedRange.dateTo, state.ledgerEntries]
  );
  const ledgerControlTotals = useMemo(() => getLedgerControlTotals(filteredLedgerEntries), [filteredLedgerEntries]);
  const ledgerAccountRows = useMemo(() => summarizeLedgerByAccount(filteredLedgerEntries), [filteredLedgerEntries]);

  const profitTaxView = useMemo(
    () => ({
      grossSalesExcludingTax: roundMoney((financialSummary?.grossSales ?? 0) - taxSummary.invoiceTax),
      netSalesExcludingTax: roundMoney((financialSummary?.netSales ?? 0) - taxSummary.netPayableTax),
      profitBeforeVatPayable: roundMoney(financialSummary?.netProfit ?? 0),
      profitAfterVatPayable: roundMoney((financialSummary?.netProfit ?? 0) - taxSummary.remainingPayableTax)
    }),
    [financialSummary, taxSummary]
  );

  const hasRangeData =
    periodBills.length > 0 || periodRefunds.length > 0 || periodExpenses.length > 0 || periodMovements.length > 0;

  const reportTabs: Array<{
    href: string;
    icon: React.ReactNode;
    label: string;
    view: ReportView;
  }> = [
    { href: "/reports", icon: <BarChart3 className="h-4 w-4" />, label: "Overview", view: "overview" },
    { href: "/reports?view=sales", icon: <ShoppingBag className="h-4 w-4" />, label: "Sales", view: "sales" },
    { href: "/reports?view=profit", icon: <WalletCards className="h-4 w-4" />, label: "Profit / Loss", view: "profit" },
    { href: "/reports?view=employee", icon: <Users2 className="h-4 w-4" />, label: "Employees", view: "employee" },
    { href: "/reports?view=dayShift", icon: <CalendarDays className="h-4 w-4" />, label: "Day / Shift", view: "dayShift" },
    { href: "/reports?view=inventory", icon: <Boxes className="h-4 w-4" />, label: "Inventory", view: "inventory" },
    { href: "/reports?view=suppliers", icon: <Truck className="h-4 w-4" />, label: "Suppliers", view: "suppliers" },
    { href: "/reports?view=expenses", icon: <WalletCards className="h-4 w-4" />, label: "Expenses / Drawer", view: "expenses" },
    { href: "/reports?view=refunds", icon: <ReceiptText className="h-4 w-4" />, label: "Refunds", view: "refunds" },
    { href: "/reports?view=tax", icon: <ReceiptText className="h-4 w-4" />, label: "Tax", view: "tax" }
  ];

  const reportTitles: Record<ReportView, string> = {
    overview: "Management Overview Report",
    sales: "Sales Report",
    profit: "Profit & Loss Report",
    employee: "Sales by Employee Report",
    dayShift: "Day and Shift Report",
    inventory: "Inventory Report",
    suppliers: "Supplier Purchase Report",
    expenses: "Expenses and Drawer Report",
    refunds: "Refund Report",
    tax: "Tax Payable Report"
  };

  const summaryRows = (rows: MoneyRow[]): StructuredReportSection => ({
    title: "Executive summary",
    rows
  });

  const buildReportSections = (view: ReportView): StructuredReportSection[] => {
    const money = (value: number) => formatCurrency(value, currency, "en");
    const salesSummary: MoneyRow[] = [
      { label: "Gross sales", value: money(financialSummary?.grossSales ?? 0) },
      { label: "Refunds", value: money(-(financialSummary?.refunds ?? 0)) },
      { label: "Net sales", value: money(financialSummary?.netSales ?? 0) },
      { label: "Gross profit", value: money(financialSummary?.grossProfit ?? 0) },
      { label: "Expenses", value: money(-(financialSummary?.expenses ?? 0)) },
      { label: "Net profit", value: money(financialSummary?.netProfit ?? 0) }
    ];

    const salesSections: StructuredReportSection[] = [
      summaryRows(salesSummary),
      {
        title: "Sales by item",
        rows:
          salesByItem.length > 0
            ? compactRows(salesByItem, 40).map((row) => ({
                label: row.name,
                value: money(row.net),
                detail: `${row.quantity} sold | refunds ${money(-row.refunds)} | profit ${money(row.profit)}`
              }))
            : [{ label: "No item sales", value: "-" }]
      },
      {
        title: "Sales by category",
        rows:
          salesByCategory.length > 0
            ? compactRows(salesByCategory, 30).map((row) => ({
                label: row.name,
                value: money(row.net),
                detail: `${row.quantity} items | refunds ${money(-row.refunds)}`
              }))
            : [{ label: "No category sales", value: "-" }]
      },
      {
        title: "Sales by customer",
        rows:
          salesByCustomer.length > 0
            ? compactRows(salesByCustomer, 30).map((row) => ({
                label: row.name,
                value: money(row.net),
                detail: `${row.billCount} bills${row.phone ? ` | ${row.phone}` : ""}`
              }))
            : [{ label: "No customer sales", value: "-" }]
      }
    ];

    if (view === "sales") {
      return salesSections;
    }

    if (view === "profit") {
      return [
        summaryRows([
          ...salesSummary,
          { label: "Gross sales excluding VAT", value: money(profitTaxView.grossSalesExcludingTax) },
          { label: "Net sales excluding VAT", value: money(profitTaxView.netSalesExcludingTax) },
          { label: "Net profit after remaining VAT payable", value: money(profitTaxView.profitAfterVatPayable) }
        ]),
        {
          title: "VAT and profit view",
          rows: [
            { label: "Invoice VAT", value: money(taxSummary.invoiceTax) },
            { label: "VAT reversed from refunds", value: money(-taxSummary.refundTax) },
            { label: "Remaining VAT payable", value: money(taxSummary.remainingPayableTax) },
            { label: "Profit before VAT payable", value: money(profitTaxView.profitBeforeVatPayable) },
            { label: "Profit after VAT payable", value: money(profitTaxView.profitAfterVatPayable) }
          ]
        },
        {
          title: "Ledger control",
          rows: [
            { label: "Total debits", value: money(ledgerControlTotals.debit) },
            { label: "Total credits", value: money(ledgerControlTotals.credit) },
            { label: "Difference", value: money(ledgerControlTotals.difference) },
            { label: "Ledger rows", value: String(filteredLedgerEntries.length) }
          ]
        },
        {
          title: "Ledger by account",
          rows:
            ledgerAccountRows.length > 0
              ? compactRows(ledgerAccountRows, 30).map((entry) => ({
                  label: `${entry.accountCode} ${entry.accountName}`,
                  value: `Dr ${money(entry.debit)} | Cr ${money(entry.credit)}`,
                  detail: `Net ${money(entry.net)}`
                }))
              : [{ label: "No ledger rows", value: "-" }]
        }
      ];
    }

    if (view === "employee") {
      return [
        summaryRows([
          { label: "Employees with sales", value: String(employeePerformance.length) },
          { label: "Total bills", value: String(periodBills.length) },
          { label: "Net sales", value: money(financialSummary?.netSales ?? 0) }
        ]),
        {
          title: "Employee performance",
          rows:
            employeePerformance.length > 0
              ? employeePerformance.map((row) => ({
                  label: `${row.name} (${row.billCount} bills)`,
                  value: money(row.net),
                  detail: `Gross ${money(row.gross)} | Refunds ${money(-row.refunds)} | Products ${row.products || "-"}`
                }))
              : [{ label: "No employee sales", value: "-" }]
        }
      ];
    }

    if (view === "dayShift") {
      return [
        {
          title: "Day report",
          rows:
            dayReportRows.length > 0
              ? dayReportRows.map((row) => ({
                  label: formatBusinessDate(row.businessDate, "en"),
                  value: money(row.net),
                  detail: `${row.bills} bills | sales ${money(row.sales)} | refunds ${money(-row.refunds)} | shifts ${row.shifts}`
                }))
              : [{ label: "No day data", value: "-" }]
        },
        {
          title: "Shift report",
          rows:
            shiftReportRows.length > 0
              ? compactRows(shiftReportRows, 40).map((row) => ({
                  label: `${row.cashierName} | ${formatDateTime(row.shift.startedAt, "en")}`,
                  value: money(row.summary.expectedCash),
                  detail: `${row.shift.endedAt ? "Closed" : "Open"} | cash sales ${money(row.summary.cashSales)} | difference ${money(row.summary.difference ?? 0)}`
                }))
              : [{ label: "No shift data", value: "-" }]
        }
      ];
    }

    if (view === "inventory") {
      return [
        summaryRows([
          { label: "Stock products", value: String(inventorySummary.itemCount) },
          { label: "Units on hand", value: String(inventorySummary.unitsOnHand) },
          { label: "Cost value", value: money(inventorySummary.costValue) },
          { label: "Sales value", value: money(inventorySummary.salesValue) },
          { label: "Low stock items", value: String(inventorySummary.lowStockCount) }
        ]),
        {
          title: "Inventory by category",
          rows:
            inventoryByCategory.length > 0
              ? inventoryByCategory.map((row) => ({
                  label: row.name,
                  value: money(row.cost),
                  detail: `${row.products} products | ${row.units} units | sale value ${money(row.value)}`
                }))
              : [{ label: "No inventory", value: "-" }]
        },
        {
          title: "Low stock",
          rows:
            lowStockProducts.length > 0
              ? lowStockProducts.map((product) => ({
                  label: localizedName(product.name, "en"),
                  value: `${product.stockQuantity} / ${product.reorderLevel}`,
                  detail: `Cost ${money(product.costPrice)} | Sale ${money(product.salePrice)}`
                }))
              : [{ label: "Inventory healthy", value: "-" }]
        }
      ];
    }

    if (view === "suppliers") {
      return [
        summaryRows([
          { label: "Suppliers", value: String(supplierSummary.length) },
          { label: "Purchase orders", value: String(purchaseOrdersInRange.length) },
          { label: "Ordered amount", value: money(supplierSummary.reduce((sum, row) => sum + row.ordered, 0)) },
          { label: "Paid amount", value: money(supplierSummary.reduce((sum, row) => sum + row.paid, 0)) }
        ]),
        {
          title: "Supplier summary",
          rows:
            supplierSummary.length > 0
              ? supplierSummary.map((row) => ({
                  label: row.name,
                  value: money(row.ordered),
                  detail: `${row.orderCount} POs | paid ${money(row.paid)} | balance ${money(row.balance)} | received ${row.receivedQuantity}`
                }))
              : [{ label: "No supplier activity", value: "-" }]
        },
        {
          title: "Purchase orders",
          rows:
            purchaseOrdersInRange.length > 0
              ? compactRows(purchaseOrdersInRange, 40).map((order) => ({
                  label: `${order.number} | ${order.supplierName}`,
                  value: money(order.totalAmount ?? 0),
                  detail: `${order.status} | paid ${money(order.paidAmount ?? 0)} | ${formatDateTime(order.createdAt, "en")}`
                }))
              : [{ label: "No purchase orders", value: "-" }]
        }
      ];
    }

    if (view === "expenses") {
      return [
        summaryRows([
          { label: "Total expenses", value: money(expenseReportSummary.totalExpenses) },
          { label: "Cash expenses", value: money(expenseReportSummary.cashExpenses) },
          { label: "Card expenses", value: money(expenseReportSummary.cardExpenses) },
          { label: "Bank expenses", value: money(expenseReportSummary.bankExpenses) },
          { label: "Cash in", value: money(expenseReportSummary.cashIn) },
          { label: "Cash out", value: money(expenseReportSummary.cashOut) }
        ]),
        {
          title: "Expense log",
          rows:
            periodExpenses.length > 0
              ? compactRows(periodExpenses, 50).map((expense) => ({
                  label: `${expense.categoryName} | ${formatDateTime(expense.createdAt, "en")}`,
                  value: money(expense.amount),
                  detail: `${expense.paymentMethod.toUpperCase()}${expense.vendorName ? ` | ${expense.vendorName}` : ""}${expense.note ? ` | ${expense.note}` : ""}`
                }))
              : [{ label: "No expenses", value: "-" }]
        },
        {
          title: "Drawer adjustment log",
          rows:
            periodMovements.length > 0
              ? compactRows(periodMovements, 50).map((movement) => ({
                  label: `${movement.type === "cash_in" ? "Cash in" : "Cash out"} | ${formatDateTime(movement.createdAt, "en")}`,
                  value: money(movement.amount),
                  detail: movement.reason
                }))
              : [{ label: "No drawer adjustments", value: "-" }]
        }
      ];
    }

    if (view === "refunds") {
      return [
        summaryRows([
          { label: "Refund count", value: String(periodRefunds.length) },
          { label: "Refund amount", value: money(periodRefunds.reduce((sum, refund) => sum + refund.amount, 0)) },
          { label: "Profit adjustment", value: money(periodRefunds.reduce((sum, refund) => sum + refund.profitAdjustment, 0)) }
        ]),
        {
          title: "Refunds by category",
          rows:
            refundsByCategory.length > 0
              ? refundsByCategory.map((row) => ({
                  label: row.name,
                  value: money(row.amount),
                  detail: `${row.items} items | ${row.quantity} qty | profit adjustment ${money(row.profit)}`
                }))
              : [{ label: "No refund categories", value: "-" }]
        },
        {
          title: "Refunds by item",
          rows:
            refundsByItem.length > 0
              ? compactRows(refundsByItem, 50).map((row) => ({
                  label: row.name,
                  value: money(row.amount),
                  detail: `${row.category} | qty ${row.quantity} | profit adjustment ${money(row.profit)}`
                }))
              : [{ label: "No refunded items", value: "-" }]
        },
        {
          title: "Refund audit",
          rows:
            periodRefunds.length > 0
              ? compactRows(periodRefunds, 50).map((refund) => {
                  const bill = billById.get(refund.originalBillId);
                  return {
                    label: `${bill?.number ?? refund.originalBillId} | ${formatDateTime(refund.returnDate, "en")}`,
                    value: money(refund.amount),
                    detail: `${refund.reason} | original sale ${refund.originalSaleDate}`
                  };
                })
              : [{ label: "No refunds", value: "-" }]
        }
      ];
    }

    if (view === "tax") {
      return [
        summaryRows([
          { label: "Invoice VAT output", value: money(taxSummary.invoiceTax) },
          { label: "VAT reversed from refunds", value: money(-taxSummary.refundTax) },
          { label: "Net VAT payable", value: money(taxSummary.netPayableTax) },
          { label: "VAT collected from paid bills", value: money(taxSummary.customerPaidTax) },
          { label: "VAT paid to authority", value: money(taxSummary.authorityPaidTax) },
          { label: "Remaining VAT payable", value: money(taxSummary.remainingPayableTax) }
        ]),
        {
          title: "VAT by payment method",
          rows: [
            { label: "Cash VAT", value: money(taxSummary.cashTax) },
            { label: "Card VAT", value: money(taxSummary.cardTax) },
            { label: "Account VAT", value: money(taxSummary.accountTax) },
            { label: "Cash refund VAT", value: money(-taxSummary.cashRefundTax) },
            { label: "Card refund VAT", value: money(-taxSummary.cardRefundTax) },
            { label: "Account refund VAT", value: money(-taxSummary.accountRefundTax) }
          ]
        }
      ];
    }

    return [
      summaryRows(salesSummary),
      {
        title: "What changed in this period",
        rows: [
          { label: "Bills", value: String(periodBills.length) },
          { label: "Refunds", value: String(periodRefunds.length) },
          { label: "Expenses", value: String(periodExpenses.length) },
          { label: "Open/closed shifts", value: String(periodShifts.length) },
          { label: "Purchase orders", value: String(purchaseOrdersInRange.length) }
        ]
      }
    ];
  };

  const handleDownloadCurrentReport = async () => {
    if (!currentShop) {
      return;
    }

    setIsExporting(true);
    setExportFeedback(null);

    try {
      const pdfBlob = await createStructuredReportPdfBlob({
        generatedAt: formatDateTime(new Date().toISOString(), "en"),
        logoUrl: currentSettings?.pos.logoUrl,
        period: selectedRangeLabel,
        sections: buildReportSections(activeView),
        shopName: currentShop.name,
        subtitle: `${reportTitles[activeView]} for ${selectedRangeLabel}`,
        title: reportTitles[activeView]
      });
      const fileName =
        activeView === "profit"
          ? buildProfitLossFileName(currentShop.name, `${selectedRange.dateFrom}-to-${selectedRange.dateTo}`)
          : `${activeView}-report-${selectedRange.dateFrom}-to-${selectedRange.dateTo}-${toFileSlug(currentShop.name)}.pdf`;

      downloadBlob(pdfBlob, fileName);
      setExportFeedback(`${reportTitles[activeView]} downloaded.`);
    } finally {
      setIsExporting(false);
    }
  };

  const renderRangeControls = () => (
    <Card className="p-5">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-olive">Report period</p>
          <h2 className="mt-2 font-display text-2xl font-semibold tracking-[-0.04em] text-slate-950">{selectedRangeLabel}</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {([
            { key: "today", label: "Today" },
            { key: "yesterday", label: "Yesterday" },
            { key: "week", label: "This week" },
            { key: "month", label: "This month" },
            { key: "year", label: "This year" },
            { key: "custom", label: "Custom" }
          ] as const).map((preset) => (
            <button
              key={preset.key}
              className={cn(
                "h-10 rounded-full px-4 text-sm font-semibold transition",
                rangePreset === preset.key
                  ? "bg-slate-950 text-white shadow-[0_18px_32px_rgba(15,23,42,0.12)]"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              )}
              onClick={() => setRangePreset(preset.key)}
              type="button"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {rangePreset === "custom" ? (
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-950">From date</label>
            <Input type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-950">To date</label>
            <Input type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} />
          </div>
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button className="h-11 rounded-2xl bg-slate-950 text-white hover:bg-slate-900" disabled={isExporting} onClick={handleDownloadCurrentReport}>
          <Download className="mr-2 h-4 w-4" />
          {isExporting ? "Preparing PDF..." : `Download ${reportTitles[activeView]} PDF`}
        </Button>
        {exportFeedback ? <p className="text-sm font-medium text-emerald-700">{exportFeedback}</p> : null}
      </div>
    </Card>
  );

  const tableRows = (rows: MoneyRow[]) => (
    <div className="grid gap-3">
      {rows.length > 0 ? rows.map((row) => <SummaryRow key={`${row.label}-${row.value}`} {...row} />) : <EmptyReport label="No data for this period." />}
    </div>
  );

  return (
    <div className="space-y-6">
      <Card className="p-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
          {reportTabs.map((item) => (
            <a
              key={item.view}
              className={cn(
                "flex min-h-[70px] items-center gap-3 rounded-[24px] border px-4 py-3 text-sm font-semibold transition",
                activeView === item.view
                  ? "border-slate-950 bg-slate-950 text-white shadow-[0_20px_40px_rgba(15,23,42,0.16)]"
                  : "border-slate-200 bg-white text-slate-800 hover:-translate-y-0.5 hover:border-emerald-200 hover:bg-emerald-50"
              )}
              href={item.href}
            >
              <span
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl",
                  activeView === item.view ? "bg-white/12 text-white" : "bg-slate-100 text-slate-700"
                )}
              >
                {item.icon}
              </span>
              {item.label}
            </a>
          ))}
        </div>
      </Card>

      {renderRangeControls()}

      {activeView === "overview" ? (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard accent="green" label="Gross sales" value={formatCurrency(financialSummary?.grossSales ?? 0, currency, locale)} />
            <MetricCard label="Net sales" value={formatCurrency(financialSummary?.netSales ?? 0, currency, locale)} />
            <MetricCard accent="blue" label="Net profit" value={formatCurrency(financialSummary?.netProfit ?? 0, currency, locale)} />
            <MetricCard accent="yellow" label="VAT payable" value={formatCurrency(taxSummary.remainingPayableTax, currency, locale)} />
          </div>
          <div className="grid gap-6 xl:grid-cols-2">
            <ReportPanel icon={<ShoppingBag className="h-5 w-5" />} title="Sales pulse">
              {tableRows([
                { label: "Bills", value: String(periodBills.length) },
                { label: "Refunds", value: String(periodRefunds.length) },
                { label: "Top item", value: salesByItem[0]?.name ?? "-" },
                { label: "Top customer", value: salesByCustomer[0]?.name ?? "-" }
              ])}
            </ReportPanel>
            <ReportPanel icon={<Boxes className="h-5 w-5" />} title="Stock and supplier pulse">
              {tableRows([
                { label: "Stock products", value: String(inventorySummary.itemCount) },
                { label: "Inventory cost value", value: formatCurrency(inventorySummary.costValue, currency, locale) },
                { label: "Low stock", value: String(inventorySummary.lowStockCount) },
                { label: "Supplier orders", value: String(purchaseOrdersInRange.length) }
              ])}
            </ReportPanel>
          </div>
        </div>
      ) : null}

      {activeView === "sales" ? (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <MetricCard accent="green" label="Total sales" value={formatCurrency(financialSummary?.grossSales ?? 0, currency, locale)} />
            <MetricCard label="Net sales" value={formatCurrency(financialSummary?.netSales ?? 0, currency, locale)} />
            <MetricCard label="Bills" value={periodBills.length} />
            <MetricCard label="Items sold" value={periodBillItems.reduce((sum, item) => sum + item.quantity, 0)} />
            <MetricCard accent="yellow" label="Refunds" value={formatCurrency(periodRefunds.reduce((sum, refund) => sum + refund.amount, 0), currency, locale)} />
          </div>
          <div className="grid gap-6 xl:grid-cols-2">
            <ReportPanel icon={<Package className="h-5 w-5" />} title="Sales by item">
              {tableRows(compactRows(salesByItem).map((row) => ({
                label: row.name,
                value: formatCurrency(row.net, currency, locale),
                detail: `${row.quantity} sold | refunds ${formatCurrency(-row.refunds, currency, locale)} | profit ${formatCurrency(row.profit, currency, locale)}`
              })))}
            </ReportPanel>
            <ReportPanel icon={<BarChart3 className="h-5 w-5" />} title="Sales by category">
              {tableRows(compactRows(salesByCategory).map((row) => ({
                label: row.name,
                value: formatCurrency(row.net, currency, locale),
                detail: `${row.quantity} items | refunds ${formatCurrency(-row.refunds, currency, locale)}`
              })))}
            </ReportPanel>
            <ReportPanel icon={<Users2 className="h-5 w-5" />} title="Sales by customer">
              {tableRows(compactRows(salesByCustomer).map((row) => ({
                label: row.name,
                value: formatCurrency(row.net, currency, locale),
                detail: `${row.billCount} bills${row.phone ? ` | ${row.phone}` : ""}`
              })))}
            </ReportPanel>
            <ReportPanel icon={<WalletCards className="h-5 w-5" />} title="Payment split">
              {tableRows([
                { label: "Cash sales", value: formatCurrency(financialSummary?.cashSales ?? 0, currency, locale) },
                { label: "Card sales", value: formatCurrency(financialSummary?.cardSales ?? 0, currency, locale) },
                { label: "Account sales", value: formatCurrency(financialSummary?.accountSales ?? 0, currency, locale) },
                { label: "Cash refunds", value: formatCurrency(-(financialSummary?.cashRefunds ?? 0), currency, locale) },
                { label: "Card refunds", value: formatCurrency(-(financialSummary?.cardRefunds ?? 0), currency, locale) },
                { label: "Account refunds", value: formatCurrency(-(financialSummary?.accountRefunds ?? 0), currency, locale) }
              ])}
            </ReportPanel>
          </div>
        </div>
      ) : null}

      {activeView === "profit" ? (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Gross sales" value={formatCurrency(financialSummary?.grossSales ?? 0, currency, locale)} />
            <MetricCard label="Gross profit" value={formatCurrency(financialSummary?.grossProfit ?? 0, currency, locale)} />
            <MetricCard accent="yellow" label="Expenses" value={formatCurrency(-(financialSummary?.expenses ?? 0), currency, locale)} />
            <MetricCard accent="green" label="Net profit" value={formatCurrency(financialSummary?.netProfit ?? 0, currency, locale)} />
          </div>
          <div className="grid gap-6 xl:grid-cols-2">
            <ReportPanel icon={<BarChart3 className="h-5 w-5" />} title="Profit / loss summary">
              {tableRows([
                { label: "Gross sales", value: formatCurrency(financialSummary?.grossSales ?? 0, currency, locale) },
                { label: "Gross sales excluding VAT", value: formatCurrency(profitTaxView.grossSalesExcludingTax, currency, locale) },
                { label: "Refunds", value: formatCurrency(-(financialSummary?.refunds ?? 0), currency, locale) },
                { label: "Net sales", value: formatCurrency(financialSummary?.netSales ?? 0, currency, locale) },
                { label: "Net sales excluding VAT", value: formatCurrency(profitTaxView.netSalesExcludingTax, currency, locale) },
                { label: "Profit adjustments", value: formatCurrency(-(financialSummary?.profitAdjustments ?? 0), currency, locale) },
                { label: "Net profit before VAT payable", value: formatCurrency(profitTaxView.profitBeforeVatPayable, currency, locale) },
                { label: "Net profit after VAT payable", value: formatCurrency(profitTaxView.profitAfterVatPayable, currency, locale) }
              ])}
            </ReportPanel>
            <ReportPanel icon={<WalletCards className="h-5 w-5" />} title="Ledger control">
              {tableRows([
                { label: "Total debits", value: formatCurrency(ledgerControlTotals.debit, currency, locale) },
                { label: "Total credits", value: formatCurrency(ledgerControlTotals.credit, currency, locale) },
                { label: "Difference", value: formatCurrency(ledgerControlTotals.difference, currency, locale) },
                { label: "Ledger rows", value: String(filteredLedgerEntries.length) }
              ])}
            </ReportPanel>
          </div>
        </div>
      ) : null}

      {activeView === "employee" ? (
        <ReportPanel icon={<Users2 className="h-5 w-5" />} title="Sales by employee">
          {tableRows(employeePerformance.map((row) => ({
            label: `${row.name} (${row.billCount} bills)`,
            value: formatCurrency(row.net, currency, locale),
            detail: `Gross ${formatCurrency(row.gross, currency, locale)} | refunds ${formatCurrency(-row.refunds, currency, locale)} | products ${row.products || "-"}`
          })))}
        </ReportPanel>
      ) : null}

      {activeView === "dayShift" ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <ReportPanel icon={<CalendarDays className="h-5 w-5" />} title="Day report">
            {tableRows(dayReportRows.map((row) => ({
              label: formatBusinessDate(row.businessDate, locale),
              value: formatCurrency(row.net, currency, locale),
              detail: `${row.bills} bills | sales ${formatCurrency(row.sales, currency, locale)} | refunds ${formatCurrency(-row.refunds, currency, locale)} | shifts ${row.shifts}`
            })))}
          </ReportPanel>
          <ReportPanel icon={<ClockIcon />} title="Shift report">
            {tableRows(shiftReportRows.map((row) => ({
              label: `${row.cashierName} | ${formatDateTime(row.shift.startedAt, locale)}`,
              value: formatCurrency(row.summary.expectedCash, currency, locale),
              detail: `${row.shift.endedAt ? "Closed" : "Open"} | cash sales ${formatCurrency(row.summary.cashSales, currency, locale)} | difference ${formatCurrency(row.summary.difference ?? 0, currency, locale)}`
            })))}
          </ReportPanel>
        </div>
      ) : null}

      {activeView === "inventory" ? (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Stock products" value={inventorySummary.itemCount} />
            <MetricCard label="Units on hand" value={inventorySummary.unitsOnHand} />
            <MetricCard accent="green" label="Cost value" value={formatCurrency(inventorySummary.costValue, currency, locale)} />
            <MetricCard accent="yellow" label="Low stock" value={inventorySummary.lowStockCount} />
          </div>
          <div className="grid gap-6 xl:grid-cols-2">
            <ReportPanel icon={<Boxes className="h-5 w-5" />} title="Inventory by category">
              {tableRows(inventoryByCategory.map((row) => ({
                label: row.name,
                value: formatCurrency(row.cost, currency, locale),
                detail: `${row.products} products | ${row.units} units | sale value ${formatCurrency(row.value, currency, locale)}`
              })))}
            </ReportPanel>
            <ReportPanel icon={<Package className="h-5 w-5" />} title="Low stock items">
              {tableRows(lowStockProducts.map((product) => ({
                label: localizedName(product.name, locale),
                value: `${product.stockQuantity} / ${product.reorderLevel}`,
                detail: `Cost ${formatCurrency(product.costPrice, currency, locale)} | Sale ${formatCurrency(product.salePrice, currency, locale)}`
              })))}
            </ReportPanel>
          </div>
        </div>
      ) : null}

      {activeView === "suppliers" ? (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Suppliers" value={supplierSummary.length} />
            <MetricCard label="Purchase orders" value={purchaseOrdersInRange.length} />
            <MetricCard accent="green" label="Ordered amount" value={formatCurrency(supplierSummary.reduce((sum, row) => sum + row.ordered, 0), currency, locale)} />
            <MetricCard accent="yellow" label="Paid amount" value={formatCurrency(supplierSummary.reduce((sum, row) => sum + row.paid, 0), currency, locale)} />
          </div>
          <div className="grid gap-6 xl:grid-cols-2">
            <ReportPanel icon={<Truck className="h-5 w-5" />} title="Supplier summary">
              {tableRows(supplierSummary.map((row) => ({
                label: row.name,
                value: formatCurrency(row.ordered, currency, locale),
                detail: `${row.orderCount} POs | paid ${formatCurrency(row.paid, currency, locale)} | balance ${formatCurrency(row.balance, currency, locale)} | received ${row.receivedQuantity}`
              })))}
            </ReportPanel>
            <ReportPanel icon={<ReceiptText className="h-5 w-5" />} title="Purchase orders">
              {tableRows(purchaseOrdersInRange.map((order) => ({
                label: `${order.number} | ${order.supplierName}`,
                value: formatCurrency(order.totalAmount ?? 0, currency, locale),
                detail: `${order.status} | paid ${formatCurrency(order.paidAmount ?? 0, currency, locale)} | ${formatDateTime(order.createdAt, locale)}`
              })))}
            </ReportPanel>
          </div>
        </div>
      ) : null}

      {activeView === "expenses" ? (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <MetricCard label="Total expenses" value={formatCurrency(expenseReportSummary.totalExpenses, currency, locale)} />
            <MetricCard label="Entries" value={periodExpenses.length} />
            <MetricCard accent="green" label="Cash in" value={formatCurrency(expenseReportSummary.cashIn, currency, locale)} />
            <MetricCard accent="yellow" label="Cash out" value={formatCurrency(expenseReportSummary.cashOut, currency, locale)} />
            <MetricCard label="Drawer adjustments" value={periodMovements.length} />
          </div>
          <div className="grid gap-6 xl:grid-cols-2">
            <ReportPanel icon={<WalletCards className="h-5 w-5" />} title="Expense log">
              {tableRows(periodExpenses.map((expense) => ({
                label: `${expense.categoryName} | ${formatDateTime(expense.createdAt, locale)}`,
                value: formatCurrency(expense.amount, currency, locale),
                detail: `${expense.paymentMethod.toUpperCase()}${expense.vendorName ? ` | ${expense.vendorName}` : ""}${expense.note ? ` | ${expense.note}` : ""}`
              })))}
            </ReportPanel>
            <ReportPanel icon={<WalletCards className="h-5 w-5" />} title="Drawer adjustment log">
              {tableRows(periodMovements.map((movement) => ({
                label: `${movement.type === "cash_in" ? "Cash in" : "Cash out"} | ${formatDateTime(movement.createdAt, locale)}`,
                value: formatCurrency(movement.amount, currency, locale),
                detail: movement.reason
              })))}
            </ReportPanel>
          </div>
        </div>
      ) : null}

      {activeView === "refunds" ? (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard label="Refund count" value={periodRefunds.length} />
            <MetricCard accent="yellow" label="Refund amount" value={formatCurrency(periodRefunds.reduce((sum, refund) => sum + refund.amount, 0), currency, locale)} />
            <MetricCard label="Profit adjustment" value={formatCurrency(periodRefunds.reduce((sum, refund) => sum + refund.profitAdjustment, 0), currency, locale)} />
          </div>
          <div className="grid gap-6 xl:grid-cols-2">
            <ReportPanel icon={<BarChart3 className="h-5 w-5" />} title="Refunds by category">
              {tableRows(refundsByCategory.map((row) => ({
                label: row.name,
                value: formatCurrency(row.amount, currency, locale),
                detail: `${row.items} items | ${row.quantity} qty | profit adjustment ${formatCurrency(row.profit, currency, locale)}`
              })))}
            </ReportPanel>
            <ReportPanel icon={<Package className="h-5 w-5" />} title="Refunds by item">
              {tableRows(refundsByItem.map((row) => ({
                label: row.name,
                value: formatCurrency(row.amount, currency, locale),
                detail: `${row.category} | qty ${row.quantity} | profit adjustment ${formatCurrency(row.profit, currency, locale)}`
              })))}
            </ReportPanel>
          </div>
          <ReportPanel icon={<ReceiptText className="h-5 w-5" />} title="Refund audit">
            {tableRows(periodRefunds.map((refund) => {
              const bill = billById.get(refund.originalBillId);
              return {
                label: `${bill?.number ?? refund.originalBillId} | ${formatDateTime(refund.returnDate, locale)}`,
                value: formatCurrency(refund.amount, currency, locale),
                detail: `${refund.reason} | original sale ${refund.originalSaleDate}`
              };
            }))}
          </ReportPanel>
        </div>
      ) : null}

      {activeView === "tax" ? (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Invoice VAT output" value={formatCurrency(taxSummary.invoiceTax, currency, locale)} />
            <MetricCard label="VAT reversed" value={formatCurrency(-taxSummary.refundTax, currency, locale)} />
            <MetricCard accent="green" label="Net VAT payable" value={formatCurrency(taxSummary.netPayableTax, currency, locale)} />
            <MetricCard accent="yellow" label="Remaining VAT" value={formatCurrency(taxSummary.remainingPayableTax, currency, locale)} />
          </div>
          <div className="grid gap-6 xl:grid-cols-2">
            <ReportPanel icon={<ReceiptText className="h-5 w-5" />} title="Tax payable">
              {tableRows([
                { label: "Invoice VAT output", value: formatCurrency(taxSummary.invoiceTax, currency, locale) },
                { label: "VAT reversed from refunds", value: formatCurrency(-taxSummary.refundTax, currency, locale) },
                { label: "Net VAT payable", value: formatCurrency(taxSummary.netPayableTax, currency, locale) },
                { label: "VAT collected from paid bills", value: formatCurrency(taxSummary.customerPaidTax, currency, locale) },
                { label: "VAT still in customer dues", value: formatCurrency(taxSummary.customerDueTax, currency, locale) },
                { label: "VAT paid to authority", value: formatCurrency(taxSummary.authorityPaidTax, currency, locale) },
                { label: "Remaining VAT payable", value: formatCurrency(taxSummary.remainingPayableTax, currency, locale) }
              ])}
            </ReportPanel>
            <ReportPanel icon={<WalletCards className="h-5 w-5" />} title="VAT by payment method">
              {tableRows([
                { label: "Cash VAT", value: formatCurrency(taxSummary.cashTax, currency, locale) },
                { label: "Card VAT", value: formatCurrency(taxSummary.cardTax, currency, locale) },
                { label: "Account VAT", value: formatCurrency(taxSummary.accountTax, currency, locale) },
                { label: "Cash refund VAT", value: formatCurrency(-taxSummary.cashRefundTax, currency, locale) },
                { label: "Card refund VAT", value: formatCurrency(-taxSummary.cardRefundTax, currency, locale) },
                { label: "Account refund VAT", value: formatCurrency(-taxSummary.accountRefundTax, currency, locale) }
              ])}
            </ReportPanel>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ClockIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path d="M12 7v5l3 2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
