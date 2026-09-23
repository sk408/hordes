// HORDES — PORT SLICE K2: original shrine altar art (owner queue: SHRINE ART
// THEME UPDATE — altar/shrine retheme off docs/gen_ref/shrine-altars/).
//
// REFERENCE VOCABULARY ONLY (no foreign pixels — every grid below is
// hand-composed in hordes' integer-grid style):
//   floating cyan orb over a carved basin (the ORB altar)
//     <- docs/gen_ref/shrine-altars/01-energy-altar.png (stone altar,
//        offering basin, orb hovering in the gap above it)
//   copper coil pillar under a hovering iron ring (the COIL altar)
//     <- docs/gen_ref/shrine-altars/02-magnet-shrine.png (stacked coil
//        ridges, flat metal disc hovering over the column with a see-through
//        hole, spark flecks in the gap)
//   hooded hunched statue + chest-glow core (the HOOD altar)
//     <- docs/gen_ref/shrine-altars/04-cursed-statue.png (pointed hood,
//        face void, sickly green chest cavity, stepped brick plinth)
//   stepped plinth massing (all three, shared rows 9-11)
//     <- the same reference set's stone bases + the K2 house massing
//   DROPPED from the five: 03-challenge-brazier.png (reads as the retired
//   ember brazier — least change from the current set; its bowl-on-base
//   massing also collides with the orb altar at 14x12) and
//   05-king-statue.png (figure-on-plinth silhouette collides with the hood
//   statue at 14x12; gold trim also fights the coil's warm copper).
//
// HONEST DISPLAY (the chest-slice rule, applied here):
//   A hordes run shrine is { x, y, used } (shrines.js seedShrines) — it
//   carries NO blessing. The blessing is rolled + cached on first proximity
//   (main.js shrine loop) but stays HIDDEN until purchase: the sale toast
//   names it only after the debit, and the broke toast names only the cost.
//   So no world sprite can truthfully claim a blessing ahead of the sale —
//   per-blessing colors would LEAK the roll (an information change, parked
//   under OWNER-RULING in docs/art/port-slice-k2/notes.md). The world
//   therefore paints per-INDEX designs: variant = position in state.shrines,
//   stable for the whole run (S1: the set is seeded once, never re-seeded),
//   carrying zero blessing information either way.
//
// DARKENING SEMANTICS (frozen): lit = !sh.used. A used altar paints the same
// grid in the SPENT greys with no aura and no coin glyph — the field still
// reads spent exactly as before (render.js shrine block).
//
// Format: grids of integer palette indices (0 = transparent), palettes keyed
// 1-8 with #rrggbb inks, rows = the derived digit-string view. The module is
// NOT enumerated in ART_ASSETS (chest-slice precedent), so the art-lint
// counts do not move; the slice-K2 test verifies this same format.
export const SHRINE_VARIANTS = ['orb', 'coil', 'hood'];

// Shared spent palette: the exhausted read — grey stone, no hue tells.
export const SHRINE_SPENT = {
  1: '#101014', 2: '#2c2c34', 3: '#4a4a56', 4: '#6a6a76',
  5: '#8a8a96', 6: '#3a3a44', 7: '#a8a8b8', 8: '#0a0a0c',
};

// Authoring rows ('.' = transparent, digits = ink). All three share the
// stepped plinth massing (rows 9-11) + a vertical figure/object above.
const ROWS = {
  orb: [
    '.....44.......',
    '....4554......',
    '.....44.......',
    '..............',
    '..1111111111..',
    '.166677666661.',
    '.123333333321.',
    '...18333381...',
    '...13633631...',
    '....113311....',
    '..1113333111..',
    '.111333333111.',
  ],
  coil: [
    '12333333333321',
    '1233......3321',
    '.7........7...',
    '...18444481...',
    '...14554441...',
    '...16666661...',
    '...14444441...',
    '...16666661...',
    '...12444421...',
    '....113311....',
    '..1113333111..',
    '.111333333111.',
  ],
  hood: [
    '......11......',
    '.....1321.....',
    '....133331....',
    '....166661....',
    '...18333381...',
    '..1334444331..',
    '..1347557431..',
    '..1334444331..',
    '...13366331...',
    '....133331....',
    '..1113333111..',
    '.111333333111.',
  ],
};

// Per-variant lit palettes. Keys: 1 ink, 2 stone-dark, 3 stone, 4 trim (the
// variant's marker ink), 5 trim-hi (also the blink glint ink), 6 dark
// detail, 7 bright tell, 8 shadow.
const PALETTES = {
  orb: {
    1: '#1c1610', 2: '#5c4e3c', 3: '#8c7a5e', 4: '#30d8f0',
    5: '#d8ffff', 6: '#3a2e22', 7: '#7af0e8', 8: '#0e0a08',
  },
  coil: {
    1: '#14100c', 2: '#4a4a54', 3: '#7a7a88', 4: '#d08848',
    5: '#ffc888', 6: '#2a2a32', 7: '#9ad8ff', 8: '#0a0a0e',
  },
  hood: {
    1: '#101410', 2: '#3a4a3a', 3: '#5a6e5a', 4: '#7ae040',
    5: '#c8ffa8', 6: '#243024', 7: '#8aff70', 8: '#0a0e0a',
  },
};

// Lit blink pixels ([dx, dy]) per variant, painted in ink 5 over the tell.
const GLINTS = {
  orb: [[5, 1], [6, 1]],
  coil: [[5, 4], [6, 4]],
  hood: [[6, 6], [7, 6]],
};

function buildGrid(rows) {
  return rows.map((r) => [...r].map((c) => (c === '.' ? 0 : (c | 0))));
}

function finish(id, grid, palette, glint) {
  return {
    id, w: grid[0].length, h: grid.length, grid, palette,
    rows: grid.map((r) => r.join('')),
    glint: glint || null,   // lit blink pixels ([dx, dy]), painted in ink 5
  };
}

function entryFor(key) {
  const grid = buildGrid(ROWS[key]);
  return finish('shrine_' + key, grid, PALETTES[key], GLINTS[key]);
}

export const SHRINE_ART = {
  orb: entryFor('orb'),
  coil: entryFor('coil'),
  hood: entryFor('hood'),
};

// Resolve display art by shrine INDEX (position in state.shrines) — never by
// blessing (honest display: the world sprite must not leak the hidden roll).
// Out-of-range / unknown indices fall back to the first variant.
export function shrineArtFor(index) {
  const i = Number.isInteger(index) ? index : 0;
  const key = SHRINE_VARIANTS[((i % SHRINE_VARIANTS.length) + SHRINE_VARIANTS.length) % SHRINE_VARIANTS.length];
  return SHRINE_ART[key] || SHRINE_ART[SHRINE_VARIANTS[0]];
}

// Pure painter: integer fillRects only, never text. `lit` selects the lit
// palette (plus the glint pixels); otherwise the shared SPENT greys.
export function paintShrine(g, art, x, y, lit) {
  const pal = lit ? art.palette : SHRINE_SPENT;
  const grid = art.grid;
  for (let ry = 0; ry < grid.length; ry++) {
    const row = grid[ry];
    for (let rx = 0; rx < row.length; rx++) {
      const v = row[rx];
      if (v) { g.fillStyle = pal[v]; g.fillRect(x + rx, y + ry, 1, 1); }
    }
  }
  if (lit && art.glint) {
    g.fillStyle = pal[5];
    for (const [dx, dy] of art.glint) g.fillRect(x + dx, y + dy, 1, 1);
  }
  return true;
}
