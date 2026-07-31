"use client";

import { usePosApp } from "@/components/providers/app-provider";
import { SettingsSectionNav } from "@/components/settings/settings-section-nav";
import { hasShopPermission } from "@/lib/access-control";

export function SettingsHub() {
  const { currentSettings, session } = usePosApp();
  const canManageSettings = hasShopPermission(session, currentSettings?.pos, "settings");

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
