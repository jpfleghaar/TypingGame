import {
  chainWord,
  createConfig,
  createGame,
  findChain,
  step,
  type Command,
  type CommandsByShip,
  type GameConfig,
  type GameEvent,
  type GameState,
  type ShipId,
} from '../src/core';

/** Config ohne Treibgut, Inseln und Ereignisse: nur die Kernmechanik. */
export function quietCfg(mod?: (c: GameConfig) => void): GameConfig {
  const c = createConfig();
  c.drift.enabled = false;
  c.island.enabled = false;
  c.seaEvents.enabled = false;
  // Tests rechnen mit runden Zahlen, unabhängig vom aktuellen Balancing
  c.ship.capacity = 120;
  mod?.(c);
  return c;
}

export function quietGame(seed = 1, mod?: (c: GameConfig) => void): GameState {
  return createGame({ seed, cfg: quietCfg(mod) });
}

/** Ersetzt die Fracht eines Schiffs durch [Startwort, Stufe]-Paare. */
export function setCargo(state: GameState, ship: ShipId, words: [string, number][]): void {
  state.ships[ship].cargo = words.map(([start, stage]) => {
    const chain = findChain(start);
    const text = chainWord(chain, stage);
    return { chain, stage, text, id: state.nextId++, weight: text.length, finalHops: 0 };
  });
}

export function cmds(ship: ShipId, list: Command[]): CommandsByShip {
  return ship === 0 ? [list, []] : [[], list];
}

/** Tippt alle Buchstaben in einem Tick. */
export function type(state: GameState, ship: ShipId, text: string): GameEvent[] {
  return step(state, cmds(ship, [...text].map((char) => ({ type: 'key', char }) as Command)));
}

export function run(state: GameState, ticks: number): GameEvent[] {
  const all: GameEvent[] = [];
  for (let i = 0; i < ticks; i++) all.push(...step(state, [[], []]));
  return all;
}

/** Läuft, bis alle Projektile gelandet sind. */
export function settle(state: GameState): GameEvent[] {
  const all: GameEvent[] = [];
  let guard = 10000;
  while (state.projectiles.length > 0 && guard-- > 0) all.push(...step(state, [[], []]));
  return all;
}

export const texts = (state: GameState, ship: ShipId) => state.ships[ship].cargo.map((c) => c.text);
