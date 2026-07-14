"use client";

import { usePosApp } from "@/components/providers/app-provider";
import { SettingsSectionNav } from "@/components/settings/settings-section-nav";

export function SettingsHub() {
  const { session } = usePosApp();
  const canManageSettings = session?.role === "shop_admin" || session?.role === "super_admin";

  return (
    <div className="space-y-5">
      <SettingsSectionNav />
      {!canManageSettings ? (
        <div className="rounded-[28px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-medium text-amber-900">
          Staff users can only see support information. Store controls are admin-only.
        </div>
      ) : null}
    </div>
  );
}
