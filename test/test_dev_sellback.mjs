// HORDES — SLICE 10 dev-run shop buy-back (levels are reversible).
// node test/test_dev_sellback.mjs (exit 0 = pass)
//
// Proves, to the gold: per-level spend ledgers (overrides-aware), exact LIFO
// refunds, free-build composition across a mid-run mode toggle (the mixed-case
// rule: the sell consults ONLY the per-level record, never the live flag),
// stats recompute on removal, snapshot choices.removals, save round-trip, and
// the ?dev=1 UI gate (controls render gated-on, absent gated-off).
import assert from 'node:assert';
import {
  makeProfile, validateProfile, SHOP_BY_ID, WEAPON_PRICES, ELITE_MODIFIERS,
  STARTER_WEAPONS, upgradeCost, buyUpgrade, sellUpgrade,
  unlockCharacter, sellCharacterUnlock,
  buyCharacterUpgrade, sellCharacterUpgrade, getCharacterUpgradeLevel,
  buyApex, sellApex, pushSpend, topRefund, totalRefund, charLedgerKey,
  applyMetaBonuses, setDevFreeBuild, devFreeBuild,
} from '../src/meta.js';
import { validateSnapshot } from '../src/dev_telemetry.js';
import { makePlayer } from '../src/entities.js';
import { boot } from './_harness.mjs';

const baseStats = () => ({ ...makePlayer().stats });   // the run seam's own base

// ---- ledger + exact refund, overrides-aware (pure meta) ---------------------
{
  assert.equal(devFreeBuild(), false, 'free-build defaults OFF');
  const p = makeProfile();
  p.gold = 100000;
  // dmg carries overrides {0:125, 1:250, 2:325, ...} — the formula would pay
  // 150/240/384. The ledger must record the OVERRIDE price, and the refund
  // must be that price, not the formula price.
  assert.equal(upgradeCost(SHOP_BY_ID.dmg, 0), 125, 'dmg L0 prices its override (not formula 150)');
  assert.equal(upgradeCost(SHOP_BY_ID.dmg, 2), 325, 'dmg L2 prices its override (not formula 384)');
  assert.equal(buyUpgrade(p, 'dmg'), true, 'paid buy L0');
  assert.equal(p.gold, 100000 - 125, 'bank debited the override price');
  assert.deepEqual(p.spendLedger.dmg, [125], 'ledger records the exact paid level price');
  assert.equal(topRefund(p, 'dmg'), 125, 'pre-confirm label reads the top entry');
  assert.equal(totalRefund(p, 'dmg'), 125, 'reset total reads the ledger sum');
  const s = sellUpgrade(p, 'dmg');
  assert.deepEqual(s, { ok: true, level: 1, refund: 125 }, 'sell refunds EXACTLY the override price');
  assert.equal(p.gold, 100000, 'bank restored to the gold');
  assert.equal(p.purchased.dmg || 0, 0, 'level removed');
  assert.deepEqual(p.spendLedger.dmg, [], 'ledger popped');
  // Formula rows behave the same (xp: 180 x 1.6^lvl, no overrides).
  assert.equal(buyUpgrade(p, 'xp'), true, 'paid buy xp L0');
  assert.equal(buyUpgrade(p, 'xp'), true, 'paid buy xp L1');
  assert.deepEqual(p.spendLedger.xp, [180, 288], 'formula prices ledgered per level');
  assert.equal(totalRefund(p, 'xp'), 468, 'reset total is the ledger sum');
  const s2 = sellUpgrade(p, 'xp');
  assert.deepEqual(s2, { ok: true, level: 2, refund: 288 }, 'LIFO: the top level refunds first');
  assert.equal(p.purchased.xp, 1, 'one level stands');
  // Refusals mutate nothing.
  const goldBefore = p.gold, ledgerBefore = JSON.stringify(p.spendLedger);
  assert.deepEqual(sellUpgrade(p, 'nope'), { ok: false }, 'unknown id refused');
  assert.deepEqual(sellUpgrade(p, 'luck'), { ok: false }, 'unowned row refused');
  assert.equal(p.gold, goldBefore, 'refusal moves no gold');
  assert.equal(JSON.stringify(p.spendLedger), ledgerBefore, 'refusal touches no ledger');
}

// ---- free-build composes, incl. the mixed case across a toggle -------------
{
  const p = makeProfile();
  p.gold = 5000;
  setDevFreeBuild(true);
  try {
    assert.equal(buyUpgrade(p, 'hp'), true, 'free buy grants');
    assert.equal(p.gold, 5000, 'free buy deducts nothing');
    assert.deepEqual(p.spendLedger.hp, [0], 'free level ledgers 0');
    const s = sellUpgrade(p, 'hp');
    assert.deepEqual(s, { ok: true, level: 1, refund: 0 }, 'free level refunds 0, removal still applies');
    assert.equal(p.purchased.hp || 0, 0, 'free level removed');
  } finally {
    setDevFreeBuild(false);
  }
  // MIXED: paid L0, toggle free for L1, toggle back for paid L2 (override
  // ladder 125 / free / 325) — then sell twice. The live flag at SELL time is
  // irrelevant: each refund equals its own level's record.
  assert.equal(buyUpgrade(p, 'dmg'), true, 'mixed: paid L0 (125)');
  setDevFreeBuild(true);
  try {
    assert.equal(buyUpgrade(p, 'dmg'), true, 'mixed: free L1 (0)');
  } finally {
    setDevFreeBuild(false);
  }
  assert.equal(buyUpgrade(p, 'dmg'), true, 'mixed: paid L2 (325)');
  assert.equal(p.gold, 5000 - 450, 'bank holds exactly the two paid levels');
  assert.deepEqual(p.spendLedger.dmg, [125, 0, 325], 'mixed ledger: paid/free/paid per level');
  setDevFreeBuild(true);   // sell the paid top WHILE free mode is on
  let r1;
  try {
    r1 = sellUpgrade(p, 'dmg');
  } finally {
    setDevFreeBuild(false);
  }
  assert.deepEqual(r1, { ok: true, level: 3, refund: 325 }, 'paid level refunds paid gold even while free mode is on');
  assert.equal(p.gold, 5000 - 125, 'bank: only L0 still paid for');
  const r2 = sellUpgrade(p, 'dmg');   // sell the free middle while paid mode is on
  assert.deepEqual(r2, { ok: true, level: 2, refund: 0 }, 'free level refunds 0 even while free mode is off');
  assert.equal(p.gold, 5000 - 125, 'bank unchanged by the free-level removal');
  assert.equal(p.purchased.dmg, 1, 'L0 stands');
  assert.deepEqual(p.spendLedger.dmg, [125], 'ledger matches the standing level');
  console.log(`  mixed-case proof: bank ${p.gold} (started 5000, paid 125+325, refunded 325+0) ledger [125]`);
}

// ---- unledgered levels (grants, pre-slice saves) refund 0, still remove ----
{
  const p = makeProfile();
  p.gold = 7000;
  const { grantShopRow } = await import('../src/meta.js');
  assert.equal(grantShopRow(p, 'xp'), true, 'grant maxes the row with no ledger');
  assert.equal(p.spendLedger.xp, undefined, 'grants write no ledger');
  const s = sellUpgrade(p, 'xp');
  assert.equal(s.ok, true, 'granted level still removable');
  assert.equal(s.refund, 0, 'unprovable payment refunds 0');
  assert.equal(p.gold, 7000, 'bank untouched by the grant-level removal');
  assert.equal(p.purchased.xp, SHOP_BY_ID.xp.maxLevel - 1, 'level removed');
  // Pre-slice shape: levels with no ledger at all.
  const q = makeProfile();
  q.gold = 3000;
  q.purchased = { hp: 2 };
  assert.equal(buyUpgrade(q, 'hp'), true, 'buy atop legacy levels backfills 0s then records paid');
  assert.equal(q.spendLedger.hp.length, 3, 'ledger now 1:1 with levels');
  assert.equal(q.spendLedger.hp[0], 0, 'legacy level backfilled as 0-paid');
  assert.equal(q.spendLedger.hp[1], 0, 'legacy level backfilled as 0-paid');
}

// ---- stats recompute: removal removes the effect, never stale --------------
{
  const p = makeProfile();
  p.gold = 100000;
  buyUpgrade(p, 'dmg'); buyUpgrade(p, 'dmg'); buyUpgrade(p, 'dmg');
  const at3 = applyMetaBonuses(baseStats(), p.purchased).damage;
  const base = applyMetaBonuses(baseStats(), {}).damage;
  assert.equal(at3, base * Math.pow(3, 3), 'L3 compounds (1+2)^3');
  sellUpgrade(p, 'dmg');
  const at2 = applyMetaBonuses(baseStats(), p.purchased).damage;
  assert.equal(at2, base * Math.pow(3, 2), 'after one sell the effect is exactly L2');
  sellUpgrade(p, 'dmg'); sellUpgrade(p, 'dmg');
  const at0 = applyMetaBonuses(baseStats(), p.purchased).damage;
  assert.equal(at0, base, 'after the full reset the bonus is gone entirely');
  console.log(`  stats proof: base ${base} -> L3 ${at3} -> sell -> L2 ${at2} -> reset -> ${at0}`);
}

// ---- per-character rows: same ledger contract -------------------------------
{
  const p = makeProfile();
  p.gold = 20000;
  assert.equal(buyCharacterUpgrade(p, 'KNIGHT', 'knight_vigor'), true, 'paid char buy (1200)');
  setDevFreeBuild(true);
  try {
    assert.equal(buyCharacterUpgrade(p, 'KNIGHT', 'knight_vigor'), true, 'free char buy (0)');
  } finally {
    setDevFreeBuild(false);
  }
  const key = charLedgerKey('KNIGHT', 'knight_vigor');
  assert.equal(key, 'char:KNIGHT:knight_vigor', 'ledger key shape');
  assert.deepEqual(p.spendLedger[key], [1200, 0], 'char ledger: paid then free');
  const s = sellCharacterUpgrade(p, 'KNIGHT', 'knight_vigor');
  assert.deepEqual(s, { ok: true, level: 2, refund: 0 }, 'free char level refunds 0');
  assert.equal(getCharacterUpgradeLevel(p, 'KNIGHT', 'knight_vigor'), 1, 'char level removed');
  assert.deepEqual(sellCharacterUpgrade(p, 'WITCH', 'knight_vigor'), { ok: false }, 'wrong-character sell refused');
  assert.deepEqual(sellCharacterUpgrade(p, 'KNIGHT', 'knight_vigor'), { ok: true, level: 1, refund: 1200 },
    'paid char level refunds paid gold');
  assert.equal(p.gold, 20000 - 0, 'bank whole again: 20000 - 1200 paid + 1200 refunded');
}

// ---- singletons: weapon / elite / pilot / apex ------------------------------
{
  const p = makeProfile();
  p.gold = 100000;
  // Weapon singleton via its shop row (ORBIT 200, non-starter).
  assert.equal(buyUpgrade(p, 'weapon_orbit'), true, 'weapon row buys');
  assert.ok((p.loadout || []).includes('ORBIT'), 'bought weapon equips (opt-out)');
  const sw = sellUpgrade(p, 'weapon_orbit');
  assert.deepEqual(sw, { ok: true, level: 1, refund: 200 }, 'weapon sells for its exact price');
  assert.ok(!(p.unlockedWeapons || []).includes('ORBIT'), 'ownership removed');
  assert.ok(!(p.loadout || []).includes('ORBIT'), 'sold weapon benched off the loadout');
  assert.deepEqual(sellUpgrade(p, 'weapon_boomerang'), { ok: false }, 'starter weapon not sellable');
  // Elite singleton (SWIFT 10000).
  assert.equal(buyUpgrade(p, 'elite_swift'), true, 'elite row buys');
  assert.deepEqual(sellUpgrade(p, 'elite_swift'), { ok: true, level: 1, refund: 10000 }, 'elite refunds exact cost');
  assert.deepEqual(sellUpgrade(p, 'elite_swift'), { ok: false }, 'second sell refused (nothing owned)');
  // Pilot unlock (ROGUE 2500).
  assert.equal(unlockCharacter(p, 'ROGUE'), true, 'pilot unlock buys');
  assert.deepEqual(sellCharacterUnlock(p, 'ROGUE'), { ok: true, level: 1, refund: 2500 }, 'pilot refunds exact cost');
  assert.deepEqual(sellCharacterUnlock(p, 'KNIGHT'), { ok: false }, 'default pilot not sellable');
  // A pilot carrying upgrade levels cannot be sold out from under them.
  assert.equal(unlockCharacter(p, 'WITCH'), true, 'witch unlock buys (9000)');
  assert.equal(buyCharacterUpgrade(p, 'WITCH', 'witch_wellspring'), true, 'witch row buys');
  assert.deepEqual(sellCharacterUnlock(p, 'WITCH'), { ok: false }, 'pilot with levels refused');
  assert.equal(sellCharacterUpgrade(p, 'WITCH', 'witch_wellspring').ok, true, 'row sells first');
  assert.equal(sellCharacterUnlock(p, 'WITCH').ok, true, 'bare pilot sells after');
  // Apex: gate-closed buy refuses; a ledgered owned item sells exactly.
  // (The gate needs the whole catalogue, so the paid leg is staged directly:
  // debit + ledger + ownership, exactly what a paid buyApex writes.)
  assert.equal(buyApex(p, 'apex_mark'), false, 'apex buy refused with the catalogue gate closed');
  p.gold = 1000000;   // fund the staged paid leg so the bank stays in-domain throughout
  p.gold -= 550000;
  pushSpend(p, 'apex:apex_mark', 550000, 0);
  p.apex.owned.push('apex_mark');
  assert.deepEqual(sellApex(p, 'apex_mark'), { ok: true, level: 1, refund: 550000 }, 'apex refunds its ledger');
  assert.deepEqual(sellApex(p, 'apex_mark'), { ok: false }, 'apex second sell refused');
  assert.equal(p.gold, 1000000, 'bank whole after every singleton round-trip');
  console.log(`  singleton proof: bank ${p.gold} (all singleton buys refunded to the gold)`);
}

// ---- save round-trip preserves the ledger -----------------------------------
{
  const p = makeProfile();
  p.gold = 9000;
  buyUpgrade(p, 'dmg');
  setDevFreeBuild(true);
  try { buyUpgrade(p, 'dmg'); } finally { setDevFreeBuild(false); }
  const { profile: rt, repairs } = validateProfile(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(rt.spendLedger.dmg, [125, 0], 'ledger survives a save round-trip');
  assert.ok(!repairs.some(r => String(r).startsWith('spendLedger')), 'clean ledger names no repairs');
  const bad = validateProfile({ ...JSON.parse(JSON.stringify(p)), spendLedger: { dmg: [10, -5, 'x', NaN], __proto__: [1] } });
  assert.deepEqual(bad.profile.spendLedger.dmg, [10], 'ledger sanitizes to finite non-negative ints');
  assert.ok(bad.repairs.some(r => String(r).startsWith('spendLedger')), 'dirty ledger names repairs');
  const legacy = validateProfile({ version: 10, gold: 5 });
  assert.deepEqual(legacy.profile.spendLedger, {}, 'pre-slice saves default to an empty ledger, no migration');
}

// ---- headless ?dev=1 run: buy 3 mixed, sell 2, snapshot carries removals ----
{
  const h = await boot({ locationSearch: '?dev=1', variant: 'sellback' });
  const T = h.T;
  assert.equal(T.dev.gate, true, 'the ?dev=1 boot arms the gate');
  const prof = T.getProfile();
  prof.gold = 10000;
  assert.equal(prof.purchased.dmg || 0, 0, 'proof starts at dmg 0');
  const { buyUpgrade: metaBuy, setDevFreeBuild: setFree } = await import('../src/meta.js');
  setFree(false);
  assert.equal(metaBuy(prof, 'dmg'), true, 'run proof: paid L0 (override 125)');
  setFree(true);
  assert.equal(metaBuy(prof, 'dmg'), true, 'run proof: free L1 (0)');
  setFree(false);
  assert.equal(metaBuy(prof, 'dmg'), true, 'run proof: paid L2 (override 325)');
  assert.equal(prof.gold, 9550, 'bank after mixed buys: 10000 - 125 - 325');
  const r1 = T.dev.sellShopRow('dmg');
  assert.deepEqual({ ok: r1.ok, level: r1.level, refund: r1.refund },
    { ok: true, level: 3, refund: 325 }, 'seam sell 1: paid top refunds 325');
  const r2 = T.dev.sellShopRow('dmg');
  assert.deepEqual({ ok: r2.ok, level: r2.level, refund: r2.refund },
    { ok: true, level: 2, refund: 0 }, 'seam sell 2: free middle refunds 0');
  assert.equal(prof.gold, 9875, 'bank after sells: 9550 + 325 + 0');
  assert.equal(prof.purchased.dmg, 1, 'one level stands');
  assert.deepEqual(prof.spendLedger.dmg, [125], 'ledger matches the standing level');
  assert.equal(T.dev.removals().length, 2, 'journal holds both removals pre-run');
  T.startRun();
  h.pump(3);
  assert.equal(h.state.runCounts.gold.spent, 0, 'meta shop/sell never touches the in-run spend metric');
  T.dev.onRunEnd();
  const snap = T.dev.session.snapshot;
  assert.ok(snap, 'the end-of-run snapshot built');
  assert.equal(validateSnapshot(snap).ok, true, 'the removal-carrying snapshot validates (same schema family)');
  assert.deepEqual(snap.choices.removals, [
    { id: 'dmg', kind: 'shop', characterId: null, level: 3, refund: 325 },
    { id: 'dmg', kind: 'shop', characterId: null, level: 2, refund: 0 },
  ], 'choices.removals: level + refunded amount per removed level');
  assert.equal(snap.upgrades.purchased.dmg, 1, 'snapshot build reflects the post-sell level');
  assert.equal(snap.gold_spent, 125, 'gold_spent prices the standing build at full price ' +
    '(dmg L0 override 125 — the sold free middle and paid top are gone; chests add on top)');
  assert.deepEqual(T.dev.removals(), [], 'journal drains exactly once into the snapshot');
  console.log(`  run proof: bank ${prof.gold}, ledger [${prof.spendLedger.dmg}], ` +
    `removals ${JSON.stringify(snap.choices.removals)}, snapshot dmg ${snap.upgrades.purchased.dmg}, ` +
    `gold_spent ${snap.gold_spent}`);
  setFree(false);
}

// ---- UI gate: controls render ?dev=1-gated, absent without it ----------------
{
  const off = await boot({ variant: 'sellback-off' });
  const { buyUpgrade: metaBuy2 } = await import('../src/meta.js');
  const poff = off.T.getProfile();
  poff.gold = 50000;
  assert.equal(metaBuy2(poff, 'dmg'), true, 'gate-off profile owns a level');
  off.T.shop.open();
  assert.deepEqual(off.T.dev.sellControls(), [], 'gate OFF: no sell control renders (player build untouched)');
  const on = await boot({ locationSearch: '?dev=1', variant: 'sellback-ui' });
  const pon = on.T.getProfile();
  pon.gold = 50000;
  assert.equal(metaBuy2(pon, 'dmg'), true, 'gate-on profile owns a level (paid 125)');
  assert.equal(metaBuy2(pon, 'xp'), true, 'gate-on profile owns a second row');
  on.T.shop.open();
  const ctrls = on.T.dev.sellControls();
  const dmg = ctrls.find(c => c.id === 'dmg');
  assert.ok(dmg, 'gate ON: the owned row carries a sell control');
  assert.equal(dmg.level, 1, 'control names the owned level');
  assert.equal(dmg.refund, 125, 'control shows the exact top refund BEFORE any click');
  assert.ok(ctrls.some(c => c.id === 'xp'), 'every owned row carries one');
}

// ---- reset-all path totals the ledger ---------------------------------------
{
  const h = await boot({ locationSearch: '?dev=1', variant: 'sellback-reset' });
  const T = h.T;
  const prof = T.getProfile();
  prof.gold = 20000;
  const { buyUpgrade: metaBuy3, setDevFreeBuild: setFree3 } = await import('../src/meta.js');
  setFree3(false);
  metaBuy3(prof, 'xp'); metaBuy3(prof, 'xp');   // 180 + 288 paid
  const all = T.dev.sellShopRowAll('xp');
  assert.deepEqual(all, { count: 2, refund: 468 }, 'row reset refunds the ledger sum');
  assert.equal(prof.purchased.xp || 0, 0, 'row fully cleared');
  assert.equal(prof.gold, 20000, 'bank whole: 20000 - 468 + 468');
  assert.equal(T.dev.removals().length, 2, 'reset journals one removal per level');
  setFree3(false);
}

console.log('test_dev_sellback: all checks passed');
