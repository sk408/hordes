// HORDES — HIDDEN-TAB BEHAVIOUR: THE MUSIC STOPS WHILE THE TAB IS HIDDEN.
// Run: node test/test_visibility_music.mjs
//
// Owner (2026-09-19): "can we also stop the music when the tab is hidden?"
// Browsers suspend rAF for a hidden document but not audio, so hiding the tab
// stops the music. Showing it again decides from what is on screen then:
//   * a run in play has its music back (a muted player stays muted);
//   * the end card and the menus stay silent, even if a run was playing when
//     the tab was hidden (background play can end a run, or start one);
//   * repeated 'hidden' events change nothing.
// The save on hide is pinned too.
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';
import { AUDIO_TEST, isMusicRunning, setMusicEnabled, init as audioInit } from '../src/audio.js';
import { CONFIG as C } from '../src/config.js';
import { mulberry32 } from '../src/weather.js';

// A fixed run: startRun rolls the field from Math.random.
Math.random = mulberry32(20261004);

const S = suite('test_visibility_music');

const h = await boot({ storage: [['hordes_onboarded', '1']] });
const T = h.T, st = h.state;
T.banners.suppressAll();

// ---- the fake AudioContext (the test_audio.mjs shape, minimal) --------------
class FakeParam {
  constructor(v = 0) { this.value = v; this.events = []; }
  setValueAtTime(v, t) { this.value = v; this.events.push(['set', v, t]); return this; }
  exponentialRampToValueAtTime(v, t) { this.value = v; this.events.push(['exp', v, t]); return this; }
  linearRampToValueAtTime(v, t) { this.events.push(['lin', v, t]); return this; }
}
class FakeGain { constructor(c) { this.ctx = c; this.gain = new FakeParam(1); } connect(d) { return d; } }
class FakeOsc {
  constructor(c) { this.ctx = c; this.frequency = new FakeParam(440); }
  connect(d) { return d; } start() {} stop() {}
}
class FakeNoise { connect(d) { return d; } start() {} stop() {} }
class FakeAudioContext {
  constructor() {
    this.currentTime = 0; this.state = 'running'; this.sampleRate = 44100;
    this.destination = {};
  }
  createGain() { return new FakeGain(this); }
  createOscillator() { return new FakeOsc(this); }
  createBufferSource() { return new FakeNoise(); }
  createBuffer() { return { getChannelData: () => new Float32Array(8) }; }
  resume() { return Promise.resolve(); }
}
const fakeStorage = { getItem: () => null, setItem() {}, removeItem() {} };

// Arm the audio with the fake and a real context, then start a run: it has music.
AUDIO_TEST.reset();
AUDIO_TEST.setDeps({ AudioContext: FakeAudioContext, storage: fakeStorage });
audioInit();
T.startRun();
h.pump(2);
assert.equal(isMusicRunning(), true, 'the music is running before we hide the tab');

const setVis = (v) => { globalThis.document.visibilityState = v; };
const hide = () => { setVis('hidden'); T.onVisibilityChange(); };
const show = () => { setVis('visible'); T.onVisibilityChange(); };
// The background ticker, driven by hand on the harness clock.
const bgFor = (seconds) => {
  for (let t = 0; t < seconds * 1000; t += C.BACKGROUND.TICK_MS) {
    h.advanceClock(C.BACKGROUND.TICK_MS);
    T.bg.tick(performance.now());
  }
};

S.check('hiding the tab STOPS the music', () => {
  hide();
  assert.equal(isMusicRunning(), false, 'the music was stopped');
});

S.check('returning to a run in play RESUMES it', () => {
  show();
  assert.equal(isMusicRunning(), true, 'the music came back');
});

S.check('repeated hidden events do not lose the resume', () => {
  // A browser can fire visibilitychange more than once.
  hide();
  T.onVisibilityChange();                 // a second 'hidden'
  assert.equal(isMusicRunning(), false, 'still stopped');
  show();
  assert.equal(isMusicRunning(), true, 'and the resume still happened');
});

S.check('a muted player stays muted through a hide/show', () => {
  setMusicEnabled(false);
  assert.equal(isMusicRunning(), false, 'muting stops the music');
  hide();
  show();
  assert.equal(isMusicRunning(), false, 'nothing started on return');
  setMusicEnabled(true);
  hide();
  show();
  assert.equal(isMusicRunning(), true, 'unmuted: the run has its music after the next return');
});

S.check('hiding the tab saves the profile', () => {
  const prof = T.getProfile();
  prof.gold += 5;   // progress the stored save does not hold yet
  hide();
  assert.equal(JSON.parse(h.storage.get('hordes_profile_v1')).gold, prof.gold, 'the profile was not written on hide');
  show();
});

S.check('hiding and showing by themselves do not move the run clock', () => {
  const t0 = st.time;
  hide();
  show();
  assert.equal(st.time, t0, 'the run clock moved with no frame and no tick');
});

S.check('a run that ends while hidden: the end card is silent after the return', () => {
  T.startRun();
  h.pump(2);
  assert.equal(st.mode, 'playing');
  assert.equal(isMusicRunning(), true);
  hide();
  st.player.invuln = 0;
  T.die();
  bgFor(1);
  assert.equal(st.mode, 'dead', st.mode);
  show();
  assert.equal(isMusicRunning(), false, 'run music over the end card');
  T.showTitle();
  hide();
  show();
  assert.equal(isMusicRunning(), false, 'run music on the title');
});

S.check('auto-continue starts the next run while hidden: it has its music after the return', () => {
  T.auto.on = true;
  T.startRun();
  h.pump(2);
  assert.equal(T.auto.run, true, 'the run is not unattended');
  assert.equal(isMusicRunning(), true);
  st.player.invuln = 0;
  T.die();
  for (let i = 0; i < 600 && st.mode !== 'dead'; i++) h.pump(1);   // the death movie, if one plays
  assert.equal(st.mode, 'dead', st.mode);
  assert.equal(isMusicRunning(), false, 'the end card is silent');
  hide();                                   // hidden on the end card: nothing is playing
  for (let i = 0; i < 20 && st.mode === 'dead'; i++) bgFor(1);
  assert.equal(st.mode, 'playing', 'auto-continue did not start a run in the hidden tab (' + st.mode + ')');
  assert.equal(isMusicRunning(), false, 'a hidden tab is silent');
  show();
  assert.equal(isMusicRunning(), true, 'the run started while hidden is silent');
  T.auto.on = false;
});

AUDIO_TEST.reset();   // drop the fake so later files are audio-inert (no timers)
S.done();
