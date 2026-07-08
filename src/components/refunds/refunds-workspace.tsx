"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, ReceiptText, Search } from "lucide-react";
import { usePosApp } from "@/components/providers/app-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { WorkspaceSectionsNav } from "@/components/ui/workspace-sections-nav";
import { billStatusLabelKeys, paymentMethodLabelKeys } from "@/lib/i18n";
import { calculateBillItemProfit, calculateBillRefundState } from "@/lib/refunds";
import { formatBusinessDate, formatCurrency, formatDateTime } from "@/lib/utils";
import type { PaymentMethod } from "@/types/pos";

function translateRefundError(t: ReturnType<typeof usePosApp>["t"], message?: string) {
  switch (message) {
    case "Session unavailable.":
      return t("refund.sessionUnavailable");
    case "Only the shop admin can create refunds.":
      return t("refund.adminOnly");
    case "The original bill could not be found.":
      return t("refund.billMissing");
    case "Cancelled bills cannot be refunded.":
      return t("refund.cancelledBlocked");
    case "This bill has already been fully refunded.":
      return t("refund.fullRefunded");
    case "Start the business day before creating refunds.":
      return t("billing.dayRequired");
    case "Start your shift before creating refunds.":
      return t("billing.shiftRequired");
    case "Add a refund reason before saving.":
      return t("refund.reasonRequired");
    case "Select at least one refundable quantity.":
      return t("refund.selectQuantity");
    case "Account adjustment refunds require a saved customer.":
      return t("refund.accountAdjustmentRequiresCustomer");
    default:
      return t("refund.error");
  }
}

export function RefundsWorkspace() {
  const searchParams = useSearchParams();
  const { createRefund, currentShop, currentShopId, locale, session, state, t } = usePosApp();
  const [search, setSearch] = useState("");
  const [selectedBillId, setSelectedBillId] = useState<string | null>(searchParams.get("billId"));
  const [payoutMethod, setPayoutMethod] = useState<PaymentMethod>("cash");
  const [refundReason, setRefundReason] = useState("");
  const [refundQuantities, setRefundQuantities] = useState<Record<string, string>>({});
  const [isRefunding, setIsRefunding] = useState(false);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const activeView = searchParams.get("view") === "history" ? "history" : "new";

  const bills = useMemo(
    () =>
      state.bills
        .filter((bill) => bill.shopId === currentShopId)
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()),
    [currentShopId, state.bills]
  );

  const filteredBills = useMemo(() => {
    const query = search.trim().toLowerCase();

    return bills.filter((bill) => {
      if (!query) {
        return true;
      }

      return [bill.number, bill.customerName, bill.customerPhone, bill.createdAt]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query));
    });
  }, [bills, search]);

  useEffect(() => {
    if (!selectedBillId && filteredBills.length > 0) {
      setSelectedBillId(filteredBills[0].id);
      return;
    }

    if (selectedBillId && !bills.some((bill) => bill.id === selectedBillId)) {
      setSelectedBillId(filteredBills[0]?.id ?? null);
    }
  }, [bills, filteredBills, selectedBillId]);

  const selectedBill = bills.find((bill) => bill.id === selectedBillId) ?? null;

  useEffect(() => {
    if (selectedBill) {
      setPayoutMethod(selectedBill.paymentMethod);
    }
  }, [selectedBill?.id, selectedBill?.paymentMethod]);

  const items = selectedBill ? state.billItems.filter((item) => item.billId === selectedBill.id) : [];
  const refundState = calculateBillRefundState({
    billId: selectedBill?.id ?? "",
    billItems: items,
    refunds: state.refunds,
    refundItems: state.refundItems
  });
  const refundHistory = refundState.billRefunds.map((refund) => ({
    refund,
    items: refundState.relatedRefundItems.filter((entry) => entry.refundId === refund.id)
  }));
  const refundableItems = refundState.refundableItems.map((entry) => {
    const parsedQuantity = Number.parseInt(refundQuantities[entry.item.id] ?? "", 10);
    const selectedQuantity = Number.isNaN(parsedQuantity)
      ? 0
      : Math.min(entry.remainingQuantity, Math.max(0, parsedQuantity));

    return {
      ...entry,
      selectedQuantity,
      refundAmount: entry.item.unitPrice * selectedQuantity,
      profitAdjustment: calculateBillItemProfit(entry.item, selectedQuantity)
    };
  });
  const selectedRefundItems = refundableItems.filter((entry) => entry.selectedQuantity > 0);
  const estimatedRefundAmount = selectedRefundItems.reduce((sum, entry) => sum + entry.refundAmount, 0);
  const estimatedProfitAdjustment = selectedRefundItems.reduce((sum, entry) => sum + entry.profitAdjustment, 0);
  const canCreateRefund = session?.role === "shop_admin";
  const currency = currentShop?.currency ?? "SAR";
  const allRefundHistory = useMemo(
    () =>
      state.refunds
        .filter((refund) => refund.shopId === currentShopId)
        .map((refund) => ({
          refund,
          bill: state.bills.find((bill) => bill.id === refund.originalBillId),
          items: state.refundItems.filter((item) => item.refundId === refund.id)
        }))
        .sort((left, right) => new Date(right.refund.returnDate).getTime() - new Date(left.refund.returnDate).getTime()),
    [currentShopId, state.bills, state.refundItems, state.refunds]
  );

  const handleRefundQuantityChange = (billItemId: string, remainingQuantity: number, value: string) => {
    if (!value) {
      setRefundQuantities((current) => ({ ...current, [billItemId]: "" }));
      return;
    }

    const digitsOnly = value.replace(/\D/g, "");
    const parsedQuantity = Number.parseInt(digitsOnly, 10);
    const nextValue = Number.isNaN(parsedQuantity)
      ? ""
      : String(Math.min(remainingQuantity, Math.max(0, parsedQuantity)));

    setRefundQuantities((current) => ({
      ...current,
      [billItemId]: nextValue
    }));
  };

  const handleCreateRefund = () => {
    if (!selectedBill) {
      return;
    }

    setIsRefunding(true);
    setFeedback(null);

    const result = createRefund({
      billId: selectedBill.id,
      payoutMethod,
      reason: refundReason.trim(),
      items: selectedRefundItems.map((entry) => ({
        billItemId: entry.item.id,
        quantity: entry.selectedQuantity
      }))
    });

    if (!result.ok) {
      setFeedback({
        tone: "error",
        message: translateRefundError(t, result.message)
      });
      setIsRefunding(false);
      return;
    }

    setRefundQuantities({});
    setRefundReason("");
    setFeedback({
      tone: "success",
      message: t("refund.success")
    });
    setIsRefunding(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t("nav.refunds")} subtitle={t("refund.workspaceSubtitle")} eyebrow={t("nav.refunds")} />

      <WorkspaceSectionsNav
        compact
        items={[
          {
            href: "/refunds?view=new",
            active: activeView === "new",
            label: t("refund.title"),
            description: t("refund.workspaceSubtitle")
          },
          {
            href: "/refunds?view=history",
            active: activeView === "history",
            label: t("refund.historyTitle"),
            description: t("reports.sectionRefundsDesc")
          }
        ]}
      />

      {activeView === "history" ? (
        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-semibold text-slate-950">{t("refund.historyTitle")}</h2>
            <p className="text-sm text-slate-500">{t("reports.sectionRefundsDesc")}</p>
          </div>

          {allRefundHistory.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-[0.14em] text-slate-500">
                  <tr>
                    <th className="px-5 py-3">{t("reports.originalReceipt")}</th>
                    <th className="px-5 py-3">{t("reports.refundDate")}</th>
                    <th className="px-5 py-3">{t("reports.refundReason")}</th>
                    <th className="px-5 py-3">{t("reports.refundAmount")}</th>
                    <th className="px-5 py-3">{t("refund.itemsTitle")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {allRefundHistory.map(({ bill, items: historyItems, refund }) => (
                    <tr key={refund.id}>
                      <td className="px-5 py-4 font-semibold text-slate-950">{bill?.number ?? refund.originalBillId}</td>
                      <td className="px-5 py-4 text-slate-600">{formatDateTime(refund.returnDate, locale)}</td>
                      <td className="px-5 py-4 text-slate-600">{refund.reason}</td>
                      <td className="px-5 py-4 text-slate-950">{formatCurrency(refund.amount, currency, locale)}</td>
                      <td className="px-5 py-4 text-slate-600">{historyItems.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-6 text-sm text-slate-600">{t("refund.noHistory")}</div>
          )}
        </Card>
      ) : (
      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Card className="flex flex-col overflow-hidden p-0 xl:max-h-[calc(100dvh-11rem)]">
          <div className="border-b border-slate-200 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-olive">{t("refund.billSearchTitle")}</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">{t("refund.billSearchTitle")}</h2>
            <div className="relative mt-4">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                className="h-11 rounded-[16px] border-slate-200 bg-slate-50 pl-11"
                placeholder={t("bills.searchPlaceholder")}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto p-4">
            {filteredBills.length > 0 ? (
              filteredBills.map((bill) => (
                <button
                  key={bill.id}
                  className={`w-full rounded-[22px] border px-4 py-4 text-left transition ${
                    selectedBillId === bill.id
                      ? "border-slate-950 bg-slate-950 text-white shadow-[0_18px_35px_rgba(15,23,42,0.15)]"
                      : "border-slate-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/50"
                  }`}
                  onClick={() => {
                    setSelectedBillId(bill.id);
                    setFeedback(null);
                    setRefundQuantities({});
                    setRefundReason("");
                    setPayoutMethod(bill.paymentMethod);
                  }}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{bill.number}</p>
                      <p className={`mt-1 text-sm ${selectedBillId === bill.id ? "text-white/72" : "text-slate-600"}`}>
                        {bill.customerName || t("billing.walkInCustomer")}
                      </p>
                    </div>
                    <Badge className={selectedBillId === bill.id ? "bg-white text-slate-950" : ""} variant="warning">
                      {formatCurrency(bill.total, currency, locale)}
                    </Badge>
                  </div>
                  <div className={`mt-3 flex flex-wrap items-center gap-2 text-xs ${selectedBillId === bill.id ? "text-white/68" : "text-slate-500"}`}>
                    <span>{formatDateTime(bill.createdAt, locale)}</span>
                    <span>{t(billStatusLabelKeys[bill.status])}</span>
                  </div>
                </button>
              ))
            ) : (
              <div className="rounded-[22px] border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center text-sm leading-6 text-slate-600">
                {t("refund.noBillsFound")}
              </div>
            )}
          </div>
        </Card>

        {selectedBill ? (
          <div className="space-y-6">
            <Card className="p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-olive">{t("refund.title")}</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">{selectedBill.number}</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {selectedBill.customerName || t("billing.walkInCustomer")} · {formatBusinessDate(selectedBill.businessDate ?? selectedBill.createdAt.slice(0, 10), locale)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="neutral">{t(paymentMethodLabelKeys[selectedBill.paymentMethod])}</Badge>
                  <Badge variant={selectedBill.status === "refunded" ? "warning" : "success"}>
                    {t(billStatusLabelKeys[selectedBill.status])}
                  </Badge>
                  <Button asChild variant="secondary">
                    <Link href={`/bills/${selectedBill.id}`}>
                      <span className="inline-flex items-center gap-2">
                        {t("bills.viewReceipt")}
                        <ArrowRight className="h-4 w-4" />
                      </span>
                    </Link>
                  </Button>
                </div>
              </div>
            </Card>

            <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
              <Card className="p-6">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={refundState.isFullyRefunded ? "danger" : refundHistory.length > 0 ? "warning" : "success"}>
                    {refundState.isFullyRefunded
                      ? t("refund.fullRefunded")
                      : refundHistory.length > 0
                        ? t("refund.partialRefunded")
                        : t("refund.ready")}
                  </Badge>
                  <Badge variant="neutral">{t("refund.countLabel", { count: refundHistory.length })}</Badge>
                </div>

                <div className="mt-5 space-y-3">
                  {refundableItems.map((entry) => (
                    <div key={entry.item.id} className="rounded-3xl border border-line bg-white p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-ink">{entry.item.productName[locale] || entry.item.productName.en}</p>
                          <p className="mt-1 text-sm text-slate-600">
                            {t("refund.quantitySummary", {
                              total: entry.item.quantity,
                              refunded: entry.refundedQuantity,
                              remaining: entry.remainingQuantity
                            })}
                          </p>
                        </div>
                        <div className="w-full max-w-[120px]">
                          <label className="mb-2 block text-sm font-medium text-ink">{t("refund.quantityLabel")}</label>
                          <Input
                            inputMode="numeric"
                            value={refundQuantities[entry.item.id] ?? ""}
                            onChange={(event) => handleRefundQuantityChange(entry.item.id, entry.remainingQuantity, event.target.value)}
                            disabled={entry.remainingQuantity === 0 || refundState.isFullyRefunded || isRefunding || !canCreateRefund}
                            placeholder="0"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-olive">{t("refund.summaryTitle")}</p>
                <div className="mt-4 space-y-3 rounded-3xl bg-shell p-4 text-sm text-slate-600">
                  <div className="flex items-center justify-between">
                    <span>{t("refund.totalRefunded")}</span>
                    <span className="font-medium text-ink">{formatCurrency(-refundState.totalRefundAmount, currency, locale)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>{t("refund.totalProfitAdjustment")}</span>
                    <span className="font-medium text-ink">{formatCurrency(-refundState.totalProfitAdjustment, currency, locale)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>{t("refund.estimatedAmount")}</span>
                    <span className="font-medium text-ink">{formatCurrency(-estimatedRefundAmount, currency, locale)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>{t("refund.estimatedProfitAdjustment")}</span>
                    <span className="font-medium text-ink">{formatCurrency(-estimatedProfitAdjustment, currency, locale)}</span>
                  </div>
                </div>

                <div className="mt-5 rounded-3xl border border-dashed border-line bg-shell/70 p-5 text-sm leading-6 text-slate-600">
                  {t("refund.policyNote")}
                </div>

                <div className="mt-5">
                  <label className="mb-2 block text-sm font-medium text-ink">{t("refund.payoutMethod")}</label>
                  <Select value={payoutMethod} onChange={(event) => setPayoutMethod(event.target.value as PaymentMethod)}>
                    <option value="cash">{t("common.cash")}</option>
                    <option value="card">{t("common.card")}</option>
                    <option value="account">{t("refund.accountAdjustment")}</option>
                  </Select>
                  <p className="mt-2 text-xs leading-5 text-slate-500">{t("refund.payoutMethodHint")}</p>
                </div>

                <div className="mt-5">
                  <label className="mb-2 block text-sm font-medium text-ink">{t("refund.reasonLabel")}</label>
                  <Textarea
                    value={refundReason}
                    onChange={(event) => {
                      setRefundReason(event.target.value);
                      setFeedback(null);
                    }}
                  />
                </div>

                {feedback ? (
                  <p className={`mt-4 text-sm font-medium ${feedback.tone === "success" ? "text-emerald-700" : "text-red-700"}`}>
                    {feedback.message}
                  </p>
                ) : null}

                <Button
                  className="mt-5"
                  disabled={!canCreateRefund || refundState.isFullyRefunded || isRefunding || refundableItems.every((entry) => entry.remainingQuantity === 0)}
                  onClick={handleCreateRefund}
                >
                  {isRefunding ? t("refund.saving") : t("refund.createAction")}
                </Button>

                {!canCreateRefund ? (
                  <div className="mt-4 rounded-3xl border border-dashed border-line bg-shell/70 p-5 text-sm leading-6 text-slate-600">
                    {t("refund.adminOnly")}
                  </div>
                ) : null}
              </Card>
            </div>

            <Card className="p-6">
              <h3 className="font-display text-xl font-semibold text-ink">{t("refund.historyTitle")}</h3>
              <div className="mt-4 space-y-3">
                {refundHistory.length > 0 ? (
                  refundHistory.map(({ refund, items: refundItems }) => (
                    <div key={refund.id} className="rounded-3xl border border-line bg-white p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-ink">{formatDateTime(refund.returnDate, locale)}</p>
                          <p className="mt-1 text-sm text-slate-600">
                            {t("refund.originalSaleDate")}: {formatBusinessDate(refund.originalSaleDate, locale)}
                          </p>
                        </div>
                        <Badge variant="warning">{t(paymentMethodLabelKeys[refund.paymentMethod])}</Badge>
                      </div>

                      <div className="mt-4 space-y-2 text-sm text-slate-600">
                        <div className="flex items-center justify-between">
                          <span>{t("common.reason")}</span>
                          <span className="text-right font-medium text-ink">{refund.reason}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>{t("refund.totalRefunded")}</span>
                          <span className="font-medium text-ink">{formatCurrency(refund.amount, currency, locale)}</span>
                        </div>
                      </div>

                      {refundItems.length > 0 ? (
                        <div className="mt-4 rounded-3xl bg-shell p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{t("refund.itemsTitle")}</p>
                          <div className="mt-3 space-y-2 text-sm text-slate-600">
                            {refundItems.map((refundItem) => (
                              <div key={refundItem.id} className="flex items-center justify-between gap-3">
                                <span>{refundItem.productName[locale] || refundItem.productName.en}</span>
                                <span className="font-medium text-ink">
                                  {t("refund.itemQuantityAmount", {
                                    quantity: refundItem.quantity,
                                    amount: formatCurrency(-(refundItem.unitPrice * refundItem.quantity), currency, locale)
                                  })}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <div className="rounded-3xl border border-dashed border-line bg-shell/70 p-5 text-sm leading-6 text-slate-600">
                    {t("refund.noHistory")}
                  </div>
                )}
              </div>
            </Card>
          </div>
        ) : (
          <Card className="p-6">
            <ReceiptText className="h-6 w-6 text-slate-400" />
            <p className="mt-4 text-sm leading-6 text-slate-600">{t("refund.selectBillPrompt")}</p>
          </Card>
        )}
      </div>
      )}
    </div>
  );
}
