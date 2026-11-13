import { describe, expect, it } from 'vitest';

import { defenders, duelRules, enemies } from '../../src/data';
import { DuelRulesDef } from '../../src/data/schemas';

/** Duel data tests (spec 18.1 to 18.8, 20.2): rules numbers, card costs and the starter deck. */
const duelCardCosts: Readonly<Record<string, number>> = {
  glowshroom_monk: 3,
  sparkbolt_gremlin: 2,
  iron_granny: 3,
  boomcap_brewer: 4,
  snowpup_yeti: 3,
  rune_archer: 3,
  pyro_fox: 4,
  frost_witch: 5,
  gloomling: 2,
  pothead: 2,
  shieldbearer: 3,
  shade_wisp: 2,
  bat_swarm: 2,
  gloom_priest: 3,
  gloom_ogre: 6,
};

const allCards = [...defenders, ...enemies];

describe('duel rules data (spec 18)', () => {
  it('parses with DuelRulesDef', () => {
    expect(() => DuelRulesDef.parse(duelRules)).not.toThrow();
  });

  it('18.1: sides, midline, base lines and spawns', () => {
    expect(duelRules.board).toEqual({
      southColumns: [0, 1, 2, 3],
      northColumns: [5, 6, 7, 8],
      midlineColumn: 4,
      southBaseLineX: 0,
      northBaseLineX: 9,
      southRaiderSpawnX: 0.4,
      northRaiderSpawnX: 8.6,
    });
  });

  it('18.2/18.3: match phases and Essence', () => {
    expect(duelRules.match).toEqual({
      countdownS: 3,
      regularTimeS: 120,
      overdriveTimeS: 60,
      suddenDeathMaxS: 60,
    });
    expect(duelRules.essence).toEqual({
      startingEssence: 5,
      maxEssence: 10,
      regularIncomeIntervalS: 2.4,
      overdriveIncomeIntervalS: 1.2,
    });
  });

  it('18.4/18.6/18.7: deck, raider and gate numbers', () => {
    expect(duelRules.deck).toMatchObject({
      deckSize: 8,
      handSize: 4,
      minDefenders: 2,
      minRaiders: 2,
    });
    expect(duelRules.deck.excludedCardIds).toEqual(['harbor_turtle', 'morvak']);
    expect(duelRules.raiders).toMatchObject({
      speedMultiplier: 1.5,
      summonDelayS: 1,
      raiderBlockDistance: 0.55,
      maxLivingRaiders: 12,
      burrowerSurfaceDistanceTiles: 3,
      ogreThrowDistanceTiles: 3,
    });
    expect(duelRules.standard.cardLevel).toBe(6);
    expect(duelRules.gate).toEqual({ gateHealth: 8, trapSpeedTilesPerS: 8 });
  });

  it('18.8: costs and kinds match the table for every built card', () => {
    for (const [id, cost] of Object.entries(duelCardCosts)) {
      const card = allCards.find((candidate) => candidate.id === id);
      expect(card?.duel, id).toBeDefined();
      expect(card?.duel?.cost, id).toBe(cost);
      expect(card?.duel?.kind, id).toBe(defenders.some((d) => d.id === id) ? 'defender' : 'raider');
    }
  });

  it('18.8: every registry defender has a duel block', () => {
    for (const defender of defenders) expect(defender.duel?.kind, defender.id).toBe('defender');
  });

  it('18.8: card-specific changes', () => {
    const byId = (id: string) => allCards.find((card) => card.id === id)?.duel;
    expect(byId('iron_granny')?.hp).toBe(2400);
    expect(byId('glowshroom_monk')?.producer).toEqual({
      essence: 1,
      firstDelayS: 5,
      intervalSByStar: [10, 7, 5],
    });
    expect(byId('gloomling')).toMatchObject({ summonCount: 2, summonGapS: 0.6, gateDamage: 1 });
    expect(byId('gloom_ogre')?.gateDamage).toBe(3);
  });

  it('18.8: every raider has gate damage; Morvak-style cards without a duel block are not Duel cards', () => {
    for (const enemy of enemies) {
      if (enemy.duel) expect(enemy.duel.gateDamage, enemy.id).toBeGreaterThan(0);
      else expect(enemy.isBoss, enemy.id).toBe(true);
    }
  });

  it('20.2/18.4: the Arena 1 cards are a legal starter deck', () => {
    const deck = duelRules.arenas[0]?.unlocksCardIds ?? [];
    expect(deck).toHaveLength(duelRules.deck.deckSize);
    expect(new Set(deck).size).toBe(deck.length);
    const kinds = deck.map((id) => allCards.find((card) => card.id === id)?.duel?.kind);
    expect(kinds.every((kind) => kind !== undefined)).toBe(true);
    expect(kinds.filter((kind) => kind === 'defender').length).toBeGreaterThanOrEqual(
      duelRules.deck.minDefenders,
    );
    expect(kinds.filter((kind) => kind === 'raider').length).toBeGreaterThanOrEqual(
      duelRules.deck.minRaiders,
    );
    for (const id of deck) expect(duelRules.deck.excludedCardIds).not.toContain(id);
  });

  it('20.2: arena trophy floors rise and unlock lists have no duplicates', () => {
    const floors = duelRules.arenas.map((arena) => arena.trophyFloor);
    expect(floors).toEqual([0, 300, 600, 1000, 1500]);
    const unlocked = duelRules.arenas.flatMap((arena) => arena.unlocksCardIds);
    expect(new Set(unlocked).size).toBe(unlocked.length);
  });
});
