import { createRng, deriveSeed, gaussian, next, ticksToMs, type Command, type GameState, type PlayerId, type RngState } from '../core';
import type { Controller } from './Controller';
import { neighborKey, type BotProfile } from './botProfiles';

/**
 * Bot-Spieler. Sieht nur, was ein Mensch auch sieht (eigener Stapel) und
 * handelt ausschließlich über Commands – also exakt nach denselben Regeln.
 *
 * Deterministisch: eigener Zufall aus dem Runden-Seed, Timing in Spielzeit
 * (Ticks), nicht in Echtzeit.
 */
export class BotController implements Controller {
  private rng: RngState;
  /** Spielzeit (ms), zu der der nächste Tastendruck fällig ist. */
  private nextKeyAt = 0;
  private wordId = -1;
  /** Tempo-Faktor für das aktuelle Wort (Tagesform). */
  private wordPace = 1;
  private strategySet = false;
  /** Pakete, über deren Abwehr schon entschieden wurde (pro Paket nur einmal würfeln). */
  private decided = new Set<number>();
  /** Spielzeit (ms) des letzten eigenen Sendens – ein Wort pro Druck. */
  private lastSendAt = -Infinity;

  constructor(
    readonly playerId: PlayerId,
    readonly profile: BotProfile,
    seed: number,
  ) {
    this.rng = createRng(deriveSeed(seed, 5000 + playerId));
    this.nextKeyAt = 400 + next(this.rng) * 900; // Startverzögerung
  }

  /** Mittlerer Tastenabstand in ms bei Ziel-WPM. */
  private get baseMs(): number {
    return 60_000 / (this.profile.wpm * 5);
  }

  private keyDelay(ch: string, garbage: boolean): number {
    let ms = this.baseMs * this.wordPace;
    // Shift (Großbuchstaben), Zahlen und Umlaute sind langsamer.
    if (ch !== ch.toLowerCase()) ms *= 1.35;
    if (/[0-9]/.test(ch)) ms *= 1.5;
    if (/[äöüß]/i.test(ch)) ms *= 1.2;
    if (garbage) ms *= 1.15;
    const jitter = 1 + gaussian(this.rng) * this.profile.jitter;
    return ms * Math.max(0.35, jitter);
  }

  poll(state: Readonly<GameState>): Command[] {
    const p = state.players[this.playerId];
    if (!p.alive) return [];
    const cmds: Command[] = [];
    if (!this.strategySet) {
      this.strategySet = true;
      if (p.strategy !== this.profile.strategy) {
        cmds.push({ type: 'SET_STRATEGY', playerId: this.playerId, strategy: this.profile.strategy });
      }
    }
    const now = ticksToMs(state.tick, state.config);

    // Pool: pro Leertaste ein Wort, mit Reaktionszeit zwischen den Drücken
    if (p.pendingAttack) {
      const since = Math.max(ticksToMs(p.pendingAttack.loadTick, state.config), this.lastSendAt);
      if (now - since >= this.profile.sendDelayMs) {
        cmds.push({ type: 'SEND_ATTACK', playerId: this.playerId });
        this.lastSendAt = now;
      }
    }
    // Abwehr (wie Tab): pro eingehendem Paket einmal entscheiden, kurz vor dem Einschlag
    if (p.incoming.length > 0 && p.combo >= state.config.defense.comboCostPerWord) {
      const first = p.incoming.reduce((a, b) => (a.arriveTick <= b.arriveTick ? a : b));
      const msLeft = ticksToMs(first.arriveTick - state.tick, state.config);
      if (msLeft < 1500 && !this.decided.has(first.id)) {
        this.decided.add(first.id);
        if (next(this.rng) < this.profile.defenseRate) cmds.push({ type: 'DEFEND', playerId: this.playerId });
      }
    }

    const word = p.stack[0];
    if (!word) {
      this.nextKeyAt = Math.max(this.nextKeyAt, now + this.profile.reactionMs);
      return cmds;
    }
    if (word.id !== this.wordId) {
      // Neues Wort: kurz lesen, Tagesform würfeln.
      if (this.wordId !== -1) this.nextKeyAt = Math.max(this.nextKeyAt, now + this.profile.reactionMs * (0.7 + next(this.rng) * 0.6));
      this.wordId = word.id;
      this.wordPace = Math.max(0.6, 1 + gaussian(this.rng) * this.profile.wordDrift);
    }
    let cursor = p.cursor;
    // Höchstens bis zum Ende des aktuellen Worts; das nächste Wort beginnt im nächsten Tick.
    while (this.nextKeyAt <= now && cursor < word.text.length) {
      const ch = word.text[cursor];
      const errorChance = this.profile.errorRate * (word.garbage ? 1.6 : 1);
      if (next(this.rng) < errorChance) {
        cmds.push({ type: 'KEY', playerId: this.playerId, key: neighborKey(ch, this.rng) });
        this.nextKeyAt += this.keyDelay(ch, word.garbage) + this.profile.errorPauseMs;
        continue;
      }
      cmds.push({ type: 'KEY', playerId: this.playerId, key: ch });
      cursor++;
      this.nextKeyAt += this.keyDelay(word.text[cursor] ?? ch, word.garbage);
    }
    return cmds;
  }
}
