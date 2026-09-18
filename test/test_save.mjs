// HORDES — W1 SAVE FOUNDATION tests (schema version, migration, validation,
// corrupted/future saves, lossless export/import).
//
// The brief's four required cases live here: a corrupted save, an old-format
// save, a future-version save, and an export -> import round-trip proven by
// deep equality. Everything runs under node with no DOM.
//
// Run: node test/test_save.mjs   (exit 0 = pass)
import {
  SCHEMA_VERSION, PROFILE_VERSION, STORAGE_KEY, RECOVERY_KEY, EXPORT_FORMAT,
  makeProfile, loadProfile, loadProfileResult, saveProfile, validateProfile,
  exportProfile, exportProfileText, buildExport, importProfileText,
  downloadProfile, saveProfileToDisk, readSaveFile,
  readRecovery, recoveryExportText, downloadRecovery,
  STARTER_WEAPONS, SHOP_BY_ID,
} from '../src/meta.js';
import * as SAVE from '../src/save.js';
import assert from 'node:assert';

let failed = 0;
function ok(cond, msg) {
  if (cond) { console.log('  PASS ' + msg); }
  else { failed++; console.error('  FAIL ' + msg); }
}
function deepEq(a, b, msg) {
  try {
    assert.deepStrictEqual(a, b);
    console.log('  PASS ' + msg);
  } catch (err) {
    failed++;
    console.error('  FAIL ' + msg + '\n    ' + String(err.message).split('\n').slice(0, 6).join('\n    '));
  }
}
function throwsNot(fn, msg) {
  try { fn(); console.log('  PASS ' + msg); }
  catch (err) { failed++; console.error('  FAIL ' + msg + ' (threw: ' + err.message + ')'); }
}

// Storage fake with an instrumented writer (quota / blocked-storage probes).
function fakeStorage(seed) {
  const map = new Map(seed ? Object.entries(seed) : []);
  const st = {
    map,
    writes: 0,
    failWrites: false,
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) {
      if (st.failWrites) throw new Error('quota exceeded');
      st.writes++; map.set(k, String(v));
    },
    removeItem(k) { map.delete(k); },
  };
  return st;
}
const seeded = (raw) => fakeStorage({ [STORAGE_KEY]: raw });
const seededJson = (obj) => seeded(JSON.stringify(obj));

// A synthetic catalog: proves save.js is catalog-injected and cannot drift
// from (or depend on) meta.js's live tables.
const CAT = {
  characters: { HERO: { id: 'HERO' }, EXTRA: { id: 'EXTRA' } },
  shopById: { dmg: { id: 'dmg', maxLevel: 3 } },
  validWeapons: new Set(['BASE', 'GOOD']),
  validElites: new Set(['E1']),
  starterWeapons: ['BASE'],
  defaultCharacter: 'HERO',
};

// =====================================================================
console.log('SCHEMA VERSION:');
{
  // Pinned deliberately: bumping the schema is a conscious act, and this line
  // must be updated with it (v9 = the returning-player lastPlayed/lastSeenUpdate
  // pair; v10 = the milestoneChest claim; the pin to the literal is
  // intentional — never relax to >=).
  ok(SCHEMA_VERSION === PROFILE_VERSION && PROFILE_VERSION === 10,
    `schema version constant is 10 (got ${SCHEMA_VERSION} / ${PROFILE_VERSION})`);
  const fresh = makeProfile();
  ok(fresh.version === SCHEMA_VERSION, `makeProfile stamps the current version (got ${fresh.version})`);

  const empty = fakeStorage();
  const res = loadProfileResult(empty);
  ok(res.status === 'fresh' && res.notice === null,
    `empty storage is a silent fresh start (status=${res.status})`);
  ok(res.profile.version === SCHEMA_VERSION, 'a fresh profile is current-version');
  ok(empty.writes === 0, 'a fresh load writes nothing (no spam / no phantom save)');

  // saveProfile stamps the version even if a caller drops it.
  const s = fakeStorage();
  const p = makeProfile();
  delete p.version;
  ok(saveProfile(p, s) === true, 'saveProfile succeeds');
  ok(JSON.parse(s.getItem(STORAGE_KEY)).version === SCHEMA_VERSION,
    'saveProfile re-stamps a missing version (a save can never be version-less)');

  // The schema layer alone (no meta.js) works off the injected catalog.
  const isolated = SAVE.defaultProfile(CAT);
  ok(isolated.version === SCHEMA_VERSION && isolated.equippedCharacter === 'HERO' &&
     isolated.unlockedWeapons.length === 1 && isolated.unlockedWeapons[0] === 'BASE',
    'defaultProfile honors an injected catalog (no meta.js dependency)');
}

// =====================================================================
console.log('OLD-FORMAT SAVE (migration):');
{
  // The playtest-era shape: four known fields + an extra field main.js added.
  const legacy = {
    gold: 2636,
    purchased: { dmg: 1, hp: 2 },
    unlockedCharacters: ['KNIGHT', 'WITCH'],
    equippedCharacter: 'WITCH',
    bestTime: 187.5,
  };
  const s = seededJson(legacy);
  const res = loadProfileResult(s);
  ok(res.status === 'migrated' && res.from === 0,
    `an unversioned save is treated as v0 and migrated (status=${res.status}, from=${res.from})`);
  ok(res.profile.version === SCHEMA_VERSION, 'the migrated profile carries the current version');
  ok(res.profile.gold === 2636 && res.profile.purchased.dmg === 1 && res.profile.purchased.hp === 2,
    'gold + purchased levels survive migration');
  ok(res.profile.unlockedCharacters.includes('WITCH') && res.profile.equippedCharacter === 'WITCH',
    'character unlocks + equipment survive migration');
  ok(res.profile.bestTime === 187.5, 'unknown fields survive migration verbatim');

  // A save with the collections MISSING ENTIRELY.
  const sparse = loadProfileResult(seededJson({ gold: 5 }));
  ok(sparse.profile.unlockedWeapons.length === STARTER_WEAPONS.length &&
     STARTER_WEAPONS.every(w => sparse.profile.unlockedWeapons.includes(w)),
    'a save with fields missing entirely gets the starter weapon set');
  ok(Array.isArray(sparse.profile.unlockedElites) && sparse.profile.unlockedElites.length === 0,
    'missing elite collection defaults to none');
  ok(sparse.profile.equippedCharacter === 'KNIGHT' && sparse.profile.unlockedCharacters.length === 1,
    'missing character collection defaults to KNIGHT');

  // Legacy save that already has weapon unlocks keeps them (nothing is reset
  // beyond the documented VOLLEY guarantee).
  const withWeapons = loadProfileResult(seededJson({ gold: 0, unlockedWeapons: ['MINE'] }));
  ok(withWeapons.profile.unlockedWeapons.includes('MINE') &&
     withWeapons.profile.unlockedWeapons.includes('VOLLEY'),
    'a legacy save that already owns weapons keeps them, VOLLEY guaranteed');

  // A v1 save (explicit version 1) goes through the 1 -> 2 step.
  const v1 = loadProfileResult(seededJson({ version: 1, gold: 12.9, unlockedCharacters: ['KNIGHT'] }));
  ok(v1.status === 'migrated' && v1.from === 1 && v1.profile.version === SCHEMA_VERSION,
    `a version-1 save migrates to 2 (from=${v1.from})`);
  ok(v1.profile.gold === 12, 'the 1 -> 2 step clamps currency to a finite integer');

  // Migration + validation are idempotent and stable across a save/load cycle.
  const s2 = seededJson(legacy);
  const first = loadProfileResult(s2).profile;
  saveProfile(first, s2);
  const second = loadProfileResult(s2);
  ok(second.status === 'current', `a re-saved migrated profile loads as current (got ${second.status})`);
  deepEq(second.profile, first, 'the migrated profile is stable across a save/load cycle');
}

// =====================================================================
console.log('FUTURE-VERSION SAVE (fail safe, never half-load):');
{
  const future = { version: 99, gold: 12345, achievements: { whatever: true } };
  const s = seededJson(future);
  const res = loadProfileResult(s);
  ok(res.status === 'future-version', `a future save is refused (status=${res.status})`);
  ok(res.from === 99, 'the refused save reports the version it came from');
  // The profile this build hands back is a CLEAN CURRENT one: the future
  // payload's own `achievements` blob must not leak into it. (The namespace
  // itself now exists on every profile — schema v4 owns it — so the check is
  // that it is EMPTY, not that it is absent.)
  ok(res.profile.gold === 0 &&
     res.profile.achievements && Object.keys(res.profile.achievements.earned).length === 0 &&
     res.profile.achievements.whatever === undefined,
    'a future save is NOT half-loaded (no future fields leak into the session)');
  ok(/NEWER VERSION/.test(res.notice || ''), 'the player is told the save is from a newer build');
  ok(s.getItem(STORAGE_KEY) === JSON.stringify(future),
    'the ORIGINAL key is left untouched (never overwritten by the refusal)');
  ok(res.recoveryKey === RECOVERY_KEY, 'the future payload is preserved under the recovery key');
  const rec = readRecovery(s);
  ok(rec && rec.reason === 'future-version' && rec.raw === JSON.stringify(future),
    'the preserved copy holds the exact original payload');
  ok(loadProfile(s).gold === 0, 'the back-compat loadProfile still returns a usable profile');

  // Version-shaped garbage is treated as legacy, never as "future".
  for (const bad of ['"2"', '2.5', '-3', 'null', 'true', '{}']) {
    const r = loadProfileResult(seededJson({ version: JSON.parse(bad), gold: 7 }));
    ok(r.status !== 'future-version' && r.profile.gold === 7,
      `a non-integer/malformed version (${bad}) is treated as legacy, not future`);
  }
  // E1 (v7): the current-version shape carries the run purse — a v7 payload
  // without it is incomplete and repairs (runPurse added at 0). v9 likewise:
  // the current shape carries lastPlayed/lastSeenUpdate (null = not seen).
  const exact = loadProfileResult(seededJson({ version: SCHEMA_VERSION, gold: 7, runPurse: 0,
    lastPlayed: null, lastSeenUpdate: null, milestoneChest: 0 }));
  ok(exact.status === 'current' && exact.from === SCHEMA_VERSION,
    'an exact current-version save is not migrated');
  // A v2 save (the previous schema) now migrates forward.
  const v2 = loadProfileResult(seededJson({ version: 2, gold: 7 }));
  ok(v2.status === 'migrated' && v2.from === 2 && v2.profile.version === SCHEMA_VERSION,
    `a version-2 save migrates to ${SCHEMA_VERSION} (from=${v2.from})`);
}

// =====================================================================
console.log('CORRUPTED SAVE (preserve, start clean, tell the player):');
{
  const s = seeded('{not json');
  const res = loadProfileResult(s);
  ok(res.status === 'corrupt', `a malformed blob is reported as corrupt (status=${res.status})`);
  ok(res.profile.gold === 0 && res.profile.version === SCHEMA_VERSION,
    'the player starts clean on a valid current-version profile');
  ok(/UNREADABLE/.test(res.notice || ''), 'the player is TOLD the save was unreadable');
  ok(s.getItem(STORAGE_KEY) === '{not json', 'the original blob is not deleted (recovery in place)');
  const rec = readRecovery(s);
  ok(rec && rec.raw === '{not json' && rec.reason === 'corrupt',
    'the exact unreadable payload is preserved for recovery');
  ok(res.recoveryKey === RECOVERY_KEY, 'the result points at the recovery slot');

  // Payloads that are valid JSON but not a profile object.
  for (const blob of ['null', '[]', '"hello"', '42', 'true']) {
    const r = loadProfileResult(seeded(blob));
    ok(r.status === 'corrupt' && r.profile.gold === 0,
      `a non-object JSON payload (${blob}) is treated as corrupt, not trusted`);
  }

  // Storage that throws on read: still a fresh, valid profile, no crash.
  const blocked = {
    getItem() { throw new Error('storage blocked'); },
    setItem() { throw new Error('storage blocked'); },
    removeItem() {},
  };
  throwsNot(() => loadProfileResult(blocked), 'a throwing storage read does not throw');
  ok(loadProfileResult(blocked).profile.version === SCHEMA_VERSION,
    'a throwing storage read still yields a valid profile');

  // Recovery write fails (quota): the load must still be safe + honest.
  const full = seeded('{not json');
  full.failWrites = true;
  const r2 = loadProfileResult(full);
  ok(r2.status === 'corrupt' && r2.recoveryKey === null && /could not be copied/.test(r2.notice),
    'if the recovery copy cannot be written the player is still told (no silent loss)');

  // Empty value is an absent save, not a corrupted one.
  const empty = loadProfileResult(fakeStorage({ [STORAGE_KEY]: '' }));
  ok(empty.status === 'fresh', 'an empty stored value is an absent save, not corruption');

  // A battery of hostile shapes must never throw.
  const hostile = ['{', '[{"a":1', '{"purchased":[]}', '{"purchased":"x"}',
    '{"unlockedCharacters":{}}', '{"unlockedWeapons":{}}', '{"unlockedElites":3}',
    '{"gold":{"nested":1}}', '{"version":2}', '{"profile":{}}'];
  for (const h of hostile) {
    throwsNot(() => loadProfileResult(seeded(h)), `hostile payload survives without throwing: ${h}`);
  }
}

// =====================================================================
console.log('VALIDATION OF EVERY PERSISTED COLLECTION:');
{
  const v = (obj) => validateProfile(obj).profile;

  // ---- currency ----
  ok(v({ gold: -50 }).gold === 0, 'negative gold repairs to 0');
  ok(v({ gold: 1.9 }).gold === 1, 'fractional gold floors');
  ok(v({ gold: '12' }).gold === 12, 'a numeric string converts, not trusted verbatim');
  ok(v({ gold: 'abc' }).gold === 0, 'junk gold repairs to 0');
  ok(v({ gold: Infinity }).gold === 0 && v({ gold: NaN }).gold === 0,
    'non-finite gold repairs to 0 (no Infinity in a save)');
  ok(v({ gold: null }).gold === 0, 'null gold repairs to 0');
  const repaired = loadProfileResult(seededJson({ version: 2, gold: -5 }));
  ok(repaired.status === 'repaired' && repaired.repairs.includes('gold') && /REPAIRED/.test(repaired.notice),
    'a repaired save is reported, not silently fixed');

  // ---- purchased ----
  ok(v({ purchased: { dmg: 99 } }).purchased.dmg === SHOP_BY_ID.dmg.maxLevel,
    'over-cap purchased levels clamp to the CURRENT maxLevel');
  ok(v({ purchased: { junk: 'x' } }).purchased.junk === 0, 'garbage levels repair to 0');
  ok(v({ purchased: { futureThing: 2 } }).purchased.futureThing === 2,
    'unknown upgrade ids keep their value (newer-module data survives)');
  ok(v({ purchased: { futureThing: -4 } }).purchased.futureThing === 0,
    'negative unknown levels repair to 0');
  ok(Object.keys(v({ purchased: null }).purchased).length === 0, 'a null purchased map becomes {}');
  ok(Object.keys(v({ purchased: [1, 2] }).purchased).length === 0, 'an array purchased map becomes {}');

  // Prototype pollution via a hand-edited save.
  const raw = '{"version":2,"gold":0,"purchased":{"__proto__":{"polluted":1},"constructor":2,"prototype":3,"dmg":1}}';
  const pol = loadProfileResult(seeded(raw));
  ok(!({}).polluted && !('polluted' in {}), 'no prototype pollution through the purchased map');
  ok(!Object.prototype.hasOwnProperty.call(pol.profile.purchased, '__proto__') &&
     !Object.prototype.hasOwnProperty.call(pol.profile.purchased, 'constructor') &&
     !Object.prototype.hasOwnProperty.call(pol.profile.purchased, 'prototype'),
    'unsafe keys are dropped from the validated map');
  ok(pol.profile.purchased.dmg === 1, 'the safe entries in the same map still load');

  // ---- unlocked characters + equipped selection ----
  const chars = v({ unlockedCharacters: ['WITCH', 'WITCH', 'NOPE', 42, null, {}, 'KNIGHT'] });
  ok(chars.unlockedCharacters.length === 2 && chars.unlockedCharacters.includes('WITCH') &&
     chars.unlockedCharacters.includes('KNIGHT'), 'character unlocks dedupe + drop garbage');
  ok(chars.unlockedCharacters.includes('KNIGHT'), 'KNIGHT (free) is always present');
  ok(v({ unlockedCharacters: ['WITCH'] }).unlockedCharacters[0] === 'KNIGHT',
    'KNIGHT is prepended when a mangled list omits her');
  ok(v({}).unlockedCharacters.length === 1, 'no character collection means KNIGHT only');
  ok(v({ unlockedCharacters: ['KNIGHT'], equippedCharacter: 'WITCH' }).equippedCharacter === 'KNIGHT',
    'an unowned character cannot be equipped');
  ok(v({ unlockedCharacters: ['KNIGHT', 'ROGUE'], equippedCharacter: 'ROGUE' }).equippedCharacter === 'ROGUE',
    'a legitimately owned character still equips');

  // ---- weapon unlocks ----
  const w = v({ unlockedWeapons: ['BEAM', 'BEAM', 'NOPE', 42, 'VOLLEY'] });
  ok(w.unlockedWeapons.length === 2 && w.unlockedWeapons.includes('BEAM') &&
     w.unlockedWeapons.includes('VOLLEY'), 'weapon unlocks dedupe + drop garbage');
  ok(w.unlockedWeapons.includes('VOLLEY'), 'VOLLEY survives even when listed after the junk');
  const wOmit = v({ unlockedWeapons: ['MINE', 'BEAM'] });
  ok(wOmit.unlockedWeapons[0] === 'VOLLEY',
    'VOLLEY is re-prepended when a mangled field omits it (it is the base volley)');
  const wStart = v({ unlockedWeapons: 'MINE' });
  ok(wStart.unlockedWeapons.length === STARTER_WEAPONS.length,
    'a non-array weapon unlock field falls back to the starter set');
  const wMissing = v({});
  ok(wMissing.unlockedWeapons.length === STARTER_WEAPONS.length,
    'a missing weapon unlock field falls back to the starter set');

  // ---- elite unlocks ----
  const e = v({ unlockedElites: ['SWIFT', 'SWIFT', 'GARBAGE', 7] });
  ok(e.unlockedElites.length === 1 && e.unlockedElites[0] === 'SWIFT',
    'elite unlocks dedupe + drop garbage');
  ok(v({ unlockedElites: 'SWIFT' }).unlockedElites.length === 0,
    'a non-array elite unlock field degrades to none');

  // ---- unknown collections pass through untouched (lossless for new modules) ----
  // NOTE: `achievements` used to be the sample "unknown collection" here. As of
  // schema v4 it is a VALIDATED namespace; as of v5 so is `encounters`. The
  // sample moved to collections that are still unknown (trophies/sightings/
  // deep) and both namespaces get their own data-preservation checks below.
  const extra = v({ trophies: ['t'], sightings: { grunt: 3 }, deep: { x: [1, 2] } });
  ok(extra.trophies[0] === 't' && extra.sightings.grunt === 3 && extra.deep.x.length === 2,
    'unknown collections are preserved verbatim (trophies/sightings/deep)');

  // ---- the achievements namespace carries its DATA through validation ----
  const ach = v({ achievements: { v: 1, earned: { FIRST_BLOOD: 1700000000000 }, progress: { KILLS_100: 7 }, totals: { kills: 42 } } }).achievements;
  ok(ach && ach.earned.FIRST_BLOOD === 1700000000000 && ach.progress.KILLS_100 === 7 &&
     ach.totals.kills === 42,
    'the achievements namespace round-trips its earned/progress/totals data');
  // G11: the timed bucket is validated structurally (opaque keys kept for the
  // newer-build round-trip, values intOr'd) and a v1 payload without one gains
  // an empty bucket, never a poisoned one.
  ok(ach && ach.timed && typeof ach.timed === 'object' && Object.keys(ach.timed).length === 0,
    'a v1 achievements payload gains an empty timed bucket through validation');
  const timedAch = v({ achievements: { v: 2, earned: {}, progress: {}, totals: {},
    timed: { 'wave@180': 5, 'kills@300': 'many', '__proto__': 1 } } }).achievements;
  ok(timedAch.timed['wave@180'] === 5 && timedAch.timed['kills@300'] === 0 &&
     !Object.prototype.hasOwnProperty.call(timedAch.timed, '__proto__'),
    'the timed bucket keeps its keys, repairs garbage values and blocks unsafe keys');
  // An id written by a NEWER build survives this one (the `purchased` policy),
  // so a save never loses data by passing through an older build.
  const futAch = v({ achievements: { v: 1, earned: { FROM_THE_FUTURE: 5, FIRST_BLOOD: 3 }, progress: {}, totals: {} } }).achievements;
  ok(futAch.earned.FROM_THE_FUTURE === 5 && futAch.earned.FIRST_BLOOD === 3,
    'an unknown achievement id from a newer build is preserved, not dropped');
  // ...and an earned trophy is never demoted to unearned by garbage.
  const junkAch = v({ achievements: { earned: { FIRST_BLOOD: true }, progress: { KILLS_100: -5 }, totals: { kills: 'many' } } }).achievements;
  ok(junkAch.earned.FIRST_BLOOD === 1 && junkAch.progress.KILLS_100 === 0 && junkAch.totals.kills === 0,
    'a hand-edited namespace repairs to safe values without losing the trophy');

  // ---- the encounters namespace (G10, schema v5) carries its DATA through validation ----
  const enc = v({ encounters: { v: 1, entries: {
    'enemy:CHASER': { firstWave: 1, firstAt: 30, kills: 41, bestWave: 4, bestTier: 'RARE' },
    'enemy:FUTURE': { firstWave: 2, firstAt: 60, kills: 2, bestWave: 2, custom: 'keep' },
  } } }).encounters;
  ok(enc.entries['enemy:CHASER'].kills === 41 && enc.entries['enemy:CHASER'].bestTier === 'RARE',
    'the encounters namespace round-trips its sighting data');
  ok(JSON.stringify(enc.entries['enemy:FUTURE']) === JSON.stringify({ firstWave: 2, firstAt: 60, kills: 2, bestWave: 2, custom: 'keep' }),
    'an unknown encounter id from a newer build is preserved VERBATIM, entry and sibling fields');
  const junkEnc = v({ encounters: { v: 1, entries: { 'enemy:CHASER': { kills: -5, bestTier: 'NOPE' } } } }).encounters;
  ok(junkEnc.entries['enemy:CHASER'].kills === 1 && junkEnc.entries['enemy:CHASER'].bestTier === undefined,
    'a damaged entry repairs to discovered; an unknown tier drops the field, not the entry');

  // The catalog-injected validator behaves the same in isolation.
  const iso = SAVE.validateProfile({ gold: 10, purchased: { dmg: 99, junk: 'x' }, unlockedWeapons: ['NOPE'] }, CAT);
  ok(iso.profile.purchased.dmg === 3 && iso.profile.purchased.junk === 0 &&
     iso.profile.unlockedWeapons[0] === 'BASE' && iso.profile.equippedCharacter === 'HERO',
    'save.js validates correctly against an injected catalog alone');
}

// =====================================================================
console.log('LOSS-LESS EXPORT / IMPORT:');
{
  const rich = makeProfile();
  rich.gold = 98765;
  rich.purchased = { dmg: 3, hp: 2, slots: 1, futureThing: 2 };
  rich.unlockedCharacters = ['KNIGHT', 'WITCH', 'ROGUE'];
  rich.equippedCharacter = 'WITCH';
  rich.unlockedWeapons = ['VOLLEY', 'BOOMERANG', 'ZAP', 'MINE'];
  rich.unlockedElites = ['SWIFT'];
  rich.bestTime = 187.5;
  rich.runsPlayed = 9;
  rich.nested = { bossKills: 3, tags: ['a', 'b'] };
  rich.achievements = {
    v: 2,
    earned: { FIRST_BLOOD: 1700000000000, KILLS_100: 1700000000500 },
    progress: { KILLS_100: 100, KILLS_1000: 250 },
    totals: { kills: 250, runs: 4, bestWave: 6 },
    // G11: the timed bucket is part of the namespace now, so the lossless
    // fixture exercises it (added the same way `encounters` was when G10
    // grew the profile).
    timed: { 'wave@180': 5, 'kills@300': 412 },
  };
  rich.trophies = ['boss_slayer'];
  rich.encounters = {
    v: 1,
    entries: { 'enemy:CHASER': { firstWave: 1, firstAt: 30, kills: 41, bestWave: 4, bestTier: 'RARE' } },
  };
  // G25: the apex namespace rides the same lossless round trip.
  rich.apex = { owned: ['apex_mark'], enabled: true };

  const at = '2026-01-02T03:04:05.000Z';
  const text = exportProfileText(rich, { at });
  const env = buildExport(rich, { at });
  ok(env.format === EXPORT_FORMAT && env.schemaVersion === SCHEMA_VERSION && env.exportedAt === at,
    'the export envelope declares its format, schema version and timestamp');
  ok(env.profile.runsPlayed === 9 && env.profile.encounters.entries['enemy:CHASER'].kills === 41,
    'the envelope carries the WHOLE profile, unknown collections included');

  const res = importProfileText(text);
  ok(res.ok === true && res.status === 'imported',
    `a current-version export imports cleanly (status=${res.status})`);
  deepEq(res.profile, rich, 'export -> import is LOSSLESS (deep equality, unknown fields included)');

  // Re-export of the imported profile is byte-identical (stable round trip).
  ok(exportProfileText(res.profile, { at }) === text, 'a second export is identical (stable round trip)');

  // An export from an OLDER format still imports + migrates.
  const legacyText = JSON.stringify({ gold: 42, purchased: { dmg: 1 }, unlockedCharacters: ['KNIGHT'], equippedCharacter: 'KNIGHT' });
  const legacyRes = importProfileText(legacyText);
  ok(legacyRes.ok === true && legacyRes.status === 'imported-migrated' &&
     legacyRes.profile.gold === 42 && legacyRes.profile.version === SCHEMA_VERSION,
    'a raw legacy save file imports and migrates on the way in');

  // Refusals: a bad file can never damage the current profile (pure function).
  const bad = [
    ['', 'empty'],
    ['   ', 'empty'],
    ['not json at all', 'invalid-json'],
    ['[]', 'not-profile'],
    ['"a string"', 'not-profile'],
    [JSON.stringify({ format: EXPORT_FORMAT, schemaVersion: 99, profile: { gold: 1 } }), 'future-version'],
    [JSON.stringify({ version: 99, gold: 1 }), 'future-version'],
    [JSON.stringify({ format: EXPORT_FORMAT, schemaVersion: 2 }), 'not-profile'],
  ];
  for (const [blob, want] of bad) {
    let r;
    throwsNot(() => { r = importProfileText(blob); }, `import never throws for: ${JSON.stringify(blob).slice(0, 48)}`);
    ok(r && r.ok === false && r.status === want,
      `import refuses (${want}) with a reason: ${String(r && r.error).slice(0, 60)}`);
    ok(r && r.profile === undefined, 'a refused import returns NO profile (nothing to mis-apply)');
  }

  // Import must not mutate the input profile or the live game state.
  const before = JSON.stringify(rich);
  importProfileText(text);
  ok(JSON.stringify(rich) === before, 'import does not mutate the exported profile');

  // The currency in an imported profile is validated, not trusted.
  const dirty = importProfileText(JSON.stringify({ version: 2, gold: -9, purchased: { dmg: 99 } }));
  ok(dirty.ok && dirty.profile.gold === 0 && dirty.profile.purchased.dmg === SHOP_BY_ID.dmg.maxLevel,
    'an imported save is validated/reparied on the way in');
  ok(dirty.repairs.length > 0, 'import reports what it repaired');
}

// =====================================================================
console.log('APEX NAMESPACE (G25, v8):');
{
  // Pre-slice v7 payload: no `apex` field at all. It must MIGRATE (7 -> 8)
  // with the apex defaults filled in — locked, off, nothing owned — and with
  // an EMPTY repairs list: an absent subfield is a legacy fill-in, not damage.
  const v7 = loadProfileResult(seededJson({ version: 7, gold: 120, runPurse: 0 }));
  ok(v7.status === 'migrated' && v7.from === 7 && v7.profile.version === 10,
    'a v7 (pre-apex) save migrates to the current schema (v10 since the milestoneChest bump)');
  ok(v7.profile.apex && Array.isArray(v7.profile.apex.owned) && v7.profile.apex.owned.length === 0
     && v7.profile.apex.enabled === false,
    'a pre-slice save loads apex LOCKED and OFF, nothing owned');
  ok(v7.repairs.length === 0 && v7.profile.gold === 120,
    'the v7 -> v8 migration reports NO repairs (absent subfields default silently)');

  // A garbage apex field on an ALREADY-v8 payload repairs in the VALIDATOR and
  // is NAMED there, never silently dropped. (The v7->v8 migration step only
  // guarantees the container exists — the same banners convention: a v7 save
  // CARRYING 'yes' has it replaced by the migration's container guarantee,
  // which is reported as the migration itself.)
  const junk = loadProfileResult(seededJson({ version: 8, gold: 5, runPurse: 0, apex: 'yes' }));
  ok(junk.profile.apex && junk.profile.apex.owned.length === 0 && junk.profile.apex.enabled === false,
    'a garbage apex field repairs to the locked/off defaults');
  ok(junk.repairs.includes('apex') && junk.status === 'repaired',
    'the garbage apex field is NAMED in repairs');

  // Damaged contents: non-string owned entries dropped, duplicates collapsed,
  // a non-boolean toggle repaired — each flagged by name.
  const dmg = validateProfile({
    version: 10, gold: 1, runPurse: 0, lastPlayed: null, lastSeenUpdate: null,
    milestoneChest: 0,
    apex: { owned: [42, 'apex_mark', 'apex_mark', ''], enabled: 'x' },
  });
  ok(JSON.stringify(dmg.profile.apex.owned) === '["apex_mark"]',
    `owned keeps the real ids only, deduped (got ${JSON.stringify(dmg.profile.apex.owned)})`);
  ok(dmg.profile.apex.enabled === false, 'a non-boolean enabled repairs to OFF');
  ok(dmg.repairs.filter(r => r.startsWith('apex.')).length >= 2 && dmg.repairs.includes('apex.enabled'),
    'every damaged apex subfield is flagged (got: ' + dmg.repairs.join(', ') + ')');

  // An unknown owned id is PRESERVED (the newer-build round-trip rule).
  const newer = validateProfile({ version: 10, gold: 3, runPurse: 0,
    lastPlayed: null, lastSeenUpdate: null, milestoneChest: 0,
    apex: { owned: ['apex_future_thing'], enabled: true } });
  ok(newer.profile.apex.owned[0] === 'apex_future_thing' && newer.profile.apex.enabled === true,
    'unknown apex ids + a boolean toggle round-trip verbatim');
  ok(newer.repairs.length === 0, 'a well-formed apex namespace triggers no repairs');

  // makeProfile ships the namespace from day one.
  ok(JSON.stringify(makeProfile().apex) === '{"owned":[],"enabled":false}',
    'a fresh profile ships apex = { owned: [], enabled: false }');

  // saveProfile stamps the current version; the stored payload carries the namespace.
  const s = fakeStorage();
  const p = makeProfile();
  p.apex = { owned: ['apex_endless_fire'], enabled: true };
  saveProfile(p, s);
  const stored = JSON.parse(s.getItem(STORAGE_KEY));
  ok(stored.version === 10 && stored.apex.owned[0] === 'apex_endless_fire'
     && stored.apex.enabled === true,
    'saveProfile persists the apex namespace under the current version stamp (v10)');
  // (The lossless export/import round trip for apex is pinned by the `rich`
  // fixture above, which carries apex through deepEq.)
}

// =====================================================================
console.log('BROWSER IO (guarded helpers, fake DOM):');
{
  const rich = makeProfile();
  rich.gold = 4242;
  rich.encounters = { v: 1, entries: { 'boss:HERALD': { firstWave: 3, firstAt: 95, kills: 7, bestWave: 3 } } };

  // Fake DOM: records the anchor, captures the Blob text.
  function fakeEnv() {
    const env = {
      _blobs: [],
      Blob: class { constructor(parts, opts) { this.parts = parts; this.type = opts && opts.type; env._blobs.push(this); } },
      URL: { createObjectURL: () => 'blob:fake-url', revokeObjectURL: () => {} },
      document: {
        createElement: (tag) => {
          const a = { tag, style: {}, attrs: {}, setAttribute(k, v) { a.attrs[k] = v; }, click() { a.clicked = true; }, remove() { a.removed = true; } };
          env._anchor = a;
          return a;
        },
        body: { appendChild() {} },
      },
    };
    return env;
  }

  const env = fakeEnv();
  const dl = downloadProfile(rich, env, { at: '2026-01-02T03:04:05.000Z' });
  ok(dl.ok === true && /\.json$/.test(dl.filename) && dl.via === 'download',
    `export downloads a .json file (${dl.filename})`);
  ok(env._anchor.attrs.download === dl.filename && env._anchor.clicked === true && env._anchor.removed === true,
    'the anchor carries the download attribute, is clicked, and is cleaned up');
  const downloaded = env._blobs[0].parts[0];
  deepEq(importProfileText(downloaded).profile, rich,
    'the DOWNLOADED file imports back to the identical profile (real round trip)');

  // No DOM (headless): a clean refusal, never a throw.
  ok(downloadProfile(rich, {}).ok === false && downloadProfile(rich, {}).reason === 'no-dom',
    'the download helper refuses cleanly without a DOM');

  // File System Access API present -> the real dialog path.
  const picked = [];
  const pickerEnv = fakeEnv();
  pickerEnv.showSaveFilePicker = async (opts) => {
    picked.push(opts.suggestedName);
    return {
      name: opts.suggestedName,
      createWritable: async () => ({ write: async (t) => { pickerEnv._text = t; }, close: async () => {} }),
    };
  };
  const viaPicker = await saveProfileToDisk(rich, pickerEnv, { at: '2026-01-02T03:04:05.000Z' });
  ok(viaPicker.ok === true && viaPicker.via === 'picker' && /\.json$/.test(picked[0]),
    'showSaveFilePicker is preferred when available (with a suggested .json name)');
  deepEq(importProfileText(pickerEnv._text).profile, rich, 'the picker-written file round-trips too');

  // Picker absent -> falls back to the download.
  const fallback = await saveProfileToDisk(rich, fakeEnv(), { at: '2026-01-02T03:04:05.000Z' });
  ok(fallback.ok === true && fallback.via === 'download',
    'no picker falls back to the universal download');

  // Picker cancel is reported, not treated as a download.
  const cancelEnv = fakeEnv();
  cancelEnv.showSaveFilePicker = async () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; };
  const cancelled = await saveProfileToDisk(rich, cancelEnv);
  ok(cancelled.ok === false && cancelled.aborted === true && cancelEnv._blobs.length === 0,
    'a cancelled save dialog does not trigger a second download');

  // Picker blowing up for any other reason falls back to the download.
  const brokenEnv = fakeEnv();
  brokenEnv.showSaveFilePicker = async () => { throw new Error('not implemented'); };
  const broken = await saveProfileToDisk(rich, brokenEnv, { at: '2026-01-02T03:04:05.000Z' });
  ok(broken.ok === true && broken.via === 'download', 'a failing picker falls back to the download');

  // File reading: File.text() path and the no-file path.
  const read = await readSaveFile({ text: async () => exportProfileText(rich) });
  ok(read.ok === true && importProfileText(read.text).ok === true,
    'readSaveFile reads a picked file through File.text()');
  const none = await readSaveFile(null);
  ok(none.ok === false && none.error, 'readSaveFile reports a missing file instead of throwing');
  const unreadable = await readSaveFile({ text: async () => { throw new Error('unreadable'); } });
  ok(unreadable.ok === false, 'readSaveFile reports a failing read instead of throwing');
}

// =====================================================================
console.log('RECOVERY SLOT:');
{
  const s = fakeStorage();
  ok(readRecovery(s) === null, 'an empty recovery slot reads as null');
  const corrupt = '{broken';
  const s2 = seeded(corrupt);
  loadProfileResult(s2);
  ok(recoveryExportText(s2) === corrupt, 'the preserved payload is handed back verbatim');
  const env = {
    _parts: [],
    Blob: class { constructor(p) { this.parts = p; } },
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} },
    document: { createElement: () => ({ style: {}, setAttribute() {}, click() {}, remove() {} }), body: { appendChild() {} } },
  };
  const dl = downloadRecovery(s2, env);
  ok(dl.ok === true && dl.filename === 'hordes-recovered-save.json',
    'the preserved payload can be downloaded so the player keeps the data');
  ok(downloadRecovery(fakeStorage(), env).ok === false,
    'nothing to recover is reported, not an empty download');

  // A storage whose recovery write fails must not lose the load path.
  const full = seeded('{broken');
  full.failWrites = true;
  const res = loadProfileResult(full);
  ok(res.profile.version === SCHEMA_VERSION && res.recoveryKey === null,
    'a full storage still yields a playable profile');
}

if (failed) { console.error(`\n${failed} FAILURES`); process.exit(1); }
console.log('\nALL SAVE-FOUNDATION TESTS PASSED');
