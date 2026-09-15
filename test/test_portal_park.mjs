// HORDES — P1: boss portal linger + auto-path + approach invulnerability
// (docs/briefs/P1_PORTAL.md + docs/HORDES_GOALS_2026-09-12.md "BOSS PORTAL —
// OWNER DIRECTIVE (2026-09-14)").
//
// The contract under test, driving the REAL seams (no copies):
//   R1  the chase is DELETED: with the player held stationary the portal
//       eases in at C.PORTAL.APPROACH and PARKS on the STANDOFF ring — its
//       distance never drops below STANDOFF, never reaches RADIUS, and its
//       position deltas are exactly 0 once parked (60Hz AND 120Hz);
//   R2  the AutoPilot closes the last gap itself: with the portal open the
//       REAL AutoPilot.decide steers at it (act 'PORTAL'), enters, and the
//       wave reaches the intermission with the chase gone;
//   R2b the exception is PORTAL-ONLY: shrines/chests/arches stay invisible —
//       decide() output is byte-identical with and without them in state;
//   R3  approach invulnerability is AUTO ONLY: p.invuln > 0 while the portal
//       is open under AUTO_ALL and AUTO_MOVE (both pilot-steered through the
//       ONE predicate, main.js pilotMovesYou()) and stays 0 under MANUAL
//       across the same span;
//   R4  the dwell beat: contact holds >= 0.35s and <= 0.5s before the
//       intermission, identical in wall-clock at 60Hz and 120Hz;
//   FLOW the portal-entry cinematic is ENTRY-DRIVEN: cinePending no longer
//       auto-starts the movie while the portal is open (measured BEFORE:
//       portal-open -> cine = 0.000s — the walk never existed); the movie
//       starts only after the dwell elapses.
// Run: node test/test_portal_park.mjs
import { suite, boot } from './_harness.mjs';
import { CONFIG as C } from '../src/config.js';
import { AutoPilotController } from '../src/controllers.js';

const s = suite('test_portal_park');

// ---------------------------------------------------------------------------
// 1. Config pins: the new PORTAL shape; the chase constant is gone.
// ---------------------------------------------------------------------------
s.check('C.PORTAL: RADIUS 16 kept, APPROACH/STANDOFF/DWELL/INVULN exposed, SPEED deleted', () => {
  if (C.PORTAL.RADIUS !== 16) throw new Error('RADIUS = ' + C.PORTAL.RADIUS + ' (must stay 16)');
  if ('SPEED' in C.PORTAL) throw new Error('the chase constant SPEED is still in C.PORTAL');
  if (C.PORTAL.APPROACH !== 40) throw new Error('APPROACH = ' + C.PORTAL.APPROACH);
  if (C.PORTAL.STANDOFF !== 24) throw new Error('STANDOFF = ' + C.PORTAL.STANDOFF);
  if (C.PORTAL.STANDOFF !== 1.5 * C.PORTAL.RADIUS) {
    throw new Error('STANDOFF must be 1.5x RADIUS');
  }
  if (C.PORTAL.DWELL !== 0.4) throw new Error('DWELL = ' + C.PORTAL.DWELL);
  if (C.PORTAL.DWELL < 0.35 || C.PORTAL.DWELL > 0.5) {
    throw new Error('DWELL must sit in the owner-directed 0.35-0.5s band');
  }
  if (C.PORTAL.INVULN !== 0.1) throw new Error('INVULN = ' + C.PORTAL.INVULN);
});

// ---------------------------------------------------------------------------
// 2. Blindness, pinned narrow: the portal is the ONLY non-enemy the pilot reads.
// ---------------------------------------------------------------------------
s.check('portal-only exception: decide() ignores shrines/chests/arches, with and without a portal', () => {
  const cfg = C.PLAYER;
  const base = () => ({
    enemies: [], gems: [], time: 0, wave: { num: 1 }, player: { x: 50, y: 0 },
  });
  const dressed = (st) => Object.assign(st, {
    shrines: [{ x: -100, y: 0 }], chests: [{ x: -80, y: 0 }], arches: [{ x: -60, y: 0 }],
  });
  // No portal: the decision must be BYTE-identical whether or not the
  // shrine/chest/arch field exists (the src/shrines.js:12 contract).
  const c1 = new AutoPilotController();
  const bare = c1.decide({ x: 50, y: 0 }, base(), cfg);
  const c2 = new AutoPilotController();
  const withProps = c2.decide({ x: 50, y: 0 }, dressed(base()), cfg);
  if (JSON.stringify(bare) !== JSON.stringify(withProps)) {
    throw new Error('the pilot READ a shrine/chest/arch: ' +
      JSON.stringify(bare) + ' vs ' + JSON.stringify(withProps));
  }
  // Portal open: the pilot steers STRAIGHT at it (+x), through the prop
  // field sitting on the opposite side — the one sanctioned exception.
  const c3 = new AutoPilotController();
  const st3 = dressed(base());
  st3.portal = { x: 150, y: 0, age: 1 };
  const d = c3.decide({ x: 50, y: 0 }, st3, cfg);
  if (Math.abs(d.moveX - 1) > 1e-9 || Math.abs(d.moveY) > 1e-9) {
    throw new Error('pilot does not steer at the portal: ' + JSON.stringify(d));
  }
  if (c3.act !== 'PORTAL') throw new Error('the live activity should read PORTAL, got ' + c3.act);
  // OWNER DIRECTIVE 2026-09-14: "Pilot should ignore flee status during the
  // portal sequence. That's why we made it invulnerability." A live threat
  // inside the kite line NO LONGER outranks the portal: while the portal is
  // open the pilot is invuln (C.PORTAL.INVULN, refreshed every frame — P1 R3),
  // so kiting buys nothing, and the old ordering parked the pilot on the
  // portal's STANDOFF ring (d 21-23 against RADIUS 16) until the horde died.
  const c4 = new AutoPilotController();
  const st4 = dressed(base());
  st4.portal = { x: 150, y: 0, age: 1 };
  st4.enemies = [{ x: 60, y: 0, hp: 5, maxHp: 5, typeId: 'CHASER' }];
  const d4 = c4.decide({ x: 50, y: 0 }, st4, cfg);
  if (c4.act !== 'PORTAL' || Math.abs(d4.moveX - 1) > 1e-9 || Math.abs(d4.moveY) > 1e-9) {
    throw new Error('the portal must outrank an in-kite-line threat: act=' +
      c4.act + ' ' + JSON.stringify(d4));
  }
  // ...and the kite itself is untouched: with NO portal the same threat flees.
  const c5 = new AutoPilotController();
  const st5 = dressed(base());
  st5.enemies = [{ x: 60, y: 0, hp: 5, maxHp: 5, typeId: 'CHASER' }];
  const d5 = c5.decide({ x: 50, y: 0 }, st5, cfg);
  if (c5.act !== 'FLEE' || d5.moveX > 0) {
    throw new Error('without a portal the kite must still flee: act=' +
      c5.act + ' ' + JSON.stringify(d5));
  }
});

// ---------------------------------------------------------------------------
// 3. Live runs. One boot; fresh runs through the REAL startRun.
// ---------------------------------------------------------------------------
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
// Open the portal through the REAL pendingClear block (main.js:1892) at a
// chosen spot — the same object the boss reap creates, without the 120s wait.
const openPortalAt = (x, y, cineToo = false) => {
  st.enemies.length = 0;
  st.wave.pendingClear = true;
  st.wave.portalX = x;
  st.wave.portalY = y;
  if (cineToo) st.wave.cinePending = true;   // the reap sets both together on the final death
  pinWorld();
  h.pump(1);
  pinWorld();
  if (!st.portal) throw new Error('the pendingClear block did not open the portal');
  return st.portal;
};
const dist = (po, p) => Math.hypot(p.x - po.x, p.y - po.y);
const ST = C.PORTAL.STANDOFF;

// --- R1: the park, both dt regimes ------------------------------------------
for (const hz of [60, 120]) {
  h.setFrameMs(1000 / hz);
  const p = freshRun('MANUAL');
  p.x = 0; p.y = 0;
  const po = openPortalAt(200, 0);
  let minLen = Infinity;
  let parked = false, movedAfterPark = 0;
  let prevX = po.x, prevY = po.y;
  const px0 = p.x, py0 = p.y;
  for (let i = 0; i < 10 * hz; i++) {
    pinWorld();
    h.pump(1);
    if (st.mode !== 'playing') throw new Error(hz + 'Hz: left playing (mode=' + st.mode + ') — nobody should enter');
    const len = dist(po, p);
    if (len < minLen) minLen = len;
    if (parked) {
      // Settle: after the frame that LANDS on the ring, only fp dust may remain.
      if (Math.abs(po.x - prevX) > 1e-9 || Math.abs(po.y - prevY) > 1e-9) movedAfterPark++;
    } else if (len <= ST + 1e-6) {
      parked = true;
    }
    prevX = po.x; prevY = po.y;
    // R3 MANUAL half, same span: no approach window, ever.
    if (p.invuln > 0) throw new Error(hz + 'Hz: MANUAL received invuln (' + p.invuln + ') while parked');
  }
  s.check(hz + 'Hz: the portal PARKS — never below STANDOFF, never enters, settles dead still', () => {
    if (minLen < ST - 1e-9) throw new Error('distance dropped below STANDOFF: ' + minLen);
    if (minLen < C.PORTAL.RADIUS) throw new Error('the portal ENGULFED a stationary player: ' + minLen);
    if (!parked) throw new Error('the portal never reached the standoff ring');
    if (movedAfterPark > 0) throw new Error('the portal kept creeping after the park: ' + movedAfterPark + ' frames');
    if (p.x !== px0 || p.y !== py0) throw new Error('MANUAL moved with no input — the pilot is not steering');
  });
  h.setFrameMs(1000 / 60);
}

// --- R2 + R3(AUTO_ALL): the pilot walks in and enters with the chase gone ----
{
  const p = freshRun();   // startRun re-engages AUTO_ALL
  if (st.pilotMode !== 'AUTO_ALL') throw new Error('startRun did not re-engage AUTO_ALL');
  p.x = 0; p.y = 0;
  const po = openPortalAt(200, 0);
  const tOpen = st.time;
  let sawPortalAct = false, invulnEveryWalkingFrame = true, walkFrames = 0;
  let enteredAt = null, leftAt = null;
  for (let i = 0; i < 60 * 60; i++) {
    pinWorld();
    const wasEntering = !!st.portal && !!st.portal.entering;
    h.pump(1);
    if (st.mode !== 'playing') { leftAt = st.time; break; }
    if (st.portal && !st.portal.entering) {
      walkFrames++;
      if (T.controller.act === 'PORTAL') sawPortalAct = true;
      if (p.invuln <= 0) invulnEveryWalkingFrame = false;
    } else if (st.portal && st.portal.entering && !wasEntering) {
      enteredAt = st.time;
    }
  }
  s.check('R2 AUTO_ALL: the pilot steers at the portal (act PORTAL), closes the gap and ENTERS', () => {
    if (!leftAt) throw new Error('the wave never ended — the pilot never entered (chase removed)');
    if (st.mode !== 'intermission') throw new Error('expected the intermission, got ' + st.mode);
    if (!sawPortalAct) throw new Error('the pilot never reported the PORTAL activity');
    if (enteredAt === null) throw new Error('no dwell beat was armed on contact');
    const walk = enteredAt - tOpen;
    console.log('    AUTO_ALL walk: ' + walk.toFixed(2) + 's over ' + walkFrames + ' frames, dwell -> ' +
      (leftAt - enteredAt).toFixed(3) + 's, mode ' + st.mode);
    if (walk <= 0.3) throw new Error('the "walk" was instant (' + walk.toFixed(3) + 's) — the portal is not lingering');
  });
  s.check('R3 AUTO_ALL: p.invuln > 0 on EVERY frame of the approach', () => {
    if (!invulnEveryWalkingFrame) throw new Error('a walking frame had p.invuln <= 0 under AUTO_ALL');
  });
}

// --- R3 AUTO_MOVE: the pilot steers there too, so the window applies --------
{
  const p = freshRun('AUTO_MOVE');
  p.x = 0; p.y = 0;
  openPortalAt(200, 0);
  let walkFrames = 0, invulnEveryWalkingFrame = true, left = false;
  for (let i = 0; i < 60 * 60; i++) {
    pinWorld();
    h.pump(1);
    if (st.mode !== 'playing') { left = true; break; }
    if (st.portal && !st.portal.entering) {
      walkFrames++;
      if (p.invuln <= 0) invulnEveryWalkingFrame = false;
    }
  }
  s.check('R3 AUTO_MOVE: the window applies (the gate is steering, not the AUTO_ALL string)', () => {
    if (!left) throw new Error('AUTO_MOVE never entered the portal');
    if (walkFrames === 0) throw new Error('AUTO_MOVE never walked');
    if (!invulnEveryWalkingFrame) throw new Error('a walking frame had p.invuln <= 0 under AUTO_MOVE');
  });
}

// --- R4: the dwell beat, identical wall-clock at 60Hz and 120Hz -------------
const dwells = {};
for (const hz of [60, 120]) {
  h.setFrameMs(1000 / hz);
  const p = freshRun('MANUAL');
  p.x = 0; p.y = 0;
  const po = openPortalAt(200, 0);
  // Walk nothing: teleport onto the rim so contact fires on the next tick.
  p.x = po.x + C.PORTAL.RADIUS - 4; p.y = po.y;
  let tEnter = null, tGone = null;
  for (let i = 0; i < 5 * hz; i++) {
    pinWorld();
    h.pump(1);
    if (tEnter === null && st.portal && st.portal.entering) tEnter = st.time;
    if (st.mode !== 'playing') { tGone = st.time; break; }
  }
  if (tEnter === null || tGone === null) throw new Error(hz + 'Hz: the dwell never ran');
  dwells[hz] = tGone - tEnter;
  h.setFrameMs(1000 / 60);
}
s.check('R4 dwell: 0.35-0.5s on contact, identical wall-clock at 60Hz and 120Hz', () => {
  console.log('    dwell 60Hz=' + dwells[60].toFixed(4) + 's 120Hz=' + dwells[120].toFixed(4) + 's');
  for (const hz of [60, 120]) {
    if (dwells[hz] < 0.35 || dwells[hz] > 0.5) {
      throw new Error(hz + 'Hz dwell out of band: ' + dwells[hz]);
    }
  }
  if (Math.abs(dwells[60] - dwells[120]) > 1e-9) {
    throw new Error('dwell is not rate-independent: ' + JSON.stringify(dwells));
  }
});

// --- FLOW: the cinematic is entry-driven (the measured BEFORE was 0.000s) ----
{
  const p = freshRun();   // AUTO_ALL
  p.x = 0; p.y = 0;
  openPortalAt(200, 0, true);   // pendingClear + cinePending, as the final reap sets both
  let framesPlayingWithCinePending = 0, cineStarted = false, enteringSeen = false;
  for (let i = 0; i < 60 * 60; i++) {
    pinWorld();
    h.pump(1);
    if (st.mode === 'portal-cine') { cineStarted = true; break; }
    if (st.mode !== 'playing') throw new Error('unexpected mode ' + st.mode + ' before the movie');
    if (st.portal && st.portal.entering) enteringSeen = true;
    if (st.wave.cinePending) framesPlayingWithCinePending++;
  }
  s.check('FLOW: cinePending does NOT auto-start the movie — entry + dwell does', () => {
    if (!cineStarted) throw new Error('the movie never started');
    if (!enteringSeen) throw new Error('the movie started WITHOUT the entry beat');
    if (framesPlayingWithCinePending < 30) {
      throw new Error('the movie fired almost immediately (' + framesPlayingWithCinePending +
        ' playing frames) — the kill-time auto-start is back');
    }
    // Skip through the real key seam (any key skips). RETARGETED 2026-09-15
    // (V1 escape): on wave 1 the cine's end no longer opens the intermission —
    // it hands the run to THE ESCAPE (owner directive 2026-09-15: the escape
    // hangs off PORTAL ENTRY after the wave-1 boss). Same strength, new
    // invariant: the skip lands in the escape, the escape's OWN skip (ESC)
    // then hands the run back to the intermission SOFT (alive, no death path).
    h.key('keydown', { key: 'x', preventDefault() {} });
    h.pump(2);
    if (st.mode !== 'escape') throw new Error('the skip did not hand the run to the escape: ' + st.mode);
    h.key('keydown', { key: 'Escape', preventDefault() {} });
    let back = 0;
    while (st.mode === 'escape' && back < 400) { h.pump(1); back++; }
    if (st.mode !== 'intermission') throw new Error('the escape skip did not hand back to the intermission: ' + st.mode);
    if (!(st.player.hp > 0)) throw new Error('the escape skip must never kill (hp=' + st.player.hp + ')');
  });
}

s.done();
console.log('ALL PORTAL PARK TESTS PASSED');
