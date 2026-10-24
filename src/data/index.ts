/**
 * Data layer registry (spec 11.2): every definition of `src/data/` is exported
 * here by its id. All game numbers live in the data files, never in game logic
 * (spec 1.1 rule 7).
 */
import type { DefenderDef, EnemyDef, LevelDef } from './schemas';
import { glowshroomMonk } from './defenders/glowshroom_monk';
import { ironGranny } from './defenders/iron_granny';
import { sparkboltGremlin } from './defenders/sparkbolt_gremlin';
import { gloomling } from './enemies/gloomling';
import { w1_l01 } from './levels/w1_l01';
import { rules } from './rules';

/** Builds an id -> definition record; duplicate ids fail the tests in `tests/data/`. */
function byId<T extends { id: string }>(defs: readonly T[]): Readonly<Record<string, T>> {
  return Object.fromEntries(defs.map((def) => [def.id, def] as const));
}

/** Every defender definition, ordered by id (the M1 set of spec 14 row 1.2). */
export const defenders: readonly DefenderDef[] = [glowshroomMonk, ironGranny, sparkboltGremlin];

/** Every enemy definition, ordered by id (the M1 set of spec 14 row 1.2). */
export const enemies: readonly EnemyDef[] = [gloomling];

/** Every level definition, ordered by id (W1-L01 is the M1 level; spec 7.2). */
export const levels: readonly LevelDef[] = [w1_l01];

/** Defender definitions by id (spec 11.2). */
export const defenderById = byId(defenders);

/** Enemy definitions by id (spec 11.2). */
export const enemyById = byId(enemies);

/** Level definitions by id (spec 11.2). */
export const levelById = byId(levels);

/** Global gameplay rules and defaults (spec 3, 4): the one source of balance numbers. */
export { rules };

export type { DefenderDef, EnemyDef, LevelDef, RulesDef } from './schemas';
