import { ReceiptText } from "lucide-react";

export default function PublicReceiptNotFound() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.13),_transparent_30%),linear-gradient(180deg,#f8fbf9_0%,#edf4f1_100%)] px-4 py-10">
      <section className="mx-auto flex min-h-[72vh] max-w-xl items-center justify-center">
        <div className="w-full rounded-[34px] border border-slate-200 bg-white p-8 text-center shadow-[0_24px_80px_rgba(15,23,42,0.09)]">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-950 text-white">
            <ReceiptText className="h-7 w-7" />
          </div>
          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.26em] text-emerald-700">Digital receipt</p>
          <h1 className="mt-3 font-display text-3xl font-semibold text-slate-950">Receipt not found</h1>
          <p className="mt-4 text-sm leading-7 text-slate-600">
            This receipt link is not available yet. If the bill was created just now, wait a moment and scan again.
          </p>
        </div>
      </section>
    </main>
  );
}
