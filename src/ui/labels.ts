import type { TargetStrategy } from '../core';

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
