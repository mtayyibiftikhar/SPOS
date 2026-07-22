import { RotateCcw, ShieldCheck } from "lucide-react";
import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { PublicReceiptActions } from "@/components/billing/public-receipt-actions";
import { buildQrCodeImageUrl } from "@/lib/qr-code";
import { getReceiptItemNameLines } from "@/lib/receipt-language";
import { buildPublicReceiptUrl, normalizePublicReceiptToken } from "@/lib/public-receipts";
import { calculateBillRefundState } from "@/lib/refunds";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import type { Bill, BillItem, DemoAppState, Refund, RefundItem, Shop, ShopSettingsBundle, User } from "@/types/pos";

export const dynamic = "force-dynamic";

type PublicReceiptPageProps = {
  params: Promise<{
    token: string;
  }>;
};

type SnapshotRow = {
  shop_id: string;
  state: Partial<DemoAppState> | null;
  updated_at: string | null;
};

type DigitalReceipt = {
  bill: Bill;
  cashier: User | null;
  items: BillItem[];
  refunds: Refund[];
  refundItems: RefundItem[];
  settings: ShopSettingsBundle | null;
  shop: Shop | null;
  updatedAt: string | null;
  vatNumber: string | null;
};

async function loadDigitalReceipt(token: string): Promise<DigitalReceipt | null> {
  const supabase = createSupabaseAdminClient();
  const containsPayload = {
    bills: [
      {
        publicToken: token
      }
    ]
  };
  const { data, error } = await supabase
    .from("shop_cloud_snapshots")
    .select("shop_id, state, updated_at")
    .contains("state", containsPayload)
    .limit(1);

  if (error) {
    throw error;
  }

  let rows = (data ?? []) as SnapshotRow[];

  if (rows.length === 0) {
    const fallback = await supabase
      .from("shop_cloud_snapshots")
      .select("shop_id, state, updated_at")
      .limit(500);

    if (fallback.error) {
      throw fallback.error;
    }

    rows = ((fallback.data ?? []) as SnapshotRow[]).filter((row) =>
      row.state?.bills?.some((bill) => bill.publicToken === token)
    );
  }

  const row = rows[0];

  if (!row?.state) {
    return null;
  }

  const bill = row.state.bills?.find((entry) => entry.publicToken === token);

  if (!bill) {
    return null;
  }

  const settings = row.state.settingsByShop?.[bill.shopId] ?? null;
  const refunds = row.state.refunds?.filter((refund) => refund.originalBillId === bill.id) ?? [];
  const refundIds = new Set(refunds.map((refund) => refund.id));
  const { data: liveSettings } = await supabase
    .from("pos_settings")
    .select("vat_number")
    .eq("shop_id", bill.shopId)
    .maybeSingle();

  return {
    bill,
    cashier: row.state.users?.find((user) => user.id === bill.cashierId) ?? null,
    items: row.state.billItems?.filter((item) => item.billId === bill.id) ?? [],
    refunds,
    refundItems: row.state.refundItems?.filter((item) => refundIds.has(item.refundId)) ?? [],
    settings,
    shop: row.state.shops?.find((entry) => entry.id === bill.shopId) ?? null,
    updatedAt: row.updated_at,
    vatNumber: settings?.pos.vatNumber?.trim() || liveSettings?.vat_number?.trim() || null
  };
}

function totalQuantity(items: BillItem[]) {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

export default async function PublicReceiptPage({ params }: PublicReceiptPageProps) {
  const { token: rawToken } = await params;
  const token = normalizePublicReceiptToken(rawToken);

  if (!token) {
    notFound();
  }

  const receipt = await loadDigitalReceipt(token).catch(() => null);

  if (!receipt) {
    notFound();
  }

  const { bill, cashier, items, refunds, refundItems, settings, shop, updatedAt, vatNumber } = receipt;
  const currency = shop?.currency ?? settings?.pos.currency ?? "SAR";
  const shopName = settings?.pos.shopName ?? shop?.name ?? "Simple POS";
  const logoUrl = settings?.pos.logoUrl;
  const receiptSettings = settings?.receipt;
  const taxLabel = bill.taxName ?? settings?.tax.name ?? "Tax";
  const refundState = calculateBillRefundState({
    billId: bill.id,
    billItems: items,
    refunds,
    refundItems
  });
  const publicReceiptUrl = buildPublicReceiptUrl(token);
  const qrImageUrl = buildQrCodeImageUrl(publicReceiptUrl, 200);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.12),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(245,158,11,0.12),_transparent_34%),linear-gradient(180deg,#f8fbf9_0%,#eef5f1_100%)] px-4 py-8 text-slate-950">
      <section className="mx-auto max-w-3xl">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex items-center justify-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 shadow-sm">
            <ShieldCheck className="h-4 w-4" />
            Verified digital receipt
          </div>
          <PublicReceiptActions />
        </div>

        <article className="overflow-hidden rounded-[36px] border border-slate-200 bg-white shadow-[0_28px_90px_rgba(15,23,42,0.10)]">
          <header className="border-b border-slate-200 px-5 py-7 text-center sm:px-8">
            {logoUrl ? (
              <img
                alt={shopName}
                className="mx-auto mb-4 max-h-20 max-w-[12rem] object-contain"
                src={logoUrl}
              />
            ) : null}
            <h1 className="mx-auto max-w-lg text-balance font-display text-3xl font-semibold leading-tight">
              {shopName}
            </h1>
            {settings?.pos.address ? <p className="mt-3 text-sm text-slate-600">{settings.pos.address}</p> : null}
            {settings?.pos.phone ? <p className="mt-1 text-sm text-slate-600">{settings.pos.phone}</p> : null}
            {vatNumber ? (
              <p className="mt-1 text-sm font-medium text-slate-700">VAT No. {vatNumber}</p>
            ) : null}
          </header>

          {refundState.totalRefundAmount > 0 ? (
            <section
              className={
                refundState.isFullyRefunded
                  ? "border-b border-red-200 bg-red-50 px-5 py-5 text-red-900 sm:px-8"
                  : "border-b border-amber-200 bg-amber-50 px-5 py-5 text-amber-950 sm:px-8"
              }
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/80 shadow-sm">
                    <RotateCcw className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em]">Current receipt status</p>
                    <p className="mt-1 text-xl font-semibold">
                      {refundState.isFullyRefunded ? "Fully refunded" : "Partially refunded"}
                    </p>
                  </div>
                </div>
                <div className="rounded-2xl bg-white/80 px-4 py-3 text-left sm:text-right">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em]">Refunded amount</p>
                  <p className="mt-1 text-lg font-semibold">
                    {formatCurrency(refundState.totalRefundAmount, currency, "en")}
                  </p>
                </div>
              </div>
              {refundState.billRefunds.length > 0 ? (
                <p className="mt-3 text-sm">
                  Latest refund: {formatDateTime(refundState.billRefunds.at(-1)?.returnDate, "en")}
                  {refundState.billRefunds.at(-1)?.reason ? ` · ${refundState.billRefunds.at(-1)?.reason}` : ""}
                </p>
              ) : null}
            </section>
          ) : null}

          <section className="grid gap-3 border-b border-slate-200 bg-slate-50/70 p-5 sm:grid-cols-2 sm:p-8">
            <div className="rounded-3xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Receipt</p>
              <p className="mt-2 text-xl font-semibold">{bill.number}</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Date</p>
              <p className="mt-2 text-base font-semibold">{formatDateTime(bill.createdAt, "en")}</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Customer</p>
              <p className="mt-2 text-base font-semibold">{bill.customerName?.trim() || "Walk-in Customer"}</p>
              {bill.customerPhone ? <p className="mt-1 text-sm text-slate-600">{bill.customerPhone}</p> : null}
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Payment</p>
              <p className="mt-2 text-base font-semibold capitalize">{bill.paymentMethod === "account" ? "Pay later" : bill.paymentMethod}</p>
              <p className="mt-1 text-sm text-slate-600">Cashier: {cashier?.name ?? "Not available"}</p>
              <p className="mt-1 text-sm font-medium text-slate-700">
                Status: {refundState.isFullyRefunded ? "Refunded" : refundState.totalRefundAmount > 0 ? "Partially refunded" : bill.status}
              </p>
            </div>
          </section>

          <section className="p-5 sm:p-8">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">Items</p>
                <h2 className="mt-1 text-2xl font-semibold">Purchase details</h2>
              </div>
              <span className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white">
                {totalQuantity(items)} items
              </span>
            </div>

            <div className="overflow-hidden rounded-[28px] border border-slate-200">
              {items.map((item) => (
                <div className="grid gap-3 border-b border-slate-200 p-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_120px]" key={item.id}>
                  <div>
                    {getReceiptItemNameLines(item.productName, receiptSettings).map((line) => (
                      <p
                        className={line.isSecondary ? "mt-1 text-sm font-medium text-slate-600" : "text-base font-semibold"}
                        dir={line.direction}
                        key={`${item.id}-${line.text}`}
                      >
                        {line.text}
                      </p>
                    ))}
                    <p className="mt-1 text-sm text-slate-600">
                      Qty {item.quantity} x {formatCurrency(item.unitPrice, currency, "en")}
                    </p>
                    {item.discountAmount > 0 ? (
                      <p className="mt-1 text-sm font-medium text-emerald-700">
                        Item discount -{formatCurrency(item.discountAmount, currency, "en")}
                      </p>
                    ) : null}
                  </div>
                  <p className="text-right text-lg font-semibold">
                    {formatCurrency(item.lineTotal, currency, "en")}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="border-t border-slate-200 bg-slate-50/70 p-5 sm:p-8">
            <div className="ml-auto max-w-sm space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Subtotal</span>
                <span className="font-semibold">{formatCurrency(bill.subtotal, currency, "en")}</span>
              </div>
              {(bill.itemDiscountAmount ?? 0) > 0 ? (
                <div className="flex items-center justify-between text-emerald-700">
                  <span>Item discounts</span>
                  <span className="font-semibold">-{formatCurrency(bill.itemDiscountAmount ?? 0, currency, "en")}</span>
                </div>
              ) : null}
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Bill discount</span>
                <span className="font-semibold">{formatCurrency(bill.discountAmount, currency, "en")}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">{taxLabel}</span>
                <span className="font-semibold">{formatCurrency(bill.taxAmount, currency, "en")}</span>
              </div>
              <div className="flex items-center justify-between border-t border-slate-200 pt-4 text-xl">
                <span className="font-semibold">Total</span>
                <span className="font-semibold">{formatCurrency(bill.total, currency, "en")}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Paid</span>
                <span className="font-semibold">{formatCurrency(bill.paidAmount, currency, "en")}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Due</span>
                <span className="font-semibold">{formatCurrency(bill.dueAmount, currency, "en")}</span>
              </div>
              {refundState.totalRefundAmount > 0 ? (
                <div className="flex items-center justify-between border-t border-slate-200 pt-3 text-red-700">
                  <span>Refunded</span>
                  <span className="font-semibold">-{formatCurrency(refundState.totalRefundAmount, currency, "en")}</span>
                </div>
              ) : null}
            </div>
          </section>

          {qrImageUrl && publicReceiptUrl ? (
            <section className="border-t border-slate-200 px-5 py-6 sm:px-8">
              <div className="mx-auto flex max-w-lg flex-col items-center gap-4 rounded-[28px] border border-emerald-200 bg-emerald-50/70 p-5 text-center sm:flex-row sm:text-left">
                <img
                  alt={`QR code for receipt ${bill.number}`}
                  className="h-28 w-28 rounded-2xl border border-emerald-200 bg-white p-2"
                  src={qrImageUrl}
                />
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Verified digital receipt</p>
                  <p className="mt-2 font-semibold text-slate-950">Scan to reopen this exact receipt</p>
                  <a
                    className="mt-2 block break-all text-sm font-medium text-emerald-800 underline decoration-emerald-300 underline-offset-4"
                    href={publicReceiptUrl}
                  >
                    {publicReceiptUrl}
                  </a>
                </div>
              </div>
            </section>
          ) : null}

          <footer className="border-t border-slate-200 px-5 py-5 text-center text-xs leading-6 text-slate-500 sm:px-8">
            <p>This verified receipt reflects the latest sale and refund records saved by the shop.</p>
            {updatedAt ? <p>Last synced {formatDateTime(updatedAt, "en")}</p> : null}
          </footer>
        </article>
      </section>
    </main>
  );
}
