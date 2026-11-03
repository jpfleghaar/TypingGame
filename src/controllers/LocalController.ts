import type { Command, GameState, PlayerId } from '../core';
import type { Controller } from './Controller';

/** Tastatur-Spieler. Sammelt Tastendrücke und gibt sie beim nächsten Tick ab. */
export class LocalController implements Controller {
  private buffer: Command[] = [];

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
      this.buffer.push({ type: 'CYCLE_STRATEGY', playerId: this.playerId });
      return;
    }
    // Nur druckbare Einzelzeichen; "Dead", "Shift", "F2" usw. werden ignoriert.
    if (e.key.length !== 1 || e.key === ' ' || e.repeat) return;
    e.preventDefault();
    this.buffer.push({ type: 'KEY', playerId: this.playerId, key: e.key });
  };

  poll(_state: Readonly<GameState>): Command[] {
    const out = this.buffer;
    this.buffer = [];
    return out;
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onKey);
  }
}
