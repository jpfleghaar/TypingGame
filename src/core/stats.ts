import { ticksToMs, type GameConfig } from './config';
import type { GameState, PlayerState, WordRecord } from './types';

export interface PlayerResult {
  id: number;
  name: string;
  placement: number;
  wpm: number;
  /** 0..1 */
  accuracy: number;
  attacksSent: number;
  garbageSent: number;
  attacksReceived: number;
  garbageReceived: number;
  garbageCancelled: number;
  kos: number;
  badges: number;
  maxCombo: number;
  survivedMs: number;
}

/** Spielzeit eines Spielers in ms (bis zum K.O. oder bis jetzt). */
export function survivedMs(state: GameState, p: PlayerState): number {
  const end = p.koTick >= 0 ? p.koTick : state.tick;
  return ticksToMs(end, state.config);
}

export function wpm(state: GameState, p: PlayerState): number {
  const minutes = survivedMs(state, p) / 60_000;
  if (minutes <= 0) return 0;
  return p.stats.charsCleared / 5 / minutes;
}

export function accuracy(p: PlayerState): number {
  const total = p.stats.correctKeys + p.stats.errorKeys;
  return total === 0 ? 1 : p.stats.correctKeys / total;
}

export function results(state: GameState): PlayerResult[] {
  return state.players
    .map((p) => ({
      id: p.id,
      name: p.name,
      placement: p.placement || state.players.filter((q) => q.alive).length,
      wpm: wpm(state, p),
      accuracy: accuracy(p),
      attacksSent: p.stats.attacksSent,
      garbageSent: p.stats.garbageSent,
      attacksReceived: p.stats.attacksReceived,
      garbageReceived: p.stats.garbageReceived,
      garbageCancelled: p.stats.garbageCancelled,
      kos: p.stats.kos,
      badges: p.badges,
      maxCombo: p.stats.maxCombo,
      survivedMs: survivedMs(state, p),
    }))
    .sort((a, b) => a.placement - b.placement || a.id - b.id);
}

export interface ProblemWord {
  text: string;
  /** 1 = so gut wie der eigene Schnitt, höher = schlechter. */
  score: number;
  /** Durchschnittliche ms pro Zeichenwechsel in diesem Wort. */
  msPerChar: number;
  errors: number;
  count: number;
}

/**
 * Wörter, die im Verhältnis zum eigenen Durchschnitt langsam oder fehlerhaft
 * getippt wurden. Müllwörter werden ignoriert (zufällig, nicht übbar).
 */
export function problemWords(log: readonly WordRecord[], cfg: GameConfig): ProblemWord[] {
  const usable = log.filter((r) => !r.garbage && r.text.length > 1);
  if (usable.length < 5) return [];
  const intervals = usable.reduce((s, r) => s + r.text.length - 1, 0);
  const totalTicks = usable.reduce((s, r) => s + r.ticks, 0);
  const avg = totalTicks / intervals;
  if (avg <= 0) return [];
  const byText = new Map<string, { score: number; ticks: number; intervals: number; errors: number; count: number }>();
  for (const r of usable) {
    const speedRatio = r.ticks / (r.text.length - 1) / avg;
    const score = speedRatio + r.errors * cfg.problemWords.errorWeight;
    const e = byText.get(r.text) ?? { score: 0, ticks: 0, intervals: 0, errors: 0, count: 0 };
    e.score += score;
    e.ticks += r.ticks;
    e.intervals += r.text.length - 1;
    e.errors += r.errors;
    e.count++;
    byText.set(r.text, e);
  }
  return [...byText.entries()]
    .map(([text, e]) => ({
      text,
      score: e.score / e.count,
      msPerChar: ticksToMs(e.ticks / e.intervals, cfg),
      errors: e.errors,
      count: e.count,
    }))
    .filter((w) => w.score >= cfg.problemWords.minScore)
    .sort((a, b) => b.score - a.score || a.text.localeCompare(b.text))
    .slice(0, cfg.problemWords.maxEntries);
}
