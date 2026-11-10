"use client";

import { useEffect, useRef } from "react";
import { ARTWORK_LOTS, type Atlas } from "@yielvy/core/world";
import type { AtlasScene } from "@/world/atlas-scene";
import TRAFFIC from "@/world/traffic-paths.json";

/**
 * Makes the map feel alive without touching the map renderer: small cars driving the real roads of
 * the artwork (paths traced by scripts/map-traffic.cjs), slow cloud shadows drifting over the city
 * and a few flickering lights. A plain 2D canvas over the map, following the camera. Purely visual.
 */
export function AmbientLayer({ scene, atlas, right = 0 }: { scene: AtlasScene | null; atlas: Atlas; right?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    if (!scene || !el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;

    const W = atlas.width, H = atlas.height;
    // world-space polylines with cumulative lengths
    const roads = (TRAFFIC as number[][][]).map((p) => {
      const pts = p.map(([x, y]) => [x! * W, y! * H] as [number, number]);
      const acc = [0];
      for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
      return { pts, acc, len: acc[acc.length - 1]! };
    });
    const rand = (a: number, b: number) => a + Math.random() * (b - a);
    const cars = Array.from({ length: Math.min(90, roads.length * 3) }, (_, i) => {
      const r = roads[i % roads.length]!;
      return { r, d: Math.random() * r.len, v: rand(55, 120) * (Math.random() < 0.5 ? -1 : 1), warm: Math.random() < 0.7 };
    });
    const clouds = Array.from({ length: 7 }, () => ({ x: rand(-0.2, 1.1) * W, y: rand(0, 1) * H, r: rand(700, 1500), v: rand(18, 34), a: rand(0.1, 0.18) }));
    const lights = ARTWORK_LOTS.slice(0, 60).map(([x, y]) => ({ x: x! * W + rand(-90, 90), y: y! * H + rand(-90, 90), ph: Math.random() * 6.28, f: rand(0.6, 1.8) }));

    const at = (r: (typeof roads)[number], d: number): [number, number] => {
      let lo = 0, hi = r.acc.length - 1;
      while (hi - lo > 1) {
        const m = (lo + hi) >> 1;
        if (r.acc[m]! <= d) lo = m;
        else hi = m;
      }
      const seg = r.acc[hi]! - r.acc[lo]! || 1;
      const t = (d - r.acc[lo]!) / seg;
      const a = r.pts[lo]!, b = r.pts[hi]!;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    };

    let raf = 0, last = performance.now();
    let dpr = 1;
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      el.width = el.clientWidth * dpr;
      el.height = el.clientHeight * dpr;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const c = scene.camera();
      const vw = el.clientWidth, vh = el.clientHeight;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, vw, vh);
      const sx = (x: number) => x * c.s + c.tx, sy = (y: number) => y * c.s + c.ty;
      const inView = (x: number, y: number, m = 40) => x > -m && y > -m && x < vw + m && y < vh + m;

      // cloud shadows (dark) with a faint lit rim, drifting east
      for (const k of clouds) {
        k.x += k.v * dt;
        if (k.x - k.r > W) (k.x = -k.r), (k.y = rand(0, 1) * H);
        const x = sx(k.x), y = sy(k.y), r = k.r * c.s;
        if (!inView(x, y, r)) continue;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(0,0,0,${k.a})`);
        g.addColorStop(0.6, `rgba(0,0,0,${k.a * 0.55})`);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(x, y, r, r * 0.62, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // city lights: slow, soft flicker
      const t = now / 1000;
      for (const l of lights) {
        const x = sx(l.x), y = sy(l.y);
        if (!inView(x, y)) continue;
        const a = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(t * l.f + l.ph));
        const r = Math.max(2, 9 * c.s * 2.2);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(255,214,150,${a})`);
        g.addColorStop(1, "rgba(255,214,150,0)");
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }

      // cars: headlight dot with a short fading trail
      const size = Math.max(1.2, Math.min(3.2, 10 * c.s));
      for (const car of cars) {
        car.d += car.v * dt;
        if (car.d > car.r.len) car.d -= car.r.len;
        if (car.d < 0) car.d += car.r.len;
        const [wx, wy] = at(car.r, car.d);
        const x = sx(wx), y = sy(wy);
        if (!inView(x, y)) continue;
        const [bx, by] = at(car.r, Math.min(car.r.len, Math.max(0, car.d - Math.sign(car.v) * 70)));
        const tx = sx(bx), ty = sy(by);
        const col = car.warm ? "255,226,170" : "255,120,96";
        const grad = ctx.createLinearGradient(tx, ty, x, y);
        grad.addColorStop(0, `rgba(${col},0)`);
        grad.addColorStop(1, `rgba(${col},.55)`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = size;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.fillStyle = `rgba(${col},.95)`;
        ctx.beginPath();
        ctx.arc(x, y, size * 0.75, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [scene, atlas]);

  return <canvas ref={canvas} aria-hidden className="pointer-events-none absolute inset-y-0 left-0 h-full" style={{ right, width: `calc(100% - ${right}px)` }} />;
}
