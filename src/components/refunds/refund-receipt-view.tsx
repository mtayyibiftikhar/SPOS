"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Printer, ReceiptText } from "lucide-react";
import { usePosApp } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ReceiptBrandHeader } from "@/components/billing/receipt-brand-header";
import { paymentMethodLabelKeys } from "@/lib/i18n";
import { printElementWithNative } from "@/lib/native-bridge";
import { formatRefundReceiptNumber } from "@/lib/refunds";
import { formatBusinessDate, formatCurrency, formatDateTime } from "@/lib/utils";

export function RefundReceiptView({ refundId }: { refundId: string }) {
  const searchParams = useSearchParams();
  const { isHydrated, locale, state, t } = usePosApp();
  const hasAutoPrinted = useRef(false);
  const refund = state.refunds.find((entry) => entry.id === refundId);
  const bill = refund ? state.bills.find((entry) => entry.id === refund.originalBillId) : undefined;
  const items = refund ? state.refundItems.filter((entry) => entry.refundId === refund.id) : [];
  const shop = refund ? state.shops.find((entry) => entry.id === refund.shopId) : undefined;
  const cashier = refund ? state.users.find((entry) => entry.id === refund.createdBy) : undefined;
  const settings = refund ? state.settingsByShop[refund.shopId] : undefined;
  const currency = shop?.currency ?? "SAR";
  const receiptNumber = formatRefundReceiptNumber(refundId);
  const isFreshReceipt = searchParams.get("fresh") === "1";
  const receiptBrand = settings?.pos.shopName ?? shop?.name ?? t("brand.name");

  const printReceipt = async (silent = false) => {
    const printed = await printElementWithNative("#refund-receipt-print-area", `Refund ${receiptNumber}`, {
      deviceName: settings?.printer.printerDeviceName,
      receiptSize: settings?.printer.receiptSize,
      silent
    }).catch(() => false);

    if (!printed) {
      window.print();
    }
  };

  useEffect(() => {
    if (!refund || !isFreshReceipt || !settings?.printer.autoPrintAfterSale || hasAutoPrinted.current) {
      return;
    }

    hasAutoPrinted.current = true;
    const timer = window.setTimeout(() => void printReceipt(true), 320);
    return () => window.clearTimeout(timer);
  }, [isFreshReceipt, refund?.id, settings?.printer.autoPrintAfterSale, settings?.printer.printerDeviceName, settings?.printer.receiptSize]);

  if (!isHydrated) {
    return (
      <Card className="flex min-h-52 items-center justify-center p-8 text-center">
        <p className="text-sm font-medium text-slate-600">Loading refund receipt...</p>
      </Card>
    );
  }

  if (!refund || !bill) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow={t("nav.refunds")} title="Refund receipt unavailable" subtitle="This refund could not be found in the current shop." />
        <Button asChild variant="secondary"><Link href="/refunds?view=history">Back to refund history</Link></Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 print:space-y-0">
      <div className="print:hidden">
        <PageHeader eyebrow={t("nav.refunds")} title={`Refund receipt ${receiptNumber}`} subtitle="The refund is saved and ready to print for the customer." />
      </div>

      <div className="flex flex-wrap gap-3 print:hidden">
        <Button asChild variant="secondary">
          <Link href="/refunds?view=history"><ArrowLeft className="mr-2 h-4 w-4" />Back to refund history</Link>
        </Button>
        <Button asChild variant="secondary"><Link href={`/bills/${bill.id}`}>Open original receipt</Link></Button>
        <Button onClick={() => void printReceipt()}><Printer className="mr-2 h-4 w-4" />Print refund receipt</Button>
      </div>

      {isFreshReceipt ? (
        <div className="rounded-[22px] border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-medium text-emerald-800 print:hidden">
          Refund saved successfully. Review or print this receipt for the customer.
        </div>
      ) : null}

      <Card className="receipt-paper mx-auto w-full max-w-3xl p-6 sm:p-8 print:mx-0 print:max-w-none print:rounded-none print:border-0 print:bg-white print:p-0 print:shadow-none" id="refund-receipt-print-area">
        <div>
          <ReceiptBrandHeader
            address={settings?.pos.address ?? shop?.address}
            logoUrl={settings?.pos.logoUrl}
            phone={settings?.pos.phone ?? shop?.phone}
            shopName={receiptBrand}
            vatNumber={settings?.pos.vatNumber}
          />
          <div className="mx-auto mt-5 inline-flex items-center gap-2 rounded-full bg-red-50 px-4 py-2 text-sm font-semibold text-red-700">
            <ReceiptText className="h-4 w-4" />Refund receipt
          </div>
        </div>

        <div className="grid gap-4 border-b border-dashed border-line py-5 sm:grid-cols-2">
          <div className="space-y-2 text-sm text-slate-600">
            <p><span className="font-medium text-ink">Refund receipt:</span> {receiptNumber}</p>
            <p><span className="font-medium text-ink">Original receipt:</span> {bill.number}</p>
            <p><span className="font-medium text-ink">Refund date:</span> {formatDateTime(refund.returnDate, locale)}</p>
          </div>
          <div className="space-y-2 text-sm text-slate-600">
            <p><span className="font-medium text-ink">Original sale date:</span> {formatBusinessDate(refund.originalSaleDate, locale)}</p>
            <p><span className="font-medium text-ink">Payout method:</span> {t(paymentMethodLabelKeys[refund.paymentMethod])}</p>
            <p><span className="font-medium text-ink">Processed by:</span> {cashier?.name ?? t("common.notAvailable")}</p>
          </div>
        </div>

        <div className="border-b border-dashed border-line py-5 text-sm text-slate-600">
          <p className="font-medium text-ink">{t("common.customer")}</p>
          <p className="mt-2">{bill.customerName || t("billing.walkInCustomer")}</p>
          {bill.customerPhone ? <p>{bill.customerPhone}</p> : null}
        </div>

        <div className="py-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Refunded items</p>
          <div className="space-y-3">
            {items.map((item) => (
              <div className="grid grid-cols-[minmax(0,1fr)_54px_110px] items-center gap-3 rounded-2xl border border-line/80 bg-shell/55 px-4 py-3 text-sm" key={item.id}>
                <span className="font-medium text-ink">{item.productName[locale] || item.productName.en || item.productName.ar || item.productName.ur}</span>
                <span className="text-center text-slate-600">x {item.quantity}</span>
                <span className="text-right font-semibold text-ink">{formatCurrency(Math.abs(item.refundAmount), currency, locale)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-dashed border-line pt-5">
          <div className="flex items-center justify-between text-lg font-semibold text-red-700">
            <span>Total refunded</span>
            <span>{formatCurrency(Math.abs(refund.amount), currency, locale)}</span>
          </div>
          <div className="mt-5 rounded-2xl bg-shell/70 p-4 text-sm text-slate-600">
            <span className="font-medium text-ink">Reason:</span> {refund.reason}
          </div>
        </div>

        {state.brand.receiptImprintEnabled ? (
          <div className="mt-5 border-t border-dashed border-line pt-5 text-center text-xs leading-5 text-slate-500">
            <p className="font-semibold text-slate-700">{state.brand.receiptImprintText || `Powered by ${state.brand.companyName}`}</p>
            <p>{state.brand.companyName}</p>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
