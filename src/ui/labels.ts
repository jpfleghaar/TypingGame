import type { GameConfig, TargetStrategy } from '../core';

export const STRATEGY_LABEL: Record<TargetStrategy, string> = {
  random: 'Zufall',
  attackers: 'Angreifer',
  weakest: 'Schwache',
  badges: 'K.O.-Jäger',
  manual: 'Manuell',
};

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Combo-Bereiche mit Wörtern pro Punkt, z. B. [{ range: '0–9', words: 3 }, …, { range: 'ab 20', words: 1 }]. */
export function pointRateRanges(cfg: GameConfig): { range: string; words: number }[] {
  const rates = [...cfg.points.rates].sort((a, b) => a.minCombo - b.minCombo);
  return rates.map((r, i) => {
    const nextMin = rates[i + 1]?.minCombo;
    return { range: nextMin === undefined ? `ab ${r.minCombo}` : `${r.minCombo}–${nextMin - 1}`, words: r.words };
  });
}

/** Kurzform für Fließtext: "Combo 0–9: 3 Wörter, 10–19: 2 Wörter, ab 20: 1 Wort pro Punkt". */
export function pointRatesText(cfg: GameConfig): string {
  const parts = pointRateRanges(cfg).map((r) => `${r.range}: ${r.words} ${r.words === 1 ? 'Wort' : 'Wörter'}`);
  return `Combo ${parts.join(', ')} pro Punkt`;
}

/** "1 Punkt" / "2 Punkte" */
export function pointsLabel(n: number): string {
  return `${n} ${n === 1 ? 'Punkt' : 'Punkte'}`;
}
