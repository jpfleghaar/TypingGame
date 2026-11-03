import './ui/styles.css';
import { createSession, type Session, type SessionSettings } from './runtime/session';
import { GameView } from './ui/gameView';
import { el } from './ui/labels';
import { randomSeed, renderMenu } from './ui/menu';
import { addProblemWords } from './ui/practiceStore';
import { renderResults } from './ui/resultsView';

const screens = {
  menu: document.getElementById('menu')!,
  game: document.getElementById('game')!,
  results: document.getElementById('results')!,
};

type ScreenName = keyof typeof screens;
let current: ScreenName = 'menu';
let session: Session | null = null;
let overlay: HTMLElement | null = null;

function show(name: ScreenName): void {
  current = name;
  for (const [k, e] of Object.entries(screens)) e.hidden = k !== name;
}

function closeOverlay(): void {
  overlay?.remove();
  overlay = null;
}

function toMenu(): void {
  session?.runner.stop();
  session = null;
  closeOverlay();
  renderMenu(screens.menu, startGame);
  show('menu');
}

function startGame(settings: SessionSettings): void {
  session?.runner.stop();
  closeOverlay();
  const s = createSession(settings);
  session = s;
  const view = new GameView(screens.game, s.humanId, s.runner.state, s.themeLabel);
  let koShown = false;
  s.runner.onEvents((events) => {
    view.handleEvents(events);
    for (const e of events) {
      if (e.type === 'PLAYER_KO' && e.playerId === s.humanId && !s.runner.state.finished && !koShown) {
        koShown = true;
        showKoOverlay(s, e.placement);
      }
    }
  });
  s.runner.onFrame((state, info) => {
    view.update(state, info);
    if (state.finished && session === s) finish(s);
  });
  show('game');
  s.runner.start();
}

function showKoOverlay(s: Session, placement: number): void {
  overlay = el('div', 'overlay');
  const card = el('div', 'card');
  const watch = el('button', 'btn', 'Weiter zuschauen');
  const skip = el('button', 'btn primary', 'Zur Auswertung');
  watch.type = skip.type = 'button';
  watch.addEventListener('click', closeOverlay);
  skip.addEventListener('click', () => fastForward(s));
  const actions = el('div', 'actions');
  actions.append(skip, watch);
  card.append(el('h2', undefined, 'K.O.!'), el('p', 'keys', `Du bist auf Platz ${placement} gelandet.`), actions);
  overlay.append(card);
  document.body.append(overlay);
  skip.focus();
}

/** Spielt den Rest der Runde ohne Darstellung zu Ende (nur Bots übrig). */
function fastForward(s: Session): void {
  s.runner.stop();
  const limit = s.runner.state.tick + s.runner.state.config.tickRate * 60 * 30;
  while (!s.runner.state.finished && s.runner.state.tick < limit) s.runner.tickOnce();
  finish(s);
}

function finish(s: Session): void {
  if (session !== s) return;
  s.runner.stop();
  closeOverlay();
  session = null;
  const settings = s.settings;
  const problems = renderResults(
    screens.results,
    s.runner.state,
    s.humanId,
    { seed: settings.seed, themeLabel: s.themeLabel, practice: settings.mode === 'practice' },
    {
      again: () => startGame({ ...settings, seed: randomSeed() }),
      replaySeed: () => startGame(settings),
      menu: toMenu,
    },
  );
  addProblemWords(settings.language, problems);
  lastSettings = settings;
  show('results');
}

let lastSettings: SessionSettings | null = null;

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (overlay) closeOverlay();
    if (current === 'game' && session) {
      if (session.settings.mode === 'practice') finish(session);
      else toMenu();
    } else if (current === 'results') toMenu();
  } else if (e.key === 'Enter' && current === 'results' && lastSettings && document.activeElement === document.body) {
    startGame({ ...lastSettings, seed: randomSeed() });
  }
});

toMenu();

// Entwickler-Abkürzung: ?autostart[=seed] startet sofort eine Runde.
const auto = new URLSearchParams(location.search).get('autostart');
if (auto !== null) {
  startGame({
    mode: 'royale',
    language: 'de',
    theme: 'mixed',
    seed: Number.parseInt(auto, 10) || randomSeed(),
    botCount: 18,
    playerName: 'Du',
  });
}
