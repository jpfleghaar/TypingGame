import { describe, expect, it } from 'vitest';
import { badgeBonus, DEFAULT_CONFIG, msToTicks } from '../src/core';
import { attackWith, idle, newGame, QUIET } from './helpers';

describe('badgeBonus', () => {
  it('folgt den Stufen', () => {
    const b = (n: number) => badgeBonus(n, DEFAULT_CONFIG);
    expect(b(0)).toBe(0);
    expect(b(1)).toBe(0);
    expect(b(2)).toBe(0.25);
    expect(b(5)).toBe(0.25);
    expect(b(6)).toBe(0.5);
    expect(b(14)).toBe(0.75);
    expect(b(30)).toBe(1);
    expect(b(99)).toBe(1);
  });
});

describe('K.O.-Abzeichen', () => {
  it('K.O.-Geber erhält Abzeichen des Opfers + 1', () => {
    const s = newGame(3, 5, QUIET);
    s.players[0].targetId = 1;
    s.players[0].strategy = 'weakest';
    s.players[1].badges = 4;
    // P1 hat den vollsten Stapel -> wird von "weakest" anvisiert
    s.players[2].stack.splice(0, 5);
    attackWith(s, 0, 1);
    expect(s.players[1].incoming).toHaveLength(1);
    idle(s, msToTicks(DEFAULT_CONFIG.garbage.warningMs, DEFAULT_CONFIG) + 1);
    const victim = s.players[1];
    expect(victim.alive).toBe(false);
    expect(victim.koBy).toBe(0);
    expect(victim.placement).toBe(3);
    expect(s.players[0].badges).toBe(5);
    expect(s.players[0].stats.kos).toBe(1);
  });

  it('ohne Treffer im Zeitfenster gibt es keinen K.O.-Geber', () => {
    const s = newGame(3, 5, { ...QUIET, initialWords: 13 });
    // alle haben 13 Wörter -> Überlauf im ersten Tick, ohne Angreifer
    idle(s, 1);
    const kos = s.players.filter((p) => !p.alive);
    expect(kos.length).toBe(2);
    expect(kos.every((p) => p.koBy === null)).toBe(true);
    expect(s.players.every((p) => p.badges === 0)).toBe(true);
    // genau einer überlebt und gewinnt
    expect(s.finished).toBe(true);
    expect(s.players.find((p) => p.alive)?.placement).toBe(1);
  });
});
