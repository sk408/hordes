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
// Which movies play a shorter timeline once they have been seen. Only the death movie.
// The portal movie is a 2.5 s beat on the battlefield now (src/portal_beat.js) and has no
// shorter form. (For the old 6.9 s portal movie Steve asked, 2026-11-18, that it shorten
// only once it had been seen in the same run; the beat replaced that movie.)
export const REPEAT_SHORTENS = { death: true };
// Has the player seen this kind of movie before, and does it shorten? Then it plays its
// repeat timeline.
export function isRepeat(store, kind) { return !!REPEAT_SHORTENS[kind] && seenCount(store, kind) > 0; }
// Count one showing.
export function noteSeen(store, kind) {
  const o = readSeen(store);
  o[kind] = seenCount(store, kind) + 1;
  try { if (store) store.setItem(SEEN_KEY, JSON.stringify(o)); } catch { /* no storage */ }
  return o[kind];
}
