"use client";

import { RotateCcw, Trash2 } from "lucide-react";
import { productKindLabelKeys } from "@/lib/i18n";
import { usePosApp } from "@/components/providers/app-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SettingsFormShell } from "@/components/settings/settings-form-shell";
import { formatCurrency, formatDateTime } from "@/lib/utils";

export function ProductTrashManager() {
  const { currentShopId, locale, permanentlyDeleteProduct, restoreDeletedProduct, session, state, t } = usePosApp();

  const deletedProducts = state.deletedProducts.filter((item) => item.shopId === currentShopId);
  const isAdmin = session?.role === "shop_admin";

  return (
    <div className="space-y-6">
      <SettingsFormShell
        title={t("products.trashTitle")}
        subtitle={t("products.trashSubtitle")}
      >
        {deletedProducts.length === 0 ? (
          <Card className="p-5">
            <p className="text-sm leading-6 text-slate-600">{t("products.trashEmpty")}</p>
          </Card>
        ) : (
          <div className="space-y-4">
            {deletedProducts.map((entry) => (
              <Card key={entry.id} className="p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-lg font-semibold text-ink">{entry.product.name[locale] || entry.product.name.en}</p>
                      <Badge variant="neutral">{t(productKindLabelKeys[entry.product.kind])}</Badge>
                      <Badge variant="warning">{entry.product.quickTab ? t("products.quickTabBadge") : t("products.catalogOnlyBadge")}</Badge>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">{t("common.nameArabic")}: {entry.product.name.ar}</p>
                    <p className="text-sm text-slate-600">{t("common.nameUrdu")}: {entry.product.name.ur}</p>
                    <p className="mt-3 text-sm text-slate-600">
                      {t("common.salePrice")} {formatCurrency(entry.product.salePrice, "SAR", locale)} | {t("common.costPrice")}{" "}
                      {formatCurrency(entry.product.costPrice, "SAR", locale)}
                    </p>
                    <div className="mt-4 grid gap-2 text-sm text-slate-600 md:grid-cols-3">
                      <p>
                        <span className="font-medium text-ink">{t("common.deletedBy")}:</span> {entry.deletedBy}
                      </p>
                      <p>
                        <span className="font-medium text-ink">{t("common.deletedAt")}:</span> {formatDateTime(entry.deletedAt, locale)}
                      </p>
                      <p>
                        <span className="font-medium text-ink">{t("common.reason")}:</span> {entry.reason}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    {isAdmin ? (
                      <Button size="sm" variant="secondary" onClick={() => restoreDeletedProduct(entry.id)}>
                        <span className="inline-flex items-center gap-2">
                          <RotateCcw className="h-4 w-4" />
                          {t("common.restore")}
                        </span>
                      </Button>
                    ) : null}
                    {isAdmin ? (
                      <Button size="sm" variant="danger" onClick={() => permanentlyDeleteProduct(entry.id)}>
                        <span className="inline-flex items-center gap-2">
                          <Trash2 className="h-4 w-4" />
                          {t("common.deleteForever")}
                        </span>
                      </Button>
                    ) : (
                      <Badge variant="neutral">{t("common.readOnly")}</Badge>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </SettingsFormShell>
    </div>
  );
}
