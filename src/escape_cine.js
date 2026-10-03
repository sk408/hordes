// HORDES — the escape cinematic. After the wave-1 boss the hero runs for the
// portal with the horde and the boss behind him. Nothing to play and nothing
// to fail: the escape's gold is banked once, when the movie ends or is
// skipped. This file owns the cast, the clock, the skip and the payout;
// src/escape_cine_art.js owns the timeline and paints it.
import { escapeWorth, bestGoldOf, hasWrit, bankEscape } from './escape_payout.js';
import {
  BEATS, DURATION, LUNGES, BOSS_T, STOMPS, FLASH_T, drawScene, drawCard,
} from './escape_cine_art.js';
import { stageOf } from './stages.js';
import { enemySpriteFor } from './enemy_sprites.js';
import { BOSSES, BOSS_SPRITES, BOSS_ORDER } from './bosses.js';
import { characterSpriteFor } from './character_sprites.js';
import { mulberry32 } from './weather.js';

export { BEATS, DURATION };
export const SKIP_GUARD_S = 0.4;   // a press this soon after the start is ignored
export const STILL_S = 1.5;        // how long the still card holds (reduced motion)
export const HORDE_SIZE = 30;      // enemies in the wave, at most

// The beat the clock is in.
export function beatAt(t) {
  for (const [name, [a, b]] of Object.entries(BEATS)) if (t >= a && t < b) return name;
  return t < 0 ? 'ESTABLISH' : 'DONE';
}

// ---- the cast --------------------------------------------------------------------
// The horde is made of the enemy types the run met; with none recorded, of the
// stage's own pool. A planted turret does not run. Quick types lead the wave.
const NO_CHASE = new Set(['PILLAR']);
const LEAD_ORDER = ['DASHER', 'SWARMER', 'CHASER', 'SHRIKE', 'TICK', 'SPITTER', 'WARLOCK', 'BRUTE', 'COLOSSUS'];
const FLYERS = new Set(['SWARMER', 'SHRIKE']);
const RARE = { COLOSSUS: 0.2, BRUTE: 0.45 };   // heavy bodies are few
export function castFor(met, stageId) {
  const ok = (id) => !NO_CHASE.has(id) && !!enemySpriteFor(id);
  let ids = (Array.isArray(met) ? met : []).filter(ok);
  if (!ids.length) ids = stageOf(stageId).pool.map(([id]) => id).filter(ok);
  const rank = (id) => { const i = LEAD_ORDER.indexOf(id); return i < 0 ? LEAD_ORDER.length : i; };
  return [...new Set(ids)].sort((a, b) => rank(a) - rank(b));
}

// Everything the picture needs, fixed by the seed: who runs, in which lane,
// how far back, and which three lunge.
//   o: { seed, stage, character, met: [typeId], bossId, payout, writ, test }
export function buildScene(o = {}) {
  const seed = (o.seed >>> 0) || 1;
  const rng = mulberry32(seed);
  const stage = stageOf(o.stage).id;
  const cast = castFor(o.met, stage);
  const bossId = BOSS_SPRITES[o.bossId] && BOSSES[o.bossId] ? o.bossId : BOSS_ORDER[0];
  const character = characterSpriteFor(o.character) ? o.character : 'KNIGHT';
  const total = cast.reduce((s, id) => s + (RARE[id] || 1), 0);
  const pick = () => {
    let r = rng() * total;
    for (const id of cast) { if ((r -= RARE[id] || 1) < 0) return id; }
    return cast[0];
  };
  const LANES = [-30, 26, -14, 38, 14, -40, 30, -22];
  const horde = [];
  for (let i = 0; i < HORDE_SIZE; i++) {
    // The leaders show every type once; the rest are drawn by weight.
    const type = i < cast.length ? cast[i] : pick();
    const x = i < LANES.length ? LANES[i] + (rng() - 0.5) * 6
      : (rng() * 2 - 1) * (40 + 16 * Math.pow(i, 0.7));
    horde.push({ type, x, off: 0.2 * i + 0.004 * i * i + rng() * 0.12, phase: rng(), fly: FLYERS.has(type) });
  }
  // One leader for each lunge, a different one each time.
  const lungers = [1, 3, 0].slice(0, LUNGES.length).map(i => Math.min(i, horde.length - 1));
  return { seed, stage, character, cast, bossId, horde, lungers,
    payout: Math.max(0, o.payout | 0), writ: !!o.writ, test: !!o.test };
}

// ---- the sound cues ----------------------------------------------------------------
// [time, cue, arg], in order. STEP is one beat of the chase (arg: which beat,
// they come faster as it builds); BOSS a footfall; ROAR the lunge; ESCAPE the
// dive; GOLD the card.
const CUES = (() => {
  const out = [];
  let n = 0;
  for (let t = 0.25; t < BOSS_T.LUNGE - 0.05; t += 0.3 - 0.13 * (t / BOSS_T.LUNGE)) out.push([t, 'STEP', n++]);
  for (const s of STOMPS) out.push([s, 'BOSS', 0]);
  out.push([BOSS_T.LUNGE, 'ROAR', 0], [FLASH_T, 'ESCAPE', 0], [BEATS.CARD[0] + 0.05, 'GOLD', 0]);
  return out.sort((a, b) => a[0] - b[0]);
})();
export const ESCAPE_CUE_IDS = ['STEP', 'BOSS', 'ROAR', 'ESCAPE', 'GOLD'];

// ---- the mode ----------------------------------------------------------------------
let cine = null;

// Start the cinematic.
//   opts.profile  the profile the payout is banked to
//   opts.scene    { seed, stage, character, met, bossId } from the run
//   opts.onEnd    called once with the result
//   opts.onCue    (id, arg) for each sound cue
//   opts.reduced  true: a still card instead of the movie
//   opts.test     a preview: pays nothing
//   opts.cutPct   percent taken off the payout (a run started by auto-continue)
export function begin(opts = {}) {
  const profile = opts.profile || null;
  const test = !!opts.test;
  const cut = Math.max(0, Math.min(100, Number(opts.cutPct) || 0));
  const payout = profile && !test ? Math.floor(escapeWorth(profile) * (100 - cut) / 100) : 0;
  cine = {
    scene: buildScene({ ...(opts.scene || {}), payout, writ: !!profile && !test && hasWrit(profile), test }),
    profile, onEnd: opts.onEnd || null, onCue: opts.onCue || null,
    reduced: !!opts.reduced,
    t: 0, cue: 0, held: false, ended: false, payload: null,
  };
  return cine;
}

export function current() { return cine; }
export function isEnded() { return !cine || cine.ended; }
export function payload() { return cine ? cine.payload : null; }
export function length() { return cine && cine.reduced ? STILL_S : DURATION; }

function finish(result) {
  const c = cine;
  if (!c || c.ended) return;
  c.ended = true;
  const payout = c.profile && !c.scene.test ? bankEscape(c.profile, c.scene.payout) : 0;
  c.payload = {
    result, payout, writ: c.scene.writ, test: c.scene.test,
    bestGold: c.profile ? bestGoldOf(c.profile) : 0,
    seconds: c.t, seed: c.scene.seed,
  };
  if (c.onEnd) c.onEnd(c.payload);
}

// One frame: `dt` real seconds, `g` the canvas context (null: nothing drawn).
export function frame(g, dt) {
  const c = cine;
  if (!c || c.ended) return;
  const t0 = c.t;
  if (!c.held) c.t += Math.min(0.1, Math.max(0, Number(dt) || 0));
  if (c.onCue && !c.reduced) {
    while (c.cue < CUES.length && CUES[c.cue][0] <= c.t) {
      const q = CUES[c.cue++];
      if (q[0] > t0) c.onCue(q[1], q[2]);
    }
  }
  if (g) {
    if (c.reduced) drawCard(g, c.scene, 1);
    else drawScene(g, c.scene, Math.min(c.t, DURATION));
  }
  if (c.t >= length()) finish('complete');
}

// A key, tap or click: skips once the guard time has passed. Returns true
// when it ended the cinematic.
export function press() {
  const c = cine;
  if (!c || c.ended || c.t < SKIP_GUARD_S) return false;
  if (c.onCue && c.scene.payout > 0) c.onCue('GOLD', 0);
  finish('skip');
  return true;
}

// End now, paid in full: `skip` for a skip from code, `finishNow` for a tab
// nobody is watching or an unattended run.
export function skip() { if (cine && !cine.ended) finish('skip'); }
export function finishNow() { if (cine && !cine.ended) finish('complete'); }

// Capture and test seam: pin the clock at `t` seconds (null lets it run).
export function hold(t) {
  if (!cine) return;
  cine.held = t !== null && t !== undefined;
  if (cine.held) { cine.t = Math.max(0, Number(t) || 0); cine.cue = CUES.length; }
}
