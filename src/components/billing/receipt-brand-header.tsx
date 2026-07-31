import { ResilientImage } from "@/components/ui/resilient-image";
import { getPosAssetDeliveryUrl } from "@/lib/pos-asset-url";

type ReceiptBrandHeaderProps = {
  address?: string | null;
  logoUrl?: string | null;
  phone?: string | null;
  shopName: string;
  vatNumber?: string | null;
};

function getInitials(shopName: string) {
  return shopName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "SP";
}

export function ReceiptBrandHeader({
  address,
  logoUrl,
  phone,
  shopName,
  vatNumber
}: ReceiptBrandHeaderProps) {
  const resolvedLogoUrl = logoUrl ? getPosAssetDeliveryUrl(logoUrl) : undefined;

  return (
    <div className="border-b border-dashed border-line pb-5 text-center">
      <div className="mb-3 flex justify-center">
        <ResilientImage
          src={resolvedLogoUrl}
          alt={`${shopName} logo`}
          cacheKey={`receipt-shop-logo:${shopName}`}
          className="max-h-20 max-w-[12rem] object-contain"
          fallback={
            <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-[radial-gradient(circle_at_top_right,_rgba(16,185,129,0.18),_transparent_42%),linear-gradient(160deg,#0f172a_0%,#172036_100%)] font-display text-lg font-semibold tracking-[0.18em] text-white shadow-[0_16px_30px_rgba(15,23,42,0.16)]">
              {getInitials(shopName)}
            </div>
          }
        />
      </div>
      <p className="mx-auto max-w-[22rem] text-balance break-words font-display text-2xl font-semibold leading-tight text-ink">
        {shopName}
      </p>
      {address ? <p className="mt-1 text-sm text-slate-600">{address}</p> : null}
      {phone ? <p className="text-sm text-slate-600">{phone}</p> : null}
      {vatNumber ? <p className="mt-1 text-sm font-medium text-slate-700">VAT No. {vatNumber}</p> : null}
    </div>
  );
}
