"use client";

import { usePosApp } from "@/components/providers/app-provider";

export function BrandedLoadingScreen({ message }: { message?: string }) {
  const { state } = usePosApp();
  const title = state.brand.loadingTitle || `Loading ${state.brand.posName}`;
  const body = message || state.brand.loadingMessage || "Preparing your workspace...";

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.16),_transparent_34%),radial-gradient(circle_at_bottom_right,_rgba(245,158,11,0.14),_transparent_36%),linear-gradient(180deg,#f8fbf9_0%,#eef5f1_100%)] p-6">
      <div className="w-full max-w-md rounded-[32px] border border-white/80 bg-white/92 p-7 text-center shadow-[0_30px_90px_rgba(15,23,42,0.12)] backdrop-blur">
        <div className="mx-auto flex h-20 w-20 items-center justify-center overflow-hidden rounded-[28px] bg-slate-950 text-white shadow-[0_20px_44px_rgba(15,23,42,0.18)]">
          {state.brand.logoUrl ? (
            <img alt={state.brand.companyName} className="h-full w-full object-cover" src={state.brand.logoUrl} />
          ) : (
            <span className="font-display text-2xl font-semibold tracking-[0.18em]">
              {state.brand.posName
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((part) => part.charAt(0).toUpperCase())
                .join("") || "POS"}
            </span>
          )}
        </div>

        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">
          {state.brand.companyName}
        </p>
        <h1 className="mt-3 font-display text-3xl font-semibold text-slate-950">{title}</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-slate-600">{body}</p>

        <div className="mx-auto mt-7 flex w-40 items-center justify-center gap-2">
          <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-emerald-500 [animation-delay:-0.2s]" />
          <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-amber-400 [animation-delay:-0.1s]" />
          <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-slate-950" />
        </div>
      </div>
    </div>
  );
}
