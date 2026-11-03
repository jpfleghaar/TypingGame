// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { buildLearnBank, type VocabData } from '../src/core';
import vocab from '../src/data/words/vocab.json';
import { CALM_CONFIG, createSession } from '../src/runtime/session';
import { GameView } from '../src/ui/gameView';

const V = vocab as unknown as VocabData;

describe('Vokabeln', () => {
  it('genug Wortpaare pro Thema (> Wiederholungs-Fenster)', () => {
    let total = 0;
    for (const [id, t] of Object.entries(V.themes)) {
      expect(t.pairs.length, id).toBeGreaterThan(60);
      total += t.pairs.length;
    }
    expect(total).toBeGreaterThanOrEqual(500);
  });

  it('Deutsch lernen: deutsche Wörter tippen, Englisch als Hilfe', () => {
    const bank = buildLearnBank(V, 'de', 'tiere');
    expect(bank.translations!['Schmetterling']).toBe('butterfly');
    expect([...bank.short, ...bank.medium, ...bank.long]).toContain('Schmetterling');
    expect([...bank.short, ...bank.medium, ...bank.long]).not.toContain('butterfly');
  });

  it('Englisch lernen: englische Wörter tippen, Deutsch als Hilfe', () => {
    const bank = buildLearnBank(V, 'en', 'mixed');
    expect(bank.translations!['butterfly']).toBe('Schmetterling');
    const typed = [...bank.short, ...bank.medium, ...bank.long];
    expect(typed.every((w) => bank.translations![w])).toBe(true);
  });
});

describe('Lern-Sessions', () => {
  it('Battle Royale mit Lernwörtern: Bots spielen mit, Übersetzungen werden angezeigt', () => {
    const s = createSession({ mode: 'royale', learn: true, language: 'en', theme: 'kueche', seed: 3, botCount: 18, playerName: 'Ich' });
    expect(s.runner.state.players).toHaveLength(19);
    const root = document.createElement('section');
    const view = new GameView(root, s.humanId, s.runner.state, s.themeLabel, s.bank.translations);
    view.update(s.runner.state, { tps: 60, alpha: 0 });
    const active = root.querySelector('.row.active')!;
    const word = s.runner.state.players[0].stack[0].text;
    expect(active.querySelector('.hint-tr')?.textContent).toBe(s.bank.translations![word]);
    // Die Hilfe ist kein Teil des zu tippenden Worts
    expect(active.querySelectorAll('.ch')).toHaveLength(word.length);
    s.runner.stop();
  });

  it('In Ruhe: keine Gegner, langsameres Tempo', () => {
    const s = createSession({ mode: 'calm', learn: true, language: 'de', theme: 'random', seed: 3, botCount: 18, playerName: 'Ich' });
    expect(s.runner.state.players).toHaveLength(1);
    expect(s.runner.state.config).toBe(CALM_CONFIG);
    expect(CALM_CONFIG.spawn.startIntervalMs).toBeGreaterThan(5000);
    s.runner.stop();
  });
});
