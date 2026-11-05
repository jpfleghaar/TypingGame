import { msToTicks, pendingGarbage, selectWordsToSend, ticksToMs, wordsLeavingWithAttack, wordsPerPoint, wpm, type GameEvent, type GameState, type PlayerState, type Word } from '../core';
import type { FrameInfo } from '../runtime/GameRunner';
import { el, formatTime } from './labels';
import { motionReduced } from './motion';

const SVG_NS = 'http://www.w3.org/2000/svg';

interface Geometry {
  board: DOMRect;
  cards: Map<number, DOMRect>;
}

export interface DesignRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Feste Spielfläche (z. B. auf ein Hintergrundbild abgestimmt), wird aufs Fenster skaliert. */
export interface BoardSpec {
  width: number;
  height: number;
  /** Platz je Gegner (Reihenfolge = Gegner-Index). */
  slots: DesignRect[];
  /** Bereich für Posteingang + Ziel-Zeile + Werte (in dieser Reihenfolge von oben). */
  arena: DesignRect;
  /** Kopfzeile am oberen Rand (Modus, Tasten, Lautstärke). */
  header: DesignRect;
  /** Basis-Größeneinheit (--u) auf der Spielfläche in px. */
  unit: number;
  /** Avatar-Bild für die Gegner-Karten. */
  avatar?: string;
}

/** Abbildung Spielflächen-Koordinaten → Bildschirm (Viewport). */
export interface StageTransform {
  scale: number;
  x: number;
  y: number;
}

export interface ViewOptions {
  /** Endlos-Modus: bisheriger Rekord in ms (0 = noch keiner). Zeigt statt des Themas eine Rekord-Kachel. */
  recordMs?: number;
  /** Mehrspieler: eigene Tasten, die schon getippt, aber noch nicht vom Server bestätigt sind. */
  pendingKeys?: () => readonly string[];
  /** 'center': Gegner links und rechts; 'split': Wörter links, alle Gegner rechts; 'board': feste Spielfläche. */
  layout?: 'center' | 'split' | 'board';
  /** Nur bei layout 'board'. */
  board?: BoardSpec;
  /** SVG-Pfeile für Ziel/Angreifer (das Datennetz zeichnet eigene Linien). */
  svgLinks?: boolean;
  /** Bauteil-Labels für die Gegner-Karten (Theme), z. B. "RAM_01". */
  nodeLabels?: readonly string[];
  /** Beschriftungen/Trenner des Themes. */
  texts?: { sep: string; modeLabel: string; targetLabel: string; tabLabel: string; brackets: boolean };
  /** Lautstärkeregler in der Hinweiszeile. */
  volume?: { value: number; onInput: (v: number) => void };
  /** Klick auf "Ton" schaltet stumm/an. */
  onToggleMute?: () => void;
  /** Eigener Angriff hat einen Gegner erreicht (für den Treffer-Sound). */
  onCardHit?: (id: number, amount: number) => void;
  /** Klick auf "Menü" im Spiel. */
  onMenu?: () => void;
}

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
  private warnEl = el('div', 'warn');
  private audioEl = el('span', 'audio-status');
  private warnCount = el('span', 'warn-count');
  private hud = {
    points: el('b'),
    combo: el('b'),
    wpm: el('b'),
    alive: el('b'),
    time: el('b'),
  };
  private recordStat: HTMLElement | null = null;
  private targetEl = el('strong');
  private badgesEl = el('strong');
  private rows = new Map<number, HTMLElement>();
  private rowOrder = '';
  private activeId = -1;
  private activeCursor = -1;
  private opps = new Map<number, OppCard>();
  private board = el('div', 'board');
  private links = document.createElementNS(SVG_NS, 'svg');
  private targetLink = document.createElementNS(SVG_NS, 'path');
  private attackerLinks = new Map<number, SVGPathElement>();
  private geom: Geometry | null = null;
  /** Wer mir wann zuletzt Müll geschickt hat (Tick), für die rote Markierung. */
  private lastAttackFrom = new Map<number, number>();
  private attackers = new Set<number>();
  private resizeObs: ResizeObserver | null = null;
  /** Aufforderungen unter dem Posteingang: Angriff senden (Enter) / abwehren (Tab). */
  private prompts = el('div', 'prompts');
  private sendChip = el('div', 'prompt send');
  private sendText = el('span');
  /** Punkte-Leiste neben dem Posteingang: Segmente, Zähler, Fortschritt zum nächsten Punkt. */
  private pointsEl = el('div', 'points');
  private pointsCount = el('b', 'points-count');
  private pointsSegs: HTMLElement[] = [];
  private pointsProgFill = el('i');
  private pointsProgText = el('small', 'points-rate');
  private pointsShown = '';
  private defendChip = el('div', 'prompt defend');
  private defendText = el('span');
  private stage: HTMLElement | null = null;
  private stageTf: StageTransform = { scale: 1, x: 0, y: 0 };
  private onWindowResize = () => this.fitStage();

  constructor(
    private readonly root: HTMLElement,
    private readonly humanId: number,
    state: GameState,
    themeLabel: string,
    /** Lernmodus: Übersetzungen, die klein neben den Wörtern stehen. */
    private readonly translations?: Readonly<Record<string, string>>,
    private readonly options: ViewOptions = {},
  ) {
    root.replaceChildren();
    const spec = options.layout === 'board' ? options.board : undefined;
    const split = options.layout === 'split';
    root.classList.toggle('layout-split', split);
    root.classList.toggle('layout-board', !!spec);
    const left = el('aside', 'opponents left');
    const right = el('aside', split ? 'opponents grid2' : 'opponents right');
    const others = state.players.filter((p) => p.id !== humanId);
    const tx = options.texts ?? { sep: '·', modeLabel: 'Thema', targetLabel: 'Ziel', tabLabel: 'Strategie', brackets: false };
    others.forEach((p, i) => {
      const card = this.makeOpp(p, options.nodeLabels?.[i % options.nodeLabels.length], spec?.avatar, i);
      // Zifferntaste zum direkten Anvisieren: 1–9, 0 = zehnter Platz
      if (i < 10) card.root.querySelector('.name')?.prepend(el('span', 'key-tag', tx.brackets ? `[${(i + 1) % 10}]` : String((i + 1) % 10)));
      this.opps.set(p.id, card);
      const slot = spec?.slots[i];
      if (slot) place(card.root, slot);
      (!split && i < Math.ceil(others.length / 2) ? left : right).append(card.root);
    });

    const arena = el('main', 'arena');
    const hud = el('div', 'hud');
    const stat = (label: string, b: HTMLElement, cls = '') => {
      const s = el('div', `stat ${cls}`);
      s.append(b, el('small', undefined, label));
      return s;
    };
    const comboStat = stat('Combo', this.hud.combo, 'combo');
    comboStat.title = 'Fehlerfreie Wörter in Folge – bestimmt, wie schnell Punkte kommen. Ein Tippfehler setzt nur die Combo zurück, nicht die Punkte.';
    const pointsStat = stat('Punkte', this.hud.points, 'points-stat');
    pointsStat.title = 'Deine Punkte (sicher): Enter = Angriff, Tab = Abwehr';
    if (others.length > 0) {
      hud.classList.add('with-points');
      hud.append(pointsStat);
    }
    const endless = options.recordMs !== undefined;
    const thirdStat = stat(others.length ? 'Im Spiel' : endless ? 'Rekord' : 'Thema', this.hud.alive, endless ? 'record-stat' : '');
    hud.append(comboStat, stat('WPM', this.hud.wpm), thirdStat, stat('Zeit', this.hud.time));
    if (endless) {
      this.recordStat = thirdStat;
      this.hud.alive.textContent = options.recordMs ? formatTime(options.recordMs) : '–';
    } else if (!others.length) this.hud.alive.textContent = themeLabel;

    const targetLine = el('div', 'target-line');
    const t = el('span');
    t.append(`${tx.targetLabel}: `, this.targetEl);
    const b = el('span');
    b.append('Abzeichen: ', this.badgesEl);
    targetLine.append(t, b);

    const board = this.board;
    const warn = this.warnEl;
    warn.title = 'Eingehender Müll';
    warn.append(this.warnFill);
    const warnWrap = el('div');
    warnWrap.style.position = 'relative';
    warnWrap.style.display = 'grid';
    warnWrap.append(warn, this.warnCount);
    board.append(warnWrap, this.stackEl);
    // Ohne Gegner gibt es weder Müll noch Ziele – Platz bleibt, damit das Layout gleich aussieht.
    if (others.length === 0) {
      warnWrap.style.visibility = 'hidden';
      targetLine.style.visibility = 'hidden';
    }
    // Punkte-Leiste nur, wenn es Gegner gibt (ohne Gegner gibt es nichts anzugreifen/abzuwehren)
    if (others.length > 0) {
      board.classList.add('with-points');
      board.append(this.makePoints(state));
    }

    const hint = el('div', 'hint');
    const key = (k: string) => el('kbd', undefined, tx.brackets ? `[${k.toUpperCase()}]` : k);
    const sep = () => ` ${tx.sep} `;
    // "Ton" ist anklickbar (schaltet stumm/an), gleiche Wirkung wie F4
    const tone = el('button', 'tone-toggle');
    tone.type = 'button';
    tone.tabIndex = -1;
    tone.title = 'Ton an/aus';
    tone.append(key('F4'), ' Ton');
    tone.addEventListener('click', () => {
      options.onToggleMute?.();
      tone.blur();
    });
    hint.append(`${tx.modeLabel}: ${themeLabel}`, sep());
    if (others.length > 0) hint.append(key('Tab'), ` ${tx.tabLabel}`, sep());
    if (others.length > 0) hint.append(key('Enter'), ' Senden', sep());
    if (others.length > 0) hint.append(key(others.length >= 10 ? '1–0' : `1–${others.length}`), ' Direkt', sep());
    // "Menü" anklickbar (fragt im Spiel nach, ob man aufgeben will) – wie Esc
    const menuBtn = el('button', 'tone-toggle menu-btn');
    menuBtn.type = 'button';
    menuBtn.tabIndex = -1;
    menuBtn.title = 'Zurück zum Menü';
    menuBtn.append(key('Esc'), ' Menü');
    menuBtn.addEventListener('click', () => {
      menuBtn.blur();
      options.onMenu?.();
    });
    hint.append(tone, sep(), menuBtn, sep());
    if (options.volume) {
      // Lautstärkeregler; gibt den Fokus sofort zurück, damit Tippen weiter funktioniert
      const vol = el('input', 'vol');
      vol.type = 'range';
      vol.min = '0';
      vol.max = '100';
      vol.value = String(Math.round(options.volume.value * 100));
      vol.setAttribute('aria-label', 'Lautstärke');
      vol.tabIndex = -1;
      const cb = options.volume.onInput;
      vol.addEventListener('input', () => cb(Number(vol.value) / 100));
      vol.addEventListener('pointerup', () => vol.blur());
      vol.addEventListener('change', () => vol.blur());
      hint.append(vol, ' ');
    }
    hint.append(this.audioEl);
    if (spec) {
      // Feste Spielfläche: Posteingang oben, Ziel und Werte direkt darunter, Hinweise als Kopfzeile
      arena.append(board, this.makePrompts(tx.brackets), targetLine, hud);
      hint.classList.add('board-header');
      place(hint, spec.header);
    } else arena.append(hud, targetLine, board, this.makePrompts(tx.brackets), hint);
    if (spec) {
      // Feste Spielfläche: alles absolut in Spielflächen-Koordinaten, dann skaliert
      const stage = el('div', 'board-stage');
      stage.style.width = `${spec.width}px`;
      stage.style.height = `${spec.height}px`;
      stage.style.setProperty('--u', `${spec.unit}px`);
      place(arena, spec.arena);
      stage.append(...left.children, ...right.children, arena, hint);
      root.append(stage);
      this.stage = stage;
      this.fitStage();
      window.addEventListener('resize', this.onWindowResize);
    } else if (split) root.append(arena, right);
    else root.append(left, arena, right);
    if (options.svgLinks !== false) root.append(this.makeLinks());
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObs = new ResizeObserver(() => (this.geom = null));
      this.resizeObs.observe(root);
    }
  }

  destroy(): void {
    this.resizeObs?.disconnect();
    window.removeEventListener('resize', this.onWindowResize);
  }

  /** Skaliert die feste Spielfläche ins Fenster (Seitenverhältnis bleibt, zentriert). */
  private fitStage(): void {
    const stage = this.stage;
    const spec = this.options.board;
    if (!stage || !spec) return;
    const w = this.root.clientWidth || window.innerWidth;
    const h = this.root.clientHeight || window.innerHeight;
    const scale = Math.min(w / spec.width, h / spec.height);
    const x = (w - spec.width * scale) / 2;
    const y = (h - spec.height * scale) / 2;
    stage.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    const r = this.root.getBoundingClientRect();
    this.stageTf = { scale, x: r.x + x, y: r.y + y };
  }

  hasBoardLayout(): boolean {
    return !!this.stage;
  }

  /** Gegner-IDs in Platz-Reihenfolge (Platz i = Anschluss P(i+1) auf der Platine). */
  opponentOrder(): number[] {
    return [...this.opps.keys()];
  }

  /** Spielflächen → Viewport. Ohne feste Spielfläche: Identität. */
  stageTransform(): StageTransform {
    if (this.stage) this.fitStage();
    return this.stageTf;
  }

  /* ---------- Ziellinien (wen ich anvisiere, wer mich angreift) ---------- */

  private makeLinks(): SVGSVGElement {
    const svg = this.links;
    svg.classList.add('links');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = `<defs>
      <marker id="arrow-good" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="arrow-good"/></marker>
      <marker id="arrow-danger" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="arrow-danger"/></marker>
    </defs>`;
    this.targetLink.classList.add('link', 'link-target');
    this.targetLink.setAttribute('marker-end', 'url(#arrow-good)');
    svg.append(this.targetLink);
    return svg;
  }

  private measure(): Geometry {
    const origin = this.root.getBoundingClientRect();
    const rel = (r: DOMRect) => new DOMRect(r.x - origin.x, r.y - origin.y, r.width, r.height);
    const cards = new Map<number, DOMRect>();
    for (const [id, c] of this.opps) cards.set(id, rel(c.root.getBoundingClientRect()));
    this.links.setAttribute('viewBox', `0 0 ${origin.width} ${origin.height}`);
    return { board: rel(this.board.getBoundingClientRect()), cards };
  }

  /** Kurve vom Rand des eigenen Stapels zum Rand der Gegner-Karte. Läuft nie über die Textzone. */
  private linkPath(card: DOMRect, offset: number, fromCard: boolean): string {
    const b = this.geom!.board;
    const cx = card.x + card.width / 2;
    const cy = card.y + card.height / 2;
    let x1: number, y1: number, x2: number, y2: number;
    if (cx < b.x || cx > b.right) {
      const left = cx < b.x;
      x1 = left ? b.x - 4 : b.right + 4;
      y1 = Math.min(b.bottom - 12, Math.max(b.y + 12, cy)) + offset;
      x2 = left ? card.right + 4 : card.x - 4;
      y2 = cy + offset;
    } else {
      const above = cy < b.y;
      x1 = Math.min(b.right - 12, Math.max(b.x + 12, cx)) + offset;
      y1 = above ? b.y - 4 : b.bottom + 4;
      x2 = cx + offset;
      y2 = above ? card.bottom + 4 : card.y - 4;
    }
    if (fromCard) [x1, y1, x2, y2] = [x2, y2, x1, y1];
    const horizontal = Math.abs(x2 - x1) > Math.abs(y2 - y1);
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    return horizontal
      ? `M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`
      : `M${x1} ${y1} C${x1} ${my} ${x2} ${my} ${x2} ${y2}`;
  }

  private renderLinks(me: PlayerState): void {
    if (this.opps.size === 0 || this.options.svgLinks === false) return;
    this.geom ??= this.measure();
    const target = me.alive && me.targetId !== null ? this.geom.cards.get(me.targetId) : undefined;
    if (target) this.targetLink.setAttribute('d', this.linkPath(target, -5, false));
    this.targetLink.style.display = target ? '' : 'none';

    const attackers = this.attackers;
    for (const [id, path] of this.attackerLinks) {
      if (!attackers.has(id)) {
        path.remove();
        this.attackerLinks.delete(id);
      }
    }
    for (const id of attackers) {
      let path = this.attackerLinks.get(id);
      if (!path) {
        path = document.createElementNS(SVG_NS, 'path');
        path.classList.add('link', 'link-attacker');
        path.setAttribute('marker-end', 'url(#arrow-danger)');
        this.links.append(path);
        this.attackerLinks.set(id, path);
      }
      path.setAttribute('d', this.linkPath(this.geom.cards.get(id)!, 5, true));
    }
  }

  private makeOpp(p: PlayerState, nodeLabel?: string, avatar?: string, index = 0): OppCard {
    const root = el('div', 'opp');
    if (avatar) {
      const img = el('img', 'avatar');
      img.src = avatar;
      img.alt = '';
      // Gleiches Bild, je Gegner eigene Farbtönung – so bleiben sie unterscheidbar
      img.style.filter = `hue-rotate(${(index * 137) % 360}deg) saturate(1.15)`;
      root.classList.add('has-avatar');
      root.append(img);
    }
    const name = el('span', 'name', p.name);
    if (nodeLabel) name.append(el('small', 'node-tag', nodeLabel));
    const badges = el('span', 'badges');
    const bar = el('span', 'bar');
    const fill = el('i');
    bar.append(fill);
    const status = el('span', 'ko-label');
    root.append(name, badges, bar);
    root.dataset.id = String(p.id);
    return { root, bar: fill, badges, status };
  }

  /** Reaktion auf Events (Fehler-Wackeln, Wort-Auflösung, Abwehr, Abzeichen). */
  handleEvents(events: GameEvent[]): void {
    for (const e of events) {
      if (e.type === 'KEY_ERROR' && e.playerId === this.humanId) {
        const ch = this.rows.get(e.wordId)?.children[e.index] as HTMLElement | undefined;
        if (ch) restartClass(ch, 'err');
      } else if (e.type === 'ATTACK_SENT' && e.to === this.humanId) {
        this.lastAttackFrom.set(e.from, e.arriveTick);
      } else if (e.type === 'WORD_CLEARED' && e.playerId === this.humanId) {
        this.dissolve(e.word.id);
      } else if (e.type === 'GARBAGE_CANCELLED' && e.playerId === this.humanId) {
        restartClass(this.warnEl, 'cancel');
      } else if (e.type === 'POINT_LOST' && e.playerId === this.humanId) {
        restartClass(this.pointsEl, 'overflow'); // Punkt verdient, aber verfallen: Maximum voll
      } else if (e.type === 'POINT_EARNED' && e.playerId === this.humanId) {
        restartClass(this.pointsEl, 'gain');
        this.popPoint();
      } else if (e.type === 'BADGES_GAINED' && e.playerId === this.humanId) {
        restartClass(this.badgesEl, 'pop');
      }
    }
  }

  /** Fertiges Wort löst sich auf und driftet nach oben weg (< 200 ms). */
  private dissolve(wordId: number): void {
    const row = this.rows.get(wordId);
    if (!row || motionReduced()) return;
    const ghost = row.cloneNode(true) as HTMLElement;
    ghost.classList.add('ghost');
    ghost.querySelectorAll('.ch').forEach((c) => c.classList.add('done'));
    ghost.style.top = `${row.offsetTop}px`;
    ghost.style.left = `${row.offsetLeft}px`;
    this.stackEl.append(ghost);
    const remove = () => ghost.remove();
    ghost.addEventListener('animationend', remove, { once: true });
    setTimeout(remove, 400);
  }

  /** Viewport-Koordinaten für die Hintergrund-Effekte. */
  boardRect(): DOMRect {
    return this.board.getBoundingClientRect();
  }

  /** HUD + Posteingang (für die Platine: dort keine Deko). */
  arenaRect(): DOMRect {
    return (this.board.closest('.arena') ?? this.board).getBoundingClientRect();
  }

  stackRect(): DOMRect {
    return this.stackEl.getBoundingClientRect();
  }

  /** Alle Gegner-Karten mit Position (Viewport) – für die Platine. */
  cardRects(): { id: number; rect: DOMRect }[] {
    return [...this.opps].map(([id, c]) => ({ id, rect: c.root.getBoundingClientRect() }));
  }

  cardRect(id: number): DOMRect | undefined {
    return this.opps.get(id)?.root.getBoundingClientRect();
  }

  flashCard(id: number, kind: 'good' | 'danger'): void {
    const card = this.opps.get(id);
    if (card) restartClass(card.root, kind === 'good' ? 'hit-good' : 'hit');
  }

  /**
   * Dein Angriff erreicht einen Gegner: Karte wackelt kurz und leuchtet auf,
   * "+N SPAM" schwebt hoch, dazu der Treffer-Sound (über onCardHit).
   */
  hitCard(id: number, amount: number): void {
    const card = this.opps.get(id);
    if (!card) return;
    this.options.onCardHit?.(id, amount);
    restartClass(card.root, 'got-hit');
    if (motionReduced()) return;
    const label = el('span', 'hit-label', `+${amount} ${this.options.texts?.brackets ? 'SPAM' : 'Müll'}`);
    card.root.append(label);
    label.addEventListener('animationend', () => label.remove(), { once: true });
    setTimeout(() => label.remove(), 1500);
  }

  flashBoard(): void {
    restartClass(this.warnEl, 'hit');
  }

  setAudioStatus(text: string): void {
    this.audioEl.textContent = text;
  }

  update(state: GameState, _info: FrameInfo): void {
    const me = state.players[this.humanId];
    this.updateAttackers(state, me);
    this.renderStack(state, me);
    this.renderHud(state, me);
    this.renderWarn(state, me);
    this.renderOpponents(state, me);
    this.renderLinks(me);
  }

  /**
   * "Greift mich an" = hat mir tatsächlich Müll geschickt: entweder ist er noch
   * unterwegs oder kam in den letzten Sekunden an. Reines Anvisieren zählt nicht.
   */
  private updateAttackers(state: GameState, me: PlayerState): void {
    this.attackers.clear();
    if (!me.alive) return;
    const memory = msToTicks(state.config.targeting.attackerMemoryMs, state.config);
    for (const g of me.incoming) this.attackers.add(g.from);
    for (const [id, arriveTick] of this.lastAttackFrom) {
      if (state.tick - arriveTick <= memory) this.attackers.add(id);
      else this.lastAttackFrom.delete(id);
    }
    for (const id of this.attackers) if (!state.players[id].alive) this.attackers.delete(id);
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
    // Mehrspieler: schon getippte, noch nicht bestätigte Buchstaben vorab anzeigen
    let cursor = me.cursor;
    if (active && me.alive && this.options.pendingKeys) {
      for (const k of this.options.pendingKeys()) {
        if (active.text[cursor] !== k) break;
        cursor++;
      }
    }
    if (active && (active.id !== this.activeId || cursor !== this.activeCursor)) {
      if (active.id !== this.activeId) this.activate(active);
      const row = this.rows.get(active.id)!;
      const chars = row.children;
      for (let i = 0; i < active.text.length; i++) {
        const c = chars[i] as HTMLElement;
        c.classList.toggle('done', i < cursor);
        c.classList.toggle('cur', i === cursor);
        if (i !== cursor) c.classList.remove('err');
      }
      this.activeCursor = cursor;
    }
    this.stackEl.classList.toggle('danger', me.stack.length >= state.config.stackMax - 2);
    // Markiert: Wörter, die ein Angriff mit Enter jetzt mitnehmen würde
    const sending = me.alive && this.opps.size > 0
      ? new Set(selectWordsToSend(me, wordsLeavingWithAttack(me, state.config)).map((w) => w.id))
      : new Set<number>();
    for (const [id, row] of this.rows) row.classList.toggle('to-send', sending.has(id));
  }

  private makeRow(w: Word): HTMLElement {
    const row = el('div', w.garbage ? 'row garbage' : 'row', w.text);
    this.addHint(row, w);
    this.rows.set(w.id, row);
    return row;
  }

  /** Übersetzung (Lernmodus) – steht rechts, getrennt vom zu tippenden Wort. */
  private addHint(row: HTMLElement, w: Word): void {
    const hint = !w.garbage ? this.translations?.[w.text] : undefined;
    if (hint) row.append(el('span', 'hint-tr', hint));
  }

  /** Das aktive Wort bekommt einzelne Buchstaben-Spans. */
  private activate(w: Word): void {
    const row = this.rows.get(w.id) ?? this.makeRow(w);
    row.classList.add('active');
    row.replaceChildren(...[...w.text].map((ch) => el('span', 'ch', ch)));
    this.addHint(row, w);
    this.activeId = w.id;
    this.activeCursor = -1;
  }

  /** Kurzes "+1 Punkt" über der Punkte-Leiste, damit klar ist, wann ein Punkt dazukommt. */
  private popPoint(): void {
    if (this.pointsSegs.length === 0) return;
    const pop = el('span', 'points-pop', '+1 Punkt');
    this.pointsEl.append(pop);
    setTimeout(() => pop.remove(), 900);
  }

  private makePoints(state: GameState): HTMLElement {
    const max = state.config.points.max;
    const label = el('small', 'points-label', 'Punkte');
    const segs = el('div', 'points-segs');
    for (let i = 0; i < max; i++) {
      const seg = el('i');
      this.pointsSegs.push(seg);
      segs.append(seg);
    }
    const prog = el('div', 'points-prog');
    prog.title = 'Fortschritt zum nächsten Punkt';
    prog.append(this.pointsProgFill);
    this.pointsEl.title = `Punkte (max. ${max}): Enter = Angriff, Tab = Abwehr`;
    this.pointsEl.append(label, this.pointsCount, segs, prog, this.pointsProgText);
    return this.pointsEl;
  }

  private renderPoints(state: GameState, me: PlayerState): void {
    if (this.pointsSegs.length === 0) return;
    const max = state.config.points.max;
    const need = wordsPerPoint(me.combo, state.config);
    const key = `${me.points}|${me.pointProgress}|${need}|${me.alive}`;
    if (key === this.pointsShown) return;
    this.pointsShown = key;
    const full = me.points >= max;
    this.pointsEl.classList.toggle('max', full);
    this.pointsCount.textContent = full ? 'MAX' : `${me.points}/${max}`;
    this.pointsSegs.forEach((seg, i) => seg.classList.toggle('on', i < me.points));
    this.pointsProgFill.style.width = `${(Math.min(me.pointProgress, need) / need) * 100}%`;
    this.pointsProgText.textContent = full ? 'voll – Rest verfällt' : `${me.pointProgress}/${need} Wörter`;
  }

  private makePrompts(brackets: boolean): HTMLElement {
    const k = (t: string) => el('kbd', undefined, brackets ? `[${t.toUpperCase()}]` : t);
    this.sendChip.append(k('Enter'), this.sendText);
    this.defendChip.append(k('Tab'), this.defendText);
    this.sendChip.hidden = true;
    this.defendChip.hidden = true;
    this.prompts.append(this.sendChip, this.defendChip);
    return this.prompts;
  }

  /** Aufforderungen: Angriff mit allen Punkten, mögliche Abwehr. */
  private renderPrompts(state: GameState, me: PlayerState): void {
    const pts = me.alive && this.opps.size > 0 ? me.points : 0;
    this.sendChip.hidden = pts === 0;
    if (pts > 0) {
      const n = wordsLeavingWithAttack(me, state.config);
      const full = me.points >= state.config.points.max;
      this.sendChip.classList.toggle('full', full);
      this.sendText.textContent = ` Angriff · ${pts} ${pts === 1 ? 'Punkt' : 'Punkte'} → ${n} ${n === 1 ? 'Wort' : 'Wörter'}${full ? ' · MAX' : ''}`;
    }
    const incoming = me.alive ? pendingGarbage(me.incoming) : 0;
    const cost = state.config.defense.pointsPerWord;
    this.defendChip.hidden = incoming === 0;
    if (incoming > 0) {
      const can = Math.min(incoming, Math.floor(me.points / cost));
      this.defendChip.classList.toggle('ready', can > 0);
      const unit = (x: number) => (x === 1 ? 'Punkt' : 'Punkte');
      this.defendText.textContent = can > 0 ? ` Abwehren ${can}× (−${can * cost} ${unit(can * cost)})` : ' Keine Punkte zum Abwehren';
    }
  }

  private renderHud(state: GameState, me: PlayerState): void {
    this.renderPrompts(state, me);
    this.renderPoints(state, me);
    this.hud.combo.textContent = String(me.combo);
    const maxP = state.config.points.max;
    this.hud.points.textContent = me.points >= maxP ? `${me.points}/${maxP} MAX` : `${me.points}/${maxP}`;
    this.hud.wpm.textContent = wpm(state, me).toFixed(0);
    if (state.players.length > 1) {
      this.hud.alive.textContent = `${state.players.filter((p) => p.alive).length}/${state.players.length}`;
    }
    const elapsed = ticksToMs(state.tick, state.config);
    this.hud.time.textContent = formatTime(elapsed);
    // Endlos: Sobald der alte Rekord geschlagen ist, zeigt die Kachel die neue Bestzeit.
    const rec = this.options.recordMs;
    if (this.recordStat && rec !== undefined && rec > 0 && elapsed > rec && !this.recordStat.classList.contains('beaten')) {
      this.recordStat.classList.add('beaten');
      this.recordStat.querySelector('small')!.textContent = 'Neuer Rekord!';
    }
    if (this.recordStat?.classList.contains('beaten')) this.hud.alive.textContent = formatTime(elapsed);
    this.targetEl.textContent = me.targetId !== null ? state.players[me.targetId].name : '–';
    this.badgesEl.textContent = String(me.badges);
  }

  private renderWarn(state: GameState, me: PlayerState): void {
    const total = pendingGarbage(me.incoming);
    if (total === 0) {
      this.warnFill.style.height = '0';
      this.warnCount.textContent = '';
      this.warnEl.classList.remove('imminent');
      return;
    }
    const next = me.incoming.reduce((a, b) => (a.arriveTick <= b.arriveTick ? a : b));
    const k = (state.tick - next.sentTick) / Math.max(1, next.arriveTick - next.sentTick);
    this.warnFill.style.height = `${Math.min(100, Math.max(0, k * 100)).toFixed(1)}%`;
    this.warnCount.textContent = `+${total}`;
    this.warnEl.classList.toggle('imminent', k > 0.66);
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
      card.root.classList.toggle('attacker', this.attackers.has(id));
      // Rot, solange dieser Spieler von irgendwem angegriffen wird (Müll unterwegs)
      card.root.classList.toggle('under-attack', p.alive && p.incoming.length > 0);
      if (!p.alive && !card.root.classList.contains('ko')) {
        card.root.classList.add('ko');
        card.badges.textContent = `#${p.placement}`;
        card.badges.classList.add('ko-label');
      }
    }
  }
}

function restartClass(e: Element, cls: string): void {
  e.classList.remove(cls);
  void (e as HTMLElement).offsetWidth; // Animation neu starten
  e.classList.add(cls);
}

function place(e: HTMLElement, r: DesignRect): void {
  e.style.position = 'absolute';
  e.style.left = `${r.x}px`;
  e.style.top = `${r.y}px`;
  e.style.width = `${r.width}px`;
  e.style.height = `${r.height}px`;
}
