import type { GameConfig } from './config';
import type { RngState } from './rng';

export type PlayerId = number;

export type TargetStrategy = 'random' | 'attackers' | 'weakest' | 'badges';
export const TARGET_STRATEGIES: readonly TargetStrategy[] = ['random', 'attackers', 'weakest', 'badges'];

export interface Word {
  id: number;
  text: string;
  garbage: boolean;
  /** Ob in diesem Wort schon ein Fehler passiert ist (zählt dann nicht für die Combo). */
  hadError: boolean;
  errors: number;
  /** Tick des ersten Tastendrucks in diesem Wort, -1 = noch nicht begonnen. */
  startTick: number;
}

export interface IncomingGarbage {
  id: number;
  from: PlayerId;
  amount: number;
  sentTick: number;
  arriveTick: number;
}

export interface WordRecord {
  text: string;
  garbage: boolean;
  /** Ticks vom ersten bis zum letzten Tastendruck. */
  ticks: number;
  errors: number;
}

export interface PlayerStats {
  correctKeys: number;
  errorKeys: number;
  wordsCleared: number;
  /** Getippte Zeichen in fertigen Wörtern (Basis für WPM). */
  charsCleared: number;
  attacksSent: number;
  garbageSent: number;
  attacksReceived: number;
  garbageReceived: number;
  garbageCancelled: number;
  kos: number;
  maxCombo: number;
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  alive: boolean;
  /** Index 0 = unterstes (aktives) Wort, letztes Element = oberstes. */
  stack: Word[];
  /** Fortschritt im aktiven Wort. */
  cursor: number;
  combo: number;
  badges: number;
  strategy: TargetStrategy;
  targetId: PlayerId | null;
  /** Tick, an dem "Zufall" das nächste Mal ein neues Ziel wählt. */
  retargetTick: number;
  incoming: IncomingGarbage[];
  /** Letzter Spieler, dessen Müll bei mir gelandet ist (für K.O.-Wertung). */
  lastHitBy: PlayerId | null;
  lastHitTick: number;
  /** Tick, ab dem der Spieler K.O. ist; -1 solange am Leben. */
  koTick: number;
  koBy: PlayerId | null;
  placement: number;
  /** Privater Zufall für Müllwörter. */
  garbageRng: RngState;
  recentGarbage: string[];
  stats: PlayerStats;
  wordLog: WordRecord[];
}

export interface GameState {
  tick: number;
  seed: number;
  config: GameConfig;
  /** Zufall für Spiellogik (Zielwahl, Rundung). */
  rng: RngState;
  /** Zufall für die gemeinsame Wortfolge. */
  wordRng: RngState;
  recentWords: string[];
  spawnCount: number;
  nextSpawnTick: number;
  nextWordId: number;
  nextGarbageId: number;
  players: PlayerState[];
  finished: boolean;
  winnerId: PlayerId | null;
}

/* ---------- Befehle (Eingaben) ---------- */

export type Command =
  | { type: 'KEY'; playerId: PlayerId; key: string }
  | { type: 'SET_STRATEGY'; playerId: PlayerId; strategy: TargetStrategy }
  | { type: 'CYCLE_STRATEGY'; playerId: PlayerId };

/* ---------- Events (Ausgaben) ---------- */

export type GameEvent =
  | { type: 'WORD_SPAWNED'; playerId: PlayerId; word: Word }
  | { type: 'KEY_CORRECT'; playerId: PlayerId; wordId: number; index: number }
  | { type: 'KEY_ERROR'; playerId: PlayerId; wordId: number; index: number; key: string }
  | { type: 'WORD_CLEARED'; playerId: PlayerId; word: Word; combo: number }
  | { type: 'COMBO_BROKEN'; playerId: PlayerId; combo: number }
  | { type: 'ATTACK_TRIGGERED'; playerId: PlayerId; amount: number; combo: number }
  | { type: 'GARBAGE_CANCELLED'; playerId: PlayerId; from: PlayerId; amount: number }
  | { type: 'ATTACK_SENT'; from: PlayerId; to: PlayerId; amount: number; garbageId: number; arriveTick: number }
  | { type: 'GARBAGE_ARRIVED'; playerId: PlayerId; from: PlayerId; amount: number }
  | { type: 'TARGET_CHANGED'; playerId: PlayerId; targetId: PlayerId | null; strategy: TargetStrategy }
  | { type: 'PLAYER_KO'; playerId: PlayerId; by: PlayerId | null; placement: number }
  | { type: 'BADGES_GAINED'; playerId: PlayerId; amount: number; total: number }
  | { type: 'GAME_OVER'; winnerId: PlayerId | null };

export interface PlayerSetup {
  name: string;
  strategy?: TargetStrategy;
}
