import { spawnIntervalMs, ticksToMs, wpm, type GameState } from '../core';
import type { BotProfile } from '../controllers/botProfiles';
import type { FrameInfo } from '../runtime/GameRunner';
import { el, STRATEGY_LABEL } from './labels';

/**
 * Debug-Anzeige (F2): Tick-Rate, eingehender Müll, Bot-Profile.
 * Aktualisiert sich nur ein paar Mal pro Sekunde.
 */
export class DebugPanel {
  readonly root = el('aside', 'debug');
  private lastRender = -Infinity;

  constructor(
    private readonly humanId: number,
    private readonly profiles: BotProfile[],
    private readonly seed: number,
  ) {
    this.root.hidden = true;
    document.body.append(this.root);
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  toggle(): void {
    this.root.hidden = !this.root.hidden;
    this.lastRender = -Infinity;
  }

  destroy(): void {
    this.root.remove();
  }

  update(state: GameState, info: FrameInfo): void {
    if (this.root.hidden) return;
    const now = performance.now();
    if (now - this.lastRender < 250) return;
    this.lastRender = now;
    const cfg = state.config;
    const ms = ticksToMs(state.tick, cfg);
    const me = state.players[this.humanId];
    const inFlight = state.players.reduce((s, p) => s + p.incoming.reduce((a, g) => a + g.amount, 0), 0);

    const lines: string[] = [];
    lines.push(
      `<b>Ticks</b> ${info.tps}/s (Soll ${cfg.tickRate}) · Tick ${state.tick} · Seed ${this.seed}`,
      `<b>Spawn</b> alle ${(spawnIntervalMs(ms, cfg) / 1000).toFixed(2)} s · Wörter ${state.spawnCount}`,
      `<b>Müll unterwegs</b> gesamt ${inFlight}`,
    );
    const incoming = [...me.incoming].sort((a, b) => a.arriveTick - b.arriveTick);
    lines.push(
      `<b>Eingehend bei dir</b> ${
        incoming.length === 0
          ? '–'
          : incoming
              .map((g) => `${g.amount}× von ${state.players[g.from].name} in ${(ticksToMs(g.arriveTick - state.tick, cfg) / 1000).toFixed(1)} s`)
              .join(', ')
      }`,
    );

    const short: Record<string, string> = { random: 'Zuf', attackers: 'Angr', weakest: 'Schw', badges: 'Jäg' };
    const rows = this.profiles
      .map((prof, i) => {
        const p = state.players[i + 1];
        const real = wpm(state, p);
        const target = p.targetId !== null ? state.players[p.targetId].name.slice(0, 6) : '–';
        const cls = p.alive ? '' : ' class="dead"';
        const garbage = p.incoming.reduce((a, g) => a + g.amount, 0);
        return `<tr${cls}><td>${prof.name}</td><td>${prof.wpm}/${real.toFixed(0)}</td><td>${(prof.errorRate * 100).toFixed(1)}</td>
          <td title="${STRATEGY_LABEL[p.strategy]}">${short[p.strategy]}</td><td>${target}</td>
          <td>${p.alive ? p.stack.length : `#${p.placement}`}</td><td>${garbage || ''}</td><td>${p.badges || ''}</td></tr>`;
      })
      .join('');
    this.root.innerHTML = `
      <h3>Debug <small>F2</small></h3>
      <p>${lines.join('<br>')}</p>
      <table>
        <tr><th>Bot</th><th title="Soll / Ist">WPM</th><th title="Fehlerquote in %">F%</th><th>Strat</th><th>Ziel</th><th title="Stapelhöhe bzw. K.O.-Platz">St</th><th title="Eingehender Müll">Müll</th><th>★</th></tr>
        ${rows}
      </table>`;
  }
}
