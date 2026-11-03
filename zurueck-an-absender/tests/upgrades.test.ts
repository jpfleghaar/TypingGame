import { describe, expect, it } from 'vitest';
import { capacity, flightTicks, load, msToTicks, nextEventPreview, step, UPGRADES, type GameEvent } from '../src/core';
import { applyUpgrade, dealCards } from '../src/core/upgrades';
import { debugStartSea } from '../src/core';
import { cmds, quietGame, setCargo, settle, texts, type } from './helpers';

describe('Upgrades', () => {
  it('Doppelwachstum: die nächsten 3 Würfe wachsen um zwei Stufen', () => {
    const g = quietGame();
    setCargo(g, 0, [['Kind', 1], ['Haus', 1], ['Wind', 1], ['Arm', 1]]);
    applyUpgrade(g, 0, 'doubleGrowth');
    const grown: number[] = [];
    for (const w of ['kind', 'haus', 'wind', 'arm']) {
      const ev = type(g, 0, w);
      const t = ev.find((e) => e.type === 'WORD_THROWN');
      if (t?.type === 'WORD_THROWN') grown.push(t.growth);
    }
    expect(grown).toEqual([2, 2, 2, 1]);
  });

  it('Schutzplane: der nächste eingehende Wurf prallt ab', () => {
    const g = quietGame();
    setCargo(g, 0, [['Haus', 1], ['Wind', 1]]);
    setCargo(g, 1, []);
    applyUpgrade(g, 1, 'tarp');
    type(g, 0, 'haus');
    const ev = settle(g);
    expect(ev.some((e) => e.type === 'WORD_BOUNCED')).toBe(true);
    expect(texts(g, 1)).toEqual([]);
    type(g, 0, 'wind');
    settle(g);
    expect(texts(g, 1)).toEqual(['Windmühle']);
  });

  it('Stärkere Planken: Tragfähigkeit +10 %', () => {
    const g = quietGame();
    applyUpgrade(g, 0, 'planks');
    expect(capacity(g, g.ships[0])).toBeCloseTo(132);
  });

  it('Schnelle Kanone: Würfe fliegen 40 % schneller', () => {
    const g = quietGame();
    const base = flightTicks(g, 0);
    applyUpgrade(g, 0, 'fastCannon');
    expect(flightTicks(g, 0)).toBe(Math.round(base / 1.4));
  });

  it('Lenzpumpe: sofort 15 Gewicht weniger (nie unter 0)', () => {
    const g = quietGame();
    setCargo(g, 0, [['Wasser', 2]]); // 11
    applyUpgrade(g, 0, 'bilgePump');
    expect(load(g.ships[0])).toBe(0);
    setCargo(g, 0, [['Wasser', 3]]); // 19
    expect(load(g.ships[0])).toBe(4);
  });

  it('Harpune: Treibgut gilt nach der Hälfte der Buchstaben als gefischt', () => {
    const g = quietGame();
    setCargo(g, 0, []);
    applyUpgrade(g, 0, 'harpoon');
    g.drift = [{ id: 500, word: { chain: 0, stage: 1, text: 'Haus' }, spawnTick: 0, expireTick: 9999 }];
    const ev = type(g, 0, 'ha');
    expect(ev).toContainEqual(expect.objectContaining({ type: 'DRIFT_FISHED', ship: 0 }));
  });

  it('Harpune wirkt nicht auf eigene Fracht', () => {
    const g = quietGame();
    setCargo(g, 0, [['Haus', 1]]);
    applyUpgrade(g, 0, 'harpoon');
    type(g, 0, 'ha');
    expect(g.projectiles).toHaveLength(0);
  });

  it('Ballast: angetipptes Wort per Tab ins Meer, nicht zum Gegner, nur einmal', () => {
    const g = quietGame();
    setCargo(g, 0, [['Haus', 1], ['Wind', 1]]);
    setCargo(g, 1, []);
    applyUpgrade(g, 0, 'ballast');
    type(g, 0, 'h');
    const ev = step(g, cmds(0, [{ type: 'ballast' }]));
    expect(ev).toContainEqual({ type: 'WORD_DUMPED', ship: 0, text: 'Haus' });
    expect(texts(g, 0)).toEqual(['Wind']);
    expect(g.projectiles).toHaveLength(0);
    type(g, 0, 'w');
    step(g, cmds(0, [{ type: 'ballast' }]));
    expect(texts(g, 0)).toEqual(['Wind']);
  });

  it('Anker: der nächste Sturm wirkt nicht auf das eigene Schiff', () => {
    const g = quietGame();
    setCargo(g, 0, [['Haus', 1], ['Wind', 1]]);
    setCargo(g, 1, [['Arm', 1]]);
    applyUpgrade(g, 1, 'anchor');
    const ev: GameEvent[] = [];
    debugStartSea(g, 'storm', ev);
    expect(g.ships[1].mods.anchoredThisStorm).toBe(true);
    expect(g.ships[1].mods.anchor).toBe(0);
    type(g, 0, 'haus');
    settle(g);
    expect(g.ships[1].cargo.find((c) => c.text === 'Haustür')!.weight).toBe(7);
    // eigene Würfe beim Gegner bekommen den Sturm-Zuschlag trotzdem
    type(g, 1, 'arm');
    settle(g);
    expect(g.ships[0].cargo.find((c) => c.text === 'Armband')!.weight).toBeCloseTo(7 * 1.25);
  });

  it('Ausguck: zeigt das nächste Ereignis an', () => {
    const g = quietGame(1, (c) => {
      c.island.enabled = true;
      c.seaEvents.enabled = true;
    });
    applyUpgrade(g, 0, 'lookout');
    expect(g.ships[0].mods.lookout).toBe(true);
    const next = nextEventPreview(g);
    expect(next).not.toBeNull();
    expect(next!.startTick).toBeGreaterThan(g.tick);
  });

  it('nicht stapelbare Karten werden nicht erneut angeboten', () => {
    const g = quietGame();
    applyUpgrade(g, 0, 'harpoon');
    applyUpgrade(g, 0, 'lookout');
    for (let i = 0; i < 50; i++) {
      const cards = dealCards(g, 0);
      expect(cards).not.toContain('harpoon');
      expect(cards).not.toContain('lookout');
    }
  });

  it('jede Karte in der Liste hat einen Effekt', () => {
    for (const u of UPGRADES) {
      const g = quietGame();
      const before = JSON.stringify({ m: g.ships[0].mods, r: g.ships[0].relief });
      applyUpgrade(g, 0, u.id);
      expect(JSON.stringify({ m: g.ships[0].mods, r: g.ships[0].relief }), u.id).not.toBe(before);
    }
  });
});

describe('Ereignisse auf See', () => {
  it('Sturm: landende Würfe wiegen +25 %', () => {
    const g = quietGame();
    setCargo(g, 0, [['Haus', 1]]);
    setCargo(g, 1, []);
    debugStartSea(g, 'storm', []);
    type(g, 0, 'haus');
    settle(g);
    expect(g.ships[1].cargo[0].weight).toBeCloseTo(7 * 1.25);
  });

  it('Rückenwind: Würfe fliegen schneller, Treibgut kommt häufiger', async () => {
    const g = quietGame();
    const { driftIntervalTicks } = await import('../src/core');
    const flight = flightTicks(g, 0);
    const interval = driftIntervalTicks(g);
    debugStartSea(g, 'tailwind', []);
    expect(flightTicks(g, 0)).toBeLessThan(flight);
    expect(driftIntervalTicks(g)).toBeLessThan(interval);
  });

  it('Ereignisse werden angekündigt, starten und enden wieder', () => {
    const g = quietGame(9, (c) => {
      c.seaEvents.enabled = true;
      c.island.enabled = true;
    });
    const plan = g.schedule.sea!;
    expect(plan).not.toBeNull();
    expect(plan.startTick - plan.warnTick).toBe(msToTicks(4000));
    // liegt vor der Inselwarnung
    expect(plan.endTick).toBeLessThan(g.schedule.island!.warnTick);
    const types: string[] = [];
    for (let i = 0; i < plan.endTick + 1; i++) types.push(...step(g, [[], []]).map((e) => e.type));
    expect(types).toContain('SEA_EVENT_WARNING');
    expect(types).toContain('SEA_EVENT_START');
    expect(types).toContain('SEA_EVENT_END');
    expect(g.activeSea).toBeNull();
  });
});
