// HORDES — SAVE FOUNDATION (W1): versioned profile schema, migration,
// validation for every persisted collection, deliberate corrupted-save
// behaviour, and lossless export/import.
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
export const PROFILE_VERSION = 2;
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
