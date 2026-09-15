// HORDES — procedural chiptune music + SFX (Sk408 request).
// WebAudio only, ZERO audio files: oscillators + gain envelopes. Imports
// cleanly under node (no DOM) — AudioContext + storage are injectable so the
// unit tests run against fakes. Public API (FROZEN for hb1 integration):
//   init(), setMusicEnabled(b), getMusicEnabled(),
//   setSfxEnabled(b), getSfxEnabled(), playSfx(name), startMusic(), stopMusic()
// WAVE-8/B cinematic stingers (SFX-class: gated by the sfx toggle ONLY, never
// the music toggle; fire once per phase transition — hb1 polls phaseAt()):
//   playIntroCue(phase):  OVERTAKE|HORDE, TITLE_SLAM|TITLE, FADE
//   playPortalCue(phase): BOSS_YELL|KILL, DISSOLVE, FADE, WALK, PAUSE, LINGER
// Call init() from a user gesture (autoplay policy): it lazily creates the
// AudioContext, resumes it if suspended, and is idempotent.
//
// Extra exports (AUDIO_TEST, MUSIC, SFX) are read-only/test seams — hb1
// should not need them.

// ---------- Injectables (node-safe, meta.js pattern) ----------
function detectAudioContext() {
  try {
    return globalThis.AudioContext || globalThis.webkitAudioContext || null;
  } catch { return null; }
}
function detectStorage() {
  try {
    const s = globalThis.localStorage;
    if (s && typeof s.getItem === 'function') return s;
  } catch { /* sandboxed — fall through to no-op */ }
  return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
}

const KEY_MUSIC = 'hordes_audio_music';
const KEY_SFX = 'hordes_audio_sfx';

let AudioCtxCtor = detectAudioContext();
let storage = detectStorage();

// ---------- Module state ----------
let ctx = null;            // created by init()
let master = null;         // master gain (~0.15 — pleasant-low volume)
let sfxBus = null;
let musicBus = null;
let noiseBuf = null;       // cached white-noise buffer per context
let musicEnabled = true;   // hydrated from storage
let sfxEnabled = true;

// Music sequencer state.
let musicRunning = false;
let musicTimer = null;
let step = 0;
let nextNoteTime = 0;

// Per-sfx rate limiting (seconds between allowed plays; kills buzz).
const SFX_LIMITS = { shoot: 0.08, hit: 0.05, button: 0.05, levelup: 0.1, chest: 0.1, death: 0.5 };
const lastPlayed = Object.create(null);

// ---------- Music pattern (16 steps @ 132bpm 16th-notes) ----------
const BPM = 132;
const STEPS = 16;
const STEP_DUR = 60 / BPM / 4;              // 16th note ~0.1136s
const LOOKAHEAD = 0.12;                     // schedule this far ahead (s)
const TICK_MS = 25;                         // scheduler wake cadence

// Am -> C -> F -> G progression, one bass hit per two steps.
const BASS = [110, 0, 110, 0, 130.8, 0, 130.8, 0, 87.3, 0, 87.3, 0, 98, 0, 98, 0];
// Lead triangle melody over the same loop (A-minor pentatonic-ish).
const LEAD = [440, 0, 523.3, 587.3, 659.3, 0, 587.3, 0, 523.3, 440, 0, 349.2, 392, 440, 0, 0];
// Noise hats on the off-beats.
const HAT_STEPS = [2, 6, 10, 14];
export const MUSIC = { BPM, STEPS, BASS, LEAD, HAT_STEPS };

// ---------- WebAudio helpers ----------
function ensureNoiseBuffer(c) {
  if (noiseBuf) return noiseBuf;
  const len = Math.floor(c.sampleRate * 0.1) || 4410;
  noiseBuf = c.createBuffer(1, len, c.sampleRate || 44100);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

// One oscillator voice with a fast attack / exp-decay envelope.
function tone(c, dest, { type, freq, to, dur, gain, when }) {
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, when);
  if (to && to !== freq) osc.frequency.exponentialRampToValueAtTime(to, when + dur);
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(gain, when + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  osc.connect(g); g.connect(dest);
  osc.start(when);
  osc.stop(when + dur + 0.02);
}

// White-noise burst (hits, hats).
function noise(c, dest, { dur, gain, when }) {
  const src = c.createBufferSource();
  const g = c.createGain();
  src.buffer = ensureNoiseBuffer(c);
  g.gain.setValueAtTime(gain, when);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  src.connect(g); g.connect(dest);
  src.start(when);
  src.stop(when + dur + 0.02);
}

// ---------- Public API ----------
export function init() {
  if (ctx) {
    if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      try { const r = ctx.resume(); if (r && r.catch) r.catch(() => {}); } catch { /* ignore */ }
    }
    return ctx; // idempotent
  }
  if (!AudioCtxCtor) return null;
  try { ctx = new AudioCtxCtor(); } catch { ctx = null; return null; }
  master = ctx.createGain();
  master.gain.value = 0.15;                 // pleasant-low master volume
  master.connect(ctx.destination);
  sfxBus = ctx.createGain();  sfxBus.gain.value = 0.7;  sfxBus.connect(master);
  musicBus = ctx.createGain(); musicBus.gain.value = 0.5; musicBus.connect(master);
  noiseBuf = null;
  if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
    try { const r = ctx.resume(); if (r && r.catch) r.catch(() => {}); } catch { /* ignore */ }
  }
  return ctx;
}

function hydrateFlags() {
  try {
    const m = storage.getItem(KEY_MUSIC); if (m !== null) musicEnabled = m === '1';
    const s = storage.getItem(KEY_SFX);   if (s !== null) sfxEnabled = s === '1';
  } catch { /* keep defaults */ }
}
hydrateFlags();

export function setMusicEnabled(v) {
  musicEnabled = !!v;
  try { storage.setItem(KEY_MUSIC, musicEnabled ? '1' : '0'); } catch { /* ignore */ }
  if (!musicEnabled) stopMusic();          // cutting the switch silences now
}
export function getMusicEnabled() { return musicEnabled; }

export function setSfxEnabled(v) {
  sfxEnabled = !!v;
  try { storage.setItem(KEY_SFX, sfxEnabled ? '1' : '0'); } catch { /* ignore */ }
}
export function getSfxEnabled() { return sfxEnabled; }

// SFX voices. All rate-limited (shoot max ~1 per 80ms) to avoid buzz.
const SFX = {
  shoot:   { voice: 'tone', type: 'square',   freq: 880,   to: 220, dur: 0.09, gain: 0.12 },
  hit:     { voice: 'noise', dur: 0.06, gain: 0.18 },
  button:  { voice: 'tone', type: 'square',   freq: 660,   to: 660, dur: 0.04, gain: 0.08 },
  death:   { voice: 'tone', type: 'sawtooth', freq: 440,   to: 60,  dur: 0.6,  gain: 0.15 },
  // Arpeggios are sequences of tones scheduled back-to-back.
  levelup: { voice: 'arp', type: 'triangle', notes: [523.25, 659.25, 783.99, 1046.5], noteDur: 0.09, gain: 0.12 },
  chest:   { voice: 'arp', type: 'triangle', notes: [1318.5, 1760, 2217.5],          noteDur: 0.07, gain: 0.1 },
};
export { SFX };

export function playSfx(name) {
  const def = SFX[name];
  if (!def || !sfxEnabled || !ctx) return false;
  const now = ctx.currentTime;
  const limit = SFX_LIMITS[name] ?? 0.02;
  if (lastPlayed[name] !== undefined && now - lastPlayed[name] < limit) return false;
  lastPlayed[name] = now;

  if (def.voice === 'tone') {
    tone(ctx, sfxBus, { ...def, when: now });
  } else if (def.voice === 'noise') {
    noise(ctx, sfxBus, { ...def, when: now });
  } else { // arp
    def.notes.forEach((f, i) => {
      tone(ctx, sfxBus, { type: def.type, freq: f, dur: def.noteDur, gain: def.gain, when: now + i * def.noteDur });
    });
  }
  return true;
}

// ---------- Cinematic stingers (WAVE-8/B) ----------
// Intro (src/intro.js PHASES: OVERTAKE 2500–5000ms, TITLE stamps ~4300ms,
// FADE 6000–7000ms) + portal (src/portal_cine.js: KILL/WALK/DISSOLVE/FADE,
// ~4s). Fired once per phase transition; a short re-fire guard stops a
// double-fire from stacking cues. SFX-class: sfx toggle gates, music does NOT.

// Sustained voice: fast attack, hold, release — tone()'s one-shot exp decay
// would fade a multi-second drone to silence long before its dur is up.
function sus(c, dest, { type, freq, to, dur, gain, when, hold = 0.7 }) {
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, when);
  if (to && to !== freq) osc.frequency.exponentialRampToValueAtTime(to, when + dur);
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(gain, when + 0.04);
  g.gain.setValueAtTime(gain, when + dur * hold);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  osc.connect(g); g.connect(dest);
  osc.start(when);
  osc.stop(when + dur + 0.02);
}

// intro OVERTAKE/HORDE — rising low drone: detuned saws sweeping up (~2.5s).
function introOvertake(when) {
  sus(ctx, sfxBus, { type: 'sawtooth', freq: 50,   to: 210, dur: 2.5, gain: 0.22, when });
  sus(ctx, sfxBus, { type: 'sawtooth', freq: 51.5, to: 216, dur: 2.5, gain: 0.22, when });
}
// intro TITLE_SLAM — impact stinger: noise burst + low thump at the stamp.
function introTitleSlam(when) {
  noise(ctx, sfxBus, { dur: 0.22, gain: 0.32, when });
  tone(ctx, sfxBus, { type: 'sine', freq: 130, to: 38, dur: 0.4, gain: 0.4, when });
}
// intro FADE — short downward sweep into black.
function introFade(when) {
  tone(ctx, sfxBus, { type: 'sawtooth', freq: 320, to: 60, dur: 0.5, gain: 0.14, when });
}
// portal BOSS_YELL — pitched descending growl (~0.6s; detuned saws + sub
// square give the fm-ish beat; louder than average sfx, avg gain ~0.12–0.18).
function portalBossYell(when) {
  sus(ctx, sfxBus, { type: 'sawtooth', freq: 190, to: 62, dur: 0.6, gain: 0.42, when, hold: 0.8 });
  sus(ctx, sfxBus, { type: 'sawtooth', freq: 197, to: 66, dur: 0.6, gain: 0.42, when, hold: 0.8 });
  tone(ctx, sfxBus, { type: 'square',  freq: 95,  to: 31, dur: 0.6, gain: 0.2,  when });
}
// portal DISSOLVE — spacey shimmer: high sine arpeggio, gapped spacing for a
// delay/echo feel (~1.5s total).
function portalDissolve(when) {
  const NOTES = [1046.5, 1318.5, 1568, 2093, 2637, 3136];
  NOTES.forEach((f, i) => tone(ctx, sfxBus, { type: 'sine', freq: f, dur: 0.16, gain: 0.09, when: when + i * 0.22 }));
}
// transitional blip (portal WALK / FADE).
function cueBlip(when) {
  tone(ctx, sfxBus, { type: 'triangle', freq: 500, to: 260, dur: 0.09, gain: 0.1, when });
}

const INTRO_CUES = {
  OVERTAKE: introOvertake, HORDE: introOvertake,
  TITLE_SLAM: introTitleSlam, TITLE: introTitleSlam,
  FADE: introFade,
};
// G16: exported read-only so test/test_portal_cine.mjs can assert every PHASES
// name has a cue (a silent transition is a defect — binding rule 5).
export const PORTAL_CUES = {
  BOSS_YELL: portalBossYell, KILL: portalBossYell,
  DISSOLVE: portalDissolve,
  FADE: cueBlip, WALK: cueBlip,
  // G16 beats (binding rule 5 — a silent transition is a defect): the held
  // pause and the linger-on-the-portal both take the transitional blip.
  PAUSE: cueBlip, LINGER: cueBlip,
};

const CUE_REFIRE = 0.4; // s — cues are one-shot per phase transition

function cueAllowed(key) {
  if (!ctx || !sfxEnabled) return false;   // music toggle deliberately NOT checked
  const now = ctx.currentTime;
  if (lastPlayed[key] !== undefined && now - lastPlayed[key] < CUE_REFIRE) return false;
  lastPlayed[key] = now;
  return true;
}

export function playIntroCue(phase) {
  const fn = INTRO_CUES[phase];
  if (!fn || !cueAllowed('intro:' + phase)) return false;
  fn(ctx.currentTime);
  return true;
}

export function playPortalCue(phase) {
  const fn = PORTAL_CUES[phase];
  if (!fn || !cueAllowed('portal:' + phase)) return false;
  fn(ctx.currentTime);
  return true;
}

// ---------- Music sequencer (lookahead scheduler) ----------
function scheduleStep(s, when) {
  const bass = BASS[s % STEPS];
  if (bass) tone(ctx, musicBus, { type: 'square', freq: bass, dur: STEP_DUR * 0.9, gain: 0.35, when });
  const lead = LEAD[s % STEPS];
  if (lead) tone(ctx, musicBus, { type: 'triangle', freq: lead, dur: STEP_DUR * 0.8, gain: 0.3, when });
  if (HAT_STEPS.includes(s % STEPS)) noise(ctx, musicBus, { dur: 0.03, gain: 0.08, when });
}

function scheduleAhead() {
  if (!musicRunning || !ctx) return;
  while (nextNoteTime < ctx.currentTime + LOOKAHEAD) {
    scheduleStep(step, nextNoteTime);
    nextNoteTime += STEP_DUR;
    step = (step + 1) % STEPS;
  }
}

export function startMusic() {
  if (!musicEnabled || !ctx || musicRunning) return false;
  musicRunning = true;
  step = 0;
  nextNoteTime = ctx.currentTime + 0.05;
  scheduleAhead();
  musicTimer = setInterval(scheduleAhead, TICK_MS);
  return true;
}

export function stopMusic() {
  if (!musicRunning) return false;
  musicRunning = false;
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  return true; // already-scheduled notes (< LOOKAHEAD ahead) ring out naturally
}

// ---------- Test-only seam (fakes inject here; NOT part of the frozen API) ----------
export const AUDIO_TEST = {
  setDeps({ AudioContext: ac, storage: st } = {}) {
    if (ac !== undefined) AudioCtxCtor = ac;
    if (st !== undefined) storage = st;
  },
  reset() {
    stopMusic();
    ctx = null; master = null; sfxBus = null; musicBus = null; noiseBuf = null;
    musicEnabled = true; sfxEnabled = true;
    step = 0; nextNoteTime = 0;
    for (const k of Object.keys(lastPlayed)) delete lastPlayed[k];
    hydrateFlags();
  },
  scheduleAhead,                    // manual scheduler pass (fake clock)
  state: () => ({ ctx, musicRunning, master, musicBus, sfxBus }),
};
