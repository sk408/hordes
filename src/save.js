// HORDES — SAVE FOUNDATION (W1): versioned profile schema, migration,
// validation for every persisted collection, deliberate corrupted-save
// behaviour, and lossless export/import.
//
// v3 (this wave) adds the NAMESPACED PER-CHARACTER SECTION: profile.characters
// is a map keyed by character id ({ [characterId]: { upgrades: {...}, ... } }),
// never a pile of top-level `knight_upgrades` fields. The whole point is that
// every FUTURE piece of per-character data (specialisations, skill trees,
// mastery) lands inside this namespace, so it never needs another top-level
// migration. This wave is schema + migration + validation + accessors only:
// nothing is populated, no game behaviour and no balance changes.
//
// WHY THIS MODULE EXISTS: the profile is the game's only durable state, and
// every upcoming feature (achievements, trophies, enemy encounters, challenge
// modes) persists into it. Before this module the loader type-checked a single
// field (`equippedCharacter`) and accepted every other collection verbatim,
// with no version and no migration path — so a damaged or older save could
// silently destroy a player's gallery. This module owns:
//
//   1. SCHEMA_VERSION + a documented, tested migration chain for older saves
//      (including saves with fields missing entirely);
//   2. validation of EVERY persisted collection — unlocks, currency,
//      equipped selections and the purchased map — repaired deterministically
//      rather than trusted;
//   3. deliberate corrupted / future-version behaviour: never crash, never
//      silently wipe. The unreadable payload is preserved under a separate
//      key, the player starts clean, and the caller is told what happened;
//   4. lossless export/import: pure text transforms (tested by round-trip)
//      plus browser download / file-read helpers that are guard-only so the
//      module stays importable under node.
//
// CATALOG-INJECTED BY DESIGN: this file imports nothing from the rest of the
// game. The caller (src/meta.js) passes a catalog of the live tables
// (characters, shop rows, weapon/elite id sets), so the schema layer stays
// testable in isolation and cannot drift from the data it validates against.
// Node-safe: no DOM access at import time; browser APIs are touched only
// inside the IO helpers, behind typeof guards.

// ---------- Schema identity ----------

// Current schema version. Bump this and add a MIGRATIONS step whenever a
// change cannot be expressed as an additive field.
export const PROFILE_VERSION = 5;
export const SCHEMA_VERSION = PROFILE_VERSION;   // alias, for callers that prefer the explicit name

// The localStorage key is deliberately UNCHANGED: existing players' saves must
// keep loading. Versioning lives inside the payload, not in the key.
export const STORAGE_KEY = 'hordes_profile_v1';

// Where an unreadable or future-version payload is preserved so it can be
// recovered (never silently dropped).
export const RECOVERY_KEY = 'hordes_profile_recovery';

// Export envelope marker. Lets an import tell a HORDES export from any other
// JSON file the player might pick.
export const EXPORT_FORMAT = 'hordes-profile';

// Documented version history (kept in code so the migration table and the
// docs cannot drift apart).
export const VERSION_HISTORY = [
  {
    version: 0,
    note: 'Implicit: any save without a numeric "version" field (the original ' +
      'gold/purchased/unlockedCharacters/equippedCharacter shape, plus whatever ' +
      'later modules appended). Treated as v0 and migrated forward.',
  },
  {
    version: 1,
    note: 'WAVE-11 weapon economy: profile gains unlockedWeapons / unlockedElites. ' +
      'Pre-economy saves get the STARTER SET ONLY (retroactive reset, Sk408-approved).',
  },
  {
    version: 2,
    note: 'W1 save foundation: explicit "version" field, integer-clamped currency, ' +
      'validated collections, prototype-pollution-safe purchased map, and a ' +
      'reserved recovery key for unreadable payloads.',
  },
  {
    version: 3,
    note: 'G19 per-character namespace: profile.characters is a map keyed by ' +
      'character id ({ [characterId]: { upgrades: { upgradeId: level }, ... } }), ' +
      'validated against the live character + per-character upgrade catalogs. ' +
      'Populated empty — no character starts with upgrades.',
  },
  {
    version: 4,
    note: 'G9 achievements: profile.achievements = { v, earned: { [id]: epochMs }, ' +
      'progress: { [id]: n }, totals: {...} }. Earned trophies are NEVER dropped by ' +
      'validation (a damaged stamp repairs to 1, never to "unearned"). Populated empty — ' +
      'an existing player starts with no trophies and no progress recycled.',
  },
  {
    version: 5,
    note: 'G10 encounters namespace: profile.encounters = { v, entries: { [id]: ' +
      '{ firstWave, firstAt, kills, bestWave, bestTier } } } with namespaced ids ' +
      '(enemy:CHASER / boss:GRAVELMAW / tier:RARE). A discovered entry is NEVER ' +
      'dropped by validation (a damaged entry repairs to kills >= 1, never to ' +
      'undiscovered); unknown ids from a newer build are preserved verbatim. ' +
      'Populated empty — no bestiary is invented for an existing player.',
  },
];

// ---------- Small guards ----------

/** Plain object (not null, not an array, not a primitive). */
export function plainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

// Keys that would mutate a prototype if copied into a fresh object with a
// plain assignment. JSON.parse can produce own "__proto__" properties, so a
// hand-edited save is a real pollution vector; drop them on the way in.
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Read the schema version off a raw payload.
 * Anything that is not a non-negative integer (missing, null, NaN, a float, a
 * string, a negative number) means "unversioned legacy" -> 0. That is the safe
 * direction: a malformed version can never be mistaken for a FUTURE one (which
 * would refuse the save) and can never be mistaken for a newer schema.
 */
export function readVersion(raw) {
  const v = plainObject(raw) ? raw.version : undefined;
  if (typeof v !== 'number' || !Number.isFinite(v) || !Number.isInteger(v) || v < 0) return 0;
  return v;
}

// ---------- Storage ----------

/** localStorage-backed storage if present, else a no-op shim (node/sandbox). */
export function detectStorage() {
  try {
    const s = globalThis.localStorage;
    if (s && typeof s.getItem === 'function') return s;
  } catch { /* sandboxed/locked storage — fall through to the no-op shim */ }
  return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
}

function resolveStorage(storage) {
  return storage || detectStorage();
}

// ---------- Migration ----------

/**
 * MIGRATIONS[n] upgrades a payload FROM version n TO version n+1.
 * Each step is pure (returns a new object, never mutates the input) and is
 * documented with the concrete field change it performs.
 */
const MIGRATIONS = {
  // v0 -> v1: WAVE-11 weapon economy. A save with no unlockedWeapons gets the
  // STARTER SET ONLY (nothing is grandfathered — the Sk408-approved retroactive
  // reset); a save with no unlockedElites gets none. Fields that ARE present
  // are left alone for validation to sanitize.
  0: (p, cat) => {
    const next = { ...p };
    if (!Array.isArray(next.unlockedWeapons)) next.unlockedWeapons = [...cat.starterWeapons];
    if (!Array.isArray(next.unlockedElites)) next.unlockedElites = [];
    return next;
  },
  // v1 -> v2: W1 save foundation. Guarantee the container types the strict
  // validator relies on, and clamp the currency to a finite integer (old saves
  // could hold a float/string left by a hand edit). Lossless for any value
  // that was already sane.
  1: (p, cat) => {
    const next = { ...p };
    if (!plainObject(next.purchased)) next.purchased = {};
    if (!Array.isArray(next.unlockedCharacters)) next.unlockedCharacters = [];
    if (!Array.isArray(next.unlockedWeapons)) next.unlockedWeapons = [...cat.starterWeapons];
    if (!Array.isArray(next.unlockedElites)) next.unlockedElites = [];
    const g = Number(next.gold);
    next.gold = Number.isFinite(g) ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(g))) : 0;
    return next;
  },
  // v2 -> v3: G19 per-character namespace. Guarantee the `characters` container
  // is a plain object (the strict validator relies on it) and NOTHING ELSE —
  // no character is given upgrades, and no existing field is touched, so this
  // step is lossless for every v2 save. Present-but-garbage data is left for
  // validateProfile to repair + report (one repair path, not two).
  2: (p) => {
    const next = { ...p };
    if (!plainObject(next.characters)) next.characters = {};
    return next;
  },
  // v3 -> v4: G9 achievements namespace. Guarantee the container is a plain
  // object and NOTHING ELSE — no trophy is granted, no progress invented, and
  // no existing field is touched, so this step is lossless for every v3 save.
  // Present-but-garbage data is left for validateProfile to repair + report
  // (one repair path, not two).
  3: (p) => {
    const next = { ...p };
    if (!plainObject(next.achievements)) next.achievements = {};
    return next;
  },
  // v4 -> v5: G10 encounters namespace. Guarantee the container is a plain
  // object and NOTHING ELSE — no encounter is invented, and no existing field
  // is touched, so this step is lossless for every v4 save. Present-but-garbage
  // data is left for validateProfile to repair + report (one repair path, not
  // two).
  4: (p) => {
    const next = { ...p };
    if (!plainObject(next.encounters)) next.encounters = {};
    return next;
  },
};

/**
 * Migrate a parsed payload up to PROFILE_VERSION.
 *
 * Returns { ok:true, profile, from, status:'current'|'migrated', migrations }
 * or     { ok:false, status:'future-version', from } for a save written by a
 * NEWER build. A future save is never loaded: this build cannot know which
 * fields it would drop, and half-loading it is exactly the silent-wipe failure
 * mode this module exists to prevent.
 */
export function migrateProfile(raw, cat) {
  const base = plainObject(raw) ? raw : {};
  const from = readVersion(base);
  if (from > PROFILE_VERSION) return { ok: false, status: 'future-version', from };
  let cur = { ...base };
  const applied = [];
  for (let v = from; v < PROFILE_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (step) { cur = step(cur, cat); applied.push(v); }
    cur.version = v + 1;
  }
  if (cur.version !== PROFILE_VERSION) cur.version = PROFILE_VERSION;
  return {
    ok: true,
    status: from < PROFILE_VERSION ? 'migrated' : 'current',
    from,
    migrations: applied,
    profile: cur,
  };
}

// ---------- Validation ----------

/**
 * Validate/repair every persisted collection. Deterministic: the same input
 * always yields the same output, and a valid profile passes through unchanged.
 *
 * Returns { profile, repairs } where `repairs` lists the fields that had to be
 * corrected (empty for a clean save) so the caller can TELL the player rather
 * than silently fixing things behind their back.
 *
 * Unknown top-level fields are preserved verbatim: future waves append
 * achievements / trophies / encounters without touching this file, and the
 * export round-trip stays lossless.
 */
export function validateProfile(profile, cat) {
  const p = plainObject(profile) ? profile : {};
  const repairs = [];
  const out = { ...p };

  // ---- currency ----
  const g = Number(p.gold);
  const gold = Number.isFinite(g)
    ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(g)))
    : 0;
  if (gold !== p.gold) repairs.push('gold');
  out.gold = gold;

  // ---- purchased (upgradeId -> level) ----
  // Levels for KNOWN shop rows clamp to that row's current maxLevel (an
  // old-economy or hand-edited save must not over-grant); unknown ids keep
  // their finite non-negative integer value so data written by a newer module
  // survives; anything else becomes 0.
  const purchased = {};
  if (plainObject(p.purchased)) {
    for (const [id, lvl] of Object.entries(p.purchased)) {
      if (UNSAFE_KEYS.has(id)) { repairs.push('purchased.' + id); continue; }
      const n = Number(lvl);
      if (!Number.isFinite(n)) { purchased[id] = 0; repairs.push('purchased.' + id); continue; }
      const iv = Math.max(0, Math.floor(n));
      const def = cat.shopById[id];
      purchased[id] = def ? Math.min(iv, def.maxLevel) : iv;
      if (purchased[id] !== lvl) repairs.push('purchased.' + id);
    }
  } else if (p.purchased !== undefined) {
    repairs.push('purchased');
  }
  out.purchased = purchased;

  // ---- characters (G19 per-character namespace) ----
  // NAMESPACED BY CHARACTER ID on purpose: profile.characters[characterId] =
  // { upgrades: { upgradeId: level }, ... }. A future per-character feature
  // (specialisations, skill trees) extends this entry — it never adds another
  // top-level key like `knight_upgrades`, so it never needs a new migration.
  //
  // Rules, in the same style as the other collections:
  //   * a key that is not a live catalog character id is DROPPED (and
  //     reported) — the namespace is keyed by the catalog, not by arbitrary
  //     save text;
  //   * a malformed entry (not an object) is dropped whole;
  //   * UNKNOWN sibling fields inside a surviving entry are preserved verbatim
  //     (the namespace's own passthrough, for a newer module's data);
  //   * `upgrades` values are finite non-negative integers, clamped to a known
  //     row's maxLevel when the per-character upgrade catalog declares one
  //     (unknown ids keep their finite integer, exactly like `purchased`);
  //   * one bad field never invalidates the entry, the character, or the file.
  const charactersIn = p.characters;
  const characters = {};
  if (plainObject(charactersIn)) {
    for (const [cid, entry] of Object.entries(charactersIn)) {
      if (UNSAFE_KEYS.has(cid)) { repairs.push('characters.' + cid); continue; }
      if (!Object.prototype.hasOwnProperty.call(cat.characters, cid)) {
        repairs.push('characters.' + cid);          // unknown character id -> drop
        continue;
      }
      if (!plainObject(entry)) {
        repairs.push('characters.' + cid);          // malformed entry -> drop
        continue;
      }
      const outEntry = { ...entry };                // preserve unknown sibling fields
      const upgrades = {};
      if (plainObject(entry.upgrades)) {
        for (const [uid, lvl] of Object.entries(entry.upgrades)) {
          if (UNSAFE_KEYS.has(uid)) { repairs.push(`characters.${cid}.upgrades.${uid}`); continue; }
          const n = Number(lvl);
          if (!Number.isFinite(n)) {
            upgrades[uid] = 0;
            repairs.push(`characters.${cid}.upgrades.${uid}`);
            continue;
          }
          const iv = Math.max(0, Math.floor(n));
          const def = cat.characterUpgradeById && cat.characterUpgradeById[uid];
          upgrades[uid] = def ? Math.min(iv, def.maxLevel) : iv;
          if (upgrades[uid] !== lvl) repairs.push(`characters.${cid}.upgrades.${uid}`);
        }
      } else if (entry.upgrades !== undefined) {
        repairs.push(`characters.${cid}.upgrades`);
      }
      outEntry.upgrades = upgrades;
      characters[cid] = outEntry;
    }
  } else if (charactersIn !== undefined) {
    repairs.push('characters');
  }
  out.characters = characters;

  // ---- achievements (G9: trophies + cumulative counters) ----
  // THE SEMANTIC-SAFETY RULE FOR THIS NAMESPACE: an earned trophy is NEVER
  // dropped by validation. The worst a damaged entry can do is lose its
  // timestamp (repaired to 1) or its progress number (repaired to 0) — and the
  // gallery backfills a progress value below the goal from the goal itself, so
  // an earned trophy can never be displayed as "3 / 100". Losing a trophy
  // because a save was hand-edited is the one failure a player never forgives,
  // so this section errs entirely toward keeping.
  //
  // UNKNOWN ids are PRESERVED here (the same policy `purchased` uses): a save
  // written by a NEWER build must round-trip through this one untouched, and
  // an inert id costs nothing — the gallery iterates the known trophy list
  // only, and its earned count counts known ids only.
  //
  // This layer validates STRUCTURE only. Semantic repair (goal backfill,
  // clamping a progress value to its goal) lives in src/achievements.js, which
  // owns the goal table — so this file stays free of achievement-specific
  // knowledge and the two concerns cannot disagree.
  const achIn = plainObject(p.achievements) ? p.achievements : {};
  const earned = {};
  const earnedIn = achIn.earned;
  if (plainObject(earnedIn)) {
    for (const [id, at] of Object.entries(earnedIn)) {
      if (UNSAFE_KEYS.has(id)) { repairs.push('achievements.earned.' + id); continue; }
      if (at === false || at === null || at === undefined || at === '') {
        repairs.push('achievements.earned.' + id); continue;   // not earned at all
      }
      const n = Number(at);
      const stamped = Number.isFinite(n) && Math.floor(n) > 0 ? Math.floor(n) : 1;
      earned[id] = stamped;
      if (stamped !== at) repairs.push('achievements.earned.' + id);
    }
  } else if (earnedIn !== undefined) {
    repairs.push('achievements.earned');
  }
  const achProgress = {};
  const progressIn = achIn.progress;
  if (plainObject(progressIn)) {
    for (const [id, n] of Object.entries(progressIn)) {
      if (UNSAFE_KEYS.has(id)) { repairs.push('achievements.progress.' + id); continue; }
      const v = Number(n);
      if (!Number.isFinite(v)) { achProgress[id] = 0; repairs.push('achievements.progress.' + id); continue; }
      const iv = Math.max(0, Math.floor(v));
      achProgress[id] = iv;
      if (iv !== n) repairs.push('achievements.progress.' + id);
    }
  } else if (progressIn !== undefined) {
    repairs.push('achievements.progress');
  }
  const totals = {};
  const totalsIn = achIn.totals;
  if (plainObject(totalsIn)) {
    for (const [k, n] of Object.entries(totalsIn)) {
      if (UNSAFE_KEYS.has(k)) { repairs.push('achievements.totals.' + k); continue; }
      const v = Number(n);
      if (!Number.isFinite(v)) { totals[k] = 0; repairs.push('achievements.totals.' + k); continue; }
      const iv = Math.max(0, Math.floor(v));
      totals[k] = iv;
      if (iv !== n) repairs.push('achievements.totals.' + k);
    }
  } else if (totalsIn !== undefined) {
    repairs.push('achievements.totals');
  }
  // G11 timed bucket (namespace v2): same STRUCTURE-ONLY pass as progress —
  // opaque '<stat>@<within>' keys preserved verbatim for the newer-build
  // round-trip, values intOr'd. An absent bucket is simply absent (no repair
  // flag): a v1 save is not damaged, it just predates the bucket, and
  // ensureAchievements normalises it on next read.
  const achTimed = {};
  const timedIn = achIn.timed;
  if (plainObject(timedIn)) {
    for (const [k, n] of Object.entries(timedIn)) {
      if (UNSAFE_KEYS.has(k)) { repairs.push('achievements.timed.' + k); continue; }
      const v = Number(n);
      if (!Number.isFinite(v)) { achTimed[k] = 0; repairs.push('achievements.timed.' + k); continue; }
      const iv = Math.max(0, Math.floor(v));
      achTimed[k] = iv;
      if (iv !== n) repairs.push('achievements.timed.' + k);
    }
  } else if (timedIn !== undefined) {
    repairs.push('achievements.timed');
  }
  const achV = Number.isFinite(Number(achIn.v)) && Math.floor(Number(achIn.v)) > 0
    ? Math.floor(Number(achIn.v)) : 1;
  out.achievements = { v: achV, earned, progress: achProgress, totals, timed: achTimed };
  if (!plainObject(p.achievements) && p.achievements !== undefined) repairs.push('achievements');

  // ---- encounters (G10: bestiary sightings) ----
  // THE SEMANTIC-SAFETY RULE FOR THIS NAMESPACE: a discovered entry is NEVER
  // dropped by validation. A present-but-damaged entry repairs to discovered
  // (kills clamped to >= 1), never to undiscovered — losing the bestiary to a
  // hand-edited save is the same unforgivable failure as losing a trophy.
  //
  // UNKNOWN ids are PRESERVED verbatim (the newer-build round-trip rule), and
  // unknown sibling fields INSIDE a surviving entry ride along untouched. A
  // known entry with damaged counters is flagged per-field; an unknown id is
  // never flagged (it is a newer build's data, not damage).
  //
  // This layer validates STRUCTURE only. bestTier resolves through the
  // injected tier table (cat.tierRank): an unknown tier drops the FIELD, not
  // the entry. Semantic rules (the tier ORDERING, what regresses) live in
  // src/encounters.js, which owns the catalog.
  const encIn = plainObject(p.encounters) ? p.encounters : {};
  const encEntries = {};
  const entriesIn = encIn.entries;
  if (plainObject(entriesIn)) {
    for (const [id, e] of Object.entries(entriesIn)) {
      if (UNSAFE_KEYS.has(id)) { repairs.push('encounters.entries.' + id); continue; }
      const known = cat.validEncounters ? cat.validEncounters.has(id) : true;
      // An id this build does not know is a NEWER build's data: preserved
      // VERBATIM (the whole entry, untouched), never structurally rewritten.
      if (!known) { encEntries[id] = e; continue; }
      const flag = (field) => { if (known) repairs.push('encounters.entries.' + id + '.' + field); };
      // A present key IS a discovery: whatever garbage the value is, the entry
      // survives with kills >= 1.
      const src = plainObject(e) ? e : {};
      if (!plainObject(e)) flag('(entry)');
      const outEntry = {};
      for (const [k, v] of Object.entries(src)) {
        if (UNSAFE_KEYS.has(k)) { flag(k); continue; }
        if (k === 'firstWave' || k === 'firstAt' || k === 'bestWave') {
          const n = Number(v);
          if (!Number.isFinite(n) || Math.floor(n) < 0) { outEntry[k] = 0; flag(k); continue; }
          outEntry[k] = Math.floor(n);
          if (outEntry[k] !== v) flag(k);
        } else if (k === 'kills') {
          const n = Number(v);
          const iv = Number.isFinite(n) ? Math.max(1, Math.floor(n)) : 1;
          outEntry.kills = iv;
          if (iv !== v) flag('kills');
        } else if (k === 'bestTier') {
          // Resolve through the tier table; unknown drops the field only.
          if (typeof v === 'string' && cat.tierRank && cat.tierRank[v] !== undefined) {
            outEntry.bestTier = v;
          } else {
            flag('bestTier');
          }
        } else {
          outEntry[k] = v;   // unknown sibling field: preserved verbatim
        }
      }
      if (!outEntry.kills) { outEntry.kills = 1; flag('kills'); }
      if (outEntry.firstWave === undefined) { outEntry.firstWave = 0; flag('firstWave'); }
      if (outEntry.firstAt === undefined) { outEntry.firstAt = 0; flag('firstAt'); }
      encEntries[id] = outEntry;
    }
  } else if (entriesIn !== undefined) {
    repairs.push('encounters.entries');
  }
  const encV = Number.isFinite(Number(encIn.v)) && Math.floor(Number(encIn.v)) > 0
    ? Math.floor(Number(encIn.v)) : 1;
  out.encounters = { v: encV, entries: encEntries };
  if (!plainObject(p.encounters) && p.encounters !== undefined) repairs.push('encounters');

  // ---- unlocked characters + equipped selection ----
  // Real ids only, deduped, KNIGHT (free) always present, and the equipped
  // character must be a member of the validated list.
  const charsIn = Array.isArray(p.unlockedCharacters) ? p.unlockedCharacters : [];
  const unlockedCharacters = [...new Set(
    charsIn.filter(id => typeof id === 'string' && Object.prototype.hasOwnProperty.call(cat.characters, id)))];
  if (!unlockedCharacters.includes(cat.defaultCharacter)) unlockedCharacters.unshift(cat.defaultCharacter);
  // Only flag a repair when a PRESENT collection had to change. A field that is
  // simply absent is a legacy/default fill-in (covered by the migration notice),
  // not damage — flagging it would cry wolf on every sparse save.
  if (p.unlockedCharacters !== undefined) {
    if (!Array.isArray(p.unlockedCharacters)) repairs.push('unlockedCharacters');
    else if (unlockedCharacters.length !== charsIn.length) repairs.push('unlockedCharacters');
  }
  out.unlockedCharacters = unlockedCharacters;

  const equippedOk = typeof p.equippedCharacter === 'string' &&
    unlockedCharacters.includes(p.equippedCharacter);
  out.equippedCharacter = equippedOk ? p.equippedCharacter : cat.defaultCharacter;
  if (!equippedOk && p.equippedCharacter !== undefined && p.equippedCharacter !== out.equippedCharacter) {
    repairs.push('equippedCharacter');
  }

  // ---- weapon unlocks ----
  // Present-but-garbage sanitizes; VOLLEY is the base volley every run fires,
  // so it is always re-added. A missing/garbage field falls back to the
  // starter set (the WAVE-11 retroactive-reset rule).
  let unlockedWeapons;
  if (Array.isArray(p.unlockedWeapons)) {
    unlockedWeapons = [...new Set(p.unlockedWeapons.filter(
      w => typeof w === 'string' && cat.validWeapons.has(w)))];
    // The base volley every run fires is always re-added (catalog-declared so
    // this layer never hardcodes a game id).
    const baseWeapon = cat.baseWeapon || (cat.starterWeapons && cat.starterWeapons[0]);
    if (baseWeapon && !unlockedWeapons.includes(baseWeapon)) unlockedWeapons.unshift(baseWeapon);
    if (unlockedWeapons.length !== p.unlockedWeapons.length) repairs.push('unlockedWeapons');
  } else {
    unlockedWeapons = [...cat.starterWeapons];
    if (p.unlockedWeapons !== undefined) repairs.push('unlockedWeapons');
  }
  out.unlockedWeapons = unlockedWeapons;

  // ---- elite modifier unlocks ----
  const elitesIn = Array.isArray(p.unlockedElites) ? p.unlockedElites : [];
  const unlockedElites = [...new Set(
    elitesIn.filter(e => typeof e === 'string' && cat.validElites.has(e)))];
  if (unlockedElites.length !== elitesIn.length) repairs.push('unlockedElites');
  out.unlockedElites = unlockedElites;
  if (p.unlockedElites !== undefined && !Array.isArray(p.unlockedElites)) repairs.push('unlockedElites');

  // ---- version stamp ----
  if (out.version !== PROFILE_VERSION) repairs.push('version');
  out.version = PROFILE_VERSION;

  return { profile: out, repairs };
}

/** A clean, validated current-version profile (the game's makeProfile). */
export function defaultProfile(cat) {
  return validateProfile({ version: PROFILE_VERSION }, cat).profile;
}

// ---------- Per-character namespace accessors (G19) ----------
// The ONLY sanctioned way for game code to read or change per-character
// progress. They exist so the progression feature wave never pokes at
// profile.characters[...] directly: every read normalises, every write
// validates against the injected catalog the same way validateProfile does,
// and an invalid input is rejected WITHOUT mutating the profile.
//
// Storage shape they operate on (see validateProfile):
//   profile.characters = { [characterId]: { upgrades: { [upgradeId]: level } } }
//
// Catalog contract (the caller's catalog()):
//   cat.characters            { [id]: characterDef }  — determines valid ids
//   cat.characterUpgradeById  { [id]: { maxLevel } }  — OPTIONAL; when present
//                             a known row's level clamps to its maxLevel.

function hasCharacter(cat, characterId) {
  return typeof characterId === 'string' && characterId.length > 0 &&
    plainObject(cat && cat.characters) &&
    Object.prototype.hasOwnProperty.call(cat.characters, characterId);
}

function characterEntry(profile, characterId) {
  const chars = plainObject(profile) && plainObject(profile.characters) ? profile.characters : null;
  return chars ? chars[characterId] : undefined;
}

/** Catalog maxLevel for a per-character upgrade row, or null when unknown. */
function characterUpgradeDef(cat, upgradeId) {
  const table = cat && cat.characterUpgradeById;
  return table && Object.prototype.hasOwnProperty.call(table, upgradeId) ? table[upgradeId] : null;
}

/**
 * Read a character's progress as an INDEPENDENT COPY (mutating the result does
 * NOT change the profile): `{ upgrades: { [upgradeId]: level }, ... }`, with any
 * future sibling fields carried through. Unknown character id -> null; a known
 * character with no progress yet -> `{ upgrades: {} }` (never null, never a
 * half-built object), so callers can read levels unconditionally.
 */
export function getCharacterProgress(profile, characterId, cat) {
  if (!hasCharacter(cat, characterId)) return null;
  const e = characterEntry(profile, characterId);
  const out = plainObject(e) ? { ...e } : {};
  out.upgrades = plainObject(out.upgrades) ? { ...out.upgrades } : {};
  return out;
}

/**
 * One upgrade level for a character: a finite non-negative integer, or 0 when
 * the character is unknown / the upgrade is unowned / the stored value is junk.
 * Never throws.
 */
export function getCharacterUpgradeLevel(profile, characterId, upgradeId, cat) {
  if (!hasCharacter(cat, characterId)) return 0;
  if (typeof upgradeId !== 'string' || !upgradeId.length) return 0;
  const e = characterEntry(profile, characterId);
  const lvl = plainObject(e) && plainObject(e.upgrades) ? e.upgrades[upgradeId] : undefined;
  const n = Number(lvl);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

/**
 * Set an upgrade to an exact level. Validates the character id, the upgrade id
 * and the level (finite, floored, clamped to [0, row.maxLevel] when the catalog
 * knows the row) BEFORE writing, so a rejected call leaves the profile
 * untouched. Returns true on success, false on any invalid input.
 */
export function setCharacterUpgradeLevel(profile, characterId, upgradeId, level, cat) {
  if (!plainObject(profile)) return false;
  if (!hasCharacter(cat, characterId)) return false;
  if (typeof upgradeId !== 'string' || !upgradeId.length) return false;
  const n = Number(level);
  if (!Number.isFinite(n)) return false;
  const def = characterUpgradeDef(cat, upgradeId);
  let lv = Math.max(0, Math.floor(n));
  if (def) lv = Math.min(lv, def.maxLevel);
  if (!plainObject(profile.characters)) profile.characters = {};
  const entry = plainObject(profile.characters[characterId]) ? profile.characters[characterId] : {};
  entry.upgrades = plainObject(entry.upgrades) ? entry.upgrades : {};
  entry.upgrades[upgradeId] = lv;
  profile.characters[characterId] = entry;
  return true;
}

/**
 * Add `amount` (default 1) to an upgrade's level — the "buy one level" call.
 * Same validation as setCharacterUpgradeLevel; the RESULT is clamped to the
 * row's maxLevel (or the finite non-negative range for an unknown row). A
 * negative amount lowers the level, floored at 0. Returns true on success,
 * false on invalid input (nothing written).
 */
export function addCharacterUpgrade(profile, characterId, upgradeId, amount, cat) {
  if (!plainObject(profile)) return false;
  if (!hasCharacter(cat, characterId)) return false;
  if (typeof upgradeId !== 'string' || !upgradeId.length) return false;
  const amt = amount === undefined ? 1 : Number(amount);
  if (!Number.isFinite(amt)) return false;
  const current = getCharacterUpgradeLevel(profile, characterId, upgradeId, cat);
  const def = characterUpgradeDef(cat, upgradeId);
  let next = Math.max(0, Math.floor(current + Math.floor(amt)));
  if (def) next = Math.min(next, def.maxLevel);
  return setCharacterUpgradeLevel(profile, characterId, upgradeId, next, cat);
}

/**
 * Reset a character's progress: the whole namespace entry is removed, so the
 * character starts from nothing again (including any future per-character
 * field). Unknown id -> false. Returns true when the character existed and the
 * namespace is now clear of it (a no-op reset on an already-clear character
 * still succeeds).
 */
export function resetCharacterProgress(profile, characterId, cat) {
  if (!plainObject(profile)) return false;
  if (!hasCharacter(cat, characterId)) return false;
  if (!plainObject(profile.characters)) profile.characters = {};
  delete profile.characters[characterId];
  return true;
}

// ---------- Corrupted / future saves ----------

/**
 * Copy an unreadable payload into the recovery slot so nothing is ever
 * silently discarded. Returns true when the copy succeeded. Never throws.
 */
export function preservePayload(storage, raw, reason, key = RECOVERY_KEY) {
  try {
    resolveStorage(storage).setItem(key, JSON.stringify({
      at: new Date().toISOString(), reason, raw,
    }));
    return true;
  } catch { return false; }
}

/** Read back the preserved payload: { at, reason, raw } | null. */
export function readRecovery(storage, key = RECOVERY_KEY) {
  let raw = null;
  try { raw = resolveStorage(storage).getItem(key); } catch { return null; }
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const o = JSON.parse(raw);
    return plainObject(o) ? o : { at: null, reason: 'unknown', raw };
  } catch {
    return { at: null, reason: 'unknown', raw };   // recovery slot itself mangled — still hand back the text
  }
}

function corruptNotice(preserved) {
  return 'SAVE UNREADABLE — HORDES started a fresh profile. ' + (preserved
    ? 'The damaged data was copied to a recovery slot so nothing is lost: open SETTINGS to download it.'
    : 'The damaged data could not be copied (storage blocked or full).');
}

function futureNotice(from, preserved) {
  return `SAVE IS FROM A NEWER VERSION OF HORDES (v${from} vs v${PROFILE_VERSION}) — it was not ` +
    'loaded, because loading it could destroy data this build does not understand. ' +
    (preserved ? 'A copy was preserved: open SETTINGS to download it.' : 'A copy could not be preserved.');
}

/**
 * Load the profile from storage.
 *
 * Returns a RESULT, never a bare profile:
 *   { profile, status, from, repairs, migrations, recoveryKey, notice }
 * status: 'fresh' | 'current' | 'migrated' | 'repaired' | 'corrupt' | 'future-version'
 *
 * Guarantees:
 *   - never throws (storage read/write failures degrade to a fresh profile);
 *   - a corrupt or future-version payload is PRESERVED under RECOVERY_KEY and
 *     the original key is left untouched, so recovery is always possible;
 *   - the returned profile is always a valid current-version object.
 */
export function loadProfileFrom(storage, cat, opts = {}) {
  const s = resolveStorage(storage);
  const key = opts.key || STORAGE_KEY;
  const recoveryKey = opts.recoveryKey || RECOVERY_KEY;
  const fresh = () => defaultProfile(cat);

  let raw = null;
  try { raw = s.getItem(key); } catch { raw = null; }
  if (raw === null || raw === undefined || raw === '') {
    return { profile: fresh(), status: 'fresh', from: null, repairs: [], migrations: [], recoveryKey: null, notice: null };
  }

  let parsed = null;
  let parseError = null;
  if (typeof raw !== 'string') {
    parseError = 'storage returned a non-string';
  } else {
    try { parsed = JSON.parse(raw); } catch (err) { parseError = String(err && err.message || err); }
  }
  if (parseError || !plainObject(parsed)) {
    const preserved = preservePayload(s, raw, 'corrupt', recoveryKey);
    return {
      profile: fresh(), status: 'corrupt', from: null, repairs: [], migrations: [],
      recoveryKey: preserved ? recoveryKey : null, error: parseError || 'payload is not an object',
      notice: corruptNotice(preserved),
    };
  }

  const mig = migrateProfile(parsed, cat);
  if (!mig.ok) {
    const preserved = preservePayload(s, raw, 'future-version', recoveryKey);
    return {
      profile: fresh(), status: 'future-version', from: mig.from, repairs: [], migrations: [],
      recoveryKey: preserved ? recoveryKey : null,
      notice: futureNotice(mig.from, preserved),
    };
  }

  const { profile, repairs } = validateProfile(mig.profile, cat);
  let status = mig.status;
  if (repairs.length) status = 'repaired';
  let notice = null;
  if (repairs.length) {
    notice = `SAVE REPAIRED — ${repairs.length} value${repairs.length === 1 ? '' : 's'} were out of range ` +
      'and were corrected so the game stays consistent.';
  } else if (mig.status === 'migrated') {
    notice = `SAVE UPGRADED to the current format (v${PROFILE_VERSION}).`;
  }
  return {
    profile, status, from: mig.from, repairs, migrations: mig.migrations,
    recoveryKey: null, notice,
  };
}

/** Persist a profile. Always stamps the current schema version. */
export function saveProfileTo(profile, storage) {
  const p = plainObject(profile) ? profile : {};
  try {
    resolveStorage(storage).setItem(STORAGE_KEY, JSON.stringify({ ...p, version: PROFILE_VERSION }));
    return true;
  } catch { return false; }
}

// ---------- Export ----------

function isoStamp(opts = {}) {
  if (typeof opts.at === 'string' && opts.at) return opts.at;
  try { return new Date().toISOString(); } catch { return '1970-01-01T00:00:00.000Z'; }
}

function defaultFilename(opts = {}) {
  return `hordes-save-${isoStamp(opts).slice(0, 10)}.json`;
}

/**
 * The export envelope. `profile` is the FULL payload, unknown fields included,
 * so an export is a complete snapshot of everything the game persists.
 * `exportedAt` is injectable for deterministic tests.
 */
export function buildExport(profile, opts = {}) {
  const p = plainObject(profile) ? profile : {};
  return {
    format: EXPORT_FORMAT,
    schemaVersion: PROFILE_VERSION,
    exportedAt: isoStamp(opts),
    profile: { ...p, version: PROFILE_VERSION },
  };
}

/** Export to a pretty-printed JSON string (the player's real safety net). */
export function exportProfileText(profile, opts = {}) {
  return JSON.stringify(buildExport(profile, opts), null, 2);
}

// ---------- Import ----------

/**
 * Parse + validate + migrate an imported save. PURE: returns a result and never
 * touches the live profile, so a bad file cannot corrupt the current game.
 *
 * Returns { ok:true, status:'imported'|'imported-migrated', from, profile, repairs }
 * or      { ok:false, status, from?, error }
 * Accepts an export envelope (buildExport) OR a raw profile payload, so a save
 * copied straight out of localStorage — or exported by an older build — imports.
 */
export function importProfileText(text, cat) {
  if (typeof text !== 'string' || !text.trim()) {
    return { ok: false, status: 'empty', error: 'the file is empty' };
  }
  let parsed = null;
  try { parsed = JSON.parse(text); } catch {
    return { ok: false, status: 'invalid-json', error: 'not a valid JSON file' };
  }
  if (!plainObject(parsed)) {
    return { ok: false, status: 'not-profile', error: 'not a HORDES save file' };
  }

  // Envelope detection: the format marker, or a profile object alongside a
  // declared schemaVersion (a raw legacy profile never has that field).
  const isEnvelope = parsed.format === EXPORT_FORMAT ||
    (plainObject(parsed.profile) && Object.prototype.hasOwnProperty.call(parsed, 'schemaVersion'));

  let body, declared;
  if (isEnvelope) {
    if (!plainObject(parsed.profile)) {
      return { ok: false, status: 'not-profile', error: 'the save envelope has no profile in it' };
    }
    body = parsed.profile;
    declared = Number.isInteger(parsed.schemaVersion) ? parsed.schemaVersion : readVersion(body);
    if (declared > PROFILE_VERSION) {
      return {
        ok: false, status: 'future-version', from: declared,
        error: `that save is from a newer version of HORDES (v${declared}, this build reads up to v${PROFILE_VERSION})`,
      };
    }
  } else {
    body = parsed;
    declared = readVersion(parsed);
    if (declared > PROFILE_VERSION) {
      return {
        ok: false, status: 'future-version', from: declared,
        error: `that save is from a newer version of HORDES (v${declared}, this build reads up to v${PROFILE_VERSION})`,
      };
    }
  }

  const mig = migrateProfile(body, cat);
  if (!mig.ok) {
    return { ok: false, status: 'future-version', from: mig.from, error: 'that save is from a newer version of HORDES' };
  }
  const { profile, repairs } = validateProfile(mig.profile, cat);
  return {
    ok: true,
    status: mig.status === 'current' ? 'imported' : 'imported-migrated',
    from: mig.from,
    profile,
    repairs,
  };
}

// ---------- Browser IO (guarded; no DOM access at import time) ----------

/** Core download: one code path for saves and recovered payloads. */
export function downloadText(text, filename, env = globalThis) {
  const doc = env && env.document;
  const BlobC = env && env.Blob;
  if (!doc || typeof doc.createElement !== 'function' || !BlobC) {
    return { ok: false, reason: 'no-dom' };
  }
  try {
    const blob = new BlobC([text], { type: 'application/json' });
    const URLObj = env.URL;
    let url = null;
    let revoke = null;
    if (URLObj && typeof URLObj.createObjectURL === 'function') {
      url = URLObj.createObjectURL(blob);
      revoke = () => { try { URLObj.revokeObjectURL(url); } catch { /* already gone */ } };
    } else {
      // data: URL fallback — works everywhere a Blob URL does not exist.
      url = 'data:application/json;charset=utf-8,' + encodeURIComponent(text);
    }
    const a = doc.createElement('a');
    a.href = url;
    a.download = filename;
    a.setAttribute('download', filename);
    if (a.style) a.style.display = 'none';
    if (doc.body && typeof doc.body.appendChild === 'function') doc.body.appendChild(a);
    if (typeof a.click === 'function') a.click();
    if (typeof a.remove === 'function') a.remove();
    // Revoke LATER, never synchronously: a few browsers abort an in-flight
    // download when the object URL is released in the same tick as the click.
    if (revoke) { try { setTimeout(revoke, 1000); } catch { revoke(); } }
    return { ok: true, filename, bytes: text.length };
  } catch (err) {
    return { ok: false, reason: String(err && err.message || err) };
  }
}

/** Export the profile as a .json download (anchor + Blob URL: every browser). */
export function downloadProfile(profile, env = globalThis, opts = {}) {
  const filename = opts.filename || defaultFilename(opts);
  const res = downloadText(exportProfileText(profile, opts), filename, env);
  return res.ok ? { ...res, via: 'download' } : res;
}

/**
 * Preferred path when the File System Access API exists (Chromium): a real
 * save dialog. Falls back to the universal download on any other browser, on
 * an unsupported call, or on a non-abort failure. A user cancel is reported as
 * such and does NOT trigger the fallback (that would pop a second dialog).
 */
export async function saveProfileToDisk(profile, env = globalThis, opts = {}) {
  const picker = env && typeof env.showSaveFilePicker === 'function' ? env.showSaveFilePicker : null;
  if (!picker) return downloadProfile(profile, env, opts);
  const filename = opts.filename || defaultFilename(opts);
  try {
    const handle = await picker.call(env, {
      suggestedName: filename,
      types: [{ description: 'HORDES save', accept: { 'application/json': ['.json'] } }],
    });
    const writable = await handle.createWritable();
    await writable.write(exportProfileText(profile, opts));
    await writable.close();
    return { ok: true, filename: handle.name || filename, via: 'picker' };
  } catch (err) {
    const name = err && err.name;
    if (name === 'AbortError' || name === 'NotAllowedError') {
      return { ok: false, reason: 'cancelled', aborted: true, via: 'picker' };
    }
    return downloadProfile(profile, env, opts);
  }
}

/** Read a File the player picked. Works with File.text() or a FileReader. */
export async function readSaveFile(file) {
  if (!file) return { ok: false, error: 'no file selected' };
  try {
    if (typeof file.text === 'function') return { ok: true, text: String(await file.text()) };
    const FR = globalThis.FileReader;
    if (typeof FR === 'function') {
      return await new Promise((resolve) => {
        const r = new FR();
        r.onload = () => resolve({ ok: true, text: String(r.result) });
        r.onerror = () => resolve({ ok: false, error: 'the file could not be read' });
        r.readAsText(file);
      });
    }
    return { ok: false, error: 'no file-reading API in this browser' };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
}

/** The raw text of a preserved unreadable payload (for a recovery download). */
export function recoveryExportText(storage, key = RECOVERY_KEY) {
  const rec = readRecovery(storage, key);
  if (!rec) return null;
  return typeof rec.raw === 'string' ? rec.raw : JSON.stringify(rec.raw);
}

/** Download the preserved payload so a player can keep it / send it on. */
export function downloadRecovery(storage, env = globalThis, opts = {}) {
  const text = recoveryExportText(storage, opts.key);
  if (text === null) return { ok: false, reason: 'nothing-preserved' };
  const filename = opts.filename || 'hordes-recovered-save.json';
  const res = downloadText(text, filename, env);
  return res.ok ? { ...res, via: 'download' } : res;
}
