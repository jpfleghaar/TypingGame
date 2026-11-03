import { describe, expect, it } from 'vitest';
import { CHAINS, createGame, step, targetText, type Command, type CommandsByShip, type GameState } from '../src/core';

/** Simpler Skript-Spieler: tippt jeden 6. Tick einen Buchstaben des ersten Worts. */
function scripted(state: GameState, ship: 0 | 1): Command[] {
  if (state.tick % 6 !== ship * 3) return [];
  const s = state.ships[ship];
  if (state.phase === 'island') return s.cardChosen ? [] : [{ type: 'chooseUpgrade', index: 0 }];
  const text = targetText(state, ship, s.typing.target) ?? s.cargo[0]?.text ?? state.drift[0]?.word.text;
  if (!text) return [];
  return [{ type: 'key', char: text[s.typing.typed] }];
}

function play(seed: number, ticks: number): GameState {
  const g = createGame({ seed });
  for (let i = 0; i < ticks && g.phase !== 'over'; i++) {
    const c: CommandsByShip = [scripted(g, 0), scripted(g, 1)];
    step(g, c);
  }
  return g;
}

describe('Determinismus', () => {
  it('gleicher Seed + gleiche Eingaben → identischer Zustand', () => {
    const a = play(1234, 60 * 120);
    const b = play(1234, 60 * 120);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('anderer Seed → andere Startfracht', () => {
    const a = createGame({ seed: 1 });
    const b = createGame({ seed: 2 });
    expect(a.ships[0].cargo.map((c) => c.text)).not.toEqual(b.ships[0].cargo.map((c) => c.text));
  });

  it('kein Startwort (keine Kette) wiederholt sich innerhalb einer Runde', () => {
    const g = createGame({ seed: 99 });
    const chainOf = new Map(CHAINS.flatMap((c, i) => c.map((w) => [w, i] as const)));
    const used: number[] = [...g.ships[0].cargo, ...g.ships[1].cargo].map((c) => c.chain);
    for (let i = 0; i < 60 * 300 && g.phase !== 'over'; i++) {
      for (const e of step(g, [scripted(g, 0), scripted(g, 1)])) {
        if (e.type === 'DRIFT_SPAWNED') used.push(chainOf.get(e.text)!);
        if (e.type === 'WORD_SWAPPED') used.push(chainOf.get(e.toText)!);
      }
    }
    expect(used.length).toBeGreaterThan(20);
    expect(new Set(used).size).toBe(used.length);
  });
});
