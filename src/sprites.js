// HORDES — pixel sprite library (Sk408 sprite overhaul).
// Hand-authored pixel grids in the PLAYER_SPRITE style: arrays of rows, each
// row an array of palette indices (0 = transparent, 1..9 = palette keys).
// Everything stays fillRect-composable — the renderer just walks rows and
// paints one rect per pixel (drawSprite pattern in render.js).
//
// ENEMY TYPE MAPPING (art pass, October 2026 — see the block below):
//   CHASER   -> GHOUL          (hunched, big head, long free-hanging arms)
//   SWARMER  -> BAT            (ears, membrane wings, 3-pose flap)
//   BRUTE    -> OGRE KNIGHT    (spiked pauldrons, tiny visor, huge fists)
//   SPITTER  -> TOAD           (eye domes, wide mouth, pale throat sac)
//   WARLOCK  -> WARLOCK        (pointed hood, glowing hands, floating robe)
//   TICK     -> TICK           (its own 9x7 swollen six-legged tick)
//   COLOSSUS -> DEMON          (20x21: horns, fangs, claws, digitigrade legs)
//   DASHER   -> SKELETON       (glowing sockets, ribs, free arm bones)
// The boss (main.js wave boss) -> BOSS_SPRITE (24x24 crowned overlord, cape).
// FLAME_FRAMES / SMALL_FLAME: fire FX, portals, demon braziers — Sk408 loves
// flames, so both are full 4-frame loops with hot yellow cores.
//
// Walkers cycle A B A C (stand, step, stand, other step); flyers flap
// up / level / down / level; flames have FOUR frames. anchor = sprite center (floor(w/2), floor(h/2))
// — draw at (entity.x - anchor.x, entity.y - anchor.y).

// ---------- helper ----------
// spriteBox(grid) -> { w, h } of a pixel grid.
export function spriteBox(grid) {
  return { w: grid[0].length, h: grid.length };
}

// ===========================================================================
// ARCHETYPES — one entry per creature, frames first, palette after.
// ===========================================================================

// ---- ART PASS (October 2026): the common enemies redrawn to the pilots'
// standard — a distinct creature silhouette per type (not just a recolour),
// limbs separated from the body by a gap so they read at 1x, light from the
// top left (light key 3 on the left/top, shade key 2 on the right/bottom),
// and a walk / flap / sway cycle. Keys per sprite: 1 base, 2 shade, 3 light,
// 4 eyes / glow, 5 dark (mouth, sockets, boots), 6 accent.
// Authored as text rows ('.' = transparent). Walkers are built from a body
// and leg rows: A stands; B and C bob the body down a pixel and lift one foot;
// the cycle is A B A C so the feet alternate.
const T = (rows) => rows.map(r => [...r].map(ch => (ch === '.' ? 0 : +ch)));
function walker(body, stand, stepL, stepR) {
  const w = body[0].length, blank = '.'.repeat(w);
  const A = T([...body, ...stand]);
  const B = T([blank, ...body, ...stepL]);
  const C = T([blank, ...body, ...stepR]);
  return [A, B, A, C];
}

// ---- GHOUL (CHASER) — 10x13: hunched, big-headed, long arms hanging free.
const GHOUL_FRAMES = walker([
  '...3333...',
  '..311112..',
  '..141142..',
  '..311122..',
  '...1552...',
  '.33111122.',
  '3.311112.2',
  '3.155552.2',
  '1.555555.2',
  '11.5555.22',
], [
  '...1..2...',
  '...1..2...',
  '..55..55..',
], [
  '..55..2...',
  '......55..',
], [
  '...1..55..',
  '..55......',
]);
const GHOUL_PALETTE = { 1: '#e0783a', 2: '#9a3e1e', 3: '#ffb070', 4: '#fff8d0', 5: '#3a1a14' };

// ---- BAT (SWARMER) — 11x8: ears, eyes, membrane wings; up / level / down.
const BAT_UP = T([
  '2.........2',
  '22..1.1..22',
  '232.414.232',
  '.2321113232',
  '..2211122..',
  '....111....',
  '....5.5....',
  '...........',
]);
const BAT_MID = T([
  '...........',
  '....1.1....',
  '....414....',
  '22231113222',
  '23321112332',
  '.2..111..2.',
  '....5.5....',
  '...........',
]);
const BAT_DOWN = T([
  '...........',
  '....1.1....',
  '....414....',
  '...21112...',
  '..2311132..',
  '.232111232.',
  '232.5.5.232',
  '2.........2',
]);
const BAT_FRAMES = [BAT_UP, BAT_MID, BAT_DOWN, BAT_MID];
const BAT_PALETTE = { 1: '#ff5ea8', 2: '#a8285e', 3: '#ff9ccb', 4: '#fff3b0', 5: '#6a1a40' };

// ---- TICK — 9x7: a swollen blood tick, six bent legs splayed clear of the
// round abdomen (the smallest thing on the field: 5px collision). The legs
// scuttle between the two frames.
const TICK_FRAMES = [
  T([
    '...424...',
    '5..222..5',
    '.5311125.',
    '5.11611.5',
    '.5111125.',
    '5..122..5',
    '...222...',
  ]),
  T([
    '...424...',
    '.5.222.5.',
    '5.31112.5',
    '.5116115.',
    '5.11112.5',
    '.5.122.5.',
    '...222...',
  ]),
];
const TICK_PALETTE = { 1: '#a8e03c', 2: '#5c8a1e', 3: '#e3ff9e', 4: '#ff3344', 5: '#b0703a', 6: '#ff6a7a' };

// ---- OGRE KNIGHT (BRUTE) — 16x16: spiked pauldrons, tiny visored head,
// huge fists hanging clear of the body, short legs.
const BRUTE_FRAMES = walker([
  '......3332......',
  '.....311112.....',
  '.....545452.....',
  '.6...311122...6.',
  '.63331111112226.',
  '3331111111111222',
  '3311.111111.1122',
  '311..111112..112',
  '311..555555..112',
  '311..111112..112',
  '333..111122..222',
  '3333.111122.2222',
  '.333.11..22.222.',
], [
  '.....11..22.....',
  '.....11..22.....',
  '....555..555....',
], [
  '....555..22.....',
  '.........555....',
], [
  '.....11..555....',
  '....555.........',
]);
const BRUTE_PALETTE = { 1: '#7f9ed4', 2: '#3d4f7a', 3: '#c4d6f4', 4: '#ff4a3a', 5: '#1c2236', 6: '#f0e6c8' };

// ---- TOAD (SPITTER) — 12x12: eye domes, wide mouth, pale throat sac that
// the spit comes from; it waddles (crouch / spread).
const TOAD_BODY = [
  '..33....33..',
  '.3453..3452.',
  '.3111111112.',
  '311111111112',
  '355555555552',
  '316666666112',
  '316666661122',
  '.3116611122.',
  '.3111111122.',
];
const TOAD_FRAMES = walker(TOAD_BODY, [
  '33.11..12.22',
  '3..1....2..2',
  '55.55..55.55',
], [
  '33.11..12.22',
  '55.55..55.55',
], [
  '3..11..12..2',
  '55.5....5.55',
]);
const TOAD_PALETTE = { 1: '#3fc864', 2: '#1d7a40', 3: '#a6ff9e', 4: '#ffe04a', 5: '#0c3418', 6: '#e0ffa8' };

// ---- SKELETON (DASHER) — 10x15: skull with glowing sockets, jaw, ribs,
// arm bones hanging clear, pelvis, legs.
const SKELETON_FRAMES = walker([
  '...3333...',
  '..311112..',
  '..141142..',
  '..311112..',
  '...1515...',
  '....12....',
  '.33111122.',
  '3..1512..2',
  '3..1512..2',
  '1...12...2',
  '1..3112..2',
  '...1..2...',
], [
  '...1..2...',
  '...1..2...',
  '..11..22..',
], [
  '..11..2...',
  '......22..',
], [
  '...1..22..',
  '..11......',
]);
const SKELETON_PALETTE = { 1: '#eeeef2', 2: '#9c9cb4', 3: '#ffffff', 4: '#5ae0ff', 5: '#16161e' };

// ---- WARLOCK — 12x16: tall pointed hood over a shadowed face with two pink
// eyes, glowing hands raised clear of the flared sleeves, a robe that floats
// (no legs) with a tattered hem that sways.
const WARLOCK_TOP = [
  '.....3......',
  '.....31.....',
  '....3112....',
  '....31112...',
  '...3155512..',
  '...1545452..',
  '...1155522..',
];
const WARLOCK_MID = [
  '.33311111222',
  '3..311112..2',
  '...3114112..',
  '...31111122.',
  '..311111122.',
  '..311111112.',
  '.33111111122',
];
const WARLOCK_FRAMES = [
  T([...WARLOCK_TOP, '.6.3111112.6', ...WARLOCK_MID, '.5.55.55.5..']),
  // frame B: the hands lift a pixel wider and the hem sways right
  T([...WARLOCK_TOP, '6..3111112.6', ...WARLOCK_MID.slice(0, 6), '.31111111122', '..5.55.55.5.']),
];
const WARLOCK_PALETTE = { 1: '#a8306a', 2: '#5a1838', 3: '#e0609a', 4: '#ffd0f0', 5: '#1a0812', 6: '#ff9ed8' };

// ---- DEMON (COLOSSUS) — 20x22: the mini-boss. Long horns (its shoulder
// braziers burn above them), burning eyes, fanged maw, a barrel body, arms
// with bone claws hanging clear, digitigrade legs.
const DEMON_FRAMES = walker([
  '..6..............6..',
  '..66............66..',
  '...66..333333..66...',
  '....663111111266....',
  '.....3141111412.....',
  '.....3111111112.....',
  '.....3155555512.....',
  '......15656512......',
  '..3333111111112222..',
  '.333111111111111222.',
  '3331.1111111111.2222',
  '331..1111111112..222',
  '331..1155551112..122',
  '331..1111111122..122',
  '311..1111111122..112',
  '311...11111122...112',
  '6.6...11111122...6.6',
  '6.6...111..122...6.6',
], [
  '......11....22......',
  '.....111....222.....',
  '....5555....5555....',
], [
  '....5555....22......',
  '............5555....',
], [
  '......11....5555....',
  '....5555............',
]);
const DEMON_PALETTE = { 1: '#d8443a', 2: '#7a1e1a', 3: '#ff8a6a', 4: '#ffe04a', 5: '#2a0806', 6: '#f4e4b0' };

// ===========================================================================
// FLAMES — classic teardrop: dark orange rim (1), orange body (2), yellow
// core (3), white-hot flicker tip (4). Four frames = tip sways L/tall/R/split.
// ===========================================================================
export const FLAME_FRAMES = [
  [ // frame 0 — tip left
    [0,0,0,0,1,0,0,0],
    [0,0,0,1,1,0,0,0],
    [0,0,0,1,2,0,0,0],
    [0,0,1,2,2,0,0,0],
    [0,0,1,2,2,1,0,0],
    [0,1,2,3,2,2,0,0],
    [0,1,2,3,3,2,1,0],
    [0,1,2,3,3,2,1,0],
    [1,2,3,3,3,2,1,0],
    [1,2,3,3,3,2,1,0],
    [1,2,2,3,2,2,1,0],
    [0,1,1,1,1,1,0,0],
  ],
  [ // frame 1 — tip tall center
    [0,0,0,0,4,0,0,0],
    [0,0,0,0,1,0,0,0],
    [0,0,0,1,1,0,0,0],
    [0,0,0,1,2,1,0,0],
    [0,0,1,2,2,1,0,0],
    [0,1,2,3,2,2,0,0],
    [0,1,2,3,3,2,1,0],
    [0,1,2,3,3,2,1,0],
    [1,2,3,3,3,2,1,0],
    [1,2,3,3,3,2,1,0],
    [1,2,2,3,2,2,1,0],
    [0,1,1,1,1,1,0,0],
  ],
  [ // frame 2 — tip right
    [0,0,0,0,1,0,0,0],
    [0,0,0,0,1,1,0,0],
    [0,0,0,0,2,1,0,0],
    [0,0,0,1,2,2,1,0],
    [0,0,1,2,2,1,0,0],
    [0,0,2,2,3,2,1,0],
    [0,1,2,3,3,2,1,0],
    [0,1,2,3,3,2,1,0],
    [1,2,3,3,3,2,1,0],
    [1,2,3,3,3,2,1,0],
    [1,2,2,3,2,2,1,0],
    [0,1,1,1,1,1,0,0],
  ],
  [ // frame 3 — tip split (double tongue)
    [0,0,0,1,0,1,0,0],
    [0,0,0,1,0,1,0,0],
    [0,0,0,2,0,2,0,0],
    [0,0,1,2,0,2,1,0],
    [0,0,1,2,1,2,1,0],
    [0,1,2,3,3,2,2,0],
    [0,1,2,3,3,3,2,0],
    [0,1,2,3,3,2,1,0],
    [1,2,3,3,3,2,1,0],
    [1,2,3,3,3,2,1,0],
    [1,2,2,3,2,2,1,0],
    [0,1,1,1,1,1,0,0],
  ],
];
const FLAME_PALETTE = { 1: '#e8481e', 2: '#ff9a3c', 3: '#ffe08a', 4: '#fff8d8' };

// SMALL_FLAME — 4x6 ember (braziers, torch pixels, small portals).
export const SMALL_FLAME_FRAMES = [
  [
    [0,1,0,0],
    [1,2,0,0],
    [1,2,1,0],
    [2,3,2,0],
    [2,3,2,0],
    [1,1,1,0],
  ],
  [
    [0,0,1,0],
    [0,1,2,0],
    [1,2,1,0],
    [2,3,2,0],
    [2,3,2,0],
    [1,1,1,0],
  ],
  [
    [0,4,0,0],
    [0,1,2,0],
    [1,2,1,0],
    [2,3,2,0],
    [2,3,2,0],
    [1,1,1,0],
  ],
  [
    [1,0,1,0],
    [2,1,2,0],
    [1,2,1,0],
    [2,3,2,0],
    [2,3,2,0],
    [1,1,1,0],
  ],
];

// ===========================================================================
// BOSS — 24x24 crowned evil overlord: gold crown, dark face with glowing
// eyes, red cape flaring behind, chest sigil. Frame B: cape flicks out,
// eye/sigil glow pulses. Anchor center; draw 1:1 or scale for wave bosses.
// ===========================================================================
export const BOSS_SPRITE = {
  frames: [
    [ // frame A — cape in
      [0,0,0,0,0,0,0,0,3,0,0,3,3,0,0,3,0,0,0,0,0,0,0,0],
      [0,0,0,0,0,0,0,0,3,0,0,3,3,0,0,3,0,0,0,0,0,0,0,0],
      [0,0,0,0,0,0,0,3,3,3,3,3,3,3,3,3,3,0,0,0,0,0,0,0],
      [0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0],
      [0,0,0,0,0,0,1,2,2,2,2,2,2,2,2,2,2,1,0,0,0,0,0,0],
      [0,0,0,0,0,0,1,2,4,4,2,2,2,2,4,4,2,1,0,0,0,0,0,0],
      [0,0,0,0,0,0,1,2,2,2,2,2,2,2,2,2,2,1,0,0,0,0,0,0],
      [0,0,0,0,0,0,1,2,3,2,2,3,3,2,2,3,2,1,0,0,0,0,0,0],
      [0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0],
      [0,0,0,5,0,1,1,1,1,1,1,1,1,1,1,1,1,1,0,5,0,0,0,0],
      [0,0,5,5,1,1,1,1,1,1,1,1,1,1,1,1,1,1,5,5,0,0,0,0],
      [0,5,5,1,1,1,2,2,1,1,1,1,1,1,2,2,1,1,1,5,5,0,0,0],
      [5,5,1,1,1,2,4,2,1,1,1,1,1,1,2,4,2,1,1,1,5,5,0,0],
      [5,5,1,1,1,2,4,2,1,1,1,1,1,1,2,4,2,1,1,1,5,5,0,0],
      [5,5,1,1,1,2,2,2,1,1,1,1,1,1,2,2,2,1,1,1,5,5,0,0],
      [5,5,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,5,5,0,0,0],
      [5,5,5,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,5,5,5,0,0,0],
      [5,5,5,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,5,5,5,0,0],
      [5,5,5,0,0,1,1,1,1,2,2,2,2,2,2,1,1,0,0,5,5,5,0,0],
      [5,5,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,0,0,0,5,5,0,0],
      [0,0,0,0,0,0,1,1,1,1,1,0,0,1,1,1,1,1,0,0,0,0,0,0],
      [0,0,0,0,0,0,1,1,1,0,0,0,0,0,0,1,1,1,0,0,0,0,0,0],
      [0,0,0,0,0,1,1,1,0,0,0,0,0,0,0,0,1,1,1,0,0,0,0,0],
      [0,0,0,0,0,2,2,2,0,0,0,0,0,0,0,0,2,2,2,0,0,0,0,0],
    ],
    [ // frame B — cape flares, glow pulses
      [0,0,0,0,0,0,0,0,3,0,0,3,3,0,0,3,0,0,0,0,0,0,0,0],
      [0,0,0,0,0,0,0,0,3,0,0,3,3,0,0,3,0,0,0,0,0,0,0,0],
      [0,0,0,0,0,0,0,3,3,3,3,3,3,3,3,3,3,0,0,0,0,0,0,0],
      [0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0],
      [0,0,0,0,0,0,1,2,2,2,2,2,2,2,2,2,2,1,0,0,0,0,0,0],
      [0,0,0,0,0,0,1,2,3,3,2,2,2,2,3,3,2,1,0,0,0,0,0,0],
      [0,0,0,0,0,0,1,2,2,2,2,2,2,2,2,2,2,1,0,0,0,0,0,0],
      [0,0,0,0,0,0,1,2,4,2,2,4,4,2,2,4,2,1,0,0,0,0,0,0],
      [0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0],
      [0,0,0,5,0,1,1,1,1,1,1,1,1,1,1,1,1,1,0,5,0,0,0,0],
      [0,5,5,5,1,1,1,1,1,1,1,1,1,1,1,1,1,1,5,5,5,0,0,0],
      [5,5,5,1,1,1,2,2,1,1,1,1,1,1,2,2,1,1,1,5,5,5,0,0],
      [5,5,1,1,1,2,3,2,1,1,1,1,1,1,2,3,2,1,1,1,5,5,0,0],
      [5,5,1,1,1,2,3,2,1,1,1,1,1,1,2,3,2,1,1,1,5,5,0,0],
      [5,5,1,1,1,2,2,2,1,1,1,1,1,1,2,2,2,1,1,1,5,5,0,0],
      [5,5,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,5,5,5,0,0],
      [5,5,5,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,5,5,5,5,0,0],
      [5,5,5,5,0,1,1,1,1,1,1,1,1,1,1,1,1,0,5,5,5,5,0,0],
      [5,5,5,5,0,0,1,1,1,2,2,2,2,2,2,1,0,0,5,5,5,5,0,0],
      [5,5,5,0,0,0,1,1,1,1,1,1,1,1,1,1,0,0,0,5,5,5,0,0],
      [0,0,0,0,0,0,1,1,1,1,1,0,0,1,1,1,1,1,0,0,0,0,0,0],
      [0,0,0,0,0,0,1,1,1,0,0,0,0,0,0,1,1,1,0,0,0,0,0,0],
      [0,0,0,0,0,1,1,1,0,0,0,0,0,0,0,0,1,1,1,0,0,0,0,0],
      [0,0,0,0,0,2,2,2,0,0,0,0,0,0,0,0,2,2,2,0,0,0,0,0],
    ],
  ],
  palette: { 1: '#a878e0', 2: '#5c3a8a', 3: '#ffd54a', 4: '#ff3b6b', 5: '#c22f42' },
  anchor: { x: 12, y: 12 },
  box: { w: 24, h: 24 },
};

// ===========================================================================
// SPRITES — keyed by enemy typeId (mapping table at the top of this file).
// Each: { frames, palette, anchor (center), box } — box/anchor derived from
// frame 0 via spriteBox so they can never drift from the pixels.
// ===========================================================================
function makeSprite(frames, palette) {
  const box = spriteBox(frames[0]);
  return { frames, palette, anchor: { x: Math.floor(box.w / 2), y: Math.floor(box.h / 2) }, box };
}

export const SPRITES = {
  CHASER:   makeSprite(GHOUL_FRAMES, GHOUL_PALETTE),
  SWARMER:  makeSprite(BAT_FRAMES, BAT_PALETTE),
  BRUTE:    makeSprite(BRUTE_FRAMES, BRUTE_PALETTE),
  SPITTER:  makeSprite(TOAD_FRAMES, TOAD_PALETTE),
  WARLOCK:  makeSprite(WARLOCK_FRAMES, WARLOCK_PALETTE),
  TICK:     makeSprite(TICK_FRAMES, TICK_PALETTE),
  COLOSSUS: makeSprite(DEMON_FRAMES, DEMON_PALETTE),
  DASHER:   makeSprite(SKELETON_FRAMES, SKELETON_PALETTE),
};

// Named archetypes for direct reuse (portraits, menus, hb3's loot/arches).
export const SPRITE_ARCHETYPES = {
  SKELETON: SPRITES.DASHER,
  DEMON: SPRITES.COLOSSUS,
  BAT: SPRITES.SWARMER,
  MAGE: SPRITES.SPITTER,
  WIZARD: SPRITES.WARLOCK,
  EVIL_KNIGHT: SPRITES.BRUTE,
  STICK_FIGURE: SPRITES.CHASER,
  TICK: SPRITES.TICK,
};

// Flame palette + convenience frame bundles for FX callers.
export const FLAME = {
  frames: FLAME_FRAMES,
  small: SMALL_FLAME_FRAMES,
  palette: FLAME_PALETTE,
  anchor: { x: 4, y: 6 },
  smallAnchor: { x: 2, y: 3 },
};

// ===========================================================================
// WAVE-12 HUD ICONS — small pixel grids for the canvas HUD chrome (render.js)
// and the FIELD REPORT stats overlay (main.js). Same convention as sprites:
// rows of palette indices, 0 = transparent, 1..3 = palette keys.
// ===========================================================================

// 5x5 icon per weapon archetype (VOLLEY included — the base volley is slot 1).
// Distinct silhouettes at a glance: dart / bolt / ring / beam / angle /
// missile / burst / blade / mine.
export const WEAPON_ICONS = {
  VOLLEY: [ // dart, flight right
    [0,0,1,0,0],
    [0,0,0,1,0],
    [1,1,1,1,1],
    [0,0,0,1,0],
    [0,0,1,0,0],
  ],
  ZAP: [ // lightning bolt
    [0,0,0,1,1],
    [0,0,1,1,0],
    [0,1,1,0,0],
    [1,1,0,0,0],
    [1,0,0,0,0],
  ],
  ORBIT: [ // ring around a core
    [0,1,1,1,0],
    [1,0,0,0,1],
    [1,0,3,0,1],
    [1,0,0,0,1],
    [0,1,1,1,0],
  ],
  BEAM: [ // horizontal laser, hot tip
    [0,0,0,0,0],
    [0,0,0,0,0],
    [1,1,1,2,3],
    [0,0,0,0,0],
    [0,0,0,0,0],
  ],
  BOOMERANG: [ // thrown angle
    [1,0,0,0,0],
    [0,1,0,0,0],
    [0,0,1,0,0],
    [0,0,1,1,1],
    [0,0,1,0,0],
  ],
  SEEKER: [ // missile with fins
    [0,0,1,0,0],
    [0,0,2,0,0],
    [0,1,2,1,0],
    [0,0,2,0,0],
    [1,0,0,0,1],
  ],
  NOVA_PULSE: [ // radial burst
    [0,0,1,0,0],
    [0,1,0,1,0],
    [1,0,2,0,1],
    [0,1,0,1,0],
    [0,0,1,0,0],
  ],
  SCYTHE: [ // curved blade on a shaft
    [0,1,1,1,0],
    [1,0,0,0,1],
    [0,0,0,0,1],
    [0,0,0,1,0],
    [0,0,1,0,0],
  ],
  MINE: [ // spiked disc, armed core
    [0,0,1,0,0],
    [0,1,1,1,0],
    [1,1,2,1,1],
    [0,1,1,1,0],
    [0,0,1,0,0],
  ],
  // ---- TIER-2(e) NEW WEAPONS (2026-09-23): 5x5 HUD icons, distinct
  // silhouettes at a glance (the section's rule).
  JAVELIN: [ // spear on the flight diagonal
    [0,0,0,1,3],
    [0,0,1,3,0],
    [0,1,3,0,0],
    [1,3,0,0,0],
    [3,0,0,0,0],
  ],
  EMBER: [ // compact flame
    [0,0,1,0,0],
    [0,1,2,1,0],
    [0,1,2,1,0],
    [1,2,2,2,1],
    [0,1,1,1,0],
  ],
  RICOCHET: [ // ball with a bounce chevron
    [3,0,0,0,3],
    [0,3,0,3,0],
    [0,0,1,0,0],
    [0,1,2,1,0],
    [1,1,2,1,1],
  ],
  METEOR: [ // flaming rock, tail up-left
    [1,0,0,0,0],
    [0,1,0,0,1],
    [0,0,1,1,1],
    [0,0,1,2,1],
    [0,0,1,1,1],
  ],
};
export const WEAPON_ICON_PALETTE = { 1: '#c8e8ff', 2: '#ff9a3c', 3: '#ffd75e' };

// Generic 4x4 equipment gem — rendered fully tinted by the item's rarity
// (COMMON grey / RARE blue / EPIC purple / LEGENDARY orange in render.js).
export const ITEM_ICON_GRID = [
  [0,1,1,0],
  [1,1,1,1],
  [1,1,1,1],
  [0,1,1,0],
];

// 5x5 weather glyphs, top-right of the canvas. CLEAR shows nothing — an empty
// sky needs no icon. Each entry carries its own palette (sky-tinted).
export const WEATHER_ICONS = {
  RAIN: {
    grid: [ // cloud + falling drops
      [0,1,1,1,0],
      [1,1,1,1,1],
      [1,1,1,1,1],
      [0,2,0,2,0],
      [2,0,2,0,0],
    ],
    palette: { 1: '#8ab0e8', 2: '#5a8ad8' },
  },
  SNOW: {
    grid: [ // six-arm flake
      [1,0,1,0,1],
      [0,1,1,1,0],
      [1,1,2,1,1],
      [0,1,1,1,0],
      [1,0,1,0,1],
    ],
    palette: { 1: '#d8e8ff', 2: '#8ac8f0' },
  },
  WIND: {
    grid: [ // racing dashes
      [0,0,0,0,0],
      [1,1,1,0,0],
      [0,0,2,2,2],
      [0,1,1,0,0],
      [0,0,0,0,0],
    ],
    palette: { 1: '#aebfd0', 2: '#d8e8f0' },
  },
  CLOUDY: {
    grid: [ // flat cloud bank
      [0,1,1,1,0],
      [1,1,1,1,1],
      [1,1,1,1,1],
      [0,0,0,0,0],
      [0,0,0,0,0],
    ],
    palette: { 1: '#8a8aa8' },
  },
  SUNNY: {
    grid: [ // sun disc + rays
      [1,0,1,0,1],
      [0,1,1,1,0],
      [1,1,2,1,1],
      [0,1,1,1,0],
      [1,0,1,0,1],
    ],
    palette: { 1: '#ffd75e', 2: '#fff2b0' },
  },
  MOONLIGHT: {
    grid: [ // crescent moon
      [0,1,1,0,0],
      [1,1,0,0,0],
      [1,1,0,0,0],
      [1,1,0,0,0],
      [0,1,1,0,0],
    ],
    palette: { 1: '#d8ffb0' },
  },
};

// weatherIcon(def) -> { grid, palette } | null. CLEAR (and anything unknown)
// shows no icon. render.js keys off this; tests use it as the honest seam.
export function weatherIcon(def) {
  if (!def || !def.id || def.id === 'CLEAR') return null;
  return WEATHER_ICONS[def.id] || null;
}

