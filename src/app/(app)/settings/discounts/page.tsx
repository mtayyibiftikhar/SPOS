"use client";

import { useMemo, useState } from "react";
import { BadgePercent, Search, Trash2 } from "lucide-react";
import { usePosApp } from "@/components/providers/app-provider";
import { SettingsFormShell } from "@/components/settings/settings-form-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { DiscountType, PromotionScope } from "@/types/pos";

function cleanDiscountValue(type: DiscountType, value: string | number) {
  const parsed = typeof value === "number" ? value : Number(value || 0);
  const safe = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;

  return type === "percentage" ? Math.min(100, safe) : safe;
}

export default function DiscountSettingsPage() {
  const { currentSettings, currentShopId, locale, state, t, updateSettings } = usePosApp();
  const [promotionEnabled, setPromotionEnabled] = useState(currentSettings?.tax.promotionEnabled ?? false);
  const [promotionScope, setPromotionScope] = useState<PromotionScope>(
    currentSettings?.tax.promotionScope ?? (currentSettings?.tax.promotionTarget === "items" ? "products" : "bill")
  );
  const [promotionStartsAt, setPromotionStartsAt] = useState(currentSettings?.tax.promotionStartsAt ?? "");
  const [promotionEndsAt, setPromotionEndsAt] = useState(currentSettings?.tax.promotionEndsAt ?? "");
  const [promotionDiscountType, setPromotionDiscountType] = useState<DiscountType>(
    currentSettings?.tax.promotionDiscountType ?? "percentage"
  );
  const [promotionDiscountValue, setPromotionDiscountValue] = useState(String(currentSettings?.tax.promotionDiscountValue ?? 0));
  const [promotionProductIds, setPromotionProductIds] = useState<string[]>(currentSettings?.tax.promotionProductIds ?? []);
  const [permanentItemDiscounts, setPermanentItemDiscounts] = useState(
    currentSettings?.tax.permanentItemDiscounts ?? {}
  );
  const [itemSearch, setItemSearch] = useState("");
  const [permanentProductId, setPermanentProductId] = useState("");
  const [permanentDiscountType, setPermanentDiscountType] = useState<DiscountType>("percentage");
  const [permanentDiscountValue, setPermanentDiscountValue] = useState("0");

  const products = useMemo(
    () =>
      state.products
        .filter((product) => product.shopId === currentShopId && product.status === "active")
        .sort((left, right) => left.name.en.localeCompare(right.name.en)),
    [currentShopId, state.products]
  );
  const filteredProducts = useMemo(() => {
    const term = itemSearch.trim().toLowerCase();

    if (!term) {
      return products.slice(0, 10);
    }

    return products
      .filter((product) =>
        [product.name.en, product.name.ar, product.name.ur, product.barcode, ...(product.barcodes ?? [])]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term))
      )
      .slice(0, 10);
  }, [itemSearch, products]);

  if (!currentSettings) {
    return null;
  }

  const togglePromotionProduct = (productId: string) => {
    setPromotionProductIds((current) =>
      current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId]
    );
  };

  const savePermanentDiscount = () => {
    if (!permanentProductId) {
      return;
    }

    setPermanentItemDiscounts((current) => ({
      ...current,
      [permanentProductId]: {
        discountType: permanentDiscountType,
        discountValue: cleanDiscountValue(permanentDiscountType, permanentDiscountValue)
      }
    }));
    setPermanentProductId("");
    setPermanentDiscountValue("0");
  };

  return (
    <SettingsFormShell title={t("settings.discounts")} subtitle={t("settings.discountsPageSubtitle")}>
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          updateSettings("tax", {
            promotionEnabled,
            promotionTarget: promotionScope === "bill" ? "bill" : "items",
            promotionScope,
            promotionStartsAt: promotionStartsAt || undefined,
            promotionEndsAt: promotionEndsAt || undefined,
            promotionProductIds,
            promotionDiscountType,
            promotionDiscountValue: cleanDiscountValue(promotionDiscountType, promotionDiscountValue),
            permanentItemDiscounts
          });
        }}
      >
        <Card className="border-emerald-100 bg-emerald-50/50 p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex items-start gap-4">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-emerald-700 shadow-sm">
                <BadgePercent className="h-6 w-6" />
              </span>
              <div>
                <h2 className="font-display text-2xl font-semibold tracking-[-0.03em] text-ink">Scheduled promotion</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  Run a dated offer for the whole bill, all products, all services, or selected items.
                </p>
              </div>
            </div>
            <label className="inline-flex items-center gap-3 rounded-full border border-emerald-200 bg-white px-4 py-3 text-sm font-semibold text-ink">
              <input
                checked={promotionEnabled}
                className="h-4 w-4 accent-emerald-600"
                type="checkbox"
                onChange={(event) => setPromotionEnabled(event.target.checked)}
              />
              {t("common.enabled")}
            </label>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-ink">Start date</label>
              <Input type="date" value={promotionStartsAt} onChange={(event) => setPromotionStartsAt(event.target.value)} />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-ink">End date</label>
              <Input type="date" value={promotionEndsAt} onChange={(event) => setPromotionEndsAt(event.target.value)} />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-ink">{t("settings.promotionTarget")}</label>
              <Select value={promotionScope} onChange={(event) => setPromotionScope(event.target.value as PromotionScope)}>
                <option value="bill">{t("settings.promotionTargetBill")}</option>
                <option value="products">{t("settings.promotionTargetProducts")}</option>
                <option value="services">{t("settings.promotionTargetServices")}</option>
                <option value="selected">{t("settings.promotionTargetSelected")}</option>
              </Select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-ink">{t("common.discountType")}</label>
              <Select
                value={promotionDiscountType}
                onChange={(event) => setPromotionDiscountType(event.target.value as DiscountType)}
              >
                <option value="percentage">{t("common.percentage")}</option>
                <option value="fixed">{t("common.fixed")}</option>
              </Select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-ink">{t("common.discountValue")}</label>
              <Input
                inputMode="decimal"
                value={promotionDiscountValue}
                onChange={(event) => setPromotionDiscountValue(event.target.value)}
              />
            </div>
          </div>

          {promotionScope === "selected" ? (
            <div className="mt-5 rounded-[24px] border border-emerald-100 bg-white p-4">
              <label className="mb-2 block text-sm font-medium text-ink">Select promo items</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  className="pl-11"
                  placeholder="Search product, service, or barcode"
                  value={itemSearch}
                  onChange={(event) => setItemSearch(event.target.value)}
                />
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {filteredProducts.map((product) => {
                  const selected = promotionProductIds.includes(product.id);

                  return (
                    <button
                      key={product.id}
                      className={`rounded-2xl border px-4 py-3 text-left transition ${
                        selected ? "border-emerald-300 bg-emerald-50" : "border-line bg-shell hover:border-emerald-200"
                      }`}
                      type="button"
                      onClick={() => togglePromotionProduct(product.id)}
                    >
                      <span className="block text-sm font-semibold text-ink">{product.name[locale] || product.name.en}</span>
                      <span className="mt-1 block text-xs text-slate-500">{product.kind}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </Card>

        <Card className="p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h2 className="font-display text-2xl font-semibold tracking-[-0.03em] text-ink">Permanent item discount</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Set a standing discount for a product or service. Scheduled promotions take priority while active.
              </p>
            </div>
            <Badge variant="neutral">{Object.keys(permanentItemDiscounts).length} items</Badge>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[1.5fr_0.7fr_0.7fr_auto]">
            <Select value={permanentProductId} onChange={(event) => setPermanentProductId(event.target.value)}>
              <option value="">Select item</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name.en}
                </option>
              ))}
            </Select>
            <Select
              value={permanentDiscountType}
              onChange={(event) => setPermanentDiscountType(event.target.value as DiscountType)}
            >
              <option value="percentage">{t("common.percentage")}</option>
              <option value="fixed">{t("common.fixed")}</option>
            </Select>
            <Input
              inputMode="decimal"
              value={permanentDiscountValue}
              onChange={(event) => setPermanentDiscountValue(event.target.value)}
            />
            <Button disabled={!permanentProductId} onClick={savePermanentDiscount}>
              Add discount
            </Button>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {Object.entries(permanentItemDiscounts).map(([productId, discount]) => {
              const product = products.find((item) => item.id === productId);

              if (!product) {
                return null;
              }

              return (
                <div key={productId} className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-shell p-4">
                  <div>
                    <p className="text-sm font-semibold text-ink">{product.name[locale] || product.name.en}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {discount.discountType === "percentage" ? `${discount.discountValue}%` : `SAR ${discount.discountValue}`}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      setPermanentItemDiscounts((current) => {
                        const next = { ...current };
                        delete next[productId];
                        return next;
                      })
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        </Card>

        <Button type="submit">{t("common.saveChanges")}</Button>
      </form>
    </SettingsFormShell>
  );
}
