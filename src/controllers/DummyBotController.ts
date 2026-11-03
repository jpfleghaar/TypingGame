import type { Command, GameState, PlayerId } from '../core';
import type { Controller } from './Controller';

/**
 * Platzhalter-Gegner für Schritt 2: tippt fehlerfrei mit konstantem Tempo.
 * Wird in Schritt 3 durch den echten BotController ersetzt.
 */
export class DummyBotController implements Controller {
  private credit = 0;

  constructor(
    readonly playerId: PlayerId,
    private readonly charsPerTick: number,
  ) {}

  poll(state: Readonly<GameState>): Command[] {
    const p = state.players[this.playerId];
    if (!p.alive || p.stack.length === 0) return [];
    this.credit += this.charsPerTick;
    const cmds: Command[] = [];
    let cursor = p.cursor;
    const text = p.stack[0].text;
    while (this.credit >= 1 && cursor < text.length) {
      this.credit -= 1;
      cmds.push({ type: 'KEY', playerId: this.playerId, key: text[cursor++] });
    }
    return cmds;
  }
}
