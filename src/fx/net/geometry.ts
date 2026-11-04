/**
 * Platinen-Geometrie: Leiterbahnen von jedem Gegner-Knoten zum zentralen Chip
 * (dem eigenen Posteingang). Reine Funktionen ohne DOM – testbar.
 *
 * Routing pro Seite (links/rechts vom Chip):
 *   Karte → waagerecht → eigene senkrechte Spur ("Lane") → waagerecht in den Chip.
 * Die Lanes sind so verteilt, dass sich keine Bahnen kreuzen. Liegen auf einer
 * Seite zwei Kartenspalten, laufen die Bahnen der äußeren Spalte durch die
 * Lücken zwischen den Karten der inneren Spalte.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Polyline {
  points: Point[];
  /** Kumulierte Länge bis Punkt i. */
  cum: number[];
  length: number;
}

export interface Trace {
  /** Gegner-ID */
  id: number;
  /** Bahn von der Karte (Index 0) zum Chip (letzter Punkt). */
  path: Polyline;
  /** Lötpunkt an der Karte. */
  pad: Point;
  /** Knickpunkte (Vias), für die Darstellung. */
  vias: Point[];
}

export interface Board {
  traces: Map<number, Trace>;
  chip: Rect;
  hub: Point;
}

export interface RoutingInput {
  hub: Point;
  cards: { id: number; rect: Rect }[];
  laneSpacing: number;
  chamfer: number;
  minChipSize: number;
  /**
   * Optional: Die Bahnen enden am Rand dieses Rechtecks (z. B. dem Posteingang)
   * statt an einem kleinen Chip in der Mitte – verteilt im Abstand `entrySpread`.
   */
  entryRect?: Rect;
  entrySpread?: number;
}

/* ---------- Polylinien ---------- */

export function polyline(points: Point[]): Polyline {
  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  }
  return { points, cum, length: cum[cum.length - 1] };
}

/** Punkt bei Distanz `d` entlang der Linie (geklemmt auf [0, length]). */
export function pointAt(p: Polyline, d: number, out: Point = { x: 0, y: 0 }): Point {
  const dist = Math.min(p.length, Math.max(0, d));
  let i = 1;
  // Binärsuche über die kumulierten Längen
  let lo = 1;
  let hi = p.cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (p.cum[mid] < dist) lo = mid + 1;
    else hi = mid;
  }
  i = lo;
  const a = p.points[i - 1];
  const b = p.points[i];
  const seg = p.cum[i] - p.cum[i - 1];
  const k = seg > 0 ? (dist - p.cum[i - 1]) / seg : 0;
  out.x = a.x + (b.x - a.x) * k;
  out.y = a.y + (b.y - a.y) * k;
  return out;
}

export function reversed(p: Polyline): Polyline {
  return polyline([...p.points].reverse());
}

/** Hängt Linien aneinander (doppelte Übergangspunkte werden entfernt). */
export function concat(...lines: Polyline[]): Polyline {
  const pts: Point[] = [];
  for (const l of lines) {
    for (const pt of l.points) {
      const last = pts[pts.length - 1];
      if (!last || Math.abs(last.x - pt.x) > 0.01 || Math.abs(last.y - pt.y) > 0.01) pts.push(pt);
    }
  }
  return polyline(pts);
}

/** Schrägt jede Ecke um `c` px ab (45° bei rechten Winkeln) – typischer Platinen-Look. */
export function chamfer(points: Point[], c: number): Point[] {
  if (points.length < 3 || c <= 0) return points;
  const out: Point[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1];
    const p = points[i];
    const b = points[i + 1];
    const la = Math.hypot(a.x - p.x, a.y - p.y);
    const lb = Math.hypot(b.x - p.x, b.y - p.y);
    const cross = (p.x - a.x) * (b.y - p.y) - (p.y - a.y) * (b.x - p.x);
    if (la < 0.01 || lb < 0.01 || Math.abs(cross) < 0.01) {
      out.push(p); // keine echte Ecke
      continue;
    }
    const ca = Math.min(c, la / 2);
    const cb = Math.min(c, lb / 2);
    out.push({ x: p.x + ((a.x - p.x) / la) * ca, y: p.y + ((a.y - p.y) / la) * ca });
    out.push({ x: p.x + ((b.x - p.x) / lb) * cb, y: p.y + ((b.y - p.y) / lb) * cb });
  }
  out.push(points[points.length - 1]);
  return out;
}

/** Entfernt Punkte, die direkt auf der Geraden ihrer Nachbarn liegen oder doppelt sind. */
function simplify(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < 0.01 && Math.abs(last.y - p.y) < 0.01) continue;
    if (out.length >= 2) {
      const a = out[out.length - 2];
      const cross = (last.x - a.x) * (p.y - last.y) - (last.y - a.y) * (p.x - last.x);
      if (Math.abs(cross) < 0.01) out.pop();
    }
    out.push(p);
  }
  return out;
}

/* ---------- Routing ---------- */

interface Entry {
  id: number;
  /** Punkte von der Karte bis zum Eintritt in die Lane-Zone. */
  lead: Point[];
  /** y-Höhe, mit der die Bahn in die Lane-Zone eintritt. */
  y: number;
}

/** Gruppiert Karten einer Seite in Spalten (nach x), innere Spalte zuerst. */
function columns(cards: { id: number; rect: Rect }[], dir: 1 | -1): { id: number; rect: Rect }[][] {
  const sorted = [...cards].sort((a, b) => (b.rect.x - a.rect.x) * dir);
  const cols: { id: number; rect: Rect }[][] = [];
  for (const c of sorted) {
    const col = cols.find((k) => Math.abs(k[0].rect.x - c.rect.x) < c.rect.width / 2);
    if (col) col.push(c);
    else cols.push([c]);
  }
  for (const col of cols) col.sort((a, b) => a.rect.y - b.rect.y);
  return cols;
}

/**
 * Baut alle Leiterbahnen. `dir` = +1, wenn der Chip rechts von den Karten
 * liegt, -1 wenn links.
 */
function routeSide(
  cards: { id: number; rect: Rect }[],
  hub: Point,
  chip: Rect,
  dir: 1 | -1,
  opts: RoutingInput,
): Trace[] {
  if (cards.length === 0) return [];
  const cols = columns(cards, dir);
  const inner = cols[0];
  const innerEdge = (r: Rect) => (dir > 0 ? r.x + r.width : r.x);
  const outerEdge = (r: Rect) => (dir > 0 ? r.x : r.x + r.width);
  const laneStart = Math.max(...inner.map((c) => innerEdge(c.rect)) .map((x) => x * dir)) * dir + dir * opts.laneSpacing;

  const entries: Entry[] = [];
  for (const c of inner) {
    const y = c.rect.y + c.rect.height / 2;
    entries.push({ id: c.id, lead: [{ x: innerEdge(c.rect), y }], y });
  }
  // Äußere Spalten: in die Spaltenlücke, dann durch die Zeilenlücke der inneren Spalte
  for (let ci = 1; ci < cols.length; ci++) {
    const prevCol = cols[ci - 1];
    const gapX = (innerEdge(cols[ci][0].rect) + outerEdge(prevCol[0].rect)) / 2;
    for (const c of cols[ci]) {
      const cy = c.rect.y + c.rect.height / 2;
      // Lücke oberhalb der inneren Karte, die dieser Karte am nächsten liegt
      const near = inner.reduce((a, b) =>
        Math.abs(a.rect.y + a.rect.height / 2 - cy) <= Math.abs(b.rect.y + b.rect.height / 2 - cy) ? a : b,
      );
      const idx = inner.indexOf(near);
      const above = inner[idx - 1];
      const gapY = above ? (above.rect.y + above.rect.height + near.rect.y) / 2 : near.rect.y - opts.laneSpacing;
      entries.push({
        id: c.id,
        lead: [
          { x: innerEdge(c.rect), y: cy },
          { x: gapX, y: cy },
          { x: gapX, y: gapY },
          { x: innerEdge(near.rect), y: gapY },
        ],
        y: gapY,
      });
    }
  }

  // Ziel-Höhen am Chip: gleichmäßig um die Chip-Mitte, Reihenfolge wie die Eintritts-Höhen
  entries.sort((a, b) => a.y - b.y);
  const n = entries.length;
  // Verteilung am Eintritt: höchstens so weit, dass alle Bahnen auf die Seite passen
  const spread = opts.entryRect
    ? Math.min(opts.entrySpread ?? opts.laneSpacing, (chip.height * 0.9) / Math.max(1, n))
    : opts.laneSpacing;
  const targets = entries.map((_, r) => hub.y + (r - (n - 1) / 2) * spread);

  // Lanes: oberhalb liegende Bahnen – die oberste bekommt die Lane am nächsten zum Chip;
  // unterhalb liegende – die unterste bekommt die Lane am nächsten zum Chip. So kreuzt nichts.
  const laneOf = new Map<number, number>();
  const above = entries.map((e, r) => ({ e, r })).filter(({ e, r }) => e.y < targets[r] - 0.5);
  const below = entries.map((e, r) => ({ e, r })).filter(({ e, r }) => e.y > targets[r] + 0.5);
  above.forEach(({ e }, i) => laneOf.set(e.id, above.length - i));
  [...below].reverse().forEach(({ e }, i) => laneOf.set(e.id, below.length - i));

  const chipEdge = dir > 0 ? chip.x : chip.x + chip.width;
  return entries.map((e, r) => {
    const lane = laneOf.get(e.id) ?? 0;
    const laneX = laneStart + dir * lane * opts.laneSpacing;
    const ty = targets[r];
    const raw = simplify([...e.lead, { x: laneX, y: e.y }, { x: laneX, y: ty }, { x: chipEdge, y: ty }]);
    const pts = chamfer(raw, opts.chamfer);
    return { id: e.id, path: polyline(pts), pad: raw[0], vias: raw.slice(1, -1) };
  });
}

export function routeBoard(opts: RoutingInput): Board {
  const { hub, cards } = opts;
  const left = cards.filter((c) => c.rect.x + c.rect.width / 2 < hub.x);
  const right = cards.filter((c) => c.rect.x + c.rect.width / 2 >= hub.x);
  const maxSide = Math.max(left.length, right.length);
  const size = Math.max(opts.minChipSize, (maxSide + 1) * opts.laneSpacing);
  const chip: Rect = opts.entryRect ?? { x: hub.x - size / 2, y: hub.y - size / 2, width: size, height: size };
  const traces = new Map<number, Trace>();
  for (const t of [...routeSide(left, hub, chip, 1, opts), ...routeSide(right, hub, chip, -1, opts)]) {
    traces.set(t.id, t);
  }
  return { traces, chip, hub };
}

/** Weg eines Pakets: von Karte A über den Chip zu Karte B (oder vom/zum Chip). */
export function packetPath(board: Board, from: number | 'hub', to: number | 'hub'): Polyline | null {
  const a = from === 'hub' ? null : board.traces.get(from);
  const b = to === 'hub' ? null : board.traces.get(to);
  if ((from !== 'hub' && !a) || (to !== 'hub' && !b)) return null;
  const parts: Polyline[] = [];
  if (a) parts.push(a.path);
  // durch den Chip: von der Eintrittsstelle zur Mitte und wieder hinaus
  const hubLine = polyline([
    a ? a.path.points[a.path.points.length - 1] : board.hub,
    board.hub,
    b ? b.path.points[b.path.points.length - 1] : board.hub,
  ]);
  parts.push(hubLine);
  if (b) parts.push(reversed(b.path));
  return concat(...parts);
}

/* ---------- Tests/Debug: Prüft, ob sich zwei achsparallele Segmente schneiden ---------- */

export function segmentsCross(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
  const d = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = d(b1, b2, a1);
  const d2 = d(b1, b2, a2);
  const d3 = d(a1, a2, b1);
  const d4 = d(a1, a2, b2);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}
