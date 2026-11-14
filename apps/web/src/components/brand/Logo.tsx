/**
 * NEAR District brand. `Logo` is the emblem (public/assets/brand/near-district-mark.webp) with the
 * "NEAR District" wordmark set in the display font. `LogoMark` is a vector redraw of the emblem
 * (segmented ring, four-point star, up-right arrow) for small sizes where the raster would blur.
 */
export function Logo({ height = 30 }: { height?: number; size?: number }) {
  return (
    <span className="flex select-none items-center" style={{ gap: Math.round(height * 0.28) }} aria-label="NEAR District">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/assets/brand/near-district-mark.webp" alt="" height={height} width={height} style={{ height, width: height }} className="block" draggable={false} />
      <span className="whitespace-nowrap font-display font-bold leading-none tracking-[0.01em] text-white" style={{ fontSize: Math.round(height * 0.62) }}>
        NEAR District
      </span>
    </span>
  );
}

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <linearGradient id="yv-star" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFC44D" />
          <stop offset="1" stopColor="#FF6A00" />
        </linearGradient>
      </defs>
      <g fill="none" stroke="#C9D2E2" strokeWidth="5.5" strokeLinecap="round">
        <path d="M12 24a22 22 0 0 1 22-14" />
        <path d="M10 38a22 22 0 0 0 16 16" />
        <path d="M34 54a22 22 0 0 0 18-22" />
      </g>
      <path d="M26 18l4 10 10 4-10 4-4 10-4-10-10-4 10-4z" fill="url(#yv-star)" />
      <path d="M36 28 52 12" stroke="#FF9138" strokeWidth="5" strokeLinecap="round" />
      <path d="M43 10h11v11z" fill="#FF9138" />
    </svg>
  );
}
