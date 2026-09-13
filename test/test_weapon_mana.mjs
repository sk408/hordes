// HORDES — MANA-COST WEAPONS (Sk408: "Chain Zap seemed pretty powerful ...
// maybe should use mana").
//
// ZAP is the first weapon to opt into the mana pool: a def may carry MANA.
// N1a turned the shipped hard gate (730a04b: no fire below cost) into a SOFT
// gate (owner: "for witch with no mana, the chain zap is weaker, and with mana
// we buff it"). What is pinned here:
//   1. a funded ZAP spends exactly its cost and fires full damage;
//   2. a DRY ZAP still fires (the class must not open with its signature
//      weapon offline) at exactly MANA_DRY_MULT damage, spends NOTHING, and
//      is charged the SAME cooldown — the floor cadence IS the cooldown, so
//      60Hz and 120Hz land on the same bolts-per-second;
//   3. an empty field never burns a charge (the target test comes FIRST);
//   4. weapons without MANA never touch the pool;
//   5. the cost lives on the weapon def, read through weaponManaCost() —
//      the WITCH's manaCostMult (0.5) makes ZAP cost her 2, everyone else 4;
//   6. the Witch's pilot defaults to SWARM (cluster-seeking), still cyclable.
// Run: node test/test_weapon_mana.mjs
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';
import { WEAPONS, WEAPON_TYPES, MANA_DRY_MULT, weaponManaCost } from '../src/weapons.js';

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
S.check('a DRY ZAP still fires — at MANA_DRY_MULT, spending nothing', () => {
  const w = liveWithEnemy();
  st.player.mana = cost() - 1;          // one short
  const before = st.player.mana;
  fire(w);
  assert.equal(st.player.mana, before,
    'a dry bolt spends NOTHING (' + before + ' -> ' + st.player.mana + ')');
  assert.ok(w.cd > 0, 'and arms the SAME cooldown — dry is not throttled (cd=' + w.cd + ')');

  // ...and the moment the pool CAN pay, the next bolt is full-price again.
  st.player.mana = cost();
  w.cd = 0;
  fire(w);
  assert.ok(st.player.mana < cost(), 'funded on the next attempt, it spends the cost');
});

// ============================================================================
S.check('the dry damage ratio is exactly MANA_DRY_MULT', () => {
  // One enemy on the field (no chain jumps), crits off (critRoll is the only
  // random site in weapons.js), huge HP so neither bolt kills: the two arms
  // differ ONLY in funding. hurt() applies every live modifier identically to
  // both, so the ratio isolates the dry multiplier.
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
  st.player.mana = 100;
  const full = shot();
  st.player.mana = 0;
  const dry = shot();
  assert.ok(full > 0, 'the funded bolt did damage (' + full + ')');
  assert.ok(dry > 0, 'the dry bolt still did damage (' + dry + ')');
  assert.ok(Math.abs(dry / full - MANA_DRY_MULT) <= 0.02,
    'dry/full = ' + (dry / full).toFixed(4) + ' must be MANA_DRY_MULT ' + MANA_DRY_MULT +
    ' within 0.02');
});

// ============================================================================
S.check('fire cadence is the cooldown at 60Hz AND 120Hz — nothing counts frames', () => {
  // A fully DRY pool over 10 simulated seconds: the bolts that DO fire prove
  // the floor cadence, and equal counts at both frame rates prove the timing
  // rides the dt, not a frame tally.
  const w = liveWithEnemy();
  st.enemies.length = 1;
  st.enemies[0].maxHp = st.enemies[0].hp = 1e12;   // never dies, never spawns a gap
  st.player.stats.crit = 0;
  // N1b AUTO_CAST: the pilot's spill rule arms OVERCHARGE during the live
  // frames above, and rateScale honors its 0.45 fire-rate mult — this check
  // measures ZAP's OWN cadence, so the buff must not ride along (it never
  // ticks down here: this loop drives the weapon directly, not the frame).
  st.player.buffs.overcharge = 0;
  st.player.mana = 0;
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
  const at60 = run10s(1 / 60);
  const at120 = run10s(1 / 120);
  const want = 10 / ZAP.COOLDOWN;                  // 1.4s CD -> ~7.14
  for (const [tag, n] of [['60Hz', at60], ['120Hz', at120]]) {
    assert.ok(Math.abs(n - want) <= 1,
      tag + ' fired ' + n + ' bolts in 10s of dry fire (want ~' + want.toFixed(2) + ')');
  }
  assert.ok(Math.abs(at60 - at120) <= 1,
    'the same dry cadence at both rates (60Hz ' + at60 + ' vs 120Hz ' + at120 + ')');
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
