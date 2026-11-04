import { DEFAULT_CONFIG, msToTicks, ticksToMs, type GameConfig } from './config';
import { applyBadgeBonus, cancelIncoming, comboAttack, pendingGarbage } from './garbage';
import { createRng, deriveSeed } from './rng';
import { computeTarget } from './targeting';
import {
  TARGET_STRATEGIES,
  type Command,
  type GameEvent,
  type GameState,
  type PlayerId,
  type PlayerSetup,
  type PlayerState,
  type Word,
} from './types';
import type { WordBank } from './words/wordBank';
import { drawLongWord, drawWord, mixCase, remember, tierWeights } from './words/wordSource';

export interface CreateGameOptions {
  seed: number;
  players: PlayerSetup[];
  bank: WordBank;
  config?: GameConfig;
}

function emptyStats(): PlayerState['stats'] {
  return {
    correctKeys: 0,
    errorKeys: 0,
    wordsCleared: 0,
    charsCleared: 0,
    attacksSent: 0,
    garbageSent: 0,
    attacksReceived: 0,
    garbageReceived: 0,
    garbageCancelled: 0,
    kos: 0,
    maxCombo: 0,
  };
}

function makeWord(state: GameState, text: string, garbage: boolean): Word {
  return { id: state.nextWordId++, text, garbage, hadError: false, errors: 0, startTick: -1 };
}

/** Abstand bis zum nächsten neuen Wort, abhängig von der Rundenzeit. */
export function spawnIntervalMs(elapsedMs: number, cfg: GameConfig): number {
  const s = cfg.spawn;
  if (elapsedMs <= s.rampDurationMs) {
    const k = Math.pow(elapsedMs / s.rampDurationMs, s.rampCurve);
    return s.startIntervalMs + (s.endIntervalMs - s.startIntervalMs) * k;
  }
  const overtimeMin = (elapsedMs - s.rampDurationMs) / 60_000;
  return Math.max(s.absoluteMinIntervalMs, s.endIntervalMs * Math.pow(s.overtimeFactorPerMinute, overtimeMin));
}

/** Rundenfortschritt 0..1 (für die Wortschwierigkeit). */
function progress(state: GameState): number {
  return ticksToMs(state.tick, state.config) / state.config.spawn.rampDurationMs;
}

/**
 * Wort Nr. `i` der gemeinsamen Folge. Die Folge wächst bei Bedarf – sobald der
 * schnellste Spieler ein neues Wort braucht. Alle Spieler bekommen dieselben
 * Wörter in derselben Reihenfolge, nur eben zu unterschiedlichen Zeitpunkten.
 */
function wordAt(state: GameState, bank: WordBank, i: number): string {
  while (state.sequence.length <= i) {
    const w = drawWord(bank, state.wordRng, state.recentWords, tierWeights(state.config, progress(state)));
    remember(state.recentWords, w, state.config.words.noRepeatWindow);
    state.sequence.push(w);
  }
  return state.sequence[i];
}

/** Legt das nächste Wort der Folge oben auf den Stapel eines Spielers. */
function giveNextWord(state: GameState, bank: WordBank, p: PlayerState, events: GameEvent[] | null): void {
  const word = makeWord(state, wordAt(state, bank, p.seqIndex++), false);
  p.stack.push(word);
  events?.push({ type: 'WORD_SPAWNED', playerId: p.id, word });
}

export function createGame(opts: CreateGameOptions): GameState {
  const config = opts.config ?? DEFAULT_CONFIG;
  const state: GameState = {
    tick: 0,
    seed: opts.seed >>> 0,
    config,
    rng: createRng(deriveSeed(opts.seed, 1)),
    wordRng: createRng(deriveSeed(opts.seed, 2)),
    recentWords: [],
    sequence: [],
    spawnCount: 0,
    nextSpawnTick: msToTicks(spawnIntervalMs(0, config), config),
    nextWordId: 1,
    nextGarbageId: 1,
    players: [],
    finished: false,
    winnerId: null,
  };
  state.players = opts.players.map((setup, id) => ({
    id,
    name: setup.name,
    alive: true,
    stack: [],
    cursor: 0,
    combo: 0,
    badges: 0,
    strategy: setup.strategy ?? 'random',
    targetId: null,
    retargetTick: 0,
    seqIndex: 0,
    pendingAttack: null,
    incoming: [],
    lastHitBy: null,
    lastHitTick: -Infinity,
    koTick: -1,
    koBy: null,
    placement: 0,
    garbageRng: createRng(deriveSeed(opts.seed, 1000 + id)),
    recentGarbage: [],
    stats: emptyStats(),
    wordLog: [],
  }));
  for (let i = 0; i < config.initialWords; i++) {
    for (const p of state.players) giveNextWord(state, opts.bank, p, null);
  }
  updateTargets(state, []);
  return state;
}

function aliveCount(state: GameState): number {
  return state.players.reduce((n, p) => n + (p.alive ? 1 : 0), 0);
}

/* ---------- Eingaben ---------- */

/**
 * Nimmt die `n` längsten Wörter aus dem Stapel des Angreifers (das aktive Wort
 * bleibt). Fehlen Wörter, wird mit langen Wörtern aus der Liste aufgefüllt.
 */
/**
 * Welche Wörter ein Angriff mit `n` Müllwörtern aus dem Stapel mitnimmt: die
 * längsten, das aktive Wort ausgenommen (bei gleicher Länge das untere zuerst).
 * Wird auch von der Anzeige genutzt (grüne Markierung), damit beides übereinstimmt.
 */
export function selectWordsToSend(p: Readonly<PlayerState>, n: number): Word[] {
  if (n <= 0) return [];
  return p.stack
    .slice(1)
    .map((w, i) => ({ w, i }))
    .sort((a, b) => b.w.text.length - a.w.text.length || a.i - b.i)
    .slice(0, n)
    .map((x) => x.w);
}

/** Wie viele Wörter ein geladener Angriff jetzt tatsächlich verschicken würde (nach Verrechnung). */
export function wordsLeavingWithAttack(p: Readonly<PlayerState>): number {
  if (!p.pendingAttack) return 0;
  return Math.max(0, p.pendingAttack.amount - pendingGarbage(p.incoming));
}

function takeLongestWords(state: GameState, bank: WordBank, p: PlayerState, n: number): string[] {
  const picked = selectWordsToSend(p, n);
  const ids = new Set(picked.map((w) => w.id));
  p.stack = p.stack.filter((w) => !ids.has(w.id));
  const words = picked.map((w) => w.text);
  while (words.length < n) {
    const text = drawLongWord(bank, p.garbageRng, p.recentGarbage);
    remember(p.recentGarbage, text, state.config.words.noRepeatWindow);
    words.push(text);
  }
  return words;
}

function sendAttack(state: GameState, bank: WordBank, p: PlayerState, amount: number, events: GameEvent[]): void {
  const { remaining, cancelled } = cancelIncoming(p.incoming, amount);
  for (const c of cancelled) {
    p.stats.garbageCancelled += c.amount;
    events.push({ type: 'GARBAGE_CANCELLED', playerId: p.id, from: c.from, amount: c.amount });
  }
  if (remaining <= 0) return;
  let target = p.targetId !== null ? state.players[p.targetId] : undefined;
  if (!target || !target.alive) {
    p.targetId = computeTarget(state, p, currentTargets(state));
    target = p.targetId !== null ? state.players[p.targetId] : undefined;
  }
  if (!target || !target.alive) return;
  const arriveTick = state.tick + msToTicks(state.config.garbage.warningMs, state.config);
  // Die längsten eigenen Wörter wandern zum Gegner (verschoben, nicht kopiert)
  const words = takeLongestWords(state, bank, p, remaining);
  const pkt = { id: state.nextGarbageId++, from: p.id, amount: remaining, words, sentTick: state.tick, arriveTick };
  target.incoming.push(pkt);
  p.stats.attacksSent++;
  p.stats.garbageSent += remaining;
  events.push({ type: 'ATTACK_SENT', from: p.id, to: target.id, amount: remaining, garbageId: pkt.id, arriveTick });
}

/** Zeitpunkt für das nächste automatisch gesendete Wort. */
function nextAutoTick(state: GameState): number {
  const ms = state.config.attack.autoSendIntervalMs;
  return ms <= 0 ? state.tick : state.tick + msToTicks(ms, state.config);
}

/** Angriffs-Pool auffüllen. Der Timer läuft weiter, falls schon Wörter im Pool sind. */
function loadAttack(state: GameState, p: PlayerState, amount: number, events: GameEvent[]): void {
  const pa = p.pendingAttack ?? { amount: 0, loadTick: state.tick, autoTick: nextAutoTick(state) };
  pa.amount += amount;
  p.pendingAttack = pa;
  events.push({ type: 'ATTACK_LOADED', playerId: p.id, amount, total: pa.amount, autoTick: pa.autoTick });
}

/**
 * EIN Wort aus dem Pool abschicken (Leertaste oder Timer). Danach startet der
 * Timer neu. Mit Intervall 0 (klassisch) geht der ganze Pool auf einmal raus.
 */
function releaseAttack(state: GameState, bank: WordBank, p: PlayerState, events: GameEvent[]): void {
  const pa = p.pendingAttack;
  if (!pa || !p.alive) return;
  const all = state.config.attack.autoSendIntervalMs <= 0;
  const n = all ? pa.amount : 1;
  pa.amount -= n;
  pa.autoTick = nextAutoTick(state);
  if (pa.amount <= 0) p.pendingAttack = null;
  sendAttack(state, bank, p, n, events);
}

/** Tab-Abwehr: so viele eingehende Wörter abwehren, wie die Combo bezahlen kann (älteste zuerst). */
function defend(state: GameState, p: PlayerState, events: GameEvent[]): void {
  const cost = state.config.defense.comboCostPerWord;
  const pending = pendingGarbage(p.incoming);
  const n = Math.min(pending, Math.floor(p.combo / cost));
  if (n <= 0) return;
  const { cancelled } = cancelIncoming(p.incoming, n);
  for (const c of cancelled) {
    p.stats.garbageCancelled += c.amount;
    events.push({ type: 'GARBAGE_CANCELLED', playerId: p.id, from: c.from, amount: c.amount });
  }
  p.combo -= n * cost;
  events.push({ type: 'DEFENDED', playerId: p.id, amount: n, comboSpent: n * cost });
}

function clearWord(state: GameState, p: PlayerState, events: GameEvent[]): void {
  const word = p.stack.shift()!;
  p.cursor = 0;
  p.stats.wordsCleared++;
  p.stats.charsCleared += word.text.length;
  p.wordLog.push({
    text: word.text,
    garbage: word.garbage,
    ticks: Math.max(0, state.tick - word.startTick),
    errors: word.errors,
  });
  if (!word.hadError) {
    p.combo++;
    p.stats.maxCombo = Math.max(p.stats.maxCombo, p.combo);
  }
  events.push({ type: 'WORD_CLEARED', playerId: p.id, word, combo: p.combo });
  if (word.hadError) return;
  const base = comboAttack(p.combo, state.config);
  if (base <= 0) return;
  const amount = applyBadgeBonus(base, p.badges, state.config, state.rng);
  events.push({ type: 'ATTACK_TRIGGERED', playerId: p.id, amount, combo: p.combo });
  loadAttack(state, p, amount, events);
}

function handleKey(state: GameState, p: PlayerState, key: string, events: GameEvent[]): void {
  const word = p.stack[0];
  if (!word || key.length === 0) return;
  if (word.startTick < 0) word.startTick = state.tick;
  const expected = word.text[p.cursor];
  if (key === expected) {
    p.stats.correctKeys++;
    events.push({ type: 'KEY_CORRECT', playerId: p.id, wordId: word.id, index: p.cursor });
    p.cursor++;
    if (p.cursor >= word.text.length) clearWord(state, p, events);
    return;
  }
  p.stats.errorKeys++;
  word.hadError = true;
  word.errors++;
  events.push({ type: 'KEY_ERROR', playerId: p.id, wordId: word.id, index: p.cursor, key });
  if (p.combo > 0) {
    events.push({ type: 'COMBO_BROKEN', playerId: p.id, combo: p.combo });
    p.combo = 0;
  }
}

function applyCommand(state: GameState, bank: WordBank, cmd: Command, events: GameEvent[]): void {
  const p = state.players[cmd.playerId];
  if (!p || !p.alive) return;
  switch (cmd.type) {
    case 'KEY':
      handleKey(state, p, cmd.key, events);
      break;
    case 'SEND_ATTACK':
      releaseAttack(state, bank, p, events);
      break;
    case 'DEFEND':
      defend(state, p, events);
      break;
    case 'SET_TARGET': {
      const t = state.players[cmd.targetId];
      if (!t || !t.alive || t.id === p.id) break;
      p.strategy = 'manual';
      p.targetId = t.id;
      events.push({ type: 'TARGET_CHANGED', playerId: p.id, targetId: t.id, strategy: p.strategy });
      break;
    }
    case 'SET_STRATEGY':
    case 'CYCLE_STRATEGY': {
      p.strategy =
        cmd.type === 'SET_STRATEGY'
          ? cmd.strategy
          : TARGET_STRATEGIES[(TARGET_STRATEGIES.indexOf(p.strategy) + 1) % TARGET_STRATEGIES.length];
      p.retargetTick = 0;
      p.targetId = computeTarget(state, p, currentTargets(state));
      // Immer melden, da sich zumindest die Strategie geändert hat.
      events.push({ type: 'TARGET_CHANGED', playerId: p.id, targetId: p.targetId, strategy: p.strategy });
      break;
    }
  }
}

/* ---------- Ablauf pro Tick ---------- */

function arriveGarbage(state: GameState, bank: WordBank, events: GameEvent[]): void {
  for (const p of state.players) {
    if (!p.alive || p.incoming.length === 0) continue;
    const due = p.incoming.filter((g) => g.arriveTick <= state.tick);
    if (due.length === 0) continue;
    p.incoming = p.incoming.filter((g) => g.arriveTick > state.tick);
    // Finale: erst wenn nur noch wenige Spieler übrig sind, wird die Schreibung gemischt
    const finale = aliveCount(state) <= state.config.garbage.finaleAtAlive;
    for (const pkt of due) {
      const words: Word[] = [];
      for (let i = 0; i < pkt.amount; i++) {
        let text = pkt.words?.[i] ?? drawLongWord(bank, p.garbageRng, p.recentGarbage);
        if (finale) text = mixCase(text, p.garbageRng, state.config.garbage.finaleCaseFlips);
        words.push(makeWord(state, text, true));
      }
      // Müll landet direkt über dem aktiven Wort; ist der Stapel leer, wird er selbst aktiv.
      const at = p.stack.length === 0 ? 0 : 1;
      p.stack.splice(at, 0, ...words);
      p.stats.attacksReceived++;
      p.stats.garbageReceived += pkt.amount;
      p.lastHitBy = pkt.from;
      p.lastHitTick = state.tick;
      events.push({ type: 'GARBAGE_ARRIVED', playerId: p.id, from: pkt.from, amount: pkt.amount });
    }
  }
}

function spawnWords(state: GameState, bank: WordBank, events: GameEvent[]): void {
  if (state.tick < state.nextSpawnTick) return;
  state.spawnCount++;
  for (const p of state.players) if (p.alive) giveNextWord(state, bank, p, events);
  const interval = spawnIntervalMs(ticksToMs(state.tick, state.config), state.config);
  state.nextSpawnTick = state.tick + msToTicks(interval, state.config);
}

/** Wer seinen Stapel leer getippt hat, bekommt sofort das nächste Wort – kein Warten auf den Timer. */
function refillEmpty(state: GameState, bank: WordBank, events: GameEvent[]): void {
  for (const p of state.players) if (p.alive && p.stack.length === 0) giveNextWord(state, bank, p, events);
}

function knockOut(state: GameState, victim: PlayerState, events: GameEvent[]): void {
  const placement = aliveCount(state);
  victim.alive = false;
  victim.koTick = state.tick;
  victim.placement = placement;
  victim.incoming = [];
  victim.combo = 0;
  victim.pendingAttack = null;
  const window = msToTicks(state.config.badges.koCreditWindowMs, state.config);
  const killer =
    victim.lastHitBy !== null && state.tick - victim.lastHitTick <= window ? state.players[victim.lastHitBy] : undefined;
  if (killer && killer.alive) {
    victim.koBy = killer.id;
    const gained = victim.badges + state.config.badges.koBonus;
    killer.badges += gained;
    killer.stats.kos++;
    events.push({ type: 'BADGES_GAINED', playerId: killer.id, amount: gained, total: killer.badges });
  }
  events.push({ type: 'PLAYER_KO', playerId: victim.id, by: victim.koBy, placement });
}

function checkOverflow(state: GameState, events: GameEvent[]): void {
  const max = state.config.stackMax;
  // Wer am weitesten übergelaufen ist, fliegt zuerst raus; bei Gleichstand höhere ID zuerst.
  const over = state.players
    .filter((p) => p.alive && p.stack.length > max)
    .sort((a, b) => b.stack.length - a.stack.length || b.id - a.id);
  const minAlive = state.players.length > 1 ? 1 : 0;
  for (const p of over) {
    if (aliveCount(state) <= minAlive) break;
    knockOut(state, p, events);
  }
}

function currentTargets(state: GameState): Map<PlayerId, PlayerId | null> {
  return new Map(state.players.map((p) => [p.id, p.alive ? p.targetId : null]));
}

function updateTargets(state: GameState, events: GameEvent[]): void {
  const snapshot = currentTargets(state);
  for (const p of state.players) {
    if (!p.alive) continue;
    const t = computeTarget(state, p, snapshot);
    if (t !== p.targetId) {
      p.targetId = t;
      events.push({ type: 'TARGET_CHANGED', playerId: p.id, targetId: t, strategy: p.strategy });
    }
  }
}

function checkGameOver(state: GameState, events: GameEvent[]): void {
  const alive = state.players.filter((p) => p.alive);
  const minAlive = state.players.length > 1 ? 1 : 0;
  if (alive.length > minAlive) return;
  state.finished = true;
  const winner = alive[0];
  if (winner) {
    winner.placement = 1;
    state.winnerId = winner.id;
  }
  events.push({ type: 'GAME_OVER', winnerId: state.winnerId });
}

/**
 * Führt genau einen Simulationsschritt aus. Deterministisch: gleicher State +
 * gleiche Befehle ergeben immer denselben Folgezustand und dieselben Events.
 * Befehle werden stabil nach Spieler-ID sortiert, damit die Ankunftsreihenfolge
 * (z. B. über das Netzwerk) keine Rolle spielt.
 */
export function step(state: GameState, bank: WordBank, commands: readonly Command[]): GameEvent[] {
  const events: GameEvent[] = [];
  if (state.finished) return events;
  const ordered = commands
    .map((c, i) => ({ c, i }))
    .sort((a, b) => a.c.playerId - b.c.playerId || a.i - b.i);
  for (const { c } of ordered) applyCommand(state, bank, c, events);
  // Geladene Angriffe, die niemand abgeschickt hat, gehen jetzt automatisch raus
  for (const p of state.players) {
    if (p.alive && p.pendingAttack && state.tick >= p.pendingAttack.autoTick) releaseAttack(state, bank, p, events);
  }
  arriveGarbage(state, bank, events);
  spawnWords(state, bank, events);
  refillEmpty(state, bank, events);
  checkOverflow(state, events);
  updateTargets(state, events);
  checkGameOver(state, events);
  state.tick++;
  return events;
}
