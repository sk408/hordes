// HORDES — encounters namespace (G10: ENEMIES YOU'VE ENCOUNTERED, PERSISTED).
//
// WHY THIS FILE EXISTS
// The owner's ask: "we could have an enemy guide of enemies you've
// encountered." This file is the persistence half: a per-profile namespace
// recording every enemy type / boss / rarity tier the player has SEEN, with
// per-entry counters. It mirrors the proven namespace contract in
// src/achievements.js (same shape, same discipline):
//   * the catalog is DERIVED at module load from the real sources — never
//     hand-copied — so an enemy added to ENEMY_TYPES or a boss added to
//     BOSSES/MIDBOSS appears here (and in the parity test) automatically;
//   * entry ids are NAMESPACED (enemy:CHASER, boss:GRAVELMAW, tier:RARE) so
//     an enemy id can never collide with a tier id;
//   * A DISCOVERED ENTRY IS NEVER DROPPED by validation: a damaged entry
//     repairs to discovered (kills >= 1), never to undiscovered;
//   * UNKNOWN ids from a newer build are PRESERVED verbatim, so a save
//     passing through an older build loses nothing.
//
// PERSISTENCE
// One new profile namespace, profile.encounters (save schema v4 -> v5):
//   { v: ENC_NAMESPACE_VERSION, entries: { [id]: {
//       firstWave: int,   // wave number (floor(time/30)) of the first sighting
//       firstAt:   int,   // run time (s) of the first sighting
//       kills:     int,   // times recorded (the recording seam is SPAWN, so
//                         // this counts sightings; named kills for the guide's
//                         // vocabulary — see the brief's entry shape)
//       bestWave:  int,   // deepest wave it was seen at (max, never regresses)
//       bestTier:  tier id resolved through TIER_ORDER (COMMON < RARE <
//                  ELITE < MYTHIC; max, never regresses; absent when nothing
//                  tiered was ever recorded for the entry)
//   } } }
// The shape is validated/repairable in src/save.js (schema v4 -> v5) so a
// corrupt or older save cannot lose a bestiary — see the validation there.
//
// Pure and DOM-free on purpose: main.js owns the wiring (two SPAWN seams,
// spawnWave + spawnBoss), the bestiary screen reads bestiaryModel, and
// test_encounters.mjs drives it with no browser.

import { ENEMY_TYPES, ELITE_TEMPLATE } from './enemy_types.js';
import { BOSSES, MIDBOSS } from './bosses.js';
import { CONFIG as C, ladderEliteChance } from './config.js';
import { RARITY, ELITE_TIER, TIER_ORDER, TIER_RANK, tierMax } from './rarity.js';

export const ENC_NAMESPACE_VERSION = 1;

// ---------------------------------------------------------------------------
// THE CATALOG — derived, never hand-copied.
//
// Sources, in order: every ENEMY_TYPES key (base types incl. the COLOSSUS
// mini-boss and the PILLAR turret), every BOSSES id AND every MIDBOSS entry
// (spawnBoss sets boss.bossId off both pickBossForWave and the MIDBOSS path,
// so BOTH are encounters), then the tier ids a spawn can count as (every
// TIER_ORDER id except COMMON — COMMON is the absence of a rarity, not a
// discovery). BOSS_ORDER is the pick order, NOT the catalog.
// ---------------------------------------------------------------------------
const CATALOG = [];
for (const id of Object.keys(ENEMY_TYPES)) {
  CATALOG.push({ id: 'enemy:' + id, kind: 'enemy', ref: id, name: id });
}
for (const desc of Object.values(BOSSES)) {
  CATALOG.push({ id: 'boss:' + desc.id, kind: 'boss', ref: desc.id, name: desc.name });
}
for (const desc of Object.values(MIDBOSS)) {
  CATALOG.push({ id: 'boss:' + desc.id, kind: 'boss', ref: desc.id, name: desc.name });
}
for (const id of TIER_ORDER) {
  if (id === 'COMMON') continue;
  CATALOG.push({ id: 'tier:' + id, kind: 'tier', ref: id, name: tierName(id) });
}

function tierName(id) {
  if (id === 'ELITE') return ELITE_TIER.name;
  return (RARITY[id] && RARITY[id].name) || id;
}

export const ENCOUNTERS = CATALOG;
export const ENCOUNTER_IDS = CATALOG.map(e => e.id);
export const ENCOUNTER_BY_ID = CATALOG.reduce((m, e) => { m[e.id] = e; return m; }, {});

// ---------------------------------------------------------------------------
// namespace + repair (the achievements spine)
// ---------------------------------------------------------------------------

export function emptyEncounters() {
  return { v: ENC_NAMESPACE_VERSION, entries: {} };
}

const plainObject = v => !!v && typeof v === 'object' && !Array.isArray(v);
const intOr = (v, d) => (Number.isFinite(Number(v)) ? Math.max(0, Math.floor(Number(v))) : d);

// Coerce whatever is on the profile into a valid namespace WITHOUT throwing
// and WITHOUT dropping a discovery: a damaged KNOWN entry repairs in place
// (kills clamped to >= 1 so it stays discovered), never to undiscovered.
// Unknown ids pass through VERBATIM (a newer build's save loses nothing).
export function normalizeEncounters(raw) {
  const src = plainObject(raw) ? raw : {};
  const out = emptyEncounters();
  if (!plainObject(src.entries)) return out;
  for (const [id, e] of Object.entries(src.entries)) {
    if (!plainObject(e)) continue;
    const entry = {};
    entry.firstWave = intOr(e.firstWave, 0);
    entry.firstAt = intOr(e.firstAt, 0);
    // A present entry IS a discovery: garbage kills repair to 1, never 0.
    entry.kills = Math.max(1, intOr(e.kills, 1));
    entry.bestWave = Math.max(entry.firstWave, intOr(e.bestWave, entry.firstWave));
    // bestTier resolves through the tier table; unknown drops the FIELD, not
    // the entry. Common sibling fields of a surviving entry ride along.
    if (typeof e.bestTier === 'string' && TIER_RANK[e.bestTier] !== undefined) {
      entry.bestTier = e.bestTier;
    }
    out.entries[id] = entry;
  }
  return out;
}

// A namespace is "structurally usable" when its container exists. The CHEAP
// check ensureEncounters uses on the hot path; full normalisation is a
// repair, not a per-read job.
export function isValidEncounterNamespace(ns) {
  return plainObject(ns) && plainObject(ns.entries);
}

// Lazily attach the namespace. REFERENCE STABILITY IS A CONTRACT (same as
// achievements): recordEncounter writes through the held reference, so this
// only repairs when the shape is actually broken — never per call.
export function ensureEncounters(profile) {
  if (!plainObject(profile)) return emptyEncounters();
  if (!isValidEncounterNamespace(profile.encounters)) {
    profile.encounters = normalizeEncounters(profile.encounters);
  }
  return profile.encounters;
}

// PURE read: never mutates the profile, never swaps the object.
export function readEncounterNamespace(profile) {
  const ns = plainObject(profile) ? profile.encounters : null;
  return isValidEncounterNamespace(ns) ? ns : emptyEncounters();
}

// ---------------------------------------------------------------------------
// recording (the SPAWN seam main.js calls — never the kill funnel)
// ---------------------------------------------------------------------------

/**
 * Record a sighting. Creates the entry on first sight, increments kills,
 * MAXES bestWave and bestTier — never regresses. Cheap by contract: a plain
 * object write, no allocation after the first sighting, no array scans.
 * `opts`: { wave, at, tier } — all optional, all clamped. `tier` is a tier
 * id in TIER_ORDER; COMMON never stamps a bestTier field.
 */
export function recordEncounter(profile, id, opts = {}) {
  const ns = ensureEncounters(profile);
  const o = plainObject(opts) ? opts : {};
  const wave = intOr(o.wave, 0), at = intOr(o.at, 0);
  const e = ns.entries[id];
  if (!e) {
    const entry = { firstWave: wave, firstAt: at, kills: 1, bestWave: wave };
    if (typeof o.tier === 'string' && o.tier !== 'COMMON' &&
        TIER_RANK[o.tier] !== undefined) entry.bestTier = o.tier;
    ns.entries[id] = entry;
    return entry;
  }
  e.kills = Math.max(1, intOr(e.kills, 1)) + 1;
  if (wave > (e.bestWave || 0)) e.bestWave = wave;
  if (typeof o.tier === 'string' && o.tier !== 'COMMON' &&
      TIER_RANK[o.tier] !== undefined) {
    const best = tierMax(e.bestTier, o.tier);
    if (best && best !== 'COMMON') e.bestTier = best;
  }
  return e;
}

// KNOWN ids only: an unknown id from a newer build is preserved by the save
// layer, but it is not an entry this build can show, so it must not inflate
// the "4 / 13 discovered" counter the title card prints.
export function seenCount(profile) {
  const entries = readEncounterNamespace(profile).entries;
  let n = 0;
  for (const id of ENCOUNTER_IDS) if (entries[id]) n++;
  return n;
}

export function totalEncounters() {
  return ENCOUNTERS.length;
}

// ---------------------------------------------------------------------------
// presentation model for the bestiary screen
//
// `info` is read off the REAL source modules AT MODEL-BUILD TIME: enemy stats
// straight off ENEMY_TYPES[ref], behaviour lines derived from the type's OWN
// fields (a type with no such field prints nothing — no invented flavour),
// bosses read bosses.js, tiers state their documented rate and effect (ELITE
// reads the config constants via ladderEliteChance). main.js restates
// nothing; it prints these lines.
// ---------------------------------------------------------------------------

function enemyInfo(ref) {
  const t = ENEMY_TYPES[ref];
  if (!t) return [];
  const pct = x => 'x' + String(x).replace(/0$/, '');
  const lines = [
    `hp ${pct(t.hpMult)} - speed ${pct(t.speedMult)} - contact ${pct(t.contactDamageMult)} - xp ${pct(t.xpMult)}`,
  ];
  if (t.packSize && t.packSize > 1) lines.push(`spawns in packs of ${t.packSize}`);
  if (t.stalkTime) lines.push(`stalks ${t.stalkTime}s, then lunges ${t.lungeTime}s at ${pct(t.lungeSpeedMult)} speed`);
  if (t.holdDist) lines.push(`holds ${t.holdDist}px`);
  if (t.fireInterval) lines.push(`fires every ${t.fireInterval}s out to ${t.fireRange}px (${t.projDamage} dmg)`);
  if (t.chargeTime) lines.push(`telegraphs ${t.chargeTime}s before the bolt`);
  if (t.attachDist) lines.push(`latches inside ${t.attachDist}px and drains ${t.drainDps} hp/s`);
  if (t.minWave) lines.push(`mini-boss tier from wave ${t.minWave}; death shockwave ${t.shockRadius}px`);
  if (t.speedMult === 0) lines.push('stationary turret');
  return lines;
}

function tierInfo(ref) {
  if (ref === 'ELITE') {
    // The rates are READ from the config constants (brief C2: import them,
    // never retype 0.05 / 60 / 0.12).
    return [
      `${Math.round(C.SPAWNER.ELITE_CHANCE * 100)}% of spawns after ${C.SPAWNER.ELITE_TIME}s,` +
        ` ramping to ${Math.round(C.LADDER.ELITE_MAX * 100)}% by ${C.LADDER.ELITE_FROM}s`,
      `hp x${ELITE_TEMPLATE.hpMult}, xp x${ELITE_TEMPLATE.xpMult}, guaranteed chest`,
      `chance at 10:00 measured from the ladder: ${(ladderEliteChance(600) * 100).toFixed(1)}%`,
    ];
  }
  const t = RARITY[ref];
  if (!t) return [];
  const pct = Math.round(t.chance * 1000) / 10;
  return [
    `${pct}% of spawns (measured, not asserted - see src/rarity.js)`,
    `hp x${t.hpMult}, xp x${t.xpMult}, richer drops`,
  ];
}

export function bestiaryModel(profile) {
  const entries = readEncounterNamespace(profile).entries;   // READS are pure
  return ENCOUNTERS.map(cat => {
    const e = entries[cat.id];
    const discovered = !!e && intOr(e.kills, 0) >= 1;
    let info = [];
    if (cat.kind === 'enemy') info = enemyInfo(cat.ref);
    else if (cat.kind === 'boss') info = bossInfo(cat.ref);
    else info = tierInfo(cat.ref);
    return {
      id: cat.id,
      kind: cat.kind,
      ref: cat.ref,
      name: cat.name,
      discovered,
      kills: e ? intOr(e.kills, 0) : 0,
      firstWave: e ? intOr(e.firstWave, 0) : 0,
      bestWave: e ? intOr(e.bestWave, 0) : 0,
      tier: (e && typeof e.bestTier === 'string' && TIER_RANK[e.bestTier] !== undefined)
        ? e.bestTier : null,
      info,
    };
  });
}

function bossInfo(ref) {
  const desc = BOSSES[ref] || MIDBOSS[ref];
  if (!desc) return [];
  const lines = [desc.flavor];
  // Print only the fields the boss table actually carries (the HERALD has no
  // speedMult — its speed is tuned in CONFIG.ESCALATION.MIDBOSS): a missing
  // field prints NOTHING, never 'xundefined'.
  const mults = [];
  if (Number.isFinite(desc.hpMult)) mults.push(`hp x${desc.hpMult}`);
  if (Number.isFinite(desc.speedMult)) mults.push(`speed x${desc.speedMult}`);
  if (Number.isFinite(desc.contactDamageMult)) mults.push(`contact x${desc.contactDamageMult}`);
  if (mults.length) lines.push(mults.join(' - '));
  if (ref === 'HERALD') lines.push('mid-wave: rings you with pillars, then hunts');
  return lines;
}
