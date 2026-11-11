"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";

/** Plays the sign-in exit animation (sets data-closing on <main>) before navigating away. */
export function useCloseSignIn(href: string) {
  const router = useRouter();
  return useCallback(
    (e?: React.MouseEvent) => {
      e?.preventDefault();
      const main = document.querySelector<HTMLElement>("[data-signin]");
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!main || reduce) return router.push(href);
      main.dataset.closing = "1";
      router.prefetch(href);
      setTimeout(() => router.push(href), 260);
    },
    [href, router],
  );
}

export function CloseLink({ href, className, style, children, label }: { href: string; className?: string; style?: React.CSSProperties; children: React.ReactNode; label?: string }) {
  const close = useCloseSignIn(href);
  return (
    <a href={href} onClick={close} className={className} style={style} aria-label={label}>
      {children}
    </a>
  );
}
