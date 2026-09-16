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
  REWRITES, REWRITE_IDS, REWRITE_CARD_WEIGHT, REWRITE_COMBO_WEIGHT_MULT, REWRITE_TAGS,
  isComboRewrite,
  BOOM_RADIUS, BOOM_DAMAGE_FLAT, BOOM_DAMAGE_FRAC,
  HARVEST_RADIUS, HARVEST_DAMAGE_FLAT, HARVEST_DAMAGE_FRAC,
  RIME_SLOW_DURATION, RIME_SLOW_FACTOR,
  IGNITE_BURN_DURATION, IGNITE_BURN_FLAT, IGNITE_BURN_FRAC,
  LIVEWIRE_EVERY, LIVEWIRE_RANGE, LIVEWIRE_DAMAGE_MULT,
  AFTERSHOCK_DELAY, AFTERSHOCK_RADIUS_MULT, AFTERSHOCK_DAMAGE_MULT,
  WIDEORBIT_RADIUS_MULT, WIDEORBIT_SPIN_MULT,
  GLACIER_DAMAGE_MULT, WILDFIRE_RANGE, OVERLOAD_EVERY, OVERLOAD_RANGE,
  OVERLOAD_TARGETS, OVERLOAD_DAMAGE_MULT, THERMALSHOCK_BURST_MULT,
  STORMREAPER_BLAST_MULT, GLACIALORBIT_CHILL_DURATION, GLACIALORBIT_DAMAGE_MULT,
  rewritesOf, hasRewrite, rewriteCardOffered, rewriteCards, grantRewrite,
  rewriteBoom, harvestBlast, applyBlast, tickRewriteEchoes,
  rewriteCount, emptySlotCooldownMult, onWeaponHit,
  wideOrbitRadiusMult, wideOrbitSpinMult,
  directHitMult, wildfireTransfer, stormReaperBlast,
} from '../src/rewrites.js';
import { skillCooldown } from '../src/perks.js';
import { ultCharge } from '../src/skills.js';
import { updateWeapons } from '../src/weapons.js';
import { isFlashEligibleKill, flashTargets, FLASH_TRASH_TIERS } from '../src/loot.js';
import { buildExport } from '../src/save.js';
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
ok('the catalog is the fourteen rewrites with unique ids and player-facing labels', () => {
  // G21 SLICE 2 RETARGET: the family grew 8 -> 14 (D1's three second-tag cards
  // + D2's three cross-tag combos). The assertion is still an exact id list.
  assert.deepEqual(REWRITE_IDS, ['pierceall', 'onkillboom', 'healthdamage',
    'rime', 'ignite', 'livewire', 'aftershock', 'wideorbit',
    'glacier', 'wildfire', 'overload',
    'thermalshock', 'stormreaper', 'glacialorbit']);
  assert.equal(new Set(REWRITE_IDS).size, 14);
  for (const id of REWRITE_IDS) {
    assert.ok(REWRITES[id].name, id + ' has a name');
    assert.ok(!/rewrite/i.test(REWRITES[id].desc),
      id + ' desc is player-facing copy, never the internal family label');
    assert.ok(REWRITES[id].desc.length > 20, id + ' desc is real prose, not a placeholder');
  }
});
ok('R3: every card carries tags from REWRITE_TAGS; tagged descs are prefixed at the seam', () => {
  assert.deepEqual(REWRITE_TAGS, ['FROST', 'CHAIN', 'ORBIT', 'BURN', 'CONDUCT']);
  const tagSet = new Set(REWRITE_TAGS);
  for (const id of REWRITE_IDS) {
    assert.ok(Array.isArray(REWRITES[id].tags), id + ' carries a tags array');
    for (const t of REWRITES[id].tags) assert.ok(tagSet.has(t), id + ' tag ' + t + ' is reserved-set');
  }
  // The existing three: onkillboom is CHAIN; pierceall/healthdamage stay
  // untagged (they predate the taxonomy — do NOT force-tag them).
  assert.deepEqual(REWRITES.onkillboom.tags, ['CHAIN']);
  assert.deepEqual(REWRITES.pierceall.tags, []);
  assert.deepEqual(REWRITES.healthdamage.tags, []);
  // The slice-1 cards: exactly one tag each (cross-tag combos are slice 2).
  for (const id of ['rime', 'ignite', 'livewire', 'aftershock', 'wideorbit']) {
    assert.equal(REWRITES[id].tags.length, 1, id + ' carries exactly one tag this slice');
  }
  // The offered desc of a tagged card starts with its tag; an untagged card's
  // desc is byte-identical to the raw catalog string (today's copy).
  const st = stateWith(null);
  st.weapons = [makeWeapon('ORBIT')];                 // every predicate true:
  grantRewrite(st, 'onkillboom');                     // ...aftershock has a source,
  st.player.rewrites = {};                            // ...but nothing is TAKEN
  for (const c of rewriteCards(st)) {
    const r = REWRITES[c.rewrite];
    if (r.tags.length) assert.ok(c.desc.startsWith(r.tags.join('+') + ' - '),
      c.rewrite + ' desc is tag-prefixed: ' + c.desc);
    else assert.equal(c.desc, r.desc, c.rewrite + ' untagged desc is byte-identical');
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
ok('cards exist once, at their family weight, and grant through apply(player)', () => {
  const st = stateWith(null);
  assert.equal(Object.keys(st.player.rewrites).length, 0, 'a fresh player holds nothing');
  const cards = rewriteCards(st);
  // G21 SLICE 2 RETARGET: on a bare state FIVE cards are absent — the two
  // slice-1 predicates (no blast source, no ORBIT equipped) plus all THREE
  // combos (neither constituent owned). The offered set is the NINE
  // always-offered cards, asserted as an exact list.
  const BARE_OFFERED = ['pierceall', 'onkillboom', 'healthdamage', 'rime',
    'ignite', 'livewire', 'glacier', 'wildfire', 'overload'];
  assert.equal(cards.length, BARE_OFFERED.length);
  assert.deepEqual(cards.map(c => c.rewrite).sort(), [...BARE_OFFERED].sort());
  for (const c of cards) {
    // No combo can be offered on a bare state, so every card here is a single
    // (or legacy) card at the family base weight.
    assert.equal(isComboRewrite(c.rewrite), false);
    assert.equal(c.weight, REWRITE_CARD_WEIGHT);
    assert.ok(c.id.startsWith('rewrite_'));
    const p = makePlayer();
    c.apply(p);
    assert.ok(p.rewrites[c.rewrite], c.rewrite + ' is granted by its own card');
  }
  grantRewrite(st, 'onkillboom');
  // G21 SLICE 2 RETARGET: taking onkillboom removes one card but WAKES the
  // aftershock predicate, and still no combo is live (no constituent pair is
  // owned) — so the offered set is the other eight of the nine.
  assert.deepEqual(rewriteCards(st).map(c => c.rewrite).sort(),
    ['aftershock', 'glacier', 'healthdamage', 'ignite', 'livewire',
      'overload', 'pierceall', 'rime', 'wildfire'], 'a taken rewrite leaves the pool');
  assert.equal(rewriteCardOffered('onkillboom', st), false);
  assert.equal(grantRewrite(st, 'not_a_rewrite'), false, 'an unknown rewrite id is refused');
  assert.ok(hasRewrite(st, 'onkillboom') && !hasRewrite(st, 'pierceall'));
  assert.equal(rewritesOf({}), null, 'a stateless read is null, not a throw');
});

// ---- 1b. G21 slice 1: FINITE SLOTS (R1), EMPTY-SLOT PAY (R2), PREDICATES (R6)
ok('R1: a full run (REWRITE_SLOTS held) is offered ZERO rewrite cards; one short offers the rest', () => {
  const st = stateWith(null);
  st.weapons = [makeWeapon('ORBIT')];   // both predicates satisfiable
  assert.equal(C.REWRITE_SLOTS, 4, 'the house ships four finite rewrite slots');
  for (const id of ['pierceall', 'onkillboom', 'healthdamage', 'rime']) grantRewrite(st, id);
  assert.equal(rewriteCount(st), 4);
  assert.deepEqual(rewriteCards(st), [], 'a full house closes the family');
  // One slot short: exactly the untaken, predicate-passing set (aftershock's
  // predicate is now TRUE — onkillboom is held — so all five slice-1 cards
  // land, joined by slice 2's three always-offered second-tag cards). NO combo
  // is offered: no constituent PAIR is owned yet.
  const st2 = stateWith(null);
  st2.weapons = [makeWeapon('ORBIT')];
  for (const id of ['pierceall', 'onkillboom', 'healthdamage']) grantRewrite(st2, id);
  const offered = rewriteCards(st2).map(c => c.rewrite).sort();
  // G21 SLICE 2 RETARGET: the explicit eight-card set (was five).
  assert.deepEqual(offered, ['aftershock', 'glacier', 'ignite', 'livewire',
    'overload', 'rime', 'wideorbit', 'wildfire'],
    'REWRITE_SLOTS-1 held offers exactly the untaken predicate-passing set');
  // ...and with a CONSTITUENT PAIR owned, the matching combos wake while the
  // other single stays: rime + ignite + wideorbit still leaves a free slot.
  const st3 = stateWith(null);
  st3.weapons = [makeWeapon('ORBIT')];
  for (const id of ['rime', 'ignite', 'wideorbit']) grantRewrite(st3, id);
  assert.deepEqual(rewriteCards(st3).map(c => c.rewrite).sort(),
    ['glacialorbit', 'glacier', 'healthdamage', 'livewire', 'onkillboom',
      'overload', 'pierceall', 'thermalshock', 'wildfire'],
    'the two woken combos join the untaken singles (aftershock still has no blast source, stormreaper still needs LIVE WIRE)');
  grantRewrite(st2, 'ignite');          // taking one more closes the family
  assert.deepEqual(rewriteCards(st2), [], 'the fourth take closes the family');
  grantRewrite(st3, 'overload');        // the same on the combo-bearing state
  assert.deepEqual(rewriteCards(st3), [], 'and the fourth take closes it there too');
});
ok('R2: empty slots pay x0.80..x1.00 through skillCooldown; the ult KILL count never moves', () => {
  const st = stateWith(null);
  const want = [0.80, 0.85, 0.90, 0.95, 1.00];
  const ids = ['pierceall', 'onkillboom', 'healthdamage', 'rime'];
  for (let taken = 0; taken <= 4; taken++) {
    assert.ok(Math.abs(emptySlotCooldownMult(st) - want[taken]) < 1e-9,
      `x${want[taken]} at ${taken} taken (got ${emptySlotCooldownMult(st)})`);
    if (taken < 4) grantRewrite(st, ids[taken]);
  }
  // The floor: even if REWRITE_SLOTS were raised the mult never dips below 0.80.
  const saved = C.REWRITE_SLOTS;
  C.REWRITE_SLOTS = 9;
  const bare = stateWith(null);
  assert.equal(emptySlotCooldownMult(bare), 0.80, 'x0.80 floor at a raised slot count');
  C.REWRITE_SLOTS = saved;
  // skillCooldown REFLECTS the payment (the one applied-value read)...
  const cd0 = skillCooldown('FROST_NOVA', stateWith(null));
  assert.ok(Math.abs(cd0 - C.SKILLS.FROST_NOVA.COOLDOWN * 0.80) < 1e-9,
    'zero rewrites: cooldown at x0.80');
  const full = stateWith(null);
  for (const id of ids) grantRewrite(full, id);
  assert.equal(skillCooldown('FROST_NOVA', full), C.SKILLS.FROST_NOVA.COOLDOWN,
    'a full house: cooldown back at x1.00');
  // ...and it multiplies the cooldown part ONLY: a kill-charged ult's KILL
  // count is identical with zero and with four rewrites held, while its
  // cooldown floor still reads through the mult.
  const q0 = ultCharge(stateWith(null), 'EARTHSHATTER');
  const q4 = ultCharge(full, 'EARTHSHATTER');
  assert.equal(q0.charge, q4.charge, 'the ult charge is a KILL count, never a cooldown');
  assert.equal(q0.need, q4.need);
  assert.ok(Math.abs(skillCooldown('EARTHSHATTER', stateWith(null)) -
    C.SKILLS.EARTHSHATTER.COOLDOWN * 0.80) < 1e-9, 'the ult floor rolls on after the mult');
});
ok('R6: the predicate cards hide while dead, appear when live, and consume ZERO rng draws', () => {
  const st = stateWith(null);
  const ids = () => rewriteCards(st).map(c => c.rewrite);
  assert.ok(!ids().includes('aftershock'), 'no blast source: AFTERSHOCK is never offered');
  assert.ok(!ids().includes('wideorbit'), 'no ORBIT equipped: WIDE ORBIT is never offered');
  grantRewrite(st, 'onkillboom');
  assert.ok(ids().includes('aftershock'), 'onkillboom held: AFTERSHOCK is offered');
  const stWitch = stateWith(null);
  stWitch.character = { skill: 'CHAIN_REACTION' };
  assert.ok(rewriteCards(stWitch).some(c => c.rewrite === 'aftershock'),
    'the Witch chain Q is a blast source');
  const stRogue = stateWith(null);
  stRogue.character = { skill: 'AFTERIMAGE' };
  assert.ok(rewriteCards(stRogue).some(c => c.rewrite === 'aftershock'),
    'the Rogue AFTERIMAGE is a blast source');
  const stOrb = stateWith(null);
  stOrb.weapons = [makeWeapon('ORBIT')];
  assert.ok(rewriteCards(stOrb).some(c => c.rewrite === 'wideorbit'),
    'an equipped ORBIT offers WIDE ORBIT');
  // A predicate-false card consumes no rng: rewriteCards never draws at all.
  const real = Math.random;
  let draws = 0;
  Math.random = () => { draws++; return real(); };
  try { rewriteCards(stateWith(null)); rewriteCards(stOrb); } finally { Math.random = real; }
  assert.equal(draws, 0, 'rewriteCards consumes zero rng draws, predicates included');
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
  speed: 0, age: 0, flash: 0, slow: 0, xp: 0, burn: 0, burnDps: 0,
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
    shrines: st.shrines,               // S1: the world-seeded set rides too
    arches: st.arches, archBuffs: st.archBuffs,
                                  // SUITE_HARDENING Part 2 — THE ARCH LEAK, the
                                  // last unpinned random source inside the
                                  // window. startRun() rolls 1-2 arch gates at
                                  // UNSEEDED random positions 120-380px out
                                  // (src/main.js spawnWaveArches) and they sit
                                  // on the field for the whole run; the AUTO
                                  // pilot keeps moving the player every frame
                                  // (runController), so it can cross a gate's
                                  // 26px trigger radius MID-PROBE. Two recorded
                                  // intermittents both route through here:
                                  // (a) `NO toast per kill` (:484) — an arch
                                  //     grant/refresh is one of the ~3-line
                                  // toast feed's legitimate pushes
                                  //     (`TWIN FURY ARCH! 60s`, main.js:1676);
                                  // (b) the GLACIER/other exact-value arms —
                                  //     a BERSERK gate scales every weapon hit
                                  //     x1.5 through weapons.js dmgScale()
                                  //     (activeArchMods), repricing the ratio.
                                  // Measured: 1 in 12 boots acquired an arch
                                  // buff inside the probe spans, near-misses
                                  // (<=51px) in 4 more (/tmp probe, tick
                                  // 2026-09-16). Closing the arch system's OWN
                                  // state contract (arches.js: state.arches /
                                  // state.archBuffs) is the same pin class as
                                  // the shrine/chest clears above: the probes
                                  // never deliberately place a gate, and the
                                  // code under measurement (kill funnel, toast
                                  // feed, contact damage) runs unstubbed —
                                  // test_arches.mjs still tests the arch system
                                  // itself at its real seams.
    attackTimer: p.attackTimer, skillCd: { ...p.skillCd } };
  st.spawnTimer = st.time + 1e9;   // no ambient packs
  st.wave.endsAt = st.time + 1e9;  // no wave boss
  st.wave.midAt = st.time + 1e9;   // no herald
  p.stats.dropBonus = -1;          // no drop rolls inside the window
  st.weapons = [];                 // no weapon damage into the field
  st.arches = [];                  // no arch triggers inside the window (above)
  st.archBuffs = [];               // ...and no active arch mods price a hit
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
  st.shrine = null;                // no altar purchase: the world-seeded
  st.shrines = [];                 // shrines are STATIC now (S1 killed the
  //                                drift) but STILL buy an intermission-style
  //                                blessing on proximity (applyChoice — a
  //                                Whetstone repricing the payouts or a potion
  //                                refill; this was the leak the chest theory
  //                                missed: the shrine, not st.chests)
  p.attackTimer = 1e9;             // and the BASE VOLLEY still fires with
  //                                st.weapons empty: runController (src/main.js)
  //                                fires it straight off p.attackTimer +
  //                                decision.target, reading the VOLLEY instance
  //                                only for level params — undefined means Lv1,
  //                                and a Lv1 shot into `near` on the firing line
  //                                is +2 the probe never priced
  return () => { st.spawnTimer = save.spawnTimer; st.wave.endsAt = save.endsAt;
    st.wave.midAt = save.midAt; p.stats.dropBonus = save.dropBonus; st.weapons = save.weapons;
    st.shrine = save.shrine; st.shrines = save.shrines; st.arches = save.arches;
    st.archBuffs = save.archBuffs; p.attackTimer = save.attackTimer;
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

// ---- 3b. G21 slice 1: THE FIVE CARDS, BOTH SIDES (R4) + NO CHAIN-OF-CHAINS (R5)
ok('R4 RIME: a direct hit chills (refresh, never stack, never truncates); nothing without the card', () => {
  const st = stateWith(null);
  const e = { hp: 100, slow: 0, flash: 0 };
  onWeaponHit(st, e);
  assert.equal(e.slow, 0, 'no card: no chill');
  grantRewrite(st, 'rime');
  onWeaponHit(st, e);
  assert.equal(e.slow, RIME_SLOW_DURATION, 'the hit refreshed the existing slow field');
  assert.equal(e.slowMult, RIME_SLOW_FACTOR, 'the chill carries its own gentler grip');
  e.slow = 0.4; onWeaponHit(st, e);
  assert.equal(e.slow, RIME_SLOW_DURATION, 'a shorter remainder refreshes UP to full');
  e.slow = 2.5; onWeaponHit(st, e);   // a FROST_NOVA window is already gripping
  assert.equal(e.slow, 2.5, 'the chill never TRUNCATES a longer nova slow');
  assert.equal(e.slowMult, RIME_SLOW_FACTOR, 'the freshest grip owns the factor');
});
ok('R4 IGNITE: a direct hit burns at the snapshotted dps (refresh, never stack)', () => {
  const st = stateWith(null);
  const e = { hp: 1e9, burn: 0, burnDps: 0, flash: 0 };
  onWeaponHit(st, e);
  assert.equal(e.burn, 0, 'no card: no burn');
  grantRewrite(st, 'ignite');
  st.player.stats.damage = 40;
  onWeaponHit(st, e);
  assert.equal(e.burn, IGNITE_BURN_DURATION);
  assert.equal(e.burnDps, IGNITE_BURN_FLAT + IGNITE_BURN_FRAC * 40, 'dps snapshots the weapon damage');
  e.burn = 1.1; st.player.stats.damage = 80;
  onWeaponHit(st, e);
  assert.equal(e.burn, IGNITE_BURN_DURATION, 'refresh, never stack');
  assert.equal(e.burnDps, IGNITE_BURN_FLAT + IGNITE_BURN_FRAC * 80, 'the refresh re-snapshots');
});
ok('R4 LIVE WIRE: fires on the 5th hit, not the 4th, never twice in a row', () => {
  const st = stateWith(null);
  grantRewrite(st, 'livewire');
  st.player.stats.damage = 50;
  const struck = { x: 0, y: 0, hp: 1e9, flash: 0 };
  const near = { x: 50, y: 0, hp: 1e9, flash: 0 };    // dist 50 <= RANGE
  const far = { x: 500, y: 0, hp: 1e9, flash: 0 };
  st.enemies.push(struck, near, far);
  const zaps = () => st.effects.filter(fx => fx.kind === 'zap').length;
  for (let i = 0; i < 4; i++) onWeaponHit(st, struck);
  assert.equal(st.player.livewireHits, 4, 'the counter is a run-player integer');
  assert.equal(near.hp, 1e9, 'the 4th hit does NOT fire');
  onWeaponHit(st, struck);                            // the 5th
  assert.equal(1e9 - near.hp, LIVEWIRE_DAMAGE_MULT * 50, 'the 5th hit zaps at 50% weapon damage');
  assert.equal(far.hp, 1e9, 'an enemy outside the range is untouched');
  assert.equal(zaps(), 1, 'the zap painted its polyline');
  onWeaponHit(st, struck);                            // the 6th
  assert.equal(1e9 - near.hp, LIVEWIRE_DAMAGE_MULT * 50, 'never twice in a row');
  assert.equal(zaps(), 1);
});
ok('R4 AFTERSHOCK: one echo, 0.4s later, half radius and half damage — and it never echoes', () => {
  const st = stateWith(null);
  grantRewrite(st, 'aftershock');
  const near = { x: 0, y: 0, hp: 1e9, flash: 0 };
  st.enemies.push(near);
  applyBlast(st, 0, 0, { radius: 40, damage: 20 });
  assert.equal(st.rewriteEchoes.length, 1, 'the detonation scheduled ONE echo');
  assert.equal(st.rewriteEchoes[0].radius, 40 * AFTERSHOCK_RADIUS_MULT);
  assert.equal(st.rewriteEchoes[0].damage, 20 * AFTERSHOCK_DAMAGE_MULT);
  assert.equal(1e9 - near.hp, 20, 'the detonation itself landed at full strength');
  const fx0 = st.effects.filter(fx => fx.kind === 'rewrite_boom').length;
  // dt-driven: 0.4s is 24 frames at 60Hz, 48 at 120Hz — same wall time.
  for (const hz of [60, 120]) {
    const st2 = stateWith(null);
    grantRewrite(st2, 'aftershock');
    const v = { x: 0, y: 0, hp: 1e9, flash: 0 };
    st2.enemies.push(v);
    applyBlast(st2, 0, 0, { radius: 40, damage: 20 });
    const hpAfterBlast = v.hp;
    const dt = 1 / hz;
    let firedAt = -1, frames = Math.round(AFTERSHOCK_DELAY * hz) + 3;
    for (let i = 1; i <= frames; i++) {
      tickRewriteEchoes(st2, dt);
      if (firedAt < 0 && v.hp < hpAfterBlast) firedAt = i;
    }
    assert.equal(firedAt, Math.round(AFTERSHOCK_DELAY * hz),
      `the echo fired at the 0.4s frame at ${hz}Hz (+/- nothing)`);
    assert.equal(hpAfterBlast - v.hp, 20 * AFTERSHOCK_DAMAGE_MULT, 'half damage');
    assert.equal(st2.rewriteEchoes.length, 0, 'the echo never re-schedules');
    assert.equal(st2.effects.filter(fx => fx.kind === 'rewrite_boom').length, 2,
      'exactly two blasts painted: the detonation + its one echo');
  }
  assert.ok(fx0 >= 1);
});
ok('R4 WIDE ORBIT: measurably widens the ring and raises the spin (the updateOrbit reads)', () => {
  const mk = (held) => {
    const st = stateWith(null);
    if (held) grantRewrite(st, 'wideorbit');
    const w = makeWeapon('ORBIT');
    st.weapons = [w];
    return { st, w };
  };
  const base = mk(false), wide = mk(true);
  assert.equal(wideOrbitRadiusMult(base.st), 1, 'no card: x1 radius');
  assert.equal(wideOrbitSpinMult(base.st), 1, 'no card: x1 spin');
  updateWeapons(base.st, base.st.weapons, 0.25);
  updateWeapons(wide.st, wide.st.weapons, 0.25);
  const r0 = Math.hypot(base.w.payload.blades[0].x - base.st.player.x,
    base.w.payload.blades[0].y - base.st.player.y);
  const r1 = Math.hypot(wide.w.payload.blades[0].x - wide.st.player.x,
    wide.w.payload.blades[0].y - wide.st.player.y);
  assert.ok(Math.abs(r1 / r0 - WIDEORBIT_RADIUS_MULT) < 1e-9,
    `the ring widened x${(r1 / r0).toFixed(3)}`);
  assert.ok(Math.abs(wide.w.angle / base.w.angle - WIDEORBIT_SPIN_MULT) < 1e-9,
    `the spin raised x${(wide.w.angle / base.w.angle).toFixed(3)}`);
});
ok('R4 wiring: the volley projectile and the ORBIT blade both fire the rider (live seams)', () => {
  const restore = closeWindow();
  try {
    p.rewrites.rime = true;
    // (a) weapons.js hurt(): an ORBIT blade's contact hit chills its victim.
    const orb = makeWeapon('ORBIT');
    st.weapons = [orb];
    const near = hostile('BRUTE', p, { x: 45, y: 0 });
    st.enemies.push(near);
    h.pump(90, () => { st.projectiles.length = 0; st.enemyShots.length = 0; });
    st.weapons = [];
    assert.ok(near.slow > 0 && near.slowMult === RIME_SLOW_FACTOR,
      'an orbit contact chilled through hurt() (weapons.js seam)');
    // (b) main.js: the volley projectile (the A1 fixture shape: re-anchor the
    // target inside the pilot's engagement radius every frame so it fires).
    const far = hostile('BRUTE', p, { x: 60, y: 0 });
    st.enemies.push(far);
    p.attackTimer = 0;
    const gap = Math.round(C.AUTOPILOT.FOCUS_RANGE / 2);
    h.pump(150, () => {
      st.enemyShots.length = 0;
      far.x = p.x + gap; far.y = p.y;
    });
    p.rewrites.rime = false;
    assert.ok(far.slow > 0 && far.slowMult === RIME_SLOW_FACTOR,
      'the volley projectile chilled through the main.js rider site');
  } finally { restore(); }
});
ok('R4 IGNITE live: the burn pays the same total at 60Hz and 120Hz (dt-driven)', () => {
  const totalBurn = (hz) => {
    const restore = closeWindow();
    try {
      p.rewrites.ignite = true;
      p.invuln = 999;
      const victim = hostile('BRUTE', p, { x: 400, y: 400 });   // far: no weapon contact
      st.enemies.push(victim);
      onWeaponHit(st, victim);                                  // the direct-hit stamp
      const dps = victim.burnDps;
      h.setFrameMs(1000 / hz);
      h.pump(Math.round(IGNITE_BURN_DURATION * hz) + 2, () => {
        st.projectiles.length = 0; st.enemyShots.length = 0;
        victim.x = p.x + 400; victim.y = p.y + 400;   // pinned out of reach
      });
      h.setFrameMs(1000 / 60);
      p.rewrites.ignite = false;
      assert.ok(victim.burn <= 0, 'the burn ran its course');
      return { loss: 1e9 - victim.hp, dps };
    } finally { h.setFrameMs(1000 / 60); restore(); }
  };
  const a = totalBurn(60), b = totalBurn(120);
  assert.equal(a.dps, b.dps, 'same snapshotted dps');
  assert.ok(Math.abs(a.loss - b.loss) < 0.51,
    `60Hz ${a.loss.toFixed(2)} vs 120Hz ${b.loss.toFixed(2)} (sub-tick rounding only)`);
  assert.ok(Math.abs(a.loss - a.dps * IGNITE_BURN_DURATION) < 0.51,
    'and the total is dps x duration, never frame-scaled');
});
ok('R5: a burn tick has ZERO rider side-effects and a burn-lethal corpse never detonates', () => {
  const restore = closeWindow();
  try {
    p.rewrites.ignite = true;
    p.rewrites.livewire = true;
    p.rewrites.aftershock = true;
    p.rewrites.onkillboom = true;
    p.invuln = 999;
    p.livewireHits = 0;
    // A burn-lethal body (hp 1: one tick zeroes it) beside a healthy one that
    // must NOT catch chill/burn from anything but a direct hit.
    const dying = { ...hostile('BRUTE', p, { x: 400, y: 400 }), hp: 1, maxHp: 1 };
    const watching = hostile('BRUTE', p, { x: -400, y: -400 });
    st.enemies.push(dying, watching);
    onWeaponHit(st, dying);   // stamp the burn (the 1st livewire hit: no zap)
    assert.equal(st.player.livewireHits, 1);
    dying.hp = 1;             // the stamp's zap did not fire; the burn will kill
    h.pump(90, () => {
      st.projectiles.length = 0; st.enemyShots.length = 0;
      if (st.enemies.includes(dying)) { dying.x = p.x + 400; dying.y = p.y + 400; }
      watching.x = p.x - 400; watching.y = p.y - 400;
    });
    assert.equal(st.player.livewireHits, 1, 'burn ticks never advance the live wire counter');
    assert.equal(watching.slow, 0, 'no chill from a non-direct source');
    assert.equal(watching.burn, 0, 'no burn from a non-direct source');
    assert.equal(st.enemies.includes(dying), false, 'the burn-lethal body died');
    assert.equal(st.effects.filter(fx => fx.kind === 'rewrite_boom').length, 0,
      'onkillboom HELD, yet the burn-lethal corpse never detonated');
    assert.equal((st.rewriteEchoes || []).length, 0, 'and no echo was scheduled');
    p.rewrites.ignite = p.rewrites.livewire = p.rewrites.aftershock = p.rewrites.onkillboom = false;
  } finally { restore(); }
});

// ---- 3c. G21 slice 2: THE SIX NEW CARDS, BOTH SIDES (R1/R2) + NO CHAIN-OF-
// --------- CHAINS, EXTENDED (R3) + THE COMBO PREDICATES (R4) ----------------
console.log('G21 slice 2: the second-tag cards and the cross-tag combos');

// R1 GLACIER ------------------------------------------------------------------
ok('R1 GLACIER: +20% only against a SLOWED body, and only on a DIRECT hit', () => {
  const st = stateWith(null);
  const chilled = { hp: 1e9, slow: 0.5, flash: 0 };
  const clean = { hp: 1e9, slow: 0, flash: 0 };
  assert.equal(directHitMult(st, chilled), 1, 'no card: no bonus');
  assert.equal(GLACIER_DAMAGE_MULT, 1.20, 'the brief fixes the bonus at +20%');
  grantRewrite(st, 'glacier');
  assert.equal(directHitMult(st, chilled), GLACIER_DAMAGE_MULT, 'a chilled body takes +20%');
  assert.equal(directHitMult(st, clean), 1, 'an unchilled body takes none');
  assert.equal(directHitMult(st, { hp: 1 }), 1, 'a body with no slow field takes none');
  assert.equal(directHitMult(st, undefined), 1, 'a missing body never throws');
  assert.equal(directHitMult(stateWith(null), chilled), 1, 'a body-only field is not this card');
  // R3: it is a DIRECT-HIT read. applyBlast never routes through it, so a blast
  // that lands on a CHILLED body is priced flat.
  const near = { x: 0, y: 0, hp: 1e9, slow: 0.5, flash: 0 };
  st.enemies = [near];
  const before = near.hp;
  applyBlast(st, 0, 0, { radius: 40, damage: 20 });
  assert.equal(before - near.hp, 20,
    'a blast on a CHILLED body is NOT multiplied (GLACIER never reaches blasts)');
});

// R1 WILDFIRE -----------------------------------------------------------------
ok('R1 WILDFIRE: a burning death hands the FULL remaining burn to the nearest other body', () => {
  const st = stateWith(null);
  const burning = (at) => ({ x: at.x, y: at.y, hp: 0, burn: 2.4, burnDps: 7, flash: 0 });
  const target = (at) => ({ x: at.x, y: at.y, hp: 1e9, burn: 0, burnDps: 0, flash: 0, slow: 0 });
  const dead = burning({ x: 0, y: 0 });
  const near = target({ x: 50, y: 0 });
  const far = target({ x: 400, y: 0 });
  st.enemies = [dead, near, far];
  assert.equal(wildfireTransfer(st, dead), null, 'no card: no transfer');
  assert.equal(near.burn, 0, 'and the neighbour stays clean');
  grantRewrite(st, 'wildfire');
  assert.equal(WILDFIRE_RANGE, 100, 'the brief fixes the reach at 100px');
  assert.equal(wildfireTransfer(st, dead), near, 'the nearest OTHER body received it');
  assert.equal(near.burn, 2.4, 'the remaining duration transferred FULL');
  assert.equal(near.burnDps, 7, 'the remaining dps transferred FULL');
  assert.equal(far.burn, 0, 'a body outside WILDFIRE_RANGE is untouched');
  assert.equal(near.slow || 0, 0, 'the transfer is a burn, not a weapon hit: no chill');
  // a CLEAN death (nothing burning) spreads nothing
  const cleanDead = { x: 0, y: 0, hp: 0, burn: 0, burnDps: 0, flash: 0 };
  const watch = target({ x: 20, y: 0 });
  st.enemies = [cleanDead, watch];
  assert.equal(wildfireTransfer(st, cleanDead), null, 'a clean death spreads nothing');
  assert.equal(watch.burn, 0, 'and the neighbour stays clean');
  // the RANGE boundary: 100 lands, 101 does not
  const at = (d) => { const t = target({ x: d, y: 0 }); st.enemies = [burning({ x: 0, y: 0 }), t]; return t; };
  const t100 = at(WILDFIRE_RANGE);
  wildfireTransfer(st, st.enemies[0]);
  assert.equal(t100.burn, 2.4, 'at exactly WILDFIRE_RANGE the burn lands');
  const t101 = at(WILDFIRE_RANGE + 1);
  wildfireTransfer(st, st.enemies[0]);
  assert.equal(t101.burn, 0, 'one pixel past WILDFIRE_RANGE it does not');
  // one transfer per death: the SAME corpse handing over twice overwrites, never stacks
  const a = target({ x: 30, y: 0 });
  st.enemies = [burning({ x: 0, y: 0 }), a];
  wildfireTransfer(st, st.enemies[0]);
  const first = a.burnDps;
  wildfireTransfer(st, st.enemies[0]);
  assert.equal(a.burnDps, first, 'a second call overwrites with the same dps, never stacks');
});

// R1 OVERLOAD -----------------------------------------------------------------
ok('R1 OVERLOAD: fires on the 20th hit and not the 19th, at most 3 targets, moves no counter', () => {
  const st = stateWith(null);
  grantRewrite(st, 'overload');
  st.player.stats.damage = 40;
  assert.equal(OVERLOAD_EVERY, 20, 'the brief fixes the cadence at every 20th hit');
  assert.equal(OVERLOAD_DAMAGE_MULT, 0.75, 'and the payload at 75% weapon damage');
  const struck = { x: 0, y: 0, hp: 1e9, flash: 0, slow: 0, burn: 0 };
  const ring = [];
  for (let i = 0; i < 5; i++) ring.push({ x: 10 + i * 5, y: 0, hp: 1e9, flash: 0, slow: 0, burn: 0 });
  const out = { x: 500, y: 0, hp: 1e9, flash: 0, slow: 0, burn: 0 };
  st.enemies = [struck, ...ring, out];
  for (let i = 0; i < OVERLOAD_EVERY - 1; i++) onWeaponHit(st, struck);
  assert.equal(st.player.overloadHits, OVERLOAD_EVERY - 1, 'the counter is a run-player integer');
  assert.equal(ring.every(e => e.hp === 1e9), true, 'the 19th hit does NOT discharge');
  assert.equal(st.effects.filter(fx => fx.kind === 'zap').length, 0, 'and paints nothing');
  onWeaponHit(st, struck);                             // the 20th
  const payload = OVERLOAD_DAMAGE_MULT * 40;
  // The nova is centred on the struck body: the 3 NEAREST live enemies are the
  // struck one (d 0) and ring[0]/ring[1] (d 10/15).
  assert.equal(1e9 - struck.hp, payload, 'the struck body is the nearest target');
  assert.equal(1e9 - ring[0].hp, payload, 'ring[0] took the nova');
  assert.equal(1e9 - ring[1].hp, payload, 'ring[1] took the nova');
  assert.equal(ring[2].hp, 1e9, `only the ${OVERLOAD_TARGETS} nearest are hit`);
  assert.equal(ring[3].hp, 1e9, 'so ring[3] is untouched');
  assert.equal(out.hp, 1e9, 'a body outside OVERLOAD_RANGE is untouched');
  assert.equal(st.effects.filter(fx => fx.kind === 'zap').length, OVERLOAD_TARGETS,
    'one zap polyline per target');
  assert.equal(st.player.overloadHits, OVERLOAD_EVERY, 'the discharge itself advanced nothing');
  assert.equal(st.player.livewireHits, undefined, 'LIVE WIRE was not held; its counter never moved');
  assert.equal(ring[0].slow || 0, 0, 'no chill from the discharge (never a rider)');
  assert.equal(ring[0].burn || 0, 0, 'and no burn');
  onWeaponHit(st, struck);                             // the 21st
  assert.equal(1e9 - ring[1].hp, payload, 'never twice in a row');
  // a SEPARATE counter from LIVE WIRE's, and both may fire on the SAME hit
  const both = stateWith(null);
  grantRewrite(both, 'overload'); grantRewrite(both, 'livewire');
  both.player.stats.damage = 40;
  const struck2 = { x: 0, y: 0, hp: 1e9, flash: 0, slow: 0, burn: 0 };
  const other = { x: 20, y: 0, hp: 1e9, flash: 0, slow: 0, burn: 0 };
  both.enemies = [struck2, other];
  both.player.overloadHits = OVERLOAD_EVERY - 1;
  both.player.livewireHits = LIVEWIRE_EVERY - 1;
  onWeaponHit(both, struck2);
  assert.equal(both.player.overloadHits, OVERLOAD_EVERY, 'the overload counter advanced');
  assert.equal(both.player.livewireHits, LIVEWIRE_EVERY, 'and LIVE WIRE\'s advanced on the SAME hit');
  // other took LIVE WIRE's zap (0.5 x 40) AND the overload nova (0.75 x 40)
  assert.equal(1e9 - other.hp, LIVEWIRE_DAMAGE_MULT * 40 + OVERLOAD_DAMAGE_MULT * 40,
    'the two carriers fire together on one hit');
});

// R3 NO CHAIN-OF-CHAINS, EXTENDED ---------------------------------------------
ok('R3: the overload discharge is rider-free even with RIME/IGNITE/LIVE WIRE held', () => {
  const st = stateWith(null);
  for (const id of ['rime', 'ignite', 'livewire', 'overload']) grantRewrite(st, id);
  st.player.stats.damage = 40;
  const struck = { x: 0, y: 0, hp: 1e9, flash: 0, slow: 0, burn: 0 };
  const victim = { x: 20, y: 0, hp: 1e9, flash: 0, slow: 0, burn: 0 };
  st.enemies = [struck, victim];
  st.player.livewireHits = LIVEWIRE_EVERY - 1;     // the same hit zaps too
  st.player.overloadHits = OVERLOAD_EVERY - 1;     // ...and discharges
  onWeaponHit(st, struck);
  assert.equal(victim.slow || 0, 0, 'the zap victim caught NO chill from a non-direct source');
  assert.equal(victim.burn || 0, 0, 'and NO burn');
  assert.equal(st.player.livewireHits, LIVEWIRE_EVERY, 'neither zap re-advanced LIVE WIRE');
  assert.equal(st.player.overloadHits, OVERLOAD_EVERY, 'nor the overload discharge');
  assert.equal(1e9 - victim.hp, LIVEWIRE_DAMAGE_MULT * 40 + OVERLOAD_DAMAGE_MULT * 40,
    'and the payload is exactly the two zaps, nothing recursive');
});

// R2 THERMAL SHOCK ------------------------------------------------------------
ok('R2 THERMAL SHOCK: a burst only on a chilled, ALREADY-BURNING refresh', () => {
  const mk = (rewrites) => {
    const st = stateWith(rewrites); st.player.stats.damage = 40;
    const e = { hp: 1e9, burn: 0, burnDps: 0, slow: 0, flash: 0 };
    st.enemies = [e];
    return { st, e };
  };
  assert.equal(THERMALSHOCK_BURST_MULT, 3, 'the brief fixes the burst at 3x burnDps');
  let s = mk(null);
  onWeaponHit(s.st, s.e);
  assert.equal(s.e.hp, 1e9, 'no cards at all: no burst');
  // IGNITE alone: the FIRST application is not a refresh...
  s = mk({ ignite: true });
  onWeaponHit(s.st, s.e);
  assert.equal(s.e.hp, 1e9, 'a first burn application never bursts');
  onWeaponHit(s.st, s.e);                       // now a refresh, but UNCHILLED
  assert.equal(s.e.hp, 1e9, 'a refresh on an unchilled body does not burst');
  // BOTH constituents, no combo: still nothing
  s = mk({ rime: true, ignite: true });
  onWeaponHit(s.st, s.e); onWeaponHit(s.st, s.e);
  assert.equal(s.e.hp, 1e9, 'the two constituents alone never burst');
  assert.ok(s.e.slow > 0, 'although RIME did chill the body');
  // THE COMBO: chilled + already burning + a refresh
  s = mk({ rime: true, ignite: true, thermalshock: true });
  onWeaponHit(s.st, s.e);
  assert.equal(s.e.hp, 1e9, 'the first application still does not burst');
  onWeaponHit(s.st, s.e);
  assert.equal(1e9 - s.e.hp, THERMALSHOCK_BURST_MULT * s.e.burnDps, 'exactly 3x the burn dps');
  assert.equal(s.e.burnDps, IGNITE_BURN_FLAT + IGNITE_BURN_FRAC * 40, 'and the burn refreshed first');
  assert.equal(s.e.hp > 0, true, 'the body survived this one');
  assert.equal(s.st.effects.filter(fx => fx.kind === 'nova_pulse').length, 1, 'the burst painted once');
  assert.equal(s.st.player.livewireHits, undefined, 'no counter moved');
  // R3: a burst that KILLS stamps the corpse burn-lethal, exactly like the tick
  s = mk({ rime: true, ignite: true, thermalshock: true });
  onWeaponHit(s.st, s.e);
  s.e.hp = 1;
  onWeaponHit(s.st, s.e);
  assert.equal(s.e.hp <= 0, true, 'the burst killed it');
  assert.equal(s.e.burnLethal, true, 'and the corpse is stamped burn-lethal (never detonates)');
});

// R2 STORM REAPER -------------------------------------------------------------
ok('R2 STORM REAPER: a zap KILL stamps the corpse, a zap HIT does not', () => {
  const mk = (extra) => {
    const st = stateWith({ livewire: true, onkillboom: true, ...extra });
    st.player.stats.damage = 50;
    return st;
  };
  const b = { x: 0, y: 0, hp: 1e9, flash: 0, slow: 0, burn: 0 };
  // a zap HIT (survivor): no stamp, no blast
  let st = mk({});
  const tough = { x: 20, y: 0, hp: 1e9, flash: 0, slow: 0, burn: 0 };
  st.enemies = [b, tough];
  st.player.livewireHits = LIVEWIRE_EVERY - 1;
  onWeaponHit(st, b);
  assert.equal(tough.zapLethal, undefined, 'a zap HIT never stamps');
  assert.equal(stormReaperBlast(st), null, 'the combo is not held: no blast');
  // a zap KILL with the combo
  st = mk({ stormreaper: true });
  const struck2 = { x: 0, y: 0, hp: 1e9, flash: 0, slow: 0, burn: 0 };
  const doomed = { x: 20, y: 0, hp: 1, flash: 0, slow: 0, burn: 0 };   // the 25-damage zap kills it
  st.enemies = [struck2, doomed];
  st.player.livewireHits = LIVEWIRE_EVERY - 1;
  onWeaponHit(st, struck2);
  assert.equal(doomed.hp <= 0, true, 'the zap killed it');
  assert.equal(doomed.zapLethal, true, 'the KILL stamped the corpse');
  const blast = stormReaperBlast(st);
  assert.ok(blast, 'the combo prices a blast');
  assert.equal(STORMREAPER_BLAST_MULT, 0.5, 'the brief fixes the blast at 50%');
  assert.equal(blast.damage, (BOOM_DAMAGE_FLAT + BOOM_DAMAGE_FRAC * 50) * STORMREAPER_BLAST_MULT,
    'half of the CHAIN REACTION damage');
  assert.equal(blast.radius, BOOM_RADIUS * STORMREAPER_BLAST_MULT, 'and half its radius');
  // with no detonation source at all there is nothing to price from
  assert.equal(stormReaperBlast(stateWith({ livewire: true, stormreaper: true })), null,
    'no CHAIN source: nothing to detonate');
  // R3: the blast is applyBlast, so it never rides (no chill on a chilled-body blast)
  const ring = { x: 4, y: 0, hp: 1e9, flash: 0, slow: 0, burn: 0 };
  const s2 = stateWith({ rime: true });
  grantRewrite(s2, 'stormreaper'); grantRewrite(s2, 'onkillboom');
  s2.enemies = [ring];
  applyBlast(s2, 0, 0, blast);
  assert.equal(ring.slow || 0, 0, 'the blast victim caught no chill (blasts never ride)');
});

// R2 GLACIAL ORBIT ------------------------------------------------------------
ok('R2 GLACIAL ORBIT: orbit hits chill 2.5s, every other direct hit still 1.5s', () => {
  assert.equal(GLACIALORBIT_CHILL_DURATION, 2.5, 'the brief fixes the orbit chill at 2.5s');
  assert.ok(GLACIALORBIT_CHILL_DURATION > RIME_SLOW_DURATION, 'and it IS longer than RIME\'s');
  const st = stateWith({ rime: true, glacialorbit: true });
  const orb = { hp: 1e9, slow: 0, flash: 0 };
  onWeaponHit(st, orb, { orbit: true });
  assert.equal(orb.slow, GLACIALORBIT_CHILL_DURATION, 'an ORBIT contact writes the longer chill');
  assert.equal(orb.slowMult, RIME_SLOW_FACTOR, 'the same grip factor: no second status system');
  const other = { hp: 1e9, slow: 0, flash: 0 };
  onWeaponHit(st, other);                       // a NON-orbit direct hit
  assert.equal(other.slow, RIME_SLOW_DURATION, 'every other direct hit still chills 1.5s');
  const noCombo = { hp: 1e9, slow: 0, flash: 0 };
  onWeaponHit(stateWith({ rime: true }), noCombo, { orbit: true });
  assert.equal(noCombo.slow, RIME_SLOW_DURATION, 'without the combo the orbit hit chills 1.5s too');
  const longer = { hp: 1e9, slow: 3, slowMult: 0.45, flash: 0 };
  onWeaponHit(st, longer, { orbit: true });
  assert.equal(longer.slow, 3, 'a longer FROST_NOVA window is never truncated');
  // the +10% reads only on a CHILLED body and only on an ORBIT contact
  assert.equal(GLACIALORBIT_DAMAGE_MULT, 1.10, 'the brief fixes the orbit bonus at +10%');
  assert.equal(directHitMult(stateWith({ glacialorbit: true }), { slow: 1 }, { orbit: true }),
    GLACIALORBIT_DAMAGE_MULT, 'x1.10 on an ORBIT hit against a chilled body');
  assert.equal(directHitMult(stateWith({ glacialorbit: true }), { slow: 1 }), 1,
    'a non-orbit hit gets no orbit bonus');
  assert.equal(directHitMult(stateWith({ glacialorbit: true }), { slow: 0 }, { orbit: true }), 1,
    'an unchilled body gets none');
  // and the two FROST damage bonuses COMPOSE when both cards are held
  const bothSt = stateWith({ glacier: true, glacialorbit: true });
  assert.ok(Math.abs(directHitMult(bothSt, { slow: 1 }, { orbit: true }) -
    GLACIER_DAMAGE_MULT * GLACIALORBIT_DAMAGE_MULT) < 1e-12,
    'GLACIER x1.20 and GLACIAL ORBIT x1.10 compose on one orbit hit');
});

// R4 THE COMBO PREDICATES + R5 THE DESC + R6 THE FAMILY SHARE ------------------
ok('R4: a combo is offered ONLY while BOTH constituents are owned, and draws no rng', () => {
  const ids = (held, weapons) => {
    const st = stateWith(null);
    if (weapons) st.weapons = weapons;
    for (const id of held) grantRewrite(st, id);
    return rewriteCards(st).map(c => c.rewrite);
  };
  const orb = [makeWeapon('ORBIT')];
  assert.ok(!ids([]).includes('thermalshock'), 'nothing held: THERMAL SHOCK is absent');
  assert.ok(!ids(['rime']).includes('thermalshock'), 'RIME alone is not enough');
  assert.ok(!ids(['ignite']).includes('thermalshock'), 'IGNITE alone is not enough');
  assert.ok(ids(['rime', 'ignite']).includes('thermalshock'), 'both: THERMAL SHOCK is offered');
  assert.ok(!ids([]).includes('stormreaper'), 'nothing held: STORM REAPER is absent');
  assert.ok(!ids(['livewire']).includes('stormreaper'), 'LIVE WIRE alone is not enough');
  assert.ok(ids(['livewire', 'onkillboom']).includes('stormreaper'), 'both: STORM REAPER is offered');
  assert.ok(!ids([]).includes('glacialorbit'), 'nothing held: GLACIAL ORBIT is absent');
  assert.ok(!ids(['wideorbit']).includes('glacialorbit'), 'WIDE ORBIT alone is not enough');
  assert.ok(!ids(['rime']).includes('glacialorbit'), 'RIME alone is not enough');
  // Ownership is the gate, not the kit: a run that OWNS WIDE ORBIT owns it
  // because an ORBIT was equipped when it was drafted, and the combo reads the
  // base card's own predicate no further (the brief: "read
  // state.player.rewrites"). Stated, not glossed.
  assert.ok(ids(['wideorbit', 'rime']).includes('glacialorbit'),
    'both constituents owned: the combo is offered');
  assert.ok(ids(['wideorbit', 'rime'], orb).includes('glacialorbit'),
    'and owning them with the ORBIT still equipped offers it too');
  // R5: both tags, and the desc prefix reads TAG1+TAG2 - ...
  for (const id of ['thermalshock', 'stormreaper', 'glacialorbit']) {
    assert.equal(isComboRewrite(id), true, id + ' is a two-tag combo');
    assert.equal(REWRITES[id].tags.length, 2, id + ' carries two tags');
    for (const t of REWRITES[id].tags) {
      assert.ok(REWRITE_TAGS.includes(t), id + ' tag ' + t + ' is reserved-set');
    }
  }
  const st = stateWith(null);
  for (const id of ['rime', 'ignite']) grantRewrite(st, id);
  const card = rewriteCards(st).find(c => c.rewrite === 'thermalshock');
  assert.ok(card, 'the combo reached the pool');
  assert.ok(card.desc.startsWith('FROST+BURN - '), 'the desc is two-tag prefixed: ' + card.desc);
  assert.equal(card.weight, REWRITE_CARD_WEIGHT * REWRITE_COMBO_WEIGHT_MULT,
    'a combo card carries HALF the family base weight');
  // ZERO rng draws, combo predicates included
  const real = Math.random;
  let draws = 0;
  Math.random = () => { draws++; return real(); };
  try {
    rewriteCards(st);                       // both constituents + the combo
    rewriteCards(stateWith(null));          // nothing held
    const s2 = stateWith(null);
    for (const id of ['livewire', 'onkillboom']) grantRewrite(s2, id);
    rewriteCards(s2);
  } finally { Math.random = real; }
  assert.equal(draws, 0, 'the offered set (combo predicates included) consumes zero rng draws');
});
ok('R6: the fourteen-card family total stays inside the goal band [0.055, 0.070]', () => {
  assert.equal(REWRITE_IDS.length, 14, 'the brief wants 12-20; slice 2 takes it to fourteen');
  let total = 0, singles = 0, combos = 0;
  for (const id of REWRITE_IDS) {
    if (isComboRewrite(id)) { combos++; total += REWRITE_CARD_WEIGHT * REWRITE_COMBO_WEIGHT_MULT; }
    else { singles++; total += REWRITE_CARD_WEIGHT; }
  }
  assert.equal(singles, 11, 'eleven single-tag/legacy cards');
  assert.equal(combos, 3, 'three cross-tag combos');
  assert.equal(REWRITE_COMBO_WEIGHT_MULT, 0.5, 'combos carry half base weight');
  assert.equal(REWRITE_CARD_WEIGHT, 0.005, 'the base weight the D4 solve picked');
  assert.ok(Math.abs(total - 0.0625) < 1e-12, `family total ${total} (12.5 x 0.005)`);
  assert.ok(total >= 0.055 && total <= 0.070, 'inside the goal band');
  // every tag on every card still comes from REWRITE_TAGS
  const tagSet = new Set(REWRITE_TAGS);
  for (const id of REWRITE_IDS) {
    for (const t of REWRITES[id].tags) assert.ok(tagSet.has(t), id + ' tag in the reserved set');
    assert.ok(REWRITES[id].desc.length > 20, id + ' desc is real prose');
    assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(REWRITES[id].desc),
      id + ' desc carries no emoji');
  }
});
ok('R7: a full house is still offered ZERO rewrite cards, combos included', () => {
  assert.equal(C.REWRITE_SLOTS, 4, 'REWRITE_SLOTS is untouched at four');
  const st = stateWith(null);
  st.weapons = [makeWeapon('ORBIT')];
  // a full house that OWNS BOTH constituents of two combos — the combos must
  // still be gone, not offered on top
  for (const id of ['rime', 'ignite', 'wideorbit', 'livewire']) grantRewrite(st, id);
  assert.equal(rewriteCount(st), 4);
  assert.deepEqual(rewriteCards(st), [], 'the full house closes the family, combos and all');
  // the empty-slot incentive is byte-equivalent: x0.80 at zero taken, x1.00 full
  assert.equal(emptySlotCooldownMult(stateWith(null)), 0.80, 'x0.80 at zero taken');
  assert.equal(emptySlotCooldownMult(st), 1.00, 'x1.00 at a full house');
  const three = stateWith(null);
  for (const id of ['rime', 'ignite', 'wideorbit']) grantRewrite(three, id);
  assert.ok(Math.abs(emptySlotCooldownMult(three) - 0.95) < 1e-9,
    'x0.95 at three taken (one empty slot)');
});

// ---- 3d. G21 slice 2: the LIVE loop (the real seams) --------------------------
ok('R1 GLACIER live: an ORBIT contact lands exactly x1.20 on a chilled body, x1.00 unchilled', () => {
  const measure = (glacier, chill) => {
    const restore = closeWindow();
    try {
      const orb = makeWeapon('ORBIT');
      st.weapons = [orb];
      p.rewrites = { rime: true };
      if (glacier) p.rewrites.glacier = true;
      p.stats.crit = 0;                       // critRoll is a die roll; pin it flat
      const victim = hostile('BRUTE', p, { x: 0, y: 0 });
      // A 1e6-hp sentinel, NOT 1e9: the loss is read as startHp - hp, and at
      // 1e9 a ~100-point loss keeps only ~7 significant digits (the ratio then
      // fails a 1e-9 bar for a float reason, not a gameplay one). 1e6 keeps
      // plenty of headroom over a four-second ring probe.
      victim.hp = 1e6; victim.maxHp = 1e6;
      victim.slow = chill ? RIME_SLOW_DURATION : 0;
      st.enemies.push(victim);
      let contacts = 0;
      h.pump(240, () => {
        st.projectiles.length = 0; st.enemyShots.length = 0;
        // Re-anchor the body onto the ring every frame: the blade path is
        // deterministic (angle += SPIN x dt), so BOTH arms see the identical
        // contact sequence and the only variable is the multiplier.
        const b = orb.payload.blades && orb.payload.blades[0];
        if (b) { victim.x = b.x; victim.y = b.y; }
        if (!chill) victim.slow = 0;          // the unchilled arm stays unchilled
        else victim.slow = Math.max(victim.slow, RIME_SLOW_DURATION);
        if (victim.flash > 0) contacts++;
      });
      const loss = 1e6 - victim.hp;
      p.rewrites = {}; p.stats.crit = 0; st.weapons = [];
      return { loss, contacts };
    } finally { restore(); }
  };
  const base = measure(false, false);
  const chillNoCard = measure(false, true);
  const chilled = measure(true, true);
  const unchilled = measure(true, false);
  assert.ok(base.loss > 0, `the ring contacted the body (${base.loss} damage)`);
  assert.ok(Math.abs(chillNoCard.loss / base.loss - 1) < 1e-9,
    `a chill ALONE changes nothing (x${(chillNoCard.loss / base.loss).toFixed(6)})`);
  assert.ok(Math.abs(chilled.loss / base.loss - GLACIER_DAMAGE_MULT) < 1e-9,
    `GLACIER on a chilled body: x${(chilled.loss / base.loss).toFixed(6)}`);
  assert.ok(Math.abs(unchilled.loss / base.loss - 1) < 1e-9,
    `GLACIER on an UNCHILLED body: x${(unchilled.loss / base.loss).toFixed(6)}`);
});
ok('R1 WILDFIRE live: the death pass hands the burn over, rider-free', () => {
  const restore = closeWindow();
  try {
    p.rewrites = { wildfire: true, rime: true, ignite: true, livewire: true };
    p.invuln = 999;
    p.livewireHits = 0; p.overloadHits = 0;
    // A burning corpse (hp 0 dies this frame) 40px from a live neighbour and a
    // third body well outside WILDFIRE_RANGE.
    const dead = { ...hostile('BRUTE', p, { x: 400, y: 400 }), hp: 0, maxHp: 1, burn: 2.2, burnDps: 6 };
    const near = hostile('BRUTE', p, { x: 440, y: 400 });
    const far = hostile('BRUTE', p, { x: 800, y: 400 });
    st.enemies.push(dead, near, far);
    st.projectiles.length = 0;
    h.pump(1, () => { st.projectiles.length = 0; st.enemyShots.length = 0; });
    const deadBurn = dead.burn, deadDps = dead.burnDps;
    p.rewrites = {};
    assert.ok(deadBurn > 2.0, `the corpse was still burning at death (${deadBurn.toFixed(4)}s)`);
    assert.equal(near.burn, deadBurn, 'the neighbour caught the FULL remaining duration');
    assert.equal(near.burnDps, deadDps, 'and the FULL remaining dps');
    assert.equal(far.burn, 0, 'a body outside WILDFIRE_RANGE caught nothing');
    assert.equal(near.slow || 0, 0, 'R3: the transfer is not a weapon hit — no chill');
    assert.equal(st.player.livewireHits || 0, 0, 'and no rider counter moved');
    assert.equal(st.player.overloadHits || 0, 0, 'neither of them');
  } finally { restore(); }
});
ok('R2 STORM REAPER live: a zap kill detonates through the death pass, only with the combo', () => {
  const run = (withCombo) => {
    const restore = closeWindow();
    try {
      p.rewrites = { livewire: true, onkillboom: true };
      if (withCombo) p.rewrites.stormreaper = true;
      p.invuln = 999;
      p.livewireHits = LIVEWIRE_EVERY - 1;      // the next hit zaps
      const struck = hostile('BRUTE', p, { x: 400, y: 400 });
      const doomed = { ...hostile('BRUTE', p, { x: 420, y: 400 }), hp: 1, maxHp: 1 };
      st.enemies.push(struck, doomed);
      st.effects.length = 0;
      onWeaponHit(st, struck);                  // the 5th hit: the zap kills `doomed`
      const stamped = doomed.zapLethal === true;
      const killed = doomed.hp <= 0;
      h.pump(1, () => { st.projectiles.length = 0; st.enemyShots.length = 0; });
      const booms = st.effects.filter(fx => fx.kind === 'rewrite_boom').length;
      const gone = !st.enemies.includes(doomed);
      p.rewrites = {};
      return { stamped, killed, booms, gone };
    } finally { restore(); }
  };
  const off = run(false);
  const on = run(true);
  assert.equal(off.killed, true, 'the zap killed the 1-hp body');
  assert.equal(off.stamped, false, 'without the combo nothing is stamped');
  assert.equal(off.gone, true, 'the corpse left the field');
  assert.equal(off.booms, 1, 'the onkillboom detonation alone fired');
  assert.equal(on.stamped, true, 'with the combo the kill is stamped');
  assert.equal(on.gone, true, 'the corpse left the field');
  assert.equal(on.booms, 2, 'the combo ADDS its 50% blast through the SAME applyBlast path');
});
ok('R2 GLACIAL ORBIT live: an ORBIT contact writes the 2.5s chill (RIME alone stays at 1.5s)', () => {
  const peakSlow = (combo) => {
    const restore = closeWindow();
    try {
      p.rewrites = { rime: true };
      if (combo) p.rewrites.glacialorbit = true;
      const orb = makeWeapon('ORBIT');
      st.weapons = [orb];
      const near = hostile('BRUTE', p, { x: 45, y: 0 });
      st.enemies.push(near);
      let peak = 0;
      h.pump(300, () => {
        st.projectiles.length = 0; st.enemyShots.length = 0;
        if (near.slow > peak) peak = near.slow;
      });
      p.rewrites = {}; st.weapons = [];
      return peak;
    } finally { restore(); }
  };
  const rimeOnly = peakSlow(false);
  const withCombo = peakSlow(true);
  assert.ok(rimeOnly > 0, `the orbit contact chilled at all (${rimeOnly.toFixed(4)}s)`);
  assert.ok(rimeOnly <= RIME_SLOW_DURATION + 1e-9,
    `RIME alone never writes past its 1.5s (${rimeOnly.toFixed(4)}s)`);
  assert.ok(withCombo > RIME_SLOW_DURATION,
    `the combo writes past RIME's 1.5s (${withCombo.toFixed(4)}s)`);
  assert.ok(withCombo <= GLACIALORBIT_CHILL_DURATION + 1e-9,
    `and never past its configured 2.5s (${withCombo.toFixed(4)}s)`);
});
ok('R2 GLACIAL ORBIT: the 2.5s chill burns at the same WALL rate at 60Hz and 120Hz', () => {
  // House rule: 60Hz and 120Hz must both be correct, nothing counts frames.
  // Slice 2 adds NO timer at all — the only new duration is the chill written
  // into the existing `e.slow` field, which the sim decays dt-driven.
  const burned = (hz) => {
    const restore = closeWindow();
    try {
      p.rewrites = { rime: true, glacialorbit: true };
      p.invuln = 999;
      const e = hostile('BRUTE', p, { x: 500, y: 500 });
      st.enemies.push(e);
      onWeaponHit(st, e, { orbit: true });
      const start = e.slow;
      h.setFrameMs(1000 / hz);
      h.pump(Math.round(1.0 * hz), () => {
        st.projectiles.length = 0; st.enemyShots.length = 0;
        e.x = p.x + 500; e.y = p.y + 500;      // pinned out of every weapon's reach
      });
      h.setFrameMs(1000 / 60);
      p.rewrites = {};
      return { start, burned: start - e.slow };
    } finally { restore(); h.setFrameMs(1000 / 60); }
  };
  const a = burned(60), b = burned(120);
  assert.equal(a.start, GLACIALORBIT_CHILL_DURATION, 'both arms start from the same 2.5s write');
  assert.ok(Math.abs(a.burned - 1.0) < 1e-6, `a wall-clock second burned 1.00s of chill (${a.burned.toFixed(9)})`);
  assert.ok(Math.abs(a.burned - b.burned) < 1e-9,
    `60Hz ${a.burned.toFixed(9)}s vs 120Hz ${b.burned.toFixed(9)}s — no frame counting`);
});
ok('R1 OVERLOAD live: direct hits through the volley advance the SEPARATE counter', () => {
  const restore = closeWindow();
  try {
    p.rewrites = { overload: true };
    p.attackTimer = 0;                          // closeWindow pinned it silent
    const gap = Math.round(C.AUTOPILOT.FOCUS_RANGE / 2);
    const far = hostile('BRUTE', p, { x: gap, y: 0 });
    st.enemies.push(far);
    h.pump(900, () => {
      st.enemyShots.length = 0;
      far.x = p.x + gap; far.y = p.y;           // stay inside the engagement radius
    });
    const hits = p.overloadHits || 0;
    p.rewrites = {};
    assert.ok(hits > 0, `the volley rider advanced the overload counter (${hits} direct hits)`);
    assert.ok(hits < OVERLOAD_EVERY || far.hp <= 1e9, 'the counter is the run\'s own integer');
  } finally { restore(); }
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

// ---- 4b. C7: SEEDED NO-DRIFT at the real seam ----------------------------------
// A rewrite that is HELD but INERT (aftershock with no blast source, wideorbit
// with no ORBIT equipped) must not perturb the draft stream one bit: same seeded
// Math.random, same number of draws, same card sequence, offer for offer.
// (A whole-run hash cannot stay identical — the empty-slot cooldown pay differs
// by design — so the DRAFT stream is isolated via direct openDraft calls. A
// literal pre-slice-tree comparison is impossible: no git checkout is allowed.)
ok('C7: a held-but-inert rewrite causes ZERO draft-stream drift (seeded, verbatim)', () => {
  const runArm = (grantInert) => {
    st.weapons = ['VOLLEY', 'BOOMERANG'].map(makeWeapon);
    st.player.rules = {}; st.player.takenStats = {}; st.player.skills = {}; st.player.rewrites = {};
    if (grantInert) { st.player.rewrites.aftershock = true; st.player.rewrites.wideorbit = true; }
    const real = Math.random;
    const rng = seeded(4711);
    let draws = 0;
    Math.random = () => { draws++; return rng(); };
    const seq = [];
    try {
      for (let i = 0; i < 500; i++) {
        h.T.openDraft();
        seq.push(Array.from(h.elements['ov-cards'].children).map(el => el.innerHTML || '').join('|'));
      }
    } finally {
      Math.random = real;
      st.player.rules = {}; st.player.takenStats = {}; st.player.skills = {}; st.player.rewrites = {};
    }
    return { seq, draws };
  };
  const a = runArm(false);   // predicates naturally false: the two cards absent
  const b = runArm(true);    // the same two cards HELD (taken -> absent) but inert
  assert.equal(b.draws, a.draws, `identical rng draw counts (${a.draws} vs ${b.draws})`);
  assert.deepEqual(b.seq, a.seq, 'offer-for-offer identical draft streams');
  assert.ok(a.draws > 0 && a.seq.length === 500, 'the probe actually measured 500 drafts');
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

// ---- 6b. G21 slice 2: D5 per-card probes + D6 no-drift -------------------------
console.log('G21 slice 2: D5 per-card one-bad-pick probes (30 runs/cell, seed 4242)');
const S2_CARDS = ['glacier', 'wildfire', 'overload', 'thermalshock', 'stormreaper', 'glacialorbit'];
// A combo is probed WITH BOTH CONSTITUENTS: the honest comparable for a card
// that can only ever be drafted after its pair is owned is (pair + card) vs
// (pair alone), so BOTH ratios are printed and both must clear the 0.8x bar.
const S2_PREREQS = {
  glacier: [], wildfire: [], overload: [],
  thermalshock: ['rime', 'ignite'],
  stormreaper: ['livewire', 'onkillboom'],
  glacialorbit: ['wideorbit', 'rime'],
};
ok('D5: every slice-2 card reads >= 0.8x, alone and against its constituents', () => {
  const baseMean = mean(good);
  for (const id of S2_CARDS) {
    const pre = S2_PREREQS[id];
    const alone = mean(simulateCohort(SEED, RUNS, 'GREED_DAMAGE', { startCards: [id] })) / baseMean;
    const withPre = mean(simulateCohort(SEED, RUNS, 'GREED_DAMAGE', { startCards: [...pre, id] }));
    const preOnly = pre.length
      ? mean(simulateCohort(SEED, RUNS, 'GREED_DAMAGE', { startCards: pre }))
      : baseMean;
    const marginal = withPre / preOnly;
    console.log(`    ${id.padEnd(13)} alone ${alone.toFixed(3)}x baseline` +
      `  |  with constituents ${marginal.toFixed(3)}x` +
      (pre.length ? ` (vs ${pre.join('+')} alone)` : ''));
    assert.ok(alone >= 0.8, `${id} alone at ${alone.toFixed(2)}x < the 0.8x bar`);
    assert.ok(marginal >= 0.8, `${id} + constituents at ${marginal.toFixed(2)}x < the 0.8x bar`);
  }
});
ok('D5: the bad cohort still fails 100% with every slice-2 card (and without it)', () => {
  assert.ok(bad.every(r => r.dead), 'the cardless bad cohort fails 100%');
  for (const id of S2_CARDS) {
    const b = simulateCohort(SEED, RUNS, 'ADVERSARIAL_BAD', { startCards: [id] });
    assert.ok(b.every(r => r.dead), `the bad cohort holding ${id} still fails 100%`);
  }
});
console.log('G21 slice 2: D6 the no-drift proof (seeded)');
ok('D6: all slice-2 state is RUN-scoped — a fresh player carries none of it', () => {
  const fresh = makePlayer();
  assert.equal(fresh.overloadHits, undefined, 'OVERLOAD\'s counter is born on the run it hits in');
  assert.equal(fresh.livewireHits, undefined, 'as slice 1 already had it');
  assert.equal(fresh.rewrites && Object.keys(fresh.rewrites).length, 0, 'a fresh run holds no rewrite');
  assert.equal('zapLethal' in fresh, false, 'the storm-reaper stamp lives on an ENEMY, not the player');
  assert.equal(C.REWRITE_SLOTS, 4, 'and the slot cap is untouched');
  // The save schema is not touched at all: the run player is never serialised
  // (src/save.js stores the PROFILE), and no slice-2 id is a profile field.
  const payload = JSON.stringify(buildExport(h.T.getProfile(), {}));
  for (const id of S2_CARDS) {
    assert.ok(!payload.includes(id), id + ' never reaches the save payload');
  }
  for (const field of ['overloadHits', 'zapLethal', 'rewriteEchoes']) {
    assert.ok(!payload.includes(field), field + ' is run state, never saved');
  }
});
ok('D6: combo predicates consume ZERO draws, and a CLOSED family is stream-stable', () => {
  // (a) the offered set draws nothing at all, predicates included.
  const real = Math.random;
  let draws = 0;
  Math.random = () => { draws++; return real(); };
  try {
    const withPairs = stateWith(null);
    withPairs.weapons = [makeWeapon('ORBIT')];
    for (const id of ['rime', 'ignite', 'livewire', 'onkillboom', 'wideorbit']) grantRewrite(withPairs, id);
    rewriteCards(withPairs);          // every combo predicate TRUE
    rewriteCards(stateWith(null));    // every combo predicate FALSE
  } finally { Math.random = real; }
  assert.equal(draws, 0, 'rewriteCards consumes zero rng draws, combo predicates included');
  // (b) a CLOSED family is stream-stable: with FOUR rewrites held no rewrite
  // card is offered at all, so ALSO holding all six slice-2 cards cannot move
  // one offer. (A whole-tree before/after is impossible — no git checkout per
  // house rules — so the no-drift clause is proven on the states where the new
  // cards are ABSENT from the pool, which is exactly what it claims.)
  const arm = (extra) => {
    st.weapons = ['VOLLEY', 'BOOMERANG'].map(makeWeapon);
    st.player.rules = {}; st.player.takenStats = {}; st.player.skills = {};
    st.player.rewrites = { pierceall: true, onkillboom: true, healthdamage: true, rime: true };
    for (const id of extra) st.player.rewrites[id] = true;
    const real2 = Math.random;
    const rng = seeded(4711);
    let n = 0;
    Math.random = () => { n++; return rng(); };
    const seq = [];
    try {
      for (let i = 0; i < 500; i++) {
        h.T.openDraft();
        seq.push(Array.from(h.elements['ov-cards'].children).map(el => el.innerHTML || '').join('|'));
      }
    } finally {
      Math.random = real2;
      st.player.rules = {}; st.player.takenStats = {}; st.player.skills = {}; st.player.rewrites = {};
    }
    return { seq, n };
  };
  const a = arm([]);
  const b = arm(S2_CARDS);
  assert.equal(a.n, b.n, `identical rng draw counts (${a.n} vs ${b.n})`);
  assert.deepEqual(a.seq, b.seq, 'offer-for-offer identical draft streams');
  assert.ok(a.n > 0 && a.seq.length === 500, 'the probe measured 500 seeded drafts');
  const closed = stateWith(null);
  for (const id of ['pierceall', 'onkillboom', 'healthdamage', 'rime']) grantRewrite(closed, id);
  assert.deepEqual(rewriteCards(closed), [], 'the family really is closed in both arms');
});

console.log(`rewrites: PASS=${pass} FAIL=${fail}`);
process.exit(fail === 0 ? 0 : 1);
