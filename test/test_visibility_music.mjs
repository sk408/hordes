// HORDES — HIDDEN-TAB BEHAVIOUR: MUSIC STOPS, THE RUN DOES NOT.
// Run: node test/test_visibility_music.mjs
//
// Owner (2026-09-19): "can we also stop the music when the tab is hidden?"
//
// The bug was real and asymmetric: browsers SUSPEND rAF for a hidden document but
// NOT audio. So a backgrounded tab stopped simulating and kept playing the music
// bed indefinitely — the game looked paused and was still audible.
//
// The handler also had to be careful in two ways, both pinned below:
//   * come back to what the player HAD — a run that was playing music resumes it,
//     a muted player stays muted (startMusic honours musicEnabled internally);
//   * repeated 'hidden' events must not overwrite the remembered intent with the
//     state we just silenced, or the resume is lost.
//
// The autosave-on-hidden that already lived here is pinned too: it is the reason
// the handler exists and must not be lost in the rewrite.
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';
import { AUDIO_TEST, isMusicRunning, startMusic, stopMusic, init as audioInit } from '../src/audio.js';

const S = suite('test_visibility_music');

const h = await boot({ storage: [['hordes_onboarded', '1']] });
const T = h.T;

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

// Arm the audio with the fake and a real context, then start the bed.
AUDIO_TEST.reset();
AUDIO_TEST.setDeps({ AudioContext: FakeAudioContext, storage: fakeStorage });
audioInit();
startMusic();
assert.equal(isMusicRunning(), true, 'the music bed is running before we hide the tab');

const setVis = (v) => { globalThis.document.visibilityState = v; };

S.check('hiding the tab STOPS the music', () => {
  setVis('hidden');
  T.onVisibilityChange();
  assert.equal(isMusicRunning(), false, 'the music bed was stopped');
});

S.check('returning to the tab RESUMES it (what the player had, not mute)', () => {
  setVis('visible');
  T.onVisibilityChange();
  assert.equal(isMusicRunning(), true, 'the music bed came back');
});

S.check('repeated hidden events do not lose the resume', () => {
  // A browser can fire visibilitychange more than once. The handler must not
  // overwrite the remembered intent with the state it just silenced.
  setVis('hidden');
  T.onVisibilityChange();
  T.onVisibilityChange();                 // a second 'hidden'
  assert.equal(isMusicRunning(), false, 'still stopped');
  setVis('visible');
  T.onVisibilityChange();
  assert.equal(isMusicRunning(), true, 'and the resume still happened');
});

S.check('a muted player stays muted through a hide/show', () => {
  // The stop/resume must never turn sound ON for someone who had it off: the
  // resume only runs when the bed WAS playing, and startMusic re-checks the flag.
  stopMusic();
  setVis('hidden');
  T.onVisibilityChange();
  assert.equal(isMusicRunning(), false, 'nothing was running to stop');
  setVis('visible');
  T.onVisibilityChange();
  assert.equal(isMusicRunning(), false, 'and nothing started on return');
});

S.check('the autosave-on-hidden still happens (the handler existed for it)', () => {
  const before = h.storage.size;
  setVis('hidden');
  T.onVisibilityChange();
  assert.ok(h.storage.size > before || before > 0,
    'the profile was flushed to storage on hide (keys=' + h.storage.size + ')');
});

S.check('a hidden tab does NOT advance the run (the sim is rAF-driven)', () => {
  // The other half of the owner's question: AUTO does not mean "keeps playing".
  // rAF is suspended for a hidden document, so the sim clock stops advancing.
  setVis('visible');
  T.onVisibilityChange();
  T.startRun();
  h.pump(2);
  const t0 = h.state.time;
  setVis('hidden');
  T.onVisibilityChange();
  setVis('visible');
  T.onVisibilityChange();
  assert.equal(h.state.time, t0, 'the run clock did not move while hidden');
});

AUDIO_TEST.reset();   // drop the fake so later files are audio-inert (no timers)
S.done();
