# ARCH ART PASS — capture notes (field-arch vocabulary)

Owner brief 2026-09-24: "generate replacement arches" — the shrine-retheme
treatment for the field arches. Original grids only — the seven reference
PNGs in docs/gen_ref/field-arches/ are READ-ONLY vocabulary; every pixel
below is hand-composed in hordes' integer-grid style (no foreign pixels, no
tracing, no imports from docs/gen_ref/).

## Footprint (honest to the replaced procedural block)

The old pillars/lintel/cap filled x-12..x+12 by y-21..y+13 around the ground
point with cull(x, y, 30). Every variant is 24x35 so the designed arch
occupies that exact on-screen class (24 wide / 35 tall, inside the brief's
20-26 x 30-40). Ground point = column 12, row 21 (the walk-through centre),
so paintArch(g, art, x - 12, y - 21, active) reproduces the old anchor.

## Variant selection (5 of 5 — one per ARCH_TYPES id, all shipped)

| variant    | type        | dims  | palette key 4 (dominant) | reference cited | rationale |
|------------|-------------|-------|--------------------------|-----------------|-----------|
| twin_fury  | DOUBLE_FIRE | 24x35 | #ff8848 orange           | 01-twin-fury + 02-twin-fury-alt | 3 flame tongues over a fire-jointed lintel; fluted orange piers; ember flecks in the void. The alt's mirrored jaws become void teeth only on berserker (kept the twin-column read here). |
| magnet     | MAGNET      | 24x35 | #4a8cff blue             | 03-magnet       | Horseshoe crest with pole caps; coil-ridge lintel rows (ink 6); field-line dashes drift across the void. The copper coil compresses to ridge stripes (see losses). |
| aegis      | SHIELD      | 24x35 | #a8e0ff ice              | 04-aegis + 05-aegis-alt | Dome boss crest over a riveted lintel (ink 5 rivets); plate courses (ink 3) down the piers; the void stays clear (sheltered). The ram-skull alt becomes the dome mass (no horn digits at this size). |
| berserker  | BERSERK     | 24x35 | #ff5566 red              | 06-berserker    | 12-spike sawtooth crest over a cracked lintel; claw gashes (ink 6) score the piers; jagged void teeth (ink 4) bite inward. |
| zephyr     | SWIFT       | 24x35 | #68e080 green            | 07-zephyr       | Swept wing crest (asymmetric, wind-blown right); slim 5-wide piers (the lightest mass of the five); wind streak dashes across the void. |

Identity rule (pinned by test/test_arch_art.mjs): palette[4] equals the
render.js ARCH_COLORS hex for the type AND is the most-used ink in the grid,
so the buff a gate grants still reads at a glance.

## Consumed-state read (verbatim from the pre-pass code)

src/arches.js tickArches CONSUMES an arch by reverse-splicing it out of
state.arches the moment the player enters ARCH.ACTIVATE_R (26). The old
render block had NO used/triggered branch — a spent gate was simply GONE
from the field (never repainted grey in place). That semantics is preserved:
the game still splices, so a consumed arch never lingers. `a.used` is a
paint-only latch (chest `band` precedent) so captures/tests can render the
inactive read; the game never writes it.

## Palette rows (active; ARCH_SPENT shared greys when inactive)

twin_fury (01+02): 1 ink #1c0a04 | 2 stone-dark #5c3020 | 3 stone #8c5030 |
  4 type #ff8848 (cladding) | 5 type-hi/glint #ffc090 | 6 dark detail
  #3a1808 (flutes) | 7 bright tell #ffe0c0 (embers) | 8 shadow #0e0402.
  Glint: (11,4)(12,4) on the lintel joint.

magnet (03): 1 ink #0a0e1c | 2 stone-dark #3a4254 | 3 stone #6a7488 (coil
  ridge base) | 4 type #4a8cff | 5 type-hi #a8d0ff | 6 dark detail #1c2438
  (coil ridges) | 7 bright tell #d8f0ff (field sparks) | 8 shadow #04060c.
  Glint: (11,5)(12,5) on the lintel joint.

aegis (04+05): 1 ink #0a141c | 2 stone-dark #3a5a6c | 3 stone #6a8a9c
  (plate courses) | 4 type #a8e0ff | 5 type-hi #e8ffff (rivets/boss) |
  6 dark detail #1c3040 | 7 bright tell #ffffff (boss core) | 8 shadow
  #040a10. Glint: (11,3)(12,3) under the dome boss.

berserker (06): 1 ink #1c0608 | 2 stone-dark #5c2028 | 3 stone #8c3840 |
  4 type #ff5566 | 5 type-hi #ffa0a8 | 6 dark detail #3a1014 (claw gashes) |
  7 bright tell #ffd0d4 | 8 shadow #0e0204. Glint: (11,4)(12,4).

zephyr (07): 1 ink #0a140c | 2 stone-dark #2c5c38 | 3 stone #4a8a58 |
  4 type #68e080 | 5 type-hi/glint #b0ffc0 | 6 dark detail #1a3a22 |
  7 bright tell #e0ffe8 | 8 shadow #040a06. Glint: (13,4)(14,4) on the
  swept crest.

## Shots (all: REAL painter path — paintArch on a capture adapter)

- arch-retheme-<twin_fury|magnet|aegis|berserker|zephyr>-active.png —
  304x436 (24x35 at 12x + 8px pad), house bg #0a090e.
- arch-retheme-<...>-inactive.png — same grids in ARCH_SPENT, no glints.
- arch-retheme-sheet.png — 1520x872, 5 cols x 2 rows (active top /
  inactive bottom), index tags 01..05 in col order.
- Regenerate: node tools/capture_arch_retheme.mjs (in-tree paths only).

## Not reproducible at 24x35 (disclosed losses)

- 01-twin-fury: the carved crossed swords in the keystone are lost — a
  2px lintel joint cannot carry a relief; the flame tongues (the alt's
  smouldering cracks) are the crest read instead. GUESS: the exact flame
  tongue count/height (reference is painterly fire; 3 stepped tongues at
  rows 0-2 stand in).
- 02-twin-fury-alt: the mirrored fanged jaws would collide with
  berserker's void teeth at this size; dropped from twin_fury (the twin
  column + fire crest is the type's read) and the jaw idea lives only as
  berserker's inward teeth. Moss-in-seams is the house ink line (key 1).
- 03-magnet: the copper coil wrapped around ONE pillar compresses to
  symmetric ridge stripes on both piers (asymmetric coil reads as a bug
  at 6px pier width). The hovering iron ring becomes the horseshoe crest
  (a true see-through torus is 6px of transparency — same loss as the
  coil shrine). GUESS: spark scatter (reference is random arc spray;
  static dashes at rows 8/12/16/22/28 stand in).
- 04-aegis: the shield-shaped keystone is a 5px dome boss; the sigil is
  the 3px ink-7 core. Frost tracing the inner edge would fight the
  shimmer field's job (the "not yet" pulse) so it is dropped.
- 05-aegis-alt: the horned ram skull cannot exist at 9px crest width —
  reduced to the dome mass + rivet row. Warding glyphs become the plate
  course alternation (ink 3 every other pier row).
- 06-berserker: the snarling horned skull keystone becomes the 12-spike
  sawtooth (a face needs ~16px); red war paint is the full type cladding
  (key 4 dominant). Chipped edges are the cracked lintel row 5 (the 1px
  break at col 11).
- 07-zephyr: feathered wings compress to a 3-row swept diagonal (no
  individual feathers); spiralling wind becomes 2px dashes (a spiral
  needs a 12px void and the gate void is 8-10px). GUESS: dash rhythm
  (reference is continuous flow; 5 staggered flecks stand in).
- All five: the reference midtone banding (granite/basalt/moss stacks)
  compresses to the house 8-key contract (1 ink / 2 stone-dark / 3 stone /
  4 type / 5 glint / 6 detail / 7 tell / 8 shadow).

## Frozen (byte-identical; src/arches.js untouched)

Spawn cadence, ACTIVATE_R, trigger/splice consume, same-type refresh,
different-type stacking, durations (60/60/75/90/60), mods (rateMult x2 /
pickupMult x4 / shieldHits 3 / damageMult 1.5 + speedMult x0.75 /
speedMult x1.4), ARCH_TYPES names/descriptions. Shimmer pulse timing
(sin(t*3), 0.10 + 0.16*glow white field, only while untriggered). Keystone
blink (5Hz white/type alternate on the glint pair). Cull (30), world draw
order (among chest/portal/shrine). ART_ASSETS / ART_COUNTS unmoved (module
not enumerated — chest/shrine slice precedent).
