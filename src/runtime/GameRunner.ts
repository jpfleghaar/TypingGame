import { step, type Command, type GameEvent, type GameState, type WordBank } from '../core';
import type { Controller } from '../controllers/Controller';

export interface TickRecord {
  tick: number;
  commands: Command[];
}

type EventListener = (events: GameEvent[], state: GameState) => void;
type FrameListener = (state: GameState, info: FrameInfo) => void;

export interface FrameInfo {
  /** Gemessene Ticks pro Sekunde (für den Debug-Modus). */
  tps: number;
  /** Anteil bis zum nächsten Tick (0..1), für weiche Animationen. */
  alpha: number;
}

/**
 * Echtzeit-Schleife mit festem Zeitschritt. Fragt pro Tick alle Controller ab,
 * ruft `step()` auf und verteilt die Events an UI, Effekte und Sound.
 *
 * Alle Befehle werden mit Tick-Nummer protokolliert (`log`). Seed + log reichen,
 * um eine Runde exakt nachzuspielen – und genau dieses Format würde später auch
 * über das Netzwerk verschickt.
 */
export class GameRunner {
  readonly log: TickRecord[] = [];
  private eventListeners: EventListener[] = [];
  private frameListeners: FrameListener[] = [];
  private raf = 0;
  private last = 0;
  private acc = 0;
  private running = false;
  private tpsWindow: number[] = [];

  constructor(
    readonly state: GameState,
    readonly bank: WordBank,
    readonly controllers: Controller[],
  ) {}

  get tickMs(): number {
    return 1000 / this.state.config.tickRate;
  }

  onEvents(cb: EventListener): void {
    this.eventListeners.push(cb);
  }

  onFrame(cb: FrameListener): void {
    this.frameListeners.push(cb);
  }

  start(): void {
    if (this.running) return;
    // Alles, was vor dem Start getippt wurde (Countdown), zählt nicht.
    for (const c of this.controllers) c.reset?.();
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  /** Anhalten ohne Abmelden der Controller; weiter mit start() (verwirft Eingaben aus der Pause). */
  pause(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  get isRunning(): boolean {
    return this.running;
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    for (const c of this.controllers) c.dispose?.();
  }

  /** Ein einzelner Simulationsschritt (auch für Tests/Headless nutzbar). */
  tickOnce(): GameEvent[] {
    const commands = this.controllers.flatMap((c) => c.poll(this.state));
    if (commands.length > 0) this.log.push({ tick: this.state.tick, commands });
    const events = step(this.state, this.bank, commands);
    if (events.length > 0) for (const cb of this.eventListeners) cb(events, this.state);
    return events;
  }

  private frame = (now: number): void => {
    if (!this.running) return;
    // Nach Tab-Wechsel o. ä. nicht hunderte Ticks nachholen: Spiel pausiert effektiv.
    this.acc += Math.min(now - this.last, 250);
    this.last = now;
    while (this.acc >= this.tickMs && !this.state.finished) {
      this.tickOnce();
      this.acc -= this.tickMs;
      this.tpsWindow.push(now);
    }
    while (this.tpsWindow.length > 0 && now - this.tpsWindow[0] > 1000) this.tpsWindow.shift();
    const info = { tps: this.tpsWindow.length, alpha: this.acc / this.tickMs };
    for (const cb of this.frameListeners) cb(this.state, info);
    if (this.state.finished) {
      this.running = false;
      return;
    }
    this.raf = requestAnimationFrame(this.frame);
  };
}
