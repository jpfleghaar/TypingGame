import type { GameState, ShipState } from './types';

export function cargoWeight(ship: ShipState): number {
  let sum = 0;
  for (const c of ship.cargo) sum += c.weight;
  return sum;
}

/** Ladung nach Abzug der Lenzpumpen-Gutschrift. */
export function load(ship: ShipState): number {
  return Math.max(0, cargoWeight(ship) - ship.relief);
}

export function capacity(state: GameState, ship: ShipState): number {
  return ship.baseCapacity * (1 + state.cfg.upgrades.planks.capacityBonus * ship.mods.planks);
}

/** Wasserlinie 0..1+ (1 = Deck erreicht = gesunken). */
export function waterline(state: GameState, ship: ShipState): number {
  return load(ship) / capacity(state, ship);
}

export function inCatchup(state: GameState, ship: ShipState): boolean {
  return waterline(state, ship) > state.cfg.catchup.threshold;
}

export function isSunk(state: GameState, ship: ShipState): boolean {
  return waterline(state, ship) >= 1;
}
