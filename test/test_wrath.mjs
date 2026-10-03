// HORDES - wrath (src/wrath.js): the horde answers the build. Every weapon
// evolution and every item slot filled raises it; it multiplies enemy health,
// damage and arrival rate. It is what is left of the heat system: the dial,
// its payouts and its readouts are gone.
//   pure:   the sources and their costs, the cap, the multipliers, the ledger's
//           hygiene (duplicate ids, a full ledger, negative amounts, free swaps)
//   live:   a new item slot and an evolution charge it; nothing pays for it;
//           the intermission has no stakes card; a new run starts at zero
// Run: node test/test_wrath.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  WRATH_CAP, WRATH_SOURCES, WRATH_CURVES, wrathMultipliers, wrathOf, initWrath, addWrath, describeWrath,
} from '../src/wrath.js';
import * as WRATH from '../src/wrath.js';
import { suite, boot } from './_harness.mjs';

const s = suite('test_wrath');
const run = () => ({ wrath: { total: 0, events: new Set() } });
const has = (r, id) => r.wrath.events.has(id);

// ------------------------------------------------------------- pure
s.check('three sources: an evolution +2, a new item slot +1, an item exchange +0 (the anti-runaway guard)', () => {
  assert.deepEqual(Object.keys(WRATH_SOURCES).sort(), ['ITEM_EXCHANGE', 'NEW_ITEM_SLOT', 'WEAPON_EVOLUTION']);
  assert.equal(WRATH_SOURCES.ITEM_EXCHANGE.amount, 0);
  const r = run();
  assert.equal(addWrath(r, 'WEAPON_EVOLUTION').added, 2);
  assert.equal(addWrath(r, 'NEW_ITEM_SLOT').added, 1);
  for (let i = 0; i < 50; i++) assert.equal(addWrath(r, 'ITEM_EXCHANGE').added, 0);
  assert.equal(wrathOf(r), 3, '50 swaps move nothing');
});

s.check('nothing of the dial is left: no manual source, no gold or xp payout', () => {
  assert.equal(WRATH_SOURCES.MANUAL_PUSH, undefined);
  assert.equal(addWrath(run(), 'MANUAL_PUSH').applied, false);
  assert.deepEqual(Object.keys(WRATH_CURVES).sort(), ['DAMAGE', 'HP', 'SPAWN_RATE']);
  assert.deepEqual(Object.keys(wrathMultipliers(5)).sort(), ['damage', 'hp', 'spawnRate']);
  for (const gone of ['goldMult', 'heatXpMult', 'manualPushes', 'describeHeatPayout']) assert.equal(WRATH[gone], undefined, gone);
});

s.check('the multipliers: hp 1+0.12t, damage 1+0.08t, arrivals 1+0.06t; rising with wrath', () => {
  assert.deepEqual(wrathMultipliers(0), { hp: 1, damage: 1, spawnRate: 1 });
  const m = wrathMultipliers(3);
  assert.ok(Math.abs(m.hp - 1.36) < 1e-9 && Math.abs(m.damage - 1.24) < 1e-9 && Math.abs(m.spawnRate - 1.18) < 1e-9);
  let prev = wrathMultipliers(0);
  for (let t = 1; t <= WRATH_CAP; t++) {
    const cur = wrathMultipliers(t);
    assert.ok(cur.hp > prev.hp && cur.damage > prev.damage && cur.spawnRate > prev.spawnRate);
    prev = cur;
  }
  assert.deepEqual(wrathMultipliers(-4), wrathMultipliers(0), 'never below the base');
  assert.deepEqual(wrathMultipliers(undefined), wrathMultipliers(0));
});

s.check('the cap: wrath stops at ' + WRATH_CAP + '; what does not fit is dropped; a partial fill reports it', () => {
  const r = run();
  for (let i = 0; i < 9; i++) addWrath(r, 'WEAPON_EVOLUTION');
  addWrath(r, 'NEW_ITEM_SLOT');
  assert.equal(wrathOf(r), 19);
  const res = addWrath(r, 'WEAPON_EVOLUTION', null, 'evo:ZAP:2');
  assert.deepEqual([res.added, res.reason, wrathOf(r)], [1, 'cap', WRATH_CAP]);
  assert.ok(has(r, 'evo:ZAP:2'), 'a partial charge records its id');
  const full = addWrath(r, 'NEW_ITEM_SLOT', null, 'slot:9');
  assert.deepEqual([full.applied, full.added, full.reason], [true, 0, 'cap']);
  assert.ok(!has(r, 'slot:9'), 'a charge that moved nothing does not burn its id');
});

s.check('an event id charges once; an explicit amount overrides the cost; negatives charge nothing', () => {
  const r = run();
  assert.equal(addWrath(r, 'WEAPON_EVOLUTION', null, 'evo:A').added, 2);
  const dup = addWrath(r, 'WEAPON_EVOLUTION', null, 'evo:A');
  assert.deepEqual([dup.applied, dup.reason, wrathOf(r)], [false, 'duplicate', 2]);
  assert.equal(addWrath(r, 'NEW_ITEM_SLOT', 5).added, 5);
  const neg = addWrath(r, 'NEW_ITEM_SLOT', -5, 'neg');
  assert.deepEqual([neg.added, neg.reason, wrathOf(r)], [0, 'cap', 7]);
  assert.ok(!has(r, 'neg'));
  const swap = addWrath(r, 'ITEM_EXCHANGE', null, 'swap:1');
  assert.deepEqual([swap.applied, swap.added, swap.reason], [true, 0, 'ok']);
  assert.ok(!has(r, 'swap:1'), 'a free exchange does not burn an event id');
});

s.check('an unknown source is rejected; a bare run gets its ledger on first use; only run.wrath is touched', () => {
  const bare = { time: 12, player: { hp: 5 } };
  assert.equal(wrathOf(bare), 0);
  assert.equal(wrathOf(null), 0);
  const bad = addWrath(bare, 'NOT_A_SOURCE', null, 'x');
  assert.deepEqual([bad.applied, bad.reason], [false, 'source']);
  assert.equal(bare.wrath, undefined, 'a rejected source creates nothing');
  addWrath(bare, 'WEAPON_EVOLUTION');
  assert.equal(wrathOf(bare), 2);
  assert.deepEqual({ ...bare, wrath: null }, { time: 12, player: { hp: 5 }, wrath: null });
  assert.equal(initWrath(bare), bare.wrath, 'init is idempotent');
});

s.check('the readout is one line', () => {
  assert.equal(describeWrath(0), 'WRATH 0 (+0% foe HP)');
  assert.equal(describeWrath(3), 'WRATH 3 (+36% foe HP)');
});

// ------------------------------------------------------------- live
const h = await boot({ storage: [['hordes_onboarded', '1']] });
const T = h.T, st = T.state;
T.banners.suppressAll();
const fresh = () => { st.mode = 'menu'; T.startRun(); st.enemies.length = 0; st.spawnTimer = 1e9; };

s.check('a run starts at zero wrath, with nothing of heat or a mode on its state', () => {
  fresh();
  assert.deepEqual({ total: st.wrath.total, events: st.wrath.events.size }, { total: 0, events: 0 });
  assert.equal(st.heat, undefined);
  assert.equal(st.challenge, undefined);
  assert.equal(T.caps.weaponCap > 1, true);
  assert.equal(T.caps.potionCap > 0, true);
});

s.check('the intermission has no RAISE THE STAKES card, and the run award has no stakes or modifier term', () => {
  fresh();
  st.wave.cinePending = false;
  T.travel.intermission();
  const names = h.elements['ov-cards'].children.map(c => c.innerHTML || '');
  assert.ok(names.some(x => />CONTINUE</.test(x)));
  assert.ok(!names.some(x => /STAKES|heat/i.test(x)), names.join(' | ').slice(0, 300));
  const r = T.purse.settle();
  assert.deepEqual(Object.keys(r.goldPool).sort(), ['auto', 'base', 'total']);
  assert.equal(r.goldPool.total, 1);
});

s.check('wrath toughens what arrives: the same enemy has 36% more health at wrath 3', () => {
  fresh();
  const hpAt = (t) => { st.wrath.total = t; const b = T.bossRules.spawnBoss(); const hp = st.wave.bosses[0].maxHp; st.enemies.length = 0; st.wave.bosses = []; return hp; };
  const base = hpAt(0), hot = hpAt(3);
  assert.ok(Math.abs(hot / base - 1.36) < 1e-9, hot + ' / ' + base);
});

s.check('the source says wrath: no heat module, no challenge module, no mode on the pre-run screen', () => {
  assert.ok(!fs.existsSync(new URL('../src/heat.js', import.meta.url)));
  assert.ok(!fs.existsSync(new URL('../src/challenges.js', import.meta.url)));
  const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  for (const gone of ["menuCard('RAISE THE STAKES'", 'MODIFIER:', 'pendingChallenge', 'state.challenge', 'heatOf(', 'manualPushes(']) {
    assert.ok(!main.includes(gone), gone + ' is still in main.js');
  }
  T.menus.showPreRun();
  const cards = h.elements['ov-cards'].children.map(c => c.innerHTML || '');
  assert.ok(!cards.some(x => /MODIFIER/.test(x)), 'no MODIFIER card');
  assert.ok(cards.some(x => />START</.test(x)) && cards.some(x => /STAGE: /.test(x)) && cards.some(x => />QUESTS</.test(x)));
});

s.done();
