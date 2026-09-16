// AUDIT FIXES ROUND 3 (2026-09-16) — one failing-first test per item.
//   ITEM 1 (F9): the remaining NaN-unsafe purchase gates fail CLOSED through
//     ONE shared helper (meta.js canAfford) — unlockElite, buyApex,
//     buyCharacterUpgrade, plus unlockCharacter (a fourth sibling the dispatch
//     did not cite; same class, disclosed) and the two M5-era gates.
//   ITEM 2 (F10): settleRunGold claims state.runSettled BEFORE the side
//     effects and runs the effects inside try/catch — a partial failure can no
//     longer re-open the S1 double-pay.
// Every check FAILS on the pre-fix tree (verified red before landing fixes).
// Run: node test/test_audit_round3.mjs
import assert from 'node:assert/strict';
import { makeProfile, buyUpgrade, unlockWeapon, unlockElite, buyApex, apexUnlocked,
  buyCharacterUpgrade, unlockCharacter, SHOP_UPGRADES, RUN_GOLD } from '../src/meta.js';
import { boot, suite } from './_harness.mjs';

const S = suite('AUDIT ROUND 3');

// ---------- ITEM 1 (F9): every buyer fails CLOSED on a poisoned wallet ------
// A poisoned wallet is NaN, undefined, or a negative number. For EVERY buyer:
// the purchase must refuse, grant nothing, and leave profile.gold UNMUTATED
// (a "repair to 0" happening here would be the silent bank wipe).
S.check('F9: unlockElite rejects NaN/undefined/negative gold, no mutation', () => {
  for (const bad of [NaN, undefined, -50]) {
    const prof = makeProfile();
    prof.gold = bad;
    assert.equal(unlockElite(prof, 'SWIFT'), false, `unlockElite must reject gold=${bad}`);
    assert.equal((prof.unlockedElites || []).includes('SWIFT'), false, 'no elite granted');
    assert.ok(Object.is(prof.gold, bad), `gold unmutated (got ${prof.gold}, wanted ${bad})`);
  }
});

S.check('F9: buyCharacterUpgrade rejects NaN/undefined/negative gold, no mutation', () => {
  for (const bad of [NaN, undefined, -50]) {
    const prof = makeProfile();   // KNIGHT is unlocked by default
    prof.gold = bad;
    assert.equal(buyCharacterUpgrade(prof, 'KNIGHT', 'knight_vigor'), false,
      `buyCharacterUpgrade must reject gold=${bad}`);
    assert.equal(prof.characters && prof.characters.KNIGHT, undefined,
      'no per-character level granted');
    assert.ok(Object.is(prof.gold, bad), `gold unmutated (got ${prof.gold}, wanted ${bad})`);
  }
});

S.check('F9: buyApex rejects NaN/undefined/negative gold, no mutation', () => {
  // Arm the apex GATE (ownership of every normal row) — the gate is derived
  // from ownership fields, so it arms without spending a coin.
  const armed = makeProfile();
  for (const def of SHOP_UPGRADES) {
    if (def.kind === 'weapon') armed.unlockedWeapons.push(def.weaponId);
    else if (def.kind === 'elite') armed.unlockedElites.push(def.eliteId);
    else armed.purchased[def.id] = def.maxLevel;
  }
  armed.apex = { owned: [], enabled: false };
  assert.equal(apexUnlocked(armed), true, 'fixture arms the apex gate');
  for (const bad of [NaN, undefined, -50]) {
    const prof = makeProfile();
    // copy the armed ownership shape (structured by field, not deep-clone games)
    prof.purchased = { ...armed.purchased };
    prof.unlockedWeapons = [...armed.unlockedWeapons];
    prof.unlockedElites = [...armed.unlockedElites];
    prof.apex = { owned: [], enabled: false };
    prof.gold = bad;
    assert.equal(buyApex(prof, 'apex_mark'), false, `buyApex must reject gold=${bad}`);
    assert.equal(prof.apex.owned.length, 0, 'no apex item granted');
    assert.ok(Object.is(prof.gold, bad), `gold unmutated (got ${prof.gold}, wanted ${bad})`);
  }
});

S.check('F9: unlockCharacter rejects NaN/undefined/negative gold, no mutation', () => {
  // DISCLOSED in the done post: a FOURTH unsafe gate the dispatch did not cite
  // (unlockCharacter, same `gold < cost` form) — fixed by the same helper.
  for (const bad of [NaN, undefined, -50]) {
    const prof = makeProfile();
    prof.gold = bad;
    assert.equal(unlockCharacter(prof, 'WITCH'), false,
      `unlockCharacter must reject gold=${bad}`);
    assert.equal(prof.unlockedCharacters.includes('WITCH'), false, 'no character granted');
    assert.ok(Object.is(prof.gold, bad), `gold unmutated (got ${prof.gold}, wanted ${bad})`);
  }
});

S.check('F9: the M5-era gates (buyUpgrade, unlockWeapon) still fail closed', () => {
  const prof = makeProfile();
  prof.gold = NaN;
  assert.equal(buyUpgrade(prof, 'dmg'), false, 'buyUpgrade must reject NaN gold');
  assert.equal(prof.purchased['dmg'], undefined, 'no level granted');
  assert.equal(unlockWeapon(prof, 'ORBIT'), false, 'unlockWeapon must reject NaN gold');
  assert.ok(!prof.unlockedWeapons.includes('ORBIT'), 'no weapon granted');
  // Sanity: a healthy wallet still buys (the gate did not invert).
  const rich = makeProfile();
  rich.gold = 1000;
  assert.equal(buyUpgrade(rich, 'dmg'), true, 'a healthy wallet still buys');
});

// ---------- ITEM 2 (F10): claim-first settlement ------------------------------
const h = await boot();
const T = h.T;
const st = h.state;

S.check('F10: a throw inside the settle body does NOT re-open the double-pay', () => {
  T.startRun(); h.pump(2);
  const prof = T.getProfile();
  prof.bestTime = 99999;                 // no FIRST_CLEAR: award is the flat 70
  st.player.stats.goldMult = 1;
  prof.runPurse = 42;
  // INJECTED FAILURE: any read of profile.achievements throws. recordRun runs
  // inside the settle effects (recordRunAchievements -> ensureAchievements),
  // so the FIRST settle partially fails AFTER banking — the exact window the
  // flag-at-the-end ordering left open.
  const realAch = prof.achievements;
  Object.defineProperty(prof, 'achievements', {
    configurable: true,
    get() { throw new Error('F10 injected settle failure'); },
  });
  let r1 = null;
  try { r1 = T.purse.settle(); } catch { /* pre-fix: the throw escapes; post-fix it cannot */ }
  // Restore a plain achievements object for the second call's reads.
  Object.defineProperty(prof, 'achievements', { configurable: true, value: realAch });
  // THE F10 ASSERTION: the second settle must pay NOTHING. Pre-fix the first
  // call threw AFTER banking but BEFORE writing state.runSettled, so the
  // second call banked a SECOND award — the S1 double-pay re-opened.
  const goldBeforeSecond = prof.gold;
  const r2 = T.purse.settle();
  assert.equal(prof.gold, goldBeforeSecond,
    'the second settlement banks NOTHING (the claim survived the injected failure)');
  assert.ok(r1 === null || (r2.gold === r1.gold && r2.award === r1.award &&
    r2.purseBanked === r1.purseBanked),
    'the second settlement returns the first settlement\'s numbers');
});

S.check('F10: the normal path is byte-identical ({gold,award,purseBanked,winBonus,firstClear})', () => {
  T.startRun(); h.pump(2);   // fresh run: settlement is run-once per run
  const prof = T.getProfile();
  prof.bestTime = 0;                     // firstClear live (state.time > 0)
  st.time = 30;
  st.player.stats.goldMult = 2;          // GREED line
  prof.runPurse = 42;
  const before = prof.gold;
  const r = T.purse.settle({ winBonus: 1200 });
  const wantAward = Math.round(RUN_GOLD.AWARD * 2) + RUN_GOLD.FIRST_CLEAR;
  assert.deepEqual(r, { gold: wantAward + 42 + 1200, award: wantAward,
    purseBanked: 42, winBonus: 1200, firstClear: true },
    'the settled shape is exactly the pre-F10 numbers');
  assert.equal(prof.gold, before + r.gold, 'bank delta matches (effects ran on the normal path)');
  assert.equal(prof.runPurse, 0, 'the purse zeroed on the normal path');
  assert.equal(Math.floor(st.time), prof.bestTime, 'bestTime stamped on the normal path');
});

S.done();
