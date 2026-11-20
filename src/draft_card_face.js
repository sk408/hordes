// HORDES - DRAFT CARD FACE (R5 "cards worth holding").
//
// A draft offer is drawn as a playing card: a ribbon on top (NEW, EVOLUTION
// READY, RARE, MYTHIC, JOKER), the card face large inside a border coloured by
// its rarity, a "makes FLUSH" tag when taking it makes a better hand, the
// name, and at most two short effect lines. Everything else (the long text,
// the numbers, the evolution and fusion roads) goes to a detail the player
// opens by hovering, by the keyboard cursor, or by pressing and holding.
//
// This file holds the pure parts, so tests can pin them without a browser:
// what the face says, which rarity it shows, the hand tag, the deal-in
// timing, and the pixel card back. main.js presentDraft builds the DOM.
import { cardArt } from './art/cards.js';
import { drawCardArt, cardBox } from './render_cards.js';
import { deckIdForOffer, JOKER_KEYLINE } from './draft_card_art.js';
import { evaluateHand, handCardOf, handCards } from './hands.js';
import { handOpts, jokersHeld, jokerRowFull, JOKER_OFFER_PREFIX } from './jokers.js';
import { RARITY } from './rarity.js';

// ---- rarity ------------------------------------------------------------------
// The border colour of each rarity. RARE and MYTHIC are the field's own
// rarity rings (rarity.js), so the draft and the field speak one language.
// COMMON is a plain brass edge. Jokers keep their violet keyline.
export const RARITY_BORDER = {
  common: '#8a7350',
  rare: RARITY.RARE.tell.outline,
  mythic: RARITY.MYTHIC.tell.outline,
  joker: JOKER_KEYLINE,
};
// The rarities that shimmer.
export const SHIMMER_RARITIES = new Set(['rare', 'mythic']);

const isJokerOffer = (u) => !!(u && (u.joker || u.jokerSwap ||
  String(u.artId || u.id || '').startsWith(JOKER_OFFER_PREFIX)));

/** The rarity a draft offer shows: 'joker', 'mythic', 'rare' or 'common'. */
export function offerRarity(u) {
  if (!u) return 'common';
  if (isJokerOffer(u)) return 'joker';
  const deckId = deckIdForOffer(u.artId || u.id);
  const tier = deckId ? cardArt(deckId).tier : null;
  // The ladder cards carry their tier on the offer too (RARE).
  if (tier === 'MYTHIC' || u.tier === 'MYTHIC') return 'mythic';
  if (tier === 'RARE' || u.tier === 'RARE') return 'rare';
  return 'common';
}

// ---- the ribbon ----------------------------------------------------------------
// The ribbon's colour by its kind: gold for NEW and an evolution, the rarity
// tells for RARE and MYTHIC, the joker violet for jokers.
export const RIBBON_COLOUR = {
  new: '#ffd75e', evo: '#ffd75e', rare: RARITY.RARE.tell.outline, mythic: RARITY.MYTHIC.tell.outline,
  joker: '#b08aff',
};
// One line over the card. A NEW weapon reads as NEW first (and says when it is
// the free pick); a card that completes an evolution says so; then the tier.
export function offerRibbon(u, { kitFree = false } = {}) {
  if (!u) return null;
  if (u.kitNew) return { text: kitFree ? 'NEW: FREE PICK' : 'NEW WEAPON', cls: 'new' };
  if (u.refill) return { text: 'NEW WEAPON', cls: 'new' };
  if (u.evoReady) return { text: 'EVOLUTION READY', cls: 'evo' };
  // The lead weapon's card gives more than one level. Its face line names the
  // evolution road, so the bonus rides here ("LEAD: +2 LEVELS").
  if (u.leadText) {
    const n = /\+(\d+)/.exec(String(u.leadText));
    return { text: n ? 'LEAD: +' + n[1] + ' LEVELS' : 'LEAD WEAPON', cls: 'evo' };
  }
  if (u.tier === 'JOKER' || u.joker) return { text: 'JOKER', cls: 'joker' };
  if (u.jokerSwap) return { text: u.keep ? 'KEEP' : 'SWAP', cls: 'joker' };
  if (u.tier) return { text: String(u.tier), cls: String(u.tier).toLowerCase() === 'mythic' ? 'mythic' : 'rare' };
  const r = offerRarity(u);
  if (r === 'mythic') return { text: 'MYTHIC', cls: 'mythic' };
  if (r === 'rare') return { text: 'RARE', cls: 'rare' };
  return null;
}

// ---- the two face lines ------------------------------------------------------
// The face carries at most FACE_LINES lines. The first is the card's effect,
// short: the first part of its text, without the "Volley Lv3 - " lead a
// weapon level carries. The second is the one extra that matters most now.
export const FACE_LINES = 2;
const segs = (s) => String(s || '').split(' · ').map(x => x.trim()).filter(Boolean);
export function faceLines(u) {
  if (!u) return [];
  const d = segs(u.desc);
  const out = [];
  const first = (d[0] || '').replace(/^.*\bLv ?\d+ — /, '');
  if (first) out.push({ text: first, cls: 'fx main' });
  // The road to an evolution comes first: the guided first draft teaches
  // that weapon cards name their evolution partner, so the face must show it
  // ("evolves with Split Shot at Lv 8"; a partner stat card: "evolves Volley").
  // The LEAD bonus then rides the ribbon (offerRibbon), so nothing is lost.
  let second = null;
  if (u.evoText) second = { text: segs(u.evoText)[0], cls: u.evoReady ? 'fx evo' : 'fx road' };
  else if (u.leadText) second = { text: u.leadText, cls: 'fx lead' };
  else if (u.stackText) second = { text: u.stackText, cls: 'fx stack' };
  else if (u.kitNew || u.refill) {
    const join = d.find(x => /\bLv \d+$/.test(x));
    if (join) second = { text: join.replace(/^from your loadout, /, ''), cls: 'fx' };
  } else if (String(u.id || '').startsWith('lvl_')) {
    const lv = d.find(x => /^Lv \d+\/\d+$/.test(x) || /MAXED/.test(x));
    if (lv) second = { text: lv, cls: 'fx dim' };
  }
  if (second && second.text) out.push(second);
  return out.slice(0, FACE_LINES);
}

// ---- the hand tag -----------------------------------------------------------
// "makes FLUSH": the hand the run would hold after taking this card, when it is
// better than the hand held now. Worked out with evaluateHand on exactly what
// the pick changes (main.js pick): a hand card joins the hand; a joker joins the
// row (its rule may change how the hand counts); a joker swap trades one joker
// for another. A joker taken with a full row, KEEP, and a shrine blessing change
// nothing yet, so they never carry a tag.
export function handAfterPick(state, u) {
  const p = state && state.player;
  if (!p || !u || u.blessing || u.keep) return null;
  let cards = handCards(p);
  let jokers = jokersHeld(state);
  if (u.jokerSwap) {
    if (!u.out || !u.in) return null;
    jokers = jokers.map(j => (j === u.out ? u.in : j));
  } else if (u.joker) {
    if (jokerRowFull(state) || jokers.includes(u.joker)) return null;
    jokers = [...jokers, u.joker];
  } else {
    const c = handCardOf(u.id);
    if (!c || (p.handCards && p.handCards[c.key])) return null;
    cards = [...cards, c];
  }
  return evaluateHand(cards, handOpts({ player: { jokers } }));
}
export function offerHandTag(state, u) {
  const p = state && state.player;
  if (!p) return null;
  const then = handAfterPick(state, u);
  if (!then) return null;
  const now = evaluateHand(handCards(p), handOpts(state));
  if (now && then.order <= now.order) return null;
  return { hand: then, text: 'makes ' + then.name.toUpperCase() };
}

// ---- the deal-in --------------------------------------------------------------
// The cards arrive face down and flip one after the other. One flip takes
// FLIP_MS; the starts are spread so the last card is face up by DEAL_MAX_MS,
// whatever the number of cards. Presentation only: nothing waits for it.
export const DEAL = { FLIP_MS: 150, STAGGER_MS: 70, DEAL_MAX_MS: 360 };
export function dealDelays(n) {
  const k = Math.max(1, n | 0);
  if (k === 1) return [0];
  const step = Math.min(DEAL.STAGGER_MS, Math.floor((DEAL.DEAL_MAX_MS - DEAL.FLIP_MS) / (k - 1)));
  return Array.from({ length: k }, (_, i) => i * step);
}

// ---- the card back -----------------------------------------------------------
// A 24x34 pixel back, the size of the card art: a dark keyline, a brass
// border, a maroon field with a diamond lattice, and a gold diamond in the
// middle. Drawn through the same painter as the card faces.
const BACK_PALETTE = { 1: '#1a0f08', 2: '#c9a05a', 3: '#4a1822', 4: '#7a2a36', 5: '#ffd75e' };
let backGrid = null;
export function cardBackArt() {
  if (backGrid) return backGrid;
  const W = 24, H = 34, grid = [];
  for (let y = 0; y < H; y++) {
    const row = [];
    for (let x = 0; x < W; x++) {
      const edge = Math.min(x, y, W - 1 - x, H - 1 - y);
      const corner = (x === 0 || x === W - 1) && (y === 0 || y === H - 1);
      const dc = Math.abs(x - 11.5) + Math.abs(y - 16.5);
      let v;
      if (corner) v = 0;
      else if (edge === 0) v = 1;
      else if (edge === 2) v = 2;
      else if (edge < 2) v = 3;
      else if (dc <= 3) v = 5;
      else if (dc <= 4) v = 1;
      else v = ((x + y) % 4 === 0 || (x - y + 64) % 4 === 0) ? 4 : 3;
      row.push(v);
    }
    grid.push(row);
  }
  backGrid = { grid, palette: BACK_PALETTE };
  return backGrid;
}
export function paintCardBack(cv, scale) {
  const { w, h } = cardBox(scale);
  cv.width = w;
  cv.height = h;
  if (cv.style) {
    cv.style.width = w + 'px';
    cv.style.height = h + 'px';
    cv.style.imageRendering = 'pixelated';
  }
  if (typeof cv.getContext !== 'function') return true;
  const g = cv.getContext('2d');
  if (!g) return true;
  return drawCardArt(g, cardBackArt(), 0, 0, scale);
}
