/**
 * Bot gegen Bot ohne Grafik, zum Balancing: `npm run simulate [-- runden]`
 * Misst Rundendauer, Sieger und Würfe mit der echten Config (Treibgut, Inseln, Ereignisse).
 */
import { createConfig, createGame, step, ticksToMs, type CommandsByShip } from '../src/core';
import { deriveSeed } from '../src/core/rng';
import { BotController } from '../src/controllers/BotController';
import { BOT_PROFILES, type BotLevel } from '../src/controllers/botProfiles';

declare const process: { argv: string[] };

const ROUNDS = Number(process.argv[2]) || 40;
const MAX_TICKS = 60 * 60 * 15;

function play(a: BotLevel, b: BotLevel, seed: number) {
  const g = createGame({ seed, cfg: createConfig() });
  const bots = [new BotController(0, BOT_PROFILES[a], deriveSeed(seed, 10)), new BotController(1, BOT_PROFILES[b], deriveSeed(seed, 11))];
  while (g.phase !== 'over' && g.tick < MAX_TICKS) {
    const cmds: CommandsByShip = [bots[0].poll(g), bots[1].poll(g)];
    const ev = step(g, cmds);
    for (const bot of bots) bot.onEvents(ev, g);
  }
  return { ms: ticksToMs(g.tick), winner: g.winner, thrown: g.ships.map((s) => s.stats.thrown), timeout: g.phase !== 'over' };
}

const fmt = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.round((ms % 60000) / 1000)).padStart(2, '0')}`;
const pairs: [BotLevel, BotLevel][] = [
  ['easy', 'easy'],
  ['medium', 'medium'],
  ['hard', 'hard'],
  ['easy', 'medium'],
  ['medium', 'hard'],
];

for (const [a, b] of pairs) {
  const res = Array.from({ length: ROUNDS }, (_, i) => play(a, b, 1000 + i));
  const ms = res.map((r) => r.ms).sort((x, y) => x - y);
  const avg = ms.reduce((s, v) => s + v, 0) / ms.length;
  const winsA = res.filter((r) => r.winner === 0).length;
  const timeouts = res.filter((r) => r.timeout).length;
  const thrown = res.reduce((s, r) => s + r.thrown[0] + r.thrown[1], 0) / res.length;
  console.log(
    `${BOT_PROFILES[a].name.padEnd(6)} vs ${BOT_PROFILES[b].name.padEnd(6)}  Ø ${fmt(avg)}  Median ${fmt(ms[ms.length >> 1])}  ` +
      `min ${fmt(ms[0])}  max ${fmt(ms[ms.length - 1])}  Siege A ${winsA}/${ROUNDS}  Würfe Ø ${thrown.toFixed(0)}` +
      (timeouts ? `  Timeouts ${timeouts}` : ''),
  );
}
