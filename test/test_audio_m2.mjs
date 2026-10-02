// M2 audio: volume sliders (persistence, bus gain, on/off compatibility), the
// SFX families and their throttles, the pitched gem combo, the boss section.
import assert from 'node:assert';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as audio from '../src/audio.js';
const { AUDIO_TEST, SFX, MUSIC } = audio;

class Param { constructor() { this.value = 0; this.sets = []; }
  setValueAtTime(v, t) { this.sets.push([v, t]); this.value = v; }
  exponentialRampToValueAtTime(v, t) { this.sets.push([v, t]); } }
class Gain { constructor() { this.gain = new Param(); } connect() {} }
class Ctx {
  constructor() { this.currentTime = 0; this.state = 'running'; this.sampleRate = 44100; this.destination = {}; this.voices = []; }
  createGain() { return new Gain(); }
  createOscillator() {
    const o = { type: '', frequency: new Param(), connect() {}, stop() {}, start: (t) => this.voices.push({ kind: o.type, t, f: o.frequency.sets[0][0] }) };
    return o;
  }
  createBufferSource() { const n = { connect() {}, stop() {}, start: (t) => this.voices.push({ kind: 'noise', t }) }; return n; }
  createBuffer() { return { getChannelData: () => new Float32Array(64) }; }
}
const store = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };
const setup = (st = store()) => {
  const ctx = new Ctx();
  AUDIO_TEST.setDeps({ AudioContext: function () { return ctx; }, storage: st });
  AUDIO_TEST.reset();   // re-hydrate from THIS storage
  return { ctx, st };
};
let passed = 0;
const check = (label, fn) => { fn(); passed++; console.log('  ok - ' + label); };

check('a fresh profile sits at the default sliders with the shipped bus gains', () => {
  const { st } = setup();
  audio.init();
  assert.equal(audio.getMusicVolume(), 70);
  assert.equal(audio.getSfxVolume(), 80);
  const s = AUDIO_TEST.state();
  assert.ok(Math.abs(s.musicBus.gain.value - 0.5) < 1e-9 && Math.abs(s.sfxBus.gain.value - 0.7) < 1e-9);
  assert.equal(st.m.size, 0, 'reading the defaults writes nothing');
});

check('volumes persist across a reload and drive the live bus gain', () => {
  const { st } = setup();
  audio.init();
  audio.setMusicVolume(35); audio.setSfxVolume(100);
  assert.equal(st.m.get('hordes_audio_music_vol'), '35');
  assert.equal(st.m.get('hordes_audio_sfx_vol'), '100');
  const s = AUDIO_TEST.state();
  assert.ok(Math.abs(s.musicBus.gain.value - 0.5 * 0.25) < 1e-9, 'half the slider is a quarter of the gain');
  assert.ok(s.sfxBus.gain.value > 0.7);
  setup(st);            // "reload": same storage, fresh module state
  assert.equal(audio.getMusicVolume(), 35);
  assert.equal(audio.getSfxVolume(), 100);
  audio.init();
  assert.ok(Math.abs(AUDIO_TEST.state().musicBus.gain.value - 0.125) < 1e-9, 'the stored level is applied at init');
});

check('out-of-range and junk values clamp to 0..100', () => {
  setup();
  assert.equal(audio.setMusicVolume(250), 100);
  assert.equal(audio.setSfxVolume(-5), 0);
  assert.equal(audio.setMusicVolume('abc'), 70);
  const st = store(); st.setItem('hordes_audio_sfx_vol', '9999');
  setup(st);
  assert.equal(audio.getSfxVolume(), 100);
});

check('slider 0 is OFF (same flag the old toggle wrote) and a muted old profile stays muted', () => {
  const { st } = setup();
  audio.init();
  audio.setSfxVolume(0);
  assert.equal(audio.getSfxEnabled(), false);
  assert.equal(st.m.get('hordes_audio_sfx'), '0');
  assert.equal(audio.playSfx('hit'), false);
  audio.setSfxVolume(40);
  assert.equal(audio.getSfxEnabled(), true);
  assert.equal(audio.playSfx('hit'), true);
  // A profile from before the sliders: only the on/off key, set to off.
  const old = store(); old.setItem('hordes_audio_music', '0');
  setup(old);
  assert.equal(audio.getMusicVolume(), 0, 'reads as slider 0');
  assert.equal(audio.getMusicEnabled(), false);
  audio.setMusicEnabled(true);
  assert.equal(audio.getMusicVolume(), 70, 'switching back on restores the level');
  // Muting music stops a running song; raising it allows a start again.
  setup(); audio.init();
  assert.equal(audio.startMusic(), true);
  audio.setMusicVolume(0);
  assert.equal(audio.isMusicRunning(), false);
  assert.equal(audio.startMusic(), false);
  audio.setMusicVolume(50);
  assert.equal(audio.startMusic(), true);
  audio.stopMusic();
});

const FAMILIES = ['fire_bolt', 'fire_arc', 'fire_blast', 'fire_zap', 'fire_seek', 'hit', 'kill', 'eliteDeath',
  'bossDeath', 'bossArrive', 'slam', 'hurt', 'gem', 'potion', 'chest', 'item', 'powerup', 'levelup', 'draftPick',
  'evolve', 'warning', 'victory', 'uiMove', 'uiConfirm', 'uiDeny', 'death', 'button', 'shoot'];
check('every sound the game asks for exists and makes at least one voice', () => {
  for (const name of FAMILIES) {
    const { ctx } = setup(); audio.init();
    assert.ok(SFX[name], name + ' is defined');
    assert.equal(audio.playSfx(name), true, name + ' plays');
    assert.ok(ctx.voices.length >= 1, name + ' scheduled a voice');
  }
});

check('every sound name used in src/ is a defined sound', () => {
  const dir = fileURLToPath(new URL('../src/', import.meta.url));
  const used = new Set();
  const walk = (d) => {
    for (const f of readdirSync(d, { withFileTypes: true })) {
      if (f.isDirectory()) { walk(d + f.name + '/'); continue; }
      if (!f.name.endsWith('.js')) continue;
      const t = readFileSync(d + f.name, 'utf8');
      // Direct literals, the fire-family tables, and names picked by a ?: chain
      // inside a playSfx( ... ) call.
      for (const m of t.matchAll(/(?:playSfx|[^A-Za-z]sfx)[(]([^;]*?)[)]/g)) {
        for (const q of m[1].matchAll(/'([A-Za-z_]+)'/g)) used.add(q[1]);
      }
      for (const m of t.matchAll(/:\s*'(fire_[a-z]+)'/g)) used.add(m[1]);
    }
  };
  walk(dir);
  const missing = [...used].filter(n => !SFX[n]);
  assert.deepEqual(missing, [], 'undefined sounds: ' + missing.join(', '));
  assert.ok(used.size >= 25, 'the scan found the call sites (' + used.size + ')');
  for (const n of ['uiDeny', 'draftPick', 'uiConfirm', 'bossDeath', 'eliteDeath', 'kill', 'fire_seek']) {
    assert.ok(used.has(n), n + ' is wired to a call site');
  }
});

check('weapon fire is throttled per family and across families', () => {
  const { ctx } = setup(); audio.init();
  assert.equal(audio.playSfx('fire_bolt'), true);
  assert.equal(audio.playSfx('fire_bolt'), false, 'same family, same instant');
  assert.equal(audio.playSfx('fire_arc'), false, 'another family inside the shared gate');
  ctx.currentTime += 0.06;
  assert.equal(audio.playSfx('fire_arc'), true, 'past the shared gate');
  assert.equal(audio.playSfx('hit'), true, 'non-fire sounds are not behind the fire gate');
  // 2,000 fire requests in one second make a bounded number of voices.
  const before = ctx.voices.length;
  for (let i = 0; i < 2000; i++) { ctx.currentTime += 0.0005; audio.playSfx(['fire_bolt', 'fire_arc', 'fire_blast', 'fire_zap', 'fire_seek'][i % 5]); }
  assert.ok(ctx.voices.length - before <= 2 * (1 / 0.05 + 1), 'voices in 1s: ' + (ctx.voices.length - before));
});

check('the gem pickup climbs a whole tone per combo step and tops out', () => {
  const pitch = (step) => { const { ctx } = setup(); audio.init(); audio.playSfx('gem', step); return ctx.voices[0].f; };
  assert.ok(Math.abs(pitch(1) / pitch(0) - Math.pow(2, 1 / 6)) < 1e-9);
  assert.ok(pitch(6) / pitch(0) > 1.99 && pitch(6) / pitch(0) < 2.01, 'six steps is an octave');
  assert.equal(pitch(50), pitch(12), 'capped');
});

check('the boss section is a second arrangement the sequencer switches to and back from', () => {
  const { ctx } = setup(); audio.init();
  assert.equal(MUSIC.BOSS.bars.length, 16);
  assert.ok(MUSIC.BOSS.bars.every(b => b.kicks.length === 4 && b.bass.some(Boolean) && b.lead.some(Boolean)));
  assert.equal(audio.getMusicMode(), 'run');
  audio.startMusic();
  const runKinds = new Set(ctx.voices.map(v => v.kind));
  assert.ok(!runKinds.has('sawtooth') && !runKinds.has('sine'), 'the song uses square + triangle + hats');
  assert.equal(audio.setMusicMode('boss'), true);
  assert.equal(audio.setMusicMode('boss'), false, 'idempotent');
  const n0 = ctx.voices.length;
  for (let i = 0; i < 40; i++) { ctx.currentTime += 0.1; AUDIO_TEST.scheduleAhead(); }
  const boss = ctx.voices.slice(n0);
  assert.ok(boss.some(v => v.kind === 'sawtooth') && boss.some(v => v.kind === 'sine'), 'riff + kick voices play');
  audio.setMusicMode('run');
  const n1 = ctx.voices.length;
  for (let i = 0; i < 20; i++) { ctx.currentTime += 0.1; AUDIO_TEST.scheduleAhead(); }
  assert.ok(ctx.voices.slice(n1).every(v => v.kind !== 'sawtooth'), 'back on the song');
  audio.stopMusic();
});

AUDIO_TEST.reset();
console.log('test_audio_m2: ' + passed + ' checks passed');
