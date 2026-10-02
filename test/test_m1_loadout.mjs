// M1 loadout: with no stored choice a run brings every owned weapon that fits;
// buying a weapon or a slot fills the loadout; a stored choice is honoured.
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';
import {
  makeProfile, defaultLoadout, effectiveLoadout, equipBoughtWeapon, buyUpgrade,
  startWeaponSlots, WEAPON_PRICES, SHOP_BY_ID, upgradeCost,
} from '../src/meta.js';

const S = suite('test_m1_loadout');
const own = (p, ...ws) => { for (const w of ws) if (!p.unlockedWeapons.includes(w)) p.unlockedWeapons.push(w); };

S.check('a fresh profile brings the starter Boomerang without choosing anything', () => {
  const p = makeProfile();
  assert.equal(p.loadout, null);
  assert.deepEqual(effectiveLoadout(p), ['BOOMERANG']);
});

S.check('the default fills the slots, strongest first, and never exceeds them', () => {
  const p = makeProfile();
  own(p, 'ORBIT', 'SEEKER', 'JAVELIN');
  const cap = startWeaponSlots(p) - 1;
  const kit = defaultLoadout(p);
  assert.equal(kit.length, cap);
  assert.deepEqual(kit, ['SEEKER', 'JAVELIN'], 'priciest (strongest) first');
  assert.deepEqual(defaultLoadout(p, 4), ['SEEKER', 'JAVELIN', 'BOOMERANG', 'ORBIT'], 'Boomerang ranks above Orbit');
  assert.ok(WEAPON_PRICES.SEEKER > WEAPON_PRICES.JAVELIN);
});

S.check("a character's starting weapon leads its default kit", () => {
  const p = makeProfile();
  own(p, 'ORBIT', 'SEEKER');
  p.unlockedCharacters.push('PALADIN'); p.equippedCharacter = 'PALADIN';
  assert.deepEqual(defaultLoadout(p), ['ORBIT', 'SEEKER']);
});

S.check('buying a weapon equips it; with no stored choice the loadout stays automatic while it fits', () => {
  const p = makeProfile();
  p.gold = 1e6;
  assert.ok(buyUpgrade(p, 'weapon_orbit'));
  assert.equal(p.loadout, null);
  assert.deepEqual(effectiveLoadout(p), ['BOOMERANG', 'ORBIT']);
  assert.ok(buyUpgrade(p, 'weapon_zap'));
  assert.ok(effectiveLoadout(p).includes('ZAP'), 'the new, stronger weapon is in');
  assert.equal(effectiveLoadout(p).length, 2);
});

S.check('a bought weapon weaker than the full default kit still gets in: the weakest is benched', () => {
  const p = makeProfile();
  own(p, 'SEEKER', 'MINE');
  assert.deepEqual(effectiveLoadout(p), ['SEEKER', 'MINE']);
  own(p, 'ORBIT');
  const res = equipBoughtWeapon(p, 'ORBIT');
  assert.equal(res.benched, 'MINE');
  assert.deepEqual(p.loadout, ['SEEKER', 'ORBIT']);
});

S.check('a stored choice is honoured, and a full one benches its weakest weapon', () => {
  const p = makeProfile();
  own(p, 'ORBIT', 'SEEKER', 'ZAP');
  p.loadout = ['ORBIT'];
  assert.deepEqual(effectiveLoadout(p), ['ORBIT'], 'a deliberate one-weapon kit is not topped up');
  p.loadout = ['ORBIT', 'BOOMERANG'];
  assert.deepEqual(equipBoughtWeapon(p, 'ZAP'), { benched: 'ORBIT' });
  assert.deepEqual(p.loadout, ['BOOMERANG', 'ZAP']);
});

S.check('a bought slot fills: a stored loadout takes the best owned weapon it lacks', () => {
  const p = makeProfile();
  own(p, 'ORBIT', 'SEEKER', 'ZAP');
  p.loadout = ['ORBIT', 'BOOMERANG'];
  p.gold = upgradeCost(SHOP_BY_ID.slots, 0);
  assert.ok(buyUpgrade(p, 'slots'));
  assert.deepEqual(p.loadout, ['ORBIT', 'BOOMERANG', 'SEEKER']);
  // and with no stored choice the default simply grows
  const q = makeProfile();
  own(q, 'ORBIT', 'SEEKER');
  q.gold = upgradeCost(SHOP_BY_ID.slots, 0);
  assert.ok(buyUpgrade(q, 'slots'));
  assert.equal(q.loadout, null);
  assert.deepEqual(effectiveLoadout(q), ['SEEKER', 'BOOMERANG', 'ORBIT']);
});

S.check('a run of purchases never benches the strongest weapon in the kit', () => {
  const p = makeProfile();
  own(p, 'MINE', 'NOVA_PULSE');                 // e.g. achievement grants
  assert.deepEqual(effectiveLoadout(p), ['MINE', 'NOVA_PULSE']);
  p.gold = 1e6;
  for (const id of ['weapon_orbit', 'weapon_ember', 'weapon_beam', 'weapon_ricochet']) {
    assert.ok(buyUpgrade(p, id));
    assert.ok(effectiveLoadout(p).includes('MINE'), 'MINE survives buying ' + id);
    assert.equal(effectiveLoadout(p).length, 2);
  }
  assert.deepEqual(effectiveLoadout(p), ['MINE', 'RICOCHET'], 'the newest purchase rides beside the strongest');
});

S.check('a mana weapon the profile cannot feed ranks last in the default kit', () => {
  const p = makeProfile();
  own(p, 'ZAP', 'ORBIT');                       // ZAP granted, never chosen
  assert.deepEqual(effectiveLoadout(p), ['BOOMERANG', 'ORBIT'], 'a Knight with base mana regen leaves Chain Zap on the bench');
  p.purchased.slots = 1;
  assert.deepEqual(effectiveLoadout(p), ['BOOMERANG', 'ORBIT', 'ZAP'], 'it still fills a slot nothing else wants');
  p.purchased.slots = 0;
  p.purchased.regen = SHOP_BY_ID.regen.maxLevel;
  assert.deepEqual(effectiveLoadout(p), ['ZAP', 'BOOMERANG'], 'with Mana Spring it takes its price rank');
  const w = makeProfile();
  own(w, 'ZAP', 'SEEKER', 'MINE');
  w.unlockedCharacters.push('WITCH'); w.equippedCharacter = 'WITCH';
  assert.equal(effectiveLoadout(w)[0], 'ZAP', "the Witch's starting weapon always leads her kit");
  const k = makeProfile();
  k.gold = 1e6;
  assert.ok(buyUpgrade(k, 'weapon_zap'));
  assert.ok(effectiveLoadout(k).includes('ZAP'), 'a weapon the player BUYS is equipped regardless');
});

// ---- through the real run --------------------------------------------------
const h = await boot();
const T = h.T, st = h.state;
S.check('run 1 on a fresh profile starts with VOLLEY + BOOMERANG', () => {
  T.startRun(); h.pump(1);
  assert.deepEqual(st.weapons.map(w => w.type), ['VOLLEY', 'BOOMERANG']);
});
S.check('the run arms the kit the loadout screen shows', () => {
  const prof = T.getProfile();
  own(prof, 'ORBIT', 'SEEKER');
  T.startRun(); h.pump(1);
  assert.deepEqual(st.weapons.map(w => w.type), ['VOLLEY', ...T.loadout.kit()]);
  assert.deepEqual(T.loadout.kit(), ['SEEKER', 'BOOMERANG']);
  prof.loadout = ['ORBIT'];
  T.startRun(); h.pump(1);
  assert.deepEqual(st.weapons.map(w => w.type), ['VOLLEY', 'ORBIT']);
  prof.loadout = null;
});

S.done();
process.exit(0);
