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

function flipCase(ch: string): string {
  const up = ch.toUpperCase();
  const low = ch.toLowerCase();
  // ß -> "SS" o. ä. würde die Länge ändern; solche Zeichen bleiben unverändert.
  if (up.length !== 1 || low.length !== 1) return ch;
  return ch === up ? low : up;
}

/**
 * Mischt die Groß-/Kleinschreibung (Finale): `flips` zufällige Buchstaben
 * ab dem zweiten tauschen ihre Schreibung, z. B. "Kühlschrank" → "KüHlschRank".
 */
export function mixCase(word: string, rng: RngState, flips: number): string {
  const chars = [...word];
  const candidates = chars.map((_, i) => i).filter((i) => i > 0 && flipCase(chars[i]) !== chars[i]);
  for (let k = 0; k < flips && candidates.length > 0; k++) {
    const pos = candidates.splice(nextInt(rng, candidates.length), 1)[0];
    chars[pos] = flipCase(chars[pos]);
  }
  return chars.join('');
}

/** Langes Wort aus der Liste – zum Auffüllen, wenn ein Angreifer zu wenige eigene Wörter hat. */
export function drawLongWord(bank: WordBank, rng: RngState, recent: readonly string[]): string {
  return drawWord(bank, rng, recent, { short: 0, medium: 0.3, long: 0.7 });
}
