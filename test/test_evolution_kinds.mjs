// Evolution item requirement matches on the affix STAT FIELD, so any affix
// granting that stat (not only the original same-named one) qualifies.
// Run: node test/test_evolution_kinds.mjs
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';
import { EVOLUTION_DEFS, evolveWeapon, itemKindsOf } from '../src/evolutions.js';
import { AFFIX_POOL } from '../src/loot.js';
import { WEAPON_MAX_LEVEL, makeWeapon } from '../src/weapons.js';

const s = suite('test_evolution_kinds');
const item = (affixId) => {
  const a = AFFIX_POOL.find(x => x.id === affixId);
  return { affixes: [{ id: a.id, name: a.name, field: a.field, magnitude: a.base }] };
};

s.check('every affix sharing a field with an evolution kind enables that evolution', () => {
  let n = 0;
  for (const def of Object.values(EVOLUTION_DEFS)) {
    for (const a of AFFIX_POOL.filter(x => x.field === def.itemKind)) {
      const w = makeWeapon(def.weapon);
      w.level = WEAPON_MAX_LEVEL;
      const r = evolveWeapon(w, itemKindsOf([item(a.id)]), 1);
      assert.equal(r.ok, true, def.weapon + ' with ' + a.id + ': ' + r.reason);
      n++;
    }
  }
  assert.ok(n > Object.keys(EVOLUTION_DEFS).length, 'newer same-field affixes were covered (' + n + ')');
});

s.check('an affix of a different field does not qualify', () => {
  const w = makeWeapon('BOOMERANG');
  w.level = WEAPON_MAX_LEVEL;
  assert.equal(evolveWeapon(w, itemKindsOf([item('truesight')]), 1).reason, 'item');
});

s.check('itemKindsOf tolerates id-only affixes and empty input', () => {
  assert.deepEqual([...itemKindsOf([{ affixes: [{ id: 'crit' }] }, {}, null])], ['crit']);
  assert.equal(itemKindsOf(undefined).size, 0);
});

const h = await boot();
const st = h.T.state;
h.T.startRun();
h.pump(2);
s.check('real loop: Ironbrand (damageMult) opens the Void Rang evolution', () => {
  st.spawnTimer = 1e9;
  st.enemies.length = 0;
  let w = st.weapons.find(x => x.type === 'BOOMERANG');
  if (!w) { w = makeWeapon('BOOMERANG'); st.weapons.push(w); }
  for (const x of st.weapons) x.level = x === w ? WEAPON_MAX_LEVEL : 1;
  st.items.length = 0;
  st.items.push(item('ironbrand'));
  st.evoTokens = 1;
  for (let i = 0; i < 5 && st.mode === 'playing'; i++) h.pump(1, () => { st.player.hp = st.player.stats.maxHp; });
  assert.equal(st.mode, 'evolve');
});
s.done();
