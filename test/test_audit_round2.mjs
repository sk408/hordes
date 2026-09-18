// AUDIT FIXES ROUND 2 (2026-09-16) — one failing-first test per item.
//   ITEM 1: the SWARM focus picker was O(n^2); it is now a hybrid (exact scan
//     <= SWARM_EXACT_MAX, grid cell-count sums above). Small-horde picks are
//     UNCHANGED byte-for-byte; the benchmark lives in tools/swarm_bench.mjs.
//   ITEM 2: the joystick release listeners moved from touchLayer to window —
//     a finger lift off the layer used to strand the captured pointer and the
//     last drag vector steered forever.
//   ITEM 3: startRun clears state.rewriteEchoes + the five meta-screen
//     *Return markers, and a MECHANICAL GUARD holds every state.* field
//     referenced anywhere in src/ to "initialized in the factory literal OR
//     reset in startRun OR on the documented allowlist".
// Every check FAILS on the pre-fix tree (verified red before landing fixes).
// Run: node test/test_audit_round2.mjs
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { CONFIG as C } from '../src/config.js';
import { AutoPilotController, SWARM_EXACT_MAX } from '../src/controllers.js';
import { boot, suite } from './_harness.mjs';

const S = suite('AUDIT ROUND 2');

// ---------- shared fixture helpers (SWARM) ----------
const CR = C.AUTOPILOT.SWARM_CLUSTER_R;              // 60
const RANGE = 400;
const mk = (x, y) => ({ x, y, hp: 10, maxHp: 10 });  // alive, shootable stubs
const ctl = new AutoPilotController();
ctl.focus = 'SWARM';
const P = { x: 0, y: 0, stats: { focusRange: RANGE } };
const nearestRef = (p, es) => es.reduce((b, e) => {
  const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
  return (!b || d < b.d) ? { e, d } : b;
}, null)?.e ?? null;

// BEFORE — the pre-round-2 SWARM scan, verbatim. The small-horde equivalence
// checks below prove the shipped picker still makes exactly these picks.
function swarmNaiveExact(p, enemies) {
  const r2 = RANGE * RANGE, cr2 = CR ** 2;
  let best = null, bc = -1, bd = Infinity;
  for (const e of enemies) {
    const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
    if (d > r2) continue;
    let count = 0;
    for (const o of enemies) {
      if ((o.x - e.x) ** 2 + (o.y - e.y) ** 2 <= cr2) count++;
    }
    if (count > bc || (count === bc && d < bd)) { bc = count; bd = d; best = e; }
  }
  return best;
}

// ---------- ITEM 1: SWARM picker --------------------------------------------
S.check('SWARM small hordes: densest cluster wins, distance tiebreak, exact pick', () => {
  // A lone enemy near the player vs a dense 5-cluster further out: the cluster
  // member NEAREST the player is the pick (densest cluster, then distance).
  const lone = mk(-50, 0);
  const cluster = [mk(120, 0), mk(130, 0), mk(125, 8), mk(135, -8), mk(128, 4)];
  const enemies = [lone, ...cluster];
  const got = ctl.pickTarget(P, { enemies }, C, nearestRef(P, enemies));
  assert.equal(got, cluster[0], 'the densest cluster is targeted, nearest member first');
  assert.equal(got, swarmNaiveExact(P, enemies), 'identical to the pre-fix exact scan');
  // Equal-density tie: the CLOSER cluster's member wins.
  const a = [mk(-100, 0), mk(-108, 0), mk(-104, 6)];
  const b = [mk(100, 0), mk(108, 0), mk(104, 6)];
  const enemies2 = [...a, ...b];
  const got2 = ctl.pickTarget(P, { enemies: enemies2 }, C, nearestRef(P, enemies2));
  assert.equal(got2, a[0], 'an exact density tie falls to the nearer candidate');
  assert.equal(got2, swarmNaiveExact(P, enemies2), 'identical to the pre-fix exact scan');
});

S.check('SWARM equivalence: seeded random small hordes pick identically to the exact scan', () => {
  let seed = 20260916;
  const rng = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let trial = 0; trial < 25; trial++) {
    const n = 1 + Math.floor(rng() * 64);
    const enemies = [];
    for (let i = 0; i < n; i++) {
      enemies.push(mk(Math.round((rng() - 0.5) * 2 * RANGE), Math.round((rng() - 0.5) * 2 * RANGE)));
    }
    const want = swarmNaiveExact(P, enemies);
    const got = ctl.pickTarget(P, { enemies }, C, nearestRef(P, enemies));
    assert.equal(got, want, `trial ${trial} (n=${n}) must pick identically to the exact scan`);
  }
});

// The boundary fixture: a field where the EXACT scan and the GRID score rank
// two candidates OPPOSITELY (the disclosed approximation, pinned mechanically):
//   A at (30,0) + 5 supporters, EACH > CR from A and > CR from each other (so
//     every exact count is 1) but each in a cell ADJACENT to A's — inside its
//     3x3 neighbourhood. grid(A) = 6 > exact(A) = 1.
//   B at (200,0) + 3 supporters within 40px: exact(B) = grid(B) = 4, and B is
//     the closest count-4 member, so the EXACT scan picks B.
// Grid picks A (6 > 4). Padded to size with far-off enemies (out of engagement
// range, in their own cells).
function boundaryField(total) {
  const f = [mk(30, 0),
    mk(0, 100), mk(110, 100), mk(110, 0), mk(0, -55), mk(-59, 50),   // A's cell-symmetric supporters
    mk(200, 0), mk(210, 0), mk(195, 8), mk(205, -8)];                // B's tight cluster
  assert.ok(f.length <= total, 'fixture fits the requested horde size');
  for (let i = f.length; i < total; i++) f.push(mk(1000 + i * 3 * CR, 1000));
  return f;
}

S.check('SWARM boundary: SWARM_EXACT_MAX is exact, +1 flips to the grid path', () => {
  assert.ok(SWARM_EXACT_MAX >= 64, 'the exact band covers real small hordes');
  const isB = (pick) => !!pick && Math.abs(pick.x - 200) < 30 && Math.abs(pick.y) < 20;
  const atMax = boundaryField(SWARM_EXACT_MAX);
  const gotExact = ctl.pickTarget(P, { enemies: atMax }, C, nearestRef(P, atMax));
  assert.equal(isB(gotExact), true,
    'at exactly SWARM_EXACT_MAX the EXACT scan runs (picks B, count 4 > 1)');
  const over = boundaryField(SWARM_EXACT_MAX + 1);
  const gotGrid = ctl.pickTarget(P, { enemies: over }, C, nearestRef(P, over));
  assert.equal(isB(gotGrid), false,
    'at SWARM_EXACT_MAX + 1 the GRID path runs (picks A, cell-sum 6 > 4) — red pre-fix, the O(n^2) scan picked B');
});

S.check('SWARM above the boundary still targets the densest cluster (behavior)', () => {
  // 300 enemies: a 200-strong core at (+200,0) vs a 20-strong decoy near the
  // player. The grid path must still hand back a CORE member.
  const enemies = [mk(150, 0)];
  for (let i = 0; i < 20; i++) enemies.push(mk(150 + ((i * 7) % 40) - 20, ((i * 11) % 40) - 20));
  for (let i = 0; i < 200; i++) {
    const a = (i / 200) * Math.PI * 2, r = (i % 20) * 2.5;
    enemies.push(mk(200 + Math.cos(a) * r, Math.sin(a) * r));
  }
  const got = ctl.pickTarget(P, { enemies }, C, nearestRef(P, enemies));
  assert.ok(got, 'a target was picked');
  const inCore = Math.hypot(got.x - 200, got.y) < 60;
  assert.ok(inCore, `the pick is a core member (dist from core centre ${Math.hypot(got.x - 200, got.y).toFixed(1)})`);
});

// ---------- ITEM 2: joystick recenter on off-layer lift ----------------------
const h = await boot();
const T = h.T;
const st = h.state;

S.check('joystick: pointerup OFF the layer (window) recenters the stick', () => {
  // Steer via the REAL pointerdown routing: finger 7 parks the stick right.
  const fireDown = (id, x, y) => h.elements['touch']._ev['pointerdown']({
    preventDefault() {}, pointerId: id, clientX: x, clientY: y,
    target: { closest: (s) => (s === '[data-joy]') ? {} : null },
  });
  fireDown(7, 300, 150);   // base rect is 480x300 centred (240,150): dx=+60
  assert.equal(T.pilotInput.x, 1, 'the drag steers hard right');
  assert.ok(T.pilotInput.mag > 0.2, 'the deflection is live (mag=' + T.pilotInput.mag + ')');
  // THE AUDIT CASE: the finger lifts OUTSIDE the touch layer. That lift only
  // exists as a WINDOW pointerup — pre-fix no listener heard it and the vector
  // steered forever.
  assert.equal(typeof h.handlers['pointerup'], 'function',
    'a window pointerup listener must exist (the off-layer lift lands there)');
  h.handlers['pointerup']({ pointerId: 7 });
  assert.ok(T.pilotInput.x === 0 && T.pilotInput.y === 0 && T.pilotInput.mag === 0,
    'the off-layer lift recenters the stick (no stranded vector)');
  // Multi-touch: a DIFFERENT finger's lift must not release the stick...
  fireDown(9, 300, 150);
  h.handlers['pointerup']({ pointerId: 12345 });
  assert.ok(T.pilotInput.mag > 0.2, 'a foreign pointerup does not release the stick');
  // …but its OWN lift does, and a fresh press re-steers afterwards.
  h.handlers['pointercancel']({ pointerId: 9 });
  assert.ok(T.pilotInput.mag === 0, 'pointercancel (system grab) also recenters');
  fireDown(11, 300, 150);
  assert.ok(T.pilotInput.mag > 0.2, 'a fresh press re-steers after a release');
  h.handlers['pointerup']({ pointerId: 11 });
  // Blur still clears everything (the alt-tab guard is untouched).
  fireDown(12, 300, 150);
  assert.ok(T.pilotInput.mag > 0.2, 'steering again for the blur probe');
  assert.equal(typeof h.handlers['blur'], 'function', 'the blur guard is registered');
  h.handlers['blur']();
  assert.ok(T.pilotInput.mag === 0 && !T.pilotInput.up && !T.pilotInput.right,
    'blur still clears the stick and every held direction');
});

// ---------- ITEM 3a: startRun clears the six stray fields --------------------
S.check('startRun clears rewriteEchoes and every *Return marker', () => {
  st.rewriteEchoes = [{ kind: 'STALE' }];
  st.apexReturn = 'menu';
  st.bestiaryReturn = 'menu';
  st.settingsReturn = 'menu';
  st.statsReturn = 'menu';
  st.trophiesReturn = 'menu';
  T.startRun();
  h.pump(2);
  assert.deepEqual(st.rewriteEchoes, [], 'the rewrite echo queue starts empty');
  assert.equal(st.apexReturn, null, 'apexReturn cleared');
  assert.equal(st.bestiaryReturn, null, 'bestiaryReturn cleared');
  assert.equal(st.settingsReturn, null, 'settingsReturn cleared');
  assert.equal(st.statsReturn, null, 'statsReturn cleared');
  assert.equal(st.trophiesReturn, null, 'trophiesReturn cleared');
});

// ---------- ITEM 3b: the MECHANICAL state-field guard -------------------------
// Census: every state.<field> referenced anywhere under src/ must be
// (a) initialized in the `const state = { ... }` factory literal, or
// (b) assigned in startRun's body, or
// (c) on the ALLOWLIST below (documented user settings, published per-frame).
// The check FAILS when a new field is referenced but never initialized — that
// is its whole job (a run-scoped field the factory/startRun forgot is exactly
// the cross-run leak class this round fixed by hand).
S.check('guard: every state.* referenced in src/ is factory-initialized, startRun-reset, or allowlisted', () => {
  const srcDir = fileURLToPath(new URL('../src/', import.meta.url));
  const main = readFileSync(path.join(srcDir, 'main.js'), 'utf8');

  // (a) factory literal — top-level property names, by brace depth.
  const factory = new Set();
  {
    const fstart = main.indexOf('const state = {');
    assert.ok(fstart >= 0, 'the state factory literal was found');
    const open = main.indexOf('{', fstart);
    let depth = 0, end = open;
    for (; end < main.length; end++) {
      if (main[end] === '{') depth++;
      else if (main[end] === '}') { depth--; if (depth === 0) break; }
    }
    let d = 0;
    for (const line of main.slice(open, end + 1).split('\n')) {
      const t = line.trim();
      if (d === 1) {
        const m = t.match(/^([A-Za-z_$][\w$]*)\s*:/) || t.match(/^([A-Za-z_$][\w$]*)\s*\(/);
        if (m && m[1] !== '__proto__') factory.add(m[1]);
      }
      for (const ch of line) { if (ch === '{') d++; else if (ch === '}') d--; }
    }
  }
  // (b) startRun body — `state.<name> =` assignments.
  const startRun = new Set();
  {
    const sstart = main.search(/function startRun\s*\(/);
    assert.ok(sstart >= 0, 'startRun was found');
    const open = main.indexOf('{', sstart);
    let depth = 0, end = open;
    for (; end < main.length; end++) {
      if (main[end] === '{') depth++;
      else if (main[end] === '}') { depth--; if (depth === 0) break; }
    }
    for (const m of main.slice(open, end + 1).matchAll(/\bstate\.([A-Za-z_$][\w$]*)\s*=(?!=)/g)) {
      startRun.add(m[1]);
    }
  }
  assert.ok(factory.size > 50, `the factory parse found a real literal (${factory.size} fields)`);
  assert.ok(startRun.size > 30, `the startRun parse found a real body (${startRun.size} resets)`);

  // (c) ALLOWLIST — user settings mirrored onto state for the renderer, owned
  // by their toggle handlers and deliberately NOT run-scoped:
  //   focus / stance  — the doctrine dial (syncChrome mirror of controller
  //                     state; tactical, moment-to-moment, never persisted)
  //   zoomScale       — the published world-zoom factor (sticky session pref)
  //   fsOverlay       — the transient fullscreen toggle's published state
  //                     (supported/visible/active; a syncChrome mirror like
  //                     focus/stance, session-scoped, never run-reset — the
  //                     0.5s window must survive a run boundary)
  const ALLOWLIST = new Set(['focus', 'stance', 'zoomScale', 'fsOverlay']);

  // The census over every module in src/.
  const missing = [];
  for (const f of readdirSync(srcDir).filter(f => f.endsWith('.js'))) {
    const text = readFileSync(path.join(srcDir, f), 'utf8');
    for (const m of text.matchAll(/\bstate\.([A-Za-z_$][\w$]*)/g)) {
      const name = m[1];
      if (factory.has(name) || startRun.has(name) || ALLOWLIST.has(name)) continue;
      if (!missing.includes(name + ' (' + f + ')')) missing.push(name + ' (' + f + ')');
    }
  }
  assert.deepEqual(missing, [],
    'state fields referenced but never initialized/reset (add them to the ' +
    'factory or startRun, or the ALLOWLIST with a reason):\n  ' + missing.join('\n  '));
});

S.done();
