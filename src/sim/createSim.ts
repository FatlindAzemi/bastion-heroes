import { createRng } from './rng';
import type { Command, LevelDef, LoadoutEntry, Sim, SimEvent, SimState } from './types';

/**
 * Creates the simulation for one level run (spec 11.3).
 *
 * The state starts at tick 0 with empty entity lists, the id counter at 1, the
 * level's starting Essence and a mulberry32 generator seeded with `seed`.
 * `step()` advances exactly one 1/30 s tick in the fixed phase order of spec 11.3.
 */
export function createSim(level: LevelDef, loadout: LoadoutEntry[], seed: number): Sim {
  const state: SimState = {
    levelId: level.id,
    seed,
    loadout: [...loadout],
    tick: 0,
    rng: createRng(seed),
    nextId: 1,
    essence: level.startEssence,
    autoCollect: false,
    defenders: [],
    enemies: [],
    projectiles: [],
    orbs: [],
  };

  const commandQueue: Command[] = [];

  /** Phase 1 (spec 11.3): applies the queued commands in order, then empties the queue. */
  function applyQueuedCommands(): void {
    for (const command of commandQueue) {
      applyCommand(command);
    }
    commandQueue.length = 0;
  }

  /**
   * Applies one command. This skeleton only stores the auto-collect setting;
   * placement, shovel and orb collection are added by the later M1 issues.
   */
  function applyCommand(command: Command): void {
    switch (command.type) {
      case 'setAutoCollect':
        state.autoCollect = command.on;
        break;
      case 'place':
      case 'shovel':
      case 'collectOrb':
        // Rules land in #18 (placement), #19 (orbs) and #21 (combat); no-op for now.
        break;
    }
  }

  // The phases below are the fixed tick order of spec 11.3. They are empty in
  // issue #16; each later M1 issue fills in its phase.
  function spawnWaves(): void {
    // Issue #20 (spec 3.10).
  }

  function updateEssence(): void {
    // Issue #19 (spec 3.3).
  }

  function updateDefenders(): void {
    // Issue #21 (spec 3.4, 4.4: defenders act sorted by id).
  }

  function updateProjectiles(): void {
    // Issue #21 (spec 4.3, 4.4).
  }

  function updateStatusEffects(): void {
    // Issue #21 (spec 4.5).
  }

  function updateEnemies(): void {
    // Issue #21 (spec 3.8: enemies move, block and eat sorted by id).
  }

  function removeDeadEntities(): void {
    // Issue #21 (spec 3.8, 4.7).
  }

  function updateTraps(): void {
    // Issue #22 (spec 3.9).
  }

  function checkLevelResult(): void {
    // Issue #22 (spec 3.9, 3.10).
  }

  /** Runs one tick step: the fixed phase order of spec 11.3, then advances the tick. */
  function step(): SimEvent[] {
    const events: SimEvent[] = [];

    applyQueuedCommands(); // 1) queued commands, in order
    spawnWaves(); // 2) waves spawn
    updateEssence(); // 3) Essence and orbs
    updateDefenders(); // 4) defenders act, sorted by id
    updateProjectiles(); // 5) projectiles move and hit
    updateStatusEffects(); // 6) status effects tick
    updateEnemies(); // 7) enemies move, block and eat, sorted by id
    removeDeadEntities(); // 8) remove dead entities
    updateTraps(); // 9) Last Stand Traps
    checkLevelResult(); // 10) win and loss check

    state.tick += 1;
    return events;
  }

  return {
    state,
    enqueue(command: Command): void {
      commandQueue.push(command);
    },
    step,
  };
}
