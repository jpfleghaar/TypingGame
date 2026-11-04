import type { GameConfig } from './config';
import { next, type RngState } from './rng';
import type { IncomingGarbage, PlayerId } from './types';

/** Wie viele fehlerfreie Wörter bei dieser Combo einen Punkt bringen. */
export function wordsPerPoint(combo: number, cfg: GameConfig): number {
  let words = cfg.points.rates[0]?.words ?? 1;
  for (const r of cfg.points.rates) if (combo >= r.minCombo) words = r.words;
  return Math.max(1, words);
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
 * Zieht `amount` Wörter vom eingehenden Müll ab (Abwehr), ältester zuerst.
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
