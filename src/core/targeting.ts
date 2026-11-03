import { msToTicks } from './config';
import { pendingGarbage } from './garbage';
import { pick } from './rng';
import type { GameState, PlayerId, PlayerState } from './types';

/** Bedrohung eines Spielers: Stapelhöhe + angekündigter Müll. */
export function danger(p: PlayerState): number {
  return p.stack.length + pendingGarbage(p.incoming);
}

/** Wann hat `attacker` zuletzt Müll an `victim` geschickt (oder dort gelandet)? */
function lastAttackTick(attacker: PlayerId, victim: PlayerState): number {
  let t = -Infinity;
  for (const g of victim.incoming) if (g.from === attacker) t = Math.max(t, g.sentTick);
  if (victim.lastHitBy === attacker) t = Math.max(t, victim.lastHitTick);
  return t;
}

/**
 * Wählt den Kandidaten mit dem höchsten Wert. Bei Gleichstand bleibt das
 * bisherige Ziel, sonst wird ZUFÄLLIG (aus dem Seed) gewählt – niemals nach
 * Spieler-ID, sonst würde immer derselbe Spieler (z. B. der Mensch auf ID 0)
 * bevorzugt.
 */
function bestBy(
  state: GameState,
  candidates: PlayerState[],
  score: (p: PlayerState) => number,
  current: PlayerId | null,
): PlayerId | null {
  let best: PlayerState[] = [];
  let bestScore = -Infinity;
  for (const c of candidates) {
    const s = score(c);
    if (s > bestScore) {
      bestScore = s;
      best = [c];
    } else if (s === bestScore) best.push(c);
  }
  if (best.length === 0) return null;
  if (current !== null && best.some((b) => b.id === current)) return current;
  return best.length === 1 ? best[0].id : pick(state.rng, best).id;
}

/**
 * Bestimmt das strategische Ziel. `null` bedeutet: Strategie findet niemanden,
 * dann greift die Zufalls-Rückfallebene.
 * `targetsSnapshot` sind die Ziele aller Spieler zu Tick-Beginn (Reihenfolge-unabhängig).
 */
export function strategicTarget(
  state: GameState,
  me: PlayerState,
  targetsSnapshot: ReadonlyMap<PlayerId, PlayerId | null>,
): PlayerId | null {
  const opponents = state.players.filter((p) => p.alive && p.id !== me.id);
  if (opponents.length === 0) return null;
  switch (me.strategy) {
    case 'random':
      return null;
    case 'attackers': {
      const memory = msToTicks(state.config.targeting.attackerMemoryMs, state.config);
      const attackers = opponents.filter(
        (o) => targetsSnapshot.get(o.id) === me.id || state.tick - lastAttackTick(o.id, me) <= memory,
      );
      return bestBy(state, attackers, (o) => lastAttackTick(o.id, me), me.targetId);
    }
    case 'weakest':
      return bestBy(state, opponents, danger, me.targetId);
    case 'badges': {
      const maxBadges = Math.max(...opponents.map((o) => o.badges));
      if (maxBadges <= 0) return null;
      return bestBy(
        state,
        opponents.filter((o) => o.badges === maxBadges),
        danger,
        me.targetId,
      );
    }
  }
}

/** Zufallsziel: bleibt bis zum Ablauf von retargetTick bzw. bis es K.O. ist. */
export function randomTarget(state: GameState, me: PlayerState, force: boolean): PlayerId | null {
  const opponents = state.players.filter((p) => p.alive && p.id !== me.id);
  if (opponents.length === 0) return null;
  const current = opponents.find((o) => o.id === me.targetId);
  if (current && !force && state.tick < me.retargetTick) return current.id;
  me.retargetTick = state.tick + msToTicks(state.config.targeting.randomRetargetMs, state.config);
  // Wenn möglich ein anderes Ziel als bisher.
  const pool = opponents.length > 1 && current ? opponents.filter((o) => o.id !== current.id) : opponents;
  return pick(state.rng, pool).id;
}

export function computeTarget(
  state: GameState,
  me: PlayerState,
  targetsSnapshot: ReadonlyMap<PlayerId, PlayerId | null>,
): PlayerId | null {
  const strategic = strategicTarget(state, me, targetsSnapshot);
  if (strategic !== null) return strategic;
  return randomTarget(state, me, false);
}
