import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, results, step, wordsPerPoint, type GameConfig } from '../src/core';
import { attackWith, BANK, newGame, QUIET, typeWord, typeWords } from './helpers';

/** Viel Platz für Punkte, damit Tempo-Tests nicht ans Maximum stoßen. */
const ROOMY: GameConfig = { ...QUIET, points: { ...QUIET.points, max: 99 } };

describe('wordsPerPoint (Config)', () => {
  it('Combo 0–9: 3, 10–19: 2, ab 20: 1 Wort pro Punkt', () => {
    for (const c of [0, 1, 9]) expect(wordsPerPoint(c, DEFAULT_CONFIG)).toBe(3);
    for (const c of [10, 15, 19]) expect(wordsPerPoint(c, DEFAULT_CONFIG)).toBe(2);
    for (const c of [20, 35, 100]) expect(wordsPerPoint(c, DEFAULT_CONFIG)).toBe(1);
  });

  it('Maximum steht in der Config (Standard 8)', () => {
    expect(DEFAULT_CONFIG.points.max).toBe(8);
  });
});

describe('Combo', () => {
  it('steigt pro fehlerfreiem Wort', () => {
    const s = newGame(2, 1, QUIET);
    typeWords(s, 0, 2);
    expect(s.players[0].combo).toBe(2);
    expect(s.players[0].stats.wordsCleared).toBe(2);
  });

  it('ein Wort mit Tippfehler zählt weder für Combo noch für Punkte', () => {
    const s = newGame(2, 1, QUIET);
    typeWord(s, 0, { typo: true });
    expect(s.players[0].combo).toBe(0);
    expect(s.players[0].pointProgress).toBe(0);
    expect(s.players[0].stats.wordsCleared).toBe(1);
    typeWord(s, 0);
    expect(s.players[0].combo).toBe(1);
    expect(s.players[0].pointProgress).toBe(1);
  });

  it('Tippfehler setzt Combo und Fortschritt auf 0 – Punkte bleiben, Wort bleibt stehen', () => {
    const s = newGame(2, 1, QUIET);
    typeWords(s, 0, 5); // 1 Punkt, Fortschritt 2/3
    const me = s.players[0];
    expect(me.points).toBe(1);
    expect(me.pointProgress).toBe(2);
    const word = me.stack[0];
    const events = step(s, BANK, [{ type: 'KEY', playerId: 0, key: '#' }]);
    expect(me.combo).toBe(0);
    expect(me.pointProgress).toBe(0);
    expect(me.points).toBe(1);
    expect(me.stack[0]).toBe(word);
    expect(events.map((e) => e.type)).toContain('COMBO_BROKEN');
  });

  it('Ausgeben von Punkten ändert die Combo nicht', () => {
    const s = newGame(3, 2, QUIET);
    typeWords(s, 0, 6); // 2 Punkte, Combo 6
    const me = s.players[0];
    me.incoming.push({ id: 90, from: 1, amount: 1, words: ['x'], sentTick: 0, arriveTick: 1e9 });
    step(s, BANK, [{ type: 'DEFEND', playerId: 0 }]);
    step(s, BANK, [{ type: 'SEND_ATTACK', playerId: 0 }]);
    expect(me.points).toBe(0);
    expect(me.combo).toBe(6);
  });
});

describe('Punkte sammeln', () => {
  it('Combo 0–9: alle 3 fehlerfreien Wörter ein Punkt', () => {
    const s = newGame(2, 1, QUIET);
    const earned = (n: number) => typeWords(s, 0, n).filter((e) => e.type === 'POINT_EARNED');
    expect(earned(2)).toHaveLength(0);
    expect(earned(1)).toMatchObject([{ type: 'POINT_EARNED', playerId: 0, total: 1 }]);
    expect(s.players[0].pointProgress).toBe(0);
    earned(3);
    expect(s.players[0].points).toBe(2);
  });

  it('ab Combo 10 alle 2, ab Combo 20 jedes Wort ein Punkt', () => {
    const s = newGame(2, 1, ROOMY);
    const me = s.players[0];
    typeWords(s, 0, 9); // Combo 9: 3 Punkte
    expect(me.points).toBe(3);
    typeWords(s, 0, 10); // Combo 10–19: 10 Wörter = 5 Punkte
    expect(me.combo).toBe(19);
    expect(me.points).toBe(8);
    typeWords(s, 0, 4); // Combo 20–23: jedes Wort ein Punkt
    expect(me.points).toBe(12);
  });

  it('nach einem Tippfehler gilt wieder das langsame Tempo', () => {
    const s = newGame(2, 1, ROOMY);
    const me = s.players[0];
    typeWords(s, 0, 21);
    step(s, BANK, [{ type: 'KEY', playerId: 0, key: '#' }]);
    typeWord(s, 0); // Wort mit Fehler zu Ende – zählt nicht
    const before = me.points;
    typeWords(s, 0, 2);
    expect(me.points).toBe(before);
    typeWord(s, 0);
    expect(me.points).toBe(before + 1);
  });

  it('beim Maximum verfallen weitere Punkte', () => {
    const cfg = { ...QUIET, points: { ...QUIET.points, max: 2 } };
    const s = newGame(2, 1, cfg);
    const events = typeWords(s, 0, 12); // 4 Punkte verdient, nur 2 passen
    const me = s.players[0];
    expect(me.points).toBe(2);
    expect(me.stats.pointsEarned).toBe(2);
    expect(me.stats.pointsLost).toBe(2);
    expect(events.filter((e) => e.type === 'POINT_LOST')).toHaveLength(2);
  });

  it('Standard: maximal 8 Punkte', () => {
    const s = newGame(2, 1, QUIET);
    typeWords(s, 0, 30);
    expect(s.players[0].points).toBe(8);
    expect(s.players[0].stats.pointsLost).toBeGreaterThan(0);
  });
});

describe('Angriff (Enter)', () => {
  it('gibt ALLE Punkte aus und schickt 1 Müllwort pro Punkt an das Ziel', () => {
    const s = newGame(3, 2, QUIET);
    s.players[0].strategy = 'manual';
    s.players[0].targetId = 2;
    const events = attackWith(s, 0, 5);
    expect(events.find((e) => e.type === 'ATTACK_SENT')).toMatchObject({ from: 0, to: 2, amount: 5, pointsSpent: 5 });
    expect(s.players[0].points).toBe(0);
    expect(s.players[0].stats.pointsAttack).toBe(5);
    expect(s.players[2].incoming[0].amount).toBe(5);
  });

  it('Punkte werden nicht automatisch ausgegeben', () => {
    const s = newGame(3, 2, QUIET);
    const events = typeWords(s, 0, 9);
    for (let i = 0; i < 600; i++) events.push(...step(s, BANK, []));
    expect(events.some((e) => e.type === 'ATTACK_SENT')).toBe(false);
    expect(s.players[0].points).toBe(3);
  });

  it('ohne Punkte passiert nichts', () => {
    const s = newGame(3, 2, QUIET);
    const events = attackWith(s, 0, 0);
    expect(events.some((e) => e.type === 'ATTACK_SENT')).toBe(false);
  });

  it('verrechnet eingehenden Müll nicht', () => {
    const s = newGame(3, 2, QUIET);
    s.players[0].incoming.push({ id: 90, from: 1, amount: 2, words: ['a', 'b'], sentTick: 0, arriveTick: 1e9 });
    attackWith(s, 0, 3);
    expect(s.players[0].incoming[0].amount).toBe(2);
    const sent = s.players.filter((p) => p.id !== 0).reduce((n, p) => n + p.incoming.reduce((m, g) => m + g.amount, 0), 0);
    expect(sent).toBe(3);
  });
});

describe('Abwehr (Tab)', () => {
  it('kostet 1 Punkt pro Wort, älteste zuerst; Rest kommt an', () => {
    const s = newGame(3, 2, QUIET);
    const me = s.players[0];
    me.points = 2;
    me.incoming.push({ id: 1, from: 1, amount: 3, words: ['a', 'b', 'c'], sentTick: 0, arriveTick: 9999 });
    const events = step(s, BANK, [{ type: 'DEFEND', playerId: 0 }]);
    expect(events.find((e) => e.type === 'DEFENDED')).toMatchObject({ amount: 2, pointsSpent: 2 });
    expect(me.points).toBe(0);
    expect(me.incoming[0].amount).toBe(1);
    expect(me.stats.pointsDefense).toBe(2);
  });

  it('übrige Punkte bleiben erhalten', () => {
    const s = newGame(3, 2, QUIET);
    const me = s.players[0];
    me.points = 5;
    me.incoming.push({ id: 1, from: 1, amount: 2, words: ['a', 'b'], sentTick: 0, arriveTick: 9999 });
    step(s, BANK, [{ type: 'DEFEND', playerId: 0 }]);
    expect(me.incoming).toHaveLength(0);
    expect(me.points).toBe(3);
  });

  it('ohne Punkte passiert nichts', () => {
    const s = newGame(3, 2, QUIET);
    const me = s.players[0];
    me.combo = 15; // Combo zählt nicht als Währung
    me.incoming.push({ id: 1, from: 1, amount: 1, sentTick: 0, arriveTick: 9999 });
    expect(step(s, BANK, [{ type: 'DEFEND', playerId: 0 }]).some((e) => e.type === 'DEFENDED')).toBe(false);
    expect(me.incoming).toHaveLength(1);
  });
});

describe('Auswertung', () => {
  it('zählt Max. Combo, verdiente, ausgegebene und verfallene Punkte', () => {
    const cfg = { ...QUIET, points: { ...QUIET.points, max: 3 } };
    const s = newGame(3, 2, cfg);
    typeWords(s, 0, 12); // 4 verdient: 3 behalten, 1 verfallen
    s.players[0].incoming.push({ id: 1, from: 1, amount: 1, words: ['a'], sentTick: 0, arriveTick: 1e9 });
    step(s, BANK, [{ type: 'DEFEND', playerId: 0 }]); // 1 für Abwehr
    step(s, BANK, [{ type: 'SEND_ATTACK', playerId: 0 }]); // 2 für Angriff
    const r = results(s).find((x) => x.id === 0)!;
    expect(r).toMatchObject({ maxCombo: 12, pointsEarned: 3, pointsDefense: 1, pointsAttack: 2, pointsLost: 1 });
  });
});

describe('Leerer Stapel', () => {
  it('bekommt sofort ein neues Wort, ohne auf den Timer zu warten', () => {
    const s = newGame(2, 4, { ...QUIET, initialWords: 2 });
    typeWord(s, 0);
    const events = typeWord(s, 0); // letztes Wort weg
    expect(s.players[0].stack).toHaveLength(1);
    expect(events.some((e) => e.type === 'WORD_SPAWNED' && e.playerId === 0)).toBe(true);
    expect(s.players[1].stack).toHaveLength(2);
  });

  it('schnelle und langsame Spieler bekommen dieselbe Wortfolge', () => {
    const s = newGame(2, 4, { ...QUIET, initialWords: 2 });
    const typedBy0: string[] = [];
    for (let i = 0; i < 8; i++) {
      typedBy0.push(s.players[0].stack[0].text);
      typeWord(s, 0);
    }
    const typedBy1: string[] = [];
    for (let i = 0; i < 8; i++) {
      typedBy1.push(s.players[1].stack[0].text);
      typeWord(s, 1);
    }
    expect(typedBy1).toEqual(typedBy0);
  });
});
