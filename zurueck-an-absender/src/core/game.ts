import { createConfig, msToTicks, type GameConfig } from './config';
import { createRng, deriveSeed } from './rng';
import { planIsland, planSea, runSchedule } from './schedule';
import { backspace, resetTyping, typeChar } from './targeting';
import { land } from './throw';
import { chooseUpgrade, dumpBallast } from './upgrades';
import { isSunk } from './weight';
import { drawWord, shuffledPool } from './words/pool';
import { other, type Command, type CommandsByShip, type GameEvent, type GameState, type ShipId, type ShipState } from './types';

function createShip(id: ShipId, cfg: GameConfig): ShipState {
  return {
    id,
    baseCapacity: cfg.ship.capacity,
    cargo: [],
    relief: 0,
    typing: { target: null, typed: 0, error: null },
    mods: {
      doubleGrowthThrows: 0,
      tarp: 0,
      planks: 0,
      fastCannon: 0,
      harpoon: false,
      ballast: 0,
      anchor: 0,
      lookout: false,
      anchoredThisStorm: false,
    },
    upgradesChosen: [],
    cards: null,
    cardChosen: false,
    stats: { correctKeys: 0, wrongKeys: 0, thrown: 0, longestThrown: '', fished: 0 },
  };
}

export interface CreateGameOptions {
  seed: number;
  cfg?: GameConfig;
}

export function createGame({ seed, cfg = createConfig() }: CreateGameOptions): GameState {
  const rng = createRng(deriveSeed(seed, 1));
  const state: GameState = {
    cfg,
    seed,
    rng,
    tick: 0,
    phase: 'sea',
    ships: [createShip(0, cfg), createShip(1, cfg)],
    projectiles: [],
    drift: [],
    pool: shuffledPool(rng),
    schedule: { island: null, sea: null, nextDriftTick: msToTicks(cfg.drift.firstSpawnMs) },
    activeSea: null,
    winner: null,
    nextId: 1,
  };
  // Startfracht abwechselnd verteilen, damit beide Schiffe gleich gemischt starten.
  for (let i = 0; i < cfg.ship.startWords; i++) {
    for (const ship of state.ships) {
      const w = drawWord(state, 1);
      ship.cargo.push({ ...w, id: state.nextId++, weight: w.text.length, finalHops: 0 });
    }
  }
  state.schedule.island = planIsland(state, 0);
  state.schedule.sea = planSea(state, 0);
  return state;
}

function applyCommand(state: GameState, ship: ShipId, cmd: Command, events: GameEvent[]): void {
  if (state.phase === 'island') {
    // Auf der Insel zählen nur die Upgrade-Tasten.
    if (cmd.type === 'chooseUpgrade') chooseUpgrade(state, ship, cmd.index, events);
    return;
  }
  switch (cmd.type) {
    case 'key':
      typeChar(state, ship, cmd.char, events);
      break;
    case 'backspace':
      backspace(state, ship, events);
      break;
    case 'cancel':
      resetTyping(state, ship);
      break;
    case 'ballast':
      dumpBallast(state, ship, events);
      break;
    case 'chooseUpgrade':
      break;
  }
}

function landDue(state: GameState, events: GameEvent[]): void {
  const due = state.projectiles
    .filter((p) => p.landTick <= state.tick)
    .sort((a, b) => a.landTick - b.landTick || a.id - b.id);
  if (due.length === 0) return;
  state.projectiles = state.projectiles.filter((p) => p.landTick > state.tick);
  for (const p of due) {
    land(state, p, events);
    if (checkSunk(state, events)) return;
  }
}

function checkSunk(state: GameState, events: GameEvent[]): boolean {
  for (const s of state.ships) {
    if (isSunk(state, s)) {
      state.phase = 'over';
      state.winner = other(s.id);
      events.push({ type: 'SHIP_SUNK', ship: s.id });
      return true;
    }
  }
  return false;
}

/**
 * Ein Tick der Spiellogik. Deterministisch: gleicher State + gleiche Commands
 * ergeben immer dasselbe Ergebnis. Mutiert `state` und liefert die Events.
 */
export function step(state: GameState, commands: CommandsByShip): GameEvent[] {
  const events: GameEvent[] = [];
  if (state.phase === 'over') return events;
  state.tick++;
  // Funktion statt direktem Vergleich, weil TypeScript `phase` sonst fälschlich verengt.
  const over = () => state.phase === 'over';

  // Reihenfolge wechselt jeden Tick, damit kein Schiff bei Gleichstand bevorzugt wird.
  const order: ShipId[] = state.tick % 2 === 0 ? [0, 1] : [1, 0];
  for (const id of order) {
    for (const cmd of commands[id]) {
      applyCommand(state, id, cmd, events);
      if (over()) return events;
    }
  }

  landDue(state, events);
  if (over()) return events;

  runSchedule(state, events);
  // Treibgut, das gerade angekommen ist, landet im nächsten Tick über landDue.
  return events;
}

/** Dämmerung 0..1 (rein visuell). */
export function duskLevel(state: GameState): number {
  return Math.min(1, state.tick / msToTicks(state.cfg.dusk.fullDarkMs));
}
