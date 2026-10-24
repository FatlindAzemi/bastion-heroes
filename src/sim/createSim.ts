import { updateDefenders } from './combat/defenderActions';
import { removeDeadEntities } from './combat/deaths';
import { updateEnemies } from './combat/enemyActions';
import { updateStatusEffects } from './combat/status';
import { updateProjectiles } from './combat/projectiles';
import { collectOrb, updateEssence } from './essence';
import { checkLevelResult } from './levelResult';
import { initialCardCooldownEndTicks, placeDefender, shovelDefender } from './placement';
import { createRng } from './rng';
import { initialTraps, updateTraps } from './traps';
import type { Command, LevelDef, LoadoutEntry, Sim, SimEvent, SimState } from './types';
import { initialWaveState, updateWaves } from './waves';

/**
 * Creates the simulation for one level run (spec 11.3).
 *
 * The state starts at tick 0 with empty entity lists, the id counter at 1, the
 * level's starting Essence, ready/cooldown card timers, one Last Stand Trap per
 * lane, the wave schedule and a mulberry32 generator seeded with `seed`. `step()`
 * advances exactly one 1/30 s tick in the fixed phase order of spec 11.3.
 */
export function createSim(level: LevelDef, loadout: LoadoutEntry[], seed: number): Sim {
  const state: SimState = {
    levelId: level.id,
    seed,
    loadout: [...loadout],
    cardCooldownEndTicks: initialCardCooldownEndTicks(loadout),
    tick: 0,
    rng: createRng(seed),
    nextId: 1,
    essence: level.startEssence,
    autoCollect: false,
    defenders: [],
    enemies: [],
    projectiles: [],
    orbs: [],
    wave: initialWaveState(level),
    traps: initialTraps(),
    status: 'playing',
    stars: 0,
    defendersLost: 0,
  };

  const commandQueue: Command[] = [];

  /** Phase 1 (spec 11.3): applies the queued commands in order, then empties the queue. */
  function applyQueuedCommands(events: SimEvent[]): void {
    for (const command of commandQueue) {
      applyCommand(command, events);
    }
    commandQueue.length = 0;
  }

  /** Applies one command; rejected commands change nothing (spec 11.3). */
  function applyCommand(command: Command, events: SimEvent[]): void {
    switch (command.type) {
      case 'place':
        placeDefender(state, level, command, events);
        break;
      case 'shovel':
        shovelDefender(state, command, events);
        break;
      case 'collectOrb':
        collectOrb(state, command, events);
        break;
      case 'setAutoCollect':
        state.autoCollect = command.on;
        break;
    }
  }

  /** Runs one tick step: the fixed phase order of spec 11.3, then advances the tick. */
  function step(): SimEvent[] {
    // After the level ended (won or lost) nothing changes any more: further step()
    // calls return no events and leave the state untouched. The game loop stops on
    // the levelWon/levelLost event, this guard is only a safety net (spec 3.9, 3.10).
    if (state.status !== 'playing') {
      return [];
    }

    const events: SimEvent[] = [];

    applyQueuedCommands(events); // 1) queued commands, in order
    updateWaves(state, level, events); // 2) waves spawn
    updateEssence(state, level, events); // 3) Essence and orbs
    updateDefenders(state, events); // 4) defenders act, sorted by id
    updateProjectiles(state, events); // 5) projectiles move and hit
    updateStatusEffects(state, level, events); // 6) status effects tick
    updateEnemies(state, events); // 7) enemies move, block and eat, sorted by id
    removeDeadEntities(state, events); // 8) remove dead entities
    updateTraps(state, events); // 9) Last Stand Traps
    checkLevelResult(state, events); // 10) win and loss check

    state.tick += 1;
    return events;
  }

  return {
    state,
    enqueue(command: Command): void {
      // Commands after the end of the level are ignored, like every later change (spec 3.9, 3.10).
      if (state.status !== 'playing') {
        return;
      }
      commandQueue.push(command);
    },
    step,
  };
}
