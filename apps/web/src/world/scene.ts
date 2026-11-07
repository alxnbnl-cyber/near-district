/**
 * The Yielvy world renderer (PixiJS v8, WebGL).
 *
 * Why sprite-style 2.5D in Pixi rather than 3D: buildings are static isometric drawings, so
 * a 2D scene graph with GPU-cached geometry gives crisp art at any zoom, tiny downloads, and
 * cheap hit-testing, while running on low-end phones. Real 3D would add a model pipeline and
 * heavy assets for no gameplay benefit.
 *
 * Performance rules:
 *  - geometry is shared per style (GraphicsContext), never rebuilt per frame
 *  - every object is `cullable`; off-screen objects are skipped by CullerPlugin
 *  - decorative animation touches only on-screen objects and runs at 30fps on low-power devices
 *  - React never re-renders per frame; the scene reports hover/selection via callbacks
 */
import {
  Application,
  Container,
  CullerPlugin,
  extensions,
  Graphics,
  GraphicsContext,
  Polygon,
  Text,
  TextStyle,
  type FederatedPointerEvent,
} from "pixi.js";
import { DISTRICTS, PLOT_TILES, getDistrict, hash32, plotPosition, plotRadiusFor, tileToWorld, type DistrictDef } from "@yielvy/core/world";
import {
  benchContext,
  BUILDING_STYLES,
  buildingContext,
  cloudShadowContext,
  footprint,
  fountainContext,
  lampContext,
  lampGlowContext,
  openPlotContext,
  PALETTE,
  shade,
  signpostContext,
  STYLE_TOP,
  THEMES,
  treeContext,
  walkerContext,
  WALKER_COLORS,
  type BuildingStyle,
  type ThemeKey,
} from "./art";
import type { WorldBuildingData, WorldData } from "./types";

extensions.add(CullerPlugin);

export interface SceneCallbacks {
  onHover(spaceId: string | null): void;
  onSelect(spaceId: string | null): void;
  onOpenPlot(districtId: string): void;
  onStats?(s: { fps: number; buildings: number; visibleObjects: number; drawMs: number }): void;
}

export interface SceneOptions {
  reducedMotion: boolean;
  lowPower: boolean;
  fontFamily: string;
}

const ZOOM_MIN = 0.2;
const ZOOM_MAX = 1.5;
const OPEN_PLOTS_PER_DISTRICT = 2;

interface BuildingNode {
  data: WorldBuildingData;
  node: Container;
  outline: Graphics;
  pulse: Graphics | null;
  label: Container | null;
  x: number;
  y: number;
}

interface Animated {
  obj: Container;
  kind: "sway" | "flag" | "pulse" | "glow";
  phase: number;
}

export class WorldScene {
  private app!: Application;
  private world = new Container();
  private ground = new Container();
  private objects = new Container();
  private overlay = new Container();
  private buildings = new Map<string, BuildingNode>();
  private animated: Animated[] = [];
  private walkers: { obj: Container; ax: number; ay: number; bx: number; by: number; t: number; speed: number }[] = [];
  private clouds: { obj: Container; vx: number; vy: number }[] = [];
  private radiusPlots = 4;
  private hovered: string | null = null;
  private selected: string | null = null;
  private filter: Set<string> | null = null;
  private tween: { from: [number, number, number]; to: [number, number, number]; t: number; dur: number } | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private dragStart: { x: number; y: number; wx: number; wy: number } | null = null;
  private dragMoved = false;
  private pinch: { dist: number; zoom: number } | null = null;
  private elapsed = 0;
  private statAcc = { frames: 0, ms: 0, draw: 0 };
  private destroyed = false;
  private labelStyle!: TextStyle;
  private badgeStyle!: TextStyle;
  private signStyle!: TextStyle;
  private onWheel = (e: WheelEvent) => this.handleWheel(e);

  private constructor(
    private readonly host: HTMLElement,
    private readonly cb: SceneCallbacks,
    private readonly opts: SceneOptions,
  ) {}

  static async create(host: HTMLElement, data: WorldData, cb: SceneCallbacks, opts: SceneOptions): Promise<WorldScene> {
    const s = new WorldScene(host, cb, opts);
    await s.init(data);
    return s;
  }

  private async init(data: WorldData) {
    const app = new Application();
    await app.init({
      resizeTo: this.host,
      background: PALETTE.paper,
      antialias: !this.opts.lowPower,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, this.opts.lowPower ? 1 : 2),
      preference: "webgl",
      powerPreference: this.opts.lowPower ? "low-power" : "high-performance",
    });
    if (this.destroyed) {
      app.destroy(true);
      return;
    }
    this.app = app;
    app.canvas.setAttribute("aria-hidden", "true");
    app.canvas.style.touchAction = "none";
    app.canvas.style.display = "block";
    this.host.appendChild(app.canvas);

    const font = this.opts.fontFamily;
    this.labelStyle = new TextStyle({ fontFamily: font, fontSize: 26, fontWeight: "600", fill: PALETTE.ink });
    this.badgeStyle = new TextStyle({ fontFamily: font, fontSize: 19, fontWeight: "700", fill: 0xffffff, letterSpacing: 1.2 });
    this.signStyle = new TextStyle({ fontFamily: font, fontSize: 24, fontWeight: "700", fill: PALETTE.ink });

    this.objects.sortableChildren = true;
    this.world.addChild(this.ground, this.objects, this.overlay);
    app.stage.addChild(this.world);
    app.stage.eventMode = "static";
    app.stage.hitArea = app.screen;
    app.stage.on("pointerdown", (e) => this.pointerDown(e));
    app.stage.on("globalpointermove", (e) => this.pointerMove(e));
    app.stage.on("pointerup", (e) => this.pointerUp(e));
    app.stage.on("pointerupoutside", (e) => this.pointerUp(e));
    app.canvas.addEventListener("wheel", this.onWheel, { passive: false });

    this.build(data);
    const narrow = this.host.clientWidth < 768;
    this.setCamera(0, tileToWorld(2, 2).y + 120, narrow ? 0.36 : 0.52);
    app.ticker.maxFPS = this.opts.lowPower ? 30 : 60;
    app.ticker.add((t) => this.tick(t.deltaMS));
  }

  // --------------------------------------------------------------------------- build

  setData(data: WorldData) {
    if (!this.app) return;
    for (const c of [...this.ground.removeChildren(), ...this.objects.removeChildren(), ...this.overlay.removeChildren()]) c.destroy({ children: true });
    this.buildings.clear();
    this.animated = [];
    this.walkers = [];
    this.clouds = [];
    this.build(data);
  }

  private build(data: WorldData) {
    const counts = new Map<string, number>();
    for (const b of data.buildings) counts.set(b.districtId, Math.max(counts.get(b.districtId) ?? 0, b.plotIndex + 1));
    const maxCount = Math.max(0, ...counts.values());
    this.radiusPlots = Math.max(4, plotRadiusFor(maxCount + OPEN_PLOTS_PER_DISTRICT) + 2);

    const occupied = new Map<string, Set<number>>();
    for (const b of data.buildings) {
      if (!occupied.has(b.districtId)) occupied.set(b.districtId, new Set());
      occupied.get(b.districtId)!.add(b.plotIndex);
    }
    const usedPlots = new Set<string>();
    for (const b of data.buildings) {
      const p = plotPosition(getDistrict(b.districtId), b.plotIndex);
      usedPlots.add(`${p.plotX},${p.plotY}`);
    }
    // Next open plots per district, shown as honest "open plot" markers.
    const openPlots: { d: DistrictDef; plotX: number; plotY: number; tileX: number; tileY: number }[] = [];
    for (const d of DISTRICTS) {
      const taken = occupied.get(d.id) ?? new Set();
      let n = 0, found = 0;
      while (found < OPEN_PLOTS_PER_DISTRICT) {
        if (!taken.has(n)) {
          const p = plotPosition(d, n);
          openPlots.push({ d, ...p });
          usedPlots.add(`${p.plotX},${p.plotY}`);
          found++;
        }
        n++;
      }
    }

    this.buildGround(usedPlots);
    this.buildTownSquare();
    this.buildDistrictSigns();
    for (const b of data.buildings) this.addBuilding(b);
    for (const o of openPlots) this.addOpenPlot(o.d, o.tileX, o.tileY);
    this.buildNature(usedPlots);
    if (!this.opts.reducedMotion) {
      this.buildWalkers();
      this.buildClouds();
    }
    this.applyFilter();
  }

  private districtOf(px: number, py: number): DistrictDef | null {
    if (px === 0 || py === 0) return null;
    return DISTRICTS.find((d) => Math.sign(px) === d.sx && Math.sign(py) === d.sy) ?? null;
  }

  private quad(g: Graphics, tx0: number, ty0: number, tx1: number, ty1: number, color: number, alpha = 1) {
    const a = tileToWorld(tx0, ty0), b = tileToWorld(tx1, ty0), c = tileToWorld(tx1, ty1), d = tileToWorld(tx0, ty1);
    g.poly([a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y]).fill({ color, alpha });
  }

  private buildGround(usedPlots: Set<string>) {
    const R = this.radiusPlots;
    const T = R * PLOT_TILES;
    // Island base with earth sides: a diorama floating on paper.
    const base = new Graphics();
    const top = tileToWorld(-T, -T), right = tileToWorld(T, -T), bottom = tileToWorld(T, T), left = tileToWorld(-T, T);
    const depth = 56;
    base.poly([left.x, left.y, bottom.x, bottom.y, bottom.x, bottom.y + depth, left.x, left.y + depth]).fill(0xc9a27a);
    base.poly([bottom.x, bottom.y, right.x, right.y, right.x, right.y + depth, bottom.x, bottom.y + depth]).fill(0xb18961);
    base.poly([left.x, left.y + 6, bottom.x, bottom.y + 6, bottom.x, bottom.y + 14, left.x, left.y + 14]).fill({ color: 0x8f6c48, alpha: 0.35 });
    base.poly([top.x, top.y, right.x, right.y, bottom.x, bottom.y, left.x, left.y]).fill(PALETTE.grassDeep);
    this.ground.addChild(base);

    // Chunked surface: one Graphics per 4x4 plots so culling can skip off-screen chunks.
    const CH = 4;
    for (let cx = -R; cx < R; cx += CH) {
      for (let cy = -R; cy < R; cy += CH) {
        const g = new Graphics();
        g.cullable = true;
        for (let px = cx; px < Math.min(R, cx + CH); px++) {
          for (let py = cy; py < Math.min(R, cy + CH); py++) this.drawPlot(g, px, py, usedPlots);
        }
        this.ground.addChild(g);
      }
    }
  }

  private drawPlot(g: Graphics, px: number, py: number, usedPlots: Set<string>) {
    const R = this.radiusPlots;
    const tx = px * PLOT_TILES, ty = py * PLOT_TILES;
    const wild = Math.max(Math.abs(px + 0.5), Math.abs(py + 0.5)) > R - 1.5;
    const h = hash32(`${px},${py}`);
    if (wild) {
      this.quad(g, tx, ty, tx + 4, ty + 4, h % 3 === 0 ? PALETTE.grassAlt : PALETTE.grassDeep);
      return;
    }
    if (px === 0 && py === 0) {
      this.quad(g, tx, ty, tx + 4, ty + 4, PALETTE.plaza);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2 === 0) this.quad(g, tx + i + 0.06, ty + j + 0.06, tx + i + 0.94, ty + j + 0.94, PALETTE.plazaTile, 0.55);
      return;
    }
    if (px === 0 || py === 0) {
      this.quad(g, tx, ty, tx + 4, ty + 4, PALETTE.avenue);
      // centre line dashes
      if (px === 0) this.quad(g, tx + 1.92, ty + 0.6, tx + 2.08, ty + 2.4, PALETTE.avenueMark);
      else this.quad(g, tx + 0.6, ty + 1.92, tx + 2.4, ty + 2.08, PALETTE.avenueMark);
      return;
    }
    const used = usedPlots.has(`${px},${py}`);
    // lot
    this.quad(g, tx + 1, ty + 1, tx + 4, ty + 4, used ? PALETTE.grass : h % 2 ? PALETTE.grass : PALETTE.grassAlt);
    // street L (with a soft edge line)
    this.quad(g, tx, ty, tx + 4, ty + 1, PALETTE.street);
    this.quad(g, tx, ty + 1, tx + 1, ty + 4, PALETTE.street);
    this.quad(g, tx + 1, ty + 0.94, tx + 4, ty + 1.02, PALETTE.streetEdge);
    this.quad(g, tx + 0.94, ty + 1, tx + 1.02, ty + 4, PALETTE.streetEdge);
  }

  private place(obj: Container, tx: number, ty: number, depthBias = 0) {
    const p = tileToWorld(tx, ty);
    obj.position.set(p.x, p.y);
    obj.zIndex = (tx + ty) * 10 + depthBias;
    obj.cullable = true;
    this.objects.addChild(obj);
  }

  private buildTownSquare() {
    const f = new Graphics(fountainContext());
    this.place(f, 2, 2);
    const water = new Graphics(new GraphicsContext().ellipse(0, -2, 88, 44).fill({ color: 0xffffff, alpha: 0.18 }));
    water.position.set(0, 0);
    f.addChild(water);
    this.animated.push({ obj: water, kind: "glow", phase: 0 });
    for (const [x, y] of [[0.6, 2], [3.4, 2], [2, 0.6], [2, 3.4]] as const) {
      const b = new Graphics(benchContext());
      this.place(b, x, y);
    }
    for (const [x, y] of [[0.3, 0.3], [3.7, 0.3], [0.3, 3.7], [3.7, 3.7]] as const) this.addLamp(x, y);
    // Two flags at the square
    for (const [x, y, c] of [[0.9, 3.2, PALETTE.orange], [3.2, 0.9, 0x74c9e6]] as const) {
      const pole = new Container();
      pole.addChild(new Graphics(new GraphicsContext().rect(-2, -130, 4, 130).fill(PALETTE.ink).circle(0, -132, 4).fill(PALETTE.ink)));
      const flag = new Graphics(new GraphicsContext().poly([0, 0, 46, 8, 0, 26]).fill(c));
      flag.position.set(2, -128);
      pole.addChild(flag);
      this.place(pole, x, y);
      this.animated.push({ obj: flag, kind: "flag", phase: x * 3 });
    }
  }

  private buildDistrictSigns() {
    for (const d of DISTRICTS) {
      const sign = new Container();
      sign.addChild(new Graphics(signpostContext(d.theme as ThemeKey)));
      const t = new Text({ text: d.name, style: this.signStyle });
      t.resolution = 2;
      t.anchor.set(0, 0.5);
      t.position.set(-56, -128);
      if (t.width > 140) t.scale.set(140 / t.width);
      sign.addChild(t);
      const tx = d.sx > 0 ? 4.5 : -0.5;
      const ty = d.sy > 0 ? 4.5 : -0.5;
      // District signs act as map labels: always drawn above buildings.
      this.place(sign, tx, ty, 6);
      sign.zIndex = 1_000_000;
    }
  }

  private addLamp(tx: number, ty: number) {
    const lamp = new Container();
    const glow = new Graphics(lampGlowContext());
    lamp.addChild(glow, new Graphics(lampContext()));
    this.place(lamp, tx, ty, 2);
    this.animated.push({ obj: glow, kind: "glow", phase: tx + ty });
  }

  private addBuilding(b: WorldBuildingData) {
    const d = getDistrict(b.districtId);
    const pos = plotPosition(d, b.plotIndex);
    const cx = pos.tileX + 1.5, cy = pos.tileY + 1.5;
    const style = (BUILDING_STYLES as readonly string[]).includes(b.style) ? (b.style as BuildingStyle) : "workshop";
    const variant = hash32(b.spaceId);
    const node = new Container();
    node.label = `building:${b.slug}`;
    const art = new Graphics(buildingContext(style, d.theme as ThemeKey, variant));
    const f = footprint(3, 0.94);
    const outline = new Graphics(
      new GraphicsContext().poly([0, -f.h, f.w, 0, 0, f.h, -f.w, 0]).stroke({ width: 6, color: PALETTE.orange, alpha: 0.95 }),
    );
    outline.visible = false;
    let pulse: Graphics | null = null;
    if (b.flags.includes("live")) {
      pulse = new Graphics(new GraphicsContext().ellipse(0, 0, f.w * 0.9, f.h * 0.9).stroke({ width: 5, color: PALETTE.orange, alpha: 0.9 }));
      node.addChild(pulse);
      if (!this.opts.reducedMotion) this.animated.push({ obj: pulse, kind: "pulse", phase: (variant % 100) / 16 });
      else pulse.alpha = 0.35;
    }
    node.addChild(outline, art);
    const top = STYLE_TOP[style];
    this.addBadges(node, b, top);
    node.eventMode = "static";
    node.cursor = "pointer";
    node.hitArea = new Polygon([-f.w, 0, -f.w * 0.7, -top, f.w * 0.7, -top, f.w, 0, 0, f.h]);
    node.on("pointerover", () => {
      if (this.dragMoved) return;
      this.setHovered(b.spaceId);
    });
    node.on("pointerout", () => {
      if (this.hovered === b.spaceId) this.setHovered(null);
    });
    node.on("pointertap", () => {
      if (this.dragMoved) return;
      this.cb.onSelect(b.spaceId);
    });
    this.place(node, cx, cy, 4);
    this.buildings.set(b.spaceId, { data: b, node, outline, pulse, label: null, x: node.x, y: node.y });
    // a lamp at the plot's street corner
    if (variant % 2 === 0) this.addLamp(pos.tileX - 0.5, pos.tileY - 0.5);
  }

  private addBadges(node: Container, b: WorldBuildingData, top: number) {
    const order: [typeof b.flags[number], string, number][] = [
      ["live", "LIVE", 0xd65a1e],
      ["ending_soon", "ENDING SOON", 0x9a6b00],
      ["featured", "FEATURED", 0x5b4a9a],
      ["new", "NEW", 0x1d6680],
    ];
    const shown = order.filter(([f]) => b.flags.includes(f)).slice(0, 2);
    let y = -top - 26;
    for (const [, text, color] of shown) {
      const c = new Container();
      const t = new Text({ text, style: this.badgeStyle });
      t.resolution = 2;
      t.anchor.set(0.5);
      const w = t.width + (text === "LIVE" ? 44 : 28);
      c.addChild(new Graphics(new GraphicsContext().roundRect(-w / 2, -17, w, 34, 17).fill(color).roundRect(-w / 2, -17, w, 34, 17).stroke({ width: 3, color: 0xffffff })));
      if (text === "LIVE") {
        const dot = new Graphics(new GraphicsContext().circle(0, 0, 5).fill(0xffffff));
        dot.position.set(-w / 2 + 17, 0);
        c.addChild(dot);
        t.x = 8;
      }
      c.addChild(t);
      c.position.set(0, y);
      node.addChild(c);
      y -= 42;
    }
  }

  private addOpenPlot(d: DistrictDef, tileX: number, tileY: number) {
    const c = new Container();
    c.addChild(new Graphics(openPlotContext(d.theme as ThemeKey)));
    const t = new Text({ text: "Open plot", style: new TextStyle({ fontFamily: this.opts.fontFamily, fontSize: 20, fontWeight: "700", fill: PALETTE.ink }) });
    t.resolution = 2;
    t.anchor.set(0, 0.5);
    t.position.set(-36, -66);
    t.scale.set(Math.min(1, 84 / t.width));
    c.addChild(t);
    c.eventMode = "static";
    c.cursor = "pointer";
    const f = footprint(3, 0.9);
    c.hitArea = new Polygon([0, -f.h, f.w, 0, 0, f.h, -f.w, 0]);
    c.on("pointertap", () => !this.dragMoved && this.cb.onOpenPlot(d.id));
    this.place(c, tileX + 1.5, tileY + 1.5, 1);
  }

  private buildNature(usedPlots: Set<string>) {
    const R = this.radiusPlots;
    for (let px = -R; px < R; px++) {
      for (let py = -R; py < R; py++) {
        if (px === 0 || py === 0) continue;
        if (usedPlots.has(`${px},${py}`)) continue;
        const h = hash32(`tree:${px}:${py}`);
        const wild = Math.max(Math.abs(px + 0.5), Math.abs(py + 0.5)) > R - 1.5;
        const n = this.opts.lowPower ? (wild ? 2 : 1) : wild ? 4 + (h % 3) : 2 + (h % 3);
        for (let i = 0; i < n; i++) {
          const hh = hash32(`${h}:${i}`);
          const lx = wild ? (hh % 1000) / 1000 * 3.6 + 0.2 : 1.3 + ((hh % 1000) / 1000) * 2.4;
          const ly = wild ? ((hh >> 10) % 1000) / 1000 * 3.6 + 0.2 : 1.3 + (((hh >> 10) % 1000) / 1000) * 2.4;
          const kind = (["round", "pine", "bush", "round"] as const)[hh % 4]!;
          const tree = new Graphics(treeContext(kind, hh));
          tree.scale.set(0.9 + ((hh >> 20) % 30) / 100);
          this.place(tree, px * PLOT_TILES + lx, py * PLOT_TILES + ly);
          if (kind !== "bush") this.animated.push({ obj: tree, kind: "sway", phase: (hh % 628) / 100 });
        }
      }
    }
  }

  private buildWalkers() {
    const R = this.radiusPlots;
    const n = this.opts.lowPower ? 4 : 10;
    for (let i = 0; i < n; i++) {
      const h = hash32(`walker:${i}`);
      const obj = new Graphics(walkerContext(WALKER_COLORS[h % WALKER_COLORS.length]!));
      const alongX = i % 2 === 0;
      const lane = 0.8 + (h % 3) * 1.2;
      const span = (R - 2) * PLOT_TILES;
      const [ax, ay, bx, by] = alongX ? [-span, lane, span, lane] : [lane, -span, lane, span];
      this.place(obj, ax, ay, 3);
      this.walkers.push({ obj, ax, ay, bx, by, t: (h % 1000) / 1000, speed: 0.012 + (h % 7) / 1000 });
    }
  }

  private buildClouds() {
    const R = this.radiusPlots * PLOT_TILES;
    for (let i = 0; i < 3; i++) {
      const c = new Graphics(cloudShadowContext());
      const p = tileToWorld(-R + i * R * 0.7, -R * 0.4 + i * R * 0.5);
      c.position.set(p.x, p.y);
      c.cullable = true;
      this.overlay.addChild(c);
      this.clouds.push({ obj: c, vx: 9 + i * 3, vy: 2 + i });
    }
  }

  // --------------------------------------------------------------------------- interaction

  private setHovered(id: string | null) {
    if (this.hovered === id) return;
    const prev = this.hovered ? this.buildings.get(this.hovered) : null;
    if (prev && prev.data.spaceId !== this.selected) {
      prev.outline.visible = false;
      prev.node.y = prev.y;
    }
    this.hovered = id;
    const cur = id ? this.buildings.get(id) : null;
    if (cur) {
      cur.outline.visible = true;
      if (!this.opts.reducedMotion) cur.node.y = cur.y - 6;
    }
    this.cb.onHover(id);
  }

  /** Screen-space x offset so a focused building is not hidden behind the side panel. */
  focusOffsetX = 0;

  select(id: string | null, fly = true) {
    const prev = this.selected ? this.buildings.get(this.selected) : null;
    if (prev) {
      prev.outline.visible = false;
      prev.node.y = prev.y;
    }
    this.selected = id;
    const cur = id ? this.buildings.get(id) : null;
    if (cur) {
      cur.outline.visible = true;
      if (fly) {
        const z = Math.max(this.world.scale.x, 0.7);
        this.flyTo(cur.x + this.focusOffsetX / z, cur.y - 120, z);
      }
    }
  }

  setFilter(ids: Set<string> | null) {
    this.filter = ids;
    this.applyFilter();
  }

  private applyFilter() {
    for (const [id, b] of this.buildings) b.node.alpha = !this.filter || this.filter.has(id) ? 1 : 0.28;
  }

  private screenToWorld(sx: number, sy: number) {
    const s = this.world.scale.x;
    return { x: (sx - this.world.x) / s, y: (sy - this.world.y) / s };
  }

  /** Centre the camera on world point (x,y) at zoom z. */
  private setCamera(x: number, y: number, z: number) {
    const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
    this.world.scale.set(zoom);
    this.world.position.set(this.app.screen.width / 2 - x * zoom, this.app.screen.height / 2 - y * zoom);
    this.clampCamera();
  }

  private camera(): [number, number, number] {
    const z = this.world.scale.x;
    return [(this.app.screen.width / 2 - this.world.x) / z, (this.app.screen.height / 2 - this.world.y) / z, z];
  }

  private clampCamera() {
    const T = this.radiusPlots * PLOT_TILES;
    const halfW = tileToWorld(T, -T).x;
    const maxY = tileToWorld(T, T).y;
    const [x, y, z] = this.camera();
    const cx = Math.max(-halfW, Math.min(halfW, x));
    const cy = Math.max(-maxY * 0.1, Math.min(maxY, y));
    if (cx !== x || cy !== y) this.world.position.set(this.app.screen.width / 2 - cx * z, this.app.screen.height / 2 - cy * z);
  }

  flyTo(x: number, y: number, z: number) {
    if (this.opts.reducedMotion) return this.setCamera(x, y, z);
    this.tween = { from: this.camera(), to: [x, y, Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z))], t: 0, dur: 620 };
  }

  flyToSpace(id: string) {
    const b = this.buildings.get(id);
    if (b) {
      const z = Math.max(this.world.scale.x, 0.7);
      this.flyTo(b.x + this.focusOffsetX / z, b.y - 120, z);
    }
  }

  flyHome() {
    this.flyTo(0, tileToWorld(2, 2).y + 120, this.host.clientWidth < 768 ? 0.36 : 0.52);
  }

  panBy(dx: number, dy: number) {
    this.tween = null;
    this.world.x += dx;
    this.world.y += dy;
    this.clampCamera();
  }

  zoomBy(factor: number, sx = this.app.screen.width / 2, sy = this.app.screen.height / 2) {
    this.tween = null;
    const before = this.screenToWorld(sx, sy);
    const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, this.world.scale.x * factor));
    this.world.scale.set(z);
    this.world.position.set(sx - before.x * z, sy - before.y * z);
    this.clampCamera();
  }

  private handleWheel(e: WheelEvent) {
    e.preventDefault();
    const rect = this.app.canvas.getBoundingClientRect();
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    if (e.ctrlKey || Math.abs(dy) > 0) this.zoomBy(Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0016)), e.clientX - rect.left, e.clientY - rect.top);
  }

  private pointerDown(e: FederatedPointerEvent) {
    this.pointers.set(e.pointerId, { x: e.global.x, y: e.global.y });
    this.dragMoved = false;
    this.tween = null;
    if (this.pointers.size === 1) {
      this.dragStart = { x: e.global.x, y: e.global.y, wx: this.world.x, wy: this.world.y };
    } else if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = { dist: Math.hypot(a!.x - b!.x, a!.y - b!.y), zoom: this.world.scale.x };
      this.dragStart = null;
    }
  }

  private pointerMove(e: FederatedPointerEvent) {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, { x: e.global.x, y: e.global.y });
    if (this.pinch && this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      const target = this.pinch.zoom * (dist / this.pinch.dist);
      this.zoomBy(target / this.world.scale.x, (a!.x + b!.x) / 2, (a!.y + b!.y) / 2);
      this.dragMoved = true;
      return;
    }
    if (!this.dragStart) return;
    const dx = e.global.x - this.dragStart.x, dy = e.global.y - this.dragStart.y;
    if (!this.dragMoved && Math.hypot(dx, dy) < 6) return;
    if (!this.dragMoved) {
      this.dragMoved = true;
      this.app.canvas.style.cursor = "grabbing";
      this.setHovered(null);
    }
    this.world.position.set(this.dragStart.wx + dx, this.dragStart.wy + dy);
    this.clampCamera();
  }

  private pointerUp(e: FederatedPointerEvent) {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    if (this.pointers.size === 0) {
      this.dragStart = null;
      this.app.canvas.style.cursor = "";
      // let the tap handler see dragMoved first, then reset
      setTimeout(() => (this.dragMoved = false), 0);
    }
  }

  // --------------------------------------------------------------------------- frame loop

  private tick(dt: number) {
    const t0 = performance.now();
    this.elapsed += dt;
    if (this.tween) {
      this.tween.t += dt;
      const k = Math.min(1, this.tween.t / this.tween.dur);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      const [fx, fy, fz] = this.tween.from, [tx, ty, tz] = this.tween.to;
      this.setCamera(fx + (tx - fx) * e, fy + (ty - fy) * e, fz + (tz - fz) * e);
      if (k >= 1) this.tween = null;
    }
    if (!this.opts.reducedMotion) {
      const s = this.elapsed / 1000;
      for (const a of this.animated) {
        if (a.obj.culled) continue;
        switch (a.kind) {
          case "sway":
            a.obj.skew.x = Math.sin(s * 1.3 + a.phase) * 0.025;
            break;
          case "flag":
            a.obj.skew.y = Math.sin(s * 3 + a.phase) * 0.12;
            a.obj.scale.x = 0.92 + Math.sin(s * 2.2 + a.phase) * 0.08;
            break;
          case "pulse": {
            const k = ((s * 0.6 + a.phase) % 1 + 1) % 1;
            a.obj.scale.set(0.85 + k * 0.3);
            a.obj.alpha = (1 - k) * 0.7;
            break;
          }
          case "glow":
            a.obj.alpha = 0.75 + Math.sin(s * 2 + a.phase) * 0.25;
            break;
        }
      }
      for (const w of this.walkers) {
        w.t += (dt / 1000) * w.speed;
        const k = w.t % 2 < 1 ? w.t % 1 : 1 - (w.t % 1);
        const tx = w.ax + (w.bx - w.ax) * k, ty = w.ay + (w.by - w.ay) * k;
        const p = tileToWorld(tx, ty);
        w.obj.position.set(p.x, p.y - Math.abs(Math.sin(s * 9 + w.speed * 1000)) * 3);
        w.obj.zIndex = (tx + ty) * 10 + 3;
        w.obj.scale.x = (w.t % 2 < 1) === (w.bx - w.ax > 0) ? 1 : -1;
      }
      const R = this.radiusPlots * PLOT_TILES;
      const limit = tileToWorld(R, R).y;
      for (const c of this.clouds) {
        c.obj.x += (c.vx * dt) / 1000;
        c.obj.y += (c.vy * dt) / 1000;
        if (c.obj.y > limit) c.obj.position.set(tileToWorld(-R, -R).x - 200, -100);
      }
    }
    this.statAcc.frames++;
    this.statAcc.ms += dt;
    this.statAcc.draw += performance.now() - t0;
    if (this.statAcc.ms >= 1000 && this.cb.onStats) {
      let visible = 0;
      for (const c of this.objects.children) if (!c.culled) visible++;
      this.cb.onStats({
        fps: Math.round((this.statAcc.frames * 1000) / this.statAcc.ms),
        buildings: this.buildings.size,
        visibleObjects: visible,
        drawMs: +(this.statAcc.draw / this.statAcc.frames).toFixed(2),
      });
      this.statAcc = { frames: 0, ms: 0, draw: 0 };
    }
  }

  destroy() {
    this.destroyed = true;
    if (!this.app) return;
    this.app.canvas.removeEventListener("wheel", this.onWheel);
    this.app.destroy(true, { children: true });
  }
}

// Theme accents re-exported for the DOM layer so map + panel use the same colours.
export const DISTRICT_ACCENTS: Record<string, string> = Object.fromEntries(
  DISTRICTS.map((d) => [d.id, `#${THEMES[d.theme as ThemeKey].accent.toString(16).padStart(6, "0")}`]),
);
export { shade };
