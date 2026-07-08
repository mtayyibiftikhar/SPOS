"use client";

import { useMemo, useState } from "react";
import { baseTranslations, localeMeta, translationKeys, type TranslationKey } from "@/lib/i18n";
import { usePosApp } from "@/components/providers/app-provider";
import { SettingsFormShell } from "@/components/settings/settings-form-shell";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export default function DictionaryPage() {
  const { locale, removeDictionaryEntry, setLocale, state, t, upsertDictionaryEntry } = usePosApp();
  const [editingLocale, setEditingLocale] = useState(locale);
  const [search, setSearch] = useState("");

  const entries = useMemo(() => {
    const query = search.trim().toLowerCase();

    return translationKeys.filter((key) => {
      if (!query) {
        return true;
      }

      return (
        key.toLowerCase().includes(query) ||
        baseTranslations[editingLocale][key].toLowerCase().includes(query)
      );
    });
  }, [editingLocale, search]);

  return (
    <SettingsFormShell
      title={t("settings.dictionary")}
      subtitle={t("settings.dictionaryPageSubtitle")}
    >
      <div className="space-y-6">
        <div className="grid gap-4 lg:grid-cols-[220px_1fr_220px]">
          <label>
            <span className="mb-2 block text-sm font-medium text-ink">{t("dictionary.editingLocale")}</span>
            <Select value={editingLocale} onChange={(event) => setEditingLocale(event.target.value as typeof locale)}>
              {Object.entries(localeMeta).map(([value, meta]) => (
                <option key={value} value={value}>
                  {meta.label}
                </option>
              ))}
            </Select>
          </label>
          <label>
            <span className="mb-2 block text-sm font-medium text-ink">{t("common.search")}</span>
            <Input placeholder={t("dictionary.searchPlaceholder")} value={search} onChange={(event) => setSearch(event.target.value)} />
          </label>
          <div className="flex items-end">
            <Button className="w-full" type="button" variant="secondary" onClick={() => setLocale(editingLocale)}>
              {t("common.useInApp")}
            </Button>
          </div>
        </div>

        <Card className="p-5">
          <p className="text-sm leading-6 text-slate-600">{t("dictionary.currentLocaleHint")}</p>
        </Card>

        <div className="space-y-4">
          {entries.map((key) => {
            const override = state.dictionaryEntries.find(
              (entry) => entry.key === key && entry.locale === editingLocale
            );
            const initialValue = override?.value ?? baseTranslations[editingLocale][key];

            return (
              <Card key={`${editingLocale}-${key}-${override?.updatedAt ?? "base"}`} className="p-5">
                <form
                  className="space-y-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const formData = new FormData(event.currentTarget);
                    const value = String(formData.get("value") ?? "").trim();

                    if (!value || value === baseTranslations[editingLocale][key]) {
                      removeDictionaryEntry(key, editingLocale);
                      return;
                    }

                    upsertDictionaryEntry({
                      key,
                      locale: editingLocale,
                      value
                    });
                  }}
                >
                  <div className="flex flex-col gap-2 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-olive">{t("dictionary.keyLabel")}</p>
                      <p className="mt-2 break-all text-sm font-semibold text-ink">{key}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="submit">{t("common.saveEntry")}</Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => removeDictionaryEntry(key as TranslationKey, editingLocale)}
                      >
                        {t("common.resetToBase")}
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-2">
                    <div className="rounded-3xl bg-shell p-4">
                      <p className="text-sm font-semibold text-ink">{t("common.baseText")}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{baseTranslations[editingLocale][key]}</p>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-ink">{t("common.customText")}</label>
                      <Textarea defaultValue={initialValue} name="value" />
                    </div>
                  </div>
                </form>
              </Card>
            );
          })}

          {entries.length === 0 ? (
            <Card className="p-5">
              <p className="text-sm leading-6 text-slate-600">{t("dictionary.emptyResults")}</p>
            </Card>
          ) : null}
        </div>
      </div>
    </SettingsFormShell>
  );
}
