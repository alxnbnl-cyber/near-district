/** Page header used across the host console (same type as Overview / How it works). */
export function HostHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <section className="mb-6 font-mono">
      <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-orange">{eyebrow}</p>
      <h1 className="mt-1 font-display text-[32px] font-bold uppercase leading-tight tracking-[0.02em] text-white">{title}</h1>
    </section>
  );
}

/** Section label inside a host page. */
export function HostSection({ title }: { title: string }) {
  return <h2 className="mb-3 font-mono text-[11px] font-bold uppercase tracking-[0.26em] text-[rgb(214_219_225/.6)]">{title}</h2>;
}
