import {
  capacity,
  chainLength,
  load,
  other,
  ticksToMs,
  waterline,
  type GameState,
  type ShipId,
  type TypingState,
} from '../core';
import { el, escapeHtml, formatTime } from './dom';

interface Section {
  root: HTMLElement;
  list: HTMLUListElement;
  stats: HTMLElement;
  corner: HTMLElement;
  sig: string;
}

/**
 * Textlisten unter der Szene. Bewegen sich nie und haben keine Effekte darüber;
 * einzige Animation: der falsch getippte Buchstabe wackelt.
 */
export class HudView {
  readonly root: HTMLElement;
  private own: Section;
  private enemy: Section;
  private driftList: HTMLUListElement;
  private driftSig = '';
  private topbar: HTMLElement;

  constructor(private viewer: ShipId) {
    this.topbar = el('div', 'topbar');
    this.own = this.section('own', 'Deine Fracht');
    this.enemy = this.section('enemy', 'Gegner');
    const drift = el('section', 'drift');
    drift.append(el('header', '', 'Treibgut'));
    this.driftList = el('ul') as HTMLUListElement;
    drift.append(this.driftList);
    const lists = el('div', 'lists');
    lists.append(this.own.root, drift, this.enemy.root);
    this.root = el('div', 'hud');
    this.root.append(lists);
  }

  get topbarEl(): HTMLElement {
    return this.topbar;
  }

  private section(kind: string, title: string): Section {
    const root = el('section', `cargo ${kind}`);
    const header = el('header');
    const stats = el('span', 'stats');
    header.append(el('span', 'title', title), stats);
    const corner = el('div', 'corner');
    const list = el('ul') as HTMLUListElement;
    root.append(corner, header, list);
    return { root, list, stats, corner, sig: '' };
  }

  update(state: GameState, info: { round: number; wins: [number, number] }): void {
    const me = this.viewer;
    const opp = other(me);
    this.topbar.innerHTML = `
      <span>Runde ${info.round}</span>
      <span class="score">${info.wins[me]} : ${info.wins[opp]}</span>
      <span>${formatTime(ticksToMs(state.tick))}</span>`;
    this.updateCargo(state, me, this.own, true);
    this.updateCargo(state, opp, this.enemy, false);
    this.updateDrift(state);
  }

  private updateCargo(state: GameState, id: ShipId, sec: Section, mine: boolean): void {
    const s = state.ships[id];
    const ratio = waterline(state, s);
    const pct = Math.round(ratio * 100);
    const danger = ratio > state.cfg.catchup.threshold;
    sec.stats.className = `stats${danger ? ' danger' : ''}`;
    sec.stats.textContent = `${Math.round(load(s))} / ${Math.round(capacity(state, s))} · ${pct} %`;
    sec.corner.textContent = s.relief > 0 ? `Lenzpumpe −${s.relief}` : '';

    const ty = s.typing;
    const sig = JSON.stringify([s.cargo.map((c) => [c.id, c.weight]), ty]);
    if (sig === sec.sig) return;
    sec.sig = sig;
    sec.list.innerHTML = s.cargo
      .map((c) => {
        const active = ty.target?.kind === 'cargo' && ty.target.id === c.id;
        const last = chainLength(c.chain);
        const stages = '●'.repeat(c.stage) + '○'.repeat(last - c.stage);
        return `<li class="${active ? 'active' : ''}${c.stage >= last ? ' final' : ''}">
          <span class="word">${active || !mine ? wordHtml(c.text, active ? ty : null) : escapeHtml(c.text)}</span>
          <span class="meta"><span class="stage">${stages}</span><span class="w">${Math.round(c.weight)}</span></span>
        </li>`;
      })
      .join('');
    fitList(sec.list, mine ? ['', 'dense', 'denser', 'cols'] : ['', 'cols']);
  }

  private updateDrift(state: GameState): void {
    const ty = state.ships[this.viewer].typing;
    const sig = JSON.stringify([state.drift.map((d) => d.id), ty]);
    if (sig !== this.driftSig) {
      this.driftSig = sig;
      this.driftList.innerHTML = state.drift
        .map((d) => {
          const active = ty.target?.kind === 'drift' && ty.target.id === d.id;
          return `<li data-id="${d.id}" class="${active ? 'active' : ''}">
            <span class="word">${wordHtml(d.word.text, active ? ty : null)}</span>
            <span class="life"><span></span></span>
          </li>`;
        })
        .join('');
    }
    // Restzeit-Balken jeden Frame aktualisieren, ohne die Liste neu zu bauen
    for (const d of state.drift) {
      const bar = this.driftList.querySelector<HTMLElement>(`li[data-id="${d.id}"] .life span`);
      if (bar) bar.style.width = `${Math.max(0, (d.expireTick - state.tick) / (d.expireTick - d.spawnTick)) * 100}%`;
    }
  }
}

/** Wählt die erste Dichtestufe, bei der die Liste ohne Überlauf in ihren Kasten passt. */
function fitList(list: HTMLElement, levels: string[]): void {
  const box = list.parentElement!;
  for (const level of levels) {
    list.className = level;
    if (box.scrollHeight <= box.clientHeight + 1) return;
  }
}

/** Wort mit gefärbten getippten Buchstaben und ggf. wackelndem Fehlbuchstaben. */
function wordHtml(text: string, ty: TypingState | null): string {
  if (!ty || ty.typed === 0) {
    return escapeHtml(text) + (ty?.error ? `<span class="err">${escapeHtml(ty.error)}</span>` : '');
  }
  const done = escapeHtml(text.slice(0, ty.typed));
  const rest = escapeHtml(text.slice(ty.typed));
  const err = ty.error ? `<span class="err">${escapeHtml(ty.error)}</span>` : '';
  const hint = ty.error ? `<span class="fix-hint">⌫ Backspace</span>` : '';
  return `<span class="typed">${done}</span>${err}<span class="rest">${rest}</span>${hint}`;
}
