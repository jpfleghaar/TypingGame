import type { Command, GameState, PlayerId } from '../core';
import type { Controller } from '../controllers/Controller';
import type { TickGate } from '../runtime/GameRunner';
import { deserializeState, hashState, type ClientMsg, type ServerMsg } from './protocol';

/** WebSocket zum Mehrspieler-Server (gleiche Adresse wie die Seite, Pfad /ws). */
export class NetClient {
  private ws: WebSocket | null = null;
  private queue: ClientMsg[] = [];
  onMessage: (msg: ServerMsg) => void = () => {};
  /** Verbindung verloren oder nicht möglich. */
  onClose: (reason: string) => void = () => {};

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private connect(): WebSocket {
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) return this.ws;
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
    const ws = new WebSocket(url);
    let opened = false;
    ws.onopen = () => {
      opened = true;
      for (const m of this.queue.splice(0)) ws.send(JSON.stringify(m));
    };
    ws.onmessage = (e) => {
      try {
        this.onMessage(JSON.parse(String(e.data)) as ServerMsg);
      } catch (err) {
        console.error(err);
      }
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.queue = [];
      this.onClose(
        opened
          ? 'Die Verbindung zum Server ist abgebrochen.'
          : 'Kein Mehrspieler-Server erreichbar. Läuft „npm run server“?',
      );
    };
    this.ws = ws;
    return ws;
  }

  send(msg: ClientMsg): void {
    const ws = this.connect();
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    else this.queue.push(msg);
  }

  close(): void {
    const ws = this.ws;
    this.ws = null;
    this.queue = [];
    ws?.close();
  }
}

/**
 * Liefert dem GameRunner die Befehle, die der Server pro Tick verteilt hat,
 * und gibt den Takt vor: gerechnet wird nur, was der Server freigegeben hat.
 */
export class NetFeed implements Controller, TickGate {
  readonly playerId: PlayerId = -1;
  private upTo = 0;
  private cmds = new Map<number, Command[]>();
  private hashes = new Map<number, number>();
  private resyncing = false;
  /** Zahl der erkannten Abweichungen (für die Debug-Anzeige). */
  desyncs = 0;
  /**
   * Eigene Tastendrücke, die zum Server unterwegs und noch nicht im Spiel sind.
   * Die Anzeige zeigt sie schon vorab an, damit sich das Tippen nicht verzögert anfühlt.
   */
  readonly pendingKeys: string[] = [];

  constructor(
    private readonly requestResync: () => void,
    /** Eigene Spieler-ID (für die Vorab-Anzeige). */
    private readonly you = -1,
  ) {}

  /** Eigene Befehle wurden an den Server geschickt. */
  sent(cmds: readonly Command[]): void {
    for (const c of cmds) if (c.type === 'KEY') this.pendingKeys.push(c.key);
  }

  push(msg: Extract<ServerMsg, { t: 'ticks' }>): void {
    for (const [tick, c] of msg.cmds) this.cmds.set(tick, c);
    if (msg.hash) this.hashes.set(msg.hash[0], msg.hash[1]);
    this.upTo = Math.max(this.upTo, msg.upTo);
  }

  /** Spielstand vom Server übernehmen (nach einer Abweichung). */
  applySnapshot(state: GameState, text: string): void {
    const fresh = deserializeState(text);
    Object.assign(state, fresh);
    for (const t of [...this.cmds.keys()]) if (t < state.tick) this.cmds.delete(t);
    for (const t of [...this.hashes.keys()]) if (t <= state.tick) this.hashes.delete(t);
    this.upTo = Math.max(this.upTo, state.tick);
    this.pendingKeys.length = 0;
    this.resyncing = false;
  }

  /** Wie viele Ticks der Browser dem Server hinterherhinkt. */
  lag(state: Readonly<GameState>): number {
    return this.upTo - state.tick;
  }

  available(): number {
    return this.resyncing ? 0 : this.upTo;
  }

  poll(state: Readonly<GameState>): Command[] {
    const c = this.cmds.get(state.tick) ?? [];
    this.cmds.delete(state.tick);
    for (const cmd of c) if (cmd.type === 'KEY' && cmd.playerId === this.you) this.pendingKeys.shift();
    return c;
  }

  afterTick(state: GameState): void {
    const expected = this.hashes.get(state.tick);
    if (expected === undefined) return;
    this.hashes.delete(state.tick);
    if (hashState(state) !== expected && !this.resyncing) {
      this.desyncs++;
      this.resyncing = true;
      this.requestResync();
    }
  }
}
