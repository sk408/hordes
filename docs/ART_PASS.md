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

- Menu portraits (`src/art/portraits.js`): redraw the four busts to match the new field pilots
  (Knight: open-faced steel helm with red crest and red/gold tabard; Witch: violet hat with
  cyan-tipped staff; Rogue: green hood and sand scarf; Paladin: gold winged helm, white plate,
  hammer). Not done in this pass.
- GRAVELMAW: still a grey hump; give it a head, jaws and legs that read as a beast.
- MAW: the lower lobes read slightly oddly; consider a jaw/tentacle base.
- Elite enemies keep the same grid at 1.5x collision; an elite-only larger grid would read better.
- Legacy BOSS_SPRITE fallback and the generic PLAYER_SPRITE fallback are untouched.
