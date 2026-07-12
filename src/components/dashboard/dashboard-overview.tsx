"use client";

import { CashControlPanel } from "@/components/dashboard/cash-control-panel";
import { usePosApp } from "@/components/providers/app-provider";
import { Card } from "@/components/ui/card";

export function DashboardOverview() {
  const { state } = usePosApp();
  const dashboardAnnouncement =
    state.brand.loginAdEnabled && state.brand.loginAdImageUrl ? (
      <Card className="overflow-hidden border-slate-200 bg-white p-0 shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
        {state.brand.loginAdCtaUrl ? (
          <a href={state.brand.loginAdCtaUrl} rel="noreferrer" target="_blank">
            <img alt={state.brand.loginAdTitle || "POS dashboard image"} className="max-h-[420px] w-full object-cover" src={state.brand.loginAdImageUrl} />
          </a>
        ) : (
          <img alt={state.brand.loginAdTitle || "POS dashboard image"} className="max-h-[420px] w-full object-cover" src={state.brand.loginAdImageUrl} />
        )}
      </Card>
    ) : null;

  return (
    <div className="space-y-6">
      <CashControlPanel />

      {dashboardAnnouncement}
    </div>
  );
}
