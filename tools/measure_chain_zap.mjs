// CHAIN ZAP MEASUREMENT (owner msg_01M2RENZXZR6MRT4Y5F2RQFRJ7, item 6): kill
// share + damage, BEFORE vs AFTER the base-3 + buyable rework, plus the
// MEASURED practical max hops on a dense field (item 4b — measured, never
// estimated). Two arms:
//
//   ARM A (scripted run): a real Witch run (ZAP starter), AUTO pilot, 120 sim
//   seconds, per-weapon attribution by WRAPPING every WEAPON_TYPES[t].update —
//   no kill-attribution exists in the kill funnel (main.js p.kills++ has no
//   source field), so each update call's hp-delta / death-crossing is charged
//   to the weapon whose update dealt it. Damage = sum of hp deltas (positive
//   = damage). Kill = enemy crossed hp<=0 inside the call. Honest limits:
//   rider damage inside the call is charged to the firing weapon; collisions
//   outside weapon updates are 'other'.
//
//   ARM B (dense field, deterministic): enemies on a 40px grid around the
//   player (every neighbour well inside CHAIN_RANGE), mana full, one direct
//   WEAPON_TYPES.ZAP.update call — counts DISTINCT enemies damaged in the
//   single fire. That is the measured practical max chain at that density,
//   not an estimate. Levels that do not exist yet on this build are skipped.
//
// Usage: node tools/measure_chain_zap.mjs [label]     (label: before/after)
import { boot } from '../test/_harness.mjs';
import { WEAPON_TYPES } from '../src/weapons.js';
import { makeTypedEnemy } from '../src/enemy_types.js';

const LABEL = process.argv[2] || 'run';
const RUN_SECONDS = 120;

// ---- ARM A: scripted Witch run, per-weapon attribution ----------------------
async function scriptedRun(tag, zapChainLvl) {
  const h = await boot({ variant: 'run-' + tag + '-' + Math.random() });
  const T = h.T, state = h.state;
  const prof = T.getProfile();
  prof.equippedCharacter = 'WITCH';
  if (!(prof.unlockedWeapons || []).includes('ZAP')) prof.unlockedWeapons.push('ZAP');
  if (zapChainLvl) T.getProfile().purchased.zapchain = zapChainLvl;
  T.startRun();

  // The run must SURVIVE the window — this measures ZAP's output, not the
  // Witch's squishiness. maxHp inflated after startRun (post applyMetaBonuses),
  // spawn pressure left real so the field is a real wave mix.
  const pl = state.player;
  pl.stats.maxHp = 1e6; pl.hp = 1e6;

  const totals = {};   // per weapon type: { calls, dmg, kills }
  const other = { dmg: 0 };
  const hpSum = () => state.enemies.reduce((a, e) => a + Math.max(0, e.hp), 0);
  for (const [type, def] of Object.entries(WEAPON_TYPES)) {
    const orig = def.update;
    totals[type] = { calls: 0, dmg: 0, kills: 0 };
    def.update = (st, w, dt) => {
      const before = hpSum();
      const deadBefore = st.enemies.filter(e => e.hp <= 0).length;
      const r = orig(st, w, dt);
      totals[type].calls++;
      totals[type].dmg += Math.max(0, before - hpSum());
      totals[type].kills += Math.max(0, st.enemies.filter(e => e.hp <= 0).length - deadBefore);
      return r;
    };
  }

  let lastHp = hpSum();
  for (let f = 0; f < RUN_SECONDS * 60; f++) {
    h.pump(1);
    // Drafts / intermissions park the sim — pick card 1 (the smoke.mjs
    // auto-pick idiom) so the run keeps flowing through level-up drafts.
    const ov = h.elements['overlay'];
    if (ov && ov.style.display === 'flex' && h.elements['ov-cards'] &&
        h.elements['ov-cards'].children.length > 0) {
      h.key('keydown', { key: '1' });
    }
    const now = hpSum();
    if (now < lastHp) other.dmg += lastHp - now;   // everything outside weapon updates
    lastHp = now;
    if (state.mode !== 'playing') break;
  }

  const zap = state.weapons.find(w => w.type === 'ZAP');
  const allDmg = Object.values(totals).reduce((a, t) => a + t.dmg, 0) + other.dmg;
  const allKills = Object.values(totals).reduce((a, t) => a + t.kills, 0);
  const dmgPct = (100 * totals.ZAP.dmg / Math.max(1, allDmg)).toFixed(1);
  const killPct = (100 * totals.ZAP.kills / Math.max(1, state.player.kills)).toFixed(1);
  console.log(`[A:${tag}] mode=${state.mode} t=${state.time.toFixed(0)}s kills=${state.player.kills} ` +
    `zapLevel=${zap ? zap.level : '-'} zapDmg=${Math.round(totals.ZAP.dmg)} ` +
    `(${dmgPct}% of ${Math.round(allDmg)} dmg incl. volley/other ${Math.round(other.dmg)}) ` +
    `zapKills=${totals.ZAP.kills} (${killPct}% of run's ${state.player.kills} kills) ` +
    `mana=${state.player.mana.toFixed(0)}/${state.player.stats.maxMana}`);
  for (const [type, t] of Object.entries(totals)) {
    if (t.dmg > 0) console.log(`        ${type.padEnd(12)} dmg=${Math.round(t.dmg)} kills=${t.kills}`);
  }
}

// ---- ARM B: dense field, one fire, distinct enemies hit ----------------------
async function denseFire(tag, weaponLevel, zapChainLvl) {
  const h = await boot({ variant: 'dense-' + tag + '-' + Math.random() });
  const T = h.T, state = h.state;
  const prof = T.getProfile();
  prof.equippedCharacter = 'WITCH';
  if (!(prof.unlockedWeapons || []).includes('ZAP')) prof.unlockedWeapons.push('ZAP');
  if (zapChainLvl) T.getProfile().purchased.zapchain = zapChainLvl;
  T.startRun();
  const p = state.player;
  state.enemies.length = 0;
  state.spawnTimer = 9999;
  state.wave.endsAt = state.time + 9999;
  // 40px grid: every nearest neighbour (~40-57px) is well inside CHAIN_RANGE,
  // so the ONLY limiters are the count cap (if any) and MAX_HOPS.
  let n = 0;
  for (let gy = -8; gy <= 8; gy++) {
    for (let gx = -8; gx <= 8; gx++) {
      if (gx === 0 && gy === 0) continue;
      const e = makeTypedEnemy('GRUNT', p.x + gx * 40, p.y + gy * 40, state.time);
      e.hp = e.maxHp = 1e9; e.speed = 0;   // cannot die: pure hit-count read
      state.enemies.push(e); n++;
    }
  }
  p.mana = p.stats.maxMana;
  const w = { type: 'ZAP', level: weaponLevel, cd: 0, evolution: null };
  WEAPON_TYPES.ZAP.update(state, w, 1 / 60);
  const hit = state.enemies.filter(e => e.hp < e.maxHp);
  console.log(`[B:${tag}] weapon L${weaponLevel} zapchain=${zapChainLvl || 0} ` +
    `field=${n} hit=${hit.length} distinct enemies in ONE fire`);
  return hit.length;
}

console.log('=== CHAIN ZAP MEASUREMENT — ' + LABEL + ' ===');
// Run-to-run variance is real (spawn timing + draft offers roll Math.random),
// so Arm A repeats 3x per config and the REPORT cites the range, never one run.
for (let i = 0; i < 3; i++) await scriptedRun('witch-base', 0);
if (LABEL === 'after') {
  for (let i = 0; i < 3; i++) await scriptedRun('witch-zapchain1', 1);
  for (let i = 0; i < 3; i++) await scriptedRun('witch-zapchain3', 3);
  for (let i = 0; i < 3; i++) await scriptedRun('witch-zapchain5', 5);
}
await denseFire('L1-base', 1, 0);
await denseFire('L8-ladder', 8, 0);
if (LABEL === 'after') {
  await denseFire('L1-chain1', 1, 1);
  await denseFire('L1-chain3', 1, 3);
  await denseFire('L1-chain5', 1, 5);
}
console.log('=== done ===');
