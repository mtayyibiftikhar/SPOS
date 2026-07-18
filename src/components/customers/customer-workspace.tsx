"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Download,
  FileSpreadsheet,
  Plus,
  ReceiptText,
  Search,
  Trash2,
  Upload,
  UserRound,
  Wallet,
  X
} from "lucide-react";
import { usePosApp } from "@/components/providers/app-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PhoneNumberField } from "@/components/ui/phone-number-field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getCustomerAccountMetrics } from "@/lib/customer-accounts";
import { paymentMethodLabelKeys } from "@/lib/i18n";
import { createStructuredReportPdfBlob, downloadBlob } from "@/lib/report-export";
import {
  combinePhoneNumber,
  DEFAULT_PHONE_COUNTRY_CODE,
  sanitizePhoneDigits,
  splitPhoneNumber,
} from "@/lib/phone";
import { formatCurrency, formatDateTime } from "@/lib/utils";

type CustomerView = "overview" | "directory" | "account" | "history";

type CustomerFormState = {
  email: string;
  id?: string;
  name: string;
  phoneCountryCode: string;
  phoneNumber: string;
  whatsappCountryCode: string;
  whatsappNumber: string;
};

const CUSTOMER_PAGE_SIZE = 9;
const ACCOUNT_PAGE_SIZE = 9;
const SETTLEMENT_PAGE_SIZE = 10;

const CUSTOMER_IMPORT_HEADERS = [
  "customer_name",
  "first_name",
  "last_name",
  "country_code",
  "phone_number",
  "whatsapp_country_code",
  "whatsapp_number",
  "email"
] as const;

type CustomerImportResult = {
  duplicateRows: string[];
  importedCount: number;
  invalidRows: number;
  message: string;
  skippedCount: number;
  status: "error" | "success";
};

function createEmptyCustomerForm(): CustomerFormState {
  return {
    email: "",
    name: "",
    phoneCountryCode: DEFAULT_PHONE_COUNTRY_CODE,
    phoneNumber: "",
    whatsappCountryCode: DEFAULT_PHONE_COUNTRY_CODE,
    whatsappNumber: ""
  };
}

function createCustomerForm(customer?: {
  email?: string;
  id?: string;
  name: string;
  phone?: string;
  whatsapp?: string;
}): CustomerFormState {
  if (!customer) {
    return createEmptyCustomerForm();
  }

  const phone = splitPhoneNumber(customer.phone);
  const whatsapp = splitPhoneNumber(customer.whatsapp);

  return {
    email: customer.email ?? "",
    id: customer.id,
    name: customer.name,
    phoneCountryCode: phone.countryCode,
    phoneNumber: phone.localNumber,
    whatsappCountryCode: whatsapp.countryCode,
    whatsappNumber: whatsapp.localNumber
  };
}

function translateCustomerMessage(t: ReturnType<typeof usePosApp>["t"], message?: string) {
  switch (message) {
    case "Session unavailable.":
      return t("billing.sessionUnavailable");
    case "Customer name is required.":
      return t("customers.customerRequired");
    case "Another customer already uses this phone number.":
      return t("billing.uniquePhoneError");
    case "Customer not found.":
      return t("customers.customerMissing");
    case "Clear the customer account balance before removing this customer.":
      return t("customers.deleteBlockedBalance");
    case "Unable to save customer.":
      return t("customers.saveError");
    case "Unable to remove customer.":
      return t("customers.deleteError");
    case "Enter a settlement amount greater than zero.":
    case "Settlement amount cannot exceed outstanding balance.":
      return t("customers.invalidSettlement");
    case "This customer does not have any outstanding account balance.":
      return t("customers.noOutstandingBalance");
    case "Select at least one open account bill.":
      return t("customers.selectOpenBill");
    case "Start the business day before receiving account payments.":
      return t("billing.dayRequired");
    case "Start your shift before receiving account payments.":
      return t("billing.shiftRequired");
    case "Unable to apply the settlement.":
      return t("customers.settlementError");
    default:
      return message ?? t("customers.saveError");
  }
}

function SectionEyebrow({ children }: { children: ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{children}</p>;
}

function SummaryMetricCard({
  label,
  value,
  description: _description
}: {
  description: string;
  label: string;
  value: string | number;
}) {
  return (
    <Card className="p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{label}</p>
      <p className="mt-3 font-display text-4xl font-semibold tracking-[-0.04em] text-slate-950">{value}</p>
    </Card>
  );
}

function PaginationBar({
  page,
  pageCount,
  total,
  onPageChange
}: {
  onPageChange: (page: number) => void;
  page: number;
  pageCount: number;
  total: number;
}) {
  if (pageCount <= 1) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        Page {page} of {pageCount} | {total} records
      </p>
      <div className="flex items-center gap-2">
        <Button
          className="h-10 rounded-full"
          disabled={page <= 1}
          size="sm"
          variant="secondary"
          onClick={() => onPageChange(Math.max(1, page - 1))}
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </Button>
        <Button
          className="h-10 rounded-full"
          disabled={page >= pageCount}
          size="sm"
          variant="secondary"
          onClick={() => onPageChange(Math.min(pageCount, page + 1))}
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function toCsvCell(value?: string | number) {
  const text = String(value ?? "");

  return `"${text.replace(/"/g, '""')}"`;
}

function splitCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const nextCharacter = line[index + 1];

    if (character === '"' && nextCharacter === '"' && inQuotes) {
      current += '"';
      index += 1;
      continue;
    }

    if (character === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (character === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += character;
  }

  values.push(current.trim());

  return values;
}

function normalizeImportHeader(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

function normalizeImportPhone(countryCode: string | undefined, phoneNumber: string | undefined) {
  const digits = sanitizePhoneDigits(phoneNumber ?? "").replace(/^0+/, "");
  const codeDigits = sanitizePhoneDigits(countryCode ?? "");

  if (!digits || !codeDigits) {
    return null;
  }

  return `+${codeDigits}${digits}`;
}

function splitNameForExport(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const firstName = parts.shift() ?? "";

  return {
    firstName,
    lastName: parts.join(" ")
  };
}

export function CustomerWorkspace() {
  const searchParams = useSearchParams();
  const { currentShop, currentShopId, locale, saveCustomer, deleteCustomer, settleCustomerAccount, state, t } = usePosApp();
  const customerImportRef = useRef<HTMLInputElement | null>(null);
  const [search, setSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [customerForm, setCustomerForm] = useState<CustomerFormState>(createEmptyCustomerForm);
  const [customerFeedback, setCustomerFeedback] = useState<string | null>(null);
  const [customerError, setCustomerError] = useState<string | null>(null);
  const [settlementAmount, setSettlementAmount] = useState("");
  const [settlementMethod, setSettlementMethod] = useState<"cash" | "card">("cash");
  const [settlementNote, setSettlementNote] = useState("");
  const [selectedSettlementBillIds, setSelectedSettlementBillIds] = useState<string[]>([]);
  const [receiptSearch, setReceiptSearch] = useState("");
  const [customerPage, setCustomerPage] = useState(1);
  const [accountPage, setAccountPage] = useState(1);
  const [settlementPage, setSettlementPage] = useState(1);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importResult, setImportResult] = useState<CustomerImportResult | null>(null);
  const [settlementFeedback, setSettlementFeedback] = useState<string | null>(null);
  const [settlementError, setSettlementError] = useState<string | null>(null);
  const requestedView = searchParams.get("view");
  const activeView: CustomerView =
    requestedView === "directory" || requestedView === "account" || requestedView === "history"
      ? requestedView
      : "overview";

  const shopCustomers = useMemo(
    () =>
      state.customers
        .filter((customer) => customer.shopId === currentShopId)
        .sort((left, right) => left.name.localeCompare(right.name)),
    [currentShopId, state.customers]
  );

  const filteredCustomers = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return shopCustomers;
    }

    return shopCustomers.filter((customer) =>
      [customer.name, customer.phone, customer.email, customer.whatsapp]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query))
    );
  }, [search, shopCustomers]);

  const customerMetricsById = useMemo(
    () =>
      Object.fromEntries(
        shopCustomers.map((customer) => [
          customer.id,
          getCustomerAccountMetrics({
            bills: state.bills.filter((bill) => bill.shopId === currentShopId),
            customerId: customer.id,
            settlements: state.customerAccountPayments.filter(
              (entry) => entry.shopId === currentShopId && entry.customerId === customer.id
            )
          })
        ])
      ),
    [currentShopId, shopCustomers, state.bills, state.customerAccountPayments]
  );

  const selectedCustomer = isCreating
    ? null
    : shopCustomers.find((customer) => customer.id === selectedCustomerId) ?? null;
  const selectedMetrics = selectedCustomer ? customerMetricsById[selectedCustomer.id] : null;
  const selectedSettlements = selectedCustomer
    ? state.customerAccountPayments
        .filter((entry) => entry.shopId === currentShopId && entry.customerId === selectedCustomer.id)
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    : [];
  const selectedCustomerBills = selectedCustomer
    ? state.bills
        .filter((bill) => bill.shopId === currentShopId && bill.customerId === selectedCustomer.id)
        .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
    : [];
  const selectedCustomerRefunds = selectedCustomer
    ? state.refunds
        .filter((refund) => {
          const bill = state.bills.find((entry) => entry.id === refund.originalBillId);

          return bill?.shopId === currentShopId && bill.customerId === selectedCustomer.id;
        })
        .sort((left, right) => new Date(left.returnDate).getTime() - new Date(right.returnDate).getTime())
    : [];

  const selectedStatementRows = useMemo(() => {
    if (!selectedCustomer) {
      return [];
    }

    const activity = [
      ...selectedCustomerBills.map((bill) => ({
        date: bill.createdAt,
        reference: bill.number,
        type: bill.paymentMethod === "account" ? "Account sale" : "Paid sale",
        debit: bill.paymentMethod === "account" ? bill.total : bill.total,
        credit: bill.paymentMethod === "account" ? 0 : bill.total,
        detail: `${bill.paymentMethod.toUpperCase()} | total ${formatCurrency(bill.total, currentShop?.currency ?? "SAR", "en")}`
      })),
      ...selectedCustomerRefunds.map((refund) => {
        const bill = state.bills.find((entry) => entry.id === refund.originalBillId);
        const affectsAccount = bill?.paymentMethod === "account";

        return {
          date: refund.returnDate,
          reference: bill?.number ?? refund.originalBillId,
          type: affectsAccount ? "Account refund" : "Refund",
          debit: 0,
          credit: affectsAccount ? Math.abs(refund.amount) : 0,
          detail: `${refund.reason} | refund ${formatCurrency(refund.amount, currentShop?.currency ?? "SAR", "en")}`
        };
      }),
      ...selectedSettlements.map((payment) => ({
        date: payment.createdAt,
        reference: payment.number,
        type: "Account payment",
        debit: 0,
        credit: payment.amount,
        detail: `${payment.method.toUpperCase()} | ${payment.allocations?.map((allocation) => allocation.billNumber).join(", ") || "unallocated"}`
      }))
    ].sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime());

    let balance = 0;

    return activity.map((entry) => {
      balance = Math.round((balance + entry.debit - entry.credit) * 100) / 100;

      return {
        ...entry,
        balance
      };
    });
  }, [
    currentShop?.currency,
    currentShopId,
    selectedCustomer,
    selectedCustomerBills,
    selectedCustomerRefunds,
    selectedSettlements,
    state.bills
  ]);

  useEffect(() => {
    if (isCreating) {
      return;
    }

    if (activeView === "account") {
      return;
    }

    if (selectedCustomer) {
      setCustomerForm(createCustomerForm(selectedCustomer));
    }
  }, [activeView, isCreating, selectedCustomer]);

  useEffect(() => {
    if (activeView !== "account") {
      return;
    }

    setIsCreating(false);
    setSelectedCustomerId(null);
    setSelectedSettlementBillIds([]);
    setReceiptSearch("");
    setSettlementAmount("");
    setSettlementError(null);
    setSettlementFeedback(null);
  }, [activeView]);

  useEffect(() => {
    setCustomerPage(1);
    setAccountPage(1);
    setSettlementPage(1);
  }, [activeView, search]);

  useEffect(() => {
    if (!selectedMetrics) {
      setSelectedSettlementBillIds([]);
      return;
    }

    const openBillIds = new Set(selectedMetrics.openBills.map((bill) => bill.id));
    setSelectedSettlementBillIds((current) => current.filter((billId) => openBillIds.has(billId)));
  }, [selectedMetrics]);

  const totals = useMemo(() => {
    const metrics = Object.values(customerMetricsById);

    return {
      customersWithBalance: metrics.filter((entry) => entry.outstandingBalance > 0).length,
      outstandingBalance: metrics.reduce((sum, entry) => sum + entry.outstandingBalance, 0),
      settlementCount: state.customerAccountPayments.filter((entry) => entry.shopId === currentShopId).length
    };
  }, [currentShopId, customerMetricsById, state.customerAccountPayments]);
  const accountCustomers = useMemo(() => {
    const query = search.trim().toLowerCase();

    return shopCustomers
      .filter((customer) => (customerMetricsById[customer.id]?.outstandingBalance ?? 0) > 0)
      .filter((customer) => {
        if (!query) {
          return true;
        }

        return [customer.name, customer.phone, customer.email, customer.whatsapp]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(query));
      })
      .sort(
        (left, right) =>
          (customerMetricsById[right.id]?.outstandingBalance ?? 0) -
          (customerMetricsById[left.id]?.outstandingBalance ?? 0)
      );
  }, [customerMetricsById, search, shopCustomers]);
  const allShopSettlements = useMemo(
    () =>
      state.customerAccountPayments
        .filter((entry) => entry.shopId === currentShopId)
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()),
    [currentShopId, state.customerAccountPayments]
  );
  const customerPageCount = Math.max(1, Math.ceil(filteredCustomers.length / CUSTOMER_PAGE_SIZE));
  const safeCustomerPage = Math.min(customerPage, customerPageCount);
  const paginatedCustomers = filteredCustomers.slice(
    (safeCustomerPage - 1) * CUSTOMER_PAGE_SIZE,
    safeCustomerPage * CUSTOMER_PAGE_SIZE
  );
  const accountPageCount = Math.max(1, Math.ceil(accountCustomers.length / ACCOUNT_PAGE_SIZE));
  const safeAccountPage = Math.min(accountPage, accountPageCount);
  const paginatedAccountCustomers = accountCustomers.slice(
    (safeAccountPage - 1) * ACCOUNT_PAGE_SIZE,
    safeAccountPage * ACCOUNT_PAGE_SIZE
  );
  const settlementPageCount = Math.max(1, Math.ceil(allShopSettlements.length / SETTLEMENT_PAGE_SIZE));
  const safeSettlementPage = Math.min(settlementPage, settlementPageCount);
  const paginatedSettlements = allShopSettlements.slice(
    (safeSettlementPage - 1) * SETTLEMENT_PAGE_SIZE,
    safeSettlementPage * SETTLEMENT_PAGE_SIZE
  );

  const settlementAmountNumber = Number(settlementAmount || 0);
  const selectedSettlementBills = useMemo(() => {
    if (!selectedMetrics) {
      return [];
    }

    const selectedIds = new Set(selectedSettlementBillIds);

    return selectedMetrics.openBills.filter((bill) => selectedIds.has(bill.id));
  }, [selectedMetrics, selectedSettlementBillIds]);
  const selectedSettlementBalance = useMemo(
    () => Math.round(selectedSettlementBills.reduce((sum, bill) => sum + bill.dueAmount, 0) * 100) / 100,
    [selectedSettlementBills]
  );
  const filteredOpenBills = useMemo(() => {
    const openBills = selectedMetrics?.openBills ?? [];
    const query = receiptSearch.trim().toLowerCase();

    if (!query) {
      return openBills.slice().reverse();
    }

    return openBills
      .filter((bill) =>
        [
          bill.number,
          bill.customerName,
          bill.customerPhone,
          formatDateTime(bill.createdAt, locale),
          String(bill.total),
          String(bill.dueAmount)
        ]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(query))
      )
      .reverse();
  }, [locale, receiptSearch, selectedMetrics?.openBills]);
  const settlementLimit = selectedSettlementBalance > 0
    ? selectedSettlementBalance
    : selectedMetrics?.outstandingBalance ?? 0;
  const settlementTooHigh = Boolean(
    selectedMetrics &&
      Number.isFinite(settlementAmountNumber) &&
      settlementAmountNumber > settlementLimit &&
      settlementLimit > 0
  );

  const beginCreateCustomer = () => {
    setIsCreating(true);
    setSelectedCustomerId(null);
    setCustomerForm(createEmptyCustomerForm());
    setCustomerError(null);
    setCustomerFeedback(null);
    setSettlementError(null);
    setSettlementFeedback(null);
    setSelectedSettlementBillIds([]);
  };

  const openCustomer = (customerId: string) => {
    setIsCreating(false);
    setSelectedCustomerId(customerId);
    setCustomerError(null);
    setCustomerFeedback(null);
    setSettlementError(null);
    setSettlementFeedback(null);
    setSelectedSettlementBillIds([]);
    setReceiptSearch("");
  };

  const openAccountCustomer = (customerId: string) => {
    openCustomer(customerId);
    setSelectedSettlementBillIds([]);
    setSettlementAmount("");
  };

  const handleSaveCustomer = () => {
    const wasCreating = isCreating;

    setCustomerError(null);
    setCustomerFeedback(null);

    const result = saveCustomer({
      email: customerForm.email,
      id: isCreating ? undefined : customerForm.id,
      name: customerForm.name,
      phone: combinePhoneNumber(customerForm.phoneCountryCode, customerForm.phoneNumber) || undefined,
      whatsapp: combinePhoneNumber(customerForm.whatsappCountryCode, customerForm.whatsappNumber) || undefined
    });

    if (!result.ok || !result.customerId) {
      setCustomerError(translateCustomerMessage(t, result.message));
      return;
    }

    setIsCreating(false);
    setCustomerFeedback(t(wasCreating ? "customers.createSuccess" : "customers.saveSuccess"));

    if (wasCreating) {
      setSelectedCustomerId(null);
      setCustomerForm(createEmptyCustomerForm());
      setCustomerPage(1);
      return;
    }

    setSelectedCustomerId(result.customerId);
  };

  const handleDeleteCustomer = () => {
    if (!selectedCustomer) {
      return;
    }

    setCustomerError(null);
    setCustomerFeedback(null);

    const result = deleteCustomer(selectedCustomer.id);

    if (!result.ok) {
      setCustomerError(translateCustomerMessage(t, result.message));
      return;
    }

    setCustomerFeedback(t("customers.deleteSuccess"));
    setSelectedCustomerId(null);
    setCustomerForm(createEmptyCustomerForm());
  };

  const handleSettlement = async () => {
    if (!selectedCustomer || !selectedMetrics) {
      return;
    }

    setSettlementError(null);
    setSettlementFeedback(null);

    if (settlementTooHigh) {
      setSettlementError(t("customers.invalidSettlement"));
      return;
    }

    const result = await settleCustomerAccount({
      amount: Number(settlementAmount || 0),
      billIds: selectedSettlementBillIds,
      customerId: selectedCustomer.id,
      method: settlementMethod,
      note: settlementNote
    });

    if (!result.ok) {
      setSettlementError(translateCustomerMessage(t, result.message));
      return;
    }

    setSettlementFeedback(
      result.number
        ? t("customers.settlementReceiptCreated", { number: result.number })
        : t("customers.settlementSuccess")
    );
    setSettlementAmount("");
    setSettlementNote("");
    setSelectedSettlementBillIds([]);
  };

  const toggleSettlementBill = (billId: string) => {
    setSelectedSettlementBillIds((current) =>
      current.includes(billId) ? current.filter((entry) => entry !== billId) : [...current, billId]
    );
    setSettlementError(null);
    setSettlementFeedback(null);
  };

  const selectAllOpenBills = () => {
    setSelectedSettlementBillIds(selectedMetrics?.openBills.map((bill) => bill.id) ?? []);
    setSettlementError(null);
    setSettlementFeedback(null);
  };

  const clearSelectedOpenBills = () => {
    setSelectedSettlementBillIds([]);
    setSettlementError(null);
    setSettlementFeedback(null);
  };

  const exportCustomersCsv = () => {
    const rows = [
      [...CUSTOMER_IMPORT_HEADERS],
      ...shopCustomers.map((customer) => {
        const phone = splitPhoneNumber(customer.phone);
        const whatsapp = splitPhoneNumber(customer.whatsapp || customer.phone);
        const name = splitNameForExport(customer.name);

        return [
          customer.name,
          name.firstName,
          name.lastName,
          phone.countryCode,
          phone.localNumber,
          whatsapp.countryCode,
          whatsapp.localNumber,
          customer.email ?? ""
        ];
      })
    ];
    const csv = rows.map((row) => row.map(toCsvCell).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const shopSlug =
      currentShop?.slug ||
      currentShop?.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") ||
      "shop";

    downloadBlob(blob, `customers-${shopSlug}.csv`);
    setCustomerFeedback(t("customers.exportSuccess"));
  };

  const downloadCustomerSchema = () => {
    const csv = [
      CUSTOMER_IMPORT_HEADERS.map(toCsvCell).join(","),
      [
        "Sample Customer",
        "Sample",
        "Customer",
        "+966",
        "501234567",
        "+966",
        "501234567",
        "customer@example.com"
      ].map(toCsvCell).join(",")
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });

    downloadBlob(blob, "customer-import-schema.csv");
  };

  const importCustomersCsv = async (file: File | null) => {
    if (!file) {
      return;
    }

    setImportResult(null);
    setCustomerError(null);
    setCustomerFeedback(null);

    const raw = await file.text();
    const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const headers = splitCsvLine(lines[0] ?? "").map(normalizeImportHeader);
    const expectedHeaders = [...CUSTOMER_IMPORT_HEADERS];

    if (
      headers.length !== expectedHeaders.length ||
      headers.some((header, index) => header !== expectedHeaders[index])
    ) {
      setImportResult({
        duplicateRows: [],
        importedCount: 0,
        invalidRows: 0,
        message: "Import stopped. Download the schema file and keep the headers exactly the same.",
        skippedCount: 0,
        status: "error"
      });

      if (customerImportRef.current) {
        customerImportRef.current.value = "";
      }

      return;
    }

    const dataLines = lines.slice(1);
    let importedCount = 0;
    let invalidRows = 0;
    let skippedCount = 0;
    const duplicateRows: string[] = [];
    const knownPhones = new Set(shopCustomers.map((customer) => customer.phone).filter(Boolean));

    dataLines.forEach((line) => {
      const [
        customerName,
        firstName,
        lastName,
        countryCode,
        phoneNumber,
        whatsappCountryCode,
        whatsappNumber,
        email
      ] = splitCsvLine(line);
      const name = (customerName || `${firstName ?? ""} ${lastName ?? ""}`).trim().replace(/\s+/g, " ");
      const phone = normalizeImportPhone(countryCode, phoneNumber);

      if (!name || !phone) {
        invalidRows += 1;
        return;
      }

      if (knownPhones.has(phone)) {
        skippedCount += 1;
        duplicateRows.push(`${name} (${phone})`);
        return;
      }

      const whatsapp = whatsappNumber?.trim()
        ? normalizeImportPhone(whatsappCountryCode || countryCode, whatsappNumber)
        : phone;

      if (!whatsapp) {
        invalidRows += 1;
        return;
      }

      const result = saveCustomer({
        name,
        phone,
        email,
        whatsapp
      });

      if (result.ok) {
        importedCount += 1;
        knownPhones.add(phone);
      } else {
        skippedCount += 1;
        duplicateRows.push(`${name} (${phone})`);
      }
    });

    if (customerImportRef.current) {
      customerImportRef.current.value = "";
    }

    setImportResult({
      duplicateRows: duplicateRows.slice(0, 8),
      importedCount,
      invalidRows,
      message:
        importedCount > 0
          ? `${importedCount} customers imported. ${skippedCount} duplicate rows skipped. ${invalidRows} invalid rows ignored.`
          : `No customers imported. ${skippedCount} duplicate rows skipped. ${invalidRows} invalid rows ignored.`,
      skippedCount,
      status: importedCount > 0 ? "success" : "error"
    });
    setCustomerFeedback(importedCount > 0 ? t("customers.importSuccess", { count: importedCount }) : null);
  };

  const exportSelectedStatementPdf = async () => {
    if (!selectedCustomer || !selectedMetrics || !currentShop) {
      return;
    }

    const statementGeneratedAt = formatDateTime(new Date().toISOString(), "en");
    const statementRows =
      selectedStatementRows.length > 0
        ? selectedStatementRows.map((entry) => ({
            label: `${formatDateTime(entry.date, "en")} | ${entry.reference}`,
            value: `Bal ${formatCurrency(entry.balance, currentShop.currency, "en")}`,
            detail: `${entry.type} | Dr ${formatCurrency(entry.debit, currentShop.currency, "en")} | Cr ${formatCurrency(entry.credit, currentShop.currency, "en")} | ${entry.detail}`
          }))
        : [{ label: t("customers.noOpenBills"), value: "-", detail: t("customers.noPayments") }];

    const pdfBlob = await createStructuredReportPdfBlob({
      generatedAt: statementGeneratedAt,
      logoUrl: state.settingsByShop[currentShop.id]?.pos.logoUrl,
      period: statementGeneratedAt,
      shopName: currentShop.name,
      subtitle: selectedCustomer.phone || selectedCustomer.email || t("common.notAvailable"),
      title: t("customers.statementTitle"),
      sections: [
        {
          title: `Customer account - ${selectedCustomer.name}`,
          rows: [
            { label: "Customer phone", value: selectedCustomer.phone ?? "-" },
            { label: "Customer email", value: selectedCustomer.email ?? "-" },
            { label: t("customers.totalBills"), value: String(selectedMetrics.billCount) },
            { label: t("customers.openBills"), value: String(selectedMetrics.openBillCount) },
            { label: t("customers.totalSales"), value: formatCurrency(selectedMetrics.totalSales, currentShop.currency, "en") },
            { label: t("customers.totalPaid"), value: formatCurrency(selectedMetrics.totalPaid, currentShop.currency, "en") },
            {
              label: t("customers.balanceDue"),
              value: formatCurrency(selectedMetrics.outstandingBalance, currentShop.currency, "en"),
              detail: "Only actual due balance can be received; over-payments are blocked."
            }
          ]
        },
        {
          title: "Running account statement",
          rows: statementRows
        },
        {
          title: t("customers.openBills"),
          rows:
            selectedMetrics.openBills.length > 0
              ? selectedMetrics.openBills.map((bill) => ({
                  label: bill.number,
                  value: formatCurrency(bill.dueAmount, currentShop.currency, "en"),
                  detail: `${formatDateTime(bill.createdAt, "en")} | total ${formatCurrency(bill.total, currentShop.currency, "en")}`
                }))
              : [{ label: t("customers.noOpenBills"), value: "-" }]
        },
        {
          title: "Payment receipts and allocations",
          rows:
            selectedSettlements.length > 0
              ? selectedSettlements.map((settlement) => ({
                  label: `${settlement.number} | ${formatDateTime(settlement.createdAt, "en")}`,
                  value: formatCurrency(settlement.amount, currentShop.currency, "en"),
                  detail: `${settlement.method.toUpperCase()} | ${settlement.allocations?.map((allocation) => `${allocation.billNumber} ${formatCurrency(allocation.amount, currentShop.currency, "en")}`).join(", ") || "No allocations"}`
                }))
              : [{ label: t("customers.noPayments"), value: "-" }]
        },
        {
          title: "Statement controls",
          rows: [
            {
              label: "Statement closing balance",
              value: formatCurrency(
                selectedStatementRows[selectedStatementRows.length - 1]?.balance ?? 0,
                currentShop.currency,
                "en"
              )
            },
            { label: "Current account balance due", value: formatCurrency(selectedMetrics.outstandingBalance, currentShop.currency, "en") },
            {
              label: "Control status",
              value:
                Math.abs((selectedStatementRows[selectedStatementRows.length - 1]?.balance ?? 0) - selectedMetrics.outstandingBalance) < 0.01
                  ? "Matched"
                  : "Review",
              detail: "The statement running balance is checked against the current customer balance."
            }
          ]
        }
      ]
    });
    const customerSlug = selectedCustomer.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "customer";

    downloadBlob(pdfBlob, `customer-statement-${customerSlug}.pdf`);
    setCustomerFeedback(t("customers.statementDownloaded"));
  };

  const directoryPanel = (
    <Card className="flex flex-col overflow-hidden p-0 xl:max-h-[calc(100dvh-10rem)]">
      <div className="border-b border-slate-200 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <SectionEyebrow>{t("nav.customers")}</SectionEyebrow>
            <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-950">Customer</h2>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button className="h-11 shrink-0 rounded-full bg-slate-950 px-4 text-sm text-white shadow-[0_14px_28px_rgba(15,23,42,0.16)] hover:bg-slate-900" onClick={beginCreateCustomer}>
              <span className="inline-flex items-center gap-2 whitespace-nowrap">
                <Plus className="h-4 w-4" />
                {t("customers.newCustomer")}
              </span>
            </Button>
            <Button className="h-11 rounded-full" variant="secondary" onClick={exportCustomersCsv}>
              <span className="inline-flex items-center gap-2 whitespace-nowrap">
                <Download className="h-4 w-4" />
                {t("customers.exportCustomers")}
              </span>
            </Button>
            <Button className="h-11 rounded-full" variant="secondary" onClick={() => setIsImportOpen(true)}>
              <span className="inline-flex items-center gap-2 whitespace-nowrap">
                <Upload className="h-4 w-4" />
                {t("customers.importCustomers")}
              </span>
            </Button>
          </div>
        </div>

        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            className="h-11 rounded-[16px] border-slate-200 bg-slate-50 pl-11 text-slate-950"
            placeholder={t("customers.searchPlaceholder")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        {customerFeedback ? <p className="mt-3 text-sm font-medium text-emerald-700">{customerFeedback}</p> : null}
      </div>

      <div className="grid flex-1 gap-3 overflow-y-auto p-4 md:grid-cols-2 2xl:grid-cols-3">
        {paginatedCustomers.length > 0 ? (
          paginatedCustomers.map((customer) => {
            const metrics = customerMetricsById[customer.id];
            const isActive = !isCreating && selectedCustomerId === customer.id;

            return (
              <button
                key={customer.id}
                className={`w-full rounded-[22px] border px-4 py-4 text-left transition ${
                  isActive
                    ? "border-slate-950 bg-slate-950 text-white shadow-[0_18px_35px_rgba(15,23,42,0.15)]"
                    : "border-slate-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/50"
                }`}
                onClick={() => openCustomer(customer.id)}
                type="button"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{customer.name}</p>
                    <p className={`mt-1 truncate text-sm ${isActive ? "text-white/78" : "text-slate-600"}`}>
                      {customer.phone || customer.email || customer.whatsapp || t("common.notAvailable")}
                    </p>
                  </div>
                  {(metrics?.outstandingBalance ?? 0) > 0 ? (
                    <Badge className={isActive ? "bg-white text-slate-950" : ""} variant="warning">
                      {formatCurrency(metrics.outstandingBalance, currentShop?.currency ?? "SAR", locale)}
                    </Badge>
                  ) : null}
                </div>
                <div className={`mt-3 flex items-center gap-3 text-xs ${isActive ? "text-white/70" : "text-slate-500"}`}>
                  <span>{metrics?.billCount ?? 0} {t("nav.bills")}</span>
                  <span>{metrics?.openBillCount ?? 0} {t("customers.openBills")}</span>
                </div>
              </button>
            );
          })
        ) : (
          <div className="rounded-[22px] border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center text-sm leading-6 text-slate-600">
            {t("customers.emptyState")}
          </div>
        )}
      </div>
      <PaginationBar
        page={safeCustomerPage}
        pageCount={customerPageCount}
        total={filteredCustomers.length}
        onPageChange={setCustomerPage}
      />
    </Card>
  );

  const profilePanel = (
    <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <SectionEyebrow>{t("common.customer")}</SectionEyebrow>
          <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
            {isCreating ? t("customers.formNewTitle") : t("customers.formTitle")}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!isCreating && selectedCustomer ? <Badge variant="neutral">{selectedCustomer.name}</Badge> : null}
          <Button
            className="rounded-full"
            variant="secondary"
            onClick={() => {
              setIsCreating(false);
              setSelectedCustomerId(null);
              setCustomerForm(createEmptyCustomerForm());
              setCustomerError(null);
              setCustomerFeedback(null);
            }}
          >
            <span className="inline-flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              {t("customers.backToDirectory")}
            </span>
          </Button>
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="mb-2 block text-sm font-medium text-ink">{t("common.customerName")}</label>
          <Input
            className="rounded-[16px] border-slate-200 bg-slate-50"
            value={customerForm.name}
            onChange={(event) => setCustomerForm((current) => ({ ...current, name: event.target.value }))}
          />
        </div>

        <PhoneNumberField
          countryCode={customerForm.phoneCountryCode}
          label={t("common.phone")}
          number={customerForm.phoneNumber}
          onCountryCodeChange={(value) => setCustomerForm((current) => ({ ...current, phoneCountryCode: value }))}
          onNumberChange={(value) =>
            setCustomerForm((current) => ({ ...current, phoneNumber: sanitizePhoneDigits(value) }))
          }
        />

        <PhoneNumberField
          countryCode={customerForm.whatsappCountryCode}
          label={t("common.whatsapp")}
          number={customerForm.whatsappNumber}
          onCountryCodeChange={(value) => setCustomerForm((current) => ({ ...current, whatsappCountryCode: value }))}
          onNumberChange={(value) =>
            setCustomerForm((current) => ({ ...current, whatsappNumber: sanitizePhoneDigits(value) }))
          }
        />

        <div className="md:col-span-2">
          <label className="mb-2 block text-sm font-medium text-ink">{t("common.email")}</label>
          <Input
            className="rounded-[16px] border-slate-200 bg-slate-50"
            value={customerForm.email}
            onChange={(event) => setCustomerForm((current) => ({ ...current, email: event.target.value }))}
          />
        </div>
      </div>

      {customerError ? <p className="mt-4 text-sm font-medium text-red-700">{customerError}</p> : null}
      {customerFeedback ? <p className="mt-4 text-sm font-medium text-emerald-700">{customerFeedback}</p> : null}

      <div className="mt-5 flex flex-wrap gap-3">
        <Button className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={handleSaveCustomer}>
          {t(isCreating ? "customers.createCustomer" : "customers.saveCustomer")}
        </Button>
        {!isCreating && selectedCustomer ? (
          <Button variant="danger" onClick={handleDeleteCustomer}>
            <span className="inline-flex items-center gap-2">
              <Trash2 className="h-4 w-4" />
              {t("customers.deleteCustomer")}
            </span>
          </Button>
        ) : null}
      </div>
    </Card>
  );

  const accountPanel = (
    <Card className="p-6">
      <div className="flex items-start gap-3">
        <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700">
          <Wallet className="h-5 w-5" />
        </div>
        <div>
          <SectionEyebrow>{t("common.account")}</SectionEyebrow>
          <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-950">{t("customers.receivePaymentTitle")}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{t("customers.receivePaymentDesc")}</p>
        </div>
      </div>

      {selectedCustomer && selectedMetrics ? (
        <div className="mt-5 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">{t("customers.balanceDue")}</p>
              <p className="mt-1 font-display text-[2rem] font-semibold tracking-[-0.04em] text-slate-950">
                {formatCurrency(selectedMetrics.outstandingBalance, currentShop?.currency ?? "SAR", locale)}
              </p>
            </div>
            <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">{t("customers.selectedReceiptBalance")}</p>
              <p className="mt-1 font-display text-[2rem] font-semibold tracking-[-0.04em] text-slate-950">
                {formatCurrency(selectedSettlementBalance, currentShop?.currency ?? "SAR", locale)}
              </p>
            </div>
          </div>

          <div className="rounded-[22px] border border-slate-200 bg-white p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-slate-100 p-2 text-slate-700">
                <CircleDollarSign className="h-4 w-4" />
              </div>
              <div>
                <SectionEyebrow>{t("customers.settlementTitle")}</SectionEyebrow>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  {selectedSettlementBillIds.length > 0
                    ? t("customers.receiveAgainstSelection", { count: selectedSettlementBillIds.length })
                    : t("customers.autoOldestHint")}
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
                <Input
                  className="rounded-[16px] border-slate-200 bg-slate-50"
                  inputMode="decimal"
                  placeholder={t("common.amount")}
                  value={settlementAmount}
                  onChange={(event) => setSettlementAmount(event.target.value)}
                />
                <Select
                  value={settlementMethod}
                  onChange={(event) => setSettlementMethod(event.target.value as "cash" | "card")}
                >
                  <option value="cash">{t("common.cash")}</option>
                  <option value="card">{t("common.card")}</option>
                </Select>
              </div>

              <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                {selectedSettlementBillIds.length > 0 ? t("customers.selectedReceiptBalance") : t("customers.balanceDue")}:{" "}
                <span className="font-semibold text-slate-950">
                  {formatCurrency(settlementLimit, currentShop?.currency ?? "SAR", locale)}
                </span>
              </div>

              <Textarea
                className="min-h-[110px] rounded-[18px] border-slate-200 bg-slate-50"
                placeholder={t("customers.settlementNote")}
                value={settlementNote}
                onChange={(event) => setSettlementNote(event.target.value)}
              />

              <div className="flex flex-wrap gap-3">
                <Button
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                  disabled={settlementLimit <= 0 || settlementTooHigh}
                  onClick={handleSettlement}
                >
                  {t("customers.applySettlement")}
                </Button>
                <Button
                  variant="secondary"
                  disabled={settlementLimit <= 0}
                  onClick={() => setSettlementAmount(String(settlementLimit))}
                >
                  {selectedSettlementBillIds.length > 0 ? t("customers.quickFillSelected") : t("customers.quickFillBalance")}
                </Button>
                <Button className="gap-2" variant="secondary" onClick={() => void exportSelectedStatementPdf()}>
                  <Download className="h-4 w-4" />
                  {t("customers.downloadStatement")}
                </Button>
              </div>

              {settlementTooHigh ? <p className="text-sm font-medium text-red-700">{t("customers.invalidSettlement")}</p> : null}
              {settlementError ? <p className="text-sm font-medium text-red-700">{settlementError}</p> : null}
              {settlementFeedback ? <p className="text-sm font-medium text-emerald-700">{settlementFeedback}</p> : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{t("customers.totalSales")}</p>
              <p className="mt-1 text-sm font-semibold text-slate-950">
                {formatCurrency(selectedMetrics.totalSales, currentShop?.currency ?? "SAR", locale)}
              </p>
            </div>
            <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{t("customers.totalPaid")}</p>
              <p className="mt-1 text-sm font-semibold text-slate-950">
                {formatCurrency(selectedMetrics.totalPaid, currentShop?.currency ?? "SAR", locale)}
              </p>
            </div>
            <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{t("customers.totalBills")}</p>
              <p className="mt-1 text-sm font-semibold text-slate-950">{selectedMetrics.billCount}</p>
            </div>
            <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{t("customers.openBills")}</p>
              <p className="mt-1 text-sm font-semibold text-slate-950">{selectedMetrics.openBillCount}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-5 rounded-[22px] border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center text-sm leading-6 text-slate-600">
          {t("customers.formDesc")}
        </div>
      )}
    </Card>
  );

  const openBillsPanel = (
    <Card className="p-6">
      <div className="flex items-start gap-3">
        <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
          <ReceiptText className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <SectionEyebrow>{t("customers.openBills")}</SectionEyebrow>
          <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-950">{t("customers.selectReceiptTitle")}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{t("customers.selectReceiptDesc")}</p>
        </div>
      </div>

      {selectedMetrics?.openBills.length ? (
        <div className="mt-5 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={selectAllOpenBills}>
            {t("customers.selectAllOpenBills")}
          </Button>
          <Button size="sm" variant="secondary" onClick={clearSelectedOpenBills}>
            {t("customers.clearSelectedBills")}
          </Button>
        </div>
      ) : null}

      <div className="mt-5 max-h-[520px] space-y-3 overflow-y-auto pr-1">
        {selectedMetrics?.openBills.length ? (
          selectedMetrics.openBills
            .slice()
            .reverse()
            .map((bill) => {
              const isSelected = selectedSettlementBillIds.includes(bill.id);

              return (
                <div
                  key={bill.id}
                  className={`rounded-[22px] border px-4 py-4 transition ${
                    isSelected
                      ? "border-emerald-300 bg-emerald-50 shadow-[0_18px_34px_rgba(16,185,129,0.10)]"
                      : "border-slate-200 bg-slate-50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <button
                      className="flex min-w-0 flex-1 items-start gap-3 text-left"
                      onClick={() => toggleSettlementBill(bill.id)}
                      type="button"
                    >
                      <span
                        className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                          isSelected ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 bg-white"
                        }`}
                      >
                        {isSelected ? <span className="text-[12px] font-bold leading-none">✓</span> : null}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-slate-950">{bill.number}</span>
                        <span className="mt-1 block text-sm text-slate-600">{formatDateTime(bill.createdAt, locale)}</span>
                      </span>
                    </button>
                    <Badge variant={isSelected ? "success" : "warning"}>
                      {formatCurrency(bill.dueAmount, currentShop?.currency ?? "SAR", locale)}
                    </Badge>
                  </div>
                  <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                    <span>{t("common.total")}: {formatCurrency(bill.total, currentShop?.currency ?? "SAR", locale)}</span>
                    <span>{t("common.paidAmount")}: {formatCurrency(bill.paidAmount, currentShop?.currency ?? "SAR", locale)}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant={isSelected ? "secondary" : "primary"}
                      onClick={() => {
                        setSelectedSettlementBillIds([bill.id]);
                        setSettlementAmount(String(bill.dueAmount));
                      }}
                    >
                      {t("customers.receiveThisReceipt")}
                    </Button>
                    <Link className="inline-flex h-9 items-center rounded-[13px] border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50" href={`/bills/${bill.id}`}>
                      {t("bills.viewReceipt")}
                    </Link>
                  </div>
                </div>
              );
            })
        ) : (
          <div className="rounded-[20px] border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center text-sm leading-6 text-slate-600">
            {t("customers.noOpenBills")}
          </div>
        )}
      </div>
    </Card>
  );

  const focusedAccountPanel = (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#ecfdf5_54%,#fff7ed_100%)] p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <SectionEyebrow>{t("common.account")}</SectionEyebrow>
              <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-950">{t("customers.receivePaymentTitle")}</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{t("customers.receivePaymentDesc")}</p>
            </div>
          </div>

          <Button className="gap-2 rounded-full" variant="secondary" onClick={() => void exportSelectedStatementPdf()}>
            <Download className="h-4 w-4" />
            {t("customers.downloadStatement")}
          </Button>
        </div>
      </div>

      {selectedCustomer && selectedMetrics ? (
        <div className="p-5">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-[22px] border border-emerald-200 bg-emerald-50 px-4 py-4 md:col-span-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">{t("customers.balanceDue")}</p>
              <p className="mt-1 font-display text-[2rem] font-semibold tracking-[-0.04em] text-slate-950">
                {formatCurrency(selectedMetrics.outstandingBalance, currentShop?.currency ?? "SAR", locale)}
              </p>
            </div>
            <div className="rounded-[22px] border border-slate-200 bg-white px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{t("customers.openBills")}</p>
              <p className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-950">{selectedMetrics.openBillCount}</p>
            </div>
            <div className="rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">{t("customers.selectedReceiptBalance")}</p>
              <p className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                {formatCurrency(selectedSettlementBalance, currentShop?.currency ?? "SAR", locale)}
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
            <section className="rounded-[28px] border border-slate-200 bg-white shadow-[0_20px_45px_rgba(15,23,42,0.06)]">
              <div className="border-b border-slate-200 p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
                      <ReceiptText className="h-5 w-5" />
                    </div>
                    <div>
                      <SectionEyebrow>{t("customers.openBills")}</SectionEyebrow>
                      <h3 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-slate-950">{t("customers.selectReceiptTitle")}</h3>
                      <p className="mt-1 text-sm leading-6 text-slate-600">{t("customers.selectReceiptDesc")}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" onClick={selectAllOpenBills}>
                      {t("customers.selectAllOpenBills")}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={clearSelectedOpenBills}>
                      {t("customers.clearSelectedBills")}
                    </Button>
                  </div>
                </div>

                <div className="relative mt-4">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    className="h-12 rounded-[18px] border-slate-200 bg-slate-50 pl-11 text-slate-950"
                    placeholder={t("customers.receiptSearchPlaceholder")}
                    value={receiptSearch}
                    onChange={(event) => setReceiptSearch(event.target.value)}
                  />
                </div>
              </div>

              <div className="max-h-[520px] space-y-3 overflow-y-auto p-4">
                {filteredOpenBills.length > 0 ? (
                  filteredOpenBills.map((bill) => {
                    const isSelected = selectedSettlementBillIds.includes(bill.id);

                    return (
                      <div
                        key={bill.id}
                        className={`rounded-[22px] border p-4 transition ${
                          isSelected
                            ? "border-emerald-300 bg-emerald-50 shadow-[0_18px_34px_rgba(16,185,129,0.10)]"
                            : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white"
                        }`}
                      >
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <button
                            className="flex min-w-0 flex-1 items-start gap-3 text-left"
                            onClick={() => toggleSettlementBill(bill.id)}
                            type="button"
                          >
                            <span
                              className={`mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                                isSelected ? "border-emerald-500 bg-emerald-500" : "border-slate-300 bg-white"
                              }`}
                            >
                              {isSelected ? <span className="h-2.5 w-2.5 rounded-full bg-white" /> : null}
                            </span>
                            <span className="min-w-0">
                              <span className="block text-sm font-semibold text-slate-950">{bill.number}</span>
                              <span className="mt-1 block text-sm text-slate-600">{formatDateTime(bill.createdAt, locale)}</span>
                              <span className="mt-1 block text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                                {t("common.total")} {formatCurrency(bill.total, currentShop?.currency ?? "SAR", locale)} | {t("common.paidAmount")}{" "}
                                {formatCurrency(bill.paidAmount, currentShop?.currency ?? "SAR", locale)}
                              </span>
                            </span>
                          </button>

                          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                            <Badge variant={isSelected ? "success" : "warning"}>
                              {formatCurrency(bill.dueAmount, currentShop?.currency ?? "SAR", locale)}
                            </Badge>
                            <Button
                              size="sm"
                              variant={isSelected ? "secondary" : "primary"}
                              onClick={() => {
                                setSelectedSettlementBillIds([bill.id]);
                                setSettlementAmount(String(bill.dueAmount));
                              }}
                            >
                              {t("customers.receiveThisReceipt")}
                            </Button>
                            <Link className="inline-flex h-9 items-center rounded-[13px] border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50" href={`/bills/${bill.id}`}>
                              {t("bills.viewReceipt")}
                            </Link>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-[20px] border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center text-sm leading-6 text-slate-600">
                    {receiptSearch.trim() ? t("customers.noReceiptSearchResults") : t("customers.noOpenBills")}
                  </div>
                )}
              </div>
            </section>

            <aside className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_20px_45px_rgba(15,23,42,0.06)] xl:sticky xl:top-4 xl:self-start">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
                  <CircleDollarSign className="h-5 w-5" />
                </div>
                <div>
                  <SectionEyebrow>{t("customers.paymentDetails")}</SectionEyebrow>
                  <h3 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-slate-950">{t("customers.settlementTitle")}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {selectedSettlementBillIds.length > 0
                      ? t("customers.receiveAgainstSelection", { count: selectedSettlementBillIds.length })
                      : t("customers.autoOldestHint")}
                  </p>
                </div>
              </div>

              <div className="mt-4 rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-slate-600">
                    {selectedSettlementBillIds.length > 0 ? t("customers.selectedReceiptBalance") : t("customers.balanceDue")}
                  </span>
                  <span className="font-semibold text-slate-950">
                    {formatCurrency(settlementLimit, currentShop?.currency ?? "SAR", locale)}
                  </span>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <Input
                  className="h-12 rounded-[18px] border-slate-200 bg-slate-50"
                  inputMode="decimal"
                  placeholder={t("common.amount")}
                  value={settlementAmount}
                  onChange={(event) => setSettlementAmount(event.target.value)}
                />
                <Select
                  value={settlementMethod}
                  onChange={(event) => setSettlementMethod(event.target.value as "cash" | "card")}
                >
                  <option value="cash">{t("common.cash")}</option>
                  <option value="card">{t("common.card")}</option>
                </Select>
                <Textarea
                  className="min-h-[92px] rounded-[18px] border-slate-200 bg-slate-50"
                  placeholder={t("customers.settlementNote")}
                  value={settlementNote}
                  onChange={(event) => setSettlementNote(event.target.value)}
                />

                <Button
                  className="h-12 w-full rounded-[18px] bg-emerald-600 text-white hover:bg-emerald-700"
                  disabled={settlementLimit <= 0 || settlementTooHigh}
                  onClick={handleSettlement}
                >
                  {t("customers.applySettlement")}
                </Button>
                <Button
                  className="w-full rounded-[18px]"
                  variant="secondary"
                  disabled={settlementLimit <= 0}
                  onClick={() => setSettlementAmount(String(settlementLimit))}
                >
                  {selectedSettlementBillIds.length > 0 ? t("customers.quickFillSelected") : t("customers.quickFillBalance")}
                </Button>

                {settlementTooHigh ? <p className="text-sm font-medium text-red-700">{t("customers.invalidSettlement")}</p> : null}
                {settlementError ? <p className="text-sm font-medium text-red-700">{settlementError}</p> : null}
                {settlementFeedback ? <p className="text-sm font-medium text-emerald-700">{settlementFeedback}</p> : null}
              </div>
            </aside>
          </div>
        </div>
      ) : (
        <div className="m-5 rounded-[22px] border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center text-sm leading-6 text-slate-600">
          {t("customers.formDesc")}
        </div>
      )}
    </Card>
  );

  const accountFlowStep = !selectedCustomer
    ? "customer"
    : selectedSettlementBillIds.length > 0
      ? "payment"
      : "receipt";

  const accountFlowPanel = (
    <div className="space-y-5">
      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-200 p-5">
          <SectionEyebrow>{t("customers.accountTitle")}</SectionEyebrow>
          <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
            {accountFlowStep === "customer"
              ? "Accounts"
              : accountFlowStep === "receipt"
                ? "Due receipts"
                : "Receive payment"}
          </h2>
        </div>

        {accountFlowStep === "customer" ? (
          <div className="p-5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                className="h-12 rounded-[18px] border-slate-200 bg-slate-50 pl-11 text-slate-950"
                placeholder={t("customers.searchPlaceholder")}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {paginatedAccountCustomers.length > 0 ? (
                paginatedAccountCustomers.map((customer) => {
                  const metrics = customerMetricsById[customer.id];

                  return (
                    <button
                      className="group rounded-[26px] border border-slate-200 bg-white p-5 text-left shadow-[0_18px_40px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-50/50"
                      key={customer.id}
                      onClick={() => openAccountCustomer(customer.id)}
                      type="button"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-base font-semibold text-slate-950">{customer.name}</p>
                          <p className="mt-1 truncate text-sm text-slate-600">
                            {customer.phone || customer.email || customer.whatsapp || t("common.notAvailable")}
                          </p>
                        </div>
                        <Badge variant="warning">
                          {metrics?.openBillCount ?? 0} due
                        </Badge>
                      </div>

                      <div className="mt-5 rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700">{t("customers.balanceDue")}</p>
                        <p className="mt-1 font-display text-2xl font-semibold tracking-[-0.04em] text-slate-950">
                          {formatCurrency(metrics?.outstandingBalance ?? 0, currentShop?.currency ?? "SAR", locale)}
                        </p>
                      </div>

                      <span className="mt-4 inline-flex text-sm font-semibold text-emerald-700 group-hover:text-emerald-800">
                        Open due receipts
                      </span>
                    </button>
                  );
                })
              ) : (
                <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center text-sm leading-6 text-slate-600 md:col-span-2 xl:col-span-3">
                  {search.trim() ? t("customers.emptyState") : t("customers.noOpenBills")}
                </div>
              )}
            </div>
            <PaginationBar
              page={safeAccountPage}
              pageCount={accountPageCount}
              total={accountCustomers.length}
              onPageChange={setAccountPage}
            />
          </div>
        ) : null}

        {accountFlowStep === "receipt" && selectedCustomer && selectedMetrics ? (
          <div className="p-5">
            <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-500">{selectedCustomer.name}</p>
                <h3 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-950">{t("customers.selectReceiptTitle")}</h3>
              </div>
              <Button
                variant="secondary"
                onClick={() => {
                  setSelectedCustomerId(null);
                  setReceiptSearch("");
                }}
              >
                Back to accounts
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr_220px]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  className="h-12 rounded-[18px] border-slate-200 bg-slate-50 pl-11 text-slate-950"
                  placeholder={t("customers.receiptSearchPlaceholder")}
                  value={receiptSearch}
                  onChange={(event) => setReceiptSearch(event.target.value)}
                />
              </div>
              <div className="rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700">{t("customers.balanceDue")}</p>
                <p className="text-lg font-semibold text-slate-950">
                  {formatCurrency(selectedMetrics.outstandingBalance, currentShop?.currency ?? "SAR", locale)}
                </p>
              </div>
            </div>

            <div className="mt-5 max-h-[58dvh] space-y-3 overflow-y-auto pr-1">
              {filteredOpenBills.length > 0 ? (
                filteredOpenBills.map((bill) => (
                  <div key={bill.id} className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_16px_36px_rgba(15,23,42,0.05)]">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <p className="text-lg font-semibold text-slate-950">{bill.number}</p>
                        <p className="mt-1 text-sm text-slate-600">{formatDateTime(bill.createdAt, locale)}</p>
                        <p className="mt-2 text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
                          {t("common.total")} {formatCurrency(bill.total, currentShop?.currency ?? "SAR", locale)} | {t("common.paidAmount")}{" "}
                          {formatCurrency(bill.paidAmount, currentShop?.currency ?? "SAR", locale)}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                        <Badge variant="warning">
                          {formatCurrency(bill.dueAmount, currentShop?.currency ?? "SAR", locale)}
                        </Badge>
                        <Button
                          onClick={() => {
                            setSelectedSettlementBillIds([bill.id]);
                            setSettlementAmount(String(bill.dueAmount));
                            setSettlementError(null);
                            setSettlementFeedback(null);
                          }}
                        >
                          {t("customers.receiveThisReceipt")}
                        </Button>
                        <Link className="inline-flex h-10 items-center rounded-[15px] border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50" href={`/bills/${bill.id}`}>
                          {t("bills.viewReceipt")}
                        </Link>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center text-sm leading-6 text-slate-600">
                  {receiptSearch.trim() ? t("customers.noReceiptSearchResults") : t("customers.noOpenBills")}
                </div>
              )}
            </div>
          </div>
        ) : null}

        {accountFlowStep === "payment" && selectedCustomer && selectedMetrics ? (
          <div className="p-5">
            <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-500">{selectedCustomer.name}</p>
                <h3 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-950">{t("customers.paymentDetails")}</h3>
              </div>
              <Button
                variant="secondary"
                onClick={() => {
                  setSelectedSettlementBillIds([]);
                  setSettlementAmount("");
                }}
              >
                Back to due receipts
              </Button>
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
              <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.05)]">
                <SectionEyebrow>{t("customers.appliedToBills")}</SectionEyebrow>
                <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-slate-950">
                  {t("customers.receiveAgainstSelection", { count: selectedSettlementBillIds.length })}
                </h3>
                <div className="mt-4 space-y-3">
                  {selectedSettlementBills.map((bill) => (
                    <div key={bill.id} className="rounded-[22px] border border-emerald-200 bg-emerald-50 px-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-950">{bill.number}</p>
                          <p className="mt-1 text-sm text-slate-600">{formatDateTime(bill.createdAt, locale)}</p>
                        </div>
                        <Badge variant="success">
                          {formatCurrency(bill.dueAmount, currentShop?.currency ?? "SAR", locale)}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <aside className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
                <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 px-4 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">{t("customers.selectedReceiptBalance")}</p>
                  <p className="mt-1 font-display text-3xl font-semibold tracking-[-0.04em] text-slate-950">
                    {formatCurrency(settlementLimit, currentShop?.currency ?? "SAR", locale)}
                  </p>
                </div>

                <div className="mt-4 space-y-3">
                  <Input
                    className="h-12 rounded-[18px] border-slate-200 bg-slate-50"
                    inputMode="decimal"
                    placeholder={t("common.amount")}
                    value={settlementAmount}
                    onChange={(event) => setSettlementAmount(event.target.value)}
                  />
                  <Select
                    value={settlementMethod}
                    onChange={(event) => setSettlementMethod(event.target.value as "cash" | "card")}
                  >
                    <option value="cash">{t("common.cash")}</option>
                    <option value="card">{t("common.card")}</option>
                  </Select>
                  <Textarea
                    className="min-h-[92px] rounded-[18px] border-slate-200 bg-slate-50"
                    placeholder={t("customers.settlementNote")}
                    value={settlementNote}
                    onChange={(event) => setSettlementNote(event.target.value)}
                  />
                  <Button
                    className="h-12 w-full rounded-[18px] bg-emerald-600 text-white hover:bg-emerald-700"
                    disabled={settlementLimit <= 0 || settlementTooHigh}
                    onClick={handleSettlement}
                  >
                    {t("customers.applySettlement")}
                  </Button>
                  <Button
                    className="w-full rounded-[18px]"
                    variant="secondary"
                    disabled={settlementLimit <= 0}
                    onClick={() => setSettlementAmount(String(settlementLimit))}
                  >
                    {t("customers.quickFillSelected")}
                  </Button>
                  {settlementTooHigh ? <p className="text-sm font-medium text-red-700">{t("customers.invalidSettlement")}</p> : null}
                  {settlementError ? <p className="text-sm font-medium text-red-700">{settlementError}</p> : null}
                  {settlementFeedback ? <p className="text-sm font-medium text-emerald-700">{settlementFeedback}</p> : null}
                </div>
              </aside>
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );

  const historyPanel = (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-slate-200 p-5">
        <div>
          <SectionEyebrow>{t("customers.paymentHistory")}</SectionEyebrow>
          <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-950">{t("customers.paymentHistory")}</h2>
        </div>
      </div>

      <div className="grid max-h-[calc(100dvh-15rem)] gap-3 overflow-y-auto p-5 md:grid-cols-2 xl:grid-cols-3">
        {paginatedSettlements.length > 0 ? (
          paginatedSettlements.map((payment) => {
            const customer = shopCustomers.find((entry) => entry.id === payment.customerId);

            return (
              <div key={payment.id} className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.04)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-slate-950">{customer?.name ?? t("common.notAvailable")}</p>
                    <p className="mt-1 text-sm font-medium text-slate-600">{payment.number}</p>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                      {formatDateTime(payment.createdAt, locale)} | {t(paymentMethodLabelKeys[payment.method])}
                    </p>
                  </div>
                  <Badge variant="success">
                    {formatCurrency(payment.amount, currentShop?.currency ?? "SAR", locale)}
                  </Badge>
                </div>
                {payment.allocations?.length ? (
                  <div className="mt-3 rounded-[16px] border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                    <p className="font-medium text-slate-950">{t("customers.appliedToBills")}</p>
                    <div className="mt-2 space-y-1">
                      {payment.allocations.map((allocation) => (
                        <div key={`${payment.id}-${allocation.billId}`} className="flex items-center justify-between gap-3">
                          <span>{allocation.billNumber}</span>
                          <span className="font-medium text-slate-950">
                            {formatCurrency(allocation.amount, currentShop?.currency ?? "SAR", locale)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {payment.note ? <p className="mt-3 text-sm leading-6 text-slate-600">{payment.note}</p> : null}
              </div>
            );
          })
        ) : (
          <div className="rounded-[20px] border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center text-sm leading-6 text-slate-600 md:col-span-2 xl:col-span-3">
            {t("customers.noPayments")}
          </div>
        )}
      </div>
      <PaginationBar
        page={safeSettlementPage}
        pageCount={settlementPageCount}
        total={allShopSettlements.length}
        onPageChange={setSettlementPage}
      />
    </Card>
  );

  const customerNavItems = [
    { href: "/customers?view=overview", active: activeView === "overview", icon: UserRound, label: t("customers.sectionsOverview") },
    { href: "/customers?view=directory", active: activeView === "directory", icon: UserRound, label: "Customer" },
    { href: "/customers?view=account", active: activeView === "account", icon: Wallet, label: t("customers.accountTitle") },
    { href: "/customers?view=history", active: activeView === "history", icon: ReceiptText, label: t("customers.paymentHistory") }
  ];

  return (
    <div className="space-y-5">
      <nav className="grid max-w-4xl grid-cols-2 gap-2 rounded-[24px] border border-slate-200 bg-white/88 p-2 shadow-[0_18px_45px_rgba(15,23,42,0.05)] backdrop-blur md:grid-cols-4">
        {customerNavItems.map((item) => {
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              className={`inline-flex h-12 items-center justify-center gap-2 rounded-[18px] px-4 text-sm font-semibold transition ${
                item.active
                  ? "bg-slate-950 text-white shadow-[0_14px_30px_rgba(15,23,42,0.16)]"
                  : "text-slate-600 hover:bg-emerald-50 hover:text-slate-950"
              }`}
              href={item.href}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {activeView === "overview" ? (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryMetricCard
            description={t("customers.totalCustomersDesc")}
            label={t("customers.totalCustomers")}
            value={shopCustomers.length}
          />
          <SummaryMetricCard
            description={t("customers.withBalanceDesc")}
            label={t("customers.withBalance")}
            value={totals.customersWithBalance}
          />
          <SummaryMetricCard
            description={t("customers.outstandingBalanceDesc")}
            label={t("customers.outstandingBalance")}
            value={formatCurrency(totals.outstandingBalance, currentShop?.currency ?? "SAR", locale)}
          />
          <SummaryMetricCard
            description={t("customers.settlementCountDesc")}
            label={t("customers.settlementCount")}
            value={totals.settlementCount}
          />
        </section>
      ) : activeView === "directory" ? (
        isCreating || selectedCustomer ? profilePanel : directoryPanel
      ) : activeView === "account" ? (
        accountFlowPanel
      ) : (
        historyPanel
      )}

      {isImportOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-3xl overflow-hidden p-0 shadow-[0_30px_80px_rgba(15,23,42,0.25)]">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
              <div>
                <SectionEyebrow>Customer import</SectionEyebrow>
                <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-950">Import customers safely</h2>
              </div>
              <Button className="h-10 w-10 rounded-full p-0" variant="secondary" onClick={() => setIsImportOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid gap-4 p-5 md:grid-cols-2">
              <button
                className="rounded-[26px] border border-slate-200 bg-white p-5 text-left shadow-[0_18px_40px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-emerald-50/50"
                type="button"
                onClick={downloadCustomerSchema}
              >
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                  <FileSpreadsheet className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-lg font-semibold text-slate-950">Download schema file</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Use this Excel-compatible CSV. Keep the headers unchanged so the POS accepts the import.
                </p>
              </button>

              <button
                className="rounded-[26px] border border-slate-200 bg-slate-950 p-5 text-left text-white shadow-[0_18px_40px_rgba(15,23,42,0.16)] transition hover:-translate-y-0.5 hover:bg-slate-900"
                type="button"
                onClick={() => customerImportRef.current?.click()}
              >
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-white">
                  <Upload className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-lg font-semibold">Choose customer file</h3>
                <p className="mt-2 text-sm leading-6 text-white/72">
                  Upload the completed schema. Existing customers with the same phone number are skipped.
                </p>
              </button>

              <Input
                ref={customerImportRef}
                accept=".csv,text/csv"
                className="hidden"
                type="file"
                onChange={(event) => void importCustomersCsv(event.target.files?.[0] ?? null)}
              />
            </div>

            <div className="border-t border-slate-200 bg-slate-50 px-5 py-4">
              <p className="text-sm leading-6 text-slate-600">
                Required: customer name or first/last name, country code, and phone number. If the number starts with 0, the POS removes the first zero after the country code. WhatsApp and email are optional.
              </p>
              {importResult ? (
                <div
                  className={`mt-4 rounded-[22px] border px-4 py-3 text-sm ${
                    importResult.status === "success"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-red-200 bg-red-50 text-red-800"
                  }`}
                >
                  <p className="font-semibold">{importResult.message}</p>
                  {importResult.duplicateRows.length > 0 ? (
                    <p className="mt-2 text-xs leading-5">
                      Duplicates skipped: {importResult.duplicateRows.join(", ")}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
