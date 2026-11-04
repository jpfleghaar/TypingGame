import type { GameConfig } from './config';
import { next, type RngState } from './rng';
import type { IncomingGarbage, PlayerId } from './types';

/** Müllmenge, die eine bestimmte Combo-Stufe auslöst (0 = kein Angriff). */
export function comboAttack(combo: number, cfg: GameConfig): number {
  const { thresholds, repeatEvery, repeatGarbage } = cfg.combo;
  const hit = thresholds.find((t) => t.combo === combo);
  if (hit) return hit.garbage;
  const top = thresholds.reduce((m, t) => Math.max(m, t.combo), 0);
  if (repeatEvery > 0 && combo > top && (combo - top) % repeatEvery === 0) return repeatGarbage;
  return 0;
}

/** Bonus-Faktor (z. B. 0.5 = +50 %) für eine Abzeichen-Anzahl. */
export function badgeBonus(badges: number, cfg: GameConfig): number {
  let bonus = 0;
  cfg.badges.tiers.forEach((tier, i) => {
    if (badges >= tier) bonus = cfg.badges.bonus[i] ?? bonus;
  });
  return bonus;
}

/**
 * Wendet den Abzeichen-Bonus an. Nachkommastellen werden zufällig (aber
 * deterministisch) gerundet: 1.5 wird mit 50 % Wahrscheinlichkeit zu 2.
 */
export function applyBadgeBonus(amount: number, badges: number, cfg: GameConfig, rng: RngState): number {
  const raw = amount * (1 + badgeBonus(badges, cfg));
  const base = Math.floor(raw + 1e-9);
  const frac = raw - base;
  return frac > 1e-9 && next(rng) < frac ? base + 1 : base;
}

export interface CancelResult {
  remaining: number;
  cancelled: { from: PlayerId; amount: number }[];
}

/**
 * Verrechnet einen eigenen Angriff mit eingehendem Müll, ältester zuerst.
 * Verändert `incoming` direkt (verbrauchte Pakete werden entfernt).
 */
export function cancelIncoming(incoming: IncomingGarbage[], amount: number): CancelResult {
  incoming.sort((a, b) => a.arriveTick - b.arriveTick || a.id - b.id);
  const cancelled: { from: PlayerId; amount: number }[] = [];
  let remaining = amount;
  while (remaining > 0 && incoming.length > 0) {
    const pkt = incoming[0];
    const used = Math.min(remaining, pkt.amount);
    pkt.amount -= used;
    pkt.words?.splice(0, used);
    remaining -= used;
    cancelled.push({ from: pkt.from, amount: used });
    if (pkt.amount === 0) incoming.shift();
  }
  return { remaining, cancelled };
}

export function pendingGarbage(incoming: readonly IncomingGarbage[]): number {
  return incoming.reduce((s, g) => s + g.amount, 0);
}
