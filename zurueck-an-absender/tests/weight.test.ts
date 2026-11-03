import { describe, expect, it } from 'vitest';
import { capacity, load, waterline } from '../src/core';
import { quietGame, setCargo, settle, type } from './helpers';

describe('Gewicht und Wasserlinie', () => {
  it('Gewicht = Anzahl Buchstaben, Wasserlinie proportional zur Tragfähigkeit', () => {
    const g = quietGame();
    setCargo(g, 0, [['Haus', 1], ['Wind', 1], ['Schiff', 2]]); // 4 + 4 + 11
    expect(load(g.ships[0])).toBe(19);
    expect(capacity(g, g.ships[0])).toBe(120);
    expect(waterline(g, g.ships[0])).toBeCloseTo(19 / 120);
  });

  it('Startfracht: je 6 Wörter auf Stufe 1, keine Kette doppelt', () => {
    const g = quietGame(42);
    const all = [...g.ships[0].cargo, ...g.ships[1].cargo];
    expect(g.ships[0].cargo).toHaveLength(6);
    expect(g.ships[1].cargo).toHaveLength(6);
    expect(all.every((c) => c.stage === 1)).toBe(true);
    expect(new Set(all.map((c) => c.chain)).size).toBe(12);
  });

  it('Werfen entlastet das eigene Schiff sofort, belastet den Gegner erst bei Landung', () => {
    const g = quietGame();
    setCargo(g, 0, [['Haus', 1], ['Wind', 1]]);
    setCargo(g, 1, []);
    type(g, 0, 'haus');
    expect(load(g.ships[0])).toBe(4);
    expect(load(g.ships[1])).toBe(0);
    settle(g);
    expect(load(g.ships[1])).toBe(7);
  });
});
