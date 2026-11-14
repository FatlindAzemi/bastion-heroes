import { defenderById, enemyById, levelById, levels, rules } from './data';
import { LevelDef } from './data/schemas';
import {
  createDebugLoadout,
  createFinalWavePreview,
  fastForward,
  parseDebugUrl,
  type DebugLevelRequest,
  type DebugPlacement,
} from './debug';
import { parseDuelDebugUrl, startDebugDuel } from './debugDuel';
import { startGameLoop, startRenderLoop, type GameLoop } from './loop';
import {
  applyLevelResult,
  applySettings,
  chestCount,
  ensureDailyQuests,
  loadSave,
  markTutorialSeen,
  nextLevelId,
  persistSave,
  todayKey,
  type LevelRewardSummary,
  type QuestRunSummary,
  type SaveData,
} from './meta';
import { installAudioUnlock, playMusic, playSfx, setBigWaveIntensity } from './platform/audio';
import type { SfxId } from './platform/audioManifest';
import { playHaptic } from './platform/haptics';
import { SLOW_MOTION_DURATION_S, SLOW_MOTION_SCALE } from './render/vfx/juice';
import { createRenderer, type GameRenderer } from './render';
import { createSim } from './sim';
import type { Command, ComboId, LoadoutEntry, SimEvent, SimState } from './sim/types';
import {
  mountHud,
  mountResult,
  mountScoutFlow,
  mountShell,
  type HudActions,
  type HudBannerKind,
  type HudBossView,
  type HudEvent,
  type HudHandle,
  type HudStateView,
  type HudTipView,
  type LoadoutChoice,
  type ResultHandle,
  type ResultOutcome,
  type ResultStars,
  type ScoutFlowHandle,
  type ShellHandle,
  type ShellLevel,
  type ShellScreenName,
} from './ui';
import { highestCardStars } from './ui/hud/cardStars';
import { levelProgressView } from './ui/hud/levelProgressView';
import { tutorialTipFor } from './ui/hud/tutorialTips';

/** The sim surface the HUD bridge reads and drives (spec 11.3). */
interface HudSim {
  readonly state: Readonly<SimState>;
  enqueue(command: Command): void;
}

/** How many ticks before the debug tick a wave banner still counts as visible (spec 3.10, 9.8). */
const BANNER_WINDOW_TICKS = Math.round(3 * rules.tick.tickRate);

/** Delay before the result overlay appears, so the final-kill juice can finish (spec 9.7). */
const RESULT_DELAY_WON_MS = 1100;
const RESULT_DELAY_LOST_MS = 800;

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

/** The run facts the result screen and the meta rewards need (M4 quests). */
interface RunStats {
  enemiesDefeated: number;
  combosTriggered: number;
  mergesTo3: number;
  trapUsed: boolean;
}

/** Hooks a host provides to a running level (issue #113: shell navigation and result overlay). */
interface LevelRunHooks {
  readonly onResult: (outcome: ResultOutcome, stars: ResultStars, stats: RunStats) => void;
  readonly onRestart: () => void;
  readonly onQuit: () => void;
}

/** Turns HUD intents into sim commands and game-loop calls (spec 11.3, 3.2). */
function createHudActions(sim: HudSim, loop: GameLoop, hooks: LevelRunHooks): HudActions {
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
    onRestart: hooks.onRestart,
    onQuit: hooks.onQuit,
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

/** Options the shell and the debug entries pass into one level run (issue #113). */
interface LevelRunOptions {
  readonly level: LevelDef;
  readonly seed: number;
  readonly tick: number;
  readonly loadout: readonly LoadoutEntry[];
  readonly placements?: readonly DebugPlacement[];
  readonly autoCollect?: boolean;
  /** First-time tutorial bubble shown once per level (M4 spec 4.9). */
  readonly tip?: HudTipView;
  /** Apply `placements` before the fast-forward instead of after it (final-wave preview). */
  readonly placeBefore?: boolean;
}

/** A running level; `dispose` stops the loop, removes the HUD and clears pending timers. */
interface LevelRunHandle {
  dispose(): void;
}

/**
 * Starts one level run (issue #27, #49, #113): the real sim, renderer, HUD and the
 * fixed-tick loop. The sim is fast-forwarded `tick` steps before the loop starts, so
 * the first rendered frame already shows the requested tick (spec 13.7). The shell and
 * the debug URLs share this path, so renderer, HUD and loop behavior are equal.
 */
function startLevelRun(
  root: HTMLElement,
  renderer: GameRenderer,
  options: LevelRunOptions,
  hooks: LevelRunHooks,
): LevelRunHandle {
  const { level, seed, tick, loadout } = options;
  const sim = createSim(level, [...loadout], seed);
  if (options.autoCollect === true) {
    // Debug-only (issue #66): let the fast-forward collect sky drops so the screenshot
    // loadout is affordable at a deep tick (spec 3.3 auto-collect).
    sim.enqueue({ type: 'setAutoCollect', on: true });
  }
  renderer.showLevel(level);
  playMusic('world1_calm');
  if (options.placeBefore === true) {
    // Final-wave preview (spec 13.7): the defenders must hold the lane during the fast-forward.
    addDebugPlacements(sim, options.placements ?? []);
    sim.enqueue({ type: 'setAutoCollect', on: true });
  }
  const { initialBanner, waveKind } = fastForwardWithBanner(sim, tick, renderer);
  setBigWaveIntensity(waveKind !== null && waveKind !== 'normal');
  if (options.placeBefore !== true) {
    addDebugPlacements(sim, options.placements ?? []);
  }

  let hud: HudHandle | null = null;
  let loop: GameLoop | null = null;
  let disposed = false;
  let resultTimer: ReturnType<typeof setTimeout> | null = null;
  let finalWaveStarted = false;
  let slowMotionPlayed = false;
  const stats: RunStats = { enemiesDefeated: 0, combosTriggered: 0, mergesTo3: 0, trapUsed: false };

  const scheduleResult = (outcome: ResultOutcome, stars: ResultStars): void => {
    if (disposed || resultTimer !== null) {
      return;
    }
    const delayMs = outcome === 'won' ? RESULT_DELAY_WON_MS : RESULT_DELAY_LOST_MS;
    resultTimer = setTimeout(() => {
      if (disposed) {
        return;
      }
      loop?.stop();
      hud?.dispose();
      setBigWaveIntensity(false);
      hooks.onResult(outcome, stars, stats);
    }, delayMs);
  };

  const levelRenderer = {
    handleEvents: (events: readonly SimEvent[]): void => {
      renderer.handleEvents(events);
      hud?.handleEvents(mapHudEvents(events));
      playEventAudio(events, sim.state);
      observeLevelEvents(events);
    },
    draw: (state: Readonly<SimState>, alpha: number): void => {
      renderer.draw(state, alpha);
    },
  };

  /** Reacts to the wave and result events the HUD/result flow needs (spec 3.9, 3.10, 9.7). */
  const observeLevelEvents = (events: readonly SimEvent[]): void => {
    for (const event of events) {
      if (event.type === 'enemyDied') {
        stats.enemiesDefeated += 1;
      } else if (event.type === 'combo') {
        stats.combosTriggered += 1;
      } else if (event.type === 'defenderMerged' && event.stars === 3) {
        stats.mergesTo3 += 1;
      } else if (event.type === 'trapFired') {
        stats.trapUsed = true;
      }
      if (event.type === 'waveStarted' && event.kind === 'final') {
        finalWaveStarted = true;
      }
      if (event.type === 'levelWon' && finalWaveStarted && !slowMotionPlayed) {
        // Spec 9.7: the last enemy of the final wave dying runs the game at 0.3x for 0.6 s.
        slowMotionPlayed = true;
        loop?.setTimeScale(SLOW_MOTION_SCALE, SLOW_MOTION_DURATION_S * 1000);
      }
      if (event.type === 'levelWon') {
        scheduleResult('won', event.stars as ResultStars);
      } else if (event.type === 'levelLost') {
        scheduleResult('lost', 0);
      }
    }
  };

  const startedLoop = startGameLoop({ sim, renderer: levelRenderer });
  loop = startedLoop;
  hud = mountHud(root, {
    readState: () => readHudState(sim, startedLoop, level),
    actions: createHudActions(sim, startedLoop, hooks),
    pointerToWorld: renderer.pointerToWorld,
    initialBanner,
    ...(options.tip === undefined ? {} : { tip: options.tip }),
  });
  return {
    dispose: (): void => {
      if (disposed) {
        return;
      }
      disposed = true;
      if (resultTimer !== null) {
        clearTimeout(resultTimer);
        resultTimer = null;
      }
      startedLoop.stop();
      hud?.dispose();
      setBigWaveIntensity(false);
    },
  };
}

/** Applies the debug-only `?place=` auto placements after the fast-forward (issue #66). */
function addDebugPlacements(
  sim: ReturnType<typeof createSim>,
  placements: readonly DebugPlacement[],
): void {
  for (const placement of placements) {
    sim.enqueue({
      type: 'place',
      defenderId: placement.defenderId,
      lane: placement.lane,
      col: placement.col,
    });
  }
}

/**
 * Starts one level with a standalone result overlay: retry replays the same run, levels
 * goes back to the title. Debug entries (spec 13.7) use this; the playable shell owns its
 * own navigation in `startShell`.
 */
function startStandaloneLevel(
  root: HTMLElement,
  renderer: GameRenderer,
  options: LevelRunOptions,
): void {
  let result: ResultHandle | null = null;
  const start = (): void => {
    result?.dispose();
    result = null;
    startLevelRun(root, renderer, options, {
      onResult: (outcome, stars) => {
        result = mountResult(root, {
          outcome,
          stars,
          levelName: options.level.name,
          onRetry: start,
          onLevels: () => window.location.assign(window.location.pathname),
        });
      },
      onRestart: start,
      onQuit: () => window.location.assign(window.location.pathname),
    });
  };
  start();
}

/** Default final-wave preview placements: one defender per lane on the rear tiles. */
function defaultPlacements(loadout: readonly LoadoutEntry[]): readonly DebugPlacement[] {
  return loadout.map((entry, index) => ({
    defenderId: entry.defenderId,
    lane: index % rules.grid.laneCount,
    col: 1 + (index % 3),
  }));
}

/**
 * Boots the direct debug level run of issue #27 (spec 13.7): the fixed tutorial
 * loadout, or the first available defenders on a free-loadout level. `?finalwave=1`
 * starts the final-wave preview with pre-placed defenders (13.7 screenshots).
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
  const finalWave = request.finalWave === true;
  const previewLevel = finalWave ? createFinalWavePreview(level) : level;
  const loadout = createDebugLoadout(previewLevel, request.cards);
  startStandaloneLevel(root, renderer, {
    level: previewLevel,
    seed: request.seed,
    tick: request.tick > 0 ? request.tick : finalWave ? 1800 : 0,
    loadout,
    placements: request.placements ?? defaultPlacements(loadout),
    autoCollect: request.autoCollect === true || finalWave,
    placeBefore: finalWave,
  });
}

/**
 * Opens the additive Scouting -> Loadout entry of issue #49 for
 * `?level=<id>&scout=1`. "Fight!" removes the screens and starts the level through
 * `startStandaloneLevel` with the chosen 6 cards, so the spec 13.7 direct-start
 * contract and its e2e/perf runs stay untouched.
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
      startStandaloneLevel(root, renderer, {
        level,
        seed: request.seed,
        tick: request.tick,
        loadout: toLoadoutEntries(chosenLoadout),
      });
    },
  });
}

/** Maps the UI loadout choices to sim loadout entries (spec 3.12). */
function toLoadoutEntries(choices: readonly LoadoutChoice[]): LoadoutEntry[] {
  return choices.map((choice) => ({ defenderId: choice.defenderId, level: choice.cardLevel }));
}

/** The World 1 levels shown by the shell's level select (spec 11.8). */
function shellLevels(): ShellLevel[] {
  return [...levels]
    .sort((left, right) => left.number - right.number)
    .map((level) => ({ id: level.id, name: level.name, index: level.number }));
}

/**
 * Boots the playable portrait shell: the 3D title scene under the title screen, then
 * Level Select -> Scouting -> Loadout -> level -> result (issue #113) and the M4
 * meta loop (collection, chests, settings, daily quests). The shell is unmounted
 * while a level runs and remounted with the updated save afterwards.
 */
function startShell(
  root: HTMLElement,
  renderer: GameRenderer,
  initialSave: SaveData,
  initialScreen: ShellScreenName = 'title',
): void {
  const gameLevels = shellLevels();
  let save = initialSave;
  let shell: ShellHandle | null = null;
  let run: LevelRunHandle | null = null;
  let result: ResultHandle | null = null;

  /** Persists one shell transaction; the shell owns its local copy of the save. */
  const commitSave = (next: SaveData): void => {
    save = next;
    persistSave(next);
  };

  /** Disposes the current overlay and mounts one shell screen with the latest save. */
  const mountMenu = (screen: ShellScreenName, initialLevelId?: string): void => {
    result?.dispose();
    result = null;
    run?.dispose();
    run = null;
    renderer.showTitle();
    playMusic('menu');
    shell?.dispose();
    shell = mountShell(root, {
      levels: gameLevels,
      save,
      onSave: commitSave,
      onFight: beginLevel,
      initialScreen: screen,
      ...(initialLevelId === undefined ? {} : { initialLevelId }),
    });
  };

  const showLevelSelect = (): void => mountMenu('levels');
  const showChests = (): void => mountMenu('chests');
  const showLevelScouting = (levelId: string): void => mountMenu('title', levelId);

  const beginRun = (level: LevelDef, loadout: readonly LoadoutEntry[]): void => {
    result?.dispose();
    result = null;
    run?.dispose();
    run = null;
    const tip = tutorialTipFor(level.id, save.tutorial.seenHints);
    if (tip !== null) {
      // The tip is once per level: remember it before the level starts, so a reload
      // or a retry never shows the same lesson twice.
      save = markTutorialSeen(save, tip.id);
      persistSave(save);
    }
    run = startLevelRun(
      root,
      renderer,
      {
        level,
        seed: level.seed,
        tick: 0,
        loadout,
        autoCollect: save.settings.autoCollect,
        ...(tip === null ? {} : { tip }),
      },
      {
        onResult: (outcome, stars, stats) => {
          const summary: QuestRunSummary = {
            won: outcome === 'won',
            stars,
            enemiesDefeated: stats.enemiesDefeated,
            combosTriggered: stats.combosTriggered,
            mergesTo3: stats.mergesTo3,
            trapUsed: stats.trapUsed,
            onlyCommonCards: loadout.every(
              (entry) => defenderById[entry.defenderId]?.rarity === 'common',
            ),
          };
          const applied = applyLevelResult(save, level, outcome, stars, summary, todayKey());
          save = applied.save;
          persistSave(save);
          const nextId = outcome === 'won' ? nextLevelId(level.id) : null;
          const next = nextId === null ? undefined : levelById[nextId];
          const unopened = chestCount(save);
          result = mountResult(root, {
            outcome,
            stars,
            levelName: level.name,
            rewards: applied.rewards,
            ...(next === undefined
              ? {}
              : {
                  nextLevelName: next.name,
                  onNext: (): void => showLevelScouting(next.id),
                }),
            ...(unopened === 0 ? {} : { chestCount: unopened, onOpenChests: showChests }),
            onRetry: (): void => beginRun(level, loadout),
            onLevels: showLevelSelect,
          });
        },
        onRestart: (): void => beginRun(level, loadout),
        onQuit: showLevelSelect,
      },
    );
  };

  const beginLevel = (levelId: string, loadout: readonly LoadoutChoice[]): void => {
    shell?.dispose();
    shell = null;
    const level = levelById[levelId];
    if (level === undefined) {
      showLevelSelect();
      return;
    }
    beginRun(LevelDef.parse(level), toLoadoutEntries(loadout));
  };

  mountMenu(initialScreen);
  startRenderLoop(() => {
    renderer.draw();
  });
  playMusic('menu');
}

/** Resolves the level of a `?result=` preview URL (hyphens and underscores accepted). */
function previewLevel(rawLevelId: string | null): LevelDef | null {
  const direct = rawLevelId === null ? undefined : levelById[rawLevelId];
  const normalised = rawLevelId === null ? undefined : levelById[rawLevelId.replace(/-/g, '_')];
  const source = direct ?? normalised ?? levels[0];
  return source === undefined ? null : LevelDef.parse(source);
}

/**
 * Debug-only result preview `?result=won|lost&level=<id>&stars=<n>` (issue #113):
 * draws a deterministic frozen level frame and mounts the Victory/Defeat overlay on
 * top, so the result screen can be screenshotted and tested without playing a full
 * level. `rewards=1` fills the M4 reward rows; `next=1` and `chests=<n>` show the
 * follow-up actions with working debug destinations.
 */
function startResultPreview(
  root: HTMLElement,
  renderer: GameRenderer,
  query: URLSearchParams,
): void {
  const level = previewLevel(query.get('level'));
  if (level === null) {
    showDebugError(root, 'Result preview: unknown level.');
    return;
  }
  const outcome: ResultOutcome = query.get('result') === 'lost' ? 'lost' : 'won';
  const rawStars = Number(query.get('stars') ?? '');
  const stars = (
    Number.isInteger(rawStars) && rawStars >= 0 && rawStars <= 3
      ? rawStars
      : outcome === 'won'
        ? 3
        : 0
  ) as ResultStars;
  const rawTick = Number(query.get('tick') ?? '900');
  const tick = Number.isFinite(rawTick) && rawTick >= 0 ? Math.floor(rawTick) : 900;
  const sim = createSim(level, createDebugLoadout(level), level.seed);
  renderer.showLevel(level);
  fastForward(sim, tick, (events) => renderer.handleEvents(events));
  renderer.draw(sim.state, 0);
  const withRewards = query.get('rewards') === '1';
  const rawChests = Number(query.get('chests') ?? '0');
  const unopened = Number.isInteger(rawChests) && rawChests > 0 ? Math.min(rawChests, 99) : 0;
  const next = outcome === 'won' ? nextLevelId(level.id) : null;
  const nextLevel = next === null ? undefined : levelById[next];
  const rewards: LevelRewardSummary = {
    gold: outcome === 'won' ? level.rewards.gold : 0,
    gems: outcome === 'won' ? 50 : 0,
    questGold: 50,
    questGems: 10,
    stars,
    previousStars: 0,
    bestStars: stars,
    unlockedDefenderId: outcome === 'won' ? (level.rewards.unlockDefender ?? null) : null,
    chest: outcome === 'won' ? (level.rewards.firstClearChest ?? null) : null,
    questChest: null,
    completedQuests: ['win_three'],
  };
  mountResult(root, {
    outcome,
    stars,
    levelName: level.name,
    ...(withRewards ? { rewards } : {}),
    ...(withRewards && nextLevel !== undefined && query.get('next') === '1'
      ? {
          nextLevelName: nextLevel.name,
          onNext: (): void => window.location.assign(`/?level=${nextLevel.id}&scout=1`),
        }
      : {}),
    ...(withRewards && unopened > 0
      ? {
          chestCount: unopened,
          onOpenChests: (): void => window.location.assign('/?screen=chests'),
        }
      : {}),
    onRetry: () => window.location.reload(),
    onLevels: () => window.location.assign(window.location.pathname),
  });
}

/** Boots the game client: a full-screen 3D canvas under the Preact UI overlay. */
function boot(): void {
  const root = document.querySelector<HTMLElement>('#app');
  if (root === null) {
    throw new Error('Boot failed: #app element is missing from index.html');
  }
  const query = new URLSearchParams(window.location.search);
  installAudioUnlock();
  let save = loadSave();
  const dailyQuests = ensureDailyQuests(save.dailyQuests, todayKey());
  if (dailyQuests !== save.dailyQuests) {
    save = { ...save, dailyQuests };
    persistSave(save);
  }
  applySettings(save);
  const renderer = createRenderer(root);
  if (query.has('result')) {
    startResultPreview(root, renderer, query);
    return;
  }
  // Issue #129: `?duel=1` shows a bot-vs-bot Duel until the Training entry exists (#130).
  const duelDebug = parseDuelDebugUrl(window.location.search);
  if (duelDebug.kind === 'error') {
    showDebugError(root, duelDebug.message);
    return;
  }
  if (duelDebug.kind === 'duel') {
    startDebugDuel(renderer, duelDebug);
    return;
  }
  const debugUrl = parseDebugUrl(window.location.search);
  if (debugUrl.kind === 'error') {
    showDebugError(root, debugUrl.message);
    return;
  }
  if (debugUrl.kind === 'level') {
    startDebugLevel(root, renderer, debugUrl);
    return;
  }
  if (debugUrl.kind === 'scout') {
    startScoutFlow(root, renderer, debugUrl);
    playMusic('menu');
    return;
  }
  const screenParam = query.get('screen');
  const initialScreen: ShellScreenName =
    screenParam === 'levels' ||
    screenParam === 'collection' ||
    screenParam === 'chests' ||
    screenParam === 'settings' ||
    screenParam === 'quests'
      ? screenParam
      : 'title';
  startShell(root, renderer, save, initialScreen);
}

boot();
