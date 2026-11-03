import type { Command, GameEvent, GameState, ShipId } from '../core';

/**
 * Ein Controller liefert die Eingaben eines Schiffs. Mensch, Bot und später ein
 * Netzwerk-Spieler implementieren alle dieses Interface. Der Runner fragt jeden
 * Controller einmal pro Tick ab, bevor `step()` läuft.
 *
 * Controller lesen den State nur. Alles, was sie bewirken wollen, geht über
 * Commands, dadurch gelten für alle exakt dieselben Regeln.
 */
export interface Controller {
  readonly ship: ShipId;
  poll(state: Readonly<GameState>): Command[];
  /** Events des letzten Ticks (z. B. für Bot-Reaktionen oder Netzwerk-Sync). */
  onEvents?(events: readonly GameEvent[], state: Readonly<GameState>): void;
  dispose?(): void;
}
