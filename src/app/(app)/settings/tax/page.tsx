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
  const [promotionEnabled, setPromotionEnabled] = useState(currentSettings?.tax.promotionEnabled ?? false);
  const [promotionTarget, setPromotionTarget] = useState(currentSettings?.tax.promotionTarget ?? "bill");
  const [promotionDiscountType, setPromotionDiscountType] = useState(
    currentSettings?.tax.promotionDiscountType ?? "percentage"
  );
  const [promotionDiscountValue, setPromotionDiscountValue] = useState(
    String(currentSettings?.tax.promotionDiscountValue ?? 0)
  );

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
          const parsedPromotionValue = Number(promotionDiscountValue);
          const normalizedPromotionValue = Number.isFinite(parsedPromotionValue)
            ? Math.max(0, parsedPromotionValue)
            : 0;

          updateSettings("tax", {
            enabled,
            name,
            rate: Number(rate),
            mode,
            showOnReceipt,
            promotionEnabled,
            promotionTarget,
            promotionDiscountType,
            promotionDiscountValue:
              promotionDiscountType === "percentage"
                ? Math.min(100, normalizedPromotionValue)
                : normalizedPromotionValue
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
        <div className="rounded-3xl border border-emerald-100 bg-emerald-50/70 p-4 md:col-span-2">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
                {t("settings.promotionDiscount")}
              </p>
              <h2 className="mt-2 font-display text-2xl font-semibold text-ink">
                {t("settings.autoPromotion")}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                {t("settings.autoPromotionDesc")}
              </p>
            </div>
            <label className="inline-flex items-center gap-3 rounded-full border border-emerald-200 bg-white px-4 py-3 text-sm font-semibold text-ink">
              <input
                checked={promotionEnabled}
                className="h-4 w-4 accent-emerald-600"
                onChange={(event) => setPromotionEnabled(event.target.checked)}
                type="checkbox"
              />
              {t("common.enabled")}
            </label>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            <div>
              <label className="mb-2 block text-sm font-medium text-ink">{t("settings.promotionTarget")}</label>
              <Select
                value={promotionTarget}
                onChange={(event) => setPromotionTarget(event.target.value as "bill" | "items")}
              >
                <option value="bill">{t("settings.promotionTargetBill")}</option>
                <option value="items">{t("settings.promotionTargetItems")}</option>
              </Select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-ink">{t("common.discountType")}</label>
              <Select
                value={promotionDiscountType}
                onChange={(event) => setPromotionDiscountType(event.target.value as "fixed" | "percentage")}
              >
                <option value="percentage">{t("common.percentage")}</option>
                <option value="fixed">{t("common.fixed")}</option>
              </Select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-ink">{t("common.discountValue")}</label>
              <Input
                inputMode="decimal"
                min={0}
                value={promotionDiscountValue}
                onChange={(event) => setPromotionDiscountValue(event.target.value)}
              />
              {promotionDiscountType === "percentage" ? (
                <p className="mt-2 text-xs text-slate-500">{t("settings.promotionPercentLimit")}</p>
              ) : null}
            </div>
          </div>
        </div>
        <div className="md:col-span-2">
          <Button type="submit">{t("common.saveChanges")}</Button>
        </div>
      </form>
    </SettingsFormShell>
  );
}
