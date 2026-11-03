/**
 * Themes: Farben, Texte und alle visuellen Werte an einer Stelle.
 *
 * Ein Theme beschreibt nur die Darstellung. Die Spiellogik weiß davon nichts.
 * Neue Themes (oder Levels mit eigenem Theme) entstehen, indem man hier einen
 * weiteren Eintrag anlegt; `renderer` wählt die Effekt-Engine dazu.
 */

export type ThemeId = 'classic' | 'datanet';

/** Farbe als [r, g, b] (0–255), damit Canvas beliebige Transparenzen bilden kann. */
export type Rgb = readonly [number, number, number];

export interface Palette {
  bg: Rgb;
  panel: Rgb;
  panel2: Rgb;
  line: Rgb;
  text: Rgb;
  muted: Rgb;
  /** Akzent für "gut": Combo, getippte Buchstaben, eigenes Ziel. */
  good: Rgb;
  /** Gefahr: eingehender Müll, Überlauf. */
  danger: Rgb;
  warn: Rgb;
  /** Farbe der Müllwörter im Stapel. */
  garbage: Rgb;
  /** Normale (noch nicht aktive) Wörter im Stapel. */
  word: Rgb;
  /** Hintergrund hinter dem Text – bei Datennetz leicht durchscheinend. */
  stackBg: Rgb;
  stackBgAlpha: number;
}

/** Texte, die das Theme umbenennt (z. B. "Müll" → "Spam"). */
export interface ThemeTexts {
  /** Überschrift über dem eigenen Stapel; leer = keine. */
  inbox: string;
  /** Label am Warnbalken. */
  incoming: string;
  /** Kleines Label vor Müllwörtern; leer = nur Symbol. */
  garbageTag: string;
  /** Überschrift beim eigenen K.O. */
  koSelf: string;
  /** Label auf der Karte eines ausgeschiedenen Gegners. */
  koOpponent: string;
}

/** Werte für die Platinen-/Datennetz-Darstellung. */
export interface NetValues {
  grid: { size: number; alpha: number; driftPxPerSec: number };
  trace: {
    width: number;
    alpha: number;
    /** Länge der 45°-Abschrägung an Knicken. */
    chamfer: number;
    /** Abstand paralleler Bahnen. */
    laneSpacing: number;
    padRadius: number;
    /** Helligkeit der Bahnen zum eigenen Knoten bei sehr hohem Tempo (zusätzlich). */
    hotBoost: number;
  };
  chip: { size: number; pins: number };
  traffic: {
    /** Lichtpunkte pro Bahn bei 0 WPM bzw. zusätzlich pro 10 WPM. */
    baseDensity: number;
    densityPer10Wpm: number;
    /** Geschwindigkeit in px/s bei 0 WPM bzw. zusätzlich pro 10 WPM. */
    baseSpeed: number;
    speedPer10Wpm: number;
    dotRadius: number;
    alpha: number;
    /** Ab diesen WPM leuchten die Bahnen zum eigenen Knoten heller. */
    hotWpm: number;
    poolSize: number;
  };
  packet: {
    /** Flugzeit eines Pakets (wird je nach Weglänge zwischen min und max gewählt). */
    minMs: number;
    maxMs: number;
    radius: number;
    /** Zusätzlicher Radius pro Müllwort. */
    radiusPerGarbage: number;
    /** Ab dieser Menge fliegen mehrere Impulse hintereinander. */
    trailLength: number;
    poolSize: number;
  };
  /** Pulsfrequenz der Bahn eines eingehenden Angriffs. */
  incomingPulseHz: number;
  ko: { flickerMs: number; fadeMs: number };
  badges: { dotRadius: number; maxDots: number };
  firewall: {
    /** Maximale Eindringtiefe als Anteil der kürzeren Bildschirmseite. */
    maxDepth: number;
    /** Ab so vielen Spielern beginnt die Zone zu schrumpfen (Anteil der Teilnehmer). */
    startAtAliveShare: number;
    edgeWidth: number;
    darkness: number;
  };
  combo: { frameWidth: number; pulseMs: number };
}

export interface ThemeDef {
  id: ThemeId;
  label: string;
  /** Effekt-Engine: 'classic' (Sterne/Kometen) oder 'net' (Platine). */
  renderer: 'classic' | 'net';
  /** Musikstil der AudioEngine. */
  music: 'classic' | 'datanet';
  palette: Palette;
  texts: ThemeTexts;
  net: NetValues;
}

const NET_DEFAULTS: NetValues = {
  grid: { size: 26, alpha: 0.05, driftPxPerSec: 3 },
  trace: { width: 1.6, alpha: 0.22, chamfer: 10, laneSpacing: 9, padRadius: 3.2, hotBoost: 0.25 },
  chip: { size: 46, pins: 6 },
  traffic: {
    baseDensity: 0.6,
    densityPer10Wpm: 0.35,
    baseSpeed: 28,
    speedPer10Wpm: 22,
    dotRadius: 1.5,
    alpha: 0.35,
    hotWpm: 70,
    poolSize: 600,
  },
  packet: { minMs: 500, maxMs: 800, radius: 3.5, radiusPerGarbage: 1.4, trailLength: 0.18, poolSize: 160 },
  incomingPulseHz: 2.2,
  ko: { flickerMs: 600, fadeMs: 900 },
  badges: { dotRadius: 2.4, maxDots: 12 },
  firewall: { maxDepth: 0.16, startAtAliveShare: 0.6, edgeWidth: 2, darkness: 0.86 },
  combo: { frameWidth: 2, pulseMs: 380 },
};

export const THEMES: Record<ThemeId, ThemeDef> = {
  classic: {
    id: 'classic',
    label: 'Klassisch',
    renderer: 'classic',
    music: 'classic',
    palette: {
      bg: [11, 14, 20],
      panel: [19, 24, 36],
      panel2: [26, 32, 48],
      line: [38, 46, 66],
      text: [233, 237, 245],
      muted: [138, 147, 168],
      good: [62, 230, 168],
      danger: [255, 84, 112],
      warn: [255, 181, 71],
      garbage: [255, 179, 192],
      word: [195, 202, 217],
      stackBg: [14, 18, 27],
      stackBgAlpha: 1,
    },
    texts: { inbox: '', incoming: 'Müll', garbageTag: '', koSelf: 'K.O.!', koOpponent: 'K.O.' },
    net: NET_DEFAULTS,
  },
  datanet: {
    id: 'datanet',
    label: 'Datennetz',
    renderer: 'net',
    music: 'datanet',
    palette: {
      bg: [7, 8, 16],
      panel: [14, 16, 32],
      panel2: [21, 24, 48],
      line: [38, 42, 78],
      text: [232, 236, 255],
      muted: [128, 136, 176],
      good: [52, 227, 255],
      danger: [255, 61, 154],
      warn: [255, 200, 87],
      garbage: [255, 150, 200],
      word: [196, 202, 232],
      stackBg: [6, 7, 15],
      stackBgAlpha: 0.84,
    },
    texts: {
      inbox: 'Posteingang',
      incoming: 'Eingehend',
      garbageTag: 'SPAM',
      koSelf: 'Postfach voll',
      koOpponent: 'Verbindung getrennt',
    },
    net: NET_DEFAULTS,
  },
};

export const DEFAULT_THEME: ThemeId = 'datanet';

export function rgba(c: Rgb, a: number): string {
  return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;
}

const hex = (c: Rgb) => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;

/** Überträgt die Palette als CSS-Variablen auf <html> und setzt data-theme. */
export function applyTheme(theme: ThemeDef, root: HTMLElement = document.documentElement): void {
  const p = theme.palette;
  const vars: Record<string, string> = {
    '--bg': hex(p.bg),
    '--panel': hex(p.panel),
    '--panel-2': hex(p.panel2),
    '--line': hex(p.line),
    '--text': hex(p.text),
    '--muted': hex(p.muted),
    '--good': hex(p.good),
    '--danger': hex(p.danger),
    '--warn': hex(p.warn),
    '--garbage': hex(p.garbage),
    '--word': hex(p.word),
    '--stack-bg': rgba(p.stackBg, p.stackBgAlpha),
    '--good-rgb': p.good.join(', '),
    '--danger-rgb': p.danger.join(', '),
  };
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.dataset.theme = theme.id;
}
