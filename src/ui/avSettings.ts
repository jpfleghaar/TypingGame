/** Sound- und Effekt-Einstellungen, im Browser gespeichert. */
export interface AvSettings {
  volume: number;
  muted: boolean;
  reducedFx: boolean;
}

const KEY = 'typing-royale.av.v1';
const DEFAULTS: AvSettings = { volume: 0.6, muted: false, reducedFx: false };

export function loadAv(): AvSettings {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<AvSettings>) };
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
