import './ui/styles.css';
import { AudioEngine } from './audio/AudioEngine';
import { EffectsBridge } from './fx/effectsBridge';
import { FxLayer } from './fx/FxLayer';
import { createSession, type Session, type SessionSettings } from './runtime/session';
import { loadAv, saveAv, type AvSettings } from './ui/avSettings';
import { DebugPanel } from './ui/debugPanel';
import { GameView } from './ui/gameView';
import { el } from './ui/labels';
import { randomSeed, renderMenu } from './ui/menu';
import { motionReduced, onSystemMotionChange, setReducedFx } from './ui/motion';
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
let debug: DebugPanel | null = null;
let debugWanted = false;
let view: GameView | null = null;

/* ---------- Sound & Effekte ---------- */
const av = loadAv();
const audio = new AudioEngine({ volume: av.volume, muted: av.muted });
const fx = new FxLayer(
  document.getElementById('fx') as HTMLCanvasElement,
  document.getElementById('fx-front') as HTMLCanvasElement,
);

function applyMotion(): void {
  setReducedFx(av.reducedFx);
  fx.setEnabled(!motionReduced());
}
applyMotion();
onSystemMotionChange(applyMotion);

function audioStatus(): string {
  return audio.muted ? 'Ton aus' : `Ton ${Math.round(audio.volume * 100)} %`;
}

function onAvChange(s: AvSettings): void {
  audio.setVolume(s.volume);
  if (audio.muted !== s.muted) audio.toggleMute();
  saveAv(s);
  applyMotion();
}

// Browser erlauben Audio erst nach einer Nutzer-Interaktion.
window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
window.addEventListener('keydown', () => audio.unlock(), { once: true });

function show(name: ScreenName): void {
  current = name;
  for (const [k, e] of Object.entries(screens)) e.hidden = k !== name;
}

function closeOverlay(): void {
  overlay?.remove();
  overlay = null;
}

function teardown(): void {
  debug?.destroy();
  debug = null;
  view?.destroy();
  view = null;
}

function toMenu(): void {
  teardown();
  session?.runner.stop();
  session = null;
  closeOverlay();
  audio.stopMusic();
  fx.setIntensity(0, 0);
  renderMenu(screens.menu, startGame, { settings: av, onChange: onAvChange });
  show('menu');
}

function startGame(settings: SessionSettings): void {
  session?.runner.stop();
  closeOverlay();
  teardown();
  const s = createSession(settings);
  session = s;
  const v = new GameView(screens.game, s.humanId, s.runner.state, s.themeLabel);
  view = v;
  const dbg = new DebugPanel(s.humanId, s.botProfiles, settings.seed);
  if (debugWanted) dbg.toggle();
  debug = dbg;
  const bridge = new EffectsBridge(fx, v, s.humanId);
  v.setAudioStatus(audioStatus());
  audio.unlock();
  audio.startMusic();
  let koShown = false;
  s.runner.onEvents((events) => {
    v.handleEvents(events);
    bridge.handle(events);
    audio.handle(events, s.humanId);
    for (const e of events) {
      if (e.type === 'PLAYER_KO' && e.playerId === s.humanId && !s.runner.state.finished && !koShown) {
        koShown = true;
        showKoOverlay(s, e.placement);
      }
    }
  });
  s.runner.onFrame((state, info) => {
    v.update(state, info);
    bridge.frame(state);
    dbg.update(state, info);
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
  teardown();
  audio.stopMusic();
  fx.setIntensity(0, 0);
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
  if (e.key === 'F4') {
    e.preventDefault();
    audio.unlock();
    av.muted = audio.toggleMute();
    saveAv(av);
    view?.setAudioStatus(audioStatus());
    if (current === 'menu') renderMenu(screens.menu, startGame, { settings: av, onChange: onAvChange });
    return;
  }
  if (e.key === 'F2') {
    e.preventDefault();
    debugWanted = !debugWanted;
    debug?.toggle();
    return;
  }
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
fx.start();

// Entwickler-Abkürzung: ?autostart[=seed] startet sofort eine Runde, &debug zeigt die Debug-Anzeige.
const params = new URLSearchParams(location.search);
const auto = params.get('autostart');
debugWanted = params.has('debug');
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
