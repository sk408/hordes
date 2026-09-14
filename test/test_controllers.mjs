// Controller unit tests (WAVE-13): AutoPilot/Player parity + held-input
// movement math. Pure module — no DOM.
// Run: node test/test_controllers.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FOCUS_MODES, STANCES, JOY_DEAD_ZONE, AutoPilotController, PlayerController,
} from '../src/controllers.js';
// A1: the engagement radius is a CONFIG number with a SHOP row behind it, so the
// radius tests read the same definitions the game does (never a copied literal).
import { CONFIG as C, setEngagementRange } from '../src/config.js';
import { SHOP_BY_ID, applyMetaBonuses } from '../src/meta.js';

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

check('RANGED doctrine prefers a shooter inside the engagement radius', () => {
  // A1 RETARGET. This used to be "RANGED reaches the off-screen warlock while
  // standing still" (the WAVE-era ANY-range contract). A1 replaces that: the
  // owner's engagement radius gates every focus policy, so the surviving
  // invariant is that RANGED still silences a shooter BEFORE a nearer
  // non-shooter when both are inside the radius — and holds fire beyond it.
  const c = new PlayerController();
  c.focus = 'RANGED';
  const warlock = foe(C.AUTOPILOT.FOCUS_RANGE - 10, 0, 'WARLOCK');
  const chaser = foe(20, 0);
  const d = c.decide({ x: 0, y: 0 }, mkState([warlock, chaser]), {});
  assert.equal(d.target, warlock);
  assert.equal(d.moveX, 0);
  assert.equal(d.moveY, 0);
  const outOfRange = foe(400, 0, 'WARLOCK');
  const d2 = c.decide({ x: 0, y: 0 }, mkState([outOfRange]), {});
  assert.equal(d2.target, null, 'beyond the radius: hold fire, even in manual');
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

// --- WAVE-19 AUTOPILOT ANTI-OSCILLATION (Sk408: pilot vibrated in place) -------
// BALANCED + KITE_DIST 55 => kite 55: enter flee inside r=110, sticky until r=143.
const cfg55 = { KITE_DIST: 55 };

check('flee hysteresis: sticky between enter and 1.3x, calm only past 1.3x', () => {
  const c = new AutoPilotController();
  const farGem = { x: 500, y: 0 };               // calm drift target: +x
  // just inside the enter boundary (110) => flee (-x, away from the enemy)
  let d = c.decide({ x: 0, y: 0 }, mkState([foe(100, 0)], [farGem]), cfg55);
  assert.ok(d.moveX < 0, 'just inside enter => flee');
  // pushed to just ABOVE enter but below 1.3x (120 < 143) => STILL fleeing
  d = c.decide({ x: 0, y: 0 }, mkState([foe(120, 0)], [farGem]), cfg55);
  assert.ok(d.moveX < 0, 'between enter and 1.3x while fleeing => sticky flee');
  // pushed past 1.3x (150 > 143) => calm branch (gem drift is +x)
  d = c.decide({ x: 0, y: 0 }, mkState([foe(150, 0)], [farGem]), cfg55);
  assert.ok(d.moveX > 0, 'past 1.3x => calm gem drift');
});

check('no latch without flee: calm controller at 120 stays calm (no dead band)', () => {
  const c = new AutoPilotController();
  // A FRESH controller (never fleeing) between enter and 1.3x must NOT be
  // dragged into flee by the exit threshold — the band only widens while in.
  const d = c.decide({ x: 0, y: 0 }, mkState([foe(120, 0)], [{ x: 500, y: 0 }]), cfg55);
  assert.ok(d.moveX > 0, 'calm start between enter and 1.3x => calm drift');
});

check('gem stickiness: commits to one gem until it leaves the field', () => {
  const c = new AutoPilotController();
  const a = { x: 30, y: 0 }, b = { x: -40, y: 0 };
  let state = mkState([], [a, b]);
  let d = c.decide({ x: 0, y: 0 }, state, cfg55);
  assert.equal(d.moveX, 1, 'picks the nearer gem A (+x)');
  assert.equal(c.gem, a, 'committed by identity');
  // A drifts away — B is now nearer, but the pilot is COMMITTED to A.
  a.x = 100;
  d = c.decide({ x: 0, y: 0 }, state, cfg55);
  assert.equal(d.moveX, 1, 'still chasing A even though B is nearer now');
  // A collected: re-evaluate — never stuck on the dead reference.
  state = mkState([], [b]);
  d = c.decide({ x: 0, y: 0 }, state, cfg55);
  assert.equal(d.moveX, -1, 'A gone => re-pick => B (-x)');
  assert.equal(c.gem, b);
});

check('GREEDY opposed flee/gem vectors keep a real magnitude (>= 0.25)', () => {
  const c = new AutoPilotController();
  c.stance = 'GREEDY';
  // kite = 27.5 => enter r = 55; enemy at (40,0) => flee (-x), gem on the
  // enemy side => directly opposed loot vector. The blend must never
  // collapse to a sub-pixel crawl while a threat is inside the kite line.
  let d = c.decide({ x: 0, y: 0 }, mkState([foe(40, 0)], [{ x: 40, y: 0 }]), cfg55);
  assert.ok(Math.hypot(d.moveX, d.moveY) >= 0.25, 'exactly opposed: >= 0.25');
  // ...at any gem angle around the pilot (min-vector floor holds everywhere).
  for (let ang = 0; ang < 360; ang += 15) {
    const r = 90;
    const gem = {
      x: Math.cos(ang * Math.PI / 180) * r,
      y: Math.sin(ang * Math.PI / 180) * r,
    };
    d = c.decide({ x: 0, y: 0 }, mkState([foe(40, 0)], [gem]), cfg55);
    assert.ok(Math.hypot(d.moveX, d.moveY) >= 0.25, `gem angle ${ang} keeps real magnitude`);
  }
});

// --- A1 THE ENGAGEMENT RADIUS (the off-screen targeting fix, 2026-09-14) ------
// Owner: "the pilot targets enemies that are off the screen even ... have the
// pilot have a certain distance that they can target enemies, and we can add a
// buyable to the store that allows that distance to be increased."
// The radius (CONFIG.AUTOPILOT.FOCUS_RANGE, base 100, +50/level from the
// 'focus' shop row) gates OFFENSE on EVERY target-selection path: beyond it
// pickTarget yields null and main.js holds fire. Half two, below, proves the
// threat response is NOT gated — that asymmetry is the whole point.
const R = C.AUTOPILOT.FOCUS_RANGE;
const cfgKite = { KITE_DIST: 55 };

check('A1: the base radius is INSIDE the visible view (never off-screen by design)', () => {
  // The complaint, as an invariant: the view is 480x300, so anything past the
  // 150px visible half-height cannot be seen. A base radius wider than that is
  // the bug back again, whatever number it is.
  assert.ok(R > 0 && R <= C.VIEW_H / 2,
    `base engagement radius ${R} must be inside the visible half-height ${C.VIEW_H / 2}`);
  // ...and the whole buyable ladder must reach the spawn ring (ENEMY.SPAWN_DIST
  // 280), or a maxed pilot could never engage an enemy on arrival.
  const maxed = R + SHOP_BY_ID.focus.perLevel * SHOP_BY_ID.focus.maxLevel;
  assert.ok(maxed >= C.ENEMY.SPAWN_DIST,
    `a maxed 'focus' line (${maxed}px) must reach the spawn ring (${C.ENEMY.SPAWN_DIST}px)`);
});

check('A1: beyond the engagement radius NO focus policy returns a target', () => {
  for (const focus of FOCUS_MODES) {
    const c = new AutoPilotController();
    c.focus = focus;
    const far = foe(R + 40, 0);
    const d = c.decide({ x: 0, y: 0 }, mkState([far]), cfgKite);
    assert.equal(d.target, null, `${focus}: must hold fire past the engagement radius`);
  }
});

check('A1: an out-of-range enemy never wins over an in-range one (all four policies)', () => {
  const near = R - 20;
  // Each fixture gives the FAR enemy every reason to win its own doctrine: it
  // is the biggest (TOUGHEST), the middle of a dense cluster (SWARM) and a
  // free-firing shooter (RANGED). Inside the radius only, every one must lose.
  const cases = [
    ['NEAREST', [foe(400, 0), foe(near, 0)]],
    ['TOUGHEST', [foe(400, 0, 'COLOSSUS', 9999), foe(near, 0)]],
    ['SWARM', [foe(400, 0), foe(404, 0), foe(408, 0), foe(412, 0), foe(near, 0)]],
    ['RANGED', [foe(400, 0, 'WARLOCK'), foe(near, 0)]],
  ];
  for (const [focus, enemies] of cases) {
    const c = new AutoPilotController();
    c.focus = focus;
    const d = c.decide({ x: 0, y: 0 }, mkState(enemies), cfgKite);
    assert.ok(d.target, `${focus}: an in-range enemy is still engaged`);
    assert.ok(Math.hypot(d.target.x, d.target.y) <= R,
      `${focus}: the target is INSIDE the radius (got ${Math.hypot(d.target.x, d.target.y)}px)`);
  }
});

check('A1: NEAREST (the DEFAULT focus) is gated too — the path the player plays', () => {
  // The original bug: the NEAREST early return handed back the nearest LIVE
  // enemy with no distance test at all, and NEAREST is the default doctrine.
  const c = new AutoPilotController();
  assert.equal(c.focus, 'NEAREST', 'NEAREST is the default focus');
  assert.equal(c.decide({ x: 0, y: 0 }, mkState([foe(280, 0)]), cfgKite).target, null,
    'an enemy at SPAWN_DIST 280 is not an engagement at the 100px base');
  assert.ok(c.decide({ x: 0, y: 0 }, mkState([foe(R, 0)]), cfgKite).target !== null,
    'exactly AT the radius is still an engagement (inclusive boundary)');
  assert.equal(c.decide({ x: 0, y: 0 }, mkState([foe(R + 0.01, 0)]), cfgKite).target, null,
    'just past it is not');
  assert.equal(c.decide({ x: 0, y: 0 }, mkState([]), cfgKite).target, null, 'empty field holds fire');
});

check('A1: the radius is PER-PLAYER (p.stats.focusRange) so the shop upgrade reaches the pilot', () => {
  const far = foe(R + 100, 0);
  const base = new AutoPilotController();
  assert.equal(base.decide({ x: 0, y: 0 }, mkState([far]), cfgKite).target, null,
    'a stats-less pilot uses the config base');
  const upgraded = new AutoPilotController();
  const d = upgraded.decide(
    { x: 0, y: 0, stats: { focusRange: R + 150 } }, mkState([far]), cfgKite);
  assert.equal(d.target, far, 'the upgraded radius engages what the base declines');
});

check('A1: the shop row and the ELITE_RANGE mirror are the SAME radius (no second 260)', () => {
  const saved = C.AUTOPILOT.AUTO_CAST.ELITE_RANGE;
  try {
    assert.equal(saved, R, 'the elite/boss gate mirrors the base radius at boot');
    const baseStats = { damage: 1, maxHp: 100, maxMana: 50, speed: 1, cooldown: 1,
      pickup: 1, projectiles: 1, pierce: 0 };
    for (const lvl of [1, 3, SHOP_BY_ID.focus.maxLevel]) {
      const st = applyMetaBonuses({ ...baseStats }, { focus: lvl });
      const want = R + SHOP_BY_ID.focus.perLevel * lvl;
      assert.equal(st.focusRange, want, `focus L${lvl} -> stats.focusRange ${want}`);
      assert.equal(C.AUTOPILOT.AUTO_CAST.ELITE_RANGE, want,
        `focus L${lvl}: the elite/boss gate follows the bought upgrade`);
      const c = new AutoPilotController();
      assert.ok(c.decide({ x: 0, y: 0, stats: st }, mkState([foe(want - 10, 0)]), cfgKite).target !== null,
        `focus L${lvl}: an enemy just inside the upgraded radius is engaged`);
    }
  } finally {
    setEngagementRange(saved);   // leave the module as we found it
  }
});

// --- A1 half two: SURVIVAL IS NEVER GATED -------------------------------------
// "A threat beyond the engagement radius is still coming for you." The volley
// holds fire out there; the stance kite does NOT.
check('A1: a threat BEYOND the engagement radius still triggers the flee', () => {
  const c = new AutoPilotController();
  c.stance = 'SAFE';                     // kite 110 => enter flee inside 220px
  const threat = foe(R + 100, 0);        // 200px: no target, but still inbound
  const d = c.decide({ x: 0, y: 0 }, mkState([threat], [{ x: 500, y: 0 }]), cfgKite);
  assert.equal(d.target, null, 'beyond the radius: the volley holds fire');
  assert.equal(c.fleeing, true, 'and the pilot STILL commits to the dodge');
  assert.ok(d.moveX < 0, 'the flee vector points away from the threat (-x)');
  assert.equal(d.moveY, 0);
});

check('A1: the KITE LINE — not the engagement radius — decides the flee (every stance)', () => {
  for (const stance of STANCES) {
    const c = new AutoPilotController();
    c.stance = stance;
    const kite = 55 * C.AUTOPILOT.STANCES[stance].KITE_MULT;
    // Just inside the stance's OWN kite line. SAFE's line (220px) is far wider
    // than the engagement radius, which is the case the owner's directive cares
    // about; GREEDY's (55px) is narrower, and it still decides on its own.
    const inKite = kite * 2 - 1;
    // The gem sits on the SAFE side of the pilot (opposite the threat) so the
    // flee assertion is about the threat response even for GREEDY, whose flee
    // vector bends toward loot (LOOT_WEIGHT 0.65).
    const near = c.decide({ x: 0, y: 0 }, mkState([foe(inKite, 0)], [{ x: -500, y: 0 }]), cfgKite);
    assert.equal(c.fleeing, true, `${stance}: flees at ${inKite}px (inside its kite line ${kite * 2})`);
    assert.ok(near.moveX < 0, `${stance}: flee vector is away from the threat`);
    // Well past the kite line: calm drift toward the gem, no flee.
    const c2 = new AutoPilotController();
    c2.stance = stance;
    const out = c2.decide({ x: 0, y: 0 }, mkState([foe(kite * 2 + 40, 0)], [{ x: 500, y: 0 }]), cfgKite);
    assert.equal(c2.fleeing, false, `${stance}: calm past its kite line`);
    assert.ok(out.moveX > 0, `${stance}: drifts toward the gem`);
  }
});

// --- module purity: controllers never touch the DOM ---------------------------
check('controllers.js is DOM-free (no document/window references)', () => {
  const src = readFileSync(new URL('../src/controllers.js', import.meta.url), 'utf8');
  assert.ok(!/\bdocument\b/.test(src), 'no document access');
  assert.ok(!/\bwindow\b/.test(src), 'no window access');
});

console.log(`controllers: ${passed} checks passed`);
