import type { GameConfig, UpgradeId } from './config';
import type { RngState } from './rng';

export type ShipId = 0 | 1;

export const other = (id: ShipId): ShipId => (id === 0 ? 1 : 0);

/** Ein Wort mit Position in seiner Kette. */
export interface Word {
  chain: number;
  /** 1-basiert */
  stage: number;
  text: string;
}

export interface CargoItem extends Word {
  id: number;
  /** Gewicht, festgelegt bei der Landung (Buchstaben × Zuschläge). */
  weight: number;
  /** Wie oft das Wort auf letzter Stufe das Schiff gewechselt hat. */
  finalHops: number;
}

export interface TargetRef {
  kind: 'cargo' | 'drift';
  id: number;
}

export interface TypingState {
  target: TargetRef | null;
  /** Anzahl korrekt getippter Buchstaben des Ziels. */
  typed: number;
  /** Falsch getippter Buchstabe, der erst per Backspace entfernt werden muss. */
  error: string | null;
}

export interface ShipMods {
  doubleGrowthThrows: number;
  tarp: number;
  planks: number;
  fastCannon: number;
  harpoon: boolean;
  ballast: number;
  anchor: number;
  lookout: boolean;
  /** Anker wirkt im laufenden Sturm. */
  anchoredThisStorm: boolean;
}

export interface ShipStats {
  correctKeys: number;
  wrongKeys: number;
  thrown: number;
  longestThrown: string;
  fished: number;
}

export interface ShipState {
  id: ShipId;
  baseCapacity: number;
  cargo: CargoItem[];
  /** Gutschrift der Lenzpumpe, wird von der Ladung abgezogen. */
  relief: number;
  typing: TypingState;
  mods: ShipMods;
  upgradesChosen: UpgradeId[];
  /** Angebotene Karten während der Insel. */
  cards: UpgradeId[] | null;
  cardChosen: boolean;
  stats: ShipStats;
}

export interface Projectile {
  id: number;
  kind: 'throw' | 'drift';
  /** null = aus dem Meer (treibendes Fass) */
  from: ShipId | null;
  to: ShipId;
  /** Wort vor dem Wurf (für Animation „wächst im Flug“). */
  fromText: string;
  word: Word;
  /** Gewichtsfaktor aus dem Wurf (Endstufen-Bonus). */
  weightMul: number;
  finalHops: number;
  launchTick: number;
  landTick: number;
}

export interface Drift {
  id: number;
  word: Word;
  spawnTick: number;
  expireTick: number;
}

export type SeaEventKind = 'storm' | 'tailwind';

export interface TimedWindow {
  warnTick: number;
  startTick: number;
  endTick: number;
}

export interface SeaEventPlan extends TimedWindow {
  kind: SeaEventKind;
}

export interface Schedule {
  island: TimedWindow | null;
  sea: SeaEventPlan | null;
  nextDriftTick: number;
}

export type Phase = 'sea' | 'island' | 'over';

export interface GameState {
  cfg: GameConfig;
  seed: number;
  rng: RngState;
  tick: number;
  phase: Phase;
  ships: [ShipState, ShipState];
  projectiles: Projectile[];
  drift: Drift[];
  /** Noch nicht benutzte Ketten in gemischter Reihenfolge. */
  pool: number[];
  schedule: Schedule;
  /** Laufendes Meeresereignis (nach Start, vor Ende). */
  activeSea: SeaEventKind | null;
  winner: ShipId | null;
  nextId: number;
}

export type Command =
  | { type: 'key'; char: string }
  | { type: 'backspace' }
  | { type: 'cancel' }
  | { type: 'ballast' }
  | { type: 'chooseUpgrade'; index: number };

export type GameEvent =
  | { type: 'KEY_OK'; ship: ShipId }
  | { type: 'TYPO'; ship: ShipId; char: string; hasTarget: boolean }
  | { type: 'TYPO_CLEARED'; ship: ShipId }
  | { type: 'TARGET_LOST'; ship: ShipId }
  | { type: 'WORD_THROWN'; ship: ShipId; projectileId: number; fromText: string; toText: string; growth: number }
  | { type: 'WORD_LANDED'; ship: ShipId; projectileId: number; text: string; weight: number }
  | { type: 'WORD_BOUNCED'; ship: ShipId; projectileId: number; text: string }
  | { type: 'WORD_SWAPPED'; ship: ShipId; fromText: string; toText: string }
  | { type: 'WORD_DUMPED'; ship: ShipId; text: string }
  | { type: 'DRIFT_SPAWNED'; driftId: number; text: string }
  | { type: 'DRIFT_FISHED'; ship: ShipId; driftId: number; text: string }
  | { type: 'DRIFT_EXPIRED'; driftId: number; to: ShipId; projectileId: number; text: string }
  | { type: 'DRIFT_LOST'; driftId: number }
  | { type: 'ISLAND_WARNING'; startTick: number }
  | { type: 'ISLAND_START' }
  | { type: 'ISLAND_END' }
  | { type: 'UPGRADE_CHOSEN'; ship: ShipId; upgrade: UpgradeId; random: boolean }
  | { type: 'SEA_EVENT_WARNING'; kind: SeaEventKind; startTick: number }
  | { type: 'SEA_EVENT_START'; kind: SeaEventKind }
  | { type: 'SEA_EVENT_END'; kind: SeaEventKind }
  | { type: 'SHIP_SUNK'; ship: ShipId };

export type CommandsByShip = [Command[], Command[]];
