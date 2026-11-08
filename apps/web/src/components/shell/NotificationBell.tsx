"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { IconBell } from "@/components/explore/icons";

interface Note {
  id: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      const r = await api<{ items: Note[]; unread: number }>("/api/notifications");
      setNotes(r.items);
      setUnread(r.unread);
    } catch {
      setNotes([]);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        onClick={async () => {
          const next = !open;
          setOpen(next);
          if (next && unread) {
            await api("/api/notifications", { method: "POST" }).catch(() => {});
            setUnread(0);
          }
        }}
        className="relative grid size-9 place-items-center rounded-full text-ink-2 hover:bg-paper-2 hover:text-ink"
      >
        <IconBell />
        {unread > 0 && <span aria-hidden className="absolute right-1.5 top-1.5 size-2 rounded-full bg-orange ring-2 ring-paper" />}
      </button>
      {open && (
        <div className="yv-enter absolute right-0 top-11 w-80 rounded-[14px] border border-line bg-card p-2 shadow-pop">
          <p className="px-2 pb-2 pt-1 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-ink-3">Notifications</p>
          {!notes ? (
            <p className="px-2 py-4 text-sm text-ink-3">Loading…</p>
          ) : notes.length === 0 ? (
            <p className="px-2 py-4 text-sm text-ink-3">You&apos;re all caught up.</p>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {notes.map((n) => {
                const body = (
                  <>
                    <p className="text-[13.5px] font-semibold">{n.title}</p>
                    <p className="text-[12.5px] text-ink-2">{n.body}</p>
                    <p className="mt-0.5 text-[11px] text-ink-3">{new Date(n.createdAt).toLocaleString()}</p>
                  </>
                );
                return (
                  <li key={n.id}>
                    {n.link ? (
                      <Link href={n.link} onClick={() => setOpen(false)} className="block rounded-md px-2 py-2 hover:bg-paper-2">
                        {body}
                      </Link>
                    ) : (
                      <div className="px-2 py-2">{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
