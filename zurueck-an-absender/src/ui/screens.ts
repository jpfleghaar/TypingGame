import { UPGRADES, other, type MatchState, type RoundSummary, type ShipId } from '../core';
import { BOT_PROFILES, type BotLevel } from '../controllers/botProfiles';
import { el, escapeHtml, formatTime } from './dom';

const pct = (v: number | null) => (v === null ? '–' : `${Math.round(v * 100)} %`);
const upgradeName = (id: string) => UPGRADES.find((u) => u.id === id)?.name ?? id;

/** Vollflächiges Overlay für Start, Rundenübersicht und Match-Ende. */
export class Overlay {
  readonly root = el('div', 'overlay');
  private onKey: ((e: KeyboardEvent) => void) | null = null;

  constructor() {
    this.root.hidden = true;
  }

  show(html: string, keys: Record<string, () => void>): void {
    this.hide();
    this.root.innerHTML = `<div class="panel">${html}</div>`;
    this.root.hidden = false;
    this.onKey = (e) => {
      const fn = keys[e.key];
      if (!fn) return;
      e.preventDefault();
      this.hide();
      fn();
    };
    window.addEventListener('keydown', this.onKey);
    for (const [key, fn] of Object.entries(keys)) {
      this.root.querySelector<HTMLElement>(`[data-key="${key}"]`)?.addEventListener('click', () => {
        this.hide();
        fn();
      });
    }
  }

  hide(): void {
    this.root.hidden = true;
    if (this.onKey) window.removeEventListener('keydown', this.onKey);
    this.onKey = null;
  }
}

export function startScreenHtml(current: BotLevel): string {
  const levels: [string, BotLevel][] = [['1', 'easy'], ['2', 'medium'], ['3', 'hard']];
  return `
    <h1>Zurück an Absender</h1>
    <p class="lead">Tippe die Wörter von deinem Boot ab, um sie zum Gegner zu werfen. Dabei werden sie länger.
    Wessen Wasserlinie zuerst das Deck erreicht, sinkt. Best of 3.</p>
    <ul class="keys">
      <li><kbd>Buchstaben</kbd> Wort anvisieren und tippen</li>
      <li><kbd>Backspace</kbd> Tippfehler korrigieren (muss sein, bevor es weitergeht)</li>
      <li><kbd>Esc</kbd> Wort abbrechen</li>
      <li><kbd>F2</kbd> Debug</li>
    </ul>
    <p class="lead">Gegner wählen:</p>
    <div class="levels">
      ${levels
        .map(([key, l]) => {
          const p = BOT_PROFILES[l];
          return `<button data-key="${key}" class="${l === current ? 'current' : ''}">
            <kbd>${key}</kbd> ${p.name}<small>~${p.wpm} WPM</small></button>`;
        })
        .join('')}
    </div>
    <p class="hint"><kbd>Enter</kbd> startet mit ${BOT_PROFILES[current].name}</p>`;
}

function statRows(sum: RoundSummary, me: ShipId): string {
  const a = sum.ships[me];
  const b = sum.ships[other(me)];
  const row = (label: string, x: string, y: string) =>
    `<tr><th>${label}</th><td>${x}</td><td>${y}</td></tr>`;
  const ups = (l: string[]) => (l.length ? l.map(upgradeName).join(', ') : '–');
  return `
    <table class="stats">
      <thead><tr><th></th><th>Du</th><th>Bot</th></tr></thead>
      <tbody>
        ${row('WPM', a.wpm.toFixed(0), b.wpm.toFixed(0))}
        ${row('Genauigkeit', pct(a.accuracy), pct(b.accuracy))}
        ${row('Geworfene Wörter', String(a.thrown), String(b.thrown))}
        ${row('Gefischtes Treibgut', String(a.fished), String(b.fished))}
        ${row('Längstes Wort', escapeHtml(a.longestThrown || '–'), escapeHtml(b.longestThrown || '–'))}
        ${row('Upgrades', ups(a.upgrades), ups(b.upgrades))}
      </tbody>
    </table>`;
}

export function roundSummaryHtml(m: MatchState, me: ShipId, matchOver: boolean): string {
  const sum = m.history[m.history.length - 1];
  const won = sum.winner === me;
  const title = matchOver
    ? won ? 'Match gewonnen!' : 'Match verloren'
    : won ? `Runde ${sum.round} gewonnen` : `Runde ${sum.round} verloren`;
  return `
    <h1 class="${won ? 'good' : 'danger'}">${title}</h1>
    <p class="lead">Stand ${m.wins[me]} : ${m.wins[other(me)]} · Dauer ${formatTime(sum.durationMs)}</p>
    ${statRows(sum, me)}
    <button data-key="Enter">${matchOver ? 'Zurück zum Start' : 'Nächste Runde'} <kbd>Enter</kbd></button>`;
}
