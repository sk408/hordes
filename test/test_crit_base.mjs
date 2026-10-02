// A crit with no crit-damage rows owned does x1.5; Deadeye/Bullseye add on top.
// Run: node test/test_crit_base.mjs
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';
import { applyMetaBonuses, BASE_CRIT_MULT, SHOP_BY_ID } from '../src/meta.js';
import { makePlayer } from '../src/entities.js';
import { WEAPON_TYPES, WEAPONS, makeWeapon } from '../src/weapons.js';

const s = suite('test_crit_base');

s.check('applyMetaBonuses: 1.5 with nothing owned; rows add their compounded bonus', () => {
  const base = makePlayer().stats;
  assert.equal(BASE_CRIT_MULT, 1.5);
  assert.equal(applyMetaBonuses(base, {}).critMult, 1.5);
  const d = SHOP_BY_ID.critdmg.perLevel, b = SHOP_BY_ID.bullseye.perLevel;
  assert.equal(applyMetaBonuses(base, { critdmg: 1 }).critMult, 1.5 + d);
  assert.equal(applyMetaBonuses(base, { critdmg: 2, bullseye: 1 }).critMult,
    1.5 + Math.pow(1 + d, 2) * (1 + b) - 1);
});

const h = await boot();
const st = h.state;
s.check('real run, fresh profile: a guaranteed crit deals x1.5', () => {
  h.T.startRun();
  h.pump(2);
  const p = st.player;
  assert.equal(p.stats.critMult, 1.5, 'the run stats carry the base');
  // One boomerang contact with crit chance 1 against a stub state.
  p.stats.crit = 1;
  p.stats.damage = 10;
  const e = { x: p.x + 40, y: p.y, hp: 1000, flash: 0 };
  const stub = { player: p, enemies: [e], projectiles: [], effects: [], archBuffs: null };
  const w = makeWeapon('BOOMERANG');
  w.cd = 0;
  for (let i = 0; i < 20 && e.hp === 1000; i++) WEAPON_TYPES.BOOMERANG.update(stub, w, 0.016);
  const dealt = 1000 - e.hp;
  const plain = 10 * WEAPONS.BOOMERANG.DAMAGE_MULT * (p.stats.damageMult || 1);
  assert.ok(Math.abs(dealt - plain * 1.5) < 1e-9, 'dealt ' + dealt + ' vs plain ' + plain);
});
s.done();
