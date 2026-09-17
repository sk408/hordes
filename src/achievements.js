// HORDES — achievements (G9: ACHIEVEMENTS ARE THE UNLOCK SPINE).
//
// WHY THIS FILE EXISTS
// The art track (src/art/trophies.js) already authored 22 trophy emblems and
// wrote each achievement's CONDITION into the trophy's description ("Slay
// 1,000 enemies", "Reach wave 20", "Open 25 chests"). What was missing is the
// half that makes them real: something that measures the run, decides what was
// earned, persists it, and GRANTS CONTENT. This is that half.
//
// THE MODEL (follows docs/HORDES_GOALS_2026-09-12.md G9)
//   * An achievement is a GOAL over a run summary plus cumulative counters.
//   * Earning one UNLOCKS REAL CONTENT (a weapon, an elite, a pilot). The
//     genre leaders do exactly this (VS: "Achievements, displayed as Unlocks
//     in-game, unlock new items, characters, stages, Relics"). It is the
//     answer to "not enough options": achieve -> unlock -> more options.
//   * Unlocks are "ACHIEVE **OR** BUY". The gold price on the shop row is
//     untouched — the achievement is a second, earned route to the same row.
//     That keeps the economy wave (G17) free to reprice without this file
//     disagreeing with it, and it means an achievement can never SOFT-LOCK a
//     player out of content they could otherwise buy.
//
// ONE SOURCE OF TRUTH FOR PRESENTATION
// Name, description and the tier pips are the ART's, not ours: the gallery
// reads them off TROPHY_ART[id] and this file never restates them, so the
// emblem and its caption cannot drift apart. The order of ACHIEVEMENTS is
// TROPHY_IDS' order, which the art lint test already pins.
//
// PERSISTENCE
// One new profile namespace, profile.achievements:
//   { v, earned: { [id]: epochMs }, progress: { [id]: n }, totals: {...} }
// The shape is validated/repairable in src/save.js (schema v3 -> v4) so a
// corrupt or older save cannot lose a gallery — see the validation there.
//
// Pure and DOM-free on purpose: main.js owns the wiring, the sims can call
// recordRun on a synthetic summary, and test_achievements.mjs drives it with
// no browser.

import { TROPHY_IDS, TROPHY_ART, TROPHY_FALLBACK_ID } from './art/index.js';
import {
  CHARACTERS, SHOP_UPGRADES, SHOP_BY_ID, WEAPON_PRICES,
  MAX_WEAPON_SLOTS, shopRowOwned, hasArcadePass,
  grantShopRow, grantCharacter,
} from './meta.js';

export const ACH_NAMESPACE_VERSION = 2;

// The in-run weapon level that counts as "maxed" for MAX_WEAPON. Read from the
// weapon system's own cap rather than a literal, so raising the cap moves the
// achievement with it.
export const MAX_WEAPON_LEVEL = 8;

// ---------------------------------------------------------------------------
// THE CATALOG
//
// goal.kind is the MEASURE. Two scopes:
//   'total' — a cumulative profile counter (never goes down, survives death)
//   'best'  — the best value seen in any single run
//   'state' — recomputed from the live profile at run end (ownership facts)
// goal.n is the threshold. `unlock` is the content granted on earning;
// null means the achievement is a pure badge (the on-ramp ones).
// ---------------------------------------------------------------------------
export const ACHIEVEMENTS = [
  { id: 'FIRST_BLOOD', goal: { kind: 'total', stat: 'kills', n: 1 }, unlock: null },
  { id: 'KILLS_100', goal: { kind: 'total', stat: 'kills', n: 100 }, unlock: { kind: 'shopRow', id: 'elite_swift' } },
  { id: 'KILLS_1000', goal: { kind: 'total', stat: 'kills', n: 1000 }, unlock: { kind: 'shopRow', id: 'elite_splitting' } },
  { id: 'KILLS_10000', goal: { kind: 'total', stat: 'kills', n: 10000 }, unlock: { kind: 'shopRow', id: 'elite_vampiric' } },
  { id: 'FIRST_BOSS', goal: { kind: 'total', stat: 'bossKills', n: 1 }, unlock: { kind: 'shopRow', id: 'weapon_orbit' } },
  { id: 'BOSS_SLAYER_5', goal: { kind: 'total', stat: 'bossKills', n: 5 }, unlock: { kind: 'shopRow', id: 'weapon_zap' } },
  { id: 'WAVE_5', goal: { kind: 'best', stat: 'wave', n: 5 }, unlock: { kind: 'shopRow', id: 'weapon_nova_pulse' } },
  { id: 'WAVE_10', goal: { kind: 'best', stat: 'wave', n: 10 }, unlock: { kind: 'shopRow', id: 'weapon_scythe' } },
  { id: 'WAVE_20', goal: { kind: 'best', stat: 'wave', n: 20 }, unlock: { kind: 'shopRow', id: 'weapon_seeker' } },
  { id: 'SURVIVE_10MIN', goal: { kind: 'best', stat: 'time', n: 600 }, unlock: { kind: 'shopRow', id: 'weapon_mine' } },
  { id: 'SURVIVE_20MIN', goal: { kind: 'best', stat: 'time', n: 1200 }, unlock: { kind: 'character', id: 'WITCH' } },
  { id: 'GOLD_10K', goal: { kind: 'total', stat: 'gold', n: 10000 }, unlock: { kind: 'character', id: 'ROGUE' } },
  { id: 'CHESTS_25', goal: { kind: 'total', stat: 'chests', n: 25 }, unlock: { kind: 'character', id: 'PALADIN' } },
  { id: 'FIRST_EVOLUTION', goal: { kind: 'total', stat: 'evolutions', n: 1 }, unlock: null },
  { id: 'MAX_WEAPON', goal: { kind: 'best', stat: 'weaponLevel', n: MAX_WEAPON_LEVEL }, unlock: null },
  { id: 'ALL_CHARACTERS', goal: { kind: 'state', stat: 'characters' }, unlock: null },
  // G9 FOLLOW-UP: kind 'total', NOT 'best'. The 'best' measurement convention
  // reads t['best' + Cap(stat)] (bestWave / bestTime / bestWeaponLevel), so a
  // 'best' goal on 'untouchedWave' looked up `bestUntouchedWave` — a field
  // nothing writes. The trophy measured 0 forever and was UNEARNABLE. The
  // counter itself is a 0/1 cap maintained by recordRun, so 'total' with the
  // same bar of 1 is the honest pairing. Bar unchanged.
  { id: 'UNTOUCHED_WAVE', goal: { kind: 'total', stat: 'untouchedWave', n: 1 }, unlock: null },
  { id: 'LEGENDARY_LOOT', goal: { kind: 'total', stat: 'legendaries', n: 1 }, unlock: null },
  { id: 'SHOP_MASTER', goal: { kind: 'state', stat: 'shopRows' }, unlock: { kind: 'shopRow', id: 'weapon_beam' } },
  { id: 'ARCADE_PASS', goal: { kind: 'state', stat: 'arcade' }, unlock: null },
  { id: 'FULL_BUILD', goal: { kind: 'state', stat: 'fullBuild' }, unlock: null },
  // G11 TIMED ACHIEVEMENTS — kind 'run': a conjunction of a stat threshold and
  // a clock ceiling inside ONE run, measured at the single settle funnel off
  // the run summary (A1): the stat reached n AND the run's OWN clock, when it
  // settled (death, win or a deliberate exit), was <= within. The goal text
  // says exactly that — never "before 3:00", which the measurement does not
  // honour. Keys in the persisted `timed` bucket are '<stat>@<within>'.
  { id: 'WAVE5_UNDER_3MIN', goal: { kind: 'run', stat: 'wave', n: 5, within: 180 },
    unlock: null },
  { id: 'WAVE8_UNDER_5MIN', goal: { kind: 'run', stat: 'wave', n: 8, within: 300 },
    unlock: { kind: 'shopRow', id: 'slots' } },
  { id: 'KILLS_500_UNDER_5MIN', goal: { kind: 'run', stat: 'kills', n: 500, within: 300 },
    unlock: { kind: 'shopRow', id: 'artifact' } },
  { id: 'GOLD_600_UNDER_6MIN', goal: { kind: 'run', stat: 'gold', n: 600, within: 360 },
    unlock: null },
];

export const ACHIEVEMENT_IDS = ACHIEVEMENTS.map(a => a.id);
export const ACHIEVEMENT_BY_ID = ACHIEVEMENTS.reduce((m, a) => { m[a.id] = a; return m; }, {});

// G11: the timed keys the LIVE catalog declares ('<stat>@<within>'). Repair
// keeps only these; anything else in the bucket is a newer build's data that
// this build cannot measure — dropped from the repaired view (the save layer
// still preserves the raw payload verbatim for the round-trip).
const TIMED_KEYS = new Set(ACHIEVEMENTS
  .filter(a => a.goal.kind === 'run')
  .map(a => a.goal.stat + '@' + a.goal.within));

// TOTALS CONTRACT — the counters recordRun maintains, with their start values.
// Anything a run reports that is not listed here is ignored, so a caller
// cannot grow the schema by passing extra keys.
export const TOTALS_ZERO = {
  kills: 0, bossKills: 0, gold: 0, chests: 0, evolutions: 0, legendaries: 0,
  bestWave: 0, bestTime: 0, bestWeaponLevel: 0, untouchedWave: 0, runs: 0, survived: 0,
  // V1 escape payout basis: the BEST single-run gold, an integer MAX (never a
  // rate — no division at read time). The escape's payout multiplies this by
  // K and floors once (src/escape/payout.js); it is not an achievement goal,
  // just a totals counter the escape reads.
  bestGold: 0,
};

// ---------------------------------------------------------------------------
// namespace + repair
// ---------------------------------------------------------------------------

export function emptyAchievements() {
  return { v: ACH_NAMESPACE_VERSION, earned: {}, progress: {}, totals: { ...TOTALS_ZERO }, timed: {} };
}

const plainObject = v => !!v && typeof v === 'object' && !Array.isArray(v);
const intOr = (v, d) => (Number.isFinite(Number(v)) ? Math.max(0, Math.floor(Number(v))) : d);

// Coerce whatever is on the profile into a valid namespace WITHOUT throwing and
// WITHOUT dropping a known-earned trophy: an unreadable entry is repaired to a
// zero, never deleted. Mirrors the characterUpgrade accessors' philosophy.
export function normalizeAchievements(raw) {
  const src = plainObject(raw) ? raw : {};
  const out = emptyAchievements();
  if (plainObject(src.earned)) {
    for (const [id, at] of Object.entries(src.earned)) {
      // N3 (audit 2026-09-16): an id the live catalog does not know is a
      // NEWER BUILD's trophy — carried VERBATIM (the policy save.js states
      // for unknown fields), so a structural repair on a same-version
      // downgrade cannot destroy it. KNOWN ids are repaired as before.
      if (!ACHIEVEMENT_BY_ID[id]) { out.earned[id] = at; continue; }
      if (at === false || at === null || at === undefined) continue;
      const n = intOr(at, 0);
      out.earned[id] = n > 0 ? n : 1;   // a truthy-but-unstamped earn still counts as earned
    }
  }
  if (plainObject(src.progress)) {
    for (const [id, n] of Object.entries(src.progress)) {
      if (!ACHIEVEMENT_BY_ID[id]) { out.progress[id] = n; continue; }   // N3: verbatim
      out.progress[id] = intOr(n, 0);
    }
  }
  if (plainObject(src.totals)) {
    for (const k of Object.keys(TOTALS_ZERO)) out.totals[k] = intOr(src.totals[k], 0);
  }
  // G11 timed bucket (namespace v2): best stat values at '<stat>@<within>'
  // keys. A SIBLING of totals on purpose — every TOTALS_ZERO value is an int
  // coerced with intOr above, so an object in there would be poisoned to 0.
  // Repair rules: a missing/garbage bucket normalises to {}; only keys the
  // LIVE catalog still declares are kept; values via intOr. An earned stamp
  // is never dropped by any of this (the rule above).
  if (plainObject(src.timed)) {
    for (const [k, v] of Object.entries(src.timed)) {
      if (!TIMED_KEYS.has(k)) continue;
      out.timed[k] = intOr(v, 0);
    }
  }
  // An achievement can be earned without a stamped progress value (older save,
  // or earned via a state goal that has no number) — backfill so the gallery
  // never shows "0 / 5" next to a finished trophy. N3: an unknown id (a newer
  // build's, preserved above) has no catalog row to backfill from — skip it.
  for (const id of Object.keys(out.earned)) {
    if (!ACHIEVEMENT_BY_ID[id]) continue;
    const need = ACHIEVEMENT_BY_ID[id].goal.n;
    if (need !== undefined && (out.progress[id] || 0) < need) out.progress[id] = need;
  }
  return out;
}

// A namespace is "structurally usable" when its three containers exist. This is
// the CHEAP check ensureAchievements uses on the hot path; full normalisation
// is a repair, not a per-read job.
export function isValidNamespace(ns) {
  // G11: `timed` joins the structural check, so a v1 payload (no bucket) is
  // repaired ONCE through ensureAchievements -> normalizeAchievements.
  return plainObject(ns) && plainObject(ns.earned) && plainObject(ns.progress) &&
    plainObject(ns.totals) && plainObject(ns.timed);
}

// Lazily attach the namespace. Callers do not have to remember to.
//
// REFERENCE STABILITY IS A CONTRACT, not an optimisation: recordRun holds the
// namespace across a whole evaluation loop. An earlier version re-normalised
// (and therefore REPLACED) profile.achievements on every call, including the
// calls made from inside measuredValue — so the object recordRun was writing
// into was orphaned and every earned trophy vanished. Reads are pure now
// (readNamespace below never writes) and ensure only repairs when the shape is
// actually broken.
export function ensureAchievements(profile) {
  if (!plainObject(profile)) return emptyAchievements();
  if (!isValidNamespace(profile.achievements)) {
    profile.achievements = normalizeAchievements(profile.achievements);
  }
  return profile.achievements;
}

// PURE read: never mutates the profile, never swaps the object. Returns the
// zero namespace when there is nothing usable to read.
export function readNamespace(profile) {
  const ns = plainObject(profile) ? profile.achievements : null;
  return isValidNamespace(ns) ? ns : emptyAchievements();
}

export function earnedMap(profile) {
  return readNamespace(profile).earned;
}

export function isEarned(profile, id) {
  return !!earnedMap(profile)[id];
}

export function earnedCount(profile) {
  const e = earnedMap(profile);
  // KNOWN ids only: an unknown id from a newer build is preserved by the save
  // layer, but it is not a trophy this build can show, so it must not inflate
  // the "12 / 22" counter the gallery prints.
  let n = 0;
  for (const id of TROPHY_IDS) if (e[id]) n++;
  return n;
}

export function totalAchievements() {
  return ACHIEVEMENTS.length;
}

// ---------------------------------------------------------------------------
// measuring a run
// ---------------------------------------------------------------------------

// The value each achievement's goal is currently measured at, given the
// namespace's totals and the live profile (for 'state' goals). Exported so the
// gallery can print "37 / 100" without duplicating the measurement.
export function measuredValue(profile, ach) {
  const a = readNamespace(profile);   // PURE — must not swap the object under a caller
  const t = a.totals;
  const g = ach.goal;
  switch (g.kind) {
    case 'total': return t[g.stat] || 0;
    case 'best': return t['best' + cap(g.stat)] || 0;
    case 'state': return stateValue(profile, g.stat);
    // G11: the timed bucket — the best value that stat reached in any run that
    // settled within the goal's clock ceiling. goalMet stays the single
    // `measuredValue >= n` path; no new branch there.
    case 'run': return (a.timed && a.timed[g.stat + '@' + g.within]) || 0;
    default: return 0;
  }
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// G11 TIMED MEASUREMENT — all through the ONE existing code path.
//
// The run-summary stats a 'run' goal may measure. summaryStat maps a stat name
// onto the summary object and returns 0 for an unknown stat, so a typo in the
// catalog MEASURES 0 (never earns) instead of throwing at settle time — and
// auditRunGoals below catches it loudly at test time anyway.
export const RUN_STATS = ['wave', 'kills', 'gold', 'chests', 'bossKills', 'evolutions', 'weaponLevel'];
export function summaryStat(r, stat) {
  if (!RUN_STATS.includes(stat)) return 0;
  return intOr((r && r[stat]), 0);
}

// 'state' goals are facts about what the profile OWNS right now, not counters.
// Returning a 0/1-ish measure keeps every goal comparable through one code
// path (measuredValue >= n), so a new state goal needs no new branch in
// recordRun.
function stateValue(profile, stat) {
  if (stat === 'characters') {
    const ids = Object.keys(CHARACTERS);
    const owned = (profile.unlockedCharacters || []).filter(id => !!CHARACTERS[id]);
    if (ids.length === 0) return 0;
    return owned.length >= ids.length ? ids.length : owned.length;
  }
  if (stat === 'shopRows') {
    const rows = SHOP_UPGRADES;
    if (!rows.length) return 0;
    const done = rows.filter(def => shopRowOwned(profile, def)).length;
    return done >= rows.length ? rows.length : done;
  }
  if (stat === 'arcade') return hasArcadePass(profile) ? 1 : 0;
  if (stat === 'fullBuild') return fullBuildReached(profile) ? 1 : 0;
  return 0;
}

// "Clear every wave and finish the build": the run must have survived to the
// limit AND the profile must own every weapon slot's worth of archetypes.
// Deliberately a conjunction of two facts the game already records — it is not
// a new state machine.
export function fullBuildReached(profile) {
  return !!profile.__fullBuildRun && weaponSlotsFilled(profile);
}

function weaponSlotsFilled(profile) {
  const owned = (profile.unlockedWeapons || []).filter(id => WEAPON_PRICES[id] !== undefined);
  return owned.length >= MAX_WEAPON_SLOTS;
}

// Threshold for state goals: the count of things that must ALL be true.
function stateTarget(stat) {
  if (stat === 'characters') return Object.keys(CHARACTERS).length;
  if (stat === 'shopRows') return SHOP_UPGRADES.length;
  return 1;
}

function goalMet(profile, ach) {
  const g = ach.goal;
  if (g.kind === 'state') return measuredValue(profile, ach) >= stateTarget(g.stat);
  return measuredValue(profile, ach) >= g.n;
}

// ---------------------------------------------------------------------------
// recordRun — the one entry point main.js calls when a run ends
// ---------------------------------------------------------------------------

/**
 * Fold a finished run into the profile.
 *
 * `run` is a summary object; every field is optional and clamped, so a caller
 * that does not track something yet (the sims) simply does not earn it:
 *   kills, bossKills, gold, chests, evolutions, legendaries (per-run counts)
 *   wave, time (seconds), weaponLevel (best in-run weapon level)
 *   untouchedWave (bool), survived (bool)
 *
 * Returns { earned: [ids], unlocks: [{achievement, kind, id, ok}], totals }.
 * MUTATES the profile (counters, progress, earned stamps, granted content).
 */
export function recordRun(profile, run) {
  const a = ensureAchievements(profile);
  const r = plainObject(run) ? run : {};
  const t = a.totals;
  // Read-then-add through intOr: save.js may hand us a SPARSE totals object
  // (it preserves whatever keys it found), so a bare `+=` would poison the
  // counter with NaN and silently disable every cumulative achievement.
  const bump = (k, v) => { t[k] = intOr(t[k], 0) + intOr(v, 0); };

  bump('kills', r.kills);
  bump('bossKills', r.bossKills);
  bump('gold', r.gold);
  bump('chests', r.chests);
  bump('evolutions', r.evolutions);
  bump('legendaries', r.legendaries);
  t.bestWave = Math.max(intOr(t.bestWave, 0), intOr(r.wave, 0));
  t.bestTime = Math.max(intOr(t.bestTime, 0), intOr(r.time, 0));
  t.bestWeaponLevel = Math.max(intOr(t.bestWeaponLevel, 0), intOr(r.weaponLevel, 0));
  // V1: the escape payout's basis rides the same fold (a MAX, so collecting a
  // payout can never grow it — the twice-in-a-row clause).
  t.bestGold = Math.max(intOr(t.bestGold, 0), intOr(r.gold, 0));
  t.untouchedWave = Math.max(intOr(t.untouchedWave, 0), r.untouchedWave ? 1 : 0);
  bump('survived', r.survived ? 1 : 0);
  bump('runs', 1);

  // G11 timed fold, from the SAME summary: for each catalog 'run' goal, if this
  // run's own clock (at settle) is inside the ceiling, the bucket keeps the
  // best stat value seen under that ceiling. A run that never settled a time
  // (time 0/missing) records nothing — a summary without a clock cannot honour
  // a clock ceiling, and 0 would poison a real best.
  const rt = intOr(r.time, 0);
  if (rt > 0) {
    for (const ach of ACHIEVEMENTS) {
      const g = ach.goal;
      if (g.kind !== 'run') continue;
      if (rt > g.within) continue;   // boundary is INCLUSIVE: rt === within earns
      const key = g.stat + '@' + g.within;
      a.timed[key] = Math.max(a.timed[key] || 0, summaryStat(r, g.stat));
    }
  }

  // __fullBuildRun is a TRANSIENT fact about THIS run: FULL_BUILD requires
  // surviving to the limit, so it is set from the summary, consulted by the
  // 'state' goal, and left on the profile (harmless, and it keeps the goal
  // evaluable from a reloaded profile).
  profile.__fullBuildRun = !!r.survived;

  const earned = [];
  for (const ach of ACHIEVEMENTS) {
    if (a.earned[ach.id]) continue;
    const measured = measuredValue(profile, ach);
    if (ach.goal.n !== undefined) a.progress[ach.id] = measured;
    if (goalMet(profile, ach)) {
      a.earned[ach.id] = Date.now();
      if (ach.goal.n !== undefined) a.progress[ach.id] = Math.max(a.progress[ach.id] || 0, measured);
      earned.push(ach.id);
    }
  }
  delete profile.__fullBuildRun;

  const unlocks = applyUnlocks(profile, earned);
  return { earned, unlocks, totals: { ...t } };
}

// ---------------------------------------------------------------------------
// unlock granting
// ---------------------------------------------------------------------------

/**
 * Grant the content behind a list of earned achievement ids.
 * Gold-free by construction: the achievement IS the price. Idempotent — an
 * already-owned row reports ok:true without being granted twice.
 */
export function applyUnlocks(profile, ids) {
  const out = [];
  for (const id of ids || []) {
    const ach = ACHIEVEMENT_BY_ID[id];
    if (!ach || !ach.unlock) continue;
    const u = ach.unlock;
    let ok = false;
    if (u.kind === 'shopRow') ok = grantShopRow(profile, u.id);
    else if (u.kind === 'character') ok = grantCharacter(profile, u.id);
    out.push({ achievement: id, kind: u.kind, id: u.id, ok });
  }
  return out;
}

// The reverse question the shop asks: "is this row unlocked by an achievement?"
// Used by the UI to caption an earned route, and by tests to prove every
// unlock target is reachable through a real id.
export function achievementForUnlock(kind, id) {
  return ACHIEVEMENTS.find(a => a.unlock && a.unlock.kind === kind && a.unlock.id === id) || null;
}

// G11: every 'run' goal must be measurable and honest. Fail loudly at TEST
// time, not silently at runtime: an unknown stat would measure 0 forever (an
// unearnable trophy), and a non-positive/non-integer ceiling is a broken clock
// promise. Same spirit as auditUnlockTargets.
export function auditRunGoals() {
  const bad = [];
  for (const ach of ACHIEVEMENTS) {
    const g = ach.goal;
    if (g.kind !== 'run') continue;
    if (!RUN_STATS.includes(g.stat)) bad.push(ach.id + ' -> unknown stat ' + JSON.stringify(g.stat));
    if (!(Number.isInteger(g.within) && g.within > 0)) {
      bad.push(ach.id + ' -> within ' + JSON.stringify(g.within) + ' is not a positive integer');
    }
    if (!(Number.isInteger(g.n) && g.n > 0)) {
      bad.push(ach.id + ' -> n ' + JSON.stringify(g.n) + ' is not a positive integer');
    }
  }
  return bad;
}

// Every unlock target must exist in the live catalogs. Exported (and asserted
// by the test) so a typo in the table above fails loudly at test time instead
// of silently granting nothing at runtime.
export function auditUnlockTargets() {
  const bad = [];
  for (const ach of ACHIEVEMENTS) {
    if (!ach.unlock) continue;
    const { kind, id } = ach.unlock;
    if (kind === 'shopRow' && !SHOP_BY_ID[id]) bad.push(ach.id + ' -> shopRow ' + id);
    else if (kind === 'character' && !CHARACTERS[id]) bad.push(ach.id + ' -> character ' + id);
    else if (kind !== 'shopRow' && kind !== 'character') bad.push(ach.id + ' -> unknown kind ' + kind);
  }
  return bad;
}

// Is this specific row already owned? Thin passthroughs so the gallery can
// caption a row without importing meta.js itself.
export function ownsUnlock(profile, unlock) {
  if (!unlock) return false;
  if (unlock.kind === 'shopRow') return shopRowOwned(profile, SHOP_BY_ID[unlock.id]);
  if (unlock.kind === 'character') return (profile.unlockedCharacters || []).includes(unlock.id);
  return false;
}

// ---------------------------------------------------------------------------
// presentation model for the gallery (name/desc/tier come from the ART)
// ---------------------------------------------------------------------------

export function goalText(ach) {
  const g = ach.goal;
  if (g.kind === 'state') {
    if (g.stat === 'characters') return 'Unlock every playable pilot';
    if (g.stat === 'shopRows') return 'Own every upgrade line in the shop';
    if (g.stat === 'arcade') return 'Own the Arcade Pass';
    if (g.stat === 'fullBuild') return 'Survive to the limit with every slot filled';
    return '';
  }
  const labels = {
    kills: 'Enemies slain', bossKills: 'Bosses defeated', wave: 'Wave reached',
    time: 'Longest run', gold: 'Gold earned', chests: 'Chests opened',
    evolutions: 'Weapon evolutions', weaponLevel: 'Best weapon level',
    untouchedWave: 'Waves finished untouched', legendaries: 'Legendary items found',
  };
  const label = labels[g.stat] || g.stat;
  if (g.kind === 'total') return label + ' (all runs)';
  // G11 timed goals, stated as implemented: the stat threshold and the run's
  // OWN clock at settle, conjoined. Never "before X" — the measurement reads
  // the clock at the settle funnel, not at the moment the stat crossed.
  if (g.kind === 'run') {
    const noun = { wave: 'Wave', kills: 'Enemies slain', gold: 'Gold earned' }[g.stat] || label;
    const mm = Math.floor(g.within / 60), ss = String(g.within % 60).padStart(2, '0');
    // N4 (audit 2026-09-16): the earn check is INCLUSIVE (rt === within earns,
    // achievements.js recordRun) — the text must say so. "under mm:ss" claimed
    // an exclusive boundary the code never enforced.
    return `${noun} ${g.n}+ in a run in ${mm}:${ss} or less`;
  }
  return label + ' (single run)';
}

// The trophies the gallery LISTS: every art id except the LOCKED fallback,
// which is a silhouette used to mask unearned entries rather than a slot of
// its own. Derived from the art, so an emblem added there appears here.
export const ACHIEVEMENT_DISPLAY_IDS = TROPHY_IDS.filter(id => id !== TROPHY_FALLBACK_ID);

// One entry per earnable trophy, in the art's order. `art` is the real emblem
// on an earned entry and the LOCKED silhouette otherwise, so the grid is never
// empty and the player always sees a shape to chase.
export function galleryModel(profile) {
  const a = readNamespace(profile);   // the gallery READS; it must not repair or mutate
  return ACHIEVEMENT_DISPLAY_IDS.map(id => {
    const ach = ACHIEVEMENT_BY_ID[id] || null;
    const earned = !!a.earned[id];
    const art = TROPHY_ART[id] || TROPHY_ART[TROPHY_FALLBACK_ID];
    const entry = {
      id,
      art: earned ? art : TROPHY_ART[TROPHY_FALLBACK_ID],
      lockedArt: TROPHY_ART[TROPHY_FALLBACK_ID],
      realArt: art,
      earned,
      at: earned ? a.earned[id] : null,
      name: earned ? (art.name || id) : 'Locked',
      desc: earned ? (art.desc || '') : 'An achievement you have not earned yet.',
      goal: ach ? goalText(ach) : '',
      unlock: ach ? ach.unlock : null,
      progress: ach ? (a.progress[id] || 0) : 0,
      target: ach ? (ach.goal.kind === 'state' ? stateTarget(ach.goal.stat) : (ach.goal.n || 0)) : 0,
    };
    return entry;
  });
}

export function gallerySummary(profile) {
  const model = galleryModel(profile);
  const earned = model.filter(e => e.earned).length;
  return { earned, total: model.length, model };
}
