import { describe, expect, it } from 'vitest';
import { comboAttack, DEFAULT_CONFIG, step } from '../src/core';
import { BANK, newGame, QUIET, typeWord } from './helpers';

describe('comboAttack', () => {
  it('löst an den konfigurierten Stufen aus', () => {
    const table = Array.from({ length: 23 }, (_, c) => comboAttack(c, DEFAULT_CONFIG));
    expect(table[3]).toBe(1);
    expect(table[6]).toBe(2);
    expect(table[10]).toBe(3);
    // danach alle 4 Wörter 3 Müll
    expect(table[14]).toBe(3);
    expect(table[18]).toBe(3);
    expect(table[22]).toBe(3);
    // dazwischen nichts
    for (const c of [0, 1, 2, 4, 5, 7, 8, 9, 11, 12, 13, 15]) expect(table[c]).toBe(0);
  });
});

describe('Combo im Spiel', () => {
  it('steigt pro fehlerfreiem Wort', () => {
    const s = newGame(2, 1, QUIET);
    typeWord(s, 0);
    typeWord(s, 0);
    expect(s.players[0].combo).toBe(2);
    expect(s.players[0].stats.wordsCleared).toBe(2);
  });

  it('Tippfehler setzt die Combo zurück, Wort bleibt stehen', () => {
    const s = newGame(2, 1, QUIET);
    typeWord(s, 0);
    typeWord(s, 0);
    const word = s.players[0].stack[0];
    const events = step(s, BANK, [{ type: 'KEY', playerId: 0, key: '#' }]);
    expect(s.players[0].combo).toBe(0);
    expect(s.players[0].stack[0]).toBe(word);
    expect(s.players[0].cursor).toBe(0);
    expect(events.map((e) => e.type)).toContain('COMBO_BROKEN');
    expect(s.players[0].alive).toBe(true);
  });

  it('ein Wort mit Fehler zählt nicht für die Combo', () => {
    const s = newGame(2, 1, QUIET);
    typeWord(s, 0, { typo: true });
    expect(s.players[0].combo).toBe(0);
    expect(s.players[0].stats.wordsCleared).toBe(1);
    typeWord(s, 0);
    expect(s.players[0].combo).toBe(1);
  });

  it('dritte fehlerfreie Combo schickt einen Angriff', () => {
    const s = newGame(2, 1, QUIET);
    typeWord(s, 0);
    typeWord(s, 0);
    const events = typeWord(s, 0);
    const sent = events.find((e) => e.type === 'ATTACK_SENT');
    expect(sent).toMatchObject({ from: 0, to: 1, amount: 1 });
    expect(s.players[1].incoming).toHaveLength(1);
  });
});
