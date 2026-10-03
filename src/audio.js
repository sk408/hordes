// HORDES — procedural chiptune music + SFX (Sk408 request).
// WebAudio only, ZERO audio files: oscillators + gain envelopes. Imports
// cleanly under node (no DOM) — AudioContext + storage are injectable so the
// unit tests run against fakes. Public API (FROZEN for hb1 integration):
//   init(), setMusicEnabled(b), getMusicEnabled(),
//   setSfxEnabled(b), getSfxEnabled(), playSfx(name), startMusic(), stopMusic()
// M2 additions: setMusicVolume(0..100) / getMusicVolume(), setSfxVolume /
// getSfxVolume (persisted beside the on/off flags; a volume of 0 is "off"),
// playSfx(name, arg) for the pitched families (arg = gem combo step), and
// setMusicMode('run' | 'boss') — the boss-fight section of the in-run music.
// WAVE-8/B cinematic stingers (SFX-class: gated by the sfx toggle ONLY, never
// the music toggle; fire once per phase transition — hb1 polls phaseAt()):
//   playIntroCue(phase):  OVERTAKE|HORDE, TITLE_SLAM|TITLE, FADE
//   playPortalCue(phase): BOSS_YELL|KILL, DISSOLVE, FADE, WALK, PAUSE, LINGER
//   playEscapeCue(id, arg): STEP, BOSS, ROAR, ESCAPE, GOLD (the escape cinematic)
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
const KEY_MUSIC_VOL = 'hordes_audio_music_vol';
const KEY_SFX_VOL = 'hordes_audio_sfx_vol';
// Slider defaults; at the default the bus gain equals the level the game
// shipped with (music 0.5, sfx 0.7), so an untouched profile sounds the same.
const DEFAULT_MUSIC_VOL = 70;
const DEFAULT_SFX_VOL = 80;
const MUSIC_BUS_GAIN = 0.5;
const SFX_BUS_GAIN = 0.7;

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
let musicVol = DEFAULT_MUSIC_VOL;   // 0..100, hydrated from storage
let sfxVol = DEFAULT_SFX_VOL;
let musicMode = 'run';     // 'run' | 'boss' — which arrangement the sequencer plays
let bossStep = 0;

// Music sequencer state.
let musicRunning = false;
let musicTimer = null;
let step = 0;
let nextNoteTime = 0;

// Per-sfx rate limiting (seconds between allowed plays; kills buzz).
const SFX_LIMITS = {
  radarPing: 3,
  shoot: 0.08, hit: 0.05, button: 0.05, levelup: 0.1, chest: 0.1, death: 0.5,
  fire_bolt: 0.09, fire_arc: 0.14, fire_blast: 0.16, fire_zap: 0.12, fire_seek: 0.14,
  kill: 0.06, eliteDeath: 0.25, bossDeath: 1, hurt: 0.18, gem: 0.045, potion: 0.15,
  item: 0.12, powerup: 0.2, draftPick: 0.1, evolve: 0.5, bossArrive: 1.5, slam: 0.2,
  warning: 0.5, victory: 1, uiMove: 0.03, uiConfirm: 0.05, uiDeny: 0.08,
};
// Weapon-fire families share one extra gate, so five weapons firing on the
// same frame make one sound, not a chord of five.
const FIRE_GATE = 0.05;
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

// ---------- Song arrangement (2026-09-16 owner request: "longer music") ------
// The 16 steps above are the HOOK, not the song: BASS/LEAD/HAT_STEPS used to
// BE the entire arrangement, so the whole tune looped every 1.818s (~33x per
// minute). The song is now 8 sections of 8-16 bars, ONE CHORD PER BAR (the
// hook's four chords in one bar became a real progression across bars), 104
// bars = 189.09s before the cycle returns to bar 1. Bar 1 of the song renders
// the legacy hook VERBATIM (see SECTIONS[0].intro), so every consumer of
// BASS/LEAD/HAT_STEPS — including the first-loop note-count test — still sees
// exactly the old pattern. Synthesis, gains and the lookahead scheduler are
// unchanged; only the arrangement grew.

// Chord table (bass octave): [name, root, third, fifth].
const CHORDS = {
  Am: ['Am', 110.00, 130.81, 164.81],
  C:  ['C',  130.81, 164.81, 196.00],
  Dm: ['Dm',  73.42,  87.31, 110.00],
  E:  ['E',   82.41, 103.83, 123.47],
  Em: ['Em',  82.41,  98.00, 123.47],
  F:  ['F',   87.31, 110.00, 130.81],
  G:  ['G',   98.00, 123.47, 146.83],
};
// Lead scale (A4..A5): the register the original hook sang in. 'scale' lead
// patterns index this; 'chord' patterns index the bar's own chord tones
// [root, third, fifth, octave] x4 (root 110 -> lead 440, as the hook did).
const SCALE = [440, 493.88, 523.25, 587.33, 659.25, 698.46, 783.99, 880];

// Bass styles: a 16-step pattern of chord degrees (-1 rest, 0 root, 1 third,
// 2 fifth, 3 octave) plus the tone() duration factor. Styles are shared
// between sections; the (bass, lead, hat) SIGNATURE per section stays unique.
const BASS_STYLES = {
  sparse:  { deg: [0, -1, -1, -1, -1, -1, -1, -1, 2, -1, -1, -1, -1, -1, -1, -1], dur: 3 },
  sparse2: { deg: [0, -1, -1, -1, -1, -1, -1, -1, 1, -1, -1, -1, -1, -1, -1, -1], dur: 3 },
  pulse:   { deg: [0, -1, -1, -1, 0, -1, -1, -1, 0, -1, -1, -1, 0, -1, -1, -1], dur: 0.9 },
  pulse2:  { deg: [0, -1, -1, -1, 0, -1, -1, -1, 2, -1, -1, -1, 0, -1, 2, -1], dur: 0.9 },
  walk:    { deg: [0, -1, -1, -1, 2, -1, -1, -1, 3, -1, -1, -1, 2, -1, -1, -1], dur: 0.9 },
  eighths: { deg: [0, -1, 0, -1, 0, -1, 2, -1, 0, -1, 0, -1, 0, -1, 2, -1], dur: 0.9 },
  drive:   { deg: [0, -1, 0, -1, 0, -1, 0, -1, 0, -1, 0, -1, 0, 0, 1, 2], dur: 0.9 },
  drive2:  { deg: [0, 0, -1, 0, -1, 0, -1, 0, 0, -1, 0, 0, -1, 0, 1, -1], dur: 0.9 },
};

// The SONG: opening (sparse, states the airy theme) -> main body -> turn ->
// tension -> tension peak -> VARIED return (same theme as the opening,
// ornamented and fuller, second half departs to Dm/E) -> coda that lands the
// final bar on E (V) so the cycle resolves back into bar 1's Am.
const SECTIONS = [
  { id: 'dawn',   label: 'Dawn (opening)',       bars: 12, prog: ['Am', 'F', 'C', 'G'],
    bass: 'sparse',  hats: [6, 14],
    lead: { mode: 'scale', pat: [5, -1, -1, -1, 4, -1, 2, -1, -1, -1, 4, -1, 2, -1, -1, -1] },
    intro: true },
  { id: 'march',  label: 'March (main A)',       bars: 12, prog: ['Am', 'F', 'C', 'G'],
    bass: 'pulse',   hats: [2, 6, 10, 14],
    lead: { mode: 'scale', pat: [0, -1, 2, 3, 4, -1, 3, -1, 2, 0, -1, 5, 4, -1, 3, -1] } },
  { id: 'flight', label: 'Flight (main B)',      bars: 12, prog: ['C', 'G', 'Am', 'F'],
    bass: 'walk',    hats: [0, 4, 8, 12],
    lead: { mode: 'chord', pat: [0, -1, 1, 2, 3, -1, 2, 1, 0, -1, 1, 2, 3, 2, 1, -1] } },
  { id: 'fold',   label: 'Fold (turn)',          bars: 12, prog: ['F', 'G', 'Am', 'Em'],
    bass: 'eighths', hats: [2, 6, 10, 14],
    lead: { mode: 'scale', pat: [7, -1, 6, -1, 5, -1, 4, -1, 3, -1, 2, -1, 1, -1, 0, -1] } },
  { id: 'press',  label: 'Press (tension)',      bars: 12, prog: ['Am', 'Am', 'F', 'E'],
    bass: 'drive',   hats: [0, 2, 4, 6, 8, 10, 12, 14],
    lead: { mode: 'chord', pat: [3, -1, -1, 3, -1, -1, 2, -1, 3, -1, -1, 3, -1, 4, -1, -1] } },
  { id: 'storm',  label: 'Storm (tension peak)', bars: 16, prog: ['Dm', 'Am', 'E', 'Am'],
    bass: 'drive2',  hats: [0, 2, 4, 6, 8, 10, 12, 14],
    lead: { mode: 'scale', pat: [7, -1, 5, 7, -1, 4, 5, -1, 7, 5, 4, -1, 2, 4, -1, 0] } },
  { id: 'return', label: 'Return (varied)',      bars: 16, prog: ['Am', 'F', 'C', 'G', 'Am', 'F', 'Dm', 'E'],
    bass: 'pulse2',  hats: [2, 6, 10, 12, 14],
    lead: { mode: 'scale', pat: [5, -1, 4, 5, -1, 4, -1, 2, -1, 4, 5, -1, 1, 2, 4, -1] } },
  { id: 'settle', label: 'Settle (coda)',        bars: 12, prog: ['F', 'G', 'Am', 'F', 'C', 'G', 'Am', 'G', 'F', 'G', 'Am', 'E'],
    bass: 'sparse2', hats: [6, 14],
    lead: { mode: 'scale', pat: [4, -1, -1, 2, -1, -1, 0, -1, 4, -1, -1, 2, -1, -1, 1, -1] } },
];

// Bar table: flattened, built once at module load — scheduleStep does zero
// allocation in the hot loop (array reads only).
const BAR_TABLE = SECTIONS.map((sec, sectionIndex) => {
  const st = BASS_STYLES[sec.bass];
  const rows = [];
  for (let b = 0; b < sec.bars; b++) {
    const ch = CHORDS[sec.prog[b % sec.prog.length]];
    const isIntro = sec.intro && b === 0;
    const bass = isIntro ? BASS.slice()
      : st.deg.map(d => d < 0 ? 0 : ch[1 + d] * (d === 3 ? 2 : 1));
    const lead = isIntro ? LEAD.slice()
      : sec.lead.pat.map(d => d < 0 ? 0
        : sec.lead.mode === 'chord' ? [ch[1] * 4, ch[2] * 4, ch[3] * 4, ch[1] * 8][d]
        : SCALE[d]);
    rows.push({
      section: sec.id, sectionIndex, barInSection: b,
      chord: isIntro ? 'Am' : ch[0],   // the hook bar walks Am-C-F-G; Am is its root
      bass, lead, hats: isIntro ? HAT_STEPS.slice() : sec.hats, bassDur: isIntro ? 0.9 : st.dur,
    });
  }
  return rows;
}).flat();
// THE BOSS SECTION: a second arrangement the sequencer switches to while a
// boss lives (setMusicMode). Same tempo and voices as the song, but a
// driving octave bass, a low Phrygian riff (the Bb over A is the menace) and
// a kick on every beat. 16 bars, looped for as long as the fight lasts.
const BOSS_PROG = ['Am', 'Am', 'F', 'E', 'Am', 'Am', 'Dm', 'E'];
const BOSS_RIFFS = [
  [220, 0, 220, 233.08, 0, 220, 0, 329.63, 220, 0, 220, 233.08, 0, 293.66, 261.63, 0],
  [440, 0, 0, 415.3, 440, 0, 523.25, 0, 466.16, 0, 440, 0, 415.3, 0, 329.63, 0],
];
const BOSS_TABLE = [];
for (let b = 0; b < 16; b++) {
  const ch = CHORDS[BOSS_PROG[b % BOSS_PROG.length]];
  const st = BASS_STYLES[b % 4 === 3 ? 'drive' : 'drive2'];
  BOSS_TABLE.push({
    section: 'boss', sectionIndex: SECTIONS.length, barInSection: b, chord: ch[0],
    bass: st.deg.map(d => d < 0 ? 0 : ch[1 + d] * (d === 3 ? 2 : 1)),
    lead: BOSS_RIFFS[(b >> 2) % 2].map(f => f ? f * (ch[1] / 110) : 0),
    hats: [0, 2, 4, 6, 8, 10, 12, 14], kicks: [0, 4, 8, 12], bassDur: 0.9,
  });
}
const BOSS_STEPS = BOSS_TABLE.length * STEPS;

const TOTAL_BARS = BAR_TABLE.length;
const TOTAL_STEPS = TOTAL_BARS * STEPS;
const CYCLE_SECONDS = TOTAL_STEPS * STEP_DUR;

// PURE step -> position mapper (tests and the structure map read this; the
// scheduler itself reads BAR_TABLE directly to stay allocation-free).
export function mapStep(s) {
  const g = ((s % TOTAL_STEPS) + TOTAL_STEPS) % TOTAL_STEPS;
  const t = BAR_TABLE[(g / STEPS) | 0];
  return { step: g, section: t.section, sectionIndex: t.sectionIndex,
    bar: (g / STEPS) | 0, barInSection: t.barInSection, stepInBar: g % STEPS,
    chord: t.chord };
}

export const MUSIC = {
  BPM, STEPS, BASS, LEAD, HAT_STEPS,
  SONG: { sections: SECTIONS, totalBars: TOTAL_BARS, totalSteps: TOTAL_STEPS,
    cycleSeconds: CYCLE_SECONDS, bars: BAR_TABLE },
  BOSS: { bars: BOSS_TABLE, totalSteps: BOSS_STEPS, cycleSeconds: BOSS_STEPS * STEP_DUR },
  mapStep,
};

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
// S2 (audit 2026-09-16): gesture-gated browsers (iOS Safari) create the
// AudioContext SUSPENDED, and before the audit nothing ever resumed it — every
// playSfx/startMusic "succeeded" silently into a frozen clock and the game
// stayed mute forever. Any sound attempt now re-tries the resume (the first
// one lands inside the user's gesture handler, where the browser allows it).
// Never throws, never blocks; a running ctx costs one property read.
function resumeIfSuspended() {
  if (!ctx || ctx.state !== 'suspended' || typeof ctx.resume !== 'function') return;
  try { const r = ctx.resume(); if (r && r.catch) r.catch(() => {}); } catch { /* ignore */ }
}

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
  sfxBus = ctx.createGain();  sfxBus.gain.value = busGain(SFX_BUS_GAIN, sfxVol, DEFAULT_SFX_VOL);  sfxBus.connect(master);
  musicBus = ctx.createGain(); musicBus.gain.value = busGain(MUSIC_BUS_GAIN, musicVol, DEFAULT_MUSIC_VOL); musicBus.connect(master);
  noiseBuf = null;
  if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
    try { const r = ctx.resume(); if (r && r.catch) r.catch(() => {}); } catch { /* ignore */ }
  }
  return ctx;
}

// Slider value -> bus gain: a square-law taper (even steps sound even),
// scaled so the default slider position lands exactly on `base`.
function busGain(base, vol, dflt) {
  const r = Math.max(0, Math.min(100, vol)) / dflt;
  return base * r * r;
}
function clampVol(v, dflt) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : dflt;
}

function hydrateFlags() {
  try {
    const m = storage.getItem(KEY_MUSIC); if (m !== null) musicEnabled = m === '1';
    const s = storage.getItem(KEY_SFX);   if (s !== null) sfxEnabled = s === '1';
    const mv = storage.getItem(KEY_MUSIC_VOL); if (mv !== null) musicVol = clampVol(mv, DEFAULT_MUSIC_VOL);
    const sv = storage.getItem(KEY_SFX_VOL);   if (sv !== null) sfxVol = clampVol(sv, DEFAULT_SFX_VOL);
  } catch { /* keep defaults */ }
}
hydrateFlags();

// Volume sliders (0..100). 0 switches the channel off (the same flag the old
// toggle wrote, so a profile muted before the sliders existed stays muted);
// any other value switches it on.
export function setMusicVolume(v) {
  musicVol = clampVol(v, DEFAULT_MUSIC_VOL);
  try { storage.setItem(KEY_MUSIC_VOL, String(musicVol)); } catch { /* ignore */ }
  if (musicBus) musicBus.gain.value = busGain(MUSIC_BUS_GAIN, musicVol, DEFAULT_MUSIC_VOL);
  setMusicEnabled(musicVol > 0);
  return musicVol;
}
export function getMusicVolume() { return musicEnabled ? musicVol : 0; }
export function setSfxVolume(v) {
  sfxVol = clampVol(v, DEFAULT_SFX_VOL);
  try { storage.setItem(KEY_SFX_VOL, String(sfxVol)); } catch { /* ignore */ }
  if (sfxBus) sfxBus.gain.value = busGain(SFX_BUS_GAIN, sfxVol, DEFAULT_SFX_VOL);
  setSfxEnabled(sfxVol > 0);
  return sfxVol;
}
export function getSfxVolume() { return sfxEnabled ? sfxVol : 0; }

export function setMusicEnabled(v) {
  musicEnabled = !!v;
  if (musicEnabled && musicVol <= 0) setMusicVolumeQuiet(DEFAULT_MUSIC_VOL);
  try { storage.setItem(KEY_MUSIC, musicEnabled ? '1' : '0'); } catch { /* ignore */ }
  if (!musicEnabled) stopMusic();          // cutting the switch silences now
}
export function getMusicEnabled() { return musicEnabled; }

// Switching a channel back on from a zero slider restores the default level.
function setMusicVolumeQuiet(v) {
  musicVol = v;
  try { storage.setItem(KEY_MUSIC_VOL, String(v)); } catch { /* ignore */ }
  if (musicBus) musicBus.gain.value = busGain(MUSIC_BUS_GAIN, v, DEFAULT_MUSIC_VOL);
}
export function setSfxEnabled(v) {
  sfxEnabled = !!v;
  if (sfxEnabled && sfxVol <= 0) {
    sfxVol = DEFAULT_SFX_VOL;
    try { storage.setItem(KEY_SFX_VOL, String(sfxVol)); } catch { /* ignore */ }
    if (sfxBus) sfxBus.gain.value = busGain(SFX_BUS_GAIN, sfxVol, DEFAULT_SFX_VOL);
  }
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

  // ---- M2 families. 'seq' = layered voices, each { v: 'tone' | 'noise',
  // at: seconds after the trigger, ...voice params }. ----
  // Weapon fire, one family per archetype group.
  fire_bolt:  { voice: 'seq', fire: true, layers: [   // volley, javelin, ricochet: a tight pluck
    { v: 'tone', type: 'square', freq: 1040, to: 360, dur: 0.07, gain: 0.09 },
    { v: 'noise', dur: 0.02, gain: 0.05 }] },
  fire_arc:   { voice: 'seq', fire: true, layers: [   // scythe, boomerang, orbit: a swish
    { v: 'noise', dur: 0.12, gain: 0.1 },
    { v: 'tone', type: 'triangle', freq: 300, to: 760, dur: 0.11, gain: 0.07 }] },
  fire_blast: { voice: 'seq', fire: true, layers: [   // nova, mine, meteor, ember: a thump
    { v: 'tone', type: 'sine', freq: 170, to: 46, dur: 0.2, gain: 0.26 },
    { v: 'noise', dur: 0.09, gain: 0.12 }] },
  fire_zap:   { voice: 'seq', fire: true, layers: [   // chain, beam: a crackle
    { v: 'tone', type: 'sawtooth', freq: 1900, to: 240, dur: 0.09, gain: 0.07 },
    { v: 'tone', type: 'square', freq: 2500, to: 900, dur: 0.05, gain: 0.04, at: 0.02 }] },
  fire_seek:  { voice: 'seq', fire: true, layers: [   // seeker: a rising chirp
    { v: 'tone', type: 'triangle', freq: 420, to: 1250, dur: 0.12, gain: 0.08 }] },
  // Enemies.
  kill:       { voice: 'seq', layers: [
    { v: 'tone', type: 'triangle', freq: 330, to: 90, dur: 0.09, gain: 0.13 },
    { v: 'noise', dur: 0.04, gain: 0.08 }] },
  eliteDeath: { voice: 'seq', layers: [
    { v: 'tone', type: 'sawtooth', freq: 280, to: 50, dur: 0.3, gain: 0.16 },
    { v: 'noise', dur: 0.16, gain: 0.14 },
    { v: 'tone', type: 'triangle', freq: 880, to: 1320, dur: 0.14, gain: 0.08, at: 0.08 }] },
  bossDeath:  { voice: 'seq', layers: [
    { v: 'tone', type: 'sawtooth', freq: 220, to: 30, dur: 0.9, gain: 0.26 },
    { v: 'tone', type: 'square', freq: 110, to: 28, dur: 0.9, gain: 0.16 },
    { v: 'noise', dur: 0.35, gain: 0.22 },
    { v: 'tone', type: 'triangle', freq: 523.25, dur: 0.16, gain: 0.1, at: 0.45 },
    { v: 'tone', type: 'triangle', freq: 783.99, dur: 0.16, gain: 0.1, at: 0.6 },
    { v: 'tone', type: 'triangle', freq: 1046.5, dur: 0.3, gain: 0.1, at: 0.75 }] },
  bossArrive: { voice: 'seq', layers: [
    { v: 'tone', type: 'sawtooth', freq: 73.4, to: 69, dur: 0.9, gain: 0.26 },
    { v: 'tone', type: 'sawtooth', freq: 110, to: 104, dur: 0.9, gain: 0.2 },
    { v: 'tone', type: 'sine', freq: 120, to: 36, dur: 0.4, gain: 0.3 },
    { v: 'noise', dur: 0.18, gain: 0.16 }] },
  slam:       { voice: 'seq', layers: [
    { v: 'tone', type: 'sine', freq: 140, to: 34, dur: 0.28, gain: 0.3 },
    { v: 'noise', dur: 0.12, gain: 0.16 }] },
  // The player.
  hurt:       { voice: 'seq', layers: [
    { v: 'tone', type: 'square', freq: 200, to: 70, dur: 0.16, gain: 0.2 },
    { v: 'noise', dur: 0.07, gain: 0.16 }] },
  gem:        { voice: 'seq', pitched: true, layers: [
    { v: 'tone', type: 'triangle', freq: 880, dur: 0.06, gain: 0.08 },
    { v: 'tone', type: 'sine', freq: 1320, dur: 0.07, gain: 0.05, at: 0.03 }] },
  potion:     { voice: 'seq', layers: [
    { v: 'tone', type: 'sine', freq: 300, to: 620, dur: 0.1, gain: 0.14 },
    { v: 'tone', type: 'sine', freq: 420, to: 900, dur: 0.12, gain: 0.12, at: 0.09 }] },
  item:       { voice: 'arp', type: 'triangle', notes: [783.99, 1174.7], noteDur: 0.07, gain: 0.11 },
  powerup:    { voice: 'arp', type: 'square', notes: [392, 523.25, 659.25, 783.99], noteDur: 0.06, gain: 0.08 },
  draftPick:  { voice: 'seq', layers: [
    { v: 'tone', type: 'triangle', freq: 659.25, dur: 0.1, gain: 0.12 },
    { v: 'tone', type: 'triangle', freq: 987.77, dur: 0.16, gain: 0.12, at: 0.07 },
    { v: 'tone', type: 'sine', freq: 1975.5, dur: 0.12, gain: 0.05, at: 0.07 }] },
  evolve:     { voice: 'arp', type: 'sawtooth', notes: [261.63, 329.63, 392, 523.25, 659.25, 783.99, 1046.5, 1318.5], noteDur: 0.07, gain: 0.09 },
  warning:    { voice: 'arp', type: 'square', notes: [880, 660, 880, 660], noteDur: 0.11, gain: 0.09 },
  victory:    { voice: 'arp', type: 'triangle', notes: [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.5], noteDur: 0.12, gain: 0.13 },
  // M5b: the radar picks up a site you have not reached yet (quiet, throttled).
  radarPing:  { voice: 'seq', layers: [
    { v: 'tone', type: 'sine', freq: 1568, dur: 0.07, gain: 0.04 },
    { v: 'tone', type: 'sine', freq: 2093, dur: 0.09, gain: 0.03, at: 0.08 }] },
  // Menus.
  uiMove:     { voice: 'tone', type: 'square',   freq: 520, to: 520, dur: 0.025, gain: 0.05 },
  uiConfirm:  { voice: 'seq', layers: [
    { v: 'tone', type: 'square', freq: 660, dur: 0.04, gain: 0.07 },
    { v: 'tone', type: 'square', freq: 990, dur: 0.05, gain: 0.07, at: 0.04 }] },
  uiDeny:     { voice: 'seq', layers: [
    { v: 'tone', type: 'square', freq: 196, dur: 0.07, gain: 0.09 },
    { v: 'tone', type: 'square', freq: 147, dur: 0.1, gain: 0.09, at: 0.07 }] },
};
export { SFX };

// arg: for the pitched families (gem), the combo step — each step raises the
// pitch a whole tone, so a stream of pickups climbs.
export function playSfx(name, arg) {
  const def = SFX[name];
  if (!def || !sfxEnabled || !ctx || hiddenMute) return false;
  resumeIfSuspended();   // S2 (audit 2026-09-16): self-heal a gesture-gated ctx
  const now = ctx.currentTime;
  const limit = SFX_LIMITS[name] ?? 0.02;
  if (lastPlayed[name] !== undefined && now - lastPlayed[name] < limit) return false;
  if (def.fire) {
    if (lastPlayed['fire:*'] !== undefined && now - lastPlayed['fire:*'] < FIRE_GATE) return false;
    lastPlayed['fire:*'] = now;
  }
  lastPlayed[name] = now;

  if (def.voice === 'seq') {
    const mul = def.pitched ? Math.pow(2, Math.max(0, Math.min(12, arg | 0)) / 6) : 1;
    for (const l of def.layers) {
      const when = now + (l.at || 0);
      if (l.v === 'noise') noise(ctx, sfxBus, { dur: l.dur, gain: l.gain, when });
      else tone(ctx, sfxBus, { type: l.type, freq: l.freq * mul, to: l.to ? l.to * mul : undefined, dur: l.dur, gain: l.gain, when });
    }
    return true;
  }

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
  if (!fn || hiddenMute || !cueAllowed('intro:' + phase)) return false;
  fn(ctx.currentTime);
  return true;
}

export function playPortalCue(phase) {
  const fn = PORTAL_CUES[phase];
  if (!fn || hiddenMute || !cueAllowed('portal:' + phase)) return false;
  fn(ctx.currentTime);
  return true;
}

// ---------- Escape cinematic cues (src/escape_cine.js) ----------
// STEP is one beat of the chase bed; `n` is which beat (the note climbs and
// the hat gets louder as the chase builds). BOSS is a footfall, ROAR the
// boss's lunge, ESCAPE the dive through the portal, GOLD the payout. All are
// short, so a skip never leaves a sound hanging. SFX-class: the sfx toggle
// gates them; a hidden tab is silent.
export const ESCAPE_CUES = {
  STEP: (when, n) => {
    const k = Math.min(1, n / 28);
    const root = 55 * Math.pow(2, Math.floor(k * 7) / 12);
    const f = n % 4 === 3 ? root * 1.5 : n % 2 ? root * 2 : root;
    tone(ctx, sfxBus, { type: 'square', freq: f, to: f * 0.97, dur: 0.11, gain: 0.16 + 0.1 * k, when });
    if (n % 2) noise(ctx, sfxBus, { dur: 0.03, gain: 0.05 + 0.08 * k, when });
  },
  BOSS: (when) => {
    tone(ctx, sfxBus, { type: 'sine', freq: 110, to: 30, dur: 0.3, gain: 0.42, when });
    noise(ctx, sfxBus, { dur: 0.1, gain: 0.14, when });
  },
  ROAR: (when) => {
    sus(ctx, sfxBus, { type: 'sawtooth', freq: 170, to: 52, dur: 0.55, gain: 0.44, when, hold: 0.8 });
    sus(ctx, sfxBus, { type: 'sawtooth', freq: 178, to: 56, dur: 0.55, gain: 0.44, when, hold: 0.8 });
    tone(ctx, sfxBus, { type: 'square', freq: 85, to: 28, dur: 0.55, gain: 0.22, when });
    noise(ctx, sfxBus, { dur: 0.2, gain: 0.18, when });
  },
  ESCAPE: (when) => {
    [659.25, 783.99, 1046.5, 1318.5, 1568].forEach((f, i) =>
      tone(ctx, sfxBus, { type: 'triangle', freq: f, dur: 0.14, gain: 0.14, when: when + i * 0.05 }));
    tone(ctx, sfxBus, { type: 'sine', freq: 2093, dur: 0.4, gain: 0.07, when: when + 0.25 });
  },
  GOLD: (when) => {
    [1318.5, 1760, 2217.5].forEach((f, i) =>
      tone(ctx, sfxBus, { type: 'triangle', freq: f, dur: 0.08, gain: 0.11, when: when + i * 0.07 }));
  },
};
export function playEscapeCue(id, arg) {
  const fn = ESCAPE_CUES[id];
  if (!fn || hiddenMute || !ctx || !sfxEnabled) return false;
  resumeIfSuspended();
  fn(ctx.currentTime, Math.max(0, Number(arg) || 0));
  return true;
}

// ---------- Music sequencer (lookahead scheduler) ----------
function scheduleStep(s, when) {
  // Song arrangement: the bar table is precomputed, so the hot path is pure
  // array reads — no per-step allocation, no drift (times still accumulate in
  // scheduleAhead). Bar 1 renders the legacy hook verbatim.
  const g = ((s % TOTAL_STEPS) + TOTAL_STEPS) % TOTAL_STEPS;
  const bar = BAR_TABLE[(g / STEPS) | 0];
  const i = g % STEPS;
  const bass = bar.bass[i];
  if (bass) tone(ctx, musicBus, { type: 'square', freq: bass, dur: STEP_DUR * bar.bassDur, gain: 0.35, when });
  const lead = bar.lead[i];
  if (lead) tone(ctx, musicBus, { type: 'triangle', freq: lead, dur: STEP_DUR * 0.8, gain: 0.3, when });
  if (bar.hats.includes(i)) noise(ctx, musicBus, { dur: 0.03, gain: 0.08, when });
}

// One step of the boss section: square bass, sawtooth riff, hats, kick.
function scheduleBossStep(s, when) {
  const g = ((s % BOSS_STEPS) + BOSS_STEPS) % BOSS_STEPS;
  const bar = BOSS_TABLE[(g / STEPS) | 0];
  const i = g % STEPS;
  const bass = bar.bass[i];
  if (bass) tone(ctx, musicBus, { type: 'square', freq: bass, dur: STEP_DUR * bar.bassDur, gain: 0.36, when });
  const lead = bar.lead[i];
  if (lead) tone(ctx, musicBus, { type: 'sawtooth', freq: lead, dur: STEP_DUR * 0.9, gain: 0.2, when });
  if (bar.hats.includes(i)) noise(ctx, musicBus, { dur: 0.03, gain: 0.09, when });
  if (bar.kicks.includes(i)) tone(ctx, musicBus, { type: 'sine', freq: 150, to: 45, dur: 0.12, gain: 0.4, when });
}

function scheduleAhead() {
  if (!musicRunning || !ctx) return;
  while (nextNoteTime < ctx.currentTime + LOOKAHEAD) {
    if (musicMode === 'boss') {
      scheduleBossStep(bossStep, nextNoteTime);
      bossStep = (bossStep + 1) % BOSS_STEPS;
    } else {
      scheduleStep(step, nextNoteTime);
      step = (step + 1) % TOTAL_STEPS;   // the whole SONG cycles, not one bar
    }
    nextNoteTime += STEP_DUR;
  }
}

// Which arrangement plays: 'run' (the song) or 'boss' (the fight section).
// Entering 'boss' starts its section from bar 1; leaving resumes the song at
// the step it stopped on. Safe to call every frame.
export function setMusicMode(mode) {
  const m = mode === 'boss' ? 'boss' : 'run';
  if (m === musicMode) return false;
  musicMode = m;
  if (m === 'boss') bossStep = 0;
  return true;
}
export function getMusicMode() { return musicMode; }

// A hidden tab plays on in silence: no SFX, no cues, and the music stays stopped.
let hiddenMute = false;
export function setHiddenMute(on) { hiddenMute = !!on; }
export function getHiddenMute() { return hiddenMute; }

export function startMusic() {
  if (!musicEnabled || !ctx || musicRunning || hiddenMute) return false;
  resumeIfSuspended();   // S2 (audit 2026-09-16): self-heal a gesture-gated ctx
  musicRunning = true;
  step = 0;
  bossStep = 0;
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

// OWNER 2026-09-19 ("can we also stop the music when the tab is hidden?"): the
// reader that makes stop/resume possible at all. There is no pause/resume pair in
// this module — the music bed is a scheduler, not a track — so the caller has to
// REMEMBER whether it was playing before it stopped it, or a player who hides the
// tab mid-run comes back to a silent run. Pure read, no state change.
export function isMusicRunning() { return musicRunning; }

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
    musicVol = DEFAULT_MUSIC_VOL; sfxVol = DEFAULT_SFX_VOL;
    musicMode = 'run'; bossStep = 0;
    step = 0; nextNoteTime = 0;
    for (const k of Object.keys(lastPlayed)) delete lastPlayed[k];
    hydrateFlags();
  },
  scheduleAhead,                    // manual scheduler pass (fake clock)
  scheduleStep,                     // real per-step synthesis (offline render drives this)
  scheduleBossStep,
  state: () => ({ ctx, musicRunning, master, musicBus, sfxBus }),
};
