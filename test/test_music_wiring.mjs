// HORDES — recorded music: main.js's wiring (2026-11-17).
// test_music_files.mjs drives src/music_files.js through audio.js on its own;
// this boots the real game (main.js) with a fake AudioContext that CAN decode
// and a fake fetch, so the recorded engine is live, and pins what main.js
// tells it: the scene for every game mode, the run counter, the cues at death
// and at RUN SURVIVED (the synth victory arpeggio only without a recorded
// cue), the ADVANCED row, and that a new run started after a death in a boss
// fight opens with its run track (feel.js leaves the mode on 'boss').
import assert from 'node:assert/strict';
import { boot } from './_harness.mjs';
import * as A from '../src/audio.js';
import { runSlotFor } from '../src/music_files.js';
import { mulberry32 } from '../src/weather.js';

Math.random = mulberry32(20261117);
let passed = 0;
const check = async (label, fn) => {
  try { await fn(); } catch (err) { console.error('  FAIL ' + label); throw err; }
  passed++; console.log('  ok - ' + label);
};
const h = await boot({ storage: [['hordes_onboarded', '1']] });
const T = h.T, st = h.state;
T.banners.suppressAll();

// ---- fakes (the test_music_files.mjs shape) ----
class Param {
  constructor(v) { this.value = v; this.events = []; }
  setValueAtTime(v, t) { this.events.push(['set', v, t]); this.value = v; }
  linearRampToValueAtTime(v, t) { this.events.push(['lin', v, t]); }
  exponentialRampToValueAtTime(v, t) { this.events.push(['exp', v, t]); }
  cancelScheduledValues(t) { this.events.push(['cancel', t]); }
}
class Gain { constructor() { this.gain = new Param(1); } connect(d) { return d; } disconnect() {} }
class Osc { constructor() { this.frequency = new Param(440); } connect(d) { return d; } start() {} stop() {} }
class Src {
  constructor(c) { this.c = c; this.buffer = null; this.starts = []; this.stops = []; }
  connect(d) { return d; }
  start(t, off) { this.starts.push([t, off]); if (this.buffer && this.buffer.slot) this.c.tracks.push(this); }
  stop(t) { this.stops.push(t === undefined ? 'now' : t); }
}
const loop = (slot, bars) => ({ url: 'assets/music/' + slot + '.00000000.mp3', kind: 'loop', bpm: 120, loopStart: 0.5, loopEnd: 0.5 + bars * 2, seconds: 1 + bars * 2, gain: 1 });
const cue = (slot, s) => ({ url: 'assets/music/' + slot + '.00000000.mp3', kind: 'cue', bpm: 0, seconds: s, gain: 1 });
const TRACKS = {
  title: loop('title', 8), run_wilds: loop('run_wilds', 16), run_ash: loop('run_ash', 16),
  run_bone: loop('run_bone', 16), run_void: loop('run_void', 16), boss: loop('boss', 8),
  maw: loop('maw', 8), escape: loop('escape', 4),
  victory: cue('victory', 4), gameover: cue('gameover', 5), portal: cue('portal', 3),
};
const c = {
  currentTime: 0, state: 'running', sampleRate: 44100, destination: {}, tracks: [],
  createGain: () => new Gain(), createOscillator: () => new Osc(), createBufferSource: () => new Src(c),
  createBuffer: () => ({ getChannelData: () => new Float32Array(64) }),
  resume: () => Promise.resolve(),
  decodeAudioData: (ab) => Promise.resolve({ slot: ab.slot, duration: TRACKS[ab.slot].seconds }),
};
// The fetch answers at once (a microtask later): loads land between frames.
const fetched = [];
const fakeFetch = (url) => {
  const slot = /([a-z_]+)\.0{8}\.mp3$/.exec(String(url))[1];
  fetched.push(slot);
  return Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve({ slot }) });
};
const mem = new Map();
const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
A.AUDIO_TEST.reset();
A.AUDIO_TEST.setDeps({ AudioContext: function () { return c; }, storage, fetch: fakeFetch, tracks: TRACKS, trimDb: -20 });
A.AUDIO_TEST.reset();
A.init();

const settle = async () => { for (let i = 0; i < 40; i++) await new Promise((r) => setImmediate(r)); };
// Frames with the audio clock moving with them.
const frames = (n) => { for (let i = 0; i < n; i++) { c.currentTime += 1 / 60; h.pump(1); } };
const M = () => A.AUDIO_TEST.music();
const ctxNow = () => A.getMusicContext();

await check('the title screen reports the title scene and starts loading after the first frame', async () => {
  frames(2);
  assert.ok(ctxNow(), 'main.js reports a music context every frame');
  assert.equal(ctxNow().scene, T.music.scene());
  assert.ok(['title', 'none'].includes(ctxNow().scene), ctxNow().scene);
  await settle(); frames(1); await settle(); frames(1); await settle();
  assert.ok(fetched.length > 0, 'the recorded tracks load lazily');
});

await check('every game mode maps to its music scene', () => {
  T.startRun();
  frames(1);
  const saved = st.mode;
  const want = {
    playing: 'run', draft: 'run', evolve: 'run', burst: 'run', chest: 'run',
    settings: 'pause', stats: 'pause', intermission: 'intermission', finale: 'finale',
    'portal-cine': 'portal', escape: 'escape', 'death-cine': 'death', dead: 'endcard',
    intro: 'none', title: 'title', menu: 'title',
  };
  const got = {};
  for (const m of Object.keys(want)) { st.mode = m; got[m] = T.music.scene(); }
  st.mode = saved;
  assert.deepEqual(got, want);
});

await check('startRun reports the new run (counter, stage, wave) before its bed starts', async () => {
  const n0 = T.music.runNo;
  st.mode = 'dead'; st.runSettled = true; frames(1);
  T.startRun();
  assert.equal(T.music.runNo, n0 + 1, 'startRun bumps the run counter');
  const cx = ctxNow();
  assert.equal(cx.scene, 'run');
  assert.equal(cx.runNo, n0 + 1);
  assert.equal(cx.stage, st.stage);
  assert.equal(A.isMusicRunning(), true);
  await settle(); frames(2); await settle(); frames(2);
  assert.equal(M().cur, runSlotFor(st.stage, false), 'the stage\'s run track plays');
});

await check('a death in a boss fight, then RETRY: the new run opens with its run track', async () => {
  T.bossRules.spawnBoss();
  for (let i = 0; i < 60 && A.getMusicMode() !== 'boss'; i++) frames(1);
  await settle(); frames(30); await settle(); frames(30);
  assert.equal(A.getMusicMode(), 'boss', 'feel.js reports the boss');
  assert.equal(M().cur, 'boss', 'the boss bed plays');
  T.die();
  assert.equal(A.isMusicRunning(), false, 'die() stops the run music');
  assert.ok(M().cues.includes('gameover'), 'die() plays the game-over cue');
  frames(1);
  assert.equal(ctxNow().scene, 'death');
  for (let i = 0; i < 1200 && st.mode !== 'dead'; i++) frames(1);
  frames(1);
  assert.equal(st.mode, 'dead', 'the end card');
  assert.equal(ctxNow().scene, 'endcard');
  assert.equal(A.getMusicMode(), 'boss', 'the mode is still the dead run\'s (feel.js no longer steps)');
  const t0 = c.currentTime;
  T.startRun();
  assert.equal(M().cur, runSlotFor(st.stage, false), 'RETRY opens with the run track, not the boss bed');
  frames(120);
  assert.ok(c.tracks.filter((s) => s.buffer.slot === 'boss').every((s) => s.starts[0][0] < t0), 'no boss source in the new run');
});

await check('RUN SURVIVED: the recorded victory cue replaces the synth arpeggio; without one the arpeggio plays', async () => {
  frames(5);
  c.currentTime += 5;
  T.run.runSurvived();
  assert.equal(A.isMusicRunning(), false, 'the run music stopped first');
  assert.ok(M().cues.includes('victory'), 'the recorded victory cue plays');
  assert.equal(A.AUDIO_TEST.sfxPlayedAt('victory'), undefined, 'no synth victory arpeggio on top of it');
  frames(1);
  assert.equal(ctxNow().scene, 'endcard');
  // CLASSIC SYNTH: no recorded cue, so the arpeggio is the victory sound.
  A.setMusicSource('synth');
  st.runSettled = true;
  T.startRun(); frames(5);
  c.currentTime += 5;
  T.run.runSurvived();
  assert.equal(A.AUDIO_TEST.sfxPlayedAt('victory'), c.currentTime, 'the synth arpeggio plays');
  A.setMusicSource('recorded');
});

await check('ADVANCED has the MUSIC row; it switches the source and persists it', () => {
  st.runSettled = true;
  T.startRun(); frames(2);
  T.openSettings();
  const cards = () => [...h.elements['ov-cards'].children];
  const named = (t) => cards().find((x) => (x._html || x.innerHTML || '').includes(t));
  named('ADVANCED').click();
  const row = named('MUSIC: RECORDED');
  assert.ok(row, 'the ADVANCED page has a MUSIC: RECORDED row');
  row.click();
  assert.equal(A.getMusicSource(), 'synth');
  assert.equal(mem.get('hordes_audio_music_src'), 'synth', 'the choice is stored');
  assert.ok(named('MUSIC: CLASSIC SYNTH'), 'the row now reads CLASSIC SYNTH');
  named('MUSIC: CLASSIC SYNTH').click();
  assert.equal(A.getMusicSource(), 'recorded');
});

console.log('test_music_wiring: ' + passed + ' checks passed');
A.AUDIO_TEST.reset();
