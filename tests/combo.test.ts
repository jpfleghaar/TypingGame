import { describe, expect, it } from 'vitest';
import { comboAttack, DEFAULT_CONFIG, step } from '../src/core';
import { BANK, newGame, QUIET, typeWord } from './helpers';

describe('comboAttack', () => {
  it('löst an den Stufen 3 / 6 / 10 aus', () => {
    expect(comboAttack(3, DEFAULT_CONFIG)).toBe(1);
    expect(comboAttack(6, DEFAULT_CONFIG)).toBe(2);
    expect(comboAttack(10, DEFAULT_CONFIG)).toBe(3);
    for (const c of [0, 1, 2, 4, 5, 7, 8, 9]) expect(comboAttack(c, DEFAULT_CONFIG)).toBe(0);
  });

  it('nach der höchsten Stufe: alle N Wörter wieder ein Angriff (laut Config)', () => {
    const cfg = { ...DEFAULT_CONFIG, combo: { ...DEFAULT_CONFIG.combo, repeatEvery: 4, repeatGarbage: 3 } };
    const table = Array.from({ length: 23 }, (_, c) => comboAttack(c, cfg));
    expect([table[14], table[18], table[22]]).toEqual([3, 3, 3]);
    for (const c of [11, 12, 13, 15, 16, 17]) expect(table[c]).toBe(0);
    const { repeatEvery, repeatGarbage } = DEFAULT_CONFIG.combo;
    expect(comboAttack(10 + repeatEvery, DEFAULT_CONFIG)).toBe(repeatGarbage);
    expect(comboAttack(10 + repeatEvery - 1, DEFAULT_CONFIG)).toBe(0);
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

describe('Leerer Stapel', () => {
  it('bekommt sofort ein neues Wort, ohne auf den Timer zu warten', () => {
    const s = newGame(2, 4, { ...QUIET, initialWords: 2 });
    typeWord(s, 0);
    const events = typeWord(s, 0); // letztes Wort weg
    expect(s.players[0].stack).toHaveLength(1);
    expect(events.some((e) => e.type === 'WORD_SPAWNED' && e.playerId === 0)).toBe(true);
    // Der langsamere Spieler wartet weiterhin auf den Timer
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
