"use client";

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
