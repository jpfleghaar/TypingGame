import { describe, expect, it } from 'vitest';
import {
  buildWordBank,
  createRng,
  DEFAULT_CONFIG,
  drawWord,
  drawLongWord,
  mixCase,
  remember,
  resolveThemeId,
  tierWeights,
  type WordData,
} from '../src/core';
import de from '../src/data/words/de.json';
import en from '../src/data/words/en.json';
import { BANK, idle, newGame } from './helpers';

const DE = de as WordData;
const EN = en as WordData;

function countUnique(data: WordData): number {
  return new Set(Object.values(data.themes).flatMap((t) => [...t.short, ...t.medium, ...t.long])).size;
}

describe('Wortlisten', () => {
  it('haben je mindestens 1500 eindeutige Wörter', () => {
    expect(countUnique(DE)).toBeGreaterThanOrEqual(1500);
    expect(countUnique(EN)).toBeGreaterThanOrEqual(1500);
  });

  it('jedes Thema hat genug Wörter für das Wiederholungs-Fenster', () => {
    for (const data of [DE, EN]) {
      for (const id of Object.keys(data.themes)) {
        const bank = buildWordBank(data, id);
        expect(bank.short.length + bank.medium.length + bank.long.length).toBeGreaterThan(150);
      }
    }
  });

  it('"random" wählt ein Thema deterministisch aus dem Seed', () => {
    const a = resolveThemeId(DE, 'random', 123);
    expect(Object.keys(DE.themes)).toContain(a);
    expect(resolveThemeId(DE, 'random', 123)).toBe(a);
  });
});

describe('Keine Wiederholung', () => {
  it('in den letzten 50 Wörtern (auch bei einem einzelnen Thema)', () => {
    for (const theme of ['mixed', 'weltraum', 'tiere']) {
      const bank = buildWordBank(DE, theme);
      const rng = createRng(99);
      const recent: string[] = [];
      const seq: string[] = [];
      for (let i = 0; i < 2000; i++) {
        const w = drawWord(bank, rng, recent, tierWeights(DEFAULT_CONFIG, (i % 300) / 300));
        remember(recent, w, 50);
        seq.push(w);
      }
      for (let i = 0; i < seq.length; i++) {
        expect(seq.slice(Math.max(0, i - 49), i)).not.toContain(seq[i]);
      }
    }
  });

  it('im laufenden Spiel bekommt jeder Spieler dieselbe Wortfolge', () => {
    const s = newGame(5, 77);
    idle(s, 60 * 30);
    const texts = s.players.map((p) => p.stack.map((w) => w.text).join(' '));
    expect(new Set(texts).size).toBe(1);
  });
});

describe('Schreibung mischen (Finale)', () => {
  it('tauscht genau die gewünschte Zahl an Buchstaben, nie den ersten', () => {
    const rng = createRng(4);
    for (const w of ['Kühlschrank', 'butterfly', 'Schmetterling']) {
      const m = mixCase(w, rng, 2);
      expect(m.toLowerCase()).toBe(w.toLowerCase());
      expect(m[0]).toBe(w[0]);
      const diff = [...m].filter((c, i) => c !== w[i]).length;
      expect(diff).toBe(2);
    }
  });

  it('lässt ß unverändert (keine Längenänderung)', () => {
    const m = mixCase('ß', createRng(1), 3);
    expect(m).toBe('ß');
  });

  it('Auffüll-Wörter sind lang', () => {
    const rng = createRng(2);
    const words = Array.from({ length: 50 }, () => drawLongWord(BANK, rng, []));
    expect(words.reduce((s, w) => s + w.length, 0) / words.length).toBeGreaterThan(8);
  });
});
