import { createGame, DEFAULT_CONFIG, type GameState, type WordBank } from '../core';
import { BotController } from '../controllers/BotController';
import { generateBotProfiles, type BotProfile } from '../controllers/botProfiles';
import { buildBank } from '../runtime/session';
import { MAX_PLAYERS, type MatchSetup } from './protocol';

export interface Match {
  state: GameState;
  bank: WordBank;
  themeLabel: string;
  botProfiles: BotProfile[];
}

/** Zahl der Bots, die neben `humans` Menschen noch Platz haben. */
export function botsFor(humans: number, wanted: number): number {
  return Math.max(0, Math.min(wanted, MAX_PLAYERS - humans));
}

/**
 * Baut eine Mehrspieler-Runde auf – auf dem Server und in jedem Browser
 * identisch: Menschen bekommen die IDs 0…n-1, danach folgen die Bots.
 */
export function createMatch(setup: MatchSetup): Match {
  const { bank, themeLabel } = buildBank({ mode: 'royale', ...setup });
  const botProfiles = generateBotProfiles(setup.seed, {
    count: botsFor(setup.humans.length, setup.botCount),
    minWpm: 25,
    maxWpm: 110,
  });
  const players = [
    ...setup.humans.map((name) => ({ name, strategy: 'random' as const })),
    ...botProfiles.map((b) => ({ name: b.name, strategy: b.strategy })),
  ];
  const state = createGame({ seed: setup.seed, players, bank, config: DEFAULT_CONFIG });
  return { state, bank, themeLabel, botProfiles };
}

/** Die Bots einer Runde – laufen nur auf dem Server. */
export function createBots(setup: MatchSetup, match: Match): BotController[] {
  const first = setup.humans.length;
  return match.botProfiles.map((b, i) => new BotController(first + i, b, setup.seed));
}
