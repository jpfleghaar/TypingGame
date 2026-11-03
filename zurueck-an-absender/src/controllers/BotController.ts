import {
  chainLength,
  msToTicks,
  other,
  targetText,
  waterline,
  type Command,
  type GameEvent,
  type GameState,
  type ShipId,
  type TargetRef,
  type UpgradeId,
} from '../core';
import { createRng, gaussian, next, nextInt, type RngState } from '../core/rng';
import type { BotProfile } from './botProfiles';
import type { Controller } from './Controller';

/** Nachbartasten auf QWERTZ, für realistische Vertipper. */
const NEIGHBORS: Record<string, string> = {
  q: 'wa', w: 'qes', e: 'wrd', r: 'etf', t: 'rzg', z: 'tuh', u: 'zij', i: 'uok', o: 'ipl', p: 'oöü',
  ü: 'pä', a: 'qsy', s: 'adw', d: 'sfe', f: 'dgr', g: 'fht', h: 'gjz', j: 'hku', k: 'jli', l: 'kö',
  ö: 'lä', ä: 'öü', y: 'xa', x: 'yc', c: 'xv', v: 'cb', b: 'vn', n: 'bm', m: 'n', ß: 'ü',
};

interface Plan {
  ref: TargetRef;
  text: string;
  /** Ballast: nur anvisieren, dann über Bord werfen. */
  dump: boolean;
}

/**
 * Bot mit menschlich wirkendem Tempo. Bekommt nur Lesezugriff auf den State und
 * schickt Commands, unterliegt also exakt denselben Regeln wie der Spieler.
 * Timing in Ticks: deterministisch und ohne Browser simulierbar.
 */
export class BotController implements Controller {
  private rng: RngState;
  private plan: Plan | null = null;
  private nextTick = 0;
  /** Langsam schwankender Tempofaktor (Random Walk um 1). */
  private tempo = 1;
  private baseCharTicks: number;
  private chosenThisIsland = false;
  private islandChooseTick = 0;
  lastDecision = '';

  constructor(
    public readonly ship: ShipId,
    public readonly profile: BotProfile,
    seed: number,
  ) {
    this.rng = createRng(seed);
    this.baseCharTicks = 60000 / (profile.wpm * profile.burst * 5) / (1000 / 60);
  }

  /** Aktuelles Tempo in WPM (für Debug). */
  get currentWpm(): number {
    return (this.profile.wpm * this.profile.burst) / this.tempo;
  }

  private charDelay(): number {
    const j = 1 + gaussian(this.rng) * this.profile.jitter;
    // Bruchteile von Ticks zufällig runden, damit das Mitteltempo exakt stimmt
    const t = this.baseCharTicks * this.tempo * Math.min(2.5, Math.max(0.45, j));
    const whole = Math.floor(t);
    return Math.max(1, whole + (next(this.rng) < t - whole ? 1 : 0));
  }

  private wait(state: GameState, ticks: number): void {
    this.nextTick = state.tick + ticks;
  }

  onEvents(events: readonly GameEvent[], state: GameState): void {
    for (const e of events) {
      if (e.type === 'TARGET_LOST' && e.ship === this.ship) {
        this.plan = null;
        this.wait(state, msToTicks(this.profile.thinkMs * 0.6));
      }
      if (e.type === 'ISLAND_START') {
        this.plan = null;
        this.chosenThisIsland = false;
        this.islandChooseTick = state.tick + msToTicks(1500 + next(this.rng) * 2500);
      }
      if (e.type === 'ISLAND_END') this.wait(state, msToTicks(this.profile.thinkMs));
    }
  }

  poll(state: Readonly<GameState>): Command[] {
    const s = state as GameState;
    if (s.phase === 'over') return [];
    if (s.phase === 'island') return this.pollIsland(s);
    if (s.tick < this.nextTick) return [];

    // Tempo schwankt langsam (Konzentration, Müdigkeit)
    this.tempo = Math.min(1.6, Math.max(0.7, this.tempo + gaussian(this.rng) * this.profile.drift * 0.05));

    const me = s.ships[this.ship];
    const ty = me.typing;

    // Tippfehler bemerkt → löschen
    if (ty.error !== null) {
      this.wait(s, this.charDelay());
      return [{ type: 'backspace' }];
    }

    if (this.plan && !this.planValid(s, this.plan)) this.plan = null;
    if (!this.plan) {
      this.plan = this.choosePlan(s);
      if (!this.plan) {
        this.wait(s, msToTicks(200));
        return [];
      }
      // Bedenkzeit vor dem ersten Buchstaben
      this.wait(s, msToTicks(this.profile.thinkMs * (0.6 + next(this.rng) * 0.8)));
      return [];
    }

    // Ballast: Wort ist anvisiert → über Bord
    if (this.plan.dump && ty.target && ty.target.kind === 'cargo' && ty.target.id === this.plan.ref.id) {
      this.plan = null;
      this.wait(s, msToTicks(this.profile.thinkMs));
      return [{ type: 'ballast' }];
    }

    // Nächster Buchstabe: vom tatsächlichen Ziel (der Kern kann bei gleichem Anfang umschalten)
    // Beim Ballast immer das geplante Wort weitertippen, bis es eindeutig anvisiert ist.
    const actual = targetText(s, this.ship, ty.target);
    const text = this.plan.dump ? this.plan.text : (actual ?? this.plan.text);
    const typed = actual ? ty.typed : 0;
    const want = text[typed];
    if (want === undefined) {
      this.plan = null;
      return [];
    }

    this.wait(s, this.charDelay());
    if (next(this.rng) < this.profile.errorRate) {
      this.nextTick += msToTicks(this.profile.noticeMs);
      return [{ type: 'key', char: this.typo(want) }];
    }
    // Wort fertig → kurze Pause vor dem nächsten
    if (typed + 1 >= text.length) this.plan = null;
    return [{ type: 'key', char: want.toLowerCase() }];
  }

  private typo(want: string): string {
    const n = NEIGHBORS[want.toLowerCase()] ?? 'asdf';
    return n[nextInt(this.rng, n.length)];
  }

  private planValid(state: GameState, plan: Plan): boolean {
    if (plan.ref.kind === 'cargo') return state.ships[this.ship].cargo.some((c) => c.id === plan.ref.id);
    return state.drift.some((d) => d.id === plan.ref.id);
  }

  /** Einfache Taktik: Treibgut fischen, bei Gefahr kurze Wörter, sonst mal lange für viel Gewicht. */
  private choosePlan(state: GameState): Plan | null {
    const me = state.ships[this.ship];
    const ratio = waterline(state, me);
    const p = this.profile;
    const charTicks = this.baseCharTicks * this.tempo;

    // Ballast nutzen, wenn es eng wird
    if (me.mods.ballast > 0 && ratio > 0.75 && me.cargo.length > 0) {
      const heaviest = [...me.cargo].sort((a, b) => b.weight - a.weight)[0];
      this.lastDecision = `Ballast: ${heaviest.text}`;
      return { ref: { kind: 'cargo', id: heaviest.id }, text: heaviest.text, dump: true };
    }

    // Treibgut, wenn es rechtzeitig schaffbar ist
    const reachable = state.drift.filter((d) => {
      const need = d.word.text.length * (me.mods.harpoon ? 0.5 : 1);
      return d.expireTick - state.tick > need * charTicks * 1.3 + msToTicks(p.thinkMs);
    });
    if (reachable.length > 0) {
      const lighter = waterline(state, me) <= waterline(state, state.ships[other(this.ship)]);
      // Bin ich leichter, käme das Fass sowieso zu mir → stärkerer Anreiz
      const eager = Math.min(1, p.driftEagerness + (lighter ? 0.25 : 0));
      if (next(this.rng) < eager) {
        const d = reachable.sort((a, b) => a.word.text.length - b.word.text.length)[0];
        this.lastDecision = `Treibgut: ${d.word.text}`;
        return { ref: { kind: 'drift', id: d.id }, text: d.word.text, dump: false };
      }
    }

    if (me.cargo.length === 0) {
      this.lastDecision = 'wartet';
      return null;
    }

    const byLen = [...me.cargo].sort((a, b) => a.text.length - b.text.length);
    let pick;
    if (ratio > 0.7) {
      pick = byLen[0];
      this.lastDecision = `Entlastung: ${pick.text}`;
    } else if (next(this.rng) < p.greed) {
      // Lange Wörter oder Endstufe: viel Gewicht beim Gegner
      pick = [...me.cargo].sort(
        (a, b) => b.text.length * (b.stage >= chainLength(b.chain) ? 1.2 : 1) - a.text.length * (a.stage >= chainLength(a.chain) ? 1.2 : 1),
      )[0];
      this.lastDecision = `Schwer werfen: ${pick.text}`;
    } else {
      pick = me.cargo[nextInt(this.rng, me.cargo.length)];
      this.lastDecision = `Normal: ${pick.text}`;
    }
    return { ref: { kind: 'cargo', id: pick.id }, text: pick.text, dump: false };
  }

  private pollIsland(state: GameState): Command[] {
    const me = state.ships[this.ship];
    if (this.chosenThisIsland || me.cardChosen || !me.cards || state.tick < this.islandChooseTick) return [];
    this.chosenThisIsland = true;
    const index = this.chooseCard(state, me.cards);
    this.lastDecision = `Upgrade: ${me.cards[index]}`;
    return [{ type: 'chooseUpgrade', index }];
  }

  /** Upgrade-Heuristik: je voller das Schiff, desto mehr zählen Entlastungs-Karten. */
  chooseCard(state: GameState, cards: UpgradeId[]): number {
    const r = waterline(state, state.ships[this.ship]);
    const score: Record<UpgradeId, number> = {
      bilgePump: 2.5 + r * 6,
      planks: 2 + r * 4,
      ballast: 1 + r * 5,
      tarp: 3.5,
      doubleGrowth: 4 - r * 2,
      fastCannon: 2.5,
      harpoon: 1.5 + this.profile.driftEagerness * 2,
      anchor: 1.5,
      lookout: 0.5,
    };
    let best = 0;
    let bestScore = -Infinity;
    cards.forEach((c, i) => {
      const v = score[c] + next(this.rng) * 0.8;
      if (v > bestScore) {
        bestScore = v;
        best = i;
      }
    });
    return best;
  }
}
