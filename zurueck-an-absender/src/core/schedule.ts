import { msToTicks } from './config';
import { next, nextInt } from './rng';
import { dropTargetEverywhere, resetTyping } from './targeting';
import { launchDrift } from './throw';
import { dealCards, chooseUpgrade } from './upgrades';
import { load } from './weight';
import { drawWord } from './words/pool';
import type { GameEvent, GameState, SeaEventKind, SeaEventPlan, ShipId, TimedWindow } from './types';

function randRange(state: GameState, minMs: number, maxMs: number): number {
  return msToTicks(minMs + next(state.rng) * (maxMs - minMs));
}

export function planIsland(state: GameState, fromTick: number): TimedWindow | null {
  const c = state.cfg.island;
  if (!c.enabled) return null;
  const startTick = fromTick + randRange(state, c.intervalMinMs, c.intervalMaxMs);
  return {
    warnTick: startTick - msToTicks(c.warningMs),
    startTick,
    endTick: startTick + msToTicks(c.durationMs),
  };
}

/** Plant genau ein Meeresereignis in die Lücke bis zur nächsten Inselwarnung. */
export function planSea(state: GameState, fromTick: number): SeaEventPlan | null {
  const c = state.cfg.seaEvents;
  if (!c.enabled) return null;
  const kind: SeaEventKind = next(state.rng) < 0.5 ? 'storm' : 'tailwind';
  const duration = msToTicks(c[kind].durationMs);
  const earliest = fromTick + msToTicks(c.calmAfterMs) + msToTicks(c.warningMs);
  const island = state.schedule.island;
  const latest = island
    ? island.warnTick - msToTicks(c.marginBeforeIslandMs) - duration
    : earliest + msToTicks(40000);
  if (latest < earliest) return null;
  const startTick = earliest + nextInt(state.rng, latest - earliest + 1);
  return { kind, warnTick: startTick - msToTicks(c.warningMs), startTick, endTick: startTick + duration };
}

export function driftIntervalTicks(state: GameState): number {
  const c = state.cfg.drift;
  const minutes = state.tick / msToTicks(60000);
  let ms = Math.max(c.intervalMinMs, c.intervalStartMs * Math.pow(c.intervalShrinkPerMinute, minutes));
  if (state.activeSea === 'tailwind') ms /= 1 + state.cfg.seaEvents.tailwind.driftRateBonus;
  return Math.max(1, msToTicks(ms));
}

export function spawnDrift(state: GameState, events: GameEvent[]): void {
  const word = drawWord(state, 1);
  const d = {
    id: state.nextId++,
    word,
    spawnTick: state.tick,
    expireTick: state.tick + msToTicks(state.cfg.drift.lifetimeMs),
  };
  state.drift.push(d);
  events.push({ type: 'DRIFT_SPAWNED', driftId: d.id, text: word.text });
}

/** Schiff mit der leichteren Ladung; bei Gleichstand entscheidet der Zufall. */
export function lighterShip(state: GameState): ShipId {
  const a = load(state.ships[0]);
  const b = load(state.ships[1]);
  if (a < b) return 0;
  if (b < a) return 1;
  return next(state.rng) < 0.5 ? 0 : 1;
}

function expireDrift(state: GameState, events: GameEvent[]): void {
  for (let i = state.drift.length - 1; i >= 0; i--) {
    const d = state.drift[i];
    if (d.expireTick > state.tick) continue;
    state.drift.splice(i, 1);
    dropTargetEverywhere(state, { kind: 'drift', id: d.id }, events);
    const to = lighterShip(state);
    const p = launchDrift(state, to, d.word);
    events.push({ type: 'DRIFT_EXPIRED', driftId: d.id, to, projectileId: p.id, text: d.word.text });
  }
}

export function startIsland(state: GameState, events: GameEvent[]): void {
  state.phase = 'island';
  // Laufendes Meeresereignis endet, geplantes entfällt (wird nach der Insel neu geplant).
  endSea(state, events);
  state.schedule.sea = null;
  for (const d of state.drift) {
    dropTargetEverywhere(state, { kind: 'drift', id: d.id }, events);
    events.push({ type: 'DRIFT_LOST', driftId: d.id });
  }
  state.drift = [];
  for (const s of state.ships) {
    resetTyping(state, s.id);
    s.cards = dealCards(state, s.id);
    s.cardChosen = false;
  }
  events.push({ type: 'ISLAND_START' });
}

export function endIsland(state: GameState, events: GameEvent[]): void {
  for (const s of state.ships) {
    if (!s.cardChosen && s.cards && s.cards.length > 0) {
      chooseUpgrade(state, s.id, nextInt(state.rng, s.cards.length), events, true);
    }
    s.cards = null;
    s.cardChosen = false;
  }
  state.phase = 'sea';
  state.schedule.island = planIsland(state, state.tick);
  state.schedule.sea = planSea(state, state.tick);
  state.schedule.nextDriftTick = state.tick + driftIntervalTicks(state);
  events.push({ type: 'ISLAND_END' });
}

function startSea(state: GameState, kind: SeaEventKind, events: GameEvent[]): void {
  state.activeSea = kind;
  if (kind === 'storm') {
    for (const s of state.ships) {
      if (s.mods.anchor > 0) {
        s.mods.anchor--;
        s.mods.anchoredThisStorm = true;
      }
    }
  }
  events.push({ type: 'SEA_EVENT_START', kind });
}

function endSea(state: GameState, events: GameEvent[]): void {
  if (!state.activeSea) return;
  const kind = state.activeSea;
  state.activeSea = null;
  for (const s of state.ships) s.mods.anchoredThisStorm = false;
  events.push({ type: 'SEA_EVENT_END', kind });
}

/** Zeitplan abarbeiten: Insel, Meeresereignisse, Treibgut. */
export function runSchedule(state: GameState, events: GameEvent[]): void {
  const t = state.tick;
  const sch = state.schedule;

  if (sch.island) {
    if (t === sch.island.warnTick) events.push({ type: 'ISLAND_WARNING', startTick: sch.island.startTick });
    if (state.phase === 'sea' && t >= sch.island.startTick) startIsland(state, events);
    else if (state.phase === 'island' && t >= sch.island.endTick) endIsland(state, events);
  }
  if (state.phase === 'island') return;

  if (sch.sea) {
    if (t === sch.sea.warnTick) events.push({ type: 'SEA_EVENT_WARNING', kind: sch.sea.kind, startTick: sch.sea.startTick });
    if (state.activeSea === null && t >= sch.sea.startTick && t < sch.sea.endTick) startSea(state, sch.sea.kind, events);
    if (t >= sch.sea.endTick) {
      endSea(state, events);
      sch.sea = sch.island ? null : planSea(state, t);
    }
  }

  expireDrift(state, events);
  if (state.cfg.drift.enabled && t >= sch.nextDriftTick) {
    if (state.drift.length < state.cfg.drift.maxActive) spawnDrift(state, events);
    sch.nextDriftTick = t + driftIntervalTicks(state);
  }
}

/** Debug: Insel sofort starten (Warnung wird übersprungen). */
export function debugStartIsland(state: GameState, events: GameEvent[]): void {
  if (state.phase !== 'sea') return;
  const c = state.cfg.island;
  state.schedule.island = {
    warnTick: state.tick,
    startTick: state.tick,
    endTick: state.tick + msToTicks(c.durationMs),
  };
  startIsland(state, events);
}

/** Debug: Meeresereignis sofort starten. */
export function debugStartSea(state: GameState, kind: SeaEventKind, events: GameEvent[]): void {
  if (state.phase !== 'sea') return;
  endSea(state, events);
  const duration = msToTicks(state.cfg.seaEvents[kind].durationMs);
  state.schedule.sea = { kind, warnTick: state.tick, startTick: state.tick, endTick: state.tick + duration };
  startSea(state, kind, events);
}

/** Was kommt als nächstes? (für Ausguck und Debug) */
export function nextEventPreview(state: GameState): { kind: 'island' | SeaEventKind; startTick: number } | null {
  const sch = state.schedule;
  const opts: { kind: 'island' | SeaEventKind; startTick: number }[] = [];
  if (sch.island && sch.island.startTick > state.tick) opts.push({ kind: 'island', startTick: sch.island.startTick });
  if (sch.sea && sch.sea.startTick > state.tick) opts.push({ kind: sch.sea.kind, startTick: sch.sea.startTick });
  opts.sort((a, b) => a.startTick - b.startTick);
  return opts[0] ?? null;
}
