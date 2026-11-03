import { UPGRADES, type UpgradeId } from './config';
import { nextInt } from './rng';
import { resetTyping } from './targeting';
import type { GameEvent, GameState, ShipId } from './types';

/** Zieht `cardCount` verschiedene Karten; nicht stapelbare, schon gewählte Karten fallen raus. */
export function dealCards(state: GameState, ship: ShipId): UpgradeId[] {
  const s = state.ships[ship];
  const pool = UPGRADES.filter((u) => u.stackable || !s.upgradesChosen.includes(u.id)).map((u) => u.id);
  const cards: UpgradeId[] = [];
  while (cards.length < state.cfg.island.cardCount && pool.length > 0) {
    cards.push(pool.splice(nextInt(state.rng, pool.length), 1)[0]);
  }
  return cards;
}

export function applyUpgrade(state: GameState, ship: ShipId, id: UpgradeId): void {
  const s = state.ships[ship];
  const u = state.cfg.upgrades;
  s.upgradesChosen.push(id);
  switch (id) {
    case 'doubleGrowth':
      s.mods.doubleGrowthThrows += u.doubleGrowth.throws;
      break;
    case 'tarp':
      s.mods.tarp += u.tarp.blocks;
      break;
    case 'planks':
      s.mods.planks++;
      break;
    case 'fastCannon':
      s.mods.fastCannon++;
      break;
    case 'bilgePump':
      s.relief += u.bilgePump.relief;
      break;
    case 'harpoon':
      s.mods.harpoon = true;
      break;
    case 'ballast':
      s.mods.ballast += u.ballast.charges;
      break;
    case 'anchor':
      s.mods.anchor += u.anchor.storms;
      break;
    case 'lookout':
      s.mods.lookout = true;
      break;
  }
}

export function chooseUpgrade(
  state: GameState,
  ship: ShipId,
  index: number,
  events: GameEvent[],
  random = false,
): boolean {
  const s = state.ships[ship];
  if (state.phase !== 'island' || !s.cards || s.cardChosen) return false;
  const id = s.cards[index];
  if (!id) return false;
  s.cardChosen = true;
  applyUpgrade(state, ship, id);
  events.push({ type: 'UPGRADE_CHOSEN', ship, upgrade: id, random });
  return true;
}

/** Ballast abwerfen: das gerade angetippte Frachtwort geht ins Meer (nicht zum Gegner). */
export function dumpBallast(state: GameState, ship: ShipId, events: GameEvent[]): boolean {
  const s = state.ships[ship];
  const t = s.typing.target;
  if (s.mods.ballast <= 0 || !t || t.kind !== 'cargo') return false;
  const idx = s.cargo.findIndex((c) => c.id === t.id);
  if (idx < 0) return false;
  const [item] = s.cargo.splice(idx, 1);
  s.mods.ballast--;
  resetTyping(state, ship);
  events.push({ type: 'WORD_DUMPED', ship, text: item.text });
  return true;
}
