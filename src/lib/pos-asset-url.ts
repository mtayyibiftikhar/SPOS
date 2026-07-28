export const POS_ASSET_ROUTE_PREFIX = "/api/pos-assets/";
export const POS_ASSETS_BUCKET = "pos-assets";

function decodeAssetPath(pathname: string, marker: string) {
  const markerIndex = pathname.indexOf(marker);

  if (markerIndex === -1) {
    return null;
  }

  try {
    return decodeURIComponent(pathname.slice(markerIndex + marker.length));
  } catch {
    return null;
  }
}

export function getPosAssetPath(urlOrPath: string) {
  const value = urlOrPath.trim();

  if (!value) {
    return null;
  }

  if (value.startsWith(POS_ASSET_ROUTE_PREFIX)) {
    return decodeAssetPath(value, POS_ASSET_ROUTE_PREFIX);
  }

  if (/^(?:owner|shops)\//.test(value)) {
    return value;
  }

  if (!/^https?:\/\//i.test(value)) {
    return null;
  }

  try {
    const url = new URL(value);
    const signedMarker = `/storage/v1/object/sign/${POS_ASSETS_BUCKET}/`;

    return decodeAssetPath(url.pathname, signedMarker) ?? decodeAssetPath(url.pathname, POS_ASSET_ROUTE_PREFIX);
  } catch {
    return null;
  }
}

export function getPosAssetDeliveryUrl(urlOrPath: string) {
  const path = getPosAssetPath(urlOrPath);

  if (!path) {
    return urlOrPath.trim();
  }

  return `${POS_ASSET_ROUTE_PREFIX}${path.split("/").map(encodeURIComponent).join("/")}`;
}

export function normalizeBrandAssetUrls<
  TBrand extends {
    logoUrl?: string;
    loginAdImageUrl?: string;
    loginHeroImages?: string[];
  }
>(brand: TBrand): TBrand {
  return {
    ...brand,
    logoUrl: brand.logoUrl ? getPosAssetDeliveryUrl(brand.logoUrl) : brand.logoUrl,
    loginAdImageUrl: brand.loginAdImageUrl
      ? getPosAssetDeliveryUrl(brand.loginAdImageUrl)
      : brand.loginAdImageUrl,
    loginHeroImages: brand.loginHeroImages?.map(getPosAssetDeliveryUrl)
  };
}
