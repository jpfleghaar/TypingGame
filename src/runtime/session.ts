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
import { GameRunner } from './GameRunner';

export type Language = 'de' | 'en';
export const WORD_DATA: Record<Language, WordData> = { de: de as WordData, en: en as WordData };
export const VOCAB = vocab as unknown as VocabData;

/**
 * Spielmodi:
 * - royale:   Battle Royale gegen Bots
 * - calm:     allein, ohne Müll, gemächliches Tempo (z. B. zum Lernen)
 * - practice: allein mit der eigenen Übungsliste
 */
export type GameMode = 'royale' | 'calm' | 'practice';

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
  /** Profile der Bots, Index = playerId - 1 (für Debug-Anzeige). */
  botProfiles: BotProfile[];
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

export function createSession(settings: SessionSettings, configOverride?: GameConfig): Session {
  const config = configOverride ?? (settings.mode === 'royale' ? DEFAULT_CONFIG : CALM_CONFIG);
  const data = WORD_DATA[settings.language];
  let bank: WordBank;
  let themeLabel: string;
  if (settings.mode === 'practice') {
    bank = practiceBank(settings.language, settings.practiceWords ?? []);
    themeLabel = 'Übungsliste';
  } else if (settings.learn) {
    const themeId = resolveThemeId(VOCAB, settings.theme, settings.seed);
    bank = buildLearnBank(VOCAB, settings.language, themeId);
    const label = themeId === 'mixed' ? 'Gemischt' : VOCAB.themes[themeId].label.de;
    themeLabel = `${settings.language === 'de' ? 'Deutsch' : 'Englisch'} lernen · ${label}`;
  } else {
    const themeId = resolveThemeId(data, settings.theme, settings.seed);
    bank = buildWordBank(data, themeId);
    themeLabel = themeId === 'mixed' ? 'Gemischt' : data.themes[themeId].label;
  }

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
