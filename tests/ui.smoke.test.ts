// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { createSession } from '../src/runtime/session';
import { GameView } from '../src/ui/gameView';

function press(key: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

describe('UI-Rauchtest', () => {
  it('Tastendrücke landen über den LocalController im Spiel und im DOM', () => {
    const root = document.createElement('section');
    document.body.append(root);
    const s = createSession({ mode: 'royale', language: 'de', theme: 'mixed', seed: 11, botCount: 18, playerName: 'Ich' });
    const view = new GameView(root, s.humanId, s.runner.state, s.themeLabel);
    const frame = () => view.update(s.runner.state, { tps: 60, alpha: 0 });
    s.runner.onEvents((ev) => view.handleEvents(ev));

    expect(root.querySelectorAll('.opp')).toHaveLength(18);
    frame();
    const me = s.runner.state.players[0];
    const first = me.stack[0].text;
    expect(root.querySelector('.row.active:not(.ghost)')?.textContent).toBe(first);

    for (const ch of first) press(ch);
    s.runner.tickOnce();
    frame();
    expect(me.stats.wordsCleared).toBe(1);
    expect(me.combo).toBe(1);
    expect(root.querySelector('.row.active:not(.ghost)')?.textContent).toBe(me.stack[0].text);

    press('#');
    s.runner.tickOnce();
    frame();
    expect(me.combo).toBe(0);

    press('Tab');
    s.runner.tickOnce();
    frame();
    expect(me.strategy).toBe('attackers');
    expect(root.textContent).toContain('Angreifer');
    s.runner.stop();
  });
});
