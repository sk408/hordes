// HORDES — test/test_rewrites.mjs: G8 STEP 2 (the rewrite family, src/rewrites.js).
//
// The owner's G8 decision (docs/HORDES_GOALS_2026-09-12.md) is option 6,
// sequenced 1 -> 3 -> 4 -> 2; this file covers the LAST step, the
// rule-REWRITE cards (Pierce All / Chain Reaction / Blood Harvest), each
// proven at its REAL seam:
//
//   1. THE FAMILY CONTRACT: ids unique, no collision with the stat UPGRADES,
//      the rules family or the perk family, once-only, one weight constant,
//      and the same apply(player) draft contract every other card honors.
//   2. THE HELPERS' MATH: rewriteBoom / harvestBlast return exactly
//      FLAT + FRAC x the player's weapon damage, or null when not held.
//   3. THE LIVE LOOP: PIERCE ALL read at EVERY projectile spawn site (the
//      volley AND the boomerang), CHAIN REACTION through the real kill
//      funnel (exact damage, never the player, exactly one detonation per
//      kill, NO toast), BLOOD HARVEST through the real drop-collect path
//      (exact damage, hp-kind only), and dt-correctness 60Hz == 120Hz.
//   4. THE REAL DRAFT SEAM: rewrite cards reach src/main.js openDraft()'s
//      pool, leave it once taken, and pick() grants the rewrite WITHOUT
//      polluting the `once` stat ledger.
//   5. THE ONCE RETUNE at the real seam: under ONE OF EACH an at-cap weapon
//      level-up card stays offered (openDraft), converts to exactly +10%
//      weapon damage in pick(), and a below-cap level-up grants +1 bonus
//      level — plus the sim's one-bad-pick invariant (>= 0.8x) for every
//      rewrite card AND the retuned once.
//
// Run: node test/test_rewrites.mjs
import assert from 'node:assert/strict';
import { CONFIG as C, UPGRADES } from '../src/config.js';
import { makePlayer } from '../src/entities.js';
import { makeWeapon, WEAPON_MAX_LEVEL, PIERCE_ALL, levelUpWeapon } from '../src/weapons.js';
import { RULE_IDS } from '../src/rules.js';
import { SKILL_PERK_IDS } from '../src/perks.js';
import {
  REWRITES, REWRITE_IDS, REWRITE_CARD_WEIGHT,
  BOOM_RADIUS, BOOM_DAMAGE_FLAT, BOOM_DAMAGE_FRAC,
  HARVEST_RADIUS, HARVEST_DAMAGE_FLAT, HARVEST_DAMAGE_FRAC,
  rewritesOf, hasRewrite, rewriteCardOffered, rewriteCards, grantRewrite,
  rewriteBoom, harvestBlast,
} from '../src/rewrites.js';
import { isFlashEligibleKill, flashTargets, FLASH_TRASH_TIERS } from '../src/loot.js';
import { simulateCohort, divergenceVerdict } from '../tools/draft_sim.mjs';
import { boot } from './_harness.mjs';

let pass = 0, fail = 0;
function ok(name, fn) {
  try { fn(); pass++; console.log('  ok  ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.message)); }
}
const seeded = (seed) => { let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const stateWith = (rewrites = null) => ({ player: { ...makePlayer(), rewrites: rewrites || {} },
  enemies: [], effects: [] });

console.log('rewrites (G8 step 2): the mechanic-rewrite family, at its real seams');

// ---- 1. the family contract --------------------------------------------------
ok('the catalog is the three rewrites with unique ids and player-facing labels', () => {
  assert.deepEqual(REWRITE_IDS, ['pierceall', 'onkillboom', 'healthdamage']);
  assert.equal(new Set(REWRITE_IDS).size, 3);
  for (const id of REWRITE_IDS) {
    assert.ok(REWRITES[id].name, id + ' has a name');
    assert.ok(!/rewrite/i.test(REWRITES[id].desc),
      id + ' desc is player-facing copy, never the internal family label');
    assert.ok(REWRITES[id].desc.length > 20, id + ' desc is real prose, not a placeholder');
  }
});
ok('no id collides with the stat UPGRADES, the run-rule ids or the perk ids', () => {
  const stats = new Set(UPGRADES.map(u => u.id));
  for (const id of REWRITE_IDS) {
    assert.ok(!stats.has(id), id + ' would shadow a stat card');
    assert.ok(!RULE_IDS.includes(id), id + ' would shadow a rule card');
    assert.ok(!SKILL_PERK_IDS.includes(id), id + ' would shadow a perk card');
  }
});
ok('cards exist once, at REWRITE_CARD_WEIGHT, and grant through apply(player)', () => {
  const st = stateWith(null);
  assert.equal(Object.keys(st.player.rewrites).length, 0, 'a fresh player holds nothing');
  const cards = rewriteCards(st);
  assert.equal(cards.length, REWRITE_IDS.length);
  for (const c of cards) {
    assert.equal(c.weight, REWRITE_CARD_WEIGHT);
    assert.ok(c.id.startsWith('rewrite_'));
    const p = makePlayer();
    c.apply(p);
    assert.ok(p.rewrites[c.rewrite], c.rewrite + ' is granted by its own card');
  }
  grantRewrite(st, 'onkillboom');
  assert.equal(rewriteCards(st).length, REWRITE_IDS.length - 1, 'a taken rewrite leaves the pool');
  assert.equal(rewriteCardOffered('onkillboom', st), false);
  assert.equal(grantRewrite(st, 'not_a_rewrite'), false, 'an unknown rewrite id is refused');
  assert.ok(hasRewrite(st, 'onkillboom') && !hasRewrite(st, 'pierceall'));
  assert.equal(rewritesOf({}), null, 'a stateless read is null, not a throw');
});
ok('makePlayer() ships an empty rewrites ledger beside rules/skills/takenStats', () => {
  const p = makePlayer();
  assert.deepEqual(p.rewrites, {});
  assert.deepEqual(p.rules, {});
  assert.deepEqual(p.skills, {});
  assert.deepEqual(p.takenStats, {});
});

// ---- 2. the applied-value helpers' math --------------------------------------
ok('rewriteBoom: exactly FLAT + FRAC x weapon damage with the rewrite, null without', () => {
  assert.equal(rewriteBoom(stateWith(null)), null);
  const st = stateWith({ onkillboom: true });
  const want = BOOM_DAMAGE_FLAT + BOOM_DAMAGE_FRAC * st.player.stats.damage;
  assert.equal(rewriteBoom(st).damage, want);
  assert.equal(rewriteBoom(st).radius, BOOM_RADIUS);
  assert.equal(BOOM_DAMAGE_FRAC, 0.5, 'half a weapon hit, per the brief shape');
});
ok('harvestBlast: exactly FLAT + FRAC x weapon damage with the rewrite, null without', () => {
  assert.equal(harvestBlast(stateWith(null)), null);
  const st = stateWith({ healthdamage: true });
  const want = HARVEST_DAMAGE_FLAT + HARVEST_DAMAGE_FRAC * st.player.stats.damage;
  assert.equal(harvestBlast(st).damage, want);
  assert.equal(harvestBlast(st).radius, HARVEST_RADIUS);
  assert.equal(HARVEST_DAMAGE_FRAC, 1.0, 'a full weapon hit - potions are the rare trigger');
});

// ---- 3. THE LIVE LOOP ---------------------------------------------------------
const h = await boot({ storage: [['hordes_onboarded', '1']] });
const st = h.state;
if (st.mode === 'intro') h.key('keydown', { key: 'x', preventDefault() {} });
st.player.rewrites = {};
h.T.startRun();
h.pump(2);
assert.equal(st.mode, 'playing', 'run live');
const p = st.player;
const quiet = () => { st.enemies.length = 0; st.enemyShots.length = 0; st.projectiles.length = 0; };

ok('PIERCE ALL is read at the VOLLEY spawn site (live loop)', () => {
  p.rewrites.pierceall = true;
  // One durable target so the volley actually fires. The first 30 frames wipe
  // projectiles too, so any pre-flag stale shot is gone before sampling begins;
  // after that every sampled shot was fired post-flag.
  // A1 RETARGET (2026-09-14): this target used to sit at p.x + 400 — the pilot
  // now HOLDS FIRE beyond its engagement radius (config AUTOPILOT.FOCUS_RANGE,
  // owner-set base 100), so 0 shots were observed. The fixture is re-anchored to
  // the pilot at half the radius every frame: the shot source under test (the
  // VOLLEY spawn site reading PIERCE_ALL) is unchanged, and the assertions below
  // are byte-for-byte the originals.
  const gap = Math.round(C.AUTOPILOT.FOCUS_RANGE / 2);
  const far = { typeId: 'BRUTE', x: p.x + gap, y: p.y, hp: 1e9, maxHp: 1e9, speed: 0, age: 0, flash: 0, slow: 0, xp: 0 };
  const pierces = [];
  h.pump(180, (i) => {
    st.enemies.length = 0; st.enemyShots.length = 0;
    far.x = p.x + gap; far.y = p.y;      // stay inside the engagement radius
    st.enemies.push(far);
    if (i < 30) st.projectiles.length = 0;
    else for (const pr of st.projectiles) if (!pr.kind) pierces.push(pr.pierce);
  });
  p.rewrites.pierceall = false;
  assert.ok(pierces.length > 0, `the volley fired (${pierces.length} shots observed)`);
  for (const v of pierces) assert.equal(v, PIERCE_ALL, 'every fresh volley shot carries PIERCE_ALL');
});

ok('PIERCE ALL is read at the BOOMERANG spawn site (live loop)', () => {
  p.rewrites.pierceall = true;
  // A fresh run owns only the VOLLEY (the boomerang arrives by draft grant),
  // so hand the run a REAL boomerang instance and let its own update fire.
  st.weapons.push(makeWeapon('BOOMERANG'));
  const far = { typeId: 'BRUTE', x: p.x - 400, y: p.y, hp: 1e9, maxHp: 1e9, speed: 0, age: 0, flash: 0, slow: 0, xp: 0 };
  const pierces = [];
  // The boomerang's cycle is several seconds — pump long enough to guarantee
  // a throw, sampling in-flight boomerangs after a wipe window for stale shots.
  h.pump(600, (i) => {
    st.enemies.length = 0; st.enemyShots.length = 0;
    st.enemies.push(far);
    if (i < 30) st.projectiles.length = 0;
    else for (const pr of st.projectiles) if (pr.kind === 'boomerang') pierces.push(pr.pierce);
  });
  st.weapons = st.weapons.filter(w => w.type !== 'BOOMERANG');
  p.rewrites.pierceall = false;
  assert.ok(pierces.length > 0, 'the boomerang threw');
  for (const v of pierces) assert.equal(v, PIERCE_ALL, 'every fresh boomerang carries PIERCE_ALL');
});

// One live hostile shape the loop accepts, with hp too big to die mid-probe.
// TICK-10 HERMETICITY: probe bodies are BRUTE, never CHASER/SWARMER.
// Every probe enemy is a 1e9-hp sentinel that only an explicit `v.hp = 0` can
// move, and the engine has exactly ONE such site outside the death pass: the
// WAVE-11 FLASH DROP (src/main.js:1635 <- src/loot.js). That flash is a
// 0.8%-per-eligible-kill `Math.random` roll which reaps EVERY enemy of the
// WEAKEST TRASH TIER present (CHASER/SWARMER only, loot.js FLASH_TRASH_TIERS).
// With CHASER bodies the roll could zero `near`/`far` mid-probe and turn these
// measurements into noise: it cost the suite a run (the dt probe read
// 1000000000 where it wanted 26, i.e. near.hp had been forced to 0).
// BRUTE is outside the trash tiers, is NOT `elite` (so the ordinary non-elite
// drop path is unchanged), and no boom/blast/kill path branches on typeId, so
// what the probes measure is unchanged. Guarded by the field check in the dt
// probe and the flash-hermeticity test below - do NOT put trash in a probe field.
const PROBE_BODY = 'BRUTE';   // outside loot.js FLASH_TRASH_TIERS (see above)
const hostile = (typeId, at, off = { x: 0, y: 0 }) => ({
  // Defence in depth: a probe body can never be a flash-reapable trash tier,
  // whatever a call site asks for. Ask for CHASER and you get a BRUTE body.
  typeId: FLASH_TRASH_TIERS.includes(typeId) ? PROBE_BODY : typeId,
  x: at.x + off.x, y: at.y + off.y, hp: 1e9, maxHp: 1e9,
  speed: 0, age: 0, flash: 0, slow: 0, xp: 0,
});
// A PROBE CORPSE is a body that must die frame 1 — and only its maxHp made it
// elite-ish: isEliteish counts `maxHp >= BASE_HP * 1.5` (src/chests.js), so a
// 1e9-hp corpse rolls maybeSpawnChest's 35% on EVERY death. The chest lands
// clamped right at the corpse (the player's feet) and pops the NEXT frame:
// rare contents are one UPGRADES apply (a Whetstone is `damage *= 1.25`, the
// 8 -> 10 repricing) plus one potion (`+1` hp, the 2 !== 1 collect). That was
// the real source behind the chest theory — not the chests on the field
// (closeWindow clears those), but the CORPSE ITSELF being chest-eligible.
// maxHp below the elite bar kills the roll at its seam; hp: 0 still dies.
const corpse = (at, off = { x: 0, y: 0 }) => ({ ...hostile(PROBE_BODY, at, off), hp: 0, maxHp: 1 });
ok('the probe bodies are immune to the WAVE-11 FLASH DROP (it reaps trash tier only)', () => {
  // The hazard this guards, straight from src/loot.js: a flash zeroes every
  // enemy of the weakest trash tier present. Plain CHASER is one of them.
  const trash = { typeId: FLASH_TRASH_TIERS[1], hp: 1e9 };
  assert.equal(isFlashEligibleKill(trash), true, 'a plain CHASER is flash-eligible');
  assert.equal(flashTargets([trash]).length, 1, 'and a flash WOULD reap it');
  // So no probe body may be trash, whatever Math.random rolls.
  assert.equal(isFlashEligibleKill(hostile('CHASER', p)), false, 'a probe body is not flash-eligible');
  assert.deepEqual(flashTargets([hostile('BRUTE', p), hostile('BRUTE', p)]), [], 'probe fields hold nothing a flash can reap');
});

// HERMETIC WINDOW (dt-probe hermeticity brief, tick 11): the exact-value
// probes below price ONE boom and/or ONE blast off the player's weapon
// damage, but the LIVE run loop keeps running inside the pump — it only
// lost its weapons, not its event sources. Two of those sources leaked into
// the measurement at ~17% of runs: a chest opened mid-window grants a
// Whetstone (`p.stats.damage *= 1.25`, src/config.js) which reprices the
// boom (death frame) and the blast (collect frame) differently, and a
// live-run potion collected in-window fires a second blast. This closes the
// run's own event sources at their REAL seams — the same triple
// test_run_structure.mjs:158-160 already uses (spawn clock / wave boss /
// herald) — plus the loot fields (chests/portal/drops/itemDrops/effects)
// and the corpse's own drop roll (dropBonus pinned negative, so the death
// pass' `Math.random() < dropChance` can never fire). The code UNDER
// MEASUREMENT — the death sweep, the boom, the potion collect, the blast —
// is never stubbed and runs for real. Returns a restore closure; call it in
// a finally, always.
const closeWindow = () => {
  assert.equal(st.mode, 'playing', 'the window only closes over a live run');
  st.enemies.length = 0; st.chests.length = 0; st.drops.length = 0;
  st.itemDrops.length = 0; st.portal = null; st.effects.length = 0;
  const save = { spawnTimer: st.spawnTimer, endsAt: st.wave.endsAt, midAt: st.wave.midAt,
    dropBonus: p.stats.dropBonus, weapons: st.weapons, shrine: st.shrine,
    attackTimer: p.attackTimer, skillCd: { ...p.skillCd } };
  st.spawnTimer = st.time + 1e9;   // no ambient packs
  st.wave.endsAt = st.time + 1e9;  // no wave boss
  st.wave.midAt = st.time + 1e9;   // no herald
  p.stats.dropBonus = -1;          // no drop rolls inside the window
  st.weapons = [];                 // no weapon damage into the field
  for (const id in p.skillCd) p.skillCd[id] = 1e9;
                                  // N1b AUTO_CAST: skills pinned ON COOLDOWN so
                                  // the pilot's cast hand stays quiet — an AUTO
                                  // pilot with a ready, affordable FROST_NOVA
                                  // would fire it into the probe field (the
                                  // bodies sit well inside RADIUS) and the
                                  // payout numbers would price two events.
                                  // (Pinning p.mana instead is NOT equivalent:
                                  // mana is a real input to the kite/loot
                                  // doctrine and to AUTO_DRINK, and disturbing
                                  // it moved the pilot off the pickup.)
  st.shrine = null;                // no altar purchase: the shrine DRIFTS AT the
  //                                player and buys an intermission-style
  //                                blessing on proximity (applyChoice — a
  //                                Whetstone repricing the payouts or a potion
  //                                refill; this was the leak the chest theory
  //                                missed: state.shrine, not st.chests)
  p.attackTimer = 1e9;             // and the BASE VOLLEY still fires with
  //                                st.weapons empty: runController (src/main.js)
  //                                fires it straight off p.attackTimer +
  //                                decision.target, reading the VOLLEY instance
  //                                only for level params — undefined means Lv1,
  //                                and a Lv1 shot into `near` on the firing line
  //                                is +2 the probe never priced
  return () => { st.spawnTimer = save.spawnTimer; st.wave.endsAt = save.endsAt;
    st.wave.midAt = save.midAt; p.stats.dropBonus = save.dropBonus; st.weapons = save.weapons;
    st.shrine = save.shrine; p.attackTimer = save.attackTimer;
    Object.assign(p.skillCd, save.skillCd); };
};

ok('CHAIN REACTION detonates through the REAL kill funnel (damage exact, once per kill)', () => {
  const restore = closeWindow();
  try {
    p.rewrites.onkillboom = true;
    p.invuln = 999;
    const dmg0 = p.stats.damage;   // pinned: the boom prices off THIS value
    const want = BOOM_DAMAGE_FLAT + BOOM_DAMAGE_FRAC * dmg0;
    // The corpse (hp 0 dies this frame) at the player's side; a neighbour inside
    // the boom radius and one safely outside it.
    const boomAt = { x: p.x + 60, y: p.y };
    const dead = corpse(boomAt);   // non-elite: no chest roll off its death
    const near = hostile('BRUTE', boomAt, { x: 20, y: 0 });       // dist 20 <= 40
    const far = hostile('BRUTE', boomAt, { x: 200, y: 0 });       // dist 200 > 40
    st.enemies.push(dead, near, far);
    st.projectiles.length = 0;
    // the field IS the probe: nothing else can be added or reaped in-window
    assert.deepEqual(st.enemies, [dead, near, far], 'the field holds exactly the probe bodies');
    assert.equal(st.drops.length, 0, 'and exactly zero ground drops');
    h.pump(1, quiet);
    p.rewrites.onkillboom = false;
    assert.equal(p.stats.damage, dmg0, 'no stat leaked into the window');
    assert.equal(1e9 - near.hp, want, 'the neighbour took exactly one detonation');
    assert.equal(far.hp, 1e9, 'an enemy outside the radius is untouched');
    assert.ok(st.effects.some(fx => fx.kind === 'rewrite_boom'),
      'the blast painted its effect ring');
    assert.equal(st.effects.filter(fx => fx.kind === 'rewrite_boom').length, 1,
      'exactly ONE detonation fired');
    assert.equal(st.enemies.includes(dead), false, 'the corpse left the field exactly once');
  } finally { restore(); }
});
ok('a CHAIN REACTION detonation can never damage the player', () => {
  p.rewrites.onkillboom = true;
  p.invuln = 999;
  p.hp = p.stats.maxHp;
  const dead = corpse(p, { x: 10, y: 0 });   // non-elite: no chest roll
  st.enemies.push(dead);
  h.pump(2, quiet);
  p.rewrites.onkillboom = false;
  assert.equal(p.hp, p.stats.maxHp, 'the boom is enemy-side friendly fire only');
});
ok('NO toast per kill (the feed is for rare moments)', () => {
  const restore = closeWindow();
  try {
    p.rewrites.onkillboom = true;
    const before = (st.toasts || []).length;
    for (let k = 0; k < 3; k++) st.enemies.push(corpse(p, { x: 30 + k * 5, y: 30 }));
    h.pump(2, quiet);
    p.rewrites.onkillboom = false;
    assert.equal((st.toasts || []).length, before, 'kills stay silent');
  } finally { restore(); }
});
ok('BLOOD HARVEST retaliates through the REAL drop-collect path (damage exact)', () => {
  const restore = closeWindow();
  try {
    p.rewrites.healthdamage = true;
    p.invuln = 999;
    p.potions = { hp: 0, mp: 0 };
    const dmg0 = p.stats.damage;   // pinned: the blast prices off THIS value
    const want = HARVEST_DAMAGE_FLAT + HARVEST_DAMAGE_FRAC * dmg0;
    const near = hostile('BRUTE', p, { x: 30, y: 0 });             // dist 30 <= 55
    const far = hostile('BRUTE', p, { x: 300, y: 0 });             // dist 300 > 55
    st.enemies.push(near, far);
    st.projectiles.length = 0;
    const potion = { x: p.x, y: p.y, kind: 'hp' };
    st.drops.push(potion);
    // the field IS the probe: exactly the two bodies and the one pushed potion
    assert.deepEqual(st.enemies, [near, far], 'the field holds exactly the probe bodies');
    assert.deepEqual(st.drops, [potion], 'the ground holds exactly the pushed hp potion');
    h.pump(3, () => { st.projectiles.length = 0; st.enemyShots.length = 0; });
    p.rewrites.healthdamage = false;
    assert.equal(p.stats.damage, dmg0, 'no stat leaked into the window');
    assert.equal(p.potions.hp, 1, 'exactly ONE potion was collected');
    assert.equal(1e9 - near.hp, want, 'the neighbour took exactly one blast');
    assert.equal(far.hp, 1e9, 'an enemy outside the radius is untouched');
    assert.equal(st.effects.filter(fx => fx.kind === 'rewrite_harvest').length, 1,
      'exactly ONE blast fired');
  } finally { restore(); }
});
ok('BLOOD HARVEST is hp-kind only: a mana pickup never blasts', () => {
  const restore = closeWindow();
  try {
    p.rewrites.healthdamage = true;
    p.invuln = 999;
    p.potions = { hp: 0, mp: 0 };
    const near = hostile('BRUTE', p, { x: 30, y: 0 });
    st.enemies.push(near);
    st.projectiles.length = 0;
    const potion = { x: p.x, y: p.y, kind: 'mp' };
    st.drops.push(potion);
    assert.deepEqual(st.drops, [potion], 'the ground holds exactly the pushed mana potion');
    h.pump(3, () => { st.projectiles.length = 0; st.enemyShots.length = 0; });
    p.rewrites.healthdamage = false;
    assert.equal(p.potions.mp, 1, 'exactly one mana potion was collected');
    assert.equal(near.hp, 1e9, 'no blast on a mana pickup');
  } finally { restore(); }
});
ok('the rewrite payouts are dt-correct: 60Hz == 120Hz over the same second', () => {
  // Booms and blasts are per-EVENT, not per-second - so the total damage over
  // a fixed simulated time must not depend on the frame rate. One corpse dies
  // and one potion is collected per pass, at both refresh rates.
  // TICK-11 hermeticity: the run loop's own event sources are closed for the
  // window (closeWindow) and every input is PINNED, so the two leak modes the
  // pilot logged (a chest-opened Whetstone repricing boom vs blast at 8/10,
  // and a second live-run potion firing an extra blast) can no longer SKEW a
  // number - if anything leaks anyway, the positive counts below fail loudly.
  const dmg0 = p.stats.damage;   // PIN: both passes price off this value
  const totalBoom = (hz) => {
    const restore = closeWindow();
    let booms = 0, blasts = 0;
    try {
      p.rewrites.onkillboom = true;
      p.rewrites.healthdamage = true;
      p.invuln = 999;
      p.potions = { hp: 0, mp: 0 };
      const near = hostile('BRUTE', p, { x: 25, y: 0 });
      const dead = corpse(p);   // dies frame 1, booms near; non-elite: no chest roll
      st.enemies.push(near, dead);
      const potion = { x: p.x, y: p.y, kind: 'hp' };
      st.drops.push(potion);
      // the field IS the probe: nothing the flash drop OR any other system
      // can add or reap, at either refresh rate.
      assert.deepEqual(st.enemies, [near, dead], 'the field holds exactly the probe bodies');
      assert.deepEqual(st.drops, [potion], 'the ground holds exactly the pushed hp potion');
      assert.deepEqual(flashTargets(st.enemies), [], 'no flash-reapable body in the window');
      const seen = new Set();   // distinct fx objects (per-frame scans would double-count)
      h.setFrameMs(1000 / hz);
      h.pump(hz, () => {
        st.projectiles.length = 0; st.enemyShots.length = 0;
        for (const fx of st.effects) if (!seen.has(fx)) { seen.add(fx);
          if (fx.kind === 'rewrite_boom') booms++;
          else if (fx.kind === 'rewrite_harvest') blasts++; }
      });
      // POSITIVE payout: exactly one boom, exactly one blast, one potion.
      assert.equal(booms, 1, 'exactly ONE boom detonated in the window');
      assert.equal(blasts, 1, 'exactly ONE harvest blast fired in the window');
      assert.equal(p.potions.hp, 1, 'exactly ONE potion was collected');
      assert.equal(p.stats.damage, dmg0, 'no chest/stat leak repriced the payouts');
      assert.equal(st.mode, 'playing', 'the run stayed live through the window');
      return 1e9 - near.hp;
    } finally {
      h.setFrameMs(1000 / 60);
      restore();
      p.rewrites.onkillboom = false;
      p.rewrites.healthdamage = false;
    }
  };
  const at60 = totalBoom(60), at120 = totalBoom(120);
  const want = (BOOM_DAMAGE_FLAT + BOOM_DAMAGE_FRAC * dmg0) +
    (HARVEST_DAMAGE_FLAT + HARVEST_DAMAGE_FRAC * dmg0);
  assert.equal(at60, at120, 'same total at both refresh rates');
  assert.equal(at60, want, 'and it is exactly one boom + one blast, no frame scaling');
});

// ---- 4. THE REAL DRAFT SEAM: src/main.js openDraft ----------------------------
function draftOffer(label, setup, draws = 3000) {
  st.weapons = ['VOLLEY', 'BOOMERANG'].map(makeWeapon);
  st.player.rules = {}; st.player.takenStats = {}; st.player.skills = {}; st.player.rewrites = {};
  setup(st);
  const real = Math.random;
  Math.random = seeded(4711);
  let hits = 0, cards = 0;
  try {
    for (let i = 0; i < draws; i++) {
      h.T.openDraft();
      const els = Array.from(h.elements['ov-cards'].children);
      cards += els.length;
      if (els.some(el => (el.innerHTML || '').includes(label))) hits++;
    }
  } finally {
    Math.random = real;
    st.player.rules = {}; st.player.takenStats = {}; st.player.skills = {}; st.player.rewrites = {};
  }
  assert.equal(cards, draws * 3, 'every openDraft() rendered exactly 3 cards');
  return hits / draws;
}
const pierceFree = draftOffer('Pierce All', () => {});
const pierceHeld = draftOffer('Pierce All', (s) => { s.player.rewrites.pierceall = true; });
const boomFree = draftOffer('Chain Reaction', () => {});
console.log('rewrites: the REAL game seam (src/main.js openDraft), measured');
console.log(`    Pierce All offered     not held ${pierceFree.toFixed(4)}   already held ${pierceHeld.toFixed(4)}`);
console.log(`    Chain Reaction offered not held ${boomFree.toFixed(4)}`);
ok('openDraft() offers a rewrite card until the run takes it', () => {
  assert.ok(pierceFree > 0, `a rewrite card reaches the real draft (${pierceFree.toFixed(4)})`);
  assert.equal(pierceHeld, 0, 'a held rewrite is never re-offered');
  assert.ok(boomFree > 0, `a second rewrite reaches it too (${boomFree.toFixed(4)})`);
});
ok('pick() grants the rewrite through the real draft contract, no stat-ledger pollution', () => {
  st.player.rewrites = {}; st.player.takenStats = {};
  const card = rewriteCards({ player: st.player })[0];
  const before = { ...st.player.takenStats };
  h.T.pickCard(card);
  assert.ok(st.player.rewrites[card.rewrite], card.rewrite + ' granted by the real pick()');
  assert.deepEqual(st.player.takenStats, before, 'a rewrite pick never writes the once ledger');
  assert.equal(rewriteCardOffered(card.rewrite, st), false, 'and it left the pool');
});

// ---- 5. THE ONCE RETUNE at the real seam --------------------------------------
ok('under ONE OF EACH an at-cap weapon level-up card STAYS offered (extended ladder)', () => {
  st.weapons = ['VOLLEY', 'BOOMERANG'].map(makeWeapon);
  for (const w of st.weapons) while ((w.level || 1) < WEAPON_MAX_LEVEL) levelUpWeapon(w);
  st.player.rules = { once: true }; st.player.takenStats = {}; st.player.skills = {};
  st.player.rewrites = {};
  const real = Math.random;
  Math.random = seeded(4711);
  let maxed = 0, draws = 3000, cards = 0;
  try {
    for (let i = 0; i < draws; i++) {
      h.T.openDraft();
      const els = Array.from(h.elements['ov-cards'].children);
      cards += els.length;
      if (els.some(el => (el.innerHTML || '').includes('MAXED'))) maxed++;
    }
  } finally { Math.random = real; st.player.rules = {}; }
  assert.equal(cards, draws * 3, 'every openDraft() rendered exactly 3 cards');
  assert.ok(maxed > 0, `the at-cap card reaches the pool under once (${(maxed / draws).toFixed(4)}/offer)`);
  // and WITHOUT the rule the shipped gate holds: no at-cap card is offered.
  let bare = 0;
  Math.random = seeded(4711);
  try {
    for (let i = 0; i < draws; i++) {
      h.T.openDraft();
      const els = Array.from(h.elements['ov-cards'].children);
      if (els.some(el => (el.innerHTML || '').includes('MAXED'))) bare++;
    }
  } finally { Math.random = real; }
  assert.equal(bare, 0, 'without once, an at-cap weapon is never offered');
});
ok('pick() converts an at-cap level-up under once to exactly +10% weapon damage', () => {
  st.player.rules = { once: true };
  const w = st.weapons[0];
  while ((w.level || 1) < WEAPON_MAX_LEVEL) levelUpWeapon(w);
  const before = p.stats.damage;
  h.T.pickCard({ id: 'lvl_' + w.type + '_' + WEAPON_MAX_LEVEL,
    name: 'X UP', desc: 'x', apply: () => { levelUpWeapon(w); } });
  st.player.rules = {};
  assert.ok(Math.abs(p.stats.damage / before - 1.10) < 1e-9, 'exactly the +10% conversion');
  assert.equal((w.level || 1), WEAPON_MAX_LEVEL, 'and the weapon itself did not overflow');
});
ok('pick() grants +1 BONUS level on a below-cap level-up under once', () => {
  st.player.rules = { once: true };
  st.weapons = ['VOLLEY', 'BOOMERANG'].map(makeWeapon);
  const w = st.weapons[0];
  const lvBefore = w.level || 1;
  h.T.pickCard({ id: 'lvl_' + w.type + '_' + lvBefore,
    name: 'X UP', desc: 'x', apply: () => { levelUpWeapon(w); } });
  st.player.rules = {};
  assert.equal((w.level || 1), lvBefore + 2, 'the card\'s level + the bonus level');
});

// ---- 6. the sim invariants (30 runs/cell, seed 4242 — test_draft_luck cadence) --
console.log('rewrites: sim invariants (30 runs/cell, seed 4242, families ON, luck 0)');
const RUNS = 30, SEED = 4242;
const good = simulateCohort(SEED, RUNS, 'GREED_DAMAGE', {});
const bad = simulateCohort(SEED, RUNS, 'ADVERSARIAL_BAD', {});
const mean = a => a.reduce((s, r) => s + r.survivalTime, 0) / a.length;
const v = divergenceVerdict(good, bad);
ok('a deliberately bad draft still fails 100% of its runs', () => {
  assert.ok(bad.every(r => r.dead), 'every bad run died before the limit');
});
ok('a good draft beats bad on >= 3 of 5 minute-10 metrics', () => {
  assert.ok(v.winCount >= 3, `metric wins ${v.winCount}/5`);
});
ok('one bad pick never loses a run: every rewrite AND the retuned once >= 0.8x', () => {
  const base = mean(good);
  for (const id of [...REWRITE_IDS, 'once']) {
    const held = simulateCohort(SEED, RUNS, 'GREED_DAMAGE', { startCards: [id] });
    const ratio = mean(held) / base;
    console.log(`    ${id.padEnd(13)} held from t=0: ${ratio.toFixed(2)}x baseline`);
    assert.ok(ratio >= 0.8, `${id} at ${ratio.toFixed(2)}x < the 0.8x bar`);
  }
});

console.log(`rewrites: PASS=${pass} FAIL=${fail}`);
process.exit(fail === 0 ? 0 : 1);
