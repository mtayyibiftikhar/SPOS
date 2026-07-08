import type { Product, ProductCategory, User } from "@/types/pos";

function normalizeName(value: string) {
  return value.trim().toLowerCase();
}

function normalizeDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function findCategoryNameConflict(
  categories: ProductCategory[],
  shopId: string,
  name: string,
  excludeId?: string
) {
  const normalized = normalizeName(name);

  if (!normalized) {
    return null;
  }

  return (
    categories.find(
      (category) =>
        category.shopId === shopId &&
        normalizeName(category.name) === normalized &&
        category.id !== excludeId
    ) ?? null
  );
}

export function normalizeBarcode(value?: string) {
  const digits = normalizeDigits(value ?? "");

  return digits.length > 0 ? digits.slice(0, 13) : undefined;
}

export function findBarcodeConflict(
  products: Product[],
  shopId: string,
  barcode: string | undefined,
  excludeId?: string
) {
  const normalized = normalizeBarcode(barcode);

  if (!normalized) {
    return null;
  }

  return (
    products.find(
      (product) =>
        product.shopId === shopId &&
        normalizeBarcode(product.barcode) === normalized &&
        product.id !== excludeId
    ) ?? null
  );
}

export function generateUniqueBarcode(products: Product[], shopId: string | null) {
  const existing = new Set(
    products
      .filter((product) => (shopId ? product.shopId === shopId : true))
      .map((product) => normalizeBarcode(product.barcode))
      .filter((barcode): barcode is string => Boolean(barcode))
  );
  const seed = Number(`${Date.now()}`.slice(-9));

  for (let offset = 0; offset < 5000; offset += 1) {
    const suffix = String((seed + offset) % 1_000_000_000).padStart(9, "0");
    const candidate = `6281${suffix}`;

    if (!existing.has(candidate)) {
      return candidate;
    }
  }

  return `6281${Math.floor(Math.random() * 1_000_000_000)
    .toString()
    .padStart(9, "0")}`;
}

export function findUserEmailConflict(users: User[], email: string, excludeId?: string) {
  const normalized = email.trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  return (
    users.find((user) => user.email.trim().toLowerCase() === normalized && user.id !== excludeId) ?? null
  );
}
