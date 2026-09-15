// HORDES — V1 THE ESCAPE SEQUENCE (docs/briefs/V1_ESCAPE_SEQUENCE.md).
//
// The deterministic bar, proven here:
//   #1  the generator invariant (every authored arc clears/lands) across seeds
//   #1a income separation + the twice-in-a-row compounding clause (payout is a
//       DIRECT bank credit; bestGold is a max, so collecting cannot grow it)
//   #6  the escape reads NO stats (identical traces whatever surrounds it)
//   #7  60Hz and 120Hz outcome parity, measured on full auto-played runs
//   #9  no blind drops / no off-screen holes / no unavoidable damage (walked)
//   #10 soft failure: every end hands the run back; nothing dies
// Deferred under the owner's measurement freeze (2026-09-15): AUTO completion
// cohorts (#2), measured duration (#4), payout share (#1b). Their deterministic
// shadows are asserted where cheap (completion is provable, duration is bounded
// by construction); the sim-shaped readings wait.
import { readFileSync } from 'node:fs';
import { suite, boot } from './_harness.mjs';
import { generateCorridor, platformsOf, triggersOf, checkCorridor, AIRTIME, reach }
  from '../src/escape/generator.js';
import { createSim, step, pressure, nominalSeconds } from '../src/escape/sim.js';
import { inputFor } from '../src/escape/auto.js';
import { PHYS, PACING, THREATS, WALL, PAYOUT_K } from '../src/escape/config.js';
import { VIEW_W } from '../src/escape/config.js';
import * as ESCAPE from '../src/escape/index.js';
import { skipHit, SKIP_RECT } from '../src/escape/render.js';
import { bestGoldOf, payoutFor, collect } from '../src/escape/payout.js';
import { recordRun, ensureAchievements, normalizeAchievements } from '../src/achievements.js';
import { makeProfile } from '../src/meta.js';

const S = suite('test_v1_escape');
function assert(cond, msg) { if (!cond) throw new Error('AssertionError: ' + msg); }

// ---------------------------------------------------------------------------
// #1 — the generator invariant + the ramp (pure).
// ---------------------------------------------------------------------------
S.check('the invariant holds on 80 seeded corridors (a fail is a template bug)', () => {
  let fails = 0;
  for (let seed = 1; seed <= 80; seed++) {
    const c = generateCorridor(seed);
    const f = checkCorridor(c);
    if (f.length) fails += f.length;
  }
  assert(fails === 0, fails + ' invariant failures across 80 corridors');
});

S.check('the corridor RAMPS: tiers never decrease, exactly one boss, one portal', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const c = generateCorridor(seed);
    let lastTier = -1, bosses = 0;
    for (const s of c.segs) {
      assert(s.tier >= lastTier, 'seed ' + seed + ': tier dipped to ' + s.tier + ' after ' + lastTier);
      lastTier = s.tier;
      if (s.kind === 'boss') bosses++;
    }
    assert(bosses === 1, 'seed ' + seed + ': ' + bosses + ' boss segments (want exactly 1)');
    assert(Number.isInteger(c.portalX) && c.portalX > 0 && c.portalX < c.length,
      'seed ' + seed + ': portal at ' + c.portalX + ' of ' + c.length);
  }
});

S.check('duration is bounded by the pacing target (nominal reading)', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const c = generateCorridor(seed);
    const secs = nominalSeconds(c);
    assert(secs >= PACING.MIN_SECONDS && secs <= PACING.MAX_SECONDS + 4,
      'seed ' + seed + ': ' + secs.toFixed(1) + 's outside [' + PACING.MIN_SECONDS + ',' + (PACING.MAX_SECONDS + 4) + ']');
  }
});

S.check('every trigger band is AUTO-only data with a sane window and width', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const c = generateCorridor(seed);
    const trig = triggersOf(c);
    assert(trig.length > 4, 'seed ' + seed + ': only ' + trig.length + ' triggers');
    for (const t of trig) {
      assert(t.vMin <= t.vMax, 'window inverted at ' + t.x0);
      assert(t.vMax <= PHYS.RUN_SPEED * 1.3, 'silliness cap breached at ' + t.x0 + ' (vMax ' + t.vMax + ')');
      assert(t.x1 - t.x0 >= 52, 'band too narrow for the prologue landing at ' + t.x0);
    }
    // The boss beat carries NO triggers (weaving, not bands — by design).
    const bossSeg = c.segs.find(s => s.kind === 'boss');
    assert(bossSeg && bossSeg.triggers.length === 0 && bossSeg.gaps.length === 0,
      'the boss beat must be trigger-free terrain');
  }
});

// ---------------------------------------------------------------------------
// #7 + completion + purity — full auto-played sims at BOTH rates (measured).
// ---------------------------------------------------------------------------
function playOut(seed, hz, capSecs = 170) {
  const sim = createSim(seed);
  const dt = 1 / hz;
  let n = 0;
  while (!sim.outcome && n < hz * capSecs) { step(sim, dt, inputFor(sim)); n++; }
  return sim;
}
S.check('the AUTO controller COMPLETES the escape on every seeded corridor', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const sim = playOut(seed, 60);
    assert(sim.outcome === 'complete',
      'seed ' + seed + ': auto finished "' + sim.outcome + '" at x=' + Math.round(sim.player.x) +
      ' t=' + sim.t.toFixed(1) + 's (a completed run must always be possible)');
  }
});
S.check('60Hz and 120Hz produce the SAME OUTCOME on the same seed (parity, measured)', () => {
  for (let seed = 1; seed <= 8; seed++) {
    const a = playOut(seed, 60), b = playOut(seed, 120);
    assert(a.outcome === b.outcome,
      'seed ' + seed + ': 60Hz -> ' + a.outcome + ' but 120Hz -> ' + b.outcome);
    // The wall never gets meaningfully close on a completing run — the timer
    // pressures hesitation, not competence (the 252px/s wall was UNBEATABLE;
    // this tune is measured, not assumed).
    if (a.outcome === 'complete') assert(pressure(a) > 0, 'seed ' + seed + ': ended inside the wall');
  }
});

// ---------------------------------------------------------------------------
// #6 — no stats: the sim is a pure function of (seed, dt, input); nothing a
// profile carries can reach it, and the integrated hand-over traces identical.
// ---------------------------------------------------------------------------
S.check('step() is a pure function of (sim, dt, input): identical seeds trace identical', () => {
  const trace = (hz) => {
    const sim = createSim(31337);
    let h = 0;
    for (let i = 0; i < hz * 30 && !sim.outcome; i++) {
      step(sim, 1 / hz, inputFor(sim));
      h = (h * 31 + Math.round(sim.player.x * 16) + Math.round(sim.player.y * 16)) | 0;
    }
    return { h, x: Math.round(sim.player.x * 100), outcome: sim.outcome };
  };
  assert(JSON.stringify(trace(60)) === JSON.stringify(trace(60)),
    'the same seed + rate must be bit-stable');
  assert(trace(60).outcome === trace(120).outcome, 'rate changes nothing about the outcome');
});
S.check('the escape modules never import the profile-side stat chain', () => {
  // Structural proof: the escape's damage/threat numbers are FLAT constants
  // (one shot kills a pursuer at base AND at a maxed profile — there is no
  // stat read anywhere in src/escape to scale them).
  assert(THREATS.SHOT_DMG === 1 && THREATS.PURSUER_HP === 1,
    'threat lethality is flat by construction (SHOT_DMG/PURSUER_HP)');
  for (const f of ['config.js', 'generator.js', 'sim.js', 'auto.js', 'render.js', 'payout.js', 'index.js']) {
    const src = readFileSync(new URL('../src/escape/' + f, import.meta.url), 'utf8');
    // Comments are prose, not code — strip them so the scan reads the CODE only.
    const code = src.replace(/^[ \t]*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert(!/p\.stats|applyMetaBonuses|state\.player|runPurse/.test(code),
      f + ' reaches into the overhead stat/run chain (self-containment breach)');
    assert(!code.includes('Math.random'), f + ' consumes unseeded randomness');
  }
});

// ---------------------------------------------------------------------------
// #9 — no blind drops, no off-screen holes (a WALKED corridor, not asserted).
// ---------------------------------------------------------------------------
S.check('walking a corridor: every gap edge is on-screen at its fire line; drops are never blind', () => {
  const CAM_LEAD = 150;                       // render.js: the runner's screen x
  const visibleAhead = VIEW_W - CAM_LEAD;     // 330px of corridor ahead
  for (let seed = 1; seed <= 20; seed++) {
    const c = generateCorridor(seed);
    const plats = platformsOf(c);
    const gaps = c.segs.flatMap(s => s.gaps);
    const trig = triggersOf(c);
    for (const g of gaps) {
      // The trigger that serves this gap fires BEFORE it, with the leading
      // edge visible (the arc math guarantees the crossing; visibility is the
      // no-blind-drop rule).
      const t = trig.filter(t => t.x0 < g.x).sort((a, b) => b.x0 - a.x0)[0];
      assert(t && g.x - t.x0 <= visibleAhead && g.x - t.x0 > 0,
        'seed ' + seed + ': gap at ' + g.x + ' is ' + (t ? Math.round(g.x - t.x0) + 'px past its fire line' : 'has no trigger'));
    }
    // The portal beacon: a 132px pillar, approachable on a flat — visible
    // from 330px out and standing on walkable ground.
    const underPortal = plats.find(p => p.x <= c.portalX && p.x + p.w >= c.portalX);
    assert(underPortal && underPortal.y === 252,
      'seed ' + seed + ': the portal has no floor under it');
  }
});
S.check('the boss only ever destroys terrain BEHIND the runner (no unavoidable fail)', () => {
  for (let seed = 1; seed <= 6; seed++) {
    const sim = playOut(seed, 60);
    for (const d of sim.destroyedPlats) {
      assert(d.x + d.w < sim.player.x,
        'seed ' + seed + ': the boss tore out terrain at ' + d.x + ' ahead of the runner');
    }
    assert(sim.outcome === 'complete', 'seed ' + seed + ': boss-beat corridor did not complete');
  }
});
S.check('fliers can NEVER make contact (unavoidable sine-phase damage is forbidden)', () => {
  // Walked, not asserted: every flier that passes a runner over a full
  // corridor never lands a contact — the threat layer has no unavoidable hit.
  const sim = createSim(5);
  let closest = 1e9;
  let n = 0;
  while (!sim.outcome && n < 60 * 170) {
    step(sim, 1 / 60, inputFor(sim));
    for (const fl of sim.fliers) {
      closest = Math.min(closest, Math.abs(fl.y - sim.player.y));
    }
    n++;
  }
  assert(sim.outcome === 'complete', 'the walk completed');
  assert(closest > THREATS.CONTACT_R + 6,
    'a flier came within ' + Math.round(closest) + 'px vertically of the runner');
});

// ---------------------------------------------------------------------------
// #1a — the payout: direct bank credit, repeatable, never the run total.
// ---------------------------------------------------------------------------
function fakeProfile(bestGold) {
  const p = makeProfile();
  p.gold = 0;
  recordRun(p, { gold: bestGold, kills: 1 });
  return p;
}
S.check('payout = floor(bestGold x K), credited to the BANK, never the purse', () => {
  const p = fakeProfile(12000);
  assert(bestGoldOf(p) === 12000, 'bestGold rides the achievements fold');
  assert(PAYOUT_K === 1 / 30, 'K is the owner-tuned constant');
  assert(payoutFor(12000) === 400, 'floor(12000/30) = 400');
  const purseBefore = p.runPurse;
  const paid = collect(p);
  assert(paid === 400 && p.gold === 400, 'collect credits profile.gold directly');
  assert(p.runPurse === purseBefore, 'the run purse never sees escape income');
});
S.check('twice in a row compounds NOTHING: equal payouts, bestGold unmoved', () => {
  const p = fakeProfile(9000);
  const a = collect(p);
  const best = bestGoldOf(p);
  const b = collect(p);
  assert(a === b && a === 300, 'the second collection is identical (' + a + ' then ' + b + ')');
  assert(bestGoldOf(p) === best, 'collecting cannot grow bestGold (it is a max)');
});
S.check('a zero-history profile pays nothing (no division poison, no free gold)', () => {
  const p = fakeProfile(0);
  assert(collect(p) === 0 && p.gold === 0, 'floor(0 x K) = 0, no credit');
  // A corrupt/missing totals key backfills to 0 through the real normalizer.
  const n = normalizeAchievements({ totals: {} });
  assert(n.totals.bestGold === 0, 'the missing bestGold backfills to 0');
});
S.check('recordRun keeps bestGold a MAX, not a sum', () => {
  const p = fakeProfile(5000);
  recordRun(p, { gold: 4000 });
  assert(bestGoldOf(p) === 5000, 'a worse run does not lower it');
  recordRun(p, { gold: 9000 });
  assert(bestGoldOf(p) === 9000, 'a better run raises it');
});

// ---------------------------------------------------------------------------
// The mode's own controller: skip paths, paid skip, soft failure (pure module).
// ---------------------------------------------------------------------------
S.check('skip ends soft with NO payout by default; the writ collects anyway', () => {
  const plain = fakeProfile(12000);
  let ended = null;
  ESCAPE.begin({ seed: 9, auto: true, profile: plain, onEnd: (r) => { ended = r; } });
  ESCAPE.frame(null, 1 / 60);
  ESCAPE.skip();
  let n = 0;
  while (!ESCAPE.isEnded() && n < 300) { ESCAPE.frame(null, 1 / 60); n++; }
  assert(ESCAPE.isEnded() && ended.result === 'skip', 'skip ended the escape');
  assert(ended.payout === 0 && plain.gold === 0, 'plain skip forfeits the payout');
  // The paid skip (the meta-shop writ): skip AND collect.
  const vet = fakeProfile(12000);
  vet.purchased.escapeskip = 1;
  let ended2 = null;
  ESCAPE.begin({ seed: 9, auto: true, profile: vet, onEnd: (r) => { ended2 = r; } });
  ESCAPE.frame(null, 1 / 60);
  ESCAPE.skip();
  let m = 0;
  while (!ESCAPE.isEnded() && m < 300) { ESCAPE.frame(null, 1 / 60); m++; }
  assert(ended2.paidSkipUsed === true && ended2.payout === 400,
    'the writ collects on skip (' + ended2.payout + ')');
  assert(vet.gold === 400, 'the writ credit landed in the bank');
});
S.check('a caught/fell escape is soft too: no payout, the hand-back fires', () => {
  const p = fakeProfile(12000);
  let ended = null;
  ESCAPE.begin({ seed: 9, auto: true, profile: p, onEnd: (r) => { ended = r; } });
  // Force the wall onto the runner (the soft failure path under test).
  const sim = ESCAPE.current();
  sim.wall.x = sim.player.x + 1000;
  let n = 0;
  while (!ESCAPE.isEnded() && n < 400) { ESCAPE.frame(null, 1 / 60); n++; }
  assert(ended && ended.result === 'caught', 'the wall ended the escape');
  assert(ended.payout === 0 && p.gold === 0, 'failure never pays');
});
S.check('the skip affordance is hit-testable at the same rect the renderer paints', () => {
  assert(skipHit(SKIP_RECT.x + 2, SKIP_RECT.y + 2), 'inside the rect hits');
  assert(!skipHit(4, 4), 'the corner readout area does not');
  assert(!skipHit(SKIP_RECT.x - 1, SKIP_RECT.y), 'one pixel left of the rect misses');
});

// ---------------------------------------------------------------------------
// Integration: the REAL seams (portal-entry hook, frame branch, chrome gate).
// ---------------------------------------------------------------------------
const h = await boot();
const T = h.T;
const st = h.state;

S.check('portal entry at wave 1 hands the run to the escape through the REAL chain', () => {
  T.startRun();
  h.pump(2);
  st.mode = 'portal-cine';
  st.wave.num = 1;
  st.wave.cinePending = false;
  // The cine is SKIPPABLE: any key drives endPortalCine, whose wave-1 branch
  // is the REAL hand-over under test (test_cinematic_input_guard precedent).
  h.key('keydown', { key: 'x', preventDefault() {} });
  assert(st.mode === 'escape', 'mode is ' + st.mode);
  assert(T.escape.sim && T.escape.sim.t >= 0, 'the live sim is exposed');
});
S.check('the escape clock ADVANCES and the chrome gate is OFF for the mode', () => {
  const t0 = T.escape.sim.t;
  h.pump(60);   // one wall second of frames
  assert(T.escape.sim.t > t0 + 0.9, 'sim advanced ' + (T.escape.sim.t - t0).toFixed(2) + 's in 1s');
  assert(T.escape.mode === 'escape', 'still escaping');
  assert(T.chromeOn() === false, 'chromeOn must exclude the escape (pads/cog stand down)');
});
S.check('skip hands the run BACK: intermission, alive, run state intact', () => {
  const purseBefore = T.getProfile().runPurse;
  T.escape.skip();
  let n = 0;
  while (st.mode === 'escape' && n < 300) { h.pump(1); n++; }
  assert(st.mode === 'intermission', 'mode returned to ' + st.mode);
  assert(st.mode !== 'dead' && st.player.hp > 0, 'no death path out of the escape');
  const sub = h.elements['ov-sub'].innerHTML || '';
  assert(/ESCAPE SKIPPED/.test(sub), 'the intermission lead names the escape: ' + sub.slice(0, 80));
  assert(T.getProfile().runPurse === purseBefore, 'the purse was untouched by the skip');
});
S.check('a COMPLETED escape through the integrated pump pays the bank, not the purse', () => {
  const prof = T.getProfile();
  recordRun(prof, { gold: 12000 });
  const bestBefore = bestGoldOf(prof);
  const bankBefore = prof.gold;
  const purseBefore = prof.runPurse;
  let ended = null;
  T.escape.begin({ seed: 42, auto: true, profile: prof, onEnd: (r) => { ended = r; } });
  st.mode = 'escape';
  let n = 0;
  while (st.mode === 'escape' && n < 60 * 200) { T.escape.frame(null, 1 / 60); n++; }
  assert(ended && ended.result === 'complete', 'the integrated run completed (' + (ended && ended.result) + ')');
  assert(ended.payout === payoutFor(bestBefore), 'payout is floor(bestGold x K) = ' + ended.payout);
  assert(prof.gold === bankBefore + ended.payout, 'the credit landed in the bank exactly once');
  assert(prof.runPurse === purseBefore, 'the purse never saw the escape income');
  assert(bestGoldOf(prof) === bestBefore, 'the payout basis is unmoved by collecting');
  st.mode = 'menu';   // leave cleanly (bestiary-test precedent)
});
S.check('no-stats at the SEAM: base and maxed profiles trace identical escapes', () => {
  // Same seed through the REAL hand-over; the profile around it changes, the
  // trace cannot (the escape has no read path into any of it).
  const prof = T.getProfile();
  const runs = [];
  for (const mode of ['base', 'maxed']) {
    if (mode === 'maxed') { prof.gold = 99_999_999; prof.purchased = { dmg: 5, hp: 5 }; }
    else { prof.gold = 0; prof.purchased = {}; }
    let ended = null;
    T.escape.begin({ seed: 777, auto: true, profile: prof, onEnd: (r) => { ended = r; } });
    st.mode = 'escape';
    let n = 0;
    while (st.mode === 'escape' && n < 60 * 200) { T.escape.frame(null, 1 / 60); n++; }
    runs.push({ outcome: ended.result, distance: Math.round(ended.distance), seconds: Math.round(ended.seconds) });
  }
  st.mode = 'menu';
  assert(JSON.stringify(runs[0]) === JSON.stringify(runs[1]),
    'base ' + JSON.stringify(runs[0]) + ' vs maxed ' + JSON.stringify(runs[1]));
});
S.check('#5 no leaked writes: the OVERHEAD world is byte-identical across the escape', () => {
  // A live run enters the escape through the real seam; two wall seconds of
  // the escape's own pump pass; the overhead sim (player, enemies, weapons,
  // run clock, wave) must be BYTE-IDENTICAL — the escape exercises its own
  // layer and can never leak a write into the shared one.
  T.startRun();
  h.pump(2);
  const snap = () => JSON.stringify({
    p: st.player, eLen: st.enemies.length, e0: st.enemies[0] || null,
    w: st.weapons.map(w => [w.type, w.level]), time: st.time, wave: st.wave.num,
  });
  st.mode = 'portal-cine'; st.wave.num = 1; st.wave.cinePending = false;
  h.key('keydown', { key: 'x', preventDefault() {} });   // the real hand-over
  assert(st.mode === 'escape', 'handed to the escape');
  const before = snap();
  h.pump(120);   // 2 wall seconds of the escape, through main.js's own frame()
  const after = snap();
  assert(before === after, 'the overhead world moved during the escape:\n' +
    before.slice(0, 200) + '\nvs\n' + after.slice(0, 200));
  // And the escape's own clock DID move in the same window (the freeze is on
  // the overhead world, not on the mode).
  assert(T.escape.sim.t > 1.5, 'the escape clock ran (t=' + T.escape.sim.t.toFixed(2) + ')');
  T.escape.skip();
  let n = 0;
  while (st.mode === 'escape' && n < 300) { h.pump(1); n++; }
  assert(st.mode === 'intermission', 'handed back soft');
});

S.done();
