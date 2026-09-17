// HORDES — CARD ART COVERAGE: the expansion deck + the COMPLETE offer join.
// Self-contained, no runner, no DOM:
//   node test/test_card_art_expansion.mjs
//
// PINS the coverage contract through the REAL seams (never a restated copy).
// The first cut of this file froze a 19-card id list and a "54 pool ids"
// count; G21 slice 1 then grew the rewrite family 3 -> 8 and the file went
// red on its own contract rather than on a real gap. So every expectation
// here is now DERIVED from the pool and the deck — a frozen count cannot be
// written, and the file still fails the instant a card loses its art:
//   1. every offer id the draft pool can PRODUCE resolves to a REAL card (no
//      plain-text fallback), enumerated from the live registries
//      (WEAPON_TYPES / WEAPON_NAMES, UPGRADES + both ladder tiers, RULE_IDS,
//      SKILL_PERK_IDS, REWRITE_IDS, FROST_CARD_ID) so a new pool family — or
//      a new card in an existing one — is covered automatically;
//   2. the LIVE pool builders (ruleCards / skillCards / rewriteCards /
//      frostCard) agree with the deck: every card they emit resolves AND
//      joins the deck card BY NAME, and every id they emit is in the
//      enumeration (the enumeration covers the whole pool, checked against
//      the pool, not against a number);
//   3. the deck contract holds for whatever CARD_EXPANSION holds: rank class
//      AGREES with the card's declared tier (number = COMMON, face = RARE —
//      the expansion's two legal tiers), suit = family, integer grids
//      (0 = transparent), the ONE shared frame, rank+suit pips top-left and
//      rotated bottom-right;
//
// CONTRACT UPDATE — owner decision 2026-09-15 (rare-tier expansion cards):
// this file used to require that EVERY expansion card be a COMMON number card
// ("face/ace/joker stay exclusive to the W7b ladder"). That requirement is now
// WRONG BY DESIGN, and here is the arithmetic that forced it: the COMMON
// number-rank space is `2..9 x 4 suits` = 32 rank+suit pairs, TOTAL. The frozen
// 13-card core deck pins 5 of them (2H / 5C / 6D / 7S / 8S), so the expansion
// can hold at most 27 number cards — and after G21 slice 1 it held 24, leaving
// exactly THREE free pairs (7D / 8D / 9D). G21 slice 2 adds SIX cards (three
// singles + three combos), so three of them CANNOT be number cards at all.
// Approved fix: the three always-offered SINGLES (glacier / wildfire /
// overload) take the three free number slots, and the three prerequisite-gated
// CROSS-TAG COMBOS (thermalshock / stormreaper / glacialorbit) become RARE FACE
// cards (JH / JD / QH — free, since the W7b ladder holds KH / QS / JC / QD /
// KS). The deck lands at 43 cards with the number space exactly full (32/32)
// and zero rank+suit duplicates.
// This is a CONTRACT UPDATE, not a weakening — every other requirement is
// unchanged and still EXACT: every pool id resolves to a real card, no
// plain-text fallback, motifs pairwise-distinct (pip-free window), no deck-wide
// exact rank+suit duplicate — and the tier is still DERIVED, never trusted:
// face rank must mean RARE and number rank must mean COMMON, and the RARE
// expansion cards must be EXACTLY the cards the live rewrite registry reports as
// cross-tag combos (`isComboRewrite`), so the allowance cannot be widened by
// adding an id to a list here.
//   4. NO two cards in the deck share a rank+suit, and motifs are distinct
//      ACROSS THE DECK — computed from CARD_ART, with the two documented
//      cross-registry identity reuses (VOLLEY = three_arrows, PIERCE ALL =
//      spear) as the ONLY permitted interior collisions, and only because
//      they share the motif NAME (an aliased grid under a new name is a
//      failure, not a reuse);
//   5. drawCard paints every card in the deck one rect per inked cell.
import {
  CARD_ART, CARD_DECK, CARD_IDS, CARD_EXPANSION, EXPANSION_IDS, CARD_W, CARD_H, SUITS,
  SUIT_COLOUR, RANK_CLASS, cardArt,
} from '../src/art/cards.js';
import { drawCard } from '../src/render_cards.js';
import { deckIdForOffer, OFFER_TO_DECK, WEAPON_OFFER_TO_DECK } from '../src/draft_card_art.js';
import { WEAPON_TYPES, WEAPON_NAMES, WEAPON_MAX_LEVEL } from '../src/weapons.js';
import { UPGRADES, DRAFT_RARE_UPGRADES, DRAFT_MYTHIC_UPGRADES } from '../src/config.js';
import { RULES, RULE_IDS, ruleCards } from '../src/rules.js';
import { SKILL_PERKS, SKILL_PERK_IDS, skillCards } from '../src/perks.js';
import { REWRITES, REWRITE_IDS, rewriteCards, isComboRewrite } from '../src/rewrites.js';
import { FROST_CARD_ID, frostCard, frostCardOffered } from '../src/frostcard.js';

let failed = 0;
function ok(cond, msg) {
  if (cond) { console.log('  PASS ' + msg); }
  else { failed++; console.error('  FAIL ' + msg); }
}
function eq(actual, expected, msg) {
  const brief = (v) => (v === null || typeof v !== 'object') ? JSON.stringify(v) : '[' + typeof v + ']';
  ok(actual === expected, msg + ' (got ' + brief(actual) + ', want ' + brief(expected) + ')');
}
function eqList(actual, expected, msg) {
  eq(JSON.stringify(actual), JSON.stringify(expected), msg);
}
const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
// 3x5 rank glyphs (the test's own copy, so a glyph edited in cards.js is
// re-measured here rather than trusted). The number glyphs are the COMMON
// family; J/Q/K are the FACE family the rare-tier combos carry (see the
// CONTRACT UPDATE note above) — a face rank with no glyph here must FAIL, not
// silently pass.
const RANK_GLYPHS = {
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '010', '010', '010'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
  'J': ['011', '001', '001', '101', '010'],
  'Q': ['111', '101', '101', '111', '001'],
  'K': ['101', '101', '110', '101', '101'],
  // RSS8 (disclosed 2026-09-17): the expansion deck's first ACE — the
  // magnet_collector MYTHIC. Same glyph the core deck's ace (full_hand) rides.
  'A': ['010', '101', '111', '101', '101'],
};
const SUIT_PIPS = {
  spades:   ['00100', '01110', '11111', '00100', '01110'],
  hearts:   ['01010', '11111', '11111', '01110', '00100'],
  diamonds: ['00100', '01110', '11111', '01110', '00100'],
  clubs:    ['00100', '01110', '11011', '00100', '01110'],
};
// The motif INTERIOR is the painted shape, not the frame, compared in a
// window that CANNOT carry pip ink: the top-left pips live at x<=6 and the
// rotated bottom-right pips at x>=17, so cols 7..16 are motif-only at every
// row. (Rows 2..12 alone would not do it — the suit pip reaches x=6 there,
// and a duplicated grid under a different suit would compare UNEQUAL and slip
// through. Measured: an aliased snowflake on a hearts card passed a
// rows10-24/cols5-18 window.) Two cards "share a motif" when these match.
// A card that is NOT registered gets a sentinel (never a crash) — its absence
// is reported by the deck-contract section, and the sentinel cannot collide.
const interiorOf = (id) => CARD_ART[id]
  ? JSON.stringify(CARD_ART[id].grid.slice(10, 25).map((r) => r.slice(7, 17)))
  : 'MISSING:' + id;
// CONTRACT UPDATE 2026-09-15 (owner decision — see the header): a CARD_EXPANSION
// entry may declare a tier, and the declaration must agree with the rank class
// the card carries: COMMON = a number rank, RARE = a face rank. The mapping is
// read off RANK_CLASS so it lives in ONE place in the codebase; a card whose
// rank contradicts its declaration is refused.
// CONTRACT UPDATE 2026-09-17 (RSS8, disclosed): the expansion tier vocabulary
// grows MYTHIC = an ace rank — the 4th MYTHIC chase card (magnet_collector)
// lives in the EXPANSION deck because the core deck's 13-card pin does not
// move, and it must resolve as an ace/joker like every other
// DRAFT_MYTHIC_UPGRADES member (see the FULL POOL COVERAGE section). Joker
// stays refused here: the two full-art jokers are core-deck-only.
const TIER_RANK_CLASS = { COMMON: 'number', RARE: 'face', MYTHIC: 'ace' };
const DEF_BY_ID = Object.fromEntries(CARD_EXPANSION.map((c) => [c.id, c]));
// The ONLY rare-tier expansion cards: the live rewrite registry's cross-tag
// combos (two reserved tags). Derived, never a frozen id list — and the deck id
// is read through the LIVE join (OFFER_TO_DECK), not assumed from a prefix, so a
// missing row shows up as a mismatch rather than as a silently passing check.
const COMBO_REWRITE_IDS = REWRITE_IDS.filter(isComboRewrite);
const COMBO_OFFER_IDS = COMBO_REWRITE_IDS.map((id) => 'rewrite_' + id);
const COMBO_DECK_IDS = COMBO_OFFER_IDS.map((offer) => OFFER_TO_DECK[offer]);
// The deck card an offer resolves to, or null. Guarded so a missing card
// FAILS a check instead of throwing: `cardArt(null)` is null, never a crash.
const artForOffer = (offerId) => cardArt(deckIdForOffer(offerId));
const nameForOffer = (offerId) => { const a = artForOffer(offerId); return a && a.name; };
const classForOffer = (offerId) => { const a = artForOffer(offerId); return a && a.rankClass; };
// The ONLY two documented interior collisions with the core deck — motif
// reuse BY IDENTITY (VOLLEY is the arrow volley Split Shot extends; PIERCE
// ALL is pierce itself). Anything else that duplicates a grid is a bug.
const IDENTITY_REUSE = { wpn_volley: 'multi', rw_pierceall: 'pierce' };

// ------------------------------------------------------------ the pool ------
// Every offer id src/main.js openDraft can produce, built from the LIVE
// registries — no frozen list, no frozen count.
// G26 RETARGET (2026-09-15, owner: "Replaces in run cards"): wpn_* grant
// offers LEFT the draft pool (the pre-run LOADOUT screen owns weapon choice
// now), so they left THIS enumeration too. The weapon-card coverage did not
// die with them — it moved to the MENU section below: every wpn_<TYPE> must
// still resolve to a real deck card, because the loadout screen paints its
// rows through the same deckIdForOffer join (src/main.js showLoadout).
function poolOfferIds() {
  const ids = [];
  for (const type of Object.keys(WEAPON_NAMES)) {
    ids.push('lvl_' + type + '_1', 'lvl_' + type + '_' + WEAPON_MAX_LEVEL,
      'lvl_' + type + '_' + (WEAPON_MAX_LEVEL + 1));
  }
  for (const u of [...UPGRADES, ...DRAFT_RARE_UPGRADES, ...DRAFT_MYTHIC_UPGRADES]) ids.push(u.id);
  for (const id of RULE_IDS) ids.push('rule_' + id);
  for (const id of SKILL_PERK_IDS) ids.push('skill_' + id);
  ids.push(FROST_CARD_ID);
  for (const id of REWRITE_IDS) ids.push('rewrite_' + id);
  return ids;
}
const OFFER_IDS = poolOfferIds();
const OFFER_SET = new Set(OFFER_IDS);
// Fresh run states, built only to reach every model that gates a card (the
// G21 slice 1 predicates: a blast source for AFTERSHOCK, an ORBIT weapon for
// WIDE ORBIT, a non-FROST_NOVA class Q for the Pocket Frost card).
const PROBE_STATES = [
  { player: {} },
  { player: {}, weapons: [{ type: 'ORBIT' }] },
  { player: { rewrites: { onkillboom: true } }, weapons: [] },
  { player: {}, character: { skill: 'CHAIN_REACTION' }, weapons: [] },
];
const livePoolCards = () => {
  const out = [];
  for (const s of PROBE_STATES) {
    out.push(...ruleCards(s), ...skillCards(s), ...rewriteCards(s));
    if (frostCardOffered(s)) out.push(frostCard());
  }
  return out;
};

console.log('DECK CONTRACT (derived from CARD_EXPANSION — no frozen count):');
{
  ok(EXPANSION_IDS.length > 0, 'the expansion carries at least one card');
  eq(new Set(EXPANSION_IDS).size, EXPANSION_IDS.length, 'every expansion id is unique');
  eqList(EXPANSION_IDS, CARD_EXPANSION.map((c) => c.id), 'EXPANSION_IDS is CARD_EXPANSION in order');
  eq(CARD_DECK.length, 13, 'the CORE deck is untouched (still 13)');
  eqList(EXPANSION_IDS.filter((id) => CARD_IDS.includes(id)), [],
    'no expansion id shadows a core deck id');
  for (const def of CARD_EXPANSION) {
    const a = cardArt(def.id);
    ok(!!a, 'cardArt(' + def.id + ') exists');
    if (!a) continue;
    eq(a.name, def.name, def.id + ' cardArt name matches its definition');
    // CONTRACT UPDATE 2026-09-15 (owner decision — see the header): the
    // expansion holds TWO legal tiers and the card's own declaration must agree
    // with the rank it carries. COMMON = a number rank; RARE = a face rank.
    // ace/joker/chase (the W7b ladder + the two jokers) still cannot appear.
    const declared = def.tier || 'COMMON';
    ok(declared in TIER_RANK_CLASS, def.id + ' declares a legal expansion tier (got ' + declared + ')');
    eq(a.rankClass, TIER_RANK_CLASS[declared], def.id + ' rank class agrees with its declared tier');
    eq(a.tier, RANK_CLASS[a.rankClass], def.id + ' tier IS the rank class (rank IS the rarity)');
    eq(a.tier, declared, def.id + ' derived tier matches the declaration');
    // (RSS8 2026-09-17, disclosed: MYTHIC joins RARE as a non-number tier —
    // the 4th mythic chase card rides an ACE in this deck.)
    ok(declared === 'RARE' || declared === 'MYTHIC' || a.rankClass === 'number',
      def.id + ' COMMON expansion cards keep a NUMBER rank (rare = face, mythic = ace)');
    ok(!!SUITS[a.suit], def.id + ' suit is one of the four suits');
    eq(a.family, SUITS[a.suit] && SUITS[a.suit].family, def.id + ' family (suit IS the family)');
    eq(a.motif, def.motif, def.id + ' motif');
    eq(a.fullArt, false, def.id + ' is not full-art (jokers stay exclusive)');
    eq(a.joker, null, def.id + ' is no joker');
  }
  // The jokers stay the ONLY full-art cards, in the whole deck.
  eqList(Object.keys(CARD_ART).filter((id) => CARD_ART[id].fullArt), ['second_wind', 'storm_shards'],
    'the two jokers are the only full-art cards in the deck');
}

console.log('FORMAT + FRAME (same discipline as the core deck):');
{
  const borderOf = (g) => JSON.stringify([
    g[0], g[CARD_H - 1], g.map((r) => r[0]), g.map((r) => r[CARD_W - 1]),
  ]);
  const coreBorder = borderOf(CARD_ART.hp.grid);
  for (const id of EXPANSION_IDS) {
    const a = CARD_ART[id];
    ok(!!a, id + ' is registered in CARD_ART');
    if (!a) continue;
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
    eqList(a.rows, a.grid.map((r) => r.join('')), id + ' rows view === grid');
    eq(a.grid[0][0] + a.grid[0][CARD_W - 1] + a.grid[CARD_H - 1][0] + a.grid[CARD_H - 1][CARD_W - 1],
       0, id + ' corner pixels transparent (card silhouette)');
    eq(borderOf(a.grid), coreBorder, id + ' shares the ONE frame keyline + silhouette');
    ok(['1', '2', '3', '4'].every((k) => k in a.palette), id + ' carries the four frame keys');
    eq(a.palette[4], SUIT_COLOUR[SUITS[a.suit].colour], id + ' pips stamp in its suit colour');
  }
  // No rank+suit collision anywhere in the FULL deck (core + expansion).
  // Numbers may repeat ACROSS suits (7S and 7H are different cards); the
  // prohibition is the exact duplicate card.
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
  for (const id of EXPANSION_IDS) {
    const a = CARD_ART[id];
    ok(!!a, id + ' is registered in CARD_ART (pips)');
    if (!a) continue;
    const g = a.grid;
    const glyph = RANK_GLYPHS[a.rank];
    const pip = SUIT_PIPS[a.suit];
    ok(!!glyph, id + ' rank ' + a.rank + ' has a glyph in this independent copy');
    ok(!!pip, id + ' suit ' + a.suit + ' has a pip in this independent copy');
    if (!glyph || !pip) continue;
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
    ok(tl, id + ' top-left rank+suit pip inked in the suit colour (key 4)');
    ok(br, id + ' bottom-right pip is the same stamp rotated 180deg');
  }
}

console.log('MOTIFS (computed from the deck: distinct, with two identity reuses):');
{
  // 1. inside the expansion: every interior is its own.
  const dupes = [];
  const seen = new Map();
  for (const id of EXPANSION_IDS) {
    const k = interiorOf(id);
    if (seen.has(k)) dupes.push(seen.get(k) + ' + ' + id);
    else seen.set(k, id);
  }
  eqList(dupes, [], 'all ' + EXPANSION_IDS.length + ' expansion motifs are pairwise distinct');
  // 2. against the core deck: only the two documented identity reuses.
  const coreCollisions = [];
  for (const id of EXPANSION_IDS) {
    for (const cid of CARD_IDS) {
      if (interiorOf(id) !== interiorOf(cid)) continue;
      if (IDENTITY_REUSE[id] === cid) continue;
      coreCollisions.push(id + ' == ' + cid);
    }
  }
  eqList(coreCollisions, [],
    'no expansion motif duplicates a core motif (bar the two documented reuses)');
  // 3. the reuses are REAL reuses — same motif NAME and same pixels.
  for (const [id, cid] of Object.entries(IDENTITY_REUSE)) {
    eq(CARD_ART[id] && CARD_ART[id].motif, CARD_ART[cid] && CARD_ART[cid].motif,
       id + ' shares ' + cid + "'s motif by NAME");
    eq(interiorOf(id), interiorOf(cid), id + ' shares ' + cid + "'s motif by PIXELS");
  }
  // 4. across the WHOLE deck: cards may share motif pixels only when they
  //    share the motif name (an identity reuse). Two different motif names
  //    painting the same grid is an aliased grid under a new name — the exact
  //    cheat this assertion exists to catch.
  const byInterior = new Map();
  for (const id of Object.keys(CARD_ART)) {
    const k = interiorOf(id);
    if (!byInterior.has(k)) byInterior.set(k, []);
    byInterior.get(k).push(id);
  }
  const aliases = [];
  for (const ids of byInterior.values()) {
    if (ids.length < 2) continue;
    if (new Set(ids.map((id) => CARD_ART[id].motif)).size > 1) aliases.push(ids.join(' + '));
  }
  eqList(aliases, [], 'shared motif pixels always mean a shared motif NAME (no aliased grids)');
}

console.log('NAME JOINS (a rename on either side goes red):');
{
  // Every OFFER_TO_DECK / WEAPON_OFFER_TO_DECK row must point at a real card.
  for (const [offer, deckId] of Object.entries(OFFER_TO_DECK)) {
    ok(!!cardArt(deckId), 'OFFER_TO_DECK.' + offer + ' -> ' + deckId + ' is a real card');
    eq(deckIdForOffer(offer), deckId, offer + ' resolves through deckIdForOffer');
  }
  for (const [type, deckId] of Object.entries(WEAPON_OFFER_TO_DECK)) {
    ok(!!cardArt(deckId), 'WEAPON_OFFER_TO_DECK.' + type + ' -> ' + deckId + ' is a real card');
  }
  // G26 MENU SURFACE: wpn_<TYPE> ids no longer ride the DRAFT pool, but they
  // are exactly what the pre-run LOADOUT screen paints (showLoadout calls
  // paintOfferArt(cv, 'wpn_' + type)) — so every weapon archetype must still
  // resolve to a REAL card through the live join. This is the pool-coverage
  // check RETARGETED to the surface that serves the ids now, not a deletion.
  for (const type of Object.keys(WEAPON_TYPES)) {
    const deckId = deckIdForOffer('wpn_' + type);
    ok(!!deckId, 'wpn_' + type + ' (LOADOUT menu) resolves to deck card ' + (deckId || 'NULL'));
    if (deckId) ok(!!cardArt(deckId), 'wpn_' + type + ' -> ' + deckId + ' is a REAL card');
  }
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
  eq(nameForOffer('rate'), UPGRADES.find((u) => u.id === 'rate').name, 'Quick Hands joins by NAME');
  for (const id of RULE_IDS) {
    eq(nameForOffer('rule_' + id), RULES[id].name, 'rule_' + id + ' joins by NAME');
  }
  for (const id of SKILL_PERK_IDS) {
    eq(nameForOffer('skill_' + id), SKILL_PERKS[id].name, 'skill_' + id + ' joins by NAME');
  }
  eq(nameForOffer(FROST_CARD_ID), frostCard().name, 'the Pocket Frost card joins by NAME');
  for (const id of REWRITE_IDS) {
    eq(nameForOffer('rewrite_' + id), REWRITES[id].name, 'rewrite_' + id + ' joins by NAME');
  }
}

console.log('FULL POOL COVERAGE (every offer id the pool can produce is enumerated):');
{
  eq(new Set(OFFER_IDS).size, OFFER_IDS.length, 'the enumeration lists each offer id exactly once');
  ok(OFFER_IDS.length > 0, 'the enumeration is not empty');
  for (const id of OFFER_IDS) {
    const deckId = deckIdForOffer(id);
    ok(!!deckId, id + ' resolves to deck card ' + (deckId || 'NULL — PLAIN-TEXT FALLBACK'));
    if (deckId) ok(!!cardArt(deckId), id + ' -> ' + deckId + ' is a REAL card');
  }
  // The enumeration must COVER the pool: every card the LIVE builders emit
  // has to be in it (checked against the pool, never against a count), and
  // every live card must resolve AND join the deck card by name.
  const live = livePoolCards();
  ok(live.length > 0, 'the live pool builders emit cards for a fresh run');
  eqList(live.filter((c) => !OFFER_SET.has(c.id)).map((c) => c.id), [],
    'the enumeration covers every id the live pool builders emit');
  for (const c of live) {
    const deckId = deckIdForOffer(c.id);
    ok(!!deckId, c.id + ' (live pool) resolves to a deck card');
    if (deckId) eq(cardArt(deckId).name, c.name, c.id + ' -> ' + deckId + ' joins the live pool by NAME');
    ok(OFFER_SET.has(c.id), c.id + ' (live pool) is in the enumeration');
  }
  // Rank-class correctness across the join: pool cards are COMMON number cards,
  // EXCEPT the cross-tag combos, which are RARE face cards by the owner decision
  // 2026-09-15 — the allowance is derived from the LIVE rewrite registry
  // (`isComboRewrite`: a card carrying two reserved tags), never an id list
  // written here, so it cannot be widened by editing this file. (dmg is the ONE
  // common pool card the FROZEN core deck ships as a face card — Q of spades,
  // pinned by test_card_art.mjs; not this brief's to move.)
  for (const u of UPGRADES.filter((u) => u.id !== 'dmg')) {
    eq(classForOffer(u.id), 'number', u.id + ' is a COMMON number card');
  }
  for (const id of OFFER_IDS) {
    if (!/^(wpn_|lvl_|rule_|skill_|rewrite_)/.test(id)) continue;
    const combo = id.startsWith('rewrite_') && isComboRewrite(id.slice('rewrite_'.length));
    const wantClass = combo ? 'face' : 'number';
    eq(classForOffer(id), wantClass,
      id + ' is a ' + (combo ? 'RARE face' : 'COMMON number') + ' card');
  }
  // The rare tier is EXACTLY the combo set, and each combo really is RARE-tier
  // (the card art derives the tier from the rank, so this pins the declaration
  // AND the face rank together).
  eqList(EXPANSION_IDS.filter((id) => (DEF_BY_ID[id].tier || 'COMMON') === 'RARE'), COMBO_DECK_IDS,
    'the rare-tier expansion cards are exactly the live cross-tag combos');
  for (const offerId of COMBO_OFFER_IDS) {
    eq(classForOffer(offerId), 'face', offerId + ' (combo) is a RARE face card');
    const art = artForOffer(offerId);
    eq(art && art.tier, 'RARE', offerId + ' (combo) tier is RARE');
  }
  eq(artForOffer('dmg') && artForOffer('dmg').rank, 'Q', 'dmg keeps its frozen core-deck rank (Q of spades)');
  for (const u of DRAFT_RARE_UPGRADES) {
    eq(classForOffer(u.id), 'face', u.id + ' is a RARE face card');
  }
  for (const u of DRAFT_MYTHIC_UPGRADES) {
    ok(['ace', 'joker'].includes(classForOffer(u.id)), u.id + ' is a MYTHIC ace/joker card');
  }
  eq(classForOffer('full_hand'), 'ace', 'full_hand is the MYTHIC ace');
  eq(classForOffer('second_wind'), 'joker', 'second_wind is the RED joker');
  eq(classForOffer('storm_shards'), 'joker', 'storm_shards is the BLACK joker');
  // Only a genuinely unknown id fails safe.
  eq(deckIdForOffer('no_such_offer'), null, 'unknown offer id -> null (never a blank card)');
  eq(deckIdForOffer('wpn_NO_SUCH_WEAPON'), null, 'unknown weapon type -> null');
  eq(deckIdForOffer(undefined), null, 'undefined -> null');
}

console.log('RENDERER (every card in the deck paints one rect per inked cell):');
{
  for (const id of Object.keys(CARD_ART)) {
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
