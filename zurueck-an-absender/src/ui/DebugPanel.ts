import {
  capacity,
  cargoWeight,
  debugStartIsland,
  debugStartSea,
  driftIntervalTicks,
  load,
  nextEventPreview,
  spawnDrift,
  ticksToMs,
  type GameEvent,
  type GameState,
} from '../core';
import { el, formatTime } from './dom';

export interface DebugActions {
  run(fn: (state: GameState, events: GameEvent[]) => void): void;
  /** Zusatzzeilen, z. B. Bot-Werte. */
  extra?(): string[];
}

/** F2: Gewichte, Zeitplan, Bot-Werte und manuelle Auslöser. */
export class DebugPanel {
  readonly root = el('div', 'debug');
  private info = el('pre');
  private frame = 0;
  private actions: DebugActions | null = null;
  private readonly onKey = (e: KeyboardEvent) => {
    if (e.key === 'F2') {
      e.preventDefault();
      this.root.hidden = !this.root.hidden;
    }
  };

  constructor() {
    this.root.hidden = true;
    const buttons = el('div', 'buttons');
    const add = (label: string, fn: (s: GameState, ev: GameEvent[]) => void) => {
      const b = el('button', '', label);
      b.tabIndex = -1;
      b.addEventListener('click', () => this.actions?.run(fn));
      buttons.append(b);
    };
    add('Treibgut', (s, ev) => spawnDrift(s, ev));
    add('Insel', (s, ev) => debugStartIsland(s, ev));
    add('Sturm', (s, ev) => debugStartSea(s, 'storm', ev));
    add('Rückenwind', (s, ev) => debugStartSea(s, 'tailwind', ev));
    this.root.append(el('h3', '', 'Debug (F2)'), this.info, buttons);
    window.addEventListener('keydown', this.onKey);
  }

  attach(actions: DebugActions): void {
    this.actions = actions;
  }

  update(state: GameState): void {
    if (this.root.hidden || this.frame++ % 6 !== 0) return;
    const t = (tick: number) => formatTime(ticksToMs(tick));
    const lines = [`Runden-Seed ${state.seed} · Tick ${state.tick} (${t(state.tick)}) · Phase ${state.phase}`];
    for (const s of state.ships) {
      lines.push(
        `Schiff ${s.id}: Ladung ${load(s).toFixed(1)} (Kisten ${cargoWeight(s).toFixed(1)}, Pumpe ${s.relief}) / ${capacity(state, s).toFixed(0)}`,
        `  Mods ${Object.entries(s.mods).filter(([, v]) => v).map(([k, v]) => (v === true ? k : `${k}=${v}`)).join(', ') || '–'}`,
      );
    }
    const sch = state.schedule;
    lines.push(`Treibgut: nächstes ${t(sch.nextDriftTick)} · Intervall ${(ticksToMs(driftIntervalTicks(state)) / 1000).toFixed(1)} s`);
    lines.push(sch.island ? `Insel: Warnung ${t(sch.island.warnTick)}, Start ${t(sch.island.startTick)}, Ende ${t(sch.island.endTick)}` : 'Insel: –');
    lines.push(sch.sea ? `Ereignis: ${sch.sea.kind} ${t(sch.sea.startTick)}–${t(sch.sea.endTick)}` : 'Ereignis: –');
    lines.push(`Aktiv: ${state.activeSea ?? '–'}`);
    const nx = nextEventPreview(state);
    lines.push(`Nächstes: ${nx ? `${nx.kind} um ${t(nx.startTick)}` : '–'}`);
    lines.push(...(this.actions?.extra?.() ?? []));
    this.info.textContent = lines.join('\n');
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey);
  }
}
