// TWO TABS, ONE SAVE: two real game instances over one storage.
// Each tab is its own boot of src/main.js with its own globals; `deliver`
// does what the browser does between tabs: every key one tab changed arrives
// in the other as a storage event. The rules under test:
//   - the tab in front owns the save; a hidden tab that hears another tab
//     come to the front stops playing and saving;
//   - a tab that is opened and closed again changes nothing for the first,
//     which plays on once it is closed;
//   - a hidden tab whose save another tab changed never writes again and
//     reloads when it is shown, which loads the newer save; the same holds
//     for a tab the browser froze, which hears no storage event in time.
// Run: node test/test_two_tabs.mjs
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';
import { CONFIG as C } from '../src/config.js';
import { mulberry32 } from '../src/weather.js';

Math.random = mulberry32(20261003);
// The tests drive every tick by hand. A real interval would tick a hidden tab
// while another one boots, against that one's globals.
const realSetInterval = globalThis.setInterval;
globalThis.setInterval = () => 0;

const S = suite('test_two_tabs');
const KEY = 'hordes_profile_v1';
const GLOBALS = ['document', 'window', 'localStorage', 'sessionStorage', 'performance', 'location',
  'navigator', 'requestAnimationFrame', 'cancelAnimationFrame', 'devicePixelRatio'];

let current = null;
// Put a tab's own page (document, storage, clock) in place before driving it.
function use(tab) {
  if (current === tab) return;
  for (const k of GLOBALS) Object.defineProperty(globalThis, k, { value: tab.g[k], configurable: true, writable: true });
  current = tab;
}
// Open the game in a new tab over what is stored now. `session` is the tab's
// own session storage (it survives a reload of that tab).
async function openTab(name, storage, session = new Map()) {
  globalThis.sessionStorage = {
    getItem: (k) => (session.has(k) ? session.get(k) : null),
    setItem: (k, v) => { session.set(k, String(v)); },
    removeItem: (k) => { session.delete(k); },
  };
  const h = await boot({ variant: 'tab-' + name, storage: [['hordes_onboarded', '1'], ...storage] });
  const tab = { name, h, T: h.T, st: h.state, session, reloads: 0, g: {} };
  globalThis.location.reload = () => { tab.reloads++; };
  for (const k of GLOBALS) tab.g[k] = globalThis[k];
  current = tab;
  h.T.banners.suppressAll();
  return tab;
}
// The browser's part: what `from` wrote reaches `to` as storage events. A
// frozen tab shares the storage but hears nothing (`events` false).
function deliver(from, to, events = true) {
  for (const [k, v] of from.h.storage) {
    const old = to.h.storage.has(k) ? to.h.storage.get(k) : null;
    if (old === v) continue;
    to.h.storage.set(k, v);
    if (!events) continue;
    use(to);
    to.h.key('storage', { key: k, oldValue: old, newValue: v });
  }
}
const hide = (tab) => { use(tab); document.visibilityState = 'hidden'; document.hidden = true; tab.T.onVisibilityChange(); };
const show = (tab) => { use(tab); document.visibilityState = 'visible'; document.hidden = false; tab.T.onVisibilityChange(); };
const close = (tab) => { use(tab); tab.h.key('pagehide'); tab.h.key('beforeunload'); };
const bgFor = (tab, seconds) => {
  use(tab);
  let frames = 0;
  for (let t = 0; t < seconds * 1000; t += C.BACKGROUND.TICK_MS) {
    tab.st.player.invuln = 1e6;
    tab.h.advanceClock(C.BACKGROUND.TICK_MS);
    frames += tab.T.bg.tick(performance.now());
  }
  return frames;
};
const gold = (tab) => tab.T.getProfile().gold;
const storedGold = (tab) => JSON.parse(tab.h.storage.get(KEY)).gold;

// Tab A: an AUTO run, then the player looks elsewhere.
const A = await openTab('a', []);
A.T.startRun();
A.h.pump(30);
hide(A);

S.check('tab A alone: hidden, its run plays on and is saved', () => {
  assert.ok(bgFor(A, 15) > 0);
  assert.ok(A.T.bg.timer);
  assert.ok(A.h.storage.has(KEY));
});

// The game is opened again in a second tab.
let B = await openTab('b', [...A.h.storage]);
deliver(B, A);
S.check('a second tab opens: the hidden one stops playing and saving', () => {
  assert.equal(A.T.bg.runs, false);
  assert.equal(A.T.bg.timer, null);
  const before = A.h.storage.get(KEY);
  assert.equal(bgFor(A, 20), 0);
  use(A);
  assert.equal(A.T.save.autosave(), false);
  assert.equal(A.h.storage.get(KEY), before);
});

S.check('the second tab is closed with nothing done: the first one picks up where it stopped', () => {
  use(B);
  B.h.pump(120);
  close(B);                 // its closing save holds nothing new
  deliver(B, A);
  assert.equal(A.T.bg.runs, true, 'still standing down for a tab that is gone');
  assert.ok(bgFor(A, 2) > 0, 'the hidden run did not go on');
  show(A);
  assert.equal(A.reloads, 0, 'the first tab reloaded for a save that held nothing new');
  assert.equal(A.st.runSettled, null, 'its run is gone');
  assert.equal(A.T.save.autosave(), true);
  hide(A);
  assert.ok(bgFor(A, 2) > 0, 'background play did not come back');
});

// The game is opened in a second tab again, and this time it is played there.
B = await openTab('b2', [...A.h.storage]);
deliver(B, A);
let theirs = null;
S.check('the second tab earns and saves: the hidden one never writes over it', () => {
  use(B);
  B.T.getProfile().gold += 500;
  assert.equal(B.T.save.autosave(), true);
  theirs = B.h.storage.get(KEY);
  deliver(B, A);
  A.T.getProfile().gold += 1;            // the old tab's own unsaved change
  assert.equal(bgFor(A, 125), 0, 'the old tab kept playing');
  close(A);
  assert.equal(A.h.storage.get(KEY), theirs, 'the old tab wrote over the newer save');
  assert.equal(storedGold(A), gold(B));
});

S.check('back in the first tab: it reloads, and writes nothing on the way', () => {
  hide(B);
  deliver(B, A);
  show(A);
  assert.equal(A.reloads, 1, 'no reload');
  assert.equal(A.h.storage.get(KEY), B.h.storage.get(KEY), 'the reload wrote something');
});

// The reload: the same tab (same session storage), a fresh page over the storage.
const A2 = await openTab('a2', [...A.h.storage], A.session);
deliver(A2, B);
S.check('after the reload: the newer save is loaded, the title says so, and the other tab stands down', () => {
  assert.equal(gold(A2), gold(B));
  assert.ok(/NEWER SAVE LOADED/.test(A2.T.save.notice), 'notice: ' + A2.T.save.notice);
  assert.equal(B.T.bg.runs, false);
  use(B);
  assert.equal(B.T.save.autosave(), false, 'a hidden tab behind another one saved');
});

S.check('back in the second tab: nothing changed meanwhile, so it carries on without a reload', () => {
  hide(A2);
  deliver(A2, B);
  show(B);
  deliver(B, A2);
  assert.equal(B.reloads, 0);
  assert.equal(A2.T.bg.runs, false);
  use(B);
  B.T.getProfile().gold += 7;
  assert.equal(B.T.save.autosave(), true);
  assert.equal(storedGold(B), gold(B));
});

// A third tab is opened while the browser has the second one frozen: the
// frozen tab shares the storage and hears nothing.
hide(B);
const D = await openTab('d', [...B.h.storage]);
deliver(D, B, false);
S.check('a frozen tab hears no storage event: shown again it still reloads, and it wrote nothing', () => {
  use(D);
  D.T.getProfile().gold += 900;
  assert.equal(D.T.save.autosave(), true);
  deliver(D, B, false);
  const theirs2 = D.h.storage.get(KEY);
  show(B);                         // thawed by being shown, before any storage event arrives
  assert.equal(B.reloads, 1, 'no reload');
  close(B);
  assert.equal(B.h.storage.get(KEY), theirs2, 'the thawed tab wrote over the newer save');
});

globalThis.setInterval = realSetInterval;
S.done();
