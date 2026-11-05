import { THEME_MIXED, THEME_RANDOM } from '../core';
import { botsFor } from '../net/match';
import { MAX_PLAYERS, type RoomSettings, type ServerMsg } from '../net/protocol';
import { VOCAB, WORD_DATA } from '../runtime/session';
import { el } from './labels';
import { segmented, type LanguageChoice } from './menu';

export type LobbyInfo = Extract<ServerMsg, { t: 'lobby' }>;

export interface LobbyHooks {
  onSettings: (s: RoomSettings) => void;
  onStart: () => void;
  onLeave: () => void;
}

function choiceOf(s: RoomSettings): LanguageChoice {
  return s.learn ? (s.language === 'de' ? 'learn-de' : 'learn-en') : s.language;
}

function themeName(s: RoomSettings): string {
  if (s.theme === THEME_RANDOM) return 'Zufall';
  if (s.theme === THEME_MIXED) return 'Gemischt';
  return s.learn ? (VOCAB.themes[s.theme]?.label.de ?? s.theme) : (WORD_DATA[s.language].themes[s.theme]?.label ?? s.theme);
}

const LANG_LABEL: Record<LanguageChoice, string> = {
  de: 'Deutsch',
  en: 'English',
  'learn-de': 'Deutsch lernen',
  'learn-en': 'Englisch lernen',
};

/** Warteraum einer Mehrspieler-Runde: Code, Mitspieler, Einstellungen, Start. */
export function renderLobby(root: HTMLElement, info: LobbyInfo, hooks: LobbyHooks, error = ''): void {
  root.replaceChildren();
  const wrap = el('div', 'menu lobby');
  const host = info.you === 0;
  const s = info.settings;
  const humans = info.players.length;
  const bots = botsFor(humans, s.botCount);

  const head = el('div', 'menu-head');
  const titles = el('div');
  const h1 = el('h1');
  h1.append('Raum ', el('span', 'room-code', info.code));
  const link = `${location.origin}${location.pathname}?raum=${info.code}`;
  const sub = el('p', 'sub');
  sub.append('Einladungslink zum Weiterschicken: ', el('b', 'invite-link', link));
  titles.append(h1, sub);
  const leave = el('button', 'btn', 'Raum verlassen');
  leave.type = 'button';
  leave.addEventListener('click', hooks.onLeave);
  head.append(titles, leave);

  /* --- Mitspieler --- */
  const people = el('div', 'card');
  people.append(el('h2', undefined, `Spieler (${humans} ${humans === 1 ? 'Mensch' : 'Menschen'} + ${bots} Bots)`));
  const list = el('ul', 'lobby-players');
  info.players.forEach((p, i) => {
    const li = el('li');
    li.append(el('b', undefined, p.name));
    if (i === info.you) li.append(el('span', 'tag', 'du'));
    if (p.host) li.append(el('span', 'tag host', 'Gastgeber'));
    if (info.playing && !p.inGame) li.append(el('span', 'tag', 'wartet'));
    if (!p.online) li.append(el('span', 'tag offline', 'Verbindung weg – Platz reserviert'));
    list.append(li);
  });
  people.append(list);

  /* --- Einstellungen --- */
  const setup = el('div', 'card');
  setup.append(el('h2', undefined, 'Einstellungen'));
  const form = el('div', 'form');
  const update = (patch: Partial<RoomSettings>) => hooks.onSettings({ ...s, ...patch });
  if (host && !info.playing) {
    const lang = segmented<LanguageChoice>(
      Object.entries(LANG_LABEL) as [LanguageChoice, string][],
      choiceOf(s),
      (v) =>
        update({
          language: v === 'learn-de' || v === 'de' ? 'de' : 'en',
          learn: v === 'learn-de' || v === 'learn-en',
          theme: THEME_RANDOM,
        }),
    );
    const themes: [string, string][] = s.learn
      ? Object.entries(VOCAB.themes).map(([id, t]) => [id, t.label.de])
      : Object.entries(WORD_DATA[s.language].themes).map(([id, t]) => [id, t.label]);
    const theme = segmented([[THEME_RANDOM, 'Zufall'], [THEME_MIXED, 'Gemischt'], ...themes], s.theme, (v) => update({ theme: v }));
    const botRow = el('div', 'actions');
    const range = el('input');
    range.type = 'range';
    range.min = '0';
    range.max = String(MAX_PLAYERS - 1);
    range.value = String(s.botCount);
    range.id = 'lobby-bots';
    range.setAttribute('aria-label', 'Bots');
    const botText = el('span', 'keys', `${s.botCount}`);
    range.addEventListener('input', () => (botText.textContent = range.value));
    range.addEventListener('change', () => update({ botCount: Number(range.value) }));
    botRow.append(range, botText);
    form.append(el('span', undefined, 'Sprache'), lang, el('span', undefined, 'Thema'), theme, el('span', undefined, 'Bots'), botRow);
  } else {
    form.append(
      el('span', undefined, 'Sprache'),
      el('span', undefined, LANG_LABEL[choiceOf(s)]),
      el('span', undefined, 'Thema'),
      el('span', undefined, themeName(s)),
      el('span', undefined, 'Bots'),
      el('span', undefined, `${bots}`),
    );
  }
  setup.append(form);
  setup.append(el('p', 'keys', `Bots füllen die Runde auf – höchstens ${MAX_PLAYERS} Spieler insgesamt.`));

  const actions = el('div', 'actions');
  actions.style.marginTop = '1rem';
  if (info.playing) {
    actions.append(el('span', 'keys', 'Gerade läuft eine Runde. Du bist bei der nächsten dabei.'));
  } else if (host) {
    const start = el('button', 'btn primary', 'Runde starten');
    start.type = 'button';
    start.addEventListener('click', hooks.onStart);
    actions.append(start, el('span', 'keys', humans < 2 ? 'Allein geht auch – oder warte auf Mitspieler.' : 'Enter startet'));
    root.onkeydown = (e) => {
      if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement) && !(e.target instanceof HTMLInputElement)) hooks.onStart();
    };
    queueMicrotask(() => start.focus());
  } else {
    actions.append(el('span', 'keys', 'Warte, bis der Gastgeber die Runde startet …'));
  }
  setup.append(actions);
  if (!host || info.playing) root.onkeydown = null;

  const err = el('p', 'lobby-error', error);
  err.setAttribute('role', 'alert');
  err.hidden = !error;

  wrap.append(head, err, people, setup);
  root.append(wrap);
}
