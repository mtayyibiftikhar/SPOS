"use client";

import { useState } from "react";
import { usePosApp } from "@/components/providers/app-provider";
import { SettingsFormShell } from "@/components/settings/settings-form-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export default function TaxSettingsPage() {
  const { currentSettings, t, updateSettings } = usePosApp();
  const [enabled, setEnabled] = useState(currentSettings?.tax.enabled ?? true);
  const [name, setName] = useState(currentSettings?.tax.name ?? "VAT");
  const [rate, setRate] = useState(String(currentSettings?.tax.rate ?? 15));
  const [mode, setMode] = useState(currentSettings?.tax.mode ?? "inclusive");
  const [showOnReceipt, setShowOnReceipt] = useState(currentSettings?.tax.showOnReceipt ?? true);

  if (!currentSettings) {
    return null;
  }

  return (
    <SettingsFormShell
      title={t("settings.tax")}
      subtitle={t("settings.taxPageSubtitle")}
    >
      <form
        className="grid gap-5 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          updateSettings("tax", {
            enabled,
            name,
            rate: Number(rate),
            mode,
            showOnReceipt
          });
        }}
      >
        <div className="rounded-3xl border border-line bg-shell p-4">
          <label className="flex items-center gap-3 text-sm font-medium text-ink">
            <input checked={enabled} className="h-4 w-4" onChange={(event) => setEnabled(event.target.checked)} type="checkbox" />
            {t("common.taxEnabled")}
          </label>
        </div>
        <div className="rounded-3xl border border-line bg-shell p-4">
          <label className="flex items-center gap-3 text-sm font-medium text-ink">
            <input checked={showOnReceipt} className="h-4 w-4" onChange={(event) => setShowOnReceipt(event.target.checked)} type="checkbox" />
            {t("common.showTaxOnReceipt")}
          </label>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-ink">{t("common.taxName")}</label>
          <Input value={name} onChange={(event) => setName(event.target.value)} />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-ink">{t("common.taxRate")}</label>
          <Input inputMode="decimal" value={rate} onChange={(event) => setRate(event.target.value)} />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-ink">{t("common.taxMode")}</label>
          <Select value={mode} onChange={(event) => setMode(event.target.value as "inclusive" | "exclusive")}>
            <option value="inclusive">{t("common.inclusive")}</option>
            <option value="exclusive">{t("common.exclusive")}</option>
          </Select>
        </div>
        <div className="md:col-span-2">
          <Button type="submit">{t("common.saveChanges")}</Button>
        </div>
      </form>
    </SettingsFormShell>
  );
}
