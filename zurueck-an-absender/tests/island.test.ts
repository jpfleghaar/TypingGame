import { describe, expect, it } from 'vitest';
import { debugStartIsland, msToTicks, step, type GameEvent } from '../src/core';
import { cmds, quietGame, run, setCargo, settle, texts, type } from './helpers';

function islandGame() {
  const g = quietGame(5, (c) => {
    c.island.enabled = true;
    c.drift.enabled = true;
  });
  return g;
}

describe('Inseln', () => {
  it('kommt nach 60–90 s, mit 5 s Vorwarnung, und dauert ca. 10 s', () => {
    const g = islandGame();
    const isl = g.schedule.island!;
    expect(isl.startTick).toBeGreaterThanOrEqual(msToTicks(60000));
    expect(isl.startTick).toBeLessThanOrEqual(msToTicks(90000));
    expect(isl.startTick - isl.warnTick).toBe(msToTicks(5000));
    expect(isl.endTick - isl.startTick).toBe(msToTicks(10000));
    const ev = run(g, isl.startTick);
    expect(ev.map((e) => e.type)).toContain('ISLAND_WARNING');
    expect(ev.map((e) => e.type)).toContain('ISLAND_START');
    expect(g.phase).toBe('island');
  });

  it('blockiert Tippen und Würfe; nur Upgrade-Tasten wirken', () => {
    const g = islandGame();
    setCargo(g, 0, [['Haus', 1]]);
    const ev: GameEvent[] = [];
    debugStartIsland(g, ev);
    type(g, 0, 'haus');
    expect(texts(g, 0)).toEqual(['Haus']);
    expect(g.projectiles).toHaveLength(0);
    step(g, cmds(0, [{ type: 'chooseUpgrade', index: 1 }]));
    expect(g.ships[0].cardChosen).toBe(true);
    expect(g.ships[0].upgradesChosen).toHaveLength(1);
  });

  it('setzt den Fortschritt am aktiven Wort zurück', () => {
    const g = islandGame();
    setCargo(g, 0, [['Haus', 1]]);
    type(g, 0, 'ha');
    debugStartIsland(g, []);
    expect(g.ships[0].typing).toEqual({ target: null, typed: 0, error: null });
  });

  it('Würfe in der Luft landen trotzdem', () => {
    const g = islandGame();
    setCargo(g, 0, [['Haus', 1]]);
    setCargo(g, 1, []);
    type(g, 0, 'haus');
    debugStartIsland(g, []);
    settle(g);
    expect(texts(g, 1)).toEqual(['Haustür']);
  });

  it('kein Treibgut während der Insel; vorhandenes treibt davon', () => {
    const g = islandGame();
    run(g, msToTicks(g.cfg.drift.firstSpawnMs) + 1);
    expect(g.drift.length).toBeGreaterThan(0);
    const ev: GameEvent[] = [];
    debugStartIsland(g, ev);
    expect(ev.some((e) => e.type === 'DRIFT_LOST')).toBe(true);
    expect(g.drift).toHaveLength(0);
    const during = run(g, msToTicks(9000));
    expect(during.some((e) => e.type === 'DRIFT_SPAWNED')).toBe(false);
  });

  it('jedes Schiff bekommt 3 verschiedene Karten; ohne Wahl gibt es eine zufällige', () => {
    const g = islandGame();
    debugStartIsland(g, []);
    for (const s of g.ships) {
      expect(s.cards).toHaveLength(3);
      expect(new Set(s.cards).size).toBe(3);
    }
    step(g, cmds(1, [{ type: 'chooseUpgrade', index: 0 }]));
    const chosen1 = g.ships[1].cards![0];
    const ev = run(g, msToTicks(10000) + 1);
    expect(ev).toContainEqual(expect.objectContaining({ type: 'UPGRADE_CHOSEN', ship: 0, random: true }));
    expect(ev).toContainEqual({ type: 'ISLAND_END' });
    expect(g.phase).toBe('sea');
    expect(g.ships[0].upgradesChosen).toHaveLength(1);
    expect(g.ships[1].upgradesChosen).toEqual([chosen1]);
  });

  it('eine zweite Wahl auf derselben Insel wird ignoriert', () => {
    const g = islandGame();
    debugStartIsland(g, []);
    step(g, cmds(0, [{ type: 'chooseUpgrade', index: 0 }, { type: 'chooseUpgrade', index: 1 }]));
    expect(g.ships[0].upgradesChosen).toHaveLength(1);
  });

  it('nach der Insel geht es normal weiter und die nächste Insel ist geplant', () => {
    const g = islandGame();
    setCargo(g, 0, [['Haus', 1]]);
    debugStartIsland(g, []);
    run(g, msToTicks(10000) + 1);
    type(g, 0, 'haus');
    expect(g.projectiles).toHaveLength(1);
    expect(g.schedule.island!.startTick).toBeGreaterThan(g.tick + msToTicks(55000));
  });
});
