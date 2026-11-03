import type { Command, ShipId } from '../core';
import type { Controller } from './Controller';

const LETTER = /^[a-zäöüß]$/i;

/** Tastatur → Commands. Sammelt Tastendrücke und gibt sie beim nächsten Tick ab. */
export class LocalController implements Controller {
  private queue: Command[] = [];
  private readonly onKey = (e: KeyboardEvent) => this.handle(e);

  constructor(
    public readonly ship: ShipId,
    private target: Window = window,
  ) {
    target.addEventListener('keydown', this.onKey);
  }

  private handle(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || (e.altKey && !e.getModifierState?.('AltGraph'))) return;
    if (e.repeat && e.key !== 'Backspace') return;
    let cmd: Command | null = null;
    if (e.key === 'Backspace') cmd = { type: 'backspace' };
    else if (e.key === 'Escape') cmd = { type: 'cancel' };
    else if (e.key === 'Tab') cmd = { type: 'ballast' };
    else if (e.key === '1' || e.key === '2' || e.key === '3') cmd = { type: 'chooseUpgrade', index: Number(e.key) - 1 };
    else if (LETTER.test(e.key)) cmd = { type: 'key', char: e.key };
    if (!cmd) return;
    e.preventDefault();
    this.queue.push(cmd);
  }

  poll(): Command[] {
    const out = this.queue;
    this.queue = [];
    return out;
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onKey);
  }
}
