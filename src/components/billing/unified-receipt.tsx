import type { ReactNode } from "react";
import { ReceiptBrandHeader } from "@/components/billing/receipt-brand-header";
import { ResilientImage } from "@/components/ui/resilient-image";

export type UnifiedReceiptMeta = {
  label: string;
  value: ReactNode;
};

export type UnifiedReceiptCustomer = {
  name: string;
  phone?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  vatNumber?: string | null;
  address?: string | null;
};

export type UnifiedReceiptItem = {
  id: string;
  name: ReactNode;
  quantity: ReactNode;
  unitPrice: ReactNode;
  total: ReactNode;
  detail?: ReactNode;
};

export type UnifiedReceiptTotal = {
  label: string;
  value: ReactNode;
  emphasis?: "normal" | "strong" | "positive" | "negative";
};

type UnifiedReceiptProps = {
  shop: {
    name: string;
    logoUrl?: string | null;
    address?: string | null;
    phone?: string | null;
    vatNumber?: string | null;
  };
  receiptType?: {
    label: string;
    description?: string;
    tone?: "neutral" | "positive" | "negative" | "warning";
    icon?: ReactNode;
  };
  metadata: UnifiedReceiptMeta[];
  customer?: UnifiedReceiptCustomer | null;
  customerLabel?: string;
  items: UnifiedReceiptItem[];
  itemLabels?: {
    items?: string;
    quantity?: string;
    unitPrice?: string;
    total?: string;
  };
  totals: UnifiedReceiptTotal[];
  note?: {
    label: string;
    value: ReactNode;
  };
  footerText?: string | null;
  qr?: {
    imageUrl: string;
    title?: string;
    description?: string;
    href?: string;
    code?: string;
  };
  ownerBrand?: {
    enabled: boolean;
    companyName: string;
    logoUrl?: string | null;
    imprintText?: string | null;
    website?: string | null;
    address?: string | null;
    supportPhone?: string | null;
    supportEmail?: string | null;
  };
  statusBanner?: ReactNode;
  className?: string;
  id?: string;
};

const toneClasses = {
  neutral: "bg-slate-100 text-slate-700",
  positive: "bg-emerald-50 text-emerald-700",
  negative: "bg-red-50 text-red-700",
  warning: "bg-amber-50 text-amber-800"
} as const;

const totalClasses = {
  normal: "text-slate-600",
  strong: "border-t border-line pt-3 text-lg font-semibold text-ink",
  positive: "border-t border-line pt-3 text-lg font-semibold text-emerald-700",
  negative: "border-t border-line pt-3 text-lg font-semibold text-red-700"
} as const;

export function UnifiedReceipt({
  shop,
  receiptType,
  metadata,
  customer,
  customerLabel = "Customer",
  items,
  itemLabels,
  totals,
  note,
  footerText,
  qr,
  ownerBrand,
  statusBanner,
  className,
  id
}: UnifiedReceiptProps) {
  const labels = {
    items: itemLabels?.items ?? "Items",
    quantity: itemLabels?.quantity ?? "Quantity",
    unitPrice: itemLabels?.unitPrice ?? "Sale price",
    total: itemLabels?.total ?? "Total"
  };
  const metaColumns = [metadata.filter((_, index) => index % 2 === 0), metadata.filter((_, index) => index % 2 === 1)];

  return (
    <div
      className={`receipt-paper mx-auto w-full max-w-3xl p-6 sm:p-8 print:mx-0 print:max-w-none print:rounded-none print:border-0 print:bg-white print:p-0 print:shadow-none ${className ?? ""}`}
      id={id}
    >
      <ReceiptBrandHeader
        address={shop.address}
        logoUrl={shop.logoUrl}
        phone={shop.phone}
        shopName={shop.name}
        vatNumber={shop.vatNumber}
      />

      {receiptType ? (
        <div className="mt-5 text-center">
          <div className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold uppercase tracking-[0.16em] ${toneClasses[receiptType.tone ?? "neutral"]}`}>
            {receiptType.icon}
            {receiptType.label}
          </div>
          {receiptType.description ? <p className="mt-3 text-sm font-medium text-slate-500">{receiptType.description}</p> : null}
        </div>
      ) : null}

      {statusBanner}

      <div className="grid gap-4 border-b border-dashed border-line py-5 sm:grid-cols-2">
        {metaColumns.map((column, columnIndex) => (
          <div className="space-y-2 text-sm text-slate-600" key={columnIndex}>
            {column.map((entry, index) => (
              <p key={`${entry.label}-${index}`}>
                <span className="font-medium text-ink">{entry.label}:</span> {entry.value}
              </p>
            ))}
          </div>
        ))}
      </div>

      {customer ? (
        <div className="border-b border-dashed border-line py-5 text-sm text-slate-600">
          <p className="font-medium text-ink">{customerLabel}</p>
          <p className="mt-2">{customer.name}</p>
          {customer.phone ? <p>{customer.phone}</p> : null}
          {customer.email ? <p>{customer.email}</p> : null}
          {customer.whatsapp ? <p>WhatsApp: {customer.whatsapp}</p> : null}
          {customer.vatNumber ? <p>VAT number: {customer.vatNumber}</p> : null}
          {customer.address ? <p>Address: {customer.address}</p> : null}
        </div>
      ) : null}

      <div className="py-5">
        <div className="hidden grid-cols-[minmax(0,1fr)_72px_110px_120px] gap-3 border-b border-line pb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 sm:grid">
          <span>{labels.items}</span>
          <span className="text-center">{labels.quantity}</span>
          <span className="text-right">{labels.unitPrice}</span>
          <span className="text-right">{labels.total}</span>
        </div>

        <div className="space-y-3 pt-4">
          {items.map((item) => (
            <div className="rounded-2xl border border-line/80 bg-shell/55 px-4 py-3" key={item.id}>
              <div className="sm:hidden">
                <div className="flex items-start justify-between gap-3">
                  <span className="block min-w-0 font-medium text-ink">{item.name}</span>
                  <span className="font-semibold text-ink">{item.total}</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3 text-sm text-slate-600">
                  <span>{labels.quantity}: {item.quantity}</span>
                  <span>{labels.unitPrice}: {item.unitPrice}</span>
                </div>
                {item.detail ? <div className="mt-1 text-sm font-medium text-emerald-700">{item.detail}</div> : null}
              </div>

              <div className="hidden grid-cols-[minmax(0,1fr)_72px_110px_120px] items-center gap-3 text-sm text-slate-600 sm:grid">
                <span className="min-w-0">
                  <span className="block font-medium text-ink">{item.name}</span>
                  {item.detail ? <span className="mt-1 block text-xs font-medium text-emerald-700">{item.detail}</span> : null}
                </span>
                <span className="text-center">{item.quantity}</span>
                <span className="text-right">{item.unitPrice}</span>
                <span className="text-right font-semibold text-ink">{item.total}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-dashed border-line pt-5">
        <div className="space-y-3 text-sm">
          {totals.map((entry, index) => (
            <div className={`flex items-center justify-between ${totalClasses[entry.emphasis ?? "normal"]}`} key={`${entry.label}-${index}`}>
              <span>{entry.label}</span>
              <span>{entry.value}</span>
            </div>
          ))}
        </div>
      </div>

      {note ? (
        <div className="mt-5 rounded-2xl border border-line bg-shell/70 p-4 text-sm text-slate-600">
          <span className="font-medium text-ink">{note.label}:</span> {note.value}
        </div>
      ) : null}

      {footerText || qr ? (
        <div className="mt-5 border-t border-dashed border-line pt-5">
          <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_160px] sm:items-center">
            <div className="text-center text-sm text-slate-600 sm:text-left">
              {footerText ? <p>{footerText}</p> : null}
              {qr?.code ? (
                <p className="mt-3 break-all font-mono text-xs font-semibold tracking-[0.12em] text-slate-700">
                  {qr.code}
                </p>
              ) : null}
            </div>
            {qr ? (
              <div className="rounded-3xl border border-line bg-shell/70 p-3 text-center">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{qr.title ?? "Receipt QR"}</p>
                <img alt={`${qr.code ?? "Receipt"} QR code`} className="mx-auto mt-3 h-28 w-28 rounded-2xl border border-line bg-white p-1.5" src={qr.imageUrl} />
                {qr.description ? <p className="mt-3 text-xs leading-5 text-slate-500">{qr.description}</p> : null}
                {qr.href ? (
                  <a className="mt-2 block truncate text-xs font-semibold text-emerald-700" href={qr.href} rel="noreferrer" target="_blank">
                    Open digital receipt
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {ownerBrand?.enabled ? (
        <div className="mt-5 border-t border-dashed border-line pt-5 text-center text-xs leading-5 text-slate-500">
          <ResilientImage
            src={ownerBrand.logoUrl}
            alt={ownerBrand.companyName}
            cacheKey={`receipt-owner-logo:${ownerBrand.companyName}`}
            className="mx-auto mb-2 max-h-8 w-auto object-contain"
          />
          <p className="font-semibold text-slate-700">{ownerBrand.imprintText || `Powered by ${ownerBrand.companyName}`}</p>
          <p>{ownerBrand.companyName}</p>
          {ownerBrand.website ? <p>{ownerBrand.website}</p> : null}
          {ownerBrand.address ? <p>{ownerBrand.address}</p> : null}
          {ownerBrand.supportPhone || ownerBrand.supportEmail ? (
            <p>{[ownerBrand.supportPhone, ownerBrand.supportEmail].filter(Boolean).join(" | ")}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
