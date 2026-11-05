import { step, ticksToMs, type Command, type GameState } from '../src/core';
import type { BotController } from '../src/controllers/BotController';
import { createBots, createMatch } from '../src/net/match';
import { GAME_VERSION } from '../src/net/version';
import {
  HASH_EVERY_TICKS,
  REJOIN_GRACE_MS,
  MAX_PLAYERS,
  ROOM_CODE_LENGTH,
  hashState,
  sanitizeCommand,
  serializeState,
  type ClientMsg,
  type MatchSetup,
  type RoomSettings,
  type ServerMsg,
} from '../src/net/protocol';

/** Verbindung zu einem Browser – im Server ein WebSocket, in Tests ein Stub. */
export interface Conn {
  send(msg: ServerMsg): void;
}

interface Member {
  /** null = Verbindung weg, Platz bleibt bis `leftAt + REJOIN_GRACE_MS` reserviert. */
  conn: Conn | null;
  leftAt: number;
  /** Geheimer Schlüssel für den Wieder-Einstieg. */
  token: string;
  name: string;
  /** Spieler-ID in der laufenden Runde; -1 = wartet auf die nächste Runde. */
  playerId: number;
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
/** Wie weit der Server höchstens auf einmal nachrechnet (nach einem Hänger). */
const MAX_CATCH_UP_TICKS = 600;
/** Grenze fürs Zu-Ende-Rechnen, wenn kein Mensch mehr lebt (30 Minuten Spielzeit). */
const FAST_FORWARD_LIMIT_MS = 30 * 60_000;

export const DEFAULT_ROOM_SETTINGS: RoomSettings = { language: 'de', learn: false, theme: 'random', botCount: 10 };

function cleanName(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, 16) : '';
  return s || 'Gast';
}

function cleanSettings(raw: unknown, prev: RoomSettings): RoomSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<RoomSettings>;
  return {
    language: r.language === 'en' ? 'en' : r.language === 'de' ? 'de' : prev.language,
    learn: typeof r.learn === 'boolean' ? r.learn : prev.learn,
    theme: typeof r.theme === 'string' && /^[a-z_-]{1,32}$/i.test(r.theme) ? r.theme : prev.theme,
    botCount: Number.isInteger(r.botCount) ? Math.max(0, Math.min(MAX_PLAYERS - 1, r.botCount as number)) : prev.botCount,
  };
}

/** Eine laufende Runde auf dem Server: rechnet mit, steuert die Bots, sammelt die Befehle. */
export class ServerGame {
  readonly state: GameState;
  private readonly bank;
  private readonly bots: BotController[];
  /** Befehle der Menschen, die seit dem letzten Tick eingegangen sind. */
  private pending: Command[] = [];

  constructor(
    readonly setup: MatchSetup,
    /** Zeitpunkt (ms), zu dem Tick 0 läuft – nach dem Countdown. */
    readonly startAt: number,
  ) {
    const match = createMatch(setup);
    this.state = match.state;
    this.bank = match.bank;
    this.bots = createBots(setup, match);
  }

  get playerCount(): number {
    return this.state.players.length;
  }

  queue(cmd: Command): void {
    this.pending.push(cmd);
  }

  /**
   * Rechnet bis zur aktuellen Zeit weiter. Lebt kein Mensch mehr, wird die Runde
   * sofort zu Ende gerechnet. Liefert die Nachricht für alle Browser (oder null).
   */
  advance(now: number, humansAlive: boolean): Extract<ServerMsg, { t: 'ticks' }> | null {
    const s = this.state;
    if (s.finished) return null;
    const cfg = s.config;
    const due = Math.floor((now - this.startAt) / ticksToMs(1, cfg));
    const target = humansAlive
      ? Math.min(due, s.tick + MAX_CATCH_UP_TICKS)
      : s.tick + Math.ceil(FAST_FORWARD_LIMIT_MS / ticksToMs(1, cfg));
    if (s.tick >= target) return null;
    const cmds: [number, Command[]][] = [];
    let hash: [number, number] | undefined;
    while (s.tick < target && !s.finished) {
      const tickCmds = [...this.pending.splice(0), ...this.bots.flatMap((b) => b.poll(s))];
      if (tickCmds.length > 0) cmds.push([s.tick, tickCmds]);
      step(s, this.bank, tickCmds);
      if (s.tick % HASH_EVERY_TICKS === 0) hash = [s.tick, hashState(s)];
    }
    return { t: 'ticks', upTo: s.tick, cmds, ...(hash ? { hash } : {}) };
  }
}

export class Room {
  members: Member[] = [];
  settings: RoomSettings = { ...DEFAULT_ROOM_SETTINGS };
  game: ServerGame | null = null;

  constructor(readonly code: string) {}

  broadcast(msg: ServerMsg): void {
    for (const m of this.members) m.conn?.send(msg);
  }

  sendLobby(): void {
    const players = this.members.map((m, i) => ({
      name: m.name,
      host: i === 0,
      inGame: this.game !== null && m.playerId >= 0,
      online: m.conn !== null,
    }));
    this.members.forEach((m, you) =>
      m.conn?.send({
        t: 'lobby',
        code: this.code,
        you,
        token: m.token,
        players,
        settings: this.settings,
        playing: this.game !== null,
      }),
    );
  }
}

function newToken(): string {
  return globalThis.crypto.randomUUID();
}

/**
 * Alle Räume eines Servers. Unabhängig vom Transport: `message()` und
 * `disconnect()` werden vom WebSocket-Server aufgerufen, `update()` regelmäßig.
 */
export class Lobby {
  readonly rooms = new Map<string, Room>();
  private readonly roomOf = new Map<Conn, Room>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly random: () => number = Math.random,
    private readonly version: string = GAME_VERSION,
  ) {}

  private newCode(): string {
    for (;;) {
      let code = '';
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += CODE_CHARS[Math.floor(this.random() * CODE_CHARS.length)];
      if (!this.rooms.has(code)) return code;
    }
  }

  message(conn: Conn, msg: ClientMsg): void {
    const room = this.roomOf.get(conn);
    if ((msg.t === 'create' || msg.t === 'join' || msg.t === 'rejoin') && msg.version !== this.version) {
      return conn.send({ t: 'outdated' });
    }
    switch (msg.t) {
      case 'create': {
        this.leave(conn);
        const r = new Room(this.newCode());
        this.rooms.set(r.code, r);
        this.addMember(r, conn, msg.name);
        return;
      }
      case 'join': {
        const code = typeof msg.code === 'string' ? msg.code.trim().toUpperCase() : '';
        const r = this.rooms.get(code);
        if (!r) return conn.send({ t: 'error', msg: `Raum „${code}“ gibt es nicht.` });
        if (r === room) return r.sendLobby();
        if (r.members.length >= MAX_PLAYERS) return conn.send({ t: 'error', msg: 'Der Raum ist voll.' });
        this.leave(conn);
        this.addMember(r, conn, msg.name);
        return;
      }
      case 'rejoin':
        return this.rejoin(conn, msg.code, msg.token);
      case 'leave':
        return this.leave(conn);
    }
    if (!room) return;
    const member = room.members.find((m) => m.conn === conn)!;
    const isHost = room.members[0] === member;
    switch (msg.t) {
      case 'settings':
        if (!isHost || room.game) return;
        room.settings = cleanSettings(msg.settings, room.settings);
        room.sendLobby();
        return;
      case 'start':
        if (isHost && !room.game) this.start(room);
        return;
      case 'cmd': {
        const g = room.game;
        if (!g || member.playerId < 0 || !Array.isArray(msg.cmds)) return;
        for (const raw of msg.cmds.slice(0, 64)) {
          const c = sanitizeCommand(raw, member.playerId, g.playerCount);
          if (c) g.queue(c);
        }
        return;
      }
      case 'resync':
        if (room.game && member.playerId >= 0) conn.send({ t: 'snapshot', state: serializeState(room.game.state) });
        return;
    }
  }

  private addMember(room: Room, conn: Conn, name: unknown): void {
    room.members.push({ conn, leftAt: 0, token: newToken(), name: cleanName(name), playerId: -1 });
    this.roomOf.set(conn, room);
    room.sendLobby();
  }

  /** Zurück auf den reservierten Platz – auch mitten in einer Runde. */
  private rejoin(conn: Conn, rawCode: unknown, token: unknown): void {
    const code = typeof rawCode === 'string' ? rawCode.toUpperCase() : '';
    const room = this.rooms.get(code);
    const member = room?.members.find((m) => m.token === token);
    if (!room || !member) {
      return conn.send({ t: 'error', msg: 'Dein Platz im Raum ist nicht mehr frei.', gone: true });
    }
    if (member.conn && member.conn !== conn) this.roomOf.delete(member.conn);
    const prev = this.roomOf.get(conn);
    if (prev && prev !== room) this.leave(conn);
    member.conn = conn;
    this.roomOf.set(conn, room);
    room.sendLobby();
    const g = room.game;
    if (g && member.playerId >= 0) {
      const countdownMs = Math.max(0, g.startAt - this.now());
      conn.send({ t: 'start', setup: g.setup, you: member.playerId, countdownMs, resume: true });
      conn.send({ t: 'snapshot', state: serializeState(g.state) });
    }
  }

  private start(room: Room): void {
    const setup: MatchSetup = {
      ...room.settings,
      seed: Math.floor(this.random() * 2 ** 31),
      humans: room.members.map((m) => m.name),
    };
    // Countdown im Browser + kleiner Puffer für die Übertragung
    const countdownMs = 5000;
    room.game = new ServerGame(setup, this.now() + countdownMs + 300);
    room.members.forEach((m, i) => {
      m.playerId = i;
      m.conn?.send({ t: 'start', setup, you: i, countdownMs });
    });
    room.sendLobby();
  }

  /** Raum bewusst verlassen: Platz wird sofort frei. */
  leave(conn: Conn): void {
    const room = this.roomOf.get(conn);
    if (!room) return;
    this.roomOf.delete(conn);
    room.members = room.members.filter((m) => m.conn !== conn);
    if (room.members.length === 0) this.rooms.delete(room.code);
    else room.sendLobby();
  }

  /** Verbindung weg: Platz bleibt eine Weile reserviert (Neuladen, WLAN-Wackler). */
  disconnect(conn: Conn): void {
    const room = this.roomOf.get(conn);
    if (!room) return;
    this.roomOf.delete(conn);
    const member = room.members.find((m) => m.conn === conn);
    if (!member) return;
    member.conn = null;
    member.leftAt = this.now();
    room.sendLobby();
  }

  /** Alle laufenden Runden weiterrechnen, neue Ticks verschicken, verwaiste Plätze räumen. */
  update(): void {
    const now = this.now();
    for (const room of [...this.rooms.values()]) {
      const expired = room.members.filter((m) => m.conn === null && now - m.leftAt > REJOIN_GRACE_MS);
      if (expired.length > 0) {
        room.members = room.members.filter((m) => !expired.includes(m));
        if (room.members.length === 0) {
          this.rooms.delete(room.code);
          continue;
        }
        room.sendLobby();
      }
      const g = room.game;
      if (!g) continue;
      const humansAlive = room.members.some((m) => m.playerId >= 0 && g.state.players[m.playerId]?.alive);
      const msg = g.advance(now, humansAlive);
      if (msg) for (const m of room.members) if (m.playerId >= 0) m.conn?.send(msg);
      if (g.state.finished) {
        room.game = null;
        for (const m of room.members) m.playerId = -1;
        room.sendLobby();
      }
    }
  }
}
