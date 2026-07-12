export type WorkspaceKind = "shop" | "owner";
export type UserRole = "super_admin" | "shop_admin" | "cashier" | "support";
export type LicenseStatus = "trial" | "active" | "expired" | "locked";
export type ProductKeyStatus = "unused" | "active" | "expired" | "locked" | "revoked";
export type BillingCycle = "monthly" | "quarterly" | "yearly";
export type ProductKind = "product" | "service";
export type ProductStatus = "active" | "inactive";
export type PaymentMethod = "cash" | "card" | "account";
export type DiscountType = "fixed" | "percentage";
export type TicketStatus = "open" | "in_progress" | "closed";
export type Locale = "en" | "ar" | "ur";
export type TextDirection = "ltr" | "rtl";
export type ReceiptSize = "58mm" | "80mm" | "a4";
export type ReceiptSecondaryLanguage = Exclude<Locale, "en">;
export type TaxMode = "inclusive" | "exclusive";
export type InventoryAdjustmentType = "add" | "remove" | "sale" | "refund";
export type PurchaseOrderStatus = "draft" | "ordered" | "partially_received" | "received" | "cancelled";
export type ExpensePaymentMethod = "cash" | "card" | "bank";
export type SupplierPaymentMethod = "cash" | "card" | "bank" | "credit";
export type PurchasePaymentStatus = "unpaid" | "partial" | "paid";
export type LedgerReferenceType = "bill" | "customer_payment" | "refund" | "expense" | "cash_movement";

export interface LocalizedText {
  en: string;
  ar: string;
  ur: string;
}

export interface Shop {
  id: string;
  name: string;
  slug: string;
  setupEmail?: string;
  setupPasswordHash?: string;
  setupCompletedAt?: string;
  email?: string;
  website?: string;
  phone: string;
  address: string;
  currency: string;
  timezone: string;
  planName: string;
  billingCycle?: BillingCycle;
  packagePrice?: number;
  totalPaid?: number;
  lastOwnerPaymentAt?: string;
  licenseStatus: LicenseStatus;
  createdAt: string;
}

export interface ProductKey {
  id: string;
  key: string;
  status: ProductKeyStatus;
  shopId: string;
  allowedDevices: number;
  createdAt?: string;
  activatedAt?: string;
  expiresAt?: string;
  revokedAt?: string;
  lockedAt?: string;
}

export interface License {
  id: string;
  shopId: string;
  status: LicenseStatus;
  expiresAt?: string;
  lastPaymentAt?: string;
  autoLockDaysAfterExpiry?: number;
  lockedAt?: string;
  lockReason?: string;
}

export interface DeviceActivation {
  id: string;
  shopId: string;
  productKeyId: string;
  browserInfo: string;
  activatedAt: string;
  lastSeenAt: string;
}

export interface User {
  id: string;
  shopId?: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  isActive: boolean;
  passwordHash?: string;
  lastLoginAt?: string;
  createdAt: string;
}

export interface ProductCategory {
  id: string;
  shopId: string;
  name: string;
  description?: string;
  imageUrl?: string;
  createdAt: string;
}

export interface Product {
  id: string;
  shopId: string;
  categoryId?: string;
  barcode?: string;
  kind: ProductKind;
  name: LocalizedText;
  imageUrl?: string;
  salePrice: number;
  costPrice: number;
  stockQuantity: number;
  reorderLevel: number;
  expiryDate?: string;
  taxable: boolean;
  quickTab: boolean;
  status: ProductStatus;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryAdjustment {
  id: string;
  shopId: string;
  productId: string;
  type: InventoryAdjustmentType;
  quantity: number;
  beforeQuantity: number;
  afterQuantity: number;
  reason: string;
  supplierId?: string;
  expiryDate?: string;
  referenceId?: string;
  createdBy: string;
  createdAt: string;
}

export interface InventoryBatch {
  id: string;
  shopId: string;
  productId: string;
  supplierId?: string;
  purchaseOrderId?: string;
  referenceId?: string;
  batchNumber?: string;
  quantity: number;
  remainingQuantity: number;
  costPrice: number;
  expiryDate?: string;
  receivedAt: string;
  createdBy: string;
}

export interface Supplier {
  id: string;
  shopId: string;
  name: string;
  phone?: string;
  email?: string;
  vatNumber?: string;
  contactPerson?: string;
  address?: string;
  defaultPaymentMethod?: SupplierPaymentMethod;
  accountBalance?: number;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOrder {
  id: string;
  shopId: string;
  number: string;
  supplierId?: string;
  supplierName: string;
  status: PurchaseOrderStatus;
  totalAmount?: number;
  paidAmount?: number;
  paymentStatus?: PurchasePaymentStatus;
  paymentMethod?: SupplierPaymentMethod;
  lastPaymentAt?: string;
  note?: string;
  expectedAt?: string;
  receivedAt?: string;
  receivedBy?: string;
  createdBy: string;
  createdAt: string;
}

export interface PurchaseOrderItem {
  id: string;
  purchaseOrderId: string;
  productId: string;
  productName: LocalizedText;
  quantity: number;
  receivedQuantity?: number;
  costPrice: number;
  initialCostPrice?: number;
  expiryDate?: string;
}

export interface DeletedProduct {
  id: string;
  shopId: string;
  product: Product;
  deletedBy: string;
  deletedAt: string;
  reason: string;
}

export interface Customer {
  id: string;
  shopId: string;
  name: string;
  phone?: string;
  email?: string;
  whatsapp?: string;
  createdAt: string;
}

export interface CustomerAccountPayment {
  id: string;
  shopId: string;
  customerId: string;
  number: string;
  businessDate?: string;
  shiftId?: string;
  amount: number;
  method: Extract<PaymentMethod, "cash" | "card">;
  allocations?: Array<{
    billId: string;
    billNumber: string;
    amount: number;
  }>;
  note?: string;
  createdBy: string;
  createdAt: string;
}

export interface Bill {
  id: string;
  shopId: string;
  publicToken?: string;
  customerId?: string;
  businessDate?: string;
  shiftId?: string;
  number: string;
  status: "draft" | "paid" | "due" | "cancelled" | "refunded";
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  customerWhatsapp?: string;
  subtotal: number;
  itemDiscountAmount?: number;
  discountType: DiscountType;
  discountValue: number;
  discountAmount: number;
  taxName?: string;
  taxRate: number;
  taxMode: TaxMode;
  taxAmount: number;
  total: number;
  paidAmount: number;
  dueAmount: number;
  paymentMethod: PaymentMethod;
  cashierId: string;
  createdAt: string;
}

export interface BillItem {
  id: string;
  billId: string;
  productId: string;
  productName: LocalizedText;
  productKind: ProductKind;
  quantity: number;
  unitPrice: number;
  costPrice: number;
  discountType: DiscountType;
  discountValue: number;
  discountAmount: number;
  grossLineTotal: number;
  lineTotal: number;
}

export interface Refund {
  id: string;
  shopId: string;
  originalBillId: string;
  originalSaleDate: string;
  businessDate?: string;
  shiftId?: string;
  paymentMethod: PaymentMethod;
  createdBy: string;
  returnDate: string;
  reason: string;
  amount: number;
  profitAdjustment: number;
}

export interface RefundItem {
  id: string;
  refundId: string;
  billItemId: string;
  productId: string;
  productName: LocalizedText;
  quantity: number;
  unitPrice: number;
  costPrice: number;
  refundAmount: number;
  profitAdjustment: number;
}

export interface RefundItemInput {
  billItemId: string;
  quantity: number;
}

export interface CreateRefundInput {
  billId: string;
  payoutMethod: PaymentMethod;
  reason: string;
  items: RefundItemInput[];
}

export interface Payment {
  id: string;
  billId: string;
  method: PaymentMethod;
  amount: number;
  createdAt: string;
}

export interface AccountingLedgerEntry {
  id: string;
  shopId: string;
  businessDate: string;
  shiftId?: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  memo: string;
  referenceType: LedgerReferenceType;
  referenceId: string;
  billId?: string;
  customerId?: string;
  refundId?: string;
  paymentId?: string;
  createdBy: string;
  createdAt: string;
}

export interface BusinessDay {
  id: string;
  shopId: string;
  businessDate: string;
  openingNote?: string;
  startedBy: string;
  startedAt: string;
  endedAt?: string;
}

export interface Shift {
  id: string;
  shopId: string;
  businessDayId?: string;
  businessDate: string;
  cashierId: string;
  deviceActivationId?: string;
  deviceBrowserInfo?: string;
  openingCash: number;
  countedCash?: number;
  expectedCash?: number;
  difference?: number;
  note?: string;
  startedAt: string;
  forcedClosedBy?: string;
  forceClosedAt?: string;
  forceCloseReason?: string;
  endedAt?: string;
}

export interface DayClose {
  id: string;
  shopId: string;
  businessDate: string;
  totalSales: number;
  cashSales: number;
  cardSales: number;
  accountSales: number;
  refunds: number;
  expenses: number;
  netSales: number;
  expectedCash: number;
  countedCash: number;
  cashDifference: number;
  note?: string;
  closedAt: string;
}

export interface CashMovement {
  id: string;
  shopId: string;
  businessDate: string;
  shiftId?: string;
  createdBy: string;
  type: "cash_in" | "cash_out";
  amount: number;
  reason: string;
  createdAt: string;
}

export interface ExpenseCategory {
  id: string;
  shopId: string;
  name: string;
  createdAt: string;
}

export interface Expense {
  id: string;
  shopId: string;
  businessDate: string;
  shiftId?: string;
  categoryId?: string;
  categoryName: string;
  amount: number;
  paymentMethod: ExpensePaymentMethod;
  vendorName?: string;
  note?: string;
  createdBy: string;
  createdAt: string;
}

export interface POSSettings {
  shopName: string;
  logoUrl?: string;
  address: string;
  phone: string;
  email?: string;
  website?: string;
  currency: string;
  vatNumber?: string;
  receiptQrUrl?: string;
  autoDayRolloverEnabled?: boolean;
}

export interface PrinterSettings {
  receiptSize: ReceiptSize;
  autoPrintAfterSale: boolean;
}

export interface ReceiptSettings {
  footerText: string;
  showTax: boolean;
  showCustomer: boolean;
  showCashier: boolean;
  showVatNumber: boolean;
  showSecondaryLanguage: boolean;
  secondaryLanguage: ReceiptSecondaryLanguage;
  receiptSize: ReceiptSize;
}

export interface TaxSettings {
  enabled: boolean;
  name: string;
  rate: number;
  mode: TaxMode;
  showOnReceipt: boolean;
  promotionEnabled?: boolean;
  promotionTarget?: "bill" | "items";
  promotionDiscountType?: DiscountType;
  promotionDiscountValue?: number;
}

export interface ShopSettingsBundle {
  pos: POSSettings;
  printer: PrinterSettings;
  receipt: ReceiptSettings;
  tax: TaxSettings;
}

export interface DictionaryEntry {
  id: string;
  key: string;
  locale: Locale;
  value: string;
  updatedAt: string;
}

export interface Announcement {
  id: string;
  title: string;
  message: string;
  targetShopId?: string;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  shopId: string;
  subject: string;
  message: string;
  preferredChannel: "whatsapp" | "email" | "call";
  status: TicketStatus;
  createdBy: string;
  createdAt: string;
}

export interface SupportSession {
  id: string;
  shopId: string;
  startedBy: string;
  reason: string;
  startedAt: string;
  endsAt: string;
  endedAt?: string;
}

export interface AuditLog {
  id: string;
  shopId?: string;
  actorId: string;
  action: string;
  targetId?: string;
  detail?: string;
  createdAt: string;
}

export interface BrandProfile {
  posName: string;
  companyName: string;
  logoUrl?: string;
  address?: string;
  website?: string;
  supportWhatsapp: string;
  supportEmail: string;
  supportPhone: string;
  receiptImprintEnabled: boolean;
  receiptImprintText: string;
  loadingTitle: string;
  loadingMessage: string;
  loginHeroImages?: string[];
  loginQuotes: string[];
  loginAdEnabled: boolean;
  loginAdTitle: string;
  loginAdMessage: string;
  loginAdImageUrl?: string;
  loginAdCtaLabel?: string;
  loginAdCtaUrl?: string;
}

export interface SessionUser {
  id: string;
  shopId?: string;
  name: string;
  email: string;
  role: UserRole;
  workspace: WorkspaceKind;
  signedInAt?: string;
  supportSessionId?: string;
}

export interface CheckoutCustomerInput {
  id?: string;
  name?: string;
  phone?: string;
  email?: string;
  whatsapp?: string;
}

export interface CheckoutItemInput {
  productId: string;
  quantity: number;
  unitPrice: number;
  discountType?: DiscountType;
  discountValue?: number;
}

export interface CheckoutBillInput {
  customer: CheckoutCustomerInput;
  items: CheckoutItemInput[];
  discountType: DiscountType;
  discountValue: number;
  paymentMethod: PaymentMethod;
}

export interface DemoAppState {
  ui: {
    locale: Locale;
    direction: TextDirection;
  };
  brand: BrandProfile;
  session: SessionUser | null;
  shops: Shop[];
  licenses: License[];
  productKeys: ProductKey[];
  deviceActivations: DeviceActivation[];
  users: User[];
  categories: ProductCategory[];
  products: Product[];
  inventoryAdjustments: InventoryAdjustment[];
  inventoryBatches: InventoryBatch[];
  suppliers: Supplier[];
  purchaseOrders: PurchaseOrder[];
  purchaseOrderItems: PurchaseOrderItem[];
  deletedProducts: DeletedProduct[];
  customers: Customer[];
  customerAccountPayments: CustomerAccountPayment[];
  accountPaymentSequencesByShop: Record<string, number>;
  bills: Bill[];
  billItems: BillItem[];
  refunds: Refund[];
  refundItems: RefundItem[];
  payments: Payment[];
  ledgerEntries: AccountingLedgerEntry[];
  businessDays: BusinessDay[];
  shifts: Shift[];
  dayCloses: DayClose[];
  cashMovements: CashMovement[];
  expenseCategories: ExpenseCategory[];
  expenses: Expense[];
  receiptSequencesByShop: Record<string, number>;
  settingsByShop: Record<string, ShopSettingsBundle>;
  dictionaryEntries: DictionaryEntry[];
  announcements: Announcement[];
  supportTickets: SupportTicket[];
  supportSessions: SupportSession[];
  auditLogs: AuditLog[];
}
