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
  /** Lernmodus: Übersetzung je zu tippendem Wort (nur zur Anzeige). */
  translations?: Readonly<Record<string, string>>;
}

export type VocabLang = 'de' | 'en';

export interface VocabData {
  themes: Record<string, { label: Record<VocabLang, string>; pairs: [string, string][] }>;
}

export const THEME_MIXED = 'mixed';
export const THEME_RANDOM = 'random';

/** "random" wird aus dem Seed bestimmt, damit die Runde reproduzierbar bleibt. */
export function resolveThemeId(data: { themes: Record<string, unknown> }, choice: string, seed: number): string {
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

/**
 * Wortquelle für den Lernmodus: getippt wird in der Lernsprache `target`,
 * die Übersetzung in die andere Sprache wird nur angezeigt.
 */
export function buildLearnBank(vocab: VocabData, target: VocabLang, themeId: string): WordBank {
  const themes = themeId === THEME_MIXED ? Object.values(vocab.themes) : [vocab.themes[themeId]];
  if (themes.some((t) => !t)) throw new Error(`Unbekanntes Thema: ${themeId}`);
  const translations: Record<string, string> = {};
  for (const t of themes) {
    for (const [de, en] of t.pairs) {
      const [typed, hint] = target === 'de' ? [de, en] : [en, de];
      // Doppelte Zielwörter (z. B. "singer" für Sänger/Sängerin): erste Übersetzung gilt
      translations[typed] ??= hint;
    }
  }
  const words = Object.keys(translations);
  const allWords = Object.values(vocab.themes).flatMap((t) => t.pairs.map(([de, en]) => (target === 'de' ? de : en)));
  const long = words.filter((w) => w.length > 9);
  return {
    language: target,
    themeId,
    short: words.filter((w) => w.length <= 5),
    medium: words.filter((w) => w.length > 5 && w.length <= 9),
    long,
    garbageBases: [...new Set(allWords.filter((w) => w.length >= 9))],
    compoundParts: [...new Set(allWords.filter((w) => w.length >= 3 && w.length <= 8))],
    translations,
  };
}
