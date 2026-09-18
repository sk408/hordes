// CHAIN ZAP: BASE 3 + BUYABLE RANGE (owner msg_01M2RENZXZR6MRT4Y5F2RQFRJ7).
// Written FAIL-FIRST against the pre-rework build (which hits 4 at L1 and 8
// at L8 via the weapon-level ladder). The contract under test:
//   * BASE COUNT IS 3 TOTAL ENEMIES per fire (primary + 2 hops), at every
//     weapon level — the ladder's old +1-jump growth is RETIRED (disclosed in
//     weapons.js): count growth is the SHOP's job.
//   * THE BUYABLE ('zapchain') makes the count TECHNICALLY UNCAPPED, bounded
//     by (a) the hard iteration bound WEAPONS.ZAP.MAX_HOPS and (b) the
//     visited set — and raises the hop range by RANGE_PER_LEVEL per level.
//   * TERMINATION at the range edge: an enemy EXACTLY at hop range is hit
//     (<=), one past it ends the chain; two enemies alone terminate cleanly.
//   * NO ENEMY IS HIT TWICE in one fire (visited set), proven from the zap
//     effect's own polyline: points.length === 1 + distinct damaged enemies.
//   * THE MANA GATE IS UNCHANGED (msg_01M2REF19AH7P9VNCY07KN5D14): a dry
//     pool fires nothing, spends nothing, damages nobody.
import { boot } from './_harness.mjs';
import { WEAPON_TYPES, WEAPONS } from '../src/weapons.js';
import { makeTypedEnemy } from '../src/enemy_types.js';
import { suite } from './_harness.mjs';

const s = suite('chain zap: base 3 + buyable range');

// The dense-field fixture: a Witch run with the field replaced by a 40px
// enemy grid (every nearest neighbour well inside the hop range, so the ONLY
// limiters are the count cap / MAX_HOPS), hp inflated so nothing dies — a
// pure hit-count read off ONE direct WEAPON_TYPES.ZAP.update call.
async function zapField(zapchainLvl, weaponLevel = 1) {
  const h = await boot({ variant: 'zap-' + zapchainLvl + '-' + weaponLevel + '-' + Math.random() });
  const prof = h.T.getProfile();
  prof.equippedCharacter = 'WITCH';
  if (!(prof.unlockedWeapons || []).includes('ZAP')) prof.unlockedWeapons.push('ZAP');
  if (zapchainLvl) prof.purchased.zapchain = zapchainLvl;
  h.T.startRun();
  const st = h.state, p = st.player;
  st.enemies.length = 0;
  st.spawnTimer = 9999;
  st.wave.endsAt = st.time + 9999;
  const put = (x, y) => {
    const e = makeTypedEnemy('GRUNT', p.x + x, p.y + y, st.time);
    e.hp = e.maxHp = 1e9; e.speed = 0;
    st.enemies.push(e);
    return e;
  };
  return { h, st, p, put };
}

const fire = (st, w) => WEAPON_TYPES.ZAP.update(st, w, 1 / 60);
const damaged = (st) => st.enemies.filter(e => e.hp < e.maxHp);
const lastZap = (st) => [...st.effects].reverse().find(f => f.kind === 'zap');

// ---- 1. BASE COUNT: exactly 3 total enemies, at L1 and at the level cap ----
{
  const { st, p, put } = await zapField(0, 1);
  for (let gy = -8; gy <= 8; gy++) for (let gx = -8; gx <= 8; gx++) {
    if (gx || gy) put(gx * 40, gy * 40);
  }
  p.mana = p.stats.maxMana;
  fire(st, { type: 'ZAP', level: 1, cd: 0, evolution: null });
  s.check('base fire hits EXACTLY 3 enemies total (owner: reduce to 3)', () => {
    if (damaged(st).length !== 3) throw new Error('hit ' + damaged(st).length + ', expected 3');
  });
  s.check('no enemy is hit twice: polyline points === 1 origin + 3 victims', () => {
    const z = lastZap(st);
    if (!z || z.points.length !== 4) throw new Error('points ' + (z ? z.points.length : 0) + ', expected 4');
  });
}
{
  // The ladder's +1-jump growth is RETIRED (disclosed): weapon L8 still hits 3.
  const { st, p, put } = await zapField(0, 8);
  for (let gy = -8; gy <= 8; gy++) for (let gx = -8; gx <= 8; gx++) {
    if (gx || gy) put(gx * 40, gy * 40);
  }
  p.mana = p.stats.maxMana;
  fire(st, { type: 'ZAP', level: 8, cd: 0, evolution: null });
  s.check('weapon level does NOT grow the count (L8 still 3 — ladder growth retired)', () => {
    if (damaged(st).length !== 3) throw new Error('hit ' + damaged(st).length + ' at L8, expected 3');
  });
}

// ---- 2. THE BUYABLE: uncapped count (bounded by MAX_HOPS), longer range ----
{
  const { h, st, p, put } = await zapField(5, 1);
  s.check("the shop level reaches the player's stats (applyMetaBonuses publishes zapChain)", () => {
    if (p.stats.zapChain !== 5) throw new Error('stats.zapChain ' + p.stats.zapChain + ', expected 5');
  });
  for (let gy = -8; gy <= 8; gy++) for (let gx = -8; gx <= 8; gx++) {
    if (gx || gy) put(gx * 40, gy * 40);
  }
  p.mana = p.stats.maxMana;
  fire(st, { type: 'ZAP', level: 1, cd: 0, evolution: null });
  const n = damaged(st).length;
  const hops = WEAPONS.ZAP.MAX_HOPS;
  s.check('zapchain=5 on a dense field: count is uncapped by a small number (>= 15 hit)', () => {
    if (n < 15) throw new Error('hit ' + n + ', expected >= 15 (uncapped)');
  });
  s.check('the hard iteration bound terminates the walk (hit <= MAX_HOPS=' + hops + ')', () => {
    if (n > hops) throw new Error('hit ' + n + ' > MAX_HOPS ' + hops);
  });
  s.check('no enemy hit twice at long chains: distinct === polyline victims', () => {
    const z = lastZap(st);
    if (!z || z.points.length !== 1 + n) {
      throw new Error('points ' + (z ? z.points.length : 0) + ' vs ' + (1 + n) + ' distinct');
    }
  });
}
{
  // RANGE_PER_LEVEL: two enemies exactly at base-range + 20*lvl apart.
  // zapchain=1 raises the hop range 90 -> 110: a chain partner exactly 110px
  // from the primary IS hit; at zapchain=0 it is not.
  const W = WEAPONS.ZAP;
  const far = W.CHAIN_RANGE + (W.RANGE_PER_LEVEL || 20);
  const { st, p, put } = await zapField(1, 1);
  const primary = put(10, 0);
  const partner = put(10 + far, 0);           // exactly hopRange from primary
  p.mana = p.stats.maxMana;
  fire(st, { type: 'ZAP', level: 1, cd: 0, evolution: null });
  s.check('zapchain=1: an enemy EXACTLY at the raised hop range (' + far + 'px) is hit', () => {
    if (partner.hp >= partner.maxHp) throw new Error('partner at ' + far + 'px not hit');
  });
  s.check('and the chain TERMINATES there (exactly 2 hit: primary + partner)', () => {
    if (damaged(st).length !== 2) throw new Error('hit ' + damaged(st).length + ', expected 2');
  });
}
{
  // Base range unchanged: the same 110px partner is OUT of range at zapchain=0.
  const W = WEAPONS.ZAP;
  const far = W.CHAIN_RANGE + (W.RANGE_PER_LEVEL || 20);
  const { st, p, put } = await zapField(0, 1);
  put(10, 0);
  const partner = put(10 + far, 0);
  p.mana = p.stats.maxMana;
  fire(st, { type: 'ZAP', level: 1, cd: 0, evolution: null });
  s.check('zapchain=0: the enemy past base range (' + W.CHAIN_RANGE + 'px) is NOT hit', () => {
    if (partner.hp < partner.maxHp) throw new Error('partner at ' + far + 'px hit at base range');
  });
}

// ---- 3. TERMINATION: two enemies, exactly at the range edge -----------------
{
  const W = WEAPONS.ZAP;
  const { st, p, put } = await zapField(0, 1);
  const primary = put(10, 0);
  const edge = put(10 + W.CHAIN_RANGE, 0);    // EXACTLY at hop range: <= hits
  p.mana = p.stats.maxMana;
  fire(st, { type: 'ZAP', level: 1, cd: 0, evolution: null });
  s.check('an enemy EXACTLY at base hop range (' + W.CHAIN_RANGE + 'px) is hit', () => {
    if (edge.hp >= edge.maxHp) throw new Error('edge enemy not hit');
  });
  s.check('two enemies alone: the chain terminates at exactly 2 (budget 3 unfilled)', () => {
    if (damaged(st).length !== 2) throw new Error('hit ' + damaged(st).length + ', expected 2');
  });
}

// ---- 4. THE MANA GATE IS UNCHANGED (hard gate, msg_01M2REF19AH7P9VNCY07KN5D14)
{
  const { st, p, put } = await zapField(0, 1);
  put(10, 0); put(50, 0); put(90, 0); put(130, 0);
  const cost = 4 * (p.stats.manaCostMult || 1);
  p.mana = cost - 0.01;                       // a dry pool
  const w = { type: 'ZAP', level: 1, cd: 0, evolution: null };
  fire(st, w);
  s.check('dry pool: no fire, no damage, cd held at 0, mana unspent', () => {
    if (damaged(st).length !== 0) throw new Error('damaged ' + damaged(st).length + ' on a dry pool');
    if (p.mana !== cost - 0.01) throw new Error('mana spent on a dry attempt');
    if (w.cd !== 0) throw new Error('cd ' + w.cd + ' on a dry attempt');
  });
}

s.done();
