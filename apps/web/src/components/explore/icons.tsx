/** Small inline icon set (stroke icons, 24px grid). Original drawings; no icon font dependency. */
type P = { size?: number; className?: string };
const base = (size: number) => ({ width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true });

export const IconCube = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}><path d="M12 3 4 7.5v9L12 21l8-4.5v-9L12 3Z" /><path d="M4 7.5 12 12l8-4.5M12 12v9" /></svg>
);
export const IconFlag = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}><path d="M5 21V4" /><path d="M5 4h11l-2 4 2 4H5" fill="currentColor" fillOpacity=".25" /></svg>
);
export const IconStar = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" fill="currentColor" fillOpacity=".25" /></svg>
);
export const IconClock = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
);
export const IconSearch = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></svg>
);
export const IconCompass = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}><circle cx="12" cy="12" r="8.5" /><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" fill="currentColor" fillOpacity=".25" /></svg>
);
export const IconSparkle = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.5 2.5M15.2 15.2l2.5 2.5M6.3 17.7l2.5-2.5M15.2 8.8l2.5-2.5" /></svg>
);
export const IconMap = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}><path d="m9 4-5 2v14l5-2 6 2 5-2V4l-5 2-6-2Z" /><path d="M9 4v14M15 6v14" /></svg>
);
export const IconPlus = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}><path d="M12 5v14M5 12h14" /></svg>
);
export const IconMinus = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}><path d="M5 12h14" /></svg>
);
export const IconLocate = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}><path d="M20.5 3.5 3.5 10.5l7 2.6 2.6 7 7.4-16.6Z" /></svg>
);
export const IconBell = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></svg>
);
export const IconChevron = ({ size = 18, className, dir = "right" }: P & { dir?: "right" | "left" | "down" | "up" }) => (
  <svg {...base(size)} className={className} style={{ transform: { right: "", left: "rotate(180deg)", down: "rotate(90deg)", up: "rotate(-90deg)" }[dir] }}><path d="m9 6 6 6-6 6" /></svg>
);
export const IconClose = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}><path d="M6 6l12 12M18 6 6 18" /></svg>
);
export const IconPanel = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="M9 4.5v15" /></svg>
);
export const IconInfo = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8h.01" /></svg>
);
export const IconList = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" /></svg>
);
