import {
  createRng,
  deriveSeed,
  gaussian,
  next,
  pendingGarbage,
  ticksToMs,
  type Command,
  type GameState,
  type PlayerId,
  type PlayerState,
  type RngState,
} from '../core';
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
  /** Spielzeit (ms), seit der der Bot angreifen will (Reaktionszeit); -1 = gerade nicht. */
  private readySince = -1;

  constructor(
    readonly playerId: PlayerId,
    readonly profile: BotProfile,
    seed: number,
  ) {
    this.rng = createRng(deriveSeed(seed, 5000 + playerId));
    this.nextKeyAt = 400 + next(this.rng) * 900; // Startverzögerung
  }

  /**
   * Punkte ausgeben – angreifen, abwehren oder sparen. Sieht dabei nur, was ein
   * Mensch auch sieht: eigene Punkte, eigener Stapel, Spam-Warnung, Füllstand der Gegner.
   */
  private decide(state: Readonly<GameState>, p: Readonly<PlayerState>, now: number): Command[] {
    const cfg = state.config;
    const incoming = pendingGarbage(p.incoming);
    const cost = cfg.defense.pointsPerWord;

    // 1. Abwehr: pro Paket einmal entscheiden, kurz vor dem Einschlag
    if (incoming > 0 && p.points >= cost) {
      const first = p.incoming.reduce((a, b) => (a.arriveTick <= b.arriveTick ? a : b));
      const msLeft = ticksToMs(first.arriveTick - state.tick, cfg);
      if (msLeft < 1500 && !this.decided.has(first.id)) {
        this.decided.add(first.id);
        // Würde der Einschlag den Stapel (fast) überlaufen lassen, wehrt jeder ab.
        const critical = p.stack.length + incoming > cfg.stackMax - 2;
        if (critical || next(this.rng) < this.profile.defenseRate) {
          this.readySince = -1;
          return [{ type: 'DEFEND', playerId: this.playerId }];
        }
      }
    }

    // 2. Angriff oder sparen?
    if (!this.wantsAttack(state, p, incoming)) {
      this.readySince = -1;
      return [];
    }
    if (this.readySince < 0) this.readySince = now;
    if (now - this.readySince < this.profile.sendDelayMs) return [];
    this.readySince = -1;
    return [{ type: 'SEND_ATTACK', playerId: this.playerId }];
  }

  private wantsAttack(state: Readonly<GameState>, p: Readonly<PlayerState>, incoming: number): boolean {
    const cfg = state.config;
    if (p.points <= 0 || p.targetId === null) return false;
    const target = state.players[p.targetId];
    if (!target?.alive) return false;
    const full = p.points >= cfg.points.max;
    // Maximum erreicht: lieber raus damit, als Punkte verfallen zu lassen
    if (full) return true;
    // Müll unterwegs: Punkte für die Abwehr zurückhalten
    if (incoming > 0) return false;
    // Gnadenstoß: Der Angriff würde das Ziel überlaufen lassen
    const amount = p.points * cfg.attack.garbagePerPoint;
    if (target.stack.length + amount > cfg.stackMax) return true;
    // Wird es im eigenen Stapel eng, eine Reserve für die Abwehr behalten
    const tight = p.stack.length >= cfg.stackMax - 4;
    const need = this.profile.attackAt + (tight ? this.profile.reserve : 0);
    return p.points >= Math.min(cfg.points.max, need);
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

    cmds.push(...this.decide(state, p, now));

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
