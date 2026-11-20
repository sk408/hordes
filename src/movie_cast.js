// HORDES - who is in the movies, and whether the player has seen a movie before.
//
// Every movie (intro, portal, death, escape) asks this module two things, so
// they can never disagree with the run:
//   pilotLook(characterId)  the equipped pilot as the run draws it
//                           (src/character_sprites.js: frames and palette)
//   bossLook(bossId)        the boss this wave really spawned and the player
//                           really killed (src/bosses.js BOSS_SPRITES)
//   killerLook(deathBy)     the enemy whose hit really killed the hero
//                           (main.js die() records it as state.deathBy)
// main.js fills the ids from the run (movieCast there); a movie module only
// takes the looks it is handed and falls back to the Knight and Gravelmaw
// when handed nothing (a test calling render(g, t) bare).
//
// It also keeps the SEEN COUNT: how many times each kind of movie was shown.
// A movie the player has seen before plays through at full speed without its
// held pauses (see each movie's `repeat` timeline). The count is kept with the
// settings (its own storage key), never in the save's progress, so a new
// profile or a cloud save does not change it.
import { characterSpriteFor, CHARACTER_SPRITES } from './character_sprites.js';
import { BOSS_SPRITES, BOSSES, BOSS_ORDER, MIDBOSS } from './bosses.js';
import { enemySpriteFor } from './enemy_sprites.js';
import { FINAL_BOSS_SPRITE } from './final_boss.js';

export const DEFAULT_PILOT = 'KNIGHT';
export const DEFAULT_BOSS = BOSS_ORDER[0];   // GRAVELMAW

// { id, frames, palette, w, h } for a character id; the Knight for anything unknown.
export function pilotLook(characterId) {
  const spr = characterSpriteFor(characterId);
  const id = spr ? characterId : DEFAULT_PILOT;
  const s = spr || CHARACTER_SPRITES[DEFAULT_PILOT];
  return { id, frames: s.frames, palette: s.palette, w: s.w, h: s.h };
}

// { id, name, frames, palette, box } for a boss id; Gravelmaw for anything unknown.
export function bossLook(bossId) {
  const ok = !!(bossId && BOSS_SPRITES[bossId] && (BOSSES[bossId] || MIDBOSS[bossId]));
  const id = ok ? bossId : DEFAULT_BOSS;
  const s = BOSS_SPRITES[id];
  const name = (BOSSES[id] && BOSSES[id].name) || (MIDBOSS[id] && MIDBOSS[id].name) || id;
  return { id, name, frames: s.frames, palette: s.palette, box: s.box, rim: s.rim || null };
}

// The killer's look from a death record { cause, typeId, bossId, name }:
// { kind: 'boss' | 'maw' | 'enemy', id, name, frames, palette, box } or null
// when nothing with a sprite dealt the hit (an unknown cause).
// R2 death rebuild: every look also carries the name the end card prints, and
// the Maw (the finale's killer, recorded by name only) is a look of its own.
export const MAW_NAME = 'THE MAW';
export function killerLook(deathBy) {
  const d = deathBy || {};
  if (d.bossId && BOSS_SPRITES[d.bossId]) {
    const b = bossLook(d.bossId);
    return { kind: 'boss', id: b.id, name: b.name, frames: b.frames, palette: b.palette, box: b.box, rim: b.rim };
  }
  if (d.name === MAW_NAME) {
    const m = FINAL_BOSS_SPRITE;
    return { kind: 'maw', id: 'MAW', name: MAW_NAME, frames: m.frames, palette: m.palette, box: m.box, rim: m.rim || null };
  }
  const e = d.typeId ? enemySpriteFor(d.typeId) : null;
  if (e) return { kind: 'enemy', id: d.typeId, name: d.name || String(d.typeId), frames: e.frames, palette: e.palette, box: { w: e.w, h: e.h } };
  return null;
}

// ---- the seen count ---------------------------------------------------------
export const SEEN_KEY = 'hordes_movies_seen';
export const MOVIE_KINDS = ['intro', 'portal', 'death', 'escape', 'road'];

function readSeen(store) {
  try {
    const raw = store && store.getItem(SEEN_KEY);
    const o = raw ? JSON.parse(raw) : {};
    return o && typeof o === 'object' ? o : {};
  } catch { return {}; }
}
// How many times this kind of movie has been shown.
export function seenCount(store, kind) {
  const n = Number(readSeen(store)[kind]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}
// When a movie plays its shorter repeat timeline. Steve, 2026-11-18, of the portal movie:
// "the shorter movie is fine if it's been seen during a run already" (and round 8: the full
// movie at the first portal of each run, the short one on later portals in the same run). So:
//   'run'    the portal movie: in full the first time in each run (6.9 s), short after
//            that in the same run (3.5 s);
//   'ever'   the death movie: short once it has been seen at all.
// A kind that is not listed (the intro, the escape, the road shot) never shortens.
export const REPEAT_RULE = { portal: 'run', death: 'ever' };
// Does this showing play the repeat timeline? `seenThisRun`: how many times this kind was
// shown in the current run (main.js counts it, per kind).
export function isRepeat(store, kind, seenThisRun = 0) {
  const rule = REPEAT_RULE[kind];
  if (rule === 'run') return seenThisRun > 0;
  return rule === 'ever' && seenCount(store, kind) > 0;
}
// Count one showing.
export function noteSeen(store, kind) {
  const o = readSeen(store);
  o[kind] = seenCount(store, kind) + 1;
  try { if (store) store.setItem(SEEN_KEY, JSON.stringify(o)); } catch { /* no storage */ }
  return o[kind];
}
