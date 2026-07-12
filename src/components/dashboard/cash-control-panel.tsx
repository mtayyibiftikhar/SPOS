"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Clock3, RefreshCcw, Wallet } from "lucide-react";
import {
  calculateBusinessDaySummary,
  calculateShiftSummary,
  getBusinessDateInTimezone,
  getLatestClosedShift
} from "@/lib/cash-control";
import { calculateSalesReportSummaryRange } from "@/lib/refunds";
import { usePosApp } from "@/components/providers/app-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatBusinessDate, formatCurrency, formatDateTime } from "@/lib/utils";

type Feedback = {
  kind: "success" | "error";
  message: string;
} | null;

type ExpensePanel = "recordExpense" | "adjustDrawer" | "expenseLog" | "drawerLog";

const LOG_PAGE_SIZE = 8;

function FeedbackText({ feedback }: { feedback: Feedback }) {
  if (!feedback) {
    return null;
  }

  return (
    <p className={feedback.kind === "success" ? "text-sm font-medium text-emerald-700" : "text-sm font-medium text-red-600"}>
      {feedback.message}
    </p>
  );
}

function SummaryRow({
  label,
  value,
  emphasis = false
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className={emphasis ? "flex items-center justify-between text-sm font-semibold text-ink" : "flex items-center justify-between text-sm text-slate-600"}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function getMonthStart(value: string) {
  return `${value.slice(0, 7)}-01`;
}

function getWeekStart(value: string) {
  const date = new Date(`${value}T00:00:00`);
  const day = date.getDay();
  const daysFromMonday = day === 0 ? 6 : day - 1;
  date.setDate(date.getDate() - daysFromMonday);
  return date.toISOString().slice(0, 10);
}

function OverviewStatCard({
  label,
  value,
  note,
  tone = "neutral"
}: {
  label: string;
  value: string;
  note: string;
  tone?: "neutral" | "success" | "warning";
}) {
  const toneClass =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50"
        : "border-slate-200 bg-white";

  return (
    <div className={`rounded-[26px] border p-5 shadow-[0_18px_42px_rgba(15,23,42,0.05)] ${toneClass}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-3 font-display text-3xl font-semibold tracking-[-0.04em] text-ink">{value}</p>
      <p className="mt-2 text-sm leading-5 text-slate-600">{note}</p>
    </div>
  );
}

function DashboardMiniMetric({
  label,
  value,
  tone = "neutral"
}: {
  label: string;
  value: string;
  tone?: "neutral" | "success" | "warning";
}) {
  const toneClass =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-950"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-950"
        : "border-slate-200 bg-slate-50 text-slate-950";

  return (
    <div className={`rounded-[22px] border p-4 ${toneClass}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 font-display text-2xl font-semibold tracking-[-0.03em]">{value}</p>
    </div>
  );
}

function PaginationBar({
  currentPage,
  onPageChange,
  pageCount
}: {
  currentPage: number;
  onPageChange: (page: number) => void;
  pageCount: number;
}) {
  if (pageCount <= 1) {
    return null;
  }

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        Page {currentPage} of {pageCount}
      </p>
      <div className="flex items-center gap-2">
        <Button
          className="h-10 px-4"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          variant="secondary"
        >
          Previous
        </Button>
        <Button
          className="h-10 px-4"
          disabled={currentPage >= pageCount}
          onClick={() => onPageChange(Math.min(pageCount, currentPage + 1))}
          variant="secondary"
        >
          Next
        </Button>
      </div>
    </div>
  );
}

export function CashControlPanel() {
  const {
    addCashMovement,
    autoCloseAndStartNextBusinessDay,
    closeBusinessDay,
    createExpense,
    currentBusinessDay,
    currentShift,
    currentShop,
    locale,
    session,
    startBusinessDay,
    startShift,
    endShift,
    state,
    t
  } = usePosApp();
  const canManageDay = session?.role === "shop_admin";
  const canUseShift = session?.role === "shop_admin" || session?.role === "cashier";
  const timeZone = currentShop?.timezone ?? "Asia/Riyadh";
  const currency = currentShop?.currency ?? "SAR";
  const todayBusinessDate = getBusinessDateInTimezone(timeZone);
  const [businessDate, setBusinessDate] = useState(todayBusinessDate);
  const [openingNote, setOpeningNote] = useState("");
  const [dayCountedCash, setDayCountedCash] = useState("");
  const [dayCloseNote, setDayCloseNote] = useState("");
  const [openingCash, setOpeningCash] = useState("");
  const [shiftCountedCash, setShiftCountedCash] = useState("");
  const [shiftNote, setShiftNote] = useState("");
  const [movementAmount, setMovementAmount] = useState("");
  const [movementReason, setMovementReason] = useState("");
  const [movementType, setMovementType] = useState<"cash_in" | "cash_out">("cash_in");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseCategoryId, setExpenseCategoryId] = useState("");
  const [expenseCategoryName, setExpenseCategoryName] = useState("");
  const [expensePaymentMethod, setExpensePaymentMethod] = useState<"cash" | "card" | "bank">("cash");
  const [expenseVendorName, setExpenseVendorName] = useState("");
  const [expenseNote, setExpenseNote] = useState("");
  const [activeControl, setActiveControl] = useState<"overview" | "day" | "shift" | "expenses">("overview");
  const [activeExpensePanel, setActiveExpensePanel] = useState<ExpensePanel>("recordExpense");
  const [expenseLogPage, setExpenseLogPage] = useState(1);
  const [movementLogPage, setMovementLogPage] = useState(1);
  const [dayFeedback, setDayFeedback] = useState<Feedback>(null);
  const [shiftFeedback, setShiftFeedback] = useState<Feedback>(null);
  const [movementFeedback, setMovementFeedback] = useState<Feedback>(null);
  const [expenseFeedback, setExpenseFeedback] = useState<Feedback>(null);

  useEffect(() => {
    if (!currentBusinessDay) {
      setBusinessDate(todayBusinessDate);
      return;
    }

    setBusinessDate(currentBusinessDay.businessDate);
  }, [currentBusinessDay, todayBusinessDate]);

  const activeDaySummary = useMemo(() => {
    if (!currentBusinessDay || !currentShop) {
      return null;
    }

    return calculateBusinessDaySummary({
      businessDate: currentBusinessDay.businessDate,
      shopId: currentShop.id,
      timeZone: currentShop.timezone,
      bills: state.bills,
      cashMovements: state.cashMovements,
      expenses: state.expenses,
      shifts: state.shifts,
      refunds: state.refunds
    });
  }, [currentBusinessDay, currentShop, state.bills, state.cashMovements, state.expenses, state.refunds, state.shifts]);

  const activeShiftSummary = useMemo(() => {
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

  const latestClosedShift = useMemo(
    () => getLatestClosedShift(state.shifts, currentShop?.id ?? null, session?.id ?? null),
    [currentShop?.id, session?.id, state.shifts]
  );

  const latestClosedShiftSummary = useMemo(() => {
    if (!latestClosedShift) {
      return null;
    }

    return calculateShiftSummary({
      shift: latestClosedShift,
      bills: state.bills,
      cashMovements: state.cashMovements,
      refunds: state.refunds
    });
  }, [latestClosedShift, state.bills, state.cashMovements, state.refunds]);

  const openShiftsForDay = useMemo(() => {
    if (!currentBusinessDay || !currentShop) {
      return [];
    }

    return state.shifts.filter(
      (shift) =>
        shift.shopId === currentShop.id &&
        shift.businessDate === currentBusinessDay.businessDate &&
        !shift.endedAt
    );
  }, [currentBusinessDay, currentShop, state.shifts]);

  const deviceShiftLimit = useMemo(() => {
    if (!currentShop) {
      return 1;
    }

    const shopKeys = state.productKeys.filter((key) => key.shopId === currentShop.id && key.status !== "revoked");
    const keyLimit = shopKeys.reduce((highest, key) => Math.max(highest, key.allowedDevices), 0);

    return Math.max(1, keyLimit);
  }, [currentShop, state.productKeys]);

  const todaySummary = useMemo(() => {
    if (!currentShop) {
      return null;
    }

    return calculateSalesReportSummaryRange({
      dateFrom: todayBusinessDate,
      dateTo: todayBusinessDate,
      shopId: currentShop.id,
      timeZone,
      bills: state.bills,
      billItems: state.billItems,
      expenses: state.expenses,
      refunds: state.refunds
    });
  }, [currentShop, state.billItems, state.bills, state.expenses, state.refunds, timeZone, todayBusinessDate]);

  const weekSummary = useMemo(() => {
    if (!currentShop) {
      return null;
    }

    return calculateSalesReportSummaryRange({
      dateFrom: getWeekStart(todayBusinessDate),
      dateTo: todayBusinessDate,
      shopId: currentShop.id,
      timeZone,
      bills: state.bills,
      billItems: state.billItems,
      expenses: state.expenses,
      refunds: state.refunds
    });
  }, [currentShop, state.billItems, state.bills, state.expenses, state.refunds, timeZone, todayBusinessDate]);

  const monthSummary = useMemo(() => {
    if (!currentShop) {
      return null;
    }

    return calculateSalesReportSummaryRange({
      dateFrom: getMonthStart(todayBusinessDate),
      dateTo: todayBusinessDate,
      shopId: currentShop.id,
      timeZone,
      bills: state.bills,
      billItems: state.billItems,
      expenses: state.expenses,
      refunds: state.refunds
    });
  }, [currentShop, state.billItems, state.bills, state.expenses, state.refunds, timeZone, todayBusinessDate]);

  const inventoryPulse = useMemo(() => {
    if (!currentShop) {
      return {
        activeProducts: 0,
        lowStock: 0,
        stockUnits: 0,
        stockValue: 0
      };
    }

    const physicalProducts = state.products.filter(
      (product) => product.shopId === currentShop.id && product.kind === "product" && product.status === "active"
    );

    return physicalProducts.reduce(
      (totals, product) => ({
        activeProducts: totals.activeProducts + 1,
        lowStock: totals.lowStock + (product.stockQuantity <= product.reorderLevel ? 1 : 0),
        stockUnits: totals.stockUnits + product.stockQuantity,
        stockValue: totals.stockValue + product.stockQuantity * product.costPrice
      }),
      {
        activeProducts: 0,
        lowStock: 0,
        stockUnits: 0,
        stockValue: 0
      }
    );
  }, [currentShop, state.products]);

  const movementRows = useMemo(() => {
    if (!currentShop) {
      return [];
    }

    return state.cashMovements
      .filter((movement) => movement.shopId === currentShop.id)
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  }, [currentShop, state.cashMovements]);

  const expenseCategories = useMemo(
    () =>
      state.expenseCategories
        .filter((category) => category.shopId === currentShop?.id)
        .sort((left, right) => left.name.localeCompare(right.name)),
    [currentShop?.id, state.expenseCategories]
  );

  const expenseRows = useMemo(() => {
    if (!currentShop) {
      return [];
    }

    return state.expenses
      .filter((expense) => expense.shopId === currentShop.id)
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  }, [currentShop, state.expenses]);

  const expenseLogPageCount = Math.max(1, Math.ceil(expenseRows.length / LOG_PAGE_SIZE));
  const safeExpenseLogPage = Math.min(expenseLogPage, expenseLogPageCount);
  const paginatedExpenses = expenseRows.slice(
    (safeExpenseLogPage - 1) * LOG_PAGE_SIZE,
    safeExpenseLogPage * LOG_PAGE_SIZE
  );

  const movementLogPageCount = Math.max(1, Math.ceil(movementRows.length / LOG_PAGE_SIZE));
  const safeMovementLogPage = Math.min(movementLogPage, movementLogPageCount);
  const paginatedMovements = movementRows.slice(
    (safeMovementLogPage - 1) * LOG_PAGE_SIZE,
    safeMovementLogPage * LOG_PAGE_SIZE
  );

  const handleStartDay = () => {
    const result = startBusinessDay({
      businessDate,
      openingNote
    });

    setDayFeedback({
      kind: result.ok ? "success" : "error",
      message: result.message ?? (result.ok ? t("cashControl.dayStarted") : t("cashControl.dayStartError"))
    });

    if (result.ok) {
      setOpeningNote("");
      setDayCountedCash("");
      setDayCloseNote("");
    }
  };

  const handleCloseDay = () => {
    const countedCash = Number(dayCountedCash || 0);

    if (Number.isNaN(countedCash) || countedCash < 0) {
      setDayFeedback({
        kind: "error",
        message: t("cashControl.invalidCashValue")
      });
      return;
    }

    const result = closeBusinessDay({
      countedCash,
      note: dayCloseNote
    });

    setDayFeedback({
      kind: result.ok ? "success" : "error",
      message: result.message ?? (result.ok ? t("cashControl.dayClosed") : t("cashControl.dayCloseError"))
    });

    if (result.ok) {
      setDayCountedCash("");
      setDayCloseNote("");
    }
  };

  const handleAutoRollover = () => {
    const result = autoCloseAndStartNextBusinessDay({
      note: dayCloseNote || "Auto rollover from cash control.",
      startShift: true
    });

    setDayFeedback({
      kind: result.ok ? "success" : "error",
      message: result.message ?? (result.ok ? "Day rolled over." : "Unable to auto close the day.")
    });

    if (result.ok) {
      setDayCountedCash("");
      setDayCloseNote("");
      setActiveControl("day");
    }
  };

  const handleStartShift = () => {
    const cash = Number(openingCash || 0);

    if (Number.isNaN(cash) || cash < 0) {
      setShiftFeedback({
        kind: "error",
        message: t("cashControl.invalidCashValue")
      });
      return;
    }

    const result = startShift({ openingCash: cash });

    setShiftFeedback({
      kind: result.ok ? "success" : "error",
      message: result.message ?? (result.ok ? t("cashControl.shiftStarted") : t("cashControl.shiftStartError"))
    });

    if (result.ok) {
      setOpeningCash("");
    }
  };

  const handleEndShift = () => {
    const cash = Number(shiftCountedCash || 0);

    if (Number.isNaN(cash) || cash < 0) {
      setShiftFeedback({
        kind: "error",
        message: t("cashControl.invalidCashValue")
      });
      return;
    }

    const result = endShift({
      countedCash: cash,
      note: shiftNote
    });

    setShiftFeedback({
      kind: result.ok ? "success" : "error",
      message: result.message ?? (result.ok ? t("cashControl.shiftClosed") : t("cashControl.shiftCloseError"))
    });

    if (result.ok) {
      setShiftCountedCash("");
      setShiftNote("");
    }
  };

  const handleCashMovement = () => {
    const amount = Number(movementAmount || 0);

    if (Number.isNaN(amount) || amount <= 0) {
      setMovementFeedback({
        kind: "error",
        message: t("cashControl.invalidMovementAmount")
      });
      return;
    }

    if (!movementReason.trim()) {
      setMovementFeedback({
        kind: "error",
        message: t("cashControl.reasonRequired")
      });
      return;
    }

    const result = addCashMovement({
      type: movementType,
      amount,
      reason: movementReason
    });

    setMovementFeedback({
      kind: result.ok ? "success" : "error",
      message: result.message ?? (result.ok ? t("cashControl.movementSaved") : t("cashControl.movementSaveError"))
    });

    if (result.ok) {
      setMovementAmount("");
      setMovementReason("");
    }
  };

  const handleExpense = () => {
    const amount = Number(expenseAmount || 0);
    const selectedCategory = expenseCategories.find((category) => category.id === expenseCategoryId);
    const categoryName = selectedCategory?.name ?? expenseCategoryName;

    const result = createExpense({
      amount,
      categoryId: selectedCategory?.id,
      categoryName,
      paymentMethod: expensePaymentMethod,
      vendorName: expenseVendorName,
      note: expenseNote
    });

    setExpenseFeedback({
      kind: result.ok ? "success" : "error",
      message: result.message ?? (result.ok ? t("expense.saved") : t("expense.error"))
    });

    if (result.ok) {
      setExpenseAmount("");
      setExpenseCategoryName("");
      setExpenseVendorName("");
      setExpenseNote("");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex w-full max-w-2xl rounded-[20px] border border-slate-200 bg-white p-1 shadow-[0_14px_34px_rgba(15,23,42,0.04)]">
        {([
          { key: "overview", label: t("dashboard.overview") },
          { key: "day", label: t("cashControl.dayLabel") },
          { key: "shift", label: t("cashControl.shiftLabel") },
          { key: "expenses", label: t("cashControl.expenses") }
        ] as const).map((item) => (
          <button
            className={`flex-1 rounded-[14px] px-4 py-2 text-sm font-semibold transition ${
              activeControl === item.key ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-50"
            }`}
            key={item.key}
            onClick={() => setActiveControl(item.key)}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="grid gap-6">
        {activeControl === "overview" ? (
          <Card className="overflow-hidden p-0">
            <div className="border-b border-slate-200 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.12),transparent_34%),linear-gradient(135deg,#ffffff_0%,#f8fafc_100%)] p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-olive">{t("dashboard.registerOverview")}</p>
                  <h2 className="mt-2 font-display text-2xl font-semibold text-ink">{t("dashboard.salesCashControl")}</h2>
                </div>
                <Badge variant={currentBusinessDay ? "success" : "warning"}>
                  {currentBusinessDay ? t("cashControl.dayOpen") : t("cashControl.dayClosedState")}
                </Badge>
              </div>
            </div>

            <div className="grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-5">
              <OverviewStatCard
                label={t("dashboard.todaySales")}
                value={formatCurrency(todaySummary?.netSales ?? 0, currency, locale)}
                note={t("dashboard.todayBillsAfterRefunds", { count: todaySummary?.billCount ?? 0 })}
                tone={currentBusinessDay ? "success" : "neutral"}
              />
              <OverviewStatCard
                label={t("dashboard.weekSales")}
                value={formatCurrency(weekSummary?.netSales ?? 0, currency, locale)}
                note={t("dashboard.weekRangeToToday", { from: formatBusinessDate(getWeekStart(todayBusinessDate), locale) })}
              />
              <OverviewStatCard
                label={t("dashboard.monthSales")}
                value={formatCurrency(monthSummary?.netSales ?? 0, currency, locale)}
                note={t("dashboard.monthNetSales")}
              />
              <OverviewStatCard
                label={t("dashboard.monthProfit", { month: todayBusinessDate.slice(0, 7) })}
                value={formatCurrency(monthSummary?.netProfit ?? 0, currency, locale)}
                note={t("dashboard.monthProfitAfterAdjustments")}
                tone="success"
              />
              <OverviewStatCard
                label={t("dashboard.openShifts")}
                value={`${openShiftsForDay.length}/${deviceShiftLimit}`}
                note={t("dashboard.openShiftsCapacity")}
                tone={openShiftsForDay.length >= deviceShiftLimit ? "warning" : "neutral"}
              />
            </div>

            <div className="grid gap-4 border-t border-slate-200 p-6 lg:grid-cols-2">
              <div className="rounded-[28px] border border-slate-200 bg-white p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{t("dashboard.registerStatus")}</p>
                <div className="mt-4 space-y-3">
                  <SummaryRow
                    label={t("cashControl.businessDate")}
                    value={currentBusinessDay ? formatBusinessDate(currentBusinessDay.businessDate, locale) : t("dashboard.notOpen")}
                    emphasis
                  />
                  <SummaryRow
                    label={t("dashboard.dayBills")}
                    value={`${activeDaySummary?.billCount ?? 0}`}
                  />
                  <SummaryRow
                    label={t("dashboard.shiftBills")}
                    value={`${activeShiftSummary?.billCount ?? 0}`}
                  />
                  <SummaryRow
                    label={t("cashControl.expectedCash")}
                    value={formatCurrency(activeDaySummary?.expectedCash ?? 0, currency, locale)}
                    emphasis
                  />
                  <SummaryRow
                    label={t("cashControl.cashSales")}
                    value={formatCurrency(activeDaySummary?.cashSales ?? 0, currency, locale)}
                  />
                  <SummaryRow
                    label={t("cashControl.refunds")}
                    value={formatCurrency(activeDaySummary?.refunds ?? 0, currency, locale)}
                  />
                  <SummaryRow
                    label={t("cashControl.expenses")}
                    value={formatCurrency(activeDaySummary?.expenses ?? 0, currency, locale)}
                  />
                </div>
              </div>

              <div className="rounded-[28px] border border-slate-200 bg-white p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{t("dashboard.inventoryPulse")}</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <DashboardMiniMetric
                    label={t("dashboard.inventoryValue")}
                    value={formatCurrency(inventoryPulse.stockValue, currency, locale)}
                    tone="success"
                  />
                  <DashboardMiniMetric
                    label={t("dashboard.inventoryUnits")}
                    value={`${inventoryPulse.stockUnits}`}
                  />
                  <DashboardMiniMetric
                    label={t("dashboard.activeProducts")}
                    value={`${inventoryPulse.activeProducts}`}
                  />
                  <DashboardMiniMetric
                    label={t("dashboard.lowStockItems")}
                    value={`${inventoryPulse.lowStock}`}
                    tone={inventoryPulse.lowStock > 0 ? "warning" : "neutral"}
                  />
                </div>
              </div>
            </div>
          </Card>
        ) : null}

        {activeControl === "day" ? (
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-olive">{t("cashControl.dayLabel")}</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-ink">{t("cashControl.dayTitle")}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{t("cashControl.dayDesc")}</p>
          </div>
          <Badge variant={currentBusinessDay ? "success" : "warning"}>
            {currentBusinessDay ? t("cashControl.dayOpen") : t("cashControl.dayClosedState")}
          </Badge>
        </div>

        {currentBusinessDay ? (
          <div className="mt-6 space-y-5">
            <div className="rounded-3xl bg-shell p-5">
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="neutral">{formatBusinessDate(currentBusinessDay.businessDate, locale)}</Badge>
                <Badge variant="neutral">{t("cashControl.openShiftCount", { count: openShiftsForDay.length })}</Badge>
              </div>
              {currentBusinessDay.openingNote ? (
                <p className="mt-3 text-sm leading-6 text-slate-600">{currentBusinessDay.openingNote}</p>
              ) : null}
            </div>

            {activeDaySummary ? (
              <div className="rounded-3xl border border-line bg-white p-5">
                <div className="space-y-3">
                  <SummaryRow
                    label={t("cashControl.totalSales")}
                    value={formatCurrency(activeDaySummary.totalSales, currency, locale)}
                    emphasis
                  />
                  <SummaryRow
                    label={t("cashControl.cashSales")}
                    value={formatCurrency(activeDaySummary.cashSales, currency, locale)}
                  />
                  <SummaryRow
                    label={t("cashControl.cardSales")}
                    value={formatCurrency(activeDaySummary.cardSales, currency, locale)}
                  />
                  <SummaryRow
                    label={t("cashControl.accountSales")}
                    value={formatCurrency(activeDaySummary.accountSales, currency, locale)}
                  />
                  <SummaryRow
                    label={t("cashControl.refunds")}
                    value={formatCurrency(activeDaySummary.refunds, currency, locale)}
                  />
                  <SummaryRow
                    label={t("cashControl.expenses")}
                    value={formatCurrency(activeDaySummary.expenses, currency, locale)}
                  />
                  <SummaryRow
                    label={t("cashControl.netSales")}
                    value={formatCurrency(activeDaySummary.netSales, currency, locale)}
                  />
                  <SummaryRow
                    label={t("cashControl.expectedCash")}
                    value={formatCurrency(activeDaySummary.expectedCash, currency, locale)}
                    emphasis
                  />
                </div>
              </div>
            ) : null}

            {canManageDay ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-ink">{t("cashControl.countedCash")}</label>
                  <Input inputMode="decimal" value={dayCountedCash} onChange={(event) => setDayCountedCash(event.target.value)} />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-ink">{t("cashControl.closeNote")}</label>
                  <Textarea value={dayCloseNote} onChange={(event) => setDayCloseNote(event.target.value)} />
                </div>
                <Button className="sm:col-span-2" onClick={handleCloseDay} disabled={openShiftsForDay.length > 0}>
                  {t("cashControl.closeDay")}
                </Button>
                {openShiftsForDay.length > 0 ? (
                  <p className="sm:col-span-2 text-sm font-medium text-amber-700">{t("cashControl.closeShiftFirst")}</p>
                ) : null}
                <Button className="sm:col-span-2" onClick={handleAutoRollover} variant="secondary">
                  <RefreshCcw className="mr-2 h-4 w-4" />
                  Auto close day and open next day
                </Button>
                <p className="sm:col-span-2 text-xs leading-5 text-slate-500">
                  Use this only when staff forgot to close. Open shifts close with expected cash, then the next day and shift start automatically.
                </p>
                <FeedbackText feedback={dayFeedback} />
              </div>
            ) : (
              <p className="text-sm leading-6 text-slate-600">{t("cashControl.dayAdminOnly")}</p>
            )}
          </div>
        ) : canManageDay ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-ink">{t("cashControl.businessDate")}</label>
              <Input type="date" value={businessDate} onChange={(event) => setBusinessDate(event.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-2 block text-sm font-medium text-ink">{t("cashControl.openingNote")}</label>
              <Textarea value={openingNote} onChange={(event) => setOpeningNote(event.target.value)} />
            </div>
            <Button className="sm:col-span-2" onClick={handleStartDay}>
              {t("cashControl.startDay")}
            </Button>
            <FeedbackText feedback={dayFeedback} />
          </div>
        ) : (
          <div className="mt-6 rounded-3xl border border-dashed border-line bg-shell/70 p-5">
            <p className="text-sm leading-6 text-slate-600">{t("cashControl.waitingForDayStart")}</p>
          </div>
        )}
      </Card>
        ) : null}

        {activeControl === "shift" ? (
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-olive">{t("cashControl.shiftLabel")}</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-ink">{t("cashControl.shiftTitle")}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{t("cashControl.shiftDesc")}</p>
          </div>
          <Badge variant={currentShift ? "success" : "neutral"}>
            {currentShift ? t("cashControl.shiftOpen") : t("cashControl.shiftClosedState")}
          </Badge>
        </div>

        {currentShift && activeShiftSummary ? (
          <div className="mt-6 space-y-5">
            <div className="rounded-3xl bg-shell p-5">
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="neutral">{formatDateTime(currentShift.startedAt, locale)}</Badge>
                <Badge variant="neutral">{t("dashboard.shiftBillsWithCount", { count: activeShiftSummary.billCount })}</Badge>
                <Badge variant="neutral">{t("dashboard.dayBillsWithCount", { count: activeDaySummary?.billCount ?? 0 })}</Badge>
              </div>
            </div>

            <div className="rounded-3xl border border-line bg-white p-5">
              <div className="space-y-3">
                <SummaryRow
                  label={t("cashControl.openingCash")}
                  value={formatCurrency(activeShiftSummary.openingCash, currency, locale)}
                />
                <SummaryRow
                  label={t("cashControl.cashSales")}
                  value={formatCurrency(activeShiftSummary.cashSales, currency, locale)}
                />
                <SummaryRow
                  label={t("cashControl.cashIn")}
                  value={formatCurrency(activeShiftSummary.cashIn, currency, locale)}
                />
                <SummaryRow
                  label={t("cashControl.cashOut")}
                  value={formatCurrency(activeShiftSummary.cashOut, currency, locale)}
                />
                <SummaryRow
                  label={t("cashControl.expectedCash")}
                  value={formatCurrency(activeShiftSummary.expectedCash, currency, locale)}
                  emphasis
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">{t("cashControl.countedCash")}</label>
                <Input
                  inputMode="decimal"
                  value={shiftCountedCash}
                  onChange={(event) => setShiftCountedCash(event.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-2 block text-sm font-medium text-ink">{t("cashControl.shiftNote")}</label>
                <Textarea value={shiftNote} onChange={(event) => setShiftNote(event.target.value)} />
              </div>
              <Button className="sm:col-span-2" onClick={handleEndShift}>
                {t("cashControl.endShift")}
              </Button>
              <FeedbackText feedback={shiftFeedback} />
            </div>

          </div>
        ) : canUseShift ? (
          <div className="mt-6 space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">{t("cashControl.openingCash")}</label>
                <Input inputMode="decimal" value={openingCash} onChange={(event) => setOpeningCash(event.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <Button className="w-full" onClick={handleStartShift}>
                  {t("cashControl.startShift")}
                </Button>
              </div>
              <FeedbackText feedback={shiftFeedback} />
            </div>

            {latestClosedShift && latestClosedShiftSummary ? (
              <div className="rounded-3xl border border-line bg-white p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant="neutral">{formatDateTime(latestClosedShift.endedAt, locale)}</Badge>
                  <Badge
                    variant={
                      latestClosedShiftSummary.difference === null || latestClosedShiftSummary.difference === 0
                        ? "neutral"
                        : latestClosedShiftSummary.difference > 0
                          ? "success"
                          : "warning"
                    }
                  >
                    {t("cashControl.difference")}:{" "}
                    {formatCurrency(latestClosedShiftSummary.difference ?? 0, currency, locale)}
                  </Badge>
                </div>
                <div className="mt-4 space-y-3">
                  <SummaryRow
                    label={t("cashControl.expectedCash")}
                    value={formatCurrency(latestClosedShiftSummary.expectedCash, currency, locale)}
                  />
                  <SummaryRow
                    label={t("cashControl.countedCash")}
                    value={formatCurrency(latestClosedShiftSummary.countedCash ?? 0, currency, locale)}
                  />
                </div>
              </div>
            ) : (
              <div className="rounded-3xl border border-dashed border-line bg-shell/70 p-5">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
                  <Clock3 className="h-4 w-4" />
                  {t("cashControl.noShiftHistory")}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-6 rounded-3xl border border-dashed border-line bg-shell/70 p-5">
            <p className="text-sm leading-6 text-slate-600">{t("cashControl.shiftUnavailable")}</p>
          </div>
        )}

      </Card>
        ) : null}

        {activeControl === "expenses" ? (
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-olive">{t("cashControl.expenses")}</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-ink">{t("expense.title")}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{t("expense.desc")}</p>
          </div>
          <Badge variant={currentBusinessDay && currentShift ? "success" : "warning"}>
            {currentBusinessDay && currentShift ? t("common.ready") : t("common.openDayShiftFirst")}
          </Badge>
        </div>

        {canManageDay ? (
          <div className="mt-6 space-y-5">
            <div className="grid gap-3 md:grid-cols-4">
              {([
                { key: "recordExpense", label: t("expense.recordExpense"), meta: expenseRows.length },
                { key: "adjustDrawer", label: t("expense.adjustDrawer"), meta: movementRows.length },
                { key: "expenseLog", label: t("expense.expenseLog"), meta: expenseRows.length },
                { key: "drawerLog", label: t("expense.drawerLog"), meta: movementRows.length }
              ] as const).map((panel) => (
                <button
                  className={`rounded-3xl border px-4 py-4 text-left transition ${
                    activeExpensePanel === panel.key
                      ? "border-slate-950 bg-slate-950 text-white shadow-[0_18px_40px_rgba(15,23,42,0.16)]"
                      : "border-slate-200 bg-white text-ink hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-[0_18px_40px_rgba(15,23,42,0.08)]"
                  }`}
                  key={panel.key}
                  onClick={() => setActiveExpensePanel(panel.key)}
                  type="button"
                >
                  <span className="block text-sm font-semibold">{panel.label}</span>
                  <span className={activeExpensePanel === panel.key ? "mt-2 block text-xs text-white/70" : "mt-2 block text-xs text-slate-500"}>
                    {panel.meta} {t("common.items")}
                  </span>
                </button>
              ))}
            </div>

            {activeExpensePanel === "recordExpense" ? (
              <div className="rounded-3xl border border-line bg-white p-5">
                <div className="mb-5 flex items-center gap-2 text-sm font-semibold text-ink">
                  <Wallet className="h-4 w-4" />
                  {t("expense.title")}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-ink">{t("common.category")}</label>
                    <select
                      className="h-12 w-full rounded-2xl border border-line bg-white px-4 text-sm text-ink outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
                      value={expenseCategoryId}
                      onChange={(event) => setExpenseCategoryId(event.target.value)}
                    >
                      <option value="">{t("common.newCategory")}</option>
                      {expenseCategories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-ink">{t("common.newCategoryName")}</label>
                    <Input
                      disabled={Boolean(expenseCategoryId)}
                      value={expenseCategoryName}
                      onChange={(event) => setExpenseCategoryName(event.target.value)}
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-ink">{t("common.amount")}</label>
                    <Input inputMode="decimal" value={expenseAmount} onChange={(event) => setExpenseAmount(event.target.value)} />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-ink">{t("common.paymentMethod")}</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(["cash", "card", "bank"] as const).map((method) => (
                        <Button
                          key={method}
                          variant={expensePaymentMethod === method ? "primary" : "secondary"}
                          onClick={() => setExpensePaymentMethod(method)}
                        >
                          {method === "cash" ? t("common.cash") : method === "card" ? t("common.card") : t("common.bank")}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-ink">{t("common.vendor")}</label>
                    <Input value={expenseVendorName} onChange={(event) => setExpenseVendorName(event.target.value)} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-2 block text-sm font-medium text-ink">{t("common.notes")}</label>
                    <Textarea value={expenseNote} onChange={(event) => setExpenseNote(event.target.value)} />
                  </div>
                  <Button
                    className="sm:col-span-2"
                    onClick={handleExpense}
                    disabled={!currentBusinessDay || !currentShift}
                  >
                    {t("common.save")}
                  </Button>
                  <FeedbackText feedback={expenseFeedback} />
                </div>
              </div>
            ) : null}

            {activeExpensePanel === "adjustDrawer" ? (
              <div className="rounded-3xl border border-line bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                      {movementType === "cash_in" ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                      {t("cashControl.drawerAdjustmentTitle")}
                    </div>
                    <p className="mt-2 text-xs leading-5 text-slate-500">{t("cashControl.drawerAdjustmentHint")}</p>
                  </div>
                  <Badge variant="neutral">
                    {movementType === "cash_in" ? t("cashControl.cashIn") : t("cashControl.cashOut")}
                  </Badge>
                </div>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-ink">{t("cashControl.movementType")}</label>
                    <div className="grid grid-cols-2 gap-3">
                      <Button
                        variant={movementType === "cash_in" ? "primary" : "secondary"}
                        onClick={() => setMovementType("cash_in")}
                      >
                        {t("cashControl.cashIn")}
                      </Button>
                      <Button
                        variant={movementType === "cash_out" ? "primary" : "secondary"}
                        onClick={() => setMovementType("cash_out")}
                      >
                        {t("cashControl.cashOut")}
                      </Button>
                    </div>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-ink">{t("cashControl.amount")}</label>
                    <Input inputMode="decimal" value={movementAmount} onChange={(event) => setMovementAmount(event.target.value)} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-2 block text-sm font-medium text-ink">{t("common.reason")}</label>
                    <Textarea value={movementReason} onChange={(event) => setMovementReason(event.target.value)} />
                  </div>
                  <Button
                    className="sm:col-span-2"
                    onClick={handleCashMovement}
                    disabled={!currentBusinessDay || !currentShift}
                  >
                    {t("cashControl.saveMovement")}
                  </Button>
                  <FeedbackText feedback={movementFeedback} />
                </div>
              </div>
            ) : null}

            {activeExpensePanel === "expenseLog" ? (
              <div className="rounded-3xl bg-cloud p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                    <Wallet className="h-4 w-4" />
                    {t("expense.expenseLog")}
                  </div>
                  <Badge variant="neutral">{expenseRows.length} {t("common.items")}</Badge>
                </div>
                <div className="mt-4 overflow-hidden rounded-3xl border border-slate-200 bg-white">
                  {paginatedExpenses.length > 0 ? (
                    paginatedExpenses.map((expense) => (
                      <div key={expense.id} className="grid gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0 md:grid-cols-[1fr_1fr_auto]">
                        <div>
                          <p className="text-sm font-semibold text-ink">{expense.categoryName}</p>
                          <p className="mt-1 text-xs text-slate-500">{formatDateTime(expense.createdAt, locale)}</p>
                        </div>
                        <div>
                          <p className="text-sm text-slate-600">{expense.vendorName || expense.paymentMethod.toUpperCase()}</p>
                          {expense.note ? <p className="mt-1 text-xs text-slate-500">{expense.note}</p> : null}
                        </div>
                        <p className="text-sm font-semibold text-ink md:text-right">{formatCurrency(expense.amount, currency, locale)}</p>
                      </div>
                    ))
                  ) : (
                    <p className="p-5 text-sm leading-6 text-slate-600">{t("expense.none")}</p>
                  )}
                </div>
                <PaginationBar currentPage={safeExpenseLogPage} onPageChange={setExpenseLogPage} pageCount={expenseLogPageCount} />
              </div>
            ) : null}

            {activeExpensePanel === "drawerLog" ? (
              <div className="rounded-3xl bg-cloud p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                    <Wallet className="h-4 w-4" />
                    {t("expense.drawerLog")}
                  </div>
                  <Badge variant="neutral">{movementRows.length} {t("common.items")}</Badge>
                </div>
                <div className="mt-4 overflow-hidden rounded-3xl border border-slate-200 bg-white">
                  {paginatedMovements.length > 0 ? (
                    paginatedMovements.map((movement) => (
                      <div key={movement.id} className="grid gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0 md:grid-cols-[1fr_1.5fr_auto]">
                        <div>
                          <p className="text-sm font-semibold text-ink">
                            {movement.type === "cash_in" ? t("cashControl.cashIn") : t("cashControl.cashOut")}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">{formatDateTime(movement.createdAt, locale)}</p>
                        </div>
                        <p className="text-sm text-slate-600">{movement.reason}</p>
                        <Badge variant={movement.type === "cash_in" ? "success" : "warning"}>
                          {formatCurrency(movement.amount, currency, locale)}
                        </Badge>
                      </div>
                    ))
                  ) : (
                    <p className="p-5 text-sm leading-6 text-slate-600">{t("cashControl.noMovements")}</p>
                  )}
                </div>
                <PaginationBar currentPage={safeMovementLogPage} onPageChange={setMovementLogPage} pageCount={movementLogPageCount} />
              </div>
            ) : null}
          </div>
        ) : (
          <p className="mt-6 text-sm leading-6 text-slate-600">{t("expense.adminOnly")}</p>
        )}
      </Card>
        ) : null}
      </div>
    </div>
  );
}
