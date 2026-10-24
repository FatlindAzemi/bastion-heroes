/**
 * Registry of every spec 9.7 VFX definition (issue #75). Each id lives in its own
 * module (`<id>.ts`); this file only collects them so the particle system and the
 * effect layer can look one up by id without a switch statement.
 */

import { vfx as combo_chain } from './combo_chain';
import { vfx as combo_shatter } from './combo_shatter';
import { vfx as combo_steam } from './combo_steam';
import { vfx as combo_toxic } from './combo_toxic';
import { vfx as death_poof_defender } from './death_poof_defender';
import { vfx as death_poof_enemy } from './death_poof_enemy';
import { vfx as essence_orb } from './essence_orb';
import { vfx as hit_arcane } from './hit_arcane';
import { vfx as hit_blast } from './hit_blast';
import { vfx as hit_pierce } from './hit_pierce';
import { vfx as merge_star } from './merge_star';
import { vfx as spawn_dust } from './spawn_dust';
import { vfx as status_burn } from './status_burn';
import { vfx as status_freeze } from './status_freeze';
import { vfx as status_poison } from './status_poison';
import { vfx as status_slow } from './status_slow';
import { vfx as trap_roll } from './trap_roll';
import type { VfxDefinition, VfxId } from './types';
import { vfx as win_confetti } from './win_confetti';

/** Every VFX id of the spec 9.7 table, in table order. */
export const VFX_IDS: readonly VfxId[] = [
  'spawn_dust',
  'hit_pierce',
  'hit_blast',
  'hit_arcane',
  'status_slow',
  'status_freeze',
  'status_burn',
  'status_poison',
  'combo_steam',
  'combo_shatter',
  'combo_toxic',
  'combo_chain',
  'essence_orb',
  'death_poof_enemy',
  'death_poof_defender',
  'trap_roll',
  'merge_star',
  'win_confetti',
];

/** Lookup table of the definitions, keyed by VFX id. */
export const VFX_DEFINITIONS: Readonly<Record<VfxId, VfxDefinition>> = {
  spawn_dust: spawn_dust,
  hit_pierce: hit_pierce,
  hit_blast: hit_blast,
  hit_arcane: hit_arcane,
  status_slow: status_slow,
  status_freeze: status_freeze,
  status_burn: status_burn,
  status_poison: status_poison,
  combo_steam: combo_steam,
  combo_shatter: combo_shatter,
  combo_toxic: combo_toxic,
  combo_chain: combo_chain,
  essence_orb: essence_orb,
  death_poof_enemy: death_poof_enemy,
  death_poof_defender: death_poof_defender,
  trap_roll: trap_roll,
  merge_star: merge_star,
  win_confetti: win_confetti,
};

/** True when a string is one of the eighteen spec 9.7 VFX ids. */
export function isVfxId(value: string): value is VfxId {
  return (VFX_IDS as readonly string[]).includes(value);
}
