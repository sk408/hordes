// HORDES — STEP 3 pinning test: dev autoplay policy runner.
// Run: node test/test_dev_autoplay.mjs
//
// Pins (owner acceptance):
//   1. TOGGLE default OFF (autoplay + dev-night), same fail-closed storage
//      shape as the slice-7/8 dev prefs; the runner gate refuses while OFF.
//   2. SMART save-up triggers EXACTLY when the preferred target is affordable
//      within 5 estimated runs (gap <= 5*est saves, gap = 5*est+1 does not)
//      and stops filler spend while saving.
//   3. IMPULSIVE buys immediately (cheapest affordable now, no saving).
//   4. Dev-night applies nightmare rules (run-scoped nightRun set) WITHOUT
//      the 50% banking cut, while regular night mode keeps it (same purse,
//      same prep, both arms through the REAL settleRunGold).
//   5. Income-estimator formula + snapshot policy tag (additive optional).
import assert from 'node:assert';
import { boot } from './_harness.mjs';
import { makeProfile } from '../src/meta.js';
import { RUN_GOLD } from '../src/meta.js';
import { buildSnapshot, validateSnapshot } from '../src/dev_telemetry.js';
import {
  DEV_LS_AUTO, DEV_LS_DEVNIGHT, SAVE_UP_RUNS,
  estimateRunIncome, offersFor, preferredTargets,
  smartNextBuy, impulsiveNextBuy, requireAutoplay,
} from '../src/dev_autoplay.js';

// ---- estimator (formula: mean of last 5, floor RUN_GOLD.AWARD) --------------
{
  assert.equal(estimateRunIncome([]), RUN_GOLD.AWARD, 'empty history floors at the award');
  assert.equal(estimateRunIncome(null), RUN_GOLD.AWARD, 'non-history floors at the award');
  assert.equal(estimateRunIncome([100, 200, 300]), 200, 'short history means all of it');
  assert.equal(estimateRunIncome([10, 20, 30, 40, 50, 60, 70]), 50,
    'long history means only the last 5');
  assert.equal(estimateRunIncome([-5, NaN, Infinity, 80]), 80,
    'corrupt entries are ignored, never flip the mean');
  assert.equal(estimateRunIncome([-5, NaN]), RUN_GOLD.AWARD, 'all-corrupt falls back to the floor');
}

// ---- SMART vs IMPULSIVE on the REAL catalogue --------------------------------
// Fresh profile, ORBIT owned (so the first preferred line is the split
// ladder, read live — no restated prices): split cost C, cheapest filler F.
{
  const prof = makeProfile();
  prof.unlockedWeapons.push('ORBIT');
  const prefs = preferredTargets(prof);
  const { SHOP_BY_ID: BY_ID } = await import('../src/meta.js');
  const T0 = prefs[0];
  assert.equal(BY_ID[T0.id].kind, 'weapon', 'weapons lead the preferred order');
  assert.ok(prefs.every((p, i) => i === 0 || p.cost >= prefs[i - 1].cost || BY_ID[p.id].kind !== 'weapon'),
    'weapon rungs climb cheapest-first');
  const weaponIds = prefs.filter((p) => BY_ID[p.id].kind === 'weapon').map((p) => p.id);
  assert.deepEqual(prefs.slice(0, weaponIds.length).map((p) => p.id), weaponIds,
    'every weapon rung precedes split/slots/dmg');
  assert.deepEqual(prefs.slice(weaponIds.length).map((p) => p.id), ['split', 'slots', 'dmg'],
    'then split, weapon slots, damage — the owner-stated order');
  const C = T0.cost;
  const prefIds = new Set(prefs.map((p) => p.id));
  const cheapestFiller = offersFor(prof)
    .filter((o) => !prefIds.has(o.id))
    .sort((a, b) => a.cost - b.cost || (a.id < b.id ? -1 : 1))[0];
  assert.ok(cheapestFiller && cheapestFiller.cost > 0, 'a filler rung exists');
  const F = cheapestFiller;
  // Cheapest-affordable-now, read live (no restated prices, no retune brittleness).
  const cheapestNow = (p) => offersFor(p)
    .filter((o) => p.gold >= o.cost)
    .sort((a, b) => a.cost - b.cost || (a.id < b.id ? -1 : 1))[0].id;
  // First affordable PREFERRED line in priority order, read live.
  const firstPrefNow = (p) => preferredTargets(p).find((o) => p.gold >= o.cost).id;

  // Save-up: gap exactly 5 estimated runs -> hold (null) despite filler gold.
  const est = 50;                                   // horizon = 250
  const G = C - SAVE_UP_RUNS * est;                 // gap exactly 250 = 5.0 runs
  assert.ok(G >= F.cost + 1, 'test setup: filler affordable while saving (gap ' +
    (C - G) + ', filler ' + F.id + '@' + F.cost + ')');
  prof.gold = G;
  assert.equal(smartNextBuy(prof, est), null,
    'SMART holds filler spend when the target is affordable within 5 runs');
  assert.equal(impulsiveNextBuy(prof), cheapestNow(prof),
    'IMPULSIVE buys the cheapest affordable NOW (no saving)');

  // One gold piece further away (gap = 5*est + 1) -> saving releases, and
  // SMART releases to the PREFERRED line while IMPULSIVE dribbles filler.
  prof.gold = G - 1;
  assert.equal(smartNextBuy(prof, est), firstPrefNow(prof),
    'SMART releases to the preferred line the gold piece the target leaves the window');
  assert.notEqual(impulsiveNextBuy(prof), smartNextBuy(prof, est),
    'IMPULSIVE buys cheaper filler where SMART takes the preferred line');
  // Same gap, lower income estimate (5.1 runs out) -> releases too.
  prof.gold = G;
  assert.equal(smartNextBuy(prof, est - 1), firstPrefNow(prof),
    'a lower income estimate releases too (horizon shrinks below the gap)');

  // Target affordable -> the target itself goes first.
  prof.gold = C;
  assert.equal(smartNextBuy(prof, est), T0.id, 'SMART buys the reached target');

  // Higher-priority affordable preferred still goes first while saving for
  // the next line (fresh profile: cheapest weapon affordable, split in reach).
  const fresh = makeProfile();
  const freshFirst = preferredTargets(fresh)[0];
  fresh.gold = freshFirst.cost;
  assert.equal(smartNextBuy(fresh, 70), freshFirst.id,
    'priority order is the buy order even while saving for the next line');

  // Saving also holds when NOTHING is affordable (no trivial-null loophole).
  const broke = makeProfile();
  broke.unlockedWeapons.push('ORBIT');
  broke.gold = 10;
  assert.equal(smartNextBuy(broke, 70), null, 'nothing affordable, target within reach: hold');
  assert.equal(impulsiveNextBuy(broke), null, 'nothing affordable: impulsive holds too');

  // Real purchase through the REAL buyer (ledger + gold gate untouched).
  const buyer = makeProfile();
  buyer.unlockedWeapons.push('ORBIT');
  buyer.gold = G;
  assert.equal(smartNextBuy(buyer, est), null, 're-check the hold on a fresh object');
  buyer.gold = C;
  const { buyUpgrade, upgradeCost, SHOP_BY_ID } = await import('../src/meta.js');
  assert.equal(smartNextBuy(buyer, est), T0.id, 'the reached target is advised');
  assert.equal(buyUpgrade(buyer, T0.id), true, 'the advised buy succeeds');
  const t0def = SHOP_BY_ID[T0.id];
  if (t0def.kind === 'weapon') {
    assert.ok(buyer.unlockedWeapons.includes(t0def.weaponId), 'the archetype unlocked');
    assert.equal(buyer.gold, C - t0def.baseCost, 'gold left the bank at full price');
  } else {
    assert.equal(buyer.gold, C - upgradeCost(t0def, 0), 'gold left the bank at full price');
    assert.equal(buyer.purchased[T0.id], 1, 'the level landed in the build');
  }
}

// ---- toggle defaults OFF + runner gate ---------------------------------------
{
  const h = await boot({ locationSearch: '?dev=1', variant: 'autoplayToggle' });
  h.T.startRun();   // the dev session is born here (gate on); prefs absent -> OFF
  const sess = h.T.dev.session;
  assert.equal(sess.autoplay, false, 'autoplay toggle defaults OFF');
  assert.equal(sess.devNight, false, 'dev-night defaults OFF');
  assert.equal(h.storage.get(DEV_LS_AUTO) ?? null, null, 'no autoplay pref stored');
  assert.equal(h.storage.get(DEV_LS_DEVNIGHT) ?? null, null, 'no dev-night pref stored');
  assert.throws(() => requireAutoplay(sess), /toggle is OFF/,
    'the runner gate refuses while the toggle is OFF');

  // The seam arms the REAL path (persisted pref + live session); the NEXT
  // run's fresh session re-reads it (the run-scoped-freeze contract).
  h.T.dev.setAutoplay(true);
  assert.equal(h.T.dev.session.autoplay, true, 'seam flips the live session');
  assert.equal(h.storage.get(DEV_LS_AUTO), '1', 'seam persists the bit');
  requireAutoplay(h.T.dev.session);
  h.T.startRun();
  assert.equal(h.T.dev.session.autoplay, true, 'the next run re-reads autoplay ON');
  h.T.dev.setAutoplay(false);
  h.T.startRun();
  assert.equal(h.T.dev.session.autoplay, false, '... and OFF again when cleared');
}

// ---- dev-night: nightmare rules WITHOUT the cut; night keeps it -------------
{
  const h = await boot({ locationSearch: '?dev=1', variant: 'autoplayNight' });
  const prepPurse = () => {
    const profile = h.T.getProfile();
    profile.bestTime = 99999;      // no FIRST_CLEAR either arm (kept separate)
    profile.runPurse = 1000;       // the settled remainder, identical both arms
  };

  // ARM 1 — dev-night: nightmare rules on, cut off.
  h.T.dev.setDevNight(true);
  h.T.startRun();
  assert.equal(h.T.night.devRun, true, 'dev-night run carries the dev stamp');
  assert.equal(h.T.night.run, true, 'dev-night run plays under nightmare rules');
  assert.equal(h.T.dev.session.speed, 1, 'speed untouched by the variant');
  prepPurse();
  const settledDev = h.T.purse.settle();
  assert.equal(settledDev.purseBanked, 1000, 'dev-night banks the FULL purse (no cut)');
  const mfDev = h.T.dev.modeFields();
  assert.equal(mfDev.mode, 'dev-night', "dev-night snapshots stamp mode 'dev-night'");
  assert.ok(!mfDev.modifiers.some((m) => m.startsWith('banking-penalty-')),
    'dev-night carries NO banking-penalty modifier');

  // ARM 2 — regular night, same prep: the cut stays exactly as-is.
  h.T.dev.setDevNight(false);
  h.T.night.press(); h.T.night.press();   // the two-press SETUP confirm
  assert.equal(h.T.night.on, true, 'regular night session on');
  h.T.startRun();
  assert.equal(h.T.night.devRun, false, 'regular night carries no dev stamp');
  assert.equal(h.T.night.run, true, 'regular night is a night run');
  prepPurse();
  const settledNight = h.T.purse.settle();
  assert.equal(settledNight.purseBanked, 500, 'regular night banks HALF the purse (cut kept)');
  const mfNight = h.T.dev.modeFields();
  assert.equal(mfNight.mode, 'night', "regular night still stamps mode 'night'");
  assert.ok(mfNight.modifiers.includes('banking-penalty-' + RUN_GOLD.NIGHT_PENALTY_PCT),
    'regular night keeps the live banking-penalty modifier');
  assert.equal(settledDev.purseBanked, 2 * settledNight.purseBanked,
    'same purse, same prep: dev-night banks exactly 2x the night run');
}

// ---- snapshot policy tag (additive optional, speed-stamped) ------------------
{
  const base = {
    schema_v: 2, game_rev: 'abc123:dirty', seed: 7,
    upgrades: { purchased: {} }, shrines: { used: 0, blessings: [] },
    items: [], gold_earned: 100, gold_spent: 10, damage: 5, wave: 1,
    test: false, speed: 8,
  };
  const tagged = buildSnapshot({ ...base, policy: 'smart' });
  assert.equal(tagged.policy, 'smart', 'policy rides the snapshot when set');
  assert.equal(tagged.speed, 8, 'speed stamp survives beside the tag');
  assert.equal(validateSnapshot(tagged).ok, true, 'tagged row validates');
  const untagged = buildSnapshot({ ...base });
  assert.ok(!('policy' in untagged), 'hand runs carry no policy key (byte-identical history)');
  assert.equal(validateSnapshot(untagged).ok, true, 'untagged row still validates');
  assert.throws(() => buildSnapshot({ ...base, policy: '' }), /bad policy/,
    'empty policy refused at build');

  // The live rebuild path stamps both (8x + policy) through the REAL builder.
  const h = await boot({ locationSearch: '?dev=1', variant: 'autoplaySnap' });
  h.T.dev.setSpeed(8);
  h.T.dev.setPolicy('impulsive');
  h.T.startRun();
  h.T.dev.setSpeed(8);
  h.T.dev.setPolicy('impulsive');
  const snap = h.T.dev.rebuildSnapshot();
  assert.equal(snap.speed, 8, 'rebuilt row stamps speed 8');
  assert.equal(snap.policy, 'impulsive', 'rebuilt row stamps the policy');
  assert.equal(validateSnapshot(snap).ok, true, 'rebuilt row validates');
  assert.equal(h.T.dev.setPolicy('bogus'), null, 'unknown policy clears to hand-driven');
}

console.log('test_dev_autoplay: all checks passed');
