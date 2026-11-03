/**
 * Balancing-Simulation: spielt viele Runden nur mit Bots und zeigt Rundendauer,
 * Platzierung nach Tempo und Angriffsstatistik.
 *
 *   npm run simulate              # 40 Runden, 19 Bots
 *   npm run simulate -- 100       # 100 Runden
 */
declare const process: { argv: string[] };
import { results } from '../src/core';
import type { WordData } from '../src/core/words/wordBank';
import de from '../src/data/words/de.json';
import { runHeadless } from '../src/runtime/headless';

const rounds = Number(process.argv[2] ?? 40);
const durations: number[] = [];
const byBucket = new Map<string, { place: number[]; survived: number[] }>();
let sent = 0;
let cancelled = 0;
let kosWithCredit = 0;
let totalKos = 0;
const winnerWpm: number[] = [];

const t0 = performance.now();
for (let r = 0; r < rounds; r++) {
  const seed = 1000 + r * 7919;
  const { state, profiles, durationMs } = runHeadless({
    seed,
    words: de as WordData,
    field: { count: 19, minWpm: 25, maxWpm: 110 },
  });
  durations.push(durationMs / 60_000);
  for (const res of results(state)) {
    const prof = profiles[res.id];
    const bucket = `${Math.floor(prof.wpm / 15) * 15}-${Math.floor(prof.wpm / 15) * 15 + 14}`;
    const b = byBucket.get(bucket) ?? { place: [], survived: [] };
    b.place.push(res.placement);
    b.survived.push(res.survivedMs / 60_000);
    byBucket.set(bucket, b);
    sent += res.garbageSent;
    cancelled += res.garbageCancelled;
    if (res.placement === 1) winnerWpm.push(prof.wpm);
  }
  for (const p of state.players) {
    if (p.koTick >= 0) {
      totalKos++;
      if (p.koBy !== null) kosWithCredit++;
    }
  }
}

const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
const pct = (a: number[], q: number) => [...a].sort((x, y) => x - y)[Math.floor(q * (a.length - 1))];
const fmt = (m: number) => `${Math.floor(m)}:${String(Math.round((m % 1) * 60)).padStart(2, '0')}`;

console.log(`\n${rounds} Runden in ${((performance.now() - t0) / 1000).toFixed(1)} s simuliert\n`);
console.log(
  `Rundendauer: Ø ${fmt(avg(durations))} | min ${fmt(Math.min(...durations))} | p10 ${fmt(pct(durations, 0.1))} | ` +
    `median ${fmt(pct(durations, 0.5))} | p90 ${fmt(pct(durations, 0.9))} | max ${fmt(Math.max(...durations))}`,
);
const inTarget = durations.filter((d) => d >= 3 && d <= 6).length;
console.log(`Im Zielbereich 3–6 min: ${((inTarget / rounds) * 100).toFixed(0)} %`);
console.log(`Sieger-WPM: Ø ${avg(winnerWpm).toFixed(0)}, min ${Math.min(...winnerWpm)}, max ${Math.max(...winnerWpm)}`);
console.log(`Müll gesendet ${sent}, davon zusätzlich abgewehrt ${cancelled}; K.O.s mit Abzeichen-Gutschrift: ${((kosWithCredit / totalKos) * 100).toFixed(0)} %\n`);
console.log('WPM-Band   Ø Platz   Ø überlebt');
for (const [bucket, b] of [...byBucket.entries()].sort((a, c) => parseInt(a[0]) - parseInt(c[0]))) {
  console.log(`${bucket.padEnd(9)}  ${avg(b.place).toFixed(1).padStart(7)}   ${fmt(avg(b.survived)).padStart(9)}`);
}
