import type { TranslationKey } from "@/lib/i18n";

export const mainNavItems: Array<{
  href: string;
  labelKey: TranslationKey;
  subtitleKey: TranslationKey;
}> = [
  { href: "/dashboard", labelKey: "nav.dashboard", subtitleKey: "nav.dashboardSubtitle" },
  { href: "/billing", labelKey: "nav.billing", subtitleKey: "nav.billingSubtitle" },
  { href: "/customers", labelKey: "nav.customers", subtitleKey: "nav.customersSubtitle" },
  { href: "/products", labelKey: "nav.products", subtitleKey: "nav.productsSubtitle" },
  { href: "/inventory", labelKey: "nav.inventory", subtitleKey: "nav.inventorySubtitle" },
  { href: "/bills", labelKey: "nav.bills", subtitleKey: "nav.billsSubtitle" },
  { href: "/refunds", labelKey: "nav.refunds", subtitleKey: "nav.refundsSubtitle" },
  { href: "/reports", labelKey: "nav.reports", subtitleKey: "nav.reportsSubtitle" },
  { href: "/settings", labelKey: "nav.settings", subtitleKey: "nav.settingsSubtitle" }
];

export const settingsLinks: Array<{
  href: string;
  titleKey: TranslationKey;
  subtitleKey: TranslationKey;
}> = [
  { href: "/settings/shop", titleKey: "settings.shop", subtitleKey: "settings.shopSubtitle" },
  { href: "/settings/printers", titleKey: "settings.printer", subtitleKey: "settings.printerSubtitle" },
  { href: "/settings/receipt", titleKey: "settings.receipt", subtitleKey: "settings.receiptSubtitle" },
  { href: "/settings/trash", titleKey: "settings.trash", subtitleKey: "settings.trashSubtitle" },
  {
    href: "/settings/dictionary",
    titleKey: "settings.dictionary",
    subtitleKey: "settings.dictionarySubtitle"
  },
  { href: "/settings/tax", titleKey: "settings.tax", subtitleKey: "settings.taxSubtitle" },
  { href: "/settings/users", titleKey: "settings.users", subtitleKey: "settings.usersSubtitle" },
  { href: "/settings/backup", titleKey: "settings.backup", subtitleKey: "settings.backupSubtitle" },
  {
    href: "/settings/support",
    titleKey: "settings.support",
    subtitleKey: "settings.supportSubtitle"
  }
];
