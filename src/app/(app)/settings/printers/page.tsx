"use client";

import { useState } from "react";
import { Printer, ReceiptText } from "lucide-react";
import { usePosApp } from "@/components/providers/app-provider";
import { SettingsFormShell } from "@/components/settings/settings-form-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
        className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]"
        onSubmit={(event) => {
          event.preventDefault();
          updateSettings("printer", { receiptSize, autoPrintAfterSale });
        }}
      >
        <Card className="space-y-5 p-5">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
            <Printer className="h-6 w-6" />
          </span>
          <div>
            <label className="mb-2 block text-sm font-medium text-ink">{t("common.receiptSize")}</label>
            <Select value={receiptSize} onChange={(event) => setReceiptSize(event.target.value as "58mm" | "80mm" | "a4")}>
              <option value="58mm">58mm thermal</option>
              <option value="80mm">80mm thermal</option>
              <option value="a4">A4 invoice</option>
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
          </div>
          <Button type="submit">{t("common.saveChanges")}</Button>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-950 text-white">
              <ReceiptText className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Print preview</p>
              <h2 className="font-display text-2xl font-semibold text-ink">
                {receiptSize === "a4" ? "A4 invoice layout" : `${receiptSize} receipt layout`}
              </h2>
            </div>
          </div>
          <div className="mt-5 rounded-[28px] border border-line bg-white p-5">
            {receiptSize === "a4" ? (
              <div className="space-y-4">
                <div className="flex items-start justify-between border-b border-line pb-4">
                  <div>
                    <p className="text-lg font-bold text-ink">Shop name</p>
                    <p className="mt-1 text-sm text-slate-500">Address, VAT, phone, and receipt details</p>
                  </div>
                  <div className="h-16 w-16 rounded-2xl bg-shell" />
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl bg-shell p-3 text-sm">Customer</div>
                  <div className="rounded-2xl bg-shell p-3 text-sm">Payment</div>
                  <div className="rounded-2xl bg-shell p-3 text-sm">Tax summary</div>
                </div>
                <div className="rounded-2xl border border-line p-4 text-sm text-slate-600">
                  Wide item table with product, quantity, price, discount, VAT, and total.
                </div>
              </div>
            ) : (
              <div className="mx-auto max-w-[230px] rounded-2xl border border-line p-4 text-center text-sm text-slate-600">
                Thermal layout stays compact for quick counter receipts.
              </div>
            )}
          </div>
        </Card>
      </form>
    </SettingsFormShell>
  );
}
