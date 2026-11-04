import { describe, expect, it } from 'vitest';
import { createGame, step, type Command, type WordData } from '../src/core';
import { BotController } from '../src/controllers/BotController';
import { DEFAULT_BOT_FIELD, generateBotProfiles, neighborKey } from '../src/controllers/botProfiles';
import { createRng } from '../src/core/rng';
import de from '../src/data/words/de.json';
import { runHeadless } from '../src/runtime/headless';
import { BANK, QUIET } from './helpers';

describe('Bot-Profile', () => {
  it('decken 25–110 WPM ab und sind seed-stabil', () => {
    const a = generateBotProfiles(42);
    const b = generateBotProfiles(42);
    expect(a).toEqual(b);
    expect(a).toHaveLength(DEFAULT_BOT_FIELD.count);
    const wpms = a.map((p) => p.wpm);
    expect(Math.min(...wpms)).toBeGreaterThanOrEqual(25);
    expect(Math.max(...wpms)).toBeLessThanOrEqual(110);
    expect(Math.max(...wpms) - Math.min(...wpms)).toBeGreaterThan(60);
    expect(new Set(a.map((p) => p.name)).size).toBe(DEFAULT_BOT_FIELD.count);
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
      expect(realWpm).toBeGreaterThan(target * 0.65);
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
        // Dieselben Befehle, die auch ein Mensch hat: tippen, Strategie, abschicken (Leertaste), abwehren (Tab)
        const allowed = ['KEY', 'SET_STRATEGY', 'SEND_ATTACK', 'DEFEND'];
        expect(c.every((x) => x.playerId === b.playerId && allowed.includes(x.type))).toBe(true);
        cmds.push(...c);
      }
      step(state, BANK, cmds);
    }
    expect(state.players.every((p) => p.stats.correctKeys > 0)).toBe(true);
  });

  it('ganze Bot-Runde ist deterministisch und dauert 3–6 Minuten', () => {
    const opts = { seed: 777, words: de as WordData, field: { ...DEFAULT_BOT_FIELD, count: DEFAULT_BOT_FIELD.count + 1 } };
    const a = runHeadless(opts);
    const b = runHeadless(opts);
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
    expect(a.state.finished).toBe(true);
    expect(a.durationMs).toBeGreaterThan(3 * 60_000);
    expect(a.durationMs).toBeLessThan(6 * 60_000);
  });
});

describe('Bot-Entscheidungen: angreifen, abwehren, sparen', () => {
  /** Bot 0 gegen zwei Ziele; Tippen ist abgeschaltet (Startverzögerung sehr lang), damit nur Entscheidungen zählen. */
  const setup = (over: Partial<ReturnType<typeof generateBotProfiles>[number]> = {}) => {
    const state = createGame({ seed: 9, bank: BANK, config: { ...QUIET, initialWords: 4 }, players: [{ name: 'Bot' }, { name: 'A' }, { name: 'B' }] });
    const profile = { ...generateBotProfiles(1)[0], sendDelayMs: 0, attackAt: 4, reserve: 2, defenseRate: 0, strategy: 'random' as const, ...over };
    const bot = new BotController(0, profile, 9);
    (bot as unknown as { nextKeyAt: number }).nextKeyAt = 1e12;
    const me = state.players[0];
    const run = (ticks: number) => {
      const out: Command[] = [];
      for (let i = 0; i < ticks; i++) {
        const cmds = bot.poll(state);
        out.push(...cmds);
        step(state, BANK, cmds);
      }
      return out;
    };
    return { state, me, run };
  };
  const types = (cmds: Command[]) => cmds.map((c) => c.type);

  it('spart unterhalb seiner Angriffsschwelle', () => {
    const { me, run } = setup();
    me.points = 3;
    expect(types(run(30))).not.toContain('SEND_ATTACK');
    expect(me.points).toBe(3);
  });

  it('greift ab seiner Schwelle an', () => {
    const { me, run } = setup();
    me.points = 4;
    expect(types(run(30))).toContain('SEND_ATTACK');
    expect(me.points).toBe(0);
  });

  it('behält eine Reserve, wenn der eigene Stapel voll wird', () => {
    const { state, me, run } = setup();
    me.points = 5; // Schwelle 4 + Reserve 2 = 6 nötig
    while (me.stack.length < state.config.stackMax - 3) me.stack.push({ ...me.stack[0], id: 10_000 + me.stack.length });
    expect(types(run(30))).not.toContain('SEND_ATTACK');
  });

  it('greift beim Maximum an, statt Punkte verfallen zu lassen', () => {
    const { state, me, run } = setup({ attackAt: 99 });
    me.points = state.config.points.max;
    expect(types(run(30))).toContain('SEND_ATTACK');
  });

  it('spart, solange Müll unterwegs ist, und wehrt im Notfall immer ab', () => {
    const { state, me, run } = setup({ defenseRate: 0 });
    me.points = 5;
    while (me.stack.length < state.config.stackMax - 1) me.stack.push({ ...me.stack[0], id: 20_000 + me.stack.length });
    me.incoming.push({ id: 77, from: 1, amount: 3, words: ['a', 'b', 'c'], sentTick: state.tick, arriveTick: state.tick + 120 });
    const cmds = types(run(130));
    expect(cmds).not.toContain('SEND_ATTACK');
    expect(cmds).toContain('DEFEND');
    expect(me.points).toBe(2);
  });

  it('nutzt den Gnadenstoß, wenn das Ziel überlaufen würde', () => {
    const { state, me, run } = setup({ attackAt: 99 });
    me.points = 2;
    run(1); // Ziel wird gewählt
    const target = state.players[me.targetId!];
    while (target.stack.length < state.config.stackMax - 1) target.stack.push({ ...target.stack[0], id: 30_000 + target.stack.length });
    expect(types(run(30))).toContain('SEND_ATTACK');
  });
});
