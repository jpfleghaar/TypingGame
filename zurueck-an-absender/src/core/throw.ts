import { msToTicks } from './config';
import { chainLength, chainWord } from './words/chains';
import { drawFinalWordLike } from './words/pool';
import { inCatchup } from './weight';
import { other, type GameEvent, type GameState, type Projectile, type ShipId, type Word } from './types';

/** Um wie viele Stufen wächst ein Wurf dieses Schiffs? (Maximal +2, nicht addiert.) */
export function growthFor(state: GameState, from: ShipId): number {
  const ship = state.ships[from];
  let g = 1;
  if (inCatchup(state, ship)) g = Math.max(g, state.cfg.catchup.growth);
  if (ship.mods.doubleGrowthThrows > 0) g = Math.max(g, state.cfg.upgrades.doubleGrowth.growth);
  return g;
}

export function flightTicks(state: GameState, from: ShipId): number {
  const ship = state.ships[from];
  let speed = 1 + state.cfg.upgrades.fastCannon.speedBonus * ship.mods.fastCannon;
  if (state.activeSea === 'tailwind') speed += state.cfg.seaEvents.tailwind.flightSpeedBonus;
  return Math.max(1, Math.round(msToTicks(state.cfg.throw.flightMs) / speed));
}

/**
 * Wirft ein Wort vom Schiff `from` zum Gegner. Das Wort wächst sofort (die
 * Darstellung animiert das Wachstum im Flug); das Gewicht zählt erst bei der Landung.
 */
export function launchThrow(
  state: GameState,
  from: ShipId,
  word: Word,
  finalHops: number,
  events: GameEvent[],
): Projectile {
  const ship = state.ships[from];
  const last = chainLength(word.chain);
  const wasFinal = word.stage >= last;
  const growth = wasFinal ? 0 : growthFor(state, from);
  // Doppelwachstum wird pro Wurf verbraucht, auch wenn die Aufholmechanik schon +2 gibt.
  if (!wasFinal && ship.mods.doubleGrowthThrows > 0) ship.mods.doubleGrowthThrows--;
  const stage = Math.min(last, word.stage + growth);
  const grown: Word = { chain: word.chain, stage, text: chainWord(word.chain, stage) };

  let hops = 0;
  if (wasFinal) hops = finalHops + 1;
  else if (stage === last) hops = 1;

  const p: Projectile = {
    id: state.nextId++,
    kind: 'throw',
    from,
    to: other(from),
    fromText: word.text,
    word: grown,
    weightMul: wasFinal ? 1 + state.cfg.throw.finalStageBonus : 1,
    finalHops: hops,
    launchTick: state.tick,
    landTick: state.tick + flightTicks(state, from),
  };
  state.projectiles.push(p);
  ship.stats.thrown++;
  if (word.text.length > ship.stats.longestThrown.length) ship.stats.longestThrown = word.text;
  events.push({
    type: 'WORD_THROWN',
    ship: from,
    projectileId: p.id,
    fromText: word.text,
    toText: grown.text,
    growth: stage - word.stage,
  });
  return p;
}

/** Ein nicht gefischtes Fass treibt (ohne Wachstum) zu einem Schiff. */
export function launchDrift(state: GameState, to: ShipId, word: Word): Projectile {
  const p: Projectile = {
    id: state.nextId++,
    kind: 'drift',
    from: null,
    to,
    fromText: word.text,
    word,
    weightMul: 1,
    finalHops: 0,
    launchTick: state.tick,
    landTick: state.tick + Math.max(1, msToTicks(state.cfg.drift.travelMs)),
  };
  state.projectiles.push(p);
  return p;
}

export function land(state: GameState, p: Projectile, events: GameEvent[]): void {
  const ship = state.ships[p.to];
  if (p.kind === 'throw' && ship.mods.tarp > 0) {
    ship.mods.tarp--;
    events.push({ type: 'WORD_BOUNCED', ship: p.to, projectileId: p.id, text: p.word.text });
    return;
  }
  let mul = p.weightMul;
  if (p.kind === 'throw' && state.activeSea === 'storm' && !ship.mods.anchoredThisStorm) {
    mul *= 1 + state.cfg.seaEvents.storm.weightBonus;
  }

  let word = p.word;
  let hops = p.finalHops;
  if (hops >= state.cfg.throw.finalStageSwapAfterHops) {
    const fresh = drawFinalWordLike(state, word.text.length);
    events.push({ type: 'WORD_SWAPPED', ship: p.to, fromText: word.text, toText: fresh.text });
    word = fresh;
    hops = 0;
  }

  const weight = word.text.length * mul;
  ship.cargo.push({ ...word, id: state.nextId++, weight, finalHops: hops });
  events.push({ type: 'WORD_LANDED', ship: p.to, projectileId: p.id, text: word.text, weight });
}
