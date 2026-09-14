// HORDES — CARD DECK LINT (CARD ART track). Self-contained, no runner, no DOM:
//   node test/test_card_art.mjs
//
// PINS THE DECK DATA without mounting the game: every card id maps to a rank
// class + suit + motif grid, the two jokers are the only full-art cards, the
// frame is ONE shared template, and every grid is an INTEGER grid with 0 =
// transparent (the drawGrid trap: a string cell is truthy and paints solid —
// so the test re-checks the type of every cell, not just the values).
import {
  CARD_ART, CARD_DECK, CARD_IDS, CARD_W, CARD_H, RANK_CLASS, SUITS, SUIT_COLOUR, cardArt,
} from '../src/art/cards.js';
import { drawCard, cardBox } from '../src/render_cards.js';

let failed = 0;
function ok(cond, msg) {
  if (cond) { console.log('  PASS ' + msg); }
  else { failed++; console.error('  FAIL ' + msg); }
}
function eq(actual, expected, msg) {
  const brief = (v) => (v === null || typeof v !== 'object') ? JSON.stringify(v) : '[' + typeof v + ']';
  ok(actual === expected, msg + ' (got ' + brief(actual) + ', want ' + brief(expected) + ')');
}

// ------------------------------------------------------- the deck contract --
// Hardcoded here on purpose: the test owns the contract (the brief's table),
// the module only holds a copy. Ranks inside a tier are placeholders; the
// rank CLASS per tier is not.
const EXPECTED_DECK = [
  { id: 'hp',             rank: '2',     rankClass: 'number', tier: 'COMMON', suit: 'hearts',   family: 'survival', motif: 'heart' },
  { id: 'speed',          rank: '5',     rankClass: 'number', tier: 'COMMON', suit: 'clubs',    family: 'utility',  motif: 'boot' },
  { id: 'pickup',         rank: '6',     rankClass: 'number', tier: 'COMMON', suit: 'diamonds', family: 'economy',  motif: 'gem_magnet' },
  { id: 'pierce',         rank: '7',     rankClass: 'number', tier: 'COMMON', suit: 'spades',   family: 'damage',   motif: 'spear' },
  { id: 'multi',          rank: '8',     rankClass: 'number', tier: 'COMMON', suit: 'spades',   family: 'damage',   motif: 'three_arrows' },
  { id: 'hp_pct',         rank: 'K',     rankClass: 'face',   tier: 'RARE',   suit: 'hearts',   family: 'survival', motif: 'crowned_heart' },
  { id: 'dmg',            rank: 'Q',     rankClass: 'face',   tier: 'RARE',   suit: 'spades',   family: 'damage',   motif: 'whetstone' },
  { id: 'scholars_stone', rank: 'J',     rankClass: 'face',   tier: 'RARE',   suit: 'clubs',    family: 'utility',  motif: 'tome' },
  { id: 'gilded_palm',    rank: 'Q',     rankClass: 'face',   tier: 'RARE',   suit: 'diamonds', family: 'economy',  motif: 'coin_palm' },
  { id: 'crimson_edge',   rank: 'K',     rankClass: 'face',   tier: 'RARE',   suit: 'spades',   family: 'damage',   motif: 'red_blade' },
  { id: 'full_hand',      rank: 'A',     rankClass: 'ace',    tier: 'MYTHIC', suit: 'clubs',    family: 'utility',  motif: 'card_fan' },
  { id: 'second_wind',    rank: 'JOKER', rankClass: 'joker',  tier: 'CHASE',  suit: null,       family: null,       motif: 'winged_heart', joker: 'red' },
  { id: 'storm_shards',   rank: 'JOKER', rankClass: 'joker',  tier: 'CHASE',  suit: null,       family: null,       motif: 'storm_shard',  joker: 'black' },
];
const JOKER_IDS = ['second_wind', 'storm_shards'];
const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

// 3x5 rank glyphs and 5x5 suit pips, as the test's own copy (1 = pip ink).
const RANK_GLYPHS = {
  '2': ['111', '001', '111', '100', '111'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '010', '010', '010'],
  '8': ['111', '101', '111', '101', '111'],
  'J': ['011', '001', '001', '101', '010'],
  'Q': ['111', '101', '101', '111', '001'],
  'K': ['101', '101', '110', '101', '101'],
  'A': ['010', '101', '111', '101', '101'],
};
const SUIT_PIPS = {
  spades:   ['00100', '01110', '11111', '00100', '01110'],
  hearts:   ['01010', '11111', '11111', '01110', '00100'],
  diamonds: ['00100', '01110', '11111', '01110', '00100'],
  clubs:    ['00100', '01110', '11011', '00100', '01110'],
};

// ------------------------------------------------------------------ checks --
console.log('DECK (the brief\'s 13 cards):');
{
  eq(CARD_IDS.length, 13, 'the deck is exactly 13 cards');
  eq(JSON.stringify(CARD_IDS), JSON.stringify(EXPECTED_DECK.map((c) => c.id)),
     'the deck ids match the contract, in order');
  eq(CARD_DECK.length, 13, 'CARD_DECK carries 13 entries');
  for (const e of EXPECTED_DECK) {
    const a = cardArt(e.id);
    ok(!!a, 'cardArt(' + e.id + ') exists');
    if (!a) continue;
    eq(a.rank, e.rank, e.id + ' rank');
    eq(a.rankClass, e.rankClass, e.id + ' rank class');
    eq(a.tier, e.tier, e.id + ' tier (rank IS the rarity)');
    eq(a.suit, e.suit, e.id + ' suit');
    eq(a.family, e.family, e.id + ' family (suit IS the family)');
    eq(a.motif, e.motif, e.id + ' motif');
    eq(a.fullArt, !!e.joker, e.id + ' fullArt only on a joker');
    eq(a.joker, e.joker || null, e.id + ' joker colour');
  }
  eq(cardArt('no_such_card'), null, 'cardArt(unknown) returns null, never throws');
  eq(RANK_CLASS.number, 'COMMON', 'number cards are COMMON');
  eq(RANK_CLASS.face, 'RARE', 'face cards are RARE');
  eq(RANK_CLASS.ace, 'MYTHIC', 'aces are MYTHIC');
  eq(RANK_CLASS.joker, 'CHASE', 'jokers are the chase tier');
  eq(Object.keys(SUITS).length, 4, 'exactly four suits');
  eq(SUITS.spades.family, 'damage', 'spades = damage');
  eq(SUITS.hearts.family, 'survival', 'hearts = survival');
  eq(SUITS.diamonds.family, 'economy', 'diamonds = economy');
  eq(SUITS.clubs.family, 'utility', 'clubs = utility');
}

console.log('FORMAT (integer grids, 0 = transparent — the drawGrid trap):');
{
  for (const id of CARD_IDS) {
    const a = CARD_ART[id];
    eq(a.w, CARD_W, id + ' backing width is ' + CARD_W);
    eq(a.h, CARD_H, id + ' backing height is ' + CARD_H);
    let allInt = true, inRange = true, keyKnown = true, paletteHex = true;
    for (const row of a.grid) {
      for (const v of row) {
        if (!Number.isInteger(v)) allInt = false;
        if (v < 0 || v > 9) inRange = false;
        if (v !== 0 && !(v in a.palette)) keyKnown = false;
      }
    }
    for (const k of Object.keys(a.palette)) {
      if (!HEX.test(a.palette[k])) paletteHex = false;
    }
    ok(allInt, id + ' every cell is an INTEGER (never a string cell)');
    ok(inRange && keyKnown, id + ' every inked cell has a palette key 1..9');
    ok(paletteHex, id + ' every palette value is a hex colour');
    // rows is the derived digit-string view; it can never drift from the grid.
    eq(JSON.stringify(a.rows), JSON.stringify(a.grid.map((r) => r.join(''))),
       id + ' rows view === grid');
    // The card silhouette: the four corner pixels are transparent.
    eq(a.grid[0][0] + a.grid[0][CARD_W - 1] + a.grid[CARD_H - 1][0] + a.grid[CARD_H - 1][CARD_W - 1],
       0, id + ' corner pixels transparent (card silhouette)');
  }
}

console.log('FRAME (ONE shared template, not 13 bespoke frames):');
{
  const plain = CARD_IDS.filter((id) => !JOKER_IDS.includes(id));
  const borderOf = (g) => JSON.stringify([
    g[0], g[CARD_H - 1], g.map((r) => r[0]), g.map((r) => r[CARD_W - 1]),
  ]);
  const first = borderOf(CARD_ART[plain[0]].grid);
  ok(plain.every((id) => borderOf(CARD_ART[id].grid) === first),
     'every non-joker card shares the identical keyline + silhouette');
  const inkRow = CARD_ART.hp.grid[0];
  ok(inkRow[0] === 0 && inkRow[1] === 1 && inkRow[CARD_W - 2] === 1 && inkRow[CARD_W - 1] === 0,
     'the keyline is 1px ink with transparent corners');
  const framePaletteKeys = ['1', '2', '3', '4'];
  ok(plain.every((id) => framePaletteKeys.every((k) => k in CARD_ART[id].palette)),
     'every non-joker palette carries the four frame keys');
  eq(CARD_ART.hp.palette[4], SUIT_COLOUR.red, 'hearts/diamonds stamp in the game red');
  eq(CARD_ART.pierce.palette[4], SUIT_COLOUR.dark, 'spades/clubs stamp in the dark slate');
  // A future card is a motif, not a new frame: the interior differs, the frame does not.
  const interiors = new Set(plain.map((id) => JSON.stringify(
    CARD_ART[id].grid.slice(10, 25).map((r) => r.slice(5, 19)))));
  eq(interiors.size, plain.length, 'all 11 non-joker motifs are pairwise distinct');
}

console.log('PIPS (rank + suit, top-left and rotated bottom-right):');
{
  for (const e of EXPECTED_DECK) {
    if (e.joker) continue;
    const g = CARD_ART[e.id].grid;
    const glyph = RANK_GLYPHS[e.rank];
    const pip = SUIT_PIPS[e.suit];
    let tl = true, br = true;
    for (let ry = 0; ry < 5; ry++) {
      for (let rx = 0; rx < 3; rx++) {
        if (glyph[ry][rx] === '1' && g[2 + ry][2 + rx] !== 4) tl = false;
        if (glyph[ry][rx] === '1' && g[CARD_H - 2 - 5 + (4 - ry)][CARD_W - 2 - 3 + (2 - rx)] !== 4) br = false;
      }
      for (let rx = 0; rx < 5; rx++) {
        if (pip[ry][rx] === '1' && g[8 + ry][2 + rx] !== 4) tl = false;
        if (pip[ry][rx] === '1' && g[CARD_H - 2 - 5 + (4 - ry)][CARD_W - 2 - 5 + (4 - rx)] !== 4) br = false;
      }
    }
    ok(tl, e.id + ' top-left rank+suit pip inked in the suit colour (key 4)');
    ok(br, e.id + ' bottom-right pip is the same stamp rotated 180deg');
  }
}

console.log('JOKERS (the only full-art cards, unmistakably special):');
{
  for (const e of EXPECTED_DECK) {
    const a = CARD_ART[e.id];
    if (e.joker) {
      // No pips: the top-left pip zone carries body ink (key 5), never suit key 4.
      let noPip = true;
      for (let y = 2; y <= 12; y++) for (let x = 2; x <= 6; x++) if (a.grid[y][x] === 4) noPip = false;
      ok(noPip, e.id + ' has NO rank/suit pip (full-art)');
      ok(!(4 in a.palette), e.id + ' has no suit-colour key at all');
      let ink = 0;
      for (const row of a.grid) for (const v of row) if (v) ink++;
      ok(ink > CARD_W * CARD_H * 0.85, e.id + ' is full-bleed (' + ink + '/' + CARD_W * CARD_H + ' cells inked)');
    } else {
      ok(4 in a.palette, e.id + ' (non-joker) carries a suit colour');
    }
  }
  eq(CARD_ART.second_wind.joker, 'red', 'Second Wind is the RED joker');
  eq(CARD_ART.storm_shards.joker, 'black', 'Storm Shards is the BLACK joker');
}

console.log('RENDERER (drawCard through the drawGrid seam, no game boot):');
{
  // A recorder 2d context: captures fillStyle per fillRect, like _harness.mjs.
  const rec = { rects: [], style: null };
  const g = {
    set fillStyle(v) { rec.style = v; },
    get fillStyle() { return rec.style; },
    fillRect(x, y, w, h) { rec.rects.push({ x, y, w, h, style: rec.style }); },
  };
  const a = CARD_ART.hp;
  let inkCells = 0;
  for (const row of a.grid) for (const v of row) if (v) inkCells++;
  eq(drawCard(g, 'hp', 10, 20, 3), true, 'drawCard paints a known id');
  eq(rec.rects.length, inkCells, 'drawCard paints exactly one rect per inked cell');
  ok(rec.rects.every((r) => Number.isInteger(r.x) && Number.isInteger(r.y) &&
       r.w === 3 && r.h === 3 && (r.x - 10) % 3 === 0 && (r.y - 20) % 3 === 0),
     'every rect is an integer-aligned 3x3 block (integer scaling, no smoothing)');
  ok(rec.rects.every((r) => Object.values(a.palette).includes(r.style)),
     'every painted rect uses a palette colour (no leftover fillStyle)');
  eq(drawCard(g, 'no_such_card', 0, 0), false, 'drawCard(unknown) fails safe');
  // The optional painter arg is the wired path: renderer.drawGrid.bind(renderer).
  let viaSeam = 0;
  const seam = (gg, grid, palette, x, y, s) => { viaSeam++; paintCheck(grid, palette, x, y, s); };
  let seamArgs = null;
  function paintCheck(grid, palette, x, y, s) { seamArgs = { grid, palette, x, y, s }; }
  drawCard(g, 'multi', 1, 2, 4, seam);
  eq(viaSeam, 1, 'an injected renderer painter is used when provided');
  eq(seamArgs && seamArgs.grid, CARD_ART.multi.grid, 'the seam receives the card grid');
  eq(seamArgs && seamArgs.palette, CARD_ART.multi.palette, 'the seam receives the card palette');
  eq(seamArgs && seamArgs.s, 4, 'the seam receives the integer scale');
  const b = cardBox(3);
  eq(b.w + 'x' + b.h, '72x102', 'cardBox(3) is 72x102 (24x34 backing at integer 3x)');
  eq(cardBox(2.7).w, 48, 'a fractional scale is floored, never smoothed');
}

console.log('');
if (failed) {
  console.error('test_card_art: ' + failed + ' FAILED check(s)');
  process.exitCode = 1;
} else {
  console.log('test_card_art: all checks passed');
}
