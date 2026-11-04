// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { selectWordsToSend } from '../src/core';
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

    // Zifferntaste 3 = dritter Gegner-Platz direkt anvisieren
    press('3');
    s.runner.tickOnce();
    frame();
    const third = s.runner.state.players.filter((p) => p.id !== me.id)[2];
    expect(me.strategy).toBe('manual');
    expect(me.targetId).toBe(third.id);
    expect(root.textContent).toContain(`Ziel: ${third.name}`);
    // Ziffern landen nie als Tastendruck im Wort
    expect(me.stats.errorKeys).toBe(1);

    // Wird ein Gegner angegriffen (Müll unterwegs), leuchtet seine Karte rot
    third.incoming.push({ id: 99, from: 1, amount: 1, words: ['Test'], sentTick: 0, arriveTick: 99999 });
    frame();
    const cards = [...root.querySelectorAll('.opp')];
    expect(cards.filter((c) => c.classList.contains('under-attack'))).toHaveLength(1);
    expect(cards[2].classList.contains('under-attack')).toBe(true);

    // Treffer: Karte bekommt die Treffer-Animation, "+N" erscheint, Sound-Hook wird gerufen
    view.hitCard(third.id, 2);
    expect(cards[2].classList.contains('got-hit')).toBe(true);
    expect(cards[2].querySelector('.hit-label')?.textContent).toContain('+2');

    // Aufforderungen: geladener Angriff → "Senden", eingehender Spam + genug Combo → "Abwehren"
    me.pendingAttack = { amount: 2, loadTick: s.runner.state.tick, autoTick: s.runner.state.tick + 180 };
    me.combo = 6;
    me.incoming.push({ id: 98, from: 2, amount: 3, words: ['a', 'b', 'c'], sentTick: 0, arriveTick: 99999 });
    frame();
    const send = root.querySelector('.prompt.send') as HTMLElement;
    const defend = root.querySelector('.prompt.defend') as HTMLElement;
    expect(send.hidden).toBe(false);
    expect(send.textContent).toContain('2 bereit');
    expect(defend.hidden).toBe(false);
    expect(defend.classList.contains('ready')).toBe(true);
    expect(defend.textContent).toContain('3×'); // 6 Combo, 1 pro Wort, 3 Wörter unterwegs
    me.combo = 0;
    frame();
    expect(defend.classList.contains('ready')).toBe(false);

    // Grün markiert: genau die Wörter, die der geladene Angriff mitnimmt (2 geladen − 3 eingehend = 0)
    expect(root.querySelectorAll('.row.to-send')).toHaveLength(0);
    me.incoming.length = 0;
    third.incoming.length = 0;
    frame();
    const expected = selectWordsToSend(me, 2).map((w) => w.text).sort();
    const marked = [...root.querySelectorAll('.row.to-send')].map((r) => r.childNodes[0].textContent).sort();
    expect(marked).toEqual(expected);
    expect(root.querySelector('.row.active')?.classList.contains('to-send')).toBe(false);
    s.runner.stop();
  });
});
