// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { step, type Command } from '../src/core';
import { createMatch } from '../src/net/match';
import { NetFeed } from '../src/net/NetClient';
import { hashState, serializeState, type MatchSetup } from '../src/net/protocol';
import { GameRunner } from '../src/runtime/GameRunner';
import { GameView } from '../src/ui/gameView';
import { renderLobby, type LobbyInfo } from '../src/ui/lobbyView';

const SETUP: MatchSetup = { language: 'de', learn: false, theme: 'mixed', botCount: 3, seed: 42, humans: ['Anna', 'Ben'] };

describe('Mehrspieler-Lobby', () => {
  const info = (you: number): LobbyInfo => ({
    t: 'lobby',
    code: 'QUPJ',
    you,
    token: 't',
    playing: false,
    players: [
      { name: 'Anna', host: true, inGame: false, online: true },
      { name: 'Ben', host: false, inGame: false, online: true },
    ],
    settings: { language: 'de', learn: false, theme: 'random', botCount: 10 },
  });

  it('Gastgeber kann einstellen und starten', () => {
    const root = document.createElement('section');
    const hooks = { onSettings: vi.fn(), onStart: vi.fn(), onLeave: vi.fn() };
    renderLobby(root, info(0), hooks);
    expect(root.querySelector('.room-code')?.textContent).toBe('QUPJ');
    expect(root.textContent).toContain('?raum=QUPJ');
    expect(root.textContent).toContain('2 Menschen + 9 Bots');
    const english = [...root.querySelectorAll('.seg button')].find((b) => b.textContent === 'English') as HTMLButtonElement;
    english.click();
    expect(hooks.onSettings).toHaveBeenCalledWith(expect.objectContaining({ language: 'en', learn: false }));
    (([...root.querySelectorAll('button')].find((b) => b.textContent === 'Runde starten')) as HTMLButtonElement).click();
    expect(hooks.onStart).toHaveBeenCalled();
  });

  it('Gäste sehen die Einstellungen nur und warten', () => {
    const root = document.createElement('section');
    renderLobby(root, info(1), { onSettings: vi.fn(), onStart: vi.fn(), onLeave: vi.fn() });
    expect(root.querySelector('.seg')).toBeNull();
    expect(root.textContent).toContain('Warte, bis der Gastgeber');
    expect(root.textContent).not.toContain('Runde starten');
  });
});

describe('GameRunner im Netzwerk-Takt', () => {
  it('rechnet nur bis zum freigegebenen Tick und wendet die Server-Befehle an', () => {
    const server = createMatch(SETUP);
    const client = createMatch(SETUP);
    const feed = new NetFeed(() => {});
    const runner = new GameRunner(client.state, client.bank, [feed], feed);

    // Server: Ben tippt den ersten Buchstaben in Tick 3
    const key = server.state.players[1].stack[0].text[0];
    const cmds: [number, Command[]][] = [];
    for (let t = 0; t < 10; t++) {
      const c: Command[] = t === 3 ? [{ type: 'KEY', playerId: 1, key }] : [];
      step(server.state, server.bank, c);
      if (c.length) cmds.push([t, c]);
    }
    feed.push({ t: 'ticks', upTo: 10, cmds, hash: [10, hashState(server.state)] });

    let rafCb: FrameRequestCallback | null = null;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => ((rafCb = cb), 1));
    runner.start();
    rafCb!(performance.now() + 1000); // auch nach langer Pause nicht über Tick 10 hinaus
    expect(client.state.tick).toBe(10);
    expect(client.state.players[1].cursor).toBe(1);
    expect(feed.desyncs).toBe(0);
    expect(hashState(client.state)).toBe(hashState(server.state));
    runner.stop();
    vi.unstubAllGlobals();
  });

  it('erkennt eine Abweichung, fordert den Spielstand an und übernimmt ihn', () => {
    const server = createMatch(SETUP);
    const client = createMatch(SETUP);
    const resync = vi.fn();
    const feed = new NetFeed(resync);
    for (let t = 0; t < 5; t++) step(server.state, server.bank, []);
    client.state.players[0].points = 7; // Browser ist (künstlich) auseinandergelaufen
    feed.push({ t: 'ticks', upTo: 5, cmds: [], hash: [5, hashState(server.state)] });
    const runner = new GameRunner(client.state, client.bank, [feed], feed);
    for (let i = 0; i < 5; i++) runner.tickOnce();
    expect(resync).toHaveBeenCalledOnce();
    expect(feed.available()).toBe(0); // hält an, bis der Spielstand da ist
    feed.applySnapshot(client.state, serializeState(server.state));
    expect(hashState(client.state)).toBe(hashState(server.state));
    expect(feed.available()).toBe(5);
  });
});

describe('Vorab-Anzeige eigener Tasten', () => {
  it('zeigt getippte Buchstaben sofort und gleicht sie mit der Server-Bestätigung ab', () => {
    const m = createMatch(SETUP);
    const feed = new NetFeed(() => {}, 1);
    const root = document.createElement('section');
    const view = new GameView(root, 1, m.state, m.themeLabel, undefined, { pendingKeys: () => feed.pendingKeys });
    const word = m.state.players[1].stack[0].text;
    const done = () => root.querySelectorAll('.row.active:not(.ghost) .done').length;
    const frame = () => view.update(m.state, { tps: 60, alpha: 0 });

    frame();
    expect(done()).toBe(0);
    feed.sent([{ type: 'KEY', playerId: 1, key: word[0] }, { type: 'KEY', playerId: 1, key: word[1] }]);
    frame();
    expect(done()).toBe(2); // sofort sichtbar, obwohl der Server noch nichts bestätigt hat
    expect(m.state.players[1].cursor).toBe(0);

    // Server bestätigt den ersten Buchstaben
    feed.push({ t: 'ticks', upTo: 1, cmds: [[0, [{ type: 'KEY', playerId: 1, key: word[0] }]]] });
    step(m.state, m.bank, feed.poll(m.state));
    expect(feed.pendingKeys).toEqual([word[1]]);
    frame();
    expect(done()).toBe(2);

    // Ein falscher Buchstabe wird nicht vorab als richtig gezeigt
    feed.sent([{ type: 'KEY', playerId: 1, key: '#' }]);
    frame();
    expect(done()).toBe(2);
    view.destroy();
  });
});
