import { nextInt, type RngState } from '../rng';
import type { GameState, Word } from '../types';
import { CHAINS, chainLength, chainWord } from './chains';

export function shuffledPool(rng: RngState): number[] {
  const arr = CHAINS.map((_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = nextInt(rng, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Alle Wörter, die gerade sichtbar/tippbar sind (Fracht beider Schiffe + Treibgut). */
function wordsInPlay(state: GameState): string[] {
  const out: string[] = [];
  for (const s of state.ships) for (const c of s.cargo) out.push(c.text.toLowerCase());
  for (const d of state.drift) out.push(d.word.text.toLowerCase());
  for (const p of state.projectiles) out.push(p.word.text.toLowerCase());
  return out;
}

function conflicts(word: string, inPlay: string[]): boolean {
  const w = word.toLowerCase();
  return inPlay.some((p) => p.startsWith(w) || w.startsWith(p));
}

function takeAt(state: GameState, idx: number): number {
  const [chain] = state.pool.splice(idx, 1);
  return chain;
}

function ensurePool(state: GameState): void {
  // Fallback, falls alle Ketten verbraucht sind: Pool neu mischen.
  if (state.pool.length === 0) state.pool = shuffledPool(state.rng);
}

/**
 * Zieht eine neue Kette (jede nur einmal pro Runde). Bevorzugt Ketten, deren
 * Startwort sich nicht mit einem sichtbaren Wort überschneidet, damit die
 * Zielauswahl per Anfangsbuchstaben eindeutig bleibt.
 */
export function drawWord(state: GameState, stage = 1): Word {
  ensurePool(state);
  const inPlay = wordsInPlay(state);
  let idx = state.pool.findIndex((c) => !conflicts(chainWord(c, Math.min(stage, chainLength(c))), inPlay));
  if (idx < 0) idx = 0;
  const chain = takeAt(state, idx);
  const s = Math.min(stage, chainLength(chain));
  return { chain, stage: s, text: chainWord(chain, s) };
}

/** Frisches Endstufen-Wort mit möglichst ähnlicher Länge (für den Ping-Pong-Tausch). */
export function drawFinalWordLike(state: GameState, targetLength: number): Word {
  ensurePool(state);
  const inPlay = wordsInPlay(state);
  let best = -1;
  let bestDiff = Infinity;
  for (let i = 0; i < state.pool.length; i++) {
    const c = state.pool[i];
    const w = chainWord(c, chainLength(c));
    if (conflicts(w, inPlay)) continue;
    const diff = Math.abs(w.length - targetLength);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
      if (diff === 0) break;
    }
  }
  const chain = takeAt(state, best < 0 ? 0 : best);
  const stage = chainLength(chain);
  return { chain, stage, text: chainWord(chain, stage) };
}
