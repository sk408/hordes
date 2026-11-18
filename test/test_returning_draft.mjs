// Returning players and the draft header (R1, docs/REVIEW_2026-11.md lines 8, 89, 133).
//
// The bug: a profile from before the tutorial has no 'hordes_tour_draft' flag
// (it lives in localStorage, outside the save, and only the guided run sets
// it), so its first level-up draft opened the old coach card ("THE DRAFT:
// every level, pick 1 card") under a dark shade that hid the cards.
//
// What this file pins, through the real game:
//   - brand new profile: the guided first run teaches the draft as before, and
//     no coach card shows over it;
//   - returning, old save, never saw the note: no coach card on the first draft;
//   - returning who dismissed the note: no coach card;
//   - returning who accepted the guided run: no coach card, then or next run;
//   - REPLAY TUTORIAL (title and in-run): no coach card;
//   - a profile with no finished run and no tutorial still gets the coach card
//     (the kept fallback, test_draft_coach.mjs covers the rest of it);
//   - the What's New note is cleared when a run starts, however it starts,
//     and when the player leaves the title for another menu;
//   - the header says how to pick, with the right keys for each screen
//     (level draft, 4 cards, free card, shrine, joker offer, the full-row
//     swap screen, evolve offer) and "tap a card" on a touch screen,
//     the evolve offer included.
// Run: node test/test_returning_draft.mjs
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';
import { TOUR_KEYS } from '../src/tour.js';
import { EVOLUTION_DEFS } from '../src/evolutions.js';
import { WEAPON_MAX_LEVEL } from '../src/weapons.js';
import { JOKER_IDS } from '../src/jokers.js';
import { rollChoices } from '../src/choices.js';

const S = suite('test_returning_draft');

const coachUp = () => (document.body.children || []).some(c => c && c.id === 'tour-root');
const noteUp = (h) => (h.elements['overlay'].children || []).some(c => c && /\bwn-over\b/.test(String(c.className)));
const sub = (h) => h.elements['ov-sub'].textContent;
const cards = (h) => (h.elements['ov-cards'].children || []).filter(c => c._draftOffer);

// A quiet run: nothing levels up, opens a site or offers a joker by itself.
function quiet(h) {
  const st = h.state;
  st.enemies.length = 0; st.spawnTimer = 1e9;
  st.player.invuln = 1e6;
  st.player.stats.xpMult = 0; st.player.xpNext = Infinity;
  st.sites = []; st.secrets = [];
  h.T.jokers.draftWeight = 0;
  for (const w of st.weapons) w.level = 1;
}
function openLevelDraft(h) {
  const st = h.state;
  st.draftKind = null;
  st.pendingDrafts = 1;
  h.T.openDraft();
  assert.equal(st.mode, 'draft');
  assert.equal(st.draftKind, 'level');
}
// The player's real first draft: all its cards, nothing over them, the header.
function assertCleanDraft(h, label) {
  assert.equal(coachUp(), false, label + ': a coach card covers the draft');
  assert.equal(noteUp(h), false, label + ': the What\'s New note sits over the draft');
  assert.equal(cards(h).length, 3, label + ': not three cards');
  assert.equal(sub(h), 'Pick 1: click or press 1/2/3', label + ': header');
}
// The two-press SKIP of a guided run. The panel must be up first: a press
// before it, or inside its guard time, does nothing (the old skip(-1e9)
// never skipped, so the drafts checked after it were the guided run's).
function skipGuided(h) {
  const T = h.T;
  for (let i = 0; i < 600 && !T.tut.guided.entered; i++) h.pump(1);
  const late = T.tut.guided.shownMs + 1e5;
  T.tut.skip(late); T.tut.skip(late);
  assert.equal(T.tut.live, false, 'the SKIP ended the guided run');
}
function takeCard(h) {
  cards(h)[0].click();
  for (let i = 0; i < 120 && h.state.mode !== 'playing'; i++) h.pump(1);
}
// A returning profile as the live game sees one: past runs (the harness stamps
// runs = 1), and the draft coach flag absent, as in every browser that played
// before the tutorial set it.
async function returning(variant, prof = {}) {
  const h = await boot({ variant, storage: [['hordes_onboarded', '1']] });
  h.storage.delete(TOUR_KEYS.draft);
  const p = h.T.getProfile();
  p.lastSeenUpdate = null; p.lastPlayed = null;
  Object.assign(p, prof);
  h.pump(3);
  return h;
}

// ---- brand new profile: the guided run teaches the draft -----------------------
{
  const h = await boot({ tutorial: true, variant: 'new', storage: [['hordes_onboarded', '1']] });
  h.storage.delete(TOUR_KEYS.draft);   // a brand-new browser has no flags
  h.pump(3);
  if (h.state.mode === 'intro') { h.key('keydown', { key: 'x', preventDefault() {} }); h.pump(2); }
  const T = h.T, st = h.state;
  S.check('brand new: run 1 opens the guided part', () => {
    assert.equal(T.getProfile().achievements.totals.runs || 0, 0);
    T.startRun();
    assert.ok(T.tut.live, 'the guided part is not live');
  });
  S.check('brand new: the guided DRAFT step opens the real draft with no coach card over it', () => {
    const until = (c, max) => { for (let i = 0; i < max && !c(); i++) h.pump(1); return c(); };
    assert.ok(until(() => T.tut.model && T.tut.model.id === 'draft', 60 * 60), 'no draft step');
    assert.equal(st.mode, 'draft');
    assert.equal(coachUp(), false, 'the old coach card rides over the guided draft');
    assert.ok(cards(h).length >= 3);
    // The DRAFT step's panel asks for NEXT: the header keeps the quiet
    // "pick 1 of N" there and does not name the keys (a pick would skip the
    // EVOLVE lesson; R1 integration review). test_r1_guided_draft_header.mjs.
    assert.equal(sub(h), 'pick 1 of ' + cards(h).length);
  });
}

// ---- returning, old save, never saw the note --------------------------------------
{
  const h = await returning('old');
  const T = h.T;
  S.check('returning (no lastSeenUpdate): the note is due on the title', () => {
    assert.equal(T.whatsNew.due(T.getProfile(), T.whatsNew.release, false, 8), true);
  });
  S.check('returning (no lastSeenUpdate): the first draft has no coach card', () => {
    T.startRun(); h.pump(2); quiet(h);
    openLevelDraft(h);
    assertCleanDraft(h, 'old save');
    assert.equal(h.storage.has(TOUR_KEYS.draft), false, 'the coach was used up unseen');
  });
}

// ---- returning who dismissed the note --------------------------------------------
{
  const h = await returning('dismiss');
  const T = h.T;
  S.check('returning (dismissed the note): no coach card on the first draft', () => {
    T.menus.showTitle();
    T.whatsNew.add();   // the harness boot reads as a fresh save, so put the note up by hand
    assert.equal(noteUp(h), true, 'the note did not show');
    const note = h.elements['overlay'].children.find(c => /\bwn-over\b/.test(String(c.className)));
    note.click();
    assert.equal(T.getProfile().lastSeenUpdate, T.whatsNew.release.id);
    T.startRun(); h.pump(2); quiet(h);
    openLevelDraft(h);
    assertCleanDraft(h, 'dismissed');
  });
}

// ---- returning who accepts the guided run ----------------------------------------
{
  const h = await returning('accept');
  const T = h.T, st = h.state;
  S.check('returning (accepted the guided run): no coach card in that run', () => {
    T.menus.showTitle();
    T.whatsNew.add();   // the harness boot reads as a fresh save, so put the note up by hand
    T.whatsNew.accept(null);
    assert.equal(st.assistedRun, true);
    assert.ok(T.tut.live, 'the guided run did not start');
    skipGuided(h);   // the two-press SKIP: back to a normal run
    h.pump(2); quiet(h);
    openLevelDraft(h);
    assertCleanDraft(h, 'accepted');
  });
  S.check('returning (accepted): no coach card on the next run either', () => {
    takeCard(h);
    h.storage.delete(TOUR_KEYS.draft);
    T.startRun(); h.pump(2); quiet(h);
    openLevelDraft(h);
    assertCleanDraft(h, 'accepted, next run');
  });
}

// ---- REPLAY TUTORIAL ------------------------------------------------------------
{
  const h = await returning('replay');
  const T = h.T, st = h.state;
  S.check('REPLAY TUTORIAL from the title: the real guided run, no coach card', () => {
    h.storage.delete(TOUR_KEYS.draft);
    T.tut.replay(false);
    assert.equal(st.assistedRun, true);
    assert.ok(T.tut.live, 'the guided run did not start');
    skipGuided(h);
    h.pump(2); quiet(h);
    openLevelDraft(h);
    assertCleanDraft(h, 'replay from the title');
  });
  S.check('REPLAY TUTORIAL from a run arms the next run; its drafts have no coach card', () => {
    takeCard(h);
    h.storage.delete(TOUR_KEYS.draft);
    T.tut.replay(true);
    T.startRun();
    assert.equal(st.assistedRun, true);
    skipGuided(h);
    h.pump(2); quiet(h);
    openLevelDraft(h);
    assertCleanDraft(h, 'replay from a run');
  });
}

// ---- the kept fallback: no finished run, no tutorial --------------------------------
{
  const h = await returning('zero');
  const T = h.T;
  S.check('no finished run and no tutorial: the coach card still teaches the first draft', () => {
    T.startRun(); h.pump(2); quiet(h);
    T.getProfile().achievements.totals.runs = 0;
    T.setPilotMode('MANUAL');
    openLevelDraft(h);
    assert.equal(coachUp(), true, 'no coach card for a profile that never drafted');
    assert.equal(h.storage.get(TOUR_KEYS.draft), '1');
  });
}

// ---- the note is cleared when a run starts -----------------------------------------
{
  const h = await returning('note');
  const T = h.T;
  S.check('the note never rides into a run, even when the run starts straight from the title', () => {
    T.menus.showTitle();
    T.whatsNew.add();   // the harness boot reads as a fresh save, so put the note up by hand
    assert.equal(noteUp(h), true, 'the note did not show');
    T.startRun();   // no menu in between (a quick start, auto-continue, a key)
    assert.equal(noteUp(h), false, 'the note is still on the overlay in a run');
    assert.equal(T.getProfile().lastSeenUpdate, null, 'clearing is not a dismiss');
    h.pump(2); quiet(h);
    openLevelDraft(h);
    assertCleanDraft(h, 'note');
  });
  S.check('the note leaves with the title when the player opens another menu', () => {
    T.menus.showTitle();
    T.whatsNew.add();
    assert.equal(noteUp(h), true, 'the note did not show');
    T.menus.showPreRun();   // PLAY: the title's openMenu path, no run yet
    assert.equal(noteUp(h), false, 'the note stays over the next menu');
    assert.equal(T.getProfile().lastSeenUpdate, null, 'clearing is not a dismiss');
  });
}

// ---- the header on every pick screen ----------------------------------------------
{
  const h = await returning('header');
  const T = h.T, st = h.state;
  T.startRun(); h.pump(2); quiet(h);
  h.storage.set(TOUR_KEYS.draft, '1');
  S.check('a level draft of 4 cards names 4 keys', () => {
    st.player.stats.draftOffers = 1;
    openLevelDraft(h);
    assert.equal(cards(h).length, 4);
    assert.equal(sub(h), 'Pick 1: click or press 1/2/3/4');
    takeCard(h);
    st.player.stats.draftOffers = 0;
  });
  S.check('a free card keeps its reason in front', () => {
    st.ruleCards = 1;
    openLevelDraft(h);
    assert.equal(h.elements['ov-title'].textContent, 'FREE CARD');
    assert.equal(sub(h), 'the rule is beaten · Pick 1: click or press 1/2/3');
    takeCard(h);
    st.ruleCards = 0;
  });
  S.check('the shrine says one blessing and its keys', () => {
    // The same offer queueShrineOffer builds: three real blessings.
    const offer = rollChoices(1, Math.random, []).slice(0, 3).map(o => ({ id: 'shr_' + o.id, tier: 'BLESSING',
      name: o.title, desc: o.desc, blessing: o, weight: 1, apply: () => {} }));
    st.shrineOffer = offer;
    st.draftKind = null; st.pendingDrafts = 1;
    T.openDraft();
    assert.equal(st.draftKind, 'shrine');
    assert.equal(h.elements['ov-title'].textContent, 'SHRINE');
    assert.equal(cards(h).length, 3);
    assert.equal(sub(h), 'the shrine is charged · Pick 1: click or press 1/2/3');
    takeCard(h);
    assert.equal(st.mode, 'playing');
  });
  S.check('a joker offer names its own count', () => {
    st.jokerOffers = 1; st.jokerWhys = ['the boss is down'];
    st.draftKind = null; st.pendingDrafts = 1;
    T.openDraft();
    assert.equal(st.draftKind, 'joker');
    const n = cards(h).length;
    const keys = Array.from({ length: n }, (_, i) => i + 1).join('/');
    assert.equal(sub(h), 'the boss is down · Pick 1: click or press ' + keys);
    takeCard(h);
  });
  S.check('the full-row swap screen names KEEP and every held joker', () => {
    st.jokerSlots = 5;
    const held = JOKER_IDS.slice(0, 5);
    for (const id of held) T.jokers.take(id);
    st.jokerOffers = 1; st.jokerWhys = ['the boss is down'];
    st.draftKind = null; st.pendingDrafts = 1;
    T.openDraft();
    assert.equal(st.draftKind, 'joker');
    assert.match(sub(h), /row full/);
    cards(h)[0].click();   // the offered joker: the row is full, so the swap screen opens
    assert.equal(h.elements['ov-title'].textContent, 'JOKER ROW FULL');
    assert.equal(cards(h).length, 6, 'KEEP and one card per held joker');
    assert.match(sub(h), / · Pick 1: click or press 1-6$/);
    cards(h)[0].click();   // KEEP: the boss offer closes
    for (let i = 0; i < 120 && st.mode !== 'playing'; i++) h.pump(1);
    assert.equal(st.mode, 'playing');
  });
  S.check('the evolve offer names its cards and NOT NOW', () => {
    const w = st.weapons.find(x => EVOLUTION_DEFS[x.type]);
    w.level = WEAPON_MAX_LEVEL;
    st.player.takenStats = { [EVOLUTION_DEFS[w.type].partner]: 1 };
    st.mode = 'playing';
    for (let i = 0; i < 5 && st.mode !== 'evolve'; i++) h.pump(1);
    assert.equal(st.mode, 'evolve');
    const n = h.elements['ov-cards'].children.length;   // the offers and NOT NOW
    assert.equal(n, 2);
    assert.equal(sub(h), 'a maxed weapon and its partner card · Pick 1: click or press 1/2');
    h.elements['ov-cards'].children[0].click();
    for (let i = 0; i < 120 && st.mode !== 'playing'; i++) h.pump(1);
  });
  S.check('on a touch screen the header says tap', () => {
    h.elements['touch'].classList.add('on');
    openLevelDraft(h);
    assert.equal(sub(h), 'Pick 1: tap a card');
    h.elements['touch'].classList.remove('on');
  });
}

// ---- a long header clears the HUD's top corners --------------------------------
// At 844x390 the joker swap header sat level with the gold box (left) and the
// quest tracker (right), which the canvas paints under the overlay, and ran
// over both. The stub DOM has no layout, so the pick screen is modelled: it is
// centred (its top at 40) until the game pins it with a top padding; the
// title, the header line (40..440 wide) and the cards stack under that top.
// The HUD boxes are the real kinds, at the 844x390 spots in view units.
{
  const h = await returning('hudfit');
  const T = h.T, st = h.state;
  T.startRun(); h.pump(2); quiet(h);
  h.storage.set(TOUR_KEYS.draft, '1');
  S.check('a joker swap header level with the gold box and quest tracker moves down clear of them', () => {
    const ov = h.elements['overlay'], els = h.elements;
    // The interface is painted at a uniform scale: a layout px of padding is `sc` px on screen.
    const sc = T.uiFit.applied;
    const topNow = () => (ov.style.justifyContent === 'flex-start' ? parseFloat(ov.style.paddingTop) * sc : 40);
    const rect = (dy, hgt, l = 40, r = 440) => () => {
      const t = topNow() + dy;
      return { left: l, right: r, top: t, bottom: t + hgt, width: r - l, height: hgt };
    };
    const real = ['ov-title', 'ov-sub', 'ov-cards'].map(id => [id, els[id].getBoundingClientRect]);
    els['ov-title'].getBoundingClientRect = rect(0, 16, 180, 300);
    els['ov-sub'].getBoundingClientRect = rect(20, 8);
    els['ov-cards'].getBoundingClientRect = rect(40, 180, 10, 470);   // room enough under them
    st.jokerSlots = 5;
    for (const id of JOKER_IDS.slice(0, 5)) T.jokers.take(id);
    st.jokerOffers = 1; st.jokerWhys = ['the boss is down'];
    st.draftKind = null; st.pendingDrafts = 1;
    T.openDraft();
    const hud = { purse: { x: 6, y: 52, w: 66, h: 14 }, quests: { x: 340, y: 44, w: 120, h: 30 },
      clock: { x: 400, y: 2, w: 60, h: 12 },   // above the line: it must not move it
      rule: { x: 200, y: 90, w: 80, h: 10 } };   // below the line: nor this
    T.renderer.hudChrome = hud;
    cards(h)[0].click();   // the row is full: the swap screen
    assert.equal(els['ov-title'].textContent, 'JOKER ROW FULL');
    assert.match(sub(h), / · Pick 1: /);
    const r = els['ov-sub'].getBoundingClientRect();
    for (const [k, b] of Object.entries(hud)) {
      const over = r.left < b.x + b.w && b.x < r.right && r.top < b.y + b.h && b.y < r.bottom;
      assert.equal(over, false, 'the header runs over the ' + k + ' box: ' + JSON.stringify(r));
    }
    // Just clear of the tracker's bottom (74) with a small gap, not further.
    assert.ok(r.top >= 77.4 && r.top <= 79, 'the header is not just under the boxes: ' + r.top);
    assert.ok(els['ov-cards'].getBoundingClientRect().bottom <= 296, 'the cards are pushed off the screen');
    cards(h)[0].click();   // KEEP
    for (let i = 0; i < 120 && st.mode !== 'playing'; i++) h.pump(1);
    // The next pick screen, with nothing level with its header, starts centred again.
    T.renderer.hudChrome = {};
    openLevelDraft(h);
    assert.equal(ov.style.paddingTop, '', 'the move outlives the swap screen');
    takeCard(h);
    for (const [id, f] of real) els[id].getBoundingClientRect = f;
  });
  S.check('the header never pushes the cards off a screen with no room under them', () => {
    const ov = h.elements['overlay'], els = h.elements;
    // The interface is painted at a uniform scale: a layout px of padding is `sc` px on screen.
    const sc = T.uiFit.applied;
    const topNow = () => (ov.style.justifyContent === 'flex-start' ? parseFloat(ov.style.paddingTop) * sc : 40);
    const rect = (dy, hgt, l = 40, r = 440) => () => {
      const t = topNow() + dy;
      return { left: l, right: r, top: t, bottom: t + hgt, width: r - l, height: hgt };
    };
    const real = ['ov-title', 'ov-sub', 'ov-cards'].map(id => [id, els[id].getBoundingClientRect]);
    els['ov-title'].getBoundingClientRect = rect(0, 16, 180, 300);
    els['ov-sub'].getBoundingClientRect = rect(20, 8);
    els['ov-cards'].getBoundingClientRect = rect(40, 206, 10, 470);   // bottom at 286: 10 px of room
    T.renderer.hudChrome = { quests: { x: 340, y: 44, w: 120, h: 30 } };
    st.draftKind = null; st.pendingDrafts = 1;
    T.openDraft();
    assert.ok(els['ov-cards'].getBoundingClientRect().bottom <= 296, 'the cards are pushed off the screen');
    assert.ok(els['ov-sub'].getBoundingClientRect().top > 60, 'the header did not use the room it had');
    takeCard(h);
    // A tall screen (not the compact layout): the HUD rows stack there, so a
    // move that cannot clear them all is not made at all.
    const win = { w: window.innerWidth, h: window.innerHeight };
    window.innerWidth = 1280; window.innerHeight = 600;   // taller than the compact layout's 500
    els['ov-cards'].getBoundingClientRect = rect(40, 506, 10, 470);   // bottom at 586: 10 px of room
    try {
      T.renderer.hudChrome = { quests: { x: 340, y: 44, w: 120, h: 30 } };
      st.draftKind = null; st.pendingDrafts = 1;
      T.openDraft();
      assert.equal(ov.classList.contains('compact'), false, 'the layout is still compact');
      assert.equal(ov.style.paddingTop, '', 'a part-way move on a tall screen');
      // With room enough it moves all the way.
      takeCard(h);
      window.innerHeight = 640;   // 50 px of room
      T.renderer.hudChrome = { quests: { x: 340, y: 44, w: 120, h: 30 } };
      st.draftKind = null; st.pendingDrafts = 1;
      T.openDraft();
      assert.ok(els['ov-sub'].getBoundingClientRect().top >= 77.4, 'no move with room enough on a tall screen');
      takeCard(h);
    } finally { window.innerWidth = win.w; window.innerHeight = win.h; }
    for (const [id, f] of real) els[id].getBoundingClientRect = f;
  });
}

// ---- the evolve offer on a touch screen ------------------------------------------
{
  const h = await returning('evolvetouch');
  const T = h.T, st = h.state;
  T.startRun(); h.pump(2); quiet(h);
  h.storage.set(TOUR_KEYS.draft, '1');
  S.check('on a touch screen the evolve offer says tap too', () => {
    h.elements['touch'].classList.add('on');
    const w = st.weapons.find(x => EVOLUTION_DEFS[x.type]);
    w.level = WEAPON_MAX_LEVEL;
    st.player.takenStats = { [EVOLUTION_DEFS[w.type].partner]: 1 };
    st.mode = 'playing';
    for (let i = 0; i < 5 && st.mode !== 'evolve'; i++) h.pump(1);
    assert.equal(st.mode, 'evolve');
    assert.equal(sub(h), 'a maxed weapon and its partner card · Pick 1: tap a card');
    h.elements['touch'].classList.remove('on');
  });
}

S.done();
process.exit(0);
