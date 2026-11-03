import { describe, expect, it } from 'vitest';
import { CHAINS } from '../src/core';

describe('Wortketten', () => {
  it('hat mindestens 300 Ketten mit 3 bis 5 Stufen', () => {
    expect(CHAINS.length).toBeGreaterThanOrEqual(300);
    for (const c of CHAINS) {
      expect(c.length, c.join(' ')).toBeGreaterThanOrEqual(3);
      expect(c.length, c.join(' ')).toBeLessThanOrEqual(5);
    }
  });

  it('jede Stufe beginnt mit der vorigen und ist länger', () => {
    for (const c of CHAINS) {
      for (let i = 1; i < c.length; i++) {
        expect(c[i].startsWith(c[i - 1]), `${c[i - 1]} → ${c[i]}`).toBe(true);
        expect(c[i].length).toBeGreaterThan(c[i - 1].length);
      }
    }
  });

  it('kein Wort kommt doppelt vor', () => {
    const all = CHAINS.flat().map((w) => w.toLowerCase());
    expect(new Set(all).size).toBe(all.length);
  });

  it('nur Buchstaben, Großschreibung am Anfang, Startwort mindestens 3 Zeichen', () => {
    for (const w of CHAINS.flat()) expect(w, w).toMatch(/^[A-ZÄÖÜ][a-zäöüß]+$/);
    for (const c of CHAINS) expect(c[0].length).toBeGreaterThanOrEqual(3);
  });
});
