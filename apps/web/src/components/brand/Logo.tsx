/**
 * Provisional wordmark: lowercase "yielvy" set in Outfit with the brand "discovery dot".
 * The dot is a separate element so it can hop on hover, mark notifications, or be
 * swapped for a mascot later. Replace this component to rebrand; nothing else references
 * the letterforms.
 */
export function Logo({ size = 26, tone = "ink" }: { size?: number; tone?: "ink" | "paper" }) {
  const color = tone === "ink" ? "var(--color-ink)" : "var(--color-paper)";
  return (
    <span
      className="yv-dot-hop inline-flex items-baseline font-display font-bold select-none"
      style={{ fontSize: size, lineHeight: 1, letterSpacing: "-0.04em", color }}
      aria-label="Yielvy"
    >
      <span aria-hidden>yielvy</span>
      <span
        aria-hidden
        className="yv-dot inline-block rounded-full"
        style={{
          width: size * 0.26,
          height: size * 0.26,
          marginLeft: size * 0.06,
          background: "var(--color-orange)",
          boxShadow: `inset 0 -${Math.max(1, size * 0.04)}px 0 rgb(0 0 0 / 0.12)`,
        }}
      />
    </span>
  );
}

/** Square mark for favicons/avatars: the dot inside a rounded tile. */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="9" fill="#22232B" />
      <text x="7" y="22" fontFamily="var(--font-outfit), sans-serif" fontWeight="700" fontSize="19" fill="#FFF9F0">
        y
      </text>
      <circle cx="22.5" cy="20" r="3.6" fill="#FF914D" />
    </svg>
  );
}
