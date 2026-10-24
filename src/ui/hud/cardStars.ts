/**
 * Card star pips of the in-level card bar (spec 3.6, 9.8; issue #76). The pips show
 * the highest star level among the defenders placed from that loadout card, which is
 * the merge level the player has reached with it. Pure and unit-tested.
 */

/** The star information the card bar needs from one placed defender (spec 3.6). */
export interface DefenderStarInfo {
  readonly defenderId: string;
  readonly stars: 1 | 2 | 3;
}

/**
 * Highest star level placed from `defenderId`; ★1 when no defender of that card is on
 * the field yet. The card bar shows pips at ★2 and ★3 only.
 */
export function highestCardStars(
  defenders: readonly DefenderStarInfo[],
  defenderId: string,
): 1 | 2 | 3 {
  let stars: 1 | 2 | 3 = 1;
  for (const defender of defenders) {
    if (defender.defenderId === defenderId && defender.stars > stars) {
      stars = defender.stars;
    }
  }
  return stars;
}
