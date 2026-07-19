"use client";

import Link from "next/link";
import { ArrowLeft, Download, Printer, ReceiptText } from "lucide-react";
import { usePosApp } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createStructuredReportPdfBlob, downloadBlob } from "@/lib/report-export";
import { printElementWithNative } from "@/lib/native-bridge";
import { formatBusinessDate, formatCurrency, formatDateTime } from "@/lib/utils";

export function AccountPaymentReceiptView({ paymentId }: { paymentId: string }) {
  const { currentShop, currentShopId, locale, state } = usePosApp();
  const payment = state.customerAccountPayments.find(
    (entry) => entry.id === paymentId && entry.shopId === currentShopId
  );
  const customer = payment ? state.customers.find((entry) => entry.id === payment.customerId) : null;
  const operator = payment ? state.users.find((entry) => entry.id === payment.createdBy) : null;
  const settings = currentShopId ? state.settingsByShop[currentShopId]?.pos : undefined;
  const currency = currentShop?.currency ?? "SAR";
  const shopName = settings?.shopName ?? currentShop?.name ?? "Simple POS";
  const allocations = payment?.allocations ?? [];

  if (!payment) {
    return (
      <Card className="mx-auto max-w-2xl p-8 text-center">
        <ReceiptText className="mx-auto h-8 w-8 text-slate-400" />
        <h1 className="mt-4 text-2xl font-semibold text-slate-950">Account payment receipt not found</h1>
        <Button asChild className="mt-6" variant="secondary"><Link href="/customers?view=account">Back to accounts</Link></Button>
      </Card>
    );
  }

  const handlePrint = async () => {
    const printed = await printElementWithNative("#account-payment-receipt", payment.number);
    if (!printed) window.print();
  };

  const handleDownload = async () => {
    const blob = await createStructuredReportPdfBlob({
      generatedAt: formatDateTime(new Date().toISOString(), locale),
      logoUrl: settings?.logoUrl,
      period: payment.businessDate ? formatBusinessDate(payment.businessDate, locale) : formatDateTime(payment.createdAt, locale),
      shopName,
      subtitle: `Payment received from ${customer?.name ?? "Customer"}`,
      title: `Account payment receipt ${payment.number}`,
      sections: [
        {
          title: "Payment details",
          rows: [
            { label: "Customer", value: customer?.name ?? "Customer" },
            { label: "Phone", value: customer?.phone ?? "Not available" },
            { label: "Received", value: formatDateTime(payment.createdAt, locale) },
            { label: "Method", value: payment.method === "cash" ? "Cash" : "Card" },
            { label: "Received by", value: operator?.name ?? "POS user" },
            { label: "Amount", value: formatCurrency(payment.amount, currency, locale) }
          ]
        },
        {
          title: "Applied receipts",
          rows: allocations.map((allocation) => ({
            label: allocation.billNumber,
            value: formatCurrency(allocation.amount, currency, locale)
          }))
        }
      ]
    });
    downloadBlob(blob, `${payment.number.toLowerCase()}-account-payment.pdf`);
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Button asChild variant="secondary"><Link href="/customers?view=account"><ArrowLeft className="mr-2 h-4 w-4" />Back to accounts</Link></Button>
        <Button asChild variant="secondary"><Link href="/bills">View all bills and payments</Link></Button>
      </div>

      <Card className="overflow-hidden rounded-[32px]" id="account-payment-receipt">
        <div className="border-b border-emerald-100 bg-[linear-gradient(120deg,#ecfdf5_0%,#ffffff_48%,#fff7ed_100%)] px-7 py-7 text-center">
          {settings?.logoUrl ? <img alt={shopName} className="mx-auto mb-4 max-h-16 max-w-44 object-contain" src={settings.logoUrl} /> : null}
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-700">Account payment receipt</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">{shopName}</h1>
          <p className="mt-2 text-sm text-slate-600">{settings?.address ?? currentShop?.address}</p>
        </div>

        <div className="grid gap-6 p-7 md:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Receipt</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{payment.number}</p>
            <div className="mt-5 space-y-3 text-sm">
              <p className="flex justify-between gap-4"><span className="text-slate-500">Customer</span><strong>{customer?.name ?? "Customer"}</strong></p>
              <p className="flex justify-between gap-4"><span className="text-slate-500">Phone</span><strong>{customer?.phone ?? "Not available"}</strong></p>
              <p className="flex justify-between gap-4"><span className="text-slate-500">Date / time</span><strong>{formatDateTime(payment.createdAt, locale)}</strong></p>
              <p className="flex justify-between gap-4"><span className="text-slate-500">Payment method</span><strong>{payment.method === "cash" ? "Cash" : "Card"}</strong></p>
              <p className="flex justify-between gap-4"><span className="text-slate-500">Received by</span><strong>{operator?.name ?? "POS user"}</strong></p>
            </div>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Applied to receipts</p>
            <div className="mt-4 space-y-3">
              {allocations.map((allocation) => (
                <Link className="flex items-center justify-between gap-4 rounded-2xl bg-white px-4 py-3 font-medium text-slate-800 transition hover:bg-emerald-50" href={`/bills/${allocation.billId}?from=accounts`} key={`${payment.id}-${allocation.billId}`}>
                  <span>{allocation.billNumber}</span><strong>{formatCurrency(allocation.amount, currency, locale)}</strong>
                </Link>
              ))}
            </div>
            <div className="mt-5 flex items-end justify-between border-t border-slate-200 pt-5">
              <span className="font-semibold text-slate-600">Amount received</span>
              <strong className="text-3xl text-emerald-700">{formatCurrency(payment.amount, currency, locale)}</strong>
            </div>
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap justify-end gap-3 print:hidden">
        <Button onClick={handlePrint} variant="secondary"><Printer className="mr-2 h-4 w-4" />Print</Button>
        <Button onClick={handleDownload}><Download className="mr-2 h-4 w-4" />Download PDF</Button>
      </div>
    </div>
  );
}
