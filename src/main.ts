import '@fontsource/share-tech-mono/400.css';
import '@fontsource/orbitron/600.css';
import '@fontsource/orbitron/800.css';
import './ui/styles.css';
import { AudioEngine } from './audio/AudioEngine';
import { ClassicRenderer } from './fx/classic/ClassicRenderer';
import { NetRenderer } from './fx/net/NetRenderer';
import { PcbRenderer } from './fx/pcb/PcbRenderer';
import { PCB_LAYOUT, pcbBoardSpec } from './fx/pcb/board';
import type { ThemeRenderer } from './fx/ThemeRenderer';
import { applyTheme, THEMES, type ThemeDef } from './theme/themes';
import { pendingGarbage, results, ticksToMs } from './core';
import { DEFAULT_BOT_FIELD } from './controllers/botProfiles';
import { LocalController } from './controllers/LocalController';
import { createMatch } from './net/match';
import { NetClient, NetFeed } from './net/NetClient';
import type { ServerMsg } from './net/protocol';
import { loadSeat, saveSeat } from './net/seat';
import { GAME_VERSION } from './net/version';
import { GameRunner } from './runtime/GameRunner';
import { createSession, type Session, type SessionSettings } from './runtime/session';
import { loadAv, saveAv, type AvSettings } from './ui/avSettings';
import { runCountdown, type CountdownHandle } from './ui/countdown';
import { DebugPanel } from './ui/debugPanel';
import { renderHelp } from './ui/helpView';
import { GameView } from './ui/gameView';
import { el } from './ui/labels';
import { loadRecord, recordKey, submitRecord } from './ui/endlessRecords';
import { renderLobby, type LobbyInfo } from './ui/lobbyView';
import { randomSeed, renderMenu, savedPlayerName } from './ui/menu';
import { motionReduced, onSystemMotionChange, setReducedFx } from './ui/motion';
import { addProblemWords } from './ui/practiceStore';
import { renderResults } from './ui/resultsView';

const screens = {
  menu: document.getElementById('menu')!,
  game: document.getElementById('game')!,
  results: document.getElementById('results')!,
  help: document.getElementById('help')!,
  lobby: document.getElementById('lobby')!,
};

type ScreenName = keyof typeof screens;
let current: ScreenName = 'menu';
let session: Session | null = null;
let overlay: HTMLElement | null = null;
let debug: DebugPanel | null = null;
let debugWanted = false;
let view: GameView | null = null;
let countdown: CountdownHandle | null = null;

/* ---------- Sound & Effekte ---------- */
const av = loadAv();
// Entwickler-Overrides (werden nicht gespeichert): &theme=classic|datanet, &layout=center|split
{
  const q = new URLSearchParams(location.search);
  const t = q.get('theme');
  if (t === 'classic' || t === 'datanet') av.theme = t;
  const l = q.get('layout');
  if (l === 'center' || l === 'split') av.layout = l;
}
const audio = new AudioEngine({ volume: av.volume, muted: av.muted });
const bgCanvas = document.getElementById('fx') as HTMLCanvasElement;
const fgCanvas = document.getElementById('fx-front') as HTMLCanvasElement;
/** Eine Effekt-Engine pro Stil; beide teilen sich die zwei Canvas-Ebenen. */
const netRenderer = new NetRenderer(bgCanvas, fgCanvas);
const renderers: Record<ThemeDef['renderer'], ThemeRenderer> = {
  classic: new ClassicRenderer(bgCanvas, fgCanvas),
  net: netRenderer,
  // WebGL mit Bloom; ohne WebGL-Unterstützung Rückfall auf die Canvas-2D-Platine
  pcb: PcbRenderer.isSupported() ? new PcbRenderer(bgCanvas, fgCanvas) : netRenderer,
};
let theme: ThemeDef = THEMES[av.theme];
let fx: ThemeRenderer = renderers[theme.renderer];

/** Theme anwenden: Farben (CSS-Variablen), Effekt-Engine, Musikstil. */
function applyThemeChoice(): void {
  const next = THEMES[av.theme];
  const nextFx = renderers[next.renderer];
  if (nextFx !== fx) {
    fx.stop();
    fx.clear();
    fx = nextFx;
  }
  theme = next;
  applyTheme(theme);
  fx.setTheme(theme);
  fx.setMotion(!motionReduced());
  fx.start();
}

function applyMotion(): void {
  setReducedFx(av.reducedFx);
  fx.setMotion(!motionReduced());
}
applyMotion();
onSystemMotionChange(applyMotion);

/** Ton an/aus – per F4 oder Klick auf "Ton" im Spiel. */
function toggleSound(): void {
  audio.unlock();
  av.muted = audio.toggleMute();
  saveAv(av);
  view?.setAudioStatus(audioStatus());
  if (current === 'menu') renderMainMenu();
}

function audioStatus(): string {
  return audio.muted ? 'stumm' : `${Math.round(audio.volume * 100)} %`;
}

function onAvChange(s: AvSettings): void {
  audio.setVolume(s.volume);
  if (audio.muted !== s.muted) audio.toggleMute();
  saveAv(s);
  if (THEMES[s.theme] !== theme) applyThemeChoice();
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

/* ---------- Zuschauen nach dem eigenen K.O. ---------- */
let spectateBar: HTMLElement | null = null;

function hideSpectateBar(): void {
  spectateBar?.remove();
  spectateBar = null;
}

/** Feste Leiste beim Zuschauen: jederzeit zur Auswertung oder ins Menü. */
function showSpectateBar(s: Session): void {
  hideSpectateBar();
  const bar = el('div', 'spectate-bar');
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', 'Zuschauer-Modus');
  const results = el('button', 'btn primary', 'Zur Auswertung');
  const menu = el('button', 'btn', s.net ? 'Raum verlassen' : 'Zurück zum Menü');
  results.type = menu.type = 'button';
  results.addEventListener('click', () => fastForward(s));
  menu.addEventListener('click', toMenu);
  bar.append(el('span', 'spectate-label', 'Zuschauer-Modus'), ...(s.net ? [] : [results]), menu);
  document.body.append(bar);
  spectateBar = bar;
}

function teardown(): void {
  hideSpectateBar();
  countdown?.cancel();
  countdown = null;
  debug?.destroy();
  debug = null;
  view?.destroy();
  view = null;
}

function renderMainMenu(): void {
  renderMenu(screens.menu, startGame, { settings: av, onChange: onAvChange }, showHelp, {
    create: (name) => {
      menuError = '';
      net.send({ t: 'create', name, version: GAME_VERSION });
    },
    join: (code, name) => {
      menuError = '';
      net.send({ t: 'join', code, name, version: GAME_VERSION });
    },
    error: menuError,
  });
}

/** Laufende Runde beenden (Schleife, Tastatur im Mehrspieler). */
function endSession(s: Session): void {
  s.runner.stop();
  s.net?.local.dispose();
}

function toMenu(): void {
  closeConfirm(false);
  teardown();
  if (session) endSession(session);
  session = null;
  closeOverlay();
  audio.stopMusic();
  fx.detach();
  if (lobbyInfo && net.connected) net.send({ t: 'leave' });
  lobbyInfo = null;
  saveSeat(null);
  stopReconnect();
  renderMainMenu();
  show('menu');
}

/* ---------- Mehrspieler ---------- */
const net = new NetClient();
/** Aktueller Raum (null = in keinem Raum). */
let lobbyInfo: LobbyInfo | null = null;
let lobbyError = '';
let menuError = '';

function showLobby(): void {
  if (!lobbyInfo) return toMenu();
  renderLobby(
    screens.lobby,
    lobbyInfo,
    {
      onSettings: (settings) => net.send({ t: 'settings', settings }),
      onStart: () => net.send({ t: 'start' }),
      onLeave: toMenu,
    },
    lobbyError,
  );
  show('lobby');
}

net.onMessage = (msg: ServerMsg) => {
  switch (msg.t) {
    case 'lobby':
      lobbyInfo = msg;
      lobbyError = '';
      saveSeat({ code: msg.code, token: msg.token });
      stopReconnect();
      if (current === 'menu' || current === 'lobby') showLobby();
      return;
    case 'outdated':
      showOutdated();
      return;
    case 'error':
      if (msg.gone) {
        // Platz weg (Server neu gestartet o. ä.) – zurück ins Menü
        stopReconnect();
        lobbyInfo = null;
        saveSeat(null);
        menuError = msg.msg;
        if (current !== 'results') toMenu();
        return;
      }
      if (current === 'lobby') {
        lobbyError = msg.msg;
        showLobby();
      } else {
        menuError = msg.msg;
        if (current === 'menu') renderMainMenu();
      }
      return;
    case 'start':
      // Wieder-Einstieg in die Runde, die hier noch läuft: nur der Spielstand kommt neu
      if (msg.resume && session?.net && session.settings.seed === msg.setup.seed && session.humanId === msg.you) return;
      startNetGame(msg);
      return;
    case 'ticks':
      session?.net?.feed.push(msg);
      return;
    case 'snapshot':
      if (session?.net) session.net.feed.applySnapshot(session.runner.state, msg.state);
      return;
  }
};

/* --- Verbindungsabbruch: automatisch auf den eigenen Platz zurück --- */
const RECONNECT_DELAYS_MS = [500, 1000, 2000, 3000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000];
let reconnectTry = -1;
let reconnectTimer = 0;
let netBanner: HTMLElement | null = null;

function setNetBanner(text: string | null): void {
  if (!text) {
    netBanner?.remove();
    netBanner = null;
    return;
  }
  if (!netBanner) {
    netBanner = el('div', 'net-banner');
    netBanner.setAttribute('role', 'status');
    document.body.append(netBanner);
  }
  netBanner.textContent = text;
}

function stopReconnect(): void {
  reconnectTry = -1;
  clearTimeout(reconnectTimer);
  setNetBanner(null);
}

function rejoin(): void {
  const seat = loadSeat();
  if (seat) net.send({ t: 'rejoin', code: seat.code, token: seat.token, version: GAME_VERSION });
}

net.onClose = (reason) => {
  const seat = loadSeat();
  const inRoom = lobbyInfo !== null || session?.net !== undefined || reconnectTry >= 0;
  if (seat && inRoom && reconnectTry < RECONNECT_DELAYS_MS.length - 1) {
    reconnectTry++;
    setNetBanner('Verbindung unterbrochen – verbinde neu …');
    reconnectTimer = window.setTimeout(rejoin, RECONNECT_DELAYS_MS[reconnectTry]);
    return;
  }
  stopReconnect();
  lobbyInfo = null;
  saveSeat(null);
  menuError = reason;
  if (inRoom || current === 'menu') toMenu();
};

/** Seite ist älter als der Server: neu laden, sonst würden die Spielstände auseinanderlaufen. */
function showOutdated(): void {
  stopReconnect();
  saveSeat(null);
  closeOverlay();
  overlay = el('div', 'overlay');
  const card = el('div', 'card');
  card.setAttribute('role', 'alertdialog');
  card.setAttribute('aria-modal', 'true');
  const reload = el('button', 'btn primary', 'Seite neu laden');
  reload.type = 'button';
  reload.addEventListener('click', () => location.reload());
  const actions = el('div', 'actions');
  actions.append(reload);
  card.append(
    el('h2', undefined, 'Neue Version verfügbar'),
    el('p', 'keys', 'Das Spiel wurde aktualisiert. Lade die Seite neu, um mitzuspielen.'),
    actions,
  );
  overlay.append(card);
  document.body.append(overlay);
  reload.focus();
}

function startNetGame(msg: Extract<ServerMsg, { t: 'start' }>): void {
  const setup = msg.setup;
  const match = createMatch(setup);
  const feed = new NetFeed(() => net.send({ t: 'resync' }), msg.you);
  const s: Session = {
    settings: {
      mode: 'royale',
      language: setup.language,
      learn: setup.learn,
      theme: setup.theme,
      seed: setup.seed,
      botCount: match.botProfiles.length,
      playerName: setup.humans[msg.you],
    },
    runner: new GameRunner(match.state, match.bank, [feed], feed),
    humanId: msg.you,
    bank: match.bank,
    themeLabel: match.themeLabel,
    botProfiles: match.botProfiles,
    firstBotId: setup.humans.length,
    net: { feed, local: new LocalController(msg.you) },
  };
  runSession(s, Math.round(msg.countdownMs / 1000));
}

function showHelp(): void {
  renderHelp(screens.help, toMenu);
  show('help');
  screens.help.scrollTop = 0;
}

function startGame(settings: SessionSettings): void {
  runSession(createSession(settings));
}

function runSession(s: Session, countdownSeconds = s.runner.state.config.countdownSeconds): void {
  if (session) endSession(session);
  closeConfirm(false);
  closeOverlay();
  teardown();
  session = s;
  const settings = s.settings;
  // Platine (WebGL): feste Spielfläche auf dem Hintergrundbild, solange die Gegner auf P1–P10 passen
  const opponents = s.runner.state.players.length - 1;
  const onBoard = fx.kind === 'pcb' && opponents <= PCB_LAYOUT.pads.length;
  const v = new GameView(screens.game, s.humanId, s.runner.state, s.themeLabel, s.bank.translations, {
    layout: onBoard ? 'board' : av.layout,
    board: onBoard ? pcbBoardSpec() : undefined,
    svgLinks: theme.renderer === 'classic',
    pendingKeys: s.net ? () => s.net!.feed.pendingKeys : undefined,
    recordMs:
      settings.mode === 'endless' ? (loadRecord(recordKey(settings.language, !!settings.learn))?.ms ?? 0) : undefined,
    nodeLabels: theme.texts.nodeLabels,
    texts: theme.texts.ui,
    onToggleMute: toggleSound,
    onMenu: requestQuit,
    onCardHit: (_id, amount) => audio.attackHit(amount),
    volume: {
      value: av.volume,
      onInput: (vol) => {
        av.volume = vol;
        audio.setVolume(vol);
        if (audio.muted && vol > 0) av.muted = audio.toggleMute(); // Regler hochziehen = Ton wieder an
        saveAv(av);
        v.setAudioStatus(audioStatus());
      },
    },
  });
  view = v;
  const dbg = new DebugPanel(s.humanId, s.botProfiles, settings.seed, s.firstBotId ?? 1);
  if (debugWanted) dbg.toggle();
  debug = dbg;
  const bridge = fx;
  bridge.attach(v, s.humanId);
  v.setAudioStatus(audioStatus());
  audio.unlock();
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
    // Mehrspieler: eigene Tasten an den Server – wirksam erst, wenn sie im Tick-Paket zurückkommen
    if (s.net) {
      const cmds = s.net.local.poll(state);
      if (cmds.length > 0) {
        net.send({ t: 'cmd', cmds });
        s.net.feed.sent(cmds);
      }
    }
    v.update(state, info);
    bridge.frame(state);
    const me = state.players[s.humanId];
    const fill = me.alive ? (me.stack.length - (state.config.stackMax - 5)) / 5 : 0;
    const danger = me.alive ? Math.min(1, Math.max(0, fill, pendingGarbage(me.incoming) > 0 ? 0.45 : 0)) : 0;
    audio.setGameState(ticksToMs(state.tick, state.config) / state.config.spawn.rampDurationMs, danger);
    dbg.update(state, info);
    if (state.finished && session === s) finish(s);
  });
  show('game');
  // Startzustand schon zeigen (Stapel, Gegner), dann Countdown
  v.update(s.runner.state, { tps: 0, alpha: 0 });
  bridge.frame(s.runner.state);
  const ui = theme.texts.ui;
  const k = (key: string) => (ui.brackets ? `[${key.toUpperCase()}]` : key);
  const hint =
    settings.mode === 'royale'
      ? `Tippe immer das unterste Wort ${ui.sep} ${k('Tab')} ${ui.brackets ? ui.tabLabel : 'wechselt die Ziel-Strategie'}`
      : settings.mode === 'endless'
        ? `Die Wörter kommen immer schneller – wie lange hältst du durch? ${ui.sep} ${k('Esc')} beendet`
        : `Tippe immer das unterste Wort ${ui.sep} ${k('Esc')} beendet die Runde`;
  countdown = runCountdown(
    countdownSeconds,
    hint,
    (n) => audio.countdownBeep(n),
    () => {
      countdown = null;
      if (session !== s) return;
      audio.startMusic();
      s.net?.local.reset();
      s.runner.start();
    },
  );
}

/* ---------- Aufgeben-Abfrage ---------- */
let confirmBox: HTMLElement | null = null;

function closeConfirm(resume: boolean): void {
  confirmBox?.remove();
  confirmBox = null;
  if (resume && session && !session.runner.state.finished) session.runner.start();
}

/** "Menü" im Spiel: nachfragen, solange es etwas zu verlieren gibt. */
function requestQuit(): void {
  const s = session;
  if (!s || current !== 'game') return;
  const me = s.runner.state.players[s.humanId];
  // Countdown läuft noch oder schon K.O.: nichts zu verlieren
  if (countdown || !me.alive || s.runner.state.finished) {
    toMenu();
    return;
  }
  if (confirmBox) return;
  const online = s.net !== undefined;
  if (!online) s.runner.pause(); // Mehrspieler läuft für die anderen weiter
  const royale = s.settings.mode === 'royale';
  confirmBox = el('div', 'overlay confirm');
  const card = el('div', 'card');
  card.setAttribute('role', 'alertdialog');
  card.setAttribute('aria-modal', 'true');
  const quit = el('button', 'btn danger', online ? 'Raum verlassen' : royale ? 'Aufgeben' : 'Runde beenden');
  const stay = el('button', 'btn primary', 'Weiterspielen');
  quit.type = stay.type = 'button';
  quit.addEventListener('click', () => {
    closeConfirm(false);
    if (royale) toMenu();
    else finish(s);
  });
  stay.addEventListener('click', () => closeConfirm(true));
  const actions = el('div', 'actions');
  actions.append(stay, quit);
  card.append(
    el('h2', undefined, online ? 'Raum verlassen?' : royale ? 'Wirklich aufgeben?' : 'Runde beenden?'),
    el(
      'p',
      'keys',
      online
        ? 'Achtung: Das Spiel läuft weiter, solange du überlegst. Verlässt du den Raum, tippst du in dieser Runde nicht mehr mit.'
        : royale
          ? 'Die Runde wird abgebrochen und nicht gewertet. Das Spiel ist pausiert.'
          : 'Du bekommst danach die Auswertung dieser Runde. Das Spiel ist pausiert.',
    ),
    actions,
  );
  confirmBox.append(card);
  document.body.append(confirmBox);
  stay.focus();
}

function showKoOverlay(s: Session, placement: number): void {
  overlay = el('div', 'overlay');
  const card = el('div', 'card');
  const watch = el('button', 'btn', 'Weiter zuschauen');
  const skip = el('button', 'btn primary', 'Zur Auswertung');
  const menu = el('button', 'btn', 'Zurück zum Menü');
  watch.type = skip.type = menu.type = 'button';
  watch.addEventListener('click', () => {
    closeOverlay();
    showSpectateBar(s);
  });
  skip.addEventListener('click', () => fastForward(s));
  menu.addEventListener('click', toMenu);
  const actions = el('div', 'actions');
  if (s.net) {
    // Mehrspieler: Die Runde gehört allen – Auswertung erst, wenn sie vorbei ist.
    menu.textContent = 'Raum verlassen';
    watch.classList.add('primary');
    actions.append(watch, menu);
  } else actions.append(skip, watch, menu);
  const text = s.net
    ? `Du bist auf Platz ${placement} gelandet. Die Auswertung kommt, sobald die Runde vorbei ist.`
    : `Du bist auf Platz ${placement} gelandet.`;
  card.append(el('h2', undefined, theme.texts.koSelf), el('p', 'keys', text), actions);
  overlay.append(card);
  document.body.append(overlay);
  (s.net ? watch : skip).focus();
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
  endSession(s);
  closeOverlay();
  teardown();
  audio.stopMusic();
  fx.detach();
  session = null;
  const settings = s.settings;
  // Endlos: Bestzeit speichern (gilt auch, wenn die Runde mit Esc beendet wurde)
  let endless: { previousMs: number; isNew: boolean } | undefined;
  if (settings.mode === 'endless') {
    const me = s.runner.state.players[s.humanId];
    const r = results(s.runner.state).find((x) => x.id === s.humanId)!;
    const { previous, isNew } = submitRecord(recordKey(settings.language, !!settings.learn), {
      ms: r.survivedMs,
      wpm: Math.round(r.wpm),
      words: me.stats.wordsCleared,
      date: new Date().toISOString(),
    });
    endless = { previousMs: previous?.ms ?? 0, isNew };
  }
  const problems = renderResults(
    screens.results,
    s.runner.state,
    s.humanId,
    {
      seed: settings.seed,
      themeLabel: s.themeLabel,
      practice: settings.mode !== 'royale',
      mode: settings.mode,
      multiplayer: s.net !== undefined,
      endless,
    },
    s.net
      ? { again: showLobby, replaySeed: showLobby, menu: toMenu }
      : {
          again: () => startGame({ ...settings, seed: randomSeed() }),
          replaySeed: () => startGame(settings),
          menu: toMenu,
        },
  );
  addProblemWords(settings.language, problems);
  lastSettings = s.net ? null : settings;
  show('results');
}

let lastSettings: SessionSettings | null = null;

window.addEventListener('keydown', (e) => {
  if (e.key === 'F4') {
    e.preventDefault();
    toggleSound();
    return;
  }
  if (e.key === 'F2') {
    e.preventDefault();
    debugWanted = !debugWanted;
    debug?.toggle();
    return;
  }
  if (e.key === 'Escape') {
    if (confirmBox) {
      closeConfirm(true); // zweites Esc = weiterspielen
      return;
    }
    if (overlay) closeOverlay();
    if (current === 'game' && session) requestQuit();
    else if (current === 'results' && lobbyInfo) showLobby();
    else if (current === 'results' || current === 'help') toMenu();
  } else if (e.key === 'Enter' && current === 'results' && document.activeElement === document.body) {
    if (lobbyInfo) showLobby();
    else if (lastSettings) startGame({ ...lastSettings, seed: randomSeed() });
  }
});

toMenu();
applyThemeChoice();

// Entwickler-Abkürzungen: ?autostart[=seed] startet sofort eine Runde, &debug zeigt die Debug-Anzeige,
// &learn=de|en startet im Lernmodus, &mode=endless im Endlos-Modus, ?help öffnet die Anleitung.
const params = new URLSearchParams(location.search);
const auto = params.get('autostart');
debugWanted = params.has('debug');
const learnParam = params.get('learn');
if (params.has('help')) showHelp();
// Neu geladen? Dann zurück auf den eigenen Platz. Sonst: Einladungslink ?raum=CODE tritt direkt bei.
const invite = params.get('raum')?.toUpperCase();
const seat = loadSeat();
if (seat && (!invite || invite === seat.code)) rejoin();
else if (invite) net.send({ t: 'join', code: invite, name: savedPlayerName(), version: GAME_VERSION });
if (auto !== null) {
  startGame({
    mode: params.get('mode') === 'endless' ? 'endless' : 'royale',
    learn: learnParam === 'de' || learnParam === 'en',
    language: learnParam === 'en' ? 'en' : 'de',
    theme: 'mixed',
    seed: Number.parseInt(auto, 10) || randomSeed(),
    botCount: DEFAULT_BOT_FIELD.count,
    playerName: 'Du',
  });
}
