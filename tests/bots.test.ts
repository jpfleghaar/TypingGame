import { describe, expect, it } from 'vitest';
import { createGame, step, type Command, type WordData } from '../src/core';
import { BotController } from '../src/controllers/BotController';
import { generateBotProfiles, neighborKey } from '../src/controllers/botProfiles';
import { createRng } from '../src/core/rng';
import de from '../src/data/words/de.json';
import { runHeadless } from '../src/runtime/headless';
import { BANK, QUIET } from './helpers';

describe('Bot-Profile', () => {
  it('decken 25–110 WPM ab und sind seed-stabil', () => {
    const a = generateBotProfiles(42);
    const b = generateBotProfiles(42);
    expect(a).toEqual(b);
    expect(a).toHaveLength(18);
    const wpms = a.map((p) => p.wpm);
    expect(Math.min(...wpms)).toBeGreaterThanOrEqual(25);
    expect(Math.max(...wpms)).toBeLessThanOrEqual(110);
    expect(Math.max(...wpms) - Math.min(...wpms)).toBeGreaterThan(60);
    expect(new Set(a.map((p) => p.name)).size).toBe(18);
  });

  it('Vertipper ist nie der richtige Buchstabe', () => {
    const rng = createRng(3);
    for (const ch of 'abcXYZäöüß019') {
      for (let i = 0; i < 20; i++) expect(neighborKey(ch, rng)).not.toBe(ch);
    }
  });
});

describe('BotController', () => {
  it('erreicht ungefähr sein Ziel-Tempo', () => {
    for (const target of [30, 70, 110]) {
      const profile = { ...generateBotProfiles(1)[0], wpm: target, errorRate: 0.02 };
      // Viele Wörter, kein Überlauf: misst reines Tipptempo inkl. Fehlern und Reaktionszeit
      const cfg = { ...QUIET, initialWords: 150, stackMax: 200 };
      const state = createGame({ seed: 5, bank: BANK, config: cfg, players: [{ name: 'Bot' }] });
      const bot = new BotController(0, profile, 5);
      for (let t = 0; t < 60 * 60; t++) step(state, BANK, bot.poll(state));
      const p = state.players[0];
      expect(p.stack.length).toBeGreaterThan(0);
      const realWpm = p.stats.charsCleared / 5; // 1 Minute gespielt
      expect(realWpm).toBeGreaterThan(target * 0.7);
      expect(realWpm).toBeLessThan(target * 1.1);
    }
  });

  it('schickt nur eigene Befehle (gleiche Regeln wie Menschen)', () => {
    const profiles = generateBotProfiles(9, { count: 4, minWpm: 40, maxWpm: 100 });
    const state = createGame({ seed: 9, bank: BANK, players: profiles.map((p) => ({ name: p.name })) });
    const bots = profiles.map((p, i) => new BotController(i, p, 9));
    for (let t = 0; t < 600; t++) {
      const cmds: Command[] = [];
      for (const b of bots) {
        const c = b.poll(state);
        expect(c.every((x) => x.playerId === b.playerId && (x.type === 'KEY' || x.type === 'SET_STRATEGY'))).toBe(true);
        cmds.push(...c);
      }
      step(state, BANK, cmds);
    }
    expect(state.players.every((p) => p.stats.correctKeys > 0)).toBe(true);
  });

  it('ganze Bot-Runde ist deterministisch und dauert 3–6 Minuten', () => {
    const opts = { seed: 777, words: de as WordData, field: { count: 19, minWpm: 25, maxWpm: 110 } };
    const a = runHeadless(opts);
    const b = runHeadless(opts);
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
    expect(a.state.finished).toBe(true);
    expect(a.durationMs).toBeGreaterThan(3 * 60_000);
    expect(a.durationMs).toBeLessThan(6 * 60_000);
  });
});
