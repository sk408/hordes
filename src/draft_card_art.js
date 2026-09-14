// HORDES — DRAFT CARD ART WIRING (CARD ART INTEGRATION brief, the R1 seam).
//
// Joins the two frozen tracks this slice is not allowed to edit:
//   src/art/cards.js   — the deck (CARD_DECK / cardArt), DO NOT EDIT
//   src/render_cards.js — drawCard(g, id, x, y, scale), DO NOT EDIT
// to the draft display in src/main.js (openDraft + the inspect box).
//
// The deck names its W7b cards for the shipped ladder ids where those exist
// (hp_pct / full_hand / second_wind / storm_shards match), but three shipped
// ladder ids predate the deck; those join by NAME (verified by
// test/test_draft_card_art.mjs against config.js, so a rename on either side
// goes red instead of silently losing its art):
//   xp_pct   -> scholars_stone  ("Scholar's Stone")
//   gold_pct -> gilded_palm     ("Gilded Palm")
//   edge     -> crimson_edge    ("Crimson Edge")
// Offers with no deck entry (weapon grant/level cards, run rules, perks,
// rewrites) get NO canvas: drawCard fails safe on unknown ids, and an empty
// backing store would paint a blank rectangle over the card.
import { cardArt } from './art/cards.js';
import { drawCard, cardBox } from './render_cards.js';

export const OFFER_TO_DECK = {
  // COMMON (config.js UPGRADES — ids match the deck 1:1)
  hp: 'hp', speed: 'speed', pickup: 'pickup', pierce: 'pierce', multi: 'multi', dmg: 'dmg',
  // W7b RARE ladder
  hp_pct: 'hp_pct', xp_pct: 'scholars_stone', gold_pct: 'gilded_palm', edge: 'crimson_edge',
  // W7b MYTHIC chase
  full_hand: 'full_hand', second_wind: 'second_wind', storm_shards: 'storm_shards',
};

// The deck id backing a draft offer, or null when the offer has no card art.
export function deckIdForOffer(offerId) {
  const deckId = OFFER_TO_DECK[offerId] || null;
  return deckId && cardArt(deckId) ? deckId : null;
}

// INTEGER scales only (the house pixel-art rule; drawCard refuses sub-pixel).
// 24x34 card: 4x -> 96x136 (fits the 170px .card box), 6x -> 144x204 (inspect).
export const OFFER_ART_SCALE = 4;
export const INSPECT_ART_SCALE = 6;

// Paint the offer's playing-card art onto a canvas element through the REAL
// drawCard (never a re-drawn look). Returns false when the offer has no art —
// the caller then appends nothing. A stub DOM without canvas support keeps
// the markup (class + data-card + backing size) as the contract, exactly like
// paintTitleHeader; the pixels are the browser's. Backing store == CSS size
// (1 backing px = 1 CSS px, an integer 3x on a dpr-3 phone), pixelated — the
// same convention as the G13 portraits and the U1b frame.
export function paintOfferArt(cv, offerId, scale = OFFER_ART_SCALE) {
  const deckId = deckIdForOffer(offerId);
  if (!deckId) return false;
  const { w, h } = cardBox(scale);
  cv.width = w;
  cv.height = h;
  if (cv.style) {
    cv.style.width = w + 'px';
    cv.style.height = h + 'px';
    cv.style.display = 'block';
    cv.style.margin = '0 auto 8px';
    cv.style.position = 'relative';   // above the card's painted frame canvas
    cv.style.zIndex = '1';
    cv.style.imageRendering = 'pixelated';
  }
  if (typeof cv.getContext !== 'function') return true;
  const g = cv.getContext('2d');
  if (!g) return true;
  return drawCard(g, deckId, 0, 0, scale);
}
