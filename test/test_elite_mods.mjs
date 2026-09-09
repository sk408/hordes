// Elite modifier unit tests — pure logic, no DOM.
// Run: node test/test_elite_mods.mjs
import assert from 'node:assert/strict';
import {
  ELITE_MODS, ELITE_MOD_IDS, ELITE_MOD_CHANCE, SPLIT_OFFSETS,
  rollEliteModifier, applyEliteModifier, splitChildren,
} from '../src/elite_mods.js';
import { makeTypedEnemy } from '../src/enemy_types.js';

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`  ok - ${name}`);
}

// rng stub with a scripted sequence (loot.js test convention)
function seqRng(...values) {
  let i = 0;
  const rng = () => values[Math.min(i++, values.length - 1)];
  return rng;
}

// --- modifier table shape + numbers -------------------------------------------
check('three modifiers with the shared shape and tuned numbers', () => {
  assert.deepEqual([...ELITE_MOD_IDS], ['SWIFT', 'SPLITTING', 'VAMPIRIC']);
  for (const id of ELITE_MOD_IDS) {
    const m = ELITE_MODS[id];
    assert.equal(m.id, id);
    assert.ok(m.name && m.desc, `${id} named + described`);
    assert.ok(typeof m.speedMult === 'number' && m.speedMult > 0);
    assert.ok(typeof m.hpMult === 'number' && m.hpMult > 0);
    assert.equal(m.dropGuaranteed, true, `${id}: guaranteed drop is part of the deal`);
    assert.ok(m.visual, `${id}: render tell flag`);
  }
  // SWIFT: +70% speed, slight hp cut
  assert.equal(ELITE_MODS.SWIFT.speedMult, 1.7);
  assert.ok(ELITE_MODS.SWIFT.hpMult < 1 && ELITE_MODS.SWIFT.hpMult >= 0.7, 'slight hp cut');
  assert.equal(ELITE_MODS.SWIFT.onDeathSplit, null);
  assert.equal(ELITE_MODS.SWIFT.lifesteal, 0);
  // SPLITTING: dies into 2 copies at 30% hp
  assert.deepEqual(ELITE_MODS.SPLITTING.onDeathSplit, { count: 2, hpFrac: 0.3, sizeMult: 0.6 });
  assert.equal(ELITE_MODS.SPLITTING.lifesteal, 0);
  // VAMPIRIC: steals a fraction of contact damage as healing
  assert.equal(ELITE_MODS.VAMPIRIC.lifesteal, 0.5);
  assert.equal(ELITE_MODS.VAMPIRIC.onDeathSplit, null);
});

// --- gating: locked NEVER returns, even at rng extremes -------------------------
check('nothing unlocked -> always nil, at every rng extreme', () => {
  assert.equal(rollEliteModifier(seqRng(0.0), []), null);
  assert.equal(rollEliteModifier(seqRng(0.0, 0.0), []), null);
  assert.equal(rollEliteModifier(seqRng(0.99), []), null);
  assert.equal(rollEliteModifier(seqRng(0.0, 0.99), ['NOPE', 'GARBAGE']), null,
    'unknown ids are not modifiers');
});

check('locked ids NEVER roll — only the unlocked set is reachable', () => {
  // only SWIFT unlocked: every possible rng outcome is SWIFT or null
  for (let a = 0; a < 10; a++) for (let b = 0; b < 10; b++) {
    const m = rollEliteModifier(seqRng(a / 10, b / 10), ['SWIFT']);
    assert.ok(m === null || m.id === 'SWIFT', `rng ${a / 10},${b / 10} leaked ${m && m.id}`);
  }
  // duplicates in the unlocked list don't skew or crash
  const dup = rollEliteModifier(seqRng(0.0, 0.99), ['SWIFT', 'SWIFT', 'SWIFT']);
  assert.equal(dup.id, 'SWIFT');
});

// --- roll behavior: fail band + uniform pick ------------------------------------
check('fail roll consumes the first rng; success picks uniformly from the pool', () => {
  assert.equal(ELITE_MOD_CHANCE, 0.5);
  // first draw >= CHANCE -> no modifier
  assert.equal(rollEliteModifier(seqRng(0.5), ELITE_MOD_IDS), null);
  assert.equal(rollEliteModifier(seqRng(0.99), ELITE_MOD_IDS), null);
  // first draw < CHANCE, second draw picks index (clamped)
  assert.equal(rollEliteModifier(seqRng(0.0, 0.0), ELITE_MOD_IDS).id, 'SWIFT');
  assert.equal(rollEliteModifier(seqRng(0.0, 0.4), ELITE_MOD_IDS).id, 'SPLITTING');
  assert.equal(rollEliteModifier(seqRng(0.0, 0.99), ELITE_MOD_IDS).id, 'VAMPIRIC',
    '0.999 roll clamps to the last unlocked modifier');
});

check('distribution: a uniform sweep hits every unlocked id and the fail band', () => {
  const seen = new Set();
  let nils = 0, total = 0;
  for (let i = 0; i < 200; i++) {
    const m = rollEliteModifier(seqRng(i / 200, (i * 7) % 100 / 100), ELITE_MOD_IDS);
    total++;
    if (m) seen.add(m.id); else nils++;
  }
  assert.deepEqual([...seen].sort(), ['SPLITTING', 'SWIFT', 'VAMPIRIC'], 'all three reachable');
  assert.ok(nils > total * 0.3 && nils < total * 0.7, `fail band ~CHANCE (got ${nils}/${total})`);
});

// --- spawn stamp -----------------------------------------------------------------
check('applyEliteModifier stamps SWIFT numbers without touching the enemy', () => {
  const e = makeTypedEnemy('CHASER', 0, 0, 0);
  const snap = JSON.stringify(e);
  const stamp = applyEliteModifier(e, 'SWIFT');
  assert.equal(stamp.eliteMod, 'SWIFT');
  assert.ok(Math.abs(stamp.speed - e.speed * 1.7) < 1e-9, 'speed x1.7');
  assert.ok(Math.abs(stamp.hp - e.hp * 0.8) < 1e-9, 'hp x0.8');
  assert.ok(Math.abs(stamp.maxHp - e.maxHp * 0.8) < 1e-9);
  assert.equal(stamp.split, null);
  assert.equal(stamp.lifesteal, 0);
  assert.equal(stamp.dropGuaranteed, true);
  assert.equal(stamp.visual, 'afterimage');
  assert.equal(JSON.stringify(e), snap, 'enemy NOT mutated (hb1 does the stamping)');
});

check('stamps work for every modifier and accept ids or descriptors', () => {
  for (const id of ELITE_MOD_IDS) {
    const e = makeTypedEnemy('BRUTE', 0, 0, 30);
    const a = applyEliteModifier(e, id);
    const b = applyEliteModifier(e, ELITE_MODS[id]);
    assert.deepEqual(a, b, `${id}: id and descriptor paths agree`);
    assert.equal(a.eliteMod, id);
    assert.equal(a.dropGuaranteed, true);
  }
  const vamp = applyEliteModifier(makeTypedEnemy('TICK', 0, 0, 0), 'VAMPIRIC');
  assert.equal(vamp.lifesteal, 0.5);
  assert.equal(vamp.speed, makeTypedEnemy('TICK', 0, 0, 0).speed, 'VAMPIRIC: no speed change');
  // the split stamp carries the once-only guard data
  const spl = applyEliteModifier(makeTypedEnemy('BRUTE', 0, 0, 0), 'SPLITTING');
  assert.deepEqual(spl.split, { count: 2, hpFrac: 0.3, sizeMult: 0.6, spent: false });
  // garbage in, null out
  assert.equal(applyEliteModifier(makeTypedEnemy('CHASER', 0, 0, 0), 'NOPE'), null);
  assert.equal(applyEliteModifier(null, 'SWIFT'), null);
});

// --- the death split ---------------------------------------------------------------
check('splitChildren: two plain copies at 30% hp, scattered, smaller', () => {
  const parent = { ...makeTypedEnemy('BRUTE', 100, 50, 60) };
  Object.assign(parent, applyEliteModifier(parent, 'SPLITTING'));
  const kids = splitChildren(parent);
  assert.equal(kids.length, 2);
  for (const k of kids) {
    assert.equal(k.typeId, 'BRUTE', 'same type as the parent');
    assert.ok(Math.abs(k.hp - parent.maxHp * 0.3) < 1e-9, '30% of parent maxHp');
    assert.equal(k.maxHp, k.hp);
    assert.equal(k.eliteMod, null, 'children carry NO modifier — no recursive splits');
    assert.equal(k.splitSpent, false);
    assert.ok(k.w < parent.w && k.h < parent.h, 'smaller copies');
  }
  assert.notDeepEqual([kids[0].x, kids[0].y], [kids[1].x, kids[1].y], 'scattered apart');
  assert.ok(Math.abs(kids[0].x - parent.x - SPLIT_OFFSETS[0].dx) < 1e-9);
  // parent untouched (pure) — hb1 marks splitSpent itself
  assert.equal(parent.splitSpent, undefined);
});

check('split is ONCE ONLY: spent parents and non-splitters get nothing', () => {
  const e = makeTypedEnemy('BRUTE', 0, 0, 0);
  assert.equal(splitChildren(e), null, 'plain enemy: no split');
  const swift = { ...e };
  Object.assign(swift, applyEliteModifier(swift, 'SWIFT'));
  assert.equal(splitChildren(swift), null, 'SWIFT elite: no split');
  const spent = { ...e, eliteMod: 'SPLITTING', splitSpent: true };
  assert.equal(splitChildren(spent), null, 'already-split parent: the once-only guard');
  const fresh = { ...e, eliteMod: 'SPLITTING', splitSpent: false };
  assert.ok(splitChildren(fresh), 'fresh splitting parent splits');
});

console.log(`\n${passed} assertion groups passed — test_elite_mods OK`);
