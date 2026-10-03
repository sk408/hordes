// HORDES — src/world_save.js
//
// M5b slice 3: the saved world block (profile.world, schema v13) and its
// repair. No imports, so src/save.js can use it without pulling in the game.

export function emptyWorld() {
  return { glyphs: [], secrets: {}, chains: {}, questsDone: 0 };
}
// Repair a stored block: lists of strings, a map of true flags, a map of
// non-negative ints. Unknown keys inside are dropped. { world, dirty }.
export function sanitizeWorld(w) {
  const out = emptyWorld();
  if (w === undefined) return { world: out, dirty: false };
  if (!w || typeof w !== 'object' || Array.isArray(w)) return { world: out, dirty: true };
  let dirty = false;
  if (Array.isArray(w.glyphs)) {
    for (const g of w.glyphs) {
      if (typeof g === 'string' && g && !out.glyphs.includes(g)) out.glyphs.push(g); else dirty = true;
    }
  } else if (w.glyphs !== undefined) dirty = true;
  const okKey = (k) => typeof k === 'string' && k && !['__proto__', 'constructor', 'prototype'].includes(k);
  if (w.secrets && typeof w.secrets === 'object' && !Array.isArray(w.secrets)) {
    for (const [k, v] of Object.entries(w.secrets)) {
      if (okKey(k) && v === true) out.secrets[k] = true; else dirty = true;
    }
  } else if (w.secrets !== undefined) dirty = true;
  if (w.chains && typeof w.chains === 'object' && !Array.isArray(w.chains)) {
    for (const [k, v] of Object.entries(w.chains)) {
      const n = Number(v);
      if (okKey(k) && Number.isFinite(n) && n >= 0) { out.chains[k] = Math.min(99, Math.floor(n)); if (out.chains[k] !== v) dirty = true; }
      else dirty = true;
    }
  } else if (w.chains !== undefined) dirty = true;
  const q = Number(w.questsDone);
  if (Number.isFinite(q) && q >= 0) out.questsDone = Math.floor(q);
  if (out.questsDone !== w.questsDone && w.questsDone !== undefined) dirty = true;
  return { world: out, dirty };
}
