import type { DemoAppState } from "@/types/pos";
import { OWNER_ADMIN_CREDENTIALS } from "@/lib/demo-auth";
import { hashSecret } from "@/lib/utils";

const now = "2026-07-05T08:00:00.000Z";

// Production starts without a demo tenant. Tenant data is created only by the owner portal
// and then loaded from Supabase, preventing deleted demo shops from being synced back.
export const initialAppState: DemoAppState = {
  ui: { locale: "en", direction: "ltr" },
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
    loginHeroImages: [],
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
  shops: [],
  licenses: [],
  productKeys: [],
  deviceActivations: [],
  users: [
    {
      id: "user_owner",
      name: "POS Owner",
      email: OWNER_ADMIN_CREDENTIALS.email,
      role: "super_admin",
      isActive: true,
      passwordHash: hashSecret(OWNER_ADMIN_CREDENTIALS.password),
      createdAt: now
    }
  ],
  categories: [],
  products: [],
  inventoryAdjustments: [],
  inventoryBatches: [],
  suppliers: [],
  purchaseOrders: [],
  purchaseOrderItems: [],
  deletedProducts: [],
  customers: [],
  customerAccountPayments: [],
  accountPaymentSequencesByShop: {},
  bills: [],
  billItems: [],
  refunds: [],
  refundItems: [],
  payments: [],
  ledgerEntries: [],
  businessDays: [],
  shifts: [],
  attendanceRecords: [],
  attendanceQrSessions: [],
  payrollRates: [],
  dayCloses: [],
  cashMovements: [],
  expenseCategories: [],
  expenses: [],
  receiptSequencesByShop: {},
  settingsByShop: {},
  dictionaryEntries: [],
  announcements: [],
  supportTickets: [],
  supportSessions: [],
  auditLogs: []
};
