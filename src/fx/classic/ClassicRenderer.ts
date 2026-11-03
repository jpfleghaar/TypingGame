import type { GameEvent, GameState, PlayerId } from '../../core';
import type { ThemeDef } from '../../theme/themes';
import type { GameView } from '../../ui/gameView';
import { EffectsBridge } from '../effectsBridge';
import { FxLayer } from '../FxLayer';
import type { ThemeRenderer } from '../ThemeRenderer';

/** Der ursprüngliche Stil: Sternen-Partikel, Combo-Rand, Kometen-Spuren. */
export class ClassicRenderer implements ThemeRenderer {
  readonly kind = 'classic' as const;
  private fx: FxLayer;
  private bridge: EffectsBridge | null = null;

  constructor(bg: HTMLCanvasElement, fg: HTMLCanvasElement) {
    this.fx = new FxLayer(bg, fg);
  }

  setTheme(_theme: ThemeDef): void {}

  start(): void {
    this.fx.setSuspended(false);
    this.fx.start();
  }

  stop(): void {
    this.fx.setSuspended(true);
  }

  clear(): void {
    this.fx.clear();
  }

  setMotion(enabled: boolean): void {
    this.fx.setEnabled(enabled);
  }

  attach(view: GameView, me: PlayerId): void {
    this.bridge = new EffectsBridge(this.fx, view, me);
  }

  detach(): void {
    this.bridge = null;
    this.fx.setIntensity(0, 0);
    this.fx.setExclusion(null);
  }

  handle(events: GameEvent[]): void {
    this.bridge?.handle(events);
  }

  frame(state: GameState): void {
    this.bridge?.frame(state);
  }
}
