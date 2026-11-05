import {
  buildLearnBank,
  buildWordBank,
  createGame,
  DEFAULT_CONFIG,
  resolveThemeId,
  type GameConfig,
  type PlayerSetup,
  type VocabData,
  type WordBank,
  type WordData,
} from '../core';
import type { Controller } from '../controllers/Controller';
import { BotController } from '../controllers/BotController';
import { generateBotProfiles, type BotProfile } from '../controllers/botProfiles';
import { LocalController } from '../controllers/LocalController';
import de from '../data/words/de.json';
import en from '../data/words/en.json';
import vocab from '../data/words/vocab.json';
import type { NetFeed } from '../net/NetClient';
import { GameRunner } from './GameRunner';

export type Language = 'de' | 'en';
export const WORD_DATA: Record<Language, WordData> = { de: de as WordData, en: en as WordData };
export const VOCAB = vocab as unknown as VocabData;

/**
 * Spielmodi:
 * - royale:   Battle Royale gegen Bots
 * - endless:  allein, Wörter kommen immer schneller – wie lange hältst du durch? (Rekord)
 * - calm:     allein, ohne Müll, gemächliches Tempo (z. B. zum Lernen)
 * - practice: allein mit der eigenen Übungsliste
 */
export type GameMode = 'royale' | 'endless' | 'calm' | 'practice';

/** Tempo für Runden ohne Gegner: deutlich langsamer, steigt nur sanft. */
export const CALM_CONFIG: GameConfig = {
  ...DEFAULT_CONFIG,
  spawn: {
    ...DEFAULT_CONFIG.spawn,
    startIntervalMs: 6000,
    endIntervalMs: 2600,
    rampDurationMs: 8 * 60_000,
    rampCurve: 1.5,
  },
};

/**
 * Endlos: zügiger Start, nach 2 Minuten wird es pro Minute 15 % schneller – ohne
 * Obergrenze, die irgendwann jeden überfordert. Simuliert (Median): 30 WPM ≈ 1:50,
 * 50 ≈ 2:30, 70 ≈ 3:30, 90 ≈ 4:25, 110 ≈ 5:30.
 */
export const ENDLESS_CONFIG: GameConfig = {
  ...DEFAULT_CONFIG,
  spawn: {
    startIntervalMs: 2800,
    endIntervalMs: 1500,
    rampDurationMs: 2 * 60_000,
    rampCurve: 1.3,
    overtimeFactorPerMinute: 0.85,
    absoluteMinIntervalMs: 250,
  },
};

export function configFor(mode: GameMode): GameConfig {
  return mode === 'royale' ? DEFAULT_CONFIG : mode === 'endless' ? ENDLESS_CONFIG : CALM_CONFIG;
}

export interface SessionSettings {
  mode: GameMode;
  /** Sprache, in der getippt wird. */
  language: Language;
  /** Lernmodus: Vokabel-Wortschatz, Übersetzung wird neben jedem Wort angezeigt. */
  learn?: boolean;
  /** Themen-ID, "mixed" oder "random". */
  theme: string;
  seed: number;
  botCount: number;
  playerName: string;
  /** Nur im Übungsmodus: die zu übenden Wörter. */
  practiceWords?: string[];
}

export interface Session {
  settings: SessionSettings;
  runner: GameRunner;
  humanId: number;
  bank: WordBank;
  themeLabel: string;
  /** Profile der Bots, Index = playerId - firstBotId (für Debug-Anzeige). */
  botProfiles: BotProfile[];
  /** Spieler-ID des ersten Bots (Mehrspieler: nach allen Menschen). */
  firstBotId?: number;
  /** Nur im Mehrspieler: Befehle vom Server und die eigene Tastatur. */
  net?: { feed: NetFeed; local: LocalController };
}

/** Wortquelle aus einer freien Liste (Übungsmodus). */
function practiceBank(language: string, words: string[]): WordBank {
  const unique = [...new Set(words)];
  return {
    language,
    themeId: 'practice',
    short: unique.filter((w) => w.length <= 5),
    medium: unique.filter((w) => w.length > 5 && w.length <= 9),
    long: unique.filter((w) => w.length > 9),
    garbageBases: unique,
    compoundParts: unique,
  };
}

/** Wortquelle und Anzeigename des Themas für eine Runde. */
export function buildBank(settings: Pick<SessionSettings, 'mode' | 'language' | 'learn' | 'theme' | 'seed' | 'practiceWords'>): {
  bank: WordBank;
  themeLabel: string;
} {
  const data = WORD_DATA[settings.language];
  if (settings.mode === 'practice') {
    return { bank: practiceBank(settings.language, settings.practiceWords ?? []), themeLabel: 'Übungsliste' };
  }
  if (settings.learn) {
    const themeId = resolveThemeId(VOCAB, settings.theme, settings.seed);
    const label = themeId === 'mixed' ? 'Gemischt' : VOCAB.themes[themeId].label.de;
    return {
      bank: buildLearnBank(VOCAB, settings.language, themeId),
      themeLabel: `${settings.language === 'de' ? 'Deutsch' : 'Englisch'} lernen · ${label}`,
    };
  }
  const themeId = resolveThemeId(data, settings.theme, settings.seed);
  return { bank: buildWordBank(data, themeId), themeLabel: themeId === 'mixed' ? 'Gemischt' : data.themes[themeId].label };
}

export function createSession(settings: SessionSettings, configOverride?: GameConfig): Session {
  const config = configOverride ?? configFor(settings.mode);
  const { bank, themeLabel } = buildBank(settings);

  const botCount = settings.mode === 'royale' ? settings.botCount : 0;
  const botProfiles = generateBotProfiles(settings.seed, { count: botCount, minWpm: 25, maxWpm: 110 });
  const players: PlayerSetup[] = [
    { name: settings.playerName, strategy: 'random' },
    ...botProfiles.map((b) => ({ name: b.name, strategy: b.strategy })),
  ];

  const state = createGame({ seed: settings.seed, players, bank, config });
  const humanId = 0;
  const controllers: Controller[] = [
    new LocalController(humanId),
    ...botProfiles.map((b, i) => new BotController(i + 1, b, settings.seed)),
  ];
  return { settings, runner: new GameRunner(state, bank, controllers), humanId, bank, themeLabel, botProfiles };
}
