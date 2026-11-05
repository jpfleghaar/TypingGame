import type { Language } from '../runtime/session';

/** Bestzeiten im Endlos-Modus – getrennt nach Sprache und Lernmodus, nur in diesem Browser. */
const KEY = 'typing-royale.endless.v1';

export interface EndlessRecord {
  ms: number;
  wpm: number;
  words: number;
  /** ISO-Datum */
  date: string;
}

export function recordKey(language: Language, learn: boolean): string {
  return `${language}${learn ? '-learn' : ''}`;
}

function loadAll(): Record<string, EndlessRecord> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as unknown;
    return v && typeof v === 'object' ? (v as Record<string, EndlessRecord>) : {};
  } catch {
    return {};
  }
}

export function loadRecord(key: string): EndlessRecord | null {
  const r = loadAll()[key];
  return r && typeof r.ms === 'number' ? r : null;
}

/** Speichert, wenn besser als der alte Rekord. Liefert den vorherigen Rekord (oder null). */
export function submitRecord(key: string, run: EndlessRecord): { previous: EndlessRecord | null; isNew: boolean } {
  const all = loadAll();
  const previous = all[key] && typeof all[key].ms === 'number' ? all[key] : null;
  const isNew = !previous || run.ms > previous.ms;
  if (isNew) {
    all[key] = run;
    try {
      localStorage.setItem(KEY, JSON.stringify(all));
    } catch {
      /* ohne Speicher kein Rekord */
    }
  }
  return { previous, isNew };
}
