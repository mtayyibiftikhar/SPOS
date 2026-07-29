"use client";

import { useEffect, useState } from "react";
import { ExternalLink, MonitorCog, Printer, ReceiptText, RefreshCw } from "lucide-react";
import { usePosApp } from "@/components/providers/app-provider";
import { SettingsFormShell } from "@/components/settings/settings-form-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import {
  getInstalledPrinters,
  hasNativePrinterSupport,
  printElementWithNative,
  type NativePrinter
} from "@/lib/native-bridge";

const WINDOWS_APP_RELEASE_URL = "https://github.com/mtayyibiftikhar/SPOS/releases/latest";

export default function PrinterSettingsPage() {
  const { currentSettings, t, updateSettings } = usePosApp();
  const [receiptSize, setReceiptSize] = useState(currentSettings?.printer.receiptSize ?? "80mm");
  const [autoPrintAfterSale, setAutoPrintAfterSale] = useState(
    currentSettings?.printer.autoPrintAfterSale ?? false
  );
  const [printerDeviceName, setPrinterDeviceName] = useState(
    currentSettings?.printer.printerDeviceName ?? ""
  );
  const [printerDisplayName, setPrinterDisplayName] = useState(
    currentSettings?.printer.printerDisplayName ?? ""
  );
  const [nativePrinterSupport, setNativePrinterSupport] = useState(false);
  const [printers, setPrinters] = useState<NativePrinter[]>([]);
  const [printersLoading, setPrintersLoading] = useState(false);
  const [printerError, setPrinterError] = useState("");
  const [testFeedback, setTestFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [testPrinting, setTestPrinting] = useState(false);

  async function loadPrinters() {
    setPrintersLoading(true);
    setPrinterError("");

    try {
      const installedPrinters = await getInstalledPrinters();
      setPrinters(installedPrinters);

      if (installedPrinters.length === 0) {
        setPrinterError("No installed Windows printers were found.");
      }
    } catch {
      setPrinterError("Unable to read installed Windows printers.");
    } finally {
      setPrintersLoading(false);
    }
  }

  useEffect(() => {
    const isNative = hasNativePrinterSupport();
    setNativePrinterSupport(isNative);

    if (isNative) {
      void loadPrinters();
    }
  }, []);

  async function testSelectedPrinter() {
    setTestPrinting(true);
    setTestFeedback(null);

    try {
      const printed = await printElementWithNative("#printer-test-receipt", "SPOS printer test", {
        deviceName: printerDeviceName || undefined,
        receiptSize,
        silent: true
      });

      setTestFeedback({
        ok: printed,
        message: printed
          ? `Test receipt sent to ${printerDisplayName || "the Windows default printer"}.`
          : "The selected printer did not accept the test receipt. Refresh the printer list and try again."
      });
    } catch {
      setTestFeedback({ ok: false, message: "Unable to send the test receipt to this printer." });
    } finally {
      setTestPrinting(false);
    }
  }

  if (!currentSettings) {
    return null;
  }

  return (
    <SettingsFormShell
      title={t("settings.printer")}
      subtitle={t("settings.printerPageSubtitle")}
    >
      <form
        className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]"
        onSubmit={(event) => {
          event.preventDefault();
          updateSettings("printer", {
            autoPrintAfterSale,
            printerDeviceName: printerDeviceName || undefined,
            printerDisplayName: printerDisplayName || undefined,
            receiptSize
          });
        }}
      >
        <Card className="space-y-5 p-5">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
            <Printer className="h-6 w-6" />
          </span>
          <div>
            <label className="mb-2 block text-sm font-medium text-ink">{t("common.receiptSize")}</label>
            <Select value={receiptSize} onChange={(event) => setReceiptSize(event.target.value as "58mm" | "80mm" | "a4")}>
              <option value="58mm">58mm thermal</option>
              <option value="80mm">80mm thermal</option>
              <option value="a4">A4 invoice</option>
            </Select>
          </div>
          <div className="rounded-3xl border border-line bg-shell p-4">
            <label className="flex items-center gap-3 text-sm font-medium text-ink">
              <input
                checked={autoPrintAfterSale}
                className="h-4 w-4"
                onChange={(event) => setAutoPrintAfterSale(event.target.checked)}
                type="checkbox"
              />
              {t("common.autoPrintAfterSale")}
            </label>
          </div>
          <div className="space-y-3 rounded-3xl border border-line bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-slate-950 text-white">
                  <MonitorCog className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-semibold text-ink">Windows printer</p>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    {nativePrinterSupport
                      ? "Choose the printer used for automatic receipts."
                      : "Printer selection is available in the SPOS Windows app."}
                  </p>
                </div>
              </div>
              {nativePrinterSupport ? (
                <button
                  aria-label="Refresh installed printers"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line text-slate-600 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-50"
                  disabled={printersLoading}
                  onClick={() => void loadPrinters()}
                  type="button"
                >
                  <RefreshCw className={`h-4 w-4 ${printersLoading ? "animate-spin" : ""}`} />
                </button>
              ) : null}
            </div>
            <Select
              disabled={!nativePrinterSupport || printersLoading}
              value={printerDeviceName}
              onChange={(event) => {
                const nextDeviceName = event.target.value;
                const selectedPrinter = printers.find(
                  (printer) => printer.name === nextDeviceName
                );
                setPrinterDeviceName(nextDeviceName);
                setPrinterDisplayName(
                  selectedPrinter?.displayName || selectedPrinter?.name || ""
                );
              }}
            >
              <option value="">
                {nativePrinterSupport ? "Windows default printer" : "Use system print dialog"}
              </option>
              {printerDeviceName && !printers.some((printer) => printer.name === printerDeviceName) ? (
                <option value={printerDeviceName}>
                  {printerDisplayName || printerDeviceName} (not currently available)
                </option>
              ) : null}
              {printers.map((printer) => (
                <option key={printer.name} value={printer.name}>
                  {printer.displayName || printer.name}
                  {printer.isDefault ? " (Default)" : ""}
                </option>
              ))}
            </Select>
            {printerError ? (
              <p className="text-sm font-medium text-amber-700">{printerError}</p>
            ) : (
              <p className="text-xs leading-5 text-slate-500">
                {nativePrinterSupport
                  ? "With auto print enabled, completed sales print silently to this printer. Manual Print still opens the Windows print dialog."
                  : "Browsers cannot securely list or silently control installed printers. Browser printing will continue through the system print dialog."}
              </p>
            )}
            {nativePrinterSupport ? (
              <Button
                disabled={printersLoading || testPrinting}
                onClick={() => void testSelectedPrinter()}
                type="button"
                variant="secondary"
              >
                <Printer className="mr-2 h-4 w-4" />
                {testPrinting ? "Sending test..." : "Test selected printer"}
              </Button>
            ) : (
              <a
                className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
                href={WINDOWS_APP_RELEASE_URL}
                rel="noreferrer"
                target="_blank"
              >
                Download SPOS Windows app
                <ExternalLink className="ml-2 h-4 w-4" />
              </a>
            )}
            {testFeedback ? (
              <p className={testFeedback.ok ? "text-sm font-medium text-emerald-700" : "text-sm font-medium text-rose-700"}>
                {testFeedback.message}
              </p>
            ) : null}
          </div>
          <Button type="submit">{t("common.saveChanges")}</Button>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-950 text-white">
              <ReceiptText className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Print preview</p>
              <h2 className="font-display text-2xl font-semibold text-ink">
                {receiptSize === "a4" ? "A4 invoice layout" : `${receiptSize} receipt layout`}
              </h2>
            </div>
          </div>
          <div id="printer-test-receipt" className="mt-5 rounded-[28px] border border-line bg-white p-5">
            {receiptSize === "a4" ? (
              <div className="space-y-4">
                <div className="flex items-start justify-between border-b border-line pb-4">
                  <div>
                    <p className="text-lg font-bold text-ink">Shop name</p>
                    <p className="mt-1 text-sm text-slate-500">Address, VAT, phone, and receipt details</p>
                  </div>
                  <div className="h-16 w-16 rounded-2xl bg-shell" />
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl bg-shell p-3 text-sm">Customer</div>
                  <div className="rounded-2xl bg-shell p-3 text-sm">Payment</div>
                  <div className="rounded-2xl bg-shell p-3 text-sm">Tax summary</div>
                </div>
                <div className="rounded-2xl border border-line p-4 text-sm text-slate-600">
                  Wide item table with product, quantity, price, discount, VAT, and total.
                </div>
              </div>
            ) : (
              <div className="mx-auto max-w-[230px] rounded-2xl border border-line p-4 text-center text-sm text-slate-600">
                Thermal layout stays compact for quick counter receipts.
              </div>
            )}
          </div>
        </Card>
      </form>
    </SettingsFormShell>
  );
}
