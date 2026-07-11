const RECEIPT_TOKEN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

function randomTokenSegment(length: number) {
  const cryptoApi = globalThis.crypto;
  const values = new Uint32Array(length);

  if (cryptoApi?.getRandomValues) {
    cryptoApi.getRandomValues(values);
  } else {
    values.forEach((_, index) => {
      values[index] = Math.floor(Math.random() * RECEIPT_TOKEN_ALPHABET.length);
    });
  }

  return Array.from(values)
    .map((value) => RECEIPT_TOKEN_ALPHABET[value % RECEIPT_TOKEN_ALPHABET.length])
    .join("");
}

export function createPublicReceiptToken(existingTokens: Iterable<string | undefined> = []) {
  const usedTokens = new Set(
    Array.from(existingTokens).reduce<string[]>((tokens, token) => {
      const normalizedToken = token?.trim();

      if (normalizedToken) {
        tokens.push(normalizedToken);
      }

      return tokens;
    }, [])
  );
  let token = "";

  do {
    token = randomTokenSegment(22);
  } while (usedTokens.has(token));

  return token;
}

export function getPublicReceiptBaseUrl() {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return process.env.NEXT_PUBLIC_SHOP_APP_URL?.trim() || "https://shop.globalfsms.com";
}

export function buildPublicReceiptUrl(token?: string, origin = getPublicReceiptBaseUrl()) {
  const normalizedToken = token?.trim();

  if (!normalizedToken) {
    return undefined;
  }

  return `${origin.replace(/\/+$/, "")}/r/${encodeURIComponent(normalizedToken)}`;
}

export function normalizePublicReceiptToken(value?: string) {
  return value?.trim().replace(/[^A-Za-z0-9_-]/g, "") ?? "";
}
