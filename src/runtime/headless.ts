import {
  buildWordBank,
  createGame,
  DEFAULT_CONFIG,
  resolveThemeId,
  step,
  ticksToMs,
  type GameConfig,
  type GameState,
  type WordData,
} from '../core';
import { BotController } from '../controllers/BotController';
import { generateBotProfiles, type BotFieldOptions, type BotProfile } from '../controllers/botProfiles';

export interface HeadlessOptions {
  seed: number;
  words: WordData;
  theme?: string;
  config?: GameConfig;
  field: BotFieldOptions;
}

export interface HeadlessResult {
  state: GameState;
  profiles: BotProfile[];
  durationMs: number;
}

/** Spielt eine komplette Runde nur mit Bots, ohne Darstellung und ohne Echtzeit. */
export function runHeadless(opts: HeadlessOptions): HeadlessResult {
  const config = opts.config ?? DEFAULT_CONFIG;
  const themeId = resolveThemeId(opts.words, opts.theme ?? 'mixed', opts.seed);
  const bank = buildWordBank(opts.words, themeId);
  const profiles = generateBotProfiles(opts.seed, opts.field);
  const state = createGame({ seed: opts.seed, bank, config, players: profiles.map((p) => ({ name: p.name })) });
  const bots = profiles.map((p, i) => new BotController(i, p, opts.seed));
  const maxTicks = config.tickRate * 60 * 30;
  while (!state.finished && state.tick < maxTicks) {
    step(state, bank, bots.flatMap((b) => b.poll(state)));
  }
  return { state, profiles, durationMs: ticksToMs(state.tick, config) };
}
