// HORDES — PORT SLICE K2: original shrine altar art (owner queue: megabonk
// shrines + VS).
//
// REFERENCE VOCABULARY ONLY (no foreign pixels — every grid below is
// hand-composed in hordes' integer-grid style):
//   brazier bowl + flame cleft (the EMBER altar)
//     <- docs/mb_ref/art/shrines/FBX_ChallengeShrine_Color.png (challenge
//        shrine: raised fire bowl on a plinth)
//   broad idol head + brow band + eye glints (the IDOL altar)
//     <- docs/mb_ref/art/shrines/FBX_BanditStatue_Color.png,
//        FBX_CursedStatue_Color.png, FBX_SkeletonKingStatue_Color.png
//        (statue triptych: plinth + robed body + heavy head)
//   tall tapering crystal + facet line + collar (the PYLON altar)
//     <- docs/mb_ref/art/shrines/B_Pylon_Color.png (+ _Emission.png:
//        the emissive core reads as the altar's lit tell),
//        FBX_EnergyAltar_Emission.png (altar glow),
//        FBX_MagnetShrine_Color.png (compact shrine massing)
//   plinth + figure + glow massing (all three)
//     <- docs/vs_port_ref/ section 6 props (2D-native altar/shrine-adjacent
//        props: stone base, vertical figure, readable silhouette). Section 6
//        is concept-only (no thumbs extracted) — the SILHOUETTE is the anchor.
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
export const SHRINE_VARIANTS = ['ember', 'idol', 'pylon'];

// Shared spent palette: the exhausted read — grey stone, no hue tells.
export const SHRINE_SPENT = {
  1: '#101014', 2: '#2c2c34', 3: '#4a4a56', 4: '#6a6a76',
  5: '#8a8a96', 6: '#3a3a44', 7: '#a8a8b8', 8: '#0a0a0c',
};

// Authoring rows ('.' = transparent, digits = ink). All three share the
// VS-anchored massing: stepped plinth (rows 9-11) + vertical figure.
const ROWS = {
  ember: [
    '....111111....',
    '..1114444111..',
    '..1445555441..',
    '...14455441...',
    '.....1441.....',
    '....111111....',
    '.....1331.....',
    '.....1331.....',
    '.....1331.....',
    '....113311....',
    '..1113333111..',
    '.111333333111.',
  ],
  idol: [
    '......11......',
    '.....1111.....',
    '....111111....',
    '....133331....',
    '....144441....',
    '....176671....',
    '....133331....',
    '...11333311...',
    '...13344331...',
    '....133331....',
    '..1113333111..',
    '.111333333111.',
  ],
  pylon: [
    '......11......',
    '.....1441.....',
    '.....1441.....',
    '.....1741.....',
    '.....1741.....',
    '.....1741.....',
    '....114411....',
    '.....1331.....',
    '.....1331.....',
    '....113311....',
    '..1113333111..',
    '.111333333111.',
  ],
};

// Per-variant lit palettes. Keys: 1 ink, 2 stone-dark, 3 stone, 4 trim (the
// variant's marker ink), 5 trim-hi (also the blink glint ink), 6 dark
// detail, 7 bright tell, 8 shadow.
const PALETTES = {
  ember: {
    1: '#1c1008', 2: '#4a2c14', 3: '#7a5230', 4: '#ff8c3e',
    5: '#ffd75e', 6: '#3a2412', 7: '#ff5e3e', 8: '#0d0704',
  },
  idol: {
    1: '#0e1420', 2: '#2c3a4a', 3: '#5a6e84', 4: '#7de0a8',
    5: '#d8ffe8', 6: '#223040', 7: '#4a8cff', 8: '#070b10',
  },
  pylon: {
    1: '#100a24', 2: '#3a2b5a', 3: '#6a4f94', 4: '#c46ad8',
    5: '#f0c8ff', 6: '#2c1c44', 7: '#b9d2ff', 8: '#0a0614',
  },
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
  return finish('shrine_' + key, grid, PALETTES[key], [[6, 2], [7, 2]]);
}

export const SHRINE_ART = {
  ember: entryFor('ember'),
  idol: entryFor('idol'),
  pylon: entryFor('pylon'),
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
