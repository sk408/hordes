// HORDES — CARD ART COVERAGE: the expansion deck + the COMPLETE offer join.
// Self-contained, no runner, no DOM:
//   node test/test_card_art_expansion.mjs
//
// PINS what docs/briefs/CARD_ART_COVERAGE.md shipped, through the REAL seams
// (never a restated copy):
//   1. the expansion deck contract: 19 cards, every rank a NUMBER (COMMON
//      pool content — face/ace/joker stay exclusive to the W7b ladder), suit
//      = family, the SAME shared frame as the core 13;
//   2. the format discipline of test_card_art.mjs applied to the expansion:
//      INTEGER grids (0 = transparent), transparent silhouette corners, hex
//      palettes, rank+suit pips top-left and rotated bottom-right;
//   3. expansion motifs pairwise distinct (the TWO documented cross-registry
//      reuses — wpn_volley = three_arrows, rw_pierceall = spear — are the
//      only interior collisions with the core deck);
//   4. the NAME joins: every weapon card is named WEAPON_NAMES[type], the
//      utility/rule/perk/rewrite cards are named from their source module —
//      a rename on either side goes red here;
//   5. FULL POOL COVERAGE: every offer id src/main.js openDraft can produce
//      (weapon grants, weapon level-ups at ANY level incl. over-cap, stat
//      cards, the RARE/MYTHIC ladder, rules, perks, Pocket Frost, rewrites)
//      resolves to a REAL card — no plain-text fallback — and only a
//      genuinely unknown id gets null;
//   6. drawCard paints every expansion card one rect per inked cell.
import {
  CARD_ART, CARD_DECK, CARD_EXPANSION, EXPANSION_IDS, CARD_W, CARD_H, SUITS, SUIT_COLOUR, cardArt,
} from '../src/art/cards.js';
import { drawCard } from '../src/render_cards.js';
import { deckIdForOffer, OFFER_TO_DECK, WEAPON_OFFER_TO_DECK } from '../src/draft_card_art.js';
import { WEAPON_TYPES, WEAPON_NAMES, WEAPON_MAX_LEVEL } from '../src/weapons.js';
import { UPGRADES, DRAFT_RARE_UPGRADES, DRAFT_MYTHIC_UPGRADES } from '../src/config.js';
import { RULES, RULE_IDS } from '../src/rules.js';
import { SKILL_PERKS, SKILL_PERK_IDS } from '../src/perks.js';
import { REWRITES, REWRITE_IDS } from '../src/rewrites.js';
import { FROST_CARD_ID, frostCard } from '../src/frostcard.js';

let failed = 0;
function ok(cond, msg) {
  if (cond) { console.log('  PASS ' + msg); }
  else { failed++; console.error('  FAIL ' + msg); }
}
function eq(actual, expected, msg) {
  const brief = (v) => (v === null || typeof v !== 'object') ? JSON.stringify(v) : '[' + typeof v + ']';
  ok(actual === expected, msg + ' (got ' + brief(actual) + ', want ' + brief(expected) + ')');
}

// The expansion contract, owned HERE like test_card_art owns the core table.
const EXPECTED = [
  { id: 'wpn_volley',     rank: '2', suit: 'spades',   family: 'damage',   motif: 'three_arrows' },
  { id: 'wpn_orbit',      rank: '3', suit: 'spades',   family: 'damage',   motif: 'orbit' },
  { id: 'wpn_boomerang',  rank: '4', suit: 'spades',   family: 'damage',   motif: 'boomerang' },
  { id: 'wpn_zap',        rank: '5', suit: 'spades',   family: 'damage',   motif: 'bolt' },
  { id: 'wpn_scythe',     rank: '6', suit: 'spades',   family: 'damage',   motif: 'scythe' },
  { id: 'wpn_beam',       rank: '9', suit: 'spades',   family: 'damage',   motif: 'beam' },
  { id: 'wpn_nova_pulse', rank: '3', suit: 'hearts',   family: 'survival', motif: 'pulse' },
  { id: 'wpn_seeker',     rank: '4', suit: 'clubs',    family: 'utility',  motif: 'seeker' },
  { id: 'wpn_mine',       rank: '2', suit: 'clubs',    family: 'utility',  motif: 'mine' },
  { id: 'quick_hands',    rank: '3', suit: 'clubs',    family: 'utility',  motif: 'hourglass' },
  { id: 'rule_hordebait', rank: '3', suit: 'diamonds', family: 'economy',  motif: 'chest' },
  { id: 'rule_once',      rank: '8', suit: 'clubs',    family: 'utility',  motif: 'lone_card' },
  { id: 'skill_regrowth', rank: '4', suit: 'hearts',   family: 'survival', motif: 'sprout' },
  { id: 'skill_focus',    rank: '6', suit: 'clubs',    family: 'utility',  motif: 'orb' },
  { id: 'skill_thick',    rank: '5', suit: 'hearts',   family: 'survival', motif: 'shield' },
  { id: 'skill_frost',    rank: '7', suit: 'clubs',    family: 'utility',  motif: 'snowflake' },
  { id: 'rw_pierceall',   rank: '9', suit: 'clubs',    family: 'utility',  motif: 'spear' },
  { id: 'rw_onkillboom',  rank: '9', suit: 'hearts',   family: 'survival', motif: 'blast' },
  { id: 'rw_healthdamage', rank: '6', suit: 'hearts',  family: 'survival', motif: 'potion' },
];
const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
// 3x5 rank glyphs (the test's own copy, incl. the 3/4/9 the coverage added).
const RANK_GLYPHS = {
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '010', '010', '010'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
};
const SUIT_PIPS = {
  spades:   ['00100', '01110', '11111', '00100', '01110'],
  hearts:   ['01010', '11111', '11111', '01110', '00100'],
  diamonds: ['00100', '01110', '11111', '01110', '00100'],
  clubs:    ['00100', '01110', '11011', '00100', '01110'],
};

console.log('EXPANSION DECK (19 cards, all COMMON number ranks):');
{
  eq(EXPANSION_IDS.length, 19, 'the expansion is exactly 19 cards');
  eq(JSON.stringify(EXPANSION_IDS), JSON.stringify(EXPECTED.map((c) => c.id)),
     'the expansion ids match the contract, in order');
  eq(CARD_EXPANSION.length, 19, 'CARD_EXPANSION carries 19 entries');
  eq(CARD_DECK.length, 13, 'the CORE deck is untouched (still 13)');
  for (const e of EXPECTED) {
    const a = cardArt(e.id);
    ok(!!a, 'cardArt(' + e.id + ') exists');
    if (!a) continue;
    eq(a.rank, e.rank, e.id + ' rank');
    eq(a.rankClass, 'number', e.id + ' rank class is NUMBER (COMMON pool content)');
    eq(a.tier, 'COMMON', e.id + ' tier (rank IS the rarity)');
    eq(a.suit, e.suit, e.id + ' suit');
    eq(a.family, e.family, e.id + ' family (suit IS the family)');
    eq(a.motif, e.motif, e.id + ' motif');
    eq(a.fullArt, false, e.id + ' is not full-art (jokers stay exclusive)');
    eq(a.joker, null, e.id + ' is no joker');
  }
}

console.log('FORMAT + FRAME (same discipline as the core deck):');
{
  const borderOf = (g) => JSON.stringify([
    g[0], g[CARD_H - 1], g.map((r) => r[0]), g.map((r) => r[CARD_W - 1]),
  ]);
  const coreBorder = borderOf(CARD_ART.hp.grid);
  for (const id of EXPANSION_IDS) {
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
    eq(JSON.stringify(a.rows), JSON.stringify(a.grid.map((r) => r.join(''))),
       id + ' rows view === grid');
    eq(a.grid[0][0] + a.grid[0][CARD_W - 1] + a.grid[CARD_H - 1][0] + a.grid[CARD_H - 1][CARD_W - 1],
       0, id + ' corner pixels transparent (card silhouette)');
    eq(borderOf(a.grid), coreBorder, id + ' shares the ONE frame keyline + silhouette');
    ok(['1', '2', '3', '4'].every((k) => k in a.palette), id + ' carries the four frame keys');
    eq(a.palette[4], SUIT_COLOUR[SUITS[a.suit].colour], id + ' pips stamp in its suit colour');
  }
  // No rank+suit collision anywhere in the FULL deck (core + expansion).
  const seen = {};
  let clash = null;
  for (const id of Object.keys(CARD_ART)) {
    const a = CARD_ART[id];
    if (!a.suit) continue;
    const k = a.rank + ':' + a.suit;
    if (seen[k]) clash = k + ' (' + seen[k] + ' + ' + id + ')';
    seen[k] = id;
  }
  eq(clash, null, 'no two cards in the full deck share a rank+suit');
}

console.log('PIPS (rank + suit, top-left and rotated bottom-right):');
{
  for (const e of EXPECTED) {
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

console.log('MOTIFS (pairwise distinct inside the expansion; two documented reuses):');
{
  const interior = (id) => JSON.stringify(
    CARD_ART[id].grid.slice(10, 25).map((r) => r.slice(5, 19)));
  const interiors = new Set(EXPANSION_IDS.map(interior));
  eq(interiors.size, EXPANSION_IDS.length, 'all 19 expansion motifs are pairwise distinct');
  // The documented cross-registry reuses — by IDENTITY, not convenience:
  // VOLLEY is the arrow volley Split Shot extends; PIERCE ALL is pierce itself.
  eq(interior('wpn_volley'), interior('multi'), 'VOLLEY shares the volley-arrows motif by identity');
  eq(interior('rw_pierceall'), interior('pierce'), 'PIERCE ALL shares the spear motif by identity');
  const coreOnly = ['hp', 'speed', 'pickup', 'hp_pct', 'dmg', 'scholars_stone',
    'gilded_palm', 'crimson_edge', 'full_hand'];
  const collisions = EXPANSION_IDS.filter((id) =>
    !['wpn_volley', 'rw_pierceall'].includes(id) &&
    coreOnly.some((c) => interior(c) === interior(id)));
  eq(JSON.stringify(collisions), '[]', 'no other expansion motif duplicates a core motif');
}

console.log('NAME JOINS (a rename on either side goes red):');
{
  for (const type of Object.keys(WEAPON_NAMES)) {
    const deckId = WEAPON_OFFER_TO_DECK[type];
    ok(!!deckId, 'weapon type ' + type + ' has a card join');
    if (!deckId) continue;
    eq(cardArt(deckId) && cardArt(deckId).name, WEAPON_NAMES[type],
       type + ' card is named from WEAPON_NAMES');
  }
  for (const type of Object.keys(WEAPON_TYPES)) {
    ok(Object.keys(WEAPON_NAMES).includes(type), 'WEAPON_TYPES[' + type + '] has a WEAPON_NAMES entry');
  }
  eq(cardArt(deckIdForOffer('rate')).name, UPGRADES.find((u) => u.id === 'rate').name, 'Quick Hands joins by NAME');
  for (const id of RULE_IDS) {
    eq(cardArt(deckIdForOffer('rule_' + id)).name, RULES[id].name, 'rule_' + id + ' joins by NAME');
  }
  for (const id of SKILL_PERK_IDS) {
    eq(cardArt(deckIdForOffer('skill_' + id)).name, SKILL_PERKS[id].name, 'skill_' + id + ' joins by NAME');
  }
  eq(cardArt(deckIdForOffer(FROST_CARD_ID)).name, frostCard().name, 'the Pocket Frost card joins by NAME');
  for (const id of REWRITE_IDS) {
    eq(cardArt(deckIdForOffer('rewrite_' + id)).name, REWRITES[id].name, 'rewrite_' + id + ' joins by NAME');
  }
}

console.log('FULL POOL COVERAGE (every offer id openDraft can produce resolves):');
{
  const offerIds = [];
  // Weapon grants: wpn_<TYPE> for every registry type.
  for (const type of Object.keys(WEAPON_TYPES)) offerIds.push('wpn_' + type);
  // Weapon level-ups: lvl_<TYPE>_<lv> at the first level, the cap, and past
  // it (the ONE OF EACH over-cap conversion keeps the card offered).
  for (const type of Object.keys(WEAPON_NAMES)) {
    offerIds.push('lvl_' + type + '_1', 'lvl_' + type + '_' + WEAPON_MAX_LEVEL,
      'lvl_' + type + '_' + (WEAPON_MAX_LEVEL + 1));
  }
  // Stat cards + the W7b ladder.
  for (const u of [...UPGRADES, ...DRAFT_RARE_UPGRADES, ...DRAFT_MYTHIC_UPGRADES]) offerIds.push(u.id);
  // Run rules, perks, Pocket Frost, rewrites.
  for (const id of RULE_IDS) offerIds.push('rule_' + id);
  for (const id of SKILL_PERK_IDS) offerIds.push('skill_' + id);
  offerIds.push(FROST_CARD_ID);
  for (const id of REWRITE_IDS) offerIds.push('rewrite_' + id);

  eq(offerIds.length, 8 + 9 * 3 + 7 + 4 + 3 + 2 + 3 + 1 + 3, 'the enumeration covers the whole pool (54 ids)');
  for (const id of offerIds) {
    const deckId = deckIdForOffer(id);
    ok(!!deckId, id + ' resolves to deck card ' + (deckId || 'NULL — PLAIN-TEXT FALLBACK'));
    if (deckId) ok(!!cardArt(deckId), id + ' -> ' + deckId + ' is a REAL card');
  }
  // Rank-class correctness across the join: commons are numbers, the RARE
  // ladder is face cards, the MYTHIC chase is ace/joker. (dmg is the ONE
  // common pool card the FROZEN core deck ships as a face card — Q of
  // spades, pinned by test_card_art.mjs; not this brief's to move.)
  for (const id of [...UPGRADES.filter((u) => u.id !== 'dmg').map((u) => u.id),
    'wpn_ORBIT', 'lvl_SCYTHE_3', 'rule_once', 'skill_thick', FROST_CARD_ID, 'rewrite_pierceall']) {
    eq(cardArt(deckIdForOffer(id)).rankClass, 'number', id + ' is a COMMON number card');
  }
  eq(cardArt(deckIdForOffer('dmg')).rank, 'Q', 'dmg keeps its frozen core-deck rank (Q of spades)');
  for (const u of DRAFT_RARE_UPGRADES) {
    eq(cardArt(deckIdForOffer(u.id)).rankClass, 'face', u.id + ' is a RARE face card');
  }
  eq(cardArt(deckIdForOffer('full_hand')).rankClass, 'ace', 'full_hand is the MYTHIC ace');
  eq(cardArt(deckIdForOffer('second_wind')).rankClass, 'joker', 'second_wind is the RED joker');
  eq(cardArt(deckIdForOffer('storm_shards')).rankClass, 'joker', 'storm_shards is the BLACK joker');
  // Only a genuinely unknown id fails safe.
  eq(deckIdForOffer('no_such_offer'), null, 'unknown offer id -> null (never a blank card)');
  eq(deckIdForOffer('wpn_NO_SUCH_WEAPON'), null, 'unknown weapon type -> null');
  eq(deckIdForOffer(undefined), null, 'undefined -> null');
}

console.log('RENDERER (every expansion card paints one rect per inked cell):');
{
  for (const id of EXPANSION_IDS) {
    const a = CARD_ART[id];
    let ink = 0;
    for (const row of a.grid) for (const v of row) if (v) ink++;
    const rec = { rects: [], style: null };
    const g = {
      set fillStyle(v) { rec.style = v; },
      get fillStyle() { return rec.style; },
      fillRect(x, y, w, h) { rec.rects.push({ x, y, w, h, style: rec.style }); },
    };
    eq(drawCard(g, id, 0, 0, 4), true, 'drawCard paints ' + id);
    eq(rec.rects.length, ink, id + ' paints exactly one rect per inked cell');
    ok(rec.rects.every((r) => Object.values(a.palette).includes(r.style)),
       id + ' every painted rect uses a palette colour (no leftover fillStyle)');
  }
}

console.log('');
if (failed) {
  console.error('test_card_art_expansion: ' + failed + ' FAILED check(s)');
  process.exitCode = 1;
} else {
  console.log('test_card_art_expansion: all checks passed');
}
