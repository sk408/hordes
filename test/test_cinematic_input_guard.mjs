// HORDES — CINEMATIC INPUT GUARD tests (Sk408 playtest).
//
// The bug: "during the opening cinematic, if I push on the screen, it pushes
// whatever button is going to be there... it registers the skip and the touch
// at the same time."
//
// A tap is pointerdown -> pointerup -> click, and the click is dispatched at
// the touch point AFTER the skip handler already switched modes — so one tap
// against the intro movie skipped the movie AND pressed the button that
// appeared under the same finger. This file pins the guard that consumes the
// tail of that one gesture, through the REAL src/main.js:
//   1. the guard is INERT unless a cinematic was ended by input;
//   2. skipping the intro (key path) arms it, and a click arriving in the same
//      gesture is swallowed BEFORE the card's own handler can run;
//   3. a new press stands it down (the next deliberate tap is never eaten);
//   4. it expires on its own after UI_GUARD_MS;
//   5. the portal cinematic arms it too;
//   6. during ordinary play it is never armed.
// Run: node test/test_cinematic_input_guard.mjs
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';

const S = suite('CINEMATIC INPUT GUARD');
const h = await boot();
const st = h.state;
const T = h.T;
const overlay = h.elements['overlay'];

// A browser-faithful click dispatch: the overlay's CAPTURE listener runs
// first; only if it does not stop the event does the card's own handler run.
function clickThrough(card, ev) {
  const e = ev || {
    stopped: false, defaultPrevented: false,
    stopPropagation() { this.stopped = true; },
    stopImmediatePropagation() { this.stopped = true; },
    preventDefault() { this.defaultPrevented = true; },
  };
  const cap = overlay._ev && overlay._ev.click;
  if (cap) cap(e);
  if (!e.stopped) card.click();      // what the browser would deliver next
  return e;
}
const press = () => {
  const cap = overlay._ev && overlay._ev.pointerdown;
  if (cap) cap({ stopPropagation() {}, preventDefault() {} });
};
const key = (k) => h.key('keydown', { key: k, preventDefault() {} });

S.check('the guard is inert by default (a normal menu click works)', () => {
  assert.equal(T.uiGuard.armed(), false, 'not armed at boot');
  assert.equal(typeof T.uiGuard.window, 'number', 'the guard window is published');
  let fired = 0;
  const card = { click() { fired++; } };
  const ev = clickThrough(card);
  assert.equal(fired, 1, 'a click on an unguarded overlay reaches the card');
  assert.equal(ev.stopped, false, 'nothing was swallowed');
});

S.check('skipping the intro arms the guard, and the same gesture cannot press', () => {
  st.mode = 'intro';
  key('x');
  assert.notEqual(st.mode, 'intro', `the key skipped the movie (mode=${st.mode})`);
  assert.equal(T.uiGuard.armed(), true, 'ending a cinematic by input arms the guard');

  // The tap tail: the click that lands where the finger already was.
  let fired = 0;
  const card = { click() { fired++; } };
  const ev = clickThrough(card);
  assert.equal(fired, 0, 'the swallowed click NEVER reaches the card handler');
  assert.equal(ev.stopped, true, 'the event was stopped in the capture phase');
  assert.equal(ev.defaultPrevented, true, 'and its default was prevented');

  // The menu really is up underneath (this is what the player was hitting).
  const cards = h.elements['ov-cards'] ? h.elements['ov-cards'].children : [];
  assert.ok(cards.length > 0, 'the screen the tap bled into has buttons on it');
});

S.check('a NEW press stands the guard down (the next deliberate tap works)', () => {
  assert.equal(T.uiGuard.armed(), true, 'still armed from the skip');
  press();                       // finger comes down again, on purpose
  assert.equal(T.uiGuard.armed(), false, 'a fresh press disarms the guard');
  let fired = 0;
  const card = { click() { fired++; } };
  clickThrough(card);
  assert.equal(fired, 1, 'the player\'s next tap is delivered normally');
});

S.check('the guard expires on its own after UI_GUARD_MS', () => {
  T.uiGuard.arm();
  assert.equal(T.uiGuard.armed(), true);
  h.setFrameMs(T.uiGuard.window + 50);   // one slow frame past the window
  h.pump(1);
  h.setFrameMs(1000 / 60);
  assert.equal(T.uiGuard.armed(), false, 'the window closed with time');
  let fired = 0;
  clickThrough({ click() { fired++; } });
  assert.equal(fired, 1, 'clicks flow again once the window has closed');
});

S.check('the portal cinematic arms the guard too', () => {
  h.pump(2);                             // settle whatever mode we are in
  st.mode = 'portal-cine';
  T.uiGuard.standDown();
  key('x');
  assert.notEqual(st.mode, 'portal-cine', 'the key skipped the portal cinematic');
  assert.equal(T.uiGuard.armed(), true, 'the hand-off into the intermission is guarded');
  let fired = 0;
  clickThrough({ click() { fired++; } });
  assert.equal(fired, 0, 'a chest card cannot be pressed by the skipping gesture');
  press();                               // leave clean for later checks
});

S.check('the death cinematic arms the guard too (G15)', () => {
  h.pump(2);
  st.mode = 'death-cine';
  T.uiGuard.standDown();
  key('x');
  assert.equal(st.mode, 'dead', 'the key skipped the death movie (the payoff screen is up)');
  assert.equal(T.uiGuard.armed(), true, 'the hand-off into the payoff screen is guarded');
  let fired = 0;
  clickThrough({ click() { fired++; } });
  assert.equal(fired, 0, 'RETRY cannot be pressed by the skipping gesture');
  press();                               // leave clean for later checks
});

S.check('ordinary play never arms it', () => {
  h.pump(2);
  T.uiGuard.standDown();
  st.mode = 'playing';
  key('1');                              // a normal in-run key
  assert.equal(T.uiGuard.armed(), false, 'playing does not arm the guard');
});

S.done();
