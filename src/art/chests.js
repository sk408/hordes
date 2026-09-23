// HORDES — PORT SLICE K: original chest art (owner-priority "good chest art").
//
// REFERENCE VOCABULARY ONLY (no foreign pixels — every grid below is
// hand-composed in hordes' integer-grid style):
//   sealed/common closed silhouette (arched lid, gold bands, lock plate)
//     <- docs/mb_ref/art/chests/psd_Chest.png (closed chest)
//   open frames (raised lid slab + dark mouth + contents glow)
//     <- docs/mb_ref/art/chests/psd_ChestOpen.png (open chest)
//   common plain-timber body  <- docs/mb_ref/art/chests/t_chest_normal.png
//   rare cool-steel trim      <- docs/mb_ref/art/chests/t_chestFree.png
//   epic ornate/crypt trim    <- docs/mb_ref/art/chests/t_chestFreeCrypt.png
//   gamble hazard/dark look   <- docs/mb_ref/tables/chest_types.json
//     EChest Corrupt/Ghost rows + docs/mb_ref/art/chests/CRATE_3C.png slats
//   legendary gold+fittings   <- psd_Chest.png bands/lock + the top rung of
//     docs/mb_ref/tables/rarity.json (Legendary)
//   trim inks == the house rarity inks (RARITY_TINTS main.js / RARITY_COLORS
//     render.js): COMMON #a8a8c0 RARE #4a8cff EPIC #c46ad8 LEGENDARY #ffd75e.
//
// HONEST DISPLAY (why the world shows ONE sealed chest):
//   A hordes field chest is { id, x, y, age } (chests.js maybeSpawnChest) —
//   it carries NO rarity. The band is rolled at OPEN time (chests.js
//   rollContents, consumed by tickChests), so no world sprite can truthfully
//   claim a band ahead of the roll (the owner-ruled LEGENDARY-label fix,
//   main.js, exists because a false rarity claim already burned us once).
//   The world therefore paints the SEALED design (unknown contents); the TRUE
//   band paints once it is known — as the OPEN remnant under the chest's item
//   drop (main.js stamps the drop with the rolled band; render.js paints the
//   band's open frame beneath the untouched item glyph). `ch.band` is a
//   capture/test-only display override the game never writes (pinned).
//
// GAMBLE IS NOT A RARITY (owner decision, chests.js): it keeps its own
// moment look here, flagged as such — never a member of CHEST_BANDS.
//
// Format: grids of integer palette indices (0 = transparent), palettes keyed
// 1-9 with #rgb/#rrggbb inks, rows = the derived digit-string view. The
// module is NOT enumerated in ART_ASSETS (escape-sprite precedent), so the
// art-lint counts do not move; the slice-K test verifies this same format.
export const CHEST_BANDS = ['common', 'rare', 'epic', 'legendary'];
export const GAMBLE_KEY = 'gamble';
export const SEALED_KEY = 'sealed';

const W_C = 14, H_C = 10;   // closed box
const W_O = 14, H_O = 12;   // open box

function blank(w, h) {
  const g = [];
  for (let y = 0; y < h; y++) g.push(new Array(w).fill(0));
  return g;
}
function rect(g, x, y, w, h, v) {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      if (yy >= 0 && yy < g.length && xx >= 0 && xx < g[0].length) g[yy][xx] = v;
    }
  }
}

// Closed: ink silhouette, arched ridge, lid slab + lip shadow, timber body,
// base shade, twin trim bands (left band carries a hi glint line), lock
// plate + keyhole, feet. `s` selects the inks; `s.extras(g)` adds furniture.
function buildClosed(s) {
  const g = blank(W_C, H_C);
  rect(g, 0, 0, W_C, H_C, 1);
  rect(g, 3, 0, 8, 1, s.ridge);
  rect(g, 1, 1, 12, 2, s.slab);
  rect(g, 1, 3, 12, 1, s.shade);
  rect(g, 1, 4, 12, 4, s.body);
  rect(g, 1, 8, 12, 1, s.base);
  rect(g, 2, 1, 2, 8, s.band);
  rect(g, 10, 1, 2, 8, s.band);
  rect(g, 2, 1, 1, 8, s.bandHi);
  rect(g, 5, 3, 4, 4, s.lock);
  rect(g, 6, 4, 2, 2, 1);
  rect(g, 1, 9, 2, 1, s.lock);
  rect(g, 11, 9, 2, 1, s.lock);
  if (s.extras) s.extras(g);
  return g;
}

// Open: raised lid slab, trim mouth rim, dark mouth with a contents glow in
// the band's hi ink, body + bands + split hasp halves + feet.
function buildOpen(s) {
  const g = blank(W_O, H_O);
  rect(g, 0, 0, W_O, H_O, 1);
  rect(g, 3, 0, 8, 1, s.ridge);
  rect(g, 1, 1, 12, 2, s.slab);
  rect(g, 1, 3, 12, 1, s.band);
  rect(g, 2, 4, 10, 1, 8);
  rect(g, 6, 4, 2, 1, s.bandHi);
  rect(g, 1, 5, 12, 5, s.body);
  rect(g, 1, 10, 12, 1, s.base);
  rect(g, 2, 5, 2, 6, s.band);
  rect(g, 10, 5, 2, 6, s.band);
  rect(g, 2, 5, 1, 6, s.bandHi);
  rect(g, 4, 5, 2, 1, s.lock);
  rect(g, 8, 5, 2, 1, s.lock);
  rect(g, 1, 11, 2, 1, s.lock);
  rect(g, 11, 11, 2, 1, s.lock);
  if (s.extras) s.extras(g);
  return g;
}

function finish(id, grid, palette, glint) {
  return {
    id, w: grid[0].length, h: grid.length, grid, palette,
    rows: grid.map((r) => r.join('')),
    glint: glint || null,   // lit blink pixels ([dx, dy]), painted in ink 5
  };
}

// Per-band ink specs. Keys: 1 ink, 2 timber-dark, 3 timber, 4 trim,
// 5 trim-hi (also the blink glint ink), 6 lock metal, 7 bright fitting,
// 8 mouth dark, 9 white-hot (gamble/legendary cores only).
const SPECS = {
  common: {
    inks: { slab: 3, shade: 2, body: 3, base: 2, ridge: 2, band: 4, bandHi: 5, lock: 6 },
    palette: { 1: '#241a10', 2: '#5a4226', 3: '#8a6d3f', 4: '#6e6e7c', 5: '#c9c9d6', 6: '#3a3a44', 7: '#e8e8f0', 8: '#0d0a06' },
    extras: null,
  },
  rare: {
    inks: { slab: 3, shade: 2, body: 3, base: 2, ridge: 2, band: 4, bandHi: 5, lock: 6 },
    palette: { 1: '#10141f', 2: '#4a5468', 3: '#7c8aa0', 4: '#4a8cff', 5: '#b9d2ff', 6: '#2c3550', 7: '#eaf2ff', 8: '#070a10' },
    extras: (g) => {
      g[1][1] = 7; g[1][12] = 7; g[8][1] = 7; g[8][12] = 7;   // corner studs
    },
  },
  epic: {
    inks: { slab: 3, shade: 2, body: 3, base: 2, ridge: 2, band: 4, bandHi: 5, lock: 6 },
    palette: { 1: '#1c1024', 2: '#4a2b5a', 3: '#7a4f94', 4: '#c46ad8', 5: '#f0c8ff', 6: '#3d2450', 7: '#f7e8ff', 8: '#0d0712' },
    extras: (g) => {
      g[2][6] = 7;                                             // lid gem
      if (g.length > 7) { g[7][4] = 7; g[7][9] = 7; }           // rune studs
    },
  },
  legendary: {
    inks: { slab: 3, shade: 2, body: 3, base: 2, ridge: 5, band: 4, bandHi: 5, lock: 4 },
    palette: { 1: '#241a08', 2: '#6b4a26', 3: '#a8843f', 4: '#ffd75e', 5: '#fff2c0', 6: '#8a6a1e', 7: '#ff2f5e', 8: '#120c04', 9: '#ffffff' },
    extras: (g) => {
      g[3][8] = 7;                                             // lock gem
      if (g.length === H_C) g[4][6] = 9;                        // hot keyhole core
    },
  },
  gamble: {
    inks: { slab: 3, shade: 2, body: 3, base: 2, ridge: 2, band: 4, bandHi: 5, lock: 6 },
    palette: { 1: '#0d0a12', 2: '#1c1622', 3: '#3d2b4a', 4: '#7a2e3e', 5: '#ff9e9e', 6: '#241420', 7: '#ff5e3e', 8: '#050308', 9: '#ffffff' },
    extras: (g) => {
      for (const sx of [1, 4, 7, 10, 12]) g[0][sx] = 4;        // hazard spikes
      g[4][6] = 7; g[4][7] = 9;                                // hot keyhole
      const last = g.length - 2;
      g[last][1] = 7; g[last][12] = 7;                         // warning studs
    },
  },
  sealed: {
    inks: { slab: 3, shade: 2, body: 3, base: 2, ridge: 2, band: 4, bandHi: 4, lock: 6 },
    palette: { 1: '#141008', 2: '#3a2c1c', 3: '#5a4a30', 4: '#55555f', 5: '#c8a03a', 6: '#4a3a20', 8: '#0a0805' },
    extras: null,
  },
};

function entryFor(key) {
  const s = SPECS[key];
  const spec = { ...s.inks, extras: s.extras };
  const closed = finish('chest_' + key + '_closed', buildClosed(spec), s.palette, [[7, 3], [2, 5]]);
  if (key === SEALED_KEY) return { closed };
  const open = finish('chest_' + key + '_open', buildOpen(spec), s.palette, null);
  return { closed, open };
}

export const CHEST_ART = {
  common: entryFor('common'),
  rare: entryFor('rare'),
  epic: entryFor('epic'),
  legendary: entryFor('legendary'),
  gamble: entryFor('gamble'),
  sealed: entryFor('sealed'),
};

// Resolve display art. Unknown band -> sealed closed (never a false rarity
// claim); 'open' of the sealed chest -> its closed frame (a sealed chest is
// never open); unknown form -> closed.
export function chestArtFor(band, form) {
  const key = band === GAMBLE_KEY ? GAMBLE_KEY : (CHEST_ART[band] ? band : SEALED_KEY);
  const entry = CHEST_ART[key];
  if (form === 'open' && entry.open) return entry.open;
  return entry.closed;
}

// Pure painter: integer fillRects only, never text. `lit` adds the glint
// pixels (the world blink / the remnant shine) in palette ink 5.
export function paintChest(g, art, x, y, lit) {
  const pal = art.palette, grid = art.grid;
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
