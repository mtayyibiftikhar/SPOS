"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Clock3, RefreshCcw, Wallet } from "lucide-react";
import {
  calculateBusinessDaySummary,
  calculateShiftSummary,
  getBusinessDateInTimezone,
  getLatestClosedShift
} from "@/lib/cash-control";
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
  const [activeControl, setActiveControl] = useState<"day" | "shift" | "expenses">("day");
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

  const recentMovements = useMemo(() => {
    if (!currentShop) {
      return [];
    }

    return state.cashMovements
      .filter((movement) => movement.shopId === currentShop.id)
      .slice(0, 5);
  }, [currentShop, state.cashMovements]);

  const expenseCategories = useMemo(
    () =>
      state.expenseCategories
        .filter((category) => category.shopId === currentShop?.id)
        .sort((left, right) => left.name.localeCompare(right.name)),
    [currentShop?.id, state.expenseCategories]
  );

  const recentExpenses = useMemo(() => {
    if (!currentShop) {
      return [];
    }

    return state.expenses
      .filter((expense) => expense.shopId === currentShop.id)
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      .slice(0, 6);
  }, [currentShop, state.expenses]);

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
      <div className="flex w-full max-w-md rounded-[18px] border border-slate-200 bg-white p-1 shadow-[0_14px_34px_rgba(15,23,42,0.04)]">
        {([
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
                <Badge variant="neutral">{t("cashControl.billCount", { count: activeShiftSummary.billCount })}</Badge>
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

            <div className="rounded-3xl border border-dashed border-line bg-shell/70 p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                {movementType === "cash_in" ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                {t("cashControl.movementTitle")}
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
                <Button className="sm:col-span-2" onClick={handleCashMovement}>
                  {t("cashControl.saveMovement")}
                </Button>
                <FeedbackText feedback={movementFeedback} />
              </div>
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

        <div className="mt-6 rounded-3xl bg-cloud p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Wallet className="h-4 w-4" />
            {t("cashControl.recentMovements")}
          </div>
          <div className="mt-4 space-y-3">
            {recentMovements.length > 0 ? (
              recentMovements.map((movement) => (
                <div key={movement.id} className="rounded-2xl bg-white px-4 py-3">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium text-ink">
                      {movement.type === "cash_in" ? t("cashControl.cashIn") : t("cashControl.cashOut")}
                    </span>
                    <span className="text-ink">{formatCurrency(movement.amount, currency, locale)}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{movement.reason}</p>
                  <p className="mt-1 text-xs text-slate-500">{formatDateTime(movement.createdAt, locale)}</p>
                </div>
              ))
            ) : (
              <p className="text-sm leading-6 text-slate-600">{t("cashControl.noMovements")}</p>
            )}
          </div>
        </div>
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
          <div className="mt-6 grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
            <div className="rounded-3xl border border-line bg-white p-5">
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

            <div className="rounded-3xl bg-cloud p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Wallet className="h-4 w-4" />
                {t("expense.recent")}
              </div>
              <div className="mt-4 space-y-3">
                {recentExpenses.length > 0 ? (
                  recentExpenses.map((expense) => (
                    <div key={expense.id} className="rounded-2xl bg-white px-4 py-3">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-medium text-ink">{expense.categoryName}</span>
                        <span className="text-ink">{formatCurrency(expense.amount, currency, locale)}</span>
                      </div>
                      <p className="mt-1 text-sm text-slate-600">
                        {expense.vendorName || expense.paymentMethod.toUpperCase()}
                      </p>
                      {expense.note ? <p className="mt-1 text-sm text-slate-500">{expense.note}</p> : null}
                      <p className="mt-1 text-xs text-slate-500">{formatDateTime(expense.createdAt, locale)}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm leading-6 text-slate-600">{t("expense.none")}</p>
                )}
              </div>
            </div>
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
