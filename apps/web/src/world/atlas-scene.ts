/**
 * Dark 2D city renderer (PixiJS v8). Responsibilities are deliberately narrow:
 *   - draw the static city (one cached Graphics geometry, or a supplied artwork sprite)
 *   - own the camera (pan / wheel / pinch / keyboard / fly-to) with bounds
 *   - draw route overlays
 *   - publish the camera so the HTML marker layer can follow without React re-renders
 * Project data, markers, selection and search live in React components.
 */
import { Application, Assets, Container, Graphics, Sprite, type FederatedPointerEvent } from "pixi.js";
import type { Atlas, Pt } from "@yielvy/core/world";
import { MAP_THEME } from "./theme";

export interface Camera {
  tx: number;
  ty: number;
  s: number;
}

export interface SceneOptions {
  reducedMotion: boolean;
  lowPower: boolean;
  interactive: boolean;
}

export interface RouteDraw {
  id: string;
  points: Pt[]; // world units
  completedSegments: number;
}

const ZOOM_MIN_FACTOR = 1; // relative to "fit" zoom
const ZOOM_MAX = 2.4;

export class AtlasScene {
  private app!: Application;
  private world = new Container();
  private routeLayer = new Graphics();
  private listeners = new Set<(c: Camera) => void>();
  private tween: { from: Camera; to: Camera; t: number; dur: number } | null = null;
  private drift = 0;
  private pointers = new Map<number, { x: number; y: number }>();
  private drag: { x: number; y: number; wx: number; wy: number } | null = null;
  private pinch: { dist: number; s: number } | null = null;
  private moved = false;
  private dirty = true;
  private destroyed = false;
  private routes: RouteDraw[] = [];
  private dash = 0;
  private onWheel = (e: WheelEvent) => this.wheel(e);
  opts: SceneOptions;
  /** Extra screen padding (px) reserved by floating panels when centring on a point. */
  focusPadding = { left: 0, bottom: 0 };

  private constructor(private host: HTMLElement, private atlas: Atlas, opts: SceneOptions) {
    this.opts = opts;
  }

  static async create(host: HTMLElement, atlas: Atlas, opts: SceneOptions): Promise<AtlasScene> {
    const s = new AtlasScene(host, atlas, opts);
    await s.init();
    return s;
  }

  get wasDrag() {
    return this.moved;
  }

  private async init() {
    const app = new Application();
    await app.init({
      resizeTo: this.host,
      background: MAP_THEME.background,
      antialias: !this.opts.lowPower,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, this.opts.lowPower ? 1 : 2),
      preference: "webgl",
    });
    if (this.destroyed) return app.destroy(true);
    this.app = app;
    app.canvas.setAttribute("aria-hidden", "true");
    app.canvas.style.display = "block";
    app.canvas.style.touchAction = "none";
    this.host.appendChild(app.canvas);
    app.stage.addChild(this.world);

    if (MAP_THEME.artwork) {
      const tex = await Assets.load(MAP_THEME.artwork);
      const sp = new Sprite(tex);
      sp.width = this.atlas.width;
      sp.height = this.atlas.height;
      this.world.addChild(sp);
    } else {
      this.world.addChild(this.drawCity());
    }
    this.world.addChild(this.routeLayer);

    app.stage.eventMode = "static";
    app.stage.hitArea = app.screen;
    app.stage.on("pointerdown", (e) => this.down(e));
    app.stage.on("globalpointermove", (e) => this.move(e));
    app.stage.on("pointerup", (e) => this.up(e));
    app.stage.on("pointerupoutside", (e) => this.up(e));
    app.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    app.renderer.on("resize", () => {
      this.clamp();
      this.dirty = true;
    });

    this.home(false);
    app.ticker.maxFPS = this.opts.lowPower ? 30 : 60;
    app.ticker.add((t) => this.tick(t.deltaMS));
  }

  // ------------------------------------------------------------------ drawing

  private drawCity(): Graphics {
    const a = this.atlas;
    const g = new Graphics();
    g.rect(0, 0, a.width, a.height).fill(MAP_THEME.land);
    for (const b of a.blocks) g.poly(b.poly).fill(b.park ? MAP_THEME.park : MAP_THEME.blockByDistrict[b.district] ?? MAP_THEME.blockByDistrict.discovery!);
    for (const b of a.buildings) g.poly(b.poly).fill(b.district === "central" ? MAP_THEME.centralBuilding : MAP_THEME.buildings[b.shade]!);
    // water: sea east of the coast, then the river with a soft bank line
    const sea: number[] = a.coast.flat();
    sea.push(a.width + 50, a.height + 50, a.width + 50, -50);
    g.poly(sea).fill(MAP_THEME.water);
    g.moveTo(a.coast[0]![0], a.coast[0]![1]);
    for (const p of a.coast) g.lineTo(p[0], p[1]);
    g.stroke({ width: 6, color: MAP_THEME.waterEdge, alpha: 0.9 });
    const riverPath = (w: number, color: number, alpha = 1) => {
      g.moveTo(a.river[0]![0], a.river[0]![1]);
      for (const p of a.river) g.lineTo(p[0], p[1]);
      g.stroke({ width: w, color, alpha, cap: "round", join: "round" });
    };
    riverPath(a.riverWidth + 10, MAP_THEME.waterEdge);
    riverPath(a.riverWidth, MAP_THEME.water);
    // arterials drawn over water read as bridges
    for (const r of a.arterials) {
      g.moveTo(r.pts[0]![0], r.pts[0]![1]);
      for (const p of r.pts) g.lineTo(p[0], p[1]);
      g.stroke({ width: r.width, color: MAP_THEME.road, cap: "round", join: "round" });
    }
    for (const r of a.arterials) {
      g.moveTo(r.pts[0]![0], r.pts[0]![1]);
      for (const p of r.pts) g.lineTo(p[0], p[1]);
      g.stroke({ width: Math.max(2, r.width * 0.18), color: MAP_THEME.roadCenter, alpha: 0.8, cap: "round", join: "round" });
    }
    // central plaza
    g.circle(a.central.center[0], a.central.center[1], 70).fill(0x1b2333);
    g.circle(a.central.center[0], a.central.center[1], 70).stroke({ width: 3, color: 0x34405a });
    return g;
  }

  setRoutes(routes: RouteDraw[]) {
    this.routes = routes;
    this.drawRoutes();
  }

  private drawRoutes() {
    const g = this.routeLayer;
    g.clear();
    for (const r of this.routes) {
      for (let i = 0; i < r.points.length - 1; i++) {
        const [a, b] = [r.points[i]!, r.points[i + 1]!];
        const done = i < r.completedSegments;
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const dash = 26, gap = 18;
        for (let d = done ? 0 : this.dash % (dash + gap); d < len; d += dash + gap) {
          const t0 = d / len, t1 = Math.min(1, (d + dash) / len);
          g.moveTo(a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0).lineTo(a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1);
        }
        g.stroke({ width: 7, color: done ? MAP_THEME.routeDone : MAP_THEME.route, cap: "round", alpha: 0.95 });
      }
    }
  }

  // ------------------------------------------------------------------ camera

  onCamera(fn: (c: Camera) => void): () => void {
    this.listeners.add(fn);
    fn(this.camera());
    return () => this.listeners.delete(fn);
  }

  camera(): Camera {
    return { tx: this.world.x, ty: this.world.y, s: this.world.scale.x };
  }

  private fitScale(): number {
    const { width, height } = this.app.screen;
    return Math.max(width / this.atlas.width, height / this.atlas.height);
  }

  private apply(c: Camera) {
    this.world.scale.set(c.s);
    this.world.position.set(c.tx, c.ty);
    this.clamp();
    this.dirty = true;
  }

  private clamp() {
    const { width, height } = this.app.screen;
    const minS = this.fitScale() * ZOOM_MIN_FACTOR;
    const s = Math.min(ZOOM_MAX, Math.max(minS, this.world.scale.x));
    this.world.scale.set(s);
    const w = this.atlas.width * s, h = this.atlas.height * s;
    this.world.x = Math.min(0, Math.max(width - w, this.world.x));
    this.world.y = Math.min(0, Math.max(height - h, this.world.y));
  }

  /** Camera that centres world point (x,y) at scale s, honouring panel padding. */
  private cameraFor(x: number, y: number, s: number): Camera {
    const { width, height } = this.app.screen;
    const cx = this.focusPadding.left + (width - this.focusPadding.left) / 2;
    const cy = (height - this.focusPadding.bottom) / 2;
    return { tx: cx - x * s, ty: cy - y * s, s };
  }

  flyTo(x: number, y: number, s?: number) {
    const target = this.cameraFor(x, y, Math.min(ZOOM_MAX, Math.max(this.fitScale(), s ?? Math.max(this.world.scale.x, 0.55))));
    if (this.opts.reducedMotion) return this.apply(target);
    this.tween = { from: this.camera(), to: target, t: 0, dur: 650 };
  }

  home(animate = true) {
    const a = this.atlas;
    const s = Math.max(this.fitScale(), this.app.screen.width < 768 ? 0.22 : 0.32);
    const target = this.cameraFor(a.central.center[0], a.central.center[1], s);
    if (!animate || this.opts.reducedMotion) this.apply(target);
    else this.tween = { from: this.camera(), to: target, t: 0, dur: 650 };
  }

  zoomBy(f: number, sx = this.app.screen.width / 2, sy = this.app.screen.height / 2) {
    this.tween = null;
    const s0 = this.world.scale.x;
    const s1 = Math.min(ZOOM_MAX, Math.max(this.fitScale(), s0 * f));
    const wx = (sx - this.world.x) / s0, wy = (sy - this.world.y) / s0;
    this.apply({ s: s1, tx: sx - wx * s1, ty: sy - wy * s1 });
  }

  panBy(dx: number, dy: number) {
    this.tween = null;
    this.apply({ s: this.world.scale.x, tx: this.world.x + dx, ty: this.world.y + dy });
  }

  /** Viewport in normalized map coordinates (for the minimap). */
  viewport(): { x: number; y: number; w: number; h: number } {
    const { width, height } = this.app.screen;
    const s = this.world.scale.x;
    return { x: -this.world.x / s / this.atlas.width, y: -this.world.y / s / this.atlas.height, w: width / s / this.atlas.width, h: height / s / this.atlas.height };
  }

  setInteractive(on: boolean) {
    this.opts.interactive = on;
    this.app.canvas.style.cursor = on ? "grab" : "default";
  }

  // ------------------------------------------------------------------ input

  private wheel(e: WheelEvent) {
    if (!this.opts.interactive) return;
    e.preventDefault();
    const r = this.app.canvas.getBoundingClientRect();
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    this.zoomBy(Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0018)), e.clientX - r.left, e.clientY - r.top);
  }

  private down(e: FederatedPointerEvent) {
    if (!this.opts.interactive) return;
    this.pointers.set(e.pointerId, { x: e.global.x, y: e.global.y });
    this.moved = false;
    this.tween = null;
    if (this.pointers.size === 1) this.drag = { x: e.global.x, y: e.global.y, wx: this.world.x, wy: this.world.y };
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = { dist: Math.hypot(a!.x - b!.x, a!.y - b!.y), s: this.world.scale.x };
      this.drag = null;
    }
  }

  private move(e: FederatedPointerEvent) {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, { x: e.global.x, y: e.global.y });
    if (this.pinch && this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      this.zoomBy((this.pinch.s * d) / this.pinch.dist / this.world.scale.x, (a!.x + b!.x) / 2, (a!.y + b!.y) / 2);
      this.moved = true;
      return;
    }
    if (!this.drag) return;
    const dx = e.global.x - this.drag.x, dy = e.global.y - this.drag.y;
    if (!this.moved && Math.hypot(dx, dy) < 5) return;
    this.moved = true;
    this.app.canvas.style.cursor = "grabbing";
    this.apply({ s: this.world.scale.x, tx: this.drag.wx + dx, ty: this.drag.wy + dy });
  }

  private up(e: FederatedPointerEvent) {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    if (this.pointers.size === 0) {
      this.drag = null;
      if (this.opts.interactive) this.app.canvas.style.cursor = "grab";
    }
  }

  // ------------------------------------------------------------------ loop

  private tick(dt: number) {
    if (this.tween) {
      this.tween.t += dt;
      const k = Math.min(1, this.tween.t / this.tween.dur);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      const { from: f, to } = this.tween;
      // interpolate in log-scale for natural zoom
      const s = Math.exp(Math.log(f.s) + (Math.log(to.s) - Math.log(f.s)) * e);
      this.apply({ s, tx: f.tx + (to.tx - f.tx) * e, ty: f.ty + (to.ty - f.ty) * e });
      if (k >= 1) this.tween = null;
    } else if (!this.opts.interactive && !this.opts.reducedMotion) {
      // welcome scene: very slow ambient drift
      this.drift += dt / 1000;
      this.apply({ s: this.world.scale.x, tx: this.world.x + Math.sin(this.drift * 0.15) * 0.12, ty: this.world.y + Math.cos(this.drift * 0.11) * 0.08 });
    }
    if (this.routes.length && !this.opts.reducedMotion) {
      this.dash += dt * 0.03;
      this.drawRoutes();
    }
    if (this.dirty) {
      this.dirty = false;
      const c = this.camera();
      for (const l of this.listeners) l(c);
    }
  }

  destroy() {
    this.destroyed = true;
    if (!this.app) return;
    this.app.canvas.removeEventListener("wheel", this.onWheel);
    this.app.destroy(true, { children: true });
  }
}
