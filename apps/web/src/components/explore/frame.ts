// Angled plate helpers shared by client and server components (no "use client").

/** Angled "military" plate used across the game HUD. */
export const plate = (cut = 10) => ({ clipPath: `polygon(0 0, calc(100% - ${cut}px) 0, 100% ${cut}px, 100% 100%, ${cut}px 100%, 0 calc(100% - ${cut}px))` });

type Corner = "tl" | "tr" | "br" | "bl";
const DIR: Record<Corner, [string, string]> = { tl: ["to bottom right", "left top"], tr: ["to bottom left", "right top"], br: ["to top left", "right bottom"], bl: ["to top right", "left bottom"] };

/**
 * Background layers that draw the outline along cut corners. clip-path slices the inset
 * box-shadow off the diagonals, so without these the frame has gaps at each cut.
 */
export function cutEdges(cut: number, color: string, width = 1, corners: Corner[] = ["tr", "bl"], extra?: string) {
  const w = width * 1.25; // a diagonal looks thinner than a straight edge
  const layers = corners.map((c) => `linear-gradient(${DIR[c][0]}, transparent calc(50% - .5px), ${color} calc(50% - .5px), ${color} calc(50% + ${w}px), transparent calc(50% + ${w}px))`);
  return {
    backgroundImage: [...layers, ...(extra ? [extra] : [])].join(", "),
    backgroundSize: [...corners.map(() => `${cut}px ${cut}px`), ...(extra ? ["100% 100%"] : [])].join(", "),
    backgroundPosition: [...corners.map((c) => DIR[c][1]), ...(extra ? ["0 0"] : [])].join(", "),
    backgroundRepeat: "no-repeat",
  };
}

/** Angled plate with a complete outline (straight edges and cut corners). */
export const frame = (cut: number, color: string, width = 1, extra?: { shadow?: string; bg?: string }) => ({
  ...plate(cut),
  boxShadow: `inset 0 0 0 ${width}px ${color}${extra?.shadow ? `, ${extra.shadow}` : ""}`,
  ...cutEdges(cut, color, width, ["tr", "bl"], extra?.bg),
});
