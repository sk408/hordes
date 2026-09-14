// HORDES — the draft as a deck of pixel playing cards (CARD ART track, NEW FILE).
//
// SCOPE: self-contained by design. Nothing here is imported by the game yet and
// this module is deliberately NOT registered in src/art/index.js's ART_SECTIONS
// (the art-lint counts must not move); the orchestrator does the one wiring hook
// into the draft display after the W7b mechanics slice lands.
//
// THE DESIGN (docs/briefs/CARD_ART_PLAYING_CARDS.md — the owner's motif):
//   RANK = rarity:  number cards = COMMON, face cards (J/Q/K) = RARE,
//                   aces = MYTHIC, the two JOKERS = the two 1/10 chase cards
//                   (Second Wind red, Storm Shards black).
//   SUIT = family:  spades = damage, hearts = survival,
//                   diamonds = economy, clubs = utility.
// "King of Spades" reads as a rare damage card with no legend.
//
// THE FORMAT — the game's native integer-pixel grid, same as every src/art/*
// module: grid = number[][], 0 = TRANSPARENT, 1..9 = palette keys.
// THE DRAWGRID TRAP (house skill, load-bearing): drawGrid does a TRUTHY test on
// each cell, so authoring a frame as STRINGS ('.' for empty) paints every pixel
// with whatever fillStyle was left over — that is how a coin glyph once rendered
// as a solid block. The G() parser below turns digit-STRING rows into INTEGER
// grids at module load; what is painted is always numbers, 0 = empty.
//
// THE TEMPLATE — ONE shared frame, not 13 bespoke frames: 24x34 backing,
// transparent corner pixels (the card silhouette), a 1px ink keyline, a
// parchment body with a bottom-right inner shade line, the rank glyph (3x5) +
// suit pip (5x5) stamped top-left and rotated 180deg bottom-right, and the
// central motif. A future card is a MOTIF entry, not a new frame. The two
// jokers are the only full-art cards: no pips, a dark full-bleed body with an
// accent dotted inner frame, so they read as the most special cards in the deck.
//
// Sizing (brief-mandated, stated): 24x34 px backing, integer 3x display scale
// (72x102 CSS px), image-rendering: pixelated — measured in
// tools/verify_card_art.mjs.
import { makeAsset } from './format.js';

export const CARD_W = 24;
export const CARD_H = 34;

// Digit-string rows -> INTEGER grid. Parser output only; never paint strings.
const G = (...rows) => rows.map((r) => [...r].map((ch) => ch.charCodeAt(0) - 48));

// ---------------------------------------------------------------- ranks -----
// 3x5 glyphs. Number = COMMON, face = RARE, ace = MYTHIC, joker = the chase.
export const RANK_CLASS = { number: 'COMMON', face: 'RARE', ace: 'MYTHIC', joker: 'CHASE' };
const RANK_GLYPHS = {
  '2': G('111', '001', '111', '100', '111'),
  '5': G('111', '100', '111', '001', '111'),
  '6': G('111', '100', '111', '101', '111'),
  '7': G('111', '001', '010', '010', '010'),
  '8': G('111', '101', '111', '101', '111'),
  'J': G('011', '001', '001', '101', '010'),
  'Q': G('111', '101', '101', '111', '001'),
  'K': G('101', '101', '110', '101', '101'),
  'A': G('010', '101', '111', '101', '101'),
};

// ---------------------------------------------------------------- suits -----
// Suit colours on the GAME's palette, not a casino's: spades/clubs a dark
// slate from the ink family, hearts/diamonds the game's own red.
export const SUIT_COLOUR = { dark: '#2e3550', red: '#a02a2a' };
export const SUITS = {
  spades:   { family: 'damage',   colour: 'dark' },
  hearts:   { family: 'survival', colour: 'red'  },
  diamonds: { family: 'economy',  colour: 'red'  },
  clubs:    { family: 'utility',  colour: 'dark' },
};
const SUIT_PIPS = {
  spades:   G('00100', '01110', '11111', '00100', '01110'),
  hearts:   G('01010', '11111', '11111', '01110', '00100'),
  diamonds: G('00100', '01110', '11111', '01110', '00100'),
  clubs:    G('00100', '01110', '11011', '00100', '01110'),
};

// --------------------------------------------------------------- motifs -----
// Authored at natural size, stamped centered. Motif palette keys start at 5
// (1 ink keyline / 2 parchment / 3 shade / 4 suit are the frame's). Each motif
// keeps ink out of the two pip corners (top-left x<=6,y<=12 and the rotated
// bottom-right) so the pips always read.
const MOTIFS = {
  heart: {
    palette: { 5: '#c03a3a', 6: '#e04a4a', 7: '#5c1414' },
    grid: G(
      '055000550',
      '556555575',
      '556555575',
      '555555575',
      '055555750',
      '005555700',
      '000557000',
      '000050000',
    ),
  },
  boot: {
    palette: { 5: '#8a5f2c', 6: '#c89a2a', 7: '#4a3018' },
    grid: G(
      '05550000',
      '05550000',
      '05550000',
      '06660000',
      '05550000',
      '05555000',
      '05555500',
      '05555550',
      '55555555',
      '77777777',
    ),
  },
  gem_magnet: {
    palette: { 5: '#2aa08a', 6: '#7ae0c8', 7: '#9aa4b8', 8: '#c03a3a' },
    grid: G(
      '005555500',
      '056555750',
      '005657500',
      '000575000',
      '000050000',
      '000000000',
      '870000078',
      '870000078',
      '770000077',
      '077000770',
      '007777700',
    ),
  },
  spear: {
    palette: { 5: '#9aa4b8', 6: '#e8ecf4', 7: '#8a5f2c' },
    grid: G(
      '0000500000',
      '0005650000',
      '0055555000',
      '0000700000',
      '0000700000',
      '0000700000',
      '0000700000',
      '0000700000',
      '0070707000',
      '0000700000',
    ),
  },
  three_arrows: {
    palette: { 5: '#9aa4b8', 7: '#8a5f2c' },
    grid: G(
      '05000500050',
      '55505550555',
      '07000700070',
      '07000700070',
      '07000700070',
      '07000700070',
      '07000700070',
      '07000700070',
      '70707070707',
      '07000700070',
    ),
  },
  crowned_heart: {
    palette: { 5: '#c03a3a', 6: '#e04a4a', 7: '#5c1414', 8: '#c89a2a', 9: '#ffe07a' },
    grid: G(
      '800080008',
      '880888088',
      '889888988',
      '000000000',
      '055000550',
      '556555575',
      '556555575',
      '555555575',
      '055555750',
      '005555700',
      '000557000',
      '000050000',
    ),
  },
  whetstone: {
    palette: { 5: '#9aa4b8', 6: '#e8ecf4', 7: '#8a5f2c', 8: '#5a5f6e', 9: '#3a3f4c' },
    grid: G(
      '000000000550',
      '000000005650',
      '000000056500',
      '000000565000',
      '000005650000',
      '000056500000',
      '000565000000',
      '005650000000',
      '077708888800',
      '077088888880',
      '008888888880',
      '009999999990',
    ),
  },
  tome: {
    palette: { 5: '#3a5a9a', 6: '#efe6cc', 7: '#c89a2a', 8: '#5a6a8a' },
    grid: G(
      '055550055550',
      '056665566650',
      '056866668650',
      '056666566750',
      '056866668650',
      '056666566650',
      '056665566650',
      '055555555550',
    ),
  },
  coin_palm: {
    palette: { 5: '#d8a878', 6: '#a87848', 7: '#c89a2a', 8: '#ffe07a' },
    grid: G(
      '00007770000',
      '00078877000',
      '00078777000',
      '00077777000',
      '00007770000',
      '00000000000',
      '00555555500',
      '05555555550',
      '55556665550',
      '05555555550',
      '00555555500',
    ),
  },
  red_blade: {
    palette: { 5: '#c03a3a', 6: '#e04a4a', 7: '#c89a2a', 8: '#3a3f4c' },
    grid: G(
      '0000050000',
      '0000565000',
      '0000565000',
      '0000565000',
      '0000565000',
      '0000565000',
      '0000565000',
      '0007777000',
      '0000080000',
      '0000080000',
      '0000880000',
    ),
  },
  card_fan: {
    palette: { 5: '#f4f4f8', 6: '#0a0a0e', 7: '#a02a2a' },
    grid: G(
      '0000666660000',
      '0000655560000',
      '6666655566666',
      '6556657566556',
      '6656657566656',
      '6556655566556',
      '6556655566556',
      '6556666666556',
      '6666000006666',
    ),
  },
  // RED JOKER — a winged heart: gold wings hugging a red heart, glow motes,
  // on a deep maroon full-bleed body.
  winged_heart: {
    palette: { 5: '#1c0f16', 6: '#c03a3a', 7: '#e04a4a', 8: '#f0b45a', 9: '#ffe07a' },
    grid: G(
      '0000000000000000',
      '0000900000090000',
      '0088000000008800',
      '0888000000008880',
      '0898000000008980',
      '0888066006608880',
      '0880676666660880',
      '0880666666660880',
      '0080666666660800',
      '0080066666600800',
      '0000066666600000',
      '0000006666000000',
      '0000000660000000',
      '0000000600000000',
      '0000900000090000',
      '0000000000000000',
    ),
  },
  // BLACK JOKER — a lightning-struck shard: a gold bolt with a white-hot core
  // cracks a steel crystal, chips scattered, on a near-black full-bleed body.
  storm_shard: {
    palette: { 5: '#0e1018', 6: '#5a6a8a', 7: '#9ab8e8', 8: '#ffe07a', 9: '#f4f4f8' },
    grid: G(
      '0980000000000000',
      '0089000000000000',
      '0008900000000000',
      '0000890000000000',
      '0000089000000000',
      '0000000670000000',
      '0000006776000000',
      '0000067776000000',
      '0000067997600000',
      '0000067997600000',
      '0066006776000000',
      '0000006776000000',
      '0000000660006600',
      '0000000000006600',
      '0090000000000900',
      '0000000000000000',
    ),
  },
};

// ---------------------------------------------------------------- deck ------
// THE 13 CARDS (the brief's table; ranks inside a tier are placeholders — the
// contract is tier -> rank CLASS). `id` matches the live draft id in
// src/config.js UPGRADES where one exists today (hp/speed/pickup/pierce/multi/
// dmg); the W7b-only cards get new stable ids for the mechanics builder.
export const CARD_DECK = [
  { id: 'hp',             name: 'Iron Heart +25',    desc: '+25 max HP and heal 25',            rank: '2', suit: 'hearts',   motif: 'heart' },
  { id: 'speed',          name: 'Light Boots',       desc: '+15% move speed',                   rank: '5', suit: 'clubs',    motif: 'boot' },
  { id: 'pickup',         name: 'Gem Magnet',        desc: '+30% pickup radius',                rank: '6', suit: 'diamonds', motif: 'gem_magnet' },
  { id: 'pierce',         name: 'Sharpened Tips',    desc: 'Projectiles pierce +1 enemy',       rank: '7', suit: 'spades',   motif: 'spear' },
  { id: 'multi',          name: 'Split Shot',        desc: '+1 projectile per volley',          rank: '8', suit: 'spades',   motif: 'three_arrows' },
  { id: 'hp_pct',         name: 'Iron Heart +25%',   desc: '+25% max HP and heal 25%',          rank: 'K', suit: 'hearts',   motif: 'crowned_heart' },
  { id: 'dmg',            name: 'Whetstone',         desc: '+15% weapon damage',                rank: 'Q', suit: 'spades',   motif: 'whetstone' },
  { id: 'scholars_stone', name: "Scholar's Stone",   desc: '+20% XP gain',                      rank: 'J', suit: 'clubs',    motif: 'tome' },
  { id: 'gilded_palm',    name: 'Gilded Palm',       desc: '+30% purse gold per kill',          rank: 'Q', suit: 'diamonds', motif: 'coin_palm' },
  { id: 'crimson_edge',   name: 'Crimson Edge',      desc: '+3% lifesteal',                     rank: 'K', suit: 'spades',   motif: 'red_blade' },
  { id: 'full_hand',      name: 'Full Hand',         desc: '+1 draft offer for the run',        rank: 'A', suit: 'clubs',    motif: 'card_fan' },
  { id: 'second_wind',    name: 'Second Wind',       desc: 'Revive once at 50% max HP',         rank: 'JOKER', suit: null,   motif: 'winged_heart', joker: 'red' },
  { id: 'storm_shards',   name: 'Storm Shards',      desc: 'XP pickup deals chip damage',       rank: 'JOKER', suit: null,   motif: 'storm_shard',  joker: 'black' },
];
export const CARD_IDS = CARD_DECK.map((c) => c.id);

const RANK_CLASS_OF = (rank) =>
  rank === 'JOKER' ? 'joker' : rank === 'A' ? 'ace' : ('JQK'.includes(rank) ? 'face' : 'number');

// ------------------------------------------------------------- composition --
function blank() {
  return Array.from({ length: CARD_H }, () => new Array(CARD_W).fill(0));
}

// Stamp src into dst at (x, y); only truthy cells are painted (0 = transparent).
function stamp(dst, src, x, y, key = 0) {
  for (let ry = 0; ry < src.length; ry++) {
    for (let rx = 0; rx < src[ry].length; rx++) {
      const v = src[ry][rx];
      if (v) dst[y + ry][x + rx] = key || v;
    }
  }
}

// The bottom-right corner pip: the same glyph rotated 180deg, as on a real card.
function stampRot180(dst, src, x, y, key) {
  const h = src.length, w = src[0].length;
  for (let ry = 0; ry < h; ry++) {
    for (let rx = 0; rx < w; rx++) {
      const v = src[ry][rx];
      if (v) dst[y + (h - 1 - ry)][x + (w - 1 - rx)] = key;
    }
  }
}

// The ONE shared frame: transparent corner silhouette, 1px ink keyline,
// parchment body, bottom-right inner shade line.
function frame() {
  const g = blank();
  for (let x = 1; x < CARD_W - 1; x++) { g[0][x] = 1; g[CARD_H - 1][x] = 1; }
  for (let y = 1; y < CARD_H - 1; y++) { g[y][0] = 1; g[y][CARD_W - 1] = 1; }
  for (let y = 1; y < CARD_H - 1; y++) {
    for (let x = 1; x < CARD_W - 1; x++) g[y][x] = 2;
  }
  for (let y = 2; y < CARD_H - 2; y++) g[y][CARD_W - 2] = 3;
  for (let x = 2; x < CARD_W - 2; x++) g[CARD_H - 2][x] = 3;
  return g;
}

// Full-bleed joker frame: ink keyline, dark body, dotted accent inner frame.
// No rank/suit pips — the jokers are the only full-art cards in the deck.
function jokerFrame(bgKey, accentKey) {
  const g = blank();
  for (let x = 1; x < CARD_W - 1; x++) { g[0][x] = 1; g[CARD_H - 1][x] = 1; }
  for (let y = 1; y < CARD_H - 1; y++) { g[y][0] = 1; g[y][CARD_W - 1] = 1; }
  for (let y = 1; y < CARD_H - 1; y++) {
    for (let x = 1; x < CARD_W - 1; x++) g[y][x] = bgKey;
  }
  for (let y = 3; y < CARD_H - 3; y += 2) { g[y][2] = accentKey; g[y][CARD_W - 3] = accentKey; }
  for (let x = 3; x < CARD_W - 3; x += 2) { g[2][x] = accentKey; g[CARD_H - 3][x] = accentKey; }
  return g;
}

function composeCard(def) {
  const m = MOTIFS[def.motif];
  const mx = Math.floor((CARD_W - m.grid[0].length) / 2);
  const my = Math.floor((CARD_H - m.grid.length) / 2);
  let g;
  if (def.joker) {
    g = jokerFrame(5, 8);
    stamp(g, m.grid, mx, my);
  } else {
    g = frame();
    stamp(g, m.grid, mx, my);
    // Pips LAST so they always read over a motif corner.
    stamp(g, RANK_GLYPHS[def.rank], 2, 2, 4);
    stamp(g, SUIT_PIPS[def.suit], 2, 8, 4);
    stampRot180(g, RANK_GLYPHS[def.rank], CARD_W - 2 - 3, CARD_H - 2 - 5, 4);
    stampRot180(g, SUIT_PIPS[def.suit], CARD_W - 2 - 5, CARD_H - 2 - 5, 4);
  }
  return g;
}

function paletteFor(def) {
  const m = MOTIFS[def.motif];
  const p = { 1: '#0a0a0e', 2: '#eadfc3', 3: '#c9b78f', ...m.palette };
  if (!def.joker) p[4] = SUIT_COLOUR[SUITS[def.suit].colour];
  return p;
}

// ------------------------------------------------------------------ assets --
export const CARD_ART = {};
for (const def of CARD_DECK) {
  const a = makeAsset({
    id: def.id,
    name: def.name,
    desc: def.desc,
    grid: composeCard(def),
    palette: paletteFor(def),
  });
  a.rank = def.rank;
  a.rankClass = RANK_CLASS_OF(def.rank);
  a.tier = RANK_CLASS[a.rankClass];            // COMMON / RARE / MYTHIC / CHASE
  a.suit = def.suit;                            // null on the jokers
  a.family = def.suit ? SUITS[def.suit].family : null;
  a.fullArt = !!def.joker;                      // the two jokers are the only ones
  a.joker = def.joker || null;                  // 'red' | 'black' | null
  a.motif = def.motif;
  CARD_ART[def.id] = a;
}

// The accessor the draft display will call: cardArt(id) -> { grid, palette, ... }.
// Returns null for an unknown id (never a thrown art failure mid-draft).
export function cardArt(id) {
  return CARD_ART[id] || null;
}
