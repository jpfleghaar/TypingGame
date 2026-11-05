// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { spawnIntervalMs, step } from '../src/core';
import { BotController } from '../src/controllers/BotController';
import { generateBotProfiles } from '../src/controllers/botProfiles';
import { createSession, ENDLESS_CONFIG } from '../src/runtime/session';
import { loadRecord, recordKey, submitRecord } from '../src/ui/endlessRecords';
import { GameView } from '../src/ui/gameView';
import { renderMenu } from '../src/ui/menu';
import { renderResults } from '../src/ui/resultsView';

describe('Endlos-Modus', () => {
  beforeEach(() => localStorage.clear());

  it('allein, ohne Gegner, mit Endlos-Tempo', () => {
    const s = createSession({ mode: 'endless', language: 'de', theme: 'mixed', seed: 3, botCount: 10, playerName: 'Ich' });
    expect(s.runner.state.players).toHaveLength(1);
    expect(s.runner.state.config).toBe(ENDLESS_CONFIG);
    s.runner.stop();
  });

  it('wird immer schneller – ohne Ende nach oben', () => {
    const at = (min: number) => spawnIntervalMs(min * 60_000, ENDLESS_CONFIG);
    expect(at(0)).toBeGreaterThan(at(1));
    expect(at(2)).toBeGreaterThan(at(4));
    expect(at(4)).toBeGreaterThan(at(8));
  });

  it('endet, sobald der Posteingang überläuft; gute Tipper halten länger durch', () => {
    const survive = (wpm: number) => {
      const s = createSession({ mode: 'endless', language: 'de', theme: 'mixed', seed: 5, botCount: 0, playerName: 'Bot' });
      const bot = new BotController(0, { ...generateBotProfiles(5, { count: 1, minWpm: 25, maxWpm: 110 })[0], wpm }, 5);
      const st = s.runner.state;
      while (!st.finished && st.tick < 60 * 60 * 20) step(st, s.bank, bot.poll(st));
      s.runner.stop();
      expect(st.finished).toBe(true);
      return st.tick;
    };
    expect(survive(100)).toBeGreaterThan(survive(35));
  });

  it('Rekord: nur bessere Zeiten werden gespeichert, getrennt nach Sprache', () => {
    const de = recordKey('de', false);
    expect(submitRecord(de, { ms: 90_000, wpm: 50, words: 80, date: 'x' })).toEqual({ previous: null, isNew: true });
    expect(submitRecord(de, { ms: 60_000, wpm: 40, words: 50, date: 'y' }).isNew).toBe(false);
    expect(loadRecord(de)?.ms).toBe(90_000);
    expect(submitRecord(de, { ms: 120_000, wpm: 60, words: 99, date: 'z' })).toMatchObject({ isNew: true, previous: { ms: 90_000 } });
    expect(loadRecord(recordKey('en', false))).toBeNull();
    expect(loadRecord(recordKey('de', true))).toBeNull();
  });

  it('Anzeige: Rekord-Kachel wird beim Überholen zur neuen Bestzeit', () => {
    const s = createSession({ mode: 'endless', language: 'de', theme: 'mixed', seed: 3, botCount: 0, playerName: 'Ich' });
    const root = document.createElement('section');
    const view = new GameView(root, 0, s.runner.state, s.themeLabel, undefined, { recordMs: 1000 });
    view.update(s.runner.state, { tps: 60, alpha: 0 });
    const tile = root.querySelector('.record-stat')!;
    expect(tile.textContent).toContain('0:01');
    expect(tile.textContent).toContain('Rekord');
    for (let i = 0; i < 120; i++) s.runner.tickOnce();
    view.update(s.runner.state, { tps: 60, alpha: 0 });
    expect(tile.classList.contains('beaten')).toBe(true);
    expect(tile.textContent).toContain('Neuer Rekord!');
    view.destroy();
    s.runner.stop();
  });

  it('Auswertung zeigt Zeit und Rekord-Vergleich', () => {
    const s = createSession({ mode: 'endless', language: 'de', theme: 'mixed', seed: 3, botCount: 0, playerName: 'Ich' });
    for (let i = 0; i < 600; i++) s.runner.tickOnce();
    const root = document.createElement('section');
    const actions = { again: () => {}, replaySeed: () => {}, menu: () => {} };
    renderResults(root, s.runner.state, 0, { seed: 3, themeLabel: 'x', practice: true, mode: 'endless', endless: { previousMs: 30_000, isNew: false } }, actions);
    expect(root.querySelector('h1')?.textContent).toBe('Durchgehalten: 0:10');
    expect(root.querySelector('.record-line')?.textContent).toContain('dir fehlen noch 0:20');
    renderResults(root, s.runner.state, 0, { seed: 3, themeLabel: 'x', practice: true, mode: 'endless', endless: { previousMs: 5_000, isNew: true } }, actions);
    expect(root.querySelector('.record-line.new')?.textContent).toBe('Neuer Rekord! Vorher: 0:05');
    s.runner.stop();
  });

  it('Menü: Modus "Endlos" startet eine Endlos-Runde und zeigt den Rekord', () => {
    submitRecord(recordKey('de', false), { ms: 185_000, wpm: 60, words: 150, date: 'x' });
    const root = document.createElement('section');
    let started: unknown = null;
    renderMenu(root, (st) => (started = st), { settings: { volume: 0.5, muted: false, reducedFx: false, theme: 'pcb', layout: 'center' } as never, onChange: () => {} }, () => {});
    const endless = [...root.querySelectorAll('.seg button')].find((b) => b.textContent === 'Endlos') as HTMLButtonElement;
    endless.click();
    expect(root.textContent).toContain('Rekord 3:05');
    (([...root.querySelectorAll('button')].find((b) => b.textContent === 'Runde starten')) as HTMLButtonElement).click();
    expect(started).toMatchObject({ mode: 'endless' });
  });
});
