import type { Command, GameState, PlayerId } from '../core';
import type { Controller } from './Controller';

/** Zifferntaste → Gegner-Platz; Tab wird erst beim Abholen je nach Lage entschieden. */
type Pending = Command | { slot: number } | { tab: true };

/**
 * Tastatur-Spieler. Sammelt Tastendrücke und gibt sie beim nächsten Tick ab.
 *
 * - Buchstaben: tippen
 * - Tab: Spam abwehren, wenn welcher unterwegs ist und die Combo reicht – sonst Ziel-Strategie wechseln
 * - Leertaste: geladenen Angriff sofort abschicken
 * - 1–9, 0: Gegner auf Platz 1–10 direkt anvisieren (Wörter enthalten keine Ziffern)
 */
export class LocalController implements Controller {
  private buffer: Pending[] = [];

  constructor(
    readonly playerId: PlayerId,
    private readonly target: Window = window,
  ) {
    this.target.addEventListener('keydown', this.onKey);
  }

  private onKey = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || (e.altKey && !e.getModifierState('AltGraph'))) return;
    if (e.key === 'Tab') {
      e.preventDefault();
      this.buffer.push({ tab: true });
      return;
    }
    // Nur druckbare Einzelzeichen; "Dead", "Shift", "F2" usw. werden ignoriert.
    if (e.key.length !== 1 || e.repeat) return;
    e.preventDefault();
    if (e.key === ' ') {
      this.buffer.push({ type: 'SEND_ATTACK', playerId: this.playerId });
      return;
    }
    if (e.key >= '0' && e.key <= '9') {
      this.buffer.push({ slot: e.key === '0' ? 9 : Number(e.key) - 1 });
      return;
    }
    this.buffer.push({ type: 'KEY', playerId: this.playerId, key: e.key });
  };

  poll(state: Readonly<GameState>): Command[] {
    const out: Command[] = [];
    // Plätze = Gegner in Spieler-Reihenfolge (so sind sie auch auf dem Bildschirm angeordnet)
    const opponents = state.players.filter((p) => p.id !== this.playerId);
    const me = state.players[this.playerId];
    for (const item of this.buffer) {
      if ('tab' in item) {
        const canDefend = me.incoming.length > 0 && me.combo >= state.config.defense.comboCostPerWord;
        out.push(canDefend ? { type: 'DEFEND', playerId: this.playerId } : { type: 'CYCLE_STRATEGY', playerId: this.playerId });
      } else if ('slot' in item) {
        const t = opponents[item.slot];
        if (t) out.push({ type: 'SET_TARGET', playerId: this.playerId, targetId: t.id });
      } else out.push(item);
    }
    this.buffer = [];
    return out;
  }

  reset(): void {
    this.buffer = [];
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onKey);
  }
}
