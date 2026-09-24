// HORDES — ARCH ART PASS: original field-arch art (owner queue: "generate
// replacement arches" — same treatment as the shrine retheme, for the field
// arches). Logic stays in src/arches.js; this module is art only.
//
// REFERENCE VOCABULARY ONLY (no foreign pixels — every grid below is
// hand-composed in hordes' integer-grid style):
//   twin flame-topped pillars + burning lintel (TWIN FURY / DOUBLE_FIRE)
//     <- docs/gen_ref/field-arches/01-twin-fury.png + 02-twin-fury-alt.png
//        (paired flame columns, fire crest, ember flecks in the opening)
//   iron pillars with blue pole strips under a horseshoe crest (MAGNET)
//     <- docs/gen_ref/field-arches/03-magnet.png (U-magnet massing, coil
//        ridges, field-line dashes across the gate void)
//   plated shield-face lintel + riveted boss (AEGIS / SHIELD)
//     <- docs/gen_ref/field-arches/04-aegis.png + 05-aegis-alt.png
//        (broad aegis plate, dome boss, column flanks like shield edges)
//   sawtooth crest + claw-scored red pillars (BERSERKER / BERSERK)
//     <- docs/gen_ref/field-arches/06-berserker.png (jagged broken crown,
//        angry spikes, gashed pillar faces)
//   swept wing lintel + wind streaks (ZEPHYR / SWIFT)
//     <- docs/gen_ref/field-arches/07-zephyr.png (airy wind-swept topper,
//        lighter columns, motion dashes through the gate void)
//
// FOOTPRINT (honest to the replaced procedural block): the old pillars/
// lintel/cap filled x-12..x+12 by y-21..y+13 around the ground point with
// cull(x, y, 30). Every variant below is 24x35 so the designed arch occupies
// that exact on-screen class (24 wide / 35 tall, inside the brief's 20-26 x
// 30-40). Ground point = column 12, row 21 (the walk-through centre), so a
// painter call of (x - 12, y - 21) reproduces the old anchor exactly.
//
// IDENTITY: key 4 is the type ink and equals ARCH_COLORS[type] verbatim
// (render.js) — orange #ff8848 / blue #4a8cff / ice #a8e0ff / red #ff5566 /
// green #68e080 — and is the dominant cladding pixel in each grid, so the
// buff a gate grants still reads at a glance.
//
// Format: grids of integer palette indices (0 = transparent), palettes keyed
// 1-8 with #rrggbb inks, rows = the derived digit-string view. The module is
// NOT enumerated in ART_ASSETS (chest-slice / shrine-slice precedent), so the
// art-lint counts do not move.
export const ARCH_VARIANTS = ['twin_fury', 'magnet', 'aegis', 'berserker', 'zephyr'];

// Type -> variant key (the 5 ARCH_TYPES from arches.js). Unknown types fall
// back to twin_fury via archArtFor.
export const ARCH_TYPE_KEYS = {
  DOUBLE_FIRE: 'twin_fury',
  MAGNET: 'magnet',
  SHIELD: 'aegis',
  BERSERK: 'berserker',
  SWIFT: 'zephyr',
};

// Shared spent palette: the exhausted read — grey stone, no hue tells
// (same discipline as SHRINE_SPENT).
export const ARCH_SPENT = {
  1: '#101014', 2: '#2c2c34', 3: '#4a4a56', 4: '#6a6a76',
  5: '#8a8a96', 6: '#3a3a44', 7: '#a8a8b8', 8: '#0a0a0c',
};

// Authoring rows ('.' = transparent, digits = ink). All five are 24x35:
// rows 0-2 crest, 3-6 lintel, 7-34 pillars/feet with a round-topped void
// (cols 4-19) and the ground point at (12, 21).
const ROWS = {
  // Twin Fury: 3 flame tongues over a fire-jointed lintel; orange pillars
  // with dark flutes; ember flecks hang in the opening.
  twin_fury: [
    '......4..55..55..4......',
    '.....454.55.55.454......',
    '....1454155555514541....',
    '.1244444444444444444421.',
    '.1245664444444444665421.',
    '.1244444444444444444421.',
    '..12444444444444444421..',
    '...14441........14441...',
    '...14641...5....14641...',
    '...14441........14441...',
    '..144441...7....144441..',
    '..146441........146441..',
    '..144441........144441..',
    '..144441...5....144441..',
    '..146441........146441..',
    '..144441........144441..',
    '..144441........144441..',
    '..146441...7....146441..',
    '..144441........144441..',
    '..144441........144441..',
    '..146441........146441..',
    '..144441...5....144441..',
    '..144441........144441..',
    '..146441........146441..',
    '..144441........144441..',
    '..144441........144441..',
    '..146441........146441..',
    '..144441........144441..',
    '..144441........144441..',
    '..146441........146441..',
    '..144441........144441..',
    '..144441........144441..',
    '.12444441......14444421.',
    '1244444441....1444444421',
    '111111111111111111111111',
  ],
  // Magnet: horseshoe crest with pole caps; blue cladding over coil-ridge
  // rows (ink 6); field-line dashes drift across the void.
  magnet: [
    '.....4............4.....',
    '.....44..........44.....',
    '....14441......14441....',
    '.1244333333333333334421.',
    '.1243636363636363634421.',
    '.1244333333333333334421.',
    '..12444444444444444421..',
    '...14441........14441...',
    '...14641..5.....14641...',
    '...14441........14441...',
    '..144441...7....144441..',
    '..146441........146441..',
    '..144441.....5..144441..',
    '..144441........144441..',
    '..146441...7....146441..',
    '..144441........144441..',
    '..144441..5.....144441..',
    '..146441........146441..',
    '..144441...7....144441..',
    '..144441........144441..',
    '..146441.....5..146441..',
    '..144441........144441..',
    '..144441...7....144441..',
    '..146441........146441..',
    '..144441..5.....144441..',
    '..144441........144441..',
    '..146441...7....146441..',
    '..144441........144441..',
    '..144441.....5..144441..',
    '..146441........146441..',
    '..144441...7....144441..',
    '..144441........144441..',
    '.12444441......14444421.',
    '1244444441....1444444421',
    '111111111111111111111111',
  ],
  // Aegis: dome boss crest over a riveted lintel (ink 5 rivets); plate
  // courses (ink 3) alternate down the piers; the void stays clear.
  aegis: [
    '.........45554..........',
    '........4577754.........',
    '.......145555541........',
    '.1233333333333333333321.',
    '.1245445445445445445421.',
    '.1244444444444444444421.',
    '..12333333333333333321..',
    '...14441........14441...',
    '...14341........14431...',
    '...14441........14441...',
    '..144441........144441..',
    '..143441........144431..',
    '..144441........144441..',
    '..143441........144431..',
    '..144441........144441..',
    '..143441........144431..',
    '..144441........144441..',
    '..143441........144431..',
    '..144441........144441..',
    '..143441........144431..',
    '..144441........144441..',
    '..143441........144431..',
    '..144441........144441..',
    '..143441........144431..',
    '..144441........144441..',
    '..143441........144431..',
    '..144441........144441..',
    '..143441........144431..',
    '..144441........144441..',
    '..143441........144431..',
    '..144441........144441..',
    '..143441........144431..',
    '.12444441......14444421.',
    '1244444441....1444444421',
    '111111111111111111111111',
  ],
  // Berserker: sawtooth crest (12 spikes) over a cracked lintel; claw-scored
  // piers (ink 6 gashes); jagged void teeth (ink 4) bite inward.
  berserker: [
    '4.4.4.4.4.4.4.4.4.4.4.4.',
    '454545454545454545454545',
    '144544445444454445444541',
    '.1244444444444444444421.',
    '.1245664444446444665421.',
    '.1244444444144444444421.',
    '..12444444444444444421..',
    '...14441.....4..14441...',
    '...14641........14641...',
    '...14441..4.....14441...',
    '..144441.....4..144441..',
    '..146441........146441..',
    '..144441..4.....144441..',
    '..144441...5....144441..',
    '..146441.....4..146441..',
    '..144441........144441..',
    '..144441..4.....144441..',
    '..146441........146441..',
    '..144441.....4..144441..',
    '..144441........144441..',
    '..146441..4.....146441..',
    '..144441...7....144441..',
    '..144441.....4..144441..',
    '..146441........146441..',
    '..144441..4.....144441..',
    '..144441........144441..',
    '..146441.....4..146441..',
    '..144441..4.....144441..',
    '..144441........144441..',
    '..146441.....4..146441..',
    '..144441..4.....144441..',
    '..144441........144441..',
    '.12444441......14444421.',
    '1244444441....1444444421',
    '111111111111111111111111',
  ],
  // Zephyr: swept wing crest (asymmetric, wind-blown right); slim 5-wide
  // piers with plate dots (ink 3); wind streak dashes drift across the void.
  zephyr: [
    '..............4554......',
    '..........45554554......',
    '....45555545554554......',
    '.1233333333333333333321.',
    '.1234444444444444444421.',
    '.1235335335335335335421.',
    '..12333333333333333321..',
    '..14441..........14441..',
    '..14341..5.......14431..',
    '..14441..........14441..',
    '..14441.......5..14441..',
    '..14341..........14431..',
    '..14441....5.....14441..',
    '..14441..........14441..',
    '..14341.......5..14431..',
    '..14441..........14441..',
    '..14441..5.......14441..',
    '..14341..........14431..',
    '..14441.......5..14441..',
    '..14441..........14441..',
    '..14341....5.....14431..',
    '..14441..........14441..',
    '..14441.......5..14441..',
    '..14341..........14431..',
    '..14441..5.......14441..',
    '..14441..........14441..',
    '..14341.......5..14431..',
    '..14441..........14441..',
    '..14441....5.....14441..',
    '..14341..........14431..',
    '..14441.......5..14441..',
    '..14441..........14441..',
    '.12333331......13333321.',
    '1233333331....1333333321',
    '111111111111111111111111',
  ],
};

// Per-variant lit palettes. Keys: 1 ink, 2 stone-dark, 3 stone, 4 type ink
// (= ARCH_COLORS, the dominant cladding), 5 type-hi (glint), 6 dark detail,
// 7 bright tell, 8 shadow.
const PALETTES = {
  twin_fury: {
    1: '#1c0a04', 2: '#5c3020', 3: '#8c5030', 4: '#ff8848',
    5: '#ffc090', 6: '#3a1808', 7: '#ffe0c0', 8: '#0e0402',
  },
  magnet: {
    1: '#0a0e1c', 2: '#3a4254', 3: '#6a7488', 4: '#4a8cff',
    5: '#a8d0ff', 6: '#1c2438', 7: '#d8f0ff', 8: '#04060c',
  },
  aegis: {
    1: '#0a141c', 2: '#3a5a6c', 3: '#6a8a9c', 4: '#a8e0ff',
    5: '#e8ffff', 6: '#1c3040', 7: '#ffffff', 8: '#040a10',
  },
  berserker: {
    1: '#1c0608', 2: '#5c2028', 3: '#8c3840', 4: '#ff5566',
    5: '#ffa0a8', 6: '#3a1014', 7: '#ffd0d4', 8: '#0e0204',
  },
  zephyr: {
    1: '#0a140c', 2: '#2c5c38', 3: '#4a8a58', 4: '#68e080',
    5: '#b0ffc0', 6: '#1a3a22', 7: '#e0ffe8', 8: '#040a06',
  },
};

// Lit blink pixels ([dx, dy]) per variant, painted in ink 5 over the tell
// (the keystone glint, same blink role as the old 2x2 keystone spark).
const GLINTS = {
  twin_fury: [[11, 4], [12, 4]],
  magnet: [[11, 5], [12, 5]],
  aegis: [[11, 3], [12, 3]],
  berserker: [[11, 4], [12, 4]],
  zephyr: [[13, 4], [14, 4]],
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
  return finish('arch_' + key, grid, PALETTES[key], GLINTS[key]);
}

export const ARCH_ART = {
  twin_fury: entryFor('twin_fury'),
  magnet: entryFor('magnet'),
  aegis: entryFor('aegis'),
  berserker: entryFor('berserker'),
  zephyr: entryFor('zephyr'),
};

// Resolve display art by ARCH type (arches.js ARCH_TYPES id). Unknown types
// fall back to the first variant.
export function archArtFor(type) {
  const key = ARCH_TYPE_KEYS[type] || ARCH_VARIANTS[0];
  return ARCH_ART[key] || ARCH_ART[ARCH_VARIANTS[0]];
}

// Pure painter: integer fillRects only, never text. `active` selects the lit
// palette (plus the glint pixels); otherwise the shared SPENT greys.
// Anchor: (x, y) is the grid's top-left; ground point is (x + 12, y + 21).
export function paintArch(g, art, x, y, active) {
  const pal = active ? art.palette : ARCH_SPENT;
  const grid = art.grid;
  for (let ry = 0; ry < grid.length; ry++) {
    const row = grid[ry];
    for (let rx = 0; rx < row.length; rx++) {
      const v = row[rx];
      if (v) { g.fillStyle = pal[v]; g.fillRect(x + rx, y + ry, 1, 1); }
    }
  }
  if (active && art.glint) {
    g.fillStyle = pal[5];
    for (const [dx, dy] of art.glint) g.fillRect(x + dx, y + dy, 1, 1);
  }
  return true;
}
