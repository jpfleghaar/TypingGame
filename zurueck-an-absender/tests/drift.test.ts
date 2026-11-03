import { describe, expect, it } from 'vitest';
import { driftIntervalTicks, findChain, msToTicks, spawnDrift, type GameEvent } from '../src/core';
import { quietGame, run, setCargo, settle, texts, type } from './helpers';

function withDrift(seed = 1) {
  const g = quietGame(seed);
  setCargo(g, 0, []);
  setCargo(g, 1, []);
  const ev: GameEvent[] = [];
  spawnDrift(g, ev);
  return { g, word: g.drift[0].word.text };
}

describe('Treibgut', () => {
  it('erscheint regelmäßig in der Mitte, wenn aktiviert', () => {
    const g = quietGame(3, (c) => (c.drift.enabled = true));
    const ev = run(g, msToTicks(g.cfg.drift.firstSpawnMs) + 1);
    expect(ev.some((e) => e.type === 'DRIFT_SPAWNED')).toBe(true);
    expect(g.drift).toHaveLength(1);
    expect(g.drift[0].word.stage).toBe(1);
  });

  it('wer es zuerst tippt, fischt es und wirft es sofort zum Gegner (wächst eine Stufe)', () => {
    const { g, word } = withDrift();
    const ev = type(g, 1, word);
    expect(ev).toContainEqual(expect.objectContaining({ type: 'DRIFT_FISHED', ship: 1 }));
    expect(g.drift).toHaveLength(0);
    settle(g);
    expect(g.ships[0].cargo).toHaveLength(1);
    expect(g.ships[0].cargo[0].stage).toBe(2);
    expect(texts(g, 1)).toEqual([]);
  });

  it('der langsamere Spieler verliert seinen Fortschritt am selben Fass', () => {
    const { g, word } = withDrift();
    type(g, 0, word.slice(0, 2));
    expect(g.ships[0].typing.target?.kind).toBe('drift');
    const ev = type(g, 1, word);
    expect(ev).toContainEqual({ type: 'TARGET_LOST', ship: 0 });
    expect(g.ships[0].typing.target).toBeNull();
  });

  it('nicht gefischt: treibt nach ca. 6 s zum Schiff mit der leichteren Ladung', () => {
    const { g, word } = withDrift();
    setCargo(g, 0, [['Wasser', 1]]);
    setCargo(g, 1, [['Haus', 1]]); // Schiff 1 ist leichter
    run(g, msToTicks(6000) - 1);
    expect(g.drift).toHaveLength(1);
    const ev = run(g, 2);
    expect(ev).toContainEqual(expect.objectContaining({ type: 'DRIFT_EXPIRED', to: 1 }));
    settle(g);
    expect(texts(g, 1)).toContain(word); // ohne Wachstum
    expect(texts(g, 0)).toEqual(['Wasser']);
  });

  it('Spawn-Tempo steigt im Lauf der Runde bis zum Minimum', () => {
    const g = quietGame();
    const early = driftIntervalTicks(g);
    g.tick = msToTicks(120000);
    const later = driftIntervalTicks(g);
    g.tick = msToTicks(1200000);
    const veryLate = driftIntervalTicks(g);
    expect(later).toBeLessThan(early);
    expect(veryLate).toBe(msToTicks(g.cfg.drift.intervalMinMs));
  });

  it('Treibgut hat bei gleicher Länge Vorrang vor eigener Fracht', () => {
    const g = quietGame();
    setCargo(g, 0, [['Wald', 1]]);
    const chain = findChain('Wind');
    g.drift = [{ id: 999, word: { chain, stage: 1, text: 'Wind' }, spawnTick: 0, expireTick: 9999 }];
    type(g, 0, 'w');
    expect(g.ships[0].typing.target).toEqual({ kind: 'drift', id: 999 });
  });
});
