import { defenderById, enemyById, levelById, rules } from './data';
import { LevelDef } from './data/schemas';
import {
  createDebugLoadout,
  fastForward,
  parseDebugUrl,
  type DebugLevelRequest,
  type DebugPlacement,
} from './debug';
import { startGameLoop, startRenderLoop, type GameLoop } from './loop';
import { installAudioUnlock, playMusic, playSfx, setBigWaveIntensity } from './platform/audio';
import type { SfxId } from './platform/audioManifest';
import { playHaptic } from './platform/haptics';
import { SLOW_MOTION_DURATION_S, SLOW_MOTION_SCALE } from './render/vfx/juice';
import { createRenderer, type GameRenderer } from './render';
import { createSim } from './sim';
import type { Command, ComboId, LoadoutEntry, SimEvent, SimState } from './sim/types';
import {
  mountHud,
  mountScoutFlow,
  mountUi,
  type HudActions,
  type HudBannerKind,
  type HudBossView,
  type HudEvent,
  type HudHandle,
  type HudStateView,
  type ScoutFlowHandle,
} from './ui';
import { highestCardStars } from './ui/hud/cardStars';
import { levelProgressView } from './ui/hud/levelProgressView';

/** The sim surface the HUD bridge reads and drives (spec 11.3). */
interface HudSim {
  readonly state: Readonly<SimState>;
  enqueue(command: Command): void;
}

/** How many ticks before the debug tick a wave banner still counts as visible (spec 3.10, 9.8). */
const BANNER_WINDOW_TICKS = Math.round(3 * rules.tick.tickRate);

/** Maps the sim events the HUD shows to the HUD's own event types (spec 3.4, 3.10). */
function mapHudEvents(events: readonly SimEvent[]): HudEvent[] {
  const hudEvents: HudEvent[] = [];
  for (const event of events) {
    if (event.type === 'commandRejected') {
      hudEvents.push({ type: 'commandRejected', reason: event.reason });
    } else if (event.type === 'waveBanner') {
      hudEvents.push({ type: 'waveBanner', kind: event.kind });
    }
  }
  return hudEvents;
}

/** Boss bar view while a boss enemy is on the field; null in every other case (spec 6.3, 9.8). */
function readBossView(levelEnemies: Readonly<SimState>['enemies']): HudBossView | null {
  for (const enemy of levelEnemies) {
    const definition = enemyById[enemy.enemyId];
    if (definition?.isBoss === true) {
      const healthFraction = enemy.maxHp > 0 ? enemy.hp / enemy.maxHp : 0;
      return { name: definition.name, healthFraction, phaseMarkers: [0.66, 0.33] };
    }
  }
  return null;
}

/** Projects one sim state into the HUD view types (spec 3.5, 6.3, 9.8). */
function readHudState(sim: HudSim, loop: GameLoop, level: LevelDef): HudStateView {
  const state = sim.state;
  const tickSeconds = 1 / rules.tick.tickRate;
  const cards = state.loadout.map((entry, index) => {
    const definition = defenderById[entry.defenderId];
    const remainingTicks = Math.max(0, (state.cardCooldownEndTicks[index] ?? 0) - state.tick);
    const totalTicks = Math.max(1, Math.round((definition?.cooldownS ?? 0) * rules.tick.tickRate));
    return {
      defenderId: entry.defenderId,
      name: definition?.name ?? entry.defenderId,
      faction: definition?.faction ?? 'forge',
      rarity: definition?.rarity ?? 'common',
      cost: definition?.cost ?? 0,
      cooldownRemainingSeconds: remainingTicks * tickSeconds,
      cooldownFraction: Math.min(remainingTicks / totalTicks, 1),
      stars: highestCardStars(state.defenders, entry.defenderId),
    };
  });
  return {
    essence: state.essence,
    cards,
    defenders: state.defenders.map((defender) => ({
      id: defender.id,
      lane: defender.lane,
      col: defender.col,
    })),
    orbs: state.orbs.map((orb) => ({ id: orb.id, lane: orb.lane, x: orb.x })),
    progress: levelProgressView(
      level.waves.map((wave) => wave.flag),
      state.wave.index,
      state.status,
    ),
    boss: readBossView(state.enemies),
    paused: loop.isPaused(),
    speed: loop.getSpeed(),
  };
}

/** Turns HUD intents into sim commands and game-loop calls (spec 11.3, 3.2). */
function createHudActions(sim: HudSim, loop: GameLoop): HudActions {
  return {
    place: (cardIndex, lane, col) => {
      const entry = sim.state.loadout[cardIndex];
      if (entry !== undefined) {
        sim.enqueue({ type: 'place', defenderId: entry.defenderId, lane, col });
      }
    },
    shovel: (lane, col) => sim.enqueue({ type: 'shovel', lane, col }),
    collectOrb: (orbId) => sim.enqueue({ type: 'collectOrb', orbId }),
    togglePause: () => {
      playSfx('button_tap');
      loop.togglePause();
    },
    toggleSpeed: () => {
      playSfx('button_tap');
      loop.setSpeed(loop.getSpeed() === 1 ? 2 : 1);
    },
  };
}

/** Shows a readable debug-URL error panel instead of crashing the client (issue #27). */
function showDebugError(root: HTMLElement, message: string): void {
  console.error(message);
  const panel = document.createElement('div');
  panel.setAttribute('role', 'alert');
  panel.style.cssText =
    'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;' +
    'padding:24px;box-sizing:border-box;background:#1b1b2f;color:#f4fbff;' +
    'font-family:monospace;font-size:18px;text-align:center;z-index:99;';
  panel.textContent = message;
  root.appendChild(panel);
}

/** Parses the registered level definition of a validated request (spec 7.1). */
function parseRequestedLevel(request: DebugLevelRequest): LevelDef | null {
  const levelDefinition = levelById[request.levelId];
  if (levelDefinition === undefined) {
    return null;
  }
  return LevelDef.parse(levelDefinition);
}

/** Defender attack pattern -> attack SFX (spec 9.9 "each attack type"). */
const ATTACK_SFX: Readonly<Record<string, SfxId>> = {
  straight: 'attack_straight',
  lob: 'attack_lob',
  splash: 'attack_splash',
  beam: 'attack_beam',
  diagonal: 'attack_diagonal',
};

/** Damage type -> hit SFX (spec 9.9 "each hit type"). */
const HIT_SFX: Readonly<Record<'pierce' | 'blast' | 'arcane', SfxId>> = {
  pierce: 'hit_pierce',
  blast: 'hit_blast',
  arcane: 'hit_arcane',
};

/** Elemental combo -> combo SFX (spec 9.9 "each combo"). */
const COMBO_SFX: Readonly<Record<ComboId, SfxId>> = {
  steam: 'combo_steam',
  shatter: 'combo_shatter',
  toxic: 'combo_toxic',
  chain: 'combo_chain',
};

/**
 * Plays the placeholder audio of one live sim tick (spec 9.9). Fast-forwarded debug
 * ticks skip this, so a `?tick=` screenshot run does not fire hundreds of sounds.
 */
function playEventAudio(events: readonly SimEvent[], state: Readonly<SimState>): void {
  for (const event of events) {
    switch (event.type) {
      case 'defenderPlaced':
        playSfx('card_place');
        playHaptic('light');
        break;
      case 'defenderMerged':
        playSfx('card_merge');
        break;
      case 'defenderRemoved':
        playSfx(
          event.reason === 'shovel'
            ? 'shovel'
            : event.reason === 'eaten'
              ? 'enemy_eat'
              : 'defender_death',
        );
        break;
      case 'enemySpawned':
        playSfx(enemyById[event.enemyId]?.isBoss === true ? 'boss_roar' : 'enemy_groan');
        break;
      case 'attack': {
        const attacker = state.defenders.find((defender) => defender.id === event.sourceId);
        const pattern =
          attacker === undefined
            ? 'straight'
            : (defenderById[attacker.defenderId]?.pattern ?? 'straight');
        playSfx(ATTACK_SFX[pattern] ?? 'attack_straight');
        break;
      }
      case 'hit':
        playSfx(HIT_SFX[event.damageType]);
        break;
      case 'combo':
        playSfx(COMBO_SFX[event.combo]);
        break;
      case 'enemyDied':
        playSfx('enemy_death');
        break;
      case 'orbSpawned':
        playSfx('orb_drop');
        break;
      case 'orbCollected':
        playSfx('orb_collect');
        break;
      case 'waveStarted':
        // Spec 9.9: the big-wave intensity layer fades in for BIG and FINAL waves.
        setBigWaveIntensity(event.kind !== 'normal');
        break;
      case 'waveBanner':
        playSfx('wave_horn');
        break;
      case 'trapFired':
        playSfx('trap');
        playHaptic('medium');
        break;
      case 'levelWon':
        playSfx('level_win');
        playMusic('victory');
        playHaptic('heavy');
        break;
      case 'levelLost':
        playSfx('level_lose');
        playMusic('defeat');
        playHaptic('heavy');
        break;
      default:
        break;
    }
  }
}

/** The fast-forward result the HUD needs from the skipped ticks (spec 13.7 screenshots). */
interface FastForwardSummary {
  readonly initialBanner: HudBannerKind | null;
  /** Wave kind at the requested tick, so a deep debug tick gets the big-wave layer too. */
  readonly waveKind: 'normal' | 'big' | 'final' | null;
}

/**
 * Fast-forwards the sim `tick` steps through the renderer and remembers whether a
 * wave banner of the last 3 s is still on screen at the requested tick, so a
 * `?tick=` screenshot shows the banner exactly as the live HUD would (spec 3.10).
 */
function fastForwardWithBanner(
  sim: ReturnType<typeof createSim>,
  tick: number,
  renderer: GameRenderer,
): FastForwardSummary {
  let lastBannerKind: HudBannerKind | null = null;
  let lastBannerTick = 0;
  let processedTicks = 0;
  let waveKind: 'normal' | 'big' | 'final' | null = null;
  fastForward(sim, tick, (events) => {
    processedTicks += 1;
    for (const event of events) {
      if (event.type === 'waveBanner') {
        lastBannerKind = event.kind;
        lastBannerTick = processedTicks;
      } else if (event.type === 'waveStarted') {
        waveKind = event.kind;
      }
    }
    renderer.handleEvents(events);
  });
  const initialBanner =
    lastBannerKind === null || processedTicks - lastBannerTick > BANNER_WINDOW_TICKS
      ? null
      : lastBannerKind;
  return { initialBanner, waveKind };
}

/**
 * Starts one level run (issue #27, issue #49): the real sim, renderer, HUD and the
 * fixed-tick loop. The sim is fast-forwarded `tick` steps before the loop starts, so
 * the first rendered frame already shows the requested tick (spec 13.7). The direct
 * debug URL and the "Fight!" button of the Scouting -> Loadout flow both use this path,
 * so renderer, HUD and loop behavior are equal.
 */
function startLevelRun(
  root: HTMLElement,
  renderer: GameRenderer,
  level: LevelDef,
  seed: number,
  tick: number,
  loadout: readonly LoadoutEntry[],
  placements: readonly DebugPlacement[] = [],
  autoCollect = false,
): void {
  const sim = createSim(level, [...loadout], seed);
  if (autoCollect) {
    // Debug-only (issue #66): let the fast-forward collect sky drops so the screenshot
    // loadout is affordable at a deep tick (spec 3.3 auto-collect).
    sim.enqueue({ type: 'setAutoCollect', on: true });
  }
  renderer.showLevel(level);
  playMusic('world1_calm');
  const { initialBanner, waveKind } = fastForwardWithBanner(sim, tick, renderer);
  setBigWaveIntensity(waveKind !== null && waveKind !== 'normal');
  // Debug-only (issue #66): place defenders after the fast-forward, so a deep tick has
  // accumulated enough Essence for the screenshot loadout.
  for (const placement of placements) {
    sim.enqueue({
      type: 'place',
      defenderId: placement.defenderId,
      lane: placement.lane,
      col: placement.col,
    });
  }

  let hud: HudHandle | null = null;
  let finalWaveStarted = false;
  let slowMotionPlayed = false;
  const levelRenderer = {
    handleEvents: (events: readonly SimEvent[]): void => {
      renderer.handleEvents(events);
      hud?.handleEvents(mapHudEvents(events));
      playEventAudio(events, sim.state);
      for (const event of events) {
        if (event.type === 'waveStarted' && event.kind === 'final') {
          finalWaveStarted = true;
        }
        if (event.type === 'levelWon' && finalWaveStarted && !slowMotionPlayed) {
          // Spec 9.7: the last enemy of the final wave dying runs the game at 0.3x for 0.6 s.
          slowMotionPlayed = true;
          loop.setTimeScale(SLOW_MOTION_SCALE, SLOW_MOTION_DURATION_S * 1000);
        }
      }
    },
    draw: (state: Readonly<SimState>, alpha: number): void => {
      renderer.draw(state, alpha);
    },
  };
  const loop = startGameLoop({ sim, renderer: levelRenderer });
  hud = mountHud(root, {
    readState: () => readHudState(sim, loop, level),
    actions: createHudActions(sim, loop),
    pointerToWorld: renderer.pointerToWorld,
    initialBanner,
  });
}

/**
 * Boots the direct debug level run of issue #27 (spec 13.7): the fixed tutorial
 * loadout, or the first available defenders on a free-loadout level.
 */
function startDebugLevel(
  root: HTMLElement,
  renderer: GameRenderer,
  request: DebugLevelRequest,
): void {
  const level = parseRequestedLevel(request);
  if (level === null) {
    showDebugError(root, `Debug URL: unknown level "${request.levelId}".`);
    return;
  }
  startLevelRun(
    root,
    renderer,
    level,
    request.seed,
    request.tick,
    createDebugLoadout(level, request.cards),
    request.placements ?? [],
    request.autoCollect === true,
  );
}

/**
 * Opens the additive Scouting -> Loadout entry of issue #49 for
 * `?level=<id>&scout=1`. "Fight!" removes the screens and starts the level through
 * `startLevelRun` with the chosen 6 cards, so the spec 13.7 direct-start contract
 * and its e2e/perf runs stay untouched.
 */
function startScoutFlow(
  root: HTMLElement,
  renderer: GameRenderer,
  request: DebugLevelRequest,
): void {
  const level = parseRequestedLevel(request);
  if (level === null) {
    showDebugError(root, `Debug URL: unknown level "${request.levelId}".`);
    return;
  }
  let flow: ScoutFlowHandle | null = null;
  flow = mountScoutFlow(root, {
    level,
    onFight: (chosenLoadout) => {
      flow?.dispose();
      const loadout: LoadoutEntry[] = chosenLoadout.map((choice) => ({
        defenderId: choice.defenderId,
        level: choice.cardLevel,
      }));
      startLevelRun(root, renderer, level, request.seed, request.tick, loadout);
    },
  });
}

/** Boots the game client: a full-screen 3D canvas under the Preact UI overlay. */
function boot(): void {
  const root = document.querySelector<HTMLElement>('#app');
  if (root === null) {
    throw new Error('Boot failed: #app element is missing from index.html');
  }
  const debugUrl = parseDebugUrl(window.location.search);
  if (debugUrl.kind === 'error') {
    showDebugError(root, debugUrl.message);
    return;
  }
  installAudioUnlock();
  const renderer = createRenderer(root);
  if (debugUrl.kind === 'level') {
    startDebugLevel(root, renderer, debugUrl);
    return;
  }
  if (debugUrl.kind === 'scout') {
    startScoutFlow(root, renderer, debugUrl);
    playMusic('menu');
    return;
  }
  mountUi(root);
  playMusic('menu');
  startRenderLoop(() => {
    renderer.draw();
  });
}

boot();
