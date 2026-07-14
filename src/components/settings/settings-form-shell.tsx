"use client";

import { Card } from "@/components/ui/card";
import { SettingsSectionNav } from "@/components/settings/settings-section-nav";
import { usePosApp } from "@/components/providers/app-provider";

export function SettingsFormShell({
  title,
  subtitle: _subtitle,
  adminOnly = true,
  children
}: {
  title: string;
  subtitle: string;
  adminOnly?: boolean;
  children: React.ReactNode;
}) {
  const { session } = usePosApp();
  const canManageSettings = session?.role === "shop_admin" || session?.role === "super_admin";

  if (adminOnly && !canManageSettings) {
    return (
      <div className="space-y-5">
        <SettingsSectionNav />
        <Card className="p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-700">Settings access</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-[-0.04em] text-ink">Admin access required</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
            This settings area can change store data, users, pricing, tax, or backups. Ask the shop admin to open it.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <SettingsSectionNav />
      <Card className="p-5 sm:p-6">
        <div className="mb-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-700">Settings</p>
            <h1 className="mt-2 font-display text-2xl font-semibold tracking-[-0.04em] text-ink">{title}</h1>
          </div>
        </div>
        {children}
      </Card>
    </div>
  );
}
