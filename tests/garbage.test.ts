import { describe, expect, it } from 'vitest';
import { applyBadgeBonus, cancelIncoming, createRng, DEFAULT_CONFIG, msToTicks, type IncomingGarbage } from '../src/core';
import { attackWith, idle, newGame, QUIET } from './helpers';

const pkt = (id: number, from: number, amount: number, arriveTick: number): IncomingGarbage => ({
  id,
  from,
  amount,
  sentTick: 0,
  arriveTick,
});

describe('cancelIncoming (Abwehr)', () => {
  it('zieht ältesten Müll zuerst ab und gibt den Rest zurück', () => {
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
    attackWith(s, 0, 1);
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

  it('eigener Angriff verrechnet eingehenden Müll NICHT (dafür ist Tab da)', () => {
    const s = newGame(2, 3, QUIET);
    attackWith(s, 1, 1); // P1 schickt 1 Müll an P0
    expect(s.players[0].incoming[0].amount).toBe(1);
    const events = attackWith(s, 0, 1);
    expect(events.some((e) => e.type === 'GARBAGE_CANCELLED')).toBe(false);
    expect(events.some((e) => e.type === 'ATTACK_SENT')).toBe(true);
    expect(s.players[0].incoming).toHaveLength(1);
    expect(s.players[1].incoming).toHaveLength(1);
  });

  it('Stapel-Überlauf durch Müll führt zum K.O.', () => {
    const s = newGame(2, 3, QUIET); // Stapel startet mit 12 Wörtern = voll
    attackWith(s, 0, 1);
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

describe('Neues Müll-Konzept: eigene längste Wörter werden verschoben', () => {
  const warn = () => msToTicks(DEFAULT_CONFIG.garbage.warningMs, DEFAULT_CONFIG) + 1;

  it('das längste eigene Wort (nicht das aktive) wandert zum Gegner', () => {
    const s = newGame(3, 8, QUIET); // 3 Spieler: noch kein Finale
    s.players[0].targetId = 1;
    s.players[0].strategy = 'manual';
    // Erwartung: stack[0] ist aktiv und bleibt, von stack[1..] geht das längste raus
    const candidates = s.players[0].stack.slice(1);
    const longest = [...candidates].sort((a, b) => b.text.length - a.text.length)[0];
    attackWith(s, 0, 1);
    const pkt = s.players[1].incoming[0];
    expect(pkt.words).toEqual([longest.text]);
    expect(s.players[0].stack.some((w) => w.id === longest.id)).toBe(false);
    idle(s, warn());
    expect(s.players[1].stack[1].text).toBe(longest.text);
    expect(s.players[1].stack[1].garbage).toBe(true);
  });

  it('zu wenige eigene Wörter: Rest wird mit langen Listenwörtern aufgefüllt', () => {
    const s = newGame(3, 8, { ...QUIET, initialWords: 3 });
    s.players[0].targetId = 1;
    s.players[0].strategy = 'manual';
    attackWith(s, 0, 4); // nur 2 Wörter außer dem aktiven: 2 aus dem Stapel, 2 aufgefüllt
    const pkt = s.players[1].incoming[0];
    expect(pkt.words).toHaveLength(4);
    expect(s.players[0].stack).toHaveLength(1);
    expect(pkt.words![3].length).toBeGreaterThan(5);
  });

  it('Groß-/Kleinschreibung wird erst im Finale (2 Spieler) gemischt', () => {
    for (const players of [3, 2]) {
      const s = newGame(players, 8, QUIET);
      s.players[0].targetId = 1;
      s.players[0].strategy = 'manual';
      attackWith(s, 0, 1);
      const sent = s.players[1].incoming[0].words![0];
      idle(s, warn());
      const arrived = s.players[1].stack[1].text;
      expect(arrived.toLowerCase()).toBe(sent.toLowerCase());
      if (players === 3) expect(arrived).toBe(sent);
      else expect(arrived).not.toBe(sent);
    }
  });

  it('Abwehr verbraucht auch die mitgeschickten Wörter', () => {
    const incoming = [{ id: 1, from: 4, amount: 3, words: ['a', 'b', 'c'], sentTick: 0, arriveTick: 10 }];
    cancelIncoming(incoming, 2);
    expect(incoming[0].amount).toBe(1);
    expect(incoming[0].words).toEqual(['c']);
  });
});
