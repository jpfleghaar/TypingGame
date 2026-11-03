import type { UpgradeId } from './config';
import { createConfig, type GameConfig, ticksToMs } from './config';
import { createGame } from './game';
import { deriveSeed } from './rng';
import type { GameState, ShipId } from './types';

export interface ShipRoundStats {
  wpm: number;
  accuracy: number;
  thrown: number;
  longestThrown: string;
  fished: number;
  upgrades: UpgradeId[];
}

export interface RoundSummary {
  round: number;
  winner: ShipId;
  durationMs: number;
  ships: [ShipRoundStats, ShipRoundStats];
}

export interface MatchState {
  seed: number;
  cfg: GameConfig;
  round: number;
  wins: [number, number];
  game: GameState;
  history: RoundSummary[];
  winner: ShipId | null;
}

export function createMatch(seed: number, cfg: GameConfig = createConfig()): MatchState {
  return {
    seed,
    cfg,
    round: 1,
    wins: [0, 0],
    game: createGame({ seed: deriveSeed(seed, 1), cfg }),
    history: [],
    winner: null,
  };
}

export function summarizeRound(game: GameState, round: number): RoundSummary {
  const minutes = Math.max(1e-6, ticksToMs(game.tick) / 60000);
  const ship = (id: ShipId): ShipRoundStats => {
    const s = game.ships[id].stats;
    const total = s.correctKeys + s.wrongKeys;
    return {
      wpm: s.correctKeys / 5 / minutes,
      accuracy: total === 0 ? 1 : s.correctKeys / total,
      thrown: s.thrown,
      longestThrown: s.longestThrown,
      fished: s.fished,
      upgrades: [...game.ships[id].upgradesChosen],
    };
  };
  return {
    round,
    winner: game.winner!,
    durationMs: ticksToMs(game.tick),
    ships: [ship(0), ship(1)],
  };
}

/** Beendete Runde verbuchen. Liefert true, wenn das Match (Best of 3) entschieden ist. */
export function finishRound(m: MatchState): boolean {
  if (m.game.phase !== 'over' || m.game.winner === null) throw new Error('Runde läuft noch');
  m.history.push(summarizeRound(m.game, m.round));
  m.wins[m.game.winner]++;
  if (m.wins[m.game.winner] >= m.cfg.match.roundsToWin) {
    m.winner = m.game.winner;
    return true;
  }
  return false;
}

export function startNextRound(m: MatchState): void {
  m.round++;
  m.game = createGame({ seed: deriveSeed(m.seed, m.round), cfg: m.cfg });
}
