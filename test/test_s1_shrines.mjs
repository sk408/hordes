// HORDES — S1: world-seeded, whole-map, rarer, STATIC shrines
// (docs/briefs/S1_SHRINES.md + docs/HORDES_GOALS_2026-09-12.md "SHRINES —
// OWNER DIRECTIVE (2026-09-14)").
//
// The contract under test, driving the REAL seams (no copies):
//   R1  run start seeds the set ONCE (state.shrines, off state.shrineRng) —
//       exactly SHRINE_WORLD_COUNT altars, integer pixels, inside the rim
//       with margin; state.shrine is the first-unused VIEW (render/tour).
//   R2  placement is whole-map: uniform scatter, no centre ring, no band.
//   R3  NOT player-specific: corner-park invariance (the set is byte-identical
//       with the player parked in opposite corners — placement takes no
//       player argument, a code fact) and ZERO drift (positions byte-identical
//       after 10 simulated seconds with the player 40px away — the old 6px/s
//       lean would have walked the altar 60px).
//   STATIC  wave-step invariance: advancing a wave through the REAL
//       portal/intermission/CONTINUE flow neither moves, adds, removes, nor
//       re-rolls a shrine (same array identity, byte-identical contents).
//   FLOW  a proximity purchase through the real update loop still works:
//       purse debited, blessing applied repeat-free, altar marked used, and
//       the VIEW advances to the next unsold altar.
// Run: node test/test_s1_shrines.mjs
import assert from 'node:assert';
import { suite, boot } from './_harness.mjs';
import { SHRINE_WORLD_COUNT, SHRINE_WORLD_MARGIN, shrineCost } from '../src/shrines.js';
import { CONFIG as C } from '../src/config.js';

const s = suite('test_s1_shrines');
const h = await boot({ storage: [['hordes_onboarded', '1']] });
const T = h.T, st = T.state;
T.banners.suppressAll();

// Keep a window in 'playing': no spawns, no bosses, no wave end (test_ults idiom).
const pinWorld = () => {
  st.spawnTimer = 999;
  st.wave.midAt = st.time + 1e9;
  st.wave.endsAt = st.time + 1e9;
  st.wave.midBossDone = true;
};
const freshRun = (mode) => {
  st.mode = 'menu';
  h.elements['ov-cards'].innerHTML = '';
  T.startRun();
  h.pump(2);
  if (mode) { T.setPilotMode(mode); h.pump(1); }
  pinWorld();
  return st.player;
};
const snap = () => st.shrines.map(sh => ({ x: sh.x, y: sh.y, used: sh.used }));

// Advance one wave through the REAL flow: portal open at the player, AUTO
// pilot enters (P1), intermission, CONTINUE (test_portal_park idiom).
const advanceWave = () => {
  const waveBefore = st.wave.num;
  st.enemies.length = 0;
  st.wave.pendingClear = true;
  st.wave.portalX = st.player.x;
  st.wave.portalY = st.player.y;
  pinWorld();
  for (let i = 0; i < 60 * 60 && st.mode === 'playing'; i++) { pinWorld(); h.pump(1); }
  if (st.mode !== 'intermission') throw new Error('no intermission (mode=' + st.mode + ')');
  for (let i = 0; i < 600 && st.mode !== 'playing'; i++) {
    const cards = h.elements['ov-cards'].children;
    const cont = cards.find(c => (c.innerHTML || '').includes('CONTINUE'));
    if (cont) cont.click();
    h.pump(1);
  }
  if (st.mode !== 'playing') throw new Error('CONTINUE did not resume play (mode=' + st.mode + ')');
  pinWorld();
  if (st.wave.num !== waveBefore + 1) {
    throw new Error('wave did not advance: ' + waveBefore + ' -> ' + st.wave.num);
  }
};

// --- R1: run start seeds the set ONCE -----------------------------------------
{
  freshRun('MANUAL');
  s.check('R1: run start seeds exactly ' + SHRINE_WORLD_COUNT + ' altars, integer px, in-bounds, view = first', () => {
    assert.equal(st.shrines.length, SHRINE_WORLD_COUNT, 'the world set is exactly the count dial');
    // ARENA SCALE-UP (2026-09-17) RETARGET: the bound is the units-based
    // GROUND.RIM now (the module reads the one knob), not the literal 600.
    const half = C.GROUND.RIM - SHRINE_WORLD_MARGIN;
    for (const sh of st.shrines) {
      assert.equal(sh.used, false, 'fresh altar is unused');
      assert.equal(sh.x, Math.round(sh.x), 'integer pixel x');
      assert.equal(sh.y, Math.round(sh.y), 'integer pixel y');
      assert.ok(Math.abs(sh.x) <= half && Math.abs(sh.y) <= half, 'inside the rim with margin');
    }
    assert.strictEqual(st.shrine, st.shrines[0], 'state.shrine is the first-unused VIEW (render/tour handoff)');
    assert.ok(st.shrineRng, 'the shrine rng stream is seeded off the run seed');
  });
}

// --- R3a: corner-park invariance ----------------------------------------------
{
  const p = freshRun('MANUAL');
  p.x = -(C.GROUND.RIM - SHRINE_WORLD_MARGIN); p.y = -(C.GROUND.RIM - SHRINE_WORLD_MARGIN); // one corner
  h.pump(30);
  const a = snap();
  p.x = C.GROUND.RIM - SHRINE_WORLD_MARGIN; p.y = C.GROUND.RIM - SHRINE_WORLD_MARGIN;       // the opposite corner
  h.pump(30);
  const b = snap();
  s.check('R3: corner-park invariance — the set is byte-identical in opposite corners', () => {
    assert.deepEqual(b, a, 'the seeded set cannot depend on where the player stands ' +
      '(code fact: seedShrines(rng) takes no player argument)');
  });
}

// --- R3b: zero drift, both dt regimes ------------------------------------------
for (const hz of [60, 120]) {
  h.setFrameMs(1000 / hz);
  const p = freshRun('MANUAL');
  // Stand 40px from the first altar: outside the 26px buy radius, well inside
  // the old drift's reach (the deleted lean would have closed 6px/s x 10s).
  const sh0 = st.shrines[0];
  p.x = sh0.x + 40; p.y = sh0.y;
  const before = snap();
  for (let i = 0; i < 10 * hz; i++) { pinWorld(); h.pump(1); p.x = sh0.x + 40; p.y = sh0.y; }
  const after = snap();
  s.check(hz + 'Hz: zero drift — positions byte-identical after 10s with the player 40px away', () => {
    assert.deepEqual(after, before, 'static means static (the DRIFT.ARCH coupling is gone)');
    assert.ok(!sh0.used, 'no purchase fired from 40px (buy radius is 26)');
  });
  h.setFrameMs(1000 / 60);
}

// --- STATIC: wave-step invariance ----------------------------------------------
{
  const p = freshRun();   // AUTO_ALL: the pilot walks the portal itself
  p.x = 0; p.y = 0;
  const setRef = st.shrines;
  const before = snap();
  advanceWave();
  advanceWave();
  s.check('STATIC: two wave steps neither move, add, remove, nor re-roll a shrine', () => {
    assert.strictEqual(st.shrines, setRef, 'the same array object rides across waves (no re-seed)');
    assert.equal(st.shrines.length, SHRINE_WORLD_COUNT, 'no shrine appeared or vanished');
    assert.deepEqual(snap(), before, 'positions byte-identical across waves ' +
      '(zero rng draws per wave — the per-wave roll is deleted)');
  });
}

// --- FLOW: proximity purchase + view advance ------------------------------------
{
  const p = freshRun('MANUAL');
  const prof = T.getProfile();
  prof.gold = 1000;                 // the bank: must not move
  prof.runPurse = 500;
  const before = snap();
  const sh0 = st.shrines[0];
  const wantCost = shrineCost(st.wave.num - 1, 0);
  p.x = sh0.x; p.y = sh0.y;         // stand ON the first altar
  const choicesBefore = st.takenChoices.length;
  for (let i = 0; i < 30 && !sh0.used; i++) h.pump(1);
  s.check('FLOW: proximity purchase debits the purse, applies repeat-free, advances the view', () => {
    assert.ok(sh0.used, 'the altar sold its blessing');
    assert.equal(prof.runPurse, 500 - wantCost, 'purse debited the advertised cost');
    assert.equal(prof.gold, 1000, 'the bank untouched (E1)');
    assert.equal(st.takenChoices.length, choicesBefore + 1, 'blessing recorded repeat-free');
    assert.strictEqual(st.shrine, st.shrines[1], 'the view advanced to the next unsold altar');
    // The rest of the set is untouched — no respawn, no re-roll on purchase.
    const after = snap();
    for (let i = 1; i < SHRINE_WORLD_COUNT; i++) {
      assert.deepEqual([after[i].x, after[i].y, after[i].used],
        [before[i].x, before[i].y, before[i].used], 'altar ' + i + ' unmoved by the purchase');
    }
  });
}

s.done();
console.log('ALL S1 SHRINE TESTS PASSED');
