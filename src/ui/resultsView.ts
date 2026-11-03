import { problemWords, results, type GameState, type ProblemWord } from '../core';
import { el, formatTime } from './labels';

export interface ResultsActions {
  again: () => void;
  replaySeed: () => void;
  menu: () => void;
}

export function renderResults(
  root: HTMLElement,
  state: GameState,
  humanId: number,
  info: { seed: number; themeLabel: string; practice: boolean; mode?: string },
  actions: ResultsActions,
): ProblemWord[] {
  root.replaceChildren();
  const wrap = el('div', 'results');
  const me = state.players[humanId];
  const res = results(state);
  const mine = res.find((r) => r.id === humanId)!;

  const h1 = el('h1');
  if (info.practice) h1.append(info.mode === 'calm' ? 'Runde beendet' : 'Übung beendet');
  else if (mine.placement === 1) h1.append(el('span', 'place', 'Sieg! '), 'Platz 1');
  else h1.append('Platz ', el('span', 'place', String(mine.placement)), ` von ${state.players.length}`);
  const sub = el(
    'p',
    'keys',
    `${mine.wpm.toFixed(0)} WPM · ${(mine.accuracy * 100).toFixed(1)} % Genauigkeit · ` +
      `überlebt ${formatTime(mine.survivedMs)} · Thema ${info.themeLabel} · Seed ${info.seed}`,
  );

  const tableCard = el('div', 'card');
  if (!info.practice) {
    const tw = el('div', 'table-wrap');
    const table = el('table');
    const head = el('tr');
    for (const h of ['Platz', 'Name', 'WPM', 'Genauigkeit', 'Angriffe ges.', 'Müll ges.', 'Angriffe erh.', 'Müll erh.', 'Abgewehrt', 'K.O.s', 'Abzeichen', 'Max. Combo', 'Zeit']) {
      head.append(el('th', undefined, h));
    }
    table.append(head);
    for (const r of res) {
      const tr = el('tr', r.id === humanId ? 'me' : '');
      const cells = [
        `${r.placement}.`,
        r.name,
        r.wpm.toFixed(0),
        `${(r.accuracy * 100).toFixed(1)} %`,
        r.attacksSent,
        r.garbageSent,
        r.attacksReceived,
        r.garbageReceived,
        r.garbageCancelled,
        r.kos,
        r.badges,
        r.maxCombo,
        formatTime(r.survivedMs),
      ];
      for (const c of cells) tr.append(el('td', undefined, String(c)));
      table.append(tr);
    }
    tw.append(table);
    tableCard.append(el('h2', undefined, 'Übersicht'), tw);
  }

  const problems = problemWords(me.wordLog, state.config);
  const probCard = el('div', 'card');
  probCard.append(el('h2', undefined, 'Deine Problemwörter'));
  if (problems.length === 0) {
    probCard.append(el('p', 'empty', 'Keine Auffälligkeiten (oder zu wenige Wörter getippt).'));
  } else {
    const ul = el('ul', 'problem');
    for (const p of problems) {
      const li = el('li', undefined, p.text);
      li.append(el('small', undefined, `${p.msPerChar.toFixed(0)} ms/Z${p.errors ? ` · ${p.errors} Fehler` : ''}`));
      ul.append(li);
    }
    probCard.append(
      el('p', 'keys', 'Im Verhältnis zu deinem Schnitt langsamer oder fehlerhaft. Sie wurden deiner Übungsliste hinzugefügt.'),
      ul,
    );
  }

  const act = el('div', 'actions');
  const again = el('button', 'btn primary', info.mode === 'practice' ? 'Nochmal üben' : 'Neue Runde');
  const same = el('button', 'btn', 'Gleicher Seed');
  const menu = el('button', 'btn', 'Menü');
  for (const b of [again, same, menu]) b.type = 'button';
  again.addEventListener('click', actions.again);
  same.addEventListener('click', actions.replaySeed);
  menu.addEventListener('click', actions.menu);
  act.append(again, ...(info.practice ? [] : [same]), menu, el('span', 'keys', 'Enter = Neue Runde · Esc = Menü'));

  wrap.append(h1, sub, act, ...(info.practice ? [] : [tableCard]), probCard);
  root.append(wrap);
  root.onkeydown = null;
  again.focus();
  return problems;
}
