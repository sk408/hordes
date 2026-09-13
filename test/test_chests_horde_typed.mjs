// HORDES — CHESTS gamble horde must use the TYPED spawn path (agent F, wave-25).
//
// Defect: applyContents()'s gamble punishment horde spawned through
// entities.makeEnemy(), so those 6 enemies had no typeId / variant / w / h /
// age, skipped the heat multiplier, and could never be flash-drop eligible
// (loot.isFlashEligibleKill requires a CHASER/SWARMER typeId). Every other
// spawn path (main.js spawnWave) goes through enemy_types.makeTypedEnemy +
// the CONFIG.ESCALATION re-scale + heat.
//
// Fix: chests.js spawns the horde through the same typed construction (CHASER
// chassis, CONFIG.ESCALATION hp/xp curves, heat hp multiplier) with NO extra
// rng draws — the chest's documented 2-draw rng order is preserved.
//
// Run: node test/test_chests_horde_typed.mjs   (exit 0 = pass)
import assert from 'node:assert/strict';
import { CHESTS, tickChests } from '../src/chests.js';
import { makePlayer, hpScale, xpScale } from '../src/entities.js';
import { CONFIG as C } from '../src/config.js';
import { heatOf, heatMultipliers } from '../src/heat.js';
import { isFlashEligibleKill } from '../src/loot.js';

let failed = 0;
function ok(cond, msg) {
  if (cond) { console.log('  PASS ' + msg); }
  else { failed++; console.error('  FAIL ' + msg); }
}

// Counting rng: throws if the module draws more than expected, and reports the
// exact draw count (any new draw would shift every caller's rng stream).
function countingRng(vals) {
  let i = 0;
  const fn = () => {
    if (i >= vals.length) throw new Error(`rng exhausted (draw ${i + 1}, have ${vals.length})`);
    return vals[i++];
  };
  fn.draws = () => i;
  return fn;
}

function makeState(time = 120, heatTotal = 3) {
  return {
    player: makePlayer(),
    enemies: [],
    chests: [],
    effects: [],
    time,
    heat: { total: heatTotal, manual: 0, events: new Set() },
  };
}

console.log('GAMBLE LOSS -> typed horde:');
{
  const T = 120;                 // wave 4
  const st = makeState(T, 3);
  st.chests.push({ id: 3, x: st.player.x, y: st.player.y, age: 0 });
  const rng = countingRng([0.05, 0.7]);   // gamble roll HITS (< 0.10), coin -> lose
  const events = tickChests(st, 0.016, rng);

  ok(events.some(e => e.kind === 'gambleHorde'), 'gamble loss emits gambleHorde');
  ok(st.enemies.length === CHESTS.GAMBLE_HORDE_COUNT,
    `the horde is ${CHESTS.GAMBLE_HORDE_COUNT} enemies (got ${st.enemies.length})`);
  ok(rng.draws() === 2, `the chest still draws exactly 2 rng values (got ${rng.draws()})`);

  const wave = Math.floor(T / 30);
  const heatMult = heatMultipliers(heatOf(st)).hp;
  const expHp = C.ENEMY.BASE_HP * hpScale(wave) * heatMult;   // CHASER hpMult is 1
  const expXp = C.ENEMY.BASE_XP * xpScale(wave);

  let typed = true, heatApplied = true, curveApplied = true, boxed = true,
      flashEligible = true, plain = true, onRing = true;
  for (const e of st.enemies) {
    typed = typed && e.typeId === 'CHASER' && typeof e.variant === 'number' &&
            e.age === 0 && Number.isFinite(e.speed);
    boxed = boxed && e.w === C.ENEMY.W && e.h === C.ENEMY.H;
    heatApplied = heatApplied && Math.abs(e.maxHp - expHp) < 1e-9 && e.hp === e.maxHp;
    curveApplied = curveApplied && Math.abs(e.xp - expXp) < 1e-9;
    flashEligible = flashEligible && isFlashEligibleKill(e) === true;
    plain = plain && !e.elite && !e.boss;
    const d = Math.hypot(e.x - st.player.x, e.y - st.player.y);
    onRing = onRing && Math.abs(d - CHESTS.GAMBLE_HORDE_RADIUS) < 2;
  }
  ok(typed, 'every horde enemy is typed (typeId/variant/age)');
  ok(boxed, `every horde enemy carries a w/h box (${C.ENEMY.W}x${C.ENEMY.H})`);
  ok(heatApplied, `heat multiplies the horde hp (x${heatMult} -> ${expHp})`);
  ok(curveApplied, `CONFIG.ESCALATION xp curve applies (${expXp} xp)`);
  ok(flashEligible, 'horde kills are flash-drop eligible (CHASER trash tier)');
  ok(plain, 'the horde is plain trash — not elite, not boss');
  ok(onRing, 'the horde still rings the player at GAMBLE_HORDE_RADIUS');
}

console.log('BAREWORDS STATE (no heat ledger) does not crash:');
{
  const st = {
    player: makePlayer(), enemies: [], chests: [], effects: [], time: 30,
  };
  st.chests.push({ id: 4, x: st.player.x, y: st.player.y, age: 0 });
  const rng = countingRng([0.05, 0.7]);
  const events = tickChests(st, 0.016, rng);
  const expHp = C.ENEMY.BASE_HP * hpScale(1);   // heat 0 -> neutral
  ok(events.some(e => e.kind === 'gambleHorde') &&
     st.enemies.length === CHESTS.GAMBLE_HORDE_COUNT &&
     st.enemies.every(e => Math.abs(e.maxHp - expHp) < 1e-9),
    'a state without a heat ledger spawns the typed horde at neutral heat');
  ok(st.enemies.every(e => e.typeId === 'CHASER'), 'typed chassis survives the bare state');
}

console.log('GAMBLE WIN path unchanged:');
{
  const st = makeState(120, 0);
  st.chests.push({ id: 5, x: st.player.x, y: st.player.y, age: 0 });
  const rng = countingRng([0.05, 0.3, 0.0, 0.0]);
  const events = tickChests(st, 0.016, rng);
  ok(events.some(e => e.kind === 'chestOpened' && e.rarity === 'gamble'), 'gamble rarity rolled');
  ok(!events.some(e => e.kind === 'gambleHorde'), 'a gamble WIN spawns no horde');
  ok(st.enemies.length === 0, 'a gamble WIN leaves the field untouched');
}

// Guard the module contract the fix depends on: makeTypedEnemy is the spawner.
{
  const st = makeState(120, 0);
  st.chests.push({ id: 6, x: st.player.x, y: st.player.y, age: 0 });
  tickChests(st, 0.016, countingRng([0.05, 0.7]));
  assert.ok(st.enemies.every(e => e.packSize !== undefined),
    'typed spawner fields ride along (packSize present)');
  console.log('  PASS typed spawner fields ride along (packSize present)');
}

if (failed) { console.error(`\n${failed} FAILURES`); process.exit(1); }
console.log('\nALL CHESTS HORDE TESTS PASSED');
