import { ReceiptText, ShieldCheck } from "lucide-react";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { PublicReceiptActions } from "@/components/billing/public-receipt-actions";
import { getReceiptItemNameLines } from "@/lib/receipt-language";
import { normalizePublicReceiptToken } from "@/lib/public-receipts";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import type { Bill, BillItem, DemoAppState, Shop, ShopSettingsBundle, User } from "@/types/pos";

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
  settings: ShopSettingsBundle | null;
  shop: Shop | null;
  updatedAt: string | null;
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

  return {
    bill,
    cashier: row.state.users?.find((user) => user.id === bill.cashierId) ?? null,
    items: row.state.billItems?.filter((item) => item.billId === bill.id) ?? [],
    settings,
    shop: row.state.shops?.find((entry) => entry.id === bill.shopId) ?? null,
    updatedAt: row.updated_at
  };
}

function totalQuantity(items: BillItem[]) {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

function NotFoundReceipt() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.13),_transparent_30%),linear-gradient(180deg,#f8fbf9_0%,#edf4f1_100%)] px-4 py-10">
      <section className="mx-auto flex min-h-[72vh] max-w-xl items-center justify-center">
        <div className="w-full rounded-[34px] border border-slate-200 bg-white p-8 text-center shadow-[0_24px_80px_rgba(15,23,42,0.09)]">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-950 text-white">
            <ReceiptText className="h-7 w-7" />
          </div>
          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.26em] text-emerald-700">Digital receipt</p>
          <h1 className="mt-3 font-display text-3xl font-semibold text-slate-950">Receipt not found</h1>
          <p className="mt-4 text-sm leading-7 text-slate-600">
            This receipt link is not available yet. If the bill was created just now, wait a moment and scan again.
          </p>
        </div>
      </section>
    </main>
  );
}

export default async function PublicReceiptPage({ params }: PublicReceiptPageProps) {
  const { token: rawToken } = await params;
  const token = normalizePublicReceiptToken(rawToken);

  if (!token) {
    return <NotFoundReceipt />;
  }

  const receipt = await loadDigitalReceipt(token).catch(() => null);

  if (!receipt) {
    return <NotFoundReceipt />;
  }

  const { bill, cashier, items, settings, shop, updatedAt } = receipt;
  const currency = shop?.currency ?? settings?.pos.currency ?? "SAR";
  const shopName = settings?.pos.shopName ?? shop?.name ?? "Simple POS";
  const logoUrl = settings?.pos.logoUrl;
  const receiptSettings = settings?.receipt;
  const taxLabel = bill.taxName ?? settings?.tax.name ?? "Tax";

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
            {settings?.pos.vatNumber ? (
              <p className="mt-1 text-sm font-medium text-slate-700">VAT No. {settings.pos.vatNumber}</p>
            ) : null}
          </header>

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
            </div>
          </section>

          <footer className="border-t border-slate-200 px-5 py-5 text-center text-xs leading-6 text-slate-500 sm:px-8">
            <p>This is a read-only digital receipt generated from the shop POS record.</p>
            {updatedAt ? <p>Last synced {formatDateTime(updatedAt, "en")}</p> : null}
          </footer>
        </article>
      </section>
    </main>
  );
}
