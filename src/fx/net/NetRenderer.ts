import type { GameEvent, GameState, PlayerId } from '../../core';
import { rgba, THEMES, type ThemeDef } from '../../theme/themes';
import type { GameView } from '../../ui/gameView';
import type { ThemeRenderer } from '../ThemeRenderer';
import { routeBoard, type Board, type Polyline } from './geometry';

/**
 * "Datennetz"-Darstellung als Platine.
 *
 * Hintergrund-Canvas (HINTER dem DOM): Raster, Leiterbahnen, Chip, Lötpunkte.
 * Alles, was unter dem Posteingang liegt, wird durch dessen halbtransparenten
 * Hintergrund automatisch abgedunkelt – der Text bleibt ruhig und lesbar.
 */
export class NetRenderer implements ThemeRenderer {
  readonly kind = 'net' as const;
  private theme: ThemeDef = THEMES.datanet;
  private bg: CanvasRenderingContext2D;
  private fg: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private raf = 0;
  private running = false;
  private motion = true;
  private last = 0;
  private time = 0;

  private view: GameView | null = null;
  /** Eigener Spieler (für Ziel-/Angriffsdarstellung in den folgenden Schritten). */
  protected me: PlayerId = 0;
  private state: GameState | null = null;
  private board: Board | null = null;
  private layoutDirty = true;

  private gridPattern: CanvasPattern | null = null;

  constructor(
    private readonly bgCanvas: HTMLCanvasElement,
    private readonly fgCanvas: HTMLCanvasElement,
  ) {
    this.bg = bgCanvas.getContext('2d')!;
    this.fg = fgCanvas.getContext('2d')!;
    window.addEventListener('resize', () => {
      this.resize();
      this.layoutDirty = true;
    });
    this.resize();
  }

  /* ---------- ThemeRenderer ---------- */

  setTheme(theme: ThemeDef): void {
    this.theme = theme;
    this.gridPattern = null;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  clear(): void {
    this.bg.clearRect(0, 0, this.w, this.h);
    this.fg.clearRect(0, 0, this.w, this.h);
  }

  setMotion(enabled: boolean): void {
    this.motion = enabled;
    // Auch ohne Bewegung wird gezeichnet (statisch); die Schleife läuft weiter,
    // damit Zustandsänderungen (K.O., Ziel …) sichtbar werden.
  }

  attach(view: GameView, me: PlayerId): void {
    this.view = view;
    this.me = me;
    this.state = null;
    this.board = null;
    this.layoutDirty = true;
  }

  detach(): void {
    this.view = null;
    this.state = null;
    this.board = null;
  }

  handle(_events: GameEvent[]): void {}

  frame(state: GameState): void {
    this.state = state;
  }

  /* ---------- Aufbau ---------- */

  private resize(): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    for (const [cv, cx] of [
      [this.bgCanvas, this.bg],
      [this.fgCanvas, this.fg],
    ] as const) {
      cv.width = Math.round(this.w * this.dpr);
      cv.height = Math.round(this.h * this.dpr);
      cx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }
  }

  /** Misst Karten und Posteingang und berechnet die Leiterbahnen neu. */
  private measure(): void {
    if (!this.view) return;
    const stack = this.view.stackRect();
    if (stack.width === 0) return; // noch nicht sichtbar
    const n = this.theme.net;
    this.board = routeBoard({
      hub: { x: stack.x + stack.width / 2, y: stack.y + stack.height / 2 },
      cards: this.view.cardRects(),
      laneSpacing: n.trace.laneSpacing,
      chamfer: n.trace.chamfer,
      minChipSize: n.chip.size,
    });
    this.layoutDirty = false;
  }

  /** Kleine Kachel für das Raster: Punkte an den Kreuzungen, feine Linien. */
  private grid(): CanvasPattern | null {
    if (this.gridPattern) return this.gridPattern;
    const size = this.theme.net.grid.size;
    const tile = document.createElement('canvas');
    tile.width = tile.height = size;
    const c = tile.getContext('2d');
    if (!c) return null;
    const col = this.theme.palette.muted;
    c.strokeStyle = rgba(col, this.theme.net.grid.alpha);
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(0.5, 0);
    c.lineTo(0.5, size);
    c.moveTo(0, 0.5);
    c.lineTo(size, 0.5);
    c.stroke();
    c.fillStyle = rgba(col, this.theme.net.grid.alpha * 2.5);
    c.fillRect(0, 0, 1.5, 1.5);
    this.gridPattern = this.bg.createPattern(tile, 'repeat');
    return this.gridPattern;
  }

  /* ---------- Zeichnen ---------- */

  private loop = (now: number): void => {
    if (!this.running) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.motion) this.time += dt;
    if (this.view && (this.layoutDirty || !this.board)) this.measure();
    this.draw();
    this.raf = requestAnimationFrame(this.loop);
  };

  private draw(): void {
    const c = this.bg;
    const p = this.theme.palette;
    c.clearRect(0, 0, this.w, this.h);
    this.fg.clearRect(0, 0, this.w, this.h);

    // Raster, langsam driftend
    const pat = this.grid();
    if (pat) {
      const off = (this.time * this.theme.net.grid.driftPxPerSec) % this.theme.net.grid.size;
      c.save();
      c.translate(off, off * 0.6);
      c.fillStyle = pat;
      c.fillRect(-this.theme.net.grid.size, -this.theme.net.grid.size, this.w + this.theme.net.grid.size * 2, this.h + this.theme.net.grid.size * 2);
      c.restore();
    }

    const board = this.board;
    if (!board || !this.state) return;
    const n = this.theme.net;

    // Leiterbahnen
    c.lineJoin = 'round';
    c.lineCap = 'round';
    for (const [id, t] of board.traces) {
      const alive = this.state.players[id]?.alive ?? false;
      const a = alive ? n.trace.alpha : n.trace.alpha * 0.25;
      this.strokePath(c, t.path, rgba(p.muted, a), n.trace.width);
      // Vias an den Knicken
      c.fillStyle = rgba(p.muted, a * 1.4);
      for (const v of t.vias) {
        c.beginPath();
        c.arc(v.x, v.y, n.trace.width * 1.1, 0, Math.PI * 2);
        c.fill();
      }
      // Lötpunkt an der Karte
      c.strokeStyle = rgba(alive ? p.good : p.muted, alive ? 0.55 : 0.15);
      c.lineWidth = 1.4;
      c.beginPath();
      c.arc(t.pad.x, t.pad.y, n.trace.padRadius, 0, Math.PI * 2);
      c.stroke();
    }

    // Chip im Posteingang (liegt unter dem halbtransparenten Textfeld → gedämpft)
    this.drawChip(c, board);
  }

  private strokePath(c: CanvasRenderingContext2D, path: Polyline, style: string, width: number): void {
    c.strokeStyle = style;
    c.lineWidth = width;
    c.beginPath();
    const pts = path.points;
    c.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
    c.stroke();
  }

  private drawChip(c: CanvasRenderingContext2D, board: Board): void {
    const p = this.theme.palette;
    const r = board.chip;
    c.fillStyle = rgba(p.panel2, 0.9);
    c.strokeStyle = rgba(p.muted, 0.35);
    c.lineWidth = 1.2;
    c.beginPath();
    c.roundRect(r.x, r.y, r.width, r.height, 4);
    c.fill();
    c.stroke();
    // Pins oben und unten
    const pins = this.theme.net.chip.pins;
    c.strokeStyle = rgba(p.muted, 0.3);
    for (let i = 0; i < pins; i++) {
      const x = r.x + ((i + 0.5) / pins) * r.width;
      c.beginPath();
      c.moveTo(x, r.y);
      c.lineTo(x, r.y - 6);
      c.moveTo(x, r.y + r.height);
      c.lineTo(x, r.y + r.height + 6);
      c.stroke();
    }
    // Kerbe als Orientierungsmarke
    c.beginPath();
    c.arc(r.x + 8, r.y + 8, 2.5, 0, Math.PI * 2);
    c.fillStyle = rgba(p.muted, 0.4);
    c.fill();
  }
}
