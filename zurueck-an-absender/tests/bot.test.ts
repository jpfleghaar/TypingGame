import { describe, expect, it } from 'vitest';
import { createGame, debugStartIsland, msToTicks, spawnDrift, step, type GameEvent, type GameState } from '../src/core';
import { BotController } from '../src/controllers/BotController';
import { BOT_PROFILES, type BotLevel } from '../src/controllers/botProfiles';
import { drawWord } from '../src/core/words/pool';
import { quietCfg, quietGame } from './helpers';

/** Bot auf Schiff 1 gegen einen passiven Spieler auf Schiff 0. */
function runBot(g: GameState, bot: BotController, ticks: number): GameEvent[] {
  const all: GameEvent[] = [];
  for (let i = 0; i < ticks && g.phase !== 'over'; i++) {
    const ev = step(g, [[], bot.poll(g)]);
    bot.onEvents(ev, g);
    all.push(...ev);
  }
  return all;
}

describe('Bot', () => {
  it.each(['easy', 'medium', 'hard'] as BotLevel[])('tippt ungefähr im Tempo seiner Stufe (%s)', (level) => {
    const g = quietGame(3, (c) => (c.ship.capacity = 100000));
    const bot = new BotController(1, BOT_PROFILES[level], 42);
    // genug Fracht, damit ihm die Wörter nicht ausgehen
    for (let i = 0; i < 60; i++) {
      const w = drawWord(g, 2);
      g.ships[1].cargo.push({ ...w, id: g.nextId++, weight: w.text.length, finalHops: 0 });
    }
    runBot(g, bot, msToTicks(60000));
    const wpm = g.ships[1].stats.correctKeys / 5;
    const target = BOT_PROFILES[level].wpm;
    // effektives Tempo inkl. Bedenkzeit und Korrekturen
    expect(wpm).toBeGreaterThan(target * 0.85);
    expect(wpm).toBeLessThan(target * 1.15);
  });

  it('vertippt sich gelegentlich und korrigiert per Backspace', () => {
    const g = quietGame(4, (c) => (c.ship.capacity = 100000));
    const bot = new BotController(1, BOT_PROFILES.easy, 7);
    runBot(g, bot, msToTicks(90000));
    expect(g.ships[1].stats.wrongKeys).toBeGreaterThan(0);
    expect(g.ships[1].stats.thrown).toBeGreaterThan(5);
  });

  it('versenkt einen passiven Gegner', () => {
    const g = createGame({ seed: 5, cfg: quietCfg((c) => (c.drift.enabled = true)) });
    const bot = new BotController(1, BOT_PROFILES.medium, 9);
    runBot(g, bot, msToTicks(600000));
    expect(g.phase).toBe('over');
    expect(g.winner).toBe(1);
  });

  it('fischt Treibgut', () => {
    const g = quietGame(6);
    g.ships[1].cargo = [];
    const bot = new BotController(1, BOT_PROFILES.hard, 1);
    spawnDrift(g, []);
    const ev = runBot(g, bot, msToTicks(5000));
    expect(ev.some((e) => e.type === 'DRIFT_FISHED' && e.ship === 1)).toBe(true);
  });

  it('wählt auf der Insel eine Karte und tippt dort nicht', () => {
    const g = quietGame(8, (c) => (c.island.enabled = true));
    const bot = new BotController(1, BOT_PROFILES.medium, 3);
    const ev: GameEvent[] = [];
    debugStartIsland(g, ev);
    bot.onEvents(ev, g);
    const during = runBot(g, bot, msToTicks(9000));
    expect(during.some((e) => e.type === 'UPGRADE_CHOSEN' && e.ship === 1 && !e.random)).toBe(true);
    expect(during.some((e) => e.type === 'KEY_OK' || e.type === 'WORD_THROWN')).toBe(false);
  });

  it('wirft bei hoher Ladung Ballast ab, wenn er die Karte hat', () => {
    const g = quietGame(9, (c) => (c.ship.capacity = 30));
    g.ships[1].mods.ballast = 1;
    const bot = new BotController(1, BOT_PROFILES.hard, 2);
    const ev = runBot(g, bot, msToTicks(5000));
    expect(ev.some((e) => e.type === 'WORD_DUMPED' && e.ship === 1)).toBe(true);
  });

  it('ist deterministisch bei gleichem Seed', () => {
    const play = () => {
      const g = createGame({ seed: 11 });
      const a = new BotController(0, BOT_PROFILES.medium, 1);
      const b = new BotController(1, BOT_PROFILES.hard, 2);
      for (let i = 0; i < msToTicks(90000) && g.phase !== 'over'; i++) {
        const ev = step(g, [a.poll(g), b.poll(g)]);
        a.onEvents(ev, g);
        b.onEvents(ev, g);
      }
      return JSON.stringify(g);
    };
    expect(play()).toBe(play());
  });
});
