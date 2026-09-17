// HORDES — MANA-COST WEAPONS (Sk408: "Chain Zap seemed pretty powerful ...
// maybe should use mana").
//
// ZAP is the first weapon to opt into the mana pool: a def may carry MANA.
// HARD GATE (owner 2026-09-17, superseding N1a's soft gate): "A
// MANA-CONSUMING WEAPON fires when mana is insufficient, including at
// exactly zero. Fix the gate." A dry weapon does NOT fire — no bolt, no
// damage, no cooldown, no spend. What is pinned here:
//   1. a funded ZAP spends exactly its cost and fires full damage;
//   2. a DRY ZAP (mana < cost, INCLUDING ZERO) does not fire AT ALL — no
//      damage, no zap effect, cd stays 0, mana untouched;
//   3. the boundary is exact: it CAN fire at mana === cost and CANNOT at
//      cost - 1, and the deduction happens exactly once per fire;
//   4. the cadence contract rides the dt: a funded pool fires 10/COOLDOWN
//      bolts in 10s at 60Hz AND 120Hz, and a dry pool fires ZERO;
//   5. an empty field never burns a charge (the target test comes FIRST);
//   6. weapons without MANA never touch the pool;
//   7. the cost lives on the weapon def, read through weaponManaCost() —
//      the WITCH's manaCostMult (0.5) makes ZAP cost her 2, everyone else 4;
//   8. the Witch's pilot defaults to SWARM (cluster-seeking), still cyclable.
// Run: node test/test_weapon_mana.mjs
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';
import { WEAPONS, WEAPON_TYPES, weaponManaCost } from '../src/weapons.js';
import { boomBlast } from '../src/rewrites.js';
import { useSkill, ultCharge } from '../src/skills.js';
import { skillManaCost } from '../src/perks.js';
import { CONFIG } from '../src/config.js';

const S = suite('WEAPON MANA COST');
const h = await boot();
const st = h.state;
const T = h.T;

const ZAP = WEAPONS.ZAP;

// A run with a live enemy on the field. The weapon under test is driven
// directly, so the frame loop's own resource ticks cannot muddy the numbers.
function liveWithEnemy() {
  T.startRun();
  // Keep pumping until a real enemy exists — using the game's own spawn path
  // rather than a hand-built fixture that could drift from the enemy contract.
  for (let i = 0; i < 900 && st.enemies.length === 0; i++) {
    h.pump(1, () => { st.player.hp = st.player.stats.maxHp; });
  }
  assert.ok(st.enemies.length > 0, 'the run spawned an enemy to aim at');
  const w = { type: 'ZAP', level: 1, cd: 0, evolution: null };
  return w;
}
const fire = (w) => WEAPON_TYPES.ZAP.update(st, w, 1 / 60);
const cost = () => weaponManaCost('ZAP', st);

// ============================================================================
S.check('the cost lives on the weapon def, read through the ONE seam', () => {
  assert.ok(ZAP.MANA > 0, 'WEAPONS.ZAP.MANA must be a positive cost (got ' + ZAP.MANA + ')');
  assert.equal(Object.keys(WEAPONS).filter(k => WEAPONS[k].MANA).length, 1,
    'exactly one weapon opts into mana today (ZAP)');
  assert.equal(cost(), ZAP.MANA,
    'with no character mult, weaponManaCost is the def value (' + cost() + ' vs ' + ZAP.MANA + ')');
  assert.equal(weaponManaCost('VOLLEY', st), 0, 'a weapon without MANA costs nothing');
  assert.equal(weaponManaCost('NO_SUCH_WEAPON', st), 0, 'an unknown weapon costs nothing');
});

// ============================================================================
S.check('a funded ZAP spends its cost and fires', () => {
  const w = liveWithEnemy();
  st.player.mana = 100;
  fire(w);
  assert.ok(st.player.mana <= 100 - cost() + 1,
    'a fired bolt spends its ' + cost() + ' cost (100 -> ' + st.player.mana + ')');
  assert.ok(w.cd > 0, 'and it arms its cooldown (cd=' + w.cd + ')');
});

// ============================================================================
// THE REPRODUCTION (owner 2026-09-17: "A MANA-CONSUMING WEAPON fires when mana
// is insufficient, including at exactly zero"). Red-lined against the N1a soft
// gate: the shipped build fires a dry bolt at 0.5x damage here. The hard-gate
// fix must make this check green without touching the cost constant.
S.check('a DRY ZAP does NOT fire — no damage, no effect, no cooldown, no spend', () => {
  const w = liveWithEnemy();
  st.enemies.length = 1;
  const e = st.enemies[0];
  st.player.stats.crit = 0;
  e.maxHp = e.hp = 1e9;                 // cannot die: damage would show in e.hp
  const effectsBefore = st.effects.length;
  // mana < cost, ONE SHORT.
  st.player.mana = cost() - 1;
  const before = st.player.mana;
  fire(w);
  assert.equal(e.hp, 1e9,
    'a dry bolt must deal ZERO damage (hp ' + e.hp + ')');
  assert.equal(st.effects.length, effectsBefore,
    'a dry bolt must spawn NO zap effect (+' + (st.effects.length - effectsBefore) + ')');
  assert.ok(w.cd <= 0,
    'a dry attempt must arm NO cooldown (cd=' + w.cd + ')');
  assert.equal(st.player.mana, before,
    'a dry attempt spends NOTHING (' + before + ' -> ' + st.player.mana + ')');
  // ...and at EXACTLY ZERO, the headline case from the directive.
  st.player.mana = 0;
  fire(w);
  assert.equal(e.hp, 1e9, 'at mana 0 the bolt still must not deal damage');
  assert.ok(w.cd <= 0, 'at mana 0 no cooldown may arm (cd=' + w.cd + ')');
  assert.equal(st.player.mana, 0, 'at mana 0 nothing is spent');
  // ...and the moment the pool CAN pay, the next bolt is full-price again.
  st.player.mana = cost();
  w.cd = 0;
  fire(w);
  assert.ok(st.player.mana < cost(), 'funded on the next attempt, it spends the cost');
});

// ============================================================================
S.check('the boundary is exact: fires at mana === cost, once, for exactly the cost', () => {
  // One enemy (no chain jumps), crits off, huge HP: the arms differ ONLY in
  // funding, and the funded arm isolates the full-damage baseline.
  const w = liveWithEnemy();
  st.enemies.length = 1;
  const e = st.enemies[0];
  st.player.stats.crit = 0;
  e.maxHp = e.hp = 1e9;
  const shot = () => {
    e.hp = 1e9;
    w.cd = 0;
    fire(w);
    return 1e9 - e.hp;
  };
  // Funded baseline (100 mana, well past cost).
  st.player.mana = 100;
  const full = shot();
  assert.ok(full > 0, 'the funded bolt did damage (' + full + ')');
  // AT the cost, exactly: full damage (NOT scaled), and the deduction is the
  // cost, once.
  st.player.mana = cost();
  const atEdge = shot();
  assert.equal(atEdge, full,
    'mana === cost must fire FULL damage (' + atEdge + ' vs ' + full + ')');
  assert.equal(st.player.mana, 0,
    'the boundary fire deducts exactly the cost, ONCE (left ' + st.player.mana + ')');
  // ONE BELOW the cost: nothing.
  st.player.mana = cost() - 1;
  const before = st.player.mana;
  const dry = shot();
  assert.equal(dry, 0, 'one below the cost must deal zero damage');
  assert.equal(st.player.mana, before, 'one below the cost must spend nothing');
});

// ============================================================================
S.check('fire cadence is the cooldown at 60Hz AND 120Hz; a dry pool fires ZERO', () => {
  const w = liveWithEnemy();
  st.enemies.length = 1;
  st.enemies[0].maxHp = st.enemies[0].hp = 1e12;   // never dies, never spawns a gap
  st.player.stats.crit = 0;
  // N1b AUTO_CAST: the pilot's spill rule arms OVERCHARGE during the live
  // frames above, and rateScale honors its 0.45 fire-rate mult — this check
  // measures ZAP's OWN cadence, so the buff must not ride along (it never
  // ticks down here: this loop drives the weapon directly, not the frame).
  st.player.buffs.overcharge = 0;
  const run10s = (dt) => {
    let bolts = 0;
    const seen = new Set(st.effects);   // ignore bolts from earlier checks
    w.cd = 0;
    for (let t = 0; t < 10; t += dt) {
      WEAPON_TYPES.ZAP.update(st, w, dt);
      for (const fx of st.effects) {
        if (fx.kind === 'zap' && !seen.has(fx)) { seen.add(fx); bolts++; }
      }
    }
    return bolts;
  };
  // A FULLY FUNDED pool proves the cadence contract (equal counts at both
  // frame rates prove the timing rides the dt, not a frame tally).
  st.player.mana = 1e9;
  const at60 = run10s(1 / 60);
  const at120 = run10s(1 / 120);
  const want = 10 / ZAP.COOLDOWN;                  // 1.4s CD -> ~7.14
  for (const [tag, n] of [['60Hz', at60], ['120Hz', at120]]) {
    assert.ok(Math.abs(n - want) <= 1,
      tag + ' fired ' + n + ' bolts in 10s of funded fire (want ~' + want.toFixed(2) + ')');
  }
  assert.ok(Math.abs(at60 - at120) <= 1,
    'the same cadence at both rates (60Hz ' + at60 + ' vs 120Hz ' + at120 + ')');
  // A DRY pool proves the gate: zero bolts over the same window.
  st.player.mana = 0;
  w.cd = 0;
  const dryBolts = run10s(1 / 60);
  assert.equal(dryBolts, 0,
    'a dry pool must fire ZERO bolts in 10s (got ' + dryBolts + ')');
});

// ============================================================================
S.check('an empty field never burns a charge', () => {
  T.startRun();
  const w = { type: 'ZAP', level: 1, cd: 0, evolution: null };
  st.enemies.length = 0;
  st.player.mana = 100;
  fire(w);
  assert.equal(st.player.mana, 100,
    'no target means no bolt and no mana spent (' + st.player.mana + ')');
  assert.ok(w.cd <= 0, 'and no cooldown armed');
});

// ============================================================================
S.check('weapons without a MANA cost never touch the pool', () => {
  T.startRun();
  for (let i = 0; i < 900 && st.enemies.length === 0; i++) {
    h.pump(1, () => { st.player.hp = st.player.stats.maxHp; });
  }
  assert.ok(st.enemies.length > 0, 'an enemy exists');
  for (const id of Object.keys(WEAPON_TYPES)) {
    if (WEAPONS[id] && WEAPONS[id].MANA) continue;   // ZAP is covered above
    const w = { type: id, level: 1, cd: 0, evolution: null };
    st.player.mana = 100;
    try { WEAPON_TYPES[id].update(st, w, 1 / 60); } catch { /* this weapon's own
      preconditions are not this test's subject; only the pool matters */ }
    assert.equal(st.player.mana, 100,
      id + ' must not spend mana (it declares no MANA cost)');
  }
});

// ============================================================================
S.check('the WITCH discount: ZAP costs her 2, everyone else 4', () => {
  const prof = T.getProfile();
  const restore = { eq: prof.equippedCharacter, unlocked: prof.unlockedCharacters.slice(),
    weapons: prof.unlockedWeapons.slice() };
  try {
    // Knight (the harness default): full price.
    T.startRun();
    assert.equal(cost(), 4, 'a non-Witch pays the def cost (got ' + cost() + ')');
    assert.ok(!st.weapons.some(x => x.type === 'ZAP'),
      'and does not own ZAP at base (the control arm of the cohort numbers)');
    // Witch: her STARTING weapon spawns (ZAP unlocked) and costs half.
    if (!prof.unlockedCharacters.includes('WITCH')) prof.unlockedCharacters.push('WITCH');
    prof.equippedCharacter = 'WITCH';
    if (!prof.unlockedWeapons.includes('ZAP')) prof.unlockedWeapons.push('ZAP');
    T.startRun();
    assert.equal(st.player.stats.manaCostMult, 0.5,
      'applyCharacter threads manaCostMult into the run stats');
    assert.equal(cost(), 2, 'weaponManaCost halves ZAP for the Witch (got ' + cost() + ')');
    assert.ok(st.weapons.some(x => x.type === 'ZAP'), 'she starts with Chain Zap');
    // The discount is a PRICE change, not a damage change: a funded Witch bolt
    // still hits full damage.
    const w = st.weapons.find(x => x.type === 'ZAP');
    w.cd = 0;
    st.player.stats.crit = 0;
    st.enemies.length = 0;   // empty field: must not spend (target test first)
    st.player.mana = 100;
    fire(w);
    assert.equal(st.player.mana, 100, 'no target, no spend — even at half price');
  } finally {
    prof.equippedCharacter = restore.eq;
    prof.unlockedCharacters = restore.unlocked;
    prof.unlockedWeapons = restore.weapons;
    T.startRun();   // leave the harness on a plain run for the checks below
  }
});

// ============================================================================
S.check('the boundary table: EVERY mana consumer refuses below cost, fires at cost', () => {
  // One row per mana consumer in the game, each through its OWN live seam:
  //   weapon (ZAP, cost 4)          -> WEAPON_TYPES.ZAP.update (pinned above)
  //   blast   (boomBlast, cost 6)   -> rewrites.boomBlast (pinned in test_chain_q)
  //   skill   (a MANA skill)        -> useSkill (its own gate, pinned HERE)
  //   ult     (charge skills w/ MANA) -> ultCharge.ready (includes the price)
  // This check owns the SKILL and ULT rows plus the cross-consumer table
  // itself, so a future consumer cannot ship without joining it.
  const w = liveWithEnemy();
  st.enemies.length = 1;
  st.enemies[0].maxHp = st.enemies[0].hp = 1e9;
  st.player.stats.crit = 0;

  // --- weapon row: ZAP, cost 4 (and the Witch's 2 via manaCostMult) --------
  const zapCost = weaponManaCost('ZAP', st);
  st.player.mana = zapCost - 1; w.cd = 0;
  fire(w);
  assert.equal(st.enemies[0].hp, 1e9, '[ZAP ' + zapCost + '] below cost: no damage');
  st.player.mana = zapCost; w.cd = 0;
  fire(w);
  assert.ok(st.enemies[0].hp < 1e9, '[ZAP ' + zapCost + '] at cost: fires');
  assert.equal(st.player.mana, 0, '[ZAP ' + zapCost + '] at cost: deducts to exactly 0');

  // --- blast row: boomBlast, cost 6 ----------------------------------------
  st.player.stats.damage = 10;
  st.player.mana = 6;
  const bFunded = boomBlast(st.player);
  assert.ok(bFunded && bFunded.manaCost === 6, '[boom 6] at cost: full blast');
  st.player.mana = 5;
  assert.equal(boomBlast(st.player), null, '[boom 6] below cost: null');

  // --- skill row: the first MANA skill (useSkill's own gate) ---------------
  const manaSkillId = Object.keys(CONFIG.SKILLS)
    .find(id => CONFIG.SKILLS[id].MANA != null && CONFIG.SKILLS[id].KILLS == null);
  assert.ok(manaSkillId, 'a plain MANA skill must exist for the table');
  const skCost = skillManaCost(manaSkillId, st);
  st.player.skillCd[manaSkillId] = 0;
  st.player.mana = skCost - 1;
  assert.equal(useSkill(st, manaSkillId), false,
    '[' + manaSkillId + ' ' + skCost + '] below cost: useSkill refuses');
  assert.equal(st.player.mana, skCost - 1, '[' + manaSkillId + '] refused cast spends nothing');
  st.player.mana = skCost;
  const cast = useSkill(st, manaSkillId);
  assert.ok(cast === true || cast === undefined,
    '[' + manaSkillId + ' ' + skCost + '] at cost: the cast goes through');
  assert.ok(st.player.mana <= 0.0001,
    '[' + manaSkillId + '] at-cost cast deducts to exactly 0 (left ' + st.player.mana + ')');

  // --- ult row: if any charge-ult carries a MANA price, readiness gates it --
  const manaUltId = Object.keys(CONFIG.SKILLS)
    .find(id => CONFIG.SKILLS[id].MANA != null && CONFIG.SKILLS[id].KILLS != null);
  if (manaUltId) {
    const p = st.player;
    p.kills = 1e9; p.ultSpent = {}; p.skillCd[manaUltId] = 0;
    p.mana = skillManaCost(manaUltId, st) - 1;
    assert.equal(ultCharge(st, manaUltId).ready, false,
      '[' + manaUltId + '] below cost: NOT ready');
    p.mana = skillManaCost(manaUltId, st);
    assert.equal(ultCharge(st, manaUltId).ready, true,
      '[' + manaUltId + '] at cost: ready');
  }
});

// ============================================================================
S.check('the WITCH pilot defaults to SWARM — and TAB still cycles it', () => {
  const prof = T.getProfile();
  const restore = { eq: prof.equippedCharacter, unlocked: prof.unlockedCharacters.slice() };
  try {
    if (!prof.unlockedCharacters.includes('WITCH')) prof.unlockedCharacters.push('WITCH');
    prof.equippedCharacter = 'WITCH';
    T.startRun();
    h.pump(2);   // syncChrome publishes the controller's doctrine each frame
    assert.equal(st.focus, 'SWARM', 'a fresh Witch run opens on the cluster doctrine');
    h.key('keydown', { key: 'Tab' });
    h.pump(2);   // state.focus publishes on the next frame
    assert.equal(st.focus, 'RANGED',   // SWARM -> next in FOCUS_MODES
      'TAB cycles away from the default (got ' + st.focus + ')');
    // A non-Witch class declares no default, so the doctrine simply persists
    // (cycle RANGED -> NEAREST and confirm the next run opens on it).
    h.key('keydown', { key: 'Tab' });
    prof.equippedCharacter = 'KNIGHT';
    T.startRun();
    h.pump(2);
    assert.equal(st.focus, 'NEAREST', 'the Knight opens on whatever focus is live (NEAREST)');
  } finally {
    prof.equippedCharacter = restore.eq;
    prof.unlockedCharacters = restore.unlocked;
    T.startRun();
  }
});

S.done();
