// Liest wordlists/<lang>/<theme>.txt, prüft und dedupliziert die Wörter,
// sortiert sie nach Länge in kurz/mittel/lang und schreibt src/data/words/<lang>.json.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = join(ROOT, 'wordlists');
const OUT = join(ROOT, 'src/data/words');

const LABELS = {
  de: {
    weltraum: 'Weltraum', kueche: 'Küche', natur: 'Natur', technik: 'Technik',
    sport: 'Sport', musik: 'Musik', reisen: 'Reisen', tiere: 'Tiere',
  },
  en: {
    space: 'Space', kitchen: 'Kitchen', nature: 'Nature', tech: 'Tech',
    sport: 'Sport', music: 'Music', travel: 'Travel', animals: 'Animals',
  },
};

const VALID = /^[A-Za-zÄÖÜäöüß]+$/;
const SHORT_MAX = 5;
const MEDIUM_MAX = 9;

let failed = false;
for (const lang of readdirSync(SRC)) {
  const dir = join(SRC, lang);
  const themes = {};
  let garbage = [];
  const all = new Set();
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.txt')).sort()) {
    const id = file.replace(/\.txt$/, '');
    const words = [...new Set(readFileSync(join(dir, file), 'utf8').split(/\s+/).filter(Boolean))];
    for (const w of words) {
      if (!VALID.test(w)) {
        console.error(`[${lang}/${file}] ungültiges Wort: ${w}`);
        failed = true;
      }
    }
    if (id === '_garbage') {
      garbage = words;
      continue;
    }
    words.forEach((w) => all.add(w));
    themes[id] = {
      label: LABELS[lang]?.[id] ?? id,
      short: words.filter((w) => w.length <= SHORT_MAX),
      medium: words.filter((w) => w.length > SHORT_MAX && w.length <= MEDIUM_MAX),
      long: words.filter((w) => w.length > MEDIUM_MAX),
    };
  }
  writeFileSync(join(OUT, `${lang}.json`), JSON.stringify({ language: lang, themes, garbage }, null, 1) + '\n');
  const stats = Object.entries(themes)
    .map(([id, t]) => `${id}: ${t.short.length}/${t.medium.length}/${t.long.length}`)
    .join(', ');
  console.log(`${lang}: ${all.size} eindeutige Wörter, ${garbage.length} Müll-Basen | ${stats}`);
}
if (failed) process.exit(1);
