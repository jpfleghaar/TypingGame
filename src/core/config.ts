/**
 * Zentrale Balancing-Config. Alle Zeiten in Millisekunden; die Logik rechnet
 * intern in Ticks (siehe msToTicks).
 */
export interface ComboThreshold {
  combo: number;
  garbage: number;
}

export interface GameConfig {
  /** Simulations-Ticks pro Sekunde. */
  tickRate: number;
  /** Maximale Zeilen im Stapel. Ein Wort mehr = K.O. */
  stackMax: number;
  /** Wörter, die zu Rundenbeginn bereits im Stapel liegen. */
  initialWords: number;

  spawn: {
    /** Abstand zwischen neuen Wörtern zu Rundenbeginn. */
    startIntervalMs: number;
    /** Abstand nach Ende der Rampe. */
    endIntervalMs: number;
    /** Dauer, in der das Tempo von start auf end steigt. */
    rampDurationMs: number;
    /** Danach (Verlängerung) sinkt das Intervall pro Minute um diesen Faktor. */
    overtimeFactorPerMinute: number;
    /** Untergrenze, egal wie lange die Runde dauert. */
    absoluteMinIntervalMs: number;
  };

  /** Anteil kurz/mittel/lang am Rundenbeginn und am Ende der Rampe (wird linear interpoliert). */
  difficulty: {
    start: { short: number; medium: number; long: number };
    end: { short: number; medium: number; long: number };
  };

  combo: {
    /** Exakte Combo-Stufen, die einen Angriff auslösen. */
    thresholds: ComboThreshold[];
    /** Nach der höchsten Stufe: alle N weiteren Wörter ein Angriff ... */
    repeatEvery: number;
    /** ... mit dieser Müllmenge. */
    repeatGarbage: number;
  };

  garbage: {
    /** Vorwarnzeit, bevor Müll im Stapel landet. */
    warningMs: number;
    /** Wahrscheinlichkeit, dass ein Müllwort eine Zahl enthält. */
    digitChance: number;
    /** Wahrscheinlichkeit für ein Kompositum aus zwei Wörtern statt eines Basis-Müllworts. */
    compoundChance: number;
    /** Wahrscheinlichkeit, dass zusätzlich ein Buchstabe die Groß/Kleinschreibung tauscht. */
    caseFlipChance: number;
  };

  badges: {
    /** Abzeichen-Schwellen; bei Erreichen gilt der Bonus mit gleichem Index. */
    tiers: number[];
    bonus: number[];
    /** K.O.-Geber erhält Abzeichen des Opfers + diesen Wert. */
    koBonus: number;
    /** Nur wer in diesem Zeitfenster Müll beim Opfer gelandet hat, bekommt den K.O. */
    koCreditWindowMs: number;
  };

  targeting: {
    /** Strategie "Zufall": neues Ziel nach dieser Zeit. */
    randomRetargetMs: number;
    /** Strategie "Angreifer": zählt Angriffe der letzten N ms. */
    attackerMemoryMs: number;
  };

  words: {
    /** Kein Wort wiederholt sich innerhalb der letzten N Wörter. */
    noRepeatWindow: number;
  };

  problemWords: {
    /** Gewicht eines Fehlers relativ zu "doppelt so langsam wie üblich". */
    errorWeight: number;
    /** Ab diesem Score gilt ein Wort als Problemwort (1 = Durchschnitt). */
    minScore: number;
    maxEntries: number;
  };
}

export const DEFAULT_CONFIG: GameConfig = {
  tickRate: 60,
  stackMax: 12,
  initialWords: 3,

  spawn: {
    startIntervalMs: 3200,
    endIntervalMs: 1300,
    rampDurationMs: 4 * 60_000,
    overtimeFactorPerMinute: 0.8,
    absoluteMinIntervalMs: 500,
  },

  difficulty: {
    start: { short: 0.6, medium: 0.35, long: 0.05 },
    end: { short: 0.25, medium: 0.45, long: 0.3 },
  },

  combo: {
    thresholds: [
      { combo: 3, garbage: 1 },
      { combo: 6, garbage: 2 },
      { combo: 10, garbage: 3 },
    ],
    repeatEvery: 4,
    repeatGarbage: 3,
  },

  garbage: {
    warningMs: 3000,
    digitChance: 0.5,
    compoundChance: 0.6,
    caseFlipChance: 0.4,
  },

  badges: {
    tiers: [2, 6, 14, 30],
    bonus: [0.25, 0.5, 0.75, 1.0],
    koBonus: 1,
    koCreditWindowMs: 10_000,
  },

  targeting: {
    randomRetargetMs: 5000,
    attackerMemoryMs: 8000,
  },

  words: {
    noRepeatWindow: 50,
  },

  problemWords: {
    errorWeight: 0.75,
    minScore: 1.4,
    maxEntries: 20,
  },
};

export function msToTicks(ms: number, cfg: GameConfig): number {
  return Math.max(1, Math.round((ms * cfg.tickRate) / 1000));
}

export function ticksToMs(ticks: number, cfg: GameConfig): number {
  return (ticks * 1000) / cfg.tickRate;
}
