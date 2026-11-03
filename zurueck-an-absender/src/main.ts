import './ui/styles.css';
import { createConfig, createMatch, finishRound, startNextRound, type MatchState, type ShipId } from './core';
import { deriveSeed } from './core/rng';
import { BotController } from './controllers/BotController';
import { BOT_PROFILES, type BotLevel } from './controllers/botProfiles';
import { LocalController } from './controllers/LocalController';
import { SceneRenderer } from './render/SceneRenderer';
import { GameRunner } from './runtime/GameRunner';
import { DebugPanel } from './ui/DebugPanel';
import { el } from './ui/dom';
import { HudView } from './ui/HudView';
import { Overlay, roundSummaryHtml, startScreenHtml } from './ui/screens';

/** Lokaler Spieler ist immer Schiff 0 und wird links gezeigt. */
const ME: ShipId = 0;
const SINK_PAUSE_MS = 2800;

const params = new URLSearchParams(location.search);
const fixedSeed = params.has('seed') ? Number(params.get('seed')) >>> 0 : null;

function gameConfig() {
  const cfg = createConfig();
  // Schritt 2: Inseln und Meeresereignisse bekommen ihr UI erst in Schritt 4/5.
  cfg.island.enabled = false;
  cfg.seaEvents.enabled = false;
  // Zum Testen: ?capacity=40 verkürzt Runden
  if (params.has('capacity')) cfg.ship.capacity = Number(params.get('capacity')) || cfg.ship.capacity;
  return cfg;
}

// --- DOM-Aufbau ---------------------------------------------------------------
const app = document.querySelector<HTMLElement>('#app')!;
const hud = new HudView(ME);
const sceneWrap = el('div', 'scene');
const canvas = el('canvas');
sceneWrap.append(canvas);
const overlay = new Overlay();
const debug = new DebugPanel();
sceneWrap.append(hud.topbarEl);
app.append(sceneWrap, hud.root, overlay.root, debug.root);
const renderer = new SceneRenderer(canvas, ME);

// --- Ablauf -------------------------------------------------------------------
let match: MatchState | null = null;
let runner: GameRunner | null = null;
let level: BotLevel = loadLevel();

function loadLevel(): BotLevel {
  try {
    const v = localStorage.getItem('zaa.botLevel');
    if (v === 'easy' || v === 'medium' || v === 'hard') return v;
  } catch {
    /* privater Modus o. Ä. */
  }
  return 'medium';
}

function chooseLevel(l: BotLevel): void {
  level = l;
  try {
    localStorage.setItem('zaa.botLevel', l);
  } catch {
    /* egal */
  }
  startMatch();
}

function showStart(): void {
  overlay.show(startScreenHtml(level), {
    '1': () => chooseLevel('easy'),
    '2': () => chooseLevel('medium'),
    '3': () => chooseLevel('hard'),
    Enter: () => chooseLevel(level),
  });
}

function startMatch(): void {
  const seed = fixedSeed ?? (Math.random() * 2 ** 32) >>> 0;
  match = createMatch(seed, gameConfig());
  startRound();
}

function startRound(): void {
  const m = match!;
  renderer.reset();
  let sunkAt: number | null = null;
  const bot = new BotController(1, BOT_PROFILES[level], deriveSeed(m.seed, 100 + m.round));
  hud.setEnemyName(`Gegner · ${bot.profile.name}`);
  runner = new GameRunner(m.game, [new LocalController(0), bot], {
    onEvents(events, state) {
      renderer.onEvents(events, performance.now(), state);
      if (events.some((e) => e.type === 'SHIP_SUNK')) sunkAt = performance.now();
    },
    onFrame(state, alpha, now) {
      renderer.render(state, alpha, now);
      hud.update(state, { round: m.round, wins: m.wins });
      debug.update(state);
      if (sunkAt !== null && now - sunkAt > SINK_PAUSE_MS) {
        sunkAt = null;
        endRound();
      }
    },
  });
  debug.attach({
    run: (fn) => runner?.debug(fn),
    extra: () => [
      `Match-Seed ${m.seed} (Link: ?seed=${m.seed})`,
      `Bot ${bot.profile.name}: Soll ${bot.profile.wpm} WPM, gerade ${bot.currentWpm.toFixed(0)} WPM Anschlag · Fehler ${(bot.profile.errorRate * 100).toFixed(1)} %`,
      `  Entscheidung: ${bot.lastDecision || '–'}`,
    ],
  });
  runner.start();
}

function endRound(): void {
  const m = match!;
  runner?.dispose();
  runner = null;
  const over = finishRound(m);
  overlay.show(roundSummaryHtml(m, ME, over), {
    Enter: () => {
      if (over) showStart();
      else {
        startNextRound(m);
        startRound();
      }
    },
  });
}

showStart();
