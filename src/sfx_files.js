// HORDES: recorded sound effects (R4, 2026-11-19). Imported by src/audio.js only.
//
// The game's sound effects are synth voices (src/audio.js SFX). For some slots
// there are recorded candidates now (src/sfx_manifest.js, files in assets/sfx/,
// credits in assets/sfx/CREDITS.md). Steve picks one per slot on the listening
// page (listen/index.html, "Recorded sounds: pick"). Until he has, the game
// plays synth; the ADVANCED switch SOUND EFFECTS: RECORDED (PREVIEW) plays the
// candidates named in SFX_PICKS below.
//
// The loader (createSfxBank): it starts after the first frame (audio.js calls
// frame() from the game's per-frame setMusicContext), fetches and decodes one
// file at a time, and starts no new file while a movie plays. Any failure (the
// fetch, the decode) makes that whole slot synth for the session, silently; a
// slot plays from files only once every file of its set is decoded. Plain
// fetch, no Cache API: sw.js precaches assets/ (these files included) where the
// service worker runs, and the hashed file names keep the HTTP cache safe.

import { SFX_CANDIDATES } from './sfx_manifest.js';

// THE PICKS: slot -> the candidate id the game plays with SOUND EFFECTS:
// RECORDED. A pick from the listening page is a one-line change here. Until
// Steve has picked, each slot names its first candidate.
export const SFX_PICKS = {
  hit: 'punch',
  kill: 'punchheavy',
  gem: 'glasstink',
  fire_bolt: 'pluck',
  fire_arc: 'slice',
  fire_blast: 'plate',
  fire_zap: 'glitch',
  fire_seek: 'rise',
  levelup: 'confirm1',
  draftPick: 'cardplace',
  uiMove: 'click2',
  uiConfirm: 'select6',
};

export const SFX_SLOTS = Object.keys(SFX_CANDIDATES);
export { SFX_CANDIDATES };

// The candidate `id` of `slot`, or null.
export function candidate(slot, id) {
  const list = SFX_CANDIDATES[slot];
  return (list && list.find((c) => c.id === id)) || null;
}
// slot -> its files ([{ url, gain }]) for a picks table.
export function pickedSets(picks = SFX_PICKS) {
  const out = {};
  for (const slot of SFX_SLOTS) {
    const c = candidate(slot, picks[slot]);
    if (c) out[slot] = c.files;
  }
  return out;
}
// Every file of every candidate (the manifest test, the listening page).
export function allSfxUrls() {
  const out = [];
  for (const slot of SFX_SLOTS) for (const c of SFX_CANDIDATES[slot]) for (const f of c.files) out.push(f.url);
  return out;
}

// The scenes (main.js musicScene) in which no new file starts to load: the
// intro ('none'), the portal movie, the escape and the death movie.
export const HOLD_SCENES = new Set(['none', 'portal', 'escape', 'death']);
// The movies by game mode (main.js state.mode). The 'portal-cine' mode holds
// the portal movie (scene 'portal') and the road shot (scene 'run'), so the
// scene alone does not show the road shot.
export const HOLD_MODES = new Set(['intro', 'portal-cine', 'escape', 'death-cine']);
// True when no new file may start: the context main.js reports every frame.
// `hold`: a short film over a live run (the boss sting, the forge moment),
// which plays in mode 'playing' under the 'run' scene.
export function sfxHeld(c) {
  const ctx = c || {};
  return !!ctx.hold || HOLD_SCENES.has(ctx.scene || 'none') || HOLD_MODES.has(ctx.mode);
}

// The variation to play next: never the one just played, and no random draw
// (a seeded run must not move when the sound changes). The step between two
// plays comes from a hash of the play count, so a set is not a fixed cycle.
export function nextIndex(last, count, n) {
  if (!(n > 1)) return 0;
  if (!(last >= 0)) return 0;
  const h = Math.imul((count | 0) + 1, 0x9E3779B1) >>> 0;
  const step = 1 + ((h >>> 16) % (n - 1));
  return (last + step) % n;
}

// decodeAudioData, promise form, wrapped so the old callback-only Safari form
// works too (it returns undefined and calls back).
function decode(ctx, ab) {
  return new Promise((res, rej) => {
    let p;
    try { p = ctx.decodeAudioData(ab, res, rej); } catch (e) { rej(e); return; }
    if (p && typeof p.then === 'function') p.then(res, rej);
  });
}

// host: { ctx, fetch, resolveUrl(url), sets: { slot: [{ url, gain }] }, buffers?: Map }
// buffers: an optional shared url -> AudioBuffer map (the listening page
// decodes once and renders many times).
export function createSfxBank(host) {
  const ctx = host.ctx;
  const sets = { ...host.sets };
  const buffers = host.buffers || new Map();
  const failed = new Set();          // slots that stay synth for the session
  const rot = Object.create(null);   // slot -> { last, count }
  const log = [];                    // [url, 'start' | 'ok' | 'fail'] (tests)
  let started = false;
  let held = false;
  let inFlight = null;
  let gen = 0;

  const slotOf = (url) => SFX_SLOTS.find((s) => sets[s] && sets[s].some((f) => f.url === url)) || null;
  function nextUrl() {
    for (const slot of Object.keys(sets)) {
      if (failed.has(slot)) continue;
      for (const f of sets[slot]) if (!buffers.has(f.url)) return f.url;
    }
    return null;
  }
  function pump() {
    if (!started || held || inFlight || typeof host.fetch !== 'function') return;
    const url = nextUrl();
    if (!url) return;
    inFlight = url;
    const g = gen;
    log.push([url, 'start']);
    let p;
    try { p = Promise.resolve(host.fetch(host.resolveUrl ? host.resolveUrl(url) : url)); } catch (e) { p = Promise.reject(e); }
    p.then((r) => {
      if (!r || r.ok === false) throw new Error('http ' + (r && r.status));
      return r.arrayBuffer();
    }).then((ab) => decode(ctx, ab)).then((buf) => {
      if (g !== gen) return;
      if (!buf) throw new Error('no buffer');
      inFlight = null;
      buffers.set(url, buf);
      log.push([url, 'ok']);
      pump();
    }).catch(() => {
      if (g !== gen) return;
      inFlight = null;
      const slot = slotOf(url);
      if (slot) failed.add(slot);   // no retry: this slot stays synth for the session
      log.push([url, 'fail']);
      pump();
    });
  }

  return {
    ctx,
    // Every frame: the context main.js reports ({ scene, mode }). The first
    // call starts loading.
    frame(c) {
      started = true;
      held = sfxHeld(c);
      pump();
    },
    ready(slot) {
      const s = sets[slot];
      return !!(s && s.length && !failed.has(slot) && s.every((f) => buffers.has(f.url)));
    },
    // The file to play now for a ready slot: { buffer, gain, index }.
    next(slot) {
      const s = sets[slot];
      const r = rot[slot] || (rot[slot] = { last: -1, count: 0 });
      const i = nextIndex(r.last, r.count, s.length);
      r.last = i; r.count++;
      return { buffer: buffers.get(s[i].url), gain: Number.isFinite(s[i].gain) ? s[i].gain : 1, index: i };
    },
    drop() { gen++; inFlight = null; },
    debug: () => ({
      started, held, inFlight,
      buffers: [...buffers.keys()],
      failed: [...failed],
      log: log.map((x) => x.slice()),
      sets: Object.fromEntries(Object.entries(sets).map(([k, v]) => [k, v.map((f) => f.url)])),
    }),
  };
}
