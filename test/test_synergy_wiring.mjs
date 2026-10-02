// The four newer pair synergies do what their card text says, in the real
// update loop; and every flag in the table is read by the game.
// Run: node test/test_synergy_wiring.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { boot, suite } from './_harness.mjs';
import { SYNERGIES } from '../src/synergies.js';
import { WEAPONS, makeWeapon } from '../src/weapons.js';

const s = suite('test_synergy_wiring');

s.check('every synergy flag in the table is read by main.js', () => {
  const src = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  for (const sy of SYNERGIES) {
    for (const f of Object.keys(sy.flags)) {
      assert.ok(src.includes("syn('" + f + "')"), sy.name + ': flag ' + f + ' is never read');
    }
  }
});

const h = await boot();
const T = h.T, st = h.state;
const foe = (x, y, hp) => ({ typeId: 'CHASER', x, y, hp, maxHp: hp, w: 10, h: 10, speed: 0, xp: 1,
  mx: 0, my: 0, age: 0, elite: false });

// A quiet run with a standing pilot and exactly the given weapons; `idle`
// weapons are parked on a long cooldown so only the others fire.
function arena(types, idle = []) {
  T.banners.suppressAll();
  T.startRun();
  h.pump(2);
  T.setPilotMode('MANUAL');
  st.enemies.length = 0; st.gems.length = 0; st.projectiles.length = 0; st.effects.length = 0;
  st.spawnTimer = 1e9; st.wave.endsAt = st.time + 1e9; st.wave.midAt = st.time + 1e9;
  const p = st.player;
  p.stats.crit = 0; p.stats.damage = 10; p.stats.pierce = 0; p.stats.projectiles = 1;
  p.attackTimer = 1e9;   // the volley holds unless a check re-arms it
  st.weapons.length = 0;
  for (const t of types) {
    const w = makeWeapon(t);
    w.cd = idle.includes(t) ? 1e9 : 0;
    st.weapons.push(w);
  }
  T.refreshSynergies();
  return p;
}
const step = (n = 1) => h.pump(n, () => { st.player.hp = st.player.stats.maxHp; st.player.invuln = 1e9; });
const live = (name) => st.synergies.some(x => x.name === name);

s.check('Sun Lane (JAVELIN+VOLLEY): volley shots carry +1 pierce', () => {
  for (const [types, want] of [[['VOLLEY'], 0], [['VOLLEY', 'JAVELIN'], 1]]) {
    const p = arena(types, ['JAVELIN']);
    assert.equal(live('Sun Lane'), want === 1);
    st.enemies.push(foe(p.x + 60, p.y, 1e9));
    p.attackTimer = 0;
    let shot = null;
    for (let i = 0; i < 20 && !shot; i++) { step(); shot = st.projectiles.find(pr => !pr.kind); }
    assert.ok(shot, 'the volley fired');
    assert.equal(shot.pierce, want, types.join('+') + ': pierce ' + shot.pierce);
  }
});

s.check('Harvest Fire (EMBER+SCYTHE): a sweep kill bursts on the corpse and burns a neighbour', () => {
  for (const [types, burns] of [[['VOLLEY', 'SCYTHE'], false], [['VOLLEY', 'SCYTHE', 'EMBER'], true]]) {
    const p = arena(types, ['EMBER']);
    assert.equal(live('Harvest Fire'), burns);
    const victim = foe(p.x + WEAPONS.SCYTHE.RANGE - 5, p.y, 1);
    // Out of the sweep's reach, inside the ember blast around the victim.
    const neighbour = foe(victim.x + 20, p.y, 1e9);
    st.enemies.push(victim, neighbour);
    let swept = false;
    for (let i = 0; i < 90 && !swept; i++) { step(); swept = victim.hp <= 0 || !st.enemies.includes(victim); }
    assert.ok(swept, 'the sweep killed the victim');
    const lost = 1e9 - neighbour.hp;
    if (burns) {
      const want = 10 * WEAPONS.EMBER.DAMAGE_MULT * WEAPONS.EMBER.KILL_BLAST_MULT;
      assert.ok(Math.abs(lost - want) < 1e-3, 'neighbour took one ember burst (' + lost + ' vs ' + want + ')');
      assert.ok(st.effects.some(f => f.kind === 'mine_blast' && f.radius === WEAPONS.EMBER.BLAST), 'burst effect drawn');
    } else {
      assert.equal(lost, 0, 'without the pair the neighbour is untouched');
    }
  }
});

s.check('Storm Bounce (RICOCHET+ZAP): an impact sparks the nearest enemy the body has not hit', () => {
  for (const [types, sparks] of [[['VOLLEY', 'RICOCHET'], false], [['VOLLEY', 'RICOCHET', 'ZAP'], true]]) {
    const p = arena(types, ['ZAP']);
    assert.equal(live('Storm Bounce'), sparks);
    const first = foe(p.x + 50, p.y, 1e9);
    const other = foe(p.x + 50, p.y + 80, 1e9);   // in zap range; the body needs ~18 frames to get there
    st.enemies.push(first, other);
    let hit = false;
    for (let i = 0; i < 60 && !hit; i++) { step(); hit = first.hp < 1e9; }
    assert.ok(hit, 'the ricochet struck the first enemy');
    const lost = 1e9 - other.hp;
    if (sparks) {
      const want = 10 * WEAPONS.ZAP.DAMAGE_MULT * 0.5;
      assert.ok(Math.abs(lost - want) < 1e-3, 'the other enemy took one spark (' + lost + ' vs ' + want + ')');
      assert.ok(st.effects.some(f => f.kind === 'zap'), 'spark bolt drawn');
    } else {
      assert.equal(lost, 0, 'without the pair nothing sparks on impact');
    }
  }
});

s.check('Crater Field (METEOR+MINE): a landing meteor detonates the mines in its crater', () => {
  for (const [types, cooks] of [[['VOLLEY', 'METEOR'], false], [['VOLLEY', 'METEOR', 'MINE'], true]]) {
    const p = arena(types, ['MINE']);
    assert.equal(live('Crater Field'), cooks);
    const mark = foe(p.x + 100, p.y, 1e9);
    st.enemies.push(mark);
    // Inside the meteor blast, outside the mine's own trigger radius of the mark.
    const inMine = { kind: 'mine', x: mark.x + 40, y: mark.y, age: 5 };
    const outMine = { kind: 'mine', x: mark.x + WEAPONS.METEOR.BLAST + 60, y: mark.y, age: 5 };
    st.projectiles.push(inMine, outMine);
    let landed = false;
    for (let i = 0; i < 120 && !landed; i++) { step(); landed = st.effects.some(f => f.meteor); }
    assert.ok(landed, 'the meteor landed');
    assert.equal(st.projectiles.includes(outMine), true, 'a mine outside the crater is left alone');
    assert.equal(st.projectiles.includes(inMine), !cooks, cooks ? 'the mine in the crater went off' : 'no pair: the mine stays');
    if (cooks) {
      const want = 10 * WEAPONS.METEOR.DAMAGE_MULT + 10 * WEAPONS.MINE.DAMAGE_MULT;
      assert.ok(Math.abs((1e9 - mark.hp) - want) < 1e-3, 'the mark took the meteor and the mine (' + (1e9 - mark.hp) + ')');
    }
  }
});
s.done();
