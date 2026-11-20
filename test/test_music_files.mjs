// HORDES — recorded music (src/music_files.js through src/audio.js).
// A fake AudioContext that CAN decodeAudioData and a fake fetch drive the real
// engine on a fake clock: the gate, the source pref, the loader (order, one
// fetch at a time, the LRU cap), every context switch the game makes, the boss
// debounce, the hidden tab, the fallbacks, CLASSIC SYNTH, and reset. Plus a
// seam check on the shipped manifest (src/music_manifest.js, assets/music/).
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { init, startMusic, stopMusic, setMusicMode, setHiddenMute, setMusicEnabled,
  setMusicContext, setMusicSource, getMusicSource, playMusicCue, playEscapeCue,
  isMusicRunning, fadeMusicCues, AUDIO_TEST } from '../src/audio.js';
import { MUSIC_TRACKS, MUSIC_TRIM_DB } from '../src/music_manifest.js';
import { LOOP_SLOTS, CUE_SLOTS, runSlotFor, MAX_LOOP_BUFFERS, dbToGain } from '../src/music_files.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const ok = (name) => { passed++; console.log('  ok - ' + name); };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)); };

// ---- fakes ----
class Param {
  constructor(v) { this.value = v; this.events = []; }
  setValueAtTime(v, t) { this.events.push(['set', v, t]); this.value = v; }
  linearRampToValueAtTime(v, t) { this.events.push(['lin', v, t]); }
  exponentialRampToValueAtTime(v, t) { this.events.push(['exp', v, t]); }
  cancelScheduledValues(t) { this.events.push(['cancel', t]); }
  // The last scheduled target value (what the param settles at).
  last() { const e = this.events.filter((x) => x[0] !== 'cancel').pop(); return e ? e[1] : this.value; }
}
class Gain {
  constructor(c) { this.c = c; this.gain = new Param(1); this.dest = null; }
  connect(d) { this.dest = d; return d; }
  disconnect() { this.dest = null; }
}
class Osc {
  constructor(c) { this.c = c; this.type = 'sine'; this.frequency = new Param(440); }
  connect(d) { return d; }
  start(t) { this.c.notes.push({ type: this.type, at: t }); }
  stop() {}
}
class Src {
  constructor(c) { this.c = c; this.buffer = null; this.loop = false; this.loopStart = 0; this.loopEnd = 0; this.starts = []; this.stops = []; this.dest = null; }
  connect(d) { this.dest = d; return d; }
  start(t, off) {
    if (this.buffer && this.buffer.slot) this.c.tracks.push(this);
    else this.c.notes.push({ type: 'noise', at: t });
    this.starts.push([t, off]);
  }
  stop(t) { this.stops.push(t === undefined ? 'now' : t); }
}
// A param with no linear ramp and no cancel (exponential only: the synth's
// tone() needs it), and one with nothing but .value.
class ExpOnlyParam {
  constructor(v) { this.value = v; this.events = []; }
  setValueAtTime(v, t) { this.events.push(['set', v, t]); this.value = v; }
  exponentialRampToValueAtTime(v, t) { this.events.push(['exp', v, t]); }
}
class ValueParam { constructor(v) { this.value = v; } }
function makeCtx({ decode = true, params = 'full' } = {}) {
  const c = {
    currentTime: 0, state: 'running', sampleRate: 44100, destination: {},
    notes: [], tracks: [], resumes: 0, gains: [],
    createGain() {
      const g = new Gain(c);
      if (params === 'expOnly') g.gain = new ExpOnlyParam(1);
      if (params === 'value') g.gain = new ValueParam(1);
      c.gains.push(g);
      return g;
    },
    createOscillator() { return new Osc(c); },
    createBufferSource() { return new Src(c); },
    createBuffer() { return { getChannelData: () => new Float32Array(1024) }; },
    resume() { c.resumes++; return Promise.resolve(); },
    failDecode: new Set(),
  };
  if (decode === 'callback') {
    // The old callback-only Safari form: returns undefined, calls back later.
    c.decodeAudioData = (ab, okCb, errCb) => {
      setImmediate(() => {
        if (c.failDecode.has(ab.slot)) errCb(new Error('bad mp3'));
        else okCb({ slot: ab.slot, duration: TRACKS[ab.slot].seconds });
      });
      return undefined;
    };
  } else if (decode) {
    c.decodeAudioData = (ab) => {
      if (c.failDecode.has(ab.slot)) return Promise.reject(new Error('bad mp3'));
      return Promise.resolve({ slot: ab.slot, duration: TRACKS[ab.slot].seconds });
    };
  }
  return c;
}
const makeStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); }, dump: () => Object.fromEntries(m) };
};
// bpm 120: a beat is 0.5 s, a bar 2 s. Loops are whole bars with 0.5 s pre-roll.
const loop = (slot, bars) => ({ url: 'assets/music/' + slot + '.00000000.mp3', kind: 'loop', bpm: 120, loopStart: 0.5, loopEnd: 0.5 + bars * 2, seconds: 1 + bars * 2, gain: 1 });
const cue = (slot, s) => ({ url: 'assets/music/' + slot + '.00000000.mp3', kind: 'cue', bpm: 0, seconds: s, gain: 1 });
const TRACKS = {
  title: loop('title', 8), run_wilds: loop('run_wilds', 16), run_ash: loop('run_ash', 16),
  run_bone: loop('run_bone', 16), run_void: loop('run_void', 16), boss: loop('boss', 8),
  maw: loop('maw', 8), escape: loop('escape', 4),
  victory: cue('victory', 4), gameover: cue('gameover', 5), portal: cue('portal', 3),
};
const TRIM = -20;
const slotOf = (url) => /([a-z_]+)\.0{8}\.mp3$/.exec(url)[1];
function makeFetch() {
  const f = (url) => {
    const slot = slotOf(url);
    f.log.push(slot);
    return new Promise((res, rej) => f.pending.push({ slot, res, rej }));
  };
  f.log = []; f.pending = []; f.fail = new Set(); f.maxInFlight = 0;
  // Serve the oldest pending request (or fail it when its slot is in f.fail).
  f.serveOne = async () => {
    f.maxInFlight = Math.max(f.maxInFlight, f.pending.length);
    const p = f.pending.shift();
    if (!p) return false;
    if (f.fail.has(p.slot)) p.rej(new Error('network'));
    else p.res({ ok: true, status: 200, arrayBuffer: () => Promise.resolve({ slot: p.slot }) });
    await flush();
    return true;
  };
  f.serveAll = async (max = 30) => { for (let i = 0; i < max && f.pending.length; i++) await f.serveOne(); };
  return f;
}
function setup({ decode = true, fetchOk = true, src, params } = {}) {
  AUDIO_TEST.reset();
  const st = makeStorage();
  if (src) st.setItem('hordes_audio_music_src', src);
  const c = makeCtx({ decode, params });
  const fe = fetchOk ? makeFetch() : null;
  AUDIO_TEST.setDeps({ AudioContext: function () { return c; }, storage: st, fetch: fe, tracks: TRACKS, trimDb: TRIM });
  AUDIO_TEST.reset();          // re-hydrate from the new storage
  init();
  return { c, st, fe, m: () => AUDIO_TEST.music() };
}
const live = (c) => c.tracks.filter((s) => !s.stops.length);
const trackOf = (c, slot) => c.tracks.filter((s) => s.buffer.slot === slot).pop();
const synthNotes = (c, from = 0) => c.notes.filter((n) => n.at >= from && n.type !== 'noise').length;
const tick = (c, dt) => { c.currentTime += dt; AUDIO_TEST.scheduleAhead(); };
const ctxRun = (extra = {}) => ({ scene: 'run', stage: 'VERDANT_HOLLOW', wave: 1, runNo: 1, ...extra });
const endcard = (runNo = 1) => ({ scene: 'endcard', stage: 'VERDANT_HOLLOW', runNo });
const tracksOf = (c, slot) => c.tracks.filter((s) => s.buffer.slot === slot);

// ---------- the gate ----------
{
  const { c } = setup({ decode: false });
  setMusicContext({ scene: 'title' });
  assert.strictEqual(AUDIO_TEST.music(), null, 'no decodeAudioData: no engine');
  assert.ok(startMusic());
  assert.ok(synthNotes(c) > 0, 'the synth plays as before');
  stopMusic();
  setup({ fetchOk: false });
  setMusicContext({ scene: 'title' });
  assert.strictEqual(AUDIO_TEST.music(), null, 'no fetch: no engine');
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'location');
  globalThis.location = { protocol: 'file:' };
  setup();
  setMusicContext({ scene: 'title' });
  assert.strictEqual(AUDIO_TEST.music(), null, 'file:// page: no engine');
  if (saved) Object.defineProperty(globalThis, 'location', saved); else delete globalThis.location;
  const { m } = setup();
  setMusicContext({ scene: 'title' });
  assert.ok(m(), 'all conditions hold: the engine is built');
  ok('the gate: decodeAudioData, fetch and a non-file page are all required');
}

// ---------- the pref ----------
{
  const { st } = setup();
  assert.strictEqual(getMusicSource(), 'recorded', 'default is recorded');
  setMusicContext({ scene: 'title' });
  assert.deepStrictEqual(st.dump(), {}, 'reading the pref writes nothing');
  assert.strictEqual(setMusicSource('synth'), 'synth');
  assert.strictEqual(st.dump().hordes_audio_music_src, 'synth');
  const s2 = setup({ src: 'synth' });
  assert.strictEqual(getMusicSource(), 'synth', 'the stored pref is read back');
  assert.strictEqual(Object.keys(s2.st.dump()).length, 1);
  ok('the source pref defaults to recorded and is never written on read');
}

// ---------- loader: after the first frame, one at a time, in priority order ----------
{
  const { c, fe, m } = setup();
  startMusic(); stopMusic();
  assert.strictEqual(fe.log.length, 0, 'nothing loads before the first frame');
  setMusicContext({ scene: 'title', stage: 'BONE_DESERT' });
  assert.deepStrictEqual(fe.log, ['title'], 'the current context first');
  setMusicContext({ scene: 'title', stage: 'BONE_DESERT' });
  assert.strictEqual(fe.pending.length, 1, 'one fetch in flight');
  await fe.serveAll();
  assert.strictEqual(fe.maxInFlight, 1, 'never two fetches at once');
  assert.deepStrictEqual(fe.log, ['title', 'run_bone', 'boss', 'victory', 'gameover', 'portal'],
    'title, the picked stage\'s run track, boss, then the cues');
  assert.strictEqual(m().buffers.filter((s) => LOOP_SLOTS.includes(s)).length, MAX_LOOP_BUFFERS);
  assert.strictEqual(m().cur, 'title', 'the title bed plays once decoded');
  const t = trackOf(c, 'title');
  assert.ok(t.loop && t.loopStart === 0.5 && t.loopEnd === 16.5 && t.starts[0][1] === 0.5, 'a loop from loopStart');
  assert.strictEqual(t.dest.dest, AUDIO_TEST.state().musicDuck, 'track -> its gain -> musicDuck');
  assert.strictEqual(AUDIO_TEST.state().musicDuck.dest, AUDIO_TEST.state().musicBus, 'musicDuck -> musicBus');
  assert.ok(near(t.dest.gain.last(), dbToGain(TRIM)), 'faded in to the trimmed level');
  assert.ok(near(AUDIO_TEST.state().musicBus.gain.value, 0.5), 'the music bus is untouched (0.5)');
  assert.strictEqual(isMusicRunning(), false, 'title music is not run music');
  ok('loader: after the first frame, one fetch at a time, current slot then title/stage/boss/cues');
}
{
  // In a run: the run track, boss, the cues, then escape only at wave 1 and
  // maw only from wave 4; the title fills a free loop slot last.
  for (const wave of [1, 2, 3]) {
    const { fe } = setup();
    setMusicContext(ctxRun({ wave }));
    await fe.serveAll();
    assert.deepStrictEqual(fe.log, ['run_wilds', 'boss', 'victory', 'gameover', 'portal', wave === 1 ? 'escape' : 'title'],
      'loader order in a run at wave ' + wave);
  }
  ok('loader order in a run: run track, boss, cues, escape at wave 1 only, no maw before wave 4');
}

// ---------- context switches: title -> run -> boss -> run (resumes) -> finale -> maw ----------
let shared;
{
  const s = setup();
  const { c, fe, m } = s;
  setMusicContext({ scene: 'title', stage: 'VERDANT_HOLLOW' });
  await fe.serveAll();
  assert.strictEqual(m().cur, 'title');
  c.currentTime = 10;
  setMusicContext(ctxRun());
  assert.strictEqual(m().cur, 'title', 'startRun reports the run a moment before startMusic: the title waits for it');
  const n0 = c.notes.length;
  startMusic();
  assert.strictEqual(m().cur, 'run_wilds', 'run -> the stage group\'s track');
  assert.ok(trackOf(c, 'title').dest.gain.events.some((e) => e[0] === 'lin' && e[1] === 0 && near(e[2], 11.05)),
    'title -> run: the title fades out over QUICK_XFADE (1 s)');
  assert.ok(trackOf(c, 'run_wilds').dest.gain.events.some((e) => e[0] === 'lin' && near(e[1], dbToGain(TRIM)) && near(e[2], 11.05)),
    'while the run bed fades in over the same second');
  for (let i = 0; i < 40; i++) tick(c, 0.025);
  assert.ok(trackOf(c, 'title').stops.length, 'the title source is stopped once its fade ends');
  assert.strictEqual(c.notes.length - n0, 0, 'no synth voice while the recorded run bed plays');
  // Boss: at the next beat line, over one beat.
  const run = trackOf(c, 'run_wilds');
  const runT0 = run.starts[0][0];
  c.currentTime = 13.37;
  setMusicMode('boss');
  assert.strictEqual(m().cur, 'boss');
  const boss = trackOf(c, 'boss');
  const T = boss.starts[0][0];
  const beatsIn = (T - runT0) / 0.5;
  assert.ok(near(beatsIn, Math.round(beatsIn), 1e-6) && T >= 13.37 && T - 13.37 <= 0.55 + 1e-9, 'boss enters on the run\'s next beat line, within a beat');
  assert.ok(near(boss.dest.gain.last(), dbToGain(TRIM)) && boss.dest.gain.events.some((e) => e[0] === 'lin' && near(e[2], T + 0.5)), 'crossfade over one beat');
  assert.strictEqual(boss.starts[0][1], 0.5, 'the boss loop starts at its top');
  const left = m().positions.run_wilds;
  assert.ok(near(left, 0.5 + (T - runT0)), 'the run bed remembers where it left');
  // Debounce: boss flaps off for less than a bar -> nothing changes.
  c.currentTime = 15; setMusicMode('run'); AUDIO_TEST.scheduleAhead();
  c.currentTime = 15.5; setMusicMode('boss');
  c.currentTime = 16; setMusicMode('run'); AUDIO_TEST.scheduleAhead();
  c.currentTime = 17.5; AUDIO_TEST.scheduleAhead();
  assert.strictEqual(m().cur, 'boss', 'a bossAlive flap shorter than a bar keeps the boss bed');
  c.currentTime = 18.1; AUDIO_TEST.scheduleAhead();
  assert.strictEqual(m().cur, 'run_wilds', 'a bar of no boss: back to the run');
  const back = trackOf(c, 'run_wilds');
  assert.notStrictEqual(back, run);
  assert.ok(near(back.starts[0][1], left), 'the run track resumes at the position it left');
  const bossLine = (back.starts[0][0] - boss.starts[0][0]) / 2;
  assert.ok(near(bossLine, Math.round(bossLine), 1e-6), 'back on the boss track\'s bar line');
  assert.ok(back.dest.gain.events.some((e) => e[0] === 'lin' && near(e[2], back.starts[0][0] + 2)), 'over one bar');
  // Finale: the maw loads once the run reaches wave 4, and replaces boss.
  setMusicContext(ctxRun({ wave: 4 }));
  await fe.serveAll();
  assert.ok(m().buffers.includes('maw'), 'maw is loaded from wave 4');
  assert.ok(!m().buffers.includes('title'), 'the cap evicted the title (least needed in a run)');
  c.currentTime = 30;
  setMusicContext(ctxRun({ scene: 'finale', wave: 5, maw: true }));
  setMusicMode('boss');
  assert.strictEqual(m().cur, 'maw', 'the Maw alive: maw instead of boss');
  assert.ok(m().buffers.includes('maw') && m().buffers.filter((x) => LOOP_SLOTS.includes(x)).length <= 3, 'never more than three decoded loops');
  // The Maw slain or withdrawn: the run goes on (intermission). The debounce
  // holds the maw bed (never the boss bed), then the run track comes back.
  const bossSources = tracksOf(c, 'boss').length;
  c.currentTime = 33;
  setMusicMode('run');
  setMusicContext(ctxRun({ scene: 'intermission', wave: 5 }));
  assert.strictEqual(m().cur, 'maw', 'the maw bed holds through the debounce');
  c.currentTime = 35.2;
  setMusicContext(ctxRun({ scene: 'intermission', wave: 5 }));
  assert.strictEqual(m().cur, 'run_wilds', 'then the run track');
  assert.strictEqual(tracksOf(c, 'boss').length, bossSources, 'the boss bed never played after the Maw');
  shared = s;
  stopMusic();
  ok('title -> run (1 s) -> boss (next beat, one beat) -> debounce -> run (resumes, next bar) -> finale -> maw -> run');
}

// ---------- LRU: never the playing bed or a pending target; least recently used goes ----------
{
  const { c, fe, m } = setup();
  const loops = () => m().buffers.filter((x) => LOOP_SLOTS.includes(x)).sort();
  const evicted = () => m().loadLog.filter((x) => x[1] === 'evict').map((x) => x[0]);
  setMusicContext(ctxRun({ wave: 4 }));
  await fe.serveOne();                    // run_wilds
  startMusic();                           // it plays (touched before the others land)
  await fe.serveAll();
  assert.deepStrictEqual(fe.log, ['run_wilds', 'boss', 'victory', 'gameover', 'portal', 'maw'],
    'a run at wave 4: run track, boss, cues, maw (the title is outside the cap)');
  assert.deepStrictEqual(loops(), ['boss', 'maw', 'run_wilds']);
  // An escape into a new stage: escape and run_ash are wanted, run_wilds plays.
  fe.fail.add('escape');
  c.currentTime = 5.3;
  setMusicContext(ctxRun({ scene: 'escape', stage: 'ASHEN_WASTE', wave: 4 }));
  assert.deepStrictEqual(evicted(), ['boss'], 'the least recently used unwanted loop goes (boss before maw), never the playing run_wilds');
  assert.ok(m().buffers.includes('run_wilds') && m().cur === 'run_wilds');
  await fe.serveOne();                    // escape fails: the run bed plays on
  await fe.serveOne();                    // run_ash lands: it takes over on the next bar line
  assert.strictEqual(m().cur, 'run_ash');
  assert.ok(trackOf(c, 'run_ash').starts[0][0] > c.currentTime, 'run_ash is a pending crossfade target');
  await fe.serveAll();                    // boss wants back in: maw goes
  assert.deepStrictEqual(evicted(), ['boss', 'maw'], 'neither the bed still sounding nor the pending target is evicted');
  assert.deepStrictEqual(loops(), ['boss', 'run_ash', 'run_wilds']);
  stopMusic();
  ok('LRU: the playing bed and a pending crossfade target stay decoded; the least recently used goes');
}

// ---------- a fade-out scheduled during a fade-in never jumps ----------
{
  const { c, fe, m } = setup();
  setMusicContext(ctxRun());
  await fe.serveAll();
  startMusic();
  c.currentTime = 3.3;
  setMusicContext(ctxRun({ stage: 'ASHEN_WASTE', wave: 2 }));
  await fe.serveAll();
  assert.strictEqual(m().cur, 'run_ash');
  const env = m().voices.find((v) => v.slot === 'run_ash' && !v.dead).env;
  c.currentTime = env.t0 + 0.6 * (env.t1 - env.t0);   // 60 % into the run_ash fade-in
  const held = env.from + (env.to - env.from) * 0.6;
  setMusicMode('boss');                   // run_ash fades out from the next beat line
  const p = trackOf(c, 'run_ash').dest.gain;
  const set = p.events.filter((e) => e[0] === 'set' && near(e[2], c.currentTime)).pop();
  assert.ok(set && near(set[1], held, 1e-9), 'the gain holds its present value (' + (set && set[1]) + ' vs ' + held + ')');
  setMusicMode('run');
  stopMusic();
  ok('a fade-out scheduled during a fade-in starts from the present value (no jump)');
}

// ---------- the boss returns between the debounce and the bar line: the same bed goes on ----------
{
  const { c, fe, m } = setup();
  setMusicContext(ctxRun());
  await fe.serveAll();
  startMusic();                           // run bed from 0.05
  c.currentTime = 3.3; setMusicMode('boss');
  const boss = trackOf(c, 'boss');
  assert.ok(near(boss.starts[0][0], 3.55), 'boss on the run\'s beat line');
  c.currentTime = 6; setMusicMode('run'); AUDIO_TEST.scheduleAhead();
  c.currentTime = 8.1; AUDIO_TEST.scheduleAhead();
  assert.strictEqual(m().cur, 'run_wilds', 'the debounce is over');
  const run = trackOf(c, 'run_wilds');
  assert.ok(near(run.starts[0][0], 9.55), 'the run bed waits for the boss\'s bar line');
  c.currentTime = 8.6; setMusicMode('boss');
  assert.strictEqual(m().cur, 'boss');
  assert.strictEqual(tracksOf(c, 'boss').length, 1, 'no second boss source from the top');
  assert.strictEqual(boss.stops.length, 0, 'the boss source was never stopped');
  assert.ok(near(boss.dest.gain.last(), dbToGain(TRIM)), 'and it is back at full level');
  assert.ok(run.stops.length, 'the pending run bed is cancelled before it sounds');
  setMusicMode('run');
  stopMusic();
  ok('a boss back before the bar line keeps its bed (no restart against itself)');
}

// ---------- a new run never opens with the last run\'s boss (feel.js mode is stale) ----------
{
  const { c, fe, m } = setup();
  setMusicContext(ctxRun());
  await fe.serveAll();
  startMusic();
  c.currentTime = 3; setMusicMode('boss');
  assert.strictEqual(m().cur, 'boss');
  // Death in the boss fight: feel.js stops stepping, the mode stays 'boss'.
  c.currentTime = 5;
  stopMusic(); playMusicCue('gameover');
  setMusicContext(ctxRun({ scene: 'death' }));
  c.currentTime = 9; setMusicContext(endcard(1));
  // RETRY: startRun reports the new run, then startMusic, before any sim step.
  c.currentTime = 12;
  setMusicContext(ctxRun({ runNo: 2 }));
  startMusic();
  assert.strictEqual(m().cur, 'run_wilds', 'the new run opens with its run track');
  assert.strictEqual(m().recBoss, false);
  tick(c, 0.017);
  setMusicMode('run');                    // the first sim step
  for (let i = 0; i < 100; i++) tick(c, 0.025);
  assert.ok(tracksOf(c, 'boss').every((s) => s.starts[0][0] < 12), 'no boss source in the new run');
  // The Maw beaten: the intermission freezes the mode on 'boss'; CONTINUE.
  setMusicMode('boss'); tick(c, 0.025);
  assert.strictEqual(m().cur, 'boss');
  setMusicContext(ctxRun({ runNo: 2, scene: 'intermission', wave: 5 }));
  for (let i = 0; i < 200; i++) tick(c, 0.025);
  assert.strictEqual(m().cur, 'run_wilds', 'the intermission goes back to the run track');
  const nb = tracksOf(c, 'boss').length;
  setMusicContext(ctxRun({ runNo: 2, wave: 6 }));        // CONTINUE: the frame before the sim step
  tick(c, 0.017);
  assert.strictEqual(m().cur, 'run_wilds', 'wave 6 opens with the run track');
  setMusicMode('run');
  for (let i = 0; i < 100; i++) tick(c, 0.025);
  assert.strictEqual(tracksOf(c, 'boss').length, nb, 'no boss source after CONTINUE');
  stopMusic();
  ok('a stale boss mode (death in a fight, the Maw) never opens the next run or wave with the boss bed');
}

// ---------- travel switches the stage group (next bar) ----------
{
  const { c, fe, m } = setup();
  setMusicContext(ctxRun());
  await fe.serveAll();
  startMusic();
  assert.strictEqual(m().cur, 'run_wilds');
  c.currentTime = 5.3;
  setMusicContext(ctxRun({ stage: 'ASHEN_WASTE', wave: 3 }));
  assert.strictEqual(m().cur, 'run_wilds', 'the new stage\'s track is loading: the old bed keeps going');
  assert.strictEqual(fe.log[fe.log.length - 1], 'run_ash', 'and the new stage\'s track loads first');
  await fe.serveAll();
  assert.strictEqual(m().cur, 'run_ash', 'decoded: switch');
  const a = trackOf(c, 'run_ash'), w = trackOf(c, 'run_wilds');
  const bars = (a.starts[0][0] - w.starts[0][0]) / 2;
  assert.ok(near(bars, Math.round(bars), 1e-6), 'on the old track\'s bar line');
  assert.strictEqual(runSlotFor('CINDER_MAW'), 'run_ash');
  assert.strictEqual(runSlotFor('WHITEOUT'), 'run_wilds');
  assert.strictEqual(runSlotFor('BONE_DESERT'), 'run_bone');
  assert.strictEqual(runSlotFor('VOID_REACH'), 'run_void');
  assert.strictEqual(runSlotFor('NOWHERE'), 'run_wilds');
  assert.strictEqual(runSlotFor('VERDANT_HOLLOW', true), 'run_void', 'after the Maw: run_void');
  stopMusic();
  ok('travel: stage group switch on the bar line once the new track decodes; stage -> group table');
}

// ---------- escape and back; the synth chase bed is suppressed ----------
{
  const { c, fe, m } = setup();
  setMusicContext(ctxRun());
  await fe.serveAll();
  assert.ok(m().buffers.includes('escape'), 'escape loads before wave 1 ends');
  startMusic();
  c.currentTime = 7.77;
  setMusicContext(ctxRun({ scene: 'escape' }));
  assert.strictEqual(m().cur, 'escape');
  const e = trackOf(c, 'escape');
  assert.ok(near(e.starts[0][0], 7.82) && e.dest.gain.events.some((x) => x[0] === 'lin' && near(x[2], 7.82 + 0.3)), 'at once, over 0.3 s');
  const before = c.notes.length;
  assert.strictEqual(playEscapeCue('STEP', 3), false, 'STEP chase bed suppressed under the recorded escape');
  assert.strictEqual(playEscapeCue('ROAR'), true, 'ROAR still sounds');
  assert.ok(c.notes.length > before);
  c.currentTime = 16;
  setMusicContext(ctxRun({ scene: 'intermission', wave: 2 }));
  assert.strictEqual(m().cur, 'run_wilds', 'the chase ends: back to the run track');
  assert.strictEqual(playEscapeCue('STEP', 3), true, 'the STEP cue is back once the escape loop stops');
  stopMusic();
  ok('escape: at once (0.3 s) and back; STEP suppressed only while the recorded escape plays');
}

// ---------- portal duck + cue; pause duck; victory duck; death cue ----------
{
  const { c, fe, m } = setup();
  setMusicContext(ctxRun());
  await fe.serveAll();
  startMusic();
  const duck = AUDIO_TEST.state().musicDuck.gain;
  c.currentTime = 3;
  setMusicContext(ctxRun({ scene: 'pause' }));
  assert.ok(near(duck.last(), dbToGain(-8)) && duck.events.some((x) => x[0] === 'lin' && near(x[2], 3.3)), 'pause: -8 dB over 0.3 s');
  assert.strictEqual(m().cur, 'run_wilds', 'pause never switches tracks');
  c.currentTime = 4;
  setMusicContext(ctxRun({ scene: 'run' }));
  assert.ok(near(duck.last(), 1), 'back from pause: restored');
  c.currentTime = 5;
  setMusicContext(ctxRun({ scene: 'portal' }));
  assert.ok(playMusicCue('portal'), 'the portal cue plays');
  const p = trackOf(c, 'portal');
  assert.strictEqual(p.dest.dest, AUDIO_TEST.state().musicBus, 'cue -> its gain -> musicBus (not ducked by the bed\'s duck)');
  assert.ok(near(p.dest.gain.last(), dbToGain(TRIM)), 'portal cue at the run level');
  assert.ok(near(duck.last(), dbToGain(-12)), 'portal movie: the bed ducks -12 dB');
  assert.strictEqual(m().cur, 'run_wilds');
  c.currentTime = 12;
  setMusicContext(ctxRun({ scene: 'intermission' }));
  assert.ok(near(duck.last(), 1), 'restored after the movie');
  // Maw slain: victory over a -12 dB duck, the run continues.
  c.currentTime = 20;
  assert.ok(playMusicCue('victory', { duckDb: -12 }));
  assert.ok(near(duck.last(), dbToGain(-12)), 'victory cue ducks the bed');
  c.currentTime = 24.1;
  setMusicContext(ctxRun({ scene: 'run' }));
  assert.ok(near(duck.last(), 1), 'the cue ended: restored');
  assert.strictEqual(m().cur, 'run_wilds', 'the run bed played on');
  // Death: stopMusic, then the gameover cue.
  c.currentTime = 30;
  stopMusic();
  setMusicContext(ctxRun({ scene: 'death' }));
  assert.ok(playMusicCue('gameover'));
  assert.ok(near(trackOf(c, 'gameover').dest.gain.last(), dbToGain(TRIM - 2)), 'gameover 2 dB under the run level');
  assert.strictEqual(m().cur, null, 'no bed under the death movie');
  // The end card (after the death movie, the 5 s cue has ended): the title
  // bed fades in about 2 s after the card shows.
  c.currentTime = 36;
  setMusicContext({ scene: 'endcard', stage: 'VERDANT_HOLLOW' });
  await fe.serveAll();
  c.currentTime = 37; setMusicContext({ scene: 'endcard', stage: 'VERDANT_HOLLOW' });
  assert.strictEqual(m().cur, null, 'not yet');
  c.currentTime = 38.1; setMusicContext({ scene: 'endcard', stage: 'VERDANT_HOLLOW' });
  assert.strictEqual(m().cur, 'title', 'title bed ~2 s after the card');
  ok('ducks (pause -8, portal -12, victory -12) and cues (portal, victory, gameover -2 dB); end card title after 2 s');
}

// ---------- RUN SURVIVED: the cue, then the title; a new run or CLASSIC SYNTH cuts a cue ----------
{
  const { c, fe, m } = setup();
  setMusicContext(ctxRun());
  await fe.serveAll();
  startMusic();
  c.currentTime = 20;
  stopMusic();                                     // runSurvived: stopMusic, then the cue
  assert.strictEqual(m().cur, null, 'the run bed is gone');
  assert.ok(playMusicCue('victory'), 'the victory cue plays');
  const v = trackOf(c, 'victory');
  assert.ok(near(v.dest.gain.last(), dbToGain(TRIM)) && v.dest.dest === AUDIO_TEST.state().musicBus, 'at the run level, on the music bus');
  assert.ok(near(v.starts[0][0], 20.02));
  setMusicContext(endcard());                      // the card shows at 20
  await fe.serveAll();
  c.currentTime = 22.1; setMusicContext(endcard());
  assert.strictEqual(m().cur, null, 'no title over the 4 s victory cue');
  c.currentTime = 23.6; setMusicContext(endcard());
  assert.strictEqual(m().cur, 'title', 'the title comes in as the cue ends');
  // Run 2 dies; RETRY a second later: the game-over cue fades as the new run starts.
  c.currentTime = 30;
  setMusicContext(ctxRun({ runNo: 2 })); startMusic();
  c.currentTime = 40;
  stopMusic(); assert.ok(playMusicCue('gameover'));
  setMusicContext(ctxRun({ runNo: 2, scene: 'death' }));
  const go = trackOf(c, 'gameover');
  c.currentTime = 41;
  setMusicContext(ctxRun({ runNo: 3 })); startMusic();
  assert.ok(go.dest.gain.events.some((e) => e[0] === 'lin' && e[1] === 0 && near(e[2], 41.3)), 'the old cue fades over 0.3 s');
  assert.ok(go.stops.length && go.stops[0] <= 41.35 + 1e-9, 'and stops');
  // CLASSIC SYNTH chosen while a cue plays: the cue stops too.
  c.currentTime = 45;
  assert.ok(playMusicCue('portal'));
  const pc = trackOf(c, 'portal');
  setMusicSource('synth');
  assert.ok(pc.stops.length && pc.stops[0] <= 45.25 + 1e-9, 'CLASSIC SYNTH: a recorded cue does not play on');
  stopMusic();
  ok('victory cue then the title; a new run and CLASSIC SYNTH cut a playing cue');
}

// ---------- R2: the portal cue cut short by the Maw: it fades, its duck lifts ----------
{
  const { c, fe, m } = setup();
  setMusicContext(ctxRun());
  await fe.serveAll();
  startMusic();
  const duck = AUDIO_TEST.state().musicDuck.gain;
  c.currentTime = 10;
  assert.ok(playMusicCue('portal', { duckDb: -12 }), 'the portal cue plays at the kill');
  assert.ok(near(duck.last(), dbToGain(-12)), 'and ducks the bed');
  const pc = trackOf(c, 'portal');
  c.currentTime = 12.5;                            // the walk-in at the last wave: the finale
  fadeMusicCues();
  assert.ok(pc.dest.gain.events.some((e) => e[0] === 'lin' && e[1] === 0 && near(e[2], 12.8)), 'the cue fades over 0.3 s');
  assert.ok(pc.stops.length && pc.stops[0] <= 12.85 + 1e-9, 'and stops');
  assert.ok(near(duck.last(), 1), 'the duck lifts at once, not at the cue\'s end');
  fadeMusicCues();                                 // nothing playing: a no-op
  assert.strictEqual(m().cur, 'run_wilds');
  stopMusic();
  ok('fadeMusicCues: a playing cue fades over 0.3 s and its duck lifts');
}

// ---------- CLASSIC SYNTH on a paused screen keeps the duck until the bed has faded ----------
{
  const { c, fe, m } = setup();
  setMusicContext(ctxRun());
  await fe.serveAll();
  startMusic();
  c.currentTime = 3.3;
  setMusicContext(ctxRun({ scene: 'pause' }));
  const duck = AUDIO_TEST.state().musicDuck.gain;
  assert.ok(near(duck.last(), dbToGain(-8)));
  setMusicSource('synth');
  assert.ok(near(duck.last(), dbToGain(-8)), 'the fading recorded bed stays ducked');
  const end = m().voices.find((x) => x.slot === 'run_wilds').env.t1;
  while (c.currentTime < end + 0.1) tick(c, 0.025);
  assert.ok(near(duck.last(), 1), 'the duck is released once the bed has faded out');
  stopMusic();
  ok('CLASSIC SYNTH on a paused screen: no un-duck before the recorded bed fades');
}

// ---------- hidden tab: stop, remember, resume at the place ----------
{
  const { c, fe, m } = setup();
  setMusicContext(ctxRun());
  await fe.serveAll();
  startMusic();
  const r = trackOf(c, 'run_wilds');
  c.currentTime = 9.4;
  // main.js onVisibilityChange: stopMusic, then setHiddenMute(true).
  stopMusic(); setHiddenMute(true);
  assert.ok(live(c).length === 0 || live(c).every((s) => s.stops.length), 'every source stopped');
  const pos = m().positions.run_wilds;
  assert.ok(near(pos, 0.5 + (9.4 - r.starts[0][0])), 'the loop\'s position is remembered');
  c.currentTime = 100;
  setMusicContext(ctxRun());
  assert.strictEqual(m().cur, null, 'nothing starts while hidden');
  setHiddenMute(false); startMusic();
  const r2 = trackOf(c, 'run_wilds');
  assert.notStrictEqual(r2, r);
  assert.ok(near(r2.starts[0][1], pos), 'resumes at that position');
  stopMusic();
  // The title bed too.
  setMusicContext({ scene: 'title', stage: 'VERDANT_HOLLOW' });
  await fe.serveAll();
  c.currentTime = 120;
  setMusicContext({ scene: 'title', stage: 'VERDANT_HOLLOW' });
  const tt = trackOf(c, 'title');
  c.currentTime = 125;
  setHiddenMute(true);
  const tp = m().positions.title;
  setHiddenMute(false);
  assert.ok(near(trackOf(c, 'title').starts[0][1], tp) && trackOf(c, 'title') !== tt, 'title resumes at its place');
  // A boss bed hidden mid-fight comes back at its place too (but a new fight starts at the top).
  c.currentTime = 200;
  setMusicContext(ctxRun());
  startMusic(); setMusicMode('boss');
  assert.strictEqual(m().cur, 'boss');
  c.currentTime = 203.3;
  stopMusic(); setHiddenMute(true);
  const bp = m().positions.boss;
  assert.ok(bp > 0.5, 'the boss loop\'s place is kept while hidden');
  setHiddenMute(false); startMusic();
  assert.ok(m().cur === 'boss' && near(trackOf(c, 'boss').starts[0][1], bp), 'the boss bed resumes there');
  setMusicMode('run'); c.currentTime = 206; AUDIO_TEST.scheduleAhead();
  assert.strictEqual(m().cur, 'run_wilds');
  assert.ok(!('boss' in m().positions), 'leaving the fight forgets the boss place');
  stopMusic();
  // Background play: the boss dies while the tab is hidden.
  c.currentTime = 300;
  startMusic(); setMusicMode('boss');
  assert.strictEqual(m().cur, 'boss');
  c.currentTime = 302;
  stopMusic(); setHiddenMute(true);
  setMusicMode('run');
  c.currentTime = 322;
  const nb = tracksOf(c, 'boss').length;
  setHiddenMute(false); startMusic();
  assert.strictEqual(m().cur, 'run_wilds', 'shown after the boss died: the run track');
  assert.strictEqual(tracksOf(c, 'boss').length, nb, 'the dead boss\'s bed is not resumed');
  stopMusic();
  ok('hidden tab: sources stop, positions are kept, show resumes there');
}

// ---------- failures fall back: synth for a run, silence for the title ----------
{
  const { c, fe, m } = setup();
  fe.fail.add('run_wilds');
  c.failDecode.add('title');
  setMusicContext({ scene: 'title', stage: 'VERDANT_HOLLOW' });
  await fe.serveAll();
  assert.ok(m().failed.includes('title') && m().failed.includes('run_wilds'));
  assert.strictEqual(m().cur, null, 'title failed: silence, as before');
  const n0 = fe.log.length;
  setMusicContext({ scene: 'title', stage: 'VERDANT_HOLLOW' });
  await fe.serveAll();
  assert.strictEqual(fe.log.filter((s) => s === 'title').length, 1, 'no retry loop');
  assert.strictEqual(fe.log.length, n0, 'nothing is fetched again');
  assert.deepStrictEqual(fe.log, ['title', 'run_wilds', 'boss', 'victory', 'gameover', 'portal']);
  setMusicContext(ctxRun());
  const before = c.notes.length;
  startMusic();
  tick(c, 0.025);
  assert.strictEqual(m().cur, 'synth', 'run track failed: the synth');
  assert.ok(c.notes.length > before, 'and the synth sounds');
  assert.strictEqual(AUDIO_TEST.synthLevel(c.currentTime + 0.1), 1, 'at full level');
  stopMusic();
  ok('fetch / decode failure: the run falls back to the synth, the title to silence, no retry');
}

// ---------- a track that finishes loading while the synth plays: swap on its bar line ----------
{
  const { c, fe, m } = setup();
  setMusicContext(ctxRun());
  startMusic();                       // nothing decoded yet: the synth plays
  assert.strictEqual(m().cur, 'synth');
  for (let i = 0; i < 8; i++) tick(c, 0.025);
  await fe.serveOne();                // run_wilds lands
  assert.strictEqual(m().cur, 'run_wilds');
  const env = m().synthEnv;
  const r = trackOf(c, 'run_wilds');
  const T = r.starts[0][0];
  const STEP = 60 / 132 / 4;
  const steps = (T - 0.05) / STEP;
  assert.ok(near(steps % 16, 0, 1e-6) || near(steps % 16, 16, 1e-6), 'the track starts on the synth\'s bar line');
  assert.ok(near(env.t0, T) && near(env.t1, T + 16 * STEP) && env.to === 0, 'the synth fades out over that bar');
  for (let i = 0; i < 200; i++) tick(c, 0.025);
  const after = c.notes.filter((n) => n.at > env.t1 + 1e-9).length;
  assert.strictEqual(after, 0, 'no synth steps after the crossfade');
  stopMusic();
  ok('synth -> recorded on the synth\'s next bar line with a one-bar crossfade');
}

// ---------- CLASSIC SYNTH equals today ----------
{
  const fmt = (x) => (typeof x === 'number' ? +x.toFixed(6) : x);
  const count = (s) => {
    const { c } = s;
    setMusicContext(ctxRun());
    startMusic();
    for (let i = 0; i < 80; i++) tick(c, 0.025);
    setMusicMode('boss');
    for (let i = 0; i < 80; i++) tick(c, 0.025);
    stopMusic();
    setMusicMode('run');
    return {
      notes: c.notes.map((n) => n.type + '@' + n.at.toFixed(6)).join(','),
      gains: c.gains.map((g) => JSON.stringify((g.gain.events || []).map((e) => e.map(fmt)))),
      // Each voice's peak: tone() ramps (exp) to its gain, noise() sets it.
      peaks: [...new Set(c.gains.flatMap((g) => (g.gain.events || []).filter((e) => e[0] !== 'cancel' && e[1] > 0.01).map((e) => fmt(e[1]))))].sort((a, b) => a - b),
    };
  };
  const today = count(setup({ decode: false }));
  const s = setup({ src: 'synth' });
  const classic = count(s);
  assert.strictEqual(classic.notes, today.notes, 'CLASSIC SYNTH schedules exactly today\'s notes');
  assert.deepStrictEqual(classic.gains, today.gains, 'with exactly today\'s gain automation');
  // The synth's voice levels as they always were (run: bass 0.35, lead 0.3,
  // hats 0.08; boss: bass 0.36, lead 0.2, hats 0.09, kick 0.4).
  assert.deepStrictEqual(today.peaks, [0.08, 0.09, 0.2, 0.3, 0.35, 0.36, 0.4], 'the synth voice levels are unchanged');
  assert.strictEqual(s.fe.log.length, 0, 'and fetches nothing');
  assert.strictEqual(s.c.tracks.length, 0);
  setMusicContext({ scene: 'title' });
  assert.strictEqual(s.m().cur, null, 'no title music with the classic synth (as before)');
  // A live switch from recorded to synth: the next bar, one bar.
  const r = setup();
  setMusicContext(ctxRun());
  await r.fe.serveAll();
  startMusic();
  r.c.currentTime = 3.3;
  setMusicSource('synth');
  assert.strictEqual(r.m().cur, 'synth');
  const env = r.m().synthEnv;
  const w = trackOf(r.c, 'run_wilds');
  const bars = (env.t0 - w.starts[0][0]) / 2;
  assert.ok(near(bars, Math.round(bars), 1e-6) && near(env.t1 - env.t0, 2) && env.to === 1, 'synth fades in over the track\'s next bar');
  assert.ok(w.dest.gain.events.some((e) => e[0] === 'lin' && e[1] === 0 && near(e[2], env.t1)), 'the recorded bed fades out over that bar');
  while (r.c.currentTime < env.t1) tick(r.c, 0.025);
  assert.ok(w.stops.length && w.stops[0] >= env.t1, 'and is stopped after its fade');
  stopMusic();
  ok('CLASSIC SYNTH is today\'s note stream, fetches nothing; a live switch crossfades on the bar');
}

// ---------- music switched off; reset leaves nothing ----------
{
  const { c, fe, m } = setup();
  setMusicContext({ scene: 'title' });
  await fe.serveAll();
  assert.strictEqual(m().cur, 'title');
  setMusicEnabled(false);
  assert.strictEqual(m().cur, null, 'music off: the title bed stops');
  assert.strictEqual(playMusicCue('victory'), false, 'and cues are silent');
  setMusicEnabled(true);
  assert.strictEqual(m().cur, 'title');
  // A title bed and a cue playing, and a load in flight (it lands after reset
  // and must be ignored).
  assert.ok(playMusicCue('victory'));
  setMusicContext({ scene: 'title', stage: 'VOID_REACH' });
  assert.strictEqual(fe.pending.length, 1, 'run_void is loading');
  const playing = live(c).map((s) => s.buffer.slot).sort();
  assert.deepStrictEqual(playing, ['title', 'victory']);
  AUDIO_TEST.reset();
  assert.strictEqual(AUDIO_TEST.music(), null, 'reset drops the engine');
  assert.strictEqual(AUDIO_TEST.state().musicRunning, false);
  assert.deepStrictEqual(live(c), [], 'every recorded source was stopped');
  await fe.serveAll();
  assert.strictEqual(AUDIO_TEST.music(), null, 'a late load does not revive it');
  const timers = process.getActiveResourcesInfo().filter((r) => r === 'Timeout');
  assert.strictEqual(timers.length, 0, 'no timers left');
  ok('music off stops the title bed; reset drops buffers, loads, sources and timers');
}

// ---------- the old callback-only decodeAudioData; params without ramps ----------
{
  const { c, fe, m } = setup({ decode: 'callback' });
  c.failDecode.add('run_wilds');
  setMusicContext({ scene: 'title', stage: 'VERDANT_HOLLOW' });
  await fe.serveAll();
  assert.strictEqual(m().cur, 'title', 'a callback-only decode loads the title');
  assert.ok(m().failed.includes('run_wilds'), 'and its error callback marks the slot failed');
  // Exponential ramps only (no linear ramp, no cancel): crossfades set values.
  const e = setup({ params: 'expOnly' });
  setMusicContext({ scene: 'title' });
  await e.fe.serveAll();
  e.c.currentTime = 4;
  setMusicContext(ctxRun()); startMusic();
  assert.strictEqual(e.m().cur, 'run_wilds');
  const rg = trackOf(e.c, 'run_wilds').dest.gain;
  assert.ok(rg.events.some((x) => x[0] === 'set' && near(x[1], dbToGain(TRIM)) && near(x[2], 5.05)), 'the run bed is set to its level at the end of the crossfade');
  assert.ok(trackOf(e.c, 'title').dest.gain.events.some((x) => x[0] === 'set' && x[1] === 0 && near(x[2], 5.05)), 'the title to 0');
  e.c.currentTime = 6; setMusicContext(ctxRun({ scene: 'pause' }));
  assert.ok(AUDIO_TEST.state().musicDuck.gain.events.some((x) => x[0] === 'set' && near(x[1], dbToGain(-8))), 'the duck too');
  stopMusic();
  // Nothing but .value: the title bed still plays at its level.
  const v = setup({ params: 'value' });
  setMusicContext({ scene: 'title' });
  await v.fe.serveAll();
  assert.strictEqual(v.m().cur, 'title');
  assert.ok(near(trackOf(v.c, 'title').dest.gain.value, dbToGain(TRIM)), 'value-only param: set to the level');
  ok('decode: the callback-only form; AudioParams without ramps (or without any method) still work');
}

// ---------- the shipped manifest: seams and files ----------
{
  const slots = Object.keys(MUSIC_TRACKS);
  assert.ok(Number.isFinite(MUSIC_TRIM_DB));
  for (const s of slots) {
    assert.ok(LOOP_SLOTS.includes(s) || CUE_SLOTS.includes(s), 'known slot ' + s);
    const t = MUSIC_TRACKS[s];
    assert.strictEqual(t.kind, LOOP_SLOTS.includes(s) ? 'loop' : 'cue', s + ' kind');
    const f = path.join(ROOT, t.url);
    assert.ok(fs.existsSync(f), s + ': ' + t.url + ' is shipped');
    const h = crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 8);
    assert.ok(t.url === 'assets/music/' + s + '.' + h + '.mp3', s + ': the name carries the file\'s hash');
    assert.ok(Number.isFinite(t.gain) && t.gain > 0, s + ' gain');
    if (t.kind === 'loop') {
      assert.ok(t.loopEnd > t.loopStart && t.loopStart >= 0.4, s + ': loopEnd > loopStart >= 0.4');
      const beat = 60 / t.bpm;
      const beats = (t.loopEnd - t.loopStart) / beat;
      const errMs = Math.abs(beats - Math.round(beats)) * beat * 1000;
      assert.ok(errMs <= 1, s + ': a whole number of beats (' + beats.toFixed(4) + ', off by ' + errMs.toFixed(3) + ' ms)');
      assert.ok(t.seconds >= t.loopEnd, s + ': the file holds the loop');
    }
  }
  const credits = fs.readFileSync(path.join(ROOT, 'assets/music/CREDITS.md'), 'utf8');
  for (const s of slots) assert.ok(credits.includes(MUSIC_TRACKS[s].url.replace('assets/music/', '')), s + ' is credited');
  ok('manifest: ' + slots.length + ' slot(s), loop seams whole beats, files hashed, shipped and credited');
}

AUDIO_TEST.reset();
console.log('test_music_files: ' + passed + ' checks passed');
