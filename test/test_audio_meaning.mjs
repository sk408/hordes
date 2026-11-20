// HORDES — R4 "sounds that mean something" (src/audio.js, src/fx/feel.js,
// main.js syncHeartbeat and updateRunHand).
//   - the hand stinger: the same rank always sounds the same; a higher rank has
//     more notes, a wider span and a longer tail at the same note level; it
//     plays when a pick makes a better hand and never when the hand did not
//     improve;
//   - the crit ping fires on a crit and only then, at most one per step, and
//     audio.js holds it to one per 0.15 s; it sits under the hit;
//   - the elite growl fires when an elite first appears (not a boss, not a
//     plain enemy), at most once in 4 s, and under the boss's arrival;
//   - the coin fires when run gold goes up, its streak climbs and wraps, and
//     it is rate-limited; the gold-bank cue plays on the end card (R5);
//   - the heartbeat starts under 25% health in a watched fight, quickens as
//     health falls, never stacks, and stops at once on a heal, on death, in a
//     movie, a menu, a draft, a pause, a held sim, a hidden tab, an
//     unattended run and with the sound off;
//   - none of the new cues draws a random number (the run's random sequence
//     cannot move), and a hidden tab plays none of them;
//   - the listening page lists them in a group of their own.
// Run: node test/test_audio_meaning.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as audio from '../src/audio.js';
import { boot, suite } from './_harness.mjs';
import { feelStep, feelOf, markCrit, setFeelAudio, FEEL } from '../src/fx/feel.js';
import { addHandCard, HAND_BY_ID } from '../src/hands.js';
import { GROUPS, itemKey } from '../listen/sfx_scenes.js';

const { AUDIO_TEST, MIX, SFX, HIT_SOFT, handCue, HEARTBEAT, heartbeatPeriod } = audio;
const S = suite('test_audio_meaning');

// ---- a fake AudioContext that records every voice -------------------------
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
  constructor() {
    this.currentTime = 0; this.state = 'running'; this.sampleRate = 44100;
    this.destination = new Node(this, 'dest'); this.voices = [];
    this.createWaveShaper = () => new Node(this, 'shaper');
  }
  createGain() { return new Node(this, 'gain'); }
  createBiquadFilter() { const n = new Node(this, 'filter'); n.frequency = new Param(); n.Q = new Param(); return n; }
  createOscillator() {
    const o = new Node(this, 'osc'); o.frequency = new Param(440);
    o.start = (t) => this.voices.push({ kind: o.type, t, f: o.frequency.sets[0][0], dest: o.out[0] && o.out[0].out[0] });
    o.stop = () => {};
    return o;
  }
  createBufferSource() { const n = new Node(this, 'noise'); n.start = (t) => this.voices.push({ kind: 'noise', t }); n.stop = () => {}; return n; }
  createBuffer() { return { getChannelData: () => new Float32Array(64) }; }
  resume() { return Promise.resolve(); }
}
const store = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const setup = (rng = null) => {
  const ctx = new Ctx();
  AUDIO_TEST.setDeps({ AudioContext: function () { return ctx; }, storage: store(), rng });
  AUDIO_TEST.reset();
  audio.init();
  return ctx;
};
const NEW_CUES = ['crit', 'eliteArrive', 'coin', 'goldBank', 'hand'];

// ---- the hand stinger -------------------------------------------------------
const notesOf = (k) => handCue(k).filter(l => l.part === 'note');
const endOf = (k) => Math.max(...handCue(k).map(l => (l.at || 0) + l.dur));
const spanOf = (k) => { const f = notesOf(k).map(l => l.freq); return Math.log2(Math.max(...f) / Math.min(...f)); };

S.check('the hand stinger: a Pair is a two-note lift, and every rank is bigger than the one below', () => {
  const pair = notesOf(HAND_BY_ID.pair.order);
  assert.equal(pair.length, 2, 'a Pair is two notes');
  assert.ok(pair[1].freq > pair[0].freq && pair[1].at > pair[0].at, 'and they lift');
  for (let k = 2; k <= 8; k++) {
    assert.ok(notesOf(k).length > notesOf(k - 1).length, 'rank ' + k + ' has more notes');
    assert.ok(spanOf(k) >= spanOf(k - 1), 'rank ' + k + ' is at least as wide');
    assert.ok(endOf(k) > endOf(k - 1), 'rank ' + k + ' lasts longer');
    assert.ok(handCue(k).length > handCue(k - 1).length, 'rank ' + k + ' has more voices');
  }
  assert.ok(spanOf(8) >= spanOf(1) + 1.5, 'a Straight Flush spans far wider than a Pair');
  assert.equal(HAND_BY_ID.straightflush.order, 8, 'the Straight Flush is the top rank');
  // Bigger, not just louder: the loudest single voice is the same at every rank.
  const top = (k) => Math.max(...handCue(k).map(l => l.gain));
  for (let k = 2; k <= 8; k++) assert.equal(top(k), top(1), 'rank ' + k + ' has no louder voice');
  // Every rank starts with a count-up of rising ticks, more for a higher hand.
  for (let k = 1; k <= 8; k++) {
    const ticks = handCue(k).filter(l => l.part === 'count');
    assert.ok(ticks.length >= 2, 'a count-up');
    for (let i = 1; i < ticks.length; i++) assert.ok(ticks[i].freq > ticks[i - 1].freq && ticks[i].at > ticks[i - 1].at);
    assert.ok(Math.max(...ticks.map(l => l.at)) < Math.min(...notesOf(k).map(l => l.at)), 'the count comes before the stinger');
  }
});

S.check('the same rank always sounds the same, whatever the random source', () => {
  for (let k = 1; k <= 8; k++) assert.deepEqual(handCue(k), handCue(k));
  const play = (r) => {
    const ctx = setup(r);
    audio.playSfx('hand', 5);
    return ctx.voices.map(v => [v.kind, v.t, v.f]);
  };
  assert.deepEqual(play(() => 0), play(() => 0.999), 'no variation on the hand');
  const ctx = setup();
  audio.playSfx('hand', 3);
  assert.equal(ctx.voices.length, handCue(3).length, 'the game plays exactly the cue');
});

S.check('none of the new cues draws a random number', () => {
  let draws = 0;
  setup(() => { draws++; return 0.5; });
  const ctx = AUDIO_TEST.state().ctx;
  for (const n of NEW_CUES) { ctx.currentTime += 5; assert.equal(audio.playSfx(n, 3), true, n + ' plays'); }
  ctx.currentTime += 5;
  for (let i = 0; i < 30; i++) { audio.setHeartbeat(0.1); ctx.currentTime += 0.1; }
  assert.equal(draws, 0, 'no draws');
  // No noise voice either: the noise buffer is filled from Math.random.
  assert.deepEqual(ctx.voices.filter(v => v.kind === 'noise'), [], 'no noise voice');
  for (const n of NEW_CUES) {
    assert.ok(MIX.trimDb[n] !== undefined, n + ' has a trim in MIX');
    assert.equal(MIX.vary[n], undefined, n + ' does not vary');
  }
  assert.ok(MIX.trimDb.heartbeat !== undefined, 'the heartbeat has a trim in MIX');
});

S.check('a hidden tab plays none of the new cues and no heartbeat', () => {
  const ctx = setup();
  audio.setHiddenMute(true);
  for (const n of NEW_CUES) assert.equal(audio.playSfx(n, 1), false, n + ' is silent');
  assert.equal(audio.setHeartbeat(0.1), false);
  assert.equal(ctx.voices.length, 0);
  audio.setHiddenMute(false);
  assert.equal(audio.playSfx('crit'), true);
});

// ---- crit, elite, coin: the rate limits and levels -------------------------
const loudest = (def, name) => Math.max(...def.layers.map(l => l.gain)) * Math.pow(10, (MIX.trimDb[name] || 0) / 20);
S.check('the crit ping is held to one per 0.15 s, and sits under the hit', () => {
  const ctx = setup();
  let played = 0;
  for (let i = 0; i < 120; i++) { if (audio.playSfx('crit')) played++; ctx.currentTime += 1 / 60; }   // a crit every frame for 2 s
  assert.ok(played <= Math.ceil(2 / 0.15) + 1 && played >= 10, 'about 7 a second: ' + played);
  ctx.currentTime += 1;
  assert.equal(audio.playSfx('crit'), true);
  assert.equal(audio.playSfx('crit'), false, 'a second ping on the same instant is held');
  assert.ok(loudest(SFX.crit, 'crit') < loudest(HIT_SOFT, 'hit') / 2, 'the ping is under the (new) hit');
  assert.ok(SFX.crit.layers.every(l => l.dur <= 0.06), 'short');
  assert.ok(SFX.crit.layers.every(l => l.freq >= 2000), 'bright');
});

S.check('the elite growl: once in 4 s at most, low, and under the boss arrival', () => {
  const ctx = setup();
  assert.equal(audio.playSfx('eliteArrive'), true);
  ctx.currentTime += 3.9;
  assert.equal(audio.playSfx('eliteArrive'), false, 'held inside 4 s');
  ctx.currentTime += 0.2;
  assert.equal(audio.playSfx('eliteArrive'), true);
  const sum = (d, n) => d.layers.reduce((a, l) => a + l.gain, 0) * Math.pow(10, (MIX.trimDb[n] || 0) / 20);
  assert.ok(sum(SFX.eliteArrive, 'eliteArrive') < sum(SFX.bossArrive, 'bossArrive') / 2, 'quieter than the boss');
  assert.ok(SFX.eliteArrive.layers.filter(l => l.freq).every(l => l.freq < 120), 'low');
});

S.check('coins: rate-limited, the streak climbs a semitone a coin and wraps after 8', () => {
  let ctx = setup();
  assert.equal(audio.playSfx('coin', 0), true);
  ctx.currentTime += 0.1;
  assert.equal(audio.playSfx('coin', 1), false, 'held inside 0.12 s');
  const first = (step) => { ctx = setup(); audio.playSfx('coin', step); return ctx.voices[0].f; };
  const f0 = first(0);
  assert.ok(Math.abs(first(1) / f0 - Math.pow(2, 1 / 12)) < 1e-9, 'one semitone up');
  assert.ok(Math.abs(first(7) / f0 - Math.pow(2, 7 / 12)) < 1e-9);
  assert.equal(first(8), f0, 'the climb starts again');
});

S.check('the gold-bank cue exists and only the end card plays it (R5)', () => {
  const ctx = setup();
  assert.equal(audio.playSfx('goldBank'), true);
  assert.ok(ctx.voices.length >= 7, 'a run of clinks and a bell');
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(d + e.name + '/') : [d + e.name]);
  const users = walk(new URL('../src/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
    .filter(f => f.endsWith('.js') && !f.endsWith('audio.js') && fs.readFileSync(f, 'utf8').includes("'goldBank'"));
  assert.deepEqual(users.map(f => f.replace(/^.*[\/]src[\/]/, '')), ['main.js'], 'one call site: the end card count');
  assert.equal(fs.readFileSync(users[0], 'utf8').split("'goldBank'").length - 1, 1, 'played in one place');
});

S.check('the gold-bank cue can be cut short: stopSfx fades its play to silence (R5)', () => {
  const ctx = setup();
  assert.equal(audio.stopSfx('goldBank'), false, 'nothing playing: nothing to stop');
  audio.playSfx('goldBank');
  const bell = ctx.voices.find(v => v.f === 2093 && v.t > 0.3);
  assert.ok(bell, 'the bell is scheduled');
  const group = bell.dest;
  audio.playSfx('coin');
  const bus = ctx.voices[ctx.voices.length - 1].dest;
  assert.ok(group !== bus && group.out[0] === bus, 'the cue plays through a node of its own, into the sfx bus');
  ctx.currentTime = 0.1;
  assert.equal(audio.stopSfx('goldBank'), true);
  const last = group.gain.sets[group.gain.sets.length - 1];
  assert.deepEqual(last, [0, 0.1 + 0.03], 'faded to silence in 30 ms, before the bell');
  assert.equal(audio.stopSfx('goldBank'), false, 'once');
  assert.equal(audio.stopSfx('coin'), false, 'other cues are not cut');
});

// ---- the feel observer: each cue on its event and only then ----------------
const mkState = () => ({
  time: 0, mode: 'playing',
  player: { x: 0, y: 0, hp: 100, xp: 0, level: 1, stats: { maxHp: 100 }, potions: { hp: 1, mp: 1 } },
  enemies: [], effects: [], projectiles: [], chests: [], itemDrops: [],
  runCounts: { gold: { earned: 0 } },
});
const mkEnemy = (o = {}) => ({ typeId: 'CHASER', x: 40, y: 0, w: 10, h: 12, hp: 100, maxHp: 100, speed: 30, ...o });
const step = (st, dt = 1 / 60) => { st.time += dt; feelStep(st, dt); };

S.check('the observer: a crit pings, a plain hit does not; one ping per step for many crits', () => {
  const log = [];
  setFeelAudio({ playSfx: (n, a) => log.push(a === undefined ? n : n + ':' + a) });
  try {
    const st = mkState();
    const es = [mkEnemy(), mkEnemy({ x: 50 }), mkEnemy({ x: 60 })];
    st.enemies.push(...es);
    step(st);
    es[0].hp -= 5; step(st);
    assert.ok(log.includes('hit') && !log.includes('crit'), 'a plain hit: no ping');
    for (const e of es) { markCrit(st, e); e.hp -= 5; }
    step(st);
    assert.equal(log.filter(x => x === 'crit').length, 1, 'three crits on one step: one ping');
    step(st);
    assert.equal(log.filter(x => x === 'crit').length, 1, 'nothing on a quiet step');
    // A plain hit that kills is not a crit: no ping, whether the body stays a
    // step at 0 health or leaves the list at once.
    const k1 = mkEnemy({ x: 70 }), k2 = mkEnemy({ x: 80 });
    st.enemies.push(k1, k2); step(st);
    k1.hp = 0; k2.hp = 0; step(st);
    st.enemies.splice(st.enemies.indexOf(k1), 1); step(st);
    st.enemies.splice(st.enemies.indexOf(k2), 1); step(st);
    assert.ok(log.includes('kill'), 'the kills were heard');
    assert.equal(log.filter(x => x === 'crit').length, 1, 'a killing plain hit does not ping');
  } finally { setFeelAudio(null); }
});

S.check('the observer: an elite growls when it appears; a boss and a plain enemy do not', () => {
  const log = [];
  setFeelAudio({ playSfx: (n) => log.push(n), setMusicMode() {} });
  try {
    const st = mkState();
    step(st);
    st.enemies.push(mkEnemy()); step(st);
    assert.ok(!log.includes('eliteArrive'), 'a plain enemy: no growl');
    st.enemies.push(mkEnemy({ boss: true, elite: true })); step(st);
    assert.ok(!log.includes('eliteArrive') && log.includes('bossArrive'), 'a boss has its own arrival');
    st.enemies.push(mkEnemy({ elite: true })); step(st);
    assert.equal(log.filter(x => x === 'eliteArrive').length, 1, 'the elite growls once');
    step(st); step(st);
    assert.equal(log.filter(x => x === 'eliteArrive').length, 1, 'and not again while it lives');
    // The growl marks an arrival, not every elite: a stream of them is one growl.
    for (let i = 0; i < 30; i++) { st.enemies.push(mkEnemy({ elite: true, x: 60 + i })); step(st, 0.5); }
    assert.equal(log.filter(x => x === 'eliteArrive').length, 1, 'elites every half second for 15 s: no more growls');
    for (let i = 0; i < 2 * FEEL.ELITE_QUIET - 2; i++) step(st, 0.5);
    st.enemies.push(mkEnemy({ elite: true, x: 200 })); step(st, 0.5);
    assert.equal(log.filter(x => x === 'eliteArrive').length, 1, 'just under the quiet spell: still none');
    for (let i = 0; i < 2 * FEEL.ELITE_QUIET; i++) step(st, 0.5);
    st.enemies.push(mkEnemy({ elite: true, x: 210 })); step(st, 0.5);
    assert.equal(log.filter(x => x === 'eliteArrive').length, 2, 'after a quiet spell an elite growls again');
  } finally { setFeelAudio(null); }
});

S.check('the observer: run gold going up clinks, the streak climbs and resets after a pause', () => {
  const log = [];
  setFeelAudio({ playSfx: (n, a) => log.push(a === undefined ? n : n + ':' + a) });
  try {
    const st = mkState();
    step(st);
    step(st);
    assert.equal(log.filter(x => x.startsWith('coin')).length, 0, 'no gold, no coin');
    for (let i = 0; i < 3; i++) { st.runCounts.gold.earned += 2; step(st); }
    assert.deepEqual(log.filter(x => x.startsWith('coin')), ['coin:0', 'coin:1', 'coin:2']);
    for (let t = 0; t < FEEL.COIN_WINDOW + 0.1; t += 1 / 60) step(st);
    st.runCounts.gold.earned += 2; step(st);
    assert.equal(log.filter(x => x.startsWith('coin')).pop(), 'coin:0', 'a new streak');
    // A new run (fresh feel) does not clink for the gold it starts with.
    const st2 = mkState(); st2.runCounts.gold.earned = 500;
    const before = log.length;
    step(st2);
    assert.equal(log.slice(before).filter(x => x.startsWith('coin')).length, 0);
  } finally { setFeelAudio(null); }
});

// ---- the heartbeat (audio.js) ----------------------------------------------
S.check('the heartbeat: the period falls with health; it never stacks or bursts', () => {
  assert.ok(Math.abs(heartbeatPeriod(0.25) - HEARTBEAT.slowS) < 1e-9);
  assert.ok(heartbeatPeriod(0.15) < heartbeatPeriod(0.25) && heartbeatPeriod(0.05) < heartbeatPeriod(0.15));
  const ctx = setup();
  assert.equal(audio.setHeartbeat(0.3), false, 'at 30% there is no pulse');
  assert.equal(ctx.voices.length, 0);
  assert.equal(audio.setHeartbeat(0.2), true);
  // 6 s of frames at 60 fps, health 20%: one pulse per period, never closer.
  for (let i = 0; i < 360; i++) { ctx.currentTime += 1 / 60; audio.setHeartbeat(0.2); }
  const lubs = ctx.voices.filter(v => v.f === 64).map(v => v.t);
  assert.ok(lubs.length >= 5 && lubs.length <= 8, 'pulses: ' + lubs.length);
  for (let i = 1; i < lubs.length; i++) assert.ok(lubs[i] - lubs[i - 1] >= heartbeatPeriod(0.2) - 1e-9, 'spaced');
  // Calling many times on one instant adds nothing.
  const n = ctx.voices.length;
  for (let i = 0; i < 50; i++) audio.setHeartbeat(0.2);
  assert.equal(ctx.voices.length, n, 'no stacking');
  // The frames stop for 10 s and come back: one pulse, not a catch-up burst.
  ctx.currentTime += 10;
  audio.setHeartbeat(0.2);
  assert.ok(ctx.voices.length - n <= 4, 'one pulse (four voices)');
  // Lower health: faster.
  const ctx2 = setup();
  for (let i = 0; i < 360; i++) { ctx2.currentTime += 1 / 60; audio.setHeartbeat(0.05); }
  assert.ok(ctx2.voices.filter(v => v.f === 64).length > lubs.length, 'quicker at 5%');
});

S.check('the heartbeat stops at once: its gain drops to silence and no pulse follows', () => {
  for (const stop of ['heal', 'null', 'hidden', 'sfxOff']) {
    const ctx = setup();
    for (let i = 0; i < 30; i++) { ctx.currentTime += 1 / 60; audio.setHeartbeat(0.1); }
    const node = ctx.voices[0].dest.out[0];   // a voice -> its half-pulse node -> the heartbeat's gain
    assert.ok(node && node.kind === 'gain' && audio.getHeartbeat().on, stop + ': running');
    if (stop === 'heal') audio.setHeartbeat(0.6);
    if (stop === 'null') audio.setHeartbeat(null);
    if (stop === 'hidden') audio.setHiddenMute(true);
    if (stop === 'sfxOff') audio.setSfxEnabled(false);
    assert.equal(audio.getHeartbeat().on, false, stop + ': off');
    const last = node.gain.sets[node.gain.sets.length - 1];
    assert.equal(last[0], 0, stop + ': the gain falls to 0');
    assert.ok(last[1] - ctx.currentTime <= 0.031, stop + ': within 30 ms');
    const n = ctx.voices.length;
    for (let i = 0; i < 120; i++) { ctx.currentTime += 1 / 60; if (stop === 'heal') audio.setHeartbeat(0.6); if (stop === 'null') audio.setHeartbeat(null); }
    assert.equal(ctx.voices.length, n, stop + ': nothing after');
    audio.setHiddenMute(false); audio.setSfxEnabled(true);
  }
});

// Voices of the heartbeat that can still be heard: a stop cuts every part of
// a pulse that had not started yet off the speakers (its node is disconnected).
const hbFreqs = new Set([64, 96, 58, 88]);
const live = (v) => !!(v.dest && v.dest.out && v.dest.out.length);
S.check('the heartbeat: a stop silences a pulse that was scheduled but had not started', () => {
  const ctx = setup();
  // Run until a pulse's "dub" is scheduled ahead of now, then stop.
  let g = 0;
  do { ctx.currentTime += 1 / 60; audio.setHeartbeat(0.1); }
  while (!(audio.getHeartbeat().last + HEARTBEAT.dub > ctx.currentTime && audio.getHeartbeat().pulses >= 2) && g++ < 600);
  const ahead = ctx.voices.filter(v => hbFreqs.has(v.f) && v.t > ctx.currentTime);
  assert.ok(ahead.length >= 2, 'a dub was waiting');
  audio.setHeartbeat(null);
  assert.deepEqual(ahead.filter(live), [], 'nothing of the heartbeat starts after the stop');
  assert.ok(ctx.voices.filter(v => hbFreqs.has(v.f) && v.t <= ctx.currentTime).some(live), 'what already sounded fades on its own node');
});

S.check('the heartbeat: a heal and a hurt in quick turns never beat twice inside a period', () => {
  const ctx = setup();
  for (let i = 0; i < 360; i++) { ctx.currentTime += 1 / 60; audio.setHeartbeat((Math.floor(i / 7) % 2) ? 0.3 : 0.1); }
  const lubs = ctx.voices.filter(v => v.f === 64 && live(v)).map(v => v.t).sort((a, b) => a - b);
  assert.ok(lubs.length >= 4, 'it beat: ' + lubs.length);
  for (let i = 1; i < lubs.length; i++) {
    assert.ok(lubs[i] - lubs[i - 1] >= heartbeatPeriod(0.1) - 1e-9, 'gap ' + (lubs[i] - lubs[i - 1]).toFixed(3) + ' s');
  }
});

S.check('the hand: a higher hand right after a lower one is heard; the same or a lower one inside 0.3 s is held', () => {
  const ctx = setup();
  assert.equal(audio.playSfx('hand', 1), true);
  ctx.currentTime += 0.1;
  assert.equal(audio.playSfx('hand', 3), true, 'a Pair, then Three of a Kind 0.1 s later: the bigger hand plays');
  ctx.currentTime += 0.1;
  assert.equal(audio.playSfx('hand', 3), false, 'the same hand again inside 0.3 s');
  assert.equal(audio.playSfx('hand', 2), false, 'a lower hand inside 0.3 s');
  ctx.currentTime += 0.31;
  assert.equal(audio.playSfx('hand', 2), true, 'after the limit anything plays');
});

// ---- the listening page ----------------------------------------------------
S.check('the listening page has a "Sounds that mean something" group with every new cue', () => {
  const g = GROUPS.find(x => x.id === 'meaning');
  assert.ok(g && /Sounds that mean something/.test(g.label));
  const keys = g.items.map(itemKey);
  const hands = g.items.filter(it => it[0] === 'hand').map(it => it[1]);
  assert.deepEqual(hands, [1, 2, 3, 4, 5, 6, 7, 8], 'the hand stingers in rank order');
  for (const k of ['crit', 'eliteArrive', 'coin', 'goldBank']) assert.ok(keys.includes(k), k);
  const beats = g.items.filter(it => it[0] === 'heartbeat').map(it => it[1]);
  assert.deepEqual(beats, [0.25, 0.15, 0.05], 'the heartbeat at 25%, 15% and 5%');
  // (Just under 25%: the page plays the pulse a hero at that health hears.)
});

// ---- through the real game ---------------------------------------------------
const h = await boot({ storage: [['hordes_onboarded', '1']] });
const T = h.T, st = h.state;
T.banners.suppressAll();
const gameCtx = new Ctx();
AUDIO_TEST.setDeps({ AudioContext: function () { return gameCtx; }, storage: store(), rng: null });
AUDIO_TEST.reset();
audio.init();
T.startRun();
h.pump(2);
st.spawnTimer = 1e9; st.enemies.length = 0;
const p = st.player;

S.check('a pick that makes a better hand plays its stinger; one that does not plays nothing', () => {
  p.handCards = {};
  T.hand.update(false);
  gameCtx.currentTime += 1;
  addHandCard(p, 'hp');
  let n = gameCtx.voices.length;
  T.hand.update(true);
  assert.equal(AUDIO_TEST.sfxPlayedAt('hand'), undefined, 'one card: no hand, no sound');
  assert.equal(gameCtx.voices.length, n);
  addHandCard(p, 'lvl_VOLLEY_1');
  T.hand.update(true);
  assert.equal(p.hand.id, 'pair');
  assert.equal(AUDIO_TEST.sfxPlayedAt('hand'), gameCtx.currentTime, 'the pair plays the hand cue');
  assert.equal(AUDIO_TEST.sfxPlayedAt('powerup'), undefined, 'not the generic power-up');
  assert.equal(gameCtx.voices.length - n, handCue(1).length, 'the Pair stinger, exactly');
  gameCtx.currentTime += 1;
  n = gameCtx.voices.length;
  T.hand.update(true);
  assert.equal(gameCtx.voices.length, n, 'the same hand again: silent');
  // The count-up on screen makes no second sound.
  for (let i = 0; i < 20; i++) T.hand.tick(0.05);
  assert.equal(gameCtx.voices.length, n, 'the HUD count-up is silent');
});

// The heartbeat through runFrame: on in a watched fight under 25%, off for each stop.
const hbOn = () => audio.getHeartbeat().on;
function lowFight() {
  st.mode = 'playing'; st.unattended = false; st.bannerHold = 0; st.enemies.length = 0;
  p.hp = p.stats.maxHp * 0.15;
  globalThis.document.visibilityState = 'visible';
  gameCtx.currentTime += 0.5;
  h.pump(1);
}
S.check('in a run: the heartbeat starts under 25% health and not above it', () => {
  st.mode = 'playing'; st.enemies.length = 0;
  p.hp = p.stats.maxHp * 0.5;
  h.pump(1);
  assert.equal(hbOn(), false, 'at 50%: no pulse');
  lowFight();
  assert.equal(hbOn(), true, 'at 15%: the pulse');
  assert.ok(Math.abs(audio.getHeartbeat().frac - p.hp / p.stats.maxHp) < 0.02);
});

S.check('in a run: the heartbeat stops on a heal, death, a movie, a menu, a draft, a pause, a held sim, a hidden tab, an unattended run', () => {
  const stops = {
    heal: () => { p.hp = p.stats.maxHp * 0.9; },
    death: () => { st.mode = 'death-cine'; },
    'road shot': () => { st.mode = 'portal-cine'; },
    pause: () => { st.mode = 'settings'; },
    'end card': () => { st.mode = 'dead'; },
    draft: () => { st.pendingDrafts = 1; st.draftKind = null; T.openDraft(); assert.equal(st.mode, 'draft'); },
    'held sim': () => { st.bannerHold = 2; },
    unattended: () => { st.unattended = true; },
    hidden: () => { globalThis.document.visibilityState = 'hidden'; T.onVisibilityChange(); },
  };
  for (const [name, stop] of Object.entries(stops)) {
    lowFight();
    assert.equal(hbOn(), true, name + ': running first');
    stop();
    h.pump(1);
    assert.equal(hbOn(), false, name + ': stopped');
    if (name === 'hidden') { globalThis.document.visibilityState = 'visible'; T.onVisibilityChange(); }
  }
  st.unattended = false; st.bannerHold = 0;
  p.hp = p.stats.maxHp;
  st.mode = 'playing';
  h.pump(1);
  assert.equal(hbOn(), false);
});

S.check('in a run: a Pair, then Three of a Kind 0.1 s later, plays both stingers', () => {
  const card = (rank, suit) => ({ key: rank + suit, rank, value: Number(rank), suit, name: rank + suit });
  p.handCards = {}; T.hand.update(false);
  gameCtx.currentTime += 1;
  p.handCards = Object.fromEntries([card(3, 'spades'), card(3, 'hearts')].map(c => [c.key, c]));
  let n = gameCtx.voices.length;
  T.hand.update(true);
  assert.equal(p.hand.id, 'pair');
  assert.equal(gameCtx.voices.length - n, handCue(p.hand.order).length, 'the Pair');
  gameCtx.currentTime += 0.1;
  p.handCards = Object.fromEntries([card(3, 'spades'), card(3, 'hearts'), card(3, 'clubs')].map(c => [c.key, c]));
  n = gameCtx.voices.length;
  T.hand.update(true);
  assert.equal(p.hand.id, 'three');
  assert.equal(gameCtx.voices.length - n, handCue(p.hand.order).length, 'Three of a Kind is heard too');
  p.handCards = {}; T.hand.update(false);
});

// The portal beat (wave 2 on): the boss dies and the battlefield plays on for
// 2.5 s as a movie. A hero at 12% health hears no heartbeat through it.
S.check('in a run: the heartbeat is off through the portal beat, even at 12% health', () => {
  st.unattended = false; st.bannerHold = 0;
  globalThis.document.visibilityState = 'visible';
  T.startRun(); h.pump(2);
  st.spawnTimer = 1e9; st.wave.midAt = st.time + 1e9;
  st.wave.num = 2; st.wave.endsAt = st.time + 1e9;
  const low = () => { const q = st.player; q.invuln = 1e6; q.hp = q.stats.maxHp * 0.12; gameCtx.currentTime += 1 / 60; };
  st.wave.endsAt = st.time;
  let g = 0;
  while (!(st.wave.bosses || []).some(b => b.hp > 0) && g++ < 1800) h.pump(1, low);
  st.wave.endsAt = st.time + 1e9;
  assert.ok((st.wave.bosses || []).some(b => b.hp > 0), 'the boss is here');
  assert.equal(st.mode, 'playing');
  h.pump(1, low);
  assert.equal(hbOn(), true, 'the heartbeat runs in the boss fight');
  for (const b of st.wave.bosses) b.hp = 0;
  g = 0;
  while (!T.portalBeat.live && g++ < 600) h.pump(1, low);
  assert.ok(T.portalBeat.live, 'the beat started');
  let frames = 0;
  while (T.portalBeat.live && frames < 600) {
    h.pump(1, low);
    if (!T.portalBeat.live) break;
    frames++;
    assert.equal(hbOn(), false, 'off in the beat, frame ' + frames);
  }
  assert.ok(frames > 60, 'the beat lasted: ' + frames + ' frames');
});

// die() stops the heartbeat itself, before the death movie's first cue: no
// frame passes with the pulse on in the death movie, and a pulse that was
// scheduled just ahead never starts under the movie's freeze.
S.check('in a run: death stops the heartbeat at once, before the death movie\'s first cue', () => {
  T.startRun(); h.pump(2);
  st.spawnTimer = 1e9; st.enemies.length = 0;
  const q = st.player;
  q.hp = q.stats.maxHp * 0.12;
  let g = 0;
  do { gameCtx.currentTime += 1 / 60; h.pump(1); }
  while (!(hbOn() && audio.getHeartbeat().last + HEARTBEAT.dub > gameCtx.currentTime && audio.getHeartbeat().pulses > 0) && g++ < 600);
  assert.equal(hbOn(), true, 'running');
  const v0 = gameCtx.voices.length;
  const ahead = gameCtx.voices.filter(v => hbFreqs.has(v.f) && v.t > gameCtx.currentTime);
  assert.ok(ahead.length >= 1, 'a beat part was waiting');
  q.hp = 0;
  T.die();
  assert.equal(st.mode, 'death-cine');
  assert.equal(hbOn(), false, 'off inside die(), before any frame of the movie');
  assert.ok(gameCtx.voices.length > v0, 'the death movie\'s first cue played');
  assert.deepEqual(ahead.filter(live), [], 'no beat part starts under the death movie');
});

AUDIO_TEST.reset();   // drop the fake so nothing keeps a timer
S.done();
