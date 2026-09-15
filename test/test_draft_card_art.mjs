// HORDES — CARD ART INTEGRATION: the draft offers render their playing-card
// art through the REAL drawCard (R1), and ONE activation TAKES the card.
//
// CONTRACT UPDATE 2026-09-15 (owner directive, verbatim): "with the text boxes
// in the card select, we don't need the confirm step. It can go back to just
// touching will choose that card." The R2 inspect->confirm step is RETIRED, so
// sections 4-7 below now pin the NEW contract — and they are STRICTER, not
// softer: a single activation must take the offer (a re-added confirm step fails
// these), the retired inspect box must not exist in the DOM at all, ESC must not
// cancel anything, and the card's own text must carry the computed effect values
// that the box used to show.
//
// What is pinned here (all through the REAL seams — src/main.js openDraft /
// pick / the keydown routing, src/draft_card_art.js, never a restated copy):
//   1. the offer->deck join: every art-backed offer id maps to a REAL deck
//      card, and the three renamed ladder ids join by NAME (xp_pct is
//      Scholar's Stone, gold_pct is Gilded Palm, edge is Crimson Edge) — a
//      rename on either frozen track goes red here;
//   2. paintOfferArt paints REAL drawCard pixels (fillRects recorded through
//      the harness ctx) at the integer backing size;
//   3. openDraft wires a .card-art canvas into every art-backed offer and
//      into NO offer without deck art (fail-safe, never a blank rectangle);
//   4. ONE activation by CLICK takes the card: the draft closes, the pick
//      lands, the ledger records it, the overlay hides — in a SINGLE click;
//   5. activating a different card takes THAT card (there is no selection to
//      move — nothing between the tap and the take);
//   6. ESC does nothing: with no confirm step there is no intermediate state,
//      and the offer must not be dismissible;
//   7. KEYBOARD parity: arrows walk the cursor, Enter TAKES in one press;
//   8. the 1-4 number keys are the ONE-PRESS quick-pick (the contract
//      test_w7b_draft_ladder pins for [4]) — same single press as a tap;
//   9. the CARD's own markup carries the computed effect text (the ladder
//      percent, a weapon level's real describeWeaponLevel deltas) and its tier
//      badge, because that is what replaced the inspect box.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { boot, suite } from './_harness.mjs';
import { CARD_DECK, cardArt } from '../src/art/cards.js';
import { UPGRADES, DRAFT_RARE_UPGRADES, DRAFT_MYTHIC_UPGRADES } from '../src/config.js';
import { describeWeaponLevel } from '../src/weapons.js';
import {
  OFFER_TO_DECK, deckIdForOffer, paintOfferArt, OFFER_ART_SCALE,
} from '../src/draft_card_art.js';
import { cardBox } from '../src/render_cards.js';

const s = suite('test_draft_card_art');

// ---- 1. the offer->deck join (pure) -----------------------------------------
s.check('every OFFER_TO_DECK target is a REAL deck card', () => {
  for (const [offerId, deckId] of Object.entries(OFFER_TO_DECK)) {
    assert.ok(cardArt(deckId), `${offerId} -> ${deckId} must exist in the full deck (core 13 + expansion)`);
  }
});
s.check('the three renamed ladder ids join by NAME (both frozen tracks)', () => {
  const nameOf = (list, id) => list.find(u => u.id === id).name;
  const deckName = (id) => CARD_DECK.find(c => c.id === id).name;
  assert.equal(deckName(deckIdForOffer('xp_pct')), nameOf(DRAFT_RARE_UPGRADES, 'xp_pct'), "Scholar's Stone");
  assert.equal(deckName(deckIdForOffer('gold_pct')), nameOf(DRAFT_RARE_UPGRADES, 'gold_pct'), 'Gilded Palm');
  assert.equal(deckName(deckIdForOffer('edge')), nameOf(DRAFT_RARE_UPGRADES, 'edge'), 'Crimson Edge');
});
s.check('every offer id the pool can offer resolves to deck art (CARD ART COVERAGE)', () => {
  // hp/speed/pickup/pierce/multi/dmg + rate (Quick Hands) + the whole W7b ladder...
  for (const u of [...UPGRADES, ...DRAFT_RARE_UPGRADES, ...DRAFT_MYTHIC_UPGRADES]) {
    assert.ok(deckIdForOffer(u.id), `${u.id} should resolve to a deck card`);
  }
  // ...and the weapon grant/level-up cards too — NO plain-text fallback anywhere.
  assert.ok(deckIdForOffer('wpn_BOOMERANG'), 'a weapon grant resolves to its weapon card');
  assert.ok(deckIdForOffer('lvl_VOLLEY_1'), 'a weapon level-up resolves to its weapon card');
  assert.ok(deckIdForOffer('rate'), 'Quick Hands resolves to its card');
  // ...only a genuinely unknown id fails safe: no art, no blank canvas.
  assert.equal(deckIdForOffer('no_such_offer'), null);
});

// ---- boot the REAL game ------------------------------------------------------
const { T, state, elements, rec, key } = await boot({ storage: [['hordes_onboarded', '1']] });

// ---- 2. paintOfferArt paints REAL drawCard pixels ----------------------------
s.check('paintOfferArt paints through the REAL drawCard at the integer backing size', () => {
  const cv = document.createElement('canvas');
  const before = rec.rects.length;
  rec.on = true;
  try {
    assert.equal(paintOfferArt(cv, 'edge'), true, 'Crimson Edge has art');
  } finally { rec.on = false; }
  const { w, h } = cardBox(OFFER_ART_SCALE);
  assert.equal(cv.width, w, 'backing width is the integer-scale card box');
  assert.equal(cv.height, h, 'backing height is the integer-scale card box');
  assert.ok(rec.rects.length > before + 100, 'the full card (frame + pips + motif) painted, not a corner');
  assert.equal(paintOfferArt(document.createElement('canvas'), 'wpn_BOOMERANG'), true, 'a weapon grant has art');
  assert.equal(paintOfferArt(document.createElement('canvas'), 'no_such_offer'), false, 'unknown id -> false');
});

// ---- draft helpers -----------------------------------------------------------
// Open a REAL draft with exactly one pending pick, looping until the offers
// satisfy pred (the pool is weighted-random; caps guard against an infinite
// loop, and the cap itself asserts).
function openDraftUntil(pred, cap = 400) {
  for (let i = 0; i < cap; i++) {
    state.mode = 'playing';
    state.pendingDrafts = 1;
    T.openDraft();
    const kids = Array.from(elements['ov-cards'].children);
    if (pred(kids)) return kids;
  }
  return null;
}
const offerOf = (el) => el._draftOffer;
const artChild = (el) => (el.children || []).find(c => c.className === 'card-art');

// ---- 3. openDraft wires the art in -------------------------------------------
s.check('openDraft wires .card-art into art-backed offers only', () => {
  T.startRun();
  const kids = openDraftUntil(ks => ks.some(artChild));
  assert.ok(kids, 'an art-backed offer appears within the cap');
  for (const el of kids) {
    const hasArt = !!deckIdForOffer(offerOf(el).id);
    assert.equal(!!artChild(el), hasArt,
      `${offerOf(el).id}: canvas present iff the offer has deck art`);
    if (hasArt) {
      const { w, h } = cardBox(OFFER_ART_SCALE);
      assert.equal(artChild(el).width, w);
      assert.equal(artChild(el).height, h);
    }
  }
});

// ---- 4. ONE activation takes the card (no confirm step) ----------------------
s.check('the retired inspect machinery is GONE from the shipped source', () => {
  // A RUNTIME absence check is not possible in this harness: getElementById
  // fabricates a stub element for ANY id (`elements[id] ?? (elements[id] = el())`),
  // so a deleted #draft-inspect would still "exist" here and the old test passed
  // against a stub. Pin the real artifact instead — the shipped markup + the
  // module — so a re-added confirm step fails this file.
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const art = readFileSync(new URL('../src/draft_card_art.js', import.meta.url), 'utf8');
  assert.ok(!html.includes('draft-inspect'), 'index.html must not carry the retired #draft-inspect element');
  assert.ok(!/draftInspect|\bopenDraftInspect\b|\bhideDraftInspect\b|\bmarkDraftSelected\b/.test(main),
    'main.js must not carry the retired inspect machinery');
  assert.ok(!main.includes('INSPECT_ART_SCALE'), 'main.js must not reference the retired 6x inspect scale');
  assert.ok(!art.includes('INSPECT_ART_SCALE'), 'the retired inspect scale must be gone from the wiring module');
  assert.ok(/function activateDraftCard\(u\)/.test(main), 'the ONE-argument activation seam still exists');
});
s.check('ONE click TAKES the card (no confirm step): draft closes, pick lands', () => {
  const kids = openDraftUntil(ks => ks.length > 0);
  const el = kids[0], u = offerOf(el);
  el.click();
  assert.equal(state.mode, 'playing', 'the SINGLE activation took the card and closed the draft');
  assert.equal(state.pendingDrafts, 0, 'the pick landed');
  assert.equal(elements.overlay.style.display, 'none', 'the overlay is hidden');
  if (!(u.id.startsWith('wpn_') || u.id.startsWith('lvl_')) && !u.rule && !u.skill && !u.rewrite) {
    assert.ok((state.player.takenStats || {})[u.id], 'the stat ledger recorded the take');
  }
});

// ---- 5. each activation is a TAKE, not a selection ---------------------------
s.check('clicking a DIFFERENT card takes THAT card (there is no selection to move)', () => {
  const kids = openDraftUntil(ks => ks.length > 1);
  const second = offerOf(kids[1]);
  kids[1].click();
  assert.equal(state.mode, 'playing', 'the click took the card it was on');
  assert.equal(state.pendingDrafts, 0);
  // The ledger/takenStats write proves WHICH offer was applied, not just that
  // some offer was. (Weapon/level cards level a weapon instead — check the id
  // family before reading a ledger row.)
  if (!(second.id.startsWith('wpn_') || second.id.startsWith('lvl_')) && !second.rule && !second.skill && !second.rewrite) {
    assert.ok((state.player.takenStats || {})[second.id], 'the SECOND card is what landed');
  }
});

// ---- 6. ESC must not cancel anything ----------------------------------------
s.check('ESC does not cancel the draft (there is no confirm step to back out of)', () => {
  const kids = openDraftUntil(ks => ks.length > 0);
  const before = kids.map(offerOf);
  key('keydown', { key: 'Escape' });
  assert.equal(state.mode, 'draft', 'the offer is still open');
  assert.equal(state.pendingDrafts, 1, 'nothing was taken');
  assert.deepEqual(Array.from(elements['ov-cards'].children).map(offerOf), before,
    'the SAME offers are on screen — ESC changed nothing');
});

// ---- 7. KEYBOARD parity: one Enter takes -------------------------------------
s.check('arrows walk the cursor and ONE Enter TAKES the card', () => {
  const kids = openDraftUntil(ks => ks.length > 1);
  key('keydown', { key: 'ArrowRight' });
  assert.equal(T.draftFocus(), 0, 'the first arrow lands on the first card');
  key('keydown', { key: 'ArrowRight' });
  assert.equal(T.draftFocus(), 1, 'the cursor moved to the second card');
  key('keydown', { key: 'ArrowLeft' });
  key('keydown', { key: 'ArrowLeft' });
  assert.equal(T.draftFocus(), kids.length - 1, 'the cursor wraps');
  key('keydown', { key: 'ArrowRight' });
  assert.equal(T.draftFocus(), 0);
  key('keydown', { key: 'Enter' });
  assert.equal(state.mode, 'playing', 'the FIRST and only Enter took the card');
  assert.equal(state.pendingDrafts, 0, 'one press picked');
});

// ---- 8. the number keys stay the one-press quick-pick ------------------------
s.check('a number key still TAKES in one press (the pinned [4] contract)', () => {
  openDraftUntil(ks => ks.length > 0);
  key('keydown', { key: '2' });
  assert.equal(state.pendingDrafts, 0, 'one press picked');
  assert.equal(state.mode, 'playing', 'the draft closed on one press');
});

// ---- 9. the CARD carries the computed text (what replaced the box) -----------
s.check("the card's own markup shows the ladder card's computed effect text", () => {
  // Iron Heart +25%: the rare anchor, offered at RARE weight — loop until seen.
  const kids = openDraftUntil(ks => ks.some(el => offerOf(el).id === 'hp_pct'));
  assert.ok(kids, 'Iron Heart +25% was offered within the cap');
  const el = kids.find(k => offerOf(k).id === 'hp_pct');
  const html = el.innerHTML || '';
  assert.ok(html.includes('+25% max HP'), 'the computed percent is ON THE CARD, not a restatement');
  assert.ok(html.includes('RARE'), 'the tier badge rides along on the card');
  assert.ok(html.includes('[2]') || html.includes('['), 'the key hint rides along too');
});
s.check("the card's own markup shows a weapon level-up card's REAL describeWeaponLevel deltas", () => {
  const kids = openDraftUntil(ks => ks.some(el => offerOf(el).id.startsWith('lvl_')));
  assert.ok(kids, 'a level-up card was offered within the cap');
  const el = kids.find(k => offerOf(k).id.startsWith('lvl_'));
  const u = offerOf(el);
  const [type, lv] = [u.id.split('_')[1], Number(u.id.split('_')[2])];
  const html = el.innerHTML || '';
  const want = describeWeaponLevel(type, lv + 1);
  if (want) assert.ok(html.includes(want), "the weapon's actual next-level deltas are on the card");
});

s.done();
