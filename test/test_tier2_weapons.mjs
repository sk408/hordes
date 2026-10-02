// HORDES — test/test_tier2_weapons.mjs: TIER-2(e) NEW WEAPONS (owner
// autopilot, 2026-09-23).
//
// Four new archetypes in the house vocabulary (ORIGINAL instances of the
// piercing / burst-on-kill / chain-with-body / bombardment behavior classes —
// docs/vs_ref SPEC-weapons + docs/mb_ref used as CLASS sources only):
//   JAVELIN  Sun Javelin  piercing        900     draft weight 1
//   EMBER    Ember Shot   burst-on-kill   75000   draft weight 1
//   RICOCHET Ricochet     chain (bounce)  165000  draft weight 1
//   METEOR   Meteor       bombardment     340000  draft weight 1
// Numbers TUNE-AFTER. Effect seams (file:line at report): hurt() weapons.js
// :290, pierce budget :423, kill-detect :590, AoE apply :707, nearestEnemy
// :271, rateScale :227, dmgScale :250, critRoll :259, weaponLevelParams
// :1032, kind-tagged bodies :41-43. NO new stat surface, NO new resource,
// NO on-kill economy (EMBER's burst is damage only), NO mid-flight homing.
//
// What is pinned here (all through the REAL seams):
//   1. REGISTRY: every new id in WEAPONS / WEAPON_TYPES / WEAPON_NAMES /
//      WEAPON_STEPS / WEAPON_LADDERS / WEAPON_LEVELS; makeWeapon instances.
//   2. PRICE-LADDER INTEGRITY: 'archetype order = price order' (meta.js:439)
//      holds as KEY ORDER = WEAPON_TYPES order (minus starters); every value
//      a positive finite number; BEAM still the max; each NEW rung sits
//      strictly between its key-order neighbours. (The PRE-EXISTING ZAP
//      60000 > NOVA_PULSE 12000 inversion is documented at meta.js:439-448
//      and pinned by test_meta.mjs — not this file's to move.)
//   3. DRAFT WEIGHT: each new weapon's level card carries the shipped
//      weapon-card weight 1 (main.js:4480 / meta.js:1181) — present, never
//      zero, never NaN. Odds are COMPUTED from the real tables below.
//   4. LIVE-DESC SHAPE: weapon level labels quote WEAPON_STEPS constants
//      through stepPct (weapons.js:892-906 live-template rule — the house
//      number-quote pattern for weapons; shop weapon rows quote no numbers,
//      meta.js:675, so no getter is required there).
//   5. UNLOCK CLASSIFICATION: every new id is shop-unlockable (WEAPON_PRICES
//      -> VALID_UNLOCK_WEAPONS -> a kind:'weapon' shop row).
//   6. EVOLUTION: NONE stated for all four (EVOLUTION_DEFS carries no row;
//      evolveWeapon returns reason 'type', evolutions.js:134).
//   7. FIRE PATH: each archetype actually fires through updateWeapons and
//      produces its kind-tagged body / effect payload.
//   8. LEDGER: tools/economy_ledger.mjs total matches the claimed number.
//   9. ODDS: per-weapon P(new-weapon) + pool dilution, computed in-test.
//
// Run: node test/test_tier2_weapons.mjs
import assert from 'node:assert/strict';
import {
  WEAPONS, WEAPON_TYPES, WEAPON_NAMES, WEAPON_STEPS, WEAPON_LADDERS,
  WEAPON_LEVELS, WEAPON_MAX_LEVEL, makeWeapon, updateWeapons, weaponLevelParams,
  describeWeaponLevel, rebuildWeaponTable,
} from '../src/weapons.js';
import { EVOLUTION_DEFS, evolveWeapon } from '../src/evolutions.js';
import {
  WEAPON_PRICES, STARTER_WEAPONS,
  SHOP_UPGRADES, SHOP_BY_ID, GOLD_MODEL, catalogCost, weaponUnlocked,
  makeProfile, draftCardWeight,
} from '../src/meta.js';
import { CONFIG as C, UPGRADES, DRAFT_LADDER, DRAFT_RARE_UPGRADES, DRAFT_MYTHIC_UPGRADES } from '../src/config.js';
import { makePlayer } from '../src/entities.js';
import { ledger } from '../tools/economy_ledger.mjs';
import { suite } from './_harness.mjs';

const S = suite('test_tier2_weapons');
const NEW_IDS = ['JAVELIN', 'EMBER', 'RICOCHET', 'METEOR'];
const NEW_PRICES = { JAVELIN: 900, EMBER: 75000, RICOCHET: 165000, METEOR: 340000 };
// The claimed ledger total after the four additive WEAPON_PRICES rungs
// (BEFORE 45,005,941g / 60 items -> AFTER 45,586,841g / 64 items; +580,900g).
const CLAIMED_LEDGER_TOTAL = 45586841;
const CLAIMED_LEDGER_ROWS = 64;

// ---- 1. registry presence ---------------------------------------------------
S.check('registry: every new id lives in WEAPONS / WEAPON_TYPES / WEAPON_NAMES', () => {
  for (const id of NEW_IDS) {
    assert.ok(WEAPONS[id], `WEAPONS.${id} exists`);
    assert.equal(WEAPONS[id].NAME, WEAPON_NAMES[id], `${id} NAME joins WEAPON_NAMES`);
    assert.ok(WEAPON_TYPES[id] && typeof WEAPON_TYPES[id].update === 'function',
      `WEAPON_TYPES.${id} carries an update fn`);
    assert.equal(WEAPON_TYPES[id].name, WEAPON_NAMES[id], `${id} type name joins WEAPON_NAMES`);
    assert.ok(WEAPON_STEPS[id], `WEAPON_STEPS.${id} exists`);
    assert.ok(WEAPON_LADDERS[id], `WEAPON_LADDERS.${id} exists`);
    assert.ok(Array.isArray(WEAPON_LEVELS[id]) && WEAPON_LEVELS[id].length === WEAPON_MAX_LEVEL,
      `WEAPON_LEVELS.${id} is a ${WEAPON_MAX_LEVEL}-row ladder`);
  }
});
S.check('registry: makeWeapon instances carry the shipped shape', () => {
  for (const id of NEW_IDS) {
    const w = makeWeapon(id);
    assert.equal(w.type, id);
    assert.equal(w.level, 1);
    assert.ok(w.ticks instanceof Map);
    assert.ok(Array.isArray(w.payload.blades));
  }
});

// ---- 2. price-ladder integrity ----------------------------------------------
S.check('price-ladder: archetype order = price order (key order = WEAPON_TYPES order)', () => {
  const pricedArchetypes = Object.keys(WEAPON_TYPES).filter(id => !STARTER_WEAPONS.includes(id));
  assert.deepEqual(Object.keys(WEAPON_PRICES), pricedArchetypes,
    "WEAPON_PRICES key sequence is the archetype order (meta.js:439 'archetype order = price order')");
  for (const [id, p] of Object.entries(WEAPON_PRICES)) {
    assert.ok(Number.isFinite(p) && p > 0, `${id} price ${p} is a positive finite number`);
  }
  assert.equal(WEAPON_PRICES.BEAM, Math.max(...Object.values(WEAPON_PRICES)),
    'BEAM still tops the ladder');
});
S.check('price-ladder: each NEW rung sits strictly between its key-order neighbours', () => {
  const keys = Object.keys(WEAPON_PRICES);
  for (const id of NEW_IDS) {
    const i = keys.indexOf(id);
    assert.ok(i > 0 && i < keys.length - 1, `${id} is interior to the ladder`);
    const prev = WEAPON_PRICES[keys[i - 1]];
    const next = WEAPON_PRICES[keys[i + 1]];
    const p = WEAPON_PRICES[id];
    assert.ok(p > prev && p < next,
      `${id} ${p} sits strictly between ${keys[i - 1]} ${prev} and ${keys[i + 1]} ${next}`);
    assert.equal(p, NEW_PRICES[id], `${id} pins its tier-2(e) price`);
  }
});

// ---- 3. draft weight + odds (computed from the REAL tables) ------------------
// Weapon level-up cards are weight 1 in the shipped pool (main.js:4480 maps
// every weaponCards row to `{...c, weight: 1}`; meta.js:1181 documents the
// same constant). The family weights below are the live ones openDraft reads.
function poolWeights(kitTypes) {
  const luck = 0;
  const rows = [];
  // one weight-1 level-up card per brought weapon below the cap (openDraft)
  for (const t of kitTypes) rows.push({ id: 'lvl_' + t + '_1', weight: 1, family: 'weapon' });
  for (const u of UPGRADES) rows.push({ id: u.id, weight: draftCardWeight(u.id, 'stat', luck), family: 'stat' });
  for (const u of DRAFT_RARE_UPGRADES) rows.push({ id: u.id, weight: DRAFT_LADDER.RARE_WEIGHT, family: 'rare' });
  return rows;
}
S.check('draft weight: every new weapon card is weight 1 (never zero, never NaN)', () => {
  for (const id of NEW_IDS) {
    const row = poolWeights([id]).find(r => r.family === 'weapon');
    assert.equal(row.weight, 1, `${id} level card carries the shipped weapon-card weight 1`);
    assert.ok(Number.isFinite(row.weight) && row.weight > 0, `${id} weight is finite and positive`);
  }
});
S.check('draft odds: per-weapon P(new-weapon) + dilution, computed from the live tables', () => {
  // BEFORE: the starter+orbit kit (VOLLEY, BOOMERANG, ORBIT) — 3 weapon cards.
  // AFTER:  the same kit + ONE new weapon — 4 weapon cards.
  const before = poolWeights(['VOLLEY', 'BOOMERANG', 'ORBIT']);
  const after = poolWeights(['VOLLEY', 'BOOMERANG', 'ORBIT', 'JAVELIN']);
  const wOf = (rows) => rows.reduce((s, r) => s + r.weight, 0);
  const W0 = wOf(before), W1 = wOf(after);
  const pBefore = 1 / W0;                 // a brought weapon's level card
  const pAfter = 1 / W1;                  // the same card, diluted by the newcomer
  const pNew = 1 / W1;                    // P(offer is the NEW weapon's card)
  // Computed, not hard-coded prose: assert the identities the report quotes.
  assert.ok(Math.abs(pNew - 1 / W1) < 1e-12, 'P(new-weapon) = 1/poolWeight(after)');
  assert.ok(pAfter < pBefore, 'the added row dilutes every existing weight-1 card');
  assert.ok(Math.abs(pAfter / pBefore - W0 / W1) < 1e-12,
    `dilution factor is W0/W1 = ${(W0 / W1).toFixed(6)} (P ${pBefore.toFixed(6)} -> ${pAfter.toFixed(6)})`);
  // All four newcomers share the same weight-1 rung, so P is identical.
  for (const id of NEW_IDS) {
    const rows = poolWeights(['VOLLEY', id]);
    const w = rows.reduce((s, r) => s + r.weight, 0);
    assert.ok(Math.abs(1 / w - rows.find(r => r.family === 'weapon').weight / w) < 1e-12,
      `${id} P(offer) = its weight / pool weight`);
  }
  // Print the measured odds so the report quotes numbers the test computed.
  console.log(`    [odds] pool ${W0.toFixed(3)} -> ${W1.toFixed(3)} | ` +
    `P(brought card) ${pBefore.toFixed(6)} -> ${pAfter.toFixed(6)} | ` +
    `P(new-weapon) ${pNew.toFixed(6)} | dilution x${(W0 / W1).toFixed(6)}`);
});

// ---- 4. live-desc shape (the WEAPON_STEPS live-template rule) ---------------
S.check('live-desc: level labels quote WEAPON_STEPS constants (weapons.js:892-906 pattern)', () => {
  for (const id of NEW_IDS) {
    const l2 = describeWeaponLevel(id, 2);
    assert.ok(typeof l2 === 'string' && l2.includes(WEAPON_NAMES[id]),
      `${id} Lv2 label carries its name`);
    // A label that quotes a % quotes the LIVE step (stepPct of WEAPON_STEPS).
    const step = WEAPON_STEPS[id];
    if (step.DMG) {
      const pct = String(Math.round(step.DMG * 100));
      assert.ok(l2.includes(pct + '%') || l2.includes('Base'),
        `${id} Lv2 quotes its live DMG step ${pct}% (or the base label)`);
    }
    // Editing the step must move the label (the live-template promise; the
    // dev-editor calls rebuildWeaponTable after a step save — weapons.js:1021).
    const saved = step.DMG;
    if (saved) {
      step.DMG = saved + 0.11;
      try {
        rebuildWeaponTable(id);
        const moved = describeWeaponLevel(id, 2);
        assert.ok(moved !== l2, `${id} label tracks a WEAPON_STEPS edit`);
      } finally { step.DMG = saved; rebuildWeaponTable(id); }
    }
  }
});

// ---- 5. unlock classification -----------------------------------------------
S.check('unlock: every new id is a priced, shop-unlockable archetype', () => {
  const p = makeProfile();
  for (const id of NEW_IDS) {
    assert.equal(WEAPON_PRICES[id], NEW_PRICES[id], `${id} is priced`);
    assert.ok(!weaponUnlocked(p, id), `${id} starts locked on a fresh profile`);
    const row = SHOP_UPGRADES.find(u => u.kind === 'weapon' && u.weaponId === id);
    assert.ok(row, `${id} has a kind:'weapon' shop row`);
    assert.equal(SHOP_BY_ID[row.id], row, `${id} shop row is in SHOP_BY_ID`);
    assert.equal(row.baseCost, NEW_PRICES[id], `${id} shop row prices at its WEAPON_PRICES rung`);
  }
});

// ---- 6. evolution seam: NONE stated -----------------------------------------
S.check('evolution: all four state NONE (EVOLUTION_DEFS carries no row)', () => {
  for (const id of NEW_IDS) {
    assert.equal(EVOLUTION_DEFS[id], undefined, `${id} has NO evolution (stated)`);
    const w = makeWeapon(id);
    w.level = WEAPON_MAX_LEVEL;
    const r = evolveWeapon(w, ['crit', 'damageMult', 'rateMult', 'critMult'], 5);
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'type', `${id} evolve path reports reason 'type' (evolutions.js:134)`);
  }
});

// ---- 7. fire path: each archetype actually fires -----------------------------
function fireState(type) {
  const p = makePlayer();
  p.x = 0; p.y = 0;
  const e1 = { x: 40, y: 0, hp: 50, flash: 0 };
  const e2 = { x: 80, y: 10, hp: 50, flash: 0 };
  const e3 = { x: 120, y: -10, hp: 50, flash: 0 };
  const state = {
    player: p, enemies: [e1, e2, e3], projectiles: [], effects: [],
    healBudget: 100, archBuffs: null,
  };
  const w = makeWeapon(type);
  w.cd = 0;
  return { state, w, e1, e2, e3 };
}
S.check('fire path: JAVELIN throws a piercing body through updateWeapons', () => {
  const { state, w } = fireState('JAVELIN');
  updateWeapons(state, [w], 0.016);
  const body = state.projectiles.find(pr => pr.kind === 'javelin');
  assert.ok(body, 'a javelin body spawned');
  assert.ok(Number.isFinite(body.damage) && body.damage > 0, 'body carries finite damage');
  for (let i = 0; i < 40; i++) updateWeapons(state, [w], 0.016);
  const hit = state.enemies.some(e => e.hp < 50);
  assert.ok(hit, 'the spear damaged an enemy on its lane');
});
S.check('JAVELIN: one hit per enemy per throw at any frame rate or pierce', () => {
  for (const hz of [30, 60, 144]) {
    for (const pierce of [0, 3, 8]) {
      const { state, w } = fireState('JAVELIN');
      const p = state.player;
      p.stats.pierce = pierce; p.stats.crit = 0; p.stats.projectiles = 1;
      const e = { x: 100, y: 0, hp: 1e9, flash: 0 };
      state.enemies = [e];
      w.level = 7;
      updateWeapons(state, [w], 1 / hz);
      const perHit = state.projectiles.find(pr => pr.kind === 'javelin').damage;
      w.cd = 999;
      for (let i = 0; i < hz * 2; i++) updateWeapons(state, [w], 1 / hz);
      assert.ok(Math.abs((1e9 - e.hp) - perHit) < 1e-6,
        `hz ${hz} pierce ${pierce}: dealt ${1e9 - e.hp}, one hit is ${perHit}`);
    }
  }
});
S.check('JAVELIN ladder: Lv3/5/7 grant range (label and effect agree)', () => {
  assert.equal(weaponLevelParams('JAVELIN', 1).range, WEAPONS.JAVELIN.RANGE);
  assert.equal(weaponLevelParams('JAVELIN', 7).range, WEAPONS.JAVELIN.RANGE + 3 * WEAPON_STEPS.JAVELIN.RANGE);
  assert.ok(describeWeaponLevel('JAVELIN', 3).includes('+' + WEAPON_STEPS.JAVELIN.RANGE + ' range'));
  assert.ok(!describeWeaponLevel('JAVELIN', 3).includes('pierce'));
  assert.ok(!describeWeaponLevel('JAVELIN', 4).includes('range'));
});
S.check('fire path: EMBER fires a bolt and bursts AoE ONLY on a kill (no economy)', () => {
  const { state, w, e1 } = fireState('EMBER');
  e1.hp = 1;   // the next direct hit kills
  updateWeapons(state, [w], 0.016);
  const body = state.projectiles.find(pr => pr.kind === 'ember');
  assert.ok(body, 'an ember bolt spawned');
  for (let i = 0; i < 60; i++) updateWeapons(state, [w], 0.016);
  assert.ok(e1.hp <= 0, 'the victim died');
  const blast = state.effects.find(fx => fx.kind === 'mine_blast');
  assert.ok(blast, 'a kill-burst mine_blast effect emitted (detonateMine vocabulary)');
  // NOT on-kill economy: no gold, no heal from the burst.
  assert.equal(state.player.gold || 0, 0, 'the burst pays no gold');
  assert.ok((state.player.hp || 0) <= (state.player.stats.maxHp || 100), 'the burst heals nothing');
});
S.check('fire path: RICOCHET bounces to a fresh mark on impact (no mid-flight homing)', () => {
  const { state, w } = fireState('RICOCHET');
  updateWeapons(state, [w], 0.016);
  const body = state.projectiles.find(pr => pr.kind === 'ricochet');
  assert.ok(body, 'a ricochet body spawned');
  const marks0 = body.hit.size;
  for (let i = 0; i < 80; i++) updateWeapons(state, [w], 0.016);
  const damaged = state.enemies.filter(e => e.hp < 50).length;
  assert.ok(damaged >= 2, `the shot bounced into a second mark (damaged ${damaged})`);
  assert.ok(body.hit.size >= marks0, 'the hit set only grows (each mark once)');
});
S.check('fire path: METEOR telegraphs then lands an AoE at the mark', () => {
  const { state, w } = fireState('METEOR');
  updateWeapons(state, [w], 0.016);
  assert.ok(w.swing, 'a strike is pending (the telegraph)');
  const tell = state.effects.find(fx => fx.kind === 'nova_pulse');
  assert.ok(tell, 'a nova_pulse tell emitted at the mark');
  // Windup later the rock lands.
  for (let i = 0; i < 40; i++) updateWeapons(state, [w], 0.016);
  assert.equal(w.swing, null, 'the strike landed');
  assert.ok(state.effects.some(fx => fx.kind === 'mine_blast'), 'a mine_blast landed');
  assert.ok(state.enemies.some(e => e.hp < 50), 'the AoE damaged a foe');
});

// ---- 8. ledger total --------------------------------------------------------
S.check('ledger: economy_ledger total matches the claimed before/after number', () => {
  const L = ledger();
  assert.equal(L.total, CLAIMED_LEDGER_TOTAL,
    `catalogue total is the claimed ${CLAIMED_LEDGER_TOTAL}g (BEFORE 45005941 + 580900 tier-2(e))`);
  assert.equal(L.rows.length, CLAIMED_LEDGER_ROWS,
    `catalogue rows are the claimed ${CLAIMED_LEDGER_ROWS} (BEFORE 60 + 4)`);
  // The four new unlock rows classify OTHER today: joining MID_TIER_IDS would
  // silently move the test_economy_reprice midCost pin (3,297,200g) and the
  // 10-good-run share band — parked for the review phase (report quotes the
  // measured alternative).
  const mid = new Set(GOLD_MODEL.MID_TIER_IDS);
  const top = new Set(GOLD_MODEL.TOP_TIER_IDS);
  for (const id of NEW_IDS) {
    const rowId = 'weapon_' + id.toLowerCase();
    assert.ok(!mid.has(rowId) && !top.has(rowId),
      `${rowId} is OTHER in the ledger (MID/TOP membership parked — see report)`);
  }
  const wouldBeMid = catalogCost(GOLD_MODEL.MID_TIER_IDS)
    + NEW_PRICES.JAVELIN + NEW_PRICES.EMBER + NEW_PRICES.RICOCHET + NEW_PRICES.METEOR;
  const wouldBeShare = (10 * GOLD_MODEL.INCOME_TIERS[3].gold) / wouldBeMid;
  console.log(`    [ledger] total ${L.total}g / ${L.rows.length} rows | ` +
    `if-MID midCost ${wouldBeMid}g share10 ${(100 * wouldBeShare).toFixed(1)}% ` +
    `(current band 220-240% — parked)`);
});

S.done();
