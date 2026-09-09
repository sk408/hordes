// HORDES — unit tests for src/evolutions.js (node, no DOM, no framework).
import assert from 'node:assert';
import {
  EVOLUTION_DEFS, EVOLUTION_TOKEN_COST, evolveWeapon, describeEvolution,
} from '../src/evolutions.js';
import { WEAPON_MAX_LEVEL, WEAPON_NAMES, makeWeapon } from '../src/weapons.js';
import { AFFIX_POOL } from '../src/loot.js';

const KINDS = new Set(AFFIX_POOL.map(a => a.id));
const seam = new Set(['damageMult', 'rateMult', 'crit', 'critMult']);

// A max-level weapon with everything satisfied.
function maxed(type) {
  const w = makeWeapon(type);
  w.level = WEAPON_MAX_LEVEL;
  return w;
}

// ---------- table shape: every archetype has exactly one evolution ----------
{
  for (const id of Object.keys(WEAPON_NAMES)) {
    assert.ok(EVOLUTION_DEFS[id], `archetype ${id} has an evolution`);
    const d = EVOLUTION_DEFS[id];
    assert.strictEqual(d.weapon, id, `${id} def points at its own weapon`);
    assert.ok(d.name.length > 3, `${id} evolution has a name`);
    assert.ok(d.desc.length > 20, `${id} evolution has flavor text`);
    assert.ok(KINDS.has(d.itemKind), `${id} itemKind '${d.itemKind}' exists in loot AFFIX_POOL`);
    assert.ok(d.flags.length >= 1 && d.flags.length <= 2, `${id} has 1..2 behavior flags`);
    for (const f of d.affixes && Object.keys(d.affixes)) assert.ok(seam.has(f), `${id} affix '${f}' on the loot seam`);
    assert.ok(!('damageMult' in d.affixes && d.affixes.damageMult < 1), `${id} damageMult is a buff`);
  }
  // Distinct ids / names / item kinds (one kind per weapon — 9 for 9).
  const ids = Object.values(EVOLUTION_DEFS).map(d => d.id);
  assert.strictEqual(new Set(ids).size, ids.length, 'evolution ids unique');
  const names = Object.values(EVOLUTION_DEFS).map(d => d.name);
  assert.strictEqual(new Set(names).size, names.length, 'evolution names unique');
  const kinds = Object.values(EVOLUTION_DEFS).map(d => d.itemKind);
  assert.strictEqual(new Set(kinds).size, kinds.length, 'item kinds distinct (loose 1:1 pairing)');
  console.log('ok: all archetypes covered; names/kinds distinct; flags + affixes within contract');
}

// ---------- success: level + item + token ----------
{
  const w = maxed('BOOMERANG');
  const res = evolveWeapon(w, ['damageMult', 'crit'], 1);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.weapon, w, 'returns the SAME instance (levelUpWeapon precedent)');
  assert.strictEqual(res.name, EVOLUTION_DEFS.BOOMERANG.name);
  assert.strictEqual(w.evolutionId, 'VOID_RANG');
  assert.strictEqual(w.evolution.itemKind, 'damageMult');
  assert.deepStrictEqual(w.evolution.flags, ['pierceAll', 'voidPull']);
  assert.strictEqual(res.tokens, 1 - EVOLUTION_TOKEN_COST, 'token spent on success');
  assert.strictEqual(EVOLUTION_TOKEN_COST, 1, 'documented cost is 1');
  // def copy is isolated: mutating the instance copy must not touch the table
  w.evolution.affixes.damageMult = 99;
  assert.strictEqual(EVOLUTION_DEFS.BOOMERANG.affixes.damageMult, 1.6, 'instance def is a copy');
  console.log('ok: evolve succeeds, mutates in place, spends exactly one token');
}

// ---------- each requirement fails with its own reason, no mutation ----------
{
  // level: Lv7 is not enough.
  const w = maxed('ZAP'); w.level = WEAPON_MAX_LEVEL - 1;
  let r = evolveWeapon(w, ['critMult'], 5);
  assert.strictEqual(r.ok, false); assert.strictEqual(r.reason, 'level');
  assert.ok(!w.evolutionId, 'failed evolve leaves the weapon untouched');

  // item: right level, wrong kind equipped.
  const w2 = maxed('ZAP');
  r = evolveWeapon(w2, ['crit', 'damageMult'], 5);
  assert.strictEqual(r.reason, 'item');
  assert.ok(!w2.evolutionId);

  // token: everything but the token.
  const w3 = maxed('ZAP');
  r = evolveWeapon(w3, ['critMult'], 0);
  assert.strictEqual(r.reason, 'token');
  assert.ok(!w3.evolutionId);
  r = evolveWeapon(w3, ['critMult']);   // missing count reads as 0, not NaN-spends
  assert.strictEqual(r.reason, 'token');
  assert.ok(!w3.evolutionId);

  // unknown type.
  r = evolveWeapon({ type: 'NOT_A_WEAPON', level: 8 }, ['crit'], 5);
  assert.strictEqual(r.reason, 'type');
  r = evolveWeapon(null, [], 5);
  assert.strictEqual(r.reason, 'type');

  // Set input for equippedItemKinds works like an array.
  const w4 = maxed('ZAP');
  r = evolveWeapon(w4, new Set(['critMult']), 1);
  assert.strictEqual(r.ok, true, 'Set kinds are accepted');

  // check order: level is reported before item/token.
  const w5 = maxed('MINE'); w5.level = 1;
  assert.strictEqual(evolveWeapon(w5, [], 0).reason, 'level');
  console.log('ok: level/item/token/type failures each reported, weapon never mutated');
}

// ---------- idempotence: no double-evolve, no double-spend ----------
{
  const w = maxed('MINE');
  const first = evolveWeapon(w, ['thorns'], 2);
  assert.strictEqual(first.ok, true);
  assert.strictEqual(first.tokens, 1);
  const second = evolveWeapon(w, ['thorns'], 1);
  assert.strictEqual(second.ok, false);
  assert.strictEqual(second.reason, 'evolved');
  assert.strictEqual(second.tokens, undefined, 'no token info on a no-op');
  assert.strictEqual(w.evolutionId, 'VOLCANIC_FIELD', 'still the FIRST evolution');
  console.log('ok: second evolve is a no-op (no re-roll, no spend)');
}

// ---------- describeEvolution: UI cards ----------
{
  // By instance (pre-evolved): requirement card.
  const card = describeEvolution(maxed('BEAM'));
  assert.strictEqual(card.id, 'GODLANCE');
  assert.strictEqual(card.weaponName, WEAPON_NAMES.BEAM);
  assert.strictEqual(card.levelReq, WEAPON_MAX_LEVEL);
  assert.strictEqual(card.tokenCost, EVOLUTION_TOKEN_COST);
  assert.strictEqual(card.itemKind, 'xpMult');
  assert.strictEqual(card.itemKindName, 'Scholar\'s Mind');
  assert.strictEqual(card.evolved, false);

  // By instance (evolved): marked achieved.
  const w = maxed('SCYTHE');
  evolveWeapon(w, ['lifesteal'], 1);
  const done = describeEvolution(w);
  assert.strictEqual(done.evolved, true);
  assert.strictEqual(done.name, 'Grave Harvest');

  // By bare id string.
  assert.strictEqual(describeEvolution('VOLLEY').name, 'Nova Shot');
  assert.strictEqual(describeEvolution('NOPE'), null, 'unknown id renders nothing');
  assert.strictEqual(describeEvolution(null), null);
  console.log('ok: describeEvolution cards carry requirements + achieved state');
}

console.log('test_evolution: all assertions passed');
