"use client";

import { ArrowRight, Megaphone, Sparkles } from "lucide-react";
import { calculateBusinessDaySummary, calculateShiftSummary } from "@/lib/cash-control";
import { CashControlPanel } from "@/components/dashboard/cash-control-panel";
import { usePosApp } from "@/components/providers/app-provider";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatCurrency } from "@/lib/utils";

export function DashboardOverview() {
  const { currentBusinessDay, currentShift, currentShop, currentUsers, locale, state, t } = usePosApp();
  const currentDaySummary =
    currentBusinessDay && currentShop
      ? calculateBusinessDaySummary({
          businessDate: currentBusinessDay.businessDate,
          shopId: currentShop.id,
          timeZone: currentShop.timezone,
          bills: state.bills,
          cashMovements: state.cashMovements,
          shifts: state.shifts,
          refunds: state.refunds
        })
      : null;
  const currentShiftSummary = currentShift
    ? calculateShiftSummary({
        shift: currentShift,
        bills: state.bills,
        cashMovements: state.cashMovements,
        refunds: state.refunds
      })
    : null;
  const connectedDevices = currentShop
    ? state.deviceActivations.filter((activation) => activation.shopId === currentShop.id).length
    : 0;

  return (
    <div className="space-y-6">
      <PageHeader title={t("dashboard.title")} subtitle={t("dashboard.subtitle")} eyebrow={t("nav.dashboard")} />

      {state.brand.loginAdEnabled ? (
        <Card className="overflow-hidden border-emerald-100 bg-white p-0 shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
          <div className="grid gap-0 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="relative min-h-56 overflow-hidden bg-slate-950">
              {state.brand.loginAdImageUrl ? (
                <img alt={state.brand.loginAdTitle} className="h-full w-full object-cover" src={state.brand.loginAdImageUrl} />
              ) : (
                <div className="grid h-full min-h-56 place-items-center bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.42),_transparent_34%),linear-gradient(135deg,#020617_0%,#064e3b_100%)]">
                  <Sparkles className="h-12 w-12 text-emerald-100" />
                </div>
              )}
              <div className="absolute left-5 top-5 inline-flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-emerald-800 shadow-soft">
                <Megaphone className="h-4 w-4" />
                Announcement
              </div>
            </div>
            <div className="flex flex-col justify-center p-6 lg:p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">{state.brand.companyName}</p>
              <h2 className="mt-3 font-display text-3xl font-semibold leading-tight text-slate-950">
                {state.brand.loginAdTitle}
              </h2>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600">{state.brand.loginAdMessage}</p>
              {state.brand.loginAdCtaLabel && state.brand.loginAdCtaUrl ? (
                <a
                  className="mt-6 inline-flex w-fit items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
                  href={state.brand.loginAdCtaUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  {state.brand.loginAdCtaLabel}
                  <ArrowRight className="h-4 w-4" />
                </a>
              ) : null}
            </div>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="p-5">
          <p className="text-sm text-slate-500">{t("dashboard.todaySales")}</p>
          <p className="mt-3 font-display text-3xl font-semibold text-ink">
            {formatCurrency(currentDaySummary?.netSales ?? 0, currentShop?.currency ?? "SAR", locale)}
          </p>
          <p className="mt-2 text-sm text-slate-500">
            {currentBusinessDay ? t("dashboard.dayOpenHint") : t("dashboard.dayClosedHint")}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-slate-500">{t("dashboard.activeShift")}</p>
          <p className="mt-3 font-display text-3xl font-semibold text-ink">{currentShift ? 1 : 0}</p>
          <p className="mt-2 text-sm text-slate-500">
            {currentShiftSummary
              ? t("dashboard.expectedCashHint", {
                  amount: formatCurrency(currentShiftSummary.expectedCash, currentShop?.currency ?? "SAR", locale)
                })
              : t("dashboard.startShiftHint")}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-slate-500">{t("dashboard.activeUsers")}</p>
          <p className="mt-3 font-display text-3xl font-semibold text-ink">{currentUsers.length}</p>
          <p className="mt-2 text-sm text-slate-500">{t("dashboard.usersDesc")}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-slate-500">Activated devices</p>
          <p className="mt-3 font-display text-3xl font-semibold text-ink">{connectedDevices}</p>
          <p className="mt-2 text-sm text-slate-500">Devices currently allowed by the product key.</p>
        </Card>
      </div>

      <CashControlPanel />
    </div>
  );
}
