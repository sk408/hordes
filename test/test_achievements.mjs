// HORDES — G9 achievements: catalog integrity, measurement, unlocks, gallery,
// and the save-schema round-trip.
//
// The point of this file is the CONTRACT, not the feature: an achievement is a
// promise ("slay 100 enemies" -> you own the SPLITTING elites) and every part of
// that promise is asserted here, including the parts a future wave could break
// silently — the id list drifting from the art, an unlock pointing at a row
// that does not exist, a replayed run double-granting, a hand-edited save
// losing a trophy, or a sparse totals object poisoning counters with NaN.
import { suite } from './_harness.mjs';
import {
  ACHIEVEMENTS, ACHIEVEMENT_IDS, ACHIEVEMENT_BY_ID, MAX_WEAPON_LEVEL,
  recordRun, ensureAchievements, normalizeAchievements, emptyAchievements,
  isEarned, earnedCount, totalAchievements, galleryModel, gallerySummary,
  measuredValue, applyUnlocks, auditUnlockTargets, achievementForUnlock,
  ownsUnlock, goalText, TOTALS_ZERO,
} from '../src/achievements.js';
import { TROPHY_IDS, TROPHY_ART, TROPHY_FALLBACK_ID } from '../src/art/index.js';
import {
  makeProfile, CHARACTERS, SHOP_UPGRADES, SHOP_BY_ID,
  validateProfile,                     // catalog-bound (calls save.js with the live catalogs)
} from '../src/meta.js';
import { migrateProfile, PROFILE_VERSION } from '../src/save.js';

const s = suite('test_achievements');

// ---------------------------------------------------------------------------
// 1. The catalog and the art must describe the SAME set of trophies.
//    This is the anti-drift invariant: the art track authored the ids, names
//    and descriptions; the logic owns the goals. If either side grows an
//    entry alone, this fails instead of shipping a trophy with no goal (or a
//    goal with no emblem).
// ---------------------------------------------------------------------------
s.check('every trophy id has an achievement and vice versa (same order)', () => {
  // TROPHY_IDS carries the LOCKED fallback silhouette as its last entry — it is
  // presentation, not an earnable achievement, so it is excluded here and
  // asserted separately below.
  const earnable = TROPHY_IDS.filter(id => id !== TROPHY_FALLBACK_ID);
  if (ACHIEVEMENT_IDS.join(',') !== earnable.join(',')) {
    throw new Error('id lists differ:\n  ach:  ' + ACHIEVEMENT_IDS.join(',') +
      '\n  art:  ' + earnable.join(','));
  }
  if (ACHIEVEMENT_IDS.includes(TROPHY_FALLBACK_ID)) {
    throw new Error('the LOCKED fallback must not be an earnable achievement');
  }
});

s.check('every achievement carries a goal, and every art entry a name + desc', () => {
  for (const a of ACHIEVEMENTS) {
    if (!a.goal || !a.goal.kind) throw new Error(a.id + ': no goal');
    if (a.id !== TROPHY_FALLBACK_ID) {
      const art = TROPHY_ART[a.id];
      if (!art) throw new Error(a.id + ': no art');
      if (!art.name || !art.desc) throw new Error(a.id + ': art has no name/desc');
    }
  }
});

s.check('LOCKED is the art fallback only — not an earnable achievement', () => {
  if (!TROPHY_ART[TROPHY_FALLBACK_ID]) throw new Error('the fallback silhouette is missing from the art');
  if (ACHIEVEMENT_BY_ID[TROPHY_FALLBACK_ID]) throw new Error('LOCKED must not be in the achievement catalog');
  // And no goal may target it indirectly.
  for (const a of ACHIEVEMENTS) {
    if (a.unlock && a.unlock.id === TROPHY_FALLBACK_ID) throw new Error(a.id + ' unlocks the fallback');
  }
});

s.check('every unlock target exists in the live catalogs', () => {
  const bad = auditUnlockTargets();
  if (bad.length) throw new Error('bad unlock targets: ' + bad.join(', '));
});

s.check('each unlockable row is claimed by exactly one achievement', () => {
  const seen = new Map();
  for (const a of ACHIEVEMENTS) {
    if (!a.unlock) continue;
    const key = a.unlock.kind + ':' + a.unlock.id;
    if (seen.has(key)) throw new Error(key + ' is claimed by both ' + seen.get(key) + ' and ' + a.id);
    seen.set(key, a.id);
  }
  if (seen.size < 8) throw new Error('too few unlock routes (' + seen.size + ') to call this a spine');
});

s.check('goalText covers every goal kind without leaking a raw stat name', () => {
  for (const a of ACHIEVEMENTS) {
    const t = goalText(a);
    if (typeof t !== 'string' || t.length === 0) throw new Error(a.id + ': empty goal text');
    if (/_/.test(t)) throw new Error(a.id + ': goal text leaks a raw stat id: ' + t);
  }
});

// ---------------------------------------------------------------------------
// 2. Measurement: cumulative vs per-run-best are DIFFERENT promises, and the
//    difference is the thing players notice ("I killed 100, why no trophy?").
// ---------------------------------------------------------------------------
s.check('cumulative counters add across runs; best values take the max', () => {
  const p = makeProfile();
  recordRun(p, { kills: 40, wave: 3, time: 200, gold: 10 });
  recordRun(p, { kills: 60, wave: 2, time: 900, gold: 5 });
  const t = ensureAchievements(p).totals;
  if (t.kills !== 100) throw new Error('kills should sum to 100, got ' + t.kills);
  if (t.bestWave !== 3) throw new Error('bestWave should be 3, got ' + t.bestWave);
  if (t.bestTime !== 900) throw new Error('bestTime should be 900, got ' + t.bestTime);
  if (t.gold !== 15) throw new Error('gold should sum to 15, got ' + t.gold);
  if (t.runs !== 2) throw new Error('runs should be 2, got ' + t.runs);
});

s.check('a cumulative goal can be earned across two runs', () => {
  const p = makeProfile();
  recordRun(p, { kills: 40 });
  if (isEarned(p, 'KILLS_100')) throw new Error('earned at 40 kills');
  recordRun(p, { kills: 60 });
  if (!isEarned(p, 'KILLS_100')) throw new Error('not earned at 100 cumulative kills');
  if (!isEarned(p, 'FIRST_BLOOD')) throw new Error('FIRST_BLOOD not earned');
});

s.check('a single-run goal is NOT earned by two mediocre runs', () => {
  const p = makeProfile();
  recordRun(p, { time: 500 });
  recordRun(p, { time: 500 });
  if (isEarned(p, 'SURVIVE_10MIN')) throw new Error('two 500s must not earn a 600s single-run goal');
  recordRun(p, { time: 601 });
  if (!isEarned(p, 'SURVIVE_10MIN')) throw new Error('601s in one run should earn it');
});

s.check('MAX_WEAPON uses the weapon cap, not a literal', () => {
  const p = makeProfile();
  recordRun(p, { weaponLevel: MAX_WEAPON_LEVEL - 1 });
  if (isEarned(p, 'MAX_WEAPON')) throw new Error('earned one level early');
  recordRun(p, { weaponLevel: MAX_WEAPON_LEVEL });
  if (!isEarned(p, 'MAX_WEAPON')) throw new Error('not earned at the cap');
});

s.check('an earned achievement is reported once, never on replay', () => {
  const p = makeProfile();
  const first = recordRun(p, { kills: 1 });
  if (!first.earned.includes('FIRST_BLOOD')) throw new Error('first run did not earn FIRST_BLOOD');
  const second = recordRun(p, { kills: 1 });
  if (second.earned.includes('FIRST_BLOOD')) throw new Error('FIRST_BLOOD reported twice');
});

s.check('a sparse totals object cannot poison counters with NaN', () => {
  const p = makeProfile();
  // Simulate what the save layer hands back for a hand-edited payload.
  p.achievements = { v: 1, earned: {}, progress: {}, totals: {} };
  recordRun(p, { kills: 10 });
  const t = ensureAchievements(p).totals;
  if (Number.isNaN(t.kills)) throw new Error('kills poisoned with NaN');
  if (t.kills !== 10) throw new Error('kills should be 10, got ' + t.kills);
  for (const k of Object.keys(TOTALS_ZERO)) {
    if (!Number.isFinite(t[k])) throw new Error('totals.' + k + ' is not finite: ' + t[k]);
  }
});

s.check('the namespace object is never swapped under a caller (regression)', () => {
  const p = makeProfile();
  ensureAchievements(p);
  const ns = p.achievements;                      // hold the reference, as recordRun does
  recordRun(p, { kills: 1 });
  if (p.achievements !== ns) throw new Error('the namespace object was replaced during recordRun');
  if (!ns.earned.FIRST_BLOOD) throw new Error('the earned stamp went into an orphaned object');
  // Reads must be pure: no repair, no replacement, no mutation.
  const before = JSON.stringify(p.achievements);
  isEarned(p, 'FIRST_BLOOD');
  measuredValue(p, ACHIEVEMENT_BY_ID.KILLS_100);
  galleryModel(p);
  gallerySummary(p);
  earnedCount(p);
  if (JSON.stringify(p.achievements) !== before) throw new Error('a read mutated the namespace');
});

// ---------------------------------------------------------------------------
// 3. Unlocks: the achievement IS the price.
// ---------------------------------------------------------------------------
s.check('earning an achievement grants its row WITHOUT charging gold', () => {
  const p = makeProfile();
  p.gold = 0;                                   // broke on purpose
  const res = recordRun(p, { kills: 100 });
  const u = res.unlocks.find(x => x.achievement === 'KILLS_100');
  if (!u) throw new Error('no unlock reported for KILLS_100');
  if (!u.ok) throw new Error('unlock reported failure');
  if (p.gold !== 0) throw new Error('gold was charged: ' + p.gold);
  if (!(p.unlockedElites || []).includes('SWIFT')) throw new Error('SWIFT not granted');
});

s.check('the grant is idempotent and does not duplicate ownership', () => {
  const p = makeProfile();
  recordRun(p, { kills: 100 });
  const before = p.unlockedElites.length;
  const again = applyUnlocks(p, ['KILLS_100']);
  if (!again[0].ok) throw new Error('re-grant reported failure');
  if (p.unlockedElites.length !== before) throw new Error('ownership list grew on re-grant');
});

s.check('ownsUnlock agrees with what the grant actually did', () => {
  const p = makeProfile();
  const ach = ACHIEVEMENT_BY_ID.KILLS_100;
  if (ownsUnlock(p, ach.unlock)) throw new Error('reports owned before earning');
  recordRun(p, { kills: 100 });
  if (!ownsUnlock(p, ach.unlock)) throw new Error('reports unowned after earning');
});

s.check('a weapon unlock lands in unlockedWeapons, keyed by the row id', () => {
  const p = makeProfile();
  recordRun(p, { wave: 5 });
  if (!p.unlockedWeapons.includes('NOVA_PULSE')) {
    throw new Error('WAVE_5 did not grant NOVA_PULSE: ' + p.unlockedWeapons.join(','));
  }
});

s.check('a character unlock lands in unlockedCharacters', () => {
  const p = makeProfile();
  recordRun(p, { time: 1201 });
  if (!p.unlockedCharacters.includes('WITCH')) throw new Error('SURVIVE_20MIN did not grant WITCH');
});

s.check('achievementForUnlock resolves the reverse lookup', () => {
  const a = achievementForUnlock('shopRow', 'elite_swift');
  if (!a || a.id !== 'KILLS_100') throw new Error('reverse lookup failed');
  if (achievementForUnlock('shopRow', 'not_a_row')) throw new Error('unknown row resolved');
});

// ---------------------------------------------------------------------------
// 4. State goals read the LIVE profile.
// ---------------------------------------------------------------------------
s.check('ARCADE_PASS follows the real pass flag', () => {
  const p = makeProfile();
  recordRun(p, {});
  if (isEarned(p, 'ARCADE_PASS')) throw new Error('earned without the pass');
  p.purchased.arcade = 1;
  recordRun(p, {});
  if (!isEarned(p, 'ARCADE_PASS')) throw new Error('not earned with the pass');
});

s.check('ALL_CHARACTERS needs every pilot, not most of them', () => {
  const p = makeProfile();
  const ids = Object.keys(CHARACTERS);
  p.unlockedCharacters = ids.slice(0, ids.length - 1);
  recordRun(p, {});
  if (isEarned(p, 'ALL_CHARACTERS')) throw new Error('earned with a pilot missing');
  p.unlockedCharacters = ids.slice();
  recordRun(p, {});
  if (!isEarned(p, 'ALL_CHARACTERS')) throw new Error('not earned with the full roster');
});

s.check('SHOP_MASTER needs every row owned', () => {
  const p = makeProfile();
  const rows = SHOP_UPGRADES.filter(r => r.id !== 'arcade');
  for (const def of rows) {
    if (def.kind === 'weapon') p.unlockedWeapons.push(def.weaponId);
    else if (def.kind === 'elite') p.unlockedElites.push(def.eliteId);
    else p.purchased[def.id] = def.maxLevel;
  }
  recordRun(p, {});
  if (isEarned(p, 'SHOP_MASTER')) throw new Error('earned with the arcade row still unbought');
  p.purchased.arcade = 1;
  recordRun(p, {});
  if (!isEarned(p, 'SHOP_MASTER')) throw new Error('not earned with every row owned');
});

s.check('FULL_BUILD needs a survived run AND a filled build', () => {
  const p = makeProfile();
  recordRun(p, { survived: false, wave: 15 });
  if (isEarned(p, 'FULL_BUILD')) throw new Error('earned without surviving');
  // Fill the weapon slots through the same grant path the achievements use,
  // then survive.
  for (const id of ['weapon_orbit', 'weapon_zap', 'weapon_nova_pulse', 'weapon_scythe', 'weapon_seeker', 'weapon_mine']) {
    const ach = achievementForUnlock('shopRow', id);
    if (!ach) throw new Error('no achievement grants ' + id);
    applyUnlocks(p, [ach.id]);
  }
  recordRun(p, { survived: true });
  if (!isEarned(p, 'FULL_BUILD')) throw new Error('not earned with a full build that survived');
});

// ---------------------------------------------------------------------------
// 5. The gallery model — what the screen will actually draw.
// ---------------------------------------------------------------------------
s.check('gallery lists every earnable trophy in art order, locked ones masked', () => {
  const p = makeProfile();
  const g = galleryModel(p);
  const earnable = TROPHY_IDS.filter(id => id !== TROPHY_FALLBACK_ID);
  if (g.length !== earnable.length) throw new Error('expected ' + earnable.length + ' entries, got ' + g.length);
  if (g.map(e => e.id).join(',') !== earnable.join(',')) throw new Error('gallery order differs from art order');
  if (g.some(e => e.id === TROPHY_FALLBACK_ID)) throw new Error('the fallback filled a gallery slot');
  for (const e of g) {
    if (e.earned) throw new Error('a fresh profile shows ' + e.id + ' as earned');
    if (e.art !== TROPHY_ART[TROPHY_FALLBACK_ID]) throw new Error(e.id + ' does not use the locked silhouette');
    if (e.name !== 'Locked') throw new Error(e.id + ' leaks its name before being earned');
    if (e.desc === TROPHY_ART[e.id].desc) throw new Error(e.id + ' leaks its description before being earned');
  }
});

s.check('an earned trophy reveals its real art, name and description', () => {
  const p = makeProfile();
  recordRun(p, { kills: 1 });
  const e = galleryModel(p).find(x => x.id === 'FIRST_BLOOD');
  if (!e.earned) throw new Error('FIRST_BLOOD not shown as earned');
  if (e.art !== TROPHY_ART.FIRST_BLOOD) throw new Error('earned entry still uses the locked art');
  if (e.name !== TROPHY_ART.FIRST_BLOOD.name) throw new Error('name is not the art name');
  if (e.desc !== TROPHY_ART.FIRST_BLOOD.desc) throw new Error('desc is not the art desc');
  if (!e.at) throw new Error('no earned timestamp');
});

s.check('progress is backfilled so an earned trophy never reads 3 / 100', () => {
  const p = makeProfile();
  p.achievements = { v: 1, earned: { KILLS_100: 12345 }, progress: { KILLS_100: 3 }, totals: {} };
  const norm = normalizeAchievements(p.achievements);
  if (norm.progress.KILLS_100 < 100) {
    throw new Error('progress left below the goal: ' + norm.progress.KILLS_100);
  }
});

s.check('gallerySummary counts earned against the full set', () => {
  const p = makeProfile();
  recordRun(p, { kills: 1 });
  const sum = gallerySummary(p);
  if (sum.total !== totalAchievements()) throw new Error('total mismatch');
  if (sum.earned !== earnedCount(p)) throw new Error('earned count disagrees with earnedCount');
  if (sum.earned < 1) throw new Error('nothing counted after earning one');
});

s.check('an unknown id from a newer build does not inflate the count', () => {
  const p = makeProfile();
  p.achievements = { v: 1, earned: { FROM_THE_FUTURE: 1 }, progress: {}, totals: {} };
  if (earnedCount(p) !== 0) throw new Error('unknown id counted as a trophy');
});

// ---------------------------------------------------------------------------
// 6. Persistence: the namespace survives a save round-trip and a hand-edit.
// ---------------------------------------------------------------------------
s.check('a fresh profile carries an empty, valid namespace', () => {
  const p = makeProfile();
  const a = p.achievements;
  if (!a) throw new Error('no achievements namespace on a fresh profile');
  if (a.v !== 1) throw new Error('unexpected namespace version: ' + a.v);
  if (Object.keys(a.earned).length !== 0) throw new Error('fresh profile has trophies');
  if (Object.keys(a.totals).length !== 0) throw new Error('fresh profile has counters');
});

s.check('a save round-trip preserves trophies, progress and counters', () => {
  const p = makeProfile();
  recordRun(p, { kills: 250, wave: 6, time: 700, survived: true });
  const saved = JSON.parse(JSON.stringify(p));
  const { profile: back, repairs } = validateProfile(saved);
  if (repairs.length) throw new Error('a clean save needed repairs: ' + repairs.join(','));
  if (!isEarned(back, 'KILLS_100')) throw new Error('KILLS_100 lost in the round-trip');
  if (!isEarned(back, 'WAVE_5')) throw new Error('WAVE_5 lost in the round-trip');
  if (!isEarned(back, 'SURVIVE_10MIN')) throw new Error('SURVIVE_10MIN lost in the round-trip');
  const t = ensureAchievements(back).totals;
  if (t.kills !== 250) throw new Error('kills counter lost: ' + t.kills);
});

s.check('a hand-edited namespace is repaired, never emptied', () => {
  const cases = [
    { v: 'x', earned: { FIRST_BLOOD: true, KILLS_100: 'oops' }, progress: { KILLS_100: -5 }, totals: { kills: 'many' } },
    { v: 1, earned: null, progress: 7, totals: 'nope' },
    { v: 1, earned: { __proto__: 1 }, progress: {}, totals: {} },
  ];
  for (const raw of cases) {
    const { profile } = validateProfile({ version: PROFILE_VERSION, achievements: raw });
    const a = ensureAchievements(profile);
    if (!a || typeof a !== 'object') throw new Error('namespace lost');
    if (raw.earned && raw.earned.FIRST_BLOOD && !a.earned.FIRST_BLOOD) {
      throw new Error('an earned trophy was dropped by validation');
    }
    for (const v of Object.values(a.earned)) {
      if (!Number.isFinite(v) || v <= 0) throw new Error('earned stamp not a positive number: ' + v);
    }
    for (const v of Object.values(a.progress)) {
      if (!Number.isFinite(v) || v < 0) throw new Error('progress value invalid: ' + v);
    }
    for (const v of Object.values(a.totals)) {
      if (!Number.isFinite(v) || v < 0) throw new Error('total invalid: ' + v);
    }
    if (Object.prototype.hasOwnProperty.call(a.earned, '__proto__')) throw new Error('prototype key survived');
  }
});

s.check('a v3 save migrates to v4 without inventing or losing anything', () => {
  const legacy = {
    version: 3,
    gold: 4321,
    purchased: { dmg: 2 },
    unlockedCharacters: ['KNIGHT'],
    equippedCharacter: 'KNIGHT',
    unlockedWeapons: ['VOLLEY', 'ORBIT'],
    unlockedElites: ['SWIFT'],
    characters: {},
  };
  const res = migrateProfile(legacy, {});
  if (!res.ok) throw new Error('migration refused a v3 save: ' + res.status);
  if (res.profile.version !== PROFILE_VERSION) throw new Error('did not reach the current version');
  const { profile, repairs } = validateProfile(res.profile);
  if (repairs.length) throw new Error('migrated save needed repairs: ' + repairs.join(','));
  if (profile.gold !== 4321) throw new Error('gold changed in migration');
  if (profile.unlockedWeapons.join(',') !== 'VOLLEY,ORBIT') throw new Error('weapons changed in migration');
  if (ensureAchievements(profile).earned && Object.keys(ensureAchievements(profile).earned).length !== 0) {
    throw new Error('a legacy save must not be handed free trophies');
  }
  // And it is immediately usable: a first run earns normally.
  const out = recordRun(profile, { kills: 1 });
  if (!out.earned.includes('FIRST_BLOOD')) throw new Error('migrated profile cannot earn');
});

s.check('a save from a NEWER build is still refused (never half-loaded)', () => {
  const res = migrateProfile({ version: PROFILE_VERSION + 1, achievements: { earned: { X: 1 } } }, {});
  if (res.ok) throw new Error('a future-version save was accepted');
  if (res.status !== 'future-version') throw new Error('wrong status: ' + res.status);
});

s.check('measuredValue is monotonic for a cumulative goal as runs accumulate', () => {
  const p = makeProfile();
  let last = -1;
  for (let i = 0; i < 5; i++) {
    recordRun(p, { kills: 10 });
    const v = measuredValue(p, ACHIEVEMENT_BY_ID.KILLS_100);
    if (v < last) throw new Error('measured value went backwards');
    last = v;
  }
  if (last !== 50) throw new Error('expected 50 measured, got ' + last);
});

s.done();
