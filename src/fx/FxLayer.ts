/**
 * Effekte auf zwei Vollbild-Canvas-Ebenen:
 *
 * - Hintergrund (HINTER dem DOM): Partikel und Combo-Rand. Der Stapel hat einen
 *   deckenden Hintergrund, dort ist davon nichts zu sehen.
 * - Vordergrund (ÜBER dem DOM, klickdurchlässig): Lichtspuren und Funken, damit
 *   sie bis in die Gegner-Karten fliegen können. Der eigene Stapel wird auf
 *   dieser Ebene per Clipping ausgespart – hier kann technisch nichts landen.
 *
 * - Partikel: driften nach oben, Tempo folgt den eigenen WPM
 * - Combo-Rand: leuchtender Bildschirmrand, stärker je Combo-Stufe
 * - Lichtspuren: Angriffe fliegen vom eigenen Stapel zum Ziel (und umgekehrt)
 * - Ausbrüche: kleine Partikelwolken bei Einschlag und K.O.
 */

export interface Point {
  x: number;
  y: number;
}

interface Particle {
  x: number;
  y: number;
  r: number;
  a: number;
  depth: number;
}

interface Trail {
  from: Point;
  to: Point;
  ctrl: Point;
  t0: number;
  dur: number;
  color: string;
  width: number;
  onArrive?: () => void;
  arrived: boolean;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t0: number;
  life: number;
  color: string;
}

const GOOD = '62, 230, 168';
const DANGER = '255, 84, 112';

/** Combo -> Leuchtstärke des Randes (0..1). */
export function comboGlow(combo: number): number {
  if (combo >= 10) return 0.95;
  if (combo >= 6) return 0.65;
  if (combo >= 3) return 0.4;
  if (combo >= 1) return 0.15;
  return 0;
}

export class FxLayer {
  private ctx: CanvasRenderingContext2D;
  private fg: CanvasRenderingContext2D;
  /** Bereich (Viewport), in dem die Vordergrund-Ebene nie zeichnet. */
  private exclusion: DOMRect | null = null;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private particles: Particle[] = [];
  private trails: Trail[] = [];
  private sparks: Spark[] = [];
  private raf = 0;
  private last = 0;
  private running = false;
  private enabled = true;
  /** Wenn ein anderes Theme aktiv ist, zeichnet diese Ebene gar nichts. */
  private suspended = false;

  /** Geglättete Werte, damit nichts springt. */
  private speed = 0;
  private glow = 0;
  private flash = 0; // roter Rand-Blitz (Combo-Bruch, Treffer)
  private targetWpm = 0;
  private targetGlow = 0;
  private time = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly fgCanvas: HTMLCanvasElement,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.fg = fgCanvas.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /** Effekte an/aus (z. B. bei prefers-reduced-motion). */
  setEnabled(on: boolean): void {
    this.enabled = on;
    if (on) this.start();
    else {
      this.stop();
      this.trails = [];
      this.sparks = [];
      this.ctx.clearRect(0, 0, this.w, this.h);
      this.fg.clearRect(0, 0, this.w, this.h);
      // Ohne Bewegung: nur ein statischer Combo-Rand
      if (!this.suspended) this.drawGlow(this.targetGlow, 0);
    }
  }

  setSuspended(on: boolean): void {
    this.suspended = on;
    if (on) this.stop();
  }

  /** Leert beide Ebenen (z. B. beim Wechsel auf ein anderes Theme). */
  clear(): void {
    this.trails = [];
    this.sparks = [];
    this.ctx.clearRect(0, 0, this.w, this.h);
    this.fg.clearRect(0, 0, this.w, this.h);
  }

  /** Textzone, die die Vordergrund-Ebene aussparen muss (null = keine). */
  setExclusion(r: DOMRect | null): void {
    this.exclusion = r;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  setIntensity(wpm: number, combo: number): void {
    this.targetWpm = wpm;
    const g = comboGlow(combo);
    if (!this.enabled && !this.suspended && g !== this.targetGlow) {
      this.targetGlow = g;
      this.ctx.clearRect(0, 0, this.w, this.h);
      this.drawGlow(g, 0);
      return;
    }
    this.targetGlow = g;
  }

  /** Rand-Blitz in Gefahrenfarbe. */
  dangerFlash(strength = 0.6): void {
    if (this.enabled) this.flash = Math.max(this.flash, strength);
  }

  trail(from: Point, to: Point, kind: 'good' | 'danger', onArrive?: () => void): void {
    if (!this.enabled) {
      onArrive?.();
      return;
    }
    const mx = (from.x + to.x) / 2;
    const my = (from.y + to.y) / 2;
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    this.trails.push({
      from,
      to,
      ctrl: { x: mx, y: my - Math.min(160, dist * 0.35) },
      t0: this.time,
      dur: 0.38 + Math.min(0.25, dist / 4000),
      color: kind === 'good' ? GOOD : DANGER,
      width: kind === 'good' ? 3 : 2.5,
      onArrive,
      arrived: false,
    });
  }

  burst(at: Point, kind: 'good' | 'danger', count = 14): void {
    if (!this.enabled) return;
    const color = kind === 'good' ? GOOD : DANGER;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 40 + Math.random() * 140;
      this.sparks.push({ x: at.x, y: at.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t0: this.time, life: 0.35 + Math.random() * 0.3, color });
    }
  }

  start(): void {
    if (this.running || !this.enabled || this.suspended) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private resize(): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    for (const [cv, cx] of [
      [this.canvas, this.ctx],
      [this.fgCanvas, this.fg],
    ] as const) {
      cv.width = Math.round(this.w * this.dpr);
      cv.height = Math.round(this.h * this.dpr);
      cx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }
    const want = Math.round((this.w * this.h) / 9000);
    while (this.particles.length < want) this.particles.push(this.newParticle(true));
    this.particles.length = Math.min(this.particles.length, want);
    if (!this.enabled && !this.suspended) this.drawGlow(this.targetGlow, 0);
  }

  private newParticle(anywhere: boolean): Particle {
    const depth = 0.3 + Math.random() * 0.7;
    return {
      x: Math.random() * this.w,
      y: anywhere ? Math.random() * this.h : this.h + 4,
      r: 0.5 + depth * 1.3,
      a: 0.08 + depth * 0.3,
      depth,
    };
  }

  private frame = (now: number): void => {
    if (!this.running) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    // Werte weich nachführen
    const wantSpeed = 10 + this.targetWpm * 2.2;
    this.speed += (wantSpeed - this.speed) * Math.min(1, dt * 2);
    this.glow += (this.targetGlow - this.glow) * Math.min(1, dt * (this.targetGlow > this.glow ? 6 : 3));
    this.flash = Math.max(0, this.flash - dt * 2.5);

    this.ctx.clearRect(0, 0, this.w, this.h);
    this.drawParticles(dt);
    this.drawGlow(this.glow, this.flash);

    const f = this.fg;
    f.clearRect(0, 0, this.w, this.h);
    if (this.trails.length > 0 || this.sparks.length > 0) {
      f.save();
      if (this.exclusion) {
        // Alles außer der Textzone (evenodd: äußeres Rechteck minus Stapel)
        const r = this.exclusion;
        f.beginPath();
        f.rect(0, 0, this.w, this.h);
        f.rect(r.x - 2, r.y - 2, r.width + 4, r.height + 4);
        f.clip('evenodd');
      }
      f.globalCompositeOperation = 'lighter';
      this.drawTrails();
      this.drawSparks(dt);
      f.restore();
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  private drawParticles(dt: number): void {
    const c = this.ctx;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.y -= this.speed * p.depth * dt;
      p.x += Math.sin(this.time * 0.3 + i) * 4 * dt;
      if (p.y < -4) this.particles[i] = this.newParticle(false);
      c.fillStyle = `rgba(170, 190, 230, ${p.a})`;
      c.beginPath();
      c.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      c.fill();
    }
  }

  /** Leuchtender Rand über alle vier Seiten. */
  private drawGlow(glow: number, flash: number): void {
    const c = this.ctx;
    const pulse = this.enabled ? 1 + Math.sin(this.time * 4) * 0.08 * glow : 1;
    const draw = (rgb: string, strength: number, size: number) => {
      if (strength <= 0.01) return;
      const edges: [number, number, number, number, number, number, number, number][] = [
        [0, 0, 0, size, 0, 0, this.w, size],
        [0, this.h, 0, this.h - size, 0, this.h - size, this.w, size],
        [0, 0, size, 0, 0, 0, size, this.h],
        [this.w, 0, this.w - size, 0, this.w - size, 0, size, this.h],
      ];
      for (const [x0, y0, x1, y1, rx, ry, rw, rh] of edges) {
        const g = c.createLinearGradient(x0, y0, x1, y1);
        g.addColorStop(0, `rgba(${rgb}, ${Math.min(0.9, strength)})`);
        g.addColorStop(1, `rgba(${rgb}, 0)`);
        c.fillStyle = g;
        c.fillRect(rx, ry, rw, rh);
      }
    };
    draw(GOOD, glow * 0.7 * pulse, 18 + glow * 46);
    draw(DANGER, flash * 0.8, 50);
  }

  private bezier(tr: Trail, t: number): Point {
    const u = 1 - t;
    return {
      x: u * u * tr.from.x + 2 * u * t * tr.ctrl.x + t * t * tr.to.x,
      y: u * u * tr.from.y + 2 * u * t * tr.ctrl.y + t * t * tr.to.y,
    };
  }

  private drawTrails(): void {
    const c = this.fg;
    this.trails = this.trails.filter((tr) => {
      const raw = (this.time - tr.t0) / tr.dur;
      if (raw >= 1 && !tr.arrived) {
        tr.arrived = true;
        tr.onArrive?.();
        this.burst(tr.to, tr.color === GOOD ? 'good' : 'danger', 10);
      }
      if (raw > 1.35) return false;
      const head = Math.min(1, raw);
      const tail = Math.max(0, raw - 0.35);
      const fade = raw > 1 ? 1 - (raw - 1) / 0.35 : 1;
      const segs = 18;
      for (let i = 0; i < segs; i++) {
        const a = tail + ((head - tail) * i) / segs;
        const b = tail + ((head - tail) * (i + 1)) / segs;
        const p0 = this.bezier(tr, a);
        const p1 = this.bezier(tr, b);
        const k = (i + 1) / segs;
        c.strokeStyle = `rgba(${tr.color}, ${0.85 * k * fade})`;
        c.lineWidth = tr.width * (0.3 + k);
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(p0.x, p0.y);
        c.lineTo(p1.x, p1.y);
        c.stroke();
      }
      if (raw < 1) {
        const p = this.bezier(tr, head);
        const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, 14);
        g.addColorStop(0, `rgba(${tr.color}, 0.9)`);
        g.addColorStop(1, `rgba(${tr.color}, 0)`);
        c.fillStyle = g;
        c.fillRect(p.x - 14, p.y - 14, 28, 28);
      }
      return true;
    });
  }

  private drawSparks(dt: number): void {
    const c = this.fg;
    this.sparks = this.sparks.filter((s) => {
      const age = (this.time - s.t0) / s.life;
      if (age >= 1) return false;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= 0.92;
      s.vy *= 0.92;
      c.fillStyle = `rgba(${s.color}, ${0.9 * (1 - age)})`;
      c.beginPath();
      c.arc(s.x, s.y, 2 * (1 - age) + 0.5, 0, Math.PI * 2);
      c.fill();
      return true;
    });
  }
}
