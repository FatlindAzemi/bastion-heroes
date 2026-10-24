/**
 * The balancing bot of spec 16.2: the five variants, their loadouts and the
 * fixed priority list that produces `sim.enqueue` commands every 15 ticks.
 *
 * Every game number is read from `src/data` (spec 1.1 rule 7). The numbers that
 * remain here are the bot rules of spec 16.2 (decision interval, targets) and
 * the progression settings of spec 8.3 (recommended card level per world).
 */
import { defenderById, defenders, enemyById, rules } from '../../src/data';
import type { DefenderDef, EnemyDef, LevelDef } from '../../src/data';
import {
  createRng,
  createSim,
  isCardReady,
  isPlaceableTile,
  ticksFromSeconds,
} from '../../src/sim';
import type {
  Command,
  DefenderState,
  EnemyState,
  LoadoutEntry,
  Rng,
  SimEvent,
  SimState,
} from '../../src/sim';
import type { BotId, RunResult } from './types';

/** An enemy armour type of the spec 4.1 table. */
type ArmorType = EnemyDef['armor'];

/** One decision every 15 ticks / 0.5 s (spec 16.2). */
export const DECISION_INTERVAL_TICKS = ticksFromSeconds(0.5);

/** The random variant places a card every 3 s (spec 16.2). */
const RANDOM_PLACEMENT_INTERVAL_TICKS = ticksFromSeconds(3);

/** Emergency rule: an enemy within 2 tiles of the base line (spec 16.2). */
const EMERGENCY_DISTANCE_TILES = 2;

/** Economy rule: producers are targeted while the level time is under 60 s (spec 16.2). */
const ECONOMY_WINDOW_SECONDS = 60;

/** Economy rule: default target number of producers (spec 16.2). */
const PRODUCER_TARGET = 5;

/** Wall rule: an enemy with more than 600 health (spec 16.2). */
const WALL_HEALTH_THRESHOLD = 600;

/** Wall rule: a group of 4 or more enemies (spec 16.2). */
const WALL_GROUP_SIZE = 4;

/** Wall rule: the wall goes into column 6 (spec 16.2). */
const WALL_COLUMN = 6;

/** Merge rule: only merge when 1.5x the card cost is affordable (spec 16.2). */
const MERGE_COST_RATIO = 1.5;

/** Coverage rule: the frontmost free column of columns 1 to 4 (spec 16.2). */
const COVERAGE_COLUMNS = [4, 3, 2, 1] as const;

/** Economy rule: try column 0 first, then column 1 (spec 16.2). */
const ECONOMY_COLUMNS = [0, 1] as const;

/** Emergency rule: the cheapest attacker goes into column 0 (spec 16.2). */
const EMERGENCY_COLUMN = 0;

/** The column the coverage rule measures the incoming time against (spec 16.2). */
const COVERAGE_REFERENCE_COLUMN = 3;

/** Safety cap of one run: 6 minutes is above the 16.3 target range of 3:00-5:00. */
const MAX_RUN_SECONDS = 360;

/** Whale card level: the maximum of spec 8.3. */
const WHALE_CARD_LEVEL = 10;

/** The recommended card level per world (spec 8.3); worlds above 5 are not specified yet. */
const CARD_LEVEL_BY_WORLD: Readonly<Record<number, number>> = { 1: 1, 2: 3, 3: 5, 4: 6, 5: 7 };

/** Rarity order of the whale loadout: the best rarities first (spec 16.2). */
const WHALE_RARITY_ORDER: readonly DefenderDef['rarity'][] = [
  'mythic',
  'legendary',
  'epic',
  'rare',
  'common',
];

/**
 * Tie-break of the Recommended fill slots (spec 3.12 says only "highest-level
 * cards"): when all owned cards have the same level, prefer a wall, then the
 * strongest attacker, so the loadout still covers the wall rule of spec 16.2.
 */
const FILL_ROLE_PRIORITY: Readonly<Record<DefenderDef['role'], number>> = {
  wall: 0,
  shooter: 1,
  control: 2,
  trap: 3,
  support: 4,
  producer: 5,
};

/** Seed offsets that keep the random loadout and the random in-level actions independent. */
const RANDOM_LOADOUT_SEED_OFFSET = 0;
const RANDOM_ACTION_SEED_OFFSET = 1_000_003;

/** Reads a definition's enemy armor (spec 4.1); the pot loses its Armored type when it breaks (6.2). */
export function enemyArmorOf(enemyDef: EnemyDef, enemy: EnemyState): ArmorType {
  if (enemyDef.special === 'pot_armor' && enemy.armorBroken) {
    return enemyDef.armorAfterBreak ?? enemyDef.armor;
  }
  return enemyDef.armor;
}

/** True when a defender definition attacks (a producer, wall or trap does not, spec 5.2). */
function isAttacker(defenderDef: DefenderDef): boolean {
  return defenderDef.damage > 0;
}

/** Damage per second a defender deals from the cards numbers (spec 4.2): B × L × S / interval. */
export function damagePerSecond(defender: DefenderState): number {
  const defenderDef = defenderById[defender.defenderId];
  const interval = defenderDef?.attackIntervalS;
  if (defenderDef === undefined || interval === undefined || defenderDef.damage <= 0) {
    return 0;
  }
  const cardLevel = 1 + rules.combat.cardLevelMultiplierPerLevel * (defender.cardLevel - 1);
  const star = damageStarMultiplier(defender.stars);
  return (defenderDef.damage * cardLevel * star) / interval;
}

/** Damage star multiplier S of spec 3.6/4.2. */
function damageStarMultiplier(stars: 1 | 2 | 3): number {
  if (stars === 3) {
    return rules.merge.star3DamageMultiplier;
  }
  return stars === 2 ? rules.merge.star2DamageMultiplier : 1;
}

/** The recommended card level of a world (spec 8.3). */
function recommendedCardLevel(world: number): number {
  return CARD_LEVEL_BY_WORLD[world] ?? 1;
}

/** Active lanes in ascending order, the deterministic tie-break for every bot rule. */
function activeLanes(level: LevelDef): number[] {
  return [...level.activeLanes].sort((first, second) => first - second);
}

/** The defender standing on a tile, if any (spec 3.4). */
function defenderAt(
  state: Readonly<SimState>,
  lane: number,
  col: number,
): DefenderState | undefined {
  return state.defenders.find((defender) => defender.lane === lane && defender.col === col);
}

/** The loadout cards of the run, resolved against `src/data`. */
function loadoutDefenders(state: Readonly<SimState>): DefenderDef[] {
  const result: DefenderDef[] = [];
  for (const entry of state.loadout) {
    const defenderDef = defenderById[entry.defenderId];
    if (defenderDef !== undefined) {
      result.push(defenderDef);
    }
  }
  return result;
}

/** The loadout index of a card, or -1 when it is not in the loadout. */
function cardIndex(state: Readonly<SimState>, defenderId: string): number {
  return state.loadout.findIndex((entry) => entry.defenderId === defenderId);
}

/** True when the tile is free, placeable and the card is ready and affordable (spec 3.4, 3.5). */
function canPlaceOnFreeTile(
  state: Readonly<SimState>,
  level: LevelDef,
  defenderDef: DefenderDef,
  lane: number,
  col: number,
): boolean {
  const index = cardIndex(state, defenderDef.id);
  if (index === -1 || !isCardReady(state, index) || state.essence < defenderDef.cost) {
    return false;
  }
  return isPlaceableTile(level, lane, col) && defenderAt(state, lane, col) === undefined;
}

/** The armour multiplier of a damage type from the spec 4.1 table. */
function armorMultiplier(defenderDef: DefenderDef, armor: ArmorType): number {
  if (defenderDef.damageType === undefined) {
    return 0;
  }
  return rules.combat.damageMultipliers[defenderDef.damageType][armor];
}

/** Enemy armours that appear in a level, in level order (spec 3.12 step 3). */
export function enemyArmorsInLevel(level: LevelDef): ArmorType[] {
  const armors: ArmorType[] = [];
  for (const wave of level.waves) {
    for (const spawn of wave.spawns) {
      const enemyDef = enemyById[spawn.enemy];
      if (enemyDef !== undefined && !armors.includes(enemyDef.armor)) {
        armors.push(enemyDef.armor);
      }
    }
  }
  return armors;
}

/** Compares two defender definitions by damage per second, then by cost, then by id. */
function compareAttackers(first: DefenderDef, second: DefenderDef): number {
  const firstDps = first.damage / (first.attackIntervalS ?? 1);
  const secondDps = second.damage / (second.attackIntervalS ?? 1);
  if (firstDps !== secondDps) {
    return secondDps - firstDps;
  }
  if (first.cost !== second.cost) {
    return first.cost - second.cost;
  }
  return first.id.localeCompare(second.id);
}

/** The best counter for one enemy armour: highest multiplier, then highest dps, then cheapest (3.12/4.1). */
function bestCounter(armor: ArmorType): DefenderDef | undefined {
  const candidates = defenders.filter(
    (defenderDef) => isAttacker(defenderDef) && armorMultiplier(defenderDef, armor) > 1,
  );
  return candidates.sort((first, second) => {
    const difference = armorMultiplier(second, armor) - armorMultiplier(first, armor);
    return difference !== 0 ? difference : compareAttackers(first, second);
  })[0];
}

/** The spec 3.12 Recommended button loadout: counters per armour, a producer, then fill. */
export function recommendedDefenderIds(level: LevelDef, slots: number): string[] {
  const selected: string[] = [];
  for (const armor of enemyArmorsInLevel(level)) {
    const counter = bestCounter(armor);
    if (counter !== undefined && !selected.includes(counter.id)) {
      selected.push(counter.id);
    }
  }
  const producer = defenders.find((defenderDef) => defenderDef.role === 'producer');
  if (producer !== undefined && !selected.includes(producer.id) && selected.length < slots) {
    selected.push(producer.id);
  }
  const remaining = defenders
    .filter((defenderDef) => !selected.includes(defenderDef.id))
    .sort((first, second) => {
      const roleDifference = FILL_ROLE_PRIORITY[first.role] - FILL_ROLE_PRIORITY[second.role];
      return roleDifference !== 0 ? roleDifference : compareAttackers(first, second);
    });
  for (const defenderDef of remaining) {
    if (selected.length >= slots) {
      break;
    }
    selected.push(defenderDef.id);
  }
  return selected.slice(0, slots);
}

/** The whale loadout: the best rarities at level 10, filled up in rarity order (spec 16.2). */
function whaleDefenderIds(slots: number): string[] {
  const result: string[] = [];
  for (const rarity of WHALE_RARITY_ORDER) {
    for (const defenderDef of defenders) {
      if (defenderDef.rarity === rarity && result.length < slots) {
        result.push(defenderDef.id);
      }
    }
  }
  return result;
}

/** The commons loadout: only Common and Rare cards (spec 16.2). */
function commonsDefenderIds(): string[] {
  return defenders
    .filter((defenderDef) => defenderDef.rarity === 'common' || defenderDef.rarity === 'rare')
    .map((defenderDef) => defenderDef.id);
}

/** Six random owned cards, seeded by the run seed (spec 16.2). */
function randomDefenderIds(runSeed: number): string[] {
  const shuffled = [...defenders];
  const rng = createRng(RANDOM_LOADOUT_SEED_OFFSET + runSeed);
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng.next() * (index + 1));
    const current = shuffled[index];
    const swap = shuffled[swapIndex];
    if (current !== undefined && swap !== undefined) {
      shuffled[index] = swap;
      shuffled[swapIndex] = current;
    }
  }
  return shuffled.map((defenderDef) => defenderDef.id);
}

/** The defender ids of one bot loadout; fixed-tutorial levels always use their fixed loadout (spec 7.2). */
export function loadoutDefenderIds(level: LevelDef, botId: BotId, runSeed: number): string[] {
  const slots = level.loadoutSlots;
  if (botId === 'random') {
    return randomDefenderIds(runSeed).slice(0, slots);
  }
  if (botId === 'whale') {
    return whaleDefenderIds(slots);
  }
  if (botId === 'commons') {
    return commonsDefenderIds().slice(0, slots);
  }
  return recommendedDefenderIds(level, slots);
}

/** The loadout entries of one bot run: ids plus the card level of spec 8.3/16.2. */
export function createLoadout(level: LevelDef, botId: BotId, runSeed: number): LoadoutEntry[] {
  const cardLevel = botId === 'whale' ? WHALE_CARD_LEVEL : recommendedCardLevel(level.world);
  const ids =
    level.fixedLoadout !== null
      ? level.fixedLoadout.slice(0, level.loadoutSlots)
      : loadoutDefenderIds(level, botId, runSeed);
  return ids.map((defenderId) => ({ defenderId, level: cardLevel }));
}

/** Everything one decision of the bot needs (spec 16.2). */
export interface BotContext {
  level: LevelDef;
  state: Readonly<SimState>;
  botId: BotId;
  /** Generator of the random variant; null for the priority-list bots. */
  rng: Rng | null;
}

/** Collects every orb on the field, rule 1 of the priority list (spec 16.2). */
function collectOrbCommands(state: Readonly<SimState>): Command[] {
  return state.orbs.map((orb) => ({ type: 'collectOrb', orbId: orb.id }) as Command);
}

/** Counts the living producers of one lane (spec 16.2 economy rule). */
function producersInLane(state: Readonly<SimState>, lane: number): number {
  return state.defenders.filter((defender) => {
    if (defender.lane !== lane) {
      return false;
    }
    return defenderById[defender.defenderId]?.pattern === 'producer';
  }).length;
}

/** Total living producers of the run (spec 16.2 economy rule). */
function totalProducers(state: Readonly<SimState>): number {
  return state.defenders.filter(
    (defender) => defenderById[defender.defenderId]?.role === 'producer',
  ).length;
}

/** Rule 2: the cheapest affordable attacker in column 0 of an undefended endangered lane. */
function emergencyPlacement(context: BotContext): Command | null | undefined {
  const baseLine = rules.grid.baseLineX;
  const lane = activeLanes(context.level).find((laneIndex) => {
    const enemiesInLane = context.state.enemies.filter(
      (enemy) => enemy.lane === laneIndex && enemy.x <= baseLine + EMERGENCY_DISTANCE_TILES,
    );
    if (enemiesInLane.length === 0) {
      return false;
    }
    const hasAttacker = context.state.defenders.some((defender) => {
      const defenderDef = defenderById[defender.defenderId];
      return defender.lane === laneIndex && defenderDef !== undefined && isAttacker(defenderDef);
    });
    return !hasAttacker;
  });
  if (lane === undefined) {
    return undefined;
  }
  const attacker = loadoutDefenders(context.state)
    .filter(isAttacker)
    .sort((first, second) => first.cost - second.cost || first.id.localeCompare(second.id))
    .find((defenderDef) =>
      canPlaceOnFreeTile(context.state, context.level, defenderDef, lane, EMERGENCY_COLUMN),
    );
  return attacker === undefined
    ? null
    : {
        type: 'place',
        defenderId: attacker.id,
        lane,
        col: EMERGENCY_COLUMN,
      };
}

/** Rule 3: build producers in the lane with the fewest producers, columns 0 then 1. */
function economyPlacement(context: BotContext): Command | undefined {
  if (context.state.tick / rules.tick.tickRate >= ECONOMY_WINDOW_SECONDS) {
    return undefined;
  }
  if (totalProducers(context.state) >= PRODUCER_TARGET) {
    return undefined;
  }
  const producers = loadoutDefenders(context.state)
    .filter((defenderDef) => defenderDef.role === 'producer')
    .sort((first, second) => first.cost - second.cost);
  const lanes = activeLanes(context.level);
  const lane = lanes.reduce<number | undefined>((best, laneIndex) => {
    if (best === undefined) {
      return laneIndex;
    }
    const laneProducers = producersInLane(context.state, laneIndex);
    return laneProducers < producersInLane(context.state, best) ? laneIndex : best;
  }, undefined);
  if (lane === undefined) {
    return undefined;
  }
  for (const producer of producers) {
    for (const col of ECONOMY_COLUMNS) {
      if (canPlaceOnFreeTile(context.state, context.level, producer, lane, col)) {
        return { type: 'place', defenderId: producer.id, lane, col };
      }
    }
  }
  return undefined;
}

/** One incoming enemy group of the coverage rule (spec 16.2 rule 4). */
interface IncomingEnemy {
  readonly health: number;
  readonly timeToColumn: number;
  readonly armor: ArmorType;
  readonly flying: boolean;
}

/** The danger of one lane: total health, the fastest arrival time and the dominant armour. */
interface LaneThreat {
  readonly requiredDps: number;
  readonly armor: ArmorType;
  readonly flying: boolean;
}

/** Builds one incoming group from a health value, a speed and a start x (spec 16.2 rule 4). */
function incomingEnemyOf(
  health: number,
  speed: number,
  startX: number,
  flying: boolean,
  armor: ArmorType,
): IncomingEnemy {
  const referenceX = COVERAGE_REFERENCE_COLUMN + rules.grid.tileSize / 2;
  return {
    health,
    timeToColumn: Math.max(0.5, (startX - referenceX) / speed),
    armor,
    flying,
  };
}

/** The current enemies of a lane as incoming groups (spec 16.2 rule 4). */
function currentEnemiesInLane(context: BotContext, lane: number): IncomingEnemy[] {
  const result: IncomingEnemy[] = [];
  for (const enemy of context.state.enemies) {
    const enemyDef = enemyById[enemy.enemyId];
    if (enemy.lane !== lane || enemyDef === undefined) {
      continue;
    }
    const shieldHealth = enemy.shieldHp > 0 ? enemy.shieldHp : 0;
    const armor =
      shieldHealth > 0 ? (enemyDef.shieldArmor ?? enemyDef.armor) : enemyArmorOf(enemyDef, enemy);
    result.push(
      incomingEnemyOf(enemy.hp + shieldHealth, enemyDef.speed, enemy.x, enemyDef.isFlying, armor),
    );
  }
  return result;
}

/** The next wave of the level as incoming groups; "random" lanes are expected per active lane (16.2). */
function nextWaveEnemiesInLane(context: BotContext, lane: number): IncomingEnemy[] {
  const waveIndex = Math.max(0, context.state.wave.index + 1);
  const wave = context.level.waves[waveIndex];
  if (wave === undefined || context.state.wave.allWavesSpawned) {
    return [];
  }
  const result: IncomingEnemy[] = [];
  const laneCount = Math.max(1, activeLanes(context.level).length);
  for (const spawn of wave.spawns) {
    const enemyDef = enemyById[spawn.enemy];
    if (enemyDef === undefined) {
      continue;
    }
    const listed =
      spawn.lanes === 'random'
        ? activeLanes(context.level).includes(lane)
        : spawn.lanes.includes(lane);
    if (!listed) {
      continue;
    }
    const expectedCount = spawn.lanes === 'random' ? spawn.count / laneCount : spawn.count;
    const health = enemyDef.hp * expectedCount + (enemyDef.shieldHp ?? 0) * expectedCount;
    const armor =
      enemyDef.shieldHp !== undefined ? (enemyDef.shieldArmor ?? enemyDef.armor) : enemyDef.armor;
    result.push(
      incomingEnemyOf(health, enemyDef.speed, rules.grid.enemySpawnX, enemyDef.isFlying, armor),
    );
  }
  return result;
}

/** The 16.2 coverage threat of one lane: required damage per second, armour and flying flag. */
function laneThreat(context: BotContext, lane: number): LaneThreat | undefined {
  const incoming = [
    ...currentEnemiesInLane(context, lane),
    ...nextWaveEnemiesInLane(context, lane),
  ];
  if (incoming.length === 0) {
    return undefined;
  }
  let health = 0;
  let shortestTime = Number.POSITIVE_INFINITY;
  const healthByArmor: Record<ArmorType, number> = { light: 0, armored: 0, spectral: 0 };
  for (const enemy of incoming) {
    health += enemy.health;
    shortestTime = Math.min(shortestTime, enemy.timeToColumn);
    healthByArmor[enemy.armor] += enemy.health;
  }
  const armors: ArmorType[] = ['light', 'armored', 'spectral'];
  const armor = armors.reduce<ArmorType>(
    (best, candidate) => (healthByArmor[candidate] > healthByArmor[best] ? candidate : best),
    'light',
  );
  return {
    requiredDps: health / shortestTime,
    armor,
    flying: incoming.some((enemy) => enemy.flying),
  };
}

/** The 16.2 coverage rule: reinforce a lane whose attacker dps is below the incoming threat. */
function coveragePlacement(context: BotContext): Command | undefined {
  for (const lane of activeLanes(context.level)) {
    const threat = laneThreat(context, lane);
    if (threat === undefined) {
      continue;
    }
    const currentDps = context.state.defenders
      .filter((defender) => defender.lane === lane)
      .reduce((sum, defender) => sum + damagePerSecond(defender), 0);
    if (currentDps >= threat.requiredDps) {
      continue;
    }
    const candidates = loadoutDefenders(context.state)
      .filter((defenderDef) => isAttacker(defenderDef))
      .filter((defenderDef) => !threat.flying || defenderDef.hitsFlying === true)
      .sort((first, second) => {
        const difference =
          armorMultiplier(second, threat.armor) - armorMultiplier(first, threat.armor);
        return difference !== 0 ? difference : compareAttackers(first, second);
      });
    for (const candidate of candidates) {
      for (const col of COVERAGE_COLUMNS) {
        if (canPlaceOnFreeTile(context.state, context.level, candidate, lane, col)) {
          return { type: 'place', defenderId: candidate.id, lane, col };
        }
      }
    }
  }
  return undefined;
}

/** The 16.2 wall rule: a wall in column 6 against a tank or a group of four enemies. */
function wallPlacement(context: BotContext): Command | undefined {
  const walls = loadoutDefenders(context.state)
    .filter((defenderDef) => defenderDef.role === 'wall')
    .sort((first, second) => first.cost - second.cost);
  if (walls.length === 0) {
    return undefined;
  }
  for (const lane of activeLanes(context.level)) {
    const laneEnemies = context.state.enemies.filter((enemy) => enemy.lane === lane);
    const hasWall = context.state.defenders.some((defender) => {
      if (defender.lane !== lane) {
        return false;
      }
      return defenderById[defender.defenderId]?.role === 'wall';
    });
    const needsWall =
      !hasWall &&
      (laneEnemies.length >= WALL_GROUP_SIZE ||
        laneEnemies.some((enemy) => enemy.hp > WALL_HEALTH_THRESHOLD));
    if (!needsWall) {
      continue;
    }
    for (const wall of walls) {
      if (canPlaceOnFreeTile(context.state, context.level, wall, lane, WALL_COLUMN)) {
        return { type: 'place', defenderId: wall.id, lane, col: WALL_COLUMN };
      }
    }
  }
  return undefined;
}

/** Highest star level a definition allows (default 3, spec 3.6). */
function maxStarsOf(defenderDef: DefenderDef): number {
  return defenderDef.maxStars ?? rules.merge.maxStars;
}

/** The lane with the most living enemy health, the target of the merge rule (spec 16.2). */
function laneWithMostEnemyHealth(context: BotContext): number | undefined {
  const healthByLane = new Map<number, number>();
  for (const enemy of context.state.enemies) {
    healthByLane.set(enemy.lane, (healthByLane.get(enemy.lane) ?? 0) + enemy.hp);
  }
  let targetLane: number | undefined;
  let targetHealth = 0;
  for (const lane of activeLanes(context.level)) {
    const laneHealth = healthByLane.get(lane) ?? 0;
    if (laneHealth > targetHealth) {
      targetHealth = laneHealth;
      targetLane = lane;
    }
  }
  return targetLane;
}

/** The earliest-placed attacker of a lane that can still be merged (spec 3.6, 16.2). */
function mergeableAttacker(state: Readonly<SimState>, lane: number): DefenderState | undefined {
  return state.defenders
    .filter((defender) => {
      const defenderDef = defenderById[defender.defenderId];
      return (
        defender.lane === lane &&
        defenderDef !== undefined &&
        isAttacker(defenderDef) &&
        defender.stars < maxStarsOf(defenderDef)
      );
    })
    .sort((first, second) => first.id - second.id)[0];
}

/** The 16.2 merge rule: merge an attacker in the lane with the most enemy health. */
function mergePlacement(context: BotContext): Command | undefined {
  const targetLane = laneWithMostEnemyHealth(context);
  if (targetLane === undefined) {
    return undefined;
  }
  const mergeable = mergeableAttacker(context.state, targetLane);
  const defenderDef = mergeable === undefined ? undefined : defenderById[mergeable.defenderId];
  const index = mergeable === undefined ? -1 : cardIndex(context.state, mergeable.defenderId);
  if (
    mergeable === undefined ||
    defenderDef === undefined ||
    index === -1 ||
    !isCardReady(context.state, index) ||
    context.state.essence < defenderDef.cost * MERGE_COST_RATIO
  ) {
    return undefined;
  }
  return { type: 'place', defenderId: mergeable.defenderId, lane: targetLane, col: mergeable.col };
}

/** Rule decision of the priority list: the first rule that produces a valid command wins (16.2). */
const PRIORITY_RULES = [
  emergencyPlacement,
  economyPlacement,
  coveragePlacement,
  wallPlacement,
  mergePlacement,
] as const;

/** The random variant: collect orbs, then place a random affordable card every 3 s (spec 16.2). */
function randomDecisions(context: BotContext): Command[] {
  const commands = collectOrbCommands(context.state);
  const rng = context.rng;
  if (rng === null || context.state.tick % RANDOM_PLACEMENT_INTERVAL_TICKS !== 0) {
    return commands;
  }
  const candidates: Command[] = [];
  for (const defenderDef of loadoutDefenders(context.state)) {
    for (const lane of activeLanes(context.level)) {
      for (let col = 0; col < rules.grid.columnCount; col += 1) {
        if (canPlaceOnFreeTile(context.state, context.level, defenderDef, lane, col)) {
          candidates.push({ type: 'place', defenderId: defenderDef.id, lane, col });
        }
      }
    }
  }
  if (candidates.length > 0) {
    const index = Math.min(candidates.length - 1, Math.floor(rng.next() * candidates.length));
    const picked = candidates[index];
    if (picked !== undefined) {
      commands.push(picked);
    }
  }
  return commands;
}

/**
 * One decision point of the bot: returns the commands to enqueue, oldest rule
 * first (spec 16.2). Idle never acts; the four playing variants share the
 * priority list except for the random variant's random placements.
 */
export function decideCommands(context: BotContext): Command[] {
  if (context.botId === 'idle') {
    return [];
  }
  if (context.botId === 'random') {
    return randomDecisions(context);
  }
  const orbCommands = collectOrbCommands(context.state);
  if (orbCommands.length > 0) {
    return orbCommands;
  }
  for (const rule of PRIORITY_RULES) {
    const command = rule(context);
    if (command === null) {
      return [];
    }
    if (command !== undefined) {
      return [command];
    }
  }
  return [];
}

/** The running totals that the 16.3 metrics need (spent Essence and collected orbs). */
interface RunTotals {
  essenceSpent: number;
  orbEssence: number;
}

/** Applies the events of one tick to the totals and the placed-defender bookkeeping. */
function applyTickEvents(
  events: readonly SimEvent[],
  state: Readonly<SimState>,
  placed: Set<string>,
  orbValues: Map<number, number>,
  totals: RunTotals,
): void {
  for (const event of events) {
    if (event.type === 'defenderPlaced') {
      placed.add(event.defenderId);
      totals.essenceSpent += defenderById[event.defenderId]?.cost ?? 0;
    } else if (event.type === 'defenderMerged') {
      const defender = state.defenders.find((candidate) => candidate.id === event.id);
      totals.essenceSpent += defenderById[defender?.defenderId ?? '']?.cost ?? 0;
    } else if (event.type === 'orbCollected') {
      totals.orbEssence += orbValues.get(event.id) ?? 0;
      orbValues.delete(event.id);
    }
  }
}

/** Runs one level with one bot variant (spec 16.2) and returns everything the report needs. */
export function runBotRun(level: LevelDef, botId: BotId, runSeed: number): RunResult {
  const loadout = createLoadout(level, botId, runSeed);
  const sim = createSim(level, loadout, level.seed);
  const rng = botId === 'random' ? createRng(RANDOM_ACTION_SEED_OFFSET + runSeed) : null;
  const maxTicks = ticksFromSeconds(MAX_RUN_SECONDS);
  const placed = new Set<string>();
  const orbValues = new Map<number, number>();
  const totals: RunTotals = { essenceSpent: 0, orbEssence: 0 };

  while (sim.state.status === 'playing' && sim.state.tick < maxTicks) {
    if (sim.state.tick % DECISION_INTERVAL_TICKS === 0) {
      for (const command of decideCommands({ level, state: sim.state, botId, rng })) {
        if (command.type === 'collectOrb') {
          const orb = sim.state.orbs.find((candidate) => candidate.id === command.orbId);
          if (orb !== undefined) {
            orbValues.set(orb.id, orb.value);
          }
        }
        sim.enqueue(command);
      }
    }
    applyTickEvents(sim.step(), sim.state, placed, orbValues, totals);
  }

  const timedOut = sim.state.status === 'playing';
  return {
    levelId: level.id,
    botId,
    runSeed,
    status: sim.state.status === 'won' ? 'won' : 'lost',
    stars: sim.state.stars,
    durationTicks: sim.state.tick,
    essenceSpent: totals.essenceSpent,
    essenceAvailable: level.startEssence + totals.orbEssence,
    trapUsed: sim.state.traps.some((trap) => trap.used),
    placedDefenderIds: [...placed],
    timedOut,
  };
}

/** Runs a contiguous range of run seeds for one level/bot pair (worker job of the runner). */
export function runBotRuns(
  level: LevelDef,
  botId: BotId,
  firstRunSeed: number,
  runCount: number,
): RunResult[] {
  const results: RunResult[] = [];
  for (let offset = 0; offset < runCount; offset += 1) {
    results.push(runBotRun(level, botId, firstRunSeed + offset));
  }
  return results;
}
