/**
 * Yielvy illustration set — flat, gradient-lit, navy outlines, brand palette only
 * (orange #FF9138, gold #FFC24B, cyan #32C8EF, violet for creative). Pure SVG, so it scales and
 * themes cleanly. Replace with commissioned art later (prompts in docs/assets/illustration-prompts.md).
 */
import { useId } from "react";

type P = { size?: number; className?: string };
const OUT = "#0b0f15";

function useIds(n: number) {
  const base = useId().replace(/:/g, "");
  return Array.from({ length: n }, (_, i) => `${base}${i}`);
}

export function TreasureChest({ size = 160, className = "" }: P) {
  const [g1, g2, g3, glow] = useIds(4);
  return (
    <svg width={size} height={size} viewBox="0 0 160 160" className={className} aria-hidden>
      <defs>
        <radialGradient id={glow} cx="50%" cy="45%" r="50%">
          <stop offset="0" stopColor="#FFC24B" stopOpacity=".55" />
          <stop offset="1" stopColor="#FFC24B" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={g1} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FF9F4F" />
          <stop offset="1" stopColor="#D9611A" />
        </linearGradient>
        <linearGradient id={g2} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFE08A" />
          <stop offset="1" stopColor="#F5A524" />
        </linearGradient>
        <linearGradient id={g3} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#B4521A" />
          <stop offset="1" stopColor="#7A3410" />
        </linearGradient>
      </defs>
      <circle cx="80" cy="70" r="70" fill={`url(#${glow})`} />
      {/* lid (open) */}
      <path d="M34 66 L44 30 Q80 18 116 30 L126 66 Z" fill={`url(#${g3})`} stroke={OUT} strokeWidth="3" strokeLinejoin="round" />
      <path d="M44 30 Q80 18 116 30" fill="none" stroke={`url(#${g2})`} strokeWidth="6" />
      {/* coins spilling */}
      <ellipse cx="80" cy="66" rx="44" ry="10" fill="#FFD56B" stroke={OUT} strokeWidth="3" />
      {[58, 72, 88, 100, 66, 94].map((x, i) => (
        <circle key={i} cx={x} cy={58 - (i % 3) * 6} r="7" fill={`url(#${g2})`} stroke={OUT} strokeWidth="2.5" />
      ))}
      <path d="M78 34 l3 7 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" fill="#fff" opacity=".9" />
      {/* body */}
      <rect x="30" y="66" width="100" height="58" rx="8" fill={`url(#${g1})`} stroke={OUT} strokeWidth="3" />
      <rect x="30" y="84" width="100" height="10" fill={`url(#${g2})`} stroke={OUT} strokeWidth="3" />
      <rect x="70" y="80" width="20" height="24" rx="4" fill="#FFE08A" stroke={OUT} strokeWidth="3" />
      <circle cx="80" cy="91" r="3.5" fill={OUT} />
      <ellipse cx="80" cy="134" rx="56" ry="6" fill="#000" opacity=".35" />
    </svg>
  );
}

export function TreasureMap({ size = 160, className = "" }: P) {
  const [g1] = useIds(1);
  return (
    <svg width={size} height={size} viewBox="0 0 160 160" className={className} aria-hidden>
      <defs>
        <linearGradient id={g1} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1f2a3b" />
          <stop offset="1" stopColor="#141b27" />
        </linearGradient>
      </defs>
      <path d="M18 34 L58 22 L102 34 L142 22 L142 126 L102 138 L58 126 L18 138 Z" fill={`url(#${g1})`} stroke="#3a4a63" strokeWidth="3" strokeLinejoin="round" />
      <path d="M58 22 V126 M102 34 V138" stroke="#2c3a50" strokeWidth="2" />
      <path d="M30 60 q20 -14 36 4 t40 8 t26 22" fill="none" stroke="#32C8EF" strokeWidth="2.4" opacity=".35" />
      <path className="yv-dash" d="M34 116 C50 96 44 78 66 74 S96 92 106 70 S118 46 124 44" fill="none" stroke="#FF9138" strokeWidth="3.5" strokeLinecap="round" strokeDasharray="7 8" />
      <circle cx="34" cy="116" r="6" fill="#32C8EF" stroke={OUT} strokeWidth="2.5" />
      <g transform="translate(124 44)">
        <circle r="13" fill="#FFC24B" opacity=".2" />
        <path d="M-7 -7 L7 7 M7 -7 L-7 7" stroke="#FFC24B" strokeWidth="4.5" strokeLinecap="round" />
      </g>
      <g transform="translate(40 44)" opacity=".8">
        <circle r="9" fill="none" stroke="#9aa6b5" strokeWidth="2" />
        <path d="M0 -6 L2 0 L0 6 L-2 0 Z" fill="#FF9138" />
      </g>
    </svg>
  );
}

export function VaultDoor({ size = 160, className = "" }: P) {
  const [g1, g2] = useIds(2);
  return (
    <svg width={size} height={size} viewBox="0 0 160 160" className={className} aria-hidden>
      <defs>
        <linearGradient id={g1} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2a3446" />
          <stop offset="1" stopColor="#151b26" />
        </linearGradient>
        <linearGradient id={g2} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFE08A" />
          <stop offset="1" stopColor="#F5A524" />
        </linearGradient>
      </defs>
      <rect x="18" y="18" width="124" height="124" rx="22" fill="#10151e" stroke="#2f3a4d" strokeWidth="3" />
      <circle cx="80" cy="80" r="50" fill={`url(#${g1})`} stroke={OUT} strokeWidth="3" />
      <circle cx="80" cy="80" r="50" fill="none" stroke="#FF9138" strokeWidth="3" strokeDasharray="4 10" opacity=".7" className="yv-spin-slow" style={{ transformOrigin: "80px 80px" }} />
      <circle cx="80" cy="80" r="22" fill={`url(#${g2})`} stroke={OUT} strokeWidth="3" />
      {[0, 60, 120, 180, 240, 300].map((a) => (
        <rect key={a} x="78" y="40" width="4" height="16" rx="2" fill="#FFC24B" transform={`rotate(${a} 80 80)`} />
      ))}
      <circle cx="80" cy="80" r="6" fill={OUT} />
      <rect x="132" y="66" width="8" height="28" rx="3" fill="#3a465a" />
    </svg>
  );
}

export function CoinStack({ size = 120, className = "" }: P) {
  const [g] = useIds(1);
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" className={className} aria-hidden>
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFE08A" />
          <stop offset="1" stopColor="#F5A524" />
        </linearGradient>
      </defs>
      {[0, 1, 2, 3].map((i) => (
        <g key={i} transform={`translate(0 ${-i * 12})`}>
          <ellipse cx="50" cy="96" rx="30" ry="9" fill="#D98A12" stroke={OUT} strokeWidth="2.5" />
          <rect x="20" y="88" width="60" height="8" fill="#D98A12" />
          <ellipse cx="50" cy="88" rx="30" ry="9" fill={`url(#${g})`} stroke={OUT} strokeWidth="2.5" />
        </g>
      ))}
      <g transform="translate(88 52)" className="yv-float">
        <circle r="16" fill={`url(#${g})`} stroke={OUT} strokeWidth="2.5" />
        <path d="M-5 -6 h8 a4 4 0 0 1 0 8 h-6 a4 4 0 0 0 0 8 h8 M0 -10 v20" fill="none" stroke="#9a5a08" strokeWidth="2.5" strokeLinecap="round" />
      </g>
    </svg>
  );
}

export function CompassArt({ size = 120, className = "" }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" className={className} aria-hidden>
      <circle cx="60" cy="60" r="46" fill="#121924" stroke="#2f3a4d" strokeWidth="3" />
      <circle cx="60" cy="60" r="38" fill="none" stroke="#32C8EF" strokeWidth="1.5" strokeDasharray="2 6" />
      <g className="yv-spin-slow" style={{ transformOrigin: "60px 60px", animationDuration: "40s" }}>
        <path d="M60 22 L68 60 L60 98 L52 60 Z" fill="#FF9138" stroke={OUT} strokeWidth="2.5" />
        <path d="M60 60 L68 60 L60 98 L52 60 Z" fill="#9aa6b5" />
      </g>
      <circle cx="60" cy="60" r="6" fill="#FFC24B" stroke={OUT} strokeWidth="2.5" />
    </svg>
  );
}

export function Hourglass({ size = 96, className = "" }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" className={className} aria-hidden>
      <rect x="22" y="12" width="52" height="8" rx="3" fill="#FF9138" stroke={OUT} strokeWidth="2.5" />
      <rect x="22" y="76" width="52" height="8" rx="3" fill="#FF9138" stroke={OUT} strokeWidth="2.5" />
      <path d="M28 20 C28 40 46 42 48 48 C50 54 68 56 68 76 L28 76 C28 56 46 54 48 48 C50 42 68 40 68 20 Z" fill="#162030" stroke="#3a4a63" strokeWidth="2.5" />
      <path d="M34 28 C38 38 46 40 48 46 C50 40 58 38 62 28 Z" fill="#FFC24B" />
      <path d="M36 72 C40 62 46 60 48 56 C50 60 56 62 60 72 Z" fill="#FFC24B" opacity=".75" />
    </svg>
  );
}

export function RocketFlag({ size = 96, className = "" }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" className={className} aria-hidden>
      <rect x="26" y="14" width="4" height="70" rx="2" fill="#9aa6b5" />
      <path d="M30 16 L72 16 L62 30 L72 44 L30 44 Z" fill="#FF9138" stroke={OUT} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M44 24 l2.5 5 5.5 .8 -4 3.9 1 5.5 -5 -2.6 -5 2.6 1 -5.5 -4 -3.9 5.5 -.8z" fill="#FFE08A" />
      <ellipse cx="28" cy="86" rx="20" ry="4" fill="#000" opacity=".35" />
    </svg>
  );
}

export function LinkedVaults({ size = 140, className = "" }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 140 140" className={className} aria-hidden>
      <path className="yv-dash" d="M36 96 C52 60 88 84 104 44" fill="none" stroke="#32C8EF" strokeWidth="3.5" strokeDasharray="7 8" strokeLinecap="round" />
      {[
        [36, 96, "#FF9138"],
        [104, 44, "#FFC24B"],
      ].map(([x, y, c], i) => (
        <g key={i} transform={`translate(${x} ${y})`}>
          <circle r="22" fill="#121924" stroke="#2f3a4d" strokeWidth="3" />
          <circle r="12" fill={c as string} stroke={OUT} strokeWidth="2.5" />
          <circle r="3.5" fill={OUT} />
        </g>
      ))}
      <circle cx="70" cy="70" r="7" fill="#32C8EF" stroke={OUT} strokeWidth="2.5" />
    </svg>
  );
}

export function Lightbulb({ size = 120, className = "" }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" className={className} aria-hidden>
      <circle cx="60" cy="50" r="40" fill="#9B87F5" opacity=".14" />
      <path d="M60 18 a30 30 0 0 1 18 54 c-4 3 -6 7 -6 12 H48 c0 -5 -2 -9 -6 -12 A30 30 0 0 1 60 18 Z" fill="#c4b8ff" stroke={OUT} strokeWidth="3" />
      <rect x="47" y="86" width="26" height="8" rx="3" fill="#9aa6b5" stroke={OUT} strokeWidth="2.5" />
      <rect x="50" y="96" width="20" height="7" rx="3" fill="#66727f" stroke={OUT} strokeWidth="2.5" />
      <path d="M52 62 l8 -14 8 14" fill="none" stroke="#7A5CF0" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {[[22, 30], [98, 30], [16, 62], [104, 62]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3" fill="#FFC24B" className="yv-float" style={{ animationDelay: `${i * 0.4}s` }} />
      ))}
    </svg>
  );
}

export function KeyArt({ size = 64, className = "" }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden>
      <circle cx="22" cy="24" r="12" fill="#FFC24B" stroke={OUT} strokeWidth="3" />
      <circle cx="22" cy="24" r="4.5" fill={OUT} />
      <path d="M31 31 L52 52 M44 44 l5 -5 M48 48 l5 -5" stroke="#FFC24B" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}
