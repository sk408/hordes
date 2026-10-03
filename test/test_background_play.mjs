// BACKGROUND PLAY: a hidden tab keeps an AUTO run going from a timer.
//   - the ticker exists only while something can run, and one tick never works
//     past its time budget;
//   - a run in play is saved now and then, the title and the end card are not;
//   - two tabs share one save: a hidden tab never writes over a newer save;
//   - a hidden tab opens no first-time hint and does not play the guided tutorial.
// Run: node test/test_background_play.mjs
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';
import { CONFIG as C } from '../src/config.js';
import { getHiddenMute } from '../src/audio.js';
import { mulberry32 } from '../src/weather.js';

// A fixed run: unseeded rolls (field, arches, drops) made the draft check depend on luck.
Math.random = mulberry32(20261002);

const s = suite('test_background_play');
const KEY = 'hordes_profile_v1';

// The harness clock: performance.now() is the fake `now`; the ticker is
// driven by hand with that clock, the way the Worker's message would.
function kit(h) {
  const T = h.T;
  return {
    hide: () => { document.visibilityState = 'hidden'; document.hidden = true; T.onVisibilityChange(); },
    show: () => { document.visibilityState = 'visible'; document.hidden = false; T.onVisibilityChange(); },
    bgFor: (seconds, stepMs = C.BACKGROUND.TICK_MS) => {
      let frames = 0;
      for (let t = 0; t < seconds * 1000; t += stepMs) { h.advanceClock(stepMs); frames += T.bg.tick(performance.now()); }
      return frames;
    },
    stored: () => JSON.parse(h.storage.get(KEY) || 'null'),
  };
}

const h = await boot({ storage: [['hordes_onboarded', '1']] });
const T = h.T, st = h.state;
T.banners.suppressAll();
const cards = () => [...(h.elements['ov-cards'].children || [])];
const { hide, show, bgFor, stored } = kit(h);
const prof = () => T.getProfile();
// Keep the hero alive so the clock comparison is not cut short by a death.
const safe = () => { st.player.invuln = 1e6; };

T.startRun();
h.pump(30);
s.check('setup: an AUTO run is live and background play is on by default', () => {
  assert.equal(st.mode, 'playing');
  assert.equal(st.pilotMode, 'AUTO_ALL');
  assert.equal(T.bg.on, true);
  assert.equal(T.bg.hidden, false);
});

s.check('visible: the ticker does nothing (rAF owns the clock)', () => {
  const t0 = st.time;
  h.advanceClock(500);
  assert.equal(T.bg.tick(performance.now()), 0);
  assert.equal(st.time, t0);
  h.pump(1);   // the rAF frame takes its own (clamped) step
});

prof().gold += 7;   // progress the stored save does not hold yet
hide();
s.check('hidden: the timer exists, sound is muted, the profile was saved', () => {
  assert.equal(T.bg.hidden, true);
  assert.ok(T.bg.timer, 'no ticker');
  assert.equal(getHiddenMute(), true);
  assert.equal(stored().gold, prof().gold, 'hiding the tab did not write the profile');
});

s.check('hidden: 10 s of ticks advance the run by about 10 s', () => {
  safe();
  const t0 = st.time;
  let simmed = 0;
  // Drafts pause the run clock; count only time spent in play.
  for (let i = 0; i < 100; i++) {
    h.advanceClock(100);
    const before = st.time;
    T.bg.tick(performance.now());
    simmed += st.time - before;
    safe();
  }
  assert.ok(st.time > t0, 'the run clock did not move');
  assert.ok(simmed <= 10.05, 'stepped more than real time: ' + simmed);
  assert.ok(simmed > 3, 'stepped far less than real time: ' + simmed);
});

s.check('hidden: frames per tick match elapsed time (6 per 100 ms, none lost to rounding)', () => {
  const n = bgFor(1);
  assert.ok(n >= 59 && n <= 61, n + ' frames in 1 s');
});

s.check('hidden: a long freeze is capped at MAX_CATCHUP_S, the rest is dropped', () => {
  safe();
  const dropped0 = T.bg.stats.droppedS;
  h.advanceClock(3600 * 1000);   // the tab was frozen for an hour
  const n = T.bg.tick(performance.now());
  assert.ok(n <= Math.ceil(C.BACKGROUND.MAX_CATCHUP_S * 60) + 1, n + ' frames from one tick');
  assert.ok(n >= C.BACKGROUND.MAX_CATCHUP_S * 60 - 1, n + ' frames from one tick');
  assert.ok(T.bg.stats.droppedS - dropped0 > 3590, 'the hour was not dropped');
  h.advanceClock(100);
  assert.ok(T.bg.tick(performance.now()) <= 7, 'the dropped time came back on the next tick');
});

s.check('hidden: a slow machine stops each tick at the time budget and drops the rest', () => {
  safe();
  for (let i = 0; i < 40 && st.mode !== 'playing'; i++) bgFor(1);
  assert.equal(st.mode, 'playing');
  // Every clock read costs 30 ms, so a frame costs at least that: far more than
  // the 16.7 ms it covers. Without a budget each tick would owe the next one more.
  const perf = globalThis.performance, fakeNow = perf.now;
  let lag = 0;
  perf.now = () => fakeNow() + (lag += 30);
  const perTick = [];
  const dropped0 = T.bg.stats.droppedS;
  try {
    for (let i = 0; i < 30; i++) { h.advanceClock(100); perTick.push(T.bg.tick(perf.now())); safe(); }
  } finally {
    perf.now = fakeNow;
    h.advanceClock(lag);   // the harness clock catches up with what the ticks saw
  }
  const most = Math.max(...perTick);
  assert.ok(most >= 1 && most <= Math.ceil(C.BACKGROUND.BUDGET_MS / 30) + 1, 'frames per tick: ' + perTick.join(','));
  assert.ok(T.bg.stats.droppedS > dropped0, 'the frames that did not fit were not counted as dropped');
  T.bg.tick(performance.now());   // the time the last slow tick itself took
  h.advanceClock(100);
  assert.ok(T.bg.tick(performance.now()) <= 7, 'the dropped frames came back later');
});

s.check('hidden: a draft is auto-picked on its normal countdown', () => {
  safe();
  T.jokers.draftWeight = 0;
  st.player.stats.xpMult = 0;   // no level-up of the run's own
  for (let i = 0; i < 40 && st.mode !== 'playing'; i++) bgFor(1);   // drain what the run opened itself
  assert.equal(st.mode, 'playing', 'the run did not settle back to play');
  for (const w of st.weapons) w.level = 1;   // no evolve offer after the pick
  st.pendingDrafts = 1;
  T.openDraft();
  assert.equal(st.mode, 'draft');
  const c0 = T.draftAuto.count;
  bgFor(C.AUTOPILOT.DRAFT_TIMEOUT - 0.5);
  assert.equal(T.draftAuto.count, c0, 'picked early (mode ' + st.mode + ')');
  bgFor(1);
  assert.equal(T.draftAuto.count, c0 + 1, 'no auto-pick while hidden (mode ' + st.mode + ', left ' + T.draftAuto.left + ')');
  assert.notEqual(st.mode, 'draft');
});

s.check('hidden, a run in play: the ticker saves the profile every SAVE_S', () => {
  safe();
  for (let i = 0; i < 40 && st.mode !== 'playing'; i++) bgFor(1);
  assert.equal(st.mode, 'playing');
  // Hold the run clock, so the run's own 10 s flush (checkRunLimit) cannot be the writer.
  st.bannerHold = 1e6;
  prof().gold += 11;
  const t0 = st.time;
  bgFor(C.BACKGROUND.SAVE_S + 1);
  st.bannerHold = 0;
  assert.equal(st.time, t0, 'the run clock was not held');
  assert.equal(stored().gold, prof().gold, 'no background save in ' + (C.BACKGROUND.SAVE_S + 1) + ' s of a run');
});

s.check('no double-stepping: a rAF frame and the ticker share one clock', () => {
  safe();
  while (st.mode !== 'playing') bgFor(0.5);
  const t0 = st.time;
  h.advanceClock(100);
  T.bg.tick(performance.now());     // the ticker takes the 100 ms
  const t1 = st.time;
  h.pump(1);                        // a stray rAF frame 16.7 ms later takes only its own slice
  T.bg.tick(performance.now());     // and the ticker finds nothing left
  assert.ok(t1 - t0 <= 0.1001 && t1 - t0 > 0.05, 'ticker step ' + (t1 - t0));
  assert.ok(st.time - t1 <= 0.0171, 'stepped twice: ' + (st.time - t1));
});

s.check('the setting OFF: no ticker, hidden time does not run and is not owed later', () => {
  T.bg.on = false;
  assert.equal(T.bg.timer, null, 'a ticker with nothing to run');
  const t0 = st.time;
  assert.equal(bgFor(5), 0);
  assert.equal(st.time, t0);
  T.bg.on = true;
  assert.ok(T.bg.timer, 'turning the setting on did not start the ticker');
  h.advanceClock(100);
  assert.ok(T.bg.tick(performance.now()) <= 7);
  assert.equal(h.storage.get('hordes_bg_play'), '1');
});

s.check('MANUAL pauses when hidden: no ticker until the pilot is back', () => {
  T.setPilotMode('MANUAL');
  assert.equal(T.bg.timer, null, 'a ticker with nothing to run');
  const t0 = st.time;
  assert.equal(bgFor(5), 0);
  assert.equal(st.time, t0);
  assert.equal(T.bg.runs, false);
  T.setPilotMode('AUTO_ALL');
  assert.ok(T.bg.timer, 'leaving MANUAL did not start the ticker');
});

show();
s.check('shown again: the timer is gone, sound is back, the next frame is one frame (no time jump)', () => {
  assert.equal(T.bg.timer, null);
  assert.equal(getHiddenMute(), false);
  safe();
  while (st.mode === 'draft') { cards()[0].click(); }
  h.pump(2);
  const t0 = st.time;
  h.pump(1);
  assert.ok(st.time - t0 <= 0.0171, 'jump of ' + (st.time - t0));
  h.advanceClock(5000);
  assert.equal(T.bg.tick(performance.now()), 0, 'the ticker ran in a visible tab');
});

s.check('hiding with nothing to run (setting off, or MANUAL) starts no ticker', () => {
  T.bg.on = false;
  hide();
  assert.equal(T.bg.timer, null, 'setting off');
  show();
  T.bg.on = true;
  T.setPilotMode('MANUAL');
  hide();
  assert.equal(T.bg.timer, null, 'MANUAL');
  show();
  T.setPilotMode('AUTO_ALL');
});

s.check('hidden through a death: the end screen is reached with no movie', () => {
  h.pump(1);
  hide();
  st.player.invuln = 0;
  T.die();
  bgFor(1);
  assert.equal(st.mode, 'dead', st.mode);
});

s.check('hidden on the end card or the title: nothing is written (only a run in play is saved)', () => {
  prof().gold += 13;
  const endCard = h.storage.get(KEY);
  assert.ok(bgFor(125) > 0, 'the end card stopped ticking');
  assert.equal(st.mode, 'dead');
  assert.equal(h.storage.get(KEY), endCard, 'the end card was autosaved');
  show();
  T.showTitle();
  hide();
  prof().gold += 17;
  const title = h.storage.get(KEY);
  assert.ok(bgFor(125) > 0, 'the title stopped ticking');
  assert.equal(st.mode, 'title');
  assert.equal(h.storage.get(KEY), title, 'the title was autosaved');
  show();
});

// ---- two tabs, one save ----
// What this tab hears when another tab writes to storage.
const otherTab = (word) => {
  const old = h.storage.get('hordes_tab');
  h.storage.set('hordes_tab', word + ':the other tab');
  h.key('storage', { key: 'hordes_tab', oldValue: old, newValue: word + ':the other tab' });
};
const otherTabSaves = (change) => {
  const old = h.storage.get(KEY);
  const p = JSON.parse(old);
  p.lastPlayed = (p.lastPlayed || 0) + 5000;
  change(p);
  const neu = JSON.stringify(p);
  h.storage.set(KEY, neu);
  h.key('storage', { key: KEY, oldValue: old, newValue: neu });
  return neu;
};

s.check('a visible tab keeps its save when another tab writes: the player is using it', () => {
  otherTabSaves((p) => { p.gold = 5; });
  assert.equal(T.save.autosave(), true);
  assert.equal(stored().gold, prof().gold);
});

T.startRun();
h.pump(30);
safe();
hide();
s.check('another tab comes to the front: this hidden tab stops playing and saving', () => {
  assert.ok(bgFor(1) > 0, 'the run was not playing in the background');
  otherTab('open');
  assert.equal(T.bg.runs, false);
  assert.equal(T.bg.timer, null);
  prof().gold += 19;
  const theirs = h.storage.get(KEY), tabKey = h.storage.get('hordes_tab');
  const t0 = st.time;
  assert.equal(bgFor(125), 0);
  assert.equal(st.time, t0, 'the run went on behind the other tab');
  h.key('pagehide');
  h.key('beforeunload');
  assert.equal(h.storage.get(KEY), theirs, 'closing the hidden tab wrote over the save');
  assert.equal(h.storage.get('hordes_tab'), tabKey, 'a tab that stood down announced its own closing');
});

s.check('that tab is closed, or this one is shown: it plays and saves again', () => {
  otherTab('closed');
  assert.equal(T.bg.runs, true, 'still standing down for a tab that is gone');
  assert.ok(T.bg.timer);
  assert.ok(bgFor(1) > 0);
  otherTab('open');
  assert.equal(T.bg.runs, false);
  show();
  assert.equal(T.save.autosave(), true, 'the tab in front does not save');
  assert.equal(stored().gold, prof().gold);
  hide();
  assert.ok(T.bg.timer, 'no ticker after the tab came back and was hidden again');
  assert.ok(bgFor(1) > 0);
});

s.check('closing the tab that owns the save says so, for a tab that stood down', () => {
  h.key('pagehide');
  assert.ok(/^closed:/.test(h.storage.get('hordes_tab')), h.storage.get('hordes_tab'));
  show();   // (it was not closed after all: showing it takes the save again)
  assert.ok(/^open:/.test(h.storage.get('hordes_tab')), h.storage.get('hordes_tab'));
  hide();
});

s.check('another tab that was only opened and closed (same save, new time stamp) takes nothing over', () => {
  safe();
  otherTabSaves(() => {});
  assert.equal(T.bg.runs, true);
  assert.ok(bgFor(1) > 0);
});

s.check('storage that was cleared, or holds no readable save, takes nothing over (this tab has the good copy)', () => {
  const mine = h.storage.get(KEY);
  h.key('storage', { key: KEY, oldValue: mine, newValue: null });
  h.key('storage', { key: null, oldValue: null, newValue: null });
  h.key('storage', { key: KEY, oldValue: mine, newValue: '{not json' });
  h.key('storage', { key: KEY, oldValue: mine, newValue: '7' });
  assert.equal(T.bg.runs, true);
  assert.equal(T.save.autosave(), true);
});

let theirs = null;
s.check('another tab changes the save: this hidden tab stops and never writes over it', () => {
  safe();
  theirs = otherTabSaves((p) => { p.gold = 123456; });
  assert.equal(T.bg.runs, false, 'still playing a run it cannot save');
  assert.equal(T.bg.timer, null);
  prof().gold += 23;
  assert.equal(bgFor(125), 0);
  h.key('pagehide');
  h.key('beforeunload');
  assert.equal(T.save.autosave(), false);
  assert.equal(h.storage.get(KEY), theirs, 'the newer save was overwritten');
});

// The reload and the per-tab session storage it leaves a note in.
let reloads = 0;
globalThis.location.reload = () => { reloads++; };
const session = new Map();
globalThis.sessionStorage = {
  getItem: (k) => (session.has(k) ? session.get(k) : null),
  setItem: (k, v) => { session.set(k, String(v)); },
  removeItem: (k) => { session.delete(k); },
};
s.check('shown again: this tab reloads to load the newer save, and writes nothing on the way', () => {
  assert.equal(st.mode, 'playing');
  show();
  assert.equal(reloads, 1, 'no reload');
  assert.equal(session.get('hordes_tab_reloaded'), '1');
  assert.ok(/ANOTHER TAB/.test(T.save.notice), 'no notice for a page that cannot reload: ' + T.save.notice);
  h.key('pagehide');          // the old page unloads
  st.player.invuln = 0;
  T.die();                    // and even a run that ends here is not written
  assert.equal(h.storage.get(KEY), theirs, 'the newer save was overwritten');
});

// ---- first-time hints ----
{
  const h2 = await boot({ hints: true, variant: 'bg-hints', storage: [['hordes_onboarded', '1']] });
  const T2 = h2.T, st2 = h2.state, k2 = kit(h2);
  T2.banners.suppressAll();
  T2.startRun();
  h2.pump(30);
  const seenHints = () => Object.keys(T2.tut.HINTS).filter(id => T2.tut.seen('hint:' + id));
  s.check('after that reload: the title says why, once', () => {
    assert.ok(/NEWER SAVE LOADED/.test(T2.save.notice), 'notice: ' + T2.save.notice);
    assert.equal(session.has('hordes_tab_reloaded'), false);
  });
  s.check('hidden: no first-time hint opens, none is marked seen, and the run is not held', () => {
    assert.equal(T2.tut.hintsEnabled(), true);
    T2.tut.hints.active = null;        // whatever went up in the first visible frames
    const seen0 = seenHints();
    k2.hide();
    let held = 0;   // ticks of play in which the clock stood still (a draft holds it by design)
    for (let i = 0; i < 900; i++) {
      st2.player.invuln = 1e6;
      const mode = st2.mode, t = st2.time;
      k2.bgFor(0.1);
      if (mode === 'playing' && st2.mode === 'playing' && st2.time === t) held++;
      assert.equal(T2.tut.hints.active, null, 'a hint opened in a hidden tab at ' + (i / 10) + ' s');
    }
    assert.deepEqual(seenHints(), seen0, 'hints were used up unseen');
    assert.ok(held <= 5, 'the run was held for ' + (held / 10) + ' s of 90');
    k2.show();
  });
  s.check('shown again: the hints it met while hidden come up now', () => {
    const seen0 = seenHints().length;
    for (let i = 0; i < 1200 && seenHints().length === seen0; i++) { st2.player.invuln = 1e6; h2.pump(1); }
    assert.ok(seenHints().length > seen0, 'no hint in 20 s of a visible run');
    T2.tut.hints.active = null;
  });

  // A tab the browser froze hears its storage events late, or after it is shown.
  s.check('a save changed by another tab with no storage event heard: still never written over, and a reload when shown', () => {
    let reloads2 = 0;
    globalThis.location.reload = () => { reloads2++; };
    st2.player.invuln = 1e6;
    k2.hide();
    assert.ok(k2.bgFor(1) > 0);
    const p = k2.stored();
    p.gold = 654321;
    p.lastPlayed += 5000;
    const theirs2 = JSON.stringify(p);
    h2.storage.set(KEY, theirs2);          // the other tab's save, and no event
    T2.getProfile().gold += 3;
    for (let i = 0; i < 30; i++) { st2.player.invuln = 1e6; k2.bgFor(1); }   // the run's own 10 s flush comes due
    assert.equal(h2.storage.get(KEY), theirs2, 'the newer save was overwritten');
    assert.equal(T2.bg.runs, false, 'still playing a run it cannot save');
    h2.key('pagehide');
    assert.equal(h2.storage.get(KEY), theirs2);
    k2.show();
    assert.equal(reloads2, 1, 'no reload');
  });
}

// ---- the guided tutorial ----
{
  const h3 = await boot({ tutorial: true, hints: true, variant: 'bg-guided', storage: [['hordes_onboarded', '1']] });
  const T3 = h3.T, k3 = kit(h3);
  h3.pump(3);
  if (h3.state.mode === 'intro') { h3.key('keydown', { key: 'x', preventDefault() {} }); h3.pump(2); }
  T3.startRun();
  h3.pump(10);
  s.check('hidden: the guided tutorial waits for its player (no ticker, no step taken, nothing saved as done)', () => {
    assert.ok(T3.tut.live, 'run 1 of a fresh profile did not open the guided part');
    const step0 = T3.tut.guided.step.id;
    k3.hide();
    assert.equal(T3.bg.runs, false);
    assert.equal(T3.bg.timer, null);
    assert.equal(k3.bgFor(150), 0);
    assert.ok(T3.tut.live, 'the guided part ended in a hidden tab');
    assert.equal(T3.tut.guided.step.id, step0, 'the tutorial moved on with nobody there');
    assert.equal(T3.tut.seen(T3.tut.LEDGER.guided), false);
    assert.ok(!(h3.storage.get(KEY) || '').includes(T3.tut.LEDGER.guided), 'saved as finished');
    k3.show();
    h3.pump(5);
    assert.equal(T3.tut.guided.step.id, step0, 'the first frame back skipped a step');
  });
}

s.done();
