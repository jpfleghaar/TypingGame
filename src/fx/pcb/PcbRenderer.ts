import { Application, Assets, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { AdvancedBloomFilter } from 'pixi-filters';
import { pendingGarbage, ticksToMs, type GameEvent, type GameState, type PlayerId } from '../../core';
import { THEMES, type Rgb, type ThemeDef } from '../../theme/themes';
import type { GameView } from '../../ui/gameView';
import { pointAt, polyline, type Point, type Polyline } from '../net/geometry';
import type { ThemeRenderer } from '../ThemeRenderer';
import { padIndexForSlot, PCB_IMAGE, PCB_LAYOUT, PCB_MENU_IMAGE, PCB_TRACE_MASKS, type PadDef } from './board';

/**
 * Platinen-Theme mit Hintergrundbild, WebGL (PixiJS) und Bloom.
 *
 * Eigene WebGL-Ebene HINTER dem DOM. Alles liegt in einer "Welt" in
 * Bild-Koordinaten (1372 × 768), die genauso skaliert wird wie die
 * Spielfläche der GameView – Karten, Bahnen und Effekte decken sich.
 *
 * Schichten: Bild → Abdunkelung ausgeschiedener Bahnen → Lichtebene mit Bloom
 * (leuchtende Bahn-Bündel, Datenverkehr, Pakete, Funken, Combo-Rahmen) → Vignette.
 *
 * Die Bahnen im Bild verbinden die Anschlüsse P1–P10 mit dem Chip unter dem
 * Posteingang. Greift ein Gegner an, leuchtet sein Bündel rot; scheidet er aus,
 * wird es dunkel. Hinter dem Text bewegt sich nichts.
 */

const RECENT_WINDOW_MS = 10_000;
const TRAIL = 8;

const toHex = (c: Rgb) => (c[0] << 16) | (c[1] << 8) | c[2];

interface TraceView {
  playerId: number;
  pad: PadDef;
  path: Polyline;
  /** Länge vom Pad bis zum Rand des Posteingangs (dahinter keine Bewegung). */
  visibleLen: number;
  glow: Sprite;
  dark: Sprite;
  koAt: number;
  flashAt: number;
}

interface Dot {
  sprite: Sprite;
  trace: TraceView | null;
  d: number;
  dir: 1 | -1;
  speed: number;
}

interface Packet {
  head: Sprite;
  trail: Sprite[];
  path: Polyline | null;
  /** Weg auf der Linie: von Distanz `from` nach `to`. */
  from: number;
  to: number;
  t0: number;
  dur: number;
  color: number;
  scale: number;
  strength: number;
  onArrive: (() => void) | null;
}

interface Spark {
  sprite: Sprite;
  vx: number;
  vy: number;
  age: number;
  life: number;
}

export class PcbRenderer implements ThemeRenderer {
  readonly kind = 'pcb' as const;

  /** WebGL verfügbar? Sonst nutzt main.ts den Canvas-2D-Renderer. */
  static isSupported(): boolean {
    try {
      const c = document.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch {
      return false;
    }
  }

  private theme: ThemeDef = THEMES.datanet;
  private readonly canvas: HTMLCanvasElement;
  private app: Application | null = null;
  private ready = false;
  private wantRunning = false;
  private motion = true;
  private time = 0;

  // Szene
  private world = new Container();
  private boardSprite = new Sprite();
  private dim = new Graphics();
  private darkLayer = new Container();
  private glow = new Container();
  private traceGlow = new Container();
  private frame2 = new Graphics();
  private dotLayer = new Container();
  private packetLayer = new Container();
  private sparkLayer = new Container();
  private vignette = new Sprite();
  private dotTex: Texture = Texture.WHITE;
  private maskTex: Texture[] = [];
  private boardTex: Texture = Texture.EMPTY;
  private menuTex: Texture = Texture.EMPTY;

  // Pools
  private dots: Dot[] = [];
  private packets: Packet[] = [];
  private sparks: Spark[] = [];

  // Spiel
  private view: GameView | null = null;
  private me: PlayerId = 0;
  private state: GameState | null = null;
  private traces = new Map<number, TraceView>();
  /** Posteingang in Bild-Koordinaten. */
  private stack: { x: number; y: number; width: number; height: number } | null = null;
  private layoutDirty = true;
  private recent: { tick: number; chars: number }[] = [];
  private wpm = 0;

  constructor(
    private readonly bg2d: HTMLCanvasElement,
    private readonly fg2d: HTMLCanvasElement,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'fx-gl';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.canvas.hidden = true;
    document.body.insertBefore(this.canvas, document.getElementById('app'));
    window.addEventListener('resize', () => (this.layoutDirty = true));
    void this.init();
  }

  private async init(): Promise<void> {
    const app = new Application();
    await app.init({
      canvas: this.canvas,
      backgroundAlpha: 0,
      antialias: true,
      resizeTo: window,
      resolution: Math.min(2, window.devicePixelRatio || 1),
      autoDensity: true,
      preference: 'webgl',
      preserveDrawingBuffer: location.search.includes('shot'),
    });
    this.app = app;
    this.dotTex = this.makeDotTexture();
    const [board, menu, ...masks] = await Promise.all(
      [PCB_IMAGE, PCB_MENU_IMAGE, ...PCB_TRACE_MASKS].map((u) => Assets.load<Texture>(u)),
    );
    menu.source.autoGenerateMipmaps = true;
    menu.source.updateMipmaps();
    this.boardTex = board;
    this.menuTex = menu;
    // Das Bild kann höher aufgelöst sein als die Spielfläche (z. B. 2×): auf Spielflächen-Größe
    // setzen, damit es am Bildschirm in voller Schärfe erscheint; Mipmaps für sauberes Verkleinern.
    board.source.autoGenerateMipmaps = true;
    board.source.updateMipmaps();
    this.boardSprite.texture = board;
    this.boardSprite.width = PCB_LAYOUT.width;
    this.boardSprite.height = PCB_LAYOUT.height;
    this.maskTex = masks;

    this.glow.addChild(this.traceGlow, this.frame2, this.dotLayer, this.packetLayer, this.sparkLayer);
    this.world.addChild(this.boardSprite, this.dim, this.darkLayer, this.glow);
    app.stage.addChild(this.world, this.vignette);
    this.applyBloom();
    this.makePools();
    app.ticker.add((t) => this.update(t.deltaMS));
    this.ready = true;
    this.layoutDirty = true;
    if (this.wantRunning) this.start();
    else app.ticker.stop();
  }

  /* ---------- ThemeRenderer ---------- */

  setTheme(theme: ThemeDef): void {
    this.theme = theme;
    this.layoutDirty = true;
    this.applyBloom();
  }

  start(): void {
    this.wantRunning = true;
    this.canvas.hidden = false;
    // Die 2D-Ebenen gehören anderen Renderern – hier leer halten
    this.bg2d.getContext('2d')?.clearRect(0, 0, this.bg2d.width, this.bg2d.height);
    this.fg2d.getContext('2d')?.clearRect(0, 0, this.fg2d.width, this.fg2d.height);
    if (this.ready) this.app!.ticker.start();
  }

  stop(): void {
    this.wantRunning = false;
    if (this.ready) this.app!.ticker.stop();
  }

  clear(): void {
    this.canvas.hidden = true;
  }

  setMotion(enabled: boolean): void {
    this.motion = enabled;
    if (!enabled) {
      for (const d of this.dots) this.releaseDot(d);
      for (const p of this.packets) this.releasePacket(p);
    }
  }

  attach(view: GameView, me: PlayerId): void {
    this.view = view;
    this.me = me;
    this.state = null;
    this.recent = [];
    this.layoutDirty = true;
  }

  detach(): void {
    this.view = null;
    this.state = null;
    this.clearTraces();
    for (const d of this.dots) this.releaseDot(d);
    for (const p of this.packets) this.releasePacket(p);
    for (const s of this.sparks) s.sprite.visible = false;
    this.frame2.clear();
    this.layoutDirty = true; // Menü: Bild bildschirmfüllend und dunkler
  }

  handle(events: GameEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'WORD_CLEARED':
          if (e.playerId === this.me) this.recent.push({ tick: this.state?.tick ?? 0, chars: e.word.text.length });
          break;
        case 'ATTACK_SENT':
          this.onAttack(e.from, e.to, e.amount);
          break;
        case 'GARBAGE_CANCELLED':
          if (e.playerId === this.me) this.burstAt(this.entryOf(e.from), toHex(this.theme.palette.good), 16);
          break;
        case 'GARBAGE_ARRIVED':
          if (e.playerId === this.me) {
            this.burstAt(this.entryOf(e.from), toHex(this.theme.palette.danger), 18);
            this.view?.flashBoard();
          }
          break;
        case 'PLAYER_KO': {
          const tv = this.traces.get(e.playerId);
          if (tv) {
            tv.koAt = this.time;
            const byMe = e.by === this.me;
            this.burstAt(tv.pad.pad, toHex(byMe ? this.theme.palette.good : this.theme.palette.danger), byMe ? 30 : 14);
          }
          break;
        }
      }
    }
  }

  frame(state: GameState): void {
    this.state = state;
    const nowMs = ticksToMs(state.tick, state.config);
    this.recent = this.recent.filter((r) => nowMs - ticksToMs(r.tick, state.config) <= RECENT_WINDOW_MS);
    const windowMs = Math.max(3000, Math.min(RECENT_WINDOW_MS, nowMs));
    this.wpm = this.recent.reduce((s, r) => s + r.chars, 0) / 5 / (windowMs / 60_000);
  }

  /* ---------- Aufbau ---------- */

  private applyBloom(): void {
    if (!this.app) return;
    const b = this.theme.net.gl.bloom;
    this.glow.filters = [
      new AdvancedBloomFilter({ threshold: b.threshold, bloomScale: b.scale, brightness: b.brightness, blur: b.blur, quality: b.quality }),
    ];
  }

  private makeDotTexture(): Texture {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 32, 32);
    return Texture.from(c);
  }

  private sprite(layer: Container): Sprite {
    const s = new Sprite(this.dotTex);
    s.anchor.set(0.5);
    s.blendMode = 'add';
    s.visible = false;
    layer.addChild(s);
    return s;
  }

  private makePools(): void {
    for (let i = 0; i < this.theme.net.traffic.poolSize; i++) {
      this.dots.push({ sprite: this.sprite(this.dotLayer), trace: null, d: 0, dir: 1, speed: 0 });
    }
    for (let i = 0; i < 48; i++) {
      this.packets.push({
        head: this.sprite(this.packetLayer),
        trail: Array.from({ length: TRAIL }, () => this.sprite(this.packetLayer)),
        path: null,
        from: 0,
        to: 0,
        t0: 0,
        dur: 0,
        color: 0xffffff,
        scale: 1,
        strength: 1,
        onArrive: null,
      });
    }
    for (let i = 0; i < 260; i++) this.sparks.push({ sprite: this.sprite(this.sparkLayer), vx: 0, vy: 0, age: 0, life: 0 });
  }

  private clearTraces(): void {
    for (const tv of this.traces.values()) {
      tv.glow.destroy();
      tv.dark.destroy();
    }
    this.traces.clear();
    this.stack = null;
  }

  /** Welt an Fenster bzw. Spielfläche ausrichten und Gegner den Pads zuordnen. */
  private measure(): void {
    if (!this.app || !this.ready) return;
    const sw = this.app.renderer.width / this.app.renderer.resolution;
    const sh = this.app.renderer.height / this.app.renderer.resolution;
    const { width: W, height: H } = PCB_LAYOUT;
    const gl = this.theme.net.gl;
    this.clearTraces();

    const tf = this.view?.stageTransform();
    const onBoard = !!(this.view && this.view.hasBoardLayout());
    if (onBoard && tf) {
      this.world.position.set(tf.x, tf.y);
      this.world.scale.set(tf.scale);
    } else {
      // Menü / andere Layouts: Bild bildschirmfüllend (cover)
      const s = Math.max(sw / W, sh / H);
      this.world.scale.set(s);
      this.world.position.set((sw - W * s) / 2, (sh - H * s) / 2);
    }
    // Im Spiel das Bild mit den Anschlüssen P1–P10, sonst das Menü-Bild
    this.boardSprite.texture = this.view ? this.boardTex : this.menuTex;
    this.boardSprite.width = W;
    this.boardSprite.height = H;
    this.dim.clear().rect(0, 0, W, H).fill({ color: 0x000000, alpha: this.view ? gl.dimGame : gl.dimMenu });

    if (onBoard && tf && this.view) {
      const r = this.view.stackRect();
      this.stack = { x: (r.x - tf.x) / tf.scale, y: (r.y - tf.y) / tf.scale, width: r.width / tf.scale, height: r.height / tf.scale };
      const order = this.view.opponentOrder();
      order.forEach((playerId, i) => {
        const padIdx = padIndexForSlot(i);
        const pad = PCB_LAYOUT.pads[padIdx];
        const tex = this.maskTex[padIdx];
        if (!pad || !tex) return;
        const path = polyline(pad.path);
        const mk = (layer: Container, blend: 'add' | 'normal') => {
          const s = new Sprite(tex);
          s.position.set(pad.mask.x, pad.mask.y);
          s.blendMode = blend;
          s.alpha = 0;
          layer.addChild(s);
          return s;
        };
        this.traces.set(playerId, {
          playerId,
          pad,
          path,
          visibleLen: this.visibleLength(path),
          glow: mk(this.traceGlow, 'add'),
          dark: mk(this.darkLayer, 'normal'),
          koAt: -1,
          flashAt: -99,
        });
      });
    }
    this.bakeVignette(sw, sh);
    this.layoutDirty = false;
  }

  /** Bis wohin ist die Bahn sichtbar? (Eintritt in den Posteingang) */
  private visibleLength(path: Polyline): number {
    const s = this.stack;
    if (!s) return path.length;
    const p: Point = { x: 0, y: 0 };
    for (let d = 0; d <= path.length; d += 2) {
      pointAt(path, d, p);
      if (p.x > s.x - 4 && p.x < s.x + s.width + 4 && p.y > s.y - 4 && p.y < s.y + s.height + 4) return Math.max(0, d - 2);
    }
    return path.length;
  }

  private bakeVignette(w: number, h: number): void {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w / 4));
    c.height = Math.max(1, Math.round(h / 4));
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(c.width / 2, c.height / 2, Math.min(c.width, c.height) * 0.4, c.width / 2, c.height / 2, Math.max(c.width, c.height) * 0.75);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, `rgba(0,0,0,${this.theme.net.gl.vignette})`);
    g.fillStyle = grad;
    g.fillRect(0, 0, c.width, c.height);
    const old = this.vignette.texture;
    this.vignette.texture = Texture.from(c);
    this.vignette.width = w;
    this.vignette.height = h;
    if (old && old !== Texture.EMPTY && old !== Texture.WHITE) old.destroy(true);
  }

  /* ---------- Pakete & Funken ---------- */

  /** Punkt, an dem die Bahn eines Gegners im Posteingang verschwindet. */
  private entryOf(id: PlayerId): Point | null {
    const tv = this.traces.get(id);
    return tv ? pointAt(tv.path, tv.visibleLen) : null;
  }

  private onAttack(from: PlayerId, to: PlayerId, amount: number): void {
    const red = toHex(this.theme.palette.danger);
    const size = 1 + Math.min(3, amount) * 0.35;
    if (!this.motion) {
      // Bewegungsreduziert: Bahn leuchtet kurz auf statt Paket
      for (const id of [from, to]) {
        const tv = this.traces.get(id);
        if (tv) tv.flashAt = this.time;
      }
      if (from === this.me) this.view?.hitCard(to, amount);
      return;
    }
    if (from === this.me) {
      const tv = this.traces.get(to);
      if (!tv) return;
      // mehrere Müllwörter = mehrere Impulse hintereinander
      for (let i = 0; i < Math.min(3, amount); i++) {
        this.launch(tv, tv.visibleLen, 0, red, size, 1, i * 0.09, i === 0 ? () => this.view?.hitCard(to, amount) : null);
      }
    } else if (to === this.me) {
      const tv = this.traces.get(from);
      if (tv) for (let i = 0; i < Math.min(3, amount); i++) this.launch(tv, 0, tv.visibleLen, red, size, 1, i * 0.09, null);
    } else {
      // Bot → Bot: schwächeres Licht über beide Bahnen (der Chip ist der Router)
      const a = this.traces.get(from);
      const b = this.traces.get(to);
      if (!a || !b) return;
      const dur = this.durFor(a.visibleLen);
      this.launch(a, 0, a.visibleLen, red, 0.75, 0.45, 0, null);
      this.launch(b, b.visibleLen, 0, red, 0.75, 0.45, dur + 0.12, null);
    }
  }

  private durFor(len: number): number {
    const pk = this.theme.net.packet;
    const k = Math.min(1, len / 400);
    return (pk.minMs + (pk.maxMs - pk.minMs) * k) / 1000;
  }

  private launch(tv: TraceView, from: number, to: number, color: number, scale: number, strength: number, delay: number, onArrive: (() => void) | null): void {
    const pk = this.packets.find((q) => !q.path);
    if (!pk) return;
    pk.path = tv.path;
    pk.from = from;
    pk.to = to;
    pk.color = color;
    pk.scale = scale;
    pk.strength = strength;
    pk.t0 = this.time + delay;
    pk.dur = this.durFor(Math.abs(to - from));
    pk.onArrive = onArrive;
  }

  private releasePacket(p: Packet): void {
    p.path = null;
    p.onArrive = null;
    p.head.visible = false;
    for (const t of p.trail) t.visible = false;
  }

  private releaseDot(d: Dot): void {
    d.trace = null;
    d.sprite.visible = false;
  }

  private burstAt(at: Point | null, color: number, count: number): void {
    if (!at || !this.motion) return;
    let n = count;
    for (const s of this.sparks) {
      if (n <= 0) break;
      if (s.sprite.visible) continue;
      const a = Math.random() * Math.PI * 2;
      const v = 40 + Math.random() * 160;
      s.vx = Math.cos(a) * v;
      s.vy = Math.sin(a) * v;
      s.age = 0;
      s.life = 0.35 + Math.random() * 0.35;
      s.sprite.position.set(at.x, at.y);
      s.sprite.tint = color;
      s.sprite.visible = true;
      n--;
    }
  }

  /* ---------- Frame ---------- */

  private update(dtMs: number): void {
    const dt = Math.min(0.05, dtMs / 1000);
    this.time += dt; // läuft auch bewegungsreduziert (für K.O.-Ausblendung und Aufleuchten)
    if (this.layoutDirty) this.measure();
    this.updateTraces();
    if (this.motion) {
      this.updateTraffic(dt);
      this.updatePackets();
      this.updateSparks(dt);
    }
  }

  private updateTraces(): void {
    const st = this.state;
    const pal = this.theme.palette;
    const n = this.theme.net;
    const g = n.gl.glow;
    const me = st?.players[this.me];
    const attackers = new Set<number>();
    if (me?.alive) for (const inc of me.incoming) attackers.add(inc.from);
    const hot = this.wpm >= n.traffic.hotWpm ? g.hot : 0;
    const pulse = this.motion ? 0.55 + 0.45 * Math.sin(this.time * Math.PI * 2 * n.incomingPulseHz) : 0.85;

    for (const [id, tv] of this.traces) {
      const alive = st?.players[id]?.alive ?? true;
      let tint = toHex(pal.good);
      let alpha = g.normal + hot;
      let dark = 0;
      if (!alive) {
        const since = (this.time - tv.koAt) * 1000;
        alpha = 0;
        if (tv.koAt >= 0 && since < n.ko.flickerMs) {
          // kurzes Flackern, dann erlöschen (weit weg vom Text)
          tint = toHex(pal.danger);
          alpha = this.motion && Math.sin(since * 0.09) > 0 ? 0.9 : 0.15;
        } else if (tv.koAt >= 0 && since < n.ko.flickerMs + n.ko.fadeMs) {
          dark = n.gl.deadDarkness * ((since - n.ko.flickerMs) / n.ko.fadeMs);
        } else dark = n.gl.deadDarkness;
      } else if (attackers.has(id)) {
        tint = toHex(pal.danger);
        alpha = g.attacker * pulse;
      } else if (me?.alive && me.targetId === id) {
        alpha = g.target;
      }
      const flash = this.time - tv.flashAt;
      if (flash < 0.35) {
        tint = toHex(pal.danger);
        alpha = Math.max(alpha, 1 - flash / 0.35);
      }
      tv.glow.tint = tint;
      tv.glow.alpha = Math.min(1, alpha);
      tv.dark.tint = toHex(pal.bg);
      tv.dark.alpha = dark;
    }

    // Combo-Rahmen und Spam-Warnung um den Posteingang
    const f = this.frame2;
    f.clear();
    if (this.stack && me?.alive) {
      const s = this.stack;
      const combo = me.combo;
      // Gleiche Stufen wie die Punkte-Tempostufen (10 / 20)
      const k = combo >= 20 ? 1 : combo >= 10 ? 0.7 : combo >= 5 ? 0.45 : combo >= 1 ? 0.2 : 0;
      if (k > 0) {
        f.roundRect(s.x - 4, s.y - 4, s.width + 8, s.height + 8, 9).stroke({
          width: n.combo.frameWidth + k * 1.5,
          color: toHex(pal.good),
          alpha: 0.25 + k * 0.6,
        });
      }
      if (pendingGarbage(me.incoming) > 0) {
        f.roundRect(s.x - 9, s.y - 9, s.width + 18, s.height + 18, 12).stroke({ width: 1.4, color: toHex(pal.danger), alpha: 0.4 * pulse });
      }
    }
  }

  private updateTraffic(dt: number): void {
    const st = this.state;
    if (!st || this.traces.size === 0) {
      for (const d of this.dots) if (d.trace) this.releaseDot(d);
      return;
    }
    const t = this.theme.net.traffic;
    const per10 = this.wpm / 10;
    const density = t.baseDensity + t.densityPer10Wpm * per10;
    const speed = t.baseSpeed + t.speedPer10Wpm * per10;
    const good = toHex(this.theme.palette.good);

    const counts = new Map<TraceView, number>();
    for (const d of this.dots) if (d.trace) counts.set(d.trace, (counts.get(d.trace) ?? 0) + 1);
    for (const [id, tv] of this.traces) {
      if (!st.players[id]?.alive) continue;
      const want = Math.round(density * (tv.visibleLen / 250));
      let have = counts.get(tv) ?? 0;
      for (const d of this.dots) {
        if (have >= want) break;
        if (d.trace) continue;
        d.trace = tv;
        d.dir = Math.random() < 0.5 ? 1 : -1;
        d.d = Math.random() * tv.visibleLen;
        d.speed = speed * (0.7 + Math.random() * 0.6);
        d.sprite.visible = true;
        d.sprite.tint = good;
        d.sprite.scale.set(t.dotRadius / 6);
        d.sprite.alpha = t.alpha;
        have++;
      }
    }

    const tmp: Point = { x: 0, y: 0 };
    for (const d of this.dots) {
      const tv = d.trace;
      if (!tv) continue;
      if (!st.players[tv.playerId]?.alive) {
        this.releaseDot(d);
        continue;
      }
      d.d += d.dir * d.speed * dt;
      if (d.d < 0 || d.d > tv.visibleLen) {
        this.releaseDot(d);
        continue;
      }
      pointAt(tv.path, d.d, tmp);
      d.sprite.position.set(tmp.x, tmp.y);
    }
  }

  private updatePackets(): void {
    const tmp: Point = { x: 0, y: 0 };
    for (const p of this.packets) {
      if (!p.path) continue;
      const raw = (this.time - p.t0) / p.dur;
      if (raw < 0) continue; // gestaffelt, noch nicht gestartet
      if (raw >= 1) {
        const end = pointAt(p.path, p.to);
        const cb = p.onArrive;
        if (p.strength >= 1) this.burstAt(end, p.color, 10);
        this.releasePacket(p);
        cb?.();
        continue;
      }
      const ease = raw < 0.5 ? 2 * raw * raw : 1 - Math.pow(-2 * raw + 2, 2) / 2;
      const at = (k: number) => pointAt(p.path!, p.from + (p.to - p.from) * k, tmp);
      const head = at(ease);
      p.head.visible = true;
      p.head.position.set(head.x, head.y);
      p.head.tint = 0xffe2d8;
      p.head.scale.set(0.3 * p.scale);
      p.head.alpha = p.strength;
      const trailLen = this.theme.net.packet.trailLength * 2;
      for (let i = 0; i < p.trail.length; i++) {
        const k = Math.max(0, ease - ((i + 1) / p.trail.length) * trailLen);
        const pt = at(k);
        const s = p.trail[i];
        s.visible = true;
        s.position.set(pt.x, pt.y);
        s.tint = p.color;
        s.scale.set(p.scale * (0.42 - i * 0.035));
        s.alpha = p.strength * 0.6 * (1 - i / p.trail.length);
      }
    }
  }

  private updateSparks(dt: number): void {
    for (const s of this.sparks) {
      if (!s.sprite.visible) continue;
      s.age += dt;
      if (s.age >= s.life) {
        s.sprite.visible = false;
        continue;
      }
      s.vx *= 0.9;
      s.vy *= 0.9;
      s.sprite.x += s.vx * dt;
      s.sprite.y += s.vy * dt;
      const k = 1 - s.age / s.life;
      s.sprite.alpha = k;
      s.sprite.scale.set(0.12 + 0.12 * k);
    }
  }
}
