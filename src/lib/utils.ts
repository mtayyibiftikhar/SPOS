import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Locale } from "@/types/pos";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function createId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export function hashSecret(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }

  return `mock_${Math.abs(hash).toString(16)}`;
}

export function getIntlLocale(locale: Locale) {
  if (locale === "ar") {
    return "ar-SA";
  }

  if (locale === "ur") {
    return "ur-PK";
  }

  return "en-SA";
}

export function formatCurrency(amount: number, currency = "SAR", locale: Locale = "en") {
  return new Intl.NumberFormat(getIntlLocale(locale), {
    style: "currency",
    currency,
    minimumFractionDigits: 2
  }).format(amount);
}

export function formatDateTime(value?: string, locale: Locale = "en") {
  if (!value) {
    return "Not available";
  }

  return new Intl.DateTimeFormat(getIntlLocale(locale), {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function formatBusinessDate(value?: string, locale: Locale = "en") {
  if (!value) {
    return "Not available";
  }

  return new Intl.DateTimeFormat(getIntlLocale(locale), {
    dateStyle: "medium"
  }).format(new Date(`${value}T12:00:00`));
}

export function getDirection(locale: "en" | "ar" | "ur") {
  return locale === "en" ? "ltr" : "rtl";
}
