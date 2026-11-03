// Kopiert aus typing_game/src/core/rng.ts (bewusst kopiert, nicht verlinkt).
/**
 * Deterministischer Zufall (mulberry32). Der Zustand ist eine einzelne Zahl,
 * damit er im serialisierbaren Game-State liegen kann.
 */
export interface RngState {
  s: number;
}

export function createRng(seed: number): RngState {
  return { s: seed >>> 0 };
}

/** Liefert [0, 1) und schreibt den neuen Zustand zurück. */
export function next(r: RngState): number {
  r.s = (r.s + 0x6d2b79f5) >>> 0;
  let t = r.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function nextInt(r: RngState, maxExclusive: number): number {
  return Math.floor(next(r) * maxExclusive);
}

export function pick<T>(r: RngState, arr: readonly T[]): T {
  return arr[nextInt(r, arr.length)];
}

/** Leitet aus einem Seed und einem Schlüssel einen unabhängigen Seed ab. */
export function deriveSeed(seed: number, key: number): number {
  let h = (seed ^ Math.imul(key + 0x9e3779b9, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Normalverteilung (Box-Muller), z. B. für Bot-Schwankungen. */
export function gaussian(r: RngState): number {
  const u = Math.max(1e-9, next(r));
  const v = next(r);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
