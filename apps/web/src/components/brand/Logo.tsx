/**
 * NEAR District brand. A temporary text wordmark plus a vector mark (a district block grid
 * with one lit plot) until final logo art is supplied.
 */
export function Logo({ height = 30 }: { height?: number; size?: number }) {
  return (
    <span className="inline-flex select-none items-center gap-2" style={{ height }} aria-label="NEAR District">
      <LogoMark size={height} />
      <span aria-hidden className="font-display font-bold uppercase leading-none tracking-[0.14em] text-white" style={{ fontSize: Math.round(height * 0.55) }}>
        NEAR <span className="text-orange">District</span>
      </span>
    </span>
  );
}

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <linearGradient id="nd-lit" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFC44D" />
          <stop offset="1" stopColor="#FF6A00" />
        </linearGradient>
      </defs>
      <path d="M32 4 58 18v28L32 60 6 46V18z" fill="none" stroke="#C9D2E2" strokeWidth="4" strokeLinejoin="round" />
      <g fill="#C9D2E2" opacity=".55">
        <rect x="18" y="20" width="11" height="11" rx="1.5" />
        <rect x="18" y="34" width="11" height="11" rx="1.5" />
        <rect x="35" y="34" width="11" height="11" rx="1.5" />
      </g>
      <rect x="35" y="20" width="11" height="11" rx="1.5" fill="url(#nd-lit)" />
    </svg>
  );
}
