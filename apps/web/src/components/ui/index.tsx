import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "dark";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 font-semibold rounded-md transition-[background,box-shadow,transform,color] duration-150 active:translate-y-px disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap";
const variants: Record<Variant, string> = {
  primary: "bg-orange text-ink hover:bg-orange-deep hover:text-white shadow-[inset_0_-2px_0_rgb(0_0_0/0.12)]",
  secondary: "bg-card text-ink border border-line-strong hover:border-ink-3 hover:bg-paper",
  ghost: "text-ink-2 hover:text-ink hover:bg-paper-2",
  danger: "bg-danger text-white hover:brightness-95",
  dark: "bg-night text-paper hover:bg-night-2",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-[15px]",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra = "") {
  return `${base} ${variants[variant]} ${sizes[size]} ${extra}`;
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button {...props} className={buttonClass(variant, size, className)} />;
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link {...props} className={buttonClass(variant, size, className)} />;
}

type Tone = "neutral" | "orange" | "sky" | "mint" | "gold" | "violet" | "danger" | "dark";
const tones: Record<Tone, string> = {
  neutral: "bg-paper-2 text-ink-2",
  orange: "bg-orange-wash text-orange-ink",
  sky: "bg-sky-wash text-sky-ink",
  mint: "bg-mint-wash text-mint-ink",
  gold: "bg-gold-wash text-gold-ink",
  violet: "bg-violet-wash text-violet-ink",
  danger: "bg-danger-wash text-danger",
  dark: "bg-night text-paper",
};

export function Badge({ tone = "neutral", children, dot = false }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 h-6 px-2 rounded-full text-[11px] font-semibold uppercase tracking-[0.06em] ${tones[tone]}`}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

export function Card({ children, className = "", as: As = "div" }: { children: ReactNode; className?: string; as?: "div" | "section" | "article" }) {
  return <As className={`bg-card border border-line rounded-lg shadow-lift ${className}`}>{children}</As>;
}

export function Notice({ tone = "info", title, children }: { tone?: "info" | "warn" | "danger" | "ok"; title?: string; children: ReactNode }) {
  const cls = {
    info: "bg-sky-wash border-sky/50 text-sky-ink",
    warn: "bg-gold-wash border-gold text-gold-ink",
    danger: "bg-danger-wash border-danger/40 text-danger",
    ok: "bg-mint-wash border-mint text-mint-ink",
  }[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={`border rounded-md px-4 py-3 text-sm ${cls}`}>
      {title && <p className="font-semibold mb-0.5">{title}</p>}
      <div className="text-ink-2 [&_strong]:text-ink">{children}</div>
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  htmlFor: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[13px] font-semibold text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-[12.5px] text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[12.5px] text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
}

export const inputClass =
  "h-10 w-full rounded-md border border-line-strong bg-card px-3 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:border-orange-deep focus:ring-3 focus:ring-orange/25 disabled:bg-paper-2";
export const textareaClass = inputClass.replace("h-10", "min-h-28 py-2.5 leading-relaxed");

/**
 * A financial figure. `kind` makes provenance explicit so estimates are never mistaken
 * for settled balances.
 */
export function Figure({
  label,
  value,
  unit,
  kind = "onchain",
  help,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  kind?: "onchain" | "record" | "estimate" | "pending" | "unavailable";
  help?: string;
}) {
  const tag = {
    onchain: { text: "On-chain", cls: "text-mint-ink" },
    record: { text: "Recorded", cls: "text-ink-3" },
    estimate: { text: "Estimate", cls: "text-gold-ink" },
    pending: { text: "Pending", cls: "text-sky-ink" },
    unavailable: { text: "Unavailable", cls: "text-ink-3" },
  }[kind];
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <div className="flex items-center gap-2 text-[12px] text-ink-3">
        <span className="font-medium">{label}</span>
        <span className={`text-[10.5px] font-semibold uppercase tracking-wider ${tag.cls}`}>{tag.text}</span>
      </div>
      <div className="font-display text-[22px] font-semibold tabular text-ink truncate">
        {value}
        {unit && <span className="ml-1 text-sm font-medium text-ink-3">{unit}</span>}
      </div>
      {help && <p className="text-[12px] text-ink-3 leading-snug">{help}</p>}
    </div>
  );
}

export function EmptyState({ title, children, action, art }: { title: string; children?: ReactNode; action?: ReactNode; art?: ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center gap-3 py-12 px-6">
      {art}
      <h3 className="text-lg font-semibold">{title}</h3>
      {children && <p className="max-w-md text-sm text-ink-2">{children}</p>}
      {action}
    </div>
  );
}

export function SectionHeader({ title, eyebrow, action }: { title: string; eyebrow?: string; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-4">
      <div>
        {eyebrow && <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-orange-ink mb-1">{eyebrow}</p>}
        <h2 className="text-xl font-semibold">{title}</h2>
      </div>
      {action}
    </div>
  );
}
