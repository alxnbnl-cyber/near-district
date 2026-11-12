"use client";

import Link from "next/link";
import type { WorldRoute } from "@/world/types";
import { buttonClass } from "@/components/ui";
import { IconClose } from "./icons";

/** The selected expedition: approved chapter order, the viewer's real progress, and where to go next. */
export function ExpeditionCard({ route, onClose, onChapter }: { route: WorldRoute; onClose(): void; onChapter(spaceId: string): void }) {
  const done = route.chapters.filter((c) => c.completed).length;
  const next = route.chapters.find((c) => c.unlocked && !c.completed);
  return (
    <aside aria-label={`${route.title} expedition`} className="yv-enter flex max-h-full flex-col overflow-hidden rounded-[16px] border border-line bg-[#0e131bf2] shadow-pop backdrop-blur">
      <div className="flex items-start gap-3 px-4 pt-4">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky">Trail</p>
          <h2 className="truncate text-[18px] font-semibold">{route.title}</h2>
          {route.summary && <p className="mt-0.5 line-clamp-2 text-[13px] text-ink-2">{route.summary}</p>}
        </div>
        <button type="button" onClick={onClose} aria-label="Close expedition" className="grid size-8 shrink-0 place-items-center rounded-md text-ink-3 hover:bg-paper-2 hover:text-ink">
          <IconClose size={16} />
        </button>
      </div>
      <div className="px-4 pt-3">
        <div className="flex justify-between text-[12px] font-medium text-ink-3">
          <span>{route.completedAt ? "Trail complete" : `${done} of ${route.chapters.length} stops`}</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-paper-2">
          <div className="h-full rounded-full bg-orange transition-[width] duration-500" style={{ width: `${(done / Math.max(1, route.chapters.length)) * 100}%` }} />
        </div>
      </div>
      <ol className="mt-3 min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 pb-3">
        {route.chapters.map((c, i) => (
          <li key={c.campaignId}>
            <div className={`flex items-center gap-3 rounded-[12px] border px-3 py-2.5 ${c === next ? "border-orange/70 bg-[linear-gradient(100deg,rgb(255_145_56/0.22),rgb(255_145_56/0.04))]" : "border-line bg-[#121722]"}`}>
              <button type="button" onClick={() => onChapter(c.spaceId)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={`Show stop ${i + 1} on the map`}>
                <span
                  className={`grid size-8 shrink-0 place-items-center rounded-full font-display text-[13px] font-bold ${c.completed ? "bg-orange text-[#140c05]" : c.unlocked ? "border-2 border-sky text-sky" : "border border-line-strong text-ink-3"}`}
                >
                  {c.completed ? "✓" : i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-semibold">{c.title}</span>
                  <span className="block truncate text-[12px] text-ink-3">
                    {c.spaceName} · {c.completed ? "Completed" : c.unlocked ? "Open" : "Locked"}
                    {c.reward ? " · Prize stop" : ""}
                  </span>
                </span>
              </button>
              {c.unlocked && !c.completed && (
                <Link href={`/explore?m=${c.spaceSlug}%2F${c.campaignSlug}`} className={buttonClass(c === next ? "primary" : "dark", "sm")}>
                  Open
                </Link>
              )}
            </div>
          </li>
        ))}
      </ol>
      <div className="border-t border-line px-4 py-2.5 text-[12px]">
        <Link href={`/x/${route.slug}`} className="font-semibold text-orange-ink hover:underline">
          Trail details
        </Link>
      </div>
    </aside>
  );
}
