import { describe, expect, it } from 'vitest';
import { computeTarget, type GameState, type PlayerId } from '../src/core';
import { newGame, QUIET } from './helpers';

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
