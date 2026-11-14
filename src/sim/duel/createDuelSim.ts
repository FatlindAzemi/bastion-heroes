import { duelRules } from '../../data';
import { updateDefenders } from '../combat/defenderActions';
import { removeDeadDefenders, removeDeadEnemies } from '../combat/deaths';
import { updateFirePatches } from '../combat/firePatches';
import { updateProjectiles } from '../combat/projectiles';
import { updateStatusEffects } from '../combat/status';
import { createRng } from '../rng';
import { playDefender } from './cards';
import { updateDuelEssence } from './essence';
import { createEventLog, type DuelEventLog } from './events';
import { initialDuelTraps, updateTrapsAndGates } from './gates';
import { surrender, updateMatchEnd } from './matchEnd';
import { acceptsCommands, initialPhaseState, updatePhase } from './phases';
import { playRaider } from './raiderCards';
import { updateRaiders } from './raiders';
import { DUEL_BOARD, sideOrder } from './sides';
import type { DuelCommand, DuelEvent, DuelSim, DuelSideState, DuelState } from './types';

/** What a player starts with: Essence, a full gate and five unused traps (spec 18.3, 18.7). */
function initialSideState(): DuelSideState {
  return {
    essence: duelRules.essence.startingEssence,
    gateHealth: duelRules.gate.gateHealth,
    traps: initialDuelTraps(),
  };
}

/** The state of a new match: tick 0 of the countdown, an empty board (spec 18.2, 19.11). */
function initialDuelState(seed: number): DuelState {
  return {
    seed,
    rng: createRng(seed),
    tick: 0,
    nextId: 1,
    ...initialPhaseState(),
    sides: { south: initialSideState(), north: initialSideState() },
    defenders: [],
    enemies: [],
    summons: [],
    projectiles: [],
    firePatches: [],
    result: null,
  };
}

/** Applies one command; a rejected command changes nothing (spec 18.5, 19.11). */
function applyCommand(state: DuelState, command: DuelCommand, events: DuelEvent[]): void {
  if (!acceptsCommands(state)) {
    // Spec 18.2: no commands are accepted during the countdown.
    events.push({
      type: 'commandRejected',
      side: command.side,
      reason: 'matchNotRunning',
      command,
    });
    return;
  }
  switch (command.type) {
    case 'playDefender':
      playDefender(state, command, events);
      break;
    case 'playRaider':
      playRaider(state, command, events);
      break;
    case 'surrender':
      surrender(state, command, events);
      break;
  }
}

/** Tick steps 3 to 5 (spec 19.11): defenders act, projectiles fly, status effects tick. */
function updateDefenderCombat(state: DuelState, log: DuelEventLog): void {
  log.emitShared((events) => updateDefenders(state, events));
  log.emitShared((events) => updateProjectiles(state, events));
  log.emitShared((events) => {
    updateStatusEffects(state, DUEL_BOARD, events);
    updateFirePatches(state, events);
  });
}

/** Tick step 7 (spec 19.11): removes the dead units of both sides. */
function removeDeadUnits(state: DuelState, log: DuelEventLog): void {
  log.emitShared((events) => {
    removeDeadEnemies(state, events);
    removeDeadDefenders(state, events);
  });
}

/**
 * Creates the simulation of one Duel (spec 19.11).
 *
 * The state starts at tick 0 of the countdown with an empty board, the id counter
 * at 1, both players' starting Essence and a mulberry32 generator seeded with
 * `seed`. `step()` advances exactly one 1/30 s tick in the fixed order of 19.11.
 * The sim does not know the decks: the caller checks hands and passes only legal
 * card plays (spec 19.3).
 */
export function createDuelSim(seed: number): DuelSim {
  const state = initialDuelState(seed);
  /** Commands by the tick that applies them, in arrival order. */
  const scheduled = new Map<number, DuelCommand[]>();

  /** Tick step 1 (spec 19.11): this tick's commands, south first, then in arrival order. */
  function applyScheduledCommands(events: DuelEvent[]): void {
    const commands = scheduled.get(state.tick) ?? [];
    scheduled.delete(state.tick);
    // Array.prototype.sort is stable, so equal sides keep their arrival order.
    const ordered = [...commands].sort(
      (first, second) => sideOrder(first.side) - sideOrder(second.side),
    );
    for (const command of ordered) {
      // A surrender ends the match; the commands after it change nothing (spec 18.2).
      if (state.result !== null) {
        return;
      }
      applyCommand(state, command, events);
    }
  }

  function step(): DuelEvent[] {
    // After the match ended nothing changes any more (spec 18.2).
    if (state.result !== null) {
      return [];
    }
    const log = createEventLog(state);
    applyScheduledCommands(log.events); // 1) commands of this tick
    if (state.result === null) {
      runTick(log);
    }
    state.tick += 1;
    return log.events;
  }

  /** Tick steps 2 to 9 (spec 19.11); skipped when a surrender ended the match in step 1. */
  function runTick(log: DuelEventLog): void {
    updateDuelEssence(state, log.events); // 2) Essence income
    updateDefenderCombat(state, log); // 3) defenders, 4) projectiles, 5) status effects
    updateRaiders(state, log); // 6) raiders are summoned, move, block and fight
    removeDeadUnits(state, log); // 7) remove dead units
    updateTrapsAndGates(state, log.events); // 8) traps and gate damage
    updateMatchEnd(state, log.events); // 9) end check: broken gate, sudden death
    updatePhase(state, log.events); // 9) phase changes and end by time
  }

  return {
    state,
    enqueue(command: DuelCommand, tick: number): void {
      // Commands after the end of the match are ignored, like every later change (spec 18.2).
      if (state.result !== null) {
        return;
      }
      if (!Number.isInteger(tick) || tick < state.tick) {
        throw new RangeError(`Cannot schedule a command for tick ${tick} at tick ${state.tick}.`);
      }
      const commands = scheduled.get(tick);
      if (commands === undefined) {
        scheduled.set(tick, [command]);
      } else {
        commands.push(command);
      }
    },
    step,
  };
}
