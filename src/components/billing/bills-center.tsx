"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { ArrowRight, Printer, ReceiptText, Search } from "lucide-react";
import { getBusinessDateInTimezone } from "@/lib/cash-control";
import { billStatusLabelKeys, paymentMethodLabelKeys } from "@/lib/i18n";
import { usePosApp } from "@/components/providers/app-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn, formatBusinessDate, formatCurrency, formatDateTime } from "@/lib/utils";
import type { Bill, BillItem, Locale, POSSettings, Shop, User } from "@/types/pos";

type RangePreset = "today" | "yesterday" | "week" | "month" | "year" | "custom";
type BillsTab = "sales" | "refunded";

const PAGE_SIZE = 10;

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

function getPrintableItemName(item: BillItem) {
  return item.productName.en || item.productName.ar || item.productName.ur || "Item";
}

function buildBillsPrintHtml({
  bills,
  billItems,
  cashiers,
  currency,
  locale,
  posSettings,
  shop,
  title
}: {
  bills: Bill[];
  billItems: BillItem[];
  cashiers: User[];
  currency: string;
  locale: Locale;
  posSettings?: POSSettings;
  shop: Shop | null;
  title: string;
}) {
  const shopName = posSettings?.shopName ?? shop?.name ?? "Simple POS";
  const logo = posSettings?.logoUrl?.trim();
  const address = posSettings?.address ?? shop?.address ?? "";
  const phone = posSettings?.phone ?? shop?.phone ?? "";

  const receiptSections = bills
    .map((bill) => {
      const items = billItems.filter((item) => item.billId === bill.id);
      const cashier = cashiers.find((user) => user.id === bill.cashierId);
      const itemRows = items
        .map(
          (item) => `
            <tr>
              <td>
                <strong>${escapeHtml(getPrintableItemName(item))}</strong>
                <span>${escapeHtml(item.quantity)} x ${escapeHtml(formatCurrency(item.unitPrice, currency, locale))}</span>
              </td>
              <td>${escapeHtml(formatCurrency(item.lineTotal, currency, locale))}</td>
            </tr>
          `
        )
        .join("");

      return `
        <section class="receipt">
          <header>
            ${logo ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(shopName)}" />` : ""}
            <h1>${escapeHtml(shopName)}</h1>
            ${address ? `<p>${escapeHtml(address)}</p>` : ""}
            ${phone ? `<p>${escapeHtml(phone)}</p>` : ""}
          </header>
          <div class="meta">
            <p><span>Receipt</span><strong>${escapeHtml(bill.number)}</strong></p>
            <p><span>Date</span><strong>${escapeHtml(formatDateTime(bill.createdAt, locale))}</strong></p>
            <p><span>Customer</span><strong>${escapeHtml(bill.customerName || "Walk-in Customer")}</strong></p>
            <p><span>Cashier</span><strong>${escapeHtml(cashier?.name ?? "Not available")}</strong></p>
            <p><span>Payment</span><strong>${escapeHtml(bill.paymentMethod === "account" ? "Pay later" : bill.paymentMethod)}</strong></p>
            <p><span>Status</span><strong>${escapeHtml(bill.status)}</strong></p>
          </div>
          <table>
            <tbody>${itemRows}</tbody>
          </table>
          <div class="totals">
            <p><span>Subtotal</span><strong>${escapeHtml(formatCurrency(bill.subtotal, currency, locale))}</strong></p>
            <p><span>Discount</span><strong>${escapeHtml(formatCurrency((bill.itemDiscountAmount ?? 0) + bill.discountAmount, currency, locale))}</strong></p>
            <p><span>${escapeHtml(bill.taxName ?? "Tax")}</span><strong>${escapeHtml(formatCurrency(bill.taxAmount, currency, locale))}</strong></p>
            <p class="grand"><span>Total</span><strong>${escapeHtml(formatCurrency(bill.total, currency, locale))}</strong></p>
            <p><span>Paid</span><strong>${escapeHtml(formatCurrency(bill.paidAmount, currency, locale))}</strong></p>
            <p><span>Due</span><strong>${escapeHtml(formatCurrency(bill.dueAmount, currency, locale))}</strong></p>
          </div>
        </section>
      `;
    })
    .join("");

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(title)}</title>
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; background: #eef4f1; color: #07111f; font-family: Arial, sans-serif; }
          .toolbar { align-items: center; background: #07111f; color: #fff; display: flex; justify-content: space-between; padding: 16px 20px; }
          .toolbar h2 { font-size: 18px; margin: 0; }
          .toolbar button { background: #10b981; border: 0; border-radius: 999px; color: #fff; cursor: pointer; font-weight: 700; padding: 10px 18px; }
          .batch { display: grid; gap: 18px; margin: 20px auto; max-width: 760px; padding: 0 14px; }
          .receipt { background: #fff; border: 1px solid #dbe5e1; border-radius: 24px; box-shadow: 0 22px 60px rgba(15, 23, 42, 0.10); padding: 24px; page-break-after: always; }
          header { border-bottom: 1px dashed #cbd5e1; padding-bottom: 16px; text-align: center; }
          header img { display: block; margin: 0 auto 10px; max-height: 56px; max-width: 150px; object-fit: contain; }
          header h1 { font-size: 24px; line-height: 1.15; margin: 0; }
          header p { color: #475569; font-size: 13px; margin: 4px 0 0; }
          .meta { display: grid; gap: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); padding: 16px 0; }
          .meta p, .totals p { align-items: center; display: flex; justify-content: space-between; margin: 0; }
          .meta span, .totals span { color: #64748b; }
          table { border-collapse: collapse; width: 100%; }
          tr { border-top: 1px solid #e2e8f0; }
          td { padding: 12px 0; vertical-align: top; }
          td:first-child span { color: #64748b; display: block; font-size: 12px; margin-top: 4px; }
          td:last-child { font-weight: 700; text-align: right; white-space: nowrap; }
          .totals { border-top: 1px dashed #cbd5e1; display: grid; gap: 9px; margin-top: 14px; padding-top: 14px; }
          .grand { font-size: 20px; }
          @media print {
            body { background: #fff; }
            .toolbar { display: none; }
            .batch { display: block; margin: 0; max-width: none; padding: 0; }
            .receipt { border: 0; border-radius: 0; box-shadow: none; margin: 0; }
          }
        </style>
      </head>
      <body>
        <div class="toolbar">
          <h2>${escapeHtml(title)} - ${bills.length} receipts</h2>
          <button onclick="window.print()">Print now</button>
        </div>
        <main class="batch">${receiptSections}</main>
      </body>
    </html>
  `;
}

export function BillsCenter() {
  const { currentShop, currentShopId, locale, state, t } = usePosApp();
  const [search, setSearch] = useState("");
  const [rangePreset, setRangePreset] = useState<RangePreset>("month");
  const [activeTab, setActiveTab] = useState<BillsTab>("sales");
  const [selectedBillIds, setSelectedBillIds] = useState<Set<string>>(new Set());
  const [printFeedback, setPrintFeedback] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search);
  const todayBusinessDate = getBusinessDateInTimezone(currentShop?.timezone ?? "Asia/Riyadh", new Date());
  const [customFrom, setCustomFrom] = useState(todayBusinessDate);
  const [customTo, setCustomTo] = useState(todayBusinessDate);
  const [currentPage, setCurrentPage] = useState(1);

  const currency = currentShop?.currency ?? "SAR";
  const posSettings = currentShopId ? state.settingsByShop[currentShopId]?.pos : undefined;

  const bills = useMemo(
    () =>
      state.bills
        .filter((bill) => bill.shopId === currentShopId)
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()),
    [currentShopId, state.bills]
  );

  const refundMetaByBillId = useMemo(() => {
    const next = new Map<string, { count: number; total: number }>();

    state.refunds
      .filter((refund) => refund.shopId === currentShopId)
      .forEach((refund) => {
        const current = next.get(refund.originalBillId) ?? { count: 0, total: 0 };
        next.set(refund.originalBillId, {
          count: current.count + 1,
          total: current.total + Math.abs(refund.amount)
        });
      });

    return next;
  }, [currentShopId, state.refunds]);

  const tabBills = useMemo(() => {
    if (activeTab === "refunded") {
      return bills.filter((bill) => bill.status === "refunded" || refundMetaByBillId.has(bill.id));
    }

    return bills;
  }, [activeTab, bills, refundMetaByBillId]);

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

  const filteredBills = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();

    return tabBills.filter((bill) => {
      const businessDate = bill.businessDate ?? bill.createdAt.slice(0, 10);
      const matchesRange =
        businessDate >= selectedRange.dateFrom && businessDate <= selectedRange.dateTo;

      if (!matchesRange) {
        return false;
      }

      if (!query) {
        return true;
      }

      return [bill.number, bill.customerName, bill.customerPhone, bill.customerEmail, bill.createdAt, businessDate]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query));
    });
  }, [deferredSearch, selectedRange.dateFrom, selectedRange.dateTo, tabBills]);

  useEffect(() => {
    setCurrentPage(1);
    setSelectedBillIds(new Set());
  }, [activeTab, deferredSearch, selectedRange.dateFrom, selectedRange.dateTo]);

  const totalPages = Math.max(1, Math.ceil(filteredBills.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedBills = filteredBills.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const rangeStart = filteredBills.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const rangeEnd = filteredBills.length === 0 ? 0 : rangeStart + paginatedBills.length - 1;
  const selectedBills = filteredBills.filter((bill) => selectedBillIds.has(bill.id));
  const refundedBillCount = bills.filter((bill) => bill.status === "refunded" || refundMetaByBillId.has(bill.id)).length;

  const openPrintBatch = (billsToPrint: Bill[], title: string) => {
    setPrintFeedback(null);

    if (billsToPrint.length === 0) {
      setPrintFeedback(t("bills.noSelection"));
      return;
    }

    const printWindow = window.open("", "_blank");

    if (!printWindow) {
      setPrintFeedback(t("bills.printPopupBlocked"));
      return;
    }

    printWindow.document.open();
    printWindow.document.write(
      buildBillsPrintHtml({
        bills: billsToPrint,
        billItems: state.billItems,
        cashiers: state.users,
        currency,
        locale,
        posSettings,
        shop: currentShop ?? null,
        title
      })
    );
    printWindow.document.close();
    printWindow.focus();
    printWindow.setTimeout(() => printWindow.print(), 300);
  };

  const toggleBillSelection = (billId: string) => {
    setSelectedBillIds((current) => {
      const next = new Set(current);

      if (next.has(billId)) {
        next.delete(billId);
      } else {
        next.add(billId);
      }

      return next;
    });
  };

  const selectVisiblePage = () => {
    setSelectedBillIds((current) => {
      const next = new Set(current);

      paginatedBills.forEach((bill) => next.add(bill.id));

      return next;
    });
  };

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-2">
          {([
            {
              key: "sales",
              title: t("bills.salesTab"),
              count: bills.length,
              description: selectedRangeLabel
            },
            {
              key: "refunded",
              title: t("bills.refundedTab"),
              count: refundedBillCount,
              description: t("bills.refundCount", { count: refundedBillCount })
            }
          ] as const).map((tab) => (
            <button
              className={cn(
                "flex items-center justify-between rounded-[26px] border px-5 py-4 text-left transition",
                activeTab === tab.key
                  ? "border-slate-950 bg-slate-950 text-white shadow-[0_18px_45px_rgba(15,23,42,0.16)]"
                  : "border-line bg-white text-ink hover:border-emerald-200 hover:bg-emerald-50/60"
              )}
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              type="button"
            >
              <span>
                <span className="block text-sm font-semibold">{tab.title}</span>
                <span className={cn("mt-1 block text-xs", activeTab === tab.key ? "text-white/72" : "text-slate-500")}>
                  {tab.description}
                </span>
              </span>
              <span className={cn("rounded-full px-3 py-1 text-sm font-semibold", activeTab === tab.key ? "bg-white/14" : "bg-shell")}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </Card>

      <Card className="p-5 scroll-mt-24" id="bills-period">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-olive">{t("bills.rangeTitle")}</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-ink">{selectedRangeLabel}</h2>
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
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-semibold transition",
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
              <label className="mb-2 block text-sm font-medium text-ink">{t("common.fromDate")}</label>
              <Input type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-ink">{t("common.toDate")}</label>
              <Input type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} />
            </div>
          </div>
        ) : null}
      </Card>

      <Card className="p-6 scroll-mt-24" id="bills-results">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-olive">{t("bills.searchLabel")}</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-ink">
              {activeTab === "refunded" ? t("bills.refundedTab") : t("bills.searchTitle")}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {t("common.showingItemsRange", {
                from: String(rangeStart),
                to: String(rangeEnd),
                total: String(filteredBills.length)
              })}
            </p>
          </div>
          <label className="relative block xl:w-[360px]">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-11"
              placeholder={t("bills.searchPlaceholder")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
        </div>

        <div className="mt-5 flex flex-wrap gap-3 rounded-[26px] border border-line bg-shell/60 p-3">
          <Badge variant="neutral">{t("bills.selectedCount", { count: selectedBills.length })}</Badge>
          <Button className="h-11 rounded-[16px]" onClick={selectVisiblePage} variant="secondary">
            {t("bills.selectVisiblePage")}
          </Button>
          <Button
            className="h-11 rounded-[16px]"
            disabled={selectedBills.length === 0}
            onClick={() => openPrintBatch(selectedBills, t("bills.bulkPrintTitle"))}
            variant="secondary"
          >
            <Printer className="mr-2 h-4 w-4" />
            {t("bills.printSelected")}
          </Button>
          <Button
            className="h-11 rounded-[16px]"
            disabled={filteredBills.length === 0}
            onClick={() => openPrintBatch(filteredBills, `${t("bills.bulkPrintTitle")} - ${selectedRangeLabel}`)}
            variant="secondary"
          >
            <Printer className="mr-2 h-4 w-4" />
            {t("bills.printPeriod")}
          </Button>
          <Button
            className="h-11 rounded-[16px] bg-slate-950 text-white hover:bg-slate-900"
            disabled={tabBills.length === 0}
            onClick={() => openPrintBatch(tabBills, t("bills.bulkPrintTitle"))}
          >
            <Printer className="mr-2 h-4 w-4" />
            {t("bills.printAll")}
          </Button>
        </div>

        {printFeedback ? <p className="mt-3 text-sm font-medium text-red-600">{printFeedback}</p> : null}

        <div className="mt-6 space-y-4">
          {paginatedBills.map((bill) => {
            const refundMeta = refundMetaByBillId.get(bill.id);

            return (
              <Card key={bill.id} className="p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="flex gap-4">
                    <label className="mt-1 inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-2xl border border-line bg-shell transition hover:border-emerald-300 hover:bg-emerald-50">
                      <input
                        aria-label={`Select ${bill.number}`}
                        checked={selectedBillIds.has(bill.id)}
                        className="h-4 w-4 accent-emerald-600"
                        onChange={() => toggleBillSelection(bill.id)}
                        type="checkbox"
                      />
                    </label>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-base font-semibold text-ink">{bill.number}</p>
                        <Badge variant={bill.status === "refunded" ? "danger" : bill.status === "paid" ? "success" : "warning"}>
                          {t(billStatusLabelKeys[bill.status])}
                        </Badge>
                        {refundMeta ? (
                          <Badge variant="warning">
                            {t("refund.totalRefunded")}: {formatCurrency(refundMeta.total, currency, locale)}
                          </Badge>
                        ) : null}
                        <Badge variant="neutral">{t(paymentMethodLabelKeys[bill.paymentMethod])}</Badge>
                        <Badge variant="neutral">
                          {formatBusinessDate(bill.businessDate ?? bill.createdAt.slice(0, 10), locale)}
                        </Badge>
                      </div>
                      <div className="mt-3 grid gap-2 text-sm text-slate-600 md:grid-cols-2 xl:grid-cols-4">
                        <p>
                          <span className="font-medium text-ink">{t("common.customer")}:</span>{" "}
                          {bill.customerName || t("billing.walkInCustomer")}
                        </p>
                        <p>
                          <span className="font-medium text-ink">{t("common.phone")}:</span>{" "}
                          {bill.customerPhone || t("common.notAvailable")}
                        </p>
                        <p>
                          <span className="font-medium text-ink">{t("common.dateTime")}:</span>{" "}
                          {formatDateTime(bill.createdAt, locale)}
                        </p>
                        <p>
                          <span className="font-medium text-ink">{t("common.total")}:</span>{" "}
                          {formatCurrency(bill.total, currency, locale)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Badge variant={bill.dueAmount > 0 ? "warning" : "success"}>
                      {t("common.dueAmount")}: {formatCurrency(bill.dueAmount, currency, locale)}
                    </Badge>
                    <Button asChild variant="secondary">
                      <Link href={`/bills/${bill.id}`}>
                        <span className="inline-flex items-center gap-2">
                          {t("bills.viewReceipt")}
                          <ArrowRight className="h-4 w-4" />
                        </span>
                      </Link>
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}

          {filteredBills.length === 0 ? (
            <Card className="border-dashed p-6 text-center">
              <ReceiptText className="mx-auto h-6 w-6 text-slate-400" />
              <p className="mt-3 text-sm leading-6 text-slate-600">
                {bills.length === 0 ? t("bills.emptyState") : t("bills.rangeEmpty")}
              </p>
              <Button asChild className="mt-5">
                <Link href="/billing">{t("bills.goToBilling")}</Link>
              </Button>
            </Card>
          ) : null}
        </div>

        {filteredBills.length > PAGE_SIZE ? (
          <div className="mt-6 flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-600">
              {t("common.showingItemsRange", {
                from: String(rangeStart),
                to: String(rangeEnd),
                total: String(filteredBills.length)
              })}
            </p>
            <div className="flex items-center gap-2">
              <Button
                disabled={safePage === 1}
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                variant="secondary"
              >
                {t("common.previous")}
              </Button>
              <span className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700">
                {t("common.page")} {safePage} {t("common.of")} {totalPages}
              </span>
              <Button
                disabled={safePage === totalPages}
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                variant="secondary"
              >
                {t("common.next")}
              </Button>
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
