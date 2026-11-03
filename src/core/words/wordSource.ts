import type { GameConfig } from '../config';
import { next, nextInt, pick, type RngState } from '../rng';
import { TIERS, type Tier, type WordBank } from './wordBank';

/** Fügt ein Wort in das "zuletzt benutzt"-Fenster ein. */
export function remember(recent: string[], word: string, window: number): void {
  recent.push(word);
  while (recent.length > window) recent.shift();
}

/** Anteil kurz/mittel/lang zum Fortschritt t (0..1). */
export function tierWeights(cfg: GameConfig, t: number): Record<Tier, number> {
  const k = Math.min(1, Math.max(0, t));
  const { start, end } = cfg.difficulty;
  return {
    short: start.short + (end.short - start.short) * k,
    medium: start.medium + (end.medium - start.medium) * k,
    long: start.long + (end.long - start.long) * k,
  };
}

function pickTier(rng: RngState, weights: Record<Tier, number>): Tier {
  const total = TIERS.reduce((s, t) => s + weights[t], 0);
  let x = next(rng) * total;
  for (const t of TIERS) {
    x -= weights[t];
    if (x < 0) return t;
  }
  return 'medium';
}

/**
 * Zieht ein Wort, das nicht in `recent` vorkommt. Ist eine Stufe erschöpft,
 * wird auf die anderen Stufen ausgewichen. Nur wenn wirklich alles im Fenster
 * liegt (zu kleine Wortliste), darf sich ein Wort wiederholen.
 */
export function drawWord(bank: WordBank, rng: RngState, recent: readonly string[], weights: Record<Tier, number>): string {
  const recentSet = new Set(recent);
  const first = pickTier(rng, weights);
  const order: Tier[] = [first, ...TIERS.filter((t) => t !== first)];
  for (const tier of order) {
    const pool = bank[tier];
    if (pool.length === 0) continue;
    // Zufälliger Startpunkt, dann linear weitersuchen: deterministisch und ohne Endlosschleife.
    const start = nextInt(rng, pool.length);
    for (let i = 0; i < pool.length; i++) {
      const w = pool[(start + i) % pool.length];
      if (!recentSet.has(w)) return w;
    }
  }
  const any = [...bank.short, ...bank.medium, ...bank.long];
  return pick(rng, any);
}

function capitalize(w: string): string {
  return w.charAt(0).toUpperCase() + w.slice(1);
}

function flipCase(ch: string): string {
  const up = ch.toUpperCase();
  const low = ch.toLowerCase();
  // ß -> "SS" o. ä. würde die Länge ändern; solche Zeichen bleiben unverändert.
  if (up.length !== 1 || low.length !== 1) return ch;
  return ch === up ? low : up;
}

/** Müll-Schwierigkeit 0..1 zur Rundenzeit. */
export function garbageDifficulty(elapsedMs: number, cfg: GameConfig): number {
  const { startDifficulty, rampMs } = cfg.garbage;
  const k = Math.min(1, Math.max(0, elapsedMs / rampMs));
  return startDifficulty + (1 - startDifficulty) * k;
}

/**
 * Baut ein Müllwort passend zur Schwierigkeit `difficulty` (0..1):
 * - niedrig: normales mittellanges oder langes Wort
 * - mittel: zunehmend lange Wörter, erste Komposita
 * - hoch: Komposita und Monster-Wörter, gemischte Schreibung
 * Müllwörter enthalten nur Buchstaben, niemals Zahlen.
 */
export function makeGarbageWord(
  bank: WordBank,
  rng: RngState,
  cfg: GameConfig,
  recent: readonly string[],
  difficulty = 1,
): string {
  const g = cfg.garbage;
  const d = Math.min(1, Math.max(0, difficulty));
  const recentSet = new Set(recent);
  let last = '';
  for (let attempt = 0; attempt < 30; attempt++) {
    let w: string;
    const r = next(rng);
    if (r < g.compoundChance * d && bank.compoundParts.length > 1) {
      const a = pick(rng, bank.compoundParts);
      let b = pick(rng, bank.compoundParts);
      if (b === a) b = pick(rng, bank.compoundParts);
      w = capitalize(a) + capitalize(b);
    } else if (r < (g.compoundChance + g.monsterChance) * d && bank.garbageBases.length > 0) {
      w = pick(rng, bank.garbageBases);
    } else {
      // Normales Wort: anfangs eher mittel, später eher lang
      const preferLong = next(rng) < 0.25 + 0.75 * d;
      const pool = preferLong && bank.long.length ? bank.long : bank.medium.length ? bank.medium : bank.long;
      w = pool.length ? pick(rng, pool) : pick(rng, bank.garbageBases);
    }
    if (next(rng) < g.caseFlipChance * d && w.length > 2) {
      const i = 1 + nextInt(rng, w.length - 1);
      w = w.slice(0, i) + flipCase(w[i]) + w.slice(i + 1);
    }
    last = w;
    if (!recentSet.has(w)) return w;
  }
  // Extrem kleine Wortliste: lieber eine Wiederholung als eine künstliche Variante.
  return last;
}
