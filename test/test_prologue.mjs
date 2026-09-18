// FIRST-RUN PROLOGUE (owner 2026-09-18): "a potion seen on screen and the
// pilot walks towards it... no enemies spawn and the timer hasn't started...
// dismissible (with an ok button) banners explaining some of the basics."
//
// What this file pins, per the brief:
//   PHASE     armed ONLY on run #1 of a fresh profile (derived from
//             achievements.totals.runs === 0 — no new saved field); the
//             world is INERT (no spawns) and state.time is FROZEN, so the
//             prologue is excluded from run duration and every pacing
//             figure by construction.
//   EXITS     the potion drunk (both pilot modes) OR the stated bound
//             (PROLOGUE.MAX_S) — whichever comes first.
//   BANNERS   at most four, OK-dismissible, NON-MODAL (the walk continues
//             while one is up; the canvas OK hit-region consumes its tap
//             and nothing else).
//   EFFECT    the named 45s shield, damage blocked at 44.9s and landing at
//             45.1s; the clear removes ON-SCREEN enemies (view + margin)
//             and NOT off-screen ones, through the normal death pass.
//   RUN #2    no prologue (the derivation contract).
//   ABSORB    the stage-2 tour flags are marked seen when the phase ends
//             (run #1 never stacks a second onboarding path); the HintStrip
//             is gated only DURING the phase.
import { suite, boot } from './_harness.mjs';
import { CONFIG as C } from '../src/config.js';
import { TOUR_KEYS } from '../src/tour.js';
import { prologueShieldColor, prefersReducedMotion } from '../src/render.js';

const S = suite('test_prologue');
function assert(cond, msg) { if (!cond) throw new Error('AssertionError: ' + msg); }
function mulberry32b(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// THE prologue boot: fresh profile kept fresh ({ prologue: true } opts the
// harness's neutralization stamp OUT), own module instance.
const h = await boot({ prologue: true, variant: 'prologue' });
const T = h.T, st = h.state;
const realRandom = Math.random;

function quietField() {
  st.enemies.length = 0; st.gems.length = 0; st.itemDrops.length = 0;
  st.spawnTimer = 999; st.wave.endsAt = st.time + 9999;
  st.wave.bosses = []; st.wave.boss = null; st.portal = null;
}
// The overlay resolver every post-kill pump needs (draft/evolve/intermission
// click through; bannerHold zeroed — the token-banner fixture).
function autoplay(frames, onFrame) {
  for (let i = 0; i < frames; i++) {
    h.pump(1);
    if (st.mode === 'draft' || st.mode === 'evolve') {
      const c0 = h.elements['ov-cards'].children[0]; c0 && c0.click();
    } else if (st.mode === 'intermission') {
      const cont = h.elements['ov-cards'].children.find(c => (c.innerHTML || '').includes('CONTINUE'));
      cont && cont.click();
    }
    st.bannerHold = 0;
    if (onFrame && st.mode === 'playing') onFrame(i);
  }
}
const okCenter = () => {
  const r = T.prologue.okRect();
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
};

// ---------------------------------------------------------------------------
// THE PHASE — inert world, frozen clock, armed on run #1 of a fresh profile.
// ---------------------------------------------------------------------------
S.check('run #1 of a fresh profile opens the prologue: potion visible, world inert, clock frozen', () => {
  Math.random = mulberry32b(0x9f1e);
  try {
    T.banners.suppressAll();
    T.startRun();
    h.pump(2);
    assert(T.prologue.active, 'the prologue is armed on run #1 of a fresh profile');
    assert((T.getProfile().achievements.totals.runs || 0) === 0,
      'the derivation is the EXISTING counter (no new saved field; the sanitized save keeps it sparse)');
    const po = T.prologue.potion;
    const p = st.player;
    assert(po && Math.hypot(po.x - p.x, po.y - p.y) > 40,
      'the potion sits a real walk away (' + JSON.stringify(po) + ')');
    assert(po.x >= 0 && po.x <= C.VIEW_W && po.y >= 0 && po.y <= C.VIEW_H,
      'the potion is ON SCREEN (view ' + C.VIEW_W + 'x' + C.VIEW_H + ', got ' + JSON.stringify(po) + ')');
    // 8 seconds of an untouched run: nothing spawns, the clock never starts.
    // Parked MANUAL pilot (the AUTO pilot would WALK and drink in ~2s —
    // that is EXIT 1's own check below, not this one).
    T.setPilotMode('MANUAL');
    T.pilotInput.x = 0; T.pilotInput.y = 0; T.pilotInput.mag = 0;
    let maxEnemies = 0;
    autoplay(60 * 8, () => {
      maxEnemies = Math.max(maxEnemies, st.enemies.length);
      assert(st.time === 0, 'state.time stays 0 while the prologue lives (got ' + st.time + ')');
    });
    assert(maxEnemies === 0, 'NO enemies spawn during the prologue (max ' + maxEnemies + ')');
    assert(Math.abs(T.prologue.t - 8) < 0.1, 'the phase keeps its own clock (t=' + T.prologue.t.toFixed(2) + ')');
  } finally { Math.random = realRandom; }
});

S.check('the banners: at most four, plain copy, OK-dismissible, and NON-MODAL (the walk continues)', () => {
  Math.random = mulberry32b(0x9f2a);
  try {
    T.banners.suppressAll();
    T.startRun();
    h.pump(2);
    const B = T.prologue.banners;
    assert(B.length === 4 && B.length <= 4, 'exactly four banners (got ' + B.length + ')');
    for (const b of B) {
      assert(!/[^\x00-\x7F]/.test(b.title + b.body), 'no emojis / non-ASCII in UI copy: ' + b.title);
      assert(b.body.length <= 100, 'short and plain: ' + b.title + ' body is ' + b.body.length + ' chars');
    }
    assert(B[3].body.includes(String(C.PROLOGUE.INVULN_S)),
      'the potion banner states what you GET (the ' + C.PROLOGUE.INVULN_S + 's shield)');
    // NON-MODAL: with a banner up, a MANUAL pilot keeps walking.
    T.setPilotMode('MANUAL');
    const x0 = st.player.x, y0 = st.player.y;
    T.pilotInput.x = 1; T.pilotInput.y = 0; T.pilotInput.mag = 1;
    autoplay(30, () => {
      assert(T.prologue.banner(), 'a banner is up while the pilot walks');
    });
    T.pilotInput.x = 0; T.pilotInput.y = 0; T.pilotInput.mag = 0;
    assert(Math.abs(st.player.x - x0) > 5 || Math.abs(st.player.y - y0) > 5,
      'the pilot MOVED while a banner was up (banners never gate the sim)');
    // OK dismisses through the REAL canvas hit-region (the pointer funnel).
    const c0 = okCenter();
    h.elements['game']._ev['pointerdown']({
      preventDefault() {}, pointerId: 1, clientX: c0.x, clientY: c0.y,
    });
    assert(T.prologue.bannerIdx === 1, 'the canvas OK tap advanced the banner (idx ' + T.prologue.bannerIdx + ')');
    // And through the seam (the same function the hit-region calls).
    T.prologue.ok(); T.prologue.ok(); T.prologue.ok();
    assert(T.prologue.bannerIdx === 4 && T.prologue.banner() === null,
      'four OKs exhaust the banners (banner() null, idx ' + T.prologue.bannerIdx + ')');
    const r = T.prologue.okRect();
    assert(r.x >= 0 && r.x + r.w <= C.VIEW_W && r.y >= 0 && r.y + r.h <= C.VIEW_H,
      'the OK rect is inside the view at every viewport (the canvas is one 480x300 source)');
  } finally { Math.random = realRandom; }
});

// ---------------------------------------------------------------------------
// THE EXITS — drunk (both pilot modes) and the stated bound.
// ---------------------------------------------------------------------------
S.check('EXIT 1, MANUAL: walking to the potion drinks it — shield granted, clock starts, banners drop', () => {
  Math.random = mulberry32b(0x9f3b);
  try {
    T.banners.suppressAll();
    T.startRun();
    h.pump(2);
    quietField();
    T.setPilotMode('MANUAL');
    const po = T.prologue.potion;
    const dx = po.x - st.player.x, dy = po.y - st.player.y;
    const L = Math.hypot(dx, dy) || 1;
    T.pilotInput.x = dx / L; T.pilotInput.y = dy / L; T.pilotInput.mag = 1;
    // Capture the grant AT the transition (the shield decays from the drink
    // on, so reading it after the whole window would under-report it).
    let endedAt = -1, invulnAtEnd = 0, shieldAtEnd = 0, drinkFrame = -1, tAtEnd = -1;
    autoplay(60 * 12, (i) => {
      if (endedAt < 0 && !T.prologue.active) {
        endedAt = 1; invulnAtEnd = st.player.invuln; shieldAtEnd = st.prologueShieldT;
        drinkFrame = i; tAtEnd = st.time;
      }
    });
    T.pilotInput.x = 0; T.pilotInput.y = 0; T.pilotInput.mag = 0;
    assert(!T.prologue.active, 'the phase ended on the walk (MANUAL)');
    assert(drinkFrame > 0 && drinkFrame < 60 * 8,
      'the walk drank the potion in a sane time (frame ' + drinkFrame + ')');
    assert(invulnAtEnd > C.PROLOGUE.INVULN_S - 1,
      'the named shield was granted at the drink (invuln ' + invulnAtEnd.toFixed(2) + 's)');
    assert(shieldAtEnd > C.PROLOGUE.INVULN_S - 1,
      'the rainbow ring has its own lifetime (' + shieldAtEnd.toFixed(2) + 's)');
    // The clock starts at phase END: the prologue seconds are not run seconds.
    assert(tAtEnd < 0.05,
      'the clock read 0 at phase end — the prologue walk is not run time (t=' + tAtEnd + ')');
    const tBefore = st.time;
    autoplay(60);
    assert(Math.abs((st.time - tBefore) - 1) < 0.05,
      'the clock runs normally after the phase (delta ' + (st.time - tBefore).toFixed(2) + 's in 1s)');
  } finally { Math.random = realRandom; }
});

S.check('EXIT 1, AUTO: the pilot\'s first act is the walk — unattended, it drinks', () => {
  Math.random = mulberry32b(0x9f4c);
  try {
    T.banners.suppressAll();
    T.startRun();
    h.pump(2);
    quietField();
    T.setPilotMode('AUTO');
    let sawPrologueAct = false, invulnAtEnd = 0;
    autoplay(60 * 12, () => {
      if (T.controller && T.controller.act === 'PROLOGUE') sawPrologueAct = true;
      if (!T.prologue.active && invulnAtEnd === 0) invulnAtEnd = st.player.invuln;
    });
    assert(sawPrologueAct, 'the AUTO pilot flew the PROLOGUE branch on the way');
    assert(!T.prologue.active && invulnAtEnd > C.PROLOGUE.INVULN_S - 1,
      'unattended AUTO walked to the potion and drank (invuln at drink ' + invulnAtEnd.toFixed(2) + 's)');
  } finally { Math.random = realRandom; }
});

S.check('EXIT 2, the bound: a player who never walks still starts the run (no shield, no banners)', () => {
  Math.random = mulberry32b(0x9f5d);
  try {
    T.banners.suppressAll();
    T.startRun();
    h.pump(2);
    quietField();
    T.setPilotMode('MANUAL');   // parked: no input, no walk
    T.pilotInput.x = 0; T.pilotInput.y = 0; T.pilotInput.mag = 0;
    const bound = C.PROLOGUE.MAX_S;
    assert(bound === 60, 'the bound is stated: 60s (PROLOGUE.MAX_S)');
    autoplay(Math.floor(60 * (bound + 2)));
    assert(!T.prologue.active, 'the phase ended at the bound without the potion');
    assert(st.player.invuln < C.PROLOGUE.INVULN_S,
      'no shield on the bound exit (invuln ' + st.player.invuln.toFixed(2) + 's)');
    autoplay(60);
    assert(st.time > 0.9, 'the run clock runs after the bound exit (t=' + st.time.toFixed(2) + ')');
  } finally { Math.random = realRandom; }
});

// ---------------------------------------------------------------------------
// THE EFFECT — the 45s boundary and the on-screen clear.
// ---------------------------------------------------------------------------
S.check('the shield boundary: contact damage is blocked at 44.9s and lands at 45.1s', () => {
  Math.random = mulberry32b(0x9f6e);
  try {
    T.banners.suppressAll();
    T.startRun();
    h.pump(2);
    quietField();
    T.setPilotMode('MANUAL');
    const po = T.prologue.potion;
    const dx = po.x - st.player.x, dy = po.y - st.player.y;
    const L = Math.hypot(dx, dy) || 1;
    T.pilotInput.x = dx / L; T.pilotInput.y = dy / L; T.pilotInput.mag = 1;
    let drank = false, tDrink = -1;
    autoplay(60 * 12, (i) => { if (!drank && !T.prologue.active) { drank = true; tDrink = i; } });
    T.pilotInput.x = 0; T.pilotInput.y = 0; T.pilotInput.mag = 0;
    assert(drank, 'the potion was drunk this arm');
    quietField();
    st.weapons.length = 0; st.player.stats.thorns = 0;   // disarmed: the shield is the variable
    const p = st.player;
    const maxHp = p.hp;
    // A chaser pressed against the pilot for the whole window (speed 0 — it
    // is parked ON the contact radius; the clock is the only variable).
    st.enemies.push({ typeId: 'CHASER', x: p.x + 6, y: p.y, w: 10, hp: 1000, maxHp: 1000,
      speed: 0, mx: 0, my: 0, age: 0, elite: false });
    // THE BOUNDARY, measured from the drink: the walk window already burned
    // (720 - tDrink) frames of the shield; top up to exactly 44.9s since the
    // drink (2694 frames at 60Hz) — still shielded — then cross to 45.1s.
    const burned = 60 * 12 - tDrink;
    assert(burned < 2694 - 60, 'the walk window left a real boundary to cross');
    autoplay(2694 - burned, () => { st.spawnTimer = 999; });
    assert(p.hp === maxHp, 'contact at 44.9s since the drink did NOT damage (hp ' + p.hp + '/' + maxHp + ')');
    assert(p.invuln > 0, 'the shield is still live at 44.9s (' + p.invuln.toFixed(3) + 's left)');
    autoplay(12, () => { st.spawnTimer = 999; });
    // (No invuln<=0 assert here: the FIRST hit that lands resets p.invuln to
    // its 0.6 post-hit floor — the hp drop is the boundary's real signal.)
    assert(p.hp < maxHp, 'contact at 45.1s since the drink DID damage (hp ' + p.hp + '/' + maxHp + ')');
  } finally { Math.random = realRandom; }
});

S.check('the clear: on-screen enemies die with normal credit, off-screen ones survive', () => {
  Math.random = mulberry32b(0x9f7f);
  try {
    T.banners.suppressAll();
    T.startRun();
    h.pump(2);
    quietField();
    T.setPilotMode('MANUAL');
    // Two parked watchers: one INSIDE the view + margin, one far outside.
    const p = st.player;
    const near = { typeId: 'CHASER', x: p.x + 60, y: p.y, w: 10, hp: 500, maxHp: 500,
      speed: 0, mx: 0, my: 0, age: 0, elite: false };                        // on-screen
    st.enemies.push(near);
    const far = { typeId: 'CHASER', x: C.GROUND.RIM + 300, y: C.GROUND.RIM + 300, w: 10,
      hp: 500, maxHp: 500, speed: 0, mx: 0, my: 0, age: 0, elite: false };  // off-screen
    st.enemies.push(far);
    const kills0 = p.kills;
    const po = T.prologue.potion;
    const dx = po.x - p.x, dy = po.y - p.y;
    const L = Math.hypot(dx, dy) || 1;
    T.pilotInput.x = dx / L; T.pilotInput.y = dy / L; T.pilotInput.mag = 1;
    autoplay(60 * 12, () => { st.spawnTimer = 999; });
    T.pilotInput.x = 0; T.pilotInput.y = 0; T.pilotInput.mag = 0;
    assert(!T.prologue.active, 'the drink happened');
    assert(p.kills === kills0 + 1, 'the cleared enemy died with normal kill credit (' + p.kills + ' vs ' + kills0 + ')');
    assert(!st.enemies.includes(near) || near.hp <= 0,
      'the ON-SCREEN enemy is gone (reaped by the normal death pass)');
    assert(st.enemies.includes(far) && far.hp > 0,
      'the OFF-SCREEN enemy survived the clear (view + margin, not the arena)');
  } finally { Math.random = realRandom; }
});

S.check('the rainbow pulse: a gentle cycle, and reduced motion gets a constant colour', () => {
  assert(prologueShieldColor(0, false) !== prologueShieldColor(6, false),
    'the cycle moves (gently — 40 deg/s)');
  assert(prologueShieldColor(0, true) === prologueShieldColor(6, true) &&
    prologueShieldColor(0, true) === prologueShieldColor(100, true),
    'reduced motion is a FIXED colour (no pulse)');
  assert(prefersReducedMotion() === false,
    'the headless stub does not claim reduced motion (the branch is opt-in per OS)');
});

// ---------------------------------------------------------------------------
// SCOPE + THE ABSORB — run #2, tour flags, hints.
// ---------------------------------------------------------------------------
S.check('run #2 has NO prologue (the derivation contract)', () => {
  Math.random = mulberry32b(0x9f8a);
  try {
    T.banners.suppressAll();
    // recordRun bumps totals.runs at run settle; run #2's precondition is
    // exactly this counter state (the same bump the real settle writes).
    T.getProfile().achievements.totals.runs = 1;
    T.startRun();
    h.pump(2);
    assert(!T.prologue.active && st.prologue === null,
      'run #2 opens straight into the run (no prologue)');
    assert(!T.prologue.ran, 'prologueRan is false for run #2');
    let spawned = false;
    autoplay(60 * 4, () => { if (st.enemies.length > 0) spawned = true; });
    assert(spawned && st.time > 3.5, 'an ordinary run: spawns live, clock running');
  } finally { Math.random = realRandom; }
});

S.check('THE ABSORB: the phase end marks the stage-2 tour flags seen; hints wait out the phase', () => {
  Math.random = mulberry32b(0x9f9b);
  try {
    T.banners.suppressAll();
    // A real fresh first-run: no tour flags pre-seeded (the harness seeds
    // them by default — strip them so the absorb is observable).
    for (const k of Object.values(TOUR_KEYS)) globalThis.localStorage.removeItem(k);
    T.getProfile().achievements.totals.runs = 0;
    T.startRun();
    h.pump(2);
    assert(T.prologue.active, 'the prologue re-arms with the counter back at 0');
    // Hints are gated DURING the phase: movement must not arm the move hint.
    // Walk LEFT — the potion sits up-RIGHT of the spawn (POTION_DX), and a
    // 3s rightward walk would DRINK it and end the phase mid-window.
    T.setPilotMode('MANUAL');
    T.pilotInput.x = -1; T.pilotInput.y = 0; T.pilotInput.mag = 1;
    autoplay(60 * 3, () => {
      assert(T.onboarding.pending().length === 0,
        'no hint arms while the prologue banners own the intro');
    });
    T.pilotInput.x = 0; T.pilotInput.y = 0; T.pilotInput.mag = 0;
    const po = T.prologue.potion;
    const dx = po.x - st.player.x, dy = po.y - st.player.y;
    const L = Math.hypot(dx, dy) || 1;
    T.pilotInput.x = dx / L; T.pilotInput.y = dy / L; T.pilotInput.mag = 1;
    autoplay(60 * 12);
    T.pilotInput.x = 0; T.pilotInput.y = 0; T.pilotInput.mag = 0;
    assert(!T.prologue.active, 'the drink ended the phase');
    for (const k of Object.values(TOUR_KEYS)) {
      assert(globalThis.localStorage.getItem(k) === '1',
        'tour flag ' + k + ' marked seen (the coach layer is absorbed, not stacked)');
    }
  } finally { Math.random = realRandom; }
});

// ---------------------------------------------------------------------------
S.done();
