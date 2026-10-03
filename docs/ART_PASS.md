# Art pass — October 2026

Branch `claude/art-pass`. Review and upgrade of the in-run sprites, judged at game size
(1x) and enlarged. Contact sheets are made with `tools/art_sheet.mjs` (real Chrome; one
page per set: actors, bosses, menu, world, buildings, icons; optional label filter and zoom):

    HORDES_CHROME=<chrome.exe> node tools/art_sheet.mjs <tag> docs/art/art-pass [sets] [labelFilter] [zoom]

In-game captures: `tools/capture_m2_feel.mjs <tag> docs/art/art-pass` (run, roster, roster per
theme 2-6, 300-enemy horde; 1280x720 and 844x390).

## Review (before the pass)

Verdicts: good / weak / bad silhouette / unreadable / off-style.

| Sprite | Verdict | Why |
|---|---|---|
| Pilots KNIGHT / WITCH / ROGUE / PALADIN (16x16, 3 frames) | good | the reference standard: head, shoulders, arms, legs, weapon |
| CHASER (stick figure 10x14) | weak | 1px orange lines; reads as a doodle, not a creature; vanishes in a crowd |
| SWARMER (bat 12x8) | weak | shape ok, but 2 frames and the body merges with the wings |
| BRUTE (blue knight 14x14) | weak | one rounded blob with a shield; no limbs; sprite smaller than its 18px body |
| SPITTER (green mage 12x14) | weak | a dotted pill under a hat; reads as a bottle |
| DASHER (skeleton 10x14) | weak | white block skull on a block chest; ok legs |
| WARLOCK (violet wizard 12x16) | off-style | same violet as the Witch pilot; ghost-like blob |
| TICK (bat recolour 12x8) | bad silhouette | a bat, not a tick, and twice its 5px collision size |
| COLOSSUS (demon 14x14) | weak | decent demon, but half the size of its 26px mini-boss body |
| PILLAR (obelisk 12x16) | good | clear turret, throbbing eye |
| SHRIKE (diver 14x10) | good | clear wings and beat |
| Elites (gold ring + crown pips) | good | strong tell (m2-feel work) |
| GRAVELMAW (boss) | weak | grey hump with a bone arc; reads, but not imposing |
| CHOIR_MOTHER (boss) | bad silhouette | two pink "mouth" squares on the chest of a cone robe read as something else |
| PYRAXIS (boss) | bad silhouette | disc with a white slit: reads as an eye or lips, not a fire creature |
| HERALD / VYRN (mid-boss) | bad silhouette | one tall rounded cone with a dot near the top; ambiguous, unfortunate |
| BOSS_SPRITE (legacy fallback overlord) | weak | blocky, but only a fallback |
| MAW (final boss) | good | huge, clear mouth and eyes; lower lobes slightly odd |
| Portraits KNIGHT | off-style | dome helm with a knob and no face; does not match the new field Knight |
| Portraits WITCH / ROGUE / PALADIN | weak | readable busts, but palettes/props drift from the field sprites |
| Detailed portal (48x48) | good | |
| Sites: shrine, altar, brazier, urn, fountain, statue | good | small but clear |
| Stage props (brazier, lantern, candelabra, cart, idol, vane) | good | |
| Chests (all bands, gamble, sealed) | good | |
| Arches (5 types) | good | |
| Stage buildings (64 designs) | good | composed rects, consistent palettes (sheet: before-sheet-buildings) |
| Weapon / weather HUD icons | good | |
| Gems, potions, chest pickups (in-run) | good | clear in captures |
| Enemy shots (spit, bolt, nova) | good | |
| Hero in a dense horde | bad | the hero disappears in the 300-enemy capture |

Counts: good 15 rows, weak 9, off-style 2, bad silhouette 5 (TICK, CHOIR_MOTHER, PYRAXIS, HERALD,
hero-in-horde). Worst offenders: HERALD, PYRAXIS, CHOIR_MOTHER (shapes that read as something
else), TICK, and the hero getting lost.

## What changed

- **Common enemies** (`src/sprites.js`), each a distinct creature silhouette with limbs separated
  from the body by a gap so they read at 1x, light from the top left (key 3 left/top, key 2
  right/bottom), and walk cycles A-B-A-C (B/C bob the body a pixel and lift alternate feet):
  CHASER ghoul 10x13; SWARMER bat 11x8 with a 3-pose flap (up/level/down/level); BRUTE ogre knight
  16x16 (spiked pauldrons, tiny visor, huge fists); SPITTER toad 12x12 (eye domes, wide mouth,
  throat sac); DASHER skeleton 10x15 (glowing sockets, ribs, free arm bones); WARLOCK hooded
  cultist 12x16 in crimson-magenta (no longer the Witch's violet), glowing hands, floating
  tattered robe; TICK its own 9x7 six-legged tick; COLOSSUS demon 20x21 sized to its 26px body
  (horns under its shoulder braziers, fangs, claws, digitigrade legs). Collision sizes unchanged;
  sprites stay centred on the entity by grid size.
- **Bosses** (`src/bosses.js`): HERALD redrawn as a figure (peaked hood, bone skull mask, ember
  eyes, pauldrons clear of the hood, free arms, lance, cloak fold, tattered hem; frame B = attack
  tell: eyes and blade flare white-hot). PYRAXIS redrawn as a fire elemental (flame crown, brow,
  white-hot eyes, fanged maw, arms of fire, tail; frame B = nova tell, gold flare). CHOIR_MOTHER
  redrawn as a veiled singing matron (face with eyes and mouth, hands over a gold hymnal, lit and
  shaded robe, cherub orbs clear of the body; frame B = held note).
- **Hero standout** (`src/render.js`, player branch only; `src/sprite_cache.js`): a wider pool of
  light (r 16, full strength) plus a crisp 29x11 ground ring (bright over dark) baked once via
  `blitPainted` and drawn after the horde, so it shows over enemies; the ring stays cyan while hurt (red read as one more enemy).
  Common enemies bake with a new `mute` style flag (22% toward grey, 10% darker); the hero, bosses
  and elites stay at full saturation. Everything stays one cached blit per actor.
- Tools: `tools/art_sheet.html` + `tools/art_sheet.mjs` (contact sheets).

## Screenshots (docs/art/art-pass/)

- Before: `before-sheet-{actors,bosses,menu,world,buildings,icons}.png`,
  `before-{run,roster,horde}-{desktop,phone}.png`, `before-roster-theme{2..6}-desktop.png`.
- After: `after-sheet-{actors,bosses}.png`, `after-{run,roster,horde}-{desktop,phone}.png`,
  `after-roster-theme{2..6}-desktop.png`; zoomed working sheets `wip-sheet-*-zoom.png`.
- Frame cost: `before-frame-ms.json` / `after-frame-ms.json`.

## Tests changed

- `test/test_sprites.mjs`: enemy sprites now 2-4 frames (was exactly 2) sharing one box; size
  range 6-24px (was 8-16; tick 9x7, colossus 20x21); TICK no longer asserted to be a bat recolour
  — instead it must have its own smaller grids, and every type must have a distinct silhouette.

## Left for a later pass

- Menu portraits, GRAVELMAW, the MAW's lower lobes and elite size: done, see "Release fixes" at
  the end of this file.
- Legacy BOSS_SPRITE fallback and the generic PLAYER_SPRITE fallback are untouched.

---

# World makeover — October 2026

Ground tiles, structures, props, terrain faces, landmarks and the rim wall, brought up to the
character standard (outlined, lit from the top left, a contact or cast shadow), with each of the
8 stages its own place and the ground kept quiet under the actors.

Captures: `tools/capture_world_art.mjs <tag> docs/art/world-art` (per stage: spawn view, main
plateau, landmark, rim; 1280x720 and 844x390; fixed seed and clock; writes `<tag>-frame-ms.json`).
Contact sheets: `HORDES_SHEET_BAKED=1 node tools/art_sheet.mjs <tag> <dir> buildings,world`
draws structures and props as the game bakes them.

## Review (before, `docs/art/world-art/before-*`)

| Element | Verdict | Why |
|---|---|---|
| Ground, every stage | bad | the floor colour came only from the WAVE theme, so all 8 stages opened on the same green turf: grey snow chapels on grass (Snowfield, Whiteout), a scorched plateau in a meadow (Cinder Maw); stage identity was only a few small motifs |
| Fine decor "slab plate" (25% of pieces) | weak | a 13x13 notched square with a seam: read as tiles or gravestones scattered in a grid; the 32 px dot lattice added to the grid feel |
| Buildings (64) | weak next to the new actors | flat fills, no outline, inconsistent light; good shapes |
| SMALL_IDOL (Blood Rust satellite) | bad silhouette | round head, shoulders, arms: a red figure standing in the field, reads as an enemy |
| RUST_IDOL prop (Blood Rust) | bad silhouette | a blocky head with two glowing eye pixels on a body: once outlined it reads as a small creature |
| STUMP_SHRINE | ok | carved face on a stump; deliberate, kept |
| Props (brazier, lantern, candelabra, cart, vane) | ok | readable, but flat next to the new actors |
| Plateau tops | weak | one flat fill with sparse 2x1 specks; large flat slabs of colour (Void Reach, Blood Rust) |
| Cliff faces | weak | the same dark band with vertical streaks on every stage |
| Ramps, bridges | ok | readable; no outline |
| Landmarks (8) | ok / weak | readable but flat; the cinder forge was a plain box with a glowing slot |
| Arena rim wall | ok | a flat stone band |

Weakest per stage: Verdant Hollow, the slab-plate "gravestones"; Ashen Waste, green ground under
basalt; Snowfield, green ground under snow buildings; Blood Rust, the idol and the rust idol prop
read as figures, flat red plateau; Bone Desert, green ground under sand towers; Void Reach, flat
purple plateau slabs; Cinder Maw, meadow under a cinder plateau and a box forge; Whiteout, green
ground under the clock compound.

## What changed

- **Ground** (`src/world_ground.js`, new): each stage owns a floor material palette
  (`STAGE_GROUND_PALETTES`): Verdant Hollow grass and moss with soil patches; Ashen Waste ash and
  basalt; Snowfield packed snow with blue shadow; Blood Rust iron-red earth and rust plates;
  Bone Desert sand with bone shards; Void Reach dark stone with faint crystal veins; Cinder Maw
  scorched rock with ember seams; Whiteout grey drifts with cool shadows. The wave theme still
  leans every colour 12% (`WAVE_MIX`), so a new wave still reads as a change of light. A
  material underlay (two-octave value noise, 4x4 ordered-dither edges, a sparse dark grain) gives
  natural patches with no grid; underlay tones are never lighter than the base. The decor and
  the 24 stage motifs moved out of `render.js` and were redrawn with a lit top-left and a shadow
  bottom-right; the slab plate is now an irregular soft patch; the dot lattice no longer draws on
  the cached path. Geometry is the same pure function of (cell, seed, stage, weather id); the
  weather reaction is unchanged.
- **Ground cache**: the floor is painted once into 258 px chunks (256 plus a 1 px overlap per
  side, so a fractional zoom shows no seam), keyed by stage, seed, palette (wave) and weather,
  built lazily as the camera reaches them, LRU-capped at 24 (about 6.4 MB). A frame blits 2 to 6
  chunks. Without a real canvas (the headless harness) `drawGround` paints directly with fillRect.
- **Structures and props** (`STYLE_STRUCT` in `src/sprite_cache.js`): every building, prop and
  landmark is baked once with a 1 px dark outline, every face lit from the top left (silhouette
  edges and inner edges, by relative luminance), a sparse grain on flat faces and a soft cast
  shadow falling 3 px right and 2 px down. Footprints and rect lists are unchanged (pinned by
  `test_world_art`). SMALL_IDOL is now a horned stele with a glowing rune; RUST_IDOL is a rune
  obelisk. The small landmark layer (walls, pillars, cairns, piles) uses the stage palette, and
  the theme pile follows the stage (crystals in Void Reach, drifts in Snowfield and Whiteout).
- **Terrain and landmarks** (`src/terrain_art.js`): per-stage cliff faces (earth with hanging
  roots, basalt columns, ice with a snow cap and drips, rock strata, dark stone with crystal veins,
  scorched rock with ember cracks); outlined blocks with a lit north-west lip; plateau tops get the
  dithered patch pass and a few quiet pebbles; ramps have shadowed risers and lit treads; bridges
  have lit planks and an outline. Landmarks bake with `STYLE_STRUCT`; the cinder forge is redrawn
  (stepped hearth, glowing mouth, flue, anvil, slag). The rim wall is shaded on its outer half,
  outlined, and the north and west walls cast a shadow onto the floor.

## Numbers

Draw calls per frame (`node tools/m2_drawcalls.mjs --cache --breakdown`, headless, counting
canvases):

| | before | after |
|---|---|---|
| drawGround | 440 | 6 |
| ground dot lattice (render) | about 150 | 0 |
| frame, 0 enemies | 1483 | 889 |
| frame, 300 enemies | 2223 | 1629 |
| frame, 2000 enemies | 6388 | 5794 |

Render cost in real Chrome, no enemies, median per stage (`*-frame-ms.json`, 0.1 ms timer):
before 0.4-0.6 ms (p95 0.6-3.9), after 0.1-0.2 ms (p95 0.2-0.5). With a horde
(`capture_m2_feel`, render median, desktop / phone): 100 enemies 1.5 / 0.9 -> 1.0 / 0.6 ms;
300: 2.0 / 1.8 -> 1.4 / 1.0; 1000: 5.4 / 5.1 -> 4.8 / 3.9; 2000: 27.9 / 36.8 -> 16.8 / 24.7
(before = `docs/art/art-pass/after-frame-ms.json`; the p95s are timer and GC noise in both).

Actor contrast (`node tools/m2_contrast.mjs` and `--stages`; body colour = the most used palette
entry of frame 0). Before, the floor was the wave theme for every stage; after, each stage's
floor (base and both underlay tones) under all six wave leans:

| before: wave theme | min | after: stage | min |
|---|---|---|---|
| VERDANT HOLLOW | 1.28 | VERDANT_HOLLOW | 1.26 |
| ASHEN WASTE | 1.38 | ASHEN_WASTE | 1.39 |
| SNOWFIELD | 1.13 | SNOWFIELD | 1.18 |
| BLOOD RUST | 1.35 | BLOOD_RUST | 1.37 |
| BONE DESERT | 1.22 | BONE_DESERT | 1.21 |
| VOID REACH | 1.38 | VOID_REACH | 1.49 |
| | | CINDER_MAW | 1.54 |
| | | WHITEOUT | 1.16 |

The minimum is PILOT_PALADIN everywhere (its most used tone is a dark brown shade). 6-7 actors
were under 3:1 before and still are (Paladin, Knight, Swarmer, Warlock, Herald, Witch, Colossus):
their body tones are as dark as any floor, and the outline, rim light, hero ring and pool carry
them. The pass raises the global minimum from 1.13 to 1.16 and keeps every stage within 0.05 of
its old theme; a 3:1 floor for those actors needs lighter body tones, not a different ground.
Whiteout is therefore a muted cool grey (reads as grey drifts, not white), by the same rule that
keeps Snowfield muted.

## Screenshots (docs/art/world-art/)

- Before: `before-<stage>-{spawn,terrain,mark,rim}-desktop.png`, `before-<stage>-{spawn,terrain,mark}-phone.png`.
- After: the same names with `after-`; baked sheets `after-sheet-buildings.png`,
  `after-sheet-world.png`; horde, roster and per-theme rosters `world-after-*`.
- Fixed after looking: chunk seams at fractional zoom (1 px overlap); plateau tops too busy with
  bright specks (one mark per about 36x36 px, in near-top tones); Whiteout reading olive-grey and
  too close to Snowfield (cool grey a step darker, Snowfield deeper blue, wave lean 18% -> 12%); the sand pit motif reading as a box; the rust idol prop reading as a creature once outlined.

## Tests changed

- `test/test_stage_ground_k4.mjs` PALETTE-KEYS-ONLY: every ground rect must be a value of the
  stage's ground palette under the wave theme (`stageGroundPalette`), not of the bare wave row.
- New `test/test_world_art.mjs`: design sizes and placed collision rects (8 stages x 4 seeds)
  equal the pre-pass build's list (`test/fixtures/building_footprints_pre_world_art.json`, written
  from 3a01e88); every design paints inside its box; palette rules (base band, underlay never
  lighter than the base, the wave still leans, 8 distinct floors); the chunk cache is off headless.

## Open items

- The wave toast named the theme ladder's area: fixed, it names the stage (see "Release fixes").
- Buildings got the bake-time standard (outline, light, shadow) but their rect compositions are
  unchanged; a per-design redraw (roof overhangs, door frames, window sills, biome trim) would
  take them further. STUMP_SHRINE keeps its carved face.
- Landmarks other than the forge keep their shapes (now outlined and lit); the bone gate and the
  basalt arch could use more mass.
- Vault, walled yard, lever and sites were not redrawn (they read fine next to the new art).
- Chunks rebuild when the wave or the weather changes: a cold rebuild of the 4 visible chunks
  costs about 8 ms in Chrome (30 ms the very first time, before the JIT warms up), about 2 ms per
  chunk when the camera reaches a new one; spreading builds over frames would smooth it.

---

# Release fixes — October 2026

Six items from the pre-release review. Images: `docs/art/release-fixes/` (`before-*`, `after-*`).

- **Wave toast.** `WAVE 3 - SNOWFIELD` on the Snowfield: the toast names the stage
  (`stageOf(state.stage).name`), not the wave theme ladder.
- **Run setup on a landscape phone.** On a landscape screen up to 500 px tall the six cards sit
  three to a row under the wordmark; the press hints, key names, quest pays and the sub line
  hide there (the quest board shows the pays). Measured in real Chrome at 844x390 and 667x375,
  with the browser's monospace, a 0.6 em one, and with the `:has()` rules removed:
  `node tools/verify_prerun_fit.mjs`
  (`prerun-{before,after}-{fresh,longest}-<size>.png`).
- **Actor contrast.** Every actor's body colour (most used palette entry of frame 0) now holds
  3:1 on every stage floor (base and both underlay tones, all six wave leans); the minimum is
  3.17 (the Maw on Whiteout), and 0 actors are under 3:1 on any stage (was 6-7 per stage).
  Changes: Swarmer wings `#a8285e` to `#ff86c0`; Warlock robe `#a8306a` to a magenta `#f24ad6`
  (its own hue, away from the bat's pink and the Witch's violet); Colossus hide `#d8443a` to
  `#f0664e`; Herald cloak `#7a4ab0` to `#a274e4`; Witch robe `#7a4bd0` to `#a276f4`. The Knight
  and the Paladin were bright already; the tool was counting their dark authored outline, which
  doubled the baked one. Their lit (left) edge is now steel and gold. Silhouettes are unchanged.
  Common enemies are baked a step muted, so `node tools/m2_contrast.mjs --actors` also prints the
  colour as drawn: the lowest are Warlock 2.79, Colossus 2.83, Shrike 2.95, Chaser 2.98.
  `test/test_actor_contrast.mjs` holds 3:1 as authored and 2.75:1 as drawn.
- **Menu busts** (`src/art/portraits.js`, text rows now). Knight: open-faced steel helm, red
  plume, red tabard with the gold cross. Witch: bent pointed hat, amber clasp, staff with the cyan
  crystal. Rogue: green hood, sand scarf over the mouth and round the neck. Paladin: winged gold
  helm, white plate with the gold cross. Fixed after looking: the first Rogue scarf tapered and
  read as a beard (now a mask and a wide roll); the first Paladin wings read as horns, then as
  mitts (now a swept wing with a stepped lower edge, as on the field sprite). The busts use keys
  1-9, so `SILHOUETTE_PALETTE` (the locked pilot mask) names all nine.
- **GRAVELMAW** is a stone bull seen head-on: plated hump with ember cracks, bone horns, two red
  eyes under a brow, a jaw of stone teeth with fire behind them, four legs. Its sprite has a
  `tell` grid (crouched, eyes and maw white-hot) that `drawActor` shows while the boss
  telegraphs; the two walk frames are unchanged in count. **The MAW**'s two lower lobes are one
  tapering chin with six tendrils of different lengths, none on the centre line.
- **Elites** are drawn at their body size: the baked raster stretched by
  `ELITE_TEMPLATE.sizeMult` (1.5) about the body centre, on whole pixels. The gold ring, pool,
  crown pips and hp bar follow. At an odd device scale a sprite pixel is 4 or 5 device pixels
  (720p) instead of an even 6; edges stay crisp.

Tools: `tools/field_sheet.mjs` draws every actor as the game bakes it (outline, rim, shadow,
mute, elite and boss tells) on each stage's lightest floor
(`{before,after}-field-{pilots,enemies,elites,bosses,maw}.png`).
`{before,after}-{roster,horde}-{desktop,phone}.png` are `tools/capture_m2_feel.mjs` scenes.
`{before,after}-boss-elites-{desktop,phone}.png`: Gravelmaw walking and winding up, and each elite
beside its plain kind.
