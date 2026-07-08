"use client";

import { usePosApp } from "@/components/providers/app-provider";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { productKindLabelKeys } from "@/lib/i18n";
import type { Product } from "@/types/pos";

function getLocalizedProductName(product: Product, locale: "en" | "ar" | "ur") {
  return product.name[locale] || product.name.en;
}

export function ProductQuickTabGrid({
  products,
  emptyMessage
}: {
  products: Product[];
  emptyMessage?: string;
}) {
  const { locale, t } = usePosApp();

  if (products.length === 0) {
    return (
      <Card className="p-5">
        <p className="text-sm leading-6 text-slate-600">{emptyMessage ?? t("products.quickTabEmpty")}</p>
      </Card>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {products.map((product) => (
        <Card key={product.id} className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-base font-semibold text-ink">{getLocalizedProductName(product, locale)}</p>
              <p className="mt-1 text-xs text-slate-500">{t(productKindLabelKeys[product.kind])}</p>
            </div>
            <Badge variant="success">{t("products.quickTabBadge")}</Badge>
          </div>
          <div className="mt-4 space-y-1 text-sm text-slate-600">
            <p>{t("products.localizedEn")}: {product.name.en}</p>
            <p>{t("products.localizedAr")}: {product.name.ar}</p>
            <p>{t("products.localizedUr")}: {product.name.ur}</p>
          </div>
          <p className="mt-4 font-medium text-ink">{formatCurrency(product.salePrice, "SAR", locale)}</p>
        </Card>
      ))}
    </div>
  );
}
