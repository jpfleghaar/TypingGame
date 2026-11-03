import {
  chainLength,
  duskLevel,
  other,
  waterline,
  type CargoItem,
  type Drift,
  type GameEvent,
  type GameState,
  type Projectile,
  type ShipId,
} from '../core';
import { PALETTE } from './palette';

/**
 * Ansicht über die Schulter: das eigene Segelboot vorne links von hinten (Heck),
 * der Gegner hinten rechts in der Ferne mit dem Bug zu uns. Die Kamera ist ruhig.
 *
 * Welt-Koordinaten: X seitlich, z Tiefe (0 = eigenes Boot, 1 = Gegner),
 * up = Höhe über Wasser. Alle Maße in „Nah-Pixeln“, die Projektion skaliert.
 */

/** Tiefgang als Anteil der Rumpfhöhe: leer 35 %, voll 100 % (Deck auf Wasserhöhe). */
const draftFrac = (ratio: number) => 0.35 + 0.65 * Math.min(1, Math.max(0, ratio));

const SINK_MS = 2600;
const FAR_SCALE = 0.36;
const K = 1 / FAR_SCALE - 1;
/** Treibgut: Start weit hinten, Ende kurz vor den Booten. */
const DRIFT_Z_START = 1.15;
const DRIFT_Z_END = 0.42;

interface Pt {
  x: number;
  y: number;
  s: number;
}
interface WorldPt {
  X: number;
  z: number;
  up: number;
}

/** Wort plus Tippfortschritt, wie er auf Kiste oder Fass erscheint. */
interface Label {
  text: string;
  typed: number;
  active: boolean;
  /** Falsch getippter Buchstabe, der per Backspace korrigiert werden muss. */
  error?: string | null;
}

export class SceneRenderer {
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private sinkStart: [number | null, number | null] = [null, null];
  private readonly reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private ro: ResizeObserver;
  private seaGrad: CanvasGradient | null = null;
  /** Letzte bekannte Fässer, damit Würfe/Abdrift an der Fassposition starten. */
  private driftCache = new Map<number, Drift>();
  /** Startpunkt von Projektilen, die aus einem Fass kommen. */
  private origins = new Map<number, WorldPt>();

  constructor(
    private canvas: HTMLCanvasElement,
    /** Dieses Schiff wird von hinten im Vordergrund gezeigt (im Online-Spiel je Client verschieden). */
    private viewer: ShipId,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();
  }

  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const r = this.canvas.getBoundingClientRect();
    this.w = r.width;
    this.h = r.height;
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.seaGrad = null;
  }

  reset(): void {
    this.sinkStart = [null, null];
    this.driftCache.clear();
    this.origins.clear();
  }

  onEvents(events: readonly GameEvent[], now: number, state?: GameState): void {
    let fished: { ship: ShipId; driftId: number } | null = null;
    for (const e of events) {
      if (e.type === 'SHIP_SUNK') this.sinkStart[e.ship] = now;
      if (e.type === 'DRIFT_FISHED') fished = { ship: e.ship, driftId: e.driftId };
      if (e.type === 'WORD_THROWN' && fished && fished.ship === e.ship && state) {
        const d = this.driftCache.get(fished.driftId);
        if (d) this.origins.set(e.projectileId, this.driftWorld(d, state.tick, 0));
        fished = null;
      }
      if (e.type === 'DRIFT_EXPIRED' && state) {
        const d = this.driftCache.get(e.driftId);
        if (d) this.origins.set(e.projectileId, this.driftWorld(d, state.tick, 0));
      }
    }
  }

  // --- Projektion -------------------------------------------------------------

  private get horizonY(): number {
    return this.h * 0.3;
  }
  private get nearY(): number {
    return this.h * 0.9;
  }
  /** Breite eines Boots in Nah-Pixeln. */
  private get beam(): number {
    return Math.min(this.w * 0.3, this.h * 0.62, 520);
  }
  /** Schriftgröße auf Kisten in Nah-Pixeln. */
  private get labelFont(): number {
    return Math.max(14, Math.min(24, this.beam * 0.048));
  }
  private shipX(id: ShipId): number {
    return id === this.viewer ? -this.w * 0.2 : this.w * 0.55;
  }
  private shipZ(id: ShipId): number {
    return id === this.viewer ? 0 : 1;
  }

  private project(X: number, z: number, up = 0): Pt {
    const s = 1 / (1 + K * z);
    return {
      x: this.w / 2 + X * s,
      y: this.horizonY + (this.nearY - this.horizonY) * s - up * s,
      s,
    };
  }

  private hullH(): number {
    return this.beam * 0.42;
  }

  /** Höhe des Decks über Wasser (Nah-Pixel). */
  private freeboard(state: GameState, id: ShipId): number {
    return this.hullH() * (1 - draftFrac(waterline(state, state.ships[id])));
  }

  // --- Frame ------------------------------------------------------------------

  render(state: GameState, alpha: number, now: number): void {
    const { ctx, w, h } = this;
    const dusk = duskLevel(state);
    ctx.clearRect(0, 0, w, h);
    for (const d of state.drift) this.driftCache.set(d.id, d);

    const sky = ctx.createLinearGradient(0, 0, 0, this.horizonY);
    sky.addColorStop(0, mix(PALETTE.skyTop, PALETTE.skyTopDusk, dusk));
    sky.addColorStop(1, mix(PALETTE.skyBottom, PALETTE.skyBottomDusk, dusk));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, this.horizonY + 1);

    this.drawSea(now);

    const opp = other(this.viewer);
    this.drawBoat(state, opp, now, 'bow');
    this.drawDrift(state, alpha, now);
    this.drawBoat(state, this.viewer, now, 'stern');

    this.drawGauge(state, this.viewer);
    this.drawGauge(state, opp);

    // Nach dem Untergang ist Schluss: keine eingefrorenen Würfe in der Luft
    if (state.phase !== 'over') {
      const ps = state.projectiles
        .map((p) => ({ p, pos: this.projectilePos(state, p, alpha) }))
        .sort((a, b) => b.pos.z - a.pos.z);
      for (const { p, pos } of ps) this.drawProjectile(p, pos);
    }
  }

  private seaGradient(): CanvasGradient {
    if (!this.seaGrad) {
      const g = this.ctx.createLinearGradient(0, this.horizonY, 0, this.h);
      g.addColorStop(0, PALETTE.seaFar);
      g.addColorStop(0.35, PALETTE.seaTop);
      g.addColorStop(1, PALETTE.seaBottom);
      this.seaGrad = g;
    }
    return this.seaGrad;
  }

  private drawSea(now: number): void {
    const { ctx } = this;
    ctx.fillStyle = this.seaGradient();
    ctx.fillRect(0, this.horizonY, this.w, this.h - this.horizonY);
    ctx.strokeStyle = PALETTE.waveLine;
    ctx.lineWidth = 1;
    const drift = this.reduced ? 0 : now * 0.00004;
    for (let i = 0; i < 16; i++) {
      const z = ((i / 16 + drift) % 1) * 1.8;
      const p = this.project(0, z);
      ctx.globalAlpha = 0.06 + 0.14 * p.s;
      ctx.beginPath();
      for (let x = 0; x <= this.w; x += 24) {
        const y = p.y + Math.sin((x * 0.02) / p.s + i) * 2 * p.s;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = PALETTE.seaLine;
    ctx.beginPath();
    ctx.moveTo(0, this.horizonY);
    ctx.lineTo(this.w, this.horizonY);
    ctx.stroke();
  }

  private roll(state: GameState, id: ShipId, now: number): number {
    if (this.reduced) return 0;
    const r = waterline(state, state.ships[id]);
    const storm = state.activeSea === 'storm' && !state.ships[id].mods.anchoredThisStorm ? 2.2 : 1;
    const amp = (0.008 + 0.025 * Math.min(1, r)) * storm;
    return Math.sin(now * 0.0011 + id * 1.7) * amp;
  }

  private sinking(id: ShipId, now: number): { down: number; tilt: number } {
    const at = this.sinkStart[id];
    if (at === null) return { down: 0, tilt: 0 };
    const t = this.reduced ? 1 : Math.min(1, (now - at) / SINK_MS);
    const e = t * t;
    return { down: e * this.beam * 2.4, tilt: e * 0.45 };
  }

  private drawBoat(state: GameState, id: ShipId, now: number, view: 'stern' | 'bow'): void {
    const { ctx } = this;
    const water = this.project(this.shipX(id), this.shipZ(id));
    const s = water.s;
    const B = this.beam * s;
    const hh = this.hullH() * s;
    const sink = this.sinking(id, now);
    const deckY = water.y - (this.freeboard(state, id) - sink.down) * s;
    const ratio = waterline(state, state.ships[id]);
    const side = view === 'stern' ? -1 : 1; // Segel schwingt vom Gegner weg

    // Alles unterhalb der Wasserlinie wird abgeschnitten (eingetauchter Rumpf, Untergang)
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, this.w, water.y);
    ctx.clip();
    ctx.translate(water.x, water.y);
    ctx.rotate(this.roll(state, id, now) + sink.tilt * side);
    ctx.translate(-water.x, -water.y);

    const x = water.x;
    const bottom = deckY + hh;

    if (view === 'stern') {
      const depth = B * 0.4;
      ctx.fillStyle = PALETTE.deckWood;
      ctx.beginPath();
      ctx.moveTo(x - B / 2, deckY);
      ctx.bezierCurveTo(x - B * 0.46, deckY - depth * 0.55, x - B * 0.2, deckY - depth * 0.9, x, deckY - depth);
      ctx.bezierCurveTo(x + B * 0.2, deckY - depth * 0.9, x + B * 0.46, deckY - depth * 0.55, x + B / 2, deckY);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = PALETTE.deck;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      this.drawRig(x, deckY - depth * 0.55, B, s, side, state, now);

      ctx.fillStyle = PALETTE.hull;
      ctx.beginPath();
      ctx.moveTo(x - B / 2, deckY);
      ctx.lineTo(x + B / 2, deckY);
      ctx.quadraticCurveTo(x + B * 0.42, bottom, x, bottom);
      ctx.quadraticCurveTo(x - B * 0.42, bottom, x - B / 2, deckY);
      ctx.fill();
      ctx.strokeStyle = PALETTE.deck;
      ctx.lineWidth = 2 * s + 0.5;
      ctx.beginPath();
      ctx.moveTo(x - B / 2, deckY);
      ctx.lineTo(x + B / 2, deckY);
      ctx.stroke();

      this.drawCratesStern(state, id, x, deckY, B, depth, s);
      this.drawLantern(state, x + B * 0.42, deckY - 10 * s, s);
    } else {
      this.drawRig(x, deckY - B * 0.1, B, s, side, state, now);
      ctx.fillStyle = PALETTE.hull;
      ctx.beginPath();
      ctx.moveTo(x - B / 2, deckY);
      ctx.lineTo(x + B / 2, deckY);
      ctx.quadraticCurveTo(x + B * 0.3, bottom - hh * 0.3, x, bottom);
      ctx.quadraticCurveTo(x - B * 0.3, bottom - hh * 0.3, x - B / 2, deckY);
      ctx.fill();
      ctx.strokeStyle = PALETTE.deck;
      ctx.lineWidth = Math.max(1, 2 * s);
      ctx.beginPath();
      ctx.moveTo(x, deckY);
      ctx.lineTo(x, bottom);
      ctx.moveTo(x - B / 2, deckY);
      ctx.lineTo(x + B / 2, deckY);
      ctx.stroke();
      this.drawCratesBow(state, id, x, deckY, B, s);
    }

    // 80-%-Markierung (wo das Wasser bei 80 % stünde)
    const markY = bottom - hh * draftFrac(state.cfg.catchup.threshold);
    const mw = view === 'stern' ? B * 0.46 : B * 0.4;
    ctx.strokeStyle = PALETTE.danger;
    ctx.setLineDash([6 * s + 2, 5 * s + 2]);
    ctx.lineWidth = Math.max(1.2, 2 * s);
    ctx.beginPath();
    ctx.moveTo(x - mw, markY);
    ctx.lineTo(x + mw, markY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Schaum an der Wasserlinie
    ctx.strokeStyle = ratio > state.cfg.catchup.threshold ? PALETTE.foamDanger : PALETTE.foam;
    ctx.lineWidth = Math.max(1, 2 * s);
    ctx.beginPath();
    ctx.ellipse(x, water.y, B * 0.52, 3 * s + 1, 0, 0, Math.PI);
    ctx.stroke();
  }

  /** Mast mit Großsegel (zur Seite ausgestellt) und Vorsegel. */
  private drawRig(x: number, baseY: number, B: number, s: number, side: number, state: GameState, now: number): void {
    const { ctx } = this;
    const mastH = this.beam * 1.15 * s;
    const top = baseY - mastH;
    const boomY = baseY - mastH * 0.08;
    const boomX = x + side * B * 0.62;
    const billow = this.reduced ? 0 : Math.sin(now * 0.0015) * 3 * s;

    ctx.fillStyle = PALETTE.sailShade;
    ctx.beginPath();
    ctx.moveTo(x, top + mastH * 0.12);
    ctx.quadraticCurveTo(x - side * B * 0.32, baseY - mastH * 0.4, x - side * B * 0.34, baseY - mastH * 0.05);
    ctx.lineTo(x, baseY - mastH * 0.05);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = PALETTE.sail;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.quadraticCurveTo(x + side * (B * 0.5 + billow), baseY - mastH * 0.45, boomX, boomY);
    ctx.lineTo(x, boomY);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = PALETTE.sailEdge;
    ctx.lineWidth = Math.max(1, 1.5 * s);
    ctx.stroke();

    ctx.strokeStyle = PALETTE.mast;
    ctx.lineWidth = Math.max(1.5, 4 * s);
    ctx.beginPath();
    ctx.moveTo(x, baseY);
    ctx.lineTo(x, top);
    ctx.moveTo(x, boomY);
    ctx.lineTo(boomX, boomY);
    ctx.stroke();

    this.drawLantern(state, x, top, s);
  }

  private drawLantern(state: GameState, x: number, y: number, s: number): void {
    const dusk = duskLevel(state);
    if (dusk <= 0.35) return;
    const a = Math.min(1, (dusk - 0.35) * 2);
    const { ctx } = this;
    ctx.fillStyle = `rgba(255, 196, 110, ${a * 0.25})`;
    ctx.beginPath();
    ctx.arc(x, y, 14 * s + 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(255, 210, 130, ${a})`;
    ctx.beginPath();
    ctx.arc(x, y, 4 * s + 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- Kisten mit Wörtern -----------------------------------------------------

  /** Schriftgröße für einen Maßstab; in der Ferne nicht unter 11 px, damit lesbar. */
  private fontPx(s: number): number {
    return Math.max(11, this.labelFont * s);
  }

  /** Breite und Höhe einer Kiste: Breite folgt dem Wort, Höhe dem Gewicht. */
  private crateDims(text: string, weight: number, s: number): { w: number; h: number; font: number } {
    const font = this.fontPx(s);
    this.ctx.font = `600 ${font}px ${PALETTE.labelFamily}`;
    const tw = this.ctx.measureText(text).width;
    const h = font * (1.6 + Math.sqrt(weight) * 0.16);
    return { w: Math.max(h, tw + font * 1.1), h, font };
  }

  private labelFor(state: GameState, id: ShipId, c: CargoItem): Label {
    const t = state.ships[id].typing;
    const active = id === this.viewer && t.target?.kind === 'cargo' && t.target.id === c.id;
    return { text: c.text, typed: active ? t.typed : 0, active, error: active ? t.error : null };
  }

  /** Kisten auf dem eigenen Deck: drei Reihen von hinten nach vorne, dann gestapelt. */
  private drawCratesStern(state: GameState, id: ShipId, x: number, deckY: number, B: number, depth: number, s: number): void {
    const ROWS = 3;
    const rowWidth = (r: number) => B * (0.92 - r * 0.2);
    const rowScale = (r: number) => s * (1 - r * 0.08);
    type Placed = { c: CargoItem; px: number; py: number; s: number; row: number; layer: number };
    const placed: Placed[] = [];
    let row = 0;
    let layer = 0;
    let cursor = 0;
    let lift = 0;
    let layerMax = 0;
    for (const c of state.ships[id].cargo) {
      let d = this.crateDims(c.text, c.weight, rowScale(row));
      if (cursor > 0 && cursor + d.w > rowWidth(row)) {
        row++;
        cursor = 0;
        if (row >= ROWS) {
          row = 0;
          layer++;
          lift += layerMax * 0.92;
          layerMax = 0;
        }
        d = this.crateDims(c.text, c.weight, rowScale(row));
      }
      const py = deckY - 3 * s - row * depth * 0.32 - lift;
      placed.push({ c, px: x - rowWidth(row) / 2 + cursor, py, s: rowScale(row), row, layer });
      cursor += d.w + 3 * s;
      layerMax = Math.max(layerMax, d.h);
    }
    placed.sort((a, b) => a.layer - b.layer || b.row - a.row);
    for (const p of placed) this.drawCrate(this.labelFor(state, id, p.c), p.c, p.px, p.py, p.s);
  }

  /** Kisten auf dem gegnerischen Deck (Bugansicht): nebeneinander, dann gestapelt. */
  private drawCratesBow(state: GameState, id: ShipId, x: number, deckY: number, B: number, s: number): void {
    const width = B * 1.05;
    let cursor = 0;
    let lift = 0;
    let rowH = 0;
    for (const c of state.ships[id].cargo) {
      const d = this.crateDims(c.text, c.weight, s);
      if (cursor > 0 && cursor + d.w > width) {
        cursor = 0;
        lift += rowH * 0.95;
        rowH = 0;
      }
      this.drawCrate(this.labelFor(state, id, c), c, x - width / 2 + cursor, deckY - 1 - lift, s);
      cursor += d.w + 2;
      rowH = Math.max(rowH, d.h);
    }
  }

  /** Kiste mit Wort; (x, y) = linke untere Ecke der Vorderseite. */
  private drawCrate(label: Label, c: { weight: number; chain: number; stage: number }, x: number, y: number, s: number): void {
    const { ctx } = this;
    const d = this.crateDims(label.text, c.weight, s);
    const final = c.stage >= chainLength(c.chain);
    const top = d.h * 0.22;
    ctx.fillStyle = final ? PALETTE.crateHeavyTop : PALETTE.crateTop;
    ctx.beginPath();
    ctx.moveTo(x, y - d.h);
    ctx.lineTo(x + d.w, y - d.h);
    ctx.lineTo(x + d.w - top * 0.6, y - d.h - top);
    ctx.lineTo(x + top * 0.6, y - d.h - top);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = final ? PALETTE.crateHeavy : PALETTE.crate;
    ctx.fillRect(x, y - d.h, d.w, d.h);
    ctx.strokeStyle = PALETTE.crateEdge;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y - d.h + 0.5, d.w - 1, d.h - 1);
    if (final) {
      // Endstufe: Metallband
      ctx.fillStyle = PALETTE.crateBand;
      ctx.fillRect(x, y - d.h * 0.2, d.w, Math.max(1, d.h * 0.08));
    }
    if (label.active) {
      ctx.strokeStyle = label.error ? PALETTE.danger : PALETTE.good;
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 1.5, y - d.h - top - 1.5, d.w + 3, d.h + top + 3);
    }
    this.drawLabel(label, x + d.w / 2, y - d.h / 2, d.font, PALETTE.crateText);
    if (label.error) this.drawFixHint(x + d.w / 2, y - d.h - top - 6, d.font);
  }

  /** Wort zentriert zeichnen; getippte Buchstaben in der „gut“-Farbe. */
  private drawLabel(label: Label, cx: number, cy: number, font: number, color: string): void {
    const { ctx } = this;
    ctx.font = `600 ${font}px ${PALETTE.labelFamily}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const full = ctx.measureText(label.text).width;
    const done = label.text.slice(0, label.typed);
    const rest = label.text.slice(label.typed);
    const x0 = cx - full / 2;
    ctx.lineWidth = Math.max(2, font * 0.18);
    ctx.strokeStyle = PALETTE.labelOutline;
    ctx.lineJoin = 'round';
    ctx.strokeText(label.text, x0, cy);
    if (done) {
      ctx.fillStyle = PALETTE.good;
      ctx.fillText(done, x0, cy);
    }
    ctx.fillStyle = color;
    ctx.fillText(rest, x0 + ctx.measureText(done).width, cy);
    ctx.textBaseline = 'alphabetic';
  }

  /** Kleines Schild „⌫“ über dem Ziel, solange ein Tippfehler korrigiert werden muss. */
  private drawFixHint(cx: number, bottomY: number, font: number): void {
    const { ctx } = this;
    const f = Math.max(12, font * 0.8);
    ctx.font = `600 ${f}px system-ui, sans-serif`;
    const text = '⌫ Backspace';
    const w = ctx.measureText(text).width + f;
    const h = f * 1.6;
    ctx.fillStyle = PALETTE.danger;
    roundRect(ctx, cx - w / 2, bottomY - h, w, h, h / 2);
    ctx.fill();
    ctx.fillStyle = '#2a0b07';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, cx, bottomY - h / 2);
    ctx.textBaseline = 'alphabetic';
  }

  /** Füllstand je Schiff, mit 80-%-Strich. */
  private drawGauge(state: GameState, id: ShipId): void {
    const { ctx } = this;
    const mine = id === this.viewer;
    const base = this.project(this.shipX(id), this.shipZ(id));
    const s = base.s;
    const gh = this.beam * 1.1 * s;
    const gw = Math.max(5, 10 * s);
    const gx = mine ? base.x - this.beam * 0.9 * s : base.x + this.beam * 0.95 * s;
    const gy = base.y - gh - 10 * s;
    const r = Math.min(1, waterline(state, state.ships[id]));
    ctx.fillStyle = PALETTE.gaugeBg;
    ctx.fillRect(gx, gy, gw, gh);
    ctx.fillStyle = r > state.cfg.catchup.threshold ? PALETTE.danger : PALETTE.water;
    ctx.fillRect(gx, gy + gh * (1 - r), gw, gh * r);
    const my = gy + gh * (1 - state.cfg.catchup.threshold);
    ctx.fillStyle = PALETTE.danger;
    ctx.fillRect(gx - 3, my - 1, gw + 6, 2);
  }

  // --- Treibgut ----------------------------------------------------------------

  /** Seitlicher Versatz je Fass, damit sich gleichzeitige Fässer nicht überdecken. */
  private driftLane(id: number): number {
    // aufeinanderfolgende IDs landen auf verschiedenen der 5 Bahnen
    return (((id * 3) % 5) - 2) * this.beam * 0.65;
  }

  /** Fass schwimmt während seiner Lebenszeit von weit hinten auf die Boote zu. */
  private driftWorld(d: Drift, tick: number, bob: number): WorldPt {
    const t = Math.min(1, Math.max(0, (tick - d.spawnTick) / (d.expireTick - d.spawnTick)));
    const X0 = this.shipX(this.viewer);
    const X1 = this.shipX(other(this.viewer));
    const z = DRIFT_Z_START + (DRIFT_Z_END - DRIFT_Z_START) * t;
    return { X: X0 + (X1 - X0) * 0.5 + this.driftLane(d.id), z, up: bob };
  }

  private drawDrift(state: GameState, alpha: number, now: number): void {
    const ty = state.ships[this.viewer].typing;
    const list = state.drift
      .map((d) => {
        const bob = this.reduced ? 0 : Math.sin(now * 0.002 + d.id) * 4;
        return { d, w: this.driftWorld(d, state.tick + alpha, bob) };
      })
      .sort((a, b) => b.w.z - a.w.z);
    for (const { d, w } of list) {
      const p = this.project(w.X, w.z, w.up);
      const active = ty.target?.kind === 'drift' && ty.target.id === d.id;
      const life = Math.max(0, (d.expireTick - state.tick) / (d.expireTick - d.spawnTick));
      this.drawBarrel({ text: d.word.text, typed: active ? ty.typed : 0, active, error: active ? ty.error : null }, p, life);
    }
  }

  /** Liegendes Fass im Wasser mit Wort; Restzeit als Balken darüber. */
  private drawBarrel(label: Label, p: Pt, life: number | null): void {
    const { ctx } = this;
    const font = Math.max(14, this.labelFont * Math.min(1.2, p.s * 1.7));
    ctx.font = `600 ${font}px ${PALETTE.labelFamily}`;
    const tw = ctx.measureText(label.text).width;
    const w = tw + font * 2.2;
    const h = font * 2;
    const x = p.x - w / 2;
    const y = p.y - h * 0.75;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, this.w, p.y + h * 0.05);
    ctx.clip();
    ctx.fillStyle = PALETTE.barrel;
    roundRect(ctx, x, y, w, h, h * 0.45);
    ctx.fill();
    ctx.strokeStyle = PALETTE.crateEdge;
    ctx.lineWidth = Math.max(1, 2 * p.s);
    ctx.stroke();
    // Fassreifen
    ctx.strokeStyle = PALETTE.barrelHoop;
    ctx.beginPath();
    for (const fx of [0.16, 0.84]) {
      ctx.moveTo(x + w * fx, y + 2);
      ctx.lineTo(x + w * fx, y + h - 2);
    }
    ctx.stroke();
    if (label.active) {
      ctx.strokeStyle = PALETTE.good;
      ctx.lineWidth = 2;
      roundRect(ctx, x - 2, y - 2, w + 4, h + 4, h * 0.5);
      ctx.stroke();
    }
    this.drawLabel(label, p.x, y + h * 0.48, font, PALETTE.crateText);
    ctx.restore();
    if (label.error) this.drawFixHint(p.x, y - 14, font);
    // Schaum
    ctx.strokeStyle = PALETTE.foam;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + h * 0.05, w * 0.55, 2 + 2 * p.s, 0, 0, Math.PI);
    ctx.stroke();
    if (life !== null) {
      const bw = w * 0.7;
      ctx.fillStyle = PALETTE.gaugeBg;
      ctx.fillRect(p.x - bw / 2, y - 8, bw, 3);
      ctx.fillStyle = life < 0.3 ? PALETTE.danger : PALETTE.good;
      ctx.fillRect(p.x - bw / 2, y - 8, bw * life, 3);
    }
  }

  // --- Würfe -------------------------------------------------------------------

  private shipDeckWorld(state: GameState, id: ShipId): WorldPt {
    return { X: this.shipX(id), z: this.shipZ(id), up: this.freeboard(state, id) + this.beam * 0.12 };
  }

  private projectilePos(state: GameState, p: Projectile, alpha: number): Pt & { z: number; t: number } {
    const t = Math.min(1, Math.max(0, (state.tick + alpha - p.launchTick) / (p.landTick - p.launchTick)));
    const from =
      this.origins.get(p.id) ??
      (p.from === null
        ? { X: this.shipX(this.viewer) * 0.5 + this.shipX(other(this.viewer)) * 0.5, z: DRIFT_Z_END, up: 0 }
        : this.shipDeckWorld(state, p.from));
    const to = this.shipDeckWorld(state, p.to);
    const arc = p.kind === 'throw' ? this.h * 0.55 : 0;
    const X = from.X + (to.X - from.X) * t;
    const z = from.z + (to.z - from.z) * t;
    // Treibgut schwimmt: bleibt auf dem Wasser und steigt erst am Ende an Bord
    const up = p.kind === 'throw' ? from.up + (to.up - from.up) * t + 4 * arc * t * (1 - t) : to.up * Math.max(0, t - 0.8) * 5;
    return { ...this.project(X, z, up), z, t };
  }

  private drawProjectile(p: Projectile, pos: Pt & { t: number }): void {
    const incoming = p.to === this.viewer;
    if (p.kind === 'drift') {
      this.drawBarrel({ text: p.word.text, typed: 0, active: false }, pos, null);
      return;
    }
    // Wort wächst im Flug zur nächsten Stufe
    const text = pos.t >= 0.45 ? p.word.text : p.fromText;
    const d = this.crateDims(text, text.length, pos.s);
    this.drawCrate({ text, typed: 0, active: false }, { weight: text.length, chain: p.word.chain, stage: p.word.stage }, pos.x - d.w / 2, pos.y + d.h / 2, pos.s);
    if (incoming) {
      this.ctx.strokeStyle = PALETTE.danger;
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(pos.x - d.w / 2 - 2, pos.y - d.h / 2 - d.h * 0.22 - 2, d.w + 4, d.h * 1.22 + 4);
    }
  }

  dispose(): void {
    this.ro.disconnect();
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function mix(a: string, b: string, t: number): string {
  const pa = hex(a);
  const pb = hex(b);
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

function hex(h: string): number[] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

