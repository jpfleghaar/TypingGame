import { THEME_MIXED, THEME_RANDOM } from '../core';
import { VOCAB, WORD_DATA, type Language, type SessionSettings } from '../runtime/session';
import type { AvSettings } from './avSettings';
import { el } from './labels';
import { systemPrefersReducedMotion } from './motion';
import { THEMES, type ThemeId } from '../theme/themes';
import { clearPractice, listPractice, removePractice } from './practiceStore';

const PREFS_KEY = 'typing-royale.prefs.v1';
export const DEFAULT_BOTS = 18;

/** Sprachwahl im Menü: normal tippen oder eine Sprache lernen. */
export type LanguageChoice = Language | 'learn-de' | 'learn-en';

interface Prefs {
  language: LanguageChoice;
  theme: string;
  playerName: string;
  /** Lernmodus: mit Gegnern (royale) oder in Ruhe (calm). */
  learnMode: 'royale' | 'calm';
}

/** Sprache, in der tatsächlich getippt wird. */
function typingLanguage(c: LanguageChoice): Language {
  return c === 'learn-de' ? 'de' : c === 'learn-en' ? 'en' : c;
}

function isLearn(c: LanguageChoice): boolean {
  return c === 'learn-de' || c === 'learn-en';
}

function loadPrefs(): Prefs {
  const fallback: Prefs = { language: 'de', theme: THEME_RANDOM, playerName: 'Du', learnMode: 'royale' };
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

/** Theme und Layout. */
export function renderLookControls(av: AvHooks): HTMLElement {
  const form = el('div', 'form');
  const theme = segmented<ThemeId>(
    Object.values(THEMES).map((t) => [t.id, t.label] as [ThemeId, string]),
    av.settings.theme,
    (v) => {
      av.settings.theme = v;
      av.onChange(av.settings);
    },
  );
  const layout = segmented<'center' | 'split'>(
    [
      ['center', 'Gegner links & rechts'],
      ['split', 'Wörter links, Gegner rechts'],
    ],
    av.settings.layout,
    (v) => {
      av.settings.layout = v;
      av.onChange(av.settings);
    },
  );
  form.append(el('span', undefined, 'Theme'), theme, el('span', undefined, 'Layout'), layout);
  return form;
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

export function renderMenu(
  root: HTMLElement,
  onStart: (s: SessionSettings) => void,
  av: AvHooks,
  onHelp: () => void,
): void {
  const prefs = loadPrefs();
  root.replaceChildren();
  const menu = el('div', 'menu');

  const head = el('div', 'menu-head');
  const titles = el('div');
  const h1 = el('h1');
  h1.append('Typing ', el('span', undefined, 'Royale'));
  titles.append(h1, el('p', 'sub', 'Tippen, Combos aufbauen, Müll verschicken. Der letzte Überlebende gewinnt.'));
  const helpBtn = el('button', 'btn', 'Anleitung');
  helpBtn.type = 'button';
  helpBtn.addEventListener('click', onHelp);
  head.append(titles, helpBtn);

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
    const themes: [string, string][] = isLearn(prefs.language)
      ? Object.entries(VOCAB.themes).map(([id, t]) => [id, t.label.de])
      : Object.entries(WORD_DATA[typingLanguage(prefs.language)].themes).map(([id, t]) => [id, t.label]);
    if (prefs.theme !== THEME_RANDOM && prefs.theme !== THEME_MIXED && !themes.some(([id]) => id === prefs.theme)) {
      prefs.theme = THEME_RANDOM;
    }
    const opts: [string, string][] = [[THEME_RANDOM, 'Zufall'], [THEME_MIXED, 'Gemischt'], ...themes];
    themeHolder.replaceChildren(segmented(opts, prefs.theme, (v) => (prefs.theme = v)));
  };
  renderThemes();

  // Nur im Lernmodus: mit Gegnern oder in Ruhe
  const learnLabel = el('span', undefined, 'Modus');
  const learnMode = segmented<'royale' | 'calm'>(
    [
      ['royale', 'Battle Royale'],
      ['calm', 'In Ruhe (ohne Gegner)'],
    ],
    prefs.learnMode,
    (v) => {
      prefs.learnMode = v;
      updateStartLabel();
    },
  );
  const learnInfo = el('p', 'keys learn-info');
  const learnSpacer = el('span');
  const updateLearnRow = () => {
    const learn = isLearn(prefs.language);
    learnLabel.hidden = learnMode.hidden = learnInfo.hidden = learnSpacer.hidden = !learn;
    learnInfo.textContent =
      prefs.language === 'learn-de'
        ? 'Du tippst deutsche Wörter, die englische Übersetzung steht daneben.'
        : 'Du tippst englische Wörter, die deutsche Übersetzung steht daneben.';
    updateStartLabel();
  };

  const lang = segmented<LanguageChoice>(
    [
      ['de', 'Deutsch'],
      ['en', 'English'],
      ['learn-de', 'Deutsch lernen'],
      ['learn-en', 'Englisch lernen'],
    ],
    prefs.language,
    (v) => {
      prefs.language = v;
      renderThemes();
      updateLearnRow();
      renderPractice();
    },
  );

  const seed = el('input');
  seed.id = 'seed';
  seed.placeholder = 'leer = zufällig';
  seed.inputMode = 'numeric';
  const seedLabel = el('label', undefined, 'Seed');
  seedLabel.htmlFor = 'seed';

  form.append(
    nameLabel,
    name,
    el('span', undefined, 'Sprache'),
    lang,
    learnSpacer,
    learnInfo,
    learnLabel,
    learnMode,
    el('span', undefined, 'Thema'),
    themeHolder,
    seedLabel,
    seed,
  );

  const start = el('button', 'btn primary', 'Runde starten');
  start.type = 'button';
  const startInfo = el('span', 'keys');
  const calm = () => isLearn(prefs.language) && prefs.learnMode === 'calm';
  function updateStartLabel(): void {
    startInfo.textContent = calm() ? 'Ohne Gegner · Esc beendet · Enter startet' : `${DEFAULT_BOTS} Gegner · Enter startet`;
  }
  const go = () => {
    prefs.playerName = name.value.trim() || 'Du';
    savePrefs(prefs);
    const parsed = Number.parseInt(seed.value, 10);
    onStart({
      mode: calm() ? 'calm' : 'royale',
      language: typingLanguage(prefs.language),
      learn: isLearn(prefs.language),
      theme: prefs.theme,
      seed: Number.isFinite(parsed) ? parsed >>> 0 : randomSeed(),
      botCount: DEFAULT_BOTS,
      playerName: prefs.playerName,
    });
  };
  start.addEventListener('click', go);
  const actions = el('div', 'actions');
  actions.append(start, startInfo);
  actions.style.marginTop = '1rem';
  setup.append(form, actions);
  updateLearnRow();

  /* --- Übungsliste --- */
  const practice = el('div', 'card');
  const renderPractice = () => {
    const entries = listPractice(typingLanguage(prefs.language));
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
        removePractice(typingLanguage(prefs.language), e.text);
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
        language: typingLanguage(prefs.language),
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
      clearPractice(typingLanguage(prefs.language));
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
    Combo 3 / 6 / 10 schickt Müll. Eigene Angriffe verrechnen zuerst eingehenden Müll.<br>
    Alles im Detail steht in der <b>Anleitung</b> oben rechts.`;
  help.append(keys);

  const avCard = el('div', 'card');
  const avControls = renderAvControls(av);
  avControls.style.marginTop = '0.9rem';
  avCard.append(el('h2', undefined, 'Darstellung & Sound'), renderLookControls(av), avControls);

  menu.append(head, setup, practice, avCard, help);
  root.append(menu);

  root.onkeydown = (e) => {
    if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) go();
  };
  start.focus();
}
