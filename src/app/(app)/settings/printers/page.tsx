"use client";

import { useState } from "react";
import { usePosApp } from "@/components/providers/app-provider";
import { SettingsFormShell } from "@/components/settings/settings-form-shell";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

export default function PrinterSettingsPage() {
  const { currentSettings, t, updateSettings } = usePosApp();
  const [receiptSize, setReceiptSize] = useState(currentSettings?.printer.receiptSize ?? "80mm");
  const [autoPrintAfterSale, setAutoPrintAfterSale] = useState(
    currentSettings?.printer.autoPrintAfterSale ?? false
  );

  if (!currentSettings) {
    return null;
  }

  return (
    <SettingsFormShell
      title={t("settings.printer")}
      subtitle={t("settings.printerPageSubtitle")}
    >
      <form
        className="grid gap-5 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          updateSettings("printer", { receiptSize, autoPrintAfterSale });
        }}
      >
        <div>
          <label className="mb-2 block text-sm font-medium text-ink">{t("common.receiptSize")}</label>
          <Select value={receiptSize} onChange={(event) => setReceiptSize(event.target.value as "58mm" | "80mm" | "a4")}>
            <option value="58mm">58mm</option>
            <option value="80mm">80mm</option>
            <option value="a4">A4</option>
          </Select>
        </div>
        <div className="rounded-3xl border border-line bg-shell p-4">
          <label className="flex items-center gap-3 text-sm font-medium text-ink">
            <input
              checked={autoPrintAfterSale}
              className="h-4 w-4"
              onChange={(event) => setAutoPrintAfterSale(event.target.checked)}
              type="checkbox"
            />
            {t("common.autoPrintAfterSale")}
          </label>
          <p className="mt-3 text-sm leading-6 text-slate-600">{t("settings.printerHardwareHint")}</p>
        </div>
        <div className="md:col-span-2">
          <Button type="submit">{t("common.saveChanges")}</Button>
        </div>
      </form>
    </SettingsFormShell>
  );
}
