import { describe, expect, it } from 'vitest';
import { createMatch, finishRound, startNextRound, step } from '../src/core';
import { quietCfg, quietGame, setCargo, settle, type } from './helpers';

describe('Sieg-Bedingung', () => {
  it('Schiff sinkt bei 100 % Tragfähigkeit, der andere gewinnt', () => {
    const g = quietGame(1, (c) => (c.ship.capacity = 20));
    setCargo(g, 0, [['Haus', 2]]);
    setCargo(g, 1, [['Wasser', 2]]); // 11
    type(g, 0, 'haustür');
    const ev = settle(g); // 11 + 16 = 27 ≥ 20
    expect(ev).toContainEqual({ type: 'SHIP_SUNK', ship: 1 });
    expect(g.phase).toBe('over');
    expect(g.winner).toBe(0);
  });

  it('knapp unter 100 % sinkt nicht', () => {
    const g = quietGame(1, (c) => (c.ship.capacity = 16));
    setCargo(g, 0, [['Haus', 1]]);
    setCargo(g, 1, [['Wind', 1], ['Arm', 1]]); // 7
    type(g, 0, 'haus');
    settle(g); // 7 + 7 = 14 < 16
    expect(g.phase).toBe('sea');
  });

  it('nach dem Untergang tippt niemand mehr', () => {
    const g = quietGame(1, (c) => (c.ship.capacity = 10));
    setCargo(g, 0, [['Haus', 2], ['Wind', 1]]);
    setCargo(g, 1, []);
    type(g, 0, 'haustür');
    settle(g);
    expect(g.phase).toBe('over');
    const tick = g.tick;
    expect(type(g, 0, 'wind')).toEqual([]);
    expect(g.tick).toBe(tick);
  });

  it('Best of 3: zwei Siege entscheiden das Match', () => {
    const m = createMatch(7, quietCfg((c) => (c.ship.capacity = 10)));
    const sinkShip1 = () => {
      setCargo(m.game, 0, [['Haus', 2]]);
      setCargo(m.game, 1, []);
      type(m.game, 0, 'haustür');
      while (m.game.phase !== 'over') step(m.game, [[], []]);
    };
    sinkShip1();
    expect(finishRound(m)).toBe(false);
    startNextRound(m);
    expect(m.round).toBe(2);
    sinkShip1();
    expect(finishRound(m)).toBe(true);
    expect(m.winner).toBe(0);
    expect(m.history).toHaveLength(2);
    expect(m.history[0].ships[0].thrown).toBe(1);
    expect(m.history[0].ships[0].longestThrown).toBe('Haustür');
    expect(m.history[0].ships[0].accuracy).toBe(1);
  });
});
