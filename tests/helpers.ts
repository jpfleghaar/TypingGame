import { buildWordBank, createGame, DEFAULT_CONFIG, step, type Command, type GameConfig, type GameState, type WordBank } from '../src/core';
import de from '../src/data/words/de.json';
import type { WordData } from '../src/core/words/wordBank';

export const BANK: WordBank = buildWordBank(de as WordData, 'mixed');

export function newGame(players = 2, seed = 42, config: GameConfig = DEFAULT_CONFIG): GameState {
  return createGame({
    seed,
    bank: BANK,
    config,
    players: Array.from({ length: players }, (_, i) => ({ name: `P${i}` })),
  });
}

/** Tippt das aktive Wort eines Spielers in einem Tick komplett. */
export function typeWord(state: GameState, playerId: number, opts: { typo?: boolean } = {}) {
  const p = state.players[playerId];
  const text = p.stack[0].text.slice(p.cursor);
  const cmds: Command[] = [];
  if (opts.typo) cmds.push({ type: 'KEY', playerId, key: '#' });
  for (const ch of text) cmds.push({ type: 'KEY', playerId, key: ch });
  return step(state, BANK, cmds);
}

export function idle(state: GameState, ticks: number) {
  const events = [];
  for (let i = 0; i < ticks; i++) events.push(...step(state, BANK, []));
  return events;
}

/** Config ohne Spawns, damit Tests nicht durch neue Wörter gestört werden. */
export const QUIET: GameConfig = {
  ...DEFAULT_CONFIG,
  initialWords: 12,
  // Angriffe sofort senden: Diese Tests prüfen Müll-Regeln, nicht das Laden per Leertaste
  attack: { autoSendIntervalMs: 0 },
  spawn: { ...DEFAULT_CONFIG.spawn, startIntervalMs: 1e9, endIntervalMs: 1e9 },
};
