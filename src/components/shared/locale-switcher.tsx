"use client";

import { localeMeta } from "@/lib/i18n";
import { usePosApp } from "@/components/providers/app-provider";
import { Select } from "@/components/ui/select";

export function LocaleSwitcher({
  className,
  showLabel = true
}: {
  className?: string;
  showLabel?: boolean;
}) {
  const { locale, setLocale, t } = usePosApp();

  return (
    <label className={className}>
      {showLabel ? <span className="mb-2 block text-sm font-medium text-ink">{t("common.language")}</span> : null}
      <Select value={locale} onChange={(event) => setLocale(event.target.value as keyof typeof localeMeta)}>
        {Object.entries(localeMeta).map(([value, meta]) => (
          <option key={value} value={value}>
            {meta.label}
          </option>
        ))}
      </Select>
    </label>
  );
}
