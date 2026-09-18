// FIRST-RUN PROLOGUE (owner 2026-09-18): "a potion seen on screen and the
// pilot walks towards it... no enemies spawn and the timer hasn't started...
// dismissible (with an ok button) banners explaining some of the basics."
//
// ADDENDUM (owner 2026-09-18): "pilot could pause for these since we haven't
// given the player any control yet.. all buttons should be disabled during
// this initial period."
//
// What this file pins, per the brief + the addendum:
//   PHASE     armed ONLY on run #1 of a fresh profile (derived from
//             achievements.totals.runs === 0 — no new saved field); the
//             world is INERT (no spawns) and state.time is FROZEN, so the
//             prologue is excluded from run duration and every pacing
//             figure by construction.
//   CHOREO    walk -> banner -> OK -> walk -> ... -> potion -> drink ->
//             effect. Each banner goes up only after BANNER_WALK_S of
//             UNPAUSED walking since the last OK; while one is up the pilot
//             HOLDS (AUTO and MANUAL alike — the player has no control
//             until the phase ends) and BOTH phase clocks freeze.
//   EXITS     the potion drunk OR the stated bound (PROLOGUE.MAX_S of
//             UNPAUSED time — a held banner freezes the bound's clock too;
//             the OK button is the only way past a banner, like any menu).
//   LOCKOUT   EVERY button is disabled through the phase (pads, cog row,
//             their keyboard twins, the canvas fullscreen glyph): the
//             runAction/keydown funnels swallow input, body.prologue-locked
//             greys + de-points the touch layer. SINGLE exception: the
//             banner's OK. Nothing re-enables early; the lock lifts at
//             phase end with an obvious visual difference (0.35 -> 1).
//   EFFECT    the named 45s shield ANCHORED AT PICKUP, damage blocked at
//             44.9s and landing at 45.1s; the clear removes ON-SCREEN
//             enemies (view + margin) and NOT off-screen ones, through the
//             normal death pass.
//   RUN #2    no prologue (the derivation contract), no lock.
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
// The addendum's player role: OK each banner as it comes (the phase's ONLY
// live control) while the AUTO choreography walks.
const okBanners = () => { if (T.prologue.banner()) T.prologue.ok(); };
const kdown = (k) => h.key('keydown', { key: k, preventDefault() {} });

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
    // CADENCE: at t=0 NO banner is up — it takes BANNER_WALK_S of unpaused
    // walking for the first one (walk -> banner, never banner-first).
    assert(T.prologue.banner() === null && T.prologue.bannerIdx === 0,
      'no banner before the first stretch of walking (walkT=' + T.prologue.walkT + ')');
    // 8 seconds of an untouched run: nothing spawns, the clock never starts.
    // Parked MANUAL pilot (the AUTO pilot would WALK — EXIT 1's own check
    // below); with no OK ever tapped, the banner that appears at
    // BANNER_WALK_S stays up and FREEZES the phase clock with it.
    T.setPilotMode('MANUAL');
    T.pilotInput.x = 0; T.pilotInput.y = 0; T.pilotInput.mag = 0;
    let maxEnemies = 0;
    autoplay(60 * 8, () => {
      maxEnemies = Math.max(maxEnemies, st.enemies.length);
      assert(st.time === 0, 'state.time stays 0 while the prologue lives (got ' + st.time + ')');
    });
    assert(maxEnemies === 0, 'NO enemies spawn during the prologue (max ' + maxEnemies + ')');
    assert(T.prologue.banner() !== null && T.prologue.bannerIdx === 0,
      'banner #1 is up and waiting for its OK after 8s of wall time');
    // THE BOUND COUNTS UNPAUSED TIME ONLY: 8s of wall time elapsed, only the
    // ~BANNER_WALK_S before the banner counted.
    assert(Math.abs(T.prologue.t - C.PROLOGUE.BANNER_WALK_S) < 0.15,
      'a held banner froze the phase clock (t=' + T.prologue.t.toFixed(2) +
      ' after 8s wall; BANNER_WALK_S=' + C.PROLOGUE.BANNER_WALK_S + ')');
  } finally { Math.random = realRandom; }
});

S.check('the banners: at most four, plain copy, cadence-gated, OK to advance — and MODAL (the pilot pauses)', () => {
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
    // MODAL (the withdrawn non-modal line): with a banner up, held MANUAL
    // input does NOT move the pilot — "we haven't given the player any
    // control yet".
    T.setPilotMode('MANUAL');
    autoplay(30);   // let banner #1 come up (walkT accrues unpaused)
    assert(T.prologue.banner() !== null, 'banner #1 is up');
    const x0 = st.player.x, y0 = st.player.y;
    T.pilotInput.x = 1; T.pilotInput.y = 0; T.pilotInput.mag = 1;
    autoplay(30, () => {
      assert(T.prologue.banner() !== null, 'the banner stays up (no OK is tapped)');
    });
    T.pilotInput.x = 0; T.pilotInput.y = 0; T.pilotInput.mag = 0;
    assert(Math.abs(st.player.x - x0) < 0.5 && Math.abs(st.player.y - y0) < 0.5,
      'the pilot HELD while a banner was up (moved ' +
      Math.hypot(st.player.x - x0, st.player.y - y0).toFixed(2) + 'wu — banners gate the pilot)');
    // OK dismisses through the REAL canvas hit-region (the pointer funnel).
    const c0 = okCenter();
    h.elements['game']._ev['pointerdown']({
      preventDefault() {}, pointerId: 1, clientX: c0.x, clientY: c0.y,
    });
    assert(T.prologue.bannerIdx === 1 && T.prologue.banner() === null,
      'the canvas OK tap advanced the banner and the walk clock reset (idx ' + T.prologue.bannerIdx + ')');
    // The seam is CADENCE-GATED like the painted card: ok() with no banner
    // up is a no-op...
    T.prologue.ok();
    assert(T.prologue.bannerIdx === 1, 'ok() with no banner up does nothing (idx ' + T.prologue.bannerIdx + ')');
    // ...and the next banner waits for its own stretch of walking.
    autoplay(Math.floor(60 * C.PROLOGUE.BANNER_WALK_S) - 5);
    assert(T.prologue.banner() === null, 'banner #2 waits for its walk (walkT=' + T.prologue.walkT.toFixed(2) + ')');
    autoplay(10);
    assert(T.prologue.banner() !== null, 'banner #2 is up after BANNER_WALK_S of unpaused walk');
    T.prologue.ok(); autoplay(30); T.prologue.ok(); autoplay(30); T.prologue.ok(); autoplay(30);
    assert(T.prologue.bannerIdx === 4 && T.prologue.banner() === null,
      'four OKs exhaust the banners (banner() null, idx ' + T.prologue.bannerIdx + ')');
    const r = T.prologue.okRect();
    assert(r.x >= 0 && r.x + r.w <= C.VIEW_W && r.y >= 0 && r.y + r.h <= C.VIEW_H,
      'the OK rect is inside the view at every viewport (the canvas is one 480x300 source)');
  } finally { Math.random = realRandom; }
});

// ---------------------------------------------------------------------------
// THE LOCKOUT — every button disabled through the phase; OK is the only
// live control; nothing re-enables early; the lift at the end is obvious.
// ---------------------------------------------------------------------------
S.check('ADDENDUM: ALL buttons disabled through the phase — keys inert, DOM lock on, lifts ONLY at phase end', () => {
  Math.random = mulberry32b(0x9f21);
  try {
    T.banners.suppressAll();
    T.getProfile().achievements.totals.runs = 0;
    T.startRun();
    h.pump(2);
    quietField();
    assert(T.prologue.active && T.prologue.buttonsLocked === true,
      'body.prologue-locked is ON from arm time (the greyed touch layer)');
    const pilot0 = st.pilotMode, radar0 = st.radarOn, map0 = st.mapOpen, zoom0 = st.zoom,
      focus0 = T.controller.focus, stance0 = T.controller.stance;
    // The keyboard twins, through the REAL keydown funnel: in-run menu
    // (ESC/P), the FIELD REPORT (I), the pilot-mode switch (O), MAP (M),
    // RADAR (R), zoom (+/-), help (?), skills/potions (Q/E/H/N), FOCUS
    // (Tab), STANCE (G). None may act.
    for (const k of ['Escape', 'p', 'i', 'o', 'm', 'r', '?', '+', '-',
      'q', 'e', 'h', 'n', 'Tab', 'g']) kdown(k);
    assert(st.mode === 'playing', 'no screen opened (settings/stats inert; mode ' + st.mode + ')');
    assert(st.pilotMode === pilot0, 'the pilot-mode switch is disabled (O)');
    assert(st.radarOn === radar0 && st.mapOpen === map0, 'radar and map inert');
    assert(st.zoom === zoom0, 'zoom inert');
    assert(T.controller.focus === focus0 && T.controller.stance === stance0,
      'FOCUS/STANCE inert');
    // And the touch funnel itself (the button path): every data-act is inert.
    for (const act of ['settings', 'stats', 'help', 'pilot', 'radar', 'map',
      'focus', 'stance', 'q', 'w', 'h', 'n']) T.runAction(act);
    assert(st.mode === 'playing' && st.pilotMode === pilot0 && st.mapOpen === map0 && st.radarOn === radar0,
      'runAction is swallowed wholesale through the phase');
    // NOTHING RE-ENABLES EARLY: exhausting the banners is not the end —
    // the lock holds until the phase itself ends. (Parked MANUAL so the
    // walk cannot reach the potion inside this window.)
    T.setPilotMode('MANUAL');
    T.pilotInput.x = 0; T.pilotInput.y = 0; T.pilotInput.mag = 0;
    autoplay(60 * 3, okBanners);
    assert(T.prologue.bannerIdx === 4 && T.prologue.active,
      'all banners OK-ed, phase still live (the walk to the potion remains)');
    assert(T.prologue.buttonsLocked === true, 'the lock holds past the last OK');
    // THE LIFT: at the drink, with an obvious difference (the class drops).
    T.prologue.drink();
    h.pump(2);
    assert(!T.prologue.active && T.prologue.buttonsLocked === false,
      'the lock lifted at phase end (buttons visibly live again)');
    // And the buttons WORK again — the same keys that were inert now act.
    kdown('i');
    assert(st.mode === 'stats', 'the FIELD REPORT key works after the phase');
    kdown('Escape');
    assert(st.mode === 'playing', 'ESC resumes — the in-run menu works after the phase');
  } finally { Math.random = realRandom; }
});

S.check('ADDENDUM: the player has NO control during the phase — held input never moves the pilot', () => {
  Math.random = mulberry32b(0x9f22);
  try {
    T.banners.suppressAll();
    T.getProfile().achievements.totals.runs = 0;
    T.startRun();
    h.pump(2);
    quietField();
    // Even MANUAL (reachable only through the test seam — the switch itself
    // is disabled) is inert: the choreography owns the walk.
    T.setPilotMode('MANUAL');
    const x0 = st.player.x, y0 = st.player.y;
    T.pilotInput.x = 0.707; T.pilotInput.y = 0.707; T.pilotInput.mag = 1;
    autoplay(90, okBanners);   // 1.5s: banner up (held) and banner down (walking)
    T.pilotInput.x = 0; T.pilotInput.y = 0; T.pilotInput.mag = 0;
    assert(Math.abs(st.player.x - x0) < 0.5 && Math.abs(st.player.y - y0) < 0.5,
      'held MANUAL input did nothing through the phase (moved ' +
      Math.hypot(st.player.x - x0, st.player.y - y0).toFixed(2) + 'wu)');
    assert(st.time === 0, 'and the run clock never started');
  } finally { Math.random = realRandom; }
});

// ---------------------------------------------------------------------------
// THE EXITS — drunk (the AUTO choreography, OKs carried by the player) and
// the stated bound.
// ---------------------------------------------------------------------------
S.check('EXIT 1, AUTO: the choreography walks and PAUSES at each banner; OKs carry it to the drink', () => {
  Math.random = mulberry32b(0x9f4c);
  try {
    T.banners.suppressAll();
    T.startRun();
    h.pump(2);
    quietField();
    T.setPilotMode('AUTO');
    let sawHold = false, sawWalk = false, invulnAtEnd = 0, endedAtFrame = -1, tAtEnd = -1;
    const px = [];
    // A deliberate reader: OKs land at most once a second, so each banner
    // actually HOLDS the pilot for a visible stretch (an instant-OK driver
    // would never pause the walk at all).
    autoplay(60 * 15, (i) => {
      if (i % 60 === 0) okBanners();
      if (T.controller && T.controller.act === 'PROLOGUE_HOLD') sawHold = true;
      if (T.controller && T.controller.act === 'PROLOGUE') sawWalk = true;
      if (i % 12 === 0) px.push(st.player.x);
      if (endedAtFrame < 0 && !T.prologue.active) {
        endedAtFrame = i; invulnAtEnd = st.player.invuln; tAtEnd = st.time;
      }
    });
    assert(sawWalk, 'the AUTO pilot flew the PROLOGUE walk branch');
    assert(sawHold, 'the AUTO pilot HELD at a banner (the pause is real)');
    // The pause is visible in the trace: at least one flat stretch of ≥15
    // samples (3s at 5 samples/s) where the pilot did not move.
    let flat = 0, maxFlat = 0;
    for (let i = 1; i < px.length; i++) {
      flat = Math.abs(px[i] - px[i - 1]) < 0.01 ? flat + 1 : 0;
      maxFlat = Math.max(maxFlat, flat);
    }
    assert(maxFlat >= 3, 'a visible hold stretch in the position trace (maxFlat ' + maxFlat + ' samples at 5/s)');
    assert(!T.prologue.active && invulnAtEnd > C.PROLOGUE.INVULN_S - 1,
      'the walk drank the potion (invuln at drink ' + invulnAtEnd.toFixed(2) + 's)');
    assert(endedAtFrame > 0 && endedAtFrame < 60 * 12,
      'the choreography completed in a sane time (frame ' + endedAtFrame + ')');
    // PICKUP ANCHOR: the 45s shield starts AT the drink, and the clock reads
    // 0 at that moment (the prologue walk is not run time).
    assert(tAtEnd < 0.05, 'the clock read 0 at the drink (t=' + tAtEnd + ')');
    const tBefore = st.time;
    autoplay(60);
    assert(Math.abs((st.time - tBefore) - 1) < 0.05,
      'the clock runs normally after the phase (delta ' + (st.time - tBefore).toFixed(2) + 's in 1s)');
  } finally { Math.random = realRandom; }
});

S.check('EXIT 2, the bound: UNPAUSED time ends the phase; a held banner freezes the bound (menu-like)', () => {
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
    // Banner #1 up, never OK-ed: the bound clock is FROZEN — the phase
    // outlasts any wall-clock window (the OK is the only way past a banner).
    autoplay(60 * (bound + 10));
    assert(T.prologue.active, 'a held banner holds the phase past MAX_S of wall time');
    // OK the banners away: now the bound accrues and fires.
    autoplay(60 * 3, okBanners);
    assert(T.prologue.bannerIdx === 4 && T.prologue.banner() === null,
      'banners exhausted; the pilot still has the potion to reach');
    autoplay(Math.floor(60 * (bound + 2)));
    assert(!T.prologue.active, 'the phase ended at the UNPAUSED bound without the potion');
    assert(st.player.invuln < C.PROLOGUE.INVULN_S,
      'no shield on the bound exit (invuln ' + st.player.invuln.toFixed(2) + 's)');
    autoplay(60);
    assert(st.time > 0.9, 'the run clock runs after the bound exit (t=' + st.time.toFixed(2) + 's)');
  } finally { Math.random = realRandom; }
});

// ---------------------------------------------------------------------------
// THE EFFECT — the 45s boundary (anchored at PICKUP) and the on-screen clear.
// ---------------------------------------------------------------------------
S.check('the shield boundary: contact damage is blocked at 44.9s and lands at 45.1s', () => {
  Math.random = mulberry32b(0x9f6e);
  try {
    T.banners.suppressAll();
    T.startRun();
    h.pump(2);
    quietField();
    T.setPilotMode('AUTO');
    let drank = false, tDrink = -1;
    autoplay(60 * 12, (i) => {
      okBanners();
      if (!drank && !T.prologue.active) { drank = true; tDrink = i; }
    });
    assert(drank, 'the potion was drunk this arm');
    quietField();
    // Park the pilot post-drink: the AUTO pilot would kite the parked chaser
    // below and the contact would never land (the clock is the only variable).
    T.setPilotMode('MANUAL');
    T.pilotInput.x = 0; T.pilotInput.y = 0; T.pilotInput.mag = 0;
    st.weapons.length = 0; st.player.stats.thorns = 0;   // disarmed: the shield is the variable
    const p = st.player;
    const maxHp = p.hp;
    // A chaser pressed against the pilot for the whole window (speed 0 — it
    // is parked ON the contact radius; the clock is the only variable).
    st.enemies.push({ typeId: 'CHASER', x: p.x + 6, y: p.y, w: 10, hp: 1000, maxHp: 1000,
      speed: 0, mx: 0, my: 0, age: 0, elite: false });
    // THE BOUNDARY, measured from the drink (the PICKUP anchor): the walk
    // window already burned (720 - tDrink) frames of the shield; top up to
    // exactly 44.9s since the drink (2694 frames at 60Hz) — still shielded —
    // then cross to 45.1s.
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
    T.setPilotMode('AUTO');
    // Two parked watchers: one INSIDE the view + margin, one far outside.
    const p = st.player;
    const near = { typeId: 'CHASER', x: p.x + 60, y: p.y, w: 10, hp: 500, maxHp: 500,
      speed: 0, mx: 0, my: 0, age: 0, elite: false };                        // on-screen
    st.enemies.push(near);
    const far = { typeId: 'CHASER', x: C.GROUND.RIM + 300, y: C.GROUND.RIM + 300, w: 10,
      hp: 500, maxHp: 500, speed: 0, mx: 0, my: 0, age: 0, elite: false };  // off-screen
    st.enemies.push(far);
    const kills0 = p.kills;
    autoplay(60 * 12, (i) => { okBanners(); st.spawnTimer = 999; });
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
S.check('run #2 has NO prologue and NO lock (the derivation contract)', () => {
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
    assert(T.prologue.buttonsLocked === false, 'no lock on run #2 (buttons live from frame one)');
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
    // Hints are gated DURING the phase: the choreography's walk must not arm
    // the move hint (the AUTO pilot does the walking here — the player has
    // no input at all through the phase).
    T.setPilotMode('AUTO');
    autoplay(60 * 3, (i) => {
      okBanners();
      assert(T.onboarding.pending().length === 0,
        'no hint arms while the prologue banners own the intro');
    });
    autoplay(60 * 12, (i) => { okBanners(); });
    assert(!T.prologue.active, 'the drink ended the phase');
    for (const k of Object.values(TOUR_KEYS)) {
      assert(globalThis.localStorage.getItem(k) === '1',
        'tour flag ' + k + ' marked seen (the coach layer is absorbed, not stacked)');
    }
  } finally { Math.random = realRandom; }
});

// ---------------------------------------------------------------------------
S.done();
