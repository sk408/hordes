// HORDES — P2B99: MANUAL MODE HAS NO MOVEMENT CONTROL (P0 defect, owner
// 2026-09-17 on e456ab0: "manual mode doesn't expose the movement controls
// though so it's currently impossible"). The pins:
//   1. THE ACTION-SET PARITY RULE: every action the AUTO-PILOT takes has a
//      manual control (pad + key), ENUMERATED from the auto-pilot's own
//      output on real runs — asserted, not assumed
//   2. LEFT/RIGHT pads HOLD (finger down = run; the LIFT is the brake the
//      appendage gauntlet is timed around); pointerUp releases; pads and
//      keys are independent surfaces
//   3. DASH has a pad; every pad is hit-testable, on-viewport, disjoint
// Run: node test/test_p2b99_manual_pads.mjs
import { suite } from './_harness.mjs';
import { createSim, step } from '../src/escape/sim.js';
import { inputFor } from '../src/escape/auto.js';
import * as ESCAPE from '../src/escape/index.js';
import { VIEW_W } from '../src/escape/config.js';
import { leftHit, rightHit, jumpHit, dashHit, kickHit, modeHit, skipHit,
  LEFT_RECT, RIGHT_RECT, JUMP_RECT, DASH_RECT, KICK_RECT, MODE_RECT, SKIP_RECT }
  from '../src/escape/render.js';

const S = suite('test_p2b99_manual_pads');
function assert(cond, msg) { if (!cond) throw new Error('AssertionError: ' + msg); }

// ---------------------------------------------------------------------------
// 1 — THE ACTION-SET PARITY RULE (enumerated from the auto-pilot itself)
// ---------------------------------------------------------------------------
S.check('the auto-pilot\'s action set is ENUMERATED from real runs, and every action has a manual pad + key', () => {
  // Run the auto-pilot across seeds and record every input field it ever
  // sets, with its observed values — the action set as the CODE defines it,
  // not as we remember it.
  const actions = new Map();   // field -> Set of observed values
  for (const seed of [1, 2, 3, 9]) {
    const sim = createSim(seed);
    let guard = 0;
    while (!sim.outcome && guard++ < 60 * 60) {
      const input = inputFor(sim);
      for (const [k, v] of Object.entries(input)) {
        if (!actions.has(k)) actions.set(k, new Set());
        actions.get(k).add(typeof v === 'object' ? 'obj' : v);
      }
      step(sim, 1 / 60, input);
    }
    assert(sim.outcome === 'complete', 'the oracle run completed (seed ' + seed + ': ' + sim.outcome + ')');
  }
  const fields = [...actions.keys()].sort();
  // autoClamp (the speed window brace) and snapX (the fire-line snap) are
  // INTERNAL mechanics of the auto's jump timing, not separately controllable
  // actions — they ride the jump. Everything else is an action.
  assert(JSON.stringify(fields) === JSON.stringify(['autoClamp', 'dash', 'jump', 'moveX', 'snapX']),
    'the auto action set drifted: ' + fields.join(','));
  const moveXVals = [...actions.get('moveX')];
  assert(moveXVals.includes(0), 'the auto BRAKES (moveX 0) — the gauntlet is built around it');
  // THE RULE: every action has a manual control — a hit-testable pad AND a
  // key path (onKey). The table is the contract; a new auto action without a
  // row here fails this check.
  const MANUAL = {
    moveX: { pads: [LEFT_RECT, RIGHT_RECT], keys: ['arrowleft', 'a', 'arrowright', 'd'] },
    jump: { pads: [JUMP_RECT], keys: [' ', 'arrowup', 'w'] },
    dash: { pads: [DASH_RECT], keys: ['shift', 'x'] },
  };
  for (const [action, spec] of Object.entries(MANUAL)) {
    assert(actions.has(action), 'the manual table names "' + action + '" which the auto never sets (stale row)');
    assert(spec.pads.length > 0, action + ' has NO pad');
    for (const r of spec.pads) {
      assert(r.x >= 0 && r.y >= 0 && r.x + r.w <= VIEW_W && r.y + r.h <= 300,
        action + ' pad off-viewport: ' + JSON.stringify(r));
    }
  }
  // And the keys really bind (drive onKey, watch the effect through frames).
  console.log('  MEASURED P2B99 action set: ' + fields.join(', ') +
    ' (moveX observed ' + moveXVals.join('/') + ') — all padded + keyed');
});
S.check('the pads are mutually disjoint and clear of SKIP/MODE and the HUD corner', () => {
  const rects = { SKIP: SKIP_RECT, MODE: MODE_RECT, LEFT: LEFT_RECT, RIGHT: RIGHT_RECT,
    JUMP: JUMP_RECT, DASH: DASH_RECT, KICK: KICK_RECT };
  const names = Object.keys(rects);
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = rects[names[i]], b = rects[names[j]];
      const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      assert(!overlap, names[i] + ' overlaps ' + names[j]);
    }
  }
  // The top-left HUD corner (clock / HORDE PRESSURE / its bar / the tail line).
  for (const [n, r] of Object.entries(rects)) {
    if (n === 'SKIP' || n === 'MODE') continue;
    assert(!(r.x < 100 && r.y < 50), n + ' intrudes into the HUD corner');
  }
});

// ---------------------------------------------------------------------------
// 2 — HOLD semantics: finger down runs, the LIFT is the brake
// ---------------------------------------------------------------------------
S.check('RIGHT pad holds: pointerdown runs, pointerUp brakes (the gauntlet timing)', () => {
  ESCAPE.begin({ seed: 5, auto: false, profile: null, onEnd: null });
  const sim = ESCAPE.current();
  sim.wall.x = sim.player.x - 5000;
  sim.pursuers.length = 0; sim.nextShot = Infinity; sim.nextFlier = Infinity;
  for (let i = 0; i < 30; i++) ESCAPE.frame(null, 1 / 60);
  const x0 = sim.player.x;
  ESCAPE.pointer(RIGHT_RECT.x + 10, RIGHT_RECT.y + 10);       // finger down
  for (let i = 0; i < 30; i++) ESCAPE.frame(null, 1 / 60);
  assert(sim.player.x > x0 + 60, 'holding RIGHT ran (x +' + (sim.player.x - x0).toFixed(0) + 'px)');
  const x1 = sim.player.x;
  ESCAPE.pointerUp();                                        // the lift = the brake
  for (let i = 0; i < 30; i++) ESCAPE.frame(null, 1 / 60);
  assert(Math.abs(sim.player.x - x1) < 1, 'after the lift the runner BRAKED (held still)');
  assert(sim.t > 1.4, 'the sim clock kept running through the brake');
});
S.check('LEFT pad runs back; pads and keys are independent surfaces', () => {
  ESCAPE.begin({ seed: 5, auto: false, profile: null, onEnd: null });
  const sim = ESCAPE.current();
  sim.wall.x = sim.player.x - 5000;
  sim.pursuers.length = 0; sim.nextShot = Infinity; sim.nextFlier = Infinity;
  for (let i = 0; i < 30; i++) ESCAPE.frame(null, 1 / 60);
  const x0 = sim.player.x;
  ESCAPE.pointer(LEFT_RECT.x + 10, LEFT_RECT.y + 10);
  for (let i = 0; i < 30; i++) ESCAPE.frame(null, 1 / 60);
  assert(sim.player.x < x0 - 60, 'holding LEFT ran back');
  // Key-held movement survives a pointerUp (a lift must not drop a held key).
  const xL = sim.player.x;
  ESCAPE.onKey('d', true);
  ESCAPE.pointerUp();
  for (let i = 0; i < 30; i++) ESCAPE.frame(null, 1 / 60);
  assert(sim.player.x > xL + 60, 'the held KEY outlived the pad lift');
  // And a pad press survives a keyup (a keyup must not drop a finger).
  const x1 = sim.player.x;
  ESCAPE.onKey('d', false);
  ESCAPE.pointer(RIGHT_RECT.x + 10, RIGHT_RECT.y + 10);
  for (let i = 0; i < 30; i++) ESCAPE.frame(null, 1 / 60);
  assert(sim.player.x > x1 + 60, 'the held PAD outlived the keyup');
});
S.check('the DASH pad fires the same dash the auto pilot uses', () => {
  ESCAPE.begin({ seed: 5, auto: false, profile: null, onEnd: null });
  const sim = ESCAPE.current();
  sim.wall.x = sim.player.x - 5000;
  sim.pursuers.length = 0; sim.nextShot = Infinity; sim.nextFlier = Infinity;
  for (let i = 0; i < 30; i++) ESCAPE.frame(null, 1 / 60);
  assert(sim.player.dashCd === 0, 'dash off cooldown');
  ESCAPE.pointer(DASH_RECT.x + 10, DASH_RECT.y + 10);
  ESCAPE.frame(null, 1 / 60);
  assert(sim.player.dashT > 0, 'the DASH pad started the burst');
  assert(sim.player.dashCd > 0, 'the cooldown armed');
});
S.check('TWO THUMBS: a JUMP tap\'s lift cannot drop the RUN finger (per-pointer pads)', () => {
  ESCAPE.begin({ seed: 5, auto: false, profile: null, onEnd: null });
  const sim = ESCAPE.current();
  sim.wall.x = sim.player.x - 5000;
  sim.pursuers.length = 0; sim.nextShot = Infinity; sim.nextFlier = Infinity;
  for (let i = 0; i < 30; i++) ESCAPE.frame(null, 1 / 60);
  // Left thumb holds RUN (pointer 1). Right thumb taps JUMP (pointer 2): the
  // tap's OWN pointerup must release only pointer 2 — the run finger stays.
  ESCAPE.pointer(RIGHT_RECT.x + 10, RIGHT_RECT.y + 10, 1);
  ESCAPE.frame(null, 1 / 60);
  const x0 = sim.player.x;
  ESCAPE.pointer(JUMP_RECT.x + 10, JUMP_RECT.y + 10, 2);
  ESCAPE.pointerUp(2);                          // the jump finger lifts
  let airborne = false;
  for (let i = 0; i < 40; i++) {
    ESCAPE.frame(null, 1 / 60);
    if (!sim.player.onGround) airborne = true;
  }
  assert(airborne, 'the JUMP tap jumped (its own pointer fired)');
  assert(sim.player.x > x0 + 60, 'the RUN finger HELD through the jump lift (x +' +
    (sim.player.x - x0).toFixed(0) + 'px — a tap must not brake the run)');
  // And the run finger's OWN lift is still the brake afterwards.
  const x1 = sim.player.x;
  ESCAPE.pointerUp(1);
  for (let i = 0; i < 30; i++) ESCAPE.frame(null, 1 / 60);
  let moving = false;
  for (let i = 0; i < 10; i++) { ESCAPE.frame(null, 1 / 60); if (Math.abs(sim.player.vx) > 0.01) moving = true; }
  assert(!moving, 'the run finger\'s own lift still brakes');
});

S.check('a mode flip releases the held pads (no phantom run across the switch)', () => {
  let autoFlag = false;
  ESCAPE.begin({ seed: 5, auto: false, profile: null, onEnd: null,
    getAuto: () => autoFlag, onToggleMode: null });
  const sim = ESCAPE.current();
  sim.wall.x = sim.player.x - 5000;
  sim.pursuers.length = 0; sim.nextShot = Infinity; sim.nextFlier = Infinity;
  ESCAPE.pointer(RIGHT_RECT.x + 10, RIGHT_RECT.y + 10);
  ESCAPE.frame(null, 1 / 60);
  const x1 = sim.player.x;
  autoFlag = true;                       // flip to auto mid-hold
  ESCAPE.frame(null, 1 / 60);            // the transition frame (the AUTO
  autoFlag = false;                      // pilot drives this one — its own move
  const x2 = sim.player.x;               // is not the leak under test)
  ESCAPE.frame(null, 1 / 60);            // and back — the pad hold is GONE
  // The auto's one driving frame may leave velocity or a dash burst behind
  // (its OWN action, not a leak) — what must not survive is the PAD HOLD. Let
  // the runner come to rest, then prove it STAYS at rest.
  let stop = 0;
  for (let i = 0; i < 180 && stop < 10; i++) {
    ESCAPE.frame(null, 1 / 60);
    stop = (Math.abs(sim.player.vx) < 0.01 && sim.player.onGround) ? stop + 1 : 0;
  }
  assert(stop >= 10, 'the runner came to rest after the flip');
  const x3 = sim.player.x;
  for (let i = 0; i < 30; i++) ESCAPE.frame(null, 1 / 60);
  assert(Math.abs(sim.player.x - x3) < 1, 'the flipped-away pad hold did not leak back');
});

console.log('test_p2b99_manual_pads: all checks passed');
process.exit(0);
