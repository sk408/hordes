// HORDES — recorded music (2026-11-17, owner: the music source is Google Lyria).
// Imported by src/audio.js only; audio.js's public API is the game's door.
//
// What this does: plays the shipped mp3 loops and cues (src/music_manifest.js)
// for the game's music CONTEXTS, crossfading on the tracks' beat and bar lines,
// and hands back to the procedural synth (audio.js's sequencer) whenever a
// context has no decoded track. The synth stays exactly as it was; this module
// only (a) starts, crossfades and stops AudioBufferSourceNodes and (b) tells
// audio.js how loud the synth voices should be (1 = today, 0 = cut).
//
// Graph (built by audio.js):
//   trackSource -> trackGain (per source: crossfades) -> musicDuck (ducking) -> musicBus -> master
//   synth voices -> musicBus;   cueSource -> cueGain -> musicBus
// The duck sits BEFORE the music bus so a cue played over a ducked bed is not
// ducked by its own duck, and the volume slider (musicBus.gain.value) still
// scales everything. The tests pin musicBus at 0.5 / 0.125, so nothing here
// ever touches musicBus.
//
// Loader: one fetch at a time, the current context's slot first; at most
// MAX_LOOP_BUFFERS decoded loops (least recently used goes, never the playing
// one or a pending crossfade target); cues are small and stay. A failed slot
// (network, 404, decode) is failed for the session and its context falls back.
// Plain fetch, no Cache API (partitioned or blocked inside galaxy.click's
// cross-site iframe); the hashed file names keep the HTTP cache safe.
// Where the service worker runs (sw.js), it caches these hashed files by name; this module still
// uses plain fetch and no Cache API.
//
// No timers: every change is scheduled on the AudioContext clock, and the
// engine is re-evaluated (sync) from audio.js's calls (the game's per-frame
// setMusicContext, the synth scheduler tick, start/stop/mode changes, a load
// finishing). AUDIO_TEST.reset drops the whole engine.
import { MUSIC_TRACKS, MUSIC_TRIM_DB } from './music_manifest.js';

export const LOOP_SLOTS = ['title', 'run_wilds', 'run_ash', 'run_bone', 'run_void', 'boss', 'maw', 'escape'];
export const CUE_SLOTS = ['victory', 'gameover', 'portal'];
export const MAX_LOOP_BUFFERS = 3;
// Cue level relative to the run bed (section 5 of the spec): victory and portal
// at the run level, the game-over cue 2 dB under (it is the most-heard one).
export const CUE_GAIN_DB = { victory: 0, portal: 0, gameover: -2 };
export const DUCK_DB = { pause: -8, portal: -12 };
const DUCK_RAMP = 0.3;          // s, the pause / portal duck ramp
const STOP_FADE = 0.2;          // s, stopMusic and leaving a context for silence
const TITLE_FADE_IN = 1.5;      // s, the title bed's fade-in
const START_FADE = 0.3;         // s, a run bed starting from silence (run start, tab shown)
const ENDCARD_DELAY = 2;        // s after the end card shows, the title bed comes back
const ESCAPE_XFADE = 0.3;       // s, into and out of the escape loop
const QUICK_XFADE = 1.0;        // s, title <-> run (a press of PLAY should answer at once)
const LEAD = 0.05;              // s, scheduling margin ahead of currentTime
// A faded-out source gets its stop() only this close to the end of its fade, so
// a bed that is wanted back before then (a boss that returns between the
// debounce and the bar line) is revived instead of restarted from its top.
const STOP_ISSUE = 0.15;        // s
const TITLE_HANDOFF = 0.25;     // s, startRun reports the run a moment before startMusic: the title waits for it
const CUE_TAIL = 0.5;           // s, the end-card title may start this long before a playing cue ends
const CUE_FADE = 0.3;           // s, a cue cut by a new run

// Scenes main.js reports (setMusicContext): which of them want the title bed.
const TITLE_SCENES = new Set(['title', 'endcard']);
// Scenes in which a live boss (feel.js setMusicMode('boss')) takes the bed.
const BOSS_SCENES = new Set(['run', 'finale', 'pause']);
const RUN_SCENES = new Set(['run', 'intermission', 'pause', 'portal', 'escape', 'finale']);
// Stage -> run track group (section 2 of the spec). Unknown stage -> run_wilds;
// every wave after the Maw -> run_void.
const STAGE_SLOT = {
  VERDANT_HOLLOW: 'run_wilds', SNOWFIELD: 'run_wilds', WHITEOUT: 'run_wilds',
  ASHEN_WASTE: 'run_ash', BLOOD_RUST: 'run_ash', CINDER_MAW: 'run_ash',
  BONE_DESERT: 'run_bone', VOID_REACH: 'run_void',
};
export function runSlotFor(stage, afterMaw) {
  if (afterMaw) return 'run_void';
  return STAGE_SLOT[stage] || 'run_wilds';
}
const RUN_SLOTS = new Set(['run_wilds', 'run_ash', 'run_bone', 'run_void']);
// Loops that restart from loopStart each time they come in (a boss fight is a
// new fight); run and title beds resume where they left.
const FRESH_SLOTS = new Set(['boss', 'maw', 'escape']);

export const dbToGain = (db) => Math.pow(10, db / 20);
export { MUSIC_TRACKS, MUSIC_TRIM_DB };

// ---------- AudioParam envelope (feature-tested: several fakes lack ramps) ----------
// A ramp from `from` at t0 to `to` at t1, with the param's value now held at
// `cur` (our own record of it, so a ramp cut short never jumps).
function schedule(p, now, cur, from, t0, to, t1) {
  if (!p) return;
  const has = (n) => typeof p[n] === 'function';
  if (!has('setValueAtTime')) { p.value = to; return; }
  try {
    if (has('cancelScheduledValues')) p.cancelScheduledValues(now);
    p.setValueAtTime(cur, now);
    if (has('linearRampToValueAtTime')) {
      if (t0 > now) p.linearRampToValueAtTime(from, t0);
      if (t1 > t0) p.linearRampToValueAtTime(to, t1); else p.setValueAtTime(to, Math.max(now, t0));
    } else {
      p.setValueAtTime(to, Math.max(now, t1));
    }
  } catch { try { p.value = to; } catch { /* ignore */ } }
}
// Our own record of an envelope: value at time t.
export function envAt(env, t) {
  if (!env) return 1;
  if (t <= env.t0) return env.from;
  if (t >= env.t1) return env.to;
  return env.from + (env.to - env.from) * (t - env.t0) / (env.t1 - env.t0);
}

// decodeAudioData: the promise form, wrapped so the old callback-only Safari
// form works too (it returns undefined and calls back).
function decode(ctx, ab) {
  return new Promise((res, rej) => {
    let p;
    try { p = ctx.decodeAudioData(ab, res, rej); } catch (e) { rej(e); return; }
    if (p && typeof p.then === 'function') p.then(res, rej);
  });
}

// ---------- The engine ----------
// host: { ctx, dest (musicDuck), cueDest (musicBus), duck (musicDuck.gain),
//   fetch, tracks, trimDb, resolveUrl(url), runOn(), musicOn(), hidden(),
//   recorded() (the source pref), synthMode() ('run'|'boss'),
//   synthGrid() -> { next, stepIndex, stepDur } | null, setSynthEnv(env|null) }
export function createMusicEngine(host) {
  const ctx = host.ctx;
  const tracks = host.tracks || MUSIC_TRACKS;
  const trimDb = Number.isFinite(host.trimDb) ? host.trimDb : MUSIC_TRIM_DB;
  let gen = 0;                       // bumped by drop(): a late load is ignored
  const buffers = new Map();         // slot -> AudioBuffer
  const lastUse = new Map();         // slot -> use counter (LRU)
  let useClock = 0;
  const failed = new Set();
  let inFlight = null;               // slot being fetched/decoded
  const loadLog = [];                // [slot, 'start'|'ok'|'fail'] (test seam)
  let loadingAllowed = false;        // after the first frame (first setContext)
  let wanted = [];

  const positions = new Map();       // loop slot -> remembered offset (s, inside the file)
  let voices = [];                   // live recorded sources
  let cues = [];
  let cur = null;                    // null | { kind: 'synth' } | { kind: 'rec', slot, voice }
  let synthEnv = null;
  let duckEnv = { t0: 0, t1: 0, from: 1, to: 1 };
  let duckDb = 0;
  let cueDuck = null;                // { until, db }

  const scene = { scene: 'none', stage: null, wave: 0, afterMaw: false, maw: false, runNo: 0, since: 0 };
  let recBoss = false;
  let bossOffSince = null;
  // feel.js reports the mode (setMusicMode) on every sim step, but only in
  // 'playing' and 'finale': after a death in a boss fight, or the Maw, the mode
  // stays 'boss' until the next step. Entering a fight scene (or a new run)
  // therefore ignores the mode until feel.js has reported it again.
  let modeArm = -1;
  let wasHidden = false;

  const now = () => (ctx && Number.isFinite(ctx.currentTime) ? ctx.currentTime : 0);
  const has = (slot) => !!(tracks[slot] && tracks[slot].url) && !failed.has(slot);
  const ready = (slot) => buffers.has(slot);
  const isLoop = (slot) => LOOP_SLOTS.includes(slot);
  const level = (slot) => dbToGain(trimDb) * (Number.isFinite(tracks[slot] && tracks[slot].gain) ? tracks[slot].gain : 1);

  // ----- loader -----
  function touch(slot) { lastUse.set(slot, ++useClock); }
  function protectedSlots() {
    const s = new Set();
    const n = now();
    // Playing, a pending crossfade target, or still fading out.
    for (const v of voices) if (!v.dead || (!v.killed && v.env.t1 > n)) s.add(v.slot);
    if (cur && cur.kind === 'rec') s.add(cur.slot);
    return s;
  }
  // The loops allowed to be decoded right now: the playing ones, then the top
  // of the wanted list, up to the cap.
  function allowedLoops() {
    const allow = protectedSlots();
    for (const s of wanted) {
      if (allow.size >= MAX_LOOP_BUFFERS) break;
      if (isLoop(s) && has(s)) allow.add(s);
    }
    return allow;
  }
  function evictFor() {
    const loops = [...buffers.keys()].filter(isLoop);
    if (loops.length < MAX_LOOP_BUFFERS) return true;
    const keep = allowedLoops();
    const prot = protectedSlots();
    const victims = loops.filter((s) => !keep.has(s) && !prot.has(s))
      .sort((a, b) => (lastUse.get(a) || 0) - (lastUse.get(b) || 0));
    if (!victims.length) return false;
    buffers.delete(victims[0]);
    loadLog.push([victims[0], 'evict']);
    return true;
  }
  function pump() {
    if (!loadingAllowed || inFlight || !host.recorded() || typeof host.fetch !== 'function') return;
    const allow = allowedLoops();
    const next = wanted.find((s) => has(s) && !ready(s) && (!isLoop(s) || allow.has(s)));
    if (!next) return;
    if (isLoop(next) && !evictFor()) return;
    inFlight = next;
    const g = gen;
    loadLog.push([next, 'start']);
    let p;
    try { p = Promise.resolve(host.fetch(host.resolveUrl(tracks[next].url))); } catch (e) { p = Promise.reject(e); }
    p.then((r) => {
      if (!r || r.ok === false) throw new Error('http ' + (r && r.status));
      return r.arrayBuffer();
    }).then((ab) => decode(ctx, ab)).then((buf) => {
      if (g !== gen) return;
      inFlight = null;
      buffers.set(next, buf);
      touch(next);
      loadLog.push([next, 'ok']);
      sync();
      pump();
    }, () => {
      if (g !== gen) return;
      inFlight = null;
      failed.add(next);          // no retry loop: this session falls back
      loadLog.push([next, 'fail']);
      sync();
      pump();
    });
  }

  // ----- grid maths (beat and bar lines of whatever plays now) -----
  function posOf(v, t) {
    const tr = tracks[v.slot];
    let x = v.off0 + Math.max(0, t - v.t0);
    if (v.loop && x >= tr.loopEnd) x = tr.loopStart + ((x - tr.loopStart) % (tr.loopEnd - tr.loopStart));
    return x;
  }
  // The next time >= t at which the playing source crosses a multiple of
  // `beats` beats (counted from loopStart), and the length of `beats` beats.
  function recLine(v, t, beats) {
    const tr = tracks[v.slot];
    const unit = (60 / (tr.bpm || 120)) * beats;
    if (t < v.t0) return { at: v.t0, unit };
    const k = (posOf(v, t) - tr.loopStart) / unit;
    let wait = (Math.ceil(k - 1e-6) - k) * unit;
    if (wait < 0) wait = 0;
    return { at: t + wait, unit };
  }
  function synthLine(t, steps) {
    const g = host.synthGrid();
    if (!g || !(g.stepDur > 0)) return { at: t, unit: 0.5 };
    const unit = g.stepDur * steps;
    let at = g.next, i = g.stepIndex;
    while (at < t || i % steps !== 0) { at += g.stepDur; i++; }
    return { at, unit };
  }
  function line(t, beats) {
    if (cur && cur.kind === 'rec' && cur.voice) return recLine(cur.voice, t, beats);
    if (cur && cur.kind === 'synth') return synthLine(t, beats * 4);
    return { at: t, unit: 0.5 };
  }

  // ----- sources -----
  function startVoice(slot, t, fade) {
    const tr = tracks[slot];
    const buf = buffers.get(slot);
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    src.buffer = buf;
    const loop = tr.kind !== 'cue';
    let off = 0;
    if (loop) {
      src.loop = true;
      src.loopStart = tr.loopStart;
      src.loopEnd = tr.loopEnd;
      off = positions.has(slot) ? positions.get(slot) : tr.loopStart;
      if (!(off >= tr.loopStart && off < tr.loopEnd)) off = tr.loopStart;
    }
    const lv = level(slot);
    const n = now();
    const env = fade > 0 ? { t0: t, t1: t + fade, from: 0, to: lv } : { t0: t, t1: t, from: lv, to: lv };
    schedule(g.gain, n, fade > 0 ? 0 : lv, env.from, env.t0, env.to, env.t1);
    src.connect(g); g.connect(host.dest);
    try { src.start(t, off); } catch { try { src.start(t); } catch { /* ignore */ } }
    touch(slot);
    const v = { slot, src, g, env, t0: t, off0: off, loop, dead: false };
    voices.push(v);
    return v;
  }
  function issueStop(v) {
    if (v.stopIssued) return;
    v.stopIssued = true;
    try { v.src.stop(v.stopAt); } catch { /* ignore */ }
  }
  function fadeVoice(v, t, d, remember) {
    if (!v || v.dead) return;
    const n = now();
    if (remember && v.loop) positions.set(v.slot, posOf(v, t));
    const held = envAt(v.env, n);   // the value now, read from the envelope being replaced
    const from = envAt(v.env, t);
    v.env = { t0: t, t1: t + d, from, to: 0 };
    schedule(v.g.gain, n, held, from, t, 0, t + d);
    v.stopAt = t + d + 0.05;
    v.dead = true;
    if (v.stopAt - STOP_ISSUE <= n) issueStop(v);   // later ones: prune() issues it
  }
  function killVoice(v, rememberAt) {
    if (rememberAt != null && v.loop && !v.dead) positions.set(v.slot, posOf(v, rememberAt));
    try { v.src.stop(); } catch { /* ignore */ }
    try { v.g.disconnect(); } catch { /* ignore */ }
    v.dead = true; v.killed = true; v.stopIssued = true;
  }
  // A faded bed wanted back before its stop was issued: ramp it back up.
  function revivable(slot, n) {
    return voices.find((v) => v.slot === slot && v.dead && !v.killed && !v.stopIssued
      && v.stopAt - STOP_ISSUE > n + LEAD);
  }
  function revive(v, from, n) {
    const T = n + LEAD;
    if (from && from.kind === 'rec' && from.voice && from.voice !== v) {
      // The bed that was to replace it: never heard if it has not started yet.
      if (from.voice.t0 > T) killVoice(from.voice, null);
      else fadeVoice(from.voice, T, START_FADE, !FRESH_SLOTS.has(from.slot));
      if (FRESH_SLOTS.has(from.slot)) positions.delete(from.slot);
    } else if (from && from.kind === 'synth') {
      setSynth({ t0: T, t1: T + START_FADE, from: envAt(synthEnv, T), to: 0 });
    }
    const lv = level(v.slot);
    const held = envAt(v.env, n);
    const at = envAt(v.env, T);
    v.env = { t0: T, t1: at < lv - 1e-6 ? T + START_FADE : T, from: at, to: lv };
    schedule(v.g.gain, n, held, at, T, lv, v.env.t1);
    v.dead = false; v.stopAt = null;
    cur = { kind: 'rec', slot: v.slot, voice: v };
  }
  function fadeCues(n, d) {
    for (const c of cues) {
      if (c.fading) continue;
      c.fading = true;
      schedule(c.g.gain, n, c.lv, c.lv, n, 0, n + d);
      try { c.src.stop(n + d + 0.05); } catch { /* ignore */ }
      c.end = Math.min(c.end, n + d + 0.05);
    }
    cueDuck = null;
  }
  function prune() {
    const n = now();
    for (const v of voices) if (v.dead && !v.stopIssued && v.stopAt - STOP_ISSUE <= n) issueStop(v);
    voices = voices.filter((v) => !v.dead || (!v.killed && (!v.stopIssued || v.stopAt + 0.05 > n)));
    cues = cues.filter((c) => c.end > n);
  }
  function setSynth(env) { synthEnv = env; host.setSynthEnv(env); }

  // ----- what should play -----
  function desired(n) {
    if (!host.musicOn() || host.hidden()) return null;
    const rec = host.recorded();
    if (host.runOn()) {
      if (!rec) return { kind: 'synth' };
      if (scene.scene === 'escape' && ready('escape')) return { kind: 'rec', slot: 'escape' };
      if (recBoss) {
        if (scene.maw && ready('maw')) return { kind: 'rec', slot: 'maw' };
        // The fight just ended and the debounce holds: keep the bed that played
        // it (the Maw's bed never hands over to the boss bed on its way out).
        if (bossOffSince !== null && cur && cur.kind === 'rec' && (cur.slot === 'maw' || cur.slot === 'boss')) return cur;
        if (ready('boss')) return { kind: 'rec', slot: 'boss' };
        return { kind: 'synth' };
      }
      const rs = runSlotFor(scene.stage, scene.afterMaw);
      if (ready(rs)) return { kind: 'rec', slot: rs };
      // A travel to a stage whose track is still loading keeps the recorded
      // run bed going rather than dropping to the synth for a few seconds.
      if (has(rs) && cur && cur.kind === 'rec' && RUN_SLOTS.has(cur.slot)) return cur;
      return { kind: 'synth' };
    }
    if (!rec) return null;
    // startRun reports the run's context a moment before startMusic: the title
    // waits for it, so startMusic crossfades title -> run (QUICK_XFADE).
    if (cur && cur.kind === 'rec' && cur.slot === 'title' && RUN_SCENES.has(scene.scene)
      && n - scene.since < TITLE_HANDOFF) return cur;
    if (!TITLE_SCENES.has(scene.scene)) return null;
    if (scene.scene === 'endcard') {
      if (n - scene.since < ENDCARD_DELAY) return null;
      // A victory / game-over cue still playing: the title comes in as it ends.
      if (cues.some((c) => !c.fading && c.end - CUE_TAIL > n)) return null;
    }
    return ready('title') ? { kind: 'rec', slot: 'title' } : null;
  }
  const same = (a, b) => (!a && !b) || (a && b && a.kind === b.kind && a.slot === b.slot);

  function transition(want, n) {
    const from = cur;
    if (want && want.kind === 'rec') {
      const back = revivable(want.slot, n);
      if (back) { revive(back, from, n); return; }
    }
    const fromSlot = from && from.kind === 'rec' ? from.slot : null;
    const toSlot = want && want.kind === 'rec' ? want.slot : null;
    let T, D;
    if (!want) { T = n; D = STOP_FADE; }
    else if (!from) { T = n + LEAD; D = toSlot === 'title' ? TITLE_FADE_IN : START_FADE; }
    else if (toSlot === 'escape' || fromSlot === 'escape') { T = n + LEAD; D = ESCAPE_XFADE; }
    else if (toSlot === 'title' || fromSlot === 'title') { T = n + LEAD; D = QUICK_XFADE; }
    else if (recBoss && (toSlot === 'boss' || toSlot === 'maw' || (want.kind === 'synth' && host.synthMode() === 'boss'))
      && !(fromSlot === 'boss' || fromSlot === 'maw')) {
      // run -> boss: at the next beat line, over one beat.
      const l = line(n + LEAD, 1); T = l.at; D = l.unit;
    } else {
      // boss -> run (after the debounce), a stage change, a load swap, the
      // source switch: at the next bar line, over one bar.
      const l = line(n + LEAD, 4); T = l.at; D = l.unit;
    }
    // Out.
    if (from && from.kind === 'rec') {
      // Stopping (the tab hides: main.js calls stopMusic first) keeps every
      // loop's place; handing a boss/maw/escape bed to another bed forgets it.
      const keep = !want || !FRESH_SLOTS.has(from.slot);
      fadeVoice(from.voice, T, D, keep);
      if (!keep) positions.delete(from.slot);
    } else if (from && from.kind === 'synth') {
      if (want) setSynth({ t0: T, t1: T + D, from: envAt(synthEnv, T), to: 0 });
    }
    // In.
    if (!want) {
      // A bed whose fade-out waits for a bar line goes now too.
      for (const v of voices) {
        if (v.dead && !v.killed && !v.stopIssued && v.env.t0 > T) { v.dead = false; fadeVoice(v, T, D, false); }
      }
      cur = null;
      if (!host.runOn()) setSynth(null);
      return;
    }
    if (want.kind === 'synth') {
      if (!from) setSynth(null);   // a fresh start is exactly today's synth
      else setSynth({ t0: T, t1: T + D, from: envAt(synthEnv, T), to: 1 });
      cur = { kind: 'synth' };
    } else {
      if (!from || from.kind !== 'synth') {
        // Nothing synth may sound: a fresh recorded start mutes it from now.
        if (!from) setSynth({ t0: n, t1: n, from: 0, to: 0 });
      }
      // A new fight (or chase) starts at the top; coming back from silence
      // (a shown tab) resumes the remembered place. A new run cleared them all.
      if (from && FRESH_SLOTS.has(want.slot)) positions.delete(want.slot);
      cur = { kind: 'rec', slot: want.slot, voice: startVoice(want.slot, T, D) };
    }
  }

  function updateBoss(n) {
    // feel.js only steps in 'playing' and 'finale', so the mode freezes on
    // whatever it was: after the Maw falls the intermission would keep the
    // boss bed. A boss counts only where a fight can be on screen.
    const fresh = typeof host.modeCalls !== 'function' || host.modeCalls() > modeArm;
    const boss = fresh && host.synthMode() === 'boss' && BOSS_SCENES.has(scene.scene);
    if (boss) { recBoss = true; bossOffSince = null; return; }
    if (!recBoss) return;
    if (bossOffSince === null) bossOffSince = n;
    // Debounce: one bar (of whatever plays) of no boss before going back.
    const bar = cur && cur.kind === 'rec' && cur.voice ? (60 / (tracks[cur.slot].bpm || 120)) * 4
      : host.synthGrid() ? host.synthGrid().stepDur * 16 : 2;
    if (n - bossOffSince >= bar) { recBoss = false; bossOffSince = null; }
  }

  function updateDuck(n) {
    let db = 0;
    // CLASSIC SYNTH chosen on a paused screen: the recorded bed keeps its duck
    // until its fade-out ends (it hands over on the next bar).
    const recSounding = voices.some((v) => !v.dead || (!v.killed && v.env.t1 > n));
    if ((host.recorded() || recSounding) && !host.hidden()) {
      if (scene.scene === 'pause') db = DUCK_DB.pause;
      if (scene.scene === 'portal') db = DUCK_DB.portal;
      if (cueDuck && n < cueDuck.until) db = Math.min(db, cueDuck.db);
    }
    if (cueDuck && n >= cueDuck.until) cueDuck = null;
    if (db === duckDb) return;
    duckDb = db;
    const to = dbToGain(db);
    const from = envAt(duckEnv, n);
    duckEnv = { t0: n, t1: n + DUCK_RAMP, from, to };
    schedule(host.duck, n, from, from, n, to, n + DUCK_RAMP);
  }

  function computeWanted() {
    // In a run by the scene (the bed may not have started yet): run order.
    const inRun = host.runOn() || RUN_SCENES.has(scene.scene);
    const rs = runSlotFor(scene.stage, scene.afterMaw);
    const list = [];
    const d = inRun
      ? (scene.scene === 'escape' ? 'escape' : recBoss ? (scene.maw ? 'maw' : 'boss') : rs)
      : 'title';
    list.push(d);
    if (inRun) {
      list.push(rs, 'boss', ...CUE_SLOTS);
      if (scene.wave >= 4) list.push('maw');
      if (scene.wave <= 1) list.push('escape');
      list.push('title');
    } else {
      list.push('title', rs, 'boss', ...CUE_SLOTS);
    }
    wanted = [...new Set(list)];
  }

  function sync() {
    if (!ctx) return;
    const n = now();
    if (host.hidden()) { hide(); return; }
    if (wasHidden) {
      wasHidden = false;
      // A fight that ended while the tab was hidden (background play) is over:
      // no debounce, and the dead boss's bed is not resumed.
      if (recBoss && !(host.synthMode() === 'boss' && BOSS_SCENES.has(scene.scene))) {
        recBoss = false; bossOffSince = null;
        positions.delete('boss'); positions.delete('maw');
      }
    }
    prune();
    // CLASSIC SYNTH (or music off): a recorded cue does not play on.
    if (cues.length && (!host.recorded() || !host.musicOn())) fadeCues(n, STOP_FADE);
    updateBoss(n);
    updateDuck(n);
    computeWanted();
    const want = desired(n);
    if (!same(want, cur)) transition(want, n);
    pump();
  }

  // Hidden tab: stop every source now and remember each loop's place.
  function hide() {
    const n = now();
    for (const v of voices) {
      if (!v.dead) killVoice(v, n); else try { v.src.stop(); } catch { /* ignore */ }
    }
    for (const c of cues) { try { c.src.stop(); } catch { /* ignore */ } }
    voices = []; cues = [];
    cur = null;
    cueDuck = null;
    wasHidden = true;
    if (synthEnv) setSynth(null);
  }

  function playCue(slot, opts = {}) {
    if (!host.recorded() || !host.musicOn() || host.hidden() || !ready(slot)) return false;
    const tr = tracks[slot];
    const buf = buffers.get(slot);
    const n = now();
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    src.buffer = buf;
    const lv = level(slot) * dbToGain(CUE_GAIN_DB[slot] || 0);
    if (typeof g.gain.setValueAtTime === 'function') g.gain.setValueAtTime(lv, n); else g.gain.value = lv;
    src.connect(g); g.connect(host.cueDest);
    try { src.start(n + 0.02); } catch { /* ignore */ }
    const len = (buf && buf.duration) || tr.seconds || 3;
    cues.push({ slot, src, g, lv, end: n + 0.02 + len, fading: false });
    touch(slot);
    if (opts.duckDb) { cueDuck = { until: n + 0.02 + len, db: opts.duckDb }; updateDuck(n); }
    return true;
  }

  return {
    setContext(c) {
      const n = now();
      const sc = c && c.scene ? String(c.scene) : 'none';
      const armMode = () => { modeArm = typeof host.modeCalls === 'function' ? host.modeCalls() : -1; };
      if (sc !== scene.scene) {
        if (BOSS_SCENES.has(sc) && !BOSS_SCENES.has(scene.scene)) armMode();
        scene.scene = sc; scene.since = n;
      }
      scene.stage = c && c.stage != null ? c.stage : null;
      scene.wave = c && Number.isFinite(c.wave) ? c.wave : 0;
      scene.afterMaw = !!(c && c.afterMaw);
      scene.maw = !!(c && c.maw);   // the Maw lives (the finale, or paused inside it)
      const runNo = c && Number.isFinite(c.runNo) ? c.runNo : 0;
      if (runNo !== scene.runNo) {
        scene.runNo = runNo;
        // A new run starts its tracks from the top; the title keeps its place.
        for (const s of LOOP_SLOTS) if (s !== 'title') positions.delete(s);
        recBoss = false; bossOffSince = null;
        armMode();
        // The last run's victory / game-over cue does not play over the new run.
        if (cues.length) fadeCues(n, CUE_FADE);
      }
      loadingAllowed = true;
      sync();
    },
    sync,
    hide,
    playCue,
    // A cue cut short by the next scene (the Maw after wave 5's portal): it
    // fades and its duck lifts at once.
    fadeAllCues() {
      if (!cues.length && !cueDuck) return;
      const n = now();
      if (cues.length) fadeCues(n, CUE_FADE); else cueDuck = null;
      updateDuck(n);
    },
    // The synth STEP chase bed is not tempo-synced: it is suppressed while the
    // recorded escape loop plays (ROAR, BOSS, ESCAPE and GOLD still sound).
    escapePlaying: () => !!(cur && cur.kind === 'rec' && cur.slot === 'escape'),
    drop() {
      gen++;
      for (const v of voices) killVoice(v, null);
      for (const c of cues) { try { c.src.stop(); } catch { /* ignore */ } }
      voices = []; cues = []; buffers.clear(); failed.clear();
      inFlight = null; cur = null; synthEnv = null; host.setSynthEnv(null);
      cueDuck = null; wasHidden = false;
    },
    debug: () => ({
      cur: cur ? (cur.kind === 'rec' ? cur.slot : 'synth') : null,
      scene: { ...scene },
      buffers: [...buffers.keys()],
      failed: [...failed],
      inFlight,
      wanted: [...wanted],
      loadLog: loadLog.map((x) => x.slice()),
      positions: Object.fromEntries(positions),
      voices: voices.map((v) => ({ slot: v.slot, t0: v.t0, off0: v.off0, dead: v.dead, stopIssued: !!v.stopIssued, env: { ...v.env } })),
      cues: cues.map((c) => c.slot),
      cueList: cues.map((c) => ({ slot: c.slot, end: c.end, fading: c.fading })),
      duckDb,
      recBoss,
      synthEnv: synthEnv ? { ...synthEnv } : null,
      position: (slot, t) => {
        const v = voices.find((x) => x.slot === slot && !x.dead);
        return v ? posOf(v, t == null ? now() : t) : null;
      },
    }),
  };
}
