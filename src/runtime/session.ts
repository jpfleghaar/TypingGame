import {
  buildWordBank,
  createGame,
  DEFAULT_CONFIG,
  resolveThemeId,
  type GameConfig,
  type PlayerSetup,
  type WordBank,
  type WordData,
} from '../core';
import type { Controller } from '../controllers/Controller';
import { BotController } from '../controllers/BotController';
import { generateBotProfiles, type BotProfile } from '../controllers/botProfiles';
import { LocalController } from '../controllers/LocalController';
import de from '../data/words/de.json';
import en from '../data/words/en.json';
import { GameRunner } from './GameRunner';

export type Language = 'de' | 'en';
export const WORD_DATA: Record<Language, WordData> = { de: de as WordData, en: en as WordData };

export interface SessionSettings {
  mode: 'royale' | 'practice';
  language: Language;
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

export function createSession(settings: SessionSettings, config: GameConfig = DEFAULT_CONFIG): Session {
  const data = WORD_DATA[settings.language];
  let bank: WordBank;
  let themeLabel: string;
  if (settings.mode === 'practice') {
    bank = practiceBank(settings.language, settings.practiceWords ?? []);
    themeLabel = 'Übungsliste';
  } else {
    const themeId = resolveThemeId(data, settings.theme, settings.seed);
    bank = buildWordBank(data, themeId);
    themeLabel = themeId === 'mixed' ? 'Gemischt' : data.themes[themeId].label;
  }

  const botCount = settings.mode === 'practice' ? 0 : settings.botCount;
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
