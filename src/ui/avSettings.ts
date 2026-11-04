import { DEFAULT_THEME, THEMES, type ThemeId } from '../theme/themes';

/** Darstellungs-, Sound- und Effekt-Einstellungen, im Browser gespeichert. */
export interface AvSettings {
  volume: number;
  muted: boolean;
  reducedFx: boolean;
  theme: ThemeId;
  /** 'center': Gegner links und rechts; 'split': Wörter links, Gegner rechts. */
  layout: 'center' | 'split';
}

const KEY = 'typing-royale.av.v1';
const DEFAULTS: AvSettings = { volume: 0.6, muted: false, reducedFx: false, theme: DEFAULT_THEME, layout: 'center' };

export function loadAv(): AvSettings {
  try {
    const s = { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<AvSettings>) };
    // Theme-Auswahl ist derzeit nicht im Menü: immer das Standard-Theme (Platine).
    // Das Feld bleibt für spätere Level mit eigenem Theme.
    if (!THEMES[s.theme] || s.theme !== DEFAULT_THEME) s.theme = DEFAULT_THEME;
    return s;
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveAv(s: AvSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* egal */
  }
}
