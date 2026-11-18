// HORDES — the sound list, the "busy fight" and the level meter shared by the
// listening page (listen/index.html) and the measuring tool
// (tools/measure_sfx_mix.mjs). Browser-only helpers: nothing here runs in the
// game, and tools/ is not precached.
//
// render(A, job, opts) plays one job into an OfflineAudioContext through the
// REAL src/audio.js graph (buses, master, the mix and its limiter) and returns
// the AudioBuffer. A job is one sound, one movie cue, a busy fight, or the
// worst case (a busy fight with every loud sound fired on the same instant).

export const SR = 48000;

// Every sound the game plays, by category. kind 'sfx' goes through playSfx;
// the others are the movie cues (intro, portal, escape) with their phase.
export const GROUPS = [
  { id: 'combat', label: 'Combat (heard many times a second)', items: [
    ['sfx', 'hit'], ['sfx', 'kill'], ['sfx', 'gem'], ['sfx', 'fire_bolt'], ['sfx', 'fire_arc'],
    ['sfx', 'fire_blast'], ['sfx', 'fire_zap'], ['sfx', 'fire_seek'], ['sfx', 'shoot'],
    ['sfx', 'hurt'], ['sfx', 'slam'], ['sfx', 'eliteDeath'], ['sfx', 'potion']] },
  { id: 'reward', label: 'Rewards and events', items: [
    ['sfx', 'chest'], ['sfx', 'chestEmpty'], ['sfx', 'item'], ['sfx', 'powerup'], ['sfx', 'levelup'],
    ['sfx', 'draftPick'], ['sfx', 'evolve'], ['sfx', 'warning'], ['sfx', 'radarPing'],
    ['sfx', 'bossArrive'], ['sfx', 'bossDeath'], ['sfx', 'death'], ['sfx', 'victory']] },
  { id: 'ui', label: 'Menus', items: [
    ['sfx', 'uiMove'], ['sfx', 'uiConfirm'], ['sfx', 'uiDeny'], ['sfx', 'button']] },
  { id: 'movie', label: 'Movie cues', items: [
    ['intro', 'OVERTAKE'], ['intro', 'TITLE_SLAM'], ['intro', 'FADE'],
    ['portal', 'BOSS_YELL'], ['portal', 'DISSOLVE'], ['portal', 'WALK'],
    ['escape', 'STEP', 4], ['escape', 'STEP', 28], ['escape', 'BOSS'], ['escape', 'ROAR'],
    ['escape', 'ESCAPE'], ['escape', 'GOLD']] },
];
export const itemKey = (it) => it[0] === 'sfx' ? it[1] : it[0] + ':' + it[1] + (it[2] != null ? '#' + it[2] : '');

// A small seeded random source (mulberry32), so a busy fight is the same
// fight every time it is rendered or played.
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Minute 10 of a run, by the sound gates: five weapon families firing (the
// shared fire gate lets about 20 a second through), hits and kills at their
// limits, a stream of gems whose combo climbs, the hero hurt now and then, an
// elite down, a slam, a level-up. Every request goes through the real rate
// limits (playSfxAt), so this is what the game can actually stack.
export const FIGHT_SECONDS = 8;
export function busyFight(A, t0, seed = 10) {
  const r = seeded(seed);
  const fire = ['fire_bolt', 'fire_arc', 'fire_blast', 'fire_zap', 'fire_seek'];
  let combo = 0;
  for (let t = 0; t < FIGHT_SECONDS; t += 0.01) {
    const at = t0 + t;
    if (r() < 0.6) A.AUDIO_TEST.playSfxAt(fire[(r() * 5) | 0], 0, at);
    if (r() < 0.5) A.AUDIO_TEST.playSfxAt('hit', 0, at);
    if (r() < 0.3) A.AUDIO_TEST.playSfxAt('kill', 0, at);
    if (r() < 0.4) { A.AUDIO_TEST.playSfxAt('gem', combo, at); combo = combo >= 12 ? 0 : combo + 1; }
    if (r() < 0.02) A.AUDIO_TEST.playSfxAt('hurt', 0, at);
    if (r() < 0.004) A.AUDIO_TEST.playSfxAt('eliteDeath', 0, at);
    if (r() < 0.004) A.AUDIO_TEST.playSfxAt('slam', 0, at);
  }
  A.AUDIO_TEST.playSfxAt('levelup', 0, t0 + 5);
}
// The worst case: the busy fight, and at 4 s every loud sound at once (the
// boss roars of both movies, the boss arriving and dying, a slam, an elite).
export function worstCase(A, t0) {
  busyFight(A, t0);
  const at = t0 + 4;
  for (const n of ['bossArrive', 'bossDeath', 'death', 'slam', 'eliteDeath', 'hurt', 'evolve']) A.AUDIO_TEST.playSfxAt(n, 0, at);
  A.AUDIO_TEST.runCue('portal', 'BOSS_YELL', at);
  A.AUDIO_TEST.runCue('escape', 'ROAR', at);
  A.AUDIO_TEST.runCue('escape', 'BOSS', at);
  A.AUDIO_TEST.runCue('intro', 'TITLE_SLAM', at);
}

// Plays one item at ctx time `at` through the current context.
export function playItem(A, it, at) {
  if (it[0] === 'sfx') return A.AUDIO_TEST.playSfxAt(it[1], 0, at);
  return A.AUDIO_TEST.runCue(it[0], it[1], at, it[2] || 0);
}

// Renders a job offline through the real graph in the given mix.
// job: { item } | { fight: true } | { worst: true }
export async function render(A, job, mix) {
  const len = job.item ? (job.item[1] === 'OVERTAKE' ? 2.8 : job.item[1] === 'bossDeath' ? 1.4 : 1.2) : FIGHT_SECONDS + 1;
  const oc = new OfflineAudioContext(2, Math.round(SR * len), SR);
  // A throwaway store: rendering must not change the mix the player chose.
  const mem = new Map();
  const store = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  A.AUDIO_TEST.setDeps({ AudioContext: function () { return oc; }, rng: seeded(7), storage: store });
  A.AUDIO_TEST.reset();
  A.init();
  A.setMixMode(mix);
  const t0 = 0.02;
  if (job.item) playItem(A, job.item, t0);
  else if (job.worst) worstCase(A, t0);
  else busyFight(A, t0);
  const buf = await oc.startRendering();
  A.AUDIO_TEST.setDeps({ rng: null });
  return buf;
}
// Puts audio.js back on the page's real context factory and storage after renders.
export function restore(A) {
  let st = null;
  try { st = globalThis.localStorage; } catch { st = null; }
  A.AUDIO_TEST.setDeps({ AudioContext: globalThis.AudioContext || globalThis.webkitAudioContext,
    storage: st || { getItem: () => null, setItem() {}, removeItem() {} }, rng: null });
  A.AUDIO_TEST.reset();
}

// Level of a rendered buffer: peak (dBFS), RMS over the part that sounds
// (dBFS), the loudest 400 ms (momentary LUFS, BS.1770 K-weighting at 48 kHz)
// and, for long renders, the integrated loudness (LUFS, gated).
export function measure(buf) {
  function biquad(x, b, a) {
    const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) {
      const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2;
      x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
    }
    return y;
  }
  const chans = [];
  let peak = 0, sq = 0, n = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const raw = buf.getChannelData(c);
    for (let i = 0; i < raw.length; i++) {
      const v = raw[i]; const a = v < 0 ? -v : v; if (a > peak) peak = a;
      if (a > 1e-4) { sq += v * v; n++; }
    }
    const k1 = biquad(raw, [1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585]);
    chans.push(biquad(k1, [1, -2, 1], [1, -1.99004745483398, 0.99007225036621]));
  }
  const blk = Math.round(0.4 * SR), hop = Math.round(0.1 * SR);
  const z = [];
  for (let st = 0; st + blk <= chans[0].length; st += hop) {
    let e = 0;
    for (const ch of chans) { let s = 0; for (let i = st; i < st + blk; i++) s += ch[i] * ch[i]; e += s / blk; }
    z.push(e);
  }
  const L = (e) => (e > 0 ? -0.691 + 10 * Math.log10(e) : -200);
  const mMax = z.length ? L(Math.max(...z)) : -200;
  let g = z.filter((e) => L(e) > -70);
  const rel = L(g.reduce((a, b) => a + b, 0) / Math.max(1, g.length)) - 10;
  g = g.filter((e) => L(e) > rel);
  const lufs = L(g.reduce((a, b) => a + b, 0) / Math.max(1, g.length));
  const r2 = (x) => Math.round(x * 10) / 10;
  return {
    peakDb: r2(peak > 0 ? 20 * Math.log10(peak) : -200),
    rmsDb: r2(n ? 10 * Math.log10(sq / n) : -200),
    momentaryLufs: r2(mMax),
    lufs: r2(lufs),
  };
}
