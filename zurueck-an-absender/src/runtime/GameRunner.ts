import { step, TICK_MS, type CommandsByShip, type GameEvent, type GameState } from '../core';
import type { Controller } from '../controllers/Controller';

export interface RunnerHooks {
  /** Nach jedem Logik-Tick mit den Events dieses Ticks. */
  onEvents?(events: GameEvent[], state: GameState): void;
  /** Einmal pro Bildschirm-Frame; alpha = Anteil bis zum nächsten Tick (0..1) für Interpolation. */
  onFrame?(state: GameState, alpha: number, now: number): void;
}

/**
 * Feste Tick-Rate (60 Hz) unabhängig von der Bildwiederholrate. Pro Tick werden
 * alle Controller abgefragt, dann läuft `step()`. Rendering liest nur.
 */
export class GameRunner {
  private acc = 0;
  private last = 0;
  private raf = 0;
  private running = false;

  constructor(
    public state: GameState,
    private controllers: [Controller, Controller],
    private hooks: RunnerHooks = {},
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const frame = (now: number) => {
      if (!this.running) return;
      this.acc += Math.min(250, now - this.last);
      this.last = now;
      while (this.acc >= TICK_MS) {
        this.tick();
        this.acc -= TICK_MS;
      }
      this.hooks.onFrame?.(this.state, this.acc / TICK_MS, now);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private tick(): void {
    const cmds: CommandsByShip = [this.controllers[0].poll(this.state), this.controllers[1].poll(this.state)];
    const events = step(this.state, cmds);
    this.dispatch(events);
  }

  private dispatch(events: GameEvent[]): void {
    for (const c of this.controllers) c.onEvents?.(events, this.state);
    this.hooks.onEvents?.(events, this.state);
  }

  /** Debug-Eingriffe (z. B. Insel auslösen). Events gehen an alle Zuhörer. */
  debug(fn: (state: GameState, events: GameEvent[]) => void): void {
    const events: GameEvent[] = [];
    fn(this.state, events);
    this.dispatch(events);
  }

  dispose(): void {
    this.stop();
    for (const c of this.controllers) c.dispose?.();
  }
}
