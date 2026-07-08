"use client";

import { useState } from "react";
import { usePosApp } from "@/components/providers/app-provider";
import { SettingsFormShell } from "@/components/settings/settings-form-shell";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export default function ReceiptSettingsPage() {
  const { currentSettings, t, updateSettings } = usePosApp();
  const [footerText, setFooterText] = useState(currentSettings?.receipt.footerText ?? "");
  const [showTax, setShowTax] = useState(currentSettings?.receipt.showTax ?? true);
  const [showCustomer, setShowCustomer] = useState(currentSettings?.receipt.showCustomer ?? true);
  const [showCashier, setShowCashier] = useState(currentSettings?.receipt.showCashier ?? true);
  const [receiptSize, setReceiptSize] = useState(currentSettings?.receipt.receiptSize ?? "80mm");

  if (!currentSettings) {
    return null;
  }

  return (
    <SettingsFormShell
      title={t("settings.receipt")}
      subtitle={t("settings.receiptPageSubtitle")}
    >
      <form
        className="grid gap-5 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          updateSettings("receipt", {
            footerText,
            showTax,
            showCustomer,
            showCashier,
            receiptSize
          });
        }}
      >
        <div className="md:col-span-2">
          <label className="mb-2 block text-sm font-medium text-ink">{t("common.footerText")}</label>
          <Textarea value={footerText} onChange={(event) => setFooterText(event.target.value)} />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-ink">{t("common.receiptSize")}</label>
          <Select value={receiptSize} onChange={(event) => setReceiptSize(event.target.value as "58mm" | "80mm" | "a4")}>
            <option value="58mm">58mm</option>
            <option value="80mm">80mm</option>
            <option value="a4">A4</option>
          </Select>
        </div>
        <div className="grid gap-3 rounded-3xl border border-line bg-shell p-4 text-sm text-ink">
          <label className="flex items-center gap-3">
            <input checked={showTax} className="h-4 w-4" onChange={(event) => setShowTax(event.target.checked)} type="checkbox" />
            {t("common.showTax")}
          </label>
          <label className="flex items-center gap-3">
            <input checked={showCustomer} className="h-4 w-4" onChange={(event) => setShowCustomer(event.target.checked)} type="checkbox" />
            {t("common.showCustomer")}
          </label>
          <label className="flex items-center gap-3">
            <input checked={showCashier} className="h-4 w-4" onChange={(event) => setShowCashier(event.target.checked)} type="checkbox" />
            {t("common.showCashier")}
          </label>
        </div>
        <div className="md:col-span-2">
          <Button type="submit">{t("common.saveChanges")}</Button>
        </div>
      </form>
    </SettingsFormShell>
  );
}
