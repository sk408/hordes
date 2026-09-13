// HORDES — G10 PART A: ENCOUNTERS PERSISTENCE (src/encounters.js + save v5).
// Run: node test/test_encounters.mjs
//
// Brief coverage, path by path:
//   * the catalog is DERIVED, never hand-copied: the expected id list is
//     rebuilt HERE from Object.keys(ENEMY_TYPES) + BOSSES + MIDBOSS +
//     TIER_ORDER-minus-COMMON and deep-equals ENCOUNTER_IDS — an enemy added
//     to any source breaks this test until the catalog picks it up;
//   * recordEncounter semantics: create / increment / bestWave maxes /
//     bestTier rank-maxes / COMMON never stamps / garbage never throws;
//   * A DISCOVERED ENTRY IS NEVER DROPPED: normalizeEncounters and the save
//     layer both repair a damaged entry to kills >= 1, never to undiscovered;
//   * UNKNOWN ids from a newer build pass through VERBATIM and never inflate
//     seenCount;
//   * namespace helpers: ensureEncounters reference stability, pure reads;
//   * save v4 -> v5 through the REAL loader (meta.loadProfileResult): a v4
//     save gains a structurally valid EMPTY namespace (no bestiary invented),
//     a discovered entry survives validation, future-version refuses, corrupt
//     preserves + starts clean, export/import round-trips losslessly;
//   * the REAL spawn seam: boot + startRun records enemy: entries on the live
//     profile, a forced MYTHIC window discovers tier:MYTHIC alongside the
//     enemy entry, the mid-wave HERALD records boss:HERALD, and bestiaryModel
//     shapes every catalog row.
import assert from 'node:assert/strict';
import { ENEMY_TYPES } from '../src/enemy_types.js';
import { BOSSES, MIDBOSS } from '../src/bosses.js';
import { TIER_ORDER } from '../src/rarity.js';
import {
  ENCOUNTERS, ENCOUNTER_IDS, ENCOUNTER_BY_ID, ENC_NAMESPACE_VERSION,
  emptyEncounters, normalizeEncounters, isValidEncounterNamespace,
  ensureEncounters, readEncounterNamespace, recordEncounter,
  seenCount, totalEncounters, bestiaryModel,
} from '../src/encounters.js';
import {
  makeProfile, loadProfileResult, exportProfileText, importProfileText,
} from '../src/meta.js';
import { boot, suite } from './_harness.mjs';

const S = suite('test_encounters');

// Boot-based checks MUST run sequentially (one shared rAF queue per cached
// main.js module — see the comment in test_rarity.mjs).
let asyncPassed = 0;
async function acheck(label, fn) {
  try { await fn(); asyncPassed++; console.log('  ok - ' + label); }
  catch (err) { console.error('  FAIL ' + label); throw err; }
}

// ---------- 1. the catalog is DERIVED -----------------------------------------
S.check('ENCOUNTER_IDS equals the ids derived from the real sources', () => {
  const expected = [];
  for (const id of Object.keys(ENEMY_TYPES)) expected.push('enemy:' + id);
  for (const desc of Object.values(BOSSES)) expected.push('boss:' + desc.id);
  for (const desc of Object.values(MIDBOSS)) expected.push('boss:' + desc.id);
  for (const id of TIER_ORDER) {
    if (id === 'COMMON') continue;   // COMMON is the absence of a rarity
    expected.push('tier:' + id);
  }
  assert.deepEqual(ENCOUNTER_IDS, expected,
    'an enemy/boss/tier added to a source must appear in the catalog');
  assert.equal(new Set(ENCOUNTER_IDS).size, ENCOUNTER_IDS.length, 'no duplicate ids');
  assert.equal(ENCOUNTER_IDS.length, totalEncounters(), 'totalEncounters counts the catalog');
  const kinds = new Set(ENCOUNTERS.map(e => e.kind));
  assert.deepEqual([...kinds].sort(), ['boss', 'enemy', 'tier'], 'three kinds only');
  for (const e of ENCOUNTERS) {
    assert.equal(ENCOUNTER_BY_ID[e.id], e, 'the by-id index points at the row');
    assert.equal(typeof e.name === 'string' && e.name.length > 0, true, 'every row is NAMED');
    if (e.kind === 'tier') {
      assert.notEqual(e.ref, 'COMMON', 'COMMON is never a tier entry');
      assert.notEqual(e.name, e.ref, 'a tier entry prints its display name, not the id');
    }
  }
  // Boss names read the real descriptors, not a second copy.
  assert.equal(ENCOUNTER_BY_ID['boss:GRAVELMAW'].name, BOSSES.GRAVELMAW.name);
  assert.equal(ENCOUNTER_BY_ID['boss:HERALD'].name, MIDBOSS.HERALD.name);
});

// ---------- 2. recordEncounter semantics --------------------------------------
S.check('first sight creates the entry; later sights increment and MAX', () => {
  const p = {};
  const a = recordEncounter(p, 'enemy:CHASER', { wave: 3, at: 95 });
  assert.deepEqual(a, { firstWave: 3, firstAt: 95, kills: 1, bestWave: 3 },
    'the created entry carries the sighting, no bestTier for a plain spawn');
  const b = recordEncounter(p, 'enemy:CHASER', { wave: 1, at: 30 });
  assert.equal(b, a, 'the same entry object is returned and written through');
  assert.equal(a.kills, 2, 'kills counts sightings');
  assert.equal(a.bestWave, 3, 'bestWave NEVER regresses (1 was offered)');
  assert.equal(a.firstWave, 3, 'firstWave is frozen at discovery');
});

S.check('bestTier rank-maxes and COMMON never stamps', () => {
  const p = {};
  recordEncounter(p, 'enemy:BRUTE', { wave: 2, tier: 'COMMON' });
  assert.equal(p.encounters.entries['enemy:BRUTE'].bestTier, undefined,
    'a COMMON sighting leaves the field absent');
  recordEncounter(p, 'enemy:BRUTE', { wave: 3, tier: 'RARE' });
  recordEncounter(p, 'enemy:BRUTE', { wave: 4, tier: 'RARE' });
  assert.equal(p.encounters.entries['enemy:BRUTE'].bestTier, 'RARE');
  recordEncounter(p, 'enemy:BRUTE', { wave: 5, tier: 'MYTHIC' });
  assert.equal(p.encounters.entries['enemy:BRUTE'].bestTier, 'MYTHIC', 'upgrades');
  recordEncounter(p, 'enemy:BRUTE', { wave: 6, tier: 'RARE' });
  assert.equal(p.encounters.entries['enemy:BRUTE'].bestTier, 'MYTHIC', 'never regresses');
  recordEncounter(p, 'enemy:BRUTE', { wave: 7, tier: 'GARBAGE' });
  assert.equal(p.encounters.entries['enemy:BRUTE'].bestTier, 'MYTHIC',
    'an unknown tier id never throws and never stamps');
  recordEncounter(p, 'tier:MYTHIC', { wave: 5, tier: 'MYTHIC' });
  assert.equal(p.encounters.entries['tier:MYTHIC'].bestTier, 'MYTHIC',
    'the tier\'s own entry carries itself');
});

S.check('hostile inputs never throw', () => {
  const p = {};
  recordEncounter(p, 'enemy:CHASER');
  recordEncounter(p, 'enemy:CHASER', null);
  recordEncounter(p, null, { wave: 1 });
  recordEncounter('not a profile', 'enemy:CHASER');
  assert.ok(true, 'no path throws');
});

// ---------- 3. never-un-discover + unknown-id preservation --------------------
S.check('normalizeEncounters repairs a damaged entry to DISCOVERED, never drops it', () => {
  const raw = {
    v: ENC_NAMESPACE_VERSION,
    entries: {
      'enemy:CHASER': { firstWave: 'x', firstAt: -3, kills: 'garbage', bestWave: 2 },
      'boss:HERALD': { firstWave: 1, firstAt: 60, kills: 0, bestWave: 1, bestTier: 'NOPE' },
      'tier:RARE': 'not an object',
    },
  };
  const ns = normalizeEncounters(raw);
  const ch = ns.entries['enemy:CHASER'];
  assert.ok(ch, 'the damaged CHASER entry survives');
  assert.equal(ch.kills, 1, 'garbage kills repair to 1 — never undiscovered');
  assert.equal(ch.firstWave, 0, 'a non-numeric field repairs to 0');
  assert.equal(ch.bestWave, 2, 'a valid bestWave rides along');
  const her = ns.entries['boss:HERALD'];
  assert.ok(her, 'the zero-kills HERALD entry survives');
  assert.equal(her.kills, 1, 'kills 0 clamps UP to 1 (a present entry IS a discovery)');
  assert.equal(her.bestTier, undefined, 'an unknown bestTier drops the FIELD, not the entry');
  assert.equal(ns.entries['tier:RARE'], undefined, 'a non-object entry is the one dropped shape');
  assert.equal(normalizeEncounters(null).entries !== undefined, true,
    'a missing namespace normalizes to an empty one');
});

S.check('unknown ids from a newer build survive and never inflate seenCount', () => {
  const raw = {
    v: ENC_NAMESPACE_VERSION,
    entries: {
      'enemy:FUTURE_TYPE': { firstWave: 9, firstAt: 999, kills: 4, bestWave: 9, customField: { a: 1 } },
      'enemy:CHASER': { firstWave: 1, firstAt: 5, kills: 2, bestWave: 1 },
    },
  };
  const ns = normalizeEncounters(raw);
  // encounters.js's normalize is STRUCTURAL: it keeps the unknown id's entry
  // with its known fields (byte-verbatim preservation of unknown sibling
  // fields is the SAVE layer's job — see the save check below).
  assert.deepEqual(ns.entries['enemy:FUTURE_TYPE'],
    { firstWave: 9, firstAt: 999, kills: 4, bestWave: 9 },
    'the unknown entry survives with its known fields');
  const p = { encounters: ns };
  assert.equal(seenCount(p), 1, 'seenCount counts KNOWN ids only');
  const model = bestiaryModel(p);
  assert.equal(model.length, ENCOUNTER_IDS.length, 'the model rows the KNOWN catalog only');
});

// ---------- 4. namespace helpers ----------------------------------------------
S.check('ensureEncounters is reference-stable; reads are pure', () => {
  const p = {};
  const a = ensureEncounters(p);
  const b = ensureEncounters(p);
  assert.equal(a, b, 'a valid namespace is returned by reference, never rebuilt');
  assert.ok(isValidEncounterNamespace(a));
  const broken = { encounters: 'garbage' };
  const before = broken.encounters;
  const read = readEncounterNamespace(broken);
  assert.equal(broken.encounters, before, 'the pure read never mutates');
  assert.equal(read.entries !== undefined, true, 'the pure read still returns a usable view');
  const fixed = ensureEncounters(broken);
  assert.notEqual(broken.encounters, before, 'a broken shape is repaired ONCE');
  assert.equal(ensureEncounters(broken), fixed, 'and then stays stable');
});

// ---------- 5. save layer (v4 -> v5) through the REAL loader -------------------
const fakeStorage = (seed) => ({
  map: new Map(seed ? Object.entries(seed) : []),
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; },
  setItem(k, v) { this.map.set(k, String(v)); },
});

S.check('a fresh profile ships a structurally valid EMPTY namespace', () => {
  const p = makeProfile();
  assert.deepEqual(p.encounters, emptyEncounters(),
    'makeProfile starts the bestiary empty: { v, entries: {} }');
});

S.check('v4 -> v5: migration [4], an empty namespace appears, no entry invented', () => {
  const v4 = { version: 4, gold: 10, purchased: { dmg: 1 } };
  const res = loadProfileResult(fakeStorage({ hordes_profile_v1: JSON.stringify(v4) }));
  assert.equal(res.status, 'migrated', 'status migrated (got ' + res.status + ')');
  assert.deepEqual(res.migrations, [4], 'the v4->v5 step is the only one applied');
  assert.deepEqual(res.profile.encounters, emptyEncounters(),
    'the namespace exists and is EMPTY — no bestiary is invented for an old save');
});

S.check('v4 with garbage encounters: entry-safe either way', () => {
  // A non-object encounters is REPLACED by the migration step itself (it
  // carried no entries to lose) — the save lands migrated, clean.
  const str = loadProfileResult(fakeStorage({ hordes_profile_v1:
    JSON.stringify({ version: 4, encounters: 'x' }) }));
  assert.deepEqual(str.migrations, [4], 'the migration ran');
  assert.deepEqual(str.profile.encounters, emptyEncounters(),
    'the namespace is empty-but-valid');
  // A malformed NAMESPACE (object shape, broken entries) passes the migration
  // untouched and is flagged + repaired by validation — one repair path.
  const bad = loadProfileResult(fakeStorage({ hordes_profile_v1:
    JSON.stringify({ version: 4, encounters: { v: 1, entries: 'garbage' } }) }));
  assert.deepEqual(bad.migrations, [4], 'the migration ran');
  assert.ok(bad.repairs.some(r => r.startsWith('encounters')),
    'present-but-garbage encounters is flagged as a repair');
  assert.deepEqual(bad.profile.encounters, emptyEncounters(),
    'the repaired namespace is empty-but-valid');
});

S.check('a discovered entry is NEVER dropped by save validation', () => {
  const v5 = {
    version: 5,
    encounters: { v: 1, entries: {
      'enemy:CHASER': { firstWave: 2, firstAt: 61, kills: 'damaged', bestWave: 7, bestTier: 'RARE' },
      'boss:GRAVELMAW': { firstWave: 4, firstAt: 400, kills: 3, bestWave: 4 },
      'enemy:FROM_THE_FUTURE': { kills: 9, note: 'keep me' },
    } },
  };
  const res = loadProfileResult(fakeStorage({ hordes_profile_v1: JSON.stringify(v5) }));
  const e = res.profile.encounters.entries;
  assert.equal(res.status, 'repaired', 'the damaged kills is flagged');
  assert.equal(e['enemy:CHASER'].kills, 1, 'damage repairs to discovered, never wipes');
  assert.equal(e['enemy:CHASER'].bestTier, 'RARE', 'a valid bestTier survives');
  assert.equal(e['boss:GRAVELMAW'].kills, 3, 'a clean entry passes untouched');
  assert.deepEqual(e['enemy:FROM_THE_FUTURE'], { kills: 9, note: 'keep me' },
    'an unknown id rides along verbatim');
  assert.equal(seenCount(res.profile), 2, 'and does not inflate the counter');
});

S.check('future-version refuses; corrupt starts clean without throwing', () => {
  const fut = loadProfileResult(fakeStorage({ hordes_profile_v1: JSON.stringify({ version: 6 }) }));
  assert.equal(fut.status, 'future-version', 'a newer save is never half-loaded');
  assert.deepEqual(fut.profile.encounters, emptyEncounters());
  const cor = loadProfileResult(fakeStorage({ hordes_profile_v1: '{not json' }));
  assert.equal(cor.status, 'corrupt', 'an unparseable payload is corrupt, not a crash');
  assert.deepEqual(cor.profile.encounters, emptyEncounters());
});

S.check('export -> import round-trips the bestiary losslessly', () => {
  const p = makeProfile();
  recordEncounter(p, 'enemy:CHASER', { wave: 1, at: 2 });
  recordEncounter(p, 'enemy:BRUTE', { wave: 3, at: 95, tier: 'MYTHIC' });
  const text = exportProfileText(p, { at: '2026-09-12T00:00:00.000Z' });
  const res = importProfileText(text);
  assert.equal(res.ok, true, 'the import parses');
  assert.deepEqual(res.profile.encounters, p.encounters,
    'the namespace survives the round-trip bit-for-bit');
});

// ---------- 6. the REAL spawn seam ---------------------------------------------
const h = await boot({ storage: [['hordes_onboarded', '1']] });
const st = h.state;

await acheck('startRun records enemy: sightings on the live profile (tier alongside)', () => {
  h.T.startRun();
  // Force the tier roll for a deterministic MYTHIC window (test_rarity's
  // forceRolls idiom): every tier-eligible spawn stamps tier:MYTHIC at the
  // SAME seam that records the enemy entry.
  const real = Math.random;
  Math.random = () => 0;
  try {
    for (let i = 0; i < 60 * 10; i++) {
      if (st.mode === 'draft' || st.mode === 'evolve') {
        const c = h.elements['ov-cards'].children[0];
        if (c) { c.click(); continue; }
      }
      h.pump(1);
    }
  } finally { Math.random = real; }
  const ns = h.T.getProfile().encounters;
  assert.ok(isValidEncounterNamespace(ns), 'the live profile carries the namespace');
  const enemyIds = Object.keys(ns.entries).filter(id => id.startsWith('enemy:'));
  assert.ok(enemyIds.length >= 1, 'at least one enemy type was encountered (got ' + enemyIds.length + ')');
  for (const id of enemyIds) {
    const e = ns.entries[id];
    assert.ok(e.kills >= 1 && e.firstWave >= 0 && e.bestWave >= e.firstWave,
      'a recorded entry is well-formed (' + id + ')');
  }
  assert.ok(ns.entries['tier:MYTHIC'],
    'the forced window discovered the tier alongside its enemies');
  assert.ok(enemyIds.every(id => ns.entries[id].bestTier === 'MYTHIC'),
    'the enemy entries max their bestTier through the forced roll');
  assert.ok(seenCount(h.T.getProfile()) <= totalEncounters(), 'the counter stays in catalog bounds');
});

await acheck('the mid-wave HERALD records boss:HERALD at its spawn', () => {
  h.T.startRun();
  // The HERALD lands mid-wave-1 (~60s); drafts PAUSE the sim, so clear them the
  // way test_run_structure does and pump on run time, not frame count.
  let saw = null;
  for (let i = 0; i < 60 * 400 && !saw; i++) {
    if (st.mode === 'draft' || st.mode === 'evolve') {
      const c = h.elements['ov-cards'].children[0];
      if (c) { c.click(); continue; }
    }
    saw = st.enemies.find(e => e.boss && e.midBoss);
    h.pump(1);
  }
  const entries = h.T.getProfile().encounters.entries;
  assert.ok(saw || entries['boss:HERALD'], 'a herald appeared (or was already recorded)');
  assert.ok(entries['boss:HERALD'], 'boss:HERALD is recorded AT SPAWN (never the kill funnel)');
  assert.ok(entries['boss:HERALD'].firstAt < 120, 'the first sighting is inside wave 1');
});

await acheck('bestiaryModel shapes every catalog row off the REAL tables', () => {
  const p = h.T.getProfile();
  const model = bestiaryModel(p);
  assert.equal(model.length, ENCOUNTER_IDS.length, 'one row per catalog entry');
  const byId = Object.fromEntries(model.map(r => [r.id, r]));
  assert.equal(byId['enemy:CHASER'].discovered, true, 'a seen enemy is discovered');
  assert.equal(byId['boss:HERALD'].discovered, true, 'a seen boss is discovered');
  assert.equal(byId['tier:MYTHIC'].discovered, true, 'a seen tier is discovered');
  assert.equal(byId['boss:PYRAXIS'].discovered, false, 'an unseen boss stays masked');
  assert.ok(Array.isArray(byId['enemy:CHASER'].info) && byId['enemy:CHASER'].info.length > 0,
    'a discovered row still prints its info lines');
  assert.equal(byId['boss:PYRAXIS'].tier, null, 'an undiscovered row has no bestTier');
  assert.ok(model.every(r => Number.isFinite(r.kills) && r.kills >= 0), 'kills is always a number');
});

S.done();
console.log('test_encounters: ' + asyncPassed + ' awaited seam checks passed');
