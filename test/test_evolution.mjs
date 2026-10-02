// HORDES — unit tests for src/evolutions.js (node, no DOM, no framework).
// Every weapon has an evolution; it needs max level plus its PARTNER card
// (a common stat card from config.js UPGRADES). No token, no item roll.
import assert from 'node:assert';
import {
  EVOLUTION_DEFS, evolveWeapon, describeEvolution, evolutionProgress,
  partnerName, weaponsOpenedBy,
} from '../src/evolutions.js';
import { WEAPON_MAX_LEVEL, WEAPON_NAMES, makeWeapon } from '../src/weapons.js';
import { UPGRADES } from '../src/config.js';

const CARD_IDS = new Set(UPGRADES.map(u => u.id));
const seam = new Set(['damageMult', 'rateMult', 'crit', 'critMult']);

function maxed(type) {
  const w = makeWeapon(type);
  w.level = WEAPON_MAX_LEVEL;
  return w;
}

// ---------- table shape: every weapon has exactly one evolution ----------
{
  for (const id of Object.keys(WEAPON_NAMES)) {
    assert.ok(EVOLUTION_DEFS[id], `weapon ${id} has an evolution`);
    const d = EVOLUTION_DEFS[id];
    assert.strictEqual(d.weapon, id, `${id} def points at its own weapon`);
    assert.ok(d.name.length > 3, `${id} evolution has a name`);
    assert.ok(d.desc.length > 20, `${id} evolution says what it does`);
    assert.ok(CARD_IDS.has(d.partner), `${id} partner '${d.partner}' is a common stat card`);
    assert.strictEqual(d.flags.length, 2, `${id} has 2 behaviour flags`);
    for (const f of Object.keys(d.affixes)) assert.ok(seam.has(f), `${id} affix '${f}' on the loot seam`);
    assert.ok(d.affixes.damageMult >= 1.3, `${id} evolution is a real damage spike (x${d.affixes.damageMult})`);
  }
  for (const id of ['JAVELIN', 'EMBER', 'RICOCHET', 'METEOR']) {
    assert.ok(EVOLUTION_DEFS[id], `${id} evolves now`);
  }
  assert.strictEqual(EVOLUTION_DEFS.JAVELIN.id, 'SOLAR_LANCE');
  assert.strictEqual(EVOLUTION_DEFS.EMBER.id, 'INFERNO');
  assert.strictEqual(EVOLUTION_DEFS.RICOCHET.id, 'PRISM_SHOT');
  assert.strictEqual(EVOLUTION_DEFS.METEOR.id, 'METEOR_STORM');
  const ids = Object.values(EVOLUTION_DEFS).map(d => d.id);
  assert.strictEqual(new Set(ids).size, ids.length, 'evolution ids unique');
  const names = Object.values(EVOLUTION_DEFS).map(d => d.name);
  assert.strictEqual(new Set(names).size, names.length, 'evolution names unique');
  // Every common stat card is somebody's partner, and no card carries more
  // than two weapons (the draft stays readable).
  for (const u of UPGRADES) {
    const opened = weaponsOpenedBy(u.id);
    assert.ok(opened.length >= 1 && opened.length <= 2, `${u.name} opens 1-2 evolutions (got ${opened.length})`);
  }
  assert.strictEqual(partnerName('multi'), 'Split Shot');
  assert.strictEqual(partnerName('nope'), 'nope');
  console.log('ok: 13 weapons covered; partners are common cards; names unique');
}

// ---------- success: max level + partner card ----------
{
  const w = maxed('BOOMERANG');
  const res = evolveWeapon(w, { dmg: 1, hp: 1 });   // the takenStats ledger shape
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.weapon, w, 'returns the SAME instance (levelUpWeapon precedent)');
  assert.strictEqual(res.name, EVOLUTION_DEFS.BOOMERANG.name);
  assert.strictEqual(w.evolutionId, 'VOID_RANG');
  assert.deepStrictEqual(w.evolution.flags, ['pierceAll', 'voidPull']);
  w.evolution.affixes.damageMult = 99;
  assert.strictEqual(EVOLUTION_DEFS.BOOMERANG.affixes.damageMult, 2.0, 'instance def is a copy');
  // Set and array ledgers work the same.
  assert.strictEqual(evolveWeapon(maxed('ZAP'), new Set(['pierce'])).ok, true);
  assert.strictEqual(evolveWeapon(maxed('ZAP'), ['pierce']).ok, true);
  console.log('ok: evolve succeeds and mutates in place');
}

// ---------- each requirement fails with its own reason, no mutation ----------
{
  const w = maxed('ZAP'); w.level = WEAPON_MAX_LEVEL - 1;
  let r = evolveWeapon(w, { pierce: 1 });
  assert.strictEqual(r.ok, false); assert.strictEqual(r.reason, 'level');
  assert.ok(!w.evolutionId, 'failed evolve leaves the weapon untouched');

  const w2 = maxed('ZAP');
  r = evolveWeapon(w2, { dmg: 1, multi: 1 });
  assert.strictEqual(r.reason, 'partner');
  assert.ok(!w2.evolutionId);
  r = evolveWeapon(w2);
  assert.strictEqual(r.reason, 'partner', 'no ledger reads as no partner');

  r = evolveWeapon({ type: 'NOT_A_WEAPON', level: 8 }, { dmg: 1 });
  assert.strictEqual(r.reason, 'type');
  r = evolveWeapon(null, {});
  assert.strictEqual(r.reason, 'type');

  const w5 = maxed('MINE'); w5.level = 1;
  assert.strictEqual(evolveWeapon(w5, {}).reason, 'level', 'level is reported before partner');
  console.log('ok: level/partner/type failures each reported, weapon never mutated');
}

// ---------- idempotence ----------
{
  const w = maxed('MINE');
  assert.strictEqual(evolveWeapon(w, { hp: 1 }).ok, true);
  const second = evolveWeapon(w, { hp: 1 });
  assert.strictEqual(second.ok, false);
  assert.strictEqual(second.reason, 'evolved');
  assert.strictEqual(w.evolutionId, 'VOLCANIC_FIELD', 'still the FIRST evolution');
  console.log('ok: second evolve is a no-op');
}

// ---------- evolutionProgress: what the draft card shows ----------
{
  const w = makeWeapon('VOLLEY'); w.level = 5;
  let pr = evolutionProgress(w, {});
  assert.strictEqual(pr.partner, 'multi');
  assert.strictEqual(pr.partnerName, 'Split Shot');
  assert.strictEqual(pr.partnerOwned, false);
  assert.strictEqual(pr.levelsLeft, 3);
  assert.strictEqual(pr.ready, false);
  pr = evolutionProgress(w, { multi: 1 });
  assert.strictEqual(pr.partnerOwned, true);
  assert.strictEqual(pr.ready, false, 'partner owned but 3 levels short');
  w.level = WEAPON_MAX_LEVEL;
  pr = evolutionProgress(w, { multi: 1 });
  assert.strictEqual(pr.ready, true);
  evolveWeapon(w, { multi: 1 });
  pr = evolutionProgress(w, { multi: 1 });
  assert.strictEqual(pr.ready, false);
  assert.strictEqual(pr.evolved, true);
  assert.strictEqual(evolutionProgress({ type: 'NOPE', level: 2 }, {}), null);
  console.log('ok: evolutionProgress reports level, partner and readiness');
}

// ---------- describeEvolution: UI cards ----------
{
  const card = describeEvolution(maxed('BEAM'));
  assert.strictEqual(card.id, 'GODLANCE');
  assert.strictEqual(card.weaponName, WEAPON_NAMES.BEAM);
  assert.strictEqual(card.levelReq, WEAPON_MAX_LEVEL);
  assert.strictEqual(card.partner, 'pierce');
  assert.strictEqual(card.partnerName, 'Sharpened Tips');
  assert.strictEqual(card.evolved, false);

  const w = maxed('SCYTHE');
  evolveWeapon(w, { hp: 1 });
  const done = describeEvolution(w);
  assert.strictEqual(done.evolved, true);
  assert.strictEqual(done.name, 'Grave Harvest');

  assert.strictEqual(describeEvolution('VOLLEY').name, 'Nova Shot');
  assert.strictEqual(describeEvolution('NOPE'), null, 'unknown id renders nothing');
  assert.strictEqual(describeEvolution(null), null);
  console.log('ok: describeEvolution cards carry requirements + achieved state');
}

console.log('test_evolution: all assertions passed');
