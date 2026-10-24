/**
 * View types of the Scouting and Loadout screens (spec 11.8). They contain no
 * simulation imports: `src/main.ts` turns the chosen loadout into sim
 * `LoadoutEntry` objects, keeping the UI inside the import boundary of spec 10.4.
 */
import type { LevelDef } from '../../data/schemas';

/** An armor type of the 3x3 combat table (spec 4.1). */
export type ArmorType = 'light' | 'armored' | 'spectral';

/** A damage type of the 3x3 combat table (spec 4.1). */
export type DamageType = 'pierce' | 'blast' | 'arcane';

/**
 * One owned card as the Scouting/Loadout screens show it. M2 has no save data
 * yet (M4), so the collection is the full M2 roster at card level 1 (spec 3.12).
 */
export interface CollectionCardView {
  readonly defenderId: string;
  readonly name: string;
  readonly rarity: string;
  readonly faction: string;
  readonly role: string;
  readonly cost: number;
  /** null for cards that deal no damage (producer, wall, aura, trap; spec 4.3). */
  readonly damageType: DamageType | null;
  /** Card level of spec 4.2; always 1 until the M4 upgrades exist. */
  readonly cardLevel: number;
}

/** One card chosen for a loadout slot; `cardLevel` travels into the sim loadout (spec 11.3). */
export interface LoadoutChoice {
  readonly defenderId: string;
  readonly cardLevel: number;
}

/** Options `src/main.ts` passes to the mounted Scouting -> Loadout flow. */
export interface ScoutFlowOptions {
  readonly level: LevelDef;
  /** Called by "Fight!": starts the real level with the chosen loadout (spec 3.12). */
  readonly onFight: (loadout: readonly LoadoutChoice[]) => void;
}

/** The mounted Preact screen flow; `dispose` removes it before the HUD mounts. */
export interface ScoutFlowHandle {
  dispose(): void;
}
