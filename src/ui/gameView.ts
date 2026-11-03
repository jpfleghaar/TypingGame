import { pendingGarbage, ticksToMs, wpm, type GameEvent, type GameState, type PlayerState, type Word } from '../core';
import type { FrameInfo } from '../runtime/GameRunner';
import { el, formatTime, STRATEGY_LABEL } from './labels';

interface OppCard {
  root: HTMLElement;
  bar: HTMLElement;
  badges: HTMLElement;
  status: HTMLElement;
}

/**
 * Schlichte DOM-Ansicht. Liest den State nur; Zustandsänderungen kommen
 * ausschließlich über Commands des LocalControllers.
 */
export class GameView {
  private stackEl = el('div', 'stack');
  private warnFill = el('i');
  private warnCount = el('span', 'warn-count');
  private hud = {
    combo: el('b'),
    wpm: el('b'),
    alive: el('b'),
    time: el('b'),
  };
  private strategyEl = el('strong');
  private targetEl = el('strong');
  private badgesEl = el('strong');
  private rows = new Map<number, HTMLElement>();
  private rowOrder = '';
  private activeId = -1;
  private activeCursor = -1;
  private opps = new Map<number, OppCard>();

  constructor(
    root: HTMLElement,
    private readonly humanId: number,
    state: GameState,
    themeLabel: string,
  ) {
    root.replaceChildren();
    const left = el('aside', 'opponents left');
    const right = el('aside', 'opponents right');
    const others = state.players.filter((p) => p.id !== humanId);
    others.forEach((p, i) => {
      const card = this.makeOpp(p);
      this.opps.set(p.id, card);
      (i < Math.ceil(others.length / 2) ? left : right).append(card.root);
    });

    const arena = el('main', 'arena');
    const hud = el('div', 'hud');
    const stat = (label: string, b: HTMLElement, cls = '') => {
      const s = el('div', `stat ${cls}`);
      s.append(b, el('small', undefined, label));
      return s;
    };
    hud.append(
      stat('Combo', this.hud.combo, 'combo'),
      stat('WPM', this.hud.wpm),
      stat(others.length ? 'Im Spiel' : 'Thema', this.hud.alive),
      stat('Zeit', this.hud.time),
    );
    if (!others.length) this.hud.alive.textContent = themeLabel;

    const targetLine = el('div', 'target-line');
    const t = el('span');
    t.append('Ziel: ', this.targetEl, ' · ', this.strategyEl);
    const b = el('span');
    b.append('Abzeichen: ', this.badgesEl);
    targetLine.append(t, b);

    const board = el('div', 'board');
    const warn = el('div', 'warn');
    warn.title = 'Eingehender Müll';
    warn.append(this.warnFill);
    const warnWrap = el('div');
    warnWrap.style.position = 'relative';
    warnWrap.style.display = 'grid';
    warnWrap.append(warn, this.warnCount);
    board.append(warnWrap, this.stackEl);

    const hint = el('div', 'hint');
    hint.innerHTML = `Thema: ${themeLabel} · <kbd>Tab</kbd> Strategie · <kbd>Esc</kbd> Abbrechen`;
    arena.append(hud, targetLine, board, hint);
    root.append(left, arena, right);
  }

  private makeOpp(p: PlayerState): OppCard {
    const root = el('div', 'opp');
    const name = el('span', 'name', p.name);
    const badges = el('span', 'badges');
    const bar = el('span', 'bar');
    const fill = el('i');
    bar.append(fill);
    const status = el('span', 'ko-label');
    root.append(name, badges, bar);
    root.dataset.id = String(p.id);
    return { root, bar: fill, badges, status };
  }

  /** Reaktion auf Events (z. B. Fehler-Wackeln). */
  handleEvents(events: GameEvent[]): void {
    for (const e of events) {
      if (e.type === 'KEY_ERROR' && e.playerId === this.humanId) {
        const ch = this.rows.get(e.wordId)?.children[e.index] as HTMLElement | undefined;
        if (ch) {
          ch.classList.remove('err');
          void ch.offsetWidth; // Animation neu starten
          ch.classList.add('err');
        }
      }
    }
  }

  update(state: GameState, _info: FrameInfo): void {
    const me = state.players[this.humanId];
    this.renderStack(state, me);
    this.renderHud(state, me);
    this.renderWarn(state, me);
    this.renderOpponents(state, me);
  }

  private renderStack(state: GameState, me: PlayerState): void {
    const order = me.stack.map((w) => w.id).join(',');
    if (order !== this.rowOrder) {
      this.rowOrder = order;
      const keep = new Set(me.stack.map((w) => w.id));
      for (const [id, row] of this.rows) {
        if (!keep.has(id)) {
          row.remove();
          this.rows.delete(id);
        }
      }
      const frag = document.createDocumentFragment();
      for (const w of me.stack) frag.append(this.rows.get(w.id) ?? this.makeRow(w));
      this.stackEl.append(frag);
    }
    const active = me.stack[0];
    if (active && (active.id !== this.activeId || me.cursor !== this.activeCursor)) {
      if (active.id !== this.activeId) this.activate(active);
      const row = this.rows.get(active.id)!;
      const chars = row.children;
      for (let i = 0; i < chars.length; i++) {
        const c = chars[i] as HTMLElement;
        c.classList.toggle('done', i < me.cursor);
        c.classList.toggle('cur', i === me.cursor);
        if (i !== me.cursor) c.classList.remove('err');
      }
      this.activeCursor = me.cursor;
    }
    this.stackEl.classList.toggle('danger', me.stack.length >= state.config.stackMax - 2);
  }

  private makeRow(w: Word): HTMLElement {
    const row = el('div', w.garbage ? 'row garbage' : 'row', w.text);
    this.rows.set(w.id, row);
    return row;
  }

  /** Das aktive Wort bekommt einzelne Buchstaben-Spans. */
  private activate(w: Word): void {
    const row = this.rows.get(w.id) ?? this.makeRow(w);
    row.classList.add('active');
    row.replaceChildren(...[...w.text].map((ch) => el('span', 'ch', ch)));
    this.activeId = w.id;
    this.activeCursor = -1;
  }

  private renderHud(state: GameState, me: PlayerState): void {
    this.hud.combo.textContent = String(me.combo);
    this.hud.wpm.textContent = wpm(state, me).toFixed(0);
    if (state.players.length > 1) {
      this.hud.alive.textContent = `${state.players.filter((p) => p.alive).length}/${state.players.length}`;
    }
    this.hud.time.textContent = formatTime(ticksToMs(state.tick, state.config));
    this.strategyEl.textContent = STRATEGY_LABEL[me.strategy];
    this.targetEl.textContent = me.targetId !== null ? state.players[me.targetId].name : '–';
    this.badgesEl.textContent = String(me.badges);
  }

  private renderWarn(state: GameState, me: PlayerState): void {
    const total = pendingGarbage(me.incoming);
    if (total === 0) {
      this.warnFill.style.height = '0';
      this.warnCount.textContent = '';
      return;
    }
    const next = me.incoming.reduce((a, b) => (a.arriveTick <= b.arriveTick ? a : b));
    const k = (state.tick - next.sentTick) / Math.max(1, next.arriveTick - next.sentTick);
    this.warnFill.style.height = `${Math.min(100, Math.max(0, k * 100)).toFixed(1)}%`;
    this.warnCount.textContent = `+${total}`;
  }

  private renderOpponents(state: GameState, me: PlayerState): void {
    for (const [id, card] of this.opps) {
      const p = state.players[id];
      const fill = p.stack.length / state.config.stackMax;
      card.bar.style.width = `${Math.min(100, fill * 100)}%`;
      card.badges.textContent = p.badges > 0 ? `★${p.badges}` : '';
      card.root.classList.toggle('hot', fill >= 0.6 && fill < 0.85);
      card.root.classList.toggle('critical', fill >= 0.85);
      card.root.classList.toggle('targeted', p.alive && me.targetId === id);
      card.root.classList.toggle('attacker', p.alive && me.alive && p.targetId === me.id);
      if (!p.alive && !card.root.classList.contains('ko')) {
        card.root.classList.add('ko');
        card.badges.textContent = `#${p.placement}`;
        card.badges.classList.add('ko-label');
      }
    }
  }
}
