// Controller unit tests (WAVE-13): AutoPilot/Player parity + held-input
// movement math. Pure module — no DOM.
// Run: node test/test_controllers.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FOCUS_MODES, STANCES, JOY_DEAD_ZONE, AutoPilotController, PlayerController,
} from '../src/controllers.js';

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`  ok - ${name}`);
}

const mkState = (enemies = [], gems = []) => ({ enemies, gems });
const foe = (x, y, typeId = 'CHASER', maxHp = 10) =>
  ({ x, y, typeId, maxHp, hp: maxHp });

// --- interface parity: PlayerController IS a controller -----------------------
check('PlayerController exposes the full controller interface', () => {
  const c = new PlayerController();
  assert.equal(typeof c.cycleFocus, 'function');
  assert.equal(typeof c.cycleStance, 'function');
  assert.equal(typeof c.pickTarget, 'function');
  assert.equal(typeof c.decide, 'function');
  assert.ok(c instanceof AutoPilotController, 'drops into the SAME seam');
});

check('doctrine defaults match AutoPilot (NEAREST / BALANCED)', () => {
  const a = new AutoPilotController(), m = new PlayerController();
  assert.equal(m.focus, a.focus);
  assert.equal(m.stance, a.stance);
});

check('cycleFocus/cycleStance walk the same ladders', () => {
  const a = new AutoPilotController(), m = new PlayerController();
  const seenA = [], seenM = [];
  for (let i = 0; i < FOCUS_MODES.length; i++) {
    seenA.push(a.cycleFocus());
    seenM.push(m.cycleFocus());
  }
  assert.deepEqual(seenM, seenA);
  const stA = [], stM = [];
  for (let i = 0; i < STANCES.length; i++) {
    stA.push(a.cycleStance());
    stM.push(m.cycleStance());
  }
  assert.deepEqual(stM, stA);
});

// --- held-input movement math --------------------------------------------------
check('held RIGHT moves +x; no input stands dead still', () => {
  const c = new PlayerController({ up: false, down: false, left: false, right: true });
  const d = c.decide({ x: 0, y: 0 }, mkState([foe(40, 0)]), {});
  assert.equal(d.moveX, 1);
  assert.equal(d.moveY, 0);
  c.input.right = false;
  const d2 = c.decide({ x: 0, y: 0 }, mkState([foe(40, 0)]), {});
  assert.equal(d2.moveX, 0);
  assert.equal(d2.moveY, 0, 'no input = {0,0}, NOT autopilot patrol');
});

check('diagonal input normalizes to unit length (0.7071 each)', () => {
  const c = new PlayerController({ up: true, down: false, left: false, right: true });
  const d = c.decide({ x: 0, y: 0 }, mkState(), {});
  assert.ok(Math.abs(d.moveX - Math.SQRT1_2) < 1e-9);
  assert.ok(Math.abs(d.moveY + Math.SQRT1_2) < 1e-9);   // up = negative y
  assert.ok(Math.abs(Math.hypot(d.moveX, d.moveY) - 1) < 1e-9);
});

check('opposite keys cancel (left+right = 0)', () => {
  const c = new PlayerController({ up: false, down: false, left: true, right: true });
  const d = c.decide({ x: 0, y: 0 }, mkState(), {});
  assert.equal(d.moveX, 0);
  assert.equal(d.moveY, 0);
});

check('single-axis input is never scaled (cardinal speed == full speed)', () => {
  const c = new PlayerController();
  c.input.down = true;
  const d = c.decide({ x: 0, y: 0 }, mkState(), {});
  assert.equal(d.moveY, 1);
  assert.equal(d.moveX, 0);
});

// --- volleys stay AUTO-AIMED: target is doctrine-driven, not input-driven ------
check('target comes from pickTarget: NEAREST picks the nearest foe', () => {
  const c = new PlayerController();
  const near = foe(20, 0), far = foe(200, 0);
  const d = c.decide({ x: 0, y: 0 }, mkState([far, near]), {});
  assert.equal(d.target, near);
});

check('RANGED doctrine reaches the off-screen warlock while standing still', () => {
  // Sk408 bug regression, manual edition: the volley must keep silencing
  // free-firing warlocks even while the pilot holds nothing.
  const c = new PlayerController();
  c.focus = 'RANGED';
  const warlock = foe(400, 0, 'WARLOCK');
  const chaser = foe(20, 0);
  const d = c.decide({ x: 0, y: 0 }, mkState([warlock, chaser]), {});
  assert.equal(d.target, warlock);
  assert.equal(d.moveX, 0);
  assert.equal(d.moveY, 0);
});

check('decide never mutates the input object', () => {
  const input = { up: false, down: true, left: false, right: false };
  const snapshot = { ...input };
  new PlayerController(input).decide({ x: 0, y: 0 }, mkState([foe(10, 10)]), {});
  assert.deepEqual(input, snapshot);
});

check('manual targeting ignores gems entirely (movement-only override)', () => {
  const c = new PlayerController();
  const e = foe(60, 0);
  const d = c.decide({ x: 0, y: 0 }, mkState([e], [{ x: 500, y: 500 }]), {});
  assert.equal(d.target, e, 'gem on the field never becomes the target');
  assert.equal(d.moveX, 0, 'and never drags the pilot toward it');
});

// --- WAVE-15 ANALOG JOYSTICK contract ------------------------------------------
check('joystick partial deflection scales movement (mag 0.5 -> 0.5 speed)', () => {
  const c = new PlayerController({ up: false, down: false, left: false, right: false, x: 1, y: 0, mag: 0.5 });
  const d = c.decide({ x: 0, y: 0 }, mkState(), {});
  assert.equal(d.moveX, 0.5);
  assert.equal(d.moveY, 0);
});

check('joystick direction is preserved at partial tilt (any angle)', () => {
  const c = new PlayerController();
  c.input = { x: 0, y: 1, mag: 0.8 };   // straight down, 80% tilt
  const d = c.decide({ x: 0, y: 0 }, mkState(), {});
  assert.ok(Math.abs(d.moveX) < 1e-9);
  assert.ok(Math.abs(d.moveY - 0.8) < 1e-9);
  // diagonal 3-4-5 direction at full tilt stays unit-length
  c.input = { x: 0.6, y: 0.8, mag: 1 };
  const d2 = c.decide({ x: 0, y: 0 }, mkState(), {});
  assert.ok(Math.abs(d2.moveX - 0.6) < 1e-9 && Math.abs(d2.moveY - 0.8) < 1e-9);
});

check(`dead zone: deflection <= ${JOY_DEAD_ZONE} produces ZERO movement`, () => {
  assert.equal(JOY_DEAD_ZONE, 0.15, 'dead zone is the documented ~15%');
  const c = new PlayerController();
  for (const mag of [0.05, 0.1, 0.15]) {
    c.input = { x: 1, y: 0, mag };
    const d = c.decide({ x: 0, y: 0 }, mkState(), {});
    assert.equal(d.moveX, 0, `mag ${mag} must be dead`);
    assert.equal(d.moveY, 0);
  }
  // just past the ring: alive
  c.input = { x: 1, y: 0, mag: 0.16 };
  const d = c.decide({ x: 0, y: 0 }, mkState(), {});
  assert.ok(d.moveX > 0, 'mag just past the dead zone steers');
});

check('full tilt equals full keyboard speed (any stick direction)', () => {
  const stick = new PlayerController({ x: 1, y: 0, mag: 1 });
  const keys = new PlayerController({ up: false, down: false, left: false, right: true });
  const ds = stick.decide({ x: 0, y: 0 }, mkState(), {});
  const dk = keys.decide({ x: 0, y: 0 }, mkState(), {});
  assert.equal(ds.moveX, dk.moveX, 'full tilt == ArrowRight speed');
  // and a full diagonal tilt matches the normalized w+d chord
  stick.input = { x: Math.SQRT1_2, y: Math.SQRT1_2, mag: 1 };
  const dd = stick.decide({ x: 0, y: 0 }, mkState(), {});
  assert.ok(Math.abs(dd.moveX - Math.SQRT1_2) < 1e-9);
  assert.ok(Math.abs(dd.moveY - Math.SQRT1_2) < 1e-9);
});

check('released stick (mag 0) recenters — and falls back to held keys', () => {
  const c = new PlayerController({ x: 1, y: 0, mag: 0 });
  const d = c.decide({ x: 0, y: 0 }, mkState(), {});
  assert.equal(d.moveX, 0, 'mag 0 with no keys = stand still');
  c.input.right = true;   // thumb left the stick, key still down
  const d2 = c.decide({ x: 0, y: 0 }, mkState(), {});
  assert.equal(d2.moveX, 1, 'released stick defers to the keyboard');
});

check('stick overrides stale key state while deflected', () => {
  const c = new PlayerController({ up: true, down: false, left: true, right: false, x: 1, y: 0, mag: 0.5 });
  const d = c.decide({ x: 0, y: 0 }, mkState(), {});
  assert.equal(d.moveX, 0.5, 'analog vector wins while past the dead zone');
  assert.equal(d.moveY, 0);
});

check('analog decide never mutates the input object', () => {
  const input = { up: false, down: false, left: false, right: false, x: 0.6, y: 0.8, mag: 0.9 };
  const snapshot = { ...input };
  new PlayerController(input).decide({ x: 0, y: 0 }, mkState([foe(10, 10)]), {});
  assert.deepEqual(input, snapshot);
});

// --- module purity: controllers never touch the DOM ---------------------------
check('controllers.js is DOM-free (no document/window references)', () => {
  const src = readFileSync(new URL('../src/controllers.js', import.meta.url), 'utf8');
  assert.ok(!/\bdocument\b/.test(src), 'no document access');
  assert.ok(!/\bwindow\b/.test(src), 'no window access');
});

console.log(`controllers: ${passed} checks passed`);
