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
import { drawCard, drawCardArt, cardBox } from './render_cards.js';
import { parallelCardArt } from './parallels.js';

export const OFFER_TO_DECK = {
  // COMMON (config.js UPGRADES — ids match the deck 1:1)
  hp: 'hp', speed: 'speed', pickup: 'pickup', pierce: 'pierce', multi: 'multi', dmg: 'dmg',
  // COMMON utility (Quick Hands rides the new expansion card)
  rate: 'quick_hands',
  // W7b RARE ladder
  hp_pct: 'hp_pct', xp_pct: 'scholars_stone', gold_pct: 'gilded_palm', edge: 'crimson_edge',
  // W7b RARE ladder addition (TIER-2(b)): the new percent/scaling chase card
  // joins its own expansion RARE-face card BY NAME (pinned in
  // test_card_art_expansion.mjs).
  thorns: 'thornmail',
  // W7b MYTHIC chase (RSS8: magnet_collector rides the expansion deck's own
  // MYTHIC ace — same join, same art pipeline)
  full_hand: 'full_hand', second_wind: 'second_wind', storm_shards: 'storm_shards',
  magnet_collector: 'magnet_collector',
  // TIER-2(b) mythic additions: the two new build-definers ride expansion
  // MYTHIC aces of their own (offer id == deck id, the magnet_collector
  // precedent — same join, same art pipeline).
  tempest: 'tempest', killshot: 'killshot',
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
  // G21 slice 2 second-per-tag singles (always offered until taken/full)
  rewrite_glacier: 'rw_glacier', rewrite_wildfire: 'rw_wildfire', rewrite_overload: 'rw_overload',
  // G21 slice 2 cross-tag combos (predicate-offered: both constituents owned).
  // RARE-tier cards (face rank) since the owner decision 2026-09-15 — the same
  // join, the same art pipeline; only the rank/suit differ.
  rewrite_thermalshock: 'rw_thermalshock', rewrite_stormreaper: 'rw_stormreaper',
  rewrite_glacialorbit: 'rw_glacialorbit',
  // TIER-2(b) combo additions (same contract: predicate-offered, RARE-face).
  rewrite_shatter: 'rw_shatter', rewrite_cinder: 'rw_cinder',
  rewrite_frostwire: 'rw_frostwire',
};

// Weapon grant (wpn_<TYPE>) and level-up (lvl_<TYPE>_<lv>) offers share the
// weapon's own card — keyed by the WEAPON_TYPES/WEAPON_NAMES type, joined by
// NAME in test/test_card_art_expansion.mjs so a rename on either side goes
// red. VOLLEY has a card even though it is never GRANTED (its level-up card
// rides in every pool: the base volley is always owned).
export const WEAPON_OFFER_TO_DECK = {
  VOLLEY: 'wpn_volley', ORBIT: 'wpn_orbit', BOOMERANG: 'wpn_boomerang',
  JAVELIN: 'wpn_javelin',
  ZAP: 'wpn_zap', NOVA_PULSE: 'wpn_nova_pulse', SCYTHE: 'wpn_scythe',
  EMBER: 'wpn_ember', RICOCHET: 'wpn_ricochet',
  SEEKER: 'wpn_seeker', METEOR: 'wpn_meteor', MINE: 'wpn_mine', BEAM: 'wpn_beam',
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
// 24x34 card: 4x -> 96x136 (fits the 170px .card box). The 6x inspect scale
// was retired 2026-09-15 with the draft inspect box (owner directive: one
// activation takes the card, so no second, larger view exists).
export const OFFER_ART_SCALE = 4;

// Paint the offer's playing-card art onto a canvas element through the REAL
// drawCard (never a re-drawn look). Returns false when the offer has no art —
// the caller then appends nothing. A stub DOM without canvas support keeps
// the markup (class + data-card + backing size) as the contract, exactly like
// paintTitleHeader; the pixels are the browser's. Backing store == CSS size
// (1 backing px = 1 CSS px, an integer 3x on a dpr-3 phone), pixelated — the
// same convention as the G13 portraits and the U1b frame.
// TIER-2(d): `parallel` (the offer object's parallel stamp) paints the DERIVED
// variant through the same drawCardArt painter drawCard itself uses — the
// foil/chroma/pulse treatment is art derivation, never a second renderer. A
// null/absent parallel is the byte-identical base path (drawCard by id).
// The draft overlay's layout rule. A short viewport (a phone held sideways)
// gets the COMPACT card: half-size art beside tighter text, all offers on one
// row, so the cards and the reroll/skip/banish buttons fit without scrolling.
// A narrow tall viewport keeps the stacked card and shrinks only the art to
// the card's inner width. Pure: main.js openDraft applies the result.
export const DRAFT_COMPACT_MAX_H = 500;
export const DRAFT_COMPACT = { ART_SCALE: 2, GAP: 8, PAD: 16, CARD_MAX: 250, CARD_PAD: 8 };
export function draftLayout(vw, vh, offers = 3) {
  const n = Math.max(1, offers | 0);
  if (vh <= DRAFT_COMPACT_MAX_H) {
    const K = DRAFT_COMPACT;
    const cardW = Math.floor(Math.min(K.CARD_MAX, (vw - K.PAD - K.GAP * (n - 1)) / n));
    return { compact: true, artScale: K.ART_SCALE, cardW };
  }
  // Stacked card on a narrow tall viewport: one row of border-box cards, and
  // the art takes the largest whole scale that fits the card's inner width.
  if (vw <= 700) {
    const cardW = Math.floor(Math.min(192, (vw - 16 - 10 * (n - 1)) / n));
    let artScale = OFFER_ART_SCALE;
    while (artScale > 2 && cardBox(artScale).w > cardW - 20) artScale--;
    return { compact: false, artScale, cardW };
  }
  return { compact: false, artScale: OFFER_ART_SCALE, cardW: null };
}

export function paintOfferArt(cv, offerId, scale = OFFER_ART_SCALE, parallel = null) {
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
  const variant = parallel ? parallelCardArt(deckId, parallel) : null;
  if (variant) return drawCardArt(g, variant, 0, 0, scale);
  return drawCard(g, deckId, 0, 0, scale);
}
