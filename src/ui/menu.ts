import { DEFAULT_CONFIG, THEME_MIXED, THEME_RANDOM } from '../core';
import { DEFAULT_BOT_FIELD } from '../controllers/botProfiles';
import { VOCAB, WORD_DATA, type Language, type SessionSettings } from '../runtime/session';
import type { AvSettings } from './avSettings';
import { el, pointRatesText, pointsLabel } from './labels';
import { systemPrefersReducedMotion } from './motion';

const PREFS_KEY = 'typing-royale.prefs.v1';
export const DEFAULT_BOTS = DEFAULT_BOT_FIELD.count;

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

  /* --- Steuerung --- */
  const cfg = DEFAULT_CONFIG;
  const help = el('div', 'card controls');
  help.append(el('h2', undefined, 'Steuerung'));
  const intro = el('div', 'controls-intro');
  intro.innerHTML = `
    <p><b>Ziel:</b> Halte deinen Posteingang leer. Neue Wörter kommen oben dazu – sind mehr als ${cfg.stackMax} drin,
    bist du raus. Wer als Letzter übrig ist, gewinnt.</p>
    <p><b>Tippen:</b> Tippe immer das <b>unterste, große Wort</b>. Groß-/Kleinschreibung zählt. Bestätigen musst du nichts, ein fertiges Wort verschwindet von selbst.
    Ein Tippfehler lässt das Wort stehen – einfach mit dem richtigen Buchstaben weiter.</p>
    <p><b>Punkte sammeln:</b> Fehlerfreie Wörter bringen dir <b style="color: var(--send)">Punkte</b> (Leiste rechts neben dem Posteingang, max. ${cfg.points.max}).
    Gesammelte Punkte sind sicher – auch ein Tippfehler nimmt sie dir nicht. Wie schnell sie kommen, bestimmt deine <b>Combo</b>
    (fehlerfreie Wörter in Folge): ${pointRatesText(cfg)}. Ein Tippfehler setzt die Combo und den Fortschritt zum nächsten Punkt auf 0.
    Ist die Leiste voll, verfällt jeder weitere Punkt.</p>
    <p><b>Angreifen:</b> <kbd>Enter</kbd> gibt <b>alle</b> Punkte aus und schickt pro Punkt ein Müllwort an dein Ziel. Dabei wandern deine
    <b>längsten Wörter</b> zum Gegner und verschwinden aus deinem Posteingang – welche das sind, ist <b style="color: var(--send)">bernsteinfarben</b> markiert.</p>
    <p><b>Abwehren:</b> Kommt Spam auf dich zu, erscheint <kbd>Tab</kbd> <b>Abwehren</b>. Jedes abgewehrte Wort kostet ${pointsLabel(cfg.defense.pointsPerWord)}.
    Angreifen oder sparen? Wer alles raushaut, hat nichts mehr zum Abwehren.</p>`;
  const table = el('div', 'key-table');
  const row = (keys: string, what: string) => {
    const k = el('span', 'key-cell');
    k.innerHTML = keys;
    const w = el('span', 'key-what');
    w.innerHTML = what;
    table.append(k, w);
  };
  row('<kbd>A</kbd>–<kbd>Z</kbd>, <kbd>Ä</kbd> …', 'Wort tippen');
  row('<kbd>Enter</kbd>', 'Angriff: alle Punkte ausgeben, 1 Müllwort pro Punkt an dein Ziel');
  row('<kbd>Tab</kbd>', `Kommt Spam und hast du Punkte: abwehren (${pointsLabel(cfg.defense.pointsPerWord)} pro Wort) – sonst Ziel-Strategie wechseln (Zufall → Angreifer → Schwache → K.O.-Jäger)`);
  row('<kbd>Leertaste</kbd>', 'keine Funktion');
  row('<kbd>1</kbd>–<kbd>5</kbd> / <kbd>6</kbd>–<kbd>0</kbd>', 'Gegner direkt anvisieren – links von oben 1–5, rechts von oben 6–0');
  row('<kbd>F4</kbd>', 'Ton an/aus (auch per Klick auf „Ton“ im Spiel)');
  row('<kbd>Esc</kbd>', 'Zurück zum Menü – im Spiel mit Nachfrage, das Spiel pausiert so lange');
  row('<kbd>F2</kbd>', 'Debug-Anzeige');
  const more = el('p', 'keys');
  more.innerHTML = 'Alles im Detail – Strategien, Abzeichen, Finale – steht in der <b>Anleitung</b> oben.';
  help.append(intro, table, more);

  const avCard = el('div', 'card');
  avCard.append(el('h2', undefined, 'Sound'), renderAvControls(av));

  menu.append(head, setup, help, avCard);
  root.append(menu);

  root.onkeydown = (e) => {
    if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) go();
  };
  start.focus();
}
