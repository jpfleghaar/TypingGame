import type { Command, GameState, PlayerId } from '../core';

/**
 * Ein Controller liefert die Eingaben eines Spielers. Mensch, Bot und (später)
 * Netzwerk-Spieler implementieren alle dieses Interface. Der GameRunner fragt
 * jeden Controller einmal pro Tick ab, bevor `step()` läuft.
 *
 * Controller dürfen den State nur LESEN. Alles, was sie bewirken wollen, geht
 * über Commands – dadurch gelten für alle exakt dieselben Regeln.
 */
export interface Controller {
  readonly playerId: PlayerId;
  poll(state: Readonly<GameState>): Command[];
  dispose?(): void;
}
