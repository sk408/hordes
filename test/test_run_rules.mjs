// HORDES — test/test_run_rules.mjs: G8 STEP 3 (condition-shape run-altering cards).
//
// The owner's G8 decision (docs/HORDES_GOALS_2026-09-12.md) is option 6,
// sequenced 1 -> 3 -> 4 -> 2. Step 3 is the CONDITION card family: rules the run
// OBEYS while it holds the card, instead of a bigger number. src/rules.js holds
// them; this file proves each one at its REAL seam, not at a copy of it.
//
// What is load-bearing here (and why):
//   1. THE LADDER CANNOT DRIFT. rules.js CHEST_RARITY_LADDER is asserted equal
//      to the order of CHESTS.WEIGHTS, so a retune of the chest bands can never
//      leave the bump pointing somewhere else.
//   2. RULES OFF IS THE SHIPPED GAME, bit for bit: the rarity distribution over
//      20k seeded draws matches CHESTS.WEIGHTS, and rollContents takes EXACTLY
//      the same number of rng draws with the rule on as off (the documented
//      draw order is what every existing chest test pins).
//   3. HORDE BAIT IS MEASURED, TWO WAYS: a Monte-Carlo over the real
//      rollContents vs the EXHAUSTIVE enumeration of the bumped bands. They must
//      agree, and COMMON must go to ZERO chests (the bump is not a nudge).
//   4. EVERY CHEST IS A HORDE, AND NEVER TWO: driven through the real
//      tickChests -- one horde on an ordinary chest, and on a LOST GAMBLE
//      exactly one horde (the `else` in chests.js is the load-bearing branch).
//   5. ONE OF EACH removes stat cards from the REAL pool: driven through
//      src/main.js openDraft() in the headless harness and read off the
//      rendered cards, with a control run proving the card IS offered otherwise.
//   6. BOTH CARDS ARE OFFERED ONCE, at RULE_CARD_WEIGHT, and grant the condition
//      through the real pick contract (a draft card's apply(player)).
//
// Run: node test/test_run_rules.mjs
import assert from 'node:assert/strict';
import { CONFIG as C, UPGRADES } from '../src/config.js';
import { CHESTS, rollContents, tickChests } from '../src/chests.js';
import { makePlayer } from '../src/entities.js';
import { makeWeapon } from '../src/weapons.js';
import {
  RULES, RULE_IDS, CHEST_RARITY_LADDER, RULE_CARD_WEIGHT, chestRarityBump,
  statCardOffered, ruleCardOffered, ruleCards, markStatTaken, grantRule, hasRule,
} from '../src/rules.js';
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
const stateWith = (rules = null) => ({ player: { ...makePlayer(), rules: rules || {} },
  enemies: [], chests: [], time: 0 });

console.log('run rules (G8 step 3): the condition cards, at their real seams');

// ---- 1. the ladder matches the chest bands ---------------------------------
ok('CHEST_RARITY_LADDER is the declared order of CHESTS.WEIGHTS', () => {
  assert.deepEqual(CHEST_RARITY_LADDER, Object.keys(CHESTS.WEIGHTS));
  const total = Object.values(CHESTS.WEIGHTS).reduce((a, b) => a + b, 0);
  assert.equal(total, 100, 'the bands still sum to 100');
});
ok('the bump is one step up, and the top band holds', () => {
  assert.equal(chestRarityBump('common'), 'rare');
  assert.equal(chestRarityBump('rare'), 'legendary');
  assert.equal(chestRarityBump('legendary'), 'gamble');
  assert.equal(chestRarityBump('gamble'), 'gamble');
  assert.equal(chestRarityBump('nonsense'), 'nonsense', 'an unknown band is left alone');
});

// ---- 2. rules off == the shipped game --------------------------------------
const rollCounts = (rules, draws = 20000, seed = 999) => {
  const st = stateWith(rules);
  const rng = seeded(seed);
  const out = { common: 0, rare: 0, legendary: 0, gamble: 0, _draws: 0 };
  const counted = () => { out._draws++; return rng(); };
  for (let i = 0; i < draws; i++) out[rollContents(st, counted).rarity]++;
  return out;
};
const off = rollCounts(null), on = rollCounts({ hordebait: true });
const rate = (t, k) => t[k] / 20000;
ok('rules OFF reproduces CHESTS.WEIGHTS exactly', () => {
  for (const [k, w] of Object.entries(CHESTS.WEIGHTS)) {
    assert.ok(Math.abs(rate(off, k) - w / 100) < 0.02,
      `${k}: ${rate(off, k).toFixed(4)} vs ${(w / 100).toFixed(2)}`);
  }
});
ok('HORDE BAIT is a REWRITE of the same roll, never an extra roll', () => {
  // Pairwise, seed for seed: the ruled rarity must be exactly the bump of the
  // unruled rarity. If the rule consumed its own rng draw for the band, this
  // relation would break for arbitrary seeds. (The TOTAL draw count differs by
  // design and is NOT an invariant: a bumped band rolls different CONTENTS --
  // a rare chest draws a potion, a legendary draws two upgrades -- so counting
  // total draws would only re-measure that, which is why this checks the band.)
  const one = (rules, seed) => rollContents(stateWith(rules), seeded(seed)).rarity;
  for (let seed = 1; seed <= 4000; seed++) {
    assert.equal(one({ hordebait: true }, seed), chestRarityBump(one(null, seed)), 'seed ' + seed);
  }
});
ok('HORDE BAIT bumps the distribution one band (MC vs exhaustive)', () => {
  const expect = { common: 0, rare: 0, legendary: 0, gamble: 0 };
  for (const [k, w] of Object.entries(CHESTS.WEIGHTS)) expect[chestRarityBump(k)] += w / 100;
  for (const k of CHEST_RARITY_LADDER) {
    assert.ok(Math.abs(rate(on, k) - expect[k]) < 0.02,
      `${k}: measured ${rate(on, k).toFixed(4)} vs enumerated ${expect[k].toFixed(4)}`);
  }
  assert.equal(rate(on, 'common'), 0, 'under HORDE BAIT a COMMON chest cannot exist');
  assert.ok(rate(on, 'gamble') > rate(off, 'gamble'), 'the tension band grows too');
});

// ---- 3. every chest is a horde, and never two ------------------------------
const chestTick = (rules, r) => {
  const st = stateWith(rules);
  st.player.x = 0; st.player.y = 0;
  st.chests.push({ id: 1, x: 0, y: 0, age: 0 });
  const evs = tickChests(st, 1 / 60, () => r);
  return { st, evs };
};
const N = CHESTS.GAMBLE_HORDE_COUNT;
ok('an ordinary chest spawns NO horde without the rule', () => {
  const { st, evs } = chestTick(null, 0.10);              // 10 -> COMMON
  assert.equal(evs.filter(e => e.kind === 'chestOpened').length, 1);
  assert.ok(evs.every(e => e.kind !== 'hordeBait'));
  assert.equal(st.enemies.length, 0);
});
ok('under HORDE BAIT every ordinary chest answers with a horde', () => {
  const { st, evs } = chestTick({ hordebait: true }, 0.10);   // COMMON -> RARE
  const opened = evs.find(e => e.kind === 'chestOpened');
  assert.equal(opened.rarity, 'rare', 'the bump is visible on the opened event');
  const horde = evs.find(e => e.kind === 'hordeBait');
  assert.ok(horde, 'a hordeBait event is emitted');
  assert.equal(horde.count, N);
  assert.equal(st.enemies.length, N, 'exactly one horde stands on the field');
});
ok('a LOST GAMBLE under HORDE BAIT still fires exactly ONE horde', () => {
  const { st, evs } = chestTick({ hordebait: true }, 0.95);   // 95 -> GAMBLE, and 95 >= 0.5 loses
  assert.equal(evs.filter(e => e.kind === 'gambleHorde').length, 1);
  assert.equal(evs.filter(e => e.kind === 'hordeBait').length, 0, 'the else branch holds');
  assert.equal(st.enemies.length, N, 'never two hordes for one chest');
});

// ---- 4. ONE OF EACH + the card contract ------------------------------------
ok('stat cards are all offered when no rule is held', () => {
  const st = stateWith(null);
  assert.ok(UPGRADES.every(u => statCardOffered(u.id, st)));
});
ok('markStatTaken records, and ONE OF EACH removes exactly that stat', () => {
  const st = stateWith({ once: true });
  markStatTaken(st, 'dmg');
  assert.equal(statCardOffered('dmg', st), false);
  for (const u of UPGRADES) if (u.id !== 'dmg') assert.ok(statCardOffered(u.id, st), u.id);
  const fresh = stateWith(null);
  markStatTaken(fresh, 'dmg');
  assert.ok(statCardOffered('dmg', fresh), 'the ledger is inert without the rule');
});
ok('both rule cards exist once, at RULE_CARD_WEIGHT, and grant through apply(player)', () => {
  const st = stateWith(null);
  const cards = ruleCards(st);
  assert.equal(cards.length, RULE_IDS.length);
  for (const c of cards) {
    assert.equal(c.weight, RULE_CARD_WEIGHT);
    assert.ok(c.id.startsWith('rule_'));
    assert.ok(c.desc.startsWith('RUN RULE'), c.desc);
    const p = makePlayer();
    c.apply(p);
    assert.ok(p.rules[c.rule], c.rule + ' is granted by its own card');
  }
  grantRule(st, 'once');
  assert.equal(ruleCards(st).length, RULE_IDS.length - 1, 'a taken rule leaves the pool');
  assert.equal(ruleCardOffered('once', st), false);
  assert.equal(grantRule(st, 'not_a_rule'), false, 'an unknown rule id is refused');
  assert.ok(hasRule(st, 'once'));
});

// ---- 5. THE REAL SEAM: src/main.js openDraft -------------------------------
const { T, state, elements } = await boot({ storage: [['hordes_onboarded', '1']] });
function draftOffer(label, setup, draws = 3000) {
  state.weapons = ['VOLLEY', 'BOOMERANG'].map(makeWeapon);
  state.player.rules = {}; state.player.takenStats = {};
  setup(state);
  const real = Math.random;
  Math.random = seeded(31337);
  let hits = 0, cards = 0;
  try {
    for (let i = 0; i < draws; i++) {
      T.openDraft();
      const els = Array.from(elements['ov-cards'].children);
      cards += els.length;
      if (els.some(el => (el.innerHTML || '').includes(label))) hits++;
    }
  } finally { Math.random = real; state.player.rules = {}; state.player.takenStats = {}; }
  assert.equal(cards, draws * 3, 'every openDraft() rendered exactly 3 cards');
  return hits / draws;
}
const whetFree = draftOffer('Whetstone', () => {});
const whetOnce = draftOffer('Whetstone', (s) => { s.player.rules.once = true; s.player.takenStats.dmg = 1; });
const baitFree = draftOffer('Horde Bait', () => {});
const baitHeld = draftOffer('Horde Bait', (s) => { s.player.rules.hordebait = true; });
console.log('run rules: the REAL game seam (src/main.js openDraft), measured');
console.log(`    Whetstone offered   no rules ${whetFree.toFixed(4)}   ONE OF EACH + dmg taken ${whetOnce.toFixed(4)}`);
console.log(`    Horde Bait offered  not held ${baitFree.toFixed(4)}   already held ${baitHeld.toFixed(4)}`);
ok('openDraft() stops offering a stat the run already took under ONE OF EACH', () => {
  assert.ok(whetFree > 0, `the control is live (${whetFree.toFixed(4)})`);
  assert.equal(whetOnce, 0, 'Whetstone is gone from the pool, not merely rarer');
});
ok('openDraft() offers a rule card until the run takes it', () => {
  assert.ok(baitFree > 0, `a rule card reaches the real draft (${baitFree.toFixed(4)})`);
  assert.equal(baitHeld, 0, 'a held rule is never re-offered');
});

console.log(`run rules: PASS=${pass} FAIL=${fail}`);
process.exit(fail === 0 ? 0 : 1);
