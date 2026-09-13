// G12 TITLE SCREEN tests — the startup-menu contract through the REAL
// src/main.js (shared harness): the composed title card owns the canvas in
// mode 'title' (renderer seam geometry, null outside it), the menu carries
// START GAME + EXIT GAME (last) + every existing card, EXIT GAME runs its
// three steps in order (autosave -> window.close -> farewell), the fresh
// browser offers LOAD FROM DISK on the title and the offer disappears once a
// save exists, and the chrome gate is OFF in the title.
//
// Run: node test/test_title_screen.mjs   (exit 0 = pass)
import assert from 'node:assert/strict';
import { boot } from './_harness.mjs';
import { CONFIG } from '../src/config.js';
const { VIEW_W, VIEW_H } = CONFIG;

const h = await boot({ storage: [['hordes_onboarded', '1']] });   // no save key: fresh
const st = h.state;
const T = h.T;
const ov = h.elements['overlay'];
const cards = () => (h.elements['ov-cards'] ? h.elements['ov-cards'].children : []);
const cardWith = (t) => cards().find(c => (c.innerHTML || '').includes('>' + t + '<'));
const names = () => cards().map(c => {
  const m = (c.innerHTML || '').match(/class="name">([^<]*)</);
  return m ? m[1] : '';
});
const key = (k) => h.key('keydown', { key: k, preventDefault() {} });

// Let the boot settle into the intro, then skip it (onboarded flag preset:
// the skip lands straight on the title).
h.pump(3);
if (st.mode === 'intro') { key('x'); h.pump(2); }

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`  ok - ${name}`);
}

// ---- 1. the title card owns the canvas (DO 1) --------------------------------
check('mode title + the renderer seam carries the full-view geometry', () => {
  assert.equal(st.mode, 'title', 'the startup menu is mode title');
  h.pump(2);
  const ts = T.renderer.titleScreen;
  assert.ok(ts, 'the seam is live in the title');
  assert.deepEqual(
    { x: ts.x, y: ts.y, w: ts.w, h: ts.h, scale: ts.scale },
    { x: 0, y: 0, w: VIEW_W, h: VIEW_H, scale: 1 },
    'the composed card fills the view at integer scale 1',
  );
});

check('the card is painted ONCE (extra title frames do not repaint it)', () => {
  h.rec.on = true;
  h.rec.rects.length = 0;
  h.pump(10);
  h.rec.on = false;
  // The composed sky alone is ~10^5 rects, so a repaint is unmistakable;
  // the budget below allows incidental noise and nothing else.
  assert.ok(h.rec.rects.length < 500,
    'ten title frames must not repaint the card (' + h.rec.rects.length + ' rects)');
  assert.ok(T.renderer.titleScreen, 'the seam stays live');
});

check('the seam is NULL outside the title; a return visit repaints', () => {
  cardWith('START GAME').click();
  assert.equal(st.mode, 'playing', 'run live');
  h.pump(2);
  assert.equal(T.renderer.titleScreen, null, 'no title seam in a run');
  // Leaving the mode invalidated the once-paint: back on the title the seam
  // is live again (and the card WAS repainted over the world).
  h.rec.on = true;
  h.rec.rects.length = 0;
  T.showTitle();
  h.pump(2);
  h.rec.on = false;
  assert.equal(st.mode, 'title', 'back on the title');
  assert.ok(T.renderer.titleScreen && T.renderer.titleScreen.w === VIEW_W,
    'the seam is live again after a return visit');
  assert.ok(h.rec.rects.length > 1000, 'the return visit repainted the composed card');
});

check('the DOM sheet is transparent over the art; the DOM h1 hides but keeps its text', () => {
  assert.equal(ov.style.background, 'transparent', 'no 75% black sheet over the art');
  assert.equal(h.elements['ov-title'].style.display, 'none',
    'the art wordmark replaces the DOM h1 (which stays for stub-DOM readers)');
  assert.equal(h.elements['ov-title'].textContent, 'HORDES', 'the h1 text is unchanged');
  // Every other screen restores the sheet + the h1 (openMenu reset).
  cardWith('SETTINGS').click();
  assert.equal(ov.style.background, '', 'openMenu restored the sheet background');
  assert.notEqual(h.elements['ov-title'].style.display, 'none', 'the h1 is visible again');
  key('escape');
  assert.equal(st.mode, 'title', 'back on the title');
});

// ---- 2. the startup menu (DO 2) ----------------------------------------------
check('the menu carries START GAME, EXIT GAME as the LAST card, and every existing card', () => {
  const n = names();
  for (const want of ['START GAME', 'SHOP', 'CHARACTERS', 'TROPHIES', 'BESTIARY',
                      'CHALLENGE', 'SETTINGS', 'HOW TO PLAY', 'EXIT GAME']) {
    assert.ok(n.includes(want), 'card present: ' + want);
  }
  assert.equal(n[n.length - 1], 'EXIT GAME', 'EXIT GAME is the LAST card');
  assert.ok(!n.includes('PLAY'), 'the old PLAY name is gone');
});

// ---- 3. EXIT GAME, honestly (DO 3 + DO 6) -------------------------------------
check('EXIT GAME: autosave -> window.close attempt -> farewell, in that order', () => {
  // Arm a window.close spy on the harness window stub, then dirty the profile
  // so the autosave is observable, and click the REAL card.
  const w = globalThis.window;
  let closes = 0;
  w.close = () => { closes++; };
  T.getProfile().gold += 7;
  cardWith('EXIT GAME').click();
  assert.deepEqual(T.exit.steps, ['autosave', 'window.close', 'farewell'],
    'the three steps ran in order');
  assert.equal(closes, 1, 'window.close was attempted exactly once');
  assert.equal(JSON.parse(h.storage.get('hordes_profile_v1')).gold, T.getProfile().gold,
    'the profile was flushed to storage (the autosave step) before the close attempt');
  assert.equal(T.hasLocalSave(), true, 'a save now exists');
  assert.equal(st.mode, 'farewell', 'the farewell screen is up');
  assert.ok(/saved/i.test(h.elements['ov-sub'].innerHTML || ''),
    'the farewell says the progress is saved');
  assert.ok(/close this tab/i.test(h.elements['ov-sub'].innerHTML || ''),
    'the farewell says the tab can be closed');
  delete w.close;
});

check('the farewell backs out to the title (BACK card + ESC)', () => {
  cardWith('BACK').click();
  assert.equal(st.mode, 'title', 'BACK returns to the title');
  T.exit.farewell();
  assert.equal(st.mode, 'farewell', 'farewell again');
  key('escape');
  assert.equal(st.mode, 'title', 'ESC also returns to the title');
});

// ---- 4. START GAME: load-from-disk offer (DO 4) --------------------------------
check('a FRESH browser offers LOAD FROM DISK on the title; a save removes it', () => {
  // A save exists by now (the exit autosave wrote it): no offer, no friction.
  assert.ok(cardWith('START GAME'), 'START GAME present');
  assert.equal(cardWith('LOAD FROM DISK'), undefined, 'no load offer once a save exists');
  // Wipe it the way a fresh browser looks, re-render the title: the offer appears.
  h.storage.delete('hordes_profile_v1');
  T.showTitle();
  const load = cardWith('LOAD FROM DISK');
  assert.ok(load, 'the fresh title offers LOAD FROM DISK');
  assert.equal(names().indexOf('LOAD FROM DISK'), 1,
    'the offer rides directly under START GAME');
  assert.ok((cardWith('START GAME').innerHTML || '').includes('LOAD FROM DISK'),
    'START GAME names the offer while no save exists');
  // The offer disappears again once a save lands.
  T.save.autosave();
  T.showTitle();
  assert.equal(cardWith('LOAD FROM DISK'), undefined, 'offer gone after a save exists');
});

check('the load offer is wired to the same file picker SETTINGS uses', () => {
  h.storage.delete('hordes_profile_v1');
  T.showTitle();
  const bodyKids = () => [...(globalThis.document.body.children || [])];
  const before = bodyKids().length;
  cardWith('LOAD FROM DISK').click();
  const input = bodyKids().slice(before).find(c => c.type === 'file');
  assert.ok(input, 'a hidden <input type=file> was created (the pickImportFile path)');
  // Simulate the picker's success tail: a validated import lands, persists,
  // and the title re-renders WITHOUT the offer.
  const exported = T.save.exportText({ at: '2026-01-01T00:00:00.000Z' });
  h.storage.delete('hordes_profile_v1');
  const res = T.save.importText(exported);
  assert.equal(res.ok, true, 'the import path round-trips the export');
  assert.equal(T.hasLocalSave(), true, 'the imported profile was persisted');
  T.showTitle();
  assert.equal(cardWith('LOAD FROM DISK'), undefined, 'back on the title, the offer is gone');
});

check('SETTINGS keeps IMPORT SAVE reachable either way (the permanent home)', () => {
  cardWith('SETTINGS').click();
  assert.ok([...cards()].some(c => (c.innerHTML || '').includes('>IMPORT SAVE<')),
    'settings offers IMPORT SAVE');
  key('escape');
  assert.equal(st.mode, 'title', 'back to the title');
});

// ---- 5. the chrome gate + tour (DO 5) -------------------------------------------
check('chrome is OFF in the title (pad layer, hints) — the wave-23 contract', () => {
  h.pump(2);                                  // syncChrome runs on every mode's first frame
  assert.equal(T.chromeOn(), false, 'chromeOn() is false in the title');
  assert.equal(h.elements['touch'].style.display, 'none',
    'syncChrome hid the touch/pad layer');
  const hints = h.elements['hints'];
  assert.ok(!hints.classList.contains('on'), 'the key-hints panel is not shown');
  // The harness preseeds every tour flag: no tour may render over the title.
  const tourRoot = [...(globalThis.document.body.children || [])].find(c => c.id === 'tour-root');
  assert.equal(tourRoot, undefined, 'no tour renders over the title (flags done)');
});

check('START GAME starts a run with no extra friction', () => {
  cardWith('START GAME').click();
  assert.equal(st.mode, 'playing', 'one press, one run');
});

console.log(`\n${passed} assertion groups passed — test_title_screen OK`);
