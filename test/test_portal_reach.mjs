// HORDES — P1b RIM-PIN: a portal must ALWAYS be enterable by the AUTO pilot,
// including from the worst-case legal player position (the rim).
// (docs/briefs/P1B_RIM_PIN.md)
//
// The defect, measured before the fix (probe: portal forced to x=900 with the
// player at x=400): spawnBoss opens the portal where the boss fell UNCLAMPED,
// while the AutoPilot's put() refused outward motion past lootLimit() (566)
// and the player may legally stand at RIM (600). A portal parking past ~590
// froze the approach at STANDOFF 24 — never reaching RADIUS 16 — for the
// full 20s probe: a literally unwinnable run, no error, no crash.
//
// The fix (src/controllers.js portal branch): the portal is not static loot,
// so its steer runs against the physical rim, not the loot edge; and when the
// portal sits past RIM + RADIUS (a boss died outside the arena — enemy motion
// is not rim-clamped) the pilot walks toward the arena center, letting the
// portal's own one-way drift chase it back into reach.
//
// This file pins BOTH levels:
//   UNIT  — decide() output at the two pin geometries (fails on the broken
//           build: the old put() zeroes the outward step);
//   LIVE  — fresh AUTO_ALL runs through the REAL frame loop + REAL
//           pendingClear portal seam, worst cases constructed explicitly
//           (rim edge, rim corner, the orchestrator's measured case).
// Run: node test/test_portal_reach.mjs
import { suite, boot } from './_harness.mjs';
import { CONFIG as C } from '../src/config.js';
import { lootLimit } from '../src/entities.js';
import { AutoPilotController } from '../src/controllers.js';

const s = suite('test_portal_reach');

// ---------------------------------------------------------------------------
// 0. The geometry that made the bug: loot edge < physical rim, and the park
//    ring sits outside the entry ring. If either ever changes, re-derive the
//    worst cases below instead of trusting them.
// ---------------------------------------------------------------------------
s.check('geometry pins: lootLimit < RIM and STANDOFF > RADIUS (the freeze gap)', () => {
  if (!(lootLimit() < C.GROUND.RIM)) {
    throw new Error('lootLimit ' + lootLimit() + ' !< RIM ' + C.GROUND.RIM);
  }
  if (!(C.PORTAL.STANDOFF > C.PORTAL.RADIUS)) {
    throw new Error('STANDOFF must exceed RADIUS for the park to exist');
  }
});

// ---------------------------------------------------------------------------
// 1. UNIT: at the loot edge with the portal just past it, the pilot must keep
//    its outward step (the broken build zeroed it — the measured pin).
// ---------------------------------------------------------------------------
s.check('UNIT: pilot at the loot edge keeps the outward step toward a portal past it', () => {
  const c = new AutoPilotController();
  const st = {
    enemies: [], gems: [], time: 0, wave: { num: 1 },
    portal: { x: lootLimit() + C.PORTAL.STANDOFF, y: 0, age: 1 },
  };
  const d = c.decide({ x: lootLimit(), y: 0 }, st, C.PLAYER);
  if (c.act !== 'PORTAL') throw new Error('act should read PORTAL, got ' + c.act);
  if (!(d.moveX > 0.5)) {
    throw new Error('the outward step was clamped at the loot edge (the rim-pin): ' +
      JSON.stringify(d));
  }
});

// ---------------------------------------------------------------------------
// 2. UNIT: a portal past RIM + RADIUS is enterable from NO legal position, so
//    the pilot must walk INWARD (lure the drifting portal back into reach),
//    not grind the wall. The broken build steered +x and zeroed it.
// ---------------------------------------------------------------------------
s.check('UNIT: portal beyond RIM + RADIUS lures the pilot inward (act stays PORTAL)', () => {
  const c = new AutoPilotController();
  const st = {
    enemies: [], gems: [], time: 0, wave: { num: 1 },
    portal: { x: C.GROUND.RIM + 40, y: 0, age: 1 },
  };
  const d = c.decide({ x: C.GROUND.RIM, y: 0 }, st, C.PLAYER);
  if (c.act !== 'PORTAL') throw new Error('act should read PORTAL, got ' + c.act);
  if (!(d.moveX < -0.5)) {
    throw new Error('the pilot did not walk inward to lure the portal: ' +
      JSON.stringify(d));
  }
});

// ---------------------------------------------------------------------------
// 3. LIVE: worst-case enterability through the REAL loop + REAL portal seam.
// ---------------------------------------------------------------------------
const h = await boot({ storage: [['hordes_onboarded', '1']] });
const T = h.T, st = T.state;
T.banners.suppressAll();

// Keep a run in 'playing': no spawns, no bosses, no wave end (test_ults idiom).
const pinWorld = () => {
  st.spawnTimer = 999;
  st.wave.midAt = st.time + 1e9;
  st.wave.endsAt = st.time + 1e9;
  st.wave.midBossDone = true;
};
const freshRun = () => {
  st.mode = 'menu';
  h.elements['ov-cards'].innerHTML = '';
  T.startRun();
  h.pump(2);
  pinWorld();
  if (st.pilotMode !== 'AUTO_ALL') throw new Error('startRun did not re-engage AUTO_ALL');
  return st.player;
};
// Open the portal through the REAL pendingClear block at a chosen spot — the
// same object the boss reap creates (main.js stamps portalX/portalY from the
// boss corpse, unclamped), without the boss-fight wait.
const openPortalAt = (x, y) => {
  st.enemies.length = 0;
  st.wave.pendingClear = true;
  st.wave.portalX = x;
  st.wave.portalY = y;
  pinWorld();
  h.pump(1);
  pinWorld();
  if (!st.portal) throw new Error('the pendingClear block did not open the portal');
  return st.portal;
};

// scenario -> measured entry time (sim seconds, portal-open -> entering).
function measureEntry(name, px, py, ox, oy, budgetS) {
  const p = freshRun();
  p.x = px; p.y = py;
  const po = openPortalAt(ox, oy);
  const tOpen = st.time;
  let enteredAt = null, minD = Infinity, sawPortalAct = false;
  const cap = Math.max(budgetS * 2, 30) * 60;
  for (let i = 0; i < cap; i++) {
    pinWorld();
    h.pump(1);
    if (st.mode !== 'playing') break;
    if (st.portal) {
      const d = Math.hypot(p.x - po.x, p.y - po.y);
      if (d < minD) minD = d;
      if (T.controller.act === 'PORTAL') sawPortalAct = true;
      if (st.portal.entering && enteredAt === null) enteredAt = st.time - tOpen;
    }
  }
  console.log('    ' + name + ': entry ' +
    (enteredAt === null ? 'NEVER' : enteredAt.toFixed(2) + 's') +
    ' (minD ' + minD.toFixed(1) + ', mode ' + st.mode + ')');
  return { enteredAt, minD, sawPortalAct, mode: st.mode };
}

const RIM = C.GROUND.RIM;

// The orchestrator's measured case: portal forced far past the rim with the
// player mid-field — froze at d=24.0 for 20s before the fix.
const a = measureEntry('orchestrator case: player (400,0), portal (900,0)',
  400, 0, 900, 0, 20);
s.check('LIVE: the orchestrator case enters (was frozen at d=24.0 for 20s)', () => {
  if (a.enteredAt === null || a.mode !== 'intermission') {
    throw new Error('never entered (mode ' + a.mode + ', minD ' + a.minD + ')');
  }
  if (a.enteredAt > 20) throw new Error('entry took ' + a.enteredAt.toFixed(2) + 's (> 20s budget)');
  if (!a.sawPortalAct) throw new Error('the pilot never reported the PORTAL activity');
});

// The rim case: player pinned at the physical clamp, boss corpse just past it.
const b = measureEntry('rim case: player (600,0), portal (640,0)',
  RIM, 0, RIM + 40, 0, 8);
s.check('LIVE: rim case enters (portal past RIM + RADIUS, player at the clamp)', () => {
  if (b.enteredAt === null || b.mode !== 'intermission') {
    throw new Error('never entered (mode ' + b.mode + ', minD ' + b.minD + ')');
  }
  if (b.enteredAt > 8) throw new Error('entry took ' + b.enteredAt.toFixed(2) + 's (> 8s budget)');
});

// The rim CORNER: worst legal position on both axes, portal diagonally out.
const cc = measureEntry('rim corner: player (600,600), portal (700,700)',
  RIM, RIM, RIM + 100, RIM + 100, 20);
s.check('LIVE: rim-corner case enters (worst legal position, diagonal portal)', () => {
  if (cc.enteredAt === null || cc.mode !== 'intermission') {
    throw new Error('never entered (mode ' + cc.mode + ', minD ' + cc.minD + ')');
  }
  if (cc.enteredAt > 20) throw new Error('entry took ' + cc.enteredAt.toFixed(2) + 's (> 20s budget)');
});

// The loot-edge pin at its tightest: pilot AT the loot edge, portal parked
// exactly one STANDOFF past it — the exact geometry of the measured freeze.
const d0 = measureEntry('loot edge: player (566,0), portal (590,0)',
  lootLimit(), 0, lootLimit() + C.PORTAL.STANDOFF, 0, 8);
s.check('LIVE: loot-edge case enters (the exact freeze geometry)', () => {
  if (d0.enteredAt === null || d0.mode !== 'intermission') {
    throw new Error('never entered (mode ' + d0.mode + ', minD ' + d0.minD + ')');
  }
  if (d0.enteredAt > 8) throw new Error('entry took ' + d0.enteredAt.toFixed(2) + 's (> 8s budget)');
});

s.done();
console.log('ALL PORTAL REACH TESTS PASSED');
