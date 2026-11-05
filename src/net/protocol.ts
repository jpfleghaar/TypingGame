import type { Command, GameState } from '../core';
import type { Language } from '../runtime/session';

/**
 * Nachrichten zwischen Browser und Mehrspieler-Server (JSON über WebSocket).
 *
 * Lockstep: Der Server rechnet die Runde selbst mit, steuert die Bots und
 * verteilt pro Tick die Befehle ALLER Spieler. Jeder Browser wendet genau diese
 * Befehle an und kommt so zum selben Spielstand. Regelmäßig schickt der Server
 * eine Prüfsumme mit; weicht ein Browser ab, holt er sich den Spielstand neu.
 */

/** Größte Spielerzahl einer Runde (Menschen + Bots) – passend zu P1–P10 der Platine. */
export const MAX_PLAYERS = 11;
/** Länge eines Raum-Codes. */
export const ROOM_CODE_LENGTH = 4;
/** So lange (ms) bleibt der Platz nach einem Verbindungsabbruch reserviert. */
export const REJOIN_GRACE_MS = 60_000;
/** Alle so vielen Ticks schickt der Server eine Prüfsumme des Spielstands. */
export const HASH_EVERY_TICKS = 120;

/** Was der Gastgeber in der Lobby einstellt. */
export interface RoomSettings {
  language: Language;
  learn: boolean;
  /** Themen-ID, "mixed" oder "random". */
  theme: string;
  /** Gewünschte Zahl Bots; wird gekürzt, damit alle zusammen höchstens MAX_PLAYERS sind. */
  botCount: number;
}

/** Alles, was jeder Browser braucht, um dieselbe Runde aufzubauen. */
export interface MatchSetup extends RoomSettings {
  seed: number;
  /** Namen der Menschen; Spieler-ID = Index. Bots folgen danach. */
  humans: string[];
}

export interface LobbyPlayer {
  name: string;
  host: boolean;
  /** Spielt in der laufenden Runde mit (false = wartet auf die nächste). */
  inGame: boolean;
  /** Verbindung steht (false = kurz weg, Platz bleibt reserviert). */
  online: boolean;
}

export type ClientMsg =
  | { t: 'create'; name: string; version: string }
  | { t: 'join'; code: string; name: string; version: string }
  /** Nach Verbindungsabbruch oder Neuladen: zurück auf den eigenen Platz. */
  | { t: 'rejoin'; code: string; token: string; version: string }
  | { t: 'settings'; settings: RoomSettings }
  | { t: 'start' }
  | { t: 'cmd'; cmds: Command[] }
  | { t: 'resync' }
  | { t: 'leave' };

export type ServerMsg =
  /** `gone`: Raum oder Platz gibt es nicht mehr (z. B. Server neu gestartet). */
  | { t: 'error'; msg: string; gone?: boolean }
  /** Browser hat eine andere Spielversion als der Server – Seite neu laden. */
  | { t: 'outdated' }
  | {
      t: 'lobby';
      code: string;
      /** Eigener Platz in der Spielerliste. */
      you: number;
      /** Geheimer Schlüssel für `rejoin` (nur für den eigenen Platz). */
      token: string;
      players: LobbyPlayer[];
      settings: RoomSettings;
      /** Läuft gerade eine Runde (dann kann niemand neu beitreten)? */
      playing: boolean;
    }
  /** `resume`: Wieder-Einstieg in eine laufende Runde, danach folgt ein `snapshot`. */
  | { t: 'start'; setup: MatchSetup; you: number; countdownMs: number; resume?: boolean }
  /** Befehle für alle Ticks bis einschließlich `upTo - 1`; fehlende Ticks hatten keine Befehle. */
  | { t: 'ticks'; upTo: number; cmds: [number, Command[]][]; hash?: [number, number] }
  | { t: 'snapshot'; state: string };

/* ---------- Spielstand als Text (für Prüfsumme und Neu-Synchronisieren) ---------- */

// JSON kennt kein ±Infinity (steckt z. B. in lastHitTick) – als Text kodieren.
const replacer = (_k: string, v: unknown) => (v === Infinity ? '∞' : v === -Infinity ? '-∞' : v);
const reviver = (_k: string, v: unknown) => (v === '∞' ? Infinity : v === '-∞' ? -Infinity : v);

export function serializeState(state: GameState): string {
  return JSON.stringify(state, replacer);
}

export function deserializeState(text: string): GameState {
  return JSON.parse(text, reviver) as GameState;
}

/** FNV-1a über den kompletten Spielstand. */
export function hashState(state: GameState): number {
  const s = serializeState(state);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Nur Befehle annehmen, die ein Spieler wirklich senden kann – mit seiner eigenen ID. */
export function sanitizeCommand(raw: unknown, playerId: number, playerCount: number): Command | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  switch (c.type) {
    case 'KEY':
      return typeof c.key === 'string' && c.key.length === 1 ? { type: 'KEY', playerId, key: c.key } : null;
    case 'CYCLE_STRATEGY':
    case 'SEND_ATTACK':
    case 'DEFEND':
      return { type: c.type, playerId };
    case 'SET_TARGET': {
      const t = c.targetId;
      return Number.isInteger(t) && (t as number) >= 0 && (t as number) < playerCount && t !== playerId
        ? { type: 'SET_TARGET', playerId, targetId: t as number }
        : null;
    }
    default:
      return null;
  }
}
