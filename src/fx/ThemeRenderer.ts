import type { GameEvent, GameState, PlayerId } from '../core';
import type { ThemeDef } from '../theme/themes';
import type { GameView } from '../ui/gameView';

/**
 * Gemeinsame Schnittstelle aller Effekt-Engines (eine pro Theme-Stil).
 * Sie lesen nur den State und reagieren auf Events – die Spiellogik bleibt unberührt.
 */
export interface ThemeRenderer {
  readonly kind: ThemeDef['renderer'];
  /** Theme-Werte übernehmen (Farben, Tempo …). */
  setTheme(theme: ThemeDef): void;
  /** Animationsschleife starten/stoppen. */
  start(): void;
  stop(): void;
  /** Leert beide Canvas-Ebenen (beim Theme-Wechsel). */
  clear(): void;
  /** false = bewegungsreduziert. */
  setMotion(enabled: boolean): void;
  /** Eine Runde beginnt: Ansicht und eigener Spieler. */
  attach(view: GameView, me: PlayerId): void;
  /** Zurück ins Menü/zur Auswertung. */
  detach(): void;
  handle(events: GameEvent[]): void;
  frame(state: GameState): void;
}
