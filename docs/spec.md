# Bastion Heroes — Game & Build Spec

Oct 23, 2026 · @Fatlind Azemi

## 1. How to use this document

This document is the single source of truth for building Bastion Heroes, a mobile lane-defense game in the style of Plants vs. Zombies with collectible characters. It is written so that any AI coding agent, even a weak one, can follow it step by step without guessing.

### 1.1 Rules for the AI agent (read before every task)

1. Read this whole document once before your first task. Before each later task, re-read the sections that task names.
2. Do exactly one milestone task at a time. Never start the next task before the current one meets its acceptance criteria.
3. If this document gives a number, use that number. Do not invent your own values for costs, health, damage, speed or timings.
4. If this document does not answer a question, do NOT guess. Write the question as a comment on the GitHub issue, add the label `needs:decision`, and stop work on that part.
5. Never add features that are not in this document. Extra ideas go into a new GitHub issue labeled `idea`.
6. Never change files outside the folder the current task names, unless the task says so.
7. All game numbers live in `src/data/`. Never write a balance number directly into logic code.
8. After every change: run `npm run typecheck`, `npm run lint` and `npm test`. All three must pass with zero errors before you commit.
9. For every visual change: start the game in a browser, take a screenshot, look at it, and attach it to the pull request.
10. Write all code, comments, commits, issues and docs in English.
11. Keep functions short (under 40 lines). One file = one responsibility. Name things in full words (`essenceCost`, not `ec`).
12. If a command fails, read the full error message, fix the cause, and run it again. Do not delete tests to make them pass.

### 1.2 Priority order when rules conflict

1. Safety and not breaking the build
2. This document
3. The GitHub issue text
4. Your own judgment

### 1.3 Glossary

| Term | Meaning |
| --- | --- |
| Defender | A character the player places on the grid. Like a plant in PvZ. |
| Enemy | A Gloom creature that walks from right to left. Like a zombie in PvZ. |
| Essence | The currency spent inside a level to place defenders. Like sun in PvZ. |
| Lane | One horizontal row of the grid. There are 5. |
| Tile | One cell of the grid. The grid has 5 lanes × 9 columns = 45 tiles. |
| Column | Vertical index of a tile, 0 (left, next to the base) to 8 (right, next to the portal). |
| Loadout | The 6 defenders the player picks before a level starts. |
| Cooldown | Seconds a defender card is blocked after being placed. |
| Wave | A group of enemies spawned together. |
| Last Stand Trap | One-time emergency trap at the left end of each lane. Like the PvZ lawn mower. |
| Star level | In-level upgrade (★1, ★2, ★3) gained by merging copies of a defender on the same tile. |
| Card level | Permanent upgrade (1 to 10) bought outside levels with gold and duplicate shards. |
| Rarity | Common, Rare, Epic, Legendary or Mythic. |
| Sim | The pure game-logic layer. No graphics, no DOM, no Three.js. |
| Tick | One fixed simulation step. 1 tick = 1/30 second. |

## 2. Game overview

Bastion Heroes is a single-player lane-defense game for iOS and Android: the player places cute, chunky heroes on a 5 × 9 grid to stop waves of shadow creatures, and collects new heroes of five rarities between levels.

### 2.1 Pitch

The peaceful village of Brightvale is attacked by the Gloom, a horde of shadow creatures that pour out of a rift. The player commands a team of heroes from five factions. Each level, the player picks 6 heroes, places them on the grid, manages Essence, and holds the line until the final wave is defeated.

### 2.2 Design pillars (every feature must support at least one)

1. **Think before you place.** Every level should have a clear best answer that the player has to work out: which loadout, which tile, which moment.
2. **Readable at a glance.** On a 6-inch phone the player must understand what is happening within one second. Friend and enemy, health, danger.
3. **Collect characters you love.** Every hero has a unique look, personality and mechanic. Rarity means a more unusual mechanic, not just bigger numbers.
4. **Fair, not pay-to-win.** Every campaign level can be won with only Common and Rare heroes at the recommended card level.
5. **Juicy feedback.** Every action has a bounce, a sound and a particle effect.

### 2.3 Key facts

| Item | Value |
| --- | --- |
| Platforms | iOS 16+ and Android 10+ (phones first, tablets supported) |
| Orientation | Landscape only |
| Target frame rate | 60 fps on an iPhone 12 / Pixel 6; never below 30 fps on an iPhone XR |
| Level length | 3 to 5 minutes |
| Session length | 10 to 15 minutes (3 levels + meta screens) |
| Mode | Single player, offline-capable; online only for shop, chests and cloud save |
| Age rating target | PEGI 7 / ESRB Everyone 10+ (cartoon violence, no blood) |
| Business model | Free to play: battle pass, cosmetic skins, chests with published odds, optional rewarded ads |
| Working title | Bastion Heroes (final name: open decision, see section 17) |

### 2.4 What makes it different from Plants vs. Zombies

- **Collection with rarities.** Heroes are unlocked from chests and leveled up with duplicates.
- **Merge on the field.** Placing the same hero on a tile that already holds that hero upgrades it to ★2 and ★3.
- **Elemental combos.** Some effects combine (ice + fire = steam burst). Placement next to each other matters.
- **Damage and armor types.** Each enemy has an armor type; each hero has a damage type. Matching them is the core strategy.
- **Scouting.** Before each level the player sees which enemy types will appear and picks a loadout to counter them.
- **Clash Royale look.** Chunky stylized 3D characters, bright colors, heavy UI.

## 3. Core gameplay rules

A level is won when every enemy of every wave is dead, and lost when an enemy crosses the base line in a lane whose Last Stand Trap is already used. Every number below is a default stored in `src/data/rules.ts`.

### 3.1 The grid and coordinates

- The grid has **5 lanes** (index 0 = top, 4 = bottom) and **9 columns** (index 0 = left next to the base, 8 = right next to the portal).
- Simulation uses world units. **1 tile = 1.0 unit wide.** Column `c` spans x from `c` to `c + 1`. Its center is `c + 0.5`.
- Lane `l` center is y = `l + 0.5`. The sim is 2D (x along the lane, lane index). Height only exists in rendering.
- **Base line:** x = 0.0. **Enemy spawn point:** x = 9.6 (just right of the grid, inside the portal fog).
- Every tile has a `terrain` value: `normal`, `water`, `lava`, `rock` (blocked), `highGround`. See section 7 for which levels use which.

### 3.2 Time

- The simulation runs at a **fixed 30 ticks per second** (1 tick = 33.33 ms). Rendering interpolates between ticks at the screen's frame rate.
- All durations in data files are in **seconds**. The sim converts to ticks with `Math.round(seconds * 30)`.
- Game speed buttons: **1×** and **2×**. 2× runs two ticks per 33.33 ms. Pause stops ticks completely.
- The sim must be **deterministic**: same level + same seed + same player inputs = exactly the same result. Use the seeded random generator in `src/sim/random.ts` (mulberry32). Never call `Math.random()` inside `src/sim/`.

### 3.3 Essence (the in-level currency)

| Rule | Value |
| --- | --- |
| Starting Essence | 150 (some levels override this) |
| Sky drop amount | 25 Essence per orb |
| Sky drop interval | Every 8.0 s; first drop at 4.0 s after level start |
| Sky drop position | Random tile (seeded), falls from above, lands in 1.0 s |
| Orb lifetime | 8.0 s after landing, then it fades out and is lost |
| Collect | Tap the orb. The orb flies to the Essence counter in 0.4 s; the value is added when tapped (not when it arrives). |
| Producer orbs | Same rules as sky orbs, but spawn on the producer's tile |
| Maximum Essence | 9,990 |
| Night levels | No sky drops at all |
| Settings option | "Auto-collect orbs" (default OFF). When ON, orbs are collected automatically 1.0 s after landing. |

### 3.4 Placing defenders

1. The player taps a card in the card bar (it lifts up and glows), then taps a tile. Dragging a card onto a tile also works.
2. Placement is **allowed** only if ALL are true:
   - The card is not on cooldown.
   - The player has at least the card's Essence cost.
   - The tile is `normal`, `highGround`, or `water` with a platform defender on it (see Lily Raft in section 5), and is not `rock`.
   - The tile is empty, OR it holds the **same defender** at ★1 or ★2 (this is a merge, see 3.6).
   - Enemies standing on the tile do NOT block placement.
3. On success: subtract the cost, start the card's cooldown, spawn the defender with the spawn animation. The defender becomes active after **0.5 s** (it cannot attack or be targeted during the drop).
4. On failure: the card shakes, a short "error" sound plays, and a small red text explains why ("Not enough Essence", "Tile occupied", "Recharging").
5. Tapping the card again or tapping outside the grid cancels the selection.

### 3.5 Cooldowns

- Each defender has a `cooldown` in seconds (see section 5). The cooldown starts the moment the defender is placed.
- Each defender has `startsReady: true|false`. If false, its cooldown runs once from level start.
- The card shows a dark overlay that shrinks from top to bottom as the cooldown runs, plus the remaining seconds.

### 3.6 Merge (star levels)

- Placing a defender on a tile that already holds the same defender raises its star level by 1 (max ★3).
- It costs the **full Essence cost** and starts the **full cooldown**, like a normal placement.
- The defender heals to its new full health.
- Multipliers: **★2 = health × 1.6 and damage × 1.6. ★3 = health × 2.5 and damage × 2.5**, plus the defender's unique ★3 bonus (section 5).
- Producers: ★2 produces 1.5× as often, ★3 2× as often (interval divided by 1.5 or 2).
- The defender's model grows: ★1 scale 1.0, ★2 scale 1.12, ★3 scale 1.25, plus visual extras (section 9).

### 3.7 Removing defenders (shovel)

- The shovel button sits at the right end of the card bar. Tap it, then tap a defender to remove it.
- **No Essence refund.** Removing is instant and has no cooldown.

### 3.8 Enemy movement and blocking

- Enemies spawn at x = 9.6 in their lane and walk left at their `speed` (tiles per second).
- An enemy is **blocked** when a ground defender in the same lane has its tile center within **0.55 units** to the left of the enemy's x. A blocked enemy stops and attacks that defender.
- Flying enemies are never blocked by ground defenders (only by defenders with `blocksFlying: true`).
- When the blocking defender dies, the enemy continues walking on the next tick.

### 3.9 Last Stand Trap and losing

- Each lane has one **Last Stand Trap** at x = -0.4 (a spring-loaded log roller in the village gate).
- When any enemy in that lane reaches x ≤ 0.0 and the trap is unused: the trap fires. It rolls from x = -0.4 to x = 10.0 at 8 tiles per second. Every non-boss enemy it touches dies instantly. Bosses take 400 damage. The trap is then used for the rest of the level.
- When an enemy reaches x ≤ -0.3 in a lane whose trap is used: **the level is lost** immediately.

### 3.10 Waves and winning

- A level has a list of waves (format in section 7). Wave 1 starts at the level's `firstWaveDelay` (default 20 s) so the player can build economy.
- The next wave spawns after the current wave's `duration`, OR 3 s after every enemy of the current wave is dead, whichever comes first.
- Inside a wave, enemies spawn one by one with the `spawnGap` the wave defines.
- Waves with `flag: "big"` show the banner "A huge wave is coming!" 3 s before they spawn, with a horn sound.
- The final wave is always `flag: "final"` and shows "FINAL WAVE".
- The **level is won** when all waves have spawned and no enemies are alive.
- A progress bar at the bottom right shows level progress with a flag icon per big wave.

### 3.11 Level rating (stars on the map)

| Stars | Condition |
| --- | --- |
| 1 | Level won |
| 2 | Won without using any Last Stand Trap |
| 3 | Won without using any trap AND lost at most 2 defenders |

### 3.12 Before the level: scouting and loadout

1. The **Scout screen** shows the level name, terrain, and one icon per enemy type that will appear, with a short tip ("Shieldbearer: front shots bounce off").
2. Below, the player's collection is shown as cards. The player picks **6** cards into the loadout slots. Levels 1 to 4 use fewer, pre-chosen slots as the tutorial (section 7).
3. A "Recommended" button fills the slots automatically with the cards whose damage types best counter the shown enemies (simple rule: for each enemy armor type, add the highest-level owned card with an effective damage type; then fill with a producer and highest-level cards).
4. Tap "Fight!" to start. The loadout is saved per level and pre-filled next time.

## 4. Combat system

Every hit is calculated with one formula: base damage, times card level, times star level, times the damage-type vs armor-type multiplier, times active buffs. Matching damage type to armor type is the main strategic decision.

### 4.1 Damage types and armor types

Every defender attack has exactly one **damage type**. Every enemy has exactly one **armor type**.

| Damage type ↓ / Armor type → | Light | Armored | Spectral |
| --- | --- | --- | --- |
| **Pierce** (arrows, bolts, sparks) | **1.25** | 0.5 | 1.0 |
| **Blast** (explosions, hammers, cannons) | 1.0 | **1.25** | 0.5 |
| **Arcane** (magic, light, runes) | 0.75 | 1.0 | **1.5** |

- Light = normal creatures. Armored = metal, stone, shields. Spectral = ghosts and shadow spirits.
- Show the multiplier to the player: damage numbers are **yellow** for 1.25 and 1.5 ("Effective!"), **white** for 1.0, **gray** for 0.75 and 0.5 ("Resisted").

### 4.2 Damage formula

```latex
\text{damage} = \max\left(1,\ \operatorname{round}\left(B \times L \times S \times T \times (1 + \textstyle\sum \text{buffs})\right)\right)
```

- B = the defender's base damage from section 5.
- L = card level multiplier = 1 + 0.08 × (cardLevel − 1). Level 1 = 1.00, level 10 = 1.72.
- S = star multiplier: ★1 = 1.0, ★2 = 1.6, ★3 = 2.5.
- T = the multiplier from the table in 4.1.
- buffs = sum of active damage buffs as decimals (for example a +20% aura = 0.2). Buffs of the same name do not stack; take the highest.
- Defender health uses the same L and S multipliers: health = baseHealth × L × S.

### 4.3 Attack patterns

Each defender has one `pattern`. The sim implements each pattern as one function in `src/sim/combat/patterns/`.

| Pattern | Behavior |
| --- | --- |
| `straight` | Fires a projectile to the right along its lane. It hits the first non-flying enemy it touches. Projectile speed 6 tiles/s unless stated. Blocked by shields from the front. |
| `lob` | Throws an arc to the first enemy in range in its lane. Ignores shields. Cannot hit flying enemies. Flight time always 0.8 s. |
| `splash` | Like `lob`, but deals full damage to the target and 50% to every enemy within `radius` tiles of the impact. |
| `beam` | Instantly hits every enemy in its lane within `range` tiles. Ignores shields. Hits flying. |
| `diagonal` | Fires three `straight` projectiles: one in its lane, one to the lane above, one to the lane below (projectiles move right and switch lane once, at 1 tile distance). |
| `melee` | Hits the first enemy within 1.2 tiles to its right. Hits flying. |
| `aura` | No attack. Gives a buff to the 4 orthogonally adjacent tiles (up, down, left, right). |
| `producer` | No attack. Spawns an Essence orb every `interval` seconds. |
| `trap` | Invisible to enemies. Triggers when an enemy steps on its tile; then acts and is used up (or rearms after `rearm` seconds). |
| `wall` | No attack. High health. Blocks enemies. |

### 4.4 Targeting rules

1. A defender only targets enemies whose x is greater than `defender.x - 0.3` (in front of it or on its tile).
2. Among valid targets, pick the one with the **smallest x** (closest to the base). On a tie, pick the one that spawned first.
3. A defender attacks only when a valid target is within `range` tiles. Range 9 = the whole lane.
4. Flying enemies can only be hit by patterns `beam`, `melee`, and defenders with `hitsFlying: true`.
5. Burrowed enemies (underground) cannot be targeted at all until they surface.

### 4.5 Status effects

| Status | Effect | Duration | Stacking |
| --- | --- | --- | --- |
| Slow | Move speed × 0.5, attack speed × 0.5. Blue tint. | 3.0 s | No; refreshes duration |
| Freeze | Cannot move or attack. Ice block visual. Bosses get Slow instead. | 2.0 s | No; refreshes |
| Burn | 6 damage (Blast type) every 0.5 s. Orange flames. | 3.0 s | No; refreshes |
| Poison | 2% of max health every 1.0 s (ignores armor). Green bubbles. | 4.0 s | Up to 3 stacks |
| Stun | Cannot move or attack. Stars circle the head. | as given | No |
| Knockback | Pushed right by the given tiles over 0.2 s. Bosses immune. | instant | — |
| Wet | Enemy stands on a water tile. Used only by combos. | while on water | — |

### 4.6 Combos (elemental reactions)

Combos trigger automatically. Each combo shows a big word popup ("STEAM!") and its own VFX. Each enemy can trigger the same combo at most once every 2.0 s.

| Combo | Trigger | Result |
| --- | --- | --- |
| **Steam Burst** | A fire attack hits an enemy that is Slowed or Frozen | Removes Slow/Freeze. Deals 60 Blast damage to all enemies within 1.0 tile. Stuns them 0.5 s. |
| **Shatter** | Pierce damage hits a Frozen enemy | That hit deals ×2 damage. Freeze ends. |
| **Toxic Spread** | Blast damage hits a Poisoned enemy | Each enemy within 1.0 tile gets 1 Poison stack. |
| **Chain Shock** | A storm attack hits a Wet enemy | 40 Arcane damage jumps to every other Wet enemy within 2.0 tiles. |

A defender's element (`fire`, `frost`, `poison`, `storm` or `none`) is listed in section 5.

### 4.7 Enemies attacking defenders

- A blocked enemy attacks the blocking defender every `attackInterval` seconds for `attackDamage`.
- When a defender reaches 0 health it plays its death animation (0.4 s) and is removed. The tile becomes empty.
- Defenders do not regenerate unless an ability says so.

## 5. Defender roster

The game ships with 15 defenders; the first 8 (marked M2) are built first and must be enough to beat all of World 1. All values are card level 1, ★1. Store each defender as one file in `src/data/defenders/<id>.ts`.

### 5.1 Stats

| id | Name | Rarity | Faction | Cost | Cooldown (s) | Starts ready | Health | Build in |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `glowshroom_monk` | Glowshroom Monk | Common | Wildgrove | 50 | 7.5 | yes | 300 | M2 |
| `sparkbolt_gremlin` | Sparkbolt Gremlin | Common | Forge Clan | 100 | 7.5 | yes | 300 | M2 |
| `iron_granny` | Iron Granny | Rare | Forge Clan | 50 | 30 | no | 4000 | M2 |
| `boomcap_brewer` | Boomcap Brewer | Common | Wildgrove | 150 | 7.5 | yes | 300 | M2 |
| `snowpup_yeti` | Snowpup Yeti | Common | Frostborn | 175 | 7.5 | yes | 300 | M2 |
| `rune_archer` | Rune Archer | Rare | Neon Arcana | 150 | 7.5 | yes | 300 | M2 |
| `pyro_fox` | Pyro Fox | Epic | Wildgrove | 200 | 15 | no | 300 | M2 |
| `frost_witch` | Frost Witch | Epic | Frostborn | 250 | 20 | no | 400 | M2 |
| `harbor_turtle` | Harbor Turtle | Common | Frostborn | 25 | 7.5 | yes | 600 | M7 |
| `snaptrap_bertie` | Snaptrap Bertie | Common | Forge Clan | 25 | 20 | no | 300 | M7 |
| `venom_sprout` | Venom Sprout | Rare | Wildgrove | 175 | 7.5 | yes | 300 | M7 |
| `battle_drummer` | Battle Drummer | Rare | Forge Clan | 125 | 15 | no | 500 | M7 |
| `tesla_gnome` | Tesla Gnome | Rare | Neon Arcana | 175 | 10 | yes | 300 | M7 |
| `king_borrowbones` | King Borrowbones | Legendary | Hollow Court | 300 | 45 | no | 1500 | M7 |
| `aurora_dragon` | Aurora, the Neon Dragon | Mythic | Neon Arcana | 500 | 60 | no | 800 | M7 |

### 5.2 Behavior

| id | Pattern | Damage type | Element | Damage | Attack interval (s) | Range (tiles) | Special rules | ★3 bonus |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `glowshroom_monk` | producer | — | none | — | 24 (orb interval) | — | First orb 7 s after placement. Orb = 25 Essence. | Orbs worth 35 |
| `sparkbolt_gremlin` | straight | Pierce | none | 20 | 1.4 | 9 | — | Fires 2 bolts per attack (0.15 s apart) |
| `iron_granny` | wall | — | none | — | — | — | Shows cracked armor at 66% and 33% health | Reflects 20% of melee damage taken |
| `boomcap_brewer` | splash | Blast | none | 40 | 2.8 | 9 | Splash radius 0.8 | Splash radius 1.2 |
| `snowpup_yeti` | straight | Pierce | frost | 20 | 1.4 | 9 | Every hit applies Slow | Slow lasts 5 s |
| `rune_archer` | straight | Arcane | none | 30 | 1.5 | 9 | `hitsFlying: true` | Arrow passes through the first enemy and hits a second |
| `pyro_fox` | lob | Blast | fire | 25 | 2.0 | 6 | Every hit applies Burn | Leaves a fire patch (radius 0.5, 2 s) that applies Burn |
| `frost_witch` | beam | Arcane | frost | 30 | 2.0 | 4 | Every hit applies Slow; every 4th attack applies Freeze instead | Range 6 |
| `harbor_turtle` | wall | — | none | — | — | — | Can ONLY be placed on `water`. Another defender may be placed on top (a tile holds max 1 platform + 1 defender). | Health × 1.5 extra |
| `snaptrap_bertie` | trap | Blast | none | 1800 | — | own tile | Arms 12 s after placement (shows a timer). Single use. Not triggered by flying or burrowed enemies. | Rearms once after 20 s |
| `venom_sprout` | diagonal | Pierce | poison | 12 | 1.6 | 9 | Every hit adds 1 Poison stack | 2 stacks per hit |
| `battle_drummer` | aura | — | none | — | — | adjacent | Adjacent defenders get +25% damage (buff name `drum`) | +40% |
| `tesla_gnome` | beam | Arcane | storm | 25 | 1.8 | 3 | `hitsFlying: true` | Range 5 |
| `king_borrowbones` | aura | — | none | — | — | adjacent | When an adjacent defender dies, it revives after 1.0 s with 50% health. Once per adjacent defender. Max 1 on the field. | Revive at 100% health |
| `aurora_dragon` | beam | Arcane | storm | 60 | 2.5 | 9 | Hits its own lane and both neighboring lanes. `hitsFlying: true`. Max 1 on the field. Cannot be merged. | — (no stars) |

### 5.3 Character briefs (personality and look)

Use these briefs for concept art, 3D models, voice lines and the card description text.

| Name | Look (for artists and asset generators) | Personality | Card description |
| --- | --- | --- | --- |
| Glowshroom Monk | Small round monk in a brown robe, sitting cross-legged on a giant glowing teal mushroom cap. Closed eyes, tiny smile. Glow particles float up. | Calm, sleepy, wise | "Meditates so hard that Essence just falls out of the sky." |
| Sparkbolt Gremlin | Green gremlin with huge ears and goggles, holding a copper spark cannon twice its size, pointing right. Smoke puffs from the barrel. | Hyperactive, giggles | "Built the cannon himself. Nobody knows how." |
| Iron Granny | Old lady with a white bun and round glasses inside a boxy copper steam mech. Knitting needles in one mech hand. | Grumpy, unshakable | "Has stood her ground since before the Gloom was cool." |
| Boomcap Brewer | Chubby mushroom-headed alchemist with a red-spotted cap, apron and a belt of bubbling potion bottles. Throws flasks overhead. | Cheerful, reckless | "Mixing is optional. Exploding is not." |
| Snowpup Yeti | Baby yeti with fluffy white fur, a blue scarf and a snowball sling. Big round eyes. | Shy, playful | "Every snowball comes with a free chill." |
| Rune Archer | Slim elf archer in a purple hood with glowing cyan rune tattoos. Bow made of light. | Cool, focused, few words | "Never misses. Even ghosts can't hide." |
| Pyro Fox | Orange fox with a flaming tail, standing on two legs, wearing a tiny alchemist vest. Juggles fireballs. | Cocky, show-off | "Hot-headed. Literally." |
| Frost Witch | Tall-ish witch with a pointed ice-crystal hat, pale blue skin, white hair, staff with a floating ice crystal. Snowflakes orbit her. | Elegant, cold, secretly kind | "She doesn't do warm welcomes." |
| Harbor Turtle | Big sea turtle with a wooden dock plank on its shell, a sailor cap and a rope. | Patient, salty sailor | "Free parking, anywhere on the water." |
| Snaptrap Bertie | Goblin hiding under a bear trap disguised with leaves; only eyes visible until it triggers. | Sneaky, snickering | "Watch your step. No, really." |
| Venom Sprout | Purple carnivorous plant with three heads facing up, straight and down, dripping green venom. | Hissing, mischievous | "Three heads, zero manners." |
| Battle Drummer | Muscular dwarf with a braided red beard and a huge war drum on his belly. | Loud, hypes everyone up | "Louder drums, harder hits." |
| Tesla Gnome | Tiny gnome with wild white hair standing on end, a coil backpack shooting lightning arcs. | Mad scientist | "Safety goggles sold separately." |
| King Borrowbones | Skeleton king with an oversized golden crown and a purple cape, holding a scepter with a green soul flame. | Dramatic, theatrical, kind to allies | "Death is merely a scheduling problem." |
| Aurora, the Neon Dragon | Long serpent dragon with glowing magenta and cyan scales, coiled around a crystal pylon, electric whiskers. | Proud, majestic | "When she roars, three lanes fall silent." |

## 6. Enemy roster

The Gloom has 9 regular enemies and 1 boss per world; the 7 marked M1 or M2 are needed for World 1. Each enemy is designed to punish one lazy strategy, so the player must adapt the loadout. Store each enemy in `src/data/enemies/<id>.ts`.

### 6.1 Stats

| id | Name | Armor | Health | Speed (tiles/s) | Attack damage | Attack interval (s) | Flying | Build in |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `gloomling` | Gloomling | Light | 200 | 0.22 | 50 | 0.5 | no | M1 |
| `pothead` | Pot-Head Gloomling | Armored | 600 | 0.22 | 50 | 0.5 | no | M2 |
| `shieldbearer` | Shieldbearer | Light body + Armored shield | 300 body + 600 shield | 0.20 | 50 | 0.5 | no | M2 |
| `shade_wisp` | Shade Wisp | Spectral | 300 | 0.30 | 40 | 0.5 | no | M2 |
| `bat_swarm` | Bat Swarm | Light | 120 | 0.50 | — | — | yes | M2 |
| `gloom_priest` | Gloom Priest | Spectral | 400 | 0.18 | 40 | 0.5 | no | M2 |
| `gloom_ogre` | Gloom Ogre | Armored | 1800 | 0.15 | 200 | 1.0 | no | M2 |
| `burrower` | Burrower | Light | 350 | 0.60 underground, 0.22 above | 50 | 0.5 | no | M7 |
| `shadow_hound` | Shadow Hound | Light | 180 | 0.60 | 40 | 0.4 | no | M7 |
| `morvak` | Morvak, the Gloom Tyrant (boss, World 1) | Armored | 12000 | 0.12 | 1000 (smash) | 4.0 | no | M7 |

**World scaling:** enemy health is multiplied by `1 + 0.25 × (worldNumber − 1)`. World 1 = ×1.0, World 5 = ×2.0. Speed and damage do not scale.

### 6.2 Behavior and counter

| id | Behavior | What it punishes | Good counters |
| --- | --- | --- | --- |
| `gloomling` | Walks, eats the first defender in front. | Nothing; it is the baseline. | Anything |
| `pothead` | Same as Gloomling. The pot falls off at 200 health left, and its armor type changes to Light (model swaps to no pot). | Only Pierce shooters | Boomcap Brewer, Pyro Fox |
| `shieldbearer` | Shield faces right. `straight` and `diagonal` projectiles hit the shield first. `lob`, `splash`, `beam`, `melee` and traps hit the body directly. When the shield breaks, it drops and the body continues. | Only straight shooters | Boomcap Brewer, Frost Witch, Pyro Fox |
| `shade_wisp` | Floats on the ground (not flying). Semi-transparent. | Blast-only loadouts | Rune Archer, Frost Witch |
| `bat_swarm` | Flies at height 1.5 over all ground defenders and walls. Does not attack. If it reaches x ≤ 0 it triggers the trap like any enemy. The trap DOES hit flying enemies. | No anti-air | Rune Archer, Frost Witch, Tesla Gnome, Aurora |
| `gloom_priest` | Every 3.0 s heals every enemy within 1.5 tiles for 60 health (green plus symbols). Cannot heal itself. | Slow damage that lets the horde recover | Burst damage, Rune Archer focus, splash |
| `gloom_ogre` | Very slow, smashes a defender every 1.0 s for 200. At 50% health it throws a Gloomling 3 tiles forward (lands behind the first defender). | Weak walls and spread-out damage | Iron Granny + Frost Witch slow, Boomcap Brewer, Shatter combo |
| `burrower` | Spawns underground: cannot be targeted, blocked or hit until it reaches x ≤ 3.0. Then surfaces in 1.0 s (dirt burst) and walks normally. Snaptrap Bertie DOES trigger on it when it surfaces on the trap tile. | Back-row-only defense | Melee and traps in columns 0–2, Tesla Gnome |
| `shadow_hound` | Fast. Jumps over the first defender it meets (once), landing 1 tile behind it. | Single walls | Slow effects, Snaptrap Bertie, two rows of defenders |
| `morvak` | Boss, see 6.3. | Everything | Full loadout, combos |

### 6.3 Boss: Morvak, the Gloom Tyrant

- Size: 2 lanes tall visually, but occupies only its current lane in the sim.
- Immune to Freeze (gets Slow instead), Stun, Knockback. The Last Stand Trap deals 400 damage and does not kill him.
- **Phase 1 (100% to 66% health):** walks, smashes the defender in front for 1000 every 4.0 s.
- **Phase 2 (66% to 33%):** on entering, roars (1.5 s, screen shake) and summons 1 Gloomling at x = 9.6 in every lane. Every 15 s summons 2 more Gloomlings in random lanes.
- **Phase 3 (below 33%):** every 8.0 s jumps to a random neighboring lane (1.0 s jump animation, lands on the same x). Speed becomes 0.2.
- A boss health bar is shown at the top of the screen with the name and phase markers.

### 6.4 Enemy briefs (look)

All Gloom creatures share: dark purple-black bodies (#2B1B3D to #4A2F66), glowing cyan or acid-green eyes, spiky silhouettes, wisps of shadow smoke rising off them. Never scary-realistic; always cartoony and a bit silly.

| Name | Look |
| --- | --- |
| Gloomling | Small blob-like imp with stubby legs, two horns, big glowing cyan eyes, open grin with a few teeth. Waddles. |
| Pot-Head Gloomling | A Gloomling wearing a dented cooking pot as a helmet that covers one eye. |
| Shieldbearer | Taller Gloomling holding a door from a ruined house as a shield, with nails sticking out. |
| Shade Wisp | Hooded ghost with no legs, tattered cloak that fades into smoke, one big eye. 70% opacity. |
| Bat Swarm | Three small purple bats with glowing eyes flying as one unit in a loose triangle. |
| Gloom Priest | Thin hooded figure with a long crooked staff topped by a green glowing skull lantern. |
| Gloom Ogre | Huge hunched brute, tiny head, massive fists, a Gloomling riding on its shoulder. |
| Burrower | Mole-like creature with drill-shaped claws and a mining helmet with a broken lamp. Underground shown as a moving dirt mound. |
| Shadow Hound | Lean wolf made of shadow smoke with a glowing cyan mane. |
| Morvak | Giant armored warlord with a cracked crown of black crystal, a huge spiked club, a tattered purple cape, and a glowing rift in his chest. |

## 7. Worlds, levels and waves

World 1 has 10 fully specified levels that teach one new idea each; Worlds 2 to 5 are outlined here and get detailed in milestone M7 using the same format. Store each level in `src/data/levels/w<world>_l<number>.ts` (for example `w1_l05.ts`).

### 7.1 Level data format

Every level file exports exactly one object of type `LevelDef`:

```ts
import type { LevelDef } from "../schema";

export const w1_l05: LevelDef = {
  id: "w1_l05",
  world: 1,
  number: 5,
  name: "Shield Wall",
  activeLanes: [0, 1, 2, 3, 4],      // lanes not listed are shown as rocks and unused
  startEssence: 150,
  skyDrops: true,                     // false on night levels
  terrain: [],                        // e.g. [{ lane: 2, col: 4, type: "rock" }]
  loadoutSlots: 6,
  fixedLoadout: null,                 // or an array of defender ids for tutorial levels
  firstWaveDelay: 20,                 // seconds
  waves: [
    { flag: "none",  duration: 25, spawnGap: 3, spawns: [{ enemy: "gloomling", count: 3, lanes: "random" }] },
    { flag: "none",  duration: 25, spawnGap: 3, spawns: [{ enemy: "gloomling", count: 2, lanes: "random" }, { enemy: "shieldbearer", count: 1, lanes: "random" }] },
    { flag: "big",   duration: 30, spawnGap: 2, spawns: [ /* ... */ ] },
    { flag: "final", duration: 0,  spawnGap: 1.5, spawns: [ /* ... */ ] }
  ],
  rewards: { gold: 100, firstClearChest: "wooden", unlockDefender: "snowpup_yeti" },
  seed: 10005
};
```

Rules for spawning:

1. Inside a wave, build the spawn list by taking `spawns` in order and expanding `count`. Then shuffle it with the level seed.
2. Spawn one enemy every `spawnGap` seconds.
3. `lanes: "random"` picks a random active lane, but never the same lane 3 times in a row. `lanes: [1, 3]` picks randomly from only those lanes.
4. `duration: 0` on the final wave means "no timer, wait until all enemies are dead".
5. Wave defaults if a field is missing: `duration` 25, `spawnGap` 3.

### 7.2 World 1: Sunny Meadow (built in M2)

Notation: g = gloomling, p = pothead, s = shieldbearer, w = shade\_wisp, b = bat\_swarm, pr = gloom\_priest, og = gloom\_ogre. Waves are separated by `|`. **BIG** = `flag: "big"`, **FINAL** = `flag: "final"`. All other waves are `flag: "none"`.

| # | Name | Lanes | Start Essence | Loadout | New idea | Waves | First-clear reward |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | First Light | \[2\] | 150 | Fixed: gremlin | Place a shooter, collect orbs | 1g \| 1g \| 2g \| 2g \| FINAL 4g | Unlock Glowshroom Monk |
| 2 | Village Path | \[1,2,3\] | 150 | Fixed: gremlin, monk | Economy: build producers early | 2g \| 2g \| 3g \| BIG 4g \| 3g \| FINAL 6g | Unlock Iron Granny |
| 3 | Granny's Gate | all | 150 | Fixed: gremlin, monk, granny | Walls protect shooters | 2g \| 3g \| 4g \| BIG 6g \| 4g \| FINAL 8g | Unlock Boomcap Brewer |
| 4 | Pots and Pans | all | 150 | Fixed: gremlin, monk, granny, boomcap | Armor: Pierce is weak vs Armored | 2g \| 2g+1p \| 3g \| BIG 4g+2p \| 3g+2p \| FINAL 6g+3p | Wooden chest; unlocks free loadout (6 slots) |
| 5 | Shield Wall | all | 150 | Free, 6 slots | Shields block straight shots | 3g \| 2g+1s \| 3g+1p \| BIG 5g+2s \| 3g+2s+1p \| FINAL 6g+3s+2p | Unlock Snowpup Yeti |
| 6 | Whispering Field | all | 150 | Free | Spectral: Blast is weak | 3g \| 2g+2w \| 3g+1p \| BIG 4g+3w+1s \| 3w+2p \| FINAL 6g+4w+2s | Unlock Rune Archer |
| 7 | Wings at Dusk | all | 150 | Free | Flying: needs anti-air | 3g \| 2g+2b \| 2s+2w \| BIG 5g+3b+1p \| 3g+3b \| FINAL 6g+4b+2s+2w | Silver chest |
| 8 | Priest's Procession | all | 150 | Free | Healers: focus fire | 4g \| 2g+1pr \| 3w+2s \| BIG 5g+2pr+2p \| 3b+2w+1pr \| 2s+3p \| FINAL 7g+3pr+3b+2s | Silver chest |
| 9 | The Ogre Bridge | all | 150 | Free | Tanks: slow + walls + Blast | 4g \| 1og+2g \| 3p+2s \| BIG 1og+5g+2pr \| 3b+3w \| 2og+2s \| FINAL 2og+6g+3p+2pr+3b | Silver chest |
| 10 | Rift's Edge | all | 200 | Free | Everything combined | 5g \| 3s+2p \| 1og+3w \| BIG 6g+3b+2pr \| 2og+3p \| 4w+3s+3b \| BIG 2og+2pr+6g \| FINAL 3og+8g+4s+4b+3pr | Gold chest |

Wave timing for all World 1 levels: normal waves `duration: 25, spawnGap: 3`; BIG waves `duration: 30, spawnGap: 2`; FINAL waves `duration: 0, spawnGap: 1.5`. Seeds: `w1_lNN` uses seed `10000 + NN`.

In M7, level 10's FINAL wave also spawns Morvak (section 6.3) in lane 2 at the start of the wave.

### 7.3 Gold rewards

- Every win: gold = 50 + 10 × level number + 20 × (world − 1). Example: World 1 level 5 = 100 gold.
- First clear also gives the listed chest or unlock.
- Earning 2 and 3 stars for the first time gives +25 gems each (section 8).
- Replaying a won level gives 50% gold.

### 7.4 Worlds 2 to 5 (outline, detailed in M7)

| World | Name | Terrain and mechanic | New enemies | Defenders unlocked by levels |
| --- | --- | --- | --- | --- |
| 2 | Glowshroom Forest | Night: `skyDrops: false`. Start Essence 50 + some levels place 2 free Glowshroom Monks. | Burrower | Snaptrap Bertie, Venom Sprout |
| 3 | Frozen Harbor | Lanes 2 and 3 are `water` tiles from column 0 to 8. Only Harbor Turtle can be placed on water; other defenders go on top of it. Enemies walk through water (they are Wet there). | Shadow Hound | Harbor Turtle, Tesla Gnome |
| 4 | Forge Mountain | Some tiles are `lava` (no placement; enemies on lava take 20 damage/s). Some tiles are `highGround` (+1 range, +10% damage for the defender standing there). | Ogre variants (designed in M7) | Battle Drummer |
| 5 | Gloom Citadel | Fog: columns 5 to 8 are covered by fog in rendering. Enemies there are drawn as dark silhouettes with only eyes visible. The sim is unaffected. | Elite versions of all enemies (designed in M7) | — |

Each world has 10 levels; level 10 is always a boss level. Worlds 2 to 5 bosses are designed in M7.

## 8. Meta game: collection, rarity, chests, upgrades

Outside levels the player collects defenders from chests, upgrades them with duplicate shards plus gold, and builds loadouts. Chests open instantly (no timers), drop odds are always shown, and a pity counter guarantees a Legendary.

### 8.1 Currencies

| Currency | Icon | Earned by | Spent on |
| --- | --- | --- | --- |
| Gold | Gold coin | Winning levels, chests, daily quests | Card upgrades |
| Gems | Pink crystal | First-time 2 and 3 stars (+25 each), daily quests, achievements, battle pass, purchase | Magic and Legendary chests, gold packs, cosmetic skins |
| Shards | Card-specific | Chests (duplicates of a card) | Upgrading that one card |

### 8.2 Rarities

| Rarity | Frame color | Hex | Count in game | How players usually get it |
| --- | --- | --- | --- | --- |
| Common | Steel blue | #6FA8DC | 6 | Level unlocks, every chest |
| Rare | Orange | #F6A13A | 5 | Level unlocks, chests |
| Epic | Purple | #A64DFF | 2 | Silver chests and better |
| Legendary | Animated rainbow-gold | #FFD54A + shimmer | 1 | Gold chests, pity |
| Mythic | Animated dark gold with black smoke | #C99A2E + #1A1020 | 1 | Gold and Magic chests, very rare |

Rule: a higher rarity gives a more unusual mechanic, never just bigger numbers. Every campaign level must stay winnable with Common and Rare cards at the recommended card level (this is checked by the balancing bot, section 16).

### 8.3 Card levels

A card starts at level 1 when first unlocked. Upgrading costs shards of that card plus gold. Max level is 10. Per rarity, the shard cost is the Common value multiplied and rounded up: Rare × 0.5, Epic × 0.2, Legendary × 0.1, Mythic × 0.05 (minimum 1 shard). Gold cost is the same for all rarities.

| Upgrade to level | Shards (Common) | Gold |
| --- | --- | --- |
| 2 | 2 | 20 |
| 3 | 4 | 50 |
| 4 | 10 | 150 |
| 5 | 20 | 400 |
| 6 | 50 | 1,000 |
| 7 | 100 | 2,000 |
| 8 | 200 | 4,000 |
| 9 | 400 | 8,000 |
| 10 | 800 | 20,000 |

Recommended card level shown on the map: World 1 = 1, World 2 = 3, World 3 = 5, World 4 = 6, World 5 = 7.

### 8.4 Chests

Chests open instantly with an animation (shake, burst, cards fly out one by one, rarity glow before each flip).

| Chest | Source | Gold | Shard budget | Stacks | Common | Rare | Epic | Legendary | Mythic |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Wooden | First clears W1 L1–L5, daily quest | 40 | 6 | 1–2 | 85% | 14% | 1% | 0% | 0% |
| Silver | First clears, free every 24 h | 100 | 15 | 2–3 | 70% | 25% | 4.5% | 0.5% | 0% |
| Gold | Level 10 of each world, battle pass | 300 | 40 | 3 | 55% | 32% | 11% | 1.8% | 0.2% |
| Magic | Shop, 500 gems | 1,000 | 120 | 4 | 40% | 35% | 20% | 4.5% | 0.5% (at least one Epic stack guaranteed) |
| Legendary | Shop, 1,500 gems | 0 | 1 | 1 | 0% | 0% | 0% | 90% | 10% |

How to open a chest (the server does this from M5 on; before M5 the client does it with a seeded random generator):

1. Roll the number of stacks inside the given range.
2. For each stack, roll a rarity with the percentages above.
3. Pick one card of that rarity uniformly at random from all cards with `obtainable: true`.
4. Split the shard budget evenly across stacks (round down, remainder to the first stack). Divide each stack's shards by the rarity divisor: Common 1, Rare 3, Epic 10, Legendary and Mythic = always exactly 1 shard. Minimum 1.
5. If the player does not own the card yet, the first shard unlocks it (level 1) and the rest become shards.
6. **Pity:** count opened Silver-or-better chests since the last Legendary or Mythic. At 40, the next stack is forced to be Legendary. Reset the counter when any Legendary or Mythic drops.
7. The odds table must be visible in the game by tapping the "i" button on every chest (required by Apple and Google).

### 8.5 Daily quests

Every day at 00:00 local time, 3 quests are drawn from this pool. Each gives 50 gold + 10 gems. Completing all 3 gives a Wooden chest.

- Win 3 levels
- Trigger 5 combos
- Merge a defender to ★3
- Win a level without using any trap
- Defeat 100 enemies
- Win a level using only Common cards

### 8.6 Collection screen

- Grid of all cards, 4 per row on phones. Sort: owned first, then by rarity (Mythic first), then by Essence cost.
- Not-owned cards show a dark silhouette with a "?" and their rarity frame.
- Each card shows: portrait, level badge, a shard progress bar ("12/20"), and a green arrow when an upgrade is affordable.
- Tapping a card opens the detail view: the 3D model slowly rotating on a pedestal, idle animation playing, name, rarity, faction, description, a stat list (cost, health, damage, interval, range, damage type icon, element icon), the ★3 bonus, and the Upgrade button with its cost.
- Upgrade animation: card glows, stats count up, confetti, sound.

### 8.7 Save data

Store the save as one JSON object. Before M5 it lives in local storage (Capacitor Preferences on device). From M5 on, the server is the authority for gems, chests, shards and pity, and the local save is a cache.

```ts
type SaveData = {
  version: 1;
  gold: number;
  gems: number;
  cards: Record<string, { level: number; shards: number }>; // key = defender id
  levels: Record<string, { stars: 0 | 1 | 2 | 3 }>;         // key = level id
  loadouts: Record<string, string[]>;                       // key = level id
  pity: { sinceLegendary: number };
  dailyQuests: { date: string; quests: { id: string; progress: number; done: boolean }[] };
  settings: { music: number; sfx: number; autoCollect: boolean; haptics: boolean; language: string };
};
```

- Write the save after every level end, chest opening, upgrade and settings change.
- When `version` changes, write a migration function in `src/meta/save/migrations.ts`. Never delete player progress.

### 8.8 Battle pass and shop (built in M5)

- Season length 6 weeks, 30 tiers. Season XP: 10 per level won + 5 per star earned + 20 per daily quest.
- Free track: gold, Wooden and Silver chests, gems. Premium track: adds Gold chests, an exclusive skin and gems.
- Shop: gem packs, gold packs, Magic chest, Legendary chest, skins. All real-money prices are an open decision (section 17).
- Skins are cosmetic only. They change model textures and VFX color, never stats.

## 9. Art direction

The look is chunky stylized 3D with toon shading and dark outlines, bright warm heroes against dark purple enemies, viewed from a fixed tilted camera. Readability on a phone beats detail every time. Inspired by mobile hits like Clash Royale, but never copy their characters, logos or UI assets.

### 9.1 Camera and world mapping

- Three.js world: **1 tile = 1.0 unit**. Sim x maps to world x. Sim lane `l` maps to world z = `l + 0.5`. World y is up.
- Perspective camera, FOV 32°, fixed. Start values: position (4.5, 7.5, 10.5), looking at (4.5, 0, 2.6). Tune so that world x from −2.5 (base) to 11.0 (portal) fits the screen width on a 19.5:9 phone, and the top 14% of the screen stays free for the card bar.
- The camera never moves during play, except screen shake (9.7).
- Defenders face +x (right). Enemies face −x (left).

### 9.2 Lighting and shading

- One directional light from the upper left front: color #FFF2D9, intensity 2.2.
- One hemisphere light: sky #BFE3FF, ground #6B8F4E, intensity 0.9.
- **No real-time shadows.** Every unit gets a blob shadow: a dark ellipse on the ground (#000000 at 35% opacity), 0.7 units wide.
- Materials: `MeshToonMaterial` with a 3-step gradient map (shadow 0.55, mid 0.8, light 1.0 brightness).
- Outline: inverted hull done at runtime. For each character mesh, add a copy with a black (#1B1B2F) back-face-only material, with vertices pushed out along their normals by 0.02 units. One shared function `addOutline(mesh)` in `src/render/outline.ts`.
- Hit flash: a shader uniform `flash` (0 to 1) that mixes the color toward white. Used for 0.08 s on every hit.

### 9.3 Proportions and budgets

| Asset | Height (units) | Triangles | Texture |
| --- | --- | --- | --- |
| Common and Rare defender | 0.7–0.9 | 1,500–3,000 | Shared 256×256 palette texture |
| Epic and Legendary defender | 0.8–1.1 | 3,000–4,500 | Palette texture + optional 256×256 detail texture |
| Mythic defender | up to 1.3 | up to 6,000 | Palette texture + 512×512 detail texture |
| Regular enemy | 0.8–1.0 (Ogre 1.4) | 1,000–3,000 | Palette texture |
| Boss | 2.4 | up to 8,000 | 512×512 |
| Level environment (one world) | — | up to 30,000 total | Palette texture + 1 ground texture 1024×1024 |

- Head = 40–50% of the total height. Hands, weapons and props are oversized (1.5–2× realistic).
- Every unit's footprint stays inside a circle of 0.8 units diameter (so it fits its tile).
- **Palette texture:** one 256×256 PNG made of 16×16 flat color swatches (256 colors). Models are UV-mapped so each face samples the center of one swatch. This lets an AI agent color models by choosing swatch indices instead of painting textures. File: `assets-src/palette/palette.png`, generated by `tools/palette/make_palette.py`.

### 9.4 Color palette

Defenders use warm, saturated colors. Enemies use dark purples with glowing eyes. This contrast is the most important readability rule.

| Group | Main | Accent | Extra |
| --- | --- | --- | --- |
| Forge Clan | Copper #C8743A | Orange #FF8A2B | Steel #8A9BA8 |
| Wildgrove | Leaf green #5FBF4A | Mushroom red #E5483B | Moss #2E7D32 |
| Neon Arcana | Cyan #22D3EE | Magenta #E040FB | Violet #7C4DFF |
| Frostborn | Ice blue #9BE7FF | Snow white #F4FBFF | Deep blue #2F6FDB |
| Hollow Court | Bone #EFE6D2 | Royal purple #6A3FA0 | Soul green #7CFF6B |
| The Gloom (enemies) | Shadow #2B1B3D | Dusk purple #4A2F66 | Eye glow #3CF2FF or #A8FF3C |
| Essence | Teal #3BF0C8 with a white core | — | — |
| World 1 ground | Grass #7ED957 and #6CC644 in a checkerboard | Path dirt #D9A066 | Sky #9FD8FF |

### 9.5 Shape language

- Producers: round and soft. Shooters: a clear weapon pointing right. Walls: square and wide. Control and magic: flowing lines and floating parts. Legendary and Mythic: tall, asymmetric, unique silhouette.
- Enemies: spiky, horned, jagged edges, always slightly hunched.
- **Silhouette test:** render every character as solid black at 80 px tall. A tester must be able to name it and its role. Do this for every new character and attach the image to its pull request.

### 9.6 Animations

Skeletal clips come from Blender. Spawn, hit and death are procedural (code) and shared by all units, so they need no clips.

| Clip | Who | Source | Length | Notes |
| --- | --- | --- | --- | --- |
| `idle` | All | Blender | 2.0 s loop | Breathing, blinking, a character-specific twitch |
| `attack` | Attackers | Blender | 0.4 s | Wind-up 0.1 s, then the shot. The renderer plays it when the sim emits an `attack` event. |
| `produce` | Producers | Blender | 0.6 s | Glow pulse when an orb spawns |
| `walk` | Enemies | Blender | 1.0 s loop | Playback speed scales with the enemy's current speed (Slow halves it) |
| `eat` | Enemies | Blender | Loop matching `attackInterval` |  |
| `victory` | Defenders | Blender | 1.2 s | Plays on all living defenders when the level is won |
| spawn | All | Code | 0.5 s | Drop from 1.5 units above, land with squash (scale y 0.75, x/z 1.15), overshoot to 1.05, settle to 1.0. Dust ring. |
| hit | All | Code | 0.15 s | Flash to white 0.08 s + squash to 0.92 and back |
| death | All | Code | 0.4 s | Scale to 0 with a 180° spin, then a poof (purple smoke for enemies, gold stars for defenders) |
| merge | Defenders | Code | 0.5 s | Jump 0.4 units, spin 360°, grow to the new star scale, star burst VFX |

### 9.7 VFX and juice

Every VFX has an id and lives in `src/render/vfx/<id>.ts`. Use simple particle sprites (soft circle, star, spark, smoke puff, snowflake, rune) from one 512×512 sprite sheet.

| VFX id | Used for |
| --- | --- |
| `spawn_dust` | Defender lands |
| `hit_pierce` | Yellow spark burst |
| `hit_blast` | Orange ring + smoke puff |
| `hit_arcane` | Cyan rune flash |
| `status_slow` | Blue sparkles on the enemy, blue tint |
| `status_freeze` | Translucent ice block mesh around the enemy |
| `status_burn` | Small flames on the enemy |
| `status_poison` | Green bubbles rising |
| `combo_steam` | White steam cloud burst + "STEAM!" popup |
| `combo_shatter` | Ice shards flying + "SHATTER!" popup |
| `combo_toxic` | Green cloud expanding + "TOXIC!" popup |
| `combo_chain` | Lightning arcs between enemies + "CHAIN!" popup |
| `essence_orb` | Teal glowing orb with a slow bob and sparkle trail |
| `death_poof_enemy` | Purple smoke puff |
| `death_poof_defender` | Gold star burst |
| `trap_roll` | Rolling log with dust and leaves |
| `merge_star` | Gold star explosion |
| `win_confetti` | Full-screen confetti |

Juice rules:

- Damage numbers float up 0.6 units in 0.6 s and fade. Colors per 4.1. Font Lilita One with a dark outline.
- Screen shake: 0.05 units amplitude for 0.15 s on hits of 200 or more, trap firing, boss smash and Ogre smash.
- Slow motion: when the last enemy of the final wave dies, run at 0.3× speed for 0.6 s.
- Health bars appear only after a unit has taken damage: green over defenders, red over enemies, 0.6 units wide, above the head.
- Haptics (device only): light on placement, medium on trap fire, heavy on win and loss.

### 9.8 UI

- Fonts: **Lilita One** for titles, numbers and buttons; **Nunito** (Bold and ExtraBold) for body text. Both are free (SIL Open Font License). Bundle them in the app; do not load them from the internet at runtime.
- Text style for titles and numbers: white fill, 3 px outline #1B1B2F, drop shadow 0 3 px rgba(0,0,0,0.35).
- Buttons: radius 16 px, a 6 px darker bottom edge for a 3D look, pressing moves the face down 4 px. Colors: primary green #4CD964, secondary blue #3FA9F5, buy yellow #FFCC00, danger red #FF4D4D.
- Minimum touch target: 48 × 48 px. Respect safe areas with `env(safe-area-inset-*)`.

In-level HUD (landscape):

| Element | Position | Size | Content |
| --- | --- | --- | --- |
| Essence counter | Top left | 140 × 72 px | Essence orb icon + number |
| Card bar | Top, right of the counter | 6 cards of 72 × 96 px, 8 px gaps | Portrait, Essence cost at the bottom, cooldown overlay, star pips |
| Shovel | End of the card bar | 72 × 72 px | Shovel icon |
| Speed toggle | Top right, left of pause | 64 × 64 px | "1×" / "2×" |
| Pause | Top right | 64 × 64 px | Pause icon; opens Resume, Restart, Settings, Quit |
| Level progress | Bottom right | 220 × 28 px | Fill bar, flag icon per BIG wave, skull for the final wave |
| Wave banner | Center | Full width, 120 px | "A huge wave is coming!" / "FINAL WAVE", slides in and out |
| Boss bar | Top center, below card bar | 50% width | Boss name, health, phase markers |

Card visual: portrait rendered from the 3D model (head and shoulders) on a gradient in the rarity color, rarity frame, cost badge with the Essence icon in the bottom left.

### 9.9 Audio

- Music (loops, OGG and M4A): main menu, World 1 calm, a "big wave" intensity layer that fades in during BIG and FINAL waves, victory sting (3 s), defeat sting (3 s).
- SFX (about 35): card select, place, merge, shovel, orb drop, orb collect, each attack type, each hit type, each combo, enemy groan, enemy eat, enemy death, defender death, trap, wave horn, boss roar, button tap, chest shake, chest open, card flip per rarity, upgrade, level win, level lose.
- Placeholder sources: Kenney.nl audio packs (CC0). Final audio is an open decision (section 17).
- Volume defaults: music 0.6, SFX 0.8. Music ducks to 30% during the victory and defeat stings.

## 10. Tech stack

Use exactly these tools. Do not add a dependency that is not in this table without a `needs:decision` issue. Every choice is text-based and works from the command line, so an AI agent can build, test and verify everything without a GUI editor.

### 10.1 Versions policy

- Node.js: the current LTS line (pin it in `.nvmrc` and in `package.json` under `engines`).
- When you install a package, install the latest stable version at that moment, then **pin the exact version** (no `^` or `~`). Set `save-exact=true` in `.npmrc`.
- Commit `package-lock.json`. Use `npm ci` in CI.
- Upgrade dependencies only in a dedicated `chore/` issue, one package family per pull request, with all tests green.
- Package manager: npm only. Do not use yarn, pnpm or bun.

### 10.2 Packages

| Area | Package | Purpose | Rule |
| --- | --- | --- | --- |
| Language | `typescript` | All code | `strict: true`, `noUncheckedIndexedAccess: true`. No `any` (lint error). |
| Build | `vite` | Dev server, production build | Dev server on port 5173. |
| 3D | `three` + `@types/three` | Rendering | Only imported inside `src/render/`. |
| UI | `preact` + `@preact/signals` | Menus and HUD as HTML over the canvas | Only imported inside `src/ui/`. |
| Animation tweens | `gsap` | UI and procedural tweens (spawn, merge, damage numbers) | Never used inside `src/sim/`. |
| Particles | `three.quarks` | VFX | Only inside `src/render/vfx/`. |
| Audio | `howler` | Music and SFX | Wrapped by `src/platform/audio.ts`. |
| Validation | `zod` | Schemas for all data files and save data | Every data file is parsed with its schema at startup and in tests. |
| Unit tests | `vitest` | Sim, data, meta tests | `npm test` |
| E2E tests | `@playwright/test` | Browser tests and screenshots | `npm run e2e` |
| Lint/format | `eslint`, `typescript-eslint`, `prettier` | Code quality | `npm run lint` must pass with zero warnings. |
| Mobile shell | `@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`, `@capacitor/android` | Wrap the web build as native apps | M6 |
| Native plugins | `@capacitor/haptics`, `@capacitor/preferences`, `@capacitor/app`, `@capacitor/screen-orientation`, `@capacitor/splash-screen`, `@capacitor/status-bar` | Device features | Only imported inside `src/platform/`. |
| Backend | `@supabase/supabase-js` | Auth (anonymous + Apple/Google link), cloud save, chest opening | M5. Only inside `src/platform/backend.ts`. |
| Purchases | `@revenuecat/purchases-capacitor` | In-app purchases | M5. Only inside `src/platform/iap.ts`. |
| Ads | `@capacitor-community/admob` | Optional rewarded ads only (never forced) | M5. Only inside `src/platform/ads.ts`. |
| Analytics | `posthog-js` | Events and funnels | M5. Only inside `src/platform/analytics.ts`. |
| Asset tooling | `@gltf-transform/core`, `@gltf-transform/functions`, `@gltf-transform/cli` | Optimize .glb files | Used by `tools/build-assets`. |
| Script runner | `tsx` | Run TypeScript tools (`tools/*.ts`) |  |

External tools (not npm):

| Tool | Version | Purpose |
| --- | --- | --- |
| Blender | 4.x LTS, run headless: `blender -b -P script.py` | Model, rig, animate and export characters from Python scripts |
| Python | The one bundled with Blender | Blender scripts only. No other Python in the project. |
| Xcode | Current stable | iOS build (M6, needs a Mac) |
| Android Studio + JDK 17+ | Current stable | Android build (M6) |
| Supabase CLI | Current stable | Local backend and migrations (M5) |
| GitHub CLI `gh` | Current stable | Issues, PRs, labels |

### 10.3 npm scripts

These script names are fixed. Every agent prompt refers to them.

| Script | Command | What it does |
| --- | --- | --- |
| `dev` | `vite` | Start the dev server at http://localhost:5173 |
| `build` | `tsc --noEmit && vite build` | Typecheck and build to `dist/` |
| `typecheck` | `tsc --noEmit` | Typecheck only |
| `lint` | `eslint . --max-warnings 0 && prettier --check .` | Lint and format check |
| `format` | `prettier --write .` | Fix formatting |
| `test` | `vitest run` | All unit tests |
| `e2e` | `playwright test` | Browser tests, writes screenshots to `test-results/` |
| `balance` | `tsx tools/balance-sim/run.ts` | Run the balancing bot (section 16) |
| `assets` | `tsx tools/build-assets/run.ts` | Run Blender scripts and optimize all models (section 12) |
| `validate-data` | `tsx tools/validate-data.ts` | Parse every data file with its Zod schema |
| `check` | `npm run typecheck && npm run lint && npm test && npm run validate-data` | Everything a pull request must pass |
| `cap:sync` | `npm run build && npx cap sync` | Copy the web build into the native projects |

### 10.4 Import boundaries (enforced by ESLint)

Use the `no-restricted-imports` rule so these boundaries fail the lint:

- `src/sim/` may import only from `src/sim/` and `src/data/`. No `three`, no DOM, no `Math.random`, no `Date.now`, no `performance.now`.
- `src/data/` may import only `zod` and other files in `src/data/`.
- `src/render/` may import from `src/sim/` (read-only types and events), `src/data/`, `three`, `three.quarks`, `gsap`.
- `src/ui/` may import from `src/meta/`, `src/data/`, `src/platform/`, `preact`, `gsap`. It never imports `three`.
- `src/meta/` may import from `src/data/` and `src/platform/` (save and backend wrappers only).
- `src/platform/` is the only folder that imports Capacitor, Supabase, RevenueCat, AdMob, PostHog or Howler.

## 11. Architecture

### 11.1 Overview

```
Data (src/data) --defs--> Simulation (src/sim) --events--> Renderer (src/render)
                                 ^
                                 | commands
Meta (src/meta) <--uses-- UI (src/ui) --uses--> Platform (src/platform)
       |                                              ^
       +------------- save data, cloud calls ---------+
```

The simulation is the only place game rules live. It never imports the renderer, the UI or any platform code, so it runs headless in tests and in the balancing bot. The renderer and the UI only read its state and its events; the UI changes the game only by sending commands. Data files are imported by every module.

### 11.2 Folder structure

Create exactly this structure in M0. Do not invent other top-level folders.

```
bastion-heroes/
  .github/workflows/ci.yml        # runs npm run check + e2e on every PR
  .nvmrc  .npmrc  package.json  tsconfig.json  vite.config.ts
  eslint.config.js  prettier.config.js  playwright.config.ts
  capacitor.config.ts             # added in M6
  index.html
  CLAUDE.md                       # copy of section 1 rules + links to this spec
  public/
    models/   *.glb               # output of npm run assets (committed)
    textures/ palette.png  particles.png
    audio/    music/*.m4a  sfx/*.m4a
    fonts/    LilitaOne-Regular.woff2  Nunito-Bold.woff2  Nunito-ExtraBold.woff2
  src/
    main.ts                       # boot: load assets, mount UI, start loop
    loop.ts                       # fixed-tick game loop (11.4)
    sim/
      createSim.ts                # the only entry point into the sim
      types.ts                    # SimState, Command, SimEvent
      rng.ts                      # mulberry32
      grid.ts                     # tile helpers, lane and column math
      essence.ts                  # orbs, income, spending
      placement.ts                # place, merge, shovel, cooldowns
      waves.ts                    # wave spawning from LevelDef
      combat/  damage.ts  targeting.ts  projectiles.ts  status.ts  combos.ts
      behaviors/  <one file per attack pattern, e.g. straight.ts, lob.ts>
      enemies/    <one file per special behavior, e.g. burrow.ts, heal.ts>
      hash.ts                     # stable hash of SimState for replay tests
    data/
      schemas.ts                  # all Zod schemas
      defenders/<id>.ts           # one DefenderDef per file
      enemies/<id>.ts             # one EnemyDef per file
      levels/w1/l01.ts ... l10.ts # one LevelDef per file
      economy.ts                  # upgrade costs, chest odds, rewards
      index.ts                    # registry: exports all defs by id
    render/
      renderer.ts                 # scene, camera, lights, resize
      outline.ts  toonMaterial.ts  blobShadow.ts
      units.ts                    # Map<simId, Object3D>, spawn/despawn
      animations.ts               # plays clips from events
      vfx/<vfxId>.ts
      environment/<worldId>.ts
      assets.ts                   # GLTF loading and caching
    ui/
      app.tsx                     # screen router (11.8)
      screens/  MainMenu.tsx  WorldMap.tsx  Scouting.tsx  Loadout.tsx
                Level.tsx  Result.tsx  Collection.tsx  Shop.tsx  Chest.tsx
      hud/      CardBar.tsx  EssenceCounter.tsx  WaveBanner.tsx  ...
      components/ Button.tsx  Card.tsx  Modal.tsx  ...
      styles/   tokens.css  global.css
    meta/
      save.ts  upgrades.ts  chests.ts  quests.ts  rewards.ts
    platform/
      storage.ts  audio.ts  haptics.ts  backend.ts  iap.ts  ads.ts  analytics.ts
  assets-src/
    palette/                      # palette source
    blender/
      lib/                        # shared bpy helpers (12.3)
      characters/<id>.py          # one script per character
      environment/<worldId>.py
  tools/
    build-assets/  run.ts  optimize.ts
    balance-sim/   run.ts  bots.ts  report.ts
    palette/       make_palette.py
    validate-data.ts
  supabase/
    migrations/  functions/open-chest/  functions/verify-purchase/
  tests/
    sim/  data/  meta/            # vitest
    e2e/                          # playwright
```

### 11.3 Simulation contract

These types live in `src/sim/types.ts`. Everything outside the sim talks to it only through them.

```ts
export type Command =
  | { type: 'place'; defenderId: string; lane: number; col: number } // merges if same id + same stars on that tile
  | { type: 'shovel'; lane: number; col: number }
  | { type: 'collectOrb'; orbId: number }
  | { type: 'setAutoCollect'; on: boolean };

export type SimEvent =
  | { type: 'defenderPlaced'; id: number; defenderId: string; lane: number; col: number; stars: 1 | 2 | 3 }
  | { type: 'defenderMerged'; id: number; stars: 2 | 3 }
  | { type: 'defenderRemoved'; id: number; reason: 'shovel' | 'eaten' | 'destroyed' }
  | { type: 'enemySpawned'; id: number; enemyId: string; lane: number }
  | { type: 'attack'; sourceId: number; targetId: number | null }
  | { type: 'projectileSpawned'; id: number; kind: string; x: number; lane: number }
  | { type: 'projectileEnded'; id: number }
  | { type: 'hit'; targetId: number; amount: number; damageType: 'pierce' | 'blast' | 'arcane'; crit: boolean }
  | { type: 'statusApplied'; targetId: number; status: 'slow' | 'freeze' | 'burn' | 'poison' | 'stun' | 'wet' }
  | { type: 'combo'; combo: 'steam' | 'shatter' | 'toxic' | 'chain'; x: number; lane: number }
  | { type: 'enemyDied'; id: number }
  | { type: 'orbSpawned'; id: number; x: number; lane: number; value: number }
  | { type: 'orbCollected'; id: number }
  | { type: 'orbExpired'; id: number }
  | { type: 'waveStarted'; index: number; kind: 'normal' | 'big' | 'final' }
  | { type: 'trapFired'; lane: number }
  | { type: 'levelWon'; stars: 1 | 2 | 3 }
  | { type: 'levelLost' }
  | { type: 'commandRejected'; reason: 'notEnoughEssence' | 'onCooldown' | 'tileOccupied' | 'invalidTile' };

export interface Sim {
  readonly state: Readonly<SimState>; // read-only view for render and UI
  enqueue(cmd: Command): void;        // applied at the start of the next tick, in order
  step(): SimEvent[];                 // advances exactly one tick (1/30 s)
}

export function createSim(level: LevelDef, loadout: LoadoutEntry[], seed: number): Sim;
// LoadoutEntry = { defenderId: string; level: number } (card level from the save)
```

Rules:

- All timers inside the sim count **ticks** (integers), never seconds. Convert data seconds to ticks once with `Math.round(seconds * 30)`.
- Every entity has a numeric `id` from one counter that starts at 1 per sim. Ids are never reused.
- Entities are plain objects in arrays (`state.defenders`, `state.enemies`, `state.projectiles`, `state.orbs`). Do not use an ECS library.
- Process each tick in this fixed order: 1) apply queued commands, 2) waves spawn, 3) essence and orbs, 4) defenders act (sorted by id), 5) projectiles move and hit, 6) status effects tick, 7) enemies move, block and eat (sorted by id), 8) remove dead entities, 9) traps, 10) win and loss check.
- The only random source is `state.rng` (mulberry32 seeded with the level seed). Never call `Math.random`.
- A rejected command changes nothing and emits `commandRejected`. The UI shows a short shake on the card.

### 11.4 Game loop

`src/loop.ts` runs the sim at a fixed 30 ticks per second and renders every animation frame, smoothing positions between ticks.

```ts
const TICK_S = 1 / 30;
let acc = 0;
let last = performance.now();

function frame(now: number) {
  const dt = Math.min((now - last) / 1000, 0.25) * speed; // speed is 1 or 2; 0 when paused
  last = now;
  acc += dt;
  while (acc >= TICK_S) {
    const events = sim.step();
    renderer.handleEvents(events);
    ui.handleEvents(events);
    acc -= TICK_S;
  }
  renderer.draw(sim.state, acc / TICK_S); // alpha 0..1 for interpolation
  requestAnimationFrame(frame);
}
```

- The renderer stores each entity's previous and current position and draws `lerp(prev, curr, alpha)`.
- The cap of 0.25 s stops a "spiral of death" after the app returns from the background.
- When the app goes to the background (Capacitor `appStateChange`), set speed to 0 and open the pause menu.

### 11.5 Data definitions

All schemas live in `src/data/schemas.ts`. Every data file exports one object that is parsed by its schema in `npm run validate-data` and in a unit test. Field names below are fixed; sections 5, 6 and 7 give the values.

```ts
export const DefenderDef = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  name: z.string(),
  faction: z.enum(['forge', 'wildgrove', 'neon', 'frost', 'hollow']),
  rarity: z.enum(['common', 'rare', 'epic', 'legendary', 'mythic']),
  role: z.enum(['producer', 'shooter', 'wall', 'control', 'support', 'trap']),
  cost: z.number().int().positive(),
  cooldownS: z.number().positive(),
  startsReady: z.boolean(),
  hp: z.number().int().positive(),
  pattern: z.enum(['straight', 'lob', 'splash', 'beam', 'diagonal', 'melee', 'aura', 'producer', 'trap', 'wall']),
  damage: z.number().int().nonnegative(),
  damageType: z.enum(['pierce', 'blast', 'arcane']).optional(),
  attackIntervalS: z.number().positive().optional(),
  range: z.number().positive().optional(),   // tiles; omitted = whole lane ahead
  statusOnHit: z.object({ status: z.string(), durationS: z.number(), value: z.number() }).optional(),
  star3Bonus: z.string(),                    // id of a bonus implemented in src/sim/behaviors
  milestone: z.enum(['M1', 'M2', 'M7']),
});

export const EnemyDef = z.object({
  id: z.string(), name: z.string(),
  hp: z.number().int().positive(),
  armor: z.enum(['light', 'armored', 'spectral']),
  speed: z.number().positive(),              // tiles per second
  biteDamage: z.number().int(), biteIntervalS: z.number().positive(),
  special: z.string().optional(),            // id of a behavior in src/sim/enemies
  isBoss: z.boolean().default(false),
});
```

`LevelDef` is shown in section 7. If a value in sections 5 to 7 has no field here, add the field to the schema in the same pull request and mention it in the PR description.

### 11.6 Determinism and replays

- A replay is `{ levelId, seed, loadout, commands: { tick: number; cmd: Command }[] }`.
- Test rule: running the same replay twice must give the same `hashState(state)` at every 300th tick and at the end.
- Store 3 golden replays per world in `tests/sim/replays/`. If a balance change alters a golden hash, regenerate it in the same pull request and say so in the PR description.

### 11.7 Rendering rules

- The renderer keeps a `Map<simId, Object3D>`. It creates objects on spawn events and removes them on removal events after the death animation.
- Load every `.glb` once with `GLTFLoader` and clone it with `SkeletonUtils.clone` per unit.
- Use one `AnimationMixer` per unit. Cap the device pixel ratio at 2.
- Target draw calls below 150 and triangles below 300,000 per frame. Show `renderer.info` in a debug overlay toggled with the backquote key in dev builds.

### 11.8 Screens

The UI is a simple state machine in `src/ui/app.tsx`. Only one screen is mounted at a time; the 3D canvas stays mounted underneath and shows the menu diorama or the level.

| Screen | Goes to |
| --- | --- |
| Boot (loading bar) | MainMenu |
| MainMenu | WorldMap, Collection, Shop, Settings |
| WorldMap | Scouting (tap a level), MainMenu |
| Scouting (shows the level's enemies and lanes) | Loadout |
| Loadout (pick 6 cards, Recommended button) | Level, Scouting |
| Level (HUD over the 3D level) | Result, or WorldMap via Pause → Quit |
| Result (stars, rewards, chest) | Chest, WorldMap, Level (retry or next) |
| Collection, Shop, Chest | Back to the previous screen |

### 11.9 Save data

- `src/meta/save.ts` owns `SaveData` (section 8). It is stored as JSON through `src/platform/storage.ts` (Capacitor Preferences on device, `localStorage` in the browser) under the key `bh_save`.
- On load, parse with the Zod schema. If `version` is older, run the migration functions in order (`migrations[1]`, `migrations[2]`, ...). If parsing fails, keep the broken JSON under `bh_save_broken_<timestamp>` and start a fresh save.
- Save after every level result, chest opening, upgrade, purchase and settings change. Never save during a level.
- From M5, the server is the source of truth for gems, chests and purchases (section 14 lists the M5 tasks).

## 12. Asset pipeline

Every 3D model is built by a Python script that runs Blender without a window. No one sculpts or clicks in Blender. That way an AI agent can create, change and review models as code, and every model can be rebuilt with one command.

### 12.1 Flow

1. `assets-src/blender/characters/<id>.py` builds the mesh, the rig and the animation clips.
2. Blender exports a raw `.glb` to `assets-build/raw/<id>.glb` (this folder is in `.gitignore`).
3. `tools/build-assets/optimize.ts` optimizes it with gltf-transform and writes `public/models/<id>.glb` (committed).
4. `tools/build-assets/check.ts` checks budgets and clip names (12.7).
5. A Blender preview script renders images to `assets-build/previews/<id>/` for the pull request (12.8).

### 12.2 Running Blender

- The path to Blender comes from the environment variable `BLENDER_PATH`. If it is missing, `npm run assets` stops with the message: "Set BLENDER\_PATH to your Blender 4.x executable."
- Command per script: `"$BLENDER_PATH" -b --factory-startup -P assets-src/blender/characters/<id>.py -- --out assets-build/raw/<id>.glb`
- `npm run assets` builds all models. `npm run assets -- <id>` builds one.
- Each script must finish in under 60 seconds and must not need internet access or add-ons.

### 12.3 Shared helpers (`assets-src/blender/lib/`)

Write these in M3 before the first character. Every character script uses them. Do not copy-paste geometry code between character scripts.

| Module | Functions | What they do |
| --- | --- | --- |
| `scene.py` | `reset_scene()` | Delete everything, set units to metric, 1 unit = 1 tile |
| `palette.py` | `swatch(index)`, `assign_swatch(obj, index)` | Map every face UV of an object to the center of one palette swatch (0–255). Uses `assets-src/palette/palette.png` as the single shared material. |
| `parts.py` | `blob(name, size, loc, swatch, bevel=0.08)`, `cylinder(...)`, `cone(...)`, `sphere(...)`, `capsule(...)`, `mirror_x(obj)` | Low-poly primitives with bevel modifiers, the building blocks of every character |
| `rig.py` | `make_armature(bones)`, `bind(mesh_parts, armature)` | Bones are given as a list of `(name, head, tail, parent)`. Each part is rigidly parented to one bone (no weight painting). |
| `anim.py` | `clip(name, length_s, keys)`, `key(bone, frame, rot=None, loc=None, scale=None)` | Create one action per clip and push it to the NLA so it exports as a separate glTF animation |
| `export.py` | `export_glb(path)` | Apply modifiers, export glTF binary with Y up, animations on, only the character collection |
| `checks.py` | `assert_height(min, max)`, `assert_tris(max)`, `assert_origin_at_feet()` | Fail the script early with a clear message |

### 12.4 Character script template

Every character script follows this shape. Change only the parts, swatches, bones and keys.

```python
# assets-src/blender/characters/glowshroom_monk.py
import sys, pathlib
sys.path.append(str(pathlib.Path(__file__).parents[1] / 'lib'))
from scene import reset_scene
from parts import blob, cylinder, sphere
from rig import make_armature, bind
from anim import clip, key
from export import export_glb
from checks import assert_height, assert_tris, assert_origin_at_feet

OUT = sys.argv[sys.argv.index('--') + 2]
reset_scene()

# 1. Parts (sizes in tiles, character stands at origin, faces +X)
body  = blob('body',  size=(0.42, 0.42, 0.34), loc=(0, 0, 0.22), swatch=41)  # robe
head  = sphere('head', radius=0.2,  loc=(0, 0, 0.55), swatch=12)               # skin
cap   = blob('cap',   size=(0.56, 0.56, 0.22), loc=(0, 0, 0.74), swatch=88)  # glowing mushroom cap
staff = cylinder('staff', radius=0.025, depth=0.7, loc=(0.22, 0.1, 0.35), swatch=60)

# 2. Rig
arm = make_armature([
    ('root', (0, 0, 0),    (0, 0, 0.1),  None),
    ('body', (0, 0, 0.1),  (0, 0, 0.4),  'root'),
    ('head', (0, 0, 0.4),  (0, 0, 0.7),  'body'),
    ('hand_r', (0.2, 0.1, 0.3), (0.25, 0.1, 0.45), 'body'),
])
bind({'body': [body], 'head': [head, cap], 'hand_r': [staff]}, arm)

# 3. Clips (frame rate 30)
clip('idle', 2.0, [key('body', 0, scale=(1, 1, 1)), key('body', 30, scale=(1.03, 1.03, 0.97)), key('body', 60, scale=(1, 1, 1))])
clip('produce', 0.6, [key('head', 0, rot=(0, 0, 0)), key('head', 9, rot=(0, -0.2, 0)), key('head', 18, rot=(0, 0, 0))])
clip('victory', 1.2, [key('root', 0, loc=(0, 0, 0)), key('root', 12, loc=(0, 0, 0.3)), key('root', 24, loc=(0, 0, 0))])

# 4. Checks and export
assert_height(0.7, 0.9)
assert_tris(3000)
assert_origin_at_feet()
export_glb(OUT)
```

### 12.5 Model rules

- Origin at the center of the feet, on the ground (z = 0 in Blender, y = 0 in three.js).
- Faces +X in Blender (exported so it faces +x in three.js). Enemies are built facing +X too; the renderer rotates them 180°.
- Height and triangle budget from 9.3.
- One material only: the shared palette material. Detail textures (Epic and above) are a second material named `detail`.
- Clip names exactly as in 9.6: `idle`, `attack`, `produce`, `walk`, `eat`, `victory`. Each character has only the clips its role needs (shooters: idle, attack, victory; producers: idle, produce, victory; walls: idle, victory; enemies: walk, eat).
- Bone names: lowercase snake\_case. The renderer looks up `root` for knockback and `head` for status VFX, so every rig must have both.

### 12.6 Optimization

`tools/build-assets/optimize.ts` runs these gltf-transform steps in order on every raw model: `dedup`, `prune`, `weld`, `resample` (animations), `quantize`, `meshopt` compression. Load models with `MeshoptDecoder` set on the GLTFLoader.

Size limits per file: Common to Rare 250 KB, Epic and Legendary 400 KB, Mythic and bosses 700 KB, one world environment 1.5 MB.

### 12.7 Automatic checks

`tools/build-assets/check.ts` reads every file in `public/models/` and fails if:

- the file is larger than its size limit (12.6),
- the triangle count is over budget (9.3),
- a clip required for the unit's role is missing (12.5),
- the bounding box height is outside the range in 9.3,
- bones `root` or `head` are missing,
- a model id has no matching defender or enemy in `src/data/index.ts`, or the reverse.

Run it in CI after `npm run validate-data`.

### 12.8 Previews and art review

`assets-src/blender/lib/preview.py` renders 4 PNG images per model at 512 × 512 with a transparent background: front 3/4 view, side view, game camera view (9.1) and the black silhouette (9.5). Attach all four to the pull request. The human art director approves or rejects the look in the PR (section 13). A model is not done until a human has approved it.

### 12.9 Card portraits

`assets-src/blender/lib/portrait.py` renders a 512 × 512 transparent PNG per defender: camera at head height, head and shoulders filling 80% of the frame, idle pose frame 0. Convert to WebP at quality 85 and save to `public/portraits/<id>.webp`. The UI draws the rarity gradient and frame behind it (9.8).

### 12.10 AI-generated models (optional route)

If the human decides that scripted models are not good enough for Epic and higher rarities, an image-to-3D service (for example Meshy, Tripo or Rodin) may be used, but only after a `needs:decision` issue is approved, and only for the characters named in it. Then:

1. The human generates and downloads the model and checks the service's license for commercial use.
2. The agent writes `assets-src/blender/import/<id>.py`, which imports it, decimates it to the budget in 9.3, recenters the origin, rescales it, adds the rig and clips with the same helpers, and exports with `export_glb`.
3. The same checks and previews (12.7, 12.8) apply.

### 12.11 Other assets

- Icons (currencies, buttons, statuses): hand-written SVG files in `public/icons/`, 2 px outline #1B1B2F, colors from 9.4.
- Particle sprite sheet: generated by `tools/build-assets/particles.ts` (draws soft circle, star, spark, smoke puff, snowflake and rune on a canvas) into `public/textures/particles.png`.
- Audio: source files in `assets-src/audio/` (WAV). Convert to M4A (AAC 128 kbps for music, 96 kbps for SFX) with ffmpeg in `tools/build-assets/audio.ts`. Keep each SFX under 1.5 s and under 50 KB.
- Every third-party asset (fonts, sounds, any model) gets a line in `CREDITS.md` with name, author, license and source URL.

## 13. Workflow

All work is tracked on GitHub. The goal: anyone (a human, a new agent session, another tool) can open the repository and know exactly what is done, what is in progress and what comes next, without reading any chat history.

### 13.1 Roles

| Role | Who | Does |
| --- | --- | --- |
| Product owner and art director | The human | Approves designs and art, answers `needs:decision` issues, plays builds on real devices, owns store accounts, prices and legal |
| Lead agent | One strong model session | Splits milestones into issues, reviews PRs from worker agents, makes architecture calls inside this spec |
| Worker agent | Any model session | Takes one issue, implements it on a branch, opens a PR |

A worker agent never changes this spec. If the spec is wrong or unclear, it opens a `needs:decision` issue and stops.

### 13.2 GitHub setup (done once in M0)

Create these labels with `gh label create`:

| Group | Labels |
| --- | --- |
| Type | `type:feat`, `type:fix`, `type:chore`, `type:docs`, `type:art`, `type:test`, `type:balance` |
| Area | `area:sim`, `area:render`, `area:ui`, `area:meta`, `area:data`, `area:assets`, `area:platform`, `area:backend`, `area:tools`, `area:ci` |
| Priority | `prio:p0` (blocks others), `prio:p1` (this milestone), `prio:p2` (nice to have) |
| Status | `status:in-progress`, `status:blocked` |
| Needs | `needs:decision`, `needs:art-review`, `needs:device-test` |

Create GitHub milestones `M0` to `M7` with the names from section 14. Every issue belongs to exactly one milestone.

Protect `main`: changes only through pull requests, CI must pass, squash merge only.

### 13.3 The task loop (follow every step, every time)

1. **Check the current state.** Run `gh issue list --state open`, `gh pr list` and `gh issue list --label status:in-progress`. Another session may already be working on something. Never take an issue that has `status:in-progress`.
2. **Find or create the issue.** Search with `gh issue list --search "<keywords>" --state all`. If no issue exists, create one with the template in 13.4 before writing any code.
3. **Take the issue.** `gh issue edit <nr> --add-label status:in-progress`. Then read the whole issue, including all comments, and the spec sections it links.
4. **Create the branch.** `git switch main && git pull && git switch -c <type>/<nr>-<short-name>`, for example `feat/12-essence-orbs`. Types: `feat`, `fix`, `chore`, `docs`, `art`, `test`, `balance`.
5. **Implement.** Stay inside the issue. If you find other work, create a new issue for it and continue with yours.
6. **Verify** as described in 13.7. Fix until everything passes.
7. **Open the pull request** with the template in 13.5. Tick every acceptance criterion you verified. Leave unticked the ones only a human or a real device can check, and say so.
8. **Merge.** When CI is green and no `needs:art-review` or `needs:decision` label is open on the PR, squash-merge: `gh pr merge <nr> --squash --delete-branch`. The issue closes through `Closes #<nr>`.
9. **Follow up.** Post findings, warnings and handover notes as a comment on the issue. File follow-up work as new issues.

If you must stop before you finish (usage limit, error you cannot fix, interruption): push the branch, then comment on the issue with what is done, what is missing and the branch name. Remove `status:in-progress` only if you are abandoning the issue.

### 13.4 Issue template

Save as `.github/ISSUE_TEMPLATE/task.md`:

```markdown
## Problem / findings
What is missing or wrong, and why it matters.

## Goal
One or two sentences.

## Spec references
- Section X.Y of the Game & Build Spec

## Acceptance criteria
- [ ] Concrete, checkable statement 1
- [ ] Concrete, checkable statement 2
- [ ] npm run check passes
- [ ] Screenshot attached (if anything visible changed)

## Dependencies
Depends on #nr (or "none")

## Out of scope
What this issue must not touch.
```

Rules for good issues: one issue = one pull request = under about 400 changed lines (generated assets excluded). Acceptance criteria are checkable by running something or looking at something, never "works well" or "looks good".

### 13.5 Pull request template

Save as `.github/pull_request_template.md`:

```markdown
Closes #<nr>

## What changed
Short description.

## Acceptance criteria
- [x] ...copied from the issue and ticked
- [ ] ...left unticked with the reason (e.g. "needs real-device test")

## Verification
- npm run check: pass
- npm run e2e: pass
- Measurements (fps, bundle size, balance win rates) if relevant

## Screenshots / previews
<images>
```

### 13.6 Git conventions

- Commit messages: Conventional Commits in English, e.g. `feat(sim): add essence orb spawning`, `fix(ui): card cooldown overlay not resetting`.
- Small commits that each build. Never commit secrets: keys go in `.env.local` (in `.gitignore`), and `.env.example` lists the variable names with empty values.
- Never force-push to `main`. Never rewrite history on a branch someone else is using.

### 13.7 Verification by type of change

| Change | Required checks |
| --- | --- |
| Any | `npm run check` passes with zero warnings |
| Sim rules (`src/sim/`) | New or updated Vitest tests for the rule; golden replays still pass or are regenerated with a reason |
| Data / balance (`src/data/`) | `npm run validate-data` and `npm run balance` for the affected world; paste the summary table into the PR |
| Render or VFX | Playwright screenshot of the scene in a fixed state (use the debug URL `?level=w1-l01&tick=900&seed=10001`), viewed by you before opening the PR |
| UI | Playwright screenshots at 844 × 390 (phone landscape) and 1194 × 834 (tablet), viewed by you; all touch targets at least 48 px |
| Models | `npm run assets -- <id>`, check script passes, 4 preview images attached, label `needs:art-review` |
| Platform / native | Web build still works with the platform stub; label `needs:device-test` |
| Backend | Supabase migration runs on a fresh local database; function unit tests pass |

**Look at your screenshots.** Open each image and compare it with the spec (sizes, colors, positions). A screenshot nobody looked at does not count as verification.

### 13.8 Definition of done

An issue is done only when all of these are true:

- [ ] Every acceptance criterion is ticked or explicitly handed to the human with a reason.
- [ ] `npm run check` and `npm run e2e` pass in CI.
- [ ] No `TODO` without an issue number (`// TODO(#42): ...`).
- [ ] No hard-coded game numbers outside `src/data/`.
- [ ] New public functions have a one-line comment saying what they do.
- [ ] The PR is squash-merged and the issue is closed.

### 13.9 When you are stuck

- After 3 failed attempts at the same problem, stop. Comment on the issue with what you tried and the exact error output.
- If the problem is a missing or conflicting rule in this spec, add `needs:decision`, list the options (A, B, C with pros and cons) in the comment, and pick up a different issue.
- Never delete or weaken a test to make it pass. Never disable a lint rule without a comment that names an issue.

### 13.10 Parallel work

- One issue per agent session. Each session works in its own git worktree or clone.
- Two issues may run at the same time only if they touch different folders. Use the area labels to check: two `area:sim` issues run one after the other.
- `src/data/index.ts` and `src/sim/types.ts` are shared hot spots: changes to them get their own small issue that goes first.

## 14. Milestones

Work through the milestones in order. Do not start an issue from a later milestone while an earlier one has open `prio:p0` or `prio:p1` issues. Each table row below becomes one GitHub issue; the lead agent creates them at the start of the milestone, with acceptance criteria taken from the row and the spec sections named.

### M0 — Project setup

Goal: an empty but fully wired project where `npm run check` and CI pass.

| # | Issue | Area | Depends on |
| --- | --- | --- | --- |
| 0.1 | Scaffold Vite + TypeScript (strict) + Preact; create the folder structure from 11.2 with placeholder `index.ts` files | tools | — |
| 0.2 | ESLint with import boundaries (10.4) and Prettier; `npm run lint` passes | ci | 0.1 |
| 0.3 | Vitest with one sample test; Playwright with one test that opens the app and saves a screenshot | ci | 0.1 |
| 0.4 | GitHub Actions workflow running `npm ci`, `npm run check`, `npm run e2e`; upload Playwright screenshots as artifacts | ci | 0.2, 0.3 |
| 0.5 | Labels, milestones, issue and PR templates (13.2, 13.4, 13.5), `CLAUDE.md` with the section 1 rules | docs | — |

Exit criteria:

- [ ] `npm run check` and `npm run e2e` pass locally and in CI.
- [ ] Opening http://localhost:5173 shows a full-screen canvas with the text "Bastion Heroes" in Lilita One.
- [ ] Importing `three` inside `src/sim/` makes `npm run lint` fail (prove it in the PR, then revert).

### M1 — Core greybox

Goal: World 1 Level 1 is playable from start to win or loss, with simple shapes instead of art.

| # | Issue | Area | Depends on |
| --- | --- | --- | --- |
| 1.1 | Sim types (11.3), `rng.ts`, `createSim` with the tick order and an empty level | sim | M0 |
| 1.2 | Zod schemas (11.5) and data for glowshroom\_monk, sparkbolt\_gremlin, iron\_granny and the enemies marked M1 in section 6; `validate-data` script | data | 1.1 |
| 1.3 | Grid, placement, activation delay, cooldowns, shovel, rejected commands (3.x) | sim | 1.2 |
| 1.4 | Essence: starting value, orb spawning, expiry, collection, auto-collect, producer orbs | sim | 1.3 |
| 1.5 | Waves from `LevelDef`: first wave delay, durations, early start after clear, banners as events | sim | 1.2 |
| 1.6 | Combat core: damage formula and multipliers (4.x), `straight` pattern, `melee` bite, blocking, `wall` | sim | 1.3 |
| 1.7 | Last Stand Trap, loss line, win check, star rating | sim | 1.6 |
| 1.8 | Replay format, `hashState`, determinism test (11.6) | sim | 1.7 |
| 1.9 | Greybox renderer: camera (9.1), tile grid, colored capsules for units, spheres for projectiles and orbs, interpolation | render | 1.1 |
| 1.10 | Game loop (11.4), pause, 1×/2× speed | tools | 1.9 |
| 1.11 | Greybox HUD: card bar with cost and cooldown, essence counter, tap card then tap tile, tap orb, shovel | ui | 1.10 |
| 1.12 | Level W1-L01 data and a debug URL `?level=&seed=&tick=` that fast-forwards the sim | data | 1.5 |

Exit criteria:

- [ ] W1-L01 can be won and lost by playing in the browser.
- [ ] Determinism test passes for 3 recorded replays.
- [ ] At least 40 unit tests in `tests/sim/`, covering every rule in section 3 that M1 implements.
- [ ] Desktop browser holds 60 fps with 30 enemies on screen (measured with the debug overlay).

### M2 — Content and balance

Goal: all World 1 gameplay content in greybox, and a bot that proves every level is fair.

| # | Issue | Area | Depends on |
| --- | --- | --- | --- |
| 2.1 | Patterns `lob`, `splash`, `beam`, `diagonal`, `aura`, `producer`, `trap` | sim | M1 |
| 2.2 | Status effects: slow, freeze, burn, poison stacks, stun, knockback, wet | sim | 2.1 |
| 2.3 | Combos: steam, shatter, toxic, chain, with events | sim | 2.2 |
| 2.4 | Merge to ★2 and ★3, star multipliers and ★3 bonuses | sim | 2.1 |
| 2.5 | Data for the remaining M2 defenders (boomcap\_brewer, snowpup\_yeti, rune\_archer, pyro\_fox, frost\_witch) | data | 2.1–2.4 |
| 2.6 | Data and special behaviors for the remaining M2 enemies (section 6) | data | 2.2 |
| 2.7 | Levels W1-L02 to W1-L10 exactly as in section 7 | data | 2.5, 2.6 |
| 2.8 | Scouting screen and Loadout screen with the Recommended button (3.x) | ui | 2.7 |
| 2.9 | Balancing bot (section 16) | tools | 2.7 |
| 2.10 | Balance pass for World 1 until the bot report meets the targets in 16.3 | balance | 2.9 |

Exit criteria:

- [ ] All 8 M2 defenders and all M1/M2 enemies work, each with unit tests.
- [ ] All 10 World 1 levels are playable in the browser.
- [ ] The bot report meets every target in 16.3 for World 1.

### M3 — Art pipeline and look

Goal: World 1 looks like the final game.

| # | Issue | Area | Depends on |
| --- | --- | --- | --- |
| 3.1 | Palette generator and `palette.png` (9.3) | assets | M0 |
| 3.2 | Blender helper library (12.3), preview and portrait scripts (12.8, 12.9) | assets | 3.1 |
| 3.3 | `npm run assets`, optimize and check scripts (12.6, 12.7) | tools | 3.2 |
| 3.4 | Toon material, outline, blob shadows, hit flash, lights (9.2) | render | M1 |
| 3.5 | **Style pilot:** glowshroom\_monk, sparkbolt\_gremlin and gloomling models. Human art review. Iterate until approved. | assets | 3.3, 3.4 |
| 3.6 | Remaining M2 defender models (one issue per 2 characters) | assets | 3.5 approved |
| 3.7 | Remaining M1/M2 enemy models (one issue per 2 characters) | assets | 3.5 approved |
| 3.8 | World 1 environment: tiles, base, portal, edge decor, parallax backdrop | assets | 3.5 approved |
| 3.9 | Procedural animations: spawn, hit, death, merge (9.6) and clip playback from events | render | 3.4 |
| 3.10 | VFX set (9.7) and damage numbers, screen shake, slow motion | render | 3.9 |
| 3.11 | Final HUD styling and card visuals (9.8), fonts, icons | ui | 3.5 approved |
| 3.12 | Placeholder audio (9.9) through `src/platform/audio.ts` | platform | M1 |

Exit criteria:

- [ ] The human approved the style pilot and every model (`needs:art-review` removed).
- [ ] Every M2 character passes the silhouette test (9.5).
- [ ] Playwright screenshots of W1-L05 at tick 900 attached to the milestone's last PR.
- [ ] Draw calls and triangles within 11.7 during the final wave of W1-L10.

### M4 — Meta game

Goal: the full single-player loop: play, earn, open chests, upgrade, progress.

| # | Issue | Area | Depends on |
| --- | --- | --- | --- |
| 4.1 | Save system with schema, migrations and corruption fallback (11.9) | meta | M0 |
| 4.2 | Currencies, level rewards, star records | meta | 4.1 |
| 4.3 | Card levels and upgrades with the cost tables (section 8) | meta | 4.2 |
| 4.4 | Chests: local opening algorithm, odds and pity (section 8); chest opening screen with per-rarity card flip | meta, ui | 4.2 |
| 4.5 | Main menu, world map, result screen with rewards | ui | 4.2 |
| 4.6 | Collection screen (owned, locked, card detail, upgrade button) | ui | 4.3 |
| 4.7 | Daily quests | meta, ui | 4.2 |
| 4.8 | Settings screen (music, SFX, auto-collect, haptics, language) | ui | 4.1 |
| 4.9 | First-time tutorial for W1-L01 to W1-L03: hand pointer, blocked inputs, short text bubbles | ui | 4.5 |

Exit criteria:

- [ ] A new player can go from first launch through W1-L10 with rewards, chests and upgrades, and the save survives a page reload.
- [ ] Unit tests for every cost table, chest odds (100,000 simulated openings within ±0.5% of the published odds) and pity.
- [ ] Migration test from a hand-written version 1 save.

### M5 — Backend and monetization

Goal: server-authoritative economy, purchases, ads and analytics.

| # | Issue | Area | Depends on |
| --- | --- | --- | --- |
| 5.1 | Supabase project, anonymous auth, link to Apple and Google accounts | backend | M4 |
| 5.2 | Cloud save table with row-level security; merge rule: higher progress wins, ask the player on conflict | backend | 5.1 |
| 5.3 | Edge function `open-chest`: server rolls the chest with pity, writes the result, client only displays it | backend | 5.1 |
| 5.4 | RevenueCat products (gem packs, battle pass) and edge function `verify-purchase` | backend, platform | 5.1 |
| 5.5 | Shop screen and battle pass screen (section 8) | ui | 5.4 |
| 5.6 | Optional rewarded ads (double level gold, one free chest speed-up per day) | platform | M4 |
| 5.7 | PostHog events: `level_start`, `level_end` (result, stars, duration), `chest_open`, `upgrade`, `purchase`, `tutorial_step` | platform | M4 |
| 5.8 | Account deletion in settings, privacy policy and terms links | backend, ui | 5.1 |

Exit criteria:

- [ ] Changing gems in local storage has no effect on the server balance (test it).
- [ ] Chest results come only from the server.
- [ ] Sandbox purchases tested by the human on one iOS and one Android device (`needs:device-test`).

### M6 — Mobile builds

Goal: installable, smooth builds on real phones.

| # | Issue | Area | Depends on |
| --- | --- | --- | --- |
| 6.1 | Add Capacitor iOS and Android projects, landscape lock, safe areas, status bar hidden | platform | M5 |
| 6.2 | App icon and splash screen from a 1024 × 1024 source (human approves the icon) | assets | 6.1 |
| 6.3 | Haptics, background pause, audio unlock on first touch | platform | 6.1 |
| 6.4 | Performance pass on the lowest target device: texture sizes, pixel ratio, particle caps | render | 6.1 |
| 6.5 | CI jobs that build the Android debug APK and the iOS simulator build | ci | 6.1 |
| 6.6 | TestFlight and Google Play internal testing upload (human runs the upload with their accounts) | platform | 6.5 |

Exit criteria:

- [ ] 60 fps in W1-L10's final wave on an iPhone 12 and a mid-range Android phone (measured by the human).
- [ ] Cold start to main menu under 5 seconds on those devices.
- [ ] Install size under 150 MB.

### M7 — Content, polish, soft launch

Goal: a complete game ready for a soft launch.

| # | Issue | Area | Depends on |
| --- | --- | --- | --- |
| 7.1 | The 7 M7 defenders (one issue each: data, behavior, model) | data, sim, assets | M3 |
| 7.2 | The M7 enemies (burrower, shadow\_hound) | data, sim, assets | M3 |
| 7.3 | One boss per world, starting with Morvak (section 6) | sim, assets | M3 |
| 7.4 | Worlds 2 to 5: environment, 10 levels each, balance pass with the bot (one issue per world) | data, assets, balance | 7.1–7.3 |
| 7.5 | Final music and SFX (if the human approves a source, section 17) | assets | M3 |
| 7.6 | Localization: all UI strings in `src/ui/i18n/en.json`; second language decided by the human | ui | M4 |
| 7.7 | Store listing: 6 screenshots per platform from Playwright plus device captures, short and long description | docs | M6 |
| 7.8 | Soft launch in 1–2 test countries chosen by the human; dashboard for retention and level funnel | platform | all |

Exit criteria:

- [ ] All 50 campaign levels are winnable with Common and Rare cards according to the bot.
- [ ] Crash-free sessions above 99.5% during the soft launch.
- [ ] The human signs off on the launch.

## 15. Agent prompts

Copy these prompts as they are. Replace only the parts in angle brackets. Always give the agent access to this spec (paste the link or export it to `docs/spec.md` in the repository in M0 and refer to that file).

### 15.1 Game design context (paste before any other prompt)

```text
You are working on "Bastion Heroes", a single-player mobile lane-defense game
in the style of Plants vs. Zombies, with collectible hero cards and a rarity
system, and a chunky, colorful stylized 3D look.

Core loop: the player defends a 5-lane x 9-column lawn-like grid against waves
of shadow creatures ("the Gloom") walking from right to left. Before each level
the player scouts the enemies and picks 6 defender cards. During the level they
spend Essence (collected from orbs) to place defenders on tiles. Placing the
same defender on the same tile merges it to 2 or 3 stars. Damage types (Pierce,
Blast, Arcane) beat different armor types (Light, Armored, Spectral), and status
effects combine into combos (Steam, Shatter, Toxic, Chain). The strategy is in
choosing the right cards for each level and placing them in the right lanes.

Meta: cards have 5 rarities (Common, Rare, Epic, Legendary, Mythic) and levels
1-10, upgraded with shards and gold from chests. Every campaign level must be
winnable with Common and Rare cards only.

Tech: TypeScript, Vite, three.js, Preact, Capacitor. A deterministic 30 Hz
simulation in src/sim is separate from rendering. All game numbers live in
src/data. 3D models are built by Python scripts run in headless Blender.

The full spec is in docs/spec.md. It is the source of truth. Never guess: if
the spec does not answer a question, open a GitHub issue labeled
needs:decision with options, and stop.
```

### 15.2 Lead agent: plan a milestone

```text
Read docs/spec.md sections 1, 13 and 14 completely.
We are starting milestone <M#>.

1. Run: gh issue list --state all --milestone <M#>  and  gh pr list.
2. For every row in the <M#> table of section 14 that has no issue yet,
   create one issue with the template from section 13.4:
   - title: the row text, shortened to under 70 characters
   - labels: type, area (from the row), prio:p1 (prio:p0 if other rows depend on it)
   - milestone: <M#>
   - acceptance criteria: concrete and checkable, taken from the spec sections
     the row refers to, plus "npm run check passes"
   - dependencies: "Depends on #<nr>" using the issue numbers you created
3. Reply with a table: issue number, title, depends on, which issues can run
   in parallel (different areas, no shared files).
Do not write any code.
```

### 15.3 Worker agent: implement one issue

```text
Read docs/spec.md section 1 (rules) and section 13 (workflow) completely.
Your task is GitHub issue #<nr>.

Follow the task loop in section 13.3 exactly:
1. Check the state (open issues, PRs, status:in-progress). If #<nr> is already
   in progress, stop and tell me.
2. Label #<nr> status:in-progress and read the whole issue with comments,
   then read every spec section it references.
3. Create the branch <type>/<nr>-<short-name> from an up-to-date main.
4. Implement only what the issue asks. New work you discover becomes a new issue.
5. Verify as in section 13.7. Run npm run check. Take the required screenshots
   and look at them yourself.
6. Open a PR with the template in section 13.5, "Closes #<nr>", ticked criteria.
7. If CI is green and no needs:* label is on the PR, squash-merge it.
8. Comment on the issue with anything the next person should know.

If you are stuck after 3 attempts, follow section 13.9.
```

### 15.4 M0 kickoff (first prompt ever)

```text
Create a new GitHub repository named bastion-heroes (private) and clone it.
Copy the spec into docs/spec.md.
Then do milestone M0 from section 14, one issue at a time, using the worker
loop in section 13.3. Start with issue 0.5 (labels, milestones, templates)
so the other issues can be tracked properly.
At the end, show me a screenshot of the running app and the green CI run.
```

### 15.5 Sim rule (M1, M2)

```text
Implement issue #<nr> in src/sim.
Rules:
- Read sections 3, 4 and 11.3 before writing code.
- Write the tests first in tests/sim/<topic>.test.ts. Each rule sentence in the
  spec that the issue covers gets at least one test that names the spec section,
  e.g. it('3.4: orb expires after 8 s', ...).
- Timers are integer ticks. Randomness only from state.rng.
- No imports from three, preact, the DOM or src/platform.
- Emit the SimEvents from 11.3 for everything the player can see.
Then make the tests pass and follow the worker loop.
```

### 15.6 Character model (M3, M7)

```text
Create the 3D model for <character_id> as issue #<nr>.

Read: section 5 (or 6) for the character brief, section 9 (art direction,
especially 9.3 budgets, 9.4 colors, 9.5 shape language, 9.6 clips) and
section 12 (pipeline). Look at the approved style pilot scripts in
assets-src/blender/characters/ and match their level of detail.

1. Write assets-src/blender/characters/<character_id>.py using only the helpers
   in assets-src/blender/lib. Use palette swatches for all colors.
2. Build the clips its role needs (12.5).
3. Run npm run assets -- <character_id> until the check script passes.
4. Render the 4 preview images and the portrait.
5. Look at the previews yourself. Compare with the brief: is the silhouette
   readable at 80 px? Are the faction colors right? Is the head 40-50% of the
   height? Fix and re-render until yes.
6. Open the PR with the 4 previews and label it needs:art-review.
Do not merge. The human approves the look.
```

### 15.7 Art review feedback (after the human comments)

```text
The human reviewed the model in PR #<pr> and wrote:
"<paste the feedback>"

Change the script to address every point. Re-render the previews, post them
as a new PR comment with a short list of what you changed per point, and keep
the needs:art-review label. Do not change anything the feedback did not mention.
```

### 15.8 Balance pass (M2, M7)

```text
Issue #<nr>: balance World <n>.
1. Run npm run balance -- --world <n> and read the report.
2. Compare it with the targets in section 16.3.
3. Change only numbers in src/data/ (enemy counts, wave timing, HP, costs).
   Never change sim code in a balance issue.
4. Change one thing at a time, re-run the bot, and keep a table of each change
   and its effect.
5. Stop when all targets are met. Put the before/after report and the change
   table in the PR. If a target cannot be met by numbers alone, open a
   needs:decision issue explaining why.
```

### 15.9 Review a pull request (lead agent)

```text
Review PR #<pr> against its issue and docs/spec.md.
Check, and report each as pass or fail with a reason:
1. It does only what the issue asks (no extra features, no unrelated edits).
2. Every acceptance criterion is really met (run the tests yourself).
3. Import boundaries (10.4) and the "numbers only in src/data" rule hold.
4. Tests exist for every new rule and would fail without the change.
5. Screenshots are attached where 13.7 requires them and match the spec.
6. Code reads clearly: small functions, clear names, no dead code.
If anything fails, request changes with concrete line comments. Otherwise approve.
```

### 15.10 Resume after an interruption

```text
A previous session was working on issue #<nr> and was interrupted.
Read the issue and its latest comments, check out its branch, run
npm run check, and tell me in five lines what is done, what is broken and
what is missing. Then continue with the worker loop from the step it reached.
```

## 16. Testing and balancing bot

### 16.1 Test layers

| Layer | Tool | Location | What it covers | Runs |
| --- | --- | --- | --- | --- |
| Rules | Vitest | `tests/sim/` | Every rule in sections 3 and 4, one test per rule sentence, named after the spec section | Every PR |
| Determinism | Vitest | `tests/sim/replays/` | Golden replays give the same state hash (11.6) | Every PR |
| Data | Vitest + `validate-data` | `tests/data/` | All defs parse; ids unique; every id referenced by a level exists; every defender has a portrait and model in M3+ | Every PR |
| Meta | Vitest | `tests/meta/` | Cost tables, chest odds, pity, save migrations, quest progress | Every PR |
| Balance | Bot | `tools/balance-sim/` | Targets in 16.3 | PRs labeled `area:data` or `type:balance`, and nightly in CI |
| E2E | Playwright | `tests/e2e/` | Flows and screenshots (16.5) | Every PR |
| Device | Human | — | Feel, performance, purchases, haptics | Every milestone end |

Coverage target for `src/sim/` and `src/meta/`: at least 85% of lines. Do not chase coverage in `src/render/` and `src/ui/`; use screenshots there.

### 16.2 The balancing bot

`npm run balance -- --world <n> [--level <id>] [--runs 50]` plays every level of a world headless with the real sim and several bot players. It finishes World 1 (10 levels × 5 bots × 50 runs) in under 2 minutes on a laptop; use worker threads if needed.

The bot sends commands through `sim.enqueue` like a real player. It decides every 15 ticks (0.5 s) with this fixed priority list. The first rule that produces a valid command wins; then wait for the next decision point.

1. Collect every orb on the field.
2. **Emergency:** if an enemy is within 2 tiles of the base line in a lane with no living attacker, place the cheapest affordable attacker in column 0 of that lane. If nothing is affordable and the lane has a defender, do nothing (the trap will fire).
3. **Economy:** while the time is under 60 s and the bot has fewer than its target producers (`producerTarget`, default 5), place a producer in column 0 of the lane with the fewest producers, then column 1.
4. **Coverage:** for every lane that has an enemy now or is listed in the level's next wave, if the lane's total attacker damage per second is lower than the incoming enemy health divided by the time those enemies need to reach column 3, place the best attacker for that lane's enemy armor (highest multiplier from 4.1, then cheapest) in the frontmost free column from 1 to 4.
5. **Walls:** if a lane has an enemy with more than 600 health or a group of 4 or more enemies, and no wall, place a wall in column 6.
6. **Merge:** if 1.5× the cost of a merge is affordable, merge the attacker in the lane with the most enemy health.
7. Otherwise wait.

Bot variants:

| Bot | Loadout | Purpose |
| --- | --- | --- |
| `idle` | Any | Never acts. Must lose every level after L01. Proves the levels are not free wins. |
| `random` | 6 random owned cards | Places a random affordable card on a random free tile every 3 s. Measures how much strategy matters. |
| `commons` | Only Common and Rare cards at the recommended card level (section 8) | Proves the fairness rule. |
| `recommended` | The Recommended button's loadout at the recommended card level | The normal player experience. |
| `whale` | The best Epic, Legendary and Mythic cards at level 10 | Checks that paying never trivializes later worlds. |

Each run varies the bot's own decisions with a run seed (tie-breaks between equal choices), while the level seed stays fixed (10000 + level number, section 7).

### 16.3 Balance targets

| Metric | Target |
| --- | --- |
| `idle` wins | 0% on every level except W1-L01 (tutorial) |
| `random` win rate | at most 30% from W1-L04 onwards |
| `commons` win rate | at least 90% on L01–L05 of each world, at least 70% on L06–L10 |
| `recommended` win rate | at least 95% on every level |
| `recommended` 3-star rate | 40–80% (some challenge left for stars) |
| `whale` average level time | at least 70% of the `recommended` average (paying speeds you up, it does not skip the game) |
| Level duration (`recommended`) | 3:00–5:00 minutes, final wave included |
| Essence spent | `recommended` spends at least 70% of all Essence it collects (if not, costs are too low) |
| Trap usage | `recommended` triggers the trap in fewer than 25% of wins |
| Card diversity | no single defender appears in more than 80% of `recommended` wins in a world, except producers |

### 16.4 Report format

The bot writes `balance-report/<world>.md` and `balance-report/<world>.json`. The markdown table has one row per level and these columns: level, bot, runs, win %, 3-star %, average duration, average Essence spent %, trap %, worst failing target. Rows that miss a target are marked with ❌. Paste the markdown table into every balance PR.

### 16.5 End-to-end tests

Playwright runs against `npm run build && npx vite preview` in Chromium with a 844 × 390 viewport and mobile emulation.

| Test | Steps | Checks |
| --- | --- | --- |
| `boot.spec.ts` | Open the app | Main menu visible within 5 s, no console errors |
| `first-level.spec.ts` | New save, start W1-L01, follow the tutorial taps | The level starts, a card can be placed, Essence goes down by its cost |
| `win-flow.spec.ts` | Open `?level=w1-l01&seed=10001&autoplay=recommended` | Result screen shows a win, gold increases, save persists after reload |
| `loadout.spec.ts` | Open Scouting for W1-L05, go to Loadout, press Recommended | 6 cards selected, Start enabled |
| `chest.spec.ts` | Give a test save a Wooden chest, open it | Card flip animation plays, cards are added to the collection |
| `screens.spec.ts` | Visit every screen | One screenshot per screen in `test-results/screens/` |

The `autoplay` URL parameter runs the `recommended` bot inside the real game, so a full visual playthrough can be recorded. It exists only in dev and test builds.

### 16.6 Performance checks

- `?perf=1` shows fps, frame time, draw calls and triangles.
- A Playwright test runs W1-L10 with `autoplay` at 1× speed and records the average and 1% low fps. CI only reports the numbers (CI machines vary); the human checks them on devices at the end of M3 and M6.
- JavaScript bundle (gzip) under 1.5 MB, excluding models and audio. CI fails if it grows by more than 10% in one PR.

## 17. Out of scope and open decisions

### 17.1 Out of scope for version 1

Do not build any of these, even partly. If a task seems to need one, open a `needs:decision` issue.

- PvP, multiplayer, leaderboards, guilds, chat or friends.
- Portrait orientation.
- Endless mode, level editor, user-generated content.
- Energy or stamina systems that block playing.
- Loot boxes bought directly with real money (chests are bought with gems; gems are bought with money; odds are always shown).
- Any form of tracking beyond the PostHog events in M5. No ad personalization without consent.
- Web release as a public product (the browser build is for development and testing).

### 17.2 Things only the human can do

| Task | When | Notes |
| --- | --- | --- |
| Apple Developer Program account | Before M6 | About $99 per year |
| Google Play Console account | Before M6 | One-time fee of about $25 |
| Supabase, RevenueCat, PostHog and AdMob accounts; put keys in `.env.local` | Before M5 | Agents never see live keys in chat |
| Approve the art style pilot and every model | M3 onwards | In the PR, with written feedback |
| Play every milestone build on real devices | End of M3, M5, M6, M7 | Report feel issues as issues |
| Set real-money prices per product | M5 | In App Store Connect and Google Play Console |
| Privacy policy, terms of service, age rating questionnaires | M5–M6 | Consider legal advice for loot-box rules in your target countries |
| Trademark check of the final name | Before M7 | Search the stores and trademark databases |
| Upload builds and submit for review | M6, M7 |  |

### 17.3 Open decisions

Each of these becomes a `needs:decision` issue when its milestone starts. The default is what agents use until the human decides.

| Decision | Options | Default | Needed by |
| --- | --- | --- | --- |
| Final game name | "Bastion Heroes" or a new name | Bastion Heroes (working title) | M7 |
| Model source for Epic and above | Scripted Blender only, or AI image-to-3D with cleanup (12.10) | Scripted Blender only | End of M3 style pilot |
| Music and SFX source | Kenney CC0 packs, a paid asset store pack, or a commissioned composer | Kenney CC0 | M7 |
| Rewarded ads | On (5.6) or off entirely | On, never forced | M5 |
| Battle pass | Free + premium track, or no battle pass in version 1 | Free + premium | M5 |
| Second language | German, Spanish, French or none | None until decided | M7 |
| Soft launch countries | For example Philippines, Canada, Nordic countries | Not set | M7 |
| Minimum devices | iPhone 12 / Android 10 (section 2), or lower | As in section 2 | M6 |
