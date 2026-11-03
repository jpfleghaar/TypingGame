/**
 * Prüft und beschreibt die Wortketten: `npm run check-chains`
 * Harte Regeln brechen mit Exit-Code 1 ab; Präfix-Überschneidungen zwischen
 * Ketten werden nur gemeldet (das Spiel vermeidet sie beim Ziehen).
 */
import { CHAINS } from '../src/core/words/chains';

// Ohne @types/node: nur das Nötigste deklarieren.
declare const process: { argv: string[]; exit(code: number): never };

const errors: string[] = [];
const seen = new Map<string, number>();

CHAINS.forEach((c, i) => {
  if (c.length < 3 || c.length > 5) errors.push(`Kette ${i} (${c[0]}): ${c.length} Stufen`);
  for (let s = 1; s < c.length; s++) {
    if (!c[s].startsWith(c[s - 1])) errors.push(`${c[s - 1]} → ${c[s]}: beginnt nicht mit Vorstufe`);
  }
  for (const w of c) {
    if (!/^[A-ZÄÖÜ][a-zäöüß]+$/.test(w)) errors.push(`Ungültige Zeichen: ${w}`);
    const k = w.toLowerCase();
    if (seen.has(k)) errors.push(`Doppelt: ${w} (Ketten ${seen.get(k)} und ${i})`);
    seen.set(k, i);
  }
});

const byStages = new Map<number, number>();
for (const c of CHAINS) byStages.set(c.length, (byStages.get(c.length) ?? 0) + 1);
const lengths = CHAINS.flat().map((w) => w.length);

console.log(`Ketten: ${CHAINS.length}`);
console.log(`Stufen: ${[...byStages].sort().map(([k, v]) => `${k}×${v}`).join(', ')}`);
console.log(`Wortlänge: ${Math.min(...lengths)}–${Math.max(...lengths)} Buchstaben`);

const starts = CHAINS.map((c) => c[0].toLowerCase());
const overlaps: string[] = [];
CHAINS.forEach((c, i) => {
  for (const w of c) {
    starts.forEach((s, j) => {
      if (i !== j && w.toLowerCase().startsWith(s)) overlaps.push(`${CHAINS[j][0]} ⊂ ${w}`);
    });
  }
});
console.log(`Präfix-Überschneidungen zwischen Ketten (nur Info): ${overlaps.length}`);
if (process.argv.includes('--verbose')) for (const o of overlaps) console.log('  ' + o);

if (errors.length) {
  console.error(`\n${errors.length} Fehler:`);
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}
console.log('OK');
