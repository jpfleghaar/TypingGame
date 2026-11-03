import './ui/styles.css';
import { createConfig, createMatch, finishRound, startNextRound, type MatchState, type ShipId } from './core';
import { IdleController } from './controllers/IdleController';
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

function startMatch(): void {
  const seed = fixedSeed ?? (Math.random() * 2 ** 32) >>> 0;
  match = createMatch(seed, gameConfig());
  startRound();
}

function startRound(): void {
  const m = match!;
  renderer.reset();
  let sunkAt: number | null = null;
  runner = new GameRunner(m.game, [new LocalController(0), new IdleController(1)], {
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
  debug.attach({ run: (fn) => runner?.debug(fn), extra: () => [`Match-Seed ${m.seed} (Link: ?seed=${m.seed})`] });
  runner.start();
}

function endRound(): void {
  const m = match!;
  runner?.dispose();
  runner = null;
  const over = finishRound(m);
  overlay.show(roundSummaryHtml(m, ME, over), {
    Enter: () => {
      if (over) startMatch();
      else {
        startNextRound(m);
        startRound();
      }
    },
  });
}

overlay.show(startScreenHtml(), { Enter: startMatch });
