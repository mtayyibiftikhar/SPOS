import type { DemoAppState } from "@/types/pos";
import { OWNER_ADMIN_CREDENTIALS, SHOP_DEMO_PASSWORD } from "@/lib/demo-auth";
import { hashSecret } from "@/lib/utils";

const now = "2026-07-05T08:00:00.000Z";
const shopId = "shop_almadina";
const defaultShopLogo =
  "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'%3E%3Crect width='160' height='160' rx='36' fill='%230f172a'/%3E%3Ccircle cx='122' cy='38' r='14' fill='%2310b981'/%3E%3Ctext x='80' y='96' font-family='Arial,sans-serif' font-size='54' font-weight='700' text-anchor='middle' fill='white'%3ESP%3C/text%3E%3C/svg%3E";

export const initialAppState: DemoAppState = {
  ui: {
    locale: "en",
    direction: "ltr"
  },
  brand: {
    posName: "Simple POS",
    companyName: "Simple POS KSA",
    address: "Riyadh, Saudi Arabia",
    website: "https://simplepos.sa",
    supportWhatsapp: "+966500000123",
    supportEmail: "support@simplepos.sa",
    supportPhone: "+966112223344",
    receiptImprintEnabled: true,
    receiptImprintText: "Powered by Simple POS KSA",
    loadingTitle: "Preparing your POS workspace",
    loadingMessage: "Syncing shop, license, and register data...",
    loginQuotes: [
      "Fast billing. Clean records. Confident closing.",
      "Sell simply today, understand the business tonight.",
      "A calm counter makes every checkout easier."
    ],
    loginAdEnabled: true,
    loginAdTitle: "Built for small KSA shops",
    loginAdMessage: "Track billing, inventory, shifts, refunds, reports, and receipts from one browser-based POS.",
    loginAdImageUrl: undefined,
    loginAdCtaLabel: "Contact POS owner",
    loginAdCtaUrl: "https://simplepos.sa"
  },
  session: null,
  shops: [
    {
      id: shopId,
      name: "Al Madina Service & Snacks",
      slug: "al-madina-service-snacks",
      setupEmail: "setup@almadina.sa",
      setupPasswordHash: hashSecret("setup123"),
      setupCompletedAt: now,
      phone: "+966500111222",
      email: "hello@almadina.sa",
      website: "https://simplepos.sa/shops/al-madina-service-snacks",
      address: "Olaya District, Riyadh, Saudi Arabia",
      currency: "SAR",
      timezone: "Asia/Riyadh",
      planName: "Starter",
      billingCycle: "monthly",
      packagePrice: 99,
      totalPaid: 99,
      lastOwnerPaymentAt: "2026-06-28T10:30:00.000Z",
      licenseStatus: "active",
      createdAt: now
    }
  ],
  licenses: [
    {
      id: "lic_001",
      shopId,
      status: "active",
      expiresAt: "2026-12-31T23:59:59.000Z",
      lastPaymentAt: "2026-06-28T10:30:00.000Z",
      autoLockDaysAfterExpiry: 7
    }
  ],
  productKeys: [
    {
      id: "pk_001",
      key: "SPOS-KSA-DEMO26-RIYADH-ALMADN-202607",
      status: "active",
      shopId,
      allowedDevices: 3,
      createdAt: now,
      activatedAt: now,
      expiresAt: "2026-12-31T23:59:59.000Z"
    }
  ],
  deviceActivations: [
    {
      id: "device_001",
      shopId,
      productKeyId: "pk_001",
      browserInfo: "Chrome on Windows laptop",
      activatedAt: now,
      lastSeenAt: now
    }
  ],
  users: [
    {
      id: "user_owner",
      name: "POS Owner",
      email: OWNER_ADMIN_CREDENTIALS.email,
      role: "super_admin",
      isActive: true,
      passwordHash: hashSecret(OWNER_ADMIN_CREDENTIALS.password),
      createdAt: now,
      lastLoginAt: now
    },
    {
      id: "user_admin",
      shopId,
      name: "Huda Manager",
      email: "admin@almadina.sa",
      phone: "+966500333444",
      role: "shop_admin",
      isActive: true,
      passwordHash: hashSecret(SHOP_DEMO_PASSWORD),
      createdAt: now,
      lastLoginAt: now
    },
    {
      id: "user_cashier",
      shopId,
      name: "Khalid Cashier",
      email: "cashier@almadina.sa",
      phone: "+966500333555",
      role: "cashier",
      isActive: true,
      passwordHash: hashSecret(SHOP_DEMO_PASSWORD),
      createdAt: now,
      lastLoginAt: now
    }
  ],
  categories: [
    {
      id: "cat_beverages",
      shopId,
      name: "Beverages",
      description: "Quick drinks for the front counter",
      createdAt: now
    },
    {
      id: "cat_services",
      shopId,
      name: "Services",
      description: "Small repair and setup services",
      createdAt: now
    }
  ],
  products: [
    {
      id: "prod_tea",
      shopId,
      categoryId: "cat_beverages",
      barcode: "6281000000012",
      kind: "product",
      name: {
        en: "Karak Tea",
        ar: "\u0634\u0627\u064a \u0643\u0631\u0643",
        ur: "\u06a9\u0691\u06a9 \u0686\u0627\u0626\u06d2"
      },
      salePrice: 5,
      costPrice: 2,
      stockQuantity: 120,
      reorderLevel: 24,
      expiryDate: "2026-09-30",
      taxable: true,
      quickTab: true,
      status: "active",
      createdAt: now,
      updatedAt: now
    },
    {
      id: "prod_repair",
      shopId,
      categoryId: "cat_services",
      barcode: "6281000000043",
      kind: "service",
      name: {
        en: "Phone Screen Setup",
        ar: "\u062a\u0631\u0643\u064a\u0628 \u0634\u0627\u0634\u0629 \u0647\u0627\u062a\u0641",
        ur: "\u0641\u0648\u0646 \u0627\u0633\u06a9\u0631\u06cc\u0646 \u0633\u06cc\u0679 \u0627\u067e"
      },
      salePrice: 60,
      costPrice: 25,
      stockQuantity: 0,
      reorderLevel: 0,
      taxable: true,
      quickTab: true,
      status: "active",
      createdAt: now,
      updatedAt: now
    }
  ],
  inventoryAdjustments: [],
  inventoryBatches: [
    {
      id: "batch_tea_001",
      shopId,
      productId: "prod_tea",
      supplierId: "supplier_default",
      batchNumber: "KARAK-2026-09",
      quantity: 120,
      remainingQuantity: 120,
      costPrice: 2,
      expiryDate: "2026-09-30",
      receivedAt: now,
      createdBy: "user_admin"
    }
  ],
  suppliers: [
    {
      id: "supplier_default",
      shopId,
      name: "Default Supplier",
      phone: "+966500222333",
      email: "supplier@example.com",
      vatNumber: "300000000000003",
      contactPerson: "Supplier Desk",
      address: "Riyadh",
      defaultPaymentMethod: "credit",
      accountBalance: 0,
      createdAt: now,
      updatedAt: now
    }
  ],
  purchaseOrders: [],
  purchaseOrderItems: [],
  deletedProducts: [],
  customers: [
    {
      id: "cust_001",
      shopId,
      name: "Abdullah Rahman",
      phone: "+966500777111",
      email: "abdullah@example.com",
      whatsapp: "+966500777111",
      createdAt: now
    }
  ],
  customerAccountPayments: [],
  accountPaymentSequencesByShop: {
    [shopId]: 1
  },
  bills: [],
  billItems: [],
  refunds: [],
  refundItems: [],
  payments: [],
  ledgerEntries: [],
  businessDays: [],
  shifts: [],
  dayCloses: [],
  cashMovements: [],
  expenseCategories: [
    {
      id: "expense_cat_petty",
      shopId,
      name: "Petty cash",
      createdAt: now
    },
    {
      id: "expense_cat_supplies",
      shopId,
      name: "Supplies",
      createdAt: now
    }
  ],
  expenses: [],
  receiptSequencesByShop: {
    [shopId]: 1
  },
  settingsByShop: {
    [shopId]: {
      pos: {
        shopName: "Al Madina Service & Snacks",
        address: "Olaya District, Riyadh, Saudi Arabia",
        phone: "+966500111222",
        email: "hello@almadina.sa",
        website: "https://simplepos.sa/shops/al-madina-service-snacks",
        currency: "SAR",
        logoUrl: defaultShopLogo,
        vatNumber: "300123456700003",
        receiptQrUrl: "https://simplepos.sa/shops/al-madina-service-snacks",
        autoDayRolloverEnabled: false
      },
      printer: {
        receiptSize: "80mm",
        autoPrintAfterSale: false
      },
      receipt: {
        footerText: "Thank you for visiting Al Madina Service & Snacks.",
        showTax: true,
        showCustomer: true,
        showCashier: true,
        showVatNumber: true,
        showSecondaryLanguage: false,
        secondaryLanguage: "ar",
        receiptSize: "80mm"
      },
      tax: {
        enabled: true,
        name: "VAT",
        rate: 15,
        mode: "inclusive",
        showOnReceipt: true
      }
    }
  },
  dictionaryEntries: [],
  announcements: [
    {
      id: "announce_001",
      title: "Welcome to the starter build",
      message: "Your POS workspace is ready with shop controls, billing, inventory, reporting, support, and owner-side licensing tools.",
      targetShopId: shopId,
      createdAt: now
    }
  ],
  supportTickets: [],
  supportSessions: [],
  auditLogs: []
};
