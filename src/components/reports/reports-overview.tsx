"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  BarChart3,
  CalendarRange,
  Clock3,
  Download,
  Package,
  ReceiptText,
  Users2,
  WalletCards
} from "lucide-react";
import {
  calculateShiftSummary,
  getBusinessDateInTimezone,
  getLatestClosedShift
} from "@/lib/cash-control";
import { getLedgerControlTotals, summarizeLedgerByAccount } from "@/lib/accounting";
import { calculateSalesReportSummaryRange } from "@/lib/refunds";
import {
  buildProfitLossFileName,
  createStructuredReportPdfBlob,
  downloadBlob
} from "@/lib/report-export";
import { usePosApp } from "@/components/providers/app-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { WorkspaceSectionsNav } from "@/components/ui/workspace-sections-nav";
import { formatBusinessDate, formatCurrency, formatDateTime } from "@/lib/utils";

type RangePreset = "today" | "yesterday" | "week" | "month" | "year" | "custom";
type ReportView = "overview" | "profit" | "cashier" | "inventory" | "refunds" | "tax";

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function isTaxAuthorityPaymentText(value: string) {
  return /\b(vat|tax|zakat|authority|government)\b/i.test(value);
}

function SummaryRow({
  label,
  value
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm text-slate-600">
      <span>{label}</span>
      <span className="font-medium text-ink">{value}</span>
    </div>
  );
}

function MetricCard({
  label,
  value,
  description
}: {
  description: string;
  label: string;
  value: string | number;
}) {
  return (
    <Card className="p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-3 font-display text-3xl font-semibold text-ink">{value}</p>
      <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
    </Card>
  );
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

function hasSummaryActivity(summary: ReturnType<typeof calculateSalesReportSummaryRange>) {
  return summary.billCount > 0 || summary.refundCount > 0 || summary.expenses > 0;
}

function getEntryBusinessDate(isoDate: string, timeZone: string, explicitBusinessDate?: string) {
  return explicitBusinessDate ?? getBusinessDateInTimezone(timeZone, new Date(isoDate));
}

export function ReportsOverview() {
  const searchParams = useSearchParams();
  const { currentSettings, currentShop, currentShift, locale, session, state, t } = usePosApp();
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [rangePreset, setRangePreset] = useState<RangePreset>("today");
  const todayBusinessDate = getBusinessDateInTimezone(currentShop?.timezone ?? "Asia/Riyadh", new Date());
  const [customFrom, setCustomFrom] = useState(todayBusinessDate);
  const [customTo, setCustomTo] = useState(todayBusinessDate);

  const requestedView = searchParams.get("view");
  const activeView: ReportView =
    requestedView === "profit" ||
    requestedView === "cashier" ||
    requestedView === "inventory" ||
    requestedView === "refunds" ||
    requestedView === "tax"
      ? requestedView
      : "overview";

  const currency = currentShop?.currency ?? "SAR";
  const timeZone = currentShop?.timezone ?? "Asia/Riyadh";

  const liveShiftSummary = useMemo(() => {
    if (!currentShift) {
      return null;
    }

    return calculateShiftSummary({
      shift: currentShift,
      bills: state.bills,
      cashMovements: state.cashMovements,
      refunds: state.refunds
    });
  }, [currentShift, state.bills, state.cashMovements, state.refunds]);

  const latestShift = useMemo(
    () => getLatestClosedShift(state.shifts, currentShop?.id ?? null, session?.id ?? null),
    [currentShop?.id, session?.id, state.shifts]
  );

  const latestShiftSummary = useMemo(() => {
    if (!latestShift) {
      return null;
    }

    return calculateShiftSummary({
      shift: latestShift,
      bills: state.bills,
      cashMovements: state.cashMovements,
      refunds: state.refunds
    });
  }, [latestShift, state.bills, state.cashMovements, state.refunds]);

  const selectedRange = useMemo(() => {
    if (rangePreset !== "custom") {
      return getRangeFromPreset(rangePreset, todayBusinessDate);
    }

    const normalizedFrom = customFrom || todayBusinessDate;
    const normalizedTo = customTo || normalizedFrom;

    if (normalizedFrom <= normalizedTo) {
      return {
        dateFrom: normalizedFrom,
        dateTo: normalizedTo
      };
    }

    return {
      dateFrom: normalizedTo,
      dateTo: normalizedFrom
    };
  }, [customFrom, customTo, rangePreset, todayBusinessDate]);

  const selectedRangeLabel = useMemo(() => {
    if (selectedRange.dateFrom === selectedRange.dateTo) {
      return formatBusinessDate(selectedRange.dateFrom, locale);
    }

    return `${formatBusinessDate(selectedRange.dateFrom, locale)} - ${formatBusinessDate(selectedRange.dateTo, locale)}`;
  }, [locale, selectedRange.dateFrom, selectedRange.dateTo]);

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

  const filteredDayCloses = useMemo(
    () =>
      state.dayCloses
        .filter(
          (dayClose) =>
            dayClose.shopId === currentShop?.id &&
            dayClose.businessDate >= selectedRange.dateFrom &&
            dayClose.businessDate <= selectedRange.dateTo
        )
        .sort((left, right) => new Date(right.closedAt).getTime() - new Date(left.closedAt).getTime())
        .slice(0, 6),
    [currentShop?.id, selectedRange.dateFrom, selectedRange.dateTo, state.dayCloses]
  );

  const filteredShopShifts = useMemo(
    () =>
      state.shifts
        .filter(
          (shift) =>
            shift.shopId === currentShop?.id &&
            shift.businessDate >= selectedRange.dateFrom &&
            shift.businessDate <= selectedRange.dateTo
        )
        .sort((left, right) => new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime())
        .slice(0, 6),
    [currentShop?.id, selectedRange.dateFrom, selectedRange.dateTo, state.shifts]
  );

  const filteredMovements = useMemo(
    () =>
      state.cashMovements
        .filter(
          (movement) =>
            movement.shopId === currentShop?.id &&
            movement.businessDate >= selectedRange.dateFrom &&
            movement.businessDate <= selectedRange.dateTo
        )
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
        .slice(0, 8),
    [currentShop?.id, selectedRange.dateFrom, selectedRange.dateTo, state.cashMovements]
  );

  const cashierPerformance = useMemo(() => {
    const entries = new Map<
      string,
      {
        billCount: number;
        grossSales: number;
        refunds: number;
        userId: string;
      }
    >();

    state.bills.forEach((bill) => {
      if (!currentShop || bill.shopId !== currentShop.id || bill.status === "cancelled") {
        return;
      }

      const businessDate = getEntryBusinessDate(bill.createdAt, timeZone, bill.businessDate);
      if (businessDate < selectedRange.dateFrom || businessDate > selectedRange.dateTo) {
        return;
      }

      const entry = entries.get(bill.cashierId) ?? {
        userId: bill.cashierId,
        billCount: 0,
        grossSales: 0,
        refunds: 0
      };

      entry.billCount += 1;
      entry.grossSales += bill.total;
      entries.set(bill.cashierId, entry);
    });

    state.refunds.forEach((refund) => {
      if (!currentShop || refund.shopId !== currentShop.id) {
        return;
      }

      const businessDate = getEntryBusinessDate(refund.returnDate, timeZone, refund.businessDate);
      if (businessDate < selectedRange.dateFrom || businessDate > selectedRange.dateTo) {
        return;
      }

      const entry = entries.get(refund.createdBy) ?? {
        userId: refund.createdBy,
        billCount: 0,
        grossSales: 0,
        refunds: 0
      };

      entry.refunds += refund.amount;
      entries.set(refund.createdBy, entry);
    });

    return Array.from(entries.values())
      .map((entry) => {
        const user = state.users.find((candidate) => candidate.id === entry.userId);

        return {
          ...entry,
          userName: user?.name ?? t("common.notAvailable"),
          netSales: entry.grossSales - entry.refunds
        };
      })
      .sort((left, right) => right.netSales - left.netSales);
  }, [
    currentShop,
    selectedRange.dateFrom,
    selectedRange.dateTo,
    state.bills,
    state.refunds,
    state.users,
    t,
    timeZone
  ]);

  const inventoryProducts = useMemo(
    () =>
      state.products
        .filter((product) => product.shopId === currentShop?.id && product.kind === "product")
        .sort((left, right) => left.name.en.localeCompare(right.name.en)),
    [currentShop?.id, state.products]
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

  const highestValueProducts = useMemo(
    () =>
      [...inventoryProducts]
        .sort(
          (left, right) =>
            right.stockQuantity * right.costPrice - left.stockQuantity * left.costPrice
        )
        .slice(0, 6),
    [inventoryProducts]
  );

  const filteredRefunds = useMemo(
    () =>
      state.refunds
        .filter((refund) => {
          if (!currentShop || refund.shopId !== currentShop.id) {
            return false;
          }

          const businessDate = getEntryBusinessDate(refund.returnDate, timeZone, refund.businessDate);

          return businessDate >= selectedRange.dateFrom && businessDate <= selectedRange.dateTo;
        })
        .sort((left, right) => new Date(right.returnDate).getTime() - new Date(left.returnDate).getTime()),
    [currentShop, selectedRange.dateFrom, selectedRange.dateTo, state.refunds, timeZone]
  );

  const taxSummary = useMemo(() => {
    const emptySummary = {
      invoiceTax: 0,
      refundTax: 0,
      netPayableTax: 0,
      customerPaidTax: 0,
      customerDueTax: 0,
      authorityPaidTax: 0,
      remainingPayableTax: 0,
      cashTax: 0,
      cardTax: 0,
      accountTax: 0,
      cashRefundTax: 0,
      cardRefundTax: 0,
      accountRefundTax: 0,
      billCount: 0,
      refundCount: 0
    };

    if (!currentShop) {
      return emptySummary;
    }

    const periodBills = state.bills.filter((bill) => {
      if (bill.shopId !== currentShop.id || bill.status === "cancelled") {
        return false;
      }

      const businessDate = getEntryBusinessDate(bill.createdAt, timeZone, bill.businessDate);

      return businessDate >= selectedRange.dateFrom && businessDate <= selectedRange.dateTo;
    });
    const periodRefunds = state.refunds.filter((refund) => {
      if (refund.shopId !== currentShop.id) {
        return false;
      }

      const businessDate = getEntryBusinessDate(refund.returnDate, timeZone, refund.businessDate);

      return businessDate >= selectedRange.dateFrom && businessDate <= selectedRange.dateTo;
    });
    const refundTaxAmount = (refund: (typeof periodRefunds)[number]) => {
      const originalBill = state.bills.find((bill) => bill.id === refund.originalBillId);

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

        const paidRatio = Math.min(Math.max(bill.paidAmount, 0), bill.total) / bill.total;

        return sum + bill.taxAmount * paidRatio;
      }, 0)
    );
    const cashTax = roundMoney(
      periodBills.filter((bill) => bill.paymentMethod === "cash").reduce((sum, bill) => sum + bill.taxAmount, 0)
    );
    const cardTax = roundMoney(
      periodBills.filter((bill) => bill.paymentMethod === "card").reduce((sum, bill) => sum + bill.taxAmount, 0)
    );
    const accountTax = roundMoney(
      periodBills.filter((bill) => bill.paymentMethod === "account").reduce((sum, bill) => sum + bill.taxAmount, 0)
    );
    const cashRefundTax = roundMoney(
      periodRefunds.filter((refund) => refund.paymentMethod === "cash").reduce((sum, refund) => sum + refundTaxAmount(refund), 0)
    );
    const cardRefundTax = roundMoney(
      periodRefunds.filter((refund) => refund.paymentMethod === "card").reduce((sum, refund) => sum + refundTaxAmount(refund), 0)
    );
    const accountRefundTax = roundMoney(
      periodRefunds.filter((refund) => refund.paymentMethod === "account").reduce((sum, refund) => sum + refundTaxAmount(refund), 0)
    );
    const netPayableTax = roundMoney(invoiceTax - refundTax);
    const taxCashOutPayments = roundMoney(
      state.cashMovements
        .filter(
          (movement) =>
            movement.shopId === currentShop.id &&
            movement.type === "cash_out" &&
            movement.businessDate >= selectedRange.dateFrom &&
            movement.businessDate <= selectedRange.dateTo &&
            isTaxAuthorityPaymentText(movement.reason)
        )
        .reduce((sum, movement) => sum + movement.amount, 0)
    );
    const taxLedgerPayments = roundMoney(
      state.ledgerEntries
        .filter(
          (entry) =>
            entry.shopId === currentShop.id &&
            entry.referenceType === "cash_movement" &&
            entry.debit > 0 &&
            entry.businessDate >= selectedRange.dateFrom &&
            entry.businessDate <= selectedRange.dateTo &&
            isTaxAuthorityPaymentText(`${entry.accountName} ${entry.memo}`)
        )
        .reduce((sum, entry) => sum + entry.debit, 0)
    );
    const authorityPaidTax = roundMoney(Math.min(netPayableTax, Math.max(taxCashOutPayments, taxLedgerPayments)));

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
      accountRefundTax,
      billCount: periodBills.length,
      refundCount: periodRefunds.length
    };
  }, [
    currentShop,
    selectedRange.dateFrom,
    selectedRange.dateTo,
    state.bills,
    state.cashMovements,
    state.ledgerEntries,
    state.refunds,
    timeZone
  ]);

  const filteredLedgerEntries = useMemo(
    () =>
      state.ledgerEntries
        .filter(
          (entry) =>
            entry.shopId === currentShop?.id &&
            entry.businessDate >= selectedRange.dateFrom &&
            entry.businessDate <= selectedRange.dateTo
        )
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()),
    [currentShop?.id, selectedRange.dateFrom, selectedRange.dateTo, state.ledgerEntries]
  );

  const ledgerControlTotals = useMemo(
    () => getLedgerControlTotals(filteredLedgerEntries),
    [filteredLedgerEntries]
  );

  const ledgerAccountRows = useMemo(
    () => summarizeLedgerByAccount(filteredLedgerEntries),
    [filteredLedgerEntries]
  );

  const profitTaxView = useMemo(
    () => ({
      grossSalesExcludingTax: roundMoney((financialSummary?.grossSales ?? 0) - taxSummary.invoiceTax),
      netSalesExcludingTax: roundMoney((financialSummary?.netSales ?? 0) - taxSummary.netPayableTax),
      profitBeforeVatPayable: roundMoney(financialSummary?.netProfit ?? 0),
      profitAfterVatPayable: roundMoney((financialSummary?.netProfit ?? 0) - taxSummary.remainingPayableTax)
    }),
    [financialSummary, taxSummary]
  );

  const handleDownloadProfitLoss = async () => {
    if (!financialSummary || !currentShop || !hasSummaryActivity(financialSummary)) {
      setExportFeedback(t("reports.exportUnavailable"));
      return;
    }

    setIsExporting(true);
    setExportFeedback(null);

    try {
      const pdfBlob = await createStructuredReportPdfBlob({
        generatedAt: formatDateTime(new Date().toISOString(), "en"),
        logoUrl: currentSettings?.pos.logoUrl,
        period: selectedRangeLabel,
        shopName: currentShop.name,
        subtitle: "Accounting report with sales, refunds, VAT, receivables, expense, and ledger controls",
        title: "Profit & Loss Accounting Report",
        sections: [
          {
            title: "Executive summary",
            rows: [
              { label: "Gross sales", value: formatCurrency(financialSummary.grossSales, currency, "en") },
              { label: "Gross sales excluding VAT", value: formatCurrency(profitTaxView.grossSalesExcludingTax, currency, "en") },
              { label: "Refunds and returns", value: formatCurrency(-financialSummary.refunds, currency, "en") },
              { label: "Net sales", value: formatCurrency(financialSummary.netSales, currency, "en") },
              { label: "Net sales excluding VAT", value: formatCurrency(profitTaxView.netSalesExcludingTax, currency, "en") },
              { label: "Gross profit", value: formatCurrency(financialSummary.grossProfit, currency, "en") },
              { label: "Expenses", value: formatCurrency(-financialSummary.expenses, currency, "en") },
              { label: "Net profit before VAT payable", value: formatCurrency(profitTaxView.profitBeforeVatPayable, currency, "en") },
              {
                label: "Net profit after remaining VAT payable",
                value: formatCurrency(profitTaxView.profitAfterVatPayable, currency, "en")
              }
            ]
          },
          {
            title: "VAT payable and profit view",
            rows: [
              { label: "Invoice VAT", value: formatCurrency(taxSummary.invoiceTax, currency, "en") },
              { label: "VAT reversed from refunds", value: formatCurrency(-taxSummary.refundTax, currency, "en") },
              { label: "Net VAT payable", value: formatCurrency(taxSummary.netPayableTax, currency, "en") },
              {
                label: "VAT paid to authority",
                value: formatCurrency(taxSummary.authorityPaidTax, currency, "en"),
                detail: "Detected from VAT/tax cash-out or ledger rows in this period."
              },
              { label: "Remaining VAT payable", value: formatCurrency(taxSummary.remainingPayableTax, currency, "en") },
              {
                label: "Profit after remaining VAT payable",
                value: formatCurrency(profitTaxView.profitAfterVatPayable, currency, "en")
              }
            ]
          },
          {
            title: "Sales and returns movement",
            rows: [
              { label: "Bill count", value: String(financialSummary.billCount) },
              { label: "Refund count", value: String(financialSummary.refundCount) },
              {
                label: "Returns from previous days",
                value: formatCurrency(-financialSummary.returnsFromPreviousDays, currency, "en"),
                detail: "Shown in the return date period without editing the original sale date."
              },
              { label: "Same-day returns", value: formatCurrency(-financialSummary.sameDayReturns, currency, "en") },
              { label: "Profit adjustments from returns", value: formatCurrency(-financialSummary.profitAdjustments, currency, "en") }
            ]
          },
          {
            title: "Payment, receivable, and refund split",
            rows: [
              { label: "Cash sales", value: formatCurrency(financialSummary.cashSales, currency, "en") },
              { label: "Card sales", value: formatCurrency(financialSummary.cardSales, currency, "en") },
              { label: "Account / pay later sales", value: formatCurrency(financialSummary.accountSales, currency, "en") },
              { label: "Cash refunds", value: formatCurrency(-financialSummary.cashRefunds, currency, "en") },
              { label: "Card refunds", value: formatCurrency(-financialSummary.cardRefunds, currency, "en") },
              { label: "Account refunds", value: formatCurrency(-financialSummary.accountRefunds, currency, "en") }
            ]
          },
          {
            title: "Ledger control totals",
            rows: [
              { label: "Total debits", value: formatCurrency(ledgerControlTotals.debit, currency, "en") },
              { label: "Total credits", value: formatCurrency(ledgerControlTotals.credit, currency, "en") },
              {
                label: "Trial balance difference",
                value: formatCurrency(ledgerControlTotals.difference, currency, "en"),
                detail: ledgerControlTotals.difference === 0 ? "Balanced for this report period." : "Review ledger rows before closing accounts."
              },
              { label: "Ledger rows", value: String(filteredLedgerEntries.length) }
            ]
          },
          {
            title: "Ledger by account",
            rows:
              ledgerAccountRows.length > 0
                ? ledgerAccountRows.map((entry) => ({
                    label: `${entry.accountCode} ${entry.accountName}`,
                    value: `Dr ${formatCurrency(entry.debit, currency, "en")} | Cr ${formatCurrency(entry.credit, currency, "en")}`,
                    detail: `Net ${formatCurrency(entry.net, currency, "en")}`
                  }))
                : [{ label: "No ledger rows", value: "-" }]
          },
          {
            title: "Refund audit trail",
            rows:
              filteredRefunds.length > 0
                ? filteredRefunds.slice(0, 24).map((refund) => {
                    const originalBill = state.bills.find((entry) => entry.id === refund.originalBillId);

                    return {
                      label: `${originalBill?.number ?? refund.originalBillId} | ${formatDateTime(refund.returnDate, "en")}`,
                      value: formatCurrency(refund.amount, currency, "en"),
                      detail: `${refund.reason} | original sale ${refund.originalSaleDate}`
                    };
                  })
                : [{ label: "No refunds in this period", value: "-" }]
          }
        ]
      });

      downloadBlob(
        pdfBlob,
        buildProfitLossFileName(currentShop.name, `${selectedRange.dateFrom}-to-${selectedRange.dateTo}`)
      );
      setExportFeedback(t("reports.exportDownloaded"));
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadCurrentReport = async () => {
    if (activeView === "profit") {
      await handleDownloadProfitLoss();
      return;
    }

    if (!currentShop) {
      return;
    }

    setIsExporting(true);
    setExportFeedback(null);

    try {
      const titleByView: Record<ReportView, string> = {
        overview: "Sales Overview Report",
        profit: "Profit & Loss Report",
        cashier: "Sales by Employee Report",
        inventory: "Inventory Report",
        refunds: "Refund Report",
        tax: "Tax Payable Report"
      };
      const sections =
        activeView === "cashier"
          ? [
              {
                title: t("reports.salesByEmployee"),
                rows:
                  cashierPerformance.length > 0
                    ? cashierPerformance.slice(0, 60).map((entry) => ({
                        label: `${entry.userName} (${entry.billCount})`,
                        value: formatCurrency(entry.netSales, currency, "en")
                      }))
                    : [{ label: t("reports.rangeEmpty"), value: "-" }]
              },
              {
                title: t("reports.cashRegisterTitle"),
                rows: liveShiftSummary
                  ? [
                      { label: t("cashControl.openingCash"), value: formatCurrency(liveShiftSummary.openingCash, currency, "en") },
                      { label: t("cashControl.cashSales"), value: formatCurrency(liveShiftSummary.cashSales, currency, "en") },
                      { label: t("cashControl.cashIn"), value: formatCurrency(liveShiftSummary.cashIn, currency, "en") },
                      { label: t("cashControl.cashOut"), value: formatCurrency(liveShiftSummary.cashOut, currency, "en") },
                      { label: t("cashControl.expectedCash"), value: formatCurrency(liveShiftSummary.expectedCash, currency, "en") }
                    ]
                  : [{ label: t("reports.waitingForShift"), value: "-" }]
              }
            ]
          : activeView === "inventory"
            ? [
                {
                  title: t("reports.inventoryReportTitle"),
                  rows: [
                    { label: t("reports.inventoryItems"), value: String(inventorySummary.itemCount) },
                    { label: t("reports.inventoryUnits"), value: String(inventorySummary.unitsOnHand) },
                    { label: t("reports.inventoryCostValue"), value: formatCurrency(inventorySummary.costValue, currency, "en") },
                    { label: t("reports.inventorySalesValue"), value: formatCurrency(inventorySummary.salesValue, currency, "en") },
                    { label: t("reports.lowStockItems"), value: String(inventorySummary.lowStockCount) }
                  ]
                },
                {
                  title: t("reports.lowStockItems"),
                  rows:
                    lowStockProducts.length > 0
                      ? lowStockProducts.slice(0, 60).map((product) => ({
                          label: product.name.en,
                          value: `${product.stockQuantity} / ${product.reorderLevel}`
                        }))
                      : [{ label: t("reports.inventoryHealthy"), value: "-" }]
                }
              ]
            : activeView === "refunds"
              ? [
                  {
                    title: t("reports.refundReportTitle"),
                    rows: [
                      { label: t("reports.exportRefundCount"), value: String(filteredRefunds.length) },
                      {
                        label: t("reports.refundsTotal"),
                        value: formatCurrency(filteredRefunds.reduce((sum, refund) => sum + refund.amount, 0), currency, "en")
                      }
                    ]
                  },
                  {
                    title: t("reports.refundReportDesc"),
                    rows:
                      filteredRefunds.length > 0
                        ? filteredRefunds.slice(0, 60).map((refund) => {
                            const bill = state.bills.find((entry) => entry.id === refund.originalBillId);

                            return {
                              label: `${bill?.number ?? refund.originalBillId} - ${refund.reason}`,
                              value: formatCurrency(refund.amount, currency, "en")
                            };
                          })
                        : [{ label: t("reports.noRefunds"), value: "-" }]
                  }
                ]
              : [
                  {
                    title: t("reports.sectionOverview"),
                    rows: financialSummary
                      ? [
                          { label: t("reports.grossSales"), value: formatCurrency(financialSummary.grossSales, currency, "en") },
                          { label: t("reports.refundsTotal"), value: formatCurrency(-financialSummary.refunds, currency, "en") },
                          { label: t("reports.netSalesLabel"), value: formatCurrency(financialSummary.netSales, currency, "en") },
                          { label: t("cashControl.expenses"), value: formatCurrency(-financialSummary.expenses, currency, "en") },
                          { label: t("reports.netProfitLabel"), value: formatCurrency(financialSummary.netProfit, currency, "en") },
                          { label: t("reports.exportBillCount"), value: String(financialSummary.billCount) },
                          { label: t("reports.exportRefundCount"), value: String(financialSummary.refundCount) }
                        ]
                      : [{ label: t("reports.rangeEmpty"), value: "-" }]
                  }
                ];
      const reportSections =
        activeView === "tax"
          ? [
              {
                title: t("reports.taxReportTitle"),
                rows: [
                  { label: t("reports.taxInvoiceOutput"), value: formatCurrency(taxSummary.invoiceTax, currency, "en") },
                  { label: t("reports.taxReversed"), value: formatCurrency(-taxSummary.refundTax, currency, "en") },
                  {
                    label: t("reports.taxNetPayable"),
                    value: formatCurrency(taxSummary.netPayableTax, currency, "en"),
                    detail: t("reports.taxNetPayableDesc")
                  },
                  {
                    label: t("reports.taxPaidByCustomers"),
                    value: formatCurrency(taxSummary.customerPaidTax, currency, "en"),
                    detail: t("reports.taxPaidByCustomersDesc")
                  },
                  {
                    label: t("reports.taxPaidToAuthority"),
                    value: formatCurrency(taxSummary.authorityPaidTax, currency, "en"),
                    detail: t("reports.taxPaidToAuthorityDesc")
                  },
                  { label: t("reports.taxRemainingPayable"), value: formatCurrency(taxSummary.remainingPayableTax, currency, "en") }
                ]
              },
              {
                title: t("reports.taxPaymentSplit"),
                rows: [
                  { label: t("common.cash"), value: formatCurrency(taxSummary.cashTax, currency, "en") },
                  { label: t("common.card"), value: formatCurrency(taxSummary.cardTax, currency, "en") },
                  { label: t("common.account"), value: formatCurrency(taxSummary.accountTax, currency, "en") },
                  { label: t("reports.cashRefunds"), value: formatCurrency(-taxSummary.cashRefundTax, currency, "en") },
                  { label: t("reports.cardRefunds"), value: formatCurrency(-taxSummary.cardRefundTax, currency, "en") },
                  { label: t("reports.accountRefunds"), value: formatCurrency(-taxSummary.accountRefundTax, currency, "en") }
                ]
              },
              {
                title: t("reports.exportVolumeSection"),
                rows: [
                  { label: t("reports.exportBillCount"), value: String(taxSummary.billCount) },
                  { label: t("reports.exportRefundCount"), value: String(taxSummary.refundCount) },
                  { label: t("reports.periodLabel"), value: selectedRangeLabel }
                ]
              }
            ]
          : sections;
      const accountingSections = [
        {
          title: "Accounting controls",
          rows: [
            { label: "Total debits", value: formatCurrency(ledgerControlTotals.debit, currency, "en") },
            { label: "Total credits", value: formatCurrency(ledgerControlTotals.credit, currency, "en") },
            {
              label: "Trial balance difference",
              value: formatCurrency(ledgerControlTotals.difference, currency, "en"),
              detail: ledgerControlTotals.difference === 0 ? "Balanced for this report period." : "Review ledger rows before close."
            },
            { label: "Ledger rows", value: String(filteredLedgerEntries.length) }
          ]
        },
        {
          title: "Ledger accounts",
          rows:
            ledgerAccountRows.length > 0
              ? ledgerAccountRows.slice(0, 24).map((entry) => ({
                  label: `${entry.accountCode} ${entry.accountName}`,
                  value: `Dr ${formatCurrency(entry.debit, currency, "en")} | Cr ${formatCurrency(entry.credit, currency, "en")}`,
                  detail: `Net ${formatCurrency(entry.net, currency, "en")}`
                }))
              : [{ label: "No ledger rows", value: "-" }]
        }
      ];

      const pdfBlob = await createStructuredReportPdfBlob({
        generatedAt: formatDateTime(new Date().toISOString(), "en"),
        logoUrl: currentSettings?.pos.logoUrl,
        period: selectedRangeLabel,
        sections: [...reportSections, ...accountingSections],
        shopName: currentShop.name,
        subtitle: t("reports.rangeSubtitle"),
        title: titleByView[activeView]
      });
      const fileShop = currentShop.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "shop";

      downloadBlob(pdfBlob, `${activeView}-report-${selectedRange.dateFrom}-to-${selectedRange.dateTo}-${fileShop}.pdf`);
      setExportFeedback(t("reports.exportDownloaded"));
    } finally {
      setIsExporting(false);
    }
  };

  const hasRangeData = financialSummary ? hasSummaryActivity(financialSummary) : false;

  return (
    <div className="space-y-6">
      <WorkspaceSectionsNav
        compact
        items={[
          {
            href: "/reports?view=overview",
            active: activeView === "overview",
            label: t("reports.sectionOverview"),
            description: t("reports.sectionOverviewDesc")
          },
          {
            href: "/reports?view=profit",
            active: activeView === "profit",
            label: t("reports.sectionProfitLoss"),
            description: t("reports.sectionProfitLossDesc")
          },
          {
            href: "/reports?view=cashier",
            active: activeView === "cashier",
            label: t("reports.sectionCashier"),
            description: t("reports.sectionCashierDesc")
          },
          {
            href: "/reports?view=inventory",
            active: activeView === "inventory",
            label: t("reports.sectionInventory"),
            description: t("reports.sectionInventoryDesc")
          },
          {
            href: "/reports?view=refunds",
            active: activeView === "refunds",
            label: t("reports.sectionRefunds"),
            description: t("reports.sectionRefundsDesc")
          },
          {
            href: "/reports?view=tax",
            active: activeView === "tax",
            label: t("reports.sectionTax"),
            description: t("reports.sectionTaxDesc")
          }
        ]}
      />

      <Card className="p-5">
        <div className="flex flex-col gap-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-olive">
              {t("reports.rangeTitle")}
            </p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-ink">
              {selectedRangeLabel}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{t("reports.rangeSubtitle")}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            {([
              { key: "today", label: t("common.today") },
              { key: "yesterday", label: t("common.yesterday") },
              { key: "week", label: t("common.thisWeek") },
              { key: "month", label: t("common.thisMonth") },
              { key: "year", label: t("common.thisYear") },
              { key: "custom", label: t("common.customRange") }
            ] as const).map((preset) => (
              <button
                key={preset.key}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  rangePreset === preset.key
                    ? "bg-slate-950 text-white shadow-[0_18px_32px_rgba(15,23,42,0.12)]"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
                onClick={() => setRangePreset(preset.key)}
                type="button"
              >
                {preset.label}
              </button>
            ))}
          </div>

          {rangePreset === "custom" ? (
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">{t("common.fromDate")}</label>
                <Input type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">{t("common.toDate")}</label>
                <Input type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} />
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button className="gap-2" disabled={isExporting} onClick={handleDownloadCurrentReport} variant="secondary">
              <Download className="h-4 w-4" />
              {isExporting ? t("common.loading") : t("reports.exportCurrentPdf")}
            </Button>
            {exportFeedback ? <p className="text-sm font-medium text-emerald-700">{exportFeedback}</p> : null}
          </div>
        </div>
      </Card>

      {activeView === "overview" ? (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              description={t("reports.sectionOverviewDesc")}
              label={t("reports.grossSales")}
              value={formatCurrency(financialSummary?.grossSales ?? 0, currency, locale)}
            />
            <MetricCard
              description={t("reports.exportDescription")}
              label={t("reports.netSalesLabel")}
              value={formatCurrency(financialSummary?.netSales ?? 0, currency, locale)}
            />
            <MetricCard
              description={t("reports.sectionProfitLossDesc")}
              label={t("reports.netProfitLabel")}
              value={formatCurrency(financialSummary?.netProfit ?? 0, currency, locale)}
            />
            <MetricCard
              description={t("reports.salesByEmployeeDesc")}
              label={t("reports.salesByEmployee")}
              value={cashierPerformance.length}
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            <Card className="p-6">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-ink" />
                <h2 className="font-display text-2xl font-semibold text-ink">{t("reports.sectionProfitLoss")}</h2>
              </div>
              {financialSummary && hasRangeData ? (
                <div className="mt-5 space-y-3">
                  <SummaryRow label={t("reports.grossSales")} value={formatCurrency(financialSummary.grossSales, currency, locale)} />
                  <SummaryRow label={t("reports.refundsTotal")} value={formatCurrency(-financialSummary.refunds, currency, locale)} />
                  <SummaryRow label={t("reports.netSalesLabel")} value={formatCurrency(financialSummary.netSales, currency, locale)} />
                  <SummaryRow label={t("cashControl.expenses")} value={formatCurrency(-financialSummary.expenses, currency, locale)} />
                  <SummaryRow label={t("reports.netProfitLabel")} value={formatCurrency(financialSummary.netProfit, currency, locale)} />
                </div>
              ) : (
                <p className="mt-5 text-sm leading-6 text-slate-600">{t("reports.rangeEmpty")}</p>
              )}
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-2">
                <Users2 className="h-5 w-5 text-ink" />
                <h2 className="font-display text-2xl font-semibold text-ink">{t("reports.salesByEmployee")}</h2>
              </div>
              <div className="mt-5 space-y-3">
                {cashierPerformance.length > 0 ? (
                  cashierPerformance.slice(0, 5).map((entry) => (
                    <div key={entry.userId} className="rounded-3xl border border-line bg-shell px-4 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-ink">{entry.userName}</p>
                          <p className="mt-1 text-sm text-slate-600">
                            {entry.billCount} {t("reports.exportBillCount").toLowerCase()}
                          </p>
                        </div>
                        <Badge variant="success">{formatCurrency(entry.netSales, currency, locale)}</Badge>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm leading-6 text-slate-600">{t("reports.rangeEmpty")}</p>
                )}
              </div>
            </Card>
          </div>
        </div>
      ) : null}

      {activeView === "profit" ? (
        <div className="space-y-6">
          <Card className="p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-olive">
                  {t("reports.exportTitle")}
                </p>
                <h2 className="mt-2 font-display text-2xl font-semibold text-ink">
                  {t("reports.exportProfitLoss")}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">{selectedRangeLabel}</p>
                {exportFeedback ? <p className="mt-2 text-sm font-medium text-emerald-700">{exportFeedback}</p> : null}
              </div>
              <Button
                className="gap-2 self-start lg:self-auto"
                disabled={!financialSummary || !hasRangeData || isExporting}
                onClick={handleDownloadProfitLoss}
                variant="secondary"
              >
                <Download className="h-4 w-4" />
                {isExporting ? t("common.loading") : t("reports.exportProfitLoss")}
              </Button>
            </div>
          </Card>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              description={t("reports.sectionProfitLossDesc")}
              label={t("reports.grossSales")}
              value={formatCurrency(financialSummary?.grossSales ?? 0, currency, locale)}
            />
            <MetricCard
              description={t("reports.refundsTotal")}
              label={t("reports.refundsTotal")}
              value={formatCurrency(-(financialSummary?.refunds ?? 0), currency, locale)}
            />
            <MetricCard
              description={t("reports.sectionProfitLossDesc")}
              label={t("reports.grossProfit")}
              value={formatCurrency(financialSummary?.grossProfit ?? 0, currency, locale)}
            />
            <MetricCard
              description={t("reports.sectionProfitLossDesc")}
              label={t("reports.netProfitLabel")}
              value={formatCurrency(financialSummary?.netProfit ?? 0, currency, locale)}
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            <Card className="p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-olive">{t("reports.periodLabel")}</p>
                  <h2 className="mt-2 font-display text-2xl font-semibold text-ink">{selectedRangeLabel}</h2>
                </div>
                <Badge variant={hasRangeData ? "success" : "neutral"}>
                  {hasRangeData ? `${financialSummary?.billCount ?? 0} ${t("common.items")}` : t("reports.dayClosed")}
                </Badge>
              </div>

              {financialSummary && hasRangeData ? (
                <div className="mt-6 space-y-4">
                  <div className="rounded-3xl bg-shell p-4">
                    <p className="text-sm font-semibold text-ink">{selectedRangeLabel}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{t("reports.closedDayHint")}</p>
                  </div>
                  <div className="space-y-3">
                    <SummaryRow label={t("reports.grossSales")} value={formatCurrency(financialSummary.grossSales, currency, locale)} />
                    <SummaryRow label={t("reports.refundsTotal")} value={formatCurrency(-financialSummary.refunds, currency, locale)} />
                    <SummaryRow
                      label={t("reports.returnsPreviousDays")}
                      value={formatCurrency(-financialSummary.returnsFromPreviousDays, currency, locale)}
                    />
                    <SummaryRow
                      label={t("reports.sameDayReturns")}
                      value={formatCurrency(-financialSummary.sameDayReturns, currency, locale)}
                    />
                    <SummaryRow label={t("reports.netSalesLabel")} value={formatCurrency(financialSummary.netSales, currency, locale)} />
                    <SummaryRow label="Net sales excluding VAT" value={formatCurrency(profitTaxView.netSalesExcludingTax, currency, locale)} />
                    <SummaryRow label={t("reports.grossProfit")} value={formatCurrency(financialSummary.grossProfit, currency, locale)} />
                    <SummaryRow
                      label={t("reports.profitAdjustments")}
                      value={formatCurrency(-financialSummary.profitAdjustments, currency, locale)}
                    />
                    <SummaryRow label={t("cashControl.expenses")} value={formatCurrency(-financialSummary.expenses, currency, locale)} />
                    <SummaryRow label="Net profit before VAT payable" value={formatCurrency(profitTaxView.profitBeforeVatPayable, currency, locale)} />
                    <SummaryRow label={t("reports.taxRemainingPayable")} value={formatCurrency(taxSummary.remainingPayableTax, currency, locale)} />
                    <SummaryRow label="Net profit after VAT payable" value={formatCurrency(profitTaxView.profitAfterVatPayable, currency, locale)} />
                  </div>
                </div>
              ) : (
                <div className="mt-6 rounded-3xl border border-dashed border-line bg-shell/70 p-5 text-sm leading-6 text-slate-600">
                  {t("reports.rangeEmpty")}
                </div>
              )}
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-2">
                <WalletCards className="h-5 w-5 text-ink" />
                <h2 className="font-display text-2xl font-semibold text-ink">{t("reports.paymentBreakdown")}</h2>
              </div>
              {financialSummary && hasRangeData ? (
                <div className="mt-5 space-y-3">
                  <SummaryRow label={t("cashControl.cashSales")} value={formatCurrency(financialSummary.cashSales, currency, locale)} />
                  <SummaryRow label={t("cashControl.cardSales")} value={formatCurrency(financialSummary.cardSales, currency, locale)} />
                  <SummaryRow label={t("cashControl.accountSales")} value={formatCurrency(financialSummary.accountSales, currency, locale)} />
                  <SummaryRow label={t("reports.cashRefunds")} value={formatCurrency(-financialSummary.cashRefunds, currency, locale)} />
                  <SummaryRow label={t("reports.cardRefunds")} value={formatCurrency(-financialSummary.cardRefunds, currency, locale)} />
                  <SummaryRow label={t("reports.accountRefunds")} value={formatCurrency(-financialSummary.accountRefunds, currency, locale)} />
                </div>
              ) : (
                <p className="mt-5 text-sm leading-6 text-slate-600">{t("reports.rangeEmpty")}</p>
              )}
            </Card>
          </div>
        </div>
      ) : null}

      {activeView === "tax" ? (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              description={t("reports.taxInvoiceOutputDesc")}
              label={t("reports.taxInvoiceOutput")}
              value={formatCurrency(taxSummary.invoiceTax, currency, locale)}
            />
            <MetricCard
              description={t("reports.taxReversedDesc")}
              label={t("reports.taxReversed")}
              value={formatCurrency(-taxSummary.refundTax, currency, locale)}
            />
            <MetricCard
              description={t("reports.taxNetPayableDesc")}
              label={t("reports.taxNetPayable")}
              value={formatCurrency(taxSummary.netPayableTax, currency, locale)}
            />
            <MetricCard
              description={t("reports.taxPaidByCustomersDesc")}
              label={t("reports.taxPaidByCustomers")}
              value={formatCurrency(taxSummary.customerPaidTax, currency, locale)}
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            <Card className="p-6">
              <div className="flex items-center gap-2">
                <ReceiptText className="h-5 w-5 text-ink" />
                <div>
                  <h2 className="font-display text-2xl font-semibold text-ink">{t("reports.taxReportTitle")}</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{selectedRangeLabel}</p>
                </div>
              </div>

              <div className="mt-6 space-y-3">
                <SummaryRow label={t("reports.taxInvoiceOutput")} value={formatCurrency(taxSummary.invoiceTax, currency, locale)} />
                <SummaryRow label={t("reports.taxReversed")} value={formatCurrency(-taxSummary.refundTax, currency, locale)} />
                <SummaryRow label={t("reports.taxNetPayable")} value={formatCurrency(taxSummary.netPayableTax, currency, locale)} />
                <SummaryRow label={t("reports.taxPaidByCustomers")} value={formatCurrency(taxSummary.customerPaidTax, currency, locale)} />
                <SummaryRow label={t("reports.taxCustomerDue")} value={formatCurrency(taxSummary.customerDueTax, currency, locale)} />
                <SummaryRow label={t("reports.taxPaidToAuthority")} value={formatCurrency(taxSummary.authorityPaidTax, currency, locale)} />
                <SummaryRow label={t("reports.taxRemainingPayable")} value={formatCurrency(taxSummary.remainingPayableTax, currency, locale)} />
              </div>

              <div className="mt-5 rounded-3xl border border-dashed border-line bg-shell/70 p-4 text-sm leading-6 text-slate-600">
                {t("reports.taxPaidToAuthorityDesc")}
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-2">
                <WalletCards className="h-5 w-5 text-ink" />
                <div>
                  <h2 className="font-display text-2xl font-semibold text-ink">{t("reports.taxPaymentSplit")}</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{t("reports.taxPaymentSplitDesc")}</p>
                </div>
              </div>

              <div className="mt-6 space-y-3">
                <SummaryRow label={t("common.cash")} value={formatCurrency(taxSummary.cashTax, currency, locale)} />
                <SummaryRow label={t("common.card")} value={formatCurrency(taxSummary.cardTax, currency, locale)} />
                <SummaryRow label={t("common.account")} value={formatCurrency(taxSummary.accountTax, currency, locale)} />
                <SummaryRow label={t("reports.cashRefunds")} value={formatCurrency(-taxSummary.cashRefundTax, currency, locale)} />
                <SummaryRow label={t("reports.cardRefunds")} value={formatCurrency(-taxSummary.cardRefundTax, currency, locale)} />
                <SummaryRow label={t("reports.accountRefunds")} value={formatCurrency(-taxSummary.accountRefundTax, currency, locale)} />
              </div>
            </Card>
          </div>
        </div>
      ) : null}

      {activeView === "cashier" ? (
        <div className="space-y-6">
          <Card className="p-6">
            <div className="flex items-center gap-2">
              <Users2 className="h-5 w-5 text-ink" />
              <div>
                <h2 className="font-display text-2xl font-semibold text-ink">{t("reports.salesByEmployee")}</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">{t("reports.salesByEmployeeDesc")}</p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              {cashierPerformance.length > 0 ? (
                cashierPerformance.map((entry) => (
                  <div key={entry.userId} className="rounded-3xl border border-line bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-ink">{entry.userName}</p>
                        <p className="mt-1 text-sm text-slate-600">
                          {entry.billCount} {t("reports.exportBillCount").toLowerCase()}
                        </p>
                      </div>
                      <Badge variant="success">{formatCurrency(entry.netSales, currency, locale)}</Badge>
                    </div>
                    <div className="mt-4 space-y-2">
                      <SummaryRow label={t("reports.grossSales")} value={formatCurrency(entry.grossSales, currency, locale)} />
                      <SummaryRow label={t("reports.refundsProcessed")} value={formatCurrency(-entry.refunds, currency, locale)} />
                      <SummaryRow label={t("reports.netSalesLabel")} value={formatCurrency(entry.netSales, currency, locale)} />
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm leading-6 text-slate-600">{t("reports.rangeEmpty")}</p>
              )}
            </div>
          </Card>

          <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            <Card className="p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-olive">{t("reports.shiftLabel")}</p>
                  <h2 className="mt-2 font-display text-2xl font-semibold text-ink">{t("reports.shiftTitle")}</h2>
                </div>
                <Badge variant={currentShift ? "success" : "neutral"}>
                  {currentShift ? t("reports.shiftOpen") : t("reports.shiftClosed")}
                </Badge>
              </div>

              {currentShift && liveShiftSummary ? (
                <div className="mt-6 space-y-4">
                  <div className="rounded-3xl bg-shell p-4">
                    <p className="text-sm font-semibold text-ink">{formatDateTime(currentShift.startedAt, locale)}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{t("reports.liveShiftHint")}</p>
                  </div>
                  <div className="space-y-3">
                    <SummaryRow label={t("cashControl.openingCash")} value={formatCurrency(liveShiftSummary.openingCash, currency, locale)} />
                    <SummaryRow label={t("cashControl.cashSales")} value={formatCurrency(liveShiftSummary.cashSales, currency, locale)} />
                    <SummaryRow label={t("cashControl.cashIn")} value={formatCurrency(liveShiftSummary.cashIn, currency, locale)} />
                    <SummaryRow label={t("cashControl.cashOut")} value={formatCurrency(liveShiftSummary.cashOut, currency, locale)} />
                    <SummaryRow label={t("cashControl.expectedCash")} value={formatCurrency(liveShiftSummary.expectedCash, currency, locale)} />
                  </div>
                </div>
              ) : latestShift && latestShiftSummary ? (
                <div className="mt-6 space-y-4">
                  <div className="rounded-3xl bg-shell p-4">
                    <p className="text-sm font-semibold text-ink">{formatDateTime(latestShift.endedAt, locale)}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{t("reports.latestShiftHint")}</p>
                  </div>
                  <div className="space-y-3">
                    <SummaryRow label={t("cashControl.expectedCash")} value={formatCurrency(latestShiftSummary.expectedCash, currency, locale)} />
                    <SummaryRow label={t("cashControl.countedCash")} value={formatCurrency(latestShiftSummary.countedCash ?? 0, currency, locale)} />
                    <SummaryRow label={t("cashControl.difference")} value={formatCurrency(latestShiftSummary.difference ?? 0, currency, locale)} />
                  </div>
                </div>
              ) : (
                <div className="mt-6 rounded-3xl border border-dashed border-line bg-shell/70 p-5 text-sm leading-6 text-slate-600">
                  {t("reports.noShiftData")}
                </div>
              )}
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-ink" />
                <h2 className="font-display text-2xl font-semibold text-ink">{t("reports.cashRegisterTitle")}</h2>
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-600">{t("reports.cashFormula")}</p>
              {liveShiftSummary ? (
                <div className="mt-5 space-y-3">
                  <SummaryRow label={t("cashControl.openingCash")} value={formatCurrency(liveShiftSummary.openingCash, currency, locale)} />
                  <SummaryRow label={t("cashControl.cashSales")} value={formatCurrency(liveShiftSummary.cashSales, currency, locale)} />
                  <SummaryRow label={t("cashControl.cashIn")} value={formatCurrency(liveShiftSummary.cashIn, currency, locale)} />
                  <SummaryRow label={t("cashControl.cashOut")} value={formatCurrency(liveShiftSummary.cashOut, currency, locale)} />
                  <SummaryRow label={t("cashControl.expectedCash")} value={formatCurrency(liveShiftSummary.expectedCash, currency, locale)} />
                </div>
              ) : (
                <p className="mt-5 text-sm leading-6 text-slate-600">{t("reports.waitingForShift")}</p>
              )}
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
            <Card className="p-6">
              <div className="flex items-center gap-2">
                <CalendarRange className="h-5 w-5 text-ink" />
                <h2 className="font-display text-2xl font-semibold text-ink">{t("reports.dayClosingHistory")}</h2>
              </div>
              <div className="mt-5 space-y-3">
                {filteredDayCloses.length > 0 ? (
                  filteredDayCloses.map((dayClose) => (
                    <div key={dayClose.id} className="rounded-3xl bg-shell p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-ink">{formatBusinessDate(dayClose.businessDate, locale)}</p>
                        <Badge variant={dayClose.cashDifference === 0 ? "success" : "warning"}>
                          {formatCurrency(dayClose.cashDifference, currency, locale)}
                        </Badge>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">{formatDateTime(dayClose.closedAt, locale)}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm leading-6 text-slate-600">{t("reports.rangeEmpty")}</p>
                )}
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-2">
                <Clock3 className="h-5 w-5 text-ink" />
                <h2 className="font-display text-2xl font-semibold text-ink">{t("reports.shiftHistory")}</h2>
              </div>
              <div className="mt-5 space-y-3">
                {filteredShopShifts.length > 0 ? (
                  filteredShopShifts.map((shift) => {
                    const cashier = state.users.find((user) => user.id === shift.cashierId);

                    return (
                      <div key={shift.id} className="rounded-3xl bg-shell p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-ink">{cashier?.name ?? t("common.notAvailable")}</p>
                          <Badge variant={shift.endedAt ? "neutral" : "success"}>
                            {shift.endedAt ? t("reports.shiftClosed") : t("reports.shiftOpen")}
                          </Badge>
                        </div>
                        <p className="mt-2 text-sm text-slate-600">{formatDateTime(shift.startedAt, locale)}</p>
                        <p className="mt-1 text-sm text-slate-600">{formatBusinessDate(shift.businessDate, locale)}</p>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-sm leading-6 text-slate-600">{t("reports.rangeEmpty")}</p>
                )}
              </div>
            </Card>
          </div>

          <Card className="p-6">
            <div className="flex items-center gap-2">
              <WalletCards className="h-5 w-5 text-ink" />
              <h2 className="font-display text-2xl font-semibold text-ink">{t("reports.cashMovementLog")}</h2>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filteredMovements.length > 0 ? (
                filteredMovements.map((movement) => (
                  <div key={movement.id} className="rounded-3xl bg-shell p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-ink">
                        {movement.type === "cash_in" ? t("cashControl.cashIn") : t("cashControl.cashOut")}
                      </p>
                      <Badge variant={movement.type === "cash_in" ? "success" : "warning"}>
                        {formatCurrency(movement.amount, currency, locale)}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">{movement.reason}</p>
                    <p className="mt-2 text-xs text-slate-500">{formatDateTime(movement.createdAt, locale)}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm leading-6 text-slate-600">{t("reports.rangeEmpty")}</p>
              )}
            </div>
          </Card>
        </div>
      ) : null}

      {activeView === "inventory" ? (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <MetricCard
              description={t("reports.inventoryReportDesc")}
              label={t("reports.inventoryItems")}
              value={inventorySummary.itemCount}
            />
            <MetricCard
              description={t("reports.inventoryReportDesc")}
              label={t("reports.inventoryUnits")}
              value={inventorySummary.unitsOnHand}
            />
            <MetricCard
              description={t("reports.inventoryReportDesc")}
              label={t("reports.inventoryCostValue")}
              value={formatCurrency(inventorySummary.costValue, currency, locale)}
            />
            <MetricCard
              description={t("reports.inventoryReportDesc")}
              label={t("reports.inventorySalesValue")}
              value={formatCurrency(inventorySummary.salesValue, currency, locale)}
            />
            <MetricCard
              description={t("reports.lowStockItemsDesc")}
              label={t("reports.lowStockItems")}
              value={inventorySummary.lowStockCount}
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
            <Card className="p-6">
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5 text-ink" />
                <div>
                  <h2 className="font-display text-2xl font-semibold text-ink">{t("reports.lowStockItems")}</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{t("reports.lowStockItemsDesc")}</p>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {lowStockProducts.length > 0 ? (
                  lowStockProducts.map((product) => (
                    <div key={product.id} className="rounded-3xl border border-line bg-white p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-ink">{product.name[locale] || product.name.en}</p>
                          <p className="mt-1 text-sm text-slate-600">
                            {product.stockQuantity} / {product.reorderLevel}
                          </p>
                        </div>
                        <Badge variant="warning">{t("products.reorderNeeded")}</Badge>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-3xl border border-dashed border-line bg-shell/70 p-5 text-sm leading-6 text-slate-600">
                    {t("reports.inventoryHealthy")}
                  </div>
                )}
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-ink" />
                <div>
                  <h2 className="font-display text-2xl font-semibold text-ink">{t("reports.inventoryReportTitle")}</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{t("reports.inventoryReportDesc")}</p>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {highestValueProducts.length > 0 ? (
                  highestValueProducts.map((product) => (
                    <div key={product.id} className="rounded-3xl border border-line bg-shell px-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-ink">{product.name[locale] || product.name.en}</p>
                          <p className="mt-1 text-sm text-slate-600">
                            {product.stockQuantity} {t("reports.inventoryUnits").toLowerCase()}
                          </p>
                        </div>
                        <Badge variant="neutral">
                          {formatCurrency(product.stockQuantity * product.costPrice, currency, locale)}
                        </Badge>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm leading-6 text-slate-600">{t("reports.inventoryHealthy")}</p>
                )}
              </div>
            </Card>
          </div>
        </div>
      ) : null}

      {activeView === "refunds" ? (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard
              description={t("reports.refundReportDesc")}
              label={t("reports.exportRefundCount")}
              value={filteredRefunds.length}
            />
            <MetricCard
              description={t("reports.sectionRefundsDesc")}
              label={t("reports.refundsTotal")}
              value={formatCurrency(filteredRefunds.reduce((sum, refund) => sum + refund.amount, 0), currency, locale)}
            />
            <MetricCard
              description={t("reports.sectionRefundsDesc")}
              label={t("reports.profitAdjustments")}
              value={formatCurrency(filteredRefunds.reduce((sum, refund) => sum + refund.profitAdjustment, 0), currency, locale)}
            />
          </div>

          <Card className="overflow-hidden p-0">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">{t("reports.refundReportTitle")}</h2>
                <p className="text-sm text-slate-500">{t("reports.refundReportDesc")}</p>
              </div>
              <Badge variant="neutral">{selectedRangeLabel}</Badge>
            </div>

            {filteredRefunds.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-[0.14em] text-slate-500">
                    <tr>
                      <th className="px-5 py-3">{t("reports.originalReceipt")}</th>
                      <th className="px-5 py-3">{t("reports.refundDate")}</th>
                      <th className="px-5 py-3">{t("reports.refundReason")}</th>
                      <th className="px-5 py-3">{t("reports.refundAmount")}</th>
                      <th className="px-5 py-3">{t("reports.profitAdjustments")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRefunds.map((refund) => {
                      const originalBill = state.bills.find((bill) => bill.id === refund.originalBillId);

                      return (
                        <tr key={refund.id}>
                          <td className="px-5 py-4 font-semibold text-slate-950">
                            {originalBill?.number ?? refund.originalBillId}
                          </td>
                          <td className="px-5 py-4 text-slate-600">{formatDateTime(refund.returnDate, locale)}</td>
                          <td className="px-5 py-4 text-slate-600">{refund.reason}</td>
                          <td className="px-5 py-4 text-slate-950">{formatCurrency(refund.amount, currency, locale)}</td>
                          <td className="px-5 py-4 text-slate-950">
                            {formatCurrency(refund.profitAdjustment, currency, locale)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-6 text-sm text-slate-600">{t("reports.noRefunds")}</div>
            )}
          </Card>
        </div>
      ) : null}
    </div>
  );
}
