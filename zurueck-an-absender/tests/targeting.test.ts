import { describe, expect, it } from 'vitest';
import { step, targetText } from '../src/core';
import { cmds, quietGame, setCargo, texts, type } from './helpers';

describe('Zielauswahl beim Tippen', () => {
  it('wählt das passende Wort anhand der ersten Buchstaben', () => {
    const g = quietGame();
    setCargo(g, 0, [['Haus', 1], ['Wind', 1], ['Wald', 1]]);
    type(g, 0, 'wi');
    expect(targetText(g, 0, g.ships[0].typing.target)).toBe('Wind');
    expect(g.ships[0].typing.typed).toBe(2);
  });

  it('nimmt bei mehreren Treffern das kürzeste', () => {
    const g = quietGame();
    setCargo(g, 0, [['Wasser', 1], ['Wald', 1]]);
    type(g, 0, 'wa');
    expect(targetText(g, 0, g.ships[0].typing.target)).toBe('Wald');
  });

  it('wechselt das Ziel, wenn die nächsten Buchstaben nur zu einem anderen Wort passen', () => {
    const g = quietGame();
    setCargo(g, 0, [['Wasser', 1], ['Wald', 1]]);
    type(g, 0, 'was');
    expect(targetText(g, 0, g.ships[0].typing.target)).toBe('Wasser');
  });

  it('Groß- und Kleinschreibung ist egal', () => {
    const g = quietGame();
    setCargo(g, 0, [['Haus', 1]]);
    type(g, 0, 'HaUs');
    expect(texts(g, 0)).toEqual([]);
    expect(g.projectiles).toHaveLength(1);
  });

  it('Tippfehler wird markiert und blockiert, bis er per Backspace korrigiert ist', () => {
    const g = quietGame();
    setCargo(g, 0, [['Haus', 1]]);
    type(g, 0, 'hx');
    expect(g.ships[0].typing.error).toBe('x');
    expect(g.ships[0].typing.typed).toBe(1);
    type(g, 0, 'aus'); // wird ignoriert, solange der Fehler steht
    expect(g.ships[0].typing.typed).toBe(1);
    step(g, cmds(0, [{ type: 'backspace' }]));
    expect(g.ships[0].typing.error).toBeNull();
    type(g, 0, 'aus');
    expect(g.projectiles).toHaveLength(1);
    expect(g.ships[0].stats.wrongKeys).toBe(1);
  });

  it('Escape bricht das aktuelle Wort ab', () => {
    const g = quietGame();
    setCargo(g, 0, [['Haus', 1]]);
    type(g, 0, 'ha');
    step(g, cmds(0, [{ type: 'cancel' }]));
    expect(g.ships[0].typing).toEqual({ target: null, typed: 0, error: null });
  });

  it('Taste ohne passendes Wort zählt als Fehler, ohne Ziel', () => {
    const g = quietGame();
    setCargo(g, 0, [['Haus', 1]]);
    const ev = type(g, 0, 'q');
    expect(ev).toContainEqual({ type: 'TYPO', ship: 0, char: 'q', hasTarget: false });
    expect(g.ships[0].typing.target).toBeNull();
  });

  it('Spieler können nur eigene Fracht tippen, nicht die des Gegners', () => {
    const g = quietGame();
    setCargo(g, 0, [['Haus', 1]]);
    setCargo(g, 1, [['Wind', 1]]);
    type(g, 0, 'wind');
    expect(texts(g, 1)).toEqual(['Wind']);
  });

  it('Umlaute müssen exakt getippt werden', () => {
    const g = quietGame();
    setCargo(g, 0, [['Fuß', 1]]);
    type(g, 0, 'fus');
    expect(g.ships[0].typing.error).toBe('s');
  });
});
