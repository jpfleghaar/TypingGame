import { describe, expect, it } from 'vitest';
import { LocalController } from '../src/controllers/LocalController';
import { newGame } from './helpers';

/** Minimales Fenster-Double: speichert den keydown-Listener, damit Tests Tasten "drücken" können. */
function fakeWindow() {
  let listener: ((e: KeyboardEvent) => void) | null = null;
  const win = {
    addEventListener: (_: string, fn: (e: KeyboardEvent) => void) => (listener = fn),
    removeEventListener: () => (listener = null),
  } as unknown as Window;
  const press = (key: string) => {
    let prevented = false;
    listener!({
      key,
      repeat: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      getModifierState: () => false,
      preventDefault: () => (prevented = true),
    } as unknown as KeyboardEvent);
    return prevented;
  };
  return { win, press };
}

describe('LocalController', () => {
  it('Enter löst den Angriff aus (alle Punkte)', () => {
    const { win, press } = fakeWindow();
    const c = new LocalController(0, win);
    expect(press('Enter')).toBe(true);
    expect(c.poll(newGame(2))).toEqual([{ type: 'SEND_ATTACK', playerId: 0 }]);
  });

  it('Leertaste hat im Spiel keine Funktion (scrollt aber auch nicht)', () => {
    const { win, press } = fakeWindow();
    const c = new LocalController(0, win);
    expect(press(' ')).toBe(true);
    expect(c.poll(newGame(2))).toEqual([]);
  });

  it('Buchstaben werden weiter als KEY weitergegeben', () => {
    const { win, press } = fakeWindow();
    const c = new LocalController(0, win);
    press('a');
    expect(c.poll(newGame(2))).toEqual([{ type: 'KEY', playerId: 0, key: 'a' }]);
  });
});
