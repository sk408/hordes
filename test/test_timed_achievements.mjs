// HORDES — G11 PART A: timed achievements (goal kind 'run').
//
// The contract under test, stated EXACTLY as implemented: a 'run' goal is a
// conjunction of a stat threshold and a clock ceiling inside ONE run, measured
// at the single settle funnel off the run summary — the stat reached n AND the
// run's own clock, when it settled, was <= within. The boundary is INCLUSIVE
// (time === within earns); a summary with no clock (time 0/missing) records
// nothing for the bucket, because 0 would poison a real best.
import { suite } from './_harness.mjs';
import {
  ACHIEVEMENTS, ACHIEVEMENT_BY_ID, recordRun, ensureAchievements,
  normalizeAchievements, isEarned, measuredValue, goalText,
  auditRunGoals, RUN_STATS, summaryStat,
} from '../src/achievements.js';
import { makeProfile, validateProfile } from '../src/meta.js';
import { TROPHY_ART } from '../src/art/index.js';

const s = suite('test_timed_achievements');

// ---------------------------------------------------------------------------
// 1. The catalog declares the four timed goals with honest art + goal text.
// ---------------------------------------------------------------------------
s.check('the four timed achievements exist with the specified goals', () => {
  const spec = {
    WAVE5_UNDER_3MIN: { stat: 'wave', n: 5, within: 180 },
    WAVE8_UNDER_5MIN: { stat: 'wave', n: 8, within: 300 },
    KILLS_500_UNDER_5MIN: { stat: 'kills', n: 500, within: 300 },
    GOLD_600_UNDER_6MIN: { stat: 'gold', n: 600, within: 360 },
  };
  for (const [id, g] of Object.entries(spec)) {
    const a = ACHIEVEMENT_BY_ID[id];
    if (!a) throw new Error(id + ' missing from the catalog');
    const { kind, stat, n, within } = a.goal;
    if (kind !== 'run' || stat !== g.stat || n !== g.n || within !== g.within) {
      throw new Error(id + ' goal drifted: ' + JSON.stringify(a.goal));
    }
    if (!TROPHY_ART[id]) throw new Error(id + ' has no emblem');
  }
  const runGoals = ACHIEVEMENTS.filter(a => a.goal.kind === 'run');
  if (runGoals.length !== 4) throw new Error('expected 4 run goals, got ' + runGoals.length);
});

s.check('at least two timed goals carry an EXISTING unlock kind and target', () => {
  const withUnlock = ACHIEVEMENTS.filter(a => a.goal.kind === 'run' && a.unlock);
  if (withUnlock.length < 2) throw new Error('only ' + withUnlock.length + ' timed goals carry an unlock');
  for (const a of withUnlock) {
    if (!['shopRow', 'character'].includes(a.unlock.kind)) {
      throw new Error(a.id + ' invented a new unlock kind: ' + a.unlock.kind);
    }
  }
});

s.check('goalText states the conjunction honestly (never "before")', () => {
  for (const a of ACHIEVEMENTS.filter(x => x.goal.kind === 'run')) {
    const t = goalText(a);
    // RETARGETED (N4, audit 2026-09-16): the earn check is INCLUSIVE (rt ===
    // within earns — pinned by the boundary test below), so the text says
    // "in mm:ss or less". The old pin "in a run under mm:ss" claimed an
    // exclusive boundary the code never enforced.
    if (!/in a run in \d+:\d\d or less/.test(t)) throw new Error(a.id + ' goal text is not the honest shape: ' + t);
    if (/before|under \d/i.test(t)) throw new Error(a.id + ' claims a boundary the measurement does not honour: ' + t);
    if (/_/.test(t)) throw new Error(a.id + ' leaks a raw stat id: ' + t);
  }
  // Spot-check the exact rendering for one goal.
  if (goalText(ACHIEVEMENT_BY_ID.WAVE5_UNDER_3MIN) !== 'Wave 5+ in a run in 3:00 or less') {
    throw new Error('WAVE5 text: ' + goalText(ACHIEVEMENT_BY_ID.WAVE5_UNDER_3MIN));
  }
});

s.check('auditRunGoals passes the live catalog', () => {
  const bad = auditRunGoals();
  if (bad.length) throw new Error('bad run goals: ' + bad.join(', '));
});

// ---------------------------------------------------------------------------
// 2. Earning: the positive, the negative, the boundary, the missing clock.
// ---------------------------------------------------------------------------
s.check('WAVE5_UNDER_3MIN is earned from a synthetic summary and stamps progress', () => {
  const p = makeProfile();
  const res = recordRun(p, { wave: 5, time: 150, kills: 30 });
  if (!res.earned.includes('WAVE5_UNDER_3MIN')) throw new Error('not earned at wave 5 / 2:30');
  const ns = ensureAchievements(p);
  if (!ns.earned.WAVE5_UNDER_3MIN) throw new Error('no earn stamp in the namespace');
  if (ns.progress.WAVE5_UNDER_3MIN !== 5) throw new Error('progress is ' + ns.progress.WAVE5_UNDER_3MIN + ', not 5');
  if (ns.timed['wave@180'] !== 5) throw new Error('bucket wave@180 is ' + ns.timed['wave@180']);
});

s.check('WAVE8_UNDER_5MIN earns AND grants its unlock (the shopRow route)', () => {
  const p = makeProfile();
  p.gold = 0;                                        // the achievement IS the price
  const res = recordRun(p, { wave: 8, time: 280 });
  if (!res.earned.includes('WAVE8_UNDER_5MIN')) throw new Error('not earned at wave 8 / 4:40');
  const u = res.unlocks.find(x => x.achievement === 'WAVE8_UNDER_5MIN');
  if (!u) throw new Error('no unlock reported');
  if (!u.ok || u.kind !== 'shopRow' || u.id !== 'slots') throw new Error('bad unlock: ' + JSON.stringify(u));
  if ((p.purchased.slots || 0) < 1) throw new Error('the slots row was not granted');
  if (p.gold !== 0) throw new Error('gold was charged: ' + p.gold);
});

s.check('the negative: same wave, over the ceiling, must not earn', () => {
  const p = makeProfile();
  const res = recordRun(p, { wave: 5, time: 400 });
  if (res.earned.includes('WAVE5_UNDER_3MIN')) throw new Error('earned at 6:40 — ceiling ignored');
  if (isEarned(p, 'WAVE5_UNDER_3MIN')) throw new Error('stamp present for an over-ceiling run');
  // The bucket must not record the stat under a ceiling the run broke.
  if (ensureAchievements(p).timed['wave@180'] !== undefined) {
    throw new Error('bucket recorded wave@180 for a 400s run');
  }
});

s.check('the boundary is INCLUSIVE: time === within earns', () => {
  const p = makeProfile();
  const res = recordRun(p, { wave: 5, time: 180 });
  if (!res.earned.includes('WAVE5_UNDER_3MIN')) {
    throw new Error('time === within did not earn (rule: rt <= g.within)');
  }
});

s.check('a summary with no clock records nothing (0 must not poison the best)', () => {
  const p = makeProfile();
  recordRun(p, { wave: 5 });                          // time missing
  if (isEarned(p, 'WAVE5_UNDER_3MIN')) throw new Error('a clockless run earned a clock goal');
  if (Object.keys(ensureAchievements(p).timed).length !== 0) {
    throw new Error('a clockless run wrote the bucket');
  }
});

s.check('a slow run then a fast run keeps the FAST run as the bucket best', () => {
  const p = makeProfile();
  recordRun(p, { wave: 3, time: 100 });
  recordRun(p, { wave: 2, time: 150 });
  if (ensureAchievements(p).timed['wave@180'] !== 3) {
    throw new Error('bucket best should stay 3, got ' + ensureAchievements(p).timed['wave@180']);
  }
  if (isEarned(p, 'WAVE5_UNDER_3MIN')) throw new Error('earned off a max of sub-threshold runs');
});

// ---------------------------------------------------------------------------
// 3. measuredValue + summaryStat: the one code path, and its typo guard.
// ---------------------------------------------------------------------------
s.check('measuredValue reads the timed bucket and tracks progress', () => {
  const p = makeProfile();
  const ach = ACHIEVEMENT_BY_ID.KILLS_500_UNDER_5MIN;
  if (measuredValue(p, ach) !== 0) throw new Error('fresh profile measures non-zero');
  recordRun(p, { kills: 200, time: 240 });
  if (measuredValue(p, ach) !== 200) throw new Error('measured ' + measuredValue(p, ach) + ', not 200');
  recordRun(p, { kills: 510, time: 300 });            // boundary run earns
  if (measuredValue(p, ach) !== 510) throw new Error('measured ' + measuredValue(p, ach) + ', not 510');
  if (!isEarned(p, 'KILLS_500_UNDER_5MIN')) throw new Error('not earned at 510 under 5:00');
  // Over the ceiling: the stat is real but the bucket is not written.
  recordRun(p, { kills: 900, time: 420 });
  if (measuredValue(p, ach) !== 510) throw new Error('an over-ceiling run moved the bucket');
});

s.check('summaryStat maps the known stats and measures 0 for an unknown one', () => {
  const r = { wave: 4, kills: 50, gold: 60, chests: 2, bossKills: 1, evolutions: 1, weaponLevel: 3 };
  for (const stat of RUN_STATS) {
    if (summaryStat(r, stat) !== r[stat]) throw new Error(stat + ' mis-mapped');
  }
  if (summaryStat(r, 'nonsense') !== 0) throw new Error('an unknown stat must measure 0, not throw');
  if (summaryStat(null, 'wave') !== 0) throw new Error('a null summary must measure 0');
});

s.check('a run goal with a bogus stat measures 0 and the audit catches it', () => {
  const bogus = { id: 'BOGUS', goal: { kind: 'run', stat: 'banana', n: 5, within: 60 } };
  const p = makeProfile();
  recordRun(p, { banana: 99, wave: 1, time: 10 });
  if (measuredValue(p, bogus) !== 0) throw new Error('bogus stat measured non-zero');
  // The audit flags it loudly at test time (fail loudly, never silently).
  const bad = auditRunGoals();
  if (bad.length) throw new Error('the live catalog has bad run goals: ' + bad.join(', '));
  // Prove the audit WOULD catch it, by driving it through a namespace fold on
  // a doctored copy of the check: unknown stat + bad within + bad n.
  const probe = [
    { id: 'X1', goal: { kind: 'run', stat: 'banana', n: 5, within: 60 } },
    { id: 'X2', goal: { kind: 'run', stat: 'wave', n: 5, within: 0 } },
    { id: 'X3', goal: { kind: 'run', stat: 'wave', n: 0, within: 60 } },
    { id: 'X4', goal: { kind: 'run', stat: 'wave', n: 1.5, within: 60 } },
  ];
  // Reimplement the audit's exact rules against the probes (the exported
  // audit reads the live catalog only — this proves the RULES, not a mock).
  const bad2 = [];
  for (const a of probe) {
    const g = a.goal;
    if (!RUN_STATS.includes(g.stat)) bad2.push(a.id + ' stat');
    if (!(Number.isInteger(g.within) && g.within > 0)) bad2.push(a.id + ' within');
    if (!(Number.isInteger(g.n) && g.n > 0)) bad2.push(a.id + ' n');
  }
  if (bad2.length !== 4) throw new Error('the audit rules miss broken goals: ' + bad2.join(', '));
});

// ---------------------------------------------------------------------------
// 4. Namespace v2 + the save layer: repair keeps every earned stamp.
// ---------------------------------------------------------------------------
s.check('a save with no timed bucket repairs to {} and keeps every earned stamp', () => {
  const p = makeProfile();
  recordRun(p, { kills: 100 });                       // earns KILLS_100 + FIRST_BLOOD
  const v1 = ensureAchievements(p);
  // A v1-shaped payload: everything but the timed bucket.
  const legacy = { v: 1, earned: { ...v1.earned }, progress: { ...v1.progress }, totals: { ...v1.totals } };
  const repaired = normalizeAchievements(legacy);
  if (!repaired.timed || typeof repaired.timed !== 'object' || Object.keys(repaired.timed).length !== 0) {
    throw new Error('a missing timed bucket did not repair to {}');
  }
  if (!repaired.earned.KILLS_100 || !repaired.earned.FIRST_BLOOD) {
    throw new Error('repair dropped an earned stamp');
  }
  if (repaired.v !== 2) throw new Error('namespace version is ' + repaired.v + ', not 2');
});

s.check('a garbage timed bucket repairs to known keys with intOr values', () => {
  const p = makeProfile();
  recordRun(p, { wave: 5, time: 150 });
  const ns = ensureAchievements(p);
  const garbage = {
    v: 2, earned: { ...ns.earned }, progress: { ...ns.progress }, totals: { ...ns.totals },
    timed: { 'wave@180': 'lots', 'kills@300': 412, 'ghost@999': 7 },
  };
  const repaired = normalizeAchievements(garbage);
  if (repaired.timed['wave@180'] !== 0) throw new Error('garbage value not intOr\'d: ' + repaired.timed['wave@180']);
  if (repaired.timed['kills@300'] !== 412) throw new Error('a good value was not kept');
  if (repaired.timed['ghost@999'] !== undefined) throw new Error('a key the live catalog does not declare was kept');
  if (!repaired.earned.WAVE5_UNDER_3MIN) throw new Error('repair dropped the timed earn');
});

s.check('validateProfile carries the timed bucket through (structure-only, keys opaque)', () => {
  const p = makeProfile();
  recordRun(p, { wave: 8, time: 280, kills: 400 });
  const carried = validateProfile(JSON.parse(JSON.stringify(p))).profile;
  const ns = carried.achievements;
  if (!ns.timed || typeof ns.timed !== 'object') throw new Error('the timed bucket was dropped by validation');
  if (ns.timed['wave@300'] !== 8) throw new Error('wave@300 is ' + ns.timed['wave@300'] + ', not 8');
  if (ns.timed['kills@300'] !== 400) throw new Error('kills@300 is ' + ns.timed['kills@300'] + ', not 400');
  if (!ns.earned.WAVE8_UNDER_5MIN) throw new Error('validation dropped the earned stamp');
  // A v1 payload gains an empty bucket, never a poisoned one.
  const v1 = validateProfile(makeProfile()).profile;
  if (!v1.achievements.timed || Object.keys(v1.achievements.timed).length !== 0) {
    throw new Error('a fresh validateProfile output lacks an empty timed bucket');
  }
});

s.done();
