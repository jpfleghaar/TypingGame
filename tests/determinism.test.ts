import { describe, expect, it } from 'vitest';
import { createRng, next, problemWords, results, step, type Command, type GameState } from '../src/core';
import { DEFAULT_CONFIG } from '../src/core/config';
import { BANK, newGame } from './helpers';

/** Primitive Test-Spieler: tippen zufällig (mit Fehlern) aus eigenem Seed. */
function simulate(seed: number, ticks: number): { state: GameState; log: string[] } {
  const state = newGame(6, seed);
  const r = createRng(seed ^ 0xabc);
  const log: string[] = [];
  for (let t = 0; t < ticks && !state.finished; t++) {
    const cmds: Command[] = [];
    for (const p of state.players) {
      if (!p.alive || p.stack.length === 0 || next(r) > 0.05 + p.id * 0.025) continue;
      const ch = next(r) < 0.05 ? '#' : p.stack[0].text[p.cursor];
      cmds.push({ type: 'KEY', playerId: p.id, key: ch });
    }
    if (t % 600 === 0) cmds.push({ type: 'CYCLE_STRATEGY', playerId: t % 6 });
    for (const e of step(state, BANK, cmds)) log.push(`${t}:${e.type}`);
  }
  return { state, log };
}

describe('Determinismus', () => {
  it('gleicher Seed + gleiche Eingaben = gleicher Verlauf', () => {
    const a = simulate(2024, 60 * 120);
    const b = simulate(2024, 60 * 120);
    expect(a.log).toEqual(b.log);
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
  });

  it('anderer Seed = anderer Verlauf', () => {
    const a = simulate(1, 60 * 30);
    const b = simulate(2, 60 * 30);
    expect(JSON.stringify(a.state.players[0].stack)).not.toBe(JSON.stringify(b.state.players[0].stack));
  });

  it('Befehlsreihenfolge zwischen Spielern spielt keine Rolle', () => {
    const a = newGame(2, 3);
    const b = newGame(2, 3);
    const c0: Command = { type: 'KEY', playerId: 0, key: a.players[0].stack[0].text[0] };
    const c1: Command = { type: 'KEY', playerId: 1, key: a.players[1].stack[0].text[0] };
    step(a, BANK, [c0, c1]);
    step(b, BANK, [c1, c0]);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('ein voll simuliertes Spiel endet mit Gewinner und Endübersicht', () => {
    const { state } = simulate(7, 60 * 60 * 15);
    expect(state.finished).toBe(true);
    const res = results(state);
    expect(res[0].placement).toBe(1);
    expect(new Set(res.map((r) => r.placement)).size).toBe(6);
    expect(res.every((r) => r.accuracy > 0 && r.accuracy <= 1)).toBe(true);
  });
});

describe('Problemwörter', () => {
  it('findet relativ langsame und fehlerhafte Wörter', () => {
    const log = [
      ...Array.from({ length: 10 }, (_, i) => ({ text: `wort${'x'.repeat(i % 3)}`, garbage: false, ticks: 30, errors: 0 })),
      { text: 'Schwierigkeit', garbage: false, ticks: 12 * 20, errors: 0 },
      { text: 'Fehlerwort', garbage: false, ticks: 9 * 7, errors: 2 },
      { text: 'MüllWort42', garbage: true, ticks: 900, errors: 5 },
    ];
    const list = problemWords(log, DEFAULT_CONFIG).map((w) => w.text);
    expect(list).toContain('Schwierigkeit');
    expect(list).toContain('Fehlerwort');
    expect(list).not.toContain('MüllWort42');
    expect(list).not.toContain('wort');
  });
});
