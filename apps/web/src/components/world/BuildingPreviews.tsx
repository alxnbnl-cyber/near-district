"use client";

import { useEffect, useState } from "react";

/** Renders each building style once with the real map art, as images (one shared offscreen renderer). */
let cache: Promise<Record<string, string>> | null = null;

async function renderAll(theme: "orange" | "violet" | "mint" | "sky"): Promise<Record<string, string>> {
  const { Application, Container, Graphics } = await import("pixi.js");
  const { buildingContext, BUILDING_STYLES } = await import("@/world/art");
  const app = new Application();
  await app.init({ width: 420, height: 420, backgroundAlpha: 0, antialias: true, preference: "webgl" });
  const out: Record<string, string> = {};
  for (const style of BUILDING_STYLES) {
    const c = new Container();
    const g = new Graphics(buildingContext(style, theme, 0));
    c.addChild(g);
    g.position.set(210, 300);
    out[style] = await app.renderer.extract.base64({ target: c, frame: undefined });
    c.destroy({ children: true });
  }
  app.destroy(true);
  return out;
}

export function useBuildingPreviews(theme: "orange" | "violet" | "mint" | "sky") {
  const [imgs, setImgs] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    let alive = true;
    cache = renderAll(theme);
    cache.then((r) => alive && setImgs(r)).catch(() => alive && setImgs({}));
    return () => {
      alive = false;
    };
  }, [theme]);
  return imgs;
}
