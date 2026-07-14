"use client";

import { Printer } from "lucide-react";

export function PublicReceiptActions() {
  return (
    <button
      className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_45px_rgba(15,23,42,0.18)] transition hover:bg-slate-800 print:hidden"
      onClick={() => window.print()}
      type="button"
    >
      <Printer className="h-4 w-4" />
      Print / save PDF
    </button>
  );
}
