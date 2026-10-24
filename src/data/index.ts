/**
 * Data layer registry (spec 11.2): every definition of `src/data/` is exported
 * here by its id. All game numbers live in the data files, never in game logic
 * (spec 1.1 rule 7).
 */
import type { DefenderDef, EnemyDef, LevelDef } from './schemas';
import { boomcapBrewer } from './defenders/boomcap_brewer';
import { frostWitch } from './defenders/frost_witch';
import { glowshroomMonk } from './defenders/glowshroom_monk';
import { ironGranny } from './defenders/iron_granny';
import { pyroFox } from './defenders/pyro_fox';
import { runeArcher } from './defenders/rune_archer';
import { snowpupYeti } from './defenders/snowpup_yeti';
import { sparkboltGremlin } from './defenders/sparkbolt_gremlin';
import { batSwarm } from './enemies/bat_swarm';
import { gloomOgre } from './enemies/gloom_ogre';
import { gloomPriest } from './enemies/gloom_priest';
import { gloomling } from './enemies/gloomling';
import { pothead } from './enemies/pothead';
import { shadeWisp } from './enemies/shade_wisp';
import { shieldbearer } from './enemies/shieldbearer';
import { w1_l01 } from './levels/w1_l01';
import { w1_l02 } from './levels/w1_l02';
import { w1_l03 } from './levels/w1_l03';
import { w1_l04 } from './levels/w1_l04';
import { w1_l05 } from './levels/w1_l05';
import { w1_l06 } from './levels/w1_l06';
import { w1_l07 } from './levels/w1_l07';
import { w1_l08 } from './levels/w1_l08';
import { w1_l09 } from './levels/w1_l09';
import { w1_l10 } from './levels/w1_l10';
import { rules } from './rules';

/** Builds an id -> definition record; duplicate ids fail the tests in `tests/data/`. */
function byId<T extends { id: string }>(defs: readonly T[]): Readonly<Record<string, T>> {
  return Object.fromEntries(defs.map((def) => [def.id, def] as const));
}

/** Every defender definition, ordered by id (the M2 roster of spec 5.1). */
export const defenders: readonly DefenderDef[] = [
  boomcapBrewer,
  frostWitch,
  glowshroomMonk,
  ironGranny,
  pyroFox,
  runeArcher,
  snowpupYeti,
  sparkboltGremlin,
];

/** Every enemy definition, ordered by id (the M1+M2 set of spec 14 rows 1.2 and 2.6). */
export const enemies: readonly EnemyDef[] = [
  batSwarm,
  gloomOgre,
  gloomPriest,
  gloomling,
  pothead,
  shadeWisp,
  shieldbearer,
];

/** Every level definition, ordered by id (all ten World 1 levels; spec 7.2). */
export const levels: readonly LevelDef[] = [
  w1_l01,
  w1_l02,
  w1_l03,
  w1_l04,
  w1_l05,
  w1_l06,
  w1_l07,
  w1_l08,
  w1_l09,
  w1_l10,
];

/** Defender definitions by id (spec 11.2). */
export const defenderById = byId(defenders);

/** Enemy definitions by id (spec 11.2). */
export const enemyById = byId(enemies);

/** Level definitions by id (spec 11.2). */
export const levelById = byId(levels);

/** Global gameplay rules and defaults (spec 3, 4): the one source of balance numbers. */
export { rules };

export type { DefenderDef, EnemyDef, LevelDef, RulesDef } from './schemas';
