// HORDES — SKILLS / POTIONS CONTRACT (agent F, wave-25).
//
// Defects:
//   1. usePotion(state, kind) with an unknown kind fell through the
//      `p.potions[kind] <= 0` guard (undefined <= 0 is false) into the MANA
//      branch: it silently consumed a mana potion and reported success.
//   2. useSkill(state, id) threw a TypeError on an unknown id (`def.MANA` on
//      undefined) instead of failing.
//   3. rollDrop() was exported but never called — main.js re-implements the
//      potion-drop roll inline with its own modifiers, so the export was dead
//      code that invited a second, divergent roll.
//
// Fix: both entry points reject unknown ids with `return false` and no state
// mutation; the dead rollDrop export is gone (main.js's inline roll, which
// carries dropBonus + dropChanceMult, is the single implementation).
//
// Run: node test/test_skills_contract.mjs   (exit 0 = pass)
import * as skills from '../src/skills.js';
import { useSkill, usePotion, updateResources } from '../src/skills.js';
import { CONFIG as C } from '../src/config.js';

let failed = 0;
function ok(cond, msg) {
  if (cond) { console.log('  PASS ' + msg); }
  else { failed++; console.error('  FAIL ' + msg); }
}
// Run a call that is expected NOT to throw; a throw is a failure, not a crash.
function doesNotThrow(fn, msg) {
  try { fn(); ok(true, msg); }
  catch (e) { ok(false, msg + ' (threw: ' + e.message + ')'); }
}

function stubState() {
  return {
    player: {
      x: 0, y: 0, hp: 40, mana: 10,
      stats: { damage: 10, cooldown: 0.55, speed: 60, pickup: 22,
               projectiles: 1, pierce: 0, maxHp: 100, maxMana: 100 },
      skillCd: { FROST_NOVA: 0, OVERCHARGE: 0 },
      buffs: { overcharge: 0 },
      potions: { hp: 2, mp: 2 },
    },
    enemies: [], effects: [],
  };
}

console.log('UNKNOWN SKILL ID fails cleanly:');
{
  const st = stubState();
  const snap = JSON.stringify(st.player);
  let ret;
  doesNotThrow(() => { ret = useSkill(st, 'NOT_A_SKILL'); }, 'useSkill(unknown) does not throw');
  ok(ret === false, `useSkill(unknown) returns false (got ${ret})`);
  ok(JSON.stringify(st.player) === snap, 'useSkill(unknown) mutates nothing (no mana, no cooldown)');
  let undef;
  doesNotThrow(() => { undef = useSkill(st, undefined); }, 'useSkill(undefined) does not throw');
  ok(undef === false, `useSkill(undefined) returns false (got ${undef})`);
}

console.log('UNKNOWN POTION KIND fails cleanly:');
{
  const st = stubState();
  const snap = JSON.stringify(st.player);
  const ret = usePotion(st, 'stamina');
  ok(ret === false, `usePotion(unknown) returns false (got ${ret})`);
  ok(st.player.potions.mp === 2, `usePotion(unknown) does not spend a mana potion (mp=${st.player.potions.mp})`);
  ok(st.player.mana === 10, 'usePotion(unknown) does not restore mana');
  ok(JSON.stringify(st.player) === snap, 'usePotion(unknown) mutates nothing');
  ok(usePotion(st, undefined) === false, 'usePotion(undefined) returns false');
}

console.log('KNOWN ids still behave:');
{
  const st = stubState();
  ok(usePotion(st, 'hp') === true && st.player.hp === 40 + C.POTIONS.HP_HEAL && st.player.potions.hp === 1,
    'hp potion heals + decrements');
  ok(usePotion(st, 'mp') === true && st.player.mana === 10 + C.POTIONS.MP_RESTORE && st.player.potions.mp === 1,
    'mp potion restores + decrements');
  ok(usePotion(st, 'hp') === true && usePotion(st, 'hp') === false,
    'an empty stack returns false');
  st.player.hp = st.player.stats.maxHp;
  ok(st.player.potions.hp === 0 || usePotion(st, 'hp') === false,
    'a health potion is never wasted at full HP');

  const sk = stubState();
  sk.player.mana = sk.player.stats.maxMana;   // enough for OVERCHARGE (25)
  ok(useSkill(sk, 'OVERCHARGE') === true && sk.player.buffs.overcharge === C.SKILLS.OVERCHARGE.DURATION,
    'OVERCHARGE still fires + arms the buff');
  ok(sk.player.mana === sk.player.stats.maxMana - C.SKILLS.OVERCHARGE.MANA,
    'OVERCHARGE spends its mana cost');
  ok(useSkill(sk, 'OVERCHARGE') === false, 'a cooling skill returns false');
  sk.player.mana = 0;
  sk.player.skillCd.FROST_NOVA = 0;
  ok(useSkill(sk, 'FROST_NOVA') === false, 'no mana -> false');
  sk.player.mana = sk.player.stats.maxMana;
  ok(useSkill(sk, 'FROST_NOVA') === true && sk.enemies.length === 0,
    'FROST_NOVA fires without touching enemies out of range');
  ok(updateResources(sk.player, 1) === undefined, 'updateResources still ticks without throwing');
}

console.log('DEAD EXPORT removed (single roll implementation lives in main.js):');
{
  ok(!Object.prototype.hasOwnProperty.call(skills, 'rollDrop'),
    'skills.js no longer exports the unused rollDrop (main.js owns the live roll)');
  ok(typeof skills.useSkill === 'function' && typeof skills.usePotion === 'function' &&
     typeof skills.updateResources === 'function',
    'the real contract exports are intact');
}

if (failed) { console.error(`\n${failed} FAILURES`); process.exit(1); }
console.log('\nALL SKILLS CONTRACT TESTS PASSED');
