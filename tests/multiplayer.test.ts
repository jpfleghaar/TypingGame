import { describe, expect, it } from 'vitest';
import { step } from '../src/core';
import { createMatch } from '../src/net/match';
import { deserializeState, hashState, sanitizeCommand, serializeState, type ServerMsg } from '../src/net/protocol';
import { Lobby, type Conn } from '../server/rooms';

const V = 'test-version';

class StubConn implements Conn {
  msgs: ServerMsg[] = [];
  send(msg: ServerMsg): void {
    this.msgs.push(msg);
  }
  last<T extends ServerMsg['t']>(t: T): Extract<ServerMsg, { t: T }> {
    const m = [...this.msgs].reverse().find((x) => x.t === t);
    if (!m) throw new Error(`keine Nachricht ${t}`);
    return m as Extract<ServerMsg, { t: T }>;
  }
  all<T extends ServerMsg['t']>(t: T): Extract<ServerMsg, { t: T }>[] {
    return this.msgs.filter((x) => x.t === t) as Extract<ServerMsg, { t: T }>[];
  }
}

function setup() {
  let now = 0;
  let r = 0.1;
  const lobby = new Lobby(
    () => now,
    () => (r = (r * 9301 + 0.49297) % 1),
    V,
  );
  const host = new StubConn();
  const guest = new StubConn();
  lobby.message(host, { t: 'create', name: 'Anna', version: V });
  const code = host.last('lobby').code;
  lobby.message(guest, { t: 'join', code, name: 'Ben', version: V });
  return { lobby, host, guest, code, advance: (ms: number) => ((now += ms), lobby.update()) };
}

describe('Mehrspieler: Räume', () => {
  it('Raum erstellen und beitreten – alle sehen dieselbe Spielerliste', () => {
    const { host, guest, code } = setup();
    expect(code).toMatch(/^[A-Z]{4}$/);
    expect(host.last('lobby').players.map((p) => p.name)).toEqual(['Anna', 'Ben']);
    expect(host.last('lobby').you).toBe(0);
    expect(guest.last('lobby').you).toBe(1);
    expect(guest.last('lobby').players[0].host).toBe(true);
  });

  it('unbekannter Code gibt eine Fehlermeldung', () => {
    const { lobby } = setup();
    const c = new StubConn();
    lobby.message(c, { t: 'join', code: 'ZZZZ', name: 'X', version: V });
    expect(c.last('error').msg).toContain('ZZZZ');
  });

  it('nur der Gastgeber darf einstellen und starten; Bots werden auf 11 Spieler gekürzt', () => {
    const { lobby, host, guest } = setup();
    lobby.message(guest, { t: 'start' });
    expect(guest.all('start')).toHaveLength(0);
    lobby.message(host, { t: 'settings', settings: { language: 'en', learn: false, theme: 'mixed', botCount: 10 } });
    expect(guest.last('lobby').settings.language).toBe('en');
    lobby.message(host, { t: 'start' });
    const start = guest.last('start');
    expect(start.you).toBe(1);
    expect(start.setup.humans).toEqual(['Anna', 'Ben']);
    expect(createMatch(start.setup).state.players).toHaveLength(11);
  });

  it('verlässt der Gastgeber den Raum, übernimmt der Nächste; leerer Raum verschwindet', () => {
    const { lobby, host, guest, code } = setup();
    lobby.leave(host);
    expect(guest.last('lobby').players).toEqual([{ name: 'Ben', host: true, inGame: false, online: true }]);
    lobby.leave(guest);
    expect(lobby.rooms.has(code)).toBe(false);
  });

  it('andere Spielversion: Browser soll neu laden', () => {
    const { lobby, code } = setup();
    const old = new StubConn();
    lobby.message(old, { t: 'join', code, name: 'Alt', version: 'alt' });
    expect(old.msgs).toEqual([{ t: 'outdated' }]);
    lobby.message(old, { t: 'create', name: 'Alt', version: 'alt' });
    expect(lobby.rooms.size).toBe(1);
  });
});

describe('Mehrspieler: Wieder-Einstieg', () => {
  it('Verbindung weg: Platz bleibt reserviert und wird nach der Kulanzzeit frei', () => {
    const { lobby, host, guest, code, advance } = setup();
    lobby.disconnect(guest);
    expect(host.last('lobby').players[1]).toMatchObject({ name: 'Ben', online: false });
    advance(59_000);
    expect(host.last('lobby').players).toHaveLength(2);
    advance(2_000);
    expect(host.last('lobby').players).toHaveLength(1);
    lobby.disconnect(host);
    advance(61_000);
    expect(lobby.rooms.has(code)).toBe(false);
  });

  it('zurück mitten in der Runde: gleicher Platz, Runde läuft weiter, Spielstand kommt mit', () => {
    const { lobby, host, guest, code, advance } = setup();
    lobby.message(host, { t: 'start' });
    advance(5300);
    advance(3000);
    const token = guest.last('lobby').token;
    lobby.disconnect(guest);
    advance(2000);
    const back = new StubConn();
    lobby.message(back, { t: 'rejoin', code, token, version: V });
    const start = back.last('start');
    expect(start).toMatchObject({ you: 1, resume: true, countdownMs: 0 });
    const snap = deserializeState(back.last('snapshot').state);
    const room = lobby.rooms.get(code)!;
    expect(snap.tick).toBe(room.game!.state.tick);
    expect(back.last('lobby').players[1].online).toBe(true);
    // bekommt wieder Ticks
    advance(100);
    expect(back.all('ticks').length).toBeGreaterThan(0);
  });

  it('falscher Schlüssel: Platz nicht frei', () => {
    const { lobby, code } = setup();
    const c = new StubConn();
    lobby.message(c, { t: 'rejoin', code, token: 'geraten', version: V });
    expect(c.last('error')).toMatchObject({ gone: true });
  });
});

describe('Mehrspieler: Lockstep', () => {
  it('ein Browser, der nur die verteilten Befehle anwendet, hat exakt denselben Spielstand', () => {
    const { lobby, host, guest, advance } = setup();
    lobby.message(host, { t: 'settings', settings: { language: 'de', learn: false, theme: 'mixed', botCount: 4 } });
    lobby.message(host, { t: 'start' });
    const { setup: matchSetup } = guest.last('start');
    const client = createMatch(matchSetup);
    const room = [...lobby.rooms.values()][0];

    advance(5300); // Countdown
    // Ein paar Sekunden spielen, beide Menschen tippen ihr unterstes Wort
    for (let i = 0; i < 300; i++) {
      for (const [conn, id] of [[host, 0], [guest, 1]] as const) {
        const word = room.game!.state.players[id].stack[0];
        if (i % 4 === id && word) {
          const key = word.text[room.game!.state.players[id].cursor] ?? 'x';
          lobby.message(conn, { t: 'cmd', cmds: [{ type: 'KEY', playerId: 99, key }] });
        }
      }
      advance(17);
    }
    // Client spielt die empfangenen Ticks nach
    for (const msg of guest.all('ticks')) {
      const byTick = new Map(msg.cmds);
      while (client.state.tick < msg.upTo) step(client.state, client.bank, byTick.get(client.state.tick) ?? []);
    }
    const server = room.game!.state;
    expect(client.state.tick).toBe(server.tick);
    expect(server.players[1].stats.correctKeys).toBeGreaterThan(10);
    expect(hashState(client.state)).toBe(hashState(server));
    // Prüfsummen wurden mitgeschickt
    expect(guest.all('ticks').some((m) => m.hash)).toBe(true);
  });

  it('Befehle bekommen immer die ID des Absenders; Unsinn wird verworfen', () => {
    expect(sanitizeCommand({ type: 'KEY', playerId: 5, key: 'a' }, 2, 11)).toEqual({ type: 'KEY', playerId: 2, key: 'a' });
    expect(sanitizeCommand({ type: 'KEY', playerId: 2, key: 'abc' }, 2, 11)).toBeNull();
    expect(sanitizeCommand({ type: 'SET_TARGET', targetId: 2 }, 2, 11)).toBeNull();
    expect(sanitizeCommand({ type: 'SET_TARGET', targetId: 12 }, 2, 11)).toBeNull();
    expect(sanitizeCommand({ type: 'DEFEND' }, 3, 11)).toEqual({ type: 'DEFEND', playerId: 3 });
    expect(sanitizeCommand({ type: 'HACK' }, 3, 11)).toBeNull();
  });

  it('Spielstand übersteht die Übertragung (inkl. -Infinity)', () => {
    const { setup: s } = (() => {
      const x = setup();
      x.lobby.message(x.host, { t: 'start' });
      return x.host.last('start');
    })();
    const m = createMatch(s);
    const copy = deserializeState(serializeState(m.state));
    expect(copy.players[0].lastHitTick).toBe(-Infinity);
    expect(hashState(copy)).toBe(hashState(m.state));
  });

  it('sind alle Menschen raus, wird die Runde zu Ende gerechnet und der Raum ist wieder offen', () => {
    const { lobby, host, guest, advance } = setup();
    lobby.message(host, { t: 'start' });
    advance(5300);
    advance(17);
    const room = [...lobby.rooms.values()][0];
    for (const p of room.game!.state.players.slice(0, 2)) p.alive = false; // beide K.O. (vereinfacht)
    advance(17);
    expect(room.game).toBeNull();
    expect(guest.last('lobby').playing).toBe(false);
    const ticks = guest.all('ticks');
    expect(ticks.length).toBeGreaterThan(0);
  });
});
