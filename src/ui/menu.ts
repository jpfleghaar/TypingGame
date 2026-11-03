import { THEME_MIXED, THEME_RANDOM } from '../core';
import { WORD_DATA, type Language, type SessionSettings } from '../runtime/session';
import type { AvSettings } from './avSettings';
import { el } from './labels';
import { systemPrefersReducedMotion } from './motion';
import { clearPractice, listPractice, removePractice } from './practiceStore';

const PREFS_KEY = 'typing-royale.prefs.v1';
export const DEFAULT_BOTS = 18;

interface Prefs {
  language: Language;
  theme: string;
  playerName: string;
}

function loadPrefs(): Prefs {
  const fallback: Prefs = { language: 'de', theme: THEME_RANDOM, playerName: 'Du' };
  try {
    return { ...fallback, ...(JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<Prefs>) };
  } catch {
    return fallback;
  }
}

function savePrefs(p: Prefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* egal */
  }
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

function segmented<T extends string>(options: [T, string][], value: T, onChange: (v: T) => void): HTMLElement {
  const wrap = el('div', 'seg');
  wrap.setAttribute('role', 'group');
  const buttons = options.map(([v, label]) => {
    const b = el('button', undefined, label);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(v === value));
    b.addEventListener('click', () => {
      buttons.forEach((x) => x.setAttribute('aria-pressed', 'false'));
      b.setAttribute('aria-pressed', 'true');
      onChange(v);
    });
    wrap.append(b);
    return b;
  });
  return wrap;
}

/** Baut das Startmenü. `onStart` erhält fertige Session-Einstellungen. */
export interface AvHooks {
  settings: AvSettings;
  onChange: (s: AvSettings) => void;
}

/** Lautstärke, Stumm und Effekte – im Menü und als Baustein wiederverwendbar. */
export function renderAvControls(av: AvHooks): HTMLElement {
  const wrap = el('div', 'audio-controls');
  const volLabel = el('label', 'check');
  const vol = el('input');
  vol.type = 'range';
  vol.min = '0';
  vol.max = '100';
  vol.value = String(Math.round(av.settings.volume * 100));
  vol.setAttribute('aria-label', 'Lautstärke');
  const volText = el('span', 'keys', `${vol.value} %`);
  vol.addEventListener('input', () => {
    av.settings.volume = Number(vol.value) / 100;
    volText.textContent = `${vol.value} %`;
    av.onChange(av.settings);
  });
  volLabel.append('Lautstärke', vol, volText);

  const mute = el('label', 'check');
  const muteBox = el('input');
  muteBox.type = 'checkbox';
  muteBox.checked = av.settings.muted;
  muteBox.addEventListener('change', () => {
    av.settings.muted = muteBox.checked;
    av.onChange(av.settings);
  });
  mute.append(muteBox, 'Stumm (F4)');

  const fx = el('label', 'check');
  const fxBox = el('input');
  fxBox.type = 'checkbox';
  const system = systemPrefersReducedMotion();
  fxBox.checked = system || av.settings.reducedFx;
  fxBox.disabled = system;
  fx.title = system ? 'Dein System bevorzugt reduzierte Bewegung – Effekte sind deshalb aus.' : '';
  fxBox.addEventListener('change', () => {
    av.settings.reducedFx = fxBox.checked;
    av.onChange(av.settings);
  });
  fx.append(fxBox, system ? 'Effekte reduziert (Systemeinstellung)' : 'Effekte reduzieren');

  wrap.append(volLabel, mute, fx);
  return wrap;
}

export function renderMenu(root: HTMLElement, onStart: (s: SessionSettings) => void, av: AvHooks): void {
  const prefs = loadPrefs();
  root.replaceChildren();
  const menu = el('div', 'menu');

  const head = el('div');
  const h1 = el('h1');
  h1.append('Typing ', el('span', undefined, 'Royale'));
  head.append(h1, el('p', 'sub', 'Tippen, Combos aufbauen, Müll verschicken. Der letzte Überlebende gewinnt.'));

  /* --- Einstellungen --- */
  const setup = el('div', 'card');
  setup.append(el('h2', undefined, 'Neue Runde'));
  const form = el('div', 'form');

  const name = el('input');
  name.value = prefs.playerName;
  name.maxLength = 16;
  name.id = 'player-name';
  const nameLabel = el('label', undefined, 'Name');
  nameLabel.htmlFor = 'player-name';

  const themeHolder = el('div');
  const renderThemes = () => {
    const data = WORD_DATA[prefs.language];
    if (prefs.theme !== THEME_RANDOM && prefs.theme !== THEME_MIXED && !data.themes[prefs.theme]) {
      prefs.theme = THEME_RANDOM;
    }
    const opts: [string, string][] = [
      [THEME_RANDOM, 'Zufall'],
      [THEME_MIXED, 'Gemischt'],
      ...Object.entries(data.themes).map(([id, t]) => [id, t.label] as [string, string]),
    ];
    themeHolder.replaceChildren(segmented(opts, prefs.theme, (v) => (prefs.theme = v)));
  };
  renderThemes();

  const lang = segmented<Language>(
    [
      ['de', 'Deutsch'],
      ['en', 'English'],
    ],
    prefs.language,
    (v) => {
      prefs.language = v;
      renderThemes();
      renderPractice();
    },
  );

  const seed = el('input');
  seed.id = 'seed';
  seed.placeholder = 'leer = zufällig';
  seed.inputMode = 'numeric';
  const seedLabel = el('label', undefined, 'Seed');
  seedLabel.htmlFor = 'seed';

  form.append(nameLabel, name, el('span', undefined, 'Sprache'), lang, el('span', undefined, 'Thema'), themeHolder, seedLabel, seed);

  const start = el('button', 'btn primary', 'Runde starten');
  start.type = 'button';
  const go = () => {
    prefs.playerName = name.value.trim() || 'Du';
    savePrefs(prefs);
    const parsed = Number.parseInt(seed.value, 10);
    onStart({
      mode: 'royale',
      language: prefs.language,
      theme: prefs.theme,
      seed: Number.isFinite(parsed) ? parsed >>> 0 : randomSeed(),
      botCount: DEFAULT_BOTS,
      playerName: prefs.playerName,
    });
  };
  start.addEventListener('click', go);
  const actions = el('div', 'actions');
  actions.append(start, el('span', 'keys', `${DEFAULT_BOTS} Gegner · Enter startet`));
  actions.style.marginTop = '1rem';
  setup.append(form, actions);

  /* --- Übungsliste --- */
  const practice = el('div', 'card');
  const renderPractice = () => {
    const entries = listPractice(prefs.language);
    practice.replaceChildren(el('h2', undefined, `Übungsliste (${entries.length})`));
    if (entries.length === 0) {
      practice.append(el('p', 'empty', 'Noch leer. Nach jeder Runde landen hier Wörter, die dir schwerer fielen als dein Durchschnitt.'));
      return;
    }
    const ul = el('ul', 'practice-list');
    for (const e of entries) {
      const li = el('li', undefined, e.text);
      li.title = `Score ${e.score.toFixed(2)} · ${e.seen}× auffällig`;
      const x = el('button', undefined, '×');
      x.type = 'button';
      x.setAttribute('aria-label', `${e.text} entfernen`);
      x.addEventListener('click', () => {
        removePractice(prefs.language, e.text);
        renderPractice();
      });
      li.append(x);
      ul.append(li);
    }
    const row = el('div', 'actions');
    const train = el('button', 'btn', 'Üben (ohne Gegner)');
    train.type = 'button';
    train.disabled = entries.length < 3;
    train.addEventListener('click', () => {
      prefs.playerName = name.value.trim() || 'Du';
      savePrefs(prefs);
      onStart({
        mode: 'practice',
        language: prefs.language,
        theme: THEME_MIXED,
        seed: randomSeed(),
        botCount: 0,
        playerName: prefs.playerName,
        practiceWords: entries.map((x) => x.text),
      });
    });
    const clear = el('button', 'btn small', 'Liste leeren');
    clear.type = 'button';
    let armed = false;
    clear.addEventListener('click', () => {
      if (!armed) {
        armed = true;
        clear.textContent = 'Wirklich leeren?';
        return;
      }
      clearPractice(prefs.language);
      renderPractice();
    });
    row.append(train, clear);
    practice.append(ul, row);
  };
  renderPractice();

  /* --- Steuerung --- */
  const help = el('div', 'card');
  help.append(el('h2', undefined, 'Steuerung'));
  const keys = el('div', 'keys');
  keys.innerHTML = `
    Tippe immer das <b>unterste</b> Wort. Groß-/Kleinschreibung zählt.<br>
    <kbd>Tab</kbd> Ziel-Strategie wechseln (Zufall → Angreifer → Schwache → K.O.-Jäger)<br>
    <kbd>F4</kbd> Ton an/aus · <kbd>F2</kbd> Debug-Anzeige · <kbd>Esc</kbd> Runde abbrechen<br>
    Combo 3 / 6 / 10 schickt Müll. Eigene Angriffe verrechnen zuerst eingehenden Müll.`;
  help.append(keys);

  const avCard = el('div', 'card');
  avCard.append(el('h2', undefined, 'Sound & Effekte'), renderAvControls(av));

  menu.append(head, setup, practice, avCard, help);
  root.append(menu);

  root.onkeydown = (e) => {
    if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) go();
  };
  start.focus();
}
