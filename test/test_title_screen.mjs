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

// ---- 0. N2: the reveal, observed LIVE (the phases advance from here on) ------
{
  const tm = T.title.timings;
  const dt = (1000 / 60) / 1000;
  // Frames pumped since the reveal started: the intro-skip block's pump(2) is
  // the only advance before this section (onboarded flag => the skip lands
  // straight on the title, so those 2 frames are the reveal's first 2).
  let revealFrames = 2;
  check('the reveal starts BELOW full opacity (the art alone, menu unpressable)', () => {
    const rv = st.titleReveal;
    assert.ok(rv, 'the reveal seam is live on the first title entry');
    assert.equal(rv.phase, 'art', 'the first phase shows the art alone');
    assert.equal(rv.opacity, 0, 'opacity starts at 0');
    assert.equal(ov.style.opacity, '0', 'the sheet is at opacity 0');
    assert.equal(ov.style.pointerEvents, 'none', 'the invisible menu cannot be pressed');
    assert.ok(T.renderer.titleScreen, 'the art seam is live under the hidden menu');
  });
  check('mid-fade the opacity is strictly between 0 and 1', () => {
    h.pump(Math.ceil(tm.beat / dt) + 2);   // two frames in: clear of the transition frame
    revealFrames += Math.ceil(tm.beat / dt) + 2;
    const rv = st.titleReveal;
    assert.equal(rv.phase, 'fade', 'in the fade phase');
    assert.ok(rv.opacity > 0 && rv.opacity < 1, '0 < opacity < 1 (got ' + rv.opacity + ')');
    assert.ok(parseFloat(ov.style.opacity) > 0 && parseFloat(ov.style.opacity) < 1,
      'the sheet carries the same partial opacity');
  });
  check('the reveal settles at 1.0 after its duration (60Hz wall clock)', () => {
    let frames = 0;
    for (; frames < 400; frames++) {
      h.pump(1);
      if (st.titleReveal && st.titleReveal.phase === 'settled') break;
    }
    revealFrames += frames;
    const rv = st.titleReveal;
    assert.ok(rv && rv.phase === 'settled', 'the reveal settled (frames=' + frames + ')');
    assert.equal(rv.opacity, 1, 'opacity reaches 1.0');
    assert.equal(ov.style.opacity, '', 'full opacity is the stylesheet default, not a stale inline');
    assert.equal(ov.style.pointerEvents, '', 'the menu is interactive again');
    const settledAt = revealFrames * dt, want = tm.beat + tm.fade;
    assert.ok(Math.abs(settledAt - want) <= 2 * dt,
      `settled at ${settledAt.toFixed(3)}s, want ~${want}s (within 2 frames)`);
  });
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
  // N2: the press fades the menu out and holds the art ~1s BEFORE the run —
  // pump the hold at the loop's own dt until startRun lands.
  for (let i = 0; i < 150 && st.mode !== 'playing'; i++) h.pump(1);
  assert.equal(st.mode, 'playing', 'run live after the art hold');
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
  // Every other screen restores the sheet + the h1 (openMenu reset). U1: the
  // options live behind the SETUP door now, so route through it.
  cardWith('SETUP').click();
  cardWith('SETTINGS').click();
  assert.equal(ov.style.background, '', 'openMenu restored the sheet background');
  assert.notEqual(h.elements['ov-title'].style.display, 'none', 'the h1 is visible again');
  key('escape');
  assert.equal(st.mode, 'title', 'back on the title');
});

// ---- 2. the startup menu (DO 2) ----------------------------------------------
check('the menu carries START GAME, EXIT GAME as the LAST card, and every existing card', () => {
  const n = names();
  // U1 (owner 2026-09-14): six/seven top-level cards after the subnav split —
  // TROPHIES/BESTIARY moved behind PROGRESS, CHALLENGE/STAGE/SETTINGS/HOW TO
  // PLAY behind SETUP. This assertion is retargeted, NOT weakened: the moved
  // cards are asserted below, one level down.
  for (const want of ['START GAME', 'SHOP', 'CHARACTERS', 'PROGRESS', 'SETUP', 'EXIT GAME']) {
    assert.ok(n.includes(want), 'card present: ' + want);
  }
  assert.equal(n[n.length - 1], 'EXIT GAME', 'EXIT GAME is the LAST card');
  assert.ok(!n.includes('PLAY'), 'the old PLAY name is gone');
  // The pile that made the menu eleven cards is gone from the top level.
  for (const moved of ['TROPHIES', 'BESTIARY', 'CHALLENGE', 'STAGE', 'SETTINGS', 'HOW TO PLAY']) {
    assert.ok(!n.includes(moved), 'moved behind a submenu, not on the title: ' + moved);
  }
});

check('U1 submenus: PROGRESS carries TROPHIES + BESTIARY, SETUP carries the run options, both return', () => {
  cardWith('PROGRESS').click();
  assert.deepEqual(names(), ['TROPHIES', 'BESTIARY', 'BACK'],
    'PROGRESS holds the gallery and the guide, plus BACK');
  cardWith('BACK').click();
  assert.ok(names().includes('START GAME'), 'BACK returns to the title');

  cardWith('SETUP').click();
  const s = names();
  for (const want of ['CHALLENGE', 'STAGE', 'SETTINGS', 'HOW TO PLAY', 'BACK']) {
    assert.ok(s.includes(want), 'SETUP holds: ' + want);
  }
  assert.equal(s[s.length - 1], 'BACK', 'BACK is the LAST card in SETUP');
  // A cycling selector must re-render its OWN screen, not bounce to the title.
  cardWith('CHALLENGE').click();
  assert.ok(names().includes('CHALLENGE'), 'cycling the challenge stays in SETUP');
  cardWith('BACK').click();
  assert.ok(names().includes('START GAME'), 'BACK returns to the title from SETUP');
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
  cardWith('SETUP').click();          // U1: options live behind the SETUP door
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
  for (let i = 0; i < 150 && st.mode !== 'playing'; i++) h.pump(1);
  assert.equal(st.mode, 'playing', 'one press, one run (after the N2 art hold)');
});

// ---- 6. N2: the hold + the leak + the 120Hz contract (same boot, replay seam) ----
check('START GAME: a double activation in one tick holds ONCE, never an early run', () => {
  T.showTitle();
  let s = 0;
  for (; s < 30 && !(st.titleReveal && st.titleReveal.phase === 'settled'); s++) h.pump(1);
  assert.equal(st.titleReveal.phase, 'settled', 'settled before the press (return re-fade done)');
  const before = T.title.runStarts;
  cardWith('START GAME').click();
  cardWith('START GAME').click();   // the same tick, again: idempotent
  const rv = st.titleReveal;
  assert.ok(rv && (rv.phase === 'out' || rv.phase === 'hold'), 'the hold is in flight once');
  assert.equal(st.mode, 'title', 'the run does NOT start on the press tick');
  assert.equal(T.title.runStarts, before, 'startRun has not been called yet');
  assert.ok(T.renderer.titleScreen, 'the art seam stays live through the hold');
});

check('START GAME: the run starts EXACTLY once, only after the full hold', () => {
  const dt = (1000 / 60) / 1000;
  const before = T.title.runStarts;
  let frames = 0;
  for (; frames < 400; frames++) {
    h.pump(1);
    if (st.mode === 'playing') break;
  }
  assert.equal(st.mode, 'playing', 'the run started (frames=' + frames + ')');
  assert.equal(T.title.runStarts, before + 1, 'startRun ran EXACTLY once through the hold');
  assert.equal(st.titleReveal, null, 'the reveal seam is null once the run is live');
  assert.equal(T.renderer.titleScreen, null, 'the art seam is null in the run');
  const heldAt = frames * dt, want = T.title.timings.out + T.title.timings.hold;
  assert.ok(heldAt >= want - 2 * dt && heldAt <= want + 4 * dt,
    `run started ${heldAt.toFixed(3)}s after the press, want ~${want}s (within 2 frames)`);
  assert.equal(ov.style.display, 'none', 'the overlay hid with the run');
});

check('leaving the title mid-fade leaks NO partial opacity into the next screen', () => {
  T.showTitle();                    // a return entry: the short (<=150ms) re-fade
  assert.equal(st.titleReveal.phase, 'return', 'the return re-fade is running');
  assert.ok(st.titleReveal.dur <= 0.15, 'the return fade is short (<=150ms)');
  h.pump(1);                         // mid-fade now
  assert.ok(parseFloat(ov.style.opacity) < 1, 'mid-fade, opacity below 1');
  cardWith('SETUP').click();         // U1: leave the title mid-fade (through the door)
  cardWith('SETTINGS').click();
  assert.notEqual(st.mode, 'title', 'on the settings screen');
  assert.equal(ov.style.opacity, '', 'openMenu restored FULL opacity for the next screen');
  assert.equal(ov.style.pointerEvents, '', 'and full interactivity');
  h.pump(1);                         // one frame: the stale phase is dropped
  assert.equal(st.titleReveal, null, 'the dropped flow left no reveal seam behind');
  key('escape');
  assert.equal(st.mode, 'title', 'back on the title');
});

check('the SAME reveal contract at a 120Hz frame step (no fixed-dt assumption)', () => {
  h.setFrameMs(1000 / 120);
  const dt = (1000 / 120) / 1000;
  const tm = T.title.timings;
  T.title.replay();                  // re-arm the once-per-load guard, full reveal
  assert.equal(st.titleReveal.phase, 'art', 'the replayed reveal starts at the art');
  assert.equal(st.titleReveal.opacity, 0, 'opacity 0 at the start');
  h.pump(Math.ceil(tm.beat / dt) + 2);   // two frames in: clear of the transition frame
  assert.equal(st.titleReveal.phase, 'fade', 'mid-reveal at 120Hz: the fade phase');
  assert.ok(st.titleReveal.opacity > 0 && st.titleReveal.opacity < 1,
    '0 < opacity < 1 at 120Hz (got ' + st.titleReveal.opacity + ')');
  let frames = Math.ceil(tm.beat / dt) + 2;   // everything pumped since replay()
  for (let i = frames; i < 800; i++) {
    h.pump(1); frames++;
    if (st.titleReveal && st.titleReveal.phase === 'settled') break;
  }
  assert.equal(st.titleReveal.opacity, 1, 'opacity reaches 1.0 at 120Hz');
  const settledAt = frames * dt, want = tm.beat + tm.fade;
  assert.ok(Math.abs(settledAt - want) <= 3 * dt,
    `120Hz settled at ${settledAt.toFixed(3)}s, want ~${want}s (within 3 frames)`);
  // And the HOLD at 120Hz lands on the same wall-clock second.
  const beforeHold = T.title.runStarts;
  cardWith('START GAME').click();
  let held = 0;
  for (; held < 800; held++) {
    h.pump(1);
    if (st.mode === 'playing') break;
  }
  assert.equal(T.title.runStarts, beforeHold + 1, 'exactly one more run through the 120Hz hold');
  const heldAt = held * dt, wantHold = tm.out + tm.hold;
  assert.ok(heldAt >= wantHold - 2 * dt && heldAt <= wantHold + 4 * dt,
    `120Hz run started ${heldAt.toFixed(3)}s after the press, want ~${wantHold}s (within 2 frames)`);
});

console.log(`\n${passed} assertion groups passed — test_title_screen OK`);
