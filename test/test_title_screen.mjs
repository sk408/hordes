// G12 TITLE SCREEN tests — the startup-menu contract through the REAL
// src/main.js (shared harness): the composed title card owns the canvas in
// mode 'title' (renderer seam geometry, null outside it), the menu is the
// SEVEN condense cards with HOW TO PLAY last (EXIT GAME removed D3, fresh
// LOAD FROM DISK folded into SAVE DATA M5), exitGame keeps its three-step
// contract through the __TEST seam (autosave -> window.close -> farewell),
// the import offer lives behind SETUP -> SETTINGS -> SAVE DATA, and the
// chrome gate is OFF in the title.
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
check('the menu is SEVEN cards, HOW TO PLAY last, EXIT GAME gone (condense D3/D4)', () => {
  const n = names();
  // MENU CONDENSE (2026-09-17, owner rulings VJBFV): D3 removed EXIT GAME
  // (autosave already fires; closing the tab is save & quit), M5 folded the
  // fresh LOAD FROM DISK offer into SAVE DATA, and D4 KEPT CHARACTERS (owner
  // override — the count is 7, not the proposed 6). Retargeted, not weakened:
  // the exact seven-card ORDER is asserted, and the removed cards are asserted
  // ABSENT at every level they used to occupy.
  assert.deepEqual(n,
    ['START GAME', 'SHOP', 'CHARACTERS', 'LOADOUT', 'PROGRESS', 'SETUP', 'HOW TO PLAY'],
    'the title is exactly the seven surviving cards, in order');
  assert.ok(!n.includes('PLAY'), 'the old PLAY name is gone');
  // The pile that made the menu eleven cards is gone from the top level.
  for (const moved of ['TROPHIES', 'BESTIARY', 'CHALLENGE', 'STAGE', 'SETTINGS']) {
    assert.ok(!n.includes(moved), 'moved behind a submenu, not on the title: ' + moved);
  }
  // ...and the condense removals are gone from the title entirely.
  for (const gone of ['EXIT GAME', 'LOAD FROM DISK']) {
    assert.ok(!n.includes(gone), 'removed from the title by the condense: ' + gone);
  }
  assert.ok(!(cardWith('START GAME').innerHTML || '').includes('LOAD FROM DISK'),
    'START GAME no longer names the folded-away offer');
});

check('U1 submenus: PROGRESS carries TROPHIES + BESTIARY, SETUP carries the run options, both return', () => {
  cardWith('PROGRESS').click();
  assert.deepEqual(names(), ['TROPHIES', 'BESTIARY', 'BACK'],
    'PROGRESS holds the gallery and the guide, plus BACK');
  cardWith('BACK').click();
  assert.ok(names().includes('START GAME'), 'BACK returns to the title');

  cardWith('SETUP').click();
  const s = names();
  for (const want of ['CHALLENGE', 'STAGE', 'SETTINGS', 'BACK']) {
    assert.ok(s.includes(want), 'SETUP holds: ' + want);
  }
  assert.equal(s[s.length - 1], 'BACK', 'BACK is the LAST card in SETUP');
  // A cycling selector must re-render its OWN screen, not bounce to the title.
  cardWith('CHALLENGE').click();
  assert.ok(names().includes('CHALLENGE'), 'cycling the challenge stays in SETUP');
  cardWith('BACK').click();
  assert.ok(names().includes('START GAME'), 'BACK returns to the title from SETUP');
});

check('MENU CONDENSE: settings is SIX cards in both contexts; the merged rows sit one tap deeper', () => {
  // Title context: AUDIO / DISPLAY / PILOT / HOW TO PLAY / SAVE DATA / BACK —
  // exactly, in order. The old wall (MUSIC, SFX, TEXT HUD, ZOOM, RESOLUTION,
  // REPLAY TOUR, EXPORT, IMPORT, RECOVERY, RESET) is behind the three doors.
  cardWith('SETUP').click();
  cardWith('SETTINGS').click();
  assert.deepEqual(names(), ['AUDIO', 'DISPLAY', 'PILOT', 'HOW TO PLAY', 'SAVE DATA', 'BACK'],
    'title settings is exactly the six condense cards, in order');
  // DISPLAY (M1): preset row + the FULL ladders one tap deeper (E2).
  cardWith('DISPLAY').click();
  assert.deepEqual(names(), ['DISPLAY PRESET', 'ZOOM', 'RESOLUTION', 'TEXT HUD', 'BACK'],
    'DISPLAY carries the preset plus the full zoom/resolution/hud ladders');
  cardWith('BACK').click();
  // AUDIO (M2).
  cardWith('AUDIO').click();
  assert.deepEqual(names(), ['MUSIC', 'SFX', 'BACK'], 'AUDIO carries MUSIC + SFX');
  cardWith('BACK').click();
  // SAVE DATA (M3): export/import/(recovery)/reset — RESET still two-tap.
  cardWith('SAVE DATA').click();
  const sd = names();
  assert.deepEqual(sd.slice(0, 2), ['EXPORT SAVE', 'IMPORT SAVE'], 'SAVE DATA leads with export/import');
  if (sd.includes('RECOVERY FILE')) assert.ok(sd.indexOf('RECOVERY FILE') === 2, 'recovery rides after import');
  const resetIdx = sd.indexOf('RESET PROFILE');
  assert.ok(resetIdx === sd.length - 2, 'RESET PROFILE sits just before BACK');
  cardWith('RESET PROFILE').click();
  assert.ok(names().includes('CONFIRM RESET?'), 'the arm still arms inside SAVE DATA');
  cardWith('BACK').click();
  cardWith('BACK').click();
  assert.ok(names().includes('START GAME'), 'BACK chains home: SAVE DATA -> settings -> title');

  // In-run context: the same six, with END RUN instead of SAVE DATA (E1) and
  // NO debug card unless the flag is set (D1).
  cardWith('START GAME').click();
  for (let i = 0; i < 200 && st.mode !== 'playing'; i++) h.pump(1);
  assert.equal(st.mode, 'playing', 'a run is live for the in-run settings probe');
  T.openSettings();
  assert.deepEqual(names(), ['AUDIO', 'DISPLAY', 'PILOT', 'HOW TO PLAY', 'END RUN', 'BACK'],
    'in-run settings is the same six with END RUN (no SAVE DATA, no TEST: ESCAPE)');
  cardWith('BACK').click();
  assert.equal(st.mode, 'playing', 'BACK resumes the run');
  // Leave the run cleanly for the checks below.
  T.openSettings();
  cardWith('END RUN').click();
  cardWith('CONFIRM END RUN?').click();
  assert.ok(st.mode === 'dead' || st.mode === 'end' || st.mode === 'title',
    'END RUN leaves the run (' + st.mode + ')');
  if (st.mode !== 'title') { key('t'); h.pump(2); }
  assert.equal(st.mode, 'title', 'back on the title');
});

// ---- 3. EXIT GAME: card REMOVED (condense D3), the path itself still honest ---
check('EXIT GAME card is gone; exitGame (the __TEST seam) still autosaves -> close -> farewell', () => {
  // MENU CONDENSE D3: the card is off the title. The FUNCTION keeps its
  // honest three-step contract (the `game: exitGame` seam), so this check now
  // drives the seam directly — same assertions, no card.
  const w = globalThis.window;
  let closes = 0;
  w.close = () => { closes++; };
  T.getProfile().gold += 7;
  T.exit.game();
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

// ---- 4. load-from-disk: FOLDED into SAVE DATA (condense M5) --------------------
check('a FRESH browser has NO title load offer; the offer lives in SAVE DATA', () => {
  // MENU CONDENSE M5: the fresh-browser LOAD FROM DISK title card is folded
  // into SETTINGS -> SAVE DATA (same validated pickImportFile path), so the
  // title is the same seven cards fresh or not.
  assert.ok(cardWith('START GAME'), 'START GAME present');
  // Wipe it the way a fresh browser looks, re-render the title: STILL seven.
  h.storage.delete('hordes_profile_v1');
  T.showTitle();
  assert.equal(cardWith('LOAD FROM DISK'), undefined,
    'no fresh-browser load offer on the title (folded into SAVE DATA)');
  assert.equal(names().length, 7, 'fresh title is the same seven cards');
  // The permanent home: SETUP -> SETTINGS -> SAVE DATA offers IMPORT SAVE,
  // fresh or not (a save exists again by the end of this check's tail).
  cardWith('SETUP').click();
  cardWith('SETTINGS').click();
  assert.ok(cardWith('SAVE DATA'), 'settings offers the SAVE DATA door');
  cardWith('SAVE DATA').click();
  assert.ok([...cards()].some(c => (c.innerHTML || '').includes('>IMPORT SAVE<')),
    'SAVE DATA offers IMPORT SAVE');
  cardWith('BACK').click();
  cardWith('BACK').click();
  key('escape');
  assert.equal(st.mode, 'title', 'back to the title');
  T.save.autosave();
});

check('IMPORT SAVE is wired to the file picker; the import path round-trips', () => {
  cardWith('SETUP').click();
  cardWith('SETTINGS').click();
  cardWith('SAVE DATA').click();
  const bodyKids = () => [...(globalThis.document.body.children || [])];
  const before = bodyKids().length;
  cardWith('IMPORT SAVE').click();
  const input = bodyKids().slice(before).find(c => c.type === 'file');
  assert.ok(input, 'a hidden <input type=file> was created (the pickImportFile path)');
  // Simulate the picker's success tail: a validated import lands and persists.
  const exported = T.save.exportText({ at: '2026-01-01T00:00:00.000Z' });
  h.storage.delete('hordes_profile_v1');
  const res = T.save.importText(exported);
  assert.equal(res.ok, true, 'the import path round-trips the export');
  assert.equal(T.hasLocalSave(), true, 'the imported profile was persisted');
  key('escape');
  assert.equal(st.mode, 'title', 'back to the title');
});

// ---- 5. the chrome gate + tour (DO 5) -------------------------------------------
// RETARGETED 2026-09-16 (help mode): the #hints key-list panel is retired;
// the help-mode strip is the "?" surface now, and it is mode-armed — the
// title must show it only while the player asked for it.
check('chrome is OFF in the title (pad layer, help strip) — the wave-23 contract', () => {
  h.pump(2);                                  // syncChrome runs on every mode's first frame
  assert.equal(T.chromeOn(), false, 'chromeOn() is false in the title');
  assert.equal(h.elements['touch'].style.display, 'none',
    'syncChrome hid the touch/pad layer');
  assert.equal(st.helpMode, false, 'help mode is not armed');
  assert.equal(h.elements['help-hud'].style.display, 'none',
    'the help-mode strip is not shown');
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
