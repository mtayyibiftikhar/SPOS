"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Download,
  FileSearch,
  Printer,
  ReceiptText,
  Search
} from "lucide-react";
import { usePosApp } from "@/components/providers/app-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getBusinessDateInTimezone } from "@/lib/cash-control";
import { billStatusLabelKeys, paymentMethodLabelKeys } from "@/lib/i18n";
import { createStructuredReportPdfBlob, downloadBlob } from "@/lib/report-export";
import { calculateBillItemProfit, calculateBillRefundState } from "@/lib/refunds";
import { cn, formatBusinessDate, formatCurrency, formatDateTime } from "@/lib/utils";
import type { Bill, BillItem, Locale, PaymentMethod, Refund, RefundItem } from "@/types/pos";

type RefundView = "new" | "history";
type RefundStep = "find" | "refund";
type RangePreset = "today" | "yesterday" | "week" | "month" | "year" | "custom";

const PAGE_SIZE = 8;
const HISTORY_PAGE_SIZE = 10;

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
      return {
        dateFrom: todayBusinessDate,
        dateTo: todayBusinessDate
      };
    case "yesterday": {
      const previousDay = shiftBusinessDate(todayBusinessDate, -1);
      return {
        dateFrom: previousDay,
        dateTo: previousDay
      };
    }
    case "week":
      return {
        dateFrom: getStartOfWeek(todayBusinessDate),
        dateTo: todayBusinessDate
      };
    case "month":
      return {
        dateFrom: getStartOfMonth(todayBusinessDate),
        dateTo: todayBusinessDate
      };
    case "year":
      return {
        dateFrom: getStartOfYear(todayBusinessDate),
        dateTo: todayBusinessDate
      };
  }

  return {
    dateFrom: todayBusinessDate,
    dateTo: todayBusinessDate
  };
}

function escapeHtml(value: string | number | undefined | null) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getBillBusinessDate(bill: Bill) {
  return bill.businessDate ?? bill.createdAt.slice(0, 10);
}

function getRefundBusinessDate(refund: Refund) {
  return refund.businessDate ?? refund.returnDate.slice(0, 10);
}

function localizedName(name: { en?: string; ar?: string; ur?: string }, locale: Locale) {
  return name[locale] || name.en || name.ar || name.ur || "Item";
}

function normalizeQuery(value: string) {
  return value.trim().toLowerCase();
}

function translateRefundError(t: ReturnType<typeof usePosApp>["t"], message?: string) {
  switch (message) {
    case "Session unavailable.":
      return t("refund.sessionUnavailable");
    case "Only the shop admin can create refunds.":
      return t("refund.adminOnly");
    case "The original bill could not be found.":
      return t("refund.billMissing");
    case "Cancelled bills cannot be refunded.":
      return t("refund.cancelledBlocked");
    case "This bill has already been fully refunded.":
      return t("refund.fullRefunded");
    case "Start the business day before creating refunds.":
      return t("billing.dayRequired");
    case "Start your shift before creating refunds.":
      return t("billing.shiftRequired");
    case "Add a refund reason before saving.":
      return t("refund.reasonRequired");
    case "Select at least one refundable quantity.":
      return t("refund.selectQuantity");
    case "Account adjustment refunds require a saved customer.":
      return t("refund.accountAdjustmentRequiresCustomer");
    default:
      return t("refund.error");
  }
}

function buildRefundPrintHtml({
  currency,
  locale,
  refunds,
  shopName
}: {
  currency: string;
  locale: Locale;
  refunds: Array<{ bill?: Bill; items: RefundItem[]; refund: Refund }>;
  shopName: string;
}) {
  const rows = refunds
    .map(({ bill, items, refund }) => {
      const itemText = items
        .map((item) => `${escapeHtml(localizedName(item.productName, locale))} (${escapeHtml(item.quantity)})`)
        .join(", ");

      return `
        <tr>
          <td>${escapeHtml(bill?.number ?? refund.originalBillId)}</td>
          <td>${escapeHtml(formatDateTime(refund.returnDate, locale))}</td>
          <td>${escapeHtml(bill?.customerName || "Walk-in Customer")}</td>
          <td>${escapeHtml(itemText || "Items")}</td>
          <td>${escapeHtml(refund.reason)}</td>
          <td>${escapeHtml(formatCurrency(refund.amount, currency, locale))}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Refund report</title>
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; background: #eef4f1; color: #07111f; font-family: Arial, sans-serif; }
          .toolbar { align-items: center; background: #07111f; color: #fff; display: flex; justify-content: space-between; padding: 16px 20px; }
          .toolbar h2 { font-size: 18px; margin: 0; }
          .toolbar button { background: #10b981; border: 0; border-radius: 999px; color: #fff; cursor: pointer; font-weight: 700; padding: 10px 18px; }
          main { margin: 24px auto; max-width: 1040px; padding: 0 16px; }
          .report { background: #fff; border: 1px solid #dbe5e1; border-radius: 28px; box-shadow: 0 22px 60px rgba(15, 23, 42, 0.10); overflow: hidden; }
          header { border-bottom: 1px solid #e2e8f0; padding: 24px; }
          header p { color: #64748b; margin: 6px 0 0; }
          table { border-collapse: collapse; width: 100%; }
          th { background: #f8fafc; color: #64748b; font-size: 11px; letter-spacing: .14em; padding: 13px 16px; text-align: left; text-transform: uppercase; }
          td { border-top: 1px solid #e2e8f0; padding: 14px 16px; vertical-align: top; }
          @media print {
            body { background: #fff; }
            .toolbar { display: none; }
            main { margin: 0; max-width: none; padding: 0; }
            .report { border: 0; border-radius: 0; box-shadow: none; }
          }
        </style>
      </head>
      <body>
        <div class="toolbar">
          <h2>Refund report - ${escapeHtml(shopName)}</h2>
          <button onclick="window.print()">Print now</button>
        </div>
        <main>
          <section class="report">
            <header>
              <h1>${escapeHtml(shopName)}</h1>
              <p>${refunds.length} refund records</p>
            </header>
            <table>
              <thead>
                <tr>
                  <th>Receipt</th>
                  <th>Refund date</th>
                  <th>Customer</th>
                  <th>Items</th>
                  <th>Reason</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </section>
        </main>
      </body>
    </html>
  `;
}

export function RefundsWorkspace() {
  const searchParams = useSearchParams();
  const { createRefund, currentShop, currentShopId, locale, session, state, t } = usePosApp();
  const initialBillId = searchParams.get("billId");
  const initialView = searchParams.get("view") === "history" ? "history" : "new";
  const [activeView, setActiveView] = useState<RefundView>(initialView);
  const [refundStep, setRefundStep] = useState<RefundStep>(initialBillId ? "refund" : "find");
  const [billSearch, setBillSearch] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [rangePreset, setRangePreset] = useState<RangePreset>("month");
  const [selectedBillId, setSelectedBillId] = useState<string | null>(initialBillId);
  const [payoutMethod, setPayoutMethod] = useState<PaymentMethod>("cash");
  const [refundReason, setRefundReason] = useState("");
  const [refundQuantities, setRefundQuantities] = useState<Record<string, string>>({});
  const [isRefunding, setIsRefunding] = useState(false);
  const [billPage, setBillPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [historySearch, setHistorySearch] = useState("");
  const [historyCustomerSearch, setHistoryCustomerSearch] = useState("");
  const [historyProductSearch, setHistoryProductSearch] = useState("");
  const [historyRangePreset, setHistoryRangePreset] = useState<RangePreset>("month");
  const [selectedRefundIds, setSelectedRefundIds] = useState<Set<string>>(new Set());
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);

  const todayBusinessDate = getBusinessDateInTimezone(currentShop?.timezone ?? "Asia/Riyadh", new Date());
  const [customFrom, setCustomFrom] = useState(todayBusinessDate);
  const [customTo, setCustomTo] = useState(todayBusinessDate);
  const [historyCustomFrom, setHistoryCustomFrom] = useState(todayBusinessDate);
  const [historyCustomTo, setHistoryCustomTo] = useState(todayBusinessDate);
  const currency = currentShop?.currency ?? "SAR";
  const currentSettings = currentShopId ? state.settingsByShop[currentShopId] : undefined;
  const canCreateRefund = session?.role === "shop_admin";

  const bills = useMemo(
    () =>
      state.bills
        .filter((bill) => bill.shopId === currentShopId)
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()),
    [currentShopId, state.bills]
  );

  const billItemsByBillId = useMemo(() => {
    const map = new Map<string, BillItem[]>();

    state.billItems.forEach((item) => {
      const current = map.get(item.billId) ?? [];
      current.push(item);
      map.set(item.billId, current);
    });

    return map;
  }, [state.billItems]);

  const selectedRange = useMemo(() => {
    if (rangePreset !== "custom") {
      return getRangeFromPreset(rangePreset, todayBusinessDate);
    }

    const normalizedFrom = customFrom || todayBusinessDate;
    const normalizedTo = customTo || normalizedFrom;

    return normalizedFrom <= normalizedTo
      ? { dateFrom: normalizedFrom, dateTo: normalizedTo }
      : { dateFrom: normalizedTo, dateTo: normalizedFrom };
  }, [customFrom, customTo, rangePreset, todayBusinessDate]);

  const historyRange = useMemo(() => {
    if (historyRangePreset !== "custom") {
      return getRangeFromPreset(historyRangePreset, todayBusinessDate);
    }

    const normalizedFrom = historyCustomFrom || todayBusinessDate;
    const normalizedTo = historyCustomTo || normalizedFrom;

    return normalizedFrom <= normalizedTo
      ? { dateFrom: normalizedFrom, dateTo: normalizedTo }
      : { dateFrom: normalizedTo, dateTo: normalizedFrom };
  }, [historyCustomFrom, historyCustomTo, historyRangePreset, todayBusinessDate]);

  const selectedRangeLabel = useMemo(() => {
    if (selectedRange.dateFrom === selectedRange.dateTo) {
      return formatBusinessDate(selectedRange.dateFrom, locale);
    }

    return `${formatBusinessDate(selectedRange.dateFrom, locale)} - ${formatBusinessDate(selectedRange.dateTo, locale)}`;
  }, [locale, selectedRange.dateFrom, selectedRange.dateTo]);

  const historyRangeLabel = useMemo(() => {
    if (historyRange.dateFrom === historyRange.dateTo) {
      return formatBusinessDate(historyRange.dateFrom, locale);
    }

    return `${formatBusinessDate(historyRange.dateFrom, locale)} - ${formatBusinessDate(historyRange.dateTo, locale)}`;
  }, [historyRange.dateFrom, historyRange.dateTo, locale]);

  const billMatchesProductQuery = (bill: Bill, query: string) => {
    if (!query) {
      return true;
    }

    const items = billItemsByBillId.get(bill.id) ?? [];

    return items.some((item) => {
      const product = state.products.find((entry) => entry.id === item.productId);
      const searchable = [
        item.productName.en,
        item.productName.ar,
        item.productName.ur,
        product?.barcode,
        ...(product?.barcodes ?? [])
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchable.includes(query);
    });
  };

  const filteredBills = useMemo(() => {
    const receiptQuery = normalizeQuery(billSearch);
    const customerQuery = normalizeQuery(customerSearch);
    const productQuery = normalizeQuery(productSearch);

    return bills.filter((bill) => {
      const businessDate = getBillBusinessDate(bill);

      if (businessDate < selectedRange.dateFrom || businessDate > selectedRange.dateTo) {
        return false;
      }

      if (receiptQuery) {
        const receiptFields = [bill.number, bill.publicToken, bill.createdAt, businessDate]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (!receiptFields.includes(receiptQuery)) {
          return false;
        }
      }

      if (customerQuery) {
        const customerFields = [bill.customerName, bill.customerPhone, bill.customerEmail, bill.customerWhatsapp]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (!customerFields.includes(customerQuery)) {
          return false;
        }
      }

      if (!billMatchesProductQuery(bill, productQuery)) {
        return false;
      }

      return true;
    });
  }, [billSearch, bills, customerSearch, productSearch, selectedRange.dateFrom, selectedRange.dateTo, state.products]);

  useEffect(() => {
    setBillPage(1);
  }, [billSearch, customerSearch, productSearch, selectedRange.dateFrom, selectedRange.dateTo]);

  const selectedBill = bills.find((bill) => bill.id === selectedBillId) ?? null;

  useEffect(() => {
    if (selectedBill) {
      setPayoutMethod(selectedBill.paymentMethod);
      return;
    }

    if (refundStep === "refund") {
      setRefundStep("find");
    }
  }, [refundStep, selectedBill?.id, selectedBill?.paymentMethod]);

  const items = selectedBill ? state.billItems.filter((item) => item.billId === selectedBill.id) : [];
  const refundState = calculateBillRefundState({
    billId: selectedBill?.id ?? "",
    billItems: items,
    refunds: state.refunds,
    refundItems: state.refundItems
  });
  const refundHistory = refundState.billRefunds.map((refund) => ({
    refund,
    items: refundState.relatedRefundItems.filter((entry) => entry.refundId === refund.id)
  }));
  const refundableItems = refundState.refundableItems.map((entry) => {
    const parsedQuantity = Number.parseInt(refundQuantities[entry.item.id] ?? "", 10);
    const selectedQuantity = Number.isNaN(parsedQuantity)
      ? 0
      : Math.min(entry.remainingQuantity, Math.max(0, parsedQuantity));

    return {
      ...entry,
      selectedQuantity,
      refundAmount: entry.item.unitPrice * selectedQuantity,
      profitAdjustment: calculateBillItemProfit(entry.item, selectedQuantity)
    };
  });
  const selectedRefundItems = refundableItems.filter((entry) => entry.selectedQuantity > 0);
  const estimatedRefundAmount = selectedRefundItems.reduce((sum, entry) => sum + entry.refundAmount, 0);
  const estimatedProfitAdjustment = selectedRefundItems.reduce((sum, entry) => sum + entry.profitAdjustment, 0);

  const allRefundHistory = useMemo(
    () =>
      state.refunds
        .filter((refund) => refund.shopId === currentShopId)
        .map((refund) => ({
          refund,
          bill: state.bills.find((bill) => bill.id === refund.originalBillId),
          items: state.refundItems.filter((item) => item.refundId === refund.id)
        }))
        .sort((left, right) => new Date(right.refund.returnDate).getTime() - new Date(left.refund.returnDate).getTime()),
    [currentShopId, state.bills, state.refundItems, state.refunds]
  );

  const filteredRefundHistory = useMemo(() => {
    const query = normalizeQuery(historySearch);
    const customerQuery = normalizeQuery(historyCustomerSearch);
    const productQuery = normalizeQuery(historyProductSearch);

    return allRefundHistory.filter(({ bill, items: historyItems, refund }) => {
      const businessDate = getRefundBusinessDate(refund);

      if (businessDate < historyRange.dateFrom || businessDate > historyRange.dateTo) {
        return false;
      }

      if (query) {
        const queryFields = [refund.id, refund.reason, bill?.number, bill?.customerName, bill?.customerPhone]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (!queryFields.includes(query)) {
          return false;
        }
      }

      if (customerQuery) {
        const customerFields = [bill?.customerName, bill?.customerPhone, bill?.customerEmail, bill?.customerWhatsapp]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (!customerFields.includes(customerQuery)) {
          return false;
        }
      }

      if (productQuery) {
        const productFields = historyItems
          .flatMap((item) => [item.productName.en, item.productName.ar, item.productName.ur])
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (!productFields.includes(productQuery)) {
          return false;
        }
      }

      return true;
    });
  }, [allRefundHistory, historyCustomerSearch, historyProductSearch, historyRange.dateFrom, historyRange.dateTo, historySearch]);

  useEffect(() => {
    setHistoryPage(1);
    setSelectedRefundIds(new Set());
  }, [historyCustomerSearch, historyProductSearch, historyRange.dateFrom, historyRange.dateTo, historySearch]);

  const billTotalPages = Math.max(1, Math.ceil(filteredBills.length / PAGE_SIZE));
  const safeBillPage = Math.min(billPage, billTotalPages);
  const paginatedBills = filteredBills.slice((safeBillPage - 1) * PAGE_SIZE, safeBillPage * PAGE_SIZE);
  const historyTotalPages = Math.max(1, Math.ceil(filteredRefundHistory.length / HISTORY_PAGE_SIZE));
  const safeHistoryPage = Math.min(historyPage, historyTotalPages);
  const paginatedRefunds = filteredRefundHistory.slice((safeHistoryPage - 1) * HISTORY_PAGE_SIZE, safeHistoryPage * HISTORY_PAGE_SIZE);
  const selectedRefunds = filteredRefundHistory.filter(({ refund }) => selectedRefundIds.has(refund.id));

  const handleRefundQuantityChange = (billItemId: string, remainingQuantity: number, value: string) => {
    if (!value) {
      setRefundQuantities((current) => ({ ...current, [billItemId]: "" }));
      return;
    }

    const digitsOnly = value.replace(/\D/g, "");
    const parsedQuantity = Number.parseInt(digitsOnly, 10);
    const nextValue = Number.isNaN(parsedQuantity)
      ? ""
      : String(Math.min(remainingQuantity, Math.max(0, parsedQuantity)));

    setRefundQuantities((current) => ({
      ...current,
      [billItemId]: nextValue
    }));
  };

  const selectFullRefund = () => {
    const nextQuantities = refundableItems.reduce<Record<string, string>>((accumulator, entry) => {
      if (entry.remainingQuantity > 0) {
        accumulator[entry.item.id] = String(entry.remainingQuantity);
      }

      return accumulator;
    }, {});

    setRefundQuantities(nextQuantities);
  };

  const clearRefundSelection = () => {
    setRefundQuantities({});
  };

  const handleCreateRefund = () => {
    if (!selectedBill) {
      return;
    }

    if (!canCreateRefund) {
      setFeedback({
        tone: "error",
        message: t("refund.adminOnly")
      });
      return;
    }

    setIsRefunding(true);
    setFeedback(null);

    const result = createRefund({
      billId: selectedBill.id,
      payoutMethod,
      reason: refundReason.trim(),
      items: selectedRefundItems.map((entry) => ({
        billItemId: entry.item.id,
        quantity: entry.selectedQuantity
      }))
    });

    if (!result.ok) {
      setFeedback({
        tone: "error",
        message: translateRefundError(t, result.message)
      });
      setIsRefunding(false);
      return;
    }

    setRefundQuantities({});
    setRefundReason("");
    setFeedback({
      tone: "success",
      message: t("refund.success")
    });
    setIsRefunding(false);
  };

  const selectBillForRefund = (bill: Bill) => {
    setSelectedBillId(bill.id);
    setRefundStep("refund");
    setFeedback(null);
    setRefundQuantities({});
    setRefundReason("");
    setPayoutMethod(bill.paymentMethod);
  };

  const toggleRefundSelection = (refundId: string) => {
    setSelectedRefundIds((current) => {
      const next = new Set(current);

      if (next.has(refundId)) {
        next.delete(refundId);
      } else {
        next.add(refundId);
      }

      return next;
    });
  };

  const selectVisibleRefundPage = () => {
    setSelectedRefundIds((current) => {
      const next = new Set(current);

      paginatedRefunds.forEach(({ refund }) => next.add(refund.id));

      return next;
    });
  };

  const exportRefundsPdf = async (refundsToExport: typeof filteredRefundHistory, label: string) => {
    setExportFeedback(null);

    if (refundsToExport.length === 0 || !currentShop) {
      setExportFeedback(t("refund.noExportSelection"));
      return;
    }

    const totalRefunded = refundsToExport.reduce((sum, entry) => sum + Math.abs(entry.refund.amount), 0);
    const totalProfitAdjustment = refundsToExport.reduce((sum, entry) => sum + Math.abs(entry.refund.profitAdjustment), 0);
    const rows = refundsToExport.slice(0, 80).map(({ bill, items: historyItems, refund }) => ({
      label: `${bill?.number ?? refund.originalBillId} | ${formatDateTime(refund.returnDate, "en")}`,
      value: formatCurrency(refund.amount, currency, "en"),
      detail: `${bill?.customerName || "Walk-in Customer"} | ${refund.reason} | ${historyItems
        .map((item) => `${localizedName(item.productName, "en")} x ${item.quantity}`)
        .join(", ")}`
    }));

    const pdfBlob = await createStructuredReportPdfBlob({
      generatedAt: formatDateTime(new Date().toISOString(), "en"),
      logoUrl: currentSettings?.pos.logoUrl,
      period: label,
      shopName: currentShop.name,
      subtitle: "Refund audit report with original receipt, customer, items, payout method, and reason.",
      title: "Refund Report",
      sections: [
        {
          title: "Refund summary",
          rows: [
            { label: "Refund records", value: String(refundsToExport.length) },
            { label: "Total refunded", value: formatCurrency(-totalRefunded, currency, "en") },
            { label: "Profit adjustment", value: formatCurrency(-totalProfitAdjustment, currency, "en") }
          ]
        },
        {
          title: "Refund audit trail",
          rows: rows.length > 0 ? rows : [{ label: "No refund rows", value: "-" }]
        }
      ]
    });

    downloadBlob(pdfBlob, `refund-report-${historyRange.dateFrom}-to-${historyRange.dateTo}.pdf`);
    setExportFeedback(t("refund.exportDownloaded"));
  };

  const printRefunds = (refundsToPrint: typeof filteredRefundHistory) => {
    setExportFeedback(null);

    if (refundsToPrint.length === 0 || !currentShop) {
      setExportFeedback(t("refund.noExportSelection"));
      return;
    }

    const printWindow = window.open("", "_blank");

    if (!printWindow) {
      setExportFeedback(t("refund.printPopupBlocked"));
      return;
    }

    printWindow.document.open();
    printWindow.document.write(
      buildRefundPrintHtml({
        currency,
        locale,
        refunds: refundsToPrint,
        shopName: currentShop.name
      })
    );
    printWindow.document.close();
    printWindow.focus();
    printWindow.setTimeout(() => printWindow.print(), 300);
  };

  const renderRangeControls = ({
    customFromValue,
    customToValue,
    onFromChange,
    onPresetChange,
    onToChange,
    preset
  }: {
    customFromValue: string;
    customToValue: string;
    onFromChange: (value: string) => void;
    onPresetChange: (value: RangePreset) => void;
    onToChange: (value: string) => void;
    preset: RangePreset;
  }) => (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {([
          { key: "today", label: t("common.today") },
          { key: "yesterday", label: t("common.yesterday") },
          { key: "week", label: t("common.thisWeek") },
          { key: "month", label: t("common.thisMonth") },
          { key: "year", label: t("common.thisYear") },
          { key: "custom", label: t("common.customRange") }
        ] as const).map((entry) => (
          <button
            className={cn(
              "rounded-full px-4 py-2 text-sm font-semibold transition",
              preset === entry.key
                ? "bg-slate-950 text-white shadow-[0_18px_32px_rgba(15,23,42,0.12)]"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            )}
            key={entry.key}
            onClick={() => onPresetChange(entry.key)}
            type="button"
          >
            {entry.label}
          </button>
        ))}
      </div>

      {preset === "custom" ? (
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-ink">{t("common.fromDate")}</label>
            <Input type="date" value={customFromValue} onChange={(event) => onFromChange(event.target.value)} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-ink">{t("common.toDate")}</label>
            <Input type="date" value={customToValue} onChange={(event) => onToChange(event.target.value)} />
          </div>
        </div>
      ) : null}
    </div>
  );

  const viewTabs = [
    {
      key: "new" as const,
      label: t("refund.title"),
      count: filteredBills.length
    },
    {
      key: "history" as const,
      label: t("refund.historyTitle"),
      count: allRefundHistory.length
    }
  ];

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-2">
          {viewTabs.map((tab) => (
            <button
              className={cn(
                "flex items-center justify-between rounded-[26px] border px-5 py-4 text-left transition",
                activeView === tab.key
                  ? "border-slate-950 bg-slate-950 text-white shadow-[0_18px_45px_rgba(15,23,42,0.16)]"
                  : "border-line bg-white text-ink hover:border-emerald-200 hover:bg-emerald-50/60"
              )}
              key={tab.key}
              onClick={() => {
                setActiveView(tab.key);
                setFeedback(null);
                setExportFeedback(null);
              }}
              type="button"
            >
              <span className="inline-flex items-center gap-3">
                <span className={cn("flex h-10 w-10 items-center justify-center rounded-2xl", activeView === tab.key ? "bg-white/12" : "bg-shell")}>
                  {tab.key === "new" ? <ReceiptText className="h-4 w-4" /> : <FileSearch className="h-4 w-4" />}
                </span>
                <span className="font-semibold">{tab.label}</span>
              </span>
              <span className={cn("rounded-full px-3 py-1 text-sm font-semibold", activeView === tab.key ? "bg-white/14" : "bg-shell")}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </Card>

      {activeView === "new" ? (
        refundStep === "find" ? (
          <Card className="overflow-hidden p-0">
            <div className="border-b border-line p-6">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-olive">{t("refund.findReceipt")}</p>
                  <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950">{t("refund.selectBillTitle")}</h2>
                  <p className="mt-2 text-sm font-medium text-slate-500">{selectedRangeLabel}</p>
                </div>
                {renderRangeControls({
                  customFromValue: customFrom,
                  customToValue: customTo,
                  onFromChange: setCustomFrom,
                  onPresetChange: setRangePreset,
                  onToChange: setCustomTo,
                  preset: rangePreset
                })}
              </div>

              <div className="mt-6 grid gap-3 xl:grid-cols-3">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    className="pl-11"
                    placeholder={t("refund.scanOrReceiptPlaceholder")}
                    value={billSearch}
                    onChange={(event) => setBillSearch(event.target.value)}
                  />
                </label>
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    className="pl-11"
                    placeholder={t("refund.customerFilterPlaceholder")}
                    value={customerSearch}
                    onChange={(event) => setCustomerSearch(event.target.value)}
                  />
                </label>
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    className="pl-11"
                    placeholder={t("refund.productFilterPlaceholder")}
                    value={productSearch}
                    onChange={(event) => setProductSearch(event.target.value)}
                  />
                </label>
              </div>
            </div>

            <div className="p-6">
              {paginatedBills.length > 0 ? (
                <div className="grid gap-4 xl:grid-cols-2">
                  {paginatedBills.map((bill) => {
                    const billItems = billItemsByBillId.get(bill.id) ?? [];
                    const billRefundState = calculateBillRefundState({
                      billId: bill.id,
                      billItems,
                      refunds: state.refunds,
                      refundItems: state.refundItems
                    });
                    const isBlocked = bill.status === "cancelled" || billRefundState.isFullyRefunded;

                    return (
                      <button
                        className={cn(
                          "rounded-[28px] border bg-white p-5 text-left transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-[0_18px_45px_rgba(15,23,42,0.10)]",
                          isBlocked ? "opacity-70" : "cursor-pointer"
                        )}
                        disabled={isBlocked}
                        key={bill.id}
                        onClick={() => selectBillForRefund(bill)}
                        type="button"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-lg font-semibold text-slate-950">{bill.number}</p>
                            <p className="mt-1 text-sm text-slate-600">{bill.customerName || t("billing.walkInCustomer")}</p>
                          </div>
                          <Badge variant={isBlocked ? "danger" : "success"}>
                            {isBlocked ? t("refund.fullRefunded") : formatCurrency(bill.total, currency, locale)}
                          </Badge>
                        </div>

                        <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                          <p>
                            <span className="font-medium text-slate-950">{t("common.dateTime")}:</span>{" "}
                            {formatDateTime(bill.createdAt, locale)}
                          </p>
                          <p>
                            <span className="font-medium text-slate-950">{t("common.items")}:</span> {billItems.length}
                          </p>
                          <p>
                            <span className="font-medium text-slate-950">{t("common.paymentMethod")}:</span>{" "}
                            {t(paymentMethodLabelKeys[bill.paymentMethod])}
                          </p>
                          <p>
                            <span className="font-medium text-slate-950">{t("common.status")}:</span>{" "}
                            {t(billStatusLabelKeys[bill.status])}
                          </p>
                        </div>

                        <div className="mt-4 rounded-2xl bg-shell px-4 py-3 text-sm text-slate-600">
                          {billItems.slice(0, 3).map((item) => localizedName(item.productName, locale)).join(", ") || t("common.items")}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-[30px] border border-dashed border-line bg-shell/70 p-10 text-center">
                  <ReceiptText className="mx-auto h-7 w-7 text-slate-400" />
                  <p className="mt-4 text-sm leading-6 text-slate-600">{t("refund.noBillsFound")}</p>
                </div>
              )}

              {filteredBills.length > PAGE_SIZE ? (
                <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
                  <p className="text-sm text-slate-600">
                    {t("common.page")} {safeBillPage} {t("common.of")} {billTotalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button disabled={safeBillPage === 1} onClick={() => setBillPage((page) => Math.max(1, page - 1))} variant="secondary">
                      {t("common.previous")}
                    </Button>
                    <Button disabled={safeBillPage === billTotalPages} onClick={() => setBillPage((page) => Math.min(billTotalPages, page + 1))} variant="secondary">
                      {t("common.next")}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </Card>
        ) : selectedBill ? (
          <div className="space-y-6">
            <Card className="p-6">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <button
                    className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-shell"
                    onClick={() => setRefundStep("find")}
                    type="button"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    {t("refund.backToBillSearch")}
                  </button>
                  <p className="mt-5 text-xs font-semibold uppercase tracking-[0.24em] text-olive">{t("refund.title")}</p>
                  <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950">{selectedBill.number}</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {selectedBill.customerName || t("billing.walkInCustomer")} | {formatBusinessDate(getBillBusinessDate(selectedBill), locale)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="neutral">{t(paymentMethodLabelKeys[selectedBill.paymentMethod])}</Badge>
                  <Badge variant={selectedBill.status === "refunded" ? "danger" : "success"}>
                    {t(billStatusLabelKeys[selectedBill.status])}
                  </Badge>
                  <Button asChild variant="secondary">
                    <Link href={`/bills/${selectedBill.id}`}>
                      <span className="inline-flex items-center gap-2">
                        {t("bills.viewReceipt")}
                        <ArrowRight className="h-4 w-4" />
                      </span>
                    </Link>
                  </Button>
                </div>
              </div>
            </Card>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_420px]">
              <Card className="p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-olive">{t("refund.refundableItems")}</p>
                    <h3 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">{t("refund.fullOrPartial")}</h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button disabled={!canCreateRefund || refundState.isFullyRefunded} onClick={selectFullRefund} variant="secondary">
                      {t("refund.fullRefundAction")}
                    </Button>
                    <Button onClick={clearRefundSelection} variant="secondary">
                      {t("common.clearForm")}
                    </Button>
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  {refundableItems.map((entry) => (
                    <div key={entry.item.id} className="rounded-[28px] border border-line bg-white p-4">
                      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_140px] md:items-center">
                        <div>
                          <p className="font-semibold text-slate-950">{localizedName(entry.item.productName, locale)}</p>
                          <p className="mt-1 text-sm text-slate-600">
                            {t("refund.quantitySummary", {
                              total: entry.item.quantity,
                              refunded: entry.refundedQuantity,
                              remaining: entry.remainingQuantity
                            })}
                          </p>
                          <p className="mt-2 text-sm font-medium text-slate-700">
                            {formatCurrency(entry.item.unitPrice, currency, locale)}
                          </p>
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-ink">{t("refund.quantityLabel")}</label>
                          <Input
                            inputMode="numeric"
                            value={refundQuantities[entry.item.id] ?? ""}
                            onChange={(event) => handleRefundQuantityChange(entry.item.id, entry.remainingQuantity, event.target.value)}
                            disabled={entry.remainingQuantity === 0 || refundState.isFullyRefunded || isRefunding || !canCreateRefund}
                            placeholder="0"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="h-fit p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-olive">{t("refund.summaryTitle")}</p>
                <div className="mt-4 grid gap-3">
                  {[
                    { label: t("refund.estimatedAmount"), value: formatCurrency(-estimatedRefundAmount, currency, locale) },
                    { label: t("refund.estimatedProfitAdjustment"), value: formatCurrency(-estimatedProfitAdjustment, currency, locale) },
                    { label: t("refund.totalRefunded"), value: formatCurrency(-refundState.totalRefundAmount, currency, locale) }
                  ].map((item) => (
                    <div className="rounded-[24px] border border-line bg-shell/70 p-4" key={item.label}>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
                      <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">{item.value}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-5">
                  <label className="mb-2 block text-sm font-medium text-ink">{t("refund.payoutMethod")}</label>
                  <Select value={payoutMethod} onChange={(event) => setPayoutMethod(event.target.value as PaymentMethod)}>
                    <option value="cash">{t("common.cash")}</option>
                    <option value="card">{t("common.card")}</option>
                    <option value="account">{t("refund.accountAdjustment")}</option>
                  </Select>
                  <p className="mt-2 text-xs leading-5 text-slate-500">{t("refund.payoutMethodHint")}</p>
                </div>

                <div className="mt-5">
                  <label className="mb-2 block text-sm font-medium text-ink">{t("refund.reasonLabel")}</label>
                  <Textarea
                    value={refundReason}
                    onChange={(event) => {
                      setRefundReason(event.target.value);
                      setFeedback(null);
                    }}
                  />
                </div>

                {feedback ? (
                  <p className={`mt-4 text-sm font-medium ${feedback.tone === "success" ? "text-emerald-700" : "text-red-700"}`}>
                    {feedback.message}
                  </p>
                ) : null}

                <Button
                  className="mt-5 w-full"
                  disabled={!canCreateRefund || refundState.isFullyRefunded || isRefunding || selectedRefundItems.length === 0}
                  onClick={handleCreateRefund}
                >
                  {isRefunding ? t("refund.saving") : t("refund.createAction")}
                </Button>

                {!canCreateRefund ? (
                  <div className="mt-4 rounded-3xl border border-dashed border-line bg-shell/70 p-5 text-sm leading-6 text-slate-600">
                    {t("refund.adminOnly")}
                  </div>
                ) : null}
              </Card>
            </div>

            <Card className="p-6">
              <h3 className="font-display text-xl font-semibold text-ink">{t("refund.historyTitle")}</h3>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {refundHistory.length > 0 ? (
                  refundHistory.map(({ refund, items: refundItems }) => (
                    <div key={refund.id} className="rounded-3xl border border-line bg-white p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-ink">{formatDateTime(refund.returnDate, locale)}</p>
                          <p className="mt-1 text-sm text-slate-600">
                            {t("refund.originalSaleDate")}: {formatBusinessDate(refund.originalSaleDate, locale)}
                          </p>
                        </div>
                        <Badge variant="warning">{t(paymentMethodLabelKeys[refund.paymentMethod])}</Badge>
                      </div>
                      <p className="mt-3 text-sm text-slate-600">{refund.reason}</p>
                      <p className="mt-3 text-lg font-semibold text-slate-950">{formatCurrency(refund.amount, currency, locale)}</p>
                      <p className="mt-1 text-sm text-slate-500">{refundItems.length} {t("common.items")}</p>
                    </div>
                  ))
                ) : (
                  <div className="rounded-3xl border border-dashed border-line bg-shell/70 p-5 text-sm leading-6 text-slate-600">
                    {t("refund.noHistory")}
                  </div>
                )}
              </div>
            </Card>
          </div>
        ) : (
          <Card className="p-8 text-center">
            <ReceiptText className="mx-auto h-7 w-7 text-slate-400" />
            <p className="mt-4 text-sm leading-6 text-slate-600">{t("refund.selectBillPrompt")}</p>
            <Button className="mt-5" onClick={() => setRefundStep("find")} variant="secondary">
              {t("refund.backToBillSearch")}
            </Button>
          </Card>
        )
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="border-b border-line p-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-olive">{t("refund.historyTitle")}</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950">{historyRangeLabel}</h2>
              </div>
              {renderRangeControls({
                customFromValue: historyCustomFrom,
                customToValue: historyCustomTo,
                onFromChange: setHistoryCustomFrom,
                onPresetChange: setHistoryRangePreset,
                onToChange: setHistoryCustomTo,
                preset: historyRangePreset
              })}
            </div>

            <div className="mt-6 grid gap-3 xl:grid-cols-3">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  className="pl-11"
                  placeholder={t("refund.historySearchPlaceholder")}
                  value={historySearch}
                  onChange={(event) => setHistorySearch(event.target.value)}
                />
              </label>
              <label className="relative block">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  className="pl-11"
                  placeholder={t("refund.customerFilterPlaceholder")}
                  value={historyCustomerSearch}
                  onChange={(event) => setHistoryCustomerSearch(event.target.value)}
                />
              </label>
              <label className="relative block">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  className="pl-11"
                  placeholder={t("refund.productFilterPlaceholder")}
                  value={historyProductSearch}
                  onChange={(event) => setHistoryProductSearch(event.target.value)}
                />
              </label>
            </div>
          </div>

          <div className="border-b border-line bg-shell/50 p-4">
            <div className="flex flex-wrap gap-3">
              <Badge variant="neutral">{t("bills.selectedCount", { count: selectedRefunds.length })}</Badge>
              <Button className="h-11 rounded-[16px]" onClick={selectVisibleRefundPage} variant="secondary">
                {t("bills.selectVisiblePage")}
              </Button>
              <Button className="h-11 rounded-[16px]" disabled={selectedRefunds.length === 0} onClick={() => printRefunds(selectedRefunds)} variant="secondary">
                <Printer className="mr-2 h-4 w-4" />
                {t("refund.printSelected")}
              </Button>
              <Button className="h-11 rounded-[16px]" disabled={filteredRefundHistory.length === 0} onClick={() => printRefunds(filteredRefundHistory)} variant="secondary">
                <Printer className="mr-2 h-4 w-4" />
                {t("refund.printFiltered")}
              </Button>
              <Button className="h-11 rounded-[16px] bg-slate-950 text-white hover:bg-slate-900" disabled={filteredRefundHistory.length === 0} onClick={() => exportRefundsPdf(filteredRefundHistory, historyRangeLabel)}>
                <Download className="mr-2 h-4 w-4" />
                {t("refund.downloadFiltered")}
              </Button>
              <Button className="h-11 rounded-[16px]" disabled={selectedRefunds.length === 0} onClick={() => exportRefundsPdf(selectedRefunds, t("refund.selectedRefunds"))} variant="secondary">
                <Download className="mr-2 h-4 w-4" />
                {t("refund.downloadSelected")}
              </Button>
            </div>
            {exportFeedback ? <p className="mt-3 text-sm font-medium text-emerald-700">{exportFeedback}</p> : null}
          </div>

          <div className="p-6">
            {paginatedRefunds.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[940px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-[0.14em] text-slate-500">
                    <tr>
                      <th className="rounded-l-2xl px-4 py-3">{t("common.actions")}</th>
                      <th className="px-4 py-3">{t("reports.originalReceipt")}</th>
                      <th className="px-4 py-3">{t("reports.refundDate")}</th>
                      <th className="px-4 py-3">{t("common.customer")}</th>
                      <th className="px-4 py-3">{t("reports.refundReason")}</th>
                      <th className="px-4 py-3">{t("reports.refundAmount")}</th>
                      <th className="rounded-r-2xl px-4 py-3">{t("refund.itemsTitle")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedRefunds.map(({ bill, items: historyItems, refund }) => (
                      <tr key={refund.id}>
                        <td className="px-4 py-4">
                          <input
                            aria-label={`Select refund ${refund.id}`}
                            checked={selectedRefundIds.has(refund.id)}
                            className="h-4 w-4 accent-emerald-600"
                            onChange={() => toggleRefundSelection(refund.id)}
                            type="checkbox"
                          />
                        </td>
                        <td className="px-4 py-4 font-semibold text-slate-950">{bill?.number ?? refund.originalBillId}</td>
                        <td className="px-4 py-4 text-slate-600">{formatDateTime(refund.returnDate, locale)}</td>
                        <td className="px-4 py-4 text-slate-600">{bill?.customerName || t("billing.walkInCustomer")}</td>
                        <td className="px-4 py-4 text-slate-600">{refund.reason}</td>
                        <td className="px-4 py-4 font-semibold text-slate-950">{formatCurrency(refund.amount, currency, locale)}</td>
                        <td className="px-4 py-4 text-slate-600">
                          {historyItems.map((item) => localizedName(item.productName, locale)).join(", ") || t("common.items")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-[30px] border border-dashed border-line bg-shell/70 p-10 text-center">
                <CalendarDays className="mx-auto h-7 w-7 text-slate-400" />
                <p className="mt-4 text-sm leading-6 text-slate-600">{t("refund.noHistory")}</p>
              </div>
            )}

            {filteredRefundHistory.length > HISTORY_PAGE_SIZE ? (
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
                <p className="text-sm text-slate-600">
                  {t("common.page")} {safeHistoryPage} {t("common.of")} {historyTotalPages}
                </p>
                <div className="flex gap-2">
                  <Button disabled={safeHistoryPage === 1} onClick={() => setHistoryPage((page) => Math.max(1, page - 1))} variant="secondary">
                    {t("common.previous")}
                  </Button>
                  <Button disabled={safeHistoryPage === historyTotalPages} onClick={() => setHistoryPage((page) => Math.min(historyTotalPages, page + 1))} variant="secondary">
                    {t("common.next")}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </Card>
      )}
    </div>
  );
}
