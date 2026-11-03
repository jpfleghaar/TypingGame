import type { ProblemWord } from '../core';

/**
 * Persistente Übungsliste (localStorage, pro Sprache). Wird nach jeder Runde
 * um die Problemwörter ergänzt. Ohne Speicherzugriff funktioniert alles weiter,
 * nur eben ohne Erinnerung.
 */
export interface PracticeEntry {
  text: string;
  /** Gleitender Schnitt des Problem-Scores. */
  score: number;
  seen: number;
  lastSeen: number;
}

const KEY = 'typing-royale.practice.v1';
type Store = Record<string, Record<string, PracticeEntry>>;

function load(): Store {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Store;
  } catch {
    return {};
  }
}

function save(store: Store): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* Speicher nicht verfügbar – ignorieren */
  }
}

export function addProblemWords(language: string, words: ProblemWord[]): void {
  if (words.length === 0) return;
  const store = load();
  const lang = (store[language] ??= {});
  const now = Date.now();
  for (const w of words) {
    const e = lang[w.text];
    lang[w.text] = e
      ? { text: w.text, score: e.score * 0.6 + w.score * 0.4, seen: e.seen + 1, lastSeen: now }
      : { text: w.text, score: w.score, seen: 1, lastSeen: now };
  }
  save(store);
}

export function listPractice(language: string): PracticeEntry[] {
  return Object.values(load()[language] ?? {}).sort((a, b) => b.score - a.score);
}

export function removePractice(language: string, text: string): void {
  const store = load();
  delete store[language]?.[text];
  save(store);
}

export function clearPractice(language: string): void {
  const store = load();
  delete store[language];
  save(store);
}
