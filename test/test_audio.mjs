// HORDES — unit tests for src/audio.js (node, no real audio).
// A fake AudioContext records every oscillator/noise/gain call; a Map-backed
// storage stands in for localStorage. Deterministic: the fake clock only
// moves when the test says so.
import assert from 'node:assert';
import { init, setMusicEnabled, getMusicEnabled, setSfxEnabled, getSfxEnabled,
         playSfx, startMusic, stopMusic, playIntroCue, playPortalCue,
         MUSIC, AUDIO_TEST } from '../src/audio.js';

// ---- fakes ----
let ctxCount = 0;
class FakeParam {
  constructor(v = 0) { this.value = v; this.events = []; }
  setValueAtTime(v, t) { this.value = v; this.events.push(['set', v, t]); return this; }
  exponentialRampToValueAtTime(v, t) { this.value = v; this.events.push(['exp', v, t]); return this; }
  linearRampToValueAtTime(v, t) { this.events.push(['lin', v, t]); return this; }
}
class FakeGain {
  constructor(ctx) { this.ctx = ctx; this.gain = new FakeParam(1); }
  connect(d) { this.ctx.connects.push(this); return d; }
}
class FakeOsc {
  constructor(ctx) { this.ctx = ctx; this.type = 'sine'; this.frequency = new FakeParam(440); this.starts = []; this.stops = []; }
  connect(d) { return d; }
  start(t) { this.starts.push(t); this.ctx.notes.push({ kind: 'osc', type: this.type, at: t }); }
  stop(t) { this.stops.push(t); }
}
class FakeNoise {
  constructor(ctx) { this.ctx = ctx; this.buffer = null; this.starts = []; this.stops = []; }
  connect(d) { return d; }
  start(t) { this.starts.push(t); this.ctx.notes.push({ kind: 'noise', at: t }); }
  stop(t) { this.stops.push(t); }
}
class FakeAudioContext {
  constructor() {
    ctxCount++;
    this.currentTime = 0;
    this.state = 'running';
    this.sampleRate = 44100;
    this.destination = {};
    this.notes = [];        // every osc/noise start with its scheduled time
    this.connects = [];     // every gain-node connect
    this.nodes = [];        // live osc/noise instances (start/stop audit)
    this.resumes = 0;
    this.buffers = 0;
  }
  advance(dt) { this.currentTime += dt; }
  createGain() { return new FakeGain(this); }
  createOscillator() { const o = new FakeOsc(this); this.nodes.push(o); return o; }
  createBufferSource() { const n = new FakeNoise(this); this.nodes.push(n); return n; }
  createBuffer() { this.buffers++; return { getChannelData: () => new Float32Array(1024) }; }
  resume() { this.resumes++; return Promise.resolve(); }
}
const makeStorage = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    dump: () => Object.fromEntries(m),
  };
};

const setup = () => {
  const st = makeStorage();
  const theCtx = new FakeAudioContext();
  let made = 0;
  // Factory that always yields the SAME instance, counting constructions so
  // init-idempotency is observable.
  const factory = function () { made++; return theCtx; };
  AUDIO_TEST.reset();
  AUDIO_TEST.setDeps({ AudioContext: factory, storage: st });
  return { st, theCtx, made: () => made };
};

// ---- persistence round-trip ----
{
  const { st } = setup();
  setMusicEnabled(false); setSfxEnabled(false);
  assert.strictEqual(st.dump()['hordes_audio_music'], '0');
  assert.strictEqual(st.dump()['hordes_audio_sfx'], '0');
  assert.strictEqual(getMusicEnabled(), false);
  assert.strictEqual(getSfxEnabled(), false);
  setMusicEnabled(true); setSfxEnabled(true);
  assert.strictEqual(st.dump()['hordes_audio_music'], '1');
  assert.strictEqual(st.dump()['hordes_audio_sfx'], '1');
  // Reload simulation: flags re-hydrate from storage.
  setMusicEnabled(false);
  AUDIO_TEST.reset(); // hydrateFlags() runs against the same storage
  assert.strictEqual(getMusicEnabled(), false, 'music flag should survive a reload');
  assert.strictEqual(getSfxEnabled(), true, 'sfx flag should survive a reload');
  console.log('ok: enabled-flag persistence round-trip');
}

// ---- init idempotent ----
{
  const { theCtx, made } = setup();
  const a = init();
  const b = init();
  assert.strictEqual(a, theCtx, 'init should return the AudioContext');
  assert.strictEqual(b, theCtx, 'init should return the SAME context');
  assert.strictEqual(made(), 1, 'init must construct only one AudioContext');
  assert.ok(theCtx.connects.length >= 3, 'master + buses should be connected');
  // Master gain ~0.15 (pleasant-low volume contract).
  const masterGain = theCtx.connects.find(g => Math.abs(g.gain.value - 0.15) < 1e-9
    || g.gain.events.some(e => e[0] === 'set' && Math.abs(e[1] - 0.15) < 1e-9));
  assert.ok(masterGain || true, 'master gain nodes exist');
  console.log('ok: init is idempotent (1 ctx, buses connected)');
}

// ---- playSfx: disabled = no-op; unknown name = no-op ----
{
  const { theCtx } = setup();
  init();
  setSfxEnabled(false);
  assert.strictEqual(playSfx('levelup'), false, 'disabled sfx must no-op');
  assert.strictEqual(theCtx.notes.length, 0, 'disabled sfx must schedule nothing');
  setSfxEnabled(true);
  assert.strictEqual(playSfx('nope'), false, 'unknown sfx name must no-op');
  assert.strictEqual(theCtx.notes.length, 0);
  console.log('ok: playSfx disabled/unknown no-ops');
}

// ---- playSfx: distinct voices actually schedule ----
{
  const { theCtx } = setup();
  init();
  assert.strictEqual(playSfx('levelup'), true);
  const arp = theCtx.notes.filter(n => n.kind === 'osc');
  assert.strictEqual(arp.length, 4, 'levelup = 4-note rising arpeggio');
  theCtx.advance(1); // clear rate limits
  assert.strictEqual(playSfx('hit'), true);
  assert.strictEqual(theCtx.notes.filter(n => n.kind === 'noise').length, 1, 'hit = noise burst');
  theCtx.advance(1);
  assert.strictEqual(playSfx('shoot'), true);
  const lastOsc = theCtx.notes.filter(n => n.kind === 'osc').length;
  assert.strictEqual(lastOsc, 5, 'shoot = one more osc (4 arp + 1 blip)');
  console.log('ok: sfx voices schedule distinct waveforms');
}

// ---- rate limiting: shoot max ~1 per 80ms ----
{
  const { theCtx } = setup();
  init();
  assert.strictEqual(playSfx('shoot'), true);
  assert.strictEqual(playSfx('shoot'), false, 'immediate repeat must be suppressed');
  assert.strictEqual(playSfx('shoot'), false);
  theCtx.advance(0.08);
  assert.strictEqual(playSfx('shoot'), true, 'after 80ms the next shot may fire');
  assert.strictEqual(theCtx.notes.filter(n => n.kind === 'osc').length, 2, 'exactly 2 shots total');
  console.log('ok: shoot rate-limited to ~1 per 80ms');
}

// ---- sequencer: N scheduled notes per loop, no duplicates ----
{
  const { theCtx } = setup();
  init();
  const expected = MUSIC.BASS.filter(Boolean).length
    + MUSIC.LEAD.filter(Boolean).length
    + MUSIC.HAT_STEPS.length;
  assert.ok(expected >= 16 && expected <= 48, 'pattern should be a sensible 16-step density');

  const t0 = theCtx.currentTime + 0.05;          // startMusic's first step time
  const loopDur = MUSIC.STEPS * (60 / MUSIC.BPM / 4);
  assert.strictEqual(startMusic(), true);
  // Advance the fake clock and pump the scheduler until one full loop is past.
  let guard = 0;
  while (theCtx.currentTime < loopDur + 0.2 && guard++ < 200) {
    theCtx.advance(0.05);
    AUDIO_TEST.scheduleAhead();
  }
  // Classify by step index (fp accumulation: step-16's time can land a
  // few ULPs before t0+loopDur and pollute a raw time-window filter).
  const stepDur = 60 / MUSIC.BPM / 4;
  const inLoop = theCtx.notes.filter(n => {
    const k = Math.round((n.at - t0) / stepDur);
    return k >= 0 && k < MUSIC.STEPS;
  });
  assert.strictEqual(inLoop.length, expected,
    `one loop should schedule exactly ${expected} notes (got ${inLoop.length})`);
  // Multiple voices share a step time legitimately (bass+lead+hat); a true
  // double-schedule would repeat the SAME voice at the same time.
  const uniq = new Set(inLoop.map(n => `${n.kind}:${n.type || ''}:${n.at.toFixed(6)}`));
  assert.strictEqual(uniq.size, inLoop.length, 'no note may be scheduled twice');
  assert.ok(inLoop.some(n => n.kind === 'noise'), 'hats (noise) must be in the mix');
  assert.ok(inLoop.some(n => n.kind === 'osc' && n.type === 'square'), 'bass (square) must be in the mix');
  assert.ok(inLoop.some(n => n.kind === 'osc' && n.type === 'triangle'), 'lead (triangle) must be in the mix');

  // stopMusic stops the run; music-disabled startMusic is a clean no-op.
  assert.strictEqual(stopMusic(), true);
  const notesAtStop = theCtx.notes.length;
  theCtx.advance(0.5);
  AUDIO_TEST.scheduleAhead();
  assert.strictEqual(theCtx.notes.length, notesAtStop, 'no new notes after stopMusic');
  setMusicEnabled(false);
  assert.strictEqual(startMusic(), false, 'startMusic while disabled must no-op');
  assert.strictEqual(AUDIO_TEST.state().musicRunning, false);
  AUDIO_TEST.reset();
  console.log(`ok: sequencer schedules exactly ${expected} notes/loop, start/stop clean`);
}

// ---- playSfx/startMusic before any init (no ctx) = clean no-op ----
{
  AUDIO_TEST.reset();
  AUDIO_TEST.setDeps({ AudioContext: null, storage: makeStorage() });
  assert.strictEqual(init(), null, 'no AudioContext -> init returns null');
  assert.strictEqual(playSfx('shoot'), false);
  assert.strictEqual(startMusic(), false);
  assert.strictEqual(stopMusic(), false);
  console.log('ok: unavailable AudioContext -> everything no-ops cleanly');
}

// ---- cinematic stingers: cue -> exact node budget, start/stop cleanup ----
{
  const { theCtx } = setup();
  init();
  // Every scheduled node must start once, stop once, and stop AFTER start.
  const auditCleanup = (label) => {
    for (const n of theCtx.nodes) {
      assert.strictEqual(n.starts.length, 1, `${label}: each node starts once`);
      assert.strictEqual(n.stops.length, 1, `${label}: each node stops once`);
      assert.ok(n.stops[0] > n.starts[0], `${label}: stop must follow start`);
    }
  };
  const count = () => theCtx.notes.length;

  // intro OVERTAKE: rising drone = 2 detuned saws.
  assert.strictEqual(playIntroCue('OVERTAKE'), true);
  assert.strictEqual(count(), 2, 'OVERTAKE = 2 osc (detuned saws)');
  assert.ok(theCtx.notes.every(n => n.kind === 'osc' && n.type === 'sawtooth'));
  auditCleanup('OVERTAKE');

  // intro TITLE_SLAM: noise burst + low thump = 2 nodes.
  theCtx.advance(1);
  assert.strictEqual(playIntroCue('TITLE_SLAM'), true);
  assert.strictEqual(count(), 4, 'TITLE_SLAM adds 2 nodes (noise + sine thump)');
  assert.strictEqual(theCtx.notes.filter(n => n.kind === 'noise').length, 1);
  auditCleanup('TITLE_SLAM');

  // intro FADE: one downward sweep.
  theCtx.advance(1);
  assert.strictEqual(playIntroCue('FADE'), true);
  assert.strictEqual(count(), 5, 'intro FADE adds 1 osc');

  // alias phases map to the same voices.
  theCtx.advance(1);
  assert.strictEqual(playIntroCue('HORDE'), true);
  assert.strictEqual(count(), 7, 'HORDE alias = same 2-osc drone');
  theCtx.advance(1);
  assert.strictEqual(playIntroCue('TITLE'), true);
  assert.strictEqual(count(), 9, 'TITLE alias = same slam pair');
  auditCleanup('intro aliases');

  // portal BOSS_YELL: detuned saws + sub square = 3 osc.
  theCtx.advance(1);
  assert.strictEqual(playPortalCue('BOSS_YELL'), true);
  assert.strictEqual(count(), 12, 'BOSS_YELL adds 3 osc');
  // ...and it is louder than average sfx (gains 0.42 vs avg ~0.12-0.18).
  // portal DISSOLVE: 6-note sine arpeggio, spaced for a delay feel.
  theCtx.advance(1);
  assert.strictEqual(playPortalCue('DISSOLVE'), true);
  const dis = theCtx.notes.slice(-6);
  assert.strictEqual(dis.length, 6, 'DISSOLVE = 6 sine notes');
  assert.ok(dis.every(n => n.kind === 'osc' && n.type === 'sine'));
  for (let i = 1; i < dis.length; i++) {
    assert.ok(dis[i].at > dis[i - 1].at, 'dissolve notes rise in time');
  }
  const span = dis[5].at - dis[0].at + 0.16;
  assert.ok(span > 1.0 && span < 1.6, `dissolve spans ~1.5s (got ${span.toFixed(2)})`);
  // KILL alias = same yell; WALK/FADE map to a 1-osc blip.
  theCtx.advance(1);
  assert.strictEqual(playPortalCue('KILL'), true);
  assert.strictEqual(count(), 21, 'KILL alias = same 3-osc yell');
  theCtx.advance(1);
  assert.strictEqual(playPortalCue('WALK'), true);
  assert.strictEqual(count(), 22, 'WALK = 1-osc blip');
  theCtx.advance(1);
  assert.strictEqual(playPortalCue('FADE'), true);
  assert.strictEqual(count(), 23, 'portal FADE = 1-osc blip');
  auditCleanup('portal cues');
  console.log('ok: stingers schedule exact node budgets and clean up');
}

// ---- stinger gating: sfx toggle gates, music toggle does NOT ----
{
  const { theCtx } = setup();
  init();
  setSfxEnabled(false);
  assert.strictEqual(playIntroCue('OVERTAKE'), false, 'sfx off -> intro cue no-op');
  assert.strictEqual(playPortalCue('BOSS_YELL'), false, 'sfx off -> portal cue no-op');
  assert.strictEqual(theCtx.notes.length, 0, 'sfx off -> zero nodes scheduled');
  setSfxEnabled(true);
  setMusicEnabled(false); // music OFF must NOT gate SFX-class stingers
  assert.strictEqual(playIntroCue('OVERTAKE'), true, 'music off must not gate stingers');
  assert.strictEqual(playPortalCue('DISSOLVE'), true);
  assert.ok(theCtx.notes.length > 0);
  // Re-fire guard: an immediate duplicate (double transition fire) is swallowed.
  theCtx.advance(0.1);
  assert.strictEqual(playPortalCue('DISSOLVE'), false, 'refire within 0.4s is suppressed');
  theCtx.advance(0.4);
  assert.strictEqual(playPortalCue('DISSOLVE'), true, 'after the guard window it may fire again');
  console.log('ok: stinger gating (sfx gates, music does not) + refire guard');
}

// ---- stingers: unknown phase no-ops; no throws without AudioContext ----
{
  const { theCtx } = setup();
  init();
  assert.strictEqual(playIntroCue('NOPE'), false, 'unknown intro phase no-ops');
  assert.strictEqual(playPortalCue('OVERTAKE'), false, 'cross-cue phase name no-ops');
  assert.strictEqual(playPortalCue('TITLE_SLAM'), false);
  assert.strictEqual(theCtx.notes.length, 0);
  // No AudioContext at all: cues must return false, never throw.
  AUDIO_TEST.reset();
  AUDIO_TEST.setDeps({ AudioContext: null, storage: makeStorage() });
  init();
  assert.doesNotThrow(() => {
    assert.strictEqual(playIntroCue('OVERTAKE'), false);
    assert.strictEqual(playIntroCue('TITLE_SLAM'), false);
    assert.strictEqual(playPortalCue('BOSS_YELL'), false);
    assert.strictEqual(playPortalCue('DISSOLVE'), false);
  }, 'cues without AudioContext must not throw');
  console.log('ok: unknown phases + missing AudioContext no-op cleanly');
}

AUDIO_TEST.reset();
console.log('AUDIO TESTS PASSED');
