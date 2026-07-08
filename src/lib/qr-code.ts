export function buildQrCodeImageUrl(value?: string, size = 160) {
  const normalized = value?.trim();

  if (!normalized) {
    return undefined;
  }

  const edge = Math.max(96, Math.min(320, Math.round(size)));
  const encodedValue = encodeURIComponent(normalized);

  return `https://api.qrserver.com/v1/create-qr-code/?size=${edge}x${edge}&format=png&data=${encodedValue}`;
}
