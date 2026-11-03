import { ticksToMs, type GameEvent, type GameState, type PlayerId } from '../core';
import type { GameView } from '../ui/gameView';
import type { FxLayer, Point } from './FxLayer';

function center(r: DOMRect): Point {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

/** Punkt auf dem Rand von `r`, der zu `toward` zeigt (Effekte starten nie mitten im Text). */
function edgeToward(r: DOMRect, toward: Point): Point {
  const clampY = (y: number) => Math.min(r.bottom - 10, Math.max(r.top + 10, y));
  const clampX = (x: number) => Math.min(r.right - 10, Math.max(r.left + 10, x));
  if (toward.x < r.left) return { x: r.left - 6, y: clampY(toward.y) };
  if (toward.x > r.right) return { x: r.right + 6, y: clampY(toward.y) };
  return toward.y < r.top ? { x: clampX(toward.x), y: r.top - 6 } : { x: clampX(toward.x), y: r.bottom + 6 };
}

/**
 * Übersetzt Spiel-Events in Hintergrund-Effekte. Liest nur Positionen aus der
 * Ansicht; die Spiellogik weiß von alldem nichts.
 */
const RECENT_WINDOW_MS = 10_000;

export class EffectsBridge {
  /** Fertige Wörter der letzten Sekunden (für "aktuelle" WPM). */
  private recent: { tick: number; chars: number }[] = [];
  private lastTick = 0;

  constructor(
    private readonly fx: FxLayer,
    private readonly view: GameView,
    private readonly me: PlayerId,
  ) {}

  handle(events: GameEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'WORD_CLEARED':
          if (e.playerId === this.me) this.recent.push({ tick: this.lastTick, chars: e.word.text.length });
          break;
        case 'ATTACK_SENT':
          if (e.from === this.me) this.attackTrail(e.to, 'out');
          else if (e.to === this.me) this.attackTrail(e.from, 'in');
          break;
        case 'GARBAGE_ARRIVED':
          if (e.playerId === this.me) {
            this.fx.dangerFlash(0.5);
            this.view.flashBoard();
          }
          break;
        case 'GARBAGE_CANCELLED':
          if (e.playerId === this.me) {
            const b = this.view.boardRect();
            this.fx.burst({ x: b.left - 6, y: b.bottom - 20 }, 'good', 12);
          }
          break;
        case 'COMBO_BROKEN':
          if (e.playerId === this.me && e.combo >= 3) this.fx.dangerFlash(0.3);
          break;
        case 'PLAYER_KO': {
          if (e.playerId === this.me) {
            this.fx.dangerFlash(1);
            break;
          }
          const r = this.view.cardRect(e.playerId);
          if (r) this.fx.burst(center(r), e.by === this.me ? 'good' : 'danger', e.by === this.me ? 28 : 10);
          break;
        }
      }
    }
  }

  frame(state: GameState): void {
    this.lastTick = state.tick;
    this.fx.setExclusion(this.view.boardRect());
    const p = state.players[this.me];
    if (p.alive) this.fx.setIntensity(this.currentWpm(state), p.combo);
    else this.fx.setIntensity(0, 0);
  }

  /** WPM über die letzten 10 s (bzw. seit Rundenstart, falls kürzer). */
  private currentWpm(state: GameState): number {
    const nowMs = ticksToMs(state.tick, state.config);
    this.recent = this.recent.filter((r) => nowMs - ticksToMs(r.tick, state.config) <= RECENT_WINDOW_MS);
    const windowMs = Math.max(3000, Math.min(RECENT_WINDOW_MS, nowMs));
    const chars = this.recent.reduce((s, r) => s + r.chars, 0);
    return chars / 5 / (windowMs / 60_000);
  }

  private attackTrail(other: PlayerId, dir: 'in' | 'out'): void {
    const card = this.view.cardRect(other);
    if (!card) return;
    const board = this.view.boardRect();
    const cardC = center(card);
    const boardP = edgeToward(board, cardC);
    // Spur fliegt bis ins Innere der Karte (auf Höhe des Stapel-Balkens)
    const cardP = { x: cardC.x + (boardP.x < cardC.x ? -card.width * 0.2 : card.width * 0.2), y: cardC.y };
    if (dir === 'out') this.fx.trail(boardP, cardP, 'good', () => this.view.flashCard(other, 'good'));
    else this.fx.trail(cardP, boardP, 'danger');
  }
}
