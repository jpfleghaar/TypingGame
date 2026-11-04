import { describe, expect, it } from 'vitest';
import { computeTarget, createGame, step, type GameState, type PlayerId } from '../src/core';
import { BANK, newGame, QUIET } from './helpers';

function snapshot(s: GameState): Map<PlayerId, PlayerId | null> {
  return new Map(s.players.map((p) => [p.id, p.targetId]));
}

describe('Zielauswahl', () => {
  it('Schwache: zielt auf den vollsten Stapel inkl. angekündigtem Müll', () => {
    const s = newGame(4, 9, QUIET);
    const me = s.players[0];
    me.strategy = 'weakest';
    s.players[1].stack.length = 5;
    s.players[2].stack.length = 9;
    s.players[3].stack.length = 7;
    expect(computeTarget(s, me, snapshot(s))).toBe(2);
    s.players[3].incoming.push({ id: 1, from: 1, amount: 4, sentTick: 0, arriveTick: 999 });
    expect(computeTarget(s, me, snapshot(s))).toBe(3);
  });

  it('K.O.-Jäger: zielt auf die meisten Abzeichen', () => {
    const s = newGame(4, 9, QUIET);
    const me = s.players[0];
    me.strategy = 'badges';
    s.players[1].badges = 2;
    s.players[3].badges = 6;
    expect(computeTarget(s, me, snapshot(s))).toBe(3);
  });

  it('K.O.-Jäger: ohne Abzeichen Rückfall auf Zufall', () => {
    const s = newGame(4, 9, QUIET);
    const me = s.players[0];
    me.strategy = 'badges';
    const t = computeTarget(s, me, snapshot(s));
    expect(t).not.toBeNull();
    expect(t).not.toBe(0);
  });

  it('Angreifer: zielt auf wen, der mich anvisiert', () => {
    const s = newGame(4, 9, QUIET);
    const me = s.players[0];
    me.strategy = 'attackers';
    s.players[1].targetId = 2;
    s.players[2].targetId = 3;
    s.players[3].targetId = 0;
    expect(computeTarget(s, me, snapshot(s))).toBe(3);
  });

  it('Angreifer: wer zuletzt Müll geschickt hat, hat Vorrang', () => {
    const s = newGame(4, 9, QUIET);
    s.tick = 100;
    const me = s.players[0];
    me.strategy = 'attackers';
    s.players[1].targetId = 0;
    s.players[2].targetId = 0;
    me.incoming.push({ id: 1, from: 1, amount: 1, sentTick: 50, arriveTick: 230 });
    me.incoming.push({ id: 2, from: 2, amount: 1, sentTick: 90, arriveTick: 270 });
    expect(computeTarget(s, me, snapshot(s))).toBe(2);
  });

  it('nie sich selbst oder K.O.-Spieler', () => {
    const s = newGame(3, 9, QUIET);
    s.players[1].alive = false;
    for (const strategy of ['random', 'attackers', 'weakest', 'badges'] as const) {
      s.players[0].strategy = strategy;
      s.players[0].targetId = null;
      expect(computeTarget(s, s.players[0], snapshot(s))).toBe(2);
    }
  });

  it('Zufall: bleibt bis zum Ablauf beim selben Ziel', () => {
    const s = newGame(6, 9, QUIET);
    const me = s.players[0];
    me.strategy = 'random';
    me.targetId = computeTarget(s, me, snapshot(s));
    const first = me.targetId;
    s.tick += 10;
    expect(computeTarget(s, me, snapshot(s))).toBe(first);
    s.tick = me.retargetTick;
    expect(computeTarget(s, me, snapshot(s))).not.toBe(first);
  });
});

describe('Fairness der Zielwahl', () => {
  it('bei Gleichstand wird nicht immer die niedrigste ID gewählt', () => {
    const chosen = new Set<number>();
    for (let seed = 1; seed <= 40; seed++) {
      const s = newGame(8, seed, QUIET); // alle Stapel gleich hoch
      const me = s.players[5];
      me.strategy = 'weakest';
      me.targetId = null;
      chosen.add(computeTarget(s, me, snapshot(s))!);
    }
    expect(chosen.size).toBeGreaterThan(4);
  });

  it('zu Rundenbeginn zielen nicht alle Schwache-Bots auf Spieler 0', () => {
    let onZero = 0;
    let total = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const s = createGame({
        seed,
        bank: BANK,
        players: Array.from({ length: 19 }, (_, i) => ({ name: `P${i}`, strategy: i === 0 ? 'random' : 'weakest' })),
      });
      for (const p of s.players.slice(1)) {
        total++;
        if (p.targetId === 0) onZero++;
      }
    }
    // fair wären ~1/18 ≈ 5,6 %
    expect(onZero / total).toBeLessThan(0.12);
  });
});

describe('Ziel direkt wählen (Zifferntasten)', () => {
  it('SET_TARGET setzt das Ziel dauerhaft (Strategie "Manuell")', () => {
    const s = newGame(5, 3, QUIET);
    step(s, BANK, [{ type: 'SET_TARGET', playerId: 0, targetId: 3 }]);
    expect(s.players[0].strategy).toBe('manual');
    expect(s.players[0].targetId).toBe(3);
    for (let i = 0; i < 600; i++) step(s, BANK, []);
    expect(s.players[0].targetId).toBe(3);
  });

  it('ist das Ziel K.O., wird automatisch ein anderes gewählt', () => {
    const s = newGame(5, 3, QUIET);
    step(s, BANK, [{ type: 'SET_TARGET', playerId: 0, targetId: 3 }]);
    s.players[3].alive = false;
    step(s, BANK, []);
    expect(s.players[0].targetId).not.toBe(3);
    expect(s.players[0].targetId).not.toBeNull();
  });

  it('ungültige Ziele (sich selbst, K.O.) werden ignoriert; Tab führt zurück zu den Strategien', () => {
    const s = newGame(5, 3, QUIET);
    s.players[2].alive = false;
    const before = s.players[0].targetId;
    step(s, BANK, [{ type: 'SET_TARGET', playerId: 0, targetId: 0 }]);
    step(s, BANK, [{ type: 'SET_TARGET', playerId: 0, targetId: 2 }]);
    expect(s.players[0].strategy).toBe('random');
    expect(s.players[0].targetId).toBe(before);
    step(s, BANK, [{ type: 'SET_TARGET', playerId: 0, targetId: 4 }]);
    step(s, BANK, [{ type: 'CYCLE_STRATEGY', playerId: 0 }]);
    expect(s.players[0].strategy).toBe('random');
  });
});
