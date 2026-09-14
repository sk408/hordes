// HORDES — CARD ART INTEGRATION: the draft offers render their playing-card
// art through the REAL drawCard (R1), and the first activation INSPECTS while
// the second TAKES (R2, owner directive 2026-09-14).
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
//   4. inspect->confirm by CLICK: first click opens the box (draft stays
//      open, the box shows the card's own name + computed desc), second
//      click on the SAME card takes it; clicking a DIFFERENT card moves the
//      inspection; ESC cancels back to the offer;
//   5. KEYBOARD parity: arrows walk the cursor, Enter inspects, Enter again
//      takes, ESC cancels;
//   6. the 1-4 number keys stay the ONE-PRESS quick-pick (the contract
//      test_w7b_draft_ladder pins for [4]);
//   7. the box dies with its draft (taken -> hidden, overlay closed).
import assert from 'node:assert';
import { boot, suite } from './_harness.mjs';
import { CARD_DECK } from '../src/art/cards.js';
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
    assert.ok(CARD_DECK.some(c => c.id === deckId), `${offerId} -> ${deckId} must exist in CARD_DECK`);
  }
});
s.check('the three renamed ladder ids join by NAME (both frozen tracks)', () => {
  const nameOf = (list, id) => list.find(u => u.id === id).name;
  const deckName = (id) => CARD_DECK.find(c => c.id === id).name;
  assert.equal(deckName(deckIdForOffer('xp_pct')), nameOf(DRAFT_RARE_UPGRADES, 'xp_pct'), "Scholar's Stone");
  assert.equal(deckName(deckIdForOffer('gold_pct')), nameOf(DRAFT_RARE_UPGRADES, 'gold_pct'), 'Gilded Palm');
  assert.equal(deckName(deckIdForOffer('edge')), nameOf(DRAFT_RARE_UPGRADES, 'edge'), 'Crimson Edge');
});
s.check('every shipped stat/ladder offer id with deck art resolves; unmapped offers get none', () => {
  // hp/speed/pickup/pierce/multi/dmg + the whole W7b ladder carry art...
  for (const u of [...UPGRADES, ...DRAFT_RARE_UPGRADES, ...DRAFT_MYTHIC_UPGRADES]) {
    if (u.id === 'rate') continue;   // Quick Hands has no deck card today
    assert.ok(deckIdForOffer(u.id), `${u.id} should resolve to a deck card`);
  }
  // ...weapon/rule/skill offers fail safe: no art, no blank canvas.
  assert.equal(deckIdForOffer('wpn_BOOMERANG'), null);
  assert.equal(deckIdForOffer('lvl_VOLLEY_1'), null);
  assert.equal(deckIdForOffer('rate'), null);
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
  assert.equal(paintOfferArt(document.createElement('canvas'), 'wpn_BOOMERANG'), false, 'no art -> false');
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

// ---- 4. inspect->confirm by click --------------------------------------------
s.check('first click INSPECTS (draft stays open, box shows name + computed desc)', () => {
  const kids = openDraftUntil(ks => ks.length > 0);
  const el = kids[0], u = offerOf(el);
  el.click();
  assert.equal(state.mode, 'draft', 'the first activation did NOT take the card');
  assert.equal(T.draftInspectId(), u.id, 'the box holds this offer');
  const box = elements['draft-inspect'];
  assert.notEqual(box.style.display, 'none', 'the box is visible');
  assert.ok((box.innerHTML || '').includes(u.name), 'the box shows the card title');
  assert.ok((box.innerHTML || '').includes(u.desc), 'the box shows the computed effect text verbatim');
  assert.ok((el.className || '').includes('selected'), 'the inspected card reads selected');
  assert.equal(state.pendingDrafts, 1, 'nothing was taken');
  // a DIFFERENT card moves the inspection instead of taking
  if (kids.length > 1) {
    kids[1].click();
    assert.equal(state.mode, 'draft');
    assert.equal(T.draftInspectId(), offerOf(kids[1]).id, 'the inspection moved');
    assert.ok(!(kids[0].className || '').includes('selected'), 'the old card clears');
  }
});

s.check('second click on the SAME card TAKES it (box dies with the draft)', () => {
  const kids = openDraftUntil(ks => ks.length > 0);
  const el = kids[0], u = offerOf(el);
  el.click();
  assert.equal(T.draftInspectId(), u.id);
  el.click();
  assert.equal(T.draftInspectId(), null, 'the box closed');
  assert.equal(elements['draft-inspect'].style.display, 'none');
  assert.equal(state.pendingDrafts, 0, 'the pick landed');
  assert.equal(state.mode, 'playing', 'the draft closed');
  assert.equal(elements.overlay.style.display, 'none');
  if (!(u.id.startsWith('wpn_') || u.id.startsWith('lvl_')) && !u.rule && !u.skill && !u.rewrite) {
    assert.ok((state.player.takenStats || {})[u.id], 'the stat ledger recorded the take');
  }
});

s.check('ESC cancels the inspect and returns to the offer', () => {
  const kids = openDraftUntil(ks => ks.length > 0);
  kids[0].click();
  assert.equal(T.draftInspectId(), offerOf(kids[0]).id);
  key('keydown', { key: 'Escape' });
  assert.equal(T.draftInspectId(), null, 'the box is cancelled');
  assert.equal(elements['draft-inspect'].style.display, 'none');
  assert.equal(state.mode, 'draft', 'the offer is still open');
  assert.equal(state.pendingDrafts, 1, 'nothing was taken');
  assert.ok(!(kids[0].className || '').includes('selected'), 'the selection cleared');
});

// ---- 5. KEYBOARD parity -------------------------------------------------------
s.check('arrows walk the cursor, Enter inspects, Enter again TAKES', () => {
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
  const u0 = offerOf(kids[0]);
  key('keydown', { key: 'Enter' });
  assert.equal(state.mode, 'draft', 'the first Enter INSPECTED');
  assert.equal(T.draftInspectId(), u0.id);
  key('keydown', { key: 'Escape' });
  assert.equal(state.mode, 'draft', 'ESC backed out to the offer');
  key('keydown', { key: 'Enter' });
  key('keydown', { key: 'Enter' });
  assert.equal(state.pendingDrafts, 0, 'the second Enter TOOK the card');
  assert.equal(state.mode, 'playing');
});

// ---- 6. the number keys stay the one-press quick-pick -------------------------
s.check('a number key still TAKES in one press (the pinned [4] contract)', () => {
  openDraftUntil(ks => ks.length > 0);
  key('keydown', { key: '2' });
  assert.equal(state.pendingDrafts, 0, 'one press picked');
  assert.equal(state.mode, 'playing', 'the draft closed on one press');
  assert.equal(T.draftInspectId(), null, 'no inspect was left open');
});

// ---- 7. computed values in the box (the brief's own examples) -----------------
s.check('the box shows the ladder cards\' computed effect text', () => {
  // Iron Heart +25%: the rare anchor, offered at RARE weight — loop until seen.
  const kids = openDraftUntil(ks => ks.some(el => offerOf(el).id === 'hp_pct'));
  assert.ok(kids, 'Iron Heart +25% was offered within the cap');
  const el = kids.find(k => offerOf(k).id === 'hp_pct');
  el.click();
  const html = elements['draft-inspect'].innerHTML || '';
  assert.ok(html.includes('+25% max HP'), 'the percent is in the box, not a restatement');
  assert.ok(html.includes('RARE'), 'the tier rides along');
  key('keydown', { key: 'Escape' });
});
s.check('a weapon level-up card shows the REAL describeWeaponLevel deltas', () => {
  const kids = openDraftUntil(ks => ks.some(el => offerOf(el).id.startsWith('lvl_')));
  assert.ok(kids, 'a level-up card was offered within the cap');
  const el = kids.find(k => offerOf(k).id.startsWith('lvl_'));
  const u = offerOf(el);
  const [type, lv] = [u.id.split('_')[1], Number(u.id.split('_')[2])];
  el.click();
  const html = elements['draft-inspect'].innerHTML || '';
  const want = describeWeaponLevel(type, lv + 1);
  if (want) assert.ok(html.includes(want), 'the weapon\'s actual next-level deltas are in the box');
  key('keydown', { key: 'Escape' });
});

s.done();
