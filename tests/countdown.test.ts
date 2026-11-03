// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSession } from '../src/runtime/session';
import { runCountdown } from '../src/ui/countdown';

afterEach(() => vi.useRealTimers());

describe('Countdown', () => {
  it('zählt 5 … 1, dann "Los!" und startet nach 5 Sekunden', () => {
    vi.useFakeTimers();
    const ticks: number[] = [];
    const done = vi.fn();
    runCountdown(5, 'Hinweis', (n) => ticks.push(n), done);
    expect(document.querySelector('.countdown-num')?.textContent).toBe('5');
    vi.advanceTimersByTime(4999);
    expect(done).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(done).toHaveBeenCalledOnce();
    expect(ticks).toEqual([5, 4, 3, 2, 1, 0]);
    expect(document.querySelector('.countdown-num')?.textContent).toBe('Los!');
    vi.advanceTimersByTime(1000);
    expect(document.querySelector('.countdown')).toBeNull();
  });

  it('lässt sich abbrechen, ohne zu starten', () => {
    vi.useFakeTimers();
    const done = vi.fn();
    const cd = runCountdown(5, '', () => {}, done);
    vi.advanceTimersByTime(2000);
    cd.cancel();
    vi.advanceTimersByTime(10_000);
    expect(done).not.toHaveBeenCalled();
    expect(document.querySelector('.countdown')).toBeNull();
  });

  it('Tastendrücke während des Countdowns zählen nicht', () => {
    const s = createSession({ mode: 'royale', language: 'de', theme: 'mixed', seed: 1, botCount: 2, playerName: 'Ich' });
    const me = s.runner.state.players[0];
    for (const key of [...me.stack[0].text, 'x', 'y']) window.dispatchEvent(new KeyboardEvent('keydown', { key }));
    s.runner.start(); // verwirft den Puffer
    s.runner.stop();
    s.runner.tickOnce();
    expect(me.stats.correctKeys + me.stats.errorKeys).toBe(0);
    expect(me.stats.wordsCleared).toBe(0);
  });
});
