import { createRng, deriveSeed, pick } from '../rng';

export type Tier = 'short' | 'medium' | 'long';
export const TIERS: readonly Tier[] = ['short', 'medium', 'long'];

export interface ThemeData {
  label: string;
  short: string[];
  medium: string[];
  long: string[];
}

export interface WordData {
  language: string;
  themes: Record<string, ThemeData>;
  garbage: string[];
}

/** Unveränderliche Wortquelle einer Runde. Liegt bewusst nicht im Game-State (Größe). */
export interface WordBank {
  language: string;
  themeId: string;
  short: readonly string[];
  medium: readonly string[];
  long: readonly string[];
  /** Fertige schwere Wörter (Komposita, Zungenbrecher). */
  garbageBases: readonly string[];
  /** Bausteine für zusammengesetzte Müllwörter. */
  compoundParts: readonly string[];
}

export const THEME_MIXED = 'mixed';
export const THEME_RANDOM = 'random';

/** "random" wird aus dem Seed bestimmt, damit die Runde reproduzierbar bleibt. */
export function resolveThemeId(data: WordData, choice: string, seed: number): string {
  const ids = Object.keys(data.themes).sort();
  if (choice === THEME_RANDOM) return pick(createRng(deriveSeed(seed, 0x7e3e)), ids);
  if (choice === THEME_MIXED || data.themes[choice]) return choice;
  throw new Error(`Unbekanntes Thema: ${choice}`);
}

export function buildWordBank(data: WordData, themeId: string): WordBank {
  const themes = themeId === THEME_MIXED ? Object.values(data.themes) : [data.themes[themeId]];
  if (themes.some((t) => !t)) throw new Error(`Unbekanntes Thema: ${themeId}`);
  const collect = (tier: Tier) => [...new Set(themes.flatMap((t) => t[tier]))];
  const short = collect('short');
  const medium = collect('medium');
  const long = collect('long');
  // Bausteine kommen immer aus allen Themen, damit genug Auswahl da ist.
  const allThemes = Object.values(data.themes);
  const compoundParts = [
    ...new Set(allThemes.flatMap((t) => [...t.short, ...t.medium]).filter((w) => w.length >= 3 && w.length <= 8)),
  ];
  return {
    language: data.language,
    themeId,
    short,
    medium,
    long,
    garbageBases: [...data.garbage, ...new Set(allThemes.flatMap((t) => t.long).filter((w) => w.length >= 13))],
    compoundParts,
  };
}
