/**
 * Dark 2D city renderer (PixiJS v8). Responsibilities are deliberately narrow:
 *   - draw the static city (one cached Graphics geometry, or a supplied artwork sprite)
 *   - own the camera (pan / wheel / pinch / keyboard / fly-to) with bounds
 *   - draw route overlays
 *   - publish the camera so the HTML marker layer can follow without React re-renders
 * Project data, markers, selection and search live in React components.
 */
// Production CSP forbids eval; this module swaps PixiJS's shader/uniform code generation for eval-free versions.
import "pixi.js/unsafe-eval";
import { Application, Assets, Container, Graphics, Sprite, type FederatedPointerEvent } from "pixi.js";
import { coastXAt, distToPolyline, type Atlas, type Pt } from "@near-district/core/world";
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
/** Artwork may be magnified at most this much before it looks soft (raise it with a higher-resolution image). */
const ART_MAX_UPSCALE = 2.7; // one zoom step (×1.35) past the old 2.0 limit

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
  /** Max zoom; lowered for artwork so the image never gets blurry. */
  private zoomMax = ZOOM_MAX;
  private onWheel = (e: WheelEvent) => this.wheel(e);
  opts: SceneOptions;
  /** Extra screen padding (px) reserved by floating panels when centring on a point. */
  focusPadding = { left: 0, right: 0, bottom: 0 };
  /** Where the camera opens (a live Space, chosen by the page). */
  start: Pt = [0, 0];

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
      tex.source.scaleMode = "linear";
      // Mipmaps keep the zoomed-out map clean instead of shimmering.
      tex.source.autoGenerateMipmaps = true;
      tex.source.updateMipmaps();
      const sp = new Sprite(tex);
      sp.width = this.atlas.width;
      sp.height = this.atlas.height;
      this.world.addChild(sp);
      this.zoomMax = Math.min(this.zoomMax, ((MAP_THEME.artworkSourceWidth || tex.width) * ART_MAX_UPSCALE) / this.atlas.width);
    } else {
      this.world.addChild(this.drawCity());
    }
    this.world.addChild(this.areaLayer, this.routeLayer);

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

  private drawCity(): Container {
    const a = this.atlas;
    const T = MAP_THEME;
    const root = new Container();
    const base = new Graphics();
    base.rect(-4000, -4000, a.width + 8000, a.height + 8000).fill(T.background);
    base.rect(0, 0, a.width, a.height).fill(T.land);
    root.addChild(base);

    // city fabric, one cullable layer per chunk
    const chunks = Array.from({ length: a.chunks.cols * a.chunks.rows }, () => new Graphics());
    for (const p of a.parks) chunks[p.chunk]!.poly(p.poly).fill(T.park);
    for (const bl of a.blocks) chunks[bl.chunk]!.poly(bl.poly).fill(T.block);
    for (const bd of a.buildings) chunks[bd.chunk]!.poly(bd.poly).fill(T.buildings[bd.shade]!);
    for (const g of chunks) {
      g.cullable = true;
      root.addChild(g);
    }

    const water = new Graphics();
    const path = (g: Graphics, pts: [number, number][], close = false) => {
      g.moveTo(pts[0]![0], pts[0]![1]);
      for (const p of pts) g.lineTo(p[0], p[1]);
      if (close) g.closePath();
    };
    water.poly(a.sea).fill(T.sea);
    path(water, a.coast);
    water.stroke({ color: T.coastEdge, width: 6, alpha: 0.9 });
    for (const pier of a.piers) water.poly(pier).fill(T.pier);
    for (const isl of a.islands) {
      water.poly(isl.flat()).fill(T.island);
      path(water, isl, true);
      water.stroke({ color: T.parkEdge, width: 4, alpha: 0.8 });
    }
    for (const r of a.rivers) {
      path(water, r.pts);
      water.stroke({ width: r.width + 14, color: T.riverEdge, cap: "round", join: "round" });
    }
    for (const r of a.rivers) {
      path(water, r.pts);
      water.stroke({ width: r.width, color: T.river, cap: "round", join: "round" });
    }
    root.addChild(water);

    // major roads; segments over water become lighter bridges
    const roads = new Graphics();
    const overWater = (x: number, y: number) =>
      x > coastXAt(a.coast, y) || a.rivers.some((r) => distToPolyline([x, y], r.pts) < r.width / 2 + 10);
    for (const r of a.roads) {
      path(roads, r.pts);
      roads.stroke({ width: r.width, color: T.road, cap: "round", join: "round" });
    }
    for (const r of a.roads) {
      for (let i = 0; i < r.pts.length - 1; i++) {
        const [p, q] = [r.pts[i]!, r.pts[i + 1]!];
        if (!overWater((p[0] + q[0]) / 2, (p[1] + q[1]) / 2)) continue;
        roads.moveTo(p[0], p[1]).lineTo(q[0], q[1]);
        roads.stroke({ width: r.width + 14, color: T.bridge, cap: "butt" });
      }
    }
    root.addChild(roads);
    return root;
  }

  // ------------------------------------------------------------------ Space areas

  private areaLayer = new Graphics();

  /** Soft outlined areas under Spaces; the selected one is orange. Positions in world units. */
  setAreas(areas: { id: string; x: number; y: number; live: boolean }[], selectedId: string | null) {
    const g = this.areaLayer;
    if (g.destroyed) return;
    g.clear();
    const shape = (x: number, y: number, seed: number, r: number) => {
      const pts: number[] = [];
      for (let i = 0; i < 18; i++) {
        const t = (i / 18) * Math.PI * 2;
        const rr = r * (1 + 0.16 * Math.sin(t * 3 + seed) + 0.1 * Math.sin(t * 5 + seed * 1.7));
        pts.push(x + Math.cos(t) * rr * 1.15, y + Math.sin(t) * rr * 0.9);
      }
      return pts;
    };
    for (const ar of areas) {
      if (!ar.live && ar.id !== selectedId) continue;
      const seed = [...ar.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 997, 7);
      const sel = ar.id === selectedId;
      const pts = shape(ar.x, ar.y, seed, sel ? 250 : 200);
      g.poly(pts).fill({ color: sel ? MAP_THEME.selected : MAP_THEME.area, alpha: sel ? 0.2 : 0.08 });
      g.poly(pts).stroke({ color: sel ? MAP_THEME.selected : MAP_THEME.area, width: sel ? 6 : 3.5, alpha: sel ? 0.95 : 0.45, join: "round" });
    }
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

  /** Screen size; safe to call after destroy (a late React effect must not crash). */
  private get screen(): { width: number; height: number } {
    return this.app.renderer ? this.app.screen : { width: 1, height: 1 };
  }

  onCamera(fn: (c: Camera) => void): () => void {
    this.listeners.add(fn);
    fn(this.camera());
    return () => this.listeners.delete(fn);
  }

  camera(): Camera {
    if (this.world.destroyed) return { tx: 0, ty: 0, s: 1 };
    return { tx: this.world.x, ty: this.world.y, s: this.world.scale.x };
  }

  private fitScale(): number {
    const { width, height } = this.screen;
    return Math.max(width / this.atlas.width, height / this.atlas.height);
  }

  private apply(c: Camera) {
    this.world.scale.set(c.s);
    this.world.position.set(c.tx, c.ty);
    this.clamp();
    this.dirty = true;
  }

  private clamp() {
    const { width, height } = this.screen;
    const minS = this.fitScale() * ZOOM_MIN_FACTOR;
    const s = Math.min(this.zoomMax, Math.max(minS, this.world.scale.x));
    this.world.scale.set(s);
    const w = this.atlas.width * s, h = this.atlas.height * s;
    this.world.x = Math.min(0, Math.max(width - w, this.world.x));
    this.world.y = Math.min(0, Math.max(height - h, this.world.y));
  }

  /** Camera that centres world point (x,y) at scale s, honouring panel padding. */
  private cameraFor(x: number, y: number, s: number): Camera {
    const { width, height } = this.screen;
    const cx = this.focusPadding.left + (width - this.focusPadding.left - this.focusPadding.right) / 2;
    const cy = (height - this.focusPadding.bottom) / 2;
    return { tx: cx - x * s, ty: cy - y * s, s };
  }

  flyTo(x: number, y: number, s?: number, dur = 650) {
    const target = this.cameraFor(x, y, Math.min(this.zoomMax, Math.max(this.fitScale(), s ?? Math.max(this.world.scale.x, 0.55))));
    if (this.opts.reducedMotion) return this.apply(target);
    this.tween = { from: this.camera(), to: target, t: 0, dur };
  }

  /** Snap (no tween) to world point (x,y) at scale s. */
  jumpTo(x: number, y: number, s: number) {
    this.tween = null;
    this.apply(this.cameraFor(x, y, Math.min(this.zoomMax, Math.max(this.fitScale(), s))));
  }

  /** Welcome pose: start wide, then a slow cinematic push-in toward the start point. */
  cinematic() {
    const [x, y] = this.start;
    // Wide, sharp establishing shot that slowly pushes in, never past what the artwork can show crisply.
    const end = Math.max(this.fitScale(), Math.min(0.42, this.zoomMax * 0.6));
    this.apply(this.cameraFor(x, y, Math.max(this.fitScale(), end * 0.7)));
    this.flyTo(x, y, end, 9000);
  }

  /** Open zoomed in at the start point (near a live Space). */
  home(animate = true) {
    const [x, y] = this.start;
    // open fully zoomed in
    const target = this.cameraFor(x, y, this.zoomMax);
    if (!animate || this.opts.reducedMotion) this.apply(target);
    else this.tween = { from: this.camera(), to: target, t: 0, dur: 650 };
  }

  zoomBy(f: number, sx = this.screen.width / 2, sy = this.screen.height / 2) {
    this.tween = null;
    const s0 = this.world.scale.x;
    const s1 = Math.min(this.zoomMax, Math.max(this.fitScale(), s0 * f));
    const wx = (sx - this.world.x) / s0, wy = (sy - this.world.y) / s0;
    this.apply({ s: s1, tx: sx - wx * s1, ty: sy - wy * s1 });
  }

  /** Allowed zoom range (for a slider). */
  zoomRange(): { min: number; max: number } {
    return { min: this.fitScale() * ZOOM_MIN_FACTOR, max: this.zoomMax };
  }

  /** Zoom to an absolute scale around the screen centre. */
  zoomToScale(s: number) {
    this.zoomBy(s / this.world.scale.x);
  }

  panBy(dx: number, dy: number) {
    this.tween = null;
    this.apply({ s: this.world.scale.x, tx: this.world.x + dx, ty: this.world.y + dy });
  }

  /** Viewport in normalized map coordinates (for the minimap). */
  viewport(): { x: number; y: number; w: number; h: number } {
    if (this.world.destroyed) return { x: 0, y: 0, w: 1, h: 1 };
    const { width, height } = this.screen;
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
