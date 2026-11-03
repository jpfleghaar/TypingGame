import { describe, expect, it } from 'vitest';
import { applyBadgeBonus, cancelIncoming, createRng, DEFAULT_CONFIG, msToTicks, type IncomingGarbage } from '../src/core';
import { idle, newGame, QUIET, typeWord } from './helpers';

const pkt = (id: number, from: number, amount: number, arriveTick: number): IncomingGarbage => ({
  id,
  from,
  amount,
  sentTick: 0,
  arriveTick,
});

describe('cancelIncoming', () => {
  it('verrechnet ältesten Müll zuerst und gibt den Rest zurück', () => {
    const incoming = [pkt(2, 5, 2, 200), pkt(1, 4, 1, 100)];
    const r = cancelIncoming(incoming, 2);
    expect(r.remaining).toBe(0);
    expect(r.cancelled).toEqual([
      { from: 4, amount: 1 },
      { from: 5, amount: 1 },
    ]);
    expect(incoming).toEqual([pkt(2, 5, 1, 200)]);
  });

  it('Überschuss bleibt als Angriff übrig', () => {
    const incoming = [pkt(1, 4, 1, 100)];
    const r = cancelIncoming(incoming, 3);
    expect(r.remaining).toBe(2);
    expect(incoming).toHaveLength(0);
  });

  it('ohne eingehenden Müll geht alles raus', () => {
    expect(cancelIncoming([], 2)).toEqual({ remaining: 2, cancelled: [] });
  });
});

describe('Müll im Spiel', () => {
  it('landet nach der Warnzeit direkt über dem aktiven Wort', () => {
    const s = newGame(2, 3, { ...QUIET, initialWords: 4 });
    for (let i = 0; i < 3; i++) typeWord(s, 0);
    const victim = s.players[1];
    const active = victim.stack[0];
    const before = victim.stack.length;
    idle(s, msToTicks(DEFAULT_CONFIG.garbage.warningMs, DEFAULT_CONFIG) - 2);
    expect(victim.stack.length).toBe(before);
    idle(s, 2);
    expect(victim.stack.length).toBe(before + 1);
    expect(victim.stack[0]).toBe(active);
    expect(victim.stack[1].garbage).toBe(true);
    expect(victim.incoming).toHaveLength(0);
  });

  it('eigener Angriff verrechnet erst eingehenden Müll', () => {
    const s = newGame(2, 3, QUIET);
    // P1 schickt 1 Müll an P0
    for (let i = 0; i < 3; i++) typeWord(s, 1);
    expect(s.players[0].incoming[0].amount).toBe(1);
    // P0 kontert mit einem eigenen Angriff (1) -> neutralisiert, nichts geht raus
    typeWord(s, 0);
    typeWord(s, 0);
    const events = typeWord(s, 0);
    expect(events.some((e) => e.type === 'GARBAGE_CANCELLED')).toBe(true);
    expect(events.some((e) => e.type === 'ATTACK_SENT')).toBe(false);
    expect(s.players[0].incoming).toHaveLength(0);
    expect(s.players[1].incoming).toHaveLength(0);
  });

  it('Stapel-Überlauf durch Müll führt zum K.O.', () => {
    const s = newGame(2, 3, QUIET); // Stapel startet mit 12 Wörtern = voll
    for (let i = 0; i < 3; i++) typeWord(s, 0);
    idle(s, msToTicks(DEFAULT_CONFIG.garbage.warningMs, DEFAULT_CONFIG) + 1);
    expect(s.players[1].alive).toBe(false);
    expect(s.finished).toBe(true);
    expect(s.winnerId).toBe(0);
  });
});

describe('applyBadgeBonus', () => {
  it('ohne Abzeichen kein Bonus', () => {
    expect(applyBadgeBonus(2, 0, DEFAULT_CONFIG, createRng(1))).toBe(2);
  });

  it('+100 % verdoppelt exakt', () => {
    expect(applyBadgeBonus(3, 30, DEFAULT_CONFIG, createRng(1))).toBe(6);
  });

  it('Bruchteile werden im Schnitt korrekt gerundet', () => {
    const rng = createRng(7);
    let sum = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) sum += applyBadgeBonus(1, 2, DEFAULT_CONFIG, rng); // 1.25
    expect(sum / n).toBeGreaterThan(1.2);
    expect(sum / n).toBeLessThan(1.3);
  });
});
