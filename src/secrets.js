// HORDES — src/secrets.js
//
// M5b slice 3: SECRETS. Three kinds, none shown on the map until found.
//
//   crack  a cracked building wall: enough weapon hits break it and open a
//          small niche with gold and a potion (now and then a joker offer).
//   mimic  now and then a chest is a mimic. It looks exactly like a chest;
//          opening it wakes an elite, and killing that pays a rare chest.
//   glyph  one hidden glyph per stage, off the beaten track. Finding all
//          eight (across runs, saved) puts the MIMIC FEAST joker in the pool.
//
// Pure rules + data. Placement is a pure function of (seed, stage, rects,
// sites) on its own stream; per-run rolls use the caller's rng.

import { terrainFor, flatSpot } from './terrain.js';
import { planPath } from './pilot_nav.js';
import { mulberry32, siteSeed, spawnDist } from './sites.js';

export const SECRETS = {
  CRACKS: 2,              // cracked walls per stage (when buildings allow)
  CRACK_HITS: 14,         // weapon hits to break one
  CRACK_HIT_R: 16,        // a projectile this close counts as a hit
  CRACK_TOUCH_R: 22,      // the hero this close chips it...
  CRACK_TOUCH_RATE: 2,    // ...this many hits a second
  HANDS_ON_HITS: 2,       // steering: each hit counts double
  CRACK_SEEN_R: 140,      // the crack is noticed inside this range
  CRACK_MIN_SPAWN: 200,   // px from the hero's start (out of sight at the start)
  NICHE_GOLD: [12, 24],
  NICHE_JOKER: 0.2,       // chance the niche holds a joker offer
  MIMIC_CHANCE: 0.004,    // per chest opened, at most one per run (measured: 1.5%
                          // put a mimic in a third of early career runs and killed many)
  MIMIC_AFTER_S: 180,     // never before the wave-1 boss is usually down
  MIMIC_FEAST_CHANCE: 0.4,// with the MIMIC FEAST joker held
  MIMIC_HP_MULT: 3,       // the mimic is a tough elite
  MIMIC_WAKE_GAP: 40,     // it wakes this far from the hero, not on top of it
  GLYPH_R: 14,            // touch radius
  GLYPH_SEEN_R: 80,       // the glyph is noticed this close (hands-off)...
  GLYPH_SEEN_STEER_R: 150,// ...and this close while steering (it shimmers)
  GLYPH_MIN_SITE: 280,    // px from any major site
  GLYPH_MIN_SPAWN: 520,   // px from the hero's start
  GLYPHS_ALL: 8,
};

export const SECRET_HINTS = {
  crack: 'Cracked walls break under fire: keep shooting one to find the niche behind it.',
  mimic: 'Some chests bite: a mimic wakes when opened, and pays a rare chest when it dies.',
  glyph: 'Each stage hides one glyph off the beaten track; find all eight for a reward.',
};

// The SECRETS shelf: one entry per secret, with the silhouette's one-line hint.
export const SECRET_SHELF = [
  { id: 'crack', name: 'CRACKED WALL', hint: 'Some walls are not as solid as they look.' },
  { id: 'mimic', name: 'MIMIC', hint: 'Not every chest wants to be opened.' },
  { id: 'vault', name: 'THE VAULT', hint: 'A marked elite carries a key.' },
  { id: 'yard', name: 'THE YARD', hint: 'Somewhere a lever opens a gate.' },
  { id: 'glyphs', name: 'ALL EIGHT GLYPHS', hint: 'One glyph hides on every stage.' },
];

import { emptyWorld, sanitizeWorld } from './world_save.js';
export { emptyWorld, sanitizeWorld };

export function ensureWorld(profile) {
  if (!profile.world || typeof profile.world !== 'object') profile.world = emptyWorld();
  const w = profile.world;
  if (!Array.isArray(w.glyphs)) w.glyphs = [];
  if (!w.secrets || typeof w.secrets !== 'object') w.secrets = {};
  if (!w.chains || typeof w.chains !== 'object') w.chains = {};
  if (!Number.isFinite(w.questsDone)) w.questsDone = 0;
  return w;
}
// Record a found secret; true the first time.
export function markSecret(profile, id) {
  const w = ensureWorld(profile);
  if (w.secrets[id]) return false;
  w.secrets[id] = true;
  return true;
}
// Record a glyph; returns { fresh, all } (all = this one completed the set).
export function recordGlyph(profile, stageId) {
  const w = ensureWorld(profile);
  if (w.glyphs.includes(stageId)) return { fresh: false, all: false };
  w.glyphs.push(stageId);
  const all = w.glyphs.length >= SECRETS.GLYPHS_ALL;
  if (all) w.secrets.glyphs = true;
  return { fresh: true, all };
}
export function glyphsAll(profile) {
  return !!(profile && profile.world && Array.isArray(profile.world.glyphs) &&
    profile.world.glyphs.length >= SECRETS.GLYPHS_ALL);
}

function inRects(rects, x, y, m) {
  for (const q of rects) {
    if (x > q.x - m && x < q.x + q.w + m && y > q.y - m && y < q.y + q.h + m) return true;
  }
  return false;
}

// Place the stage's cracks and its glyph. `rects` = the building footprints
// (yard walls excluded); `sites` = everything placed so far. `glyphFound`
// skips the glyph (already collected on this profile).
export function placeSecrets(seed, stageId, rects = [], sites = [], rim = 900, glyphFound = false) {
  const rng = mulberry32(siteSeed(seed, stageId) ^ 0x5ec2e7);
  const T = terrainFor(seed, stageId);
  const out = [];
  // Cracks: on the south face of a building, the niche just below it.
  const order = rects.map((q, i) => i).filter(i => rects[i].w >= 40 && rects[i].h >= 24);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]];
  }
  let id = 950;
  for (const i of order) {
    if (out.length >= SECRETS.CRACKS) break;
    const q = rects[i];
    const x = Math.round(q.x + q.w * (0.3 + 0.4 * rng())), wy = q.y + q.h;
    const ny = wy + 10;
    if (spawnDist(x, ny) < SECRETS.CRACK_MIN_SPAWN) continue;
    if (T && !flatSpot(T, x, ny)) continue;
    if (inRects(rects.filter(r => r !== q), x, ny, 12)) continue;
    if (sites.some(s => Math.hypot(s.x - x, s.y - ny) < 60) || out.some(s => Math.hypot(s.x - x, s.y - ny) < 300)) continue;
    if (!planPath(rects, 0, 0, x, ny + 4)) continue;
    out.push({ id: id++, kind: 'crack', x, y: ny, wallY: wy, hits: 0, state: 'unused', seen: false });
  }
  if (!glyphFound) {
    const half = rim - 120;
    const majors = sites.filter(s => s.kind !== 'brazier');
    for (let t = 0; t < 200; t++) {
      const x = Math.round((rng() * 2 - 1) * half), y = Math.round((rng() * 2 - 1) * half);
      if (spawnDist(x, y) < SECRETS.GLYPH_MIN_SPAWN) continue;
      if (T && !flatSpot(T, x, y)) continue;
      if (inRects(rects, x, y, 30)) continue;
      if (majors.some(s => Math.hypot(s.x - x, s.y - y) < SECRETS.GLYPH_MIN_SITE)) continue;
      if (sites.some(s => Math.hypot(s.x - x, s.y - y) < 120)) continue;
      if (!planPath(rects, 0, 0, x, y)) continue;
      out.push({ id: 960, kind: 'glyph', x, y, state: 'unused', seen: false, stage: stageId });
      break;
    }
  }
  return out;
}

// One frame of the secrets. ctx: { player, dt, handsOn, projectiles }.
// Events: crackHit · crackBroken {site} · glyph {site} · seen {site}.
export function tickSecrets(list, ctx) {
  const ev = [];
  if (!list || !ctx || !ctx.player) return ev;
  const S = SECRETS, p = ctx.player;
  for (const s of list) {
    if (s.state === 'spent') continue;
    const dx = s.x - p.x, dy = s.y - p.y;
    if (Math.abs(dx) > 320 || Math.abs(dy) > 220) continue;
    const d2 = dx * dx + dy * dy;
    if (s.kind === 'crack') {
      if (!s.seen && d2 <= S.CRACK_SEEN_R ** 2) { s.seen = true; ev.push({ kind: 'seen', site: s }); }
      const mult = ctx.handsOn ? S.HANDS_ON_HITS : 1;
      let hits = 0;
      const cy = s.wallY - 4;
      for (const q of ctx.projectiles || []) {
        if (q.crackHit === s.id) continue;
        if ((q.x - s.x) ** 2 + (q.y - cy) ** 2 <= S.CRACK_HIT_R ** 2) { q.crackHit = s.id; hits++; }
      }
      if (d2 <= S.CRACK_TOUCH_R ** 2) s.chip = (s.chip || 0) + ctx.dt * S.CRACK_TOUCH_RATE;
      if (s.chip >= 1) { hits += Math.floor(s.chip); s.chip -= Math.floor(s.chip); }
      if (hits > 0) {
        s.hits += hits * mult;
        if (ctx.handsOn) s.handsOn = true;
        if (s.hits >= S.CRACK_HITS) { s.state = 'spent'; ev.push({ kind: 'crackBroken', site: s, handsOn: !!s.handsOn }); }
        else ev.push({ kind: 'crackHit', site: s });
      }
    } else if (s.kind === 'glyph') {
      const r = ctx.handsOn ? S.GLYPH_SEEN_STEER_R : S.GLYPH_SEEN_R;
      if (!s.seen && d2 <= r * r) { s.seen = true; ev.push({ kind: 'seen', site: s }); }
      if (d2 <= S.GLYPH_R ** 2) { s.state = 'spent'; ev.push({ kind: 'glyph', site: s }); }
    }
  }
  return ev;
}

// The niche's reward (rolled on the caller's stream).
export function rollNiche(rng) {
  const [a, b] = SECRETS.NICHE_GOLD;
  return { gold: a + Math.floor(rng() * (b - a + 1)), potion: true, joker: rng() < SECRETS.NICHE_JOKER };
}

// Is this chest a mimic? At most one per run, after MIMIC_AFTER_S.
export function rollMimic(rng, time, alreadyOne, feast = false) {
  if (feast) return rng() < SECRETS.MIMIC_FEAST_CHANCE;
  if (alreadyOne || time < SECRETS.MIMIC_AFTER_S) return false;
  return rng() < SECRETS.MIMIC_CHANCE;
}
