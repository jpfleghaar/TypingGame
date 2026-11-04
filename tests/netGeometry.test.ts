import { describe, expect, it } from 'vitest';
import { chamfer, packetPath, pointAt, polyline, routeBoard, segmentsCross, type Rect } from '../src/fx/net/geometry';

/** Kartenraster wie im Spiel: Spalten à 9 Karten. */
function column(x: number, idStart: number, count = 9): { id: number; rect: Rect }[] {
  return Array.from({ length: count }, (_, i) => ({ id: idStart + i, rect: { x, y: 100 + i * 70, width: 240, height: 60 } }));
}

function assertNoCrossings(traces: Iterable<{ id: number; path: { points: { x: number; y: number }[] } }>) {
  const all = [...traces];
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i].path.points;
      const b = all[j].path.points;
      for (let p = 1; p < a.length; p++) {
        for (let q = 1; q < b.length; q++) {
          expect(segmentsCross(a[p - 1], a[p], b[q - 1], b[q]), `Bahn ${all[i].id} kreuzt ${all[j].id}`).toBe(false);
        }
      }
    }
  }
}

describe('Platinen-Routing', () => {
  const opts = { laneSpacing: 9, chamfer: 8, minChipSize: 40 };

  it('zentriertes Layout: 9 Karten links, 9 rechts, keine Kreuzungen', () => {
    const cards = [...column(60, 1), ...column(1100, 10)];
    const board = routeBoard({ ...opts, hub: { x: 700, y: 420 }, cards });
    expect(board.traces.size).toBe(18);
    assertNoCrossings(board.traces.values());
    for (const t of board.traces.values()) {
      const end = t.path.points[t.path.points.length - 1];
      // jede Bahn endet am Chip-Rand
      expect([board.chip.x, board.chip.x + board.chip.width]).toContainEqual(end.x);
      expect(end.y).toBeGreaterThanOrEqual(board.chip.y);
      expect(end.y).toBeLessThanOrEqual(board.chip.y + board.chip.height);
    }
  });

  it('Layout "Wörter links": zwei Spalten rechts, keine Kreuzungen', () => {
    const cards = [...column(900, 1), ...column(1160, 10)];
    const board = routeBoard({ ...opts, hub: { x: 400, y: 420 }, cards });
    expect(board.traces.size).toBe(18);
    assertNoCrossings(board.traces.values());
    // Bahnen der äußeren Spalte laufen nie durch eine Karte der inneren Spalte
    const inner = column(900, 1).map((c) => c.rect);
    for (let id = 10; id < 19; id++) {
      for (const p of board.traces.get(id)!.path.points) {
        const inside = inner.some((r) => p.x > r.x + 1 && p.x < r.x + r.width - 1 && p.y > r.y + 1 && p.y < r.y + r.height - 1);
        expect(inside, `Bahn ${id} läuft durch eine Karte`).toBe(false);
      }
    }
  });

  it('Bahnen enden verteilt am Rand des Posteingangs, ohne Kreuzungen', () => {
    for (const cards of [
      [...column(60, 1), ...column(1100, 10)],
      [...column(900, 1), ...column(1160, 10)],
    ]) {
      const hubX = cards[0].rect.x < 500 ? 700 : 400;
      const entryRect = { x: hubX - 200, y: 200, width: 400, height: 460 };
      const board = routeBoard({ ...opts, laneSpacing: 6, hub: { x: hubX, y: 430 }, cards, entryRect, entrySpread: 40 });
      assertNoCrossings(board.traces.values());
      const ys = new Set<number>();
      for (const t of board.traces.values()) {
        const end = t.path.points[t.path.points.length - 1];
        expect([entryRect.x, entryRect.x + entryRect.width]).toContainEqual(end.x);
        expect(end.y).toBeGreaterThan(entryRect.y);
        expect(end.y).toBeLessThan(entryRect.y + entryRect.height);
        ys.add(Math.round(end.y));
      }
      // über die Seite verteilt statt gebündelt
      expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(250);
    }
  });

  it('Pakete laufen von Karte über den Chip zur Zielkarte', () => {
    const cards = [...column(60, 1), ...column(1100, 10)];
    const board = routeBoard({ ...opts, hub: { x: 700, y: 420 }, cards });
    const p = packetPath(board, 3, 14)!;
    expect(p.points[0]).toEqual(board.traces.get(3)!.pad);
    expect(p.points[p.points.length - 1]).toEqual(board.traces.get(14)!.pad);
    expect(p.points).toContainEqual(board.hub);
    const mine = packetPath(board, 'hub', 5)!;
    expect(mine.points[0]).toEqual(board.hub);
  });
});

describe('Polylinien', () => {
  it('pointAt läuft gleichmäßig entlang der Strecke', () => {
    const p = polyline([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]);
    expect(p.length).toBe(20);
    expect(pointAt(p, 5)).toEqual({ x: 5, y: 0 });
    expect(pointAt(p, 15)).toEqual({ x: 10, y: 5 });
    expect(pointAt(p, 99)).toEqual({ x: 10, y: 10 });
  });

  it('chamfer schrägt rechte Winkel ab', () => {
    const pts = chamfer([{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }], 5);
    expect(pts).toEqual([{ x: 0, y: 0 }, { x: 15, y: 0 }, { x: 20, y: 5 }, { x: 20, y: 20 }]);
  });
});
