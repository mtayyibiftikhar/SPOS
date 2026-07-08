export function PageHeader({
  title,
  subtitle,
  eyebrow
}: {
  title: string;
  subtitle: string;
  eyebrow?: string;
}) {
  return (
    <header className="border-b border-slate-200/80 pb-4">
      {eyebrow ? (
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">{eyebrow}</p>
      ) : null}
      <div className="mt-1 flex flex-col gap-1 lg:flex-row lg:items-end lg:justify-between">
        <h1 className="text-2xl font-semibold text-slate-950">{title}</h1>
        <p className="max-w-3xl text-sm leading-6 text-slate-600">{subtitle}</p>
      </div>
    </header>
  );
}
