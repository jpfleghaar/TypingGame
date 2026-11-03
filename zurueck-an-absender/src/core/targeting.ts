import { launchThrow } from './throw';
import { type GameEvent, type GameState, type ShipId, type TargetRef } from './types';

const lower = (s: string) => s.toLowerCase();

/** Text des aktuellen Ziels (oder null, falls es nicht mehr existiert). */
export function targetText(state: GameState, ship: ShipId, t: TargetRef | null): string | null {
  if (!t) return null;
  if (t.kind === 'cargo') return state.ships[ship].cargo.find((c) => c.id === t.id)?.text ?? null;
  return state.drift.find((d) => d.id === t.id)?.word.text ?? null;
}

interface Candidate {
  ref: TargetRef;
  text: string;
}

function candidates(state: GameState, ship: ShipId): Candidate[] {
  const out: Candidate[] = [];
  for (const c of state.ships[ship].cargo) out.push({ ref: { kind: 'cargo', id: c.id }, text: c.text });
  for (const d of state.drift) out.push({ ref: { kind: 'drift', id: d.id }, text: d.word.text });
  return out;
}

/**
 * Wählt das Ziel für einen getippten Anfang: kürzestes passendes Wort; bei
 * gleicher Länge bleibt das bisherige Ziel, dann Treibgut vor Fracht, dann ältestes.
 */
export function pickTarget(
  state: GameState,
  ship: ShipId,
  prefix: string,
  current: TargetRef | null,
): Candidate | null {
  const p = lower(prefix);
  let best: Candidate | null = null;
  const rank = (c: Candidate) => {
    const isCurrent = current !== null && current.kind === c.ref.kind && current.id === c.ref.id;
    return [c.text.length, isCurrent ? 0 : 1, c.ref.kind === 'drift' ? 0 : 1, c.ref.id];
  };
  const less = (a: number[], b: number[]) => {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
    return false;
  };
  for (const c of candidates(state, ship)) {
    if (!lower(c.text).startsWith(p)) continue;
    if (!best || less(rank(c), rank(best))) best = c;
  }
  return best;
}

export function resetTyping(state: GameState, ship: ShipId): void {
  state.ships[ship].typing = { target: null, typed: 0, error: null };
}

/** Setzt bei allen Schiffen das Tippen zurück, die gerade auf `ref` zielen. */
export function dropTargetEverywhere(state: GameState, ref: TargetRef, events: GameEvent[], except?: ShipId): void {
  for (const s of state.ships) {
    if (s.id === except) continue;
    const t = s.typing.target;
    if (t && t.kind === ref.kind && t.id === ref.id) {
      resetTyping(state, s.id);
      events.push({ type: 'TARGET_LOST', ship: s.id });
    }
  }
}

function harpoonDone(state: GameState, ship: ShipId, typed: number, len: number): boolean {
  return state.ships[ship].mods.harpoon && typed >= Math.ceil(len * state.cfg.upgrades.harpoon.fraction);
}

function complete(state: GameState, ship: ShipId, events: GameEvent[]): void {
  const s = state.ships[ship];
  const t = s.typing.target!;
  resetTyping(state, ship);
  if (t.kind === 'cargo') {
    const idx = s.cargo.findIndex((c) => c.id === t.id);
    const item = s.cargo[idx];
    // Erst werfen (Aufholmechanik prüft den Füllstand inklusive dieses Worts), dann entfernen.
    launchThrow(state, ship, item, item.finalHops, events);
    s.cargo.splice(idx, 1);
  } else {
    const idx = state.drift.findIndex((d) => d.id === t.id);
    const [d] = state.drift.splice(idx, 1);
    s.stats.fished++;
    events.push({ type: 'DRIFT_FISHED', ship, driftId: d.id, text: d.word.text });
    dropTargetEverywhere(state, t, events, ship);
    launchThrow(state, ship, d.word, 0, events);
  }
}

export function typeChar(state: GameState, ship: ShipId, char: string, events: GameEvent[]): void {
  const s = state.ships[ship];
  const ty = s.typing;
  // Fehler muss erst korrigiert (Backspace) werden.
  if (ty.error !== null) return;

  const currentText = targetText(state, ship, ty.target);
  const prefix = (currentText ? currentText.slice(0, ty.typed) : '') + char;
  const best = pickTarget(state, ship, prefix, ty.target);

  if (!best) {
    s.stats.wrongKeys++;
    if (ty.target) ty.error = char;
    events.push({ type: 'TYPO', ship, char, hasTarget: ty.target !== null });
    return;
  }

  ty.target = best.ref;
  ty.typed = prefix.length;
  s.stats.correctKeys++;
  events.push({ type: 'KEY_OK', ship });

  const len = best.text.length;
  if (ty.typed >= len || (best.ref.kind === 'drift' && harpoonDone(state, ship, ty.typed, len))) {
    complete(state, ship, events);
  }
}

export function backspace(state: GameState, ship: ShipId, events: GameEvent[]): void {
  const ty = state.ships[ship].typing;
  if (ty.error !== null) {
    ty.error = null;
    events.push({ type: 'TYPO_CLEARED', ship });
    return;
  }
  if (ty.typed > 0) ty.typed--;
  if (ty.typed === 0) ty.target = null;
}
