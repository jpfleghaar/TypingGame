/**
 * Zentrale Balancing-Config. Alle Zeiten in Millisekunden; die Logik rechnet
 * intern in Ticks (siehe msToTicks).
 */
export interface ComboThreshold {
  combo: number;
  garbage: number;
}

export interface GameConfig {
  /** Countdown vor Rundenbeginn in Sekunden (nur Anzeige, die Simulation startet danach bei Tick 0). */
  countdownSeconds: number;
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
    /** Form der Rampe: 1 = linear, >1 = am Anfang gemütlich, gegen Ende steiler. */
    rampCurve: number;
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

  /**
   * Angriffe landen in einem Pool: Jede Leertaste schickt EIN Wort daraus,
   * ohne Leertaste geht alle `autoSendIntervalMs` automatisch ein Wort raus.
   * 0 = der ganze Pool geht sofort in einem Angriff raus (klassisch, z. B. für Tests).
   */
  attack: {
    autoSendIntervalMs: number;
  };

  /** Abwehr mit Tab: eingehende Müllwörter gegen Combo-Punkte abwehren. */
  defense: {
    /** So viele Combo-Punkte kostet ein abgewehrtes Wort. */
    comboCostPerWord: number;
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
    /*
     * Müll = die längsten Wörter aus dem Stapel des Angreifers. Sie werden
     * VERSCHOBEN (verlassen den Stapel des Angreifers). Das aktive Wort bleibt.
     * Hat der Angreifer zu wenige, wird mit langen Wörtern aus der Liste aufgefüllt.
     */
    /** Ab so wenigen lebenden Spielern (Finale) wird die Groß-/Kleinschreibung gemischt. */
    finaleAtAlive: number;
    /** So viele Buchstaben tauschen im Finale je Müllwort die Groß-/Kleinschreibung. */
    finaleCaseFlips: number;
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
  countdownSeconds: 5,
  tickRate: 60,
  stackMax: 12,
  initialWords: 3,

  spawn: {
    startIntervalMs: 5900,
    endIntervalMs: 920,
    rampDurationMs: 4 * 60_000,
    rampCurve: 2.5,
    overtimeFactorPerMinute: 0.8,
    absoluteMinIntervalMs: 500,
  },

  difficulty: {
    start: { short: 0.6, medium: 0.35, long: 0.05 },
    end: { short: 0.25, medium: 0.45, long: 0.3 },
  },

  attack: {
    autoSendIntervalMs: 5000,
  },

  defense: {
    comboCostPerWord: 1,
  },

  combo: {
    thresholds: [
      { combo: 3, garbage: 1 },
      { combo: 6, garbage: 2 },
      { combo: 10, garbage: 3 },
    ],
    repeatEvery: 8,
    repeatGarbage: 2,
  },

  garbage: {
    warningMs: 3000,
    finaleAtAlive: 2,
    finaleCaseFlips: 2,
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
