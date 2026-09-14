// A1 ACCEPTANCE — the pairing invariant behind tools/verify_a1_acceptance.mjs:
// at the SAME distances the measurement table uses, the radar's data layer
// shows a dot that the pilot's target selection refuses. The radius is read
// from config (never a copied literal) and the distances are expressed
// relative to it, so a retuned FOCUS_RANGE does not stale this fixture.
// Pure module — no DOM. Run: node test/test_a1_acceptance.mjs
import assert from 'node:assert/strict';
import { FOCUS_MODES, AutoPilotController } from '../src/controllers.js';
import { CONFIG as C } from '../src/config.js';
import { radarDots, RADAR_RADIUS } from '../src/radar.js';

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`  ok - ${name}`);
}

const R = C.AUTOPILOT.FOCUS_RANGE;
const P = { x: 0, y: 0 };
const foe = (x, y, typeId = 'CHASER', maxHp = 10) => ({ x, y, typeId, maxHp, hp: maxHp });
const mkState = (enemies) => ({ enemies, gems: [] });
// The acceptance distances 60/150/250/320 at base 100, kept relative to R.
const INSIDE = R - 40;
const OUTSIDE = [R + 50, R + 150, R + 220];

check('A1 pairing: inside the cap every policy targets the enemy the radar shows', () => {
  for (const focus of FOCUS_MODES) {
    const c = new AutoPilotController();
    c.focus = focus;
    const e = foe(INSIDE, 0, focus === 'RANGED' ? 'WARLOCK' : 'CHASER');
    const d = c.decide(P, mkState([e]), C.PLAYER);
    assert.ok(d.target, `${focus}: must engage at ${INSIDE}px`);
    const dots = radarDots(P, [e]);
    assert.equal(dots.length, 1, `${focus}: radar shows the same enemy`);
    assert.ok(dots[0].dist <= R, `${focus}: the dot sits inside the cap`);
  }
});

check('A1 pairing: beyond the cap every policy IGNORES an enemy the radar still shows', () => {
  for (const focus of FOCUS_MODES) {
    const c = new AutoPilotController();
    c.focus = focus;
    for (const dist of OUTSIDE) {
      assert.ok(dist <= RADAR_RADIUS, `fixture distance ${dist} must be inside the radar radius`);
      const e = foe(dist, 0, focus === 'RANGED' ? 'WARLOCK' : 'CHASER');
      const d = c.decide(P, mkState([e]), C.PLAYER);
      assert.equal(d.target, null, `${focus}@${dist}: must hold fire past the cap`);
      const dots = radarDots(P, [e]);
      assert.equal(dots.length, 1, `${focus}@${dist}: the radar still shows the dot`);
      assert.equal(dots[0].typeId, e.typeId, `${focus}@${dist}: same enemy, same frame`);
    }
  }
});

check('A1 pairing: a field with NOTHING inside the cap — all policies hold fire, radar shows all', () => {
  const field = [foe(0, R + 50, 'WARLOCK', 40), foe(-(R + 150), 0, 'SPITTER', 40), foe(0, -(R + 220), 'COLOSSUS', 500)];
  for (const focus of FOCUS_MODES) {
    const c = new AutoPilotController();
    c.focus = focus;
    const d = c.decide(P, mkState(field), C.PLAYER);
    assert.equal(d.target, null, `${focus}: nothing in range => hold fire`);
    const dots = radarDots(P, field);
    assert.equal(dots.length, 3, `${focus}: the radar shows all three ignored enemies`);
    assert.equal(Math.round(dots[0].dist), R + 50, `${focus}: nearest dot is the ${R + 50}px warlock`);
  }
});

console.log(`test_a1_acceptance: ${passed} checks passed`);
