export type BotLevel = 'easy' | 'medium' | 'hard';

export interface BotProfile {
  level: BotLevel;
  name: string;
  /** Grundtempo in Wörtern pro Minute (1 Wort = 5 Anschläge). */
  wpm: number;
  /** Wahrscheinlichkeit pro Anschlag, sich zu vertippen. */
  errorRate: number;
  /** Streuung je Anschlag (Anteil des Grundtempos). */
  jitter: number;
  /** Wie stark das Tempo über die Zeit schwankt (Tagesform, Konzentration). */
  drift: number;
  /** Bedenkzeit vor einem neuen Wort. */
  thinkMs: number;
  /** Zeit, bis ein Tippfehler bemerkt und gelöscht wird. */
  noticeMs: number;
  /** Lust auf Treibgut (0..1). */
  driftEagerness: number;
  /** Wie oft lange Wörter für viel Gewicht beim Gegner gewählt werden (0..1). */
  greed: number;
}

/** Alle Bot-Werte an einer Stelle, wie die übrige Balance in config.ts. */
export const BOT_PROFILES: Record<BotLevel, BotProfile> = {
  easy: {
    level: 'easy',
    name: 'Leicht',
    wpm: 30,
    errorRate: 0.06,
    jitter: 0.35,
    drift: 0.18,
    thinkMs: 750,
    noticeMs: 450,
    driftEagerness: 0.35,
    greed: 0.25,
  },
  medium: {
    level: 'medium',
    name: 'Mittel',
    wpm: 55,
    errorRate: 0.04,
    jitter: 0.28,
    drift: 0.14,
    thinkMs: 480,
    noticeMs: 320,
    driftEagerness: 0.6,
    greed: 0.4,
  },
  hard: {
    level: 'hard',
    name: 'Schwer',
    wpm: 85,
    errorRate: 0.025,
    jitter: 0.2,
    drift: 0.1,
    thinkMs: 280,
    noticeMs: 220,
    driftEagerness: 0.85,
    greed: 0.55,
  },
};
