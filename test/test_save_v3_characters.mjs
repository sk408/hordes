// HORDES — SAVE SCHEMA v3: the NAMESPACED PER-CHARACTER SECTION (G19).
//
// Covers the wave brief path by path:
//   * v2 -> v3 migration preserves EVERY field and populates nothing;
//   * v1 -> v3 and v0 -> v3 chain-migrate all the way forward;
//   * unknown future fields survive (top-level AND inside a character entry);
//   * the new validation drops unknown character ids / repairs bad values
//     field-by-field (one bad field never invalidates the profile) and reports
//     every repair;
//   * export -> import is a lossless round-trip INCLUDING per-character data;
//   * the accessor API (read / add / set / reset) validates inputs the same way
//     and never mutates on a rejected call.
//
// Schema-only wave: nothing populates characters, so every profile here starts
// with `characters: {}`. Run: node test/test_save_v3_characters.mjs (exit 0 = pass)
import assert from 'node:assert';
import {
  SCHEMA_VERSION, PROFILE_VERSION, STORAGE_KEY, VERSION_HISTORY,
  makeProfile, loadProfile, loadProfileResult, saveProfile, validateProfile,
  exportProfileText, buildExport, importProfileText,
  getCharacterProgress, getCharacterUpgradeLevel, setCharacterUpgradeLevel,
  addCharacterUpgrade, resetCharacterProgress,
  CHARACTERS,
} from '../src/meta.js';
import * as SAVE from '../src/save.js';

let failed = 0;
function ok(cond, msg) {
  if (cond) { console.log('  PASS ' + msg); }
  else { failed++; console.error('  FAIL ' + msg); }
}
function deepEq(a, b, msg) {
  try { assert.deepStrictEqual(a, b); console.log('  PASS ' + msg); }
  catch (err) {
    failed++;
    console.error('  FAIL ' + msg + '\n    ' + String(err.message).split('\n').slice(0, 6).join('\n    '));
  }
}
function throwsNot(fn, msg) {
  try { fn(); console.log('  PASS ' + msg); }
  catch (err) { failed++; console.error('  FAIL ' + msg + ' (threw: ' + err.message + ')'); }
}

function fakeStorage(seed) {
  const map = new Map(seed ? Object.entries(seed) : []);
  const st = {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
  return st;
}
const seeded = (raw) => fakeStorage({ [STORAGE_KEY]: raw });
const seededJson = (obj) => seeded(JSON.stringify(obj));

// Synthetic catalog (save.js is catalog-injected): two characters and ONE known
// per-character upgrade row with a maxLevel, so clamping is exercised in
// isolation from the live (currently EMPTY) CHARACTER_UPGRADES table.
const CAT = {
  characters: { HERO: { id: 'HERO' }, EXTRA: { id: 'EXTRA' } },
  shopById: { dmg: { id: 'dmg', maxLevel: 3 } },
  characterUpgradeById: { rage: { id: 'rage', maxLevel: 2 } },
  validWeapons: new Set(['BASE']),
  validElites: new Set(),
  starterWeapons: ['BASE'],
  defaultCharacter: 'HERO',
};

// =====================================================================
console.log('SCHEMA v3 + NAMESPACE SHAPE:');
{
  ok(SCHEMA_VERSION === PROFILE_VERSION && PROFILE_VERSION === 3,
    `schema version is 3 (got ${SCHEMA_VERSION}/${PROFILE_VERSION})`);
  ok(VERSION_HISTORY.some(v => v.version === 3 && /per-character/i.test(v.note)),
    'VERSION_HISTORY documents the v3 per-character namespace');
  ok(STORAGE_KEY === 'hordes_profile_v1',
    `STORAGE_KEY is UNCHANGED so existing players keep loading (${STORAGE_KEY})`);

  const fresh = makeProfile();
  ok(fresh.version === SCHEMA_VERSION, 'a fresh profile is current-version (v3)');
  deepEq(fresh.characters, {}, 'a fresh profile has an EMPTY per-character namespace (nothing populated)');
  ok(Array.isArray(fresh.unlockedCharacters) && fresh.gold === 0,
    'the existing collections are unaffected by the v3 addition');
  // The namespace must be keyed, never a pile of top-level fields.
  ok(!('knight_upgrades' in fresh) && !('witch_upgrades' in fresh) &&
     !Object.keys(fresh).some(k => /_upgrades$/.test(k)),
    'no top-level per-character fields exist — only the characters namespace');

  // The namespace is keyed by character id, so the LIVE catalog ids are the keys.
  const p = makeProfile();
  addCharacterUpgrade(p, 'KNIGHT', 'knight_anything');
  ok(Object.prototype.hasOwnProperty.call(p.characters, 'KNIGHT'),
    'per-character progress lives at characters[<id>], keyed by character id');
  ok(p.characters.KNIGHT.upgrades.knight_anything === 1,
    'the namespace entry holds { upgrades: { <upgradeId>: level } }');

  // Catalog-free isolation: save.js alone understands the namespace.
  const iso = SAVE.defaultProfile(CAT);
  deepEq(iso.characters, {}, 'save.js builds an empty namespace off an injected catalog alone');
}

// =====================================================================
console.log('v2 -> v3 MIGRATION (preserve everything, populate nothing):');
{
  const v2 = {
    version: 2,
    gold: 4321,
    purchased: { dmg: 2, hp: 1, futureThing: 3 },
    unlockedCharacters: ['KNIGHT', 'WITCH'],
    equippedCharacter: 'WITCH',
    unlockedWeapons: ['VOLLEY', 'BOOMERANG', 'MINE'],
    unlockedElites: ['SWIFT'],
    bestTime: 210,
    runsPlayed: 12,
    achievements: { firstBlood: { at: 1700000000000, count: 2 } },
    trophies: ['boss_slayer'],
    encounters: { grunt: 41, elite_brute: 2 },
    nested: { bossKills: 3, tags: ['a', 'b'] },
  };
  const original = JSON.stringify(v2);
  const s = seededJson(v2);
  const res = loadProfileResult(s);
  ok(res.status === 'migrated' && res.from === 2 && res.profile.version === SCHEMA_VERSION,
    `a v2 save migrates to v3 (status=${res.status}, from=${res.from})`);
  deepEq(res.migrations, [2], 'the v2 -> v3 step is the ONLY migration applied to a v2 save');
  deepEq(res.profile.characters, {}, 'the migration populates NO character with upgrades');
  ok(res.profile.gold === 4321 && res.profile.purchased.dmg === 2 &&
     res.profile.purchased.futureThing === 3,
    'currency + every purchased level (known and unknown) survive the v2 -> v3 step');
  ok(res.profile.unlockedCharacters.join(',') === 'KNIGHT,WITCH' &&
     res.profile.equippedCharacter === 'WITCH',
    'character unlocks + equipment survive the v2 -> v3 step');
  ok(res.profile.unlockedWeapons.includes('MINE') && res.profile.unlockedElites[0] === 'SWIFT',
    'weapon + elite unlocks survive the v2 -> v3 step');
  ok(res.profile.bestTime === 210 && res.profile.runsPlayed === 12 &&
     res.profile.achievements.firstBlood.count === 2 && res.profile.trophies[0] === 'boss_slayer' &&
     res.profile.encounters.grunt === 41 && res.profile.nested.x === undefined &&
     res.profile.nested.tags.length === 2,
    'EVERY unknown top-level field survives the v2 -> v3 step verbatim');
  ok(res.profile.version === 3 && s.getItem(STORAGE_KEY) === original,
    'migration is pure: the stored v2 payload is not rewritten on load');

  // A v2 save that (somehow) already carries a namespace keeps its data.
  const pre = loadProfileResult(seededJson({
    version: 2, gold: 0, characters: { KNIGHT: { upgrades: { rage: 2 }, specialty: 'fire' } },
  }));
  ok(pre.from === 2 && pre.profile.characters.KNIGHT &&
     pre.profile.characters.KNIGHT.upgrades.rage === 2 &&
     pre.profile.characters.KNIGHT.specialty === 'fire',
    'a v2 save already holding characters data carries it forward untouched');

  // Migration + save/load is stable (idempotent).
  const s2 = seededJson(v2);
  const first = loadProfileResult(s2).profile;
  saveProfile(first, s2);
  const second = loadProfileResult(s2);
  ok(second.status === 'current', `a re-saved migrated profile loads as current (${second.status})`);
  deepEq(second.profile, first, 'the migrated v3 profile is stable across a save/load cycle');
}

// =====================================================================
console.log('CHAINED MIGRATION (v1 -> v3, v0 -> v3):');
{
  // v1: weapon-economy era, float currency, everything else absent.
  const v1 = loadProfileResult(seededJson({ version: 1, gold: 12.9, unlockedCharacters: ['KNIGHT'] }));
  ok(v1.status === 'migrated' && v1.from === 1 && v1.profile.version === SCHEMA_VERSION,
    `a v1 save migrates ALL the way to v${SCHEMA_VERSION} (from=${v1.from})`);
  deepEq(v1.migrations, [1, 2], 'the v1 save runs both the 1 -> 2 and 2 -> 3 steps in order');
  ok(v1.profile.gold === 12, 'the chained migration still clamps currency (1 -> 2 step)');
  deepEq(v1.profile.characters, {}, 'the chained migration adds an empty v3 namespace');

  // v0: the original unversioned playtest shape.
  const legacy = {
    gold: 2636,
    purchased: { dmg: 1, hp: 2 },
    unlockedCharacters: ['KNIGHT', 'WITCH'],
    equippedCharacter: 'WITCH',
    bestTime: 187.5,
  };
  const v0 = loadProfileResult(seededJson(legacy));
  ok(v0.status === 'migrated' && v0.from === 0 && v0.profile.version === SCHEMA_VERSION,
    `a v0 (unversioned) save migrates to v${SCHEMA_VERSION} (from=${v0.from})`);
  deepEq(v0.migrations, [0, 1, 2], 'the whole chain 0 -> 1 -> 2 -> 3 runs');
  ok(v0.profile.bestTime === 187.5 && v0.profile.purchased.dmg === 1 &&
     v0.profile.equippedCharacter === 'WITCH',
    'the v0 -> v3 chain preserves the legacy fields');
  deepEq(v0.profile.characters, {}, 'the v0 -> v3 chain adds an empty namespace');
}

// =====================================================================
console.log('UNKNOWN-FIELD PRESERVATION (top-level + inside the namespace):');
{
  const v = (obj) => validateProfile(obj).profile;

  // A v3 save written by a NEWER module: unknown top-level collections and
  // unknown sibling fields inside a character entry must both survive.
  const rich = {
    version: 3,
    gold: 5,
    characters: {
      KNIGHT: { upgrades: { rage: 2 }, specialty: 'fire', mastery: { tier: 3 } },
    },
    achievements: { a: 1 },
    encounters: { grunt: 3 },
    deep: { x: [1, 2] },
  };
  const out = v(rich);
  ok(out.achievements.a === 1 && out.encounters.grunt === 3 && out.deep.x.length === 2,
    'unknown top-level collections are preserved verbatim');
  ok(out.characters.KNIGHT.specialty === 'fire' && out.characters.KNIGHT.mastery.tier === 3,
    'unknown SIBLING fields inside a character entry are preserved (namespace passthrough)');
  ok(out.characters.KNIGHT.upgrades.rage === 2,
    'an unknown per-character upgrade id keeps its finite value (newer-module data survives)');

  // Round-trip: preservation is not just in-memory.
  const text = exportProfileText(out, { at: '2026-01-02T03:04:05.000Z' });
  deepEq(importProfileText(text).profile, out,
    'unknown top-level + in-namespace fields survive an export -> import round-trip');
}

// =====================================================================
console.log('VALIDATION OF THE NEW COLLECTION (drop-and-repair, field by field):');
{
  const v = (obj) => validateProfile(obj).profile;

  // ---- drop unknown character ids, keep the valid ones ----
  const dropped = validateProfile({
    characters: { KNIGHT: { upgrades: { rage: 1 } }, DRAGON: { upgrades: { rage: 9 } } },
  });
  ok(!Object.prototype.hasOwnProperty.call(dropped.profile.characters, 'DRAGON'),
    'an unknown character id is DROPPED from the namespace');
  ok(dropped.profile.characters.KNIGHT && dropped.profile.characters.KNIGHT.upgrades.rage === 1,
    'a valid character in the same namespace still loads (one bad key does not invalidate the rest)');
  ok(dropped.repairs.includes('characters.DRAGON'),
    'the dropped character id is recorded in the validation report');

  // ---- malformed entries are dropped whole ----
  for (const bad of ['nope', 42, null, ['x'], true]) {
    const r = validateProfile({ characters: { KNIGHT: bad, WITCH: { upgrades: { rage: 1 } } } });
    ok(!Object.prototype.hasOwnProperty.call(r.profile.characters, 'KNIGHT') &&
       r.profile.characters.WITCH.upgrades.rage === 1 &&
       r.repairs.includes('characters.KNIGHT'),
      `a malformed character entry (${JSON.stringify(bad)}) is dropped + reported, siblings survive`);
  }

  // ---- value repair inside upgrades ----
  const repairs = validateProfile({
    characters: {
      KNIGHT: { upgrades: { neg: -4, frac: 2.9, junk: 'x', inf: Infinity, good: 3 } },
    },
  });
  const up = repairs.profile.characters.KNIGHT.upgrades;
  ok(up.neg === 0 && up.junk === 0 && up.inf === 0,
    'negative / junk / non-finite upgrade levels repair to 0');
  ok(up.frac === 2, 'a fractional upgrade level floors');
  ok(up.good === 3, 'a good level in the SAME map is untouched');
  ok(repairs.repairs.includes('characters.KNIGHT.upgrades.neg') &&
     repairs.repairs.includes('characters.KNIGHT.upgrades.junk') &&
     repairs.repairs.includes('characters.KNIGHT.upgrades.frac'),
    'every repaired upgrade level is named in the report');

  // ---- a KNOWN catalog row clamps to its maxLevel (synthetic catalog) ----
  const iso = SAVE.validateProfile({ characters: { HERO: { upgrades: { rage: 99, other: 99 } } } }, CAT);
  ok(iso.profile.characters.HERO.upgrades.rage === 2,
    'a known per-character upgrade row clamps to its catalog maxLevel');
  ok(iso.profile.characters.HERO.upgrades.other === 99,
    'an unknown row in the same map keeps its value (future modules are safe)');

  // ---- container-level junk ----
  ok(Object.keys(v({ characters: ['KNIGHT'] }).characters).length === 0,
    'an array characters field becomes an empty namespace');
  ok(Object.keys(v({ characters: 'KNIGHT' }).characters).length === 0,
    'a string characters field becomes an empty namespace');
  ok(Object.keys(v({}).characters).length === 0,
    'a MISSING characters field defaults to an empty namespace');

  // A missing field is a default fill-in, not damage; a garbage one IS flagged.
  ok(!validateProfile({ gold: 1 }).repairs.includes('characters'),
    'a missing characters field is not cried out as a repair');
  ok(validateProfile({ characters: 'x' }).repairs.includes('characters'),
    'a present-but-garbage characters field IS reported as a repair');
  ok(validateProfile({ characters: { KNIGHT: { upgrades: 'x' } } }).repairs
       .includes('characters.KNIGHT.upgrades'),
    'a non-object upgrades field is reported as a repair');

  // ---- prototype pollution through the namespace ----
  const raw = '{"version":3,"gold":0,"characters":{"__proto__":{"upgrades":{"polluted":1}},' +
    '"constructor":2,"KNIGHT":{"upgrades":{"__proto__":{"polluted":2},"rage":1}}}}';
  const pol = loadProfileResult(seeded(raw));
  ok(!({}).polluted && !('polluted' in {}), 'no prototype pollution through the namespace');
  ok(!Object.prototype.hasOwnProperty.call(pol.profile.characters, '__proto__') &&
     !Object.prototype.hasOwnProperty.call(pol.profile.characters, 'constructor'),
    'unsafe character-id keys are dropped');
  ok(!Object.prototype.hasOwnProperty.call(pol.profile.characters.KNIGHT.upgrades, '__proto__'),
    'unsafe upgrade-id keys are dropped');
  ok(pol.profile.characters.KNIGHT.upgrades.rage === 1,
    'the safe entries in the same namespace still load');

  // ---- reported through the LOAD result, never silent ----
  const loaded = loadProfileResult(seededJson({
    version: 3, gold: 0, characters: { NOPE: { upgrades: { rage: 1 } }, KNIGHT: { upgrades: { rage: -1 } } },
  }));
  ok(loaded.status === 'repaired' && loaded.repairs.length >= 2 && /REPAIRED/.test(loaded.notice || ''),
    `a namespace repair is reported to the player (status=${loaded.status}, repairs=${loaded.repairs.length})`);

  // Hostile namespace shapes never throw.
  for (const h of ['{"characters":[]}', '{"characters":3}', '{"characters":{"KNIGHT":[]}}',
    '{"characters":{"KNIGHT":{"upgrades":[]}}}', '{"characters":{"KNIGHT":{"upgrades":{"a":{}}}}}']) {
    throwsNot(() => loadProfileResult(seeded(h)), `hostile namespace payload survives: ${h}`);
  }
}

// =====================================================================
console.log('EXPORT / IMPORT ROUND-TRIP WITH PER-CHARACTER DATA:');
{
  const rich = makeProfile();
  rich.gold = 98765;
  rich.purchased = { dmg: 3, hp: 2, futureThing: 2 };
  rich.unlockedCharacters = ['KNIGHT', 'WITCH', 'ROGUE'];
  rich.equippedCharacter = 'WITCH';
  rich.unlockedWeapons = ['VOLLEY', 'BOOMERANG', 'ZAP'];
  rich.unlockedElites = ['SWIFT'];
  // Populate per-character data through the documented accessors.
  addCharacterUpgrade(rich, 'KNIGHT', 'knight_toughness', 2);
  addCharacterUpgrade(rich, 'WITCH', 'witch_mana', 1);
  rich.characters.KNIGHT.specialty = 'fire';   // a future sibling field

  const at = '2026-01-02T03:04:05.000Z';
  const env = buildExport(rich, { at });
  const text = exportProfileText(rich, { at });
  ok(env.schemaVersion === SCHEMA_VERSION && env.profile.characters.KNIGHT.upgrades.knight_toughness === 2,
    'the export envelope carries the per-character namespace at the correct schema version');

  const res = importProfileText(text);
  ok(res.ok === true && res.status === 'imported', `the export imports cleanly (${res.status})`);
  deepEq(res.profile.characters, rich.characters,
    'export -> import is LOSSLESS for the per-character namespace');
  deepEq(res.profile, rich, 'the WHOLE profile round-trips (per-character data included)');
  ok(exportProfileText(res.profile, { at }) === text, 'a second export is byte-identical (stable round trip)');

  // A raw v2 payload (the previous schema) still imports and migrates.
  const v2Text = JSON.stringify({ version: 2, gold: 42, purchased: { dmg: 1 } });
  const v2res = importProfileText(v2Text);
  ok(v2res.ok === true && v2res.status === 'imported-migrated' && v2res.from === 2,
    'a raw v2 payload imports + migrates');
  deepEq(v2res.profile.characters, {}, 'a migrated import gets an empty namespace, populated with nothing');

  // And it survives the real storage round-trip through meta.js.
  const s = fakeStorage();
  saveProfile(rich, s);
  const back = loadProfile(s);
  deepEq(back.characters, rich.characters, 'per-character data survives save -> load through meta.js');
  ok(back.characters.KNIGHT.specialty === 'fire', 'the future sibling field survives persistence too');
}

// =====================================================================
console.log('ACCESSOR API (read / add / set / reset — validated, never mutates on reject):');
{
  const p = makeProfile();

  // ---- read ----
  deepEq(getCharacterProgress(p, 'KNIGHT'), { upgrades: {} },
    'a known character with no progress reads as { upgrades: {} } (not null, not half-built)');
  ok(getCharacterProgress(p, 'NOBODY') === null, 'an unknown character id reads as null');
  ok(getCharacterUpgradeLevel(p, 'KNIGHT', 'whatever') === 0,
    'an unowned upgrade level reads as 0');

  // The read is a COPY: mutating it cannot corrupt the profile.
  const snap = getCharacterProgress(p, 'KNIGHT');
  snap.upgrades.injected = 99;
  ok(getCharacterUpgradeLevel(p, 'KNIGHT', 'injected') === 0 && !p.characters.KNIGHT,
    'getCharacterProgress returns an independent copy (mutating it does not touch the profile)');

  // ---- add ----
  ok(addCharacterUpgrade(p, 'KNIGHT', 'toughness') === true, 'addCharacterUpgrade succeeds');
  ok(getCharacterUpgradeLevel(p, 'KNIGHT', 'toughness') === 1, 'the default amount is +1');
  addCharacterUpgrade(p, 'KNIGHT', 'toughness');
  addCharacterUpgrade(p, 'KNIGHT', 'toughness');
  ok(getCharacterUpgradeLevel(p, 'KNIGHT', 'toughness') === 3, 'repeated adds stack');
  ok(addCharacterUpgrade(p, 'KNIGHT', 'toughness', 5) === true &&
     getCharacterUpgradeLevel(p, 'KNIGHT', 'toughness') === 8, 'a larger amount adds at once');

  // ---- set / clamp / floor ----
  ok(setCharacterUpgradeLevel(p, 'WITCH', 'mana', 4) === true &&
     getCharacterUpgradeLevel(p, 'WITCH', 'mana') === 4, 'setCharacterUpgradeLevel sets an exact level');
  ok(setCharacterUpgradeLevel(p, 'WITCH', 'mana', 2.9) === true &&
     getCharacterUpgradeLevel(p, 'WITCH', 'mana') === 2, 'a set level floors');
  ok(setCharacterUpgradeLevel(p, 'WITCH', 'mana', -5) === true &&
     getCharacterUpgradeLevel(p, 'WITCH', 'mana') === 0, 'a negative set level clamps to 0');

  // Known catalog row clamps to maxLevel (synthetic catalog, isolated).
  const iso = SAVE.defaultProfile(CAT);
  SAVE.addCharacterUpgrade(iso, 'HERO', 'rage', 99, CAT);
  ok(SAVE.getCharacterUpgradeLevel(iso, 'HERO', 'rage', CAT) === 2,
    'run-time adds clamp to a known catalog row maxLevel');
  SAVE.setCharacterUpgradeLevel(iso, 'HERO', 'rage', 99, CAT);
  ok(SAVE.getCharacterUpgradeLevel(iso, 'HERO', 'rage', CAT) === 2,
    'run-time sets clamp to a known catalog row maxLevel');
  SAVE.setCharacterUpgradeLevel(iso, 'HERO', 'freeform', 7, CAT);
  ok(SAVE.getCharacterUpgradeLevel(iso, 'HERO', 'freeform', CAT) === 7,
    'an unknown row is not clamped (future modules keep their data)');

  // ---- invalid input is rejected WITHOUT mutating ----
  const before = JSON.stringify(p);
  ok(addCharacterUpgrade(p, 'NOBODY', 'toughness') === false, 'add rejects an unknown character id');
  ok(addCharacterUpgrade(p, 'KNIGHT', '') === false, 'add rejects an empty upgrade id');
  ok(addCharacterUpgrade(p, 'KNIGHT', null) === false, 'add rejects a non-string upgrade id');
  ok(addCharacterUpgrade(p, 'KNIGHT', 'toughness', NaN) === false, 'add rejects a non-finite amount');
  ok(setCharacterUpgradeLevel(p, 'NOBODY', 'x', 1) === false, 'set rejects an unknown character id');
  ok(setCharacterUpgradeLevel(p, 'KNIGHT', 'x', NaN) === false, 'set rejects a non-finite level');
  ok(setCharacterUpgradeLevel(null, 'KNIGHT', 'x', 1) === false, 'set rejects a non-object profile');
  ok(addCharacterUpgrade(null, 'KNIGHT', 'x') === false, 'add rejects a non-object profile');
  ok(JSON.stringify(p) === before, 'every rejected accessor call left the profile byte-identical');

  // ---- reset ----
  ok(resetCharacterProgress(p, 'KNIGHT') === true, 'resetCharacterProgress succeeds');
  ok(!Object.prototype.hasOwnProperty.call(p.characters, 'KNIGHT'),
    'reset removes the whole namespace entry (the character starts from nothing)');
  ok(getCharacterUpgradeLevel(p, 'KNIGHT', 'toughness') === 0, 'the reset character reads 0 again');
  ok(getCharacterUpgradeLevel(p, 'WITCH', 'mana') === 0 &&
     Object.prototype.hasOwnProperty.call(p.characters, 'WITCH'),
    'reset touches ONLY the named character (the other entry is kept)');
  ok(resetCharacterProgress(p, 'NOBODY') === false, 'reset rejects an unknown character id');
  ok(resetCharacterProgress(p, 'KNIGHT') === true, 'a no-op reset on a clear character still succeeds');

  // ---- meta.js injects the live catalog (real character ids gate the accessors) ----
  ok(Object.prototype.hasOwnProperty.call(CHARACTERS, 'KNIGHT') &&
     addCharacterUpgrade(makeProfile(), 'KNIGHT', 'x') === true,
    'meta.js accessors accept a real live character id');
  ok(addCharacterUpgrade(makeProfile(), 'NOT_A_CHARACTER', 'x') === false,
    'meta.js accessors reject an id that is not in the live CHARACTERS table');
}

if (failed) { console.error(`\n${failed} FAILURES`); process.exit(1); }
console.log('\nALL SAVE-SCHEMA-V3 CHARACTER-NATESPACE TESTS PASSED');
