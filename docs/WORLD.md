# HORDES — the world: sites, the map, EXPLORE (M5b, first slice)

Code: `src/sites.js` (placement and rules), `src/sites_art.js` (sprites, rings, curse card, waypoint marker,
map icons), `src/explore.js` (the EXPLORE pilot and the waypoint goal), the "M5b SITES, MAP WAYPOINT,
EXPLORE" block in `src/main.js`, the site-goal branch in `src/controllers.js`, the map in `src/render.js`
(`drawAtlasMap`). Tests: `test/test_sites.mjs`. Screenshots: `docs/art/sites/` (`tools/capture_sites.mjs`).

## Sites

Each stage places its sites once per run, as a pure function of the world seed and the stage
(`placeSites(seed, stage, buildingRects, rim)`). Every site stands at least 26 px clear of every building,
170 px from the hero's start (the view's centre, where every spawn clearance is measured), 90 px inside the rim,
and has a walkable route from the spawn (the pilot's planner).
Major sites are at least 260 px apart; brazier clusters at least 160 px from anything. Drops roll on the
sites' own random stream, so the spawn and draft streams are unchanged.

| Site | What you do | What you get | Per stage |
|---|---|---|---|
| Charge shrine | Stand in its ring (34 px) for 4 s. Enemies keep coming; leaving pauses the charge. | Pick 1 of 3 blessings (the intermission pool). Free. | 3 |
| Boss altar | Step on it while no boss is up, on waves 1-4 (not on the maw's wave). Only a deliberate visit counts: steering, MANUAL, or the pilot sent there. A quiet altar's toast says why; on the maw's wave a waypoint on it comes off. | The wave boss arrives now; beating it pays one extra chest. | 1 |
| Braziers / urns | Break them: any shot within 10 px, or walk into one. | 2-5 gold; 10% a potion; 3% a magnet pull. | 5 clusters of 3-4 (about 16) |
| Fountain | Stand in it for 1 s while hurt. | Heals 35% of max HP, once. | 2 |
| Cursed statue | Touch it on purpose (steering, MANUAL, or a waypoint on it), before the wave's boss is down. The card on approach (80 px) states the deal. | Curse for the rest of the wave; the reward when the wave is cleared. | 1 |

The statue's deals: "Enemies +50% speed" for "A joker", or "Enemies +60% HP" for "Two chests".
AUTO walking over the altar or the statue by accident does nothing.
The curse applies to every live enemy and every new spawn (bosses excluded). It lifts, and the reward pays, when
the wave is cleared: when its boss falls, or the first of two on a double wave (the altar's extra chest pays at
the same moment). Once the boss is down and the portal is open the statue takes no deal: its card's last line
reads "TOUCH IT NEXT WAVE" (on the maw's wave "TOO LATE: THE BOSS IS DOWN") instead of "TOUCH TO ACCEPT". No curse
is carried into the maw.

Looks: unused sites are lit; an active shrine shows its charge ring and a meter (gold when hands-on), a taken
statue glows green; spent sites turn grey. Sounds: shrine done `levelup`, altar and curse `warning`, break
`hit`, fountain `potion`; sparks and a small shake on the bigger ones. Off-screen sites are culled; sprites
are baked once per palette in the sprite cache.

The old pay-gold shrine (`src/shrines.js`, its art and its tests) is gone: the charge shrine replaces it.

## The map and the waypoint

M opens the map (the MAP button on touch). It veils the field and shows:

- fog: only the cells you have seen are lit (the atlas visited grid);
- sites you have reached (within 120 px) with their kind and state (spent ones grey);
- "?" for sites the radar has shown (within 330 px) but you have not reached;
- the hero (white cross), the open portal (violet) and live bosses (red);
- a key on the left and the line "TAP A SITE: WAYPOINT".

Tap or click a site ("?" included) to set the waypoint; tap the same site again, or CLEAR WAYPOINT, to
remove it. The waypoint shows as a gold flag over the site, or as a gold arrow on the view's edge when the
site is off-screen. It clears itself once the site is used. On AUTO and EXPLORE the pilot walks to it (it
still kites first when threatened; an open portal still comes first); on MANUAL the arrow guides you.
If the pilot cannot make progress toward it, it is dropped with "NO PATH TO THE WAYPOINT".
In help mode a tap on the open map explains the icon under it and sets nothing (a "?" stays a "?").
Tap targets (`CONFIG.ATLAS`): a tap picks the nearest site icon within 28 view px (`TAP_R`), and CLEAR
WAYPOINT's target is 56 view px tall round its 14 px plate (`CLEAR_HIT_H`); both are 45 CSS px on a 390 px
wide phone, over the 44 px touch floor (`test/test_map_taps.mjs`).

The radar shows every site in reach: reached ones in their kind's colour, the rest as a blinking white ping.

## EXPLORE

The pilot cycle (O key, pilot button) is AUTO -> EXPLORE -> MANUAL. AUTO MOVE stays on the Advanced page,
whose PILOT row cycles AUTO ALL -> AUTO MOVE -> EXPLORE -> MANUAL. The choice is stored as before.

EXPLORE fights exactly like AUTO (and casts and drinks like AUTO ALL). When the field is calm it walks to the
nearest site worth using, with the same route planner around buildings (the rules as revised by the career fix
below; `EXPLORE` in `src/explore.js` holds the numbers):

- no detour at all while a boss or the herald is alive;
- behind the curve (level below 4 + 4 x wave): calm = HP at or above 60%, no live enemy within 160 px and at
  most 3 within 300 px, and no more than 4 XP gems within 80 px (it banks them first); a site may be at most
  560 - 80 x (wave - 1) px away (never less than 300);
- ahead of the curve: calm = HP at or above half and no live enemy within 110 px; reach 900 px;
- shrines: always (it stands inside the ring);
- braziers: always (it walks into them; its shots usually break them first);
- fountains: only below 70% HP (it stands inside);
- the boss altar: only when HP is at least 80%, the hero's level is at least 4 + 4 x wave, and at least 40%
  of the wave has passed, and only when the altar would answer (waves 1-4, no boss up, no portal coming,
  more than 3 s left);
- the walled yard (a dead end): only with no live enemy within 340 px (140 px ahead of the curve);
- never the cursed statue;
- a site it makes no progress toward, or holds as its goal for 30 s in all without using it, is skipped for
  the run.

When a threat comes inside its kite line it flees as AUTO does, and goes back to the site once calm.
`node tools/progression_sim.mjs --pilot EXPLORE ...` runs the simulator on EXPLORE.

## Hands-on

Steering in the last 2 s (any move key, the stick, or a held drag on AUTO) counts as hands-on:

- the shrine charges 40% faster (4 s becomes about 2.9 s);
- a brazier drops 50% more: gold x1.5, potion 15%, magnet 4.5%.

A small gold "HANDS-ON" pop marks each interaction that got the bonus, once per interaction.

## AUTO vs EXPLORE

Simulator, speed 8x, stats-first shop, random draft, BALANCED stance, KNIGHT. Same seeds for every arm.
BEFORE = the tree just before this slice (`a1860d6`, pay shrines, no sites), played on AUTO.
Cells: median [quartiles]; "mean ±" is the 95% interval of the mean. Sites = sites used per run.

Fixed builds, k = 24 per budget (seeds 5001-5024):

| Budget | Arm | n | Survival s | mean | Gold/run | mean | Sites used (shrines) |
|---|---|---|---|---|---|---|---|
| 5,000 | BEFORE (AUTO) | 24 | 241 [174-391] | 287 ±56 | 1296 [721-2111] | 1458 ±375 | - |
| 5,000 | AUTO | 24 | 282 [159-425] | 299 ±55 | 1407 [660-2288] | 1541 ±343 | 4 [2-7] (0.1) |
| 5,000 | EXPLORE | 24 | 293 [185-474] | 320 ±62 | 1579 [699-2348] | 1590 ±387 | 17 [14-21] (2.2) |
| 20,000 | BEFORE (AUTO) | 24 | 651 [517-727] | 611 ±64 | 3543 [2791-5000] | 3828 ±617 | - |
| 20,000 | AUTO | 24 | 628 [512-720] | 606 ±62 | 3652 [2818-5014] | 3929 ±619 | 9 [7-11] (0.3) |
| 20,000 | EXPLORE | 24 | 679 [544-760] | 637 ±74 | 4374 [2843-5526] | 4135 ±721 | 21 [20-22] (2.8) |

Careers, 15 runs x 3 seeds (1001-1003), n = 45 runs per arm:

| Arm | Survival s per run | Gold per run | mean | Runs 11-15 survival | Runs 11-15 gold | Sites used per run |
|---|---|---|---|---|---|---|
| BEFORE (AUTO) | 126 [101-289] | 504 [368-1553] | 1009 ±284 | 332 [208-483] | 1710 [1097-2518] | - |
| AUTO | 129 [84-254] | 551 [398-1428] | 1016 ±256 | 327 [210-476] | 2116 [1160-2428] | 2 [0-5] |
| EXPLORE | 126 [79-221] | 478 [353-948] | 946 ±309 | 386 [127-509] | 1746 [516-2765] | 8 [4-11] |

Reading: AUTO is unchanged within the noise (means within 4% of BEFORE, intervals overlapping heavily);
it now breaks the braziers it walks past. EXPLORE is a modest gain on fixed builds (+5 to +7% survival,
+3 to +5% gold on the means, inside the intervals) and no measurable gain over a career; it uses most of the
map's sites, including about 2.5 of the 3 shrines and the altar in a quarter to two thirds of runs.
A first k = 12 pass (seeds 1001-1012) was noisier (EXPLORE at 5,000: 324 ±97 vs AUTO 212 ±72); the k = 24
pass above is the one to quote. These runs were made just before the altar and the statue stopped firing
on an accidental AUTO touch (AUTO used the altar in 8-13% of runs); that change can only make AUTO's
numbers move toward BEFORE. The simulator's pilot plays worse than a person: these are floors.

## Landscape: plateaus, ramps, bridges, drops (M5b, second slice)

Code: `src/terrain.js` (layouts, the grid, movement rule, flow fields), `src/terrain_art.js` (art), hooks in
`src/main.js` (hero and enemy move seams, spawn bias, flyer weight, `heroHitMult`), `src/controllers.js`
(pilot routes and kiting), `src/sites.js` and `src/stage_buildings.js` (placement keeps to flat ground).
Tests: `test/test_terrain.mjs`. Screenshots: `docs/art/terrain/` (`tools/capture_terrain.mjs`).

**One source.** `terrainFor(seed, stage)` builds the layout once per run: the stage's authored plateaus, ramps,
bridges and drop edges, under one of four mirror flips and a jitter of up to 48 px picked by the seed (the
first placement that keeps every piece inside the rules wins). It is rasterized to a 24 px grid (75 x 75
cells). Movement, enemy routing, the pilot, site and building placement and the art all read that grid.

**Tiers.** 0 ground, 1 ramp, 2 plateau top, 3 upper ramp, 4 upper top. A step into a neighbouring cell is legal
when the tier changes by at most 1, or when it goes down from a cell marked as a drop edge. A diagonal step is
legal only when both paths round the corner are. A bridge cell has two floors: tier 2 for a mover arriving
from a ramp or a top, tier 0 for one walking underneath. Everything else is a cliff face and blocks; a
blocked move slides along the face.

**Kept open.** No feature within 340 px of (120, 68) (the origin, the run-start spot, the first-run potion
and chest), none within 40 px of the first camera view, none within 110 px of the rim. Buildings keep 20 px
off every feature; sites stand on a flat cell whose 3 x 3 block shares one tier (no ramp, no bridge, no
edge), reachable from the spawn. The boss altar takes the crown (the highest plateau, beside the landmark)
when that spot fits: 21 of 24 stage x seed cases tested.

**Rules and numbers** (`CONFIG.TERRAIN`):

| Rule | Value |
|---|---|
| Who is blocked by cliff faces | the hero and every walking enemy |
| Who ignores tiers | flyers (SHRIKE), every projectile (ranged enemies shoot up and down) |
| Big bosses | cross any face at 40% of the step (they climb, slowly; no ledge cheese) |
| High ground | standing on tier 2 or more |
| Hero range on high ground | x1.15 (engagement radius) |
| Hero damage on high ground | x1.15 against ground enemies two tiers or more below (not flyers, not same level) |
| Radar reach on high ground | x1.5 (the existing `RELIEF.VISION_MULT`) |
| Spawn bias on high ground | the spawn angle leans 35% toward the nearest ramp (the existing exposure bias) |
| Flyers on high ground | SHRIKE weight x3 while the hero stands high (from the horde wave on) |
| Natural relief | with a layout, the old height field no longer draws or grades speed (one source) |

Spawns land wherever the ring falls, plateaus included, so elites and the herald can arrive on high ground.

**Enemy routing.** A walking enemy that is not in the hero's region (same-tier connected cells), or that a
cliff blocked in the last second, follows one shared flow field to the hero: a reverse Dijkstra over the
legal-move graph (orthogonal cost 2, diagonal 3), rebuilt only when the hero changes cell and at most every
0.25 s. Each enemy then reads one array entry. Cost: about 1.3-1.5 ms for the field plus 1,000 reads
(`test_terrain` perf check, bound 25 ms); in a play frame most enemies share the hero's region and skip it.

**Pilot.** Every pilot goal (portal, run chest, site goal and waypoints, gems, patrol point) first asks whether
the straight walk is legal cell by cell (an exact grid walk). If not, it follows a flow field from the goal
(up to four kept per pilot, building cells masked). Kiting checks the flee line: a line a cliff blocks turns
to the nearest open direction (up to 115 degrees either side), then to the way down; on high ground more than
72 px from a way down, it leans toward the nearest ramp or drop edge, so it never kites into a dead end.

**Look.** Plateau tops in the stage's palette with dithered material patches and a few quiet pebbles, a 1 px
dark outline, a lit north and west lip, a dark east edge, a 14 px south cliff face in the stage's own rock
(earth with roots, basalt columns, ice with drips, strata, crystal veins, ember cracks) and a drop shadow on
the low ground. Ramps are shadowed risers with lit treads and outlined side walls. Bridges have a plank deck,
rails and posts, an outline and a shadow (world art makeover, docs/ART_PASS.md). Drop edges carry a dashed lit lip and outward chevrons.
Painted once per run into 240 px chunk canvases (only chunks with a feature); a frame blits the visible
ones. Landmarks go through the sprite cache.

**Per stage** (every layout is mirrored and nudged per seed):

| Stage | Layout | Landmark |
|---|---|---|
| Verdant Hollow | two small grassy knolls with long ramps (one drop side each); the rest is open meadow | ruined watchtower |
| Ashen Waste | four tall basalt blocks, three joined by two bridges; the west block has an upper tier | basalt arch (upper tier) |
| Snowfield | a long two-step north terrace with a crest, and an east terrace you can slide off | frozen bell tower (crest) |
| Blood Rust | seven small mesas, each with one ramp and one drop side | rust spire |
| Bone Desert | one big mesa ringed by four ramps, a crown tier with two ramps; one small outlier | bone gate (crown) |
| Void Reach | four islands strung on three bridges (one ramp down), and a lone island | void obelisk |
| Cinder Maw | three long volcanic spines with ramps at their ends and drop sides | cinder forge |
| Whiteout | two broad white hills with wide ramps and soft drop sides; a crest on the west hill | snow cairn (crest) |

**Measured** (`tools/progression_sim.mjs --stage MIX`: each run plays stage = seed mod 8, so every stage gets
3 of the 24 fixed-build runs). Speed 8x, stats-first shop, random draft, BALANCED, KNIGHT, same seeds per arm.
BEFORE = `6902628` (no layouts), AFTER = this slice. Cells: median [quartiles]; "mean ±" is the 95% interval of
the mean. Stall = a 10 s window with a goal up (portal, site goal or waypoint, run chest) and no 8 px of
progress toward it. High = share of the run on high ground.

Fixed builds, k = 24 per budget (seeds 5001-5024):

| Budget | Arm | n | Survival s | mean | Gold/run | mean | Stall windows (runs) | High | Stuck |
|---|---|---|---|---|---|---|---|---|---|
| 5000 | BEFORE AUTO | 24 | 186 [107-288] | 214 Â±56 | 818 [447-1527] | 1042 Â±273 | 0 (0 runs) | - | 0 |
| 5000 | AFTER AUTO | 24 | 236 [128-409] | 262 Â±64 | 951 [516-2003] | 1323 Â±396 | 0 (0 runs) | 0.0% [0.0-0.0] | 0 |
| 5000 | BEFORE EXPLORE | 24 | 132 [125-233] | 210 Â±61 | 623 [472-1160] | 1055 Â±447 | 0 (0 runs) | - | 0 |
| 5000 | AFTER EXPLORE | 24 | 163 [122-253] | 222 Â±72 | 642 [419-1548] | 1146 Â±510 | 6 (2 runs) | 0.0% [0.0-6.0] | 0 |
| 20000 | BEFORE AUTO | 24 | 588 [290-690] | 531 Â±90 | 3650 [1561-5261] | 3439 Â±769 | 0 (0 runs) | - | 0 |
| 20000 | AFTER AUTO | 24 | 640 [461-721] | 584 Â±76 | 4406 [2940-5468] | 4320 Â±825 | 0 (0 runs) | 0.1% [0.0-2.0] | 0 |
| 20000 | BEFORE EXPLORE | 24 | 626 [368-708] | 561 Â±90 | 3935 [1460-5452] | 3769 Â±810 | 18 (1 runs) | - | 0 |
| 20000 | AFTER EXPLORE | 24 | 655 [489-772] | 628 Â±83 | 3865 [2390-5821] | 4097 Â±821 | 9 (3 runs) | 2.5% [0.8-4.9] | 0 |

Careers, 15 runs x 3 seeds (1001-1003), AUTO, n = 45 runs per arm:

| Arm | n | Survival s per run | Gold per run | mean | Runs 11-15 survival | Runs 11-15 gold | Stall windows | High |
|---|---|---|---|---|---|---|---|---|
| BEFORE AUTO | 45 | 121 [51-256] | 475 [324-1403] | 1098 Â±366 | 267 [126-472] | 1479 [548-2799] | 0 | - |
| AFTER AUTO | 45 | 117 [66-188] | 454 [338-907] | 921 Â±358 | 131 [122-254] | 564 [463-1653] | 0 | 0.0% |

Reading: AUTO never stalled after the fix below (0 windows in 96 fixed-build and 45 career runs, and no run
was stuck or capped). EXPLORE shows a few stall windows, as it did before (its site goals near a fight are
given up and retaken; no run stuck). The first AFTER pass found one real AUTO stall: a portal parked across a
cliff corner from a pilot on a ramp, where the line check passed but the frame steps cut through the corner
(123 windows, a run stuck at wave 4). Line checks are now an exact grid walk and diagonals must be legal both
ways round the corner; `test_terrain` pins that case and a portal above a cliff on every stage.
Fixed builds: survival and gold move within the intervals; the means lean up (AUTO +10 to +22% survival).
Careers: the per-run means overlap (gold 921 ±358 vs 1098 ±366), but runs 11-15 came out lower (survival
131 vs 267 median, n = 18 each, more deaths to the wave-1 GRAVELMAW at about 125 s: 5 vs 3). That sample is
small and each run draws a different stage; a larger career pass (6+ seeds per arm) should confirm or clear
it before release. The pilot spends little time high (median 0-2.5% of a run): it climbs for goals and gems,
and kiting leans toward the way down.

## Quests, secrets, the vault and the yard (M5b, third slice)

Code: `src/vault.js` (vault, key, yard, lever), `src/secrets.js` (cracked walls, the mimic, glyphs, the shelf
list), `src/quests.js` (quests and chains), `src/world_save.js` (the saved block), `src/world_art.js` (art, HUD
tracker, map marks), the "M5b SLICE 3" block in `src/main.js`, `src/explore.js` (pilot goals), `src/chests.js`
(the mimic and band chests), `src/stage_buildings.js` (`setExtraRects`: the yard's walls join the building
footprints). Tests: `test/test_world_quests.mjs`. Screenshots: `docs/art/quests/` (`tools/capture_quests.mjs`).

One sentence each:

- **Vault and key.** One vault per stage, on a plateau top in 22 of 24 stage x seed cases; after 2:30 the next
  elite carries the key (a gold key over its head and a gold ring, a key on the map once seen);
  its key drops on the kill (kept inside the floor the hero can reach when the carrier dies past the rim) and
  drifts to a hero within 150 px; touching the vault with it pays what the vault's
  card says on approach (90 px): A JOKER or A RARE CHEST.
- **Lever and yard.** One walled yard per stage (104 x 88 px, 8 px stone walls, a 32 px iron gate facing the
  start) with a chest inside; the lever stands at least 480 px away; pulling it opens the gate for the run
  ("THE GATE OPENS": toast, shake, the bars rise, the map's dotted link turns green). The walls are building
  footprints, so movement, enemies and the pilot's planner treat the shut gate as a wall and route in once open.
  Walkers slide on the walls and walk round the yard (`yardWay` in `src/vault.js`); they come in through the
  open gate only while the hero is inside, and one left inside walks out through it; big bosses and flyers cross
  the walls; a walker spawned or knocked inside the shut yard walks out. The open yard is a dead end: a pilot
  that has to flee inside it walks out through the gate, and a flee line never turns back into it. AUTO leaves XP gems inside the shut yard alone. The pilot's cell mask (`pilotBlock`) grows a
  yard wall half a cell across and not at all along its length, so the walls always seal and the open gate
  always holds a cell. Tests: `test/test_yard_paths.mjs`.
- **Cracked walls.** Up to 2 per stage on the south face of a solid building, 200 px or more from the start:
  14 weapon hits (each shot counts once; standing at it chips 2 a second) open a niche with 12-24 gold and a
  potion, and a joker offer 20% of the time. Steering counts each hit double.
- **The mimic.** 0.4% of opened chests (one per run, never before 3:00) are mimics: they look exactly like a
  chest; opening one wakes a 3x HP elite 40 px from the hero; killing it pays a rare-band chest, and so does a
  wave clear or the maw's arrival that takes it off the field alive. (A first cut at
  1.5% after 1:00 and 6x HP put a mimic in a third of career runs and was the top early killer; see below.) Its hint shows only after the first.
- **Glyphs.** One per stage, at least 520 px from the start and 280 px from any major site; it is not on the map;
  it is noticed at 80 px, or at 150 px while steering (a faint shimmer). Found glyphs save by stage; all eight
  put the MIMIC FEAST joker in the pool (while it is held, 40% of chests bite and each mimic pays a rare chest). It was a pre-run modifier until the modifiers were removed on 2026-10-03.
- **Quests.** Three per run, picked for you: the open quest-chain steps first, then random ones; the run setup's
  QUESTS card opens the board, where each can be swapped once (START is the first card, so Enter plays the three
  as rolled; Esc goes back to the run setup). A tracker under the clock lists them. Gold quests pay at the run's
  settlement (their own "quests" part on the end screen), multiplied by the prestige gold multiplier like other
  run income; the board and the done toast show the multiplied amount. The two joker quests pay a joker offer the
  moment they are done.
- **Quest chains.** Saved across runs: finishing a chain's current step quest in a run advances it one step; the
  last step grants a character through the same `grantCharacter` the achievements use. Both characters can also
  come from a trophy or the shop: when the chain's character is already owned as its last step is done, that step
  pays a joker offer on the spot on top of its gold; the board ("pays 100g and a joker"), the SECRETS shelf
  ("pays a joker (paladin is yours)") and the end line say so.
- **The map.** Plateau tops, upper tiers, ramps and bridges are drawn inside the lifted fog; vault, lever and yard
  have their own icons and key rows; a dotted line links the lever to the yard once both are known; the key
  carrier (once seen) and a dropped key show as gold keys; secrets show only once found.
- **SECRETS shelf** (PROGRESS): crack, mimic, vault, yard and all eight glyphs; unfound ones are "? ? ?" with a
  one-line hint; the two chains close the list with their next step and what they unlock.

| Quest | Event | Pays |
|---|---|---|
| Charge 2 shrines | shrine charged | 80 gold |
| Break 10 braziers | brazier broken | 60 gold |
| Open the vault | vault opened | a joker |
| Loot the walled yard | yard chest taken | 100 gold |
| Kill the key carrier | carrier killed | 80 gold |
| Kill an elite from high ground | elite killed while the hero stands high | 90 gold |
| Beat the wave-1 boss by 2:30 | wave-1 boss down at 150 s or less | 100 gold |
| Fuse a weapon | a fusion | a joker |
| Kill 5 elites | elite killed | 70 gold |
| Drink from a fountain | fountain used | 50 gold |
| Break a cracked wall | crack broken | 90 gold |
| Reach wave 3 | a wave starts | 70 gold |

| Chain | Steps (one per run) | Unlocks |
|---|---|---|
| WARDEN'S PATH | kill the key carrier, open the vault, loot the walled yard | PALADIN |
| SEEKER'S ROAD | break 10 braziers, break a cracked wall, charge 2 shrines, beat the wave-1 boss by 2:30 | ROGUE |

**EXPLORE.** It takes the lever and the open yard like any site, the vault once it holds the key, the dropped
key and the secrets it has noticed when the field is calm (the rules in "EXPLORE" above), and hunts the key
carrier (seen, within reach) only on a calm field, at 70% HP or more, with no boss alive and a level of at least
4 + 4 x wave. AUTO opens the vault only by walking over it with the key.

**Hands-on.** Cracks break twice as fast and glyphs are noticed nearly twice as far (and shimmer) while steering.

**Save (schema 13).** `profile.world = { glyphs: [stage ids], secrets: { id: true }, chains: { id: step },
questsDone }`, repaired on load (`sanitizeWorld`: duplicate or non-string glyphs dropped, only `true` flags kept,
steps floored and capped at 99). Migration 12 -> 13 adds an empty block and changes nothing else. Fixture
`test/fixtures/profile_v12_written_by_v12_build.json` was written by the build before the bump.

**Measured** (`tools/progression_sim.mjs --stage MIX`, read by `tools/world_sim_table.mjs`). Speed 8x, stats-first
shop, random draft, BALANCED, KNIGHT, same seeds per arm. BEFORE = `f9f56f9` (slice 2), AFTER = this slice with the
mimic at 0.4% after 3:00. Cells: median [quartiles]; mean ±95% interval. Quest gold share = quest gold / run gold.
Stall = a 10 s window with a goal up and no 8 px of progress.

Fixed builds, k = 24 per budget (seeds 5001-5024):

| group | arm | n | survival s | mean | gold/run | mean | quests/run | quest gold share | vault opens | yard looted | cracks/run | stall windows | stuck |  |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 5000 | BEFORE AUTO | 24 | 229 [129-399] | 254 ±62 | 951 [516-2003] | 1295 ±394 | - | - | - | - | - | 0 (0 runs) | 0 |  |
| 20000 | BEFORE AUTO | 24 | 621 [475-721] | 582 ±75 | 4256 [2951-5468] | 4297 ±809 | - | - | - | - | - | 0 (0 runs) | 0 |  |
| 5000 | AFTER AUTO | 24 | 198 [128-292] | 224 ±51 | 905 [570-1502] | 1174 ±327 | 0.96 | 7% | 0% | 0% | 0.25 | 0 (0 runs) | 0 |  |
| 20000 | AFTER AUTO | 24 | 644 [417-730] | 568 ±85 | 4234 [2154-6502] | 4242 ±987 | 1.38 | 3% | 8% | 0% | 0.50 | 0 (0 runs) | 0 |  |
| 5000 | BEFORE EXPLORE | 24 | 136 [119-234] | 203 ±68 | 524 [387-1201] | 1089 ±512 | - | - | - | - | - | 6 (2 runs) | 0 |  |
| 20000 | BEFORE EXPLORE | 24 | 655 [490-772] | 617 ±90 | 3865 [2390-5821] | 4054 ±848 | - | - | - | - | - | 9 (3 runs) | 0 |  |
| 5000 | AFTER EXPLORE | 24 | 131 [111-310] | 205 ±57 | 601 [343-1713] | 1131 ±383 | 0.83 | 6% | 25% | 8% | 0.67 | 0 (0 runs) | 0 |  |
| 20000 | AFTER EXPLORE | 24 | 604 [484-712] | 582 ±73 | 3284 [2199-6394] | 4181 ±966 | 1.67 | 3% | 75% | 83% | 1.38 | 8 (1 runs) | 0 |  |

Careers, 15 runs x 8 seeds (1001-1008), n = 120 runs per arm:

| group | arm | n | survival s | mean | gold/run | mean | quests/run | quest gold share | vault opens | yard looted | cracks/run | stall windows | stuck | runs 11-15 surv / gold |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| career | BEFORE AUTO | 120 | 116 [65-204] | 154 ±26 | 442 [335-970] | 873 ±176 | - | - | - | - | - | 0 (0 runs) | 0 | 208 [129-358] / 1111 [493-2388] |
| career | AFTER AUTO | 120 | 117 [65-224] | 157 ±23 | 458 [338-1257] | 896 ±152 | 0.28 | 2% | 2% | 0% | 0.08 | 0 (0 runs) | 0 | 246 [178-390] / 1469 [982-2531] |
| career | BEFORE EXPLORE | 120 | 105 [67-222] | 179 ±32 | 436 [335-1078] | 1048 ±237 | - | - | - | - | - | 0 (0 runs) | 0 | 346 [132-519] / 1880 [546-3616] |
| career | AFTER EXPLORE | 120 | 100 [58-131] | 137 ±21 | 413 [309-699] | 717 ±126 | 0.28 | 3% | 8% | 7% | 0.28 | 0 (0 runs) | 0 | 208 [121-361] / 1097 [436-2185] |

Reading: AUTO is unchanged within the noise on fixed builds and careers (career mean 157 ±23 s vs 154 ±26; runs 11-15
a little better). AUTO never stalled. Quests add 2-7% of a run's gold on average (0.3 to 1.7 done per run; a player who
finishes all three gets about 230 gold, 10-20% of a typical mid-career run), so careers are not faster. EXPLORE opens the
vault in 75% and loots the yard in 83% of strong (20,000) runs; its one stalled run (8 windows, BONE_DESERT seed 5007) is
site goals given up and retaken during a long late fight, as in slice 2 (9 windows in 3 runs before). Two problems the
first AFTER pass found were fixed: the mimic at 1.5% after 1:00 with 6x HP was in a third of career runs and the top early
killer (now 0.4% after 3:00, 3x HP, waking 40 px away), and a dropped key held as a goal through long fights stalled
(seed 5020: 13 windows; the key now waits for a calm field and drifts to the hero from 150 px). EXPLORE careers still
came out lower than BEFORE (mean 137 ±21 s vs 179 ±32; runs 11-15 208 vs 346 median): 9 of its deaths were to a BRUTE
at 1:57-2:11, the key carrier hunted during the wave-1 boss. After this table the carrier moved to 2:30, lost its
+50% HP, and EXPLORE now hunts it only with no boss alive and a level of at least 4 + 4 x wave (the altar rule).
That change is NOT yet measured: the next EXPLORE career pass (8 seeds) should confirm it closes the gap.

## EXPLORE career fix (M5b, after slice 3)

The brief: EXPLORE should be a modest gain over AUTO, never worse. Measured on the tree before this fix
(`db48794`, the key-carrier change already in), careers of 15 runs x 8 seeds (1001-1008), `--shop stats-first
--stage MIX --speed 8`: EXPLORE runs 11-15 survival 130 s [56-574] against AUTO 222 s [63-800] (median [min-max],
n = 40 each).

**Why it died earlier.** `tools/progression_sim.mjs --trace-every 1` now also records the pilot's goal, its kind
and distance, enemies and gems around the hero, whether a boss is alive and which EXPLORE gate held
(PROGRESSION_SIM.md). On the 120 career runs of each arm:

- **It lost its XP.** Kills were nearly the same (99 vs 109 at 1:00, 245 vs 304 at 2:00) but the level was not:
  3.2 vs 4.1 at 1:00 and 5.8 vs 7.4 at 2:00. The field holds about 140 gems on average and AUTO's drift banks
  them; EXPLORE walked off to a site 37% of the time and left them behind.
- **It set off hurt and far.** 48 of 120 deaths had a site goal taken below 70% HP in the last 20 s (calm was
  "HP at half"); 100 of 120 had a site goal in the last 20 s, the last one a median 10 s before death, mostly a
  shrine (it stands still 4 s in the ring) or a brazier. At 2:00 it stood 635 px from the centre against AUTO's
  506 px (nearer the rim, where kiting gets pinned): sites up to 900 px away were fair game.
- **It detoured during boss fights.** 15 deaths had a goal while a boss was alive (GRAVELMAW killed 14 EXPLORE
  and 13 AUTO runs; the herald 2).
- **Not the slice-3 goals.** Vault, yard, crack and glyph goals were 0.7%, 1.7%, 3.0% and 0.3% of the time; 7 of
  120 deaths were on high ground (AUTO 4). They were not the cause.
- Two bugs found on the way, both fixed: (1) at the maw the sites close (`state.sites = []`) but the site goal
  was never recomputed, so EXPLORE kept walking to an old vault through the whole maw fight (a 20,000-gold run:
  400 s); `tickWorldSites` and `startFinale` now clear it. (2) A big boss that fell inside the SHUT walled yard
  (big bosses cross walls) opened the portal inside it, where no one can walk: one 5,000-gold run stood at the
  wall for 27 minutes. The portal now opens outside the gate in that case (AUTO and EXPLORE alike).

**Rule changes** (`EXPLORE` in `src/explore.js`; the list in "EXPLORE" above):

| Rule | Before | After |
|---|---|---|
| Boss or herald alive | site goals allowed | no detour at all |
| Calm, behind the curve (level < 4 + 4 x wave) | nearest enemy > 110 px, HP >= 50% | nearest > 160 px, at most 3 within 300 px, HP >= 60% |
| XP gems, behind the curve | ignored | more than 4 gems within 80 px are banked first |
| Reach, behind the curve | 900 px | 560 - 80 x (wave - 1) px, never under 300 |
| Ahead of the curve | as above | the old look: nearest > 110 px, HP >= 50%, 900 px, no gem or crowd rule |
| Walled yard (a dead end) | whenever open | open and no live enemy within 340 px (140 px ahead) |
| Key carrier hunt | not gated by calm | calm field too |
| A site it holds but never finishes | kept until "no progress" | given up for the run after 30 s held in all |
| Threat | goal dropped when calm fails | the same, with the stricter calm (dropped the frame it fails) |

Tuning passes (careers, 8 seeds; EXPLORE runs 11-15 median / career mean survival / sites a minute): gem rule
"any gem within 240 px" 390 s / 201 / 1.08 (as passive as AUTO); within 140 px 448 / 232 / 0.98; "more than 4
within 80 px" 445 / 223 / 1.24; that plus a looser calm (130 px, 5 within 260 px) 293 / 154 / 1.95, below AUTO,
so the stricter calm stayed. The first fixed-build pass then showed strong builds starved of sites (vault 4%,
yard 0% at 20,000) and 20,000 survival 576 ±93 vs AUTO 615 ±77, hence the "ahead of the curve" look.

**Measured after** (same commands; cells median [quartiles], mean ±95% interval; `tools/world_sim_table.mjs`).
AUTO's numbers are identical before and after, run for run: none of the EXPLORE rules touch it, and neither bug
fix fired on these seeds.

Careers, 15 runs x 8 seeds (1001-1008), n = 120 runs per arm:

| arm | n | survival s | mean | gold/run | mean | quests/run | vault opens | yard looted | runs 11-15 surv / gold |
|---|---|---|---|---|---|---|---|---|---|
| AUTO before | 120 | 121 [65-222] | 160 ±26 | 470 [338-1188] | 927 ±178 | 0.27 | 1% | 0% | 222 [129-374] / 1287 [534-2355] |
| AUTO after | 120 | 121 [65-222] | 160 ±26 | 470 [338-1188] | 927 ±178 | 0.27 | 1% | 0% | 222 [129-374] / 1287 [534-2355] |
| EXPLORE before | 120 | 98 [57-128] | 124 ±19 | 413 [301-631] | 694 ±139 | 0.27 | 6% | 8% | 130 [119-280] / 617 [453-1964] |
| EXPLORE after | 120 | 128 [66-354] | 224 ±36 | 615 [353-2302] | 1452 ±284 | 0.38 | 9% | 7% | 466 [233-533] / 3014 [1475-4170] |

By the simulator's own windows (median [min-max], n = 40): runs 6-10 AUTO 121 [41-462], EXPLORE before
100 [39-264], after 152 [54-476]; runs 11-15 AUTO 222 [63-800], EXPLORE before 130 [56-574], after 466 [56-939].
Sites used a minute: AUTO 0.99, EXPLORE before 3.47, after 1.69.

Fixed builds, k = 24 per budget (seeds 5001-5024):

| budget | arm | n | survival s | mean | gold/run | mean | quests/run | vault opens | yard looted | stall windows |
|---|---|---|---|---|---|---|---|---|---|---|
| 5000 | AUTO | 24 | 161 [127-336] | 223 ±57 | 740 [468-1816] | 1168 ±371 | 0.71 | 0% | 0% | 0 |
| 5000 | EXPLORE before | 24 | 151 [111-349] | 215 ±57 | 776 [343-1796] | 1186 ±416 | 0.79 | 17% | 17% | 0 |
| 5000 | EXPLORE after | 24 | 220 [132-396] | 273 ±66 | 1249 [502-2335] | 1553 ±473 | 0.96 | 17% | 4% | 0 |
| 20000 | AUTO | 24 | 680 [495-741] | 615 ±77 | 4751 [2860-6847] | 4766 ±933 | 1.42 | 4% | 0% | 0 |
| 20000 | EXPLORE before | 24 | 642 [573-733] | 639 ±84 | 4522 [3503-6578] | 4608 ±819 | 1.75 | 67% | 83% | 4 (2 runs) |
| 20000 | EXPLORE after | 24 | 660 [499-739] | 601 ±88 | 4183 [1922-5843] | 4210 ±881 | 1.75 | 46% | 42% | 0 |

Reading: the career regression is gone and then some. EXPLORE runs 11-15 now survive about twice as long as
AUTO's (466 vs 222 s median; career mean 224 ±36 vs 160 ±26), because it now levels like AUTO and still banks
the braziers, shrines and quest gold (gold a run 1452 vs 927). That is more than "modest": careers compound
small per-run gains, and the 8-seed bands are wide (runs 11-15 min-max 56-939). Fixed builds: at 5,000 EXPLORE
is ahead (+37% median, +22% mean); at 20,000 it is level with AUTO within the noise (660 vs 680 median, 601 ±88 vs
615 ±77 mean), as it was before the fix (639 ±84). It still uses about twice AUTO's sites a minute, opens the vault
in 46% and loots the yard in 42% of strong runs (before: 67% and 83%; the stricter yard rule costs the most
there), and no run stalled. The simulator's pilot plays worse than a person: these are floors.

Open: the 20,000 fixed-build median sits 3% under AUTO (inside the interval); a larger k would settle whether
the "ahead of the curve" look should loosen further. Phone run setup: the QUESTS card runs off the bottom of an
844 x 390 screen (`docs/art/quests/quests-prerun-phone.png`), separate from this fix.

## The maw closes the world

When the maw arrives (`startFinale`) the sites close, and the rest of the world closes with them: the vault, the
lever, the key (held or on the ground), its carrier's mark, the yard's chest and every secret not yet found. What
no longer works is not drawn, not prompted (no vault card, no first-time hint, nothing on the radar) and not
carried: no elite is marked as the key carrier after the maw. The yard's walls stay (they are walls), with the gate
as the lever left it, and so do the opened niches. On the map the reached sites turn grey, the "?" ones leave it,
the header reads "MAP: THE SITES ARE CLOSED" and a tap on a site sets no waypoint. `state.poi.closed` is the flag;
the vault, lever and yard objects stay on `state.poi` for the end-of-run counts. Quests that need a closed object
cannot be finished after the maw. Tests: `test/test_post_maw.mjs`.

## World cards and the HUD; the quest board heading

The vault's card and the cursed statue's deal are queued by the world pass (`src/world_cards.js`) and drawn by the
HUD pass after the chrome, at the same zoom and size. Each card's box is clamped to the screen in screen pixels
(after the world zoom), then nudged clear of the HUD: the bars block (HP, MP, XP, LV), the purse, the clock and its
badges and the quest tracker. It moves below the box it hits or to its left (never above: the clock), the smaller
move that stays on screen, and steps on if that lands on another box. `renderer.worldCards` records the boxes drawn.
`test_world_quests` pins the tracker rule (a pure check, and a live render with the vault placed all round the
tracker, with and without the AUTO 50% badge); `test_post_maw` pins the screen clamp and the rest of the HUD (the
statue's card at three zooms). The quest board hides the DOM "HORDES" heading under the title art, as the
run setup already did (a second, larger "HORDES" showed under the logo on phone); a test pins the title, run setup
and quest board. Settings and camp have no title art and their own heading. Screenshots: `docs/art/quests/`
(`tools/capture_quests.mjs`), reviewed at 1280 x 720 and 844 x 390.

## Regression check after the release fixes (2026-10-03)

Careers, 15 runs x 8 seeds, stats-first shop, MIX stages, speed 8. Cells are the median of runs 11-15 [min-max].

| Tree | AUTO | EXPLORE |
|---|---|---|
| Before the release fixes (`dc020c6`) | 222 | 466 [56-939] |
| After the release fixes (`356bf45`) | 238 [53-796] | 235 [45-709] |
| With the welcome shrine (this commit) | 203 [53-754] | 243 [70-670] |

- The drop in EXPLORE was bisected to `3c8043f` (spawn clearances measured from the hero's start). Before it, the clearing was measured from (0,0), so a shrine or braziers could stand on or beside the hero's start and EXPLORE took a free blessing in the first seconds of every run. That was an accident of placement, and it is what made EXPLORE twice as strong as AUTO.
- With sites kept 170 px clear of the real start, EXPLORE is level with AUTO over a career and ahead on a 5,000-gold build (253 s vs 175 s, k=12). That is the "modest gain" the mode was designed for, and it matches the curve the economy was tuned on.
- The welcome shrine: the first shrine of every run now stands 200-300 px from the start (`SITES.WELCOME_MIN/MAX`), so every run has one close by. Route checks start from the hero's start, not (0,0).
- AUTO is unchanged within the noise.
