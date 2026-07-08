"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { ArrowRight, ReceiptText, Search } from "lucide-react";
import { getBusinessDateInTimezone } from "@/lib/cash-control";
import { billStatusLabelKeys, paymentMethodLabelKeys } from "@/lib/i18n";
import { usePosApp } from "@/components/providers/app-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { cn, formatBusinessDate, formatCurrency, formatDateTime } from "@/lib/utils";

type RangePreset = "today" | "yesterday" | "week" | "month" | "year" | "custom";

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

export function BillsCenter() {
  const { currentShop, currentShopId, locale, state, t } = usePosApp();
  const [search, setSearch] = useState("");
  const [rangePreset, setRangePreset] = useState<RangePreset>("month");
  const deferredSearch = useDeferredValue(search);
  const todayBusinessDate = getBusinessDateInTimezone(currentShop?.timezone ?? "Asia/Riyadh", new Date());
  const [customFrom, setCustomFrom] = useState(todayBusinessDate);
  const [customTo, setCustomTo] = useState(todayBusinessDate);
  const [currentPage, setCurrentPage] = useState(1);

  const currency = currentShop?.currency ?? "SAR";

  const bills = useMemo(
    () =>
      state.bills
        .filter((bill) => bill.shopId === currentShopId)
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()),
    [currentShopId, state.bills]
  );

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

    return bills.filter((bill) => {
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
  }, [bills, deferredSearch, selectedRange.dateFrom, selectedRange.dateTo]);

  useEffect(() => {
    setCurrentPage(1);
  }, [deferredSearch, selectedRange.dateFrom, selectedRange.dateTo]);

  const totalPages = Math.max(1, Math.ceil(filteredBills.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedBills = filteredBills.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const rangeStart = filteredBills.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const rangeEnd = filteredBills.length === 0 ? 0 : rangeStart + paginatedBills.length - 1;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("bills.title")}
        subtitle={t("bills.phase4Subtitle")}
        eyebrow={t("nav.bills")}
      />

      <Card className="p-5 scroll-mt-24" id="bills-period">
        <div className="flex flex-col gap-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-olive">{t("bills.rangeTitle")}</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-ink">{selectedRangeLabel}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{t("bills.rangeSubtitle")}</p>
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
        </div>
      </Card>

      <Card className="p-6 scroll-mt-24" id="bills-results">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-olive">{t("bills.searchLabel")}</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-ink">{t("bills.searchTitle")}</h2>
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

        <div className="mt-6 space-y-4">
          {paginatedBills.map((bill) => (
            <Card key={bill.id} className="p-5">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-base font-semibold text-ink">{bill.number}</p>
                    <Badge variant={bill.status === "paid" ? "success" : "warning"}>
                      {t(billStatusLabelKeys[bill.status])}
                    </Badge>
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
          ))}

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
