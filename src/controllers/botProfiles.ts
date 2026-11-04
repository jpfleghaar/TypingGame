import { createRng, deriveSeed, gaussian, next, pick, type TargetStrategy } from '../core';
import { BOT_NAMES } from './botNames';

export interface BotProfile {
  name: string;
  /** Ziel-Tempo in Wörtern pro Minute (5 Zeichen = 1 Wort). */
  wpm: number;
  /** Wahrscheinlichkeit für einen Tippfehler pro Tastendruck. */
  errorRate: number;
  /** Streuung des Tastenabstands (0.25 = ±25 % typisch). */
  jitter: number;
  /** Wie stark das Tempo von Wort zu Wort schwankt ("Tagesform"). */
  wordDrift: number;
  /** Pause nach einem fertigen Wort, bis zum ersten Buchstaben des nächsten (ms). */
  reactionMs: number;
  /** Zusatzpause nach einem Fehler, bis der Fehler "bemerkt" ist (ms). */
  errorPauseMs: number;
  /** Wahrscheinlichkeit, eingehenden Spam mit Tab abzuwehren (wenn Punkte da sind und es nicht eng ist). */
  defenseRate: number;
  /** Reaktionszeit, bis eine Entscheidung (Enter) umgesetzt wird, ms. */
  sendDelayMs: number;
  /** Ab so vielen Punkten greift der Bot an (sonst spart er). */
  attackAt: number;
  /** Zusätzliche Punkte, die er als Abwehr-Reserve behält, wenn sein Stapel voll wird. */
  reserve: number;
  strategy: TargetStrategy;
}

export interface BotFieldOptions {
  count: number;
  minWpm: number;
  maxWpm: number;
}

/** Standard-Gegnerfeld: du gegen 10 Bots (11 Spieler – passend zu den Anschlüssen P1–P10 der Platine). */
export const DEFAULT_BOT_FIELD: BotFieldOptions = { count: 10, minWpm: 25, maxWpm: 110 };

const STRATEGY_WEIGHTS: [TargetStrategy, number][] = [
  ['random', 0.35],
  ['attackers', 0.25],
  ['weakest', 0.25],
  ['badges', 0.15],
];

/**
 * Erzeugt ein Bot-Feld aus dem Runden-Seed. Die WPM verteilen sich gleichmäßig
 * über den Bereich (mit etwas Zufall), damit jede Runde ein ähnliches Spektrum
 * von Anfängern bis Profis hat.
 */
export function generateBotProfiles(seed: number, opts: BotFieldOptions = DEFAULT_BOT_FIELD): BotProfile[] {
  const rng = createRng(deriveSeed(seed, 0xb07));
  const names = [...BOT_NAMES];
  // Namen mischen (Fisher-Yates)
  for (let i = names.length - 1; i > 0; i--) {
    const j = Math.floor(next(rng) * (i + 1));
    [names[i], names[j]] = [names[j], names[i]];
  }
  const profiles: BotProfile[] = [];
  for (let i = 0; i < opts.count; i++) {
    const slot = opts.count === 1 ? 0.5 : i / (opts.count - 1);
    const spread = (opts.maxWpm - opts.minWpm) / Math.max(1, opts.count);
    const wpm = Math.round(
      Math.min(opts.maxWpm, Math.max(opts.minWpm, opts.minWpm + slot * (opts.maxWpm - opts.minWpm) + gaussian(rng) * spread * 0.5)),
    );
    // Langsame Bots machen tendenziell mehr Fehler.
    const skill = (wpm - opts.minWpm) / (opts.maxWpm - opts.minWpm);
    const errorRate = Math.max(0.005, 0.055 - skill * 0.04 + gaussian(rng) * 0.008);
    let x = next(rng);
    let strategy: TargetStrategy = 'random';
    for (const [s, w] of STRATEGY_WEIGHTS) {
      x -= w;
      if (x < 0) {
        strategy = s;
        break;
      }
    }
    profiles.push({
      name: names[i % names.length] + (i >= names.length ? ` ${Math.floor(i / names.length) + 1}` : ''),
      wpm,
      errorRate,
      jitter: 0.2 + next(rng) * 0.2,
      wordDrift: 0.05 + next(rng) * 0.08,
      reactionMs: 140 + next(rng) * 220 - skill * 60,
      errorPauseMs: 180 + next(rng) * 250,
      // Bessere Bots wehren öfter ab und schicken schneller
      defenseRate: Math.min(0.85, 0.2 + skill * 0.55 + (next(rng) - 0.5) * 0.2),
      sendDelayMs: 1800 - skill * 1300 + next(rng) * 500,
      // Manche hauen früh kleine Angriffe raus, andere sparen auf einen großen
      attackAt: 2 + Math.floor(next(rng) * 5),
      reserve: 1 + Math.round(skill * 2),
      strategy,
    });
  }
  // Reihenfolge mischen, damit langsame und schnelle Bots nicht nach Seite sortiert sind.
  for (let i = profiles.length - 1; i > 0; i--) {
    const j = Math.floor(next(rng) * (i + 1));
    [profiles[i], profiles[j]] = [profiles[j], profiles[i]];
  }
  return profiles;
}

/** Tastatur-Nachbarn (QWERTZ) für realistische Vertipper. */
const ROWS = ['1234567890ß', 'qwertzuiopü', 'asdfghjklöä', 'yxcvbnm'];

export function neighborKey(ch: string, rng: { s: number }): string {
  const lower = ch.toLowerCase();
  for (let r = 0; r < ROWS.length; r++) {
    const c = ROWS[r].indexOf(lower);
    if (c < 0) continue;
    const opts: string[] = [];
    if (c > 0) opts.push(ROWS[r][c - 1]);
    if (c < ROWS[r].length - 1) opts.push(ROWS[r][c + 1]);
    if (r > 0 && ROWS[r - 1][c]) opts.push(ROWS[r - 1][c]);
    if (r < ROWS.length - 1 && ROWS[r + 1][c]) opts.push(ROWS[r + 1][c]);
    const k = pick(rng, opts);
    return ch === lower ? k : k.toUpperCase();
  }
  // Groß/klein vertauscht ist auch ein typischer Fehler.
  return ch === ch.toLowerCase() ? ch.toUpperCase() : ch.toLowerCase();
}
