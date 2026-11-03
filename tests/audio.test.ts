import { describe, expect, it, vi } from 'vitest';
import { AudioEngine } from '../src/audio/AudioEngine';
import type { GameEvent } from '../src/core';

/**
 * Minimaler Web-Audio-Nachbau: zeichnet Aufrufe auf und prüft die Regeln, an
 * denen echte Browser scheitern (exponentielle Rampen auf <= 0, NaN-Werte).
 */
const problems: string[] = [];
function param(name: string) {
  const check = (v: number, what: string) => {
    if (!Number.isFinite(v)) problems.push(`${name}.${what}: ${v}`);
  };
  return {
    value: 1,
    setValueAtTime: (v: number, t: number) => (check(v, 'set'), check(t, 'time')),
    setTargetAtTime: (v: number, t: number) => (check(v, 'target'), check(t, 'time')),
    linearRampToValueAtTime: (v: number) => check(v, 'linear'),
    exponentialRampToValueAtTime: (v: number, t: number) => {
      check(v, 'exp');
      check(t, 'time');
      if (v <= 0) problems.push(`${name}.exp <= 0`);
    },
  };
}
function node(kind: string) {
  return {
    kind,
    gain: param(`${kind}.gain`),
    frequency: param(`${kind}.frequency`),
    Q: param(`${kind}.Q`),
    delayTime: param(`${kind}.delayTime`),
    threshold: param('threshold'),
    ratio: param('ratio'),
    type: '',
    buffer: null as unknown,
    connect(target: unknown) {
      return target;
    },
    start: (t = 0) => Number.isFinite(t) || problems.push(`${kind}.start ${t}`),
    stop: (t = 0) => Number.isFinite(t) || problems.push(`${kind}.stop ${t}`),
  };
}
class FakeAudioContext {
  currentTime = 0;
  sampleRate = 8000;
  state = 'running';
  destination = node('destination');
  created = 0;
  resume = () => Promise.resolve();
  private make(k: string) {
    this.created++;
    return node(k);
  }
  createGain = () => this.make('gain');
  createOscillator = () => this.make('osc');
  createBiquadFilter = () => this.make('filter');
  createDelay = () => this.make('delay');
  createDynamicsCompressor = () => this.make('comp');
  createBufferSource = () => this.make('src');
  createBuffer = (_c: number, len: number) => ({ getChannelData: () => new Float32Array(len) });
}

describe('AudioEngine (Web-Audio-Nachbau)', () => {
  it('Musik und alle Effekte laufen ohne ungültige Werte', () => {
    vi.useFakeTimers();
    (globalThis as Record<string, unknown>).AudioContext = FakeAudioContext;
    (globalThis as Record<string, unknown>).window = globalThis;
    problems.length = 0;
    const audio = new AudioEngine({ volume: 0.6, muted: false });
    audio.unlock();
    audio.startMusic();
    const ctx = (audio as unknown as { ctx: FakeAudioContext }).ctx;
    // 8 Takte (die ganze Progression) mit allen Schichten durchspielen
    audio.setCombo(12);
    audio.setGameState(0.5, 1);
    for (let i = 0; i < 400; i++) {
      ctx.currentTime += 0.05;
      vi.advanceTimersByTime(25);
    }
    const created = ctx.created;
    expect(created).toBeGreaterThan(500);
    const events: GameEvent[] = [
      { type: 'KEY_CORRECT', playerId: 0, wordId: 1, index: 0 },
      { type: 'KEY_ERROR', playerId: 0, wordId: 1, index: 0, key: 'x' },
      { type: 'WORD_CLEARED', playerId: 0, combo: 7, word: { id: 1, text: 'Mond', garbage: false, hadError: false, errors: 0, startTick: 0 } },
      { type: 'COMBO_BROKEN', playerId: 0, combo: 5 },
      { type: 'ATTACK_SENT', from: 0, to: 3, amount: 2, garbageId: 1, arriveTick: 200 },
      { type: 'ATTACK_SENT', from: 3, to: 0, amount: 2, garbageId: 2, arriveTick: 200 },
      { type: 'GARBAGE_CANCELLED', playerId: 0, from: 3, amount: 1 },
      { type: 'GARBAGE_ARRIVED', playerId: 0, from: 3, amount: 1 },
      { type: 'PLAYER_KO', playerId: 4, by: 0, placement: 10 },
      { type: 'PLAYER_KO', playerId: 5, by: 2, placement: 9 },
      { type: 'PLAYER_KO', playerId: 0, by: 3, placement: 8 },
      { type: 'GAME_OVER', winnerId: 3 },
    ];
    audio.handle(events, 0);
    expect(ctx.created).toBeGreaterThan(created);
    audio.setVolume(0.2);
    audio.toggleMute();
    audio.stopMusic();
    expect(problems).toEqual([]);
    vi.useRealTimers();
  });
});
