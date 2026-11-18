// HORDES — the R1 mix pass (src/audio.js MIX), the empty-chest sound and the
// tab-return rule for the music.
//   - the soft limiter's curve: straight below the knee, never over the
//     ceiling, odd and rising; the WaveShaper curve is that function;
//   - the new mix wires master -> limiter -> speakers, the old one straight;
//     the choice persists under its own key and never touches a volume;
//   - the per-play variation stays inside its stated range, the gem keeps its
//     pitch (the combo climb), and the old mix never varies;
//   - an empty chest plays a different sound from the reward (a paid chest
//     that gave nothing, and a lost field gamble), through the real game;
//   - coming back to the tab, the synth song carries on where it stopped; a
//     new run starts it from the top.
// Run: node test/test_audio_mix.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as audio from '../src/audio.js';
import { boot, suite } from './_harness.mjs';
import { CHESTS, tickChests } from '../src/chests.js';
import { makePlayer } from '../src/entities.js';

const { AUDIO_TEST, MIX, SFX, softClip, limiterCurve, variation } = audio;
const S = suite('test_audio_mix');

// ---- a fake AudioContext that records the graph and every voice ----------
class Param {
  constructor(v = 0) { this.value = v; this.sets = []; }
  setValueAtTime(v, t) { this.sets.push([v, t]); this.value = v; return this; }
  exponentialRampToValueAtTime(v, t) { this.sets.push([v, t]); return this; }
  linearRampToValueAtTime(v, t) { this.sets.push([v, t]); return this; }
}
class Node {
  constructor(c, kind) { this.c = c; this.kind = kind; this.out = []; this.gain = new Param(1); }
  connect(d) { this.out.push(d); return d; }
  disconnect() { this.out = []; }
}
class Ctx {
  constructor(opts = {}) {
    this.currentTime = 0; this.state = 'running'; this.sampleRate = 44100;
    this.destination = new Node(this, 'dest'); this.voices = []; this.shapers = [];
    if (opts.shaper !== false) {
      this.createWaveShaper = () => { const n = new Node(this, 'shaper'); this.shapers.push(n); return n; };
    }
  }
  createGain() { const g = new Node(this, 'gain'); (this.gains = this.gains || []).push(g); return g; }
  createBiquadFilter() { const n = new Node(this, 'filter'); n.frequency = new Param(); n.Q = new Param(); return n; }
  createOscillator() {
    const o = new Node(this, 'osc'); o.frequency = new Param(440);
    o.start = (t) => this.voices.push({ kind: o.type, t, f: o.frequency.sets[0][0], to: o.frequency.sets[1] ? o.frequency.sets[1][0] : null });
    o.stop = () => {};
    return o;
  }
  createBufferSource() { const n = new Node(this, 'noise'); n.start = (t) => this.voices.push({ kind: 'noise', t }); n.stop = () => {}; return n; }
  createBuffer() { return { getChannelData: () => new Float32Array(64) }; }
  resume() { return Promise.resolve(); }
}
const store = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };
const setup = (opts = {}) => {
  const ctx = new Ctx(opts);
  const st = opts.st || store();
  AUDIO_TEST.setDeps({ AudioContext: function () { return ctx; }, storage: st, rng: opts.rng === undefined ? null : opts.rng });
  AUDIO_TEST.reset();
  audio.init();
  return { ctx, st };
};

// ---- the limiter ---------------------------------------------------------
S.check('the soft limiter is straight below the knee and never goes over the ceiling', () => {
  const { knee, ceil } = MIX.limiter;
  assert.ok(knee > 0 && knee < ceil && ceil < 1, 'knee < ceiling < full scale');
  for (let x = -knee; x <= knee; x += knee / 50) assert.equal(softClip(x), x, 'untouched at ' + x);
  let prev = -Infinity;
  for (let i = -4000; i <= 4000; i++) {
    const x = i / 100;   // -40 .. +40 (+32 dBFS)
    const y = softClip(x);
    assert.ok(Math.abs(y) <= ceil, 'never over the ceiling at ' + x + ': ' + y);
    assert.ok(y >= prev, 'rising at ' + x);
    assert.equal(softClip(-x), -y, 'odd at ' + x);
    prev = y;
  }
  assert.ok(Math.abs(softClip(1e9)) <= ceil, 'any input stays at or under');
  // Smooth: no jump in slope at the knee.
  const d = 1e-6;
  const slope = (softClip(knee + d) - softClip(knee)) / d;
  assert.ok(Math.abs(slope - 1) < 1e-3, 'slope 1 at the knee: ' + slope);
});

S.check('the WaveShaper curve is the limiter over +-range, with an exact 0 in the middle', () => {
  const { range, points, ceil } = MIX.limiter;
  const c = limiterCurve();
  assert.equal(c.length, points);
  assert.equal(points % 2, 1, 'odd point count');
  assert.equal(c[(points - 1) / 2], 0, 'silence maps to silence');
  for (let i = 0; i < points; i += 97) {
    const x = range * ((2 * i) / (points - 1) - 1);
    assert.ok(Math.abs(c[i] - softClip(x)) < 1e-6, 'point ' + i);
  }
  assert.ok(Math.abs(c[0]) <= ceil && Math.abs(c[points - 1]) <= ceil, 'the ends hold under the ceiling');
});

S.check('the limiter leaves a busy fight alone and only bends real pile-ups (knee and ceiling pinned)', () => {
  const { knee, ceil } = MIX.limiter;
  // The values the mix was measured with: knee -6 dBFS, ceiling -1 dBFS.
  assert.ok(Math.abs(20 * Math.log10(knee) - -6) < 0.1, 'knee at -6 dBFS: ' + knee);
  assert.ok(Math.abs(20 * Math.log10(ceil) - -1) < 0.1, 'ceiling at -1 dBFS: ' + ceil);
  // The minute-10 busy fight peaked at -11.9 dBFS in the new mix (real
  // Chrome, tools/measure_sfx_mix.mjs). With 3 dB to spare it must still pass
  // the limiter untouched: a lower knee would squash every ordinary fight.
  const busy = Math.pow(10, (-11.9 + 3) / 20);
  assert.equal(softClip(busy), busy, 'a busy fight peak passes untouched');
  assert.equal(softClip(-busy), -busy);
  // A pile-up 12 dB over full scale is held at the ceiling, not let through.
  assert.ok(softClip(4) > ceil - 0.01 && softClip(4) <= ceil, 'a pile-up is held near the ceiling');
});

S.check('the new mix wires master -> 1/range gain -> limiter -> speakers; the old one goes straight', () => {
  const { ctx, st } = setup();
  const s = AUDIO_TEST.state();
  const lim = AUDIO_TEST.limiter();
  assert.equal(audio.getMixMode(), 'new', 'a fresh profile has the new mix');
  assert.ok(lim.node && lim.in, 'the limiter exists');
  assert.deepEqual(s.master.out, [lim.in]);
  assert.ok(Math.abs(lim.in.gain.value - 1 / MIX.limiter.range) < 1e-12);
  assert.deepEqual(lim.in.out, [lim.node]);
  assert.deepEqual(lim.node.out, [ctx.destination]);
  assert.equal(lim.node.curve.length, MIX.limiter.points);
  assert.ok(Math.abs(s.master.gain.value - MIX.master.new) < 1e-12);
  assert.ok(MIX.master.new > MIX.master.old, 'the new mix is louder');
  const vols = [st.getItem('hordes_audio_music_vol'), st.getItem('hordes_audio_sfx_vol')];
  audio.setMixMode('old');
  assert.equal(st.getItem('hordes_audio_mix'), 'old', 'the choice is saved');
  assert.deepEqual(s.master.out, [ctx.destination], 'old: straight to the speakers');
  assert.equal(s.master.gain.value, 0.15, 'old: the shipped master level');
  assert.deepEqual([st.getItem('hordes_audio_music_vol'), st.getItem('hordes_audio_sfx_vol')], vols, 'no volume touched');
  // A reload keeps the old mix.
  const again = setup({ st });
  assert.equal(audio.getMixMode(), 'old');
  assert.deepEqual(AUDIO_TEST.state().master.out, [again.ctx.destination]);
  assert.equal(again.ctx.shapers.length, 0, 'old mix: no limiter built');
  audio.setMixMode('new');
  audio.setMixMode('old'); audio.setMixMode('new');
  assert.deepEqual([ctx.shapers.length, again.ctx.shapers.length], [1, 1], 'one limiter per context, built when first needed');
  // A context without WaveShaper plays the new mix without a limiter, no throw.
  const bare = setup({ shaper: false });
  assert.deepEqual(AUDIO_TEST.state().master.out, [bare.ctx.destination]);
  assert.equal(audio.playSfx('kill'), true);
});

// ---- variation -----------------------------------------------------------
S.check('the variation per play never leaves its stated range', () => {
  const names = Object.keys(MIX.vary);
  assert.ok(names.includes('hit') && names.includes('kill') && names.includes('gem'), 'the busiest sounds vary');
  for (const n of names) {
    const { semis, db } = MIX.vary[n];
    assert.ok(semis >= 0 && semis <= 1.5 && db >= 0 && db <= 4, n + ' range is small');
    const lo = Math.pow(2, -semis / 12), hi = Math.pow(2, semis / 12), gLo = Math.pow(10, -db / 20);
    for (const r1 of [0, 1e-9, 0.25, 0.5, 0.75, 0.999999999]) {
      for (const r2 of [0, 0.5, 0.999999999]) {
        const v = variation(n, r1, r2);
        assert.ok(v.rate >= lo - 1e-12 && v.rate <= hi + 1e-12, n + ' rate ' + v.rate);
        assert.ok(v.gain >= gLo - 1e-12 && v.gain <= 1, n + ' gain ' + v.gain);
      }
    }
  }
  assert.deepEqual(variation('levelup', 0.9, 0.9), { rate: 1, gain: 1 }, 'a sound that does not vary');
  assert.equal(MIX.vary.gem.semis, 0, 'the gem keeps its pitch (the combo climb)');
});

S.check('in play: kills vary inside the range, the gem climb is exact, the old mix never varies', () => {
  let x = 0;
  const rng = () => { x = (x * 9301 + 49297) % 233280; return x / 233280; };
  const { ctx } = setup({ rng });
  const base = SFX.kill.layers[0].freq;
  const { semis } = MIX.vary.kill;
  const fs = new Set();
  for (let i = 0; i < 200; i++) {
    ctx.currentTime += 1;
    const n0 = ctx.voices.length;
    audio.playSfx('kill');
    const f = ctx.voices.slice(n0).find(v => v.kind === 'triangle').f;
    assert.ok(f >= base * Math.pow(2, -semis / 12) - 1e-9 && f <= base * Math.pow(2, semis / 12) + 1e-9, 'kill pitch ' + f);
    fs.add(f.toFixed(4));
  }
  assert.ok(fs.size > 50, 'the kill sound is not one sample: ' + fs.size + ' pitches');
  const gemF = (step) => { ctx.currentTime += 1; const n0 = ctx.voices.length; audio.playSfx('gem', step); return ctx.voices[n0].f; };
  for (let k = 0; k < 12; k++) assert.ok(Math.abs(gemF(k + 1) / gemF(k) - Math.pow(2, 1 / 6)) < 1e-9, 'gem step ' + k);
  audio.setMixMode('old');
  for (let i = 0; i < 20; i++) {
    ctx.currentTime += 1;
    const n0 = ctx.voices.length;
    audio.playSfx('kill');
    assert.equal(ctx.voices[n0].f, base, 'old mix: the shipped pitch');
  }
});

S.check('the new hit is softer: a low-passed burst with a body thump; the old hit is the raw burst', () => {
  const { ctx } = setup();
  audio.playSfx('hit');
  assert.ok(ctx.voices.some(v => v.kind === 'noise') && ctx.voices.some(v => v.kind === 'triangle'));
  audio.setMixMode('old');
  ctx.currentTime += 1;
  const n0 = ctx.voices.length;
  audio.playSfx('hit');
  assert.deepEqual(ctx.voices.slice(n0).map(v => v.kind), ['noise']);
});

S.check('the movie roars are trimmed in the new mix, untouched in the old', () => {
  // -7 dB: at -5 they were 7-8 dB over a real starter-kit fight (R1 integration review).
  for (const k of ['portal:BOSS_YELL', 'portal:KILL', 'escape:ROAR']) assert.ok(MIX.cueDb[k] <= -7, k + ' is quieter');
  const { ctx } = setup();
  const bus = AUDIO_TEST.state().sfxBus;
  // A trim node: a fixed gain into the bus (a voice's own gain carries an envelope).
  const trimNodes = () => ctx.gains.filter(g => g.out.includes(bus) && g.gain.sets.length === 0);
  const before = ctx.voices.length;
  assert.equal(audio.playPortalCue('BOSS_YELL'), true);
  assert.ok(ctx.voices.length > before);
  let t = trimNodes();
  assert.equal(t.length, 1, 'one trim node for the cue');
  assert.ok(Math.abs(t[0].gain.value - Math.pow(10, MIX.cueDb['portal:BOSS_YELL'] / 20)) < 1e-12);
  assert.equal(audio.playEscapeCue('ROAR'), true);
  t = trimNodes();
  assert.ok(Math.abs(t[1].gain.value - Math.pow(10, MIX.cueDb['escape:ROAR'] / 20)) < 1e-12);
  // The old mix: no trim node, the voices go straight to the sfx bus.
  audio.setMixMode('old');
  ctx.currentTime += 1;
  audio.playPortalCue('BOSS_YELL');
  assert.equal(trimNodes().length, 2, 'old mix: no new trim node');
});

S.check('only the listed cues get a trim; every other cue plays at its old level', () => {
  const { ctx } = setup();
  const bus = AUDIO_TEST.state().sfxBus;
  const trimNodes = () => (ctx.gains || []).filter(g => g.out.includes(bus) && g.gain.sets.length === 0);
  const cues = [
    ...Object.keys(audio.PORTAL_CUES).map(k => ['portal', k]),
    ...Object.keys(audio.ESCAPE_CUES).map(k => ['escape', k]),
    ...['OVERTAKE', 'HORDE', 'TITLE_SLAM', 'TITLE', 'FADE'].map(k => ['intro', k]),
  ];
  const listed = { ...MIX.cueDb };   // read before any cue plays
  let untrimmed = 0;
  for (const [kind, key] of cues) {
    const n0 = trimNodes().length, v0 = ctx.voices.length;
    assert.equal(AUDIO_TEST.runCue(kind, key, ctx.currentTime, 3), true, kind + ':' + key);
    assert.ok(ctx.voices.length > v0, kind + ':' + key + ' made a sound');
    const added = trimNodes().slice(n0);
    const db = listed[kind + ':' + key];
    if (db) {
      assert.equal(added.length, 1, kind + ':' + key + ' has its trim');
      assert.ok(Math.abs(added[0].gain.value - Math.pow(10, db / 20)) < 1e-12);
    } else {
      assert.equal(added.length, 0, kind + ':' + key + ' is not trimmed');
      untrimmed++;
    }
  }
  assert.ok(untrimmed >= 8, 'most cues are left as they were: ' + untrimmed);
});

S.check('in the new mix the empty chest stays quieter than the reward', () => {
  // Loudest 400 ms of each sound as written (old mix, momentary LUFS, real
  // Chrome, tools/measure_sfx_mix.mjs): the let-down is 5.3 LU over the
  // reward before its trim. The trims must turn that round by at least 1 LU.
  const OLD_LOUDEST = { chest: -53.6, chestEmpty: -48.3 };
  const t = (k) => MIX.trimDb[k] || 0;
  const reward = OLD_LOUDEST.chest + t('chest'), empty = OLD_LOUDEST.chestEmpty + t('chestEmpty');
  assert.ok(empty <= reward - 1, 'let-down ' + empty.toFixed(1) + ' vs reward ' + reward.toFixed(1));
  // And as played: every voice of the let-down starts under the reward's notes.
  const { ctx } = setup();
  const peak = (name) => {
    const g0 = ctx.gains.length;
    assert.equal(audio.playSfx(name), true);
    ctx.currentTime += 1;
    return Math.max(...ctx.gains.slice(g0).map(g => Math.max(0, ...g.gain.sets.map(s => s[0]))));
  };
  const pr = peak('chest'), pe = peak('chestEmpty');
  assert.ok(pr > 0 && pe > 0);
  assert.ok(pe < pr * 1.6, 'no let-down voice is far over the reward: ' + pe + ' vs ' + pr);
});

// ---- the empty chest -----------------------------------------------------
const tones = (def) => def.voice === 'arp' ? def.notes : def.layers.filter(l => l.v === 'tone').map(l => l.freq);
S.check('the empty chest is its own sound: low, falling, not the reward', () => {
  assert.ok(SFX.chestEmpty, 'chestEmpty exists');
  assert.notDeepEqual(SFX.chestEmpty, SFX.chest);
  const reward = tones(SFX.chest), empty = tones(SFX.chestEmpty);
  assert.ok(Math.max(...empty) < Math.min(...reward) / 2, 'an octave and more under the reward');
  for (let i = 1; i < reward.length; i++) assert.ok(reward[i] > reward[i - 1], 'the reward climbs');
  const sung = SFX.chestEmpty.layers.filter(l => l.v === 'tone' && l.at);
  assert.ok(sung.length >= 2 && sung.every(l => l.to < l.freq), 'every sung note sags');
  assert.ok(sung[sung.length - 1].freq < sung[0].freq, 'and the line falls');
  const { ctx } = setup();
  assert.equal(audio.playSfx('chestEmpty'), true);
  assert.ok(ctx.voices.length >= 3);
});

S.check('a lost field gamble marks its chestOpened event empty; a win and a band do not', () => {
  const seq = (v) => { let i = 0; return () => v[i++]; };
  const mk = () => ({ player: makePlayer(), enemies: [], chests: [], effects: [], time: 30 });
  const open = (vals) => { const st = mk(); st.chests.push({ id: 1, x: st.player.x, y: st.player.y, age: 0 });
    return tickChests(st, 0.016, seq(vals)).find(e => e.kind === 'chestOpened'); };
  assert.equal(open([0.05, 0.7]).empty, true, 'lost gamble');
  assert.equal(open([0.05, 0.3, 0.1, 0.9, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]).empty, false, 'won gamble');
  assert.equal(open([0.5, 0.0, 0.0, 0.5, 0.5, 0.5, 0.5, 0.5]).empty, false, 'a band');
});

// ---- through the real game ----------------------------------------------
const h = await boot({ storage: [['hordes_onboarded', '1']] });
const T = h.T, st = h.state;
T.banners.suppressAll();
const gameCtx = new Ctx();
AUDIO_TEST.setDeps({ AudioContext: function () { return gameCtx; }, storage: store(), rng: null });
AUDIO_TEST.reset();
audio.init();
T.startRun();
h.pump(2);

S.check('a paid chest that gives nothing plays the let-down; one with an item plays the reward', () => {
  const rnd = Math.random;
  try {
    T.getProfile().runPurse = 50000;
    Math.random = () => 0;          // under every tier's nothing chance
    T.dev.buyChest('BRONZE');
    assert.notEqual(AUDIO_TEST.sfxPlayedAt('chestEmpty'), undefined, 'the let-down played');
    assert.equal(AUDIO_TEST.sfxPlayedAt('chest'), undefined, 'the reward did not');
    gameCtx.currentTime += 1;
    Math.random = () => 0.99;       // over it: an item
    T.dev.buyChest('BRONZE');
    assert.equal(AUDIO_TEST.sfxPlayedAt('chest'), gameCtx.currentTime, 'the reward played for the item');
  } finally { Math.random = rnd; }
});

S.check('a lost gamble on the field plays the let-down, a normal chest the reward', () => {
  const keep = { c: CHESTS.GAMBLE_CHANCE, w: CHESTS.GAMBLE_WIN_CHANCE };
  try {
    CHESTS.GAMBLE_CHANCE = 1; CHESTS.GAMBLE_WIN_CHANCE = 0;
    st.mode = 'playing';   // the paid chest above left the intermission open
    st.enemies.length = 0;
    gameCtx.currentTime += 1;
    const p = st.player;
    st.chests.push({ id: 9001, x: p.x, y: p.y, age: 0 });
    h.pump(1);
    assert.equal(AUDIO_TEST.sfxPlayedAt('chestEmpty'), gameCtx.currentTime, 'the let-down played');
    assert.notEqual(AUDIO_TEST.sfxPlayedAt('chest'), gameCtx.currentTime, 'the reward did not');
    CHESTS.GAMBLE_CHANCE = 0;
    gameCtx.currentTime += 1;
    st.chests.push({ id: 9002, x: p.x, y: p.y, age: 0 });
    h.pump(1);
    assert.equal(AUDIO_TEST.sfxPlayedAt('chest'), gameCtx.currentTime, 'a normal chest: the reward');
  } finally { CHESTS.GAMBLE_CHANCE = keep.c; CHESTS.GAMBLE_WIN_CHANCE = keep.w; }
});

S.check('back on the tab, the synth song carries on where it stopped; a new run starts at the top', () => {
  audio.setMusicSource('synth');
  st.mode = 'playing';
  assert.equal(audio.isMusicRunning(), true);
  for (let i = 0; i < 40; i++) { gameCtx.currentTime += 0.1; AUDIO_TEST.scheduleAhead(); }
  const at = AUDIO_TEST.step();
  assert.ok(at > 20, 'the song moved on: step ' + at);
  globalThis.document.visibilityState = 'hidden'; T.onVisibilityChange();
  assert.equal(audio.isMusicRunning(), false);
  gameCtx.currentTime += 30;
  globalThis.document.visibilityState = 'visible'; T.onVisibilityChange();
  assert.equal(audio.isMusicRunning(), true);
  const back = AUDIO_TEST.step();
  assert.ok(back >= at && back <= at + 3, 'resumed at step ' + back + ' (stopped at ' + at + ')');
  // The plain call (a new run, the finale, the slider) still starts at bar 1.
  audio.stopMusic();
  audio.startMusic();
  assert.ok(AUDIO_TEST.step() <= 3, 'a fresh start is at the top: ' + AUDIO_TEST.step());
  audio.stopMusic();
  audio.setMusicSource('recorded');
});

const moveSongOn = () => {
  for (let i = 0; i < 40; i++) { gameCtx.currentTime += 0.1; AUDIO_TEST.scheduleAhead(); }
  const at = AUDIO_TEST.step();
  assert.ok(at > 20, 'the song moved on: step ' + at);
};

S.check('a new run through the game starts the song at the top', () => {
  audio.setMusicSource('synth');
  audio.startMusic();
  moveSongOn();
  audio.stopMusic();          // what every end of a run does
  T.startRun();
  h.pump(1);
  assert.equal(audio.isMusicRunning(), true);
  assert.ok(AUDIO_TEST.step() <= 3, 'the new run is at the top: ' + AUDIO_TEST.step());
  audio.stopMusic();
  audio.setMusicSource('recorded');
});

S.check('a new run that starts while the tab is hidden is at the top when the player comes back', () => {
  audio.setMusicSource('synth');
  st.mode = 'playing';
  audio.startMusic();
  moveSongOn();
  globalThis.document.visibilityState = 'hidden'; T.onVisibilityChange();
  assert.equal(audio.isMusicRunning(), false);
  T.startRun();               // auto-continue or play in the background
  h.pump(1);
  assert.equal(audio.isMusicRunning(), false, 'a hidden tab stays silent');
  gameCtx.currentTime += 30;
  globalThis.document.visibilityState = 'visible'; T.onVisibilityChange();
  assert.equal(audio.isMusicRunning(), true);
  assert.ok(AUDIO_TEST.step() <= 3, 'the new run is at the top: ' + AUDIO_TEST.step());
  audio.stopMusic();
  audio.setMusicSource('recorded');
});

S.check('a plain start held back by the hidden tab still resets the song and the boss section', () => {
  audio.setMusicSource('synth');
  audio.startMusic();
  moveSongOn();
  audio.setMusicMode('boss');
  for (let i = 0; i < 40; i++) { gameCtx.currentTime += 0.1; AUDIO_TEST.scheduleAhead(); }
  assert.ok(AUDIO_TEST.bossStep() > 20, 'the boss section moved on: ' + AUDIO_TEST.bossStep());
  audio.stopMusic();
  audio.setMusicMode('run');   // leaving the boss keeps bossStep; only a start resets it
  assert.ok(AUDIO_TEST.bossStep() > 20);
  audio.setHiddenMute(true);
  assert.equal(audio.startMusic(), false, 'held back while hidden');
  audio.setHiddenMute(false);
  assert.equal(audio.startMusic({ resume: true }), true);
  assert.ok(AUDIO_TEST.step() <= 3, 'the song is at the top: ' + AUDIO_TEST.step());
  assert.equal(AUDIO_TEST.bossStep(), 0, 'the boss section is at the top');
  // A resume with no fresh start waiting keeps its place.
  moveSongOn();
  const at = AUDIO_TEST.step();
  audio.stopMusic();
  audio.startMusic({ resume: true });
  assert.ok(AUDIO_TEST.step() >= at && AUDIO_TEST.step() <= at + 3, 'resumed at ' + AUDIO_TEST.step());
  audio.stopMusic();
  audio.setMusicSource('recorded');
});

// The listening page must load on the test build. Its server serves tools/, docs/ and test/
// as 404 and sends .mjs as a download (application/octet-stream), which a browser refuses
// as a module. So the page and what it imports live in listen/ and src/, as .js files.
S.check('the listening page: in listen/, importing only .js files from served folders', () => {
  const root = new URL('../', import.meta.url);
  const names = fs.readdirSync(new URL('listen/', root));
  assert.ok(names.includes('index.html'), 'listen/index.html exists');
  assert.deepEqual(names.filter((n) => /\.mjs$/.test(n)), [], 'no .mjs in listen/');
  const html = fs.readFileSync(new URL('listen/index.html', root), 'utf8');
  const imports = [...html.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)|from\s+['"]([^'"]+)['"]|src=["']([^"']+)["']/g)].map((m) => m[1] || m[2] || m[3]);
  assert.ok(imports.length >= 2, 'the page imports its modules: ' + imports.join(', '));
  for (const u of imports) {
    assert.ok(/^\.\/(src|listen|assets)\//.test(u), u + ' is in a folder the test build serves');
    assert.ok(/\.js$/.test(u), u + ' is a .js file');
    assert.ok(fs.existsSync(new URL(u.replace(/^\.\//, ''), root)), u + ' exists');
  }
  assert.ok(/<base href="\.\.\/">/.test(html), 'paths resolve from the game root');
});

AUDIO_TEST.reset();   // drop the fake so nothing keeps a timer
S.done();
