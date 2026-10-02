// HORDES — owner rulings 2026-09-21 (Sk408): COLOSSUS credit + phantom burn tick.
//
// Ruling 1: the COLOSSUS death shockwave is NOT player credit. Victims it
// kills are still reaped (gems/drops/detonations/progression unchanged) but
// pay no player kill reward: no p.kills, no purse gold, no kill-channel
// token, no rampage extension.
// Ruling 2: a corpse that is already dead takes no further burn damage (the
// burn tick beside the slow decay carries an hp guard), so there is no
// phantom tick and no spurious burnLethal stamp on a weapon-killed corpse.
//
// Every check below drives the REAL frame loop through planted enemies.
// Run: node test/test_shockwave_credit.mjs
import { suite, boot } from './_harness.mjs';
import { makeTypedEnemy } from '../src/enemy_types.js';
import { purseValue } from '../src/meta.js';

const s = suite('test_shockwave_credit');

const h = await boot({ storage: [['hordes_onboarded', '1']] });
const T = h.T, st = h.state;
T.banners.suppressAll();
T.startRun(); h.pump(2);
const p = st.player;
p.xpNext = 1e12;                 // no level-up draft can pause the loop mid-check
p.stats.maxHp = 1e6; p.hp = 1e6; // the windows measure credit, not survival
st.wave.num = 1; st.wave.endsAt = 1e9; st.wave.midBossDone = true;

// Far-field cluster: out of every weapon's reach within the pumped frames,
// inside the shockwave radius of each other. The control proves planted
// corpses are otherwise credited normally.
const FX = p.x + 500, FY = p.y;
const foe = (type, dx, hp) => {
  const e = makeTypedEnemy(type, FX + dx, FY + (dx % 17), st.time);
  e.hp = hp;
  st.enemies.push(e);
  return e;
};

s.check('control: plain planted corpses are credited as player kills', () => {
  st.enemies.length = 0;
  const k0 = p.kills;
  foe('CHASER', 0, 0); foe('CHASER', 30, 0);
  h.pump(1);
  if (st.enemies.length !== 0) throw new Error('planted corpses were not reaped');
  if (p.kills - k0 !== 2) throw new Error('control kills delta ' + (p.kills - k0) + ' != 2');
});

s.check('ruling 1: shockwave victims die but pay no player credit', () => {
  st.enemies.length = 0; st.gems.length = 0;
  const k0 = p.kills, e0 = st.runCounts.gold.earned;
  const r0 = state_rampage();
  const g0 = st.gems.length;
  const col = foe('COLOSSUS', 0, 0);          // dies this frame: shockwave fires
  const v1 = foe('CHASER', 20, 10);           // inside the 90px blast: shockwave kills
  const v2 = foe('CHASER', -25, 10);
  const v3 = foe('CHASER', 40, 10);
  const sv = foe('CHASER', -45, 1e6);         // survives the blast: stays creditable
  const old = Math.random;
  Math.random = () => 0;
  h.pump(1);
  Math.random = old;
  // The blast went off: the frail victims are dead and stamped, the survivor
  // is hurt but alive and unstamped.
  for (const [v, name] of [[v1, 'v1'], [v2, 'v2'], [v3, 'v3']]) {
    if (!(v.hp <= 0)) throw new Error(name + ' survived the shockwave (hp ' + v.hp + ')');
    if (v.shockLethal !== true) throw new Error(name + ' is missing the shockLethal stamp');
  }
  if (!(sv.hp > 0 && sv.hp < 1e6)) throw new Error('the survivor was not clipped by the blast');
  if (sv.shockLethal) throw new Error('a shockwave survivor must not carry the stamp');
  h.pump(1);                                  // the stamped victims are reaped here
  if (st.enemies.includes(v1) || st.enemies.includes(v2) || st.enemies.includes(v3)) {
    throw new Error('shockwave victims were not reaped');
  }
  // ...as enemy kills, not player kills: exactly one credited kill (the
  // colossus itself) and its purse value, one rampage step.
  if (p.kills - k0 !== 1) throw new Error('kills delta ' + (p.kills - k0) + ' != 1 (victims credited)');
  const pay = st.runCounts.gold.earned - e0;
  if (pay !== purseValue(col)) throw new Error('purse paid ' + pay + ' != colossus value ' + purseValue(col));
  if (state_rampage() - r0 !== 1) throw new Error('rampage ate shockwave kills');
  // The corpses were still reaped as corpses: every dead body dropped gold-free
  // xp into the world (the survivor is still standing, so 4 gems, not 5).
  if (st.gems.length - g0 !== 4) throw new Error('gems delta ' + (st.gems.length - g0) + ' != 4 (a kill went missing)');
  // The blast survivor is still a normal enemy: finishing it credits fully.
  sv.hp = 0;
  const k1 = p.kills, g1 = st.gems.length;
  h.pump(1);
  if (p.kills - k1 !== 1) throw new Error('a shockwave survivor finished later paid no kill');
  if (st.gems.length - g1 !== 1) throw new Error('the finished survivor dropped no gem');
});

s.check('ruling 2: a dead corpse takes no phantom burn tick', () => {
  st.enemies.length = 0;
  const corpse = foe('CHASER', 0, 0);
  corpse.burn = 1.0; corpse.burnDps = 500;
  h.pump(1);
  if (corpse.hp !== 0) throw new Error('phantom tick: corpse hp 0 -> ' + corpse.hp);
  if (corpse.burn !== 1.0) throw new Error('the corpse burn timer ran after death');
  if (corpse.burnLethal) throw new Error('spurious burnLethal stamp on a weapon-killed corpse');
});

s.check('ruling 2 control: the living still burn', () => {
  st.enemies.length = 0;
  const live = foe('CHASER', 60, 100);
  live.burn = 10; live.burnDps = 60;
  h.pump(1);
  if (!(live.hp < 100 && live.hp > 0)) throw new Error('the live burn tick broke (hp ' + live.hp + ')');
  if (!(live.burn < 10)) throw new Error('the live burn timer did not run');
});

function state_rampage() { return st.rampage.streak; }

s.done();
console.log('ALL SHOCKWAVE CREDIT TESTS PASSED');
