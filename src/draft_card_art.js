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
// CARD ART COVERAGE (docs/briefs/CARD_ART_COVERAGE.md): the join now covers
// EVERY offer the draft pool can produce — the weapon grant (wpn_*) and
// level-up (lvl_*) cards resolve through WEAPON_OFFER_TO_DECK to the weapon's
// own expansion card, and the utility/rule/perk/frost/rewrite families join
// 1:1 below. Only a genuinely unknown id gets NO canvas: drawCard fails safe
// on unknown ids, and an empty backing store would paint a blank rectangle
// over the card.
import { cardArt } from './art/cards.js';
import { drawCard, cardBox } from './render_cards.js';

export const OFFER_TO_DECK = {
  // COMMON (config.js UPGRADES — ids match the deck 1:1)
  hp: 'hp', speed: 'speed', pickup: 'pickup', pierce: 'pierce', multi: 'multi', dmg: 'dmg',
  // COMMON utility (Quick Hands rides the new expansion card)
  rate: 'quick_hands',
  // W7b RARE ladder
  hp_pct: 'hp_pct', xp_pct: 'scholars_stone', gold_pct: 'gilded_palm', edge: 'crimson_edge',
  // W7b MYTHIC chase
  full_hand: 'full_hand', second_wind: 'second_wind', storm_shards: 'storm_shards',
  // G8 run rules (rules.js ruleCards: 'rule_' + id)
  rule_hordebait: 'rule_hordebait', rule_once: 'rule_once',
  // G8 perks (perks.js skillCards: 'skill_' + id) + the N1 Pocket Frost card
  skill_regrowth: 'skill_regrowth', skill_focus: 'skill_focus', skill_thick: 'skill_thick',
  skill_frost: 'skill_frost',
  // G8 rewrites (rewrites.js rewriteCards: 'rewrite_' + id)
  rewrite_pierceall: 'rw_pierceall', rewrite_onkillboom: 'rw_onkillboom',
  rewrite_healthdamage: 'rw_healthdamage',
  // G21 slice 1 keyword rewrites (one per REWRITE_TAGS family)
  rewrite_rime: 'rw_rime', rewrite_ignite: 'rw_ignite', rewrite_livewire: 'rw_livewire',
  rewrite_aftershock: 'rw_aftershock', rewrite_wideorbit: 'rw_wideorbit',
};

// Weapon grant (wpn_<TYPE>) and level-up (lvl_<TYPE>_<lv>) offers share the
// weapon's own card — keyed by the WEAPON_TYPES/WEAPON_NAMES type, joined by
// NAME in test/test_card_art_expansion.mjs so a rename on either side goes
// red. VOLLEY has a card even though it is never GRANTED (its level-up card
// rides in every pool: the base volley is always owned).
export const WEAPON_OFFER_TO_DECK = {
  VOLLEY: 'wpn_volley', ORBIT: 'wpn_orbit', BOOMERANG: 'wpn_boomerang',
  ZAP: 'wpn_zap', NOVA_PULSE: 'wpn_nova_pulse', SCYTHE: 'wpn_scythe',
  SEEKER: 'wpn_seeker', MINE: 'wpn_mine', BEAM: 'wpn_beam',
};

// The deck id backing a draft offer, or null when the offer id is unknown.
export function deckIdForOffer(offerId) {
  let deckId = OFFER_TO_DECK[offerId] || null;
  if (!deckId && typeof offerId === 'string') {
    const type = offerId.startsWith('wpn_') ? offerId.slice(4)
      : offerId.startsWith('lvl_') ? offerId.slice(4).replace(/_\d+$/, '')
      : null;
    if (type) deckId = WEAPON_OFFER_TO_DECK[type] || null;
  }
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
