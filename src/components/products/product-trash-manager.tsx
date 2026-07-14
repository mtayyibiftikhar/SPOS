"use client";

import { useMemo, useState } from "react";
import { RotateCcw, Search, Trash2 } from "lucide-react";
import { productKindLabelKeys } from "@/lib/i18n";
import { usePosApp } from "@/components/providers/app-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SettingsFormShell } from "@/components/settings/settings-form-shell";
import { formatCurrency, formatDateTime } from "@/lib/utils";

const PAGE_SIZE = 8;

type TrashPeriod = "all" | "today" | "week" | "custom";

function getDateOnly(value: string) {
  return value.slice(0, 10);
}

export function ProductTrashManager() {
  const { currentShopId, locale, permanentlyDeleteProduct, restoreDeletedProduct, session, state, t } = usePosApp();
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [period, setPeriod] = useState<TrashPeriod>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);

  const categories = state.categories.filter((category) => category.shopId === currentShopId);
  const deletedProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const today = new Date().toISOString().slice(0, 10);
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 6);
    const weekStartDate = weekStart.toISOString().slice(0, 10);

    return state.deletedProducts
      .filter((item) => item.shopId === currentShopId)
      .filter((item) => {
        if (categoryId !== "all" && item.product.categoryId !== categoryId) {
          return false;
        }

        const deletedDate = getDateOnly(item.deletedAt);

        if (period === "today" && deletedDate !== today) {
          return false;
        }

        if (period === "week" && deletedDate < weekStartDate) {
          return false;
        }

        if (period === "custom") {
          if (fromDate && deletedDate < fromDate) {
            return false;
          }

          if (toDate && deletedDate > toDate) {
            return false;
          }
        }

        if (!normalizedQuery) {
          return true;
        }

        return [
          item.product.name.en,
          item.product.name.ar,
          item.product.name.ur,
          item.product.barcode,
          ...(item.product.barcodes ?? []),
          item.reason,
          item.deletedBy
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedQuery));
      });
  }, [categoryId, currentShopId, fromDate, period, query, state.deletedProducts, toDate]);
  const pageCount = Math.max(1, Math.ceil(deletedProducts.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pagedProducts = deletedProducts.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const isAdmin = session?.role === "shop_admin" || session?.role === "super_admin";

  const resetToFirstPage = () => setPage(1);

  return (
    <SettingsFormShell title={t("products.trashTitle")} subtitle="">
      <div className="space-y-5">
        <Card className="grid gap-4 p-4 xl:grid-cols-[1.4fr_0.8fr_0.8fr_0.8fr_0.8fr]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-11"
              placeholder="Search product, barcode, deleted by, or reason"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                resetToFirstPage();
              }}
            />
          </div>
          <Select
            value={categoryId}
            onChange={(event) => {
              setCategoryId(event.target.value);
              resetToFirstPage();
            }}
          >
            <option value="all">{t("common.allCategories")}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
          <Select
            value={period}
            onChange={(event) => {
              setPeriod(event.target.value as TrashPeriod);
              resetToFirstPage();
            }}
          >
            <option value="all">All dates</option>
            <option value="today">{t("common.today")}</option>
            <option value="week">{t("common.thisWeek")}</option>
            <option value="custom">{t("common.customRange")}</option>
          </Select>
          <Input
            disabled={period !== "custom"}
            type="date"
            value={fromDate}
            onChange={(event) => {
              setFromDate(event.target.value);
              resetToFirstPage();
            }}
          />
          <Input
            disabled={period !== "custom"}
            type="date"
            value={toDate}
            onChange={(event) => {
              setToDate(event.target.value);
              resetToFirstPage();
            }}
          />
        </Card>

        {deletedProducts.length === 0 ? (
          <Card className="p-5">
            <p className="text-sm leading-6 text-slate-600">{t("products.trashEmpty")}</p>
          </Card>
        ) : (
          <div className="space-y-4">
            {pagedProducts.map((entry) => (
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

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-line bg-shell px-4 py-3">
              <p className="text-sm font-medium text-slate-600">
                {t("common.showingItemsRange", {
                  from: String((safePage - 1) * PAGE_SIZE + 1),
                  to: String(Math.min(safePage * PAGE_SIZE, deletedProducts.length)),
                  total: String(deletedProducts.length)
                })}
              </p>
              <div className="flex gap-2">
                <Button disabled={safePage <= 1} size="sm" variant="secondary" onClick={() => setPage((current) => Math.max(1, current - 1))}>
                  {t("common.previous")}
                </Button>
                <Button disabled={safePage >= pageCount} size="sm" variant="secondary" onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>
                  {t("common.next")}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </SettingsFormShell>
  );
}
