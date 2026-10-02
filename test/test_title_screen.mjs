// TITLE SCREEN tests — the startup-menu contract through the REAL src/main.js
// (shared harness): the composed title card owns the canvas in mode 'title'
// (renderer seam geometry, null in a run), the menu is the five M3 cards
// (PLAY / SHOP / CHARACTERS / PROGRESS / SETTINGS, plus LOADOUT once a weapon
// beyond the starters is owned), PLAY opens the one pre-run screen, SETTINGS is
// one screen plus ADVANCED, exitGame keeps its three-step contract through the
// __TEST seam, and the chrome gate is OFF in the title.
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
  cardWith('PLAY').click();
  assert.equal(st.mode, 'setup', 'PLAY opens the pre-run screen');
  h.pump(2);
  assert.ok(T.renderer.titleScreen, 'the pre-run screen keeps the title art behind it');
  cardWith('START').click();
  assert.equal(st.mode, 'playing', 'START begins the run at once');
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

// ---- 2. the startup menu ------------------------------------------------------
check('the menu is FIVE cards: PLAY, SHOP, CHARACTERS, PROGRESS, SETTINGS', () => {
  const n = names();
  assert.deepEqual(n, ['PLAY', 'SHOP', 'CHARACTERS', 'PROGRESS', 'SETTINGS'],
    'the title is exactly the five cards, in order (starting kit only: no LOADOUT)');
  for (const moved of ['TROPHIES', 'BESTIARY', 'CHALLENGE', 'STAGE', 'HOW TO PLAY', 'SETUP', 'START GAME']) {
    assert.ok(!n.includes(moved), 'not on the title: ' + moved);
  }
  for (const gone of ['EXIT GAME', 'LOAD FROM DISK']) {
    assert.ok(!n.includes(gone), 'removed from the title: ' + gone);
  }
});

check('LOADOUT joins the title once a weapon beyond the starting kit is owned', () => {
  const prof = T.getProfile();
  prof.unlockedWeapons.push('ORBIT');
  T.showTitle();
  assert.deepEqual(names(), ['PLAY', 'SHOP', 'CHARACTERS', 'LOADOUT', 'PROGRESS', 'SETTINGS'],
    'six cards with a second weapon owned');
  prof.unlockedWeapons.splice(prof.unlockedWeapons.indexOf('ORBIT'), 1);
  T.showTitle();
  assert.equal(names().length, 5, 'and five again without it');
});

check('PROGRESS carries TROPHIES + BESTIARY + FUSIONS; PLAY opens the ONE pre-run screen; both return', () => {
  cardWith('PROGRESS').click();
  assert.deepEqual(names(), ['TROPHIES', 'BESTIARY', 'FUSIONS', 'BACK'],
    'PROGRESS holds the gallery, the guide and the fusion shelf, plus BACK');
  cardWith('BACK').click();
  assert.ok(names().includes('PLAY'), 'BACK returns to the title');

  cardWith('PLAY').click();
  const s = names();
  assert.equal(s.length, 5, 'the pre-run screen is five cards');
  assert.equal(s[0], 'START', 'START is first (Enter goes straight through)');
  assert.ok(/^STAGE: /.test(s[1]) && /^MODIFIER: /.test(s[2]) && s[3] === 'LOADOUT' && s[4] === 'BACK',
    'then STAGE, MODIFIER, LOADOUT, BACK: ' + s.join(' | '));
  // Each choice card says what it changes and what it pays.
  const html = (i) => cards()[i].innerHTML || '';
  assert.ok(/Pays normal gold/.test(html(1)), 'the stage card says what it pays: ' + html(1));
  assert.ok(/No extra rules\. Pays normal gold/.test(html(2)), 'the modifier card says what it pays: ' + html(2));
  assert.ok(/Volley \+ Boomerang/.test(html(3)) && /start at Lv 1/.test(html(3)), 'the loadout card names the kit: ' + html(3));
  // The defaults: the first stage, no modifier.
  assert.ok(/VERDANT HOLLOW/.test(s[1]) && /STANDARD RUN/.test(s[2]), 'default selection: ' + s.join(' | '));
  // A cycling selector re-renders its OWN screen, not the title.
  cards()[2].click();
  assert.ok(/^MODIFIER: ONE WEAPON/.test(names()[2]), 'cycling the modifier stays on the pre-run screen');
  assert.ok(/Pays \+\d+% run award \(\d+ to \d+ gold\)/.test(cards()[2].innerHTML), 'a modifier states its pay');
  while (T.menus.pendingChallenge !== 'STANDARD') cards()[2].click();
  cardWith('BACK').click();
  assert.ok(names().includes('PLAY'), 'BACK returns to the title from the pre-run screen');
});

check('SETTINGS is ONE screen plus ADVANCED, in both contexts', () => {
  cardWith('SETTINGS').click();
  assert.deepEqual(names(), ['MUSIC VOLUME', 'SFX VOLUME', 'SCREEN SHAKE', 'DISPLAY SIZE', 'FULLSCREEN',
    'EXPORT SAVE', 'IMPORT SAVE', 'HOW TO PLAY', 'ADVANCED', 'BACK'],
    'title settings is exactly these ten cards, in order');
  cardWith('ADVANCED').click();
  const adv = names();
  assert.deepEqual(adv.slice(0, 6), ['ZOOM', 'RESOLUTION', 'TEXT HUD', 'PILOT', 'FOCUS', 'STANCE'],
    'ADVANCED carries zoom, resolution, text hud, pilot, focus and stance');
  assert.ok(adv.some(x => /^NIGHT MODE/.test(x)), 'and night mode');
  assert.equal(adv[adv.length - 2], 'RESET PROFILE', 'RESET PROFILE sits just before BACK');
  cardWith('RESET PROFILE').click();
  assert.ok(names().includes('CONFIRM RESET?'), 'the reset arms on the first press');
  cardWith('BACK').click();
  cardWith('RESET PROFILE');
  assert.ok(names().includes('MUSIC VOLUME'), 'BACK returns to SETTINGS');
  cardWith('ADVANCED').click();
  assert.ok(names().includes('RESET PROFILE') && !names().includes('CONFIRM RESET?'), 'leaving ADVANCED disarms the reset');
  cardWith('BACK').click();
  cardWith('BACK').click();
  assert.ok(names().includes('PLAY'), 'BACK chains home: ADVANCED -> settings -> title');

  // In-run context: the same screen without the save cards, with END RUN.
  T.startRun();
  h.pump(2);
  assert.equal(st.mode, 'playing', 'a run is live for the in-run settings probe');
  T.openSettings();
  assert.deepEqual(names(), ['MUSIC VOLUME', 'SFX VOLUME', 'SCREEN SHAKE', 'DISPLAY SIZE', 'FULLSCREEN',
    'HOW TO PLAY', 'ADVANCED', 'END RUN', 'BACK'],
    'in-run settings: no save cards, END RUN added (no TEST: ESCAPE)');
  cardWith('ADVANCED').click();
  assert.ok(!names().some(x => /^NIGHT MODE|RESET PROFILE|RECOVERY FILE/.test(x)), 'in-run ADVANCED has no night mode / reset / recovery');
  cardWith('BACK').click();
  cardWith('BACK').click();
  assert.equal(st.mode, 'playing', 'BACK resumes the run');
  // Leave the run cleanly for the checks below.
  T.openSettings();
  cardWith('END RUN').click();
  cardWith('CONFIRM END RUN?').click();
  assert.ok(st.mode === 'dead', 'END RUN leaves the run (' + st.mode + ')');
  key('t'); h.pump(2);
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

// ---- 4. the save file cards live on SETTINGS ------------------------------------
check('a FRESH browser has NO title load offer; IMPORT SAVE lives on SETTINGS', () => {
  assert.ok(cardWith('PLAY'), 'PLAY present');
  // Wipe it the way a fresh browser looks, re-render the title: still five.
  h.storage.delete('hordes_profile_v1');
  T.showTitle();
  assert.equal(cardWith('LOAD FROM DISK'), undefined, 'no fresh-browser load offer on the title');
  assert.equal(names().length, 5, 'fresh title is the same five cards');
  cardWith('SETTINGS').click();
  assert.ok([...cards()].some(c => (c.innerHTML || '').includes('>IMPORT SAVE<')), 'SETTINGS offers IMPORT SAVE');
  key('escape');
  assert.equal(st.mode, 'title', 'back to the title');
  T.save.autosave();
});

check('IMPORT SAVE is wired to the file picker; the import path round-trips', () => {
  cardWith('SETTINGS').click();
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

check('PLAY then START starts a run: two presses, no wait', () => {
  cardWith('PLAY').click();
  cardWith('START').click();
  assert.equal(st.mode, 'playing', 'the run is live on the START press');
  assert.equal(ov.style.display, 'none', 'the overlay hid with the run');
  h.pump(1);
  assert.equal(st.titleReveal, null, 'no reveal seam survives into the run');
});

// ---- 6. the reveal: no leak, 120Hz, and no dependence on rAF ---------------------
check('leaving the title mid-fade leaks NO partial opacity into the next screen', () => {
  T.showTitle();                    // a return entry: the short (<=150ms) re-fade
  assert.equal(st.titleReveal.phase, 'return', 'the return re-fade is running');
  assert.ok(st.titleReveal.dur <= 0.15, 'the return fade is short (<=150ms)');
  h.pump(1);                         // mid-fade now
  assert.ok(parseFloat(ov.style.opacity) < 1, 'mid-fade, opacity below 1');
  cardWith('SETTINGS').click();      // leave the title mid-fade
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
});

// The reveal must not depend on requestAnimationFrame: with NO frames pumped,
// its own timer (driven by the wall clock) fades the menu in and hands the
// clicks back. The harness clock is advanced by hand; the timer is real.
await (async () => {
  h.setFrameMs(1000 / 60);
  T.title.replay();
  const tm = T.title.timings;
  assert.equal(st.titleReveal.phase, 'art');
  assert.equal(ov.style.pointerEvents, 'none', 'not clickable while hidden');
  assert.ok(T.titleTimer.armed, 'the reveal armed its own timer');
  const ticks0 = T.titleTimer.ticks;
  // Advance the wall clock past the whole reveal WITHOUT running a frame, then
  // let real timers fire.
  h.advanceClock((tm.beat + tm.fade + 0.1) * 1000);
  await new Promise((r) => setTimeout(r, T.titleTimer.stepMs * 4));
  check('with rAF stalled, the timer alone settles the reveal and re-enables clicks', () => {
    assert.ok(T.titleTimer.ticks > ticks0, 'the timer ticked (' + (T.titleTimer.ticks - ticks0) + ')');
    assert.equal(st.titleReveal.phase, 'settled', 'settled with zero frames pumped');
    assert.equal(ov.style.opacity, '', 'full opacity');
    assert.equal(ov.style.pointerEvents, '', 'clickable');
    assert.equal(T.titleTimer.armed, false, 'and the timer stood down');
  });
  // Mid-way: partly through the fade the menu is still not clickable.
  T.title.replay();
  h.advanceClock((tm.beat + tm.fade * 0.5) * 1000);
  await new Promise((r) => setTimeout(r, T.titleTimer.stepMs * 3));
  check('mid-fade (timer-driven) the cards are visible but NOT yet clickable', () => {
    assert.equal(st.titleReveal.phase, 'fade');
    assert.ok(st.titleReveal.opacity > 0 && st.titleReveal.opacity < 1, 'partly shown: ' + st.titleReveal.opacity);
    assert.equal(ov.style.pointerEvents, 'none', 'no clicks until fully shown');
  });
  h.advanceClock(tm.fade * 1000);
  await new Promise((r) => setTimeout(r, T.titleTimer.stepMs * 3));
  check('and it becomes clickable promptly once fully shown', () => {
    assert.equal(st.titleReveal.phase, 'settled');
    assert.equal(ov.style.pointerEvents, '');
  });
})();

console.log(`\n${passed} assertion groups passed — test_title_screen OK`);
