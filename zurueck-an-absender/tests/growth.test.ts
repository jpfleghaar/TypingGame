import { describe, expect, it } from 'vitest';
import { flightTicks, msToTicks } from '../src/core';
import { quietGame, run, setCargo, settle, texts, type } from './helpers';

/** 23 + 23 + 19 + 21 + 24 = 110 Gewicht */
const HEAVY: [string, number][] = [['Wohnung', 3], ['Land', 4], ['Bund', 4], ['Weihnacht', 3], ['Umwelt', 3]];

describe('Wurf und Wortwachstum', () => {
  it('fertig getipptes Wort verlässt das Schiff und wächst um eine Stufe', () => {
    const g = quietGame();
    setCargo(g, 0, [['Haus', 1]]);
    setCargo(g, 1, []);
    const ev = type(g, 0, 'haus');
    expect(texts(g, 0)).toEqual([]);
    expect(ev).toContainEqual(expect.objectContaining({ type: 'WORD_THROWN', fromText: 'Haus', toText: 'Haustür', growth: 1 }));
    settle(g);
    expect(texts(g, 1)).toEqual(['Haustür']);
  });

  it('Gewicht zählt erst bei der Landung (nach ca. 1 Sekunde)', () => {
    const g = quietGame();
    setCargo(g, 0, [['Haus', 1]]);
    setCargo(g, 1, []);
    type(g, 0, 'haus');
    expect(flightTicks(g, 0)).toBe(msToTicks(1000));
    run(g, msToTicks(1000) - 2);
    expect(texts(g, 1)).toEqual([]);
    run(g, 2);
    expect(texts(g, 1)).toEqual(['Haustür']);
    expect(g.ships[1].cargo[0].weight).toBe('Haustür'.length);
  });

  it('Wort auf letzter Stufe wächst nicht, wiegt aber +20 %', () => {
    const g = quietGame();
    setCargo(g, 0, [['Haus', 3]]);
    setCargo(g, 1, []);
    type(g, 0, 'haustürschlüssel');
    settle(g);
    expect(texts(g, 1)).toEqual(['Haustürschlüssel']);
    expect(g.ships[1].cargo[0].weight).toBeCloseTo('Haustürschlüssel'.length * 1.2);
  });

  it('nach zwei Schiffswechseln auf letzter Stufe wird es beim ursprünglichen Absender ersetzt', () => {
    const g = quietGame();
    setCargo(g, 0, [['Haus', 2]]);
    setCargo(g, 1, []);
    type(g, 0, 'haustür'); // A → B, erreicht Endstufe (Wechsel 1)
    settle(g);
    expect(texts(g, 1)).toEqual(['Haustürschlüssel']);
    expect(g.ships[1].cargo[0].finalHops).toBe(1);
    const ev = type(g, 1, 'haustürschlüssel'); // B → A (Wechsel 2)
    expect(ev.some((e) => e.type === 'WORD_THROWN')).toBe(true);
    const landed = settle(g);
    const swap = landed.find((e) => e.type === 'WORD_SWAPPED');
    expect(swap).toBeDefined();
    expect(texts(g, 0)).toHaveLength(1);
    const fresh = g.ships[0].cargo[0];
    expect(fresh.text).not.toBe('Haustürschlüssel');
    expect(fresh.finalHops).toBe(0);
    // neues Wort ist ebenfalls Endstufe, mit +20 % gewogen
    expect(fresh.weight).toBeCloseTo(fresh.text.length * 1.2);
  });

  it('Aufholmechanik: über 80 % wachsen eigene Würfe um zwei Stufen', () => {
    const g = quietGame();
    setCargo(g, 0, [['Kind', 1], ...HEAVY]);
    setCargo(g, 1, []);
    // 4 + 110 = 114 von 120 → 95 % (geprüft vor dem Wurf)
    const ev = type(g, 0, 'kind');
    expect(ev).toContainEqual(expect.objectContaining({ type: 'WORD_THROWN', toText: 'Kindergarten', growth: 2 }));
  });

  it('unter 80 % nur eine Stufe', () => {
    const g = quietGame();
    setCargo(g, 0, [['Kind', 1]]);
    const ev = type(g, 0, 'kind');
    expect(ev).toContainEqual(expect.objectContaining({ type: 'WORD_THROWN', toText: 'Kinder', growth: 1 }));
  });

  it('Wachstum stoppt am Kettenende', () => {
    const g = quietGame();
    setCargo(g, 0, [['Haus', 2], ...HEAVY]);
    const ev = type(g, 0, 'haustür');
    expect(ev).toContainEqual(expect.objectContaining({ type: 'WORD_THROWN', toText: 'Haustürschlüssel', growth: 1 }));
  });
});
