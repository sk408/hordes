// HORDES — WAVE-26 cross-file leftovers (the six surgical fixes).
// Run: node test/test_wave26_crossfile.mjs
//
// These close real gaps that the repair round could not fix from inside one
// lane. Each is asserted behaviourally where a behaviour exists, and against
// the source where the fix IS that the duplication is gone.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CONFIG as C } from '../src/config.js';
import { hpScale, xpScale, applyEscalation } from '../src/entities.js';
import { heatOf, heatMultipliers } from '../src/heat.js';
import { PIERCE_ALL, weaponLevelParams } from '../src/weapons.js';
import { makeWeapon } from '../src/weapons.js';
import { boot, suite } from './_harness.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (rel) => fs.readFileSync(new URL(rel, ROOT), 'utf8');

const S = suite('wave-26 cross-file leftovers');
const { T, state, rec, pump } = await boot({
  storage: [['hordes_onboarded', '1']],
});

// ---- 1. render.js reads the published zoom factor ---------------------------
S.check('the render transform reads state.zoomScale (one definition)', () => {
  const src = read('src/render.js');
  assert.ok(/state\.zoomScale/.test(src), 'render.js consults state.zoomScale');
  assert.ok(!/const Z = Math\.max\(1, Math\.round\(state\.zoom \|\| 1\)\);\s*\n\s*this\._zoom/.test(src),
    'the bare re-derivation is not the primary path');
  // Behaviour: a published zoomScale wins over a stale state.zoom.
  T.startRun();
  pump(1);
  state.zoomScale = 3;
  state.zoom = 1;
  T.renderer.render(state, state.cam);
  assert.equal(T.renderer.worldView.zoom, 3, 'the renderer honoured state.zoomScale');
  // And it still works headlessly with no published value (fallback).
  delete state.zoomScale;
  state.zoom = 2;
  T.renderer.render(state, state.cam);
  assert.equal(T.renderer.worldView.zoom, 2, 'fallback derives from state.zoom');
  state.zoom = 1;
});

// ---- 2. the dead DOM bridge is gone ----------------------------------------
S.check('readDoctrine never reads the DOM badges', () => {
  const saved = globalThis.document;
  globalThis.document = {
    getElementById: () => { throw new Error('readDoctrine must not touch the DOM'); },
  };
  let out;
  try {
    out = T.renderer.readDoctrine({});
  } finally {
    globalThis.document = saved;
  }
  assert.deepEqual(out, { focus: null, stance: null }, 'nulls, never a DOM guess');
  assert.deepEqual(T.renderer.readDoctrine({ focus: 'SWARM', stance: 'GREEDY' }),
    { focus: 'SWARM', stance: 'GREEDY' }, 'state remains the single source');
});

// ---- 3. final_boss speed default -------------------------------------------
S.check('makeFinalBoss stamps a real speed (fix is asserted in test_final_boss)', () => {
  const src = read('src/final_boss.js');
  assert.ok(/speed: MAW_SPEED_BASE \* FINAL_BOSS\.speedMult/.test(src),
    'the factory stamps speed from the exported knob');
  assert.ok(/export const MAW_SPEED_BASE = 400/.test(src), 'and the knob is exported');
});

// ---- 4. PIERCE_ALL has one definition --------------------------------------
S.check('main.js uses PIERCE_ALL instead of a hardcoded 999', () => {
  const main = read('src/main.js');
  assert.ok(!/pr\.pierce = 999/.test(main), 'no hardcoded pierce sentinel in main.js');
  assert.ok(/pr\.pierce = PIERCE_ALL/.test(main), 'it imports and uses weapons.js PIERCE_ALL');
  assert.equal(PIERCE_ALL, 999, 'and the sentinel value itself is unchanged');
});

// ---- 5. synergy bolts receive the arch (BERSERK) damage -----------------------
S.check('synWeaponDmg includes activeArchMods().damageMult', () => {
  T.startRun();
  pump(1);
  state.weapons = [makeWeapon('VOLLEY'), makeWeapon('ZAP')];
  const p = state.player;
  p.stats.damage = 10;
  p.stats.damageMult = 2;
  state.archBuffs = [];
  const plain = T.synWeaponDmg('ZAP', 3);
  // The documented convention: damage * mult * level dmgMult * loot damageMult
  // * arch damageMult * evolution damageMult.
  const P = weaponLevelParams('ZAP', 1);
  assert.equal(plain, 10 * 3 * (P.dmgMult || 1) * 2, 'no arch -> the base convention');
  state.archBuffs = [{ type: 'BERSERK', until: 999 }];
  const berserk = T.synWeaponDmg('ZAP', 3);
  assert.equal(berserk, plain * 1.5,
    'BERSERK (+50%) now applies to synergy bolts too, got ' + berserk + ' vs ' + plain);
  state.archBuffs = [];
});

// ---- 6. applyEscalation has ONE home ---------------------------------------
S.check('applyEscalation lives in entities.js and both callers delegate', () => {
  const entities = read('src/entities.js');
  const main = read('src/main.js');
  const chests = read('src/chests.js');
  assert.ok(/export function applyEscalation\(state, e, t\)/.test(entities),
    'entities.js owns the helper');
  const algebra = (s) => (s.match(/const hpMult = e\.hp \/ \(C\.ENEMY\.BASE_HP/g) || []).length;
  assert.equal(algebra(entities), 1, 'the algebra appears exactly once in entities.js');
  assert.equal(algebra(main), 0, 'and not at all in main.js any more');
  assert.equal(algebra(chests), 0, 'nor in chests.js');
  assert.ok(/from '\.\/entities\.js'/.test(chests) && /applyEscalation/.test(chests),
    'chests.js imports the shared helper');
  assert.ok(/applyEscalation\(state, e, state\.time\)/.test(main),
    'main.js calls it with the shared signature');
});
S.check('the shared helper reproduces the documented curves exactly', () => {
  const st = { time: 90, heat: { total: 3, manual: 0, events: new Set() } };
  const w = 3;                                    // floor(90/30)
  const heatHp = heatMultipliers(heatOf(st)).hp;
  // A factory enemy at the linear preview: BASE * (1 + 0.35w) for hp.
  const e = { hp: C.ENEMY.BASE_HP * (1 + 0.35 * w), xp: C.ENEMY.BASE_XP * (1 + 0.25 * w) };
  applyEscalation(st, e, st.time);
  assert.ok(Math.abs(e.hp - C.ENEMY.BASE_HP * hpScale(w) * heatHp) < 1e-6,
    'hp lands on BASE_HP * hpScale(w) * heat (' + e.hp + ')');
  assert.equal(e.maxHp, e.hp, 'maxHp mirrors the escalated hp');
  assert.ok(Math.abs(e.xp - C.ENEMY.BASE_XP * xpScale(w)) < 1e-6,
    'xp lands on BASE_XP * xpScale(w), never heat-inflated (' + e.xp + ')');
  // `t` is optional and defaults to state.time.
  const e2 = { hp: C.ENEMY.BASE_HP * (1 + 0.35 * w), xp: C.ENEMY.BASE_XP * (1 + 0.25 * w) };
  applyEscalation(st, e2);
  assert.equal(e2.hp, e.hp, 'omitting t falls back to state.time');
  // A wave-0 enemy is a no-op on the curves (the two previews agree at w=0).
  const fresh = { hp: C.ENEMY.BASE_HP, xp: C.ENEMY.BASE_XP };
  applyEscalation({ time: 0 }, fresh);
  assert.ok(Math.abs(fresh.hp - C.ENEMY.BASE_HP) < 1e-6, 'wave 0 -> base hp');
  assert.ok(Math.abs(fresh.xp - C.ENEMY.BASE_XP) < 1e-6, 'wave 0 -> base xp');
});

S.done();
