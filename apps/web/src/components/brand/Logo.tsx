/**
 * Provisional Yielvy mark + wordmark. The mark is two converging paths meeting at a point —
 * "routes leading to a discovery". Replace this file to rebrand; nothing else draws the logo.
 */
export function LogoMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <path d="M4 5h7.2l4.8 8.6L20.8 5H28L19.4 19.2V27h-6.8v-7.8z" fill="#FF9138" />
      <path d="M12.6 19.2 4 5h7.2l4.8 8.6z" fill="#FFB37A" />
      <circle cx="26" cy="25" r="3" fill="#32C8EF" />
    </svg>
  );
}

export function Logo({ size = 22 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2 select-none" aria-label="Yielvy">
      <LogoMark size={size + 6} />
      <span aria-hidden className="font-display font-bold text-ink" style={{ fontSize: size, letterSpacing: "-0.03em", lineHeight: 1 }}>
        Yielvy
      </span>
    </span>
  );
}
