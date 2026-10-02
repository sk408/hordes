// THE FIRST-RUN TUTORIAL (M3). Run 1 of a fresh profile opens with no enemies
// and the clock stopped, and teaches three things by doing, one sentence each:
//   1. MOVE    the pilot fights for you; hold a move key / drag to take the wheel
//   2. LEVEL UP a free level-up: the real draft, pick 1 of 3
//   3. POTION  walk into the potion for the shield
// Focus and Stance are not taught here (their one-line tips come later, the
// first time they matter: test_m3_first_minutes.mjs).
//
// What this file pins:
//   PHASE     armed only on run #1 of a fresh profile (derived from
//             achievements.totals.runs === 0); the world is inert and
//             state.time is frozen until the phase ends.
//   CARDS     exactly three, each one sentence, each cleared by its action; a
//             card nobody answers clears itself after CARD_WAIT_S; every pad
//             button stays hidden until the phase ends.
//   EXITS     the potion drunk, the bound (PROLOGUE.MAX_S), or SKIP: a
//             two-press corner button (and Escape twice) that stops the cards
//             but keeps the potion walk.
//   EFFECT    the 45s shield anchored at pickup; the clear removes on-screen
//             enemies only.
//   RUN #2    no tutorial, no lock.
//   ABSORB    the coach flags are marked seen when the phase ends.
import { suite, boot } from './_harness.mjs';
import { CONFIG as C } from '../src/config.js';
import { TOUR_KEYS } from '../src/tour.js';
import { prologueShieldColor, prefersReducedMotion, prologueSkipRect } from '../src/render.js';

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
// harness's neutralization stamp OUT — it also flips the kill switch ON),
// own module instance.
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
// DEFECT (c): the advance is ACTION-gated — this reader DOES the current
// banner's stated action through the ledger seam (the same call every live
// input path makes) while the card is up.
const actBanners = () => {
  const b = T.prologue.banner();
  if (b && b.action && b.action !== 'drink') T.prologue.act(b.action);
};
const skipCenter = () => {
  const r = T.prologue.skipRect();
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
};
const tapCanvas = (x, y) => h.elements['game']._ev['pointerdown']({
  preventDefault() {}, pointerId: 1, clientX: x, clientY: y,
});
const kdown = (k) => h.key('keydown', { key: k, preventDefault() {} });
const steer = (x, y, mag = 1) => { T.pilotInput.x = x; T.pilotInput.y = y; T.pilotInput.mag = mag; };
const park = () => steer(0, 0, 0);

// ---------------------------------------------------------------------------
// THE PHASE — inert world, frozen clock, armed on run #1 of a fresh profile.
// ---------------------------------------------------------------------------
S.check('run #1 of a fresh profile opens the tutorial: potion visible, world inert, clock frozen', () => {
  Math.random = mulberry32b(0x9f1e);
  try {
    T.banners.suppressAll();
    T.startRun();
    h.pump(2);
    assert(T.prologue.active, 'the tutorial is armed on run #1 of a fresh profile');
    assert((T.getProfile().achievements.totals.runs || 0) === 0,
      'the derivation is the EXISTING counter (no new saved field)');
    const po = T.prologue.potion;
    const p = st.player;
    assert(po && Math.hypot(po.x - p.x, po.y - p.y) > 40,
      'the potion sits a real walk away (' + JSON.stringify(po) + ')');
    assert(po.x >= 0 && po.x <= C.VIEW_W && po.y >= 0 && po.y <= C.VIEW_H,
      'the potion is ON SCREEN (got ' + JSON.stringify(po) + ')');
    // At t=0 no card is up: it takes BANNER_WALK_S of walking for the first.
    assert(T.prologue.banner() === null && T.prologue.bannerIdx === 0,
      'no card before the first stretch of walking (walkT=' + T.prologue.walkT + ')');
    assert(T.prologue.revealed.move === true, 'steering is live from the first frame');
    assert(T.prologue.buttonsLocked === true, 'every pad button is hidden for the phase');
    // 8 seconds of an untouched run: nothing spawns, the clock never starts.
    let maxEnemies = 0;
    autoplay(60 * 8, () => {
      maxEnemies = Math.max(maxEnemies, st.enemies.length);
      assert(st.time === 0, 'state.time stays 0 while the tutorial lives (got ' + st.time + ')');
    });
    assert(maxEnemies === 0, 'NO enemies spawn during the tutorial (max ' + maxEnemies + ')');
    assert(T.prologue.banner() !== null && T.prologue.bannerIdx === 0,
      'card #1 is up and waiting for its action after 8s');
    assert(Math.abs(T.prologue.t - 8) < 0.2, 'the phase clock ticks through a waiting card');
  } finally { Math.random = realRandom; }
});

S.check('THREE cards, one sentence each, taught by doing', () => {
  const B = T.prologue.banners;
  assert(B.length === 3, 'exactly three cards (got ' + B.length + ')');
  assert(B.map(b => b.action).join() === 'move,draft,drink', 'move, the free draft, the potion: ' + B.map(b => b.action).join());
  for (const touch of [false, true]) {
    if (touch) h.elements['touch'].classList.add('on'); else h.elements['touch'].classList.remove('on');
    for (const b of B) {
      const body = b.body;
      const sentences = body.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
      assert(sentences.length === 1, 'one sentence per card: "' + body + '"');
      assert(body.length <= 70, 'short enough to read at a glance (' + body.length + '): ' + body);
      assert(/^[\x20-\x7E]+$/.test(body + b.title + b.cue), 'plain ASCII, no emoji');
      assert(b.cue && b.cue.length <= 28, 'a short cue names the action: ' + b.cue);
    }
  }
  h.elements['touch'].classList.remove('on');
  assert(/pilot fights for you/.test(B[0].body) && /take the wheel/.test(B[0].body), 'card 1: ' + B[0].body);
  assert(/free level-up/.test(B[1].body) && /pick 1 of 3/.test(B[1].body), 'card 2: ' + B[1].body);
  assert(new RegExp(C.PROLOGUE.INVULN_S + 's shield').test(B[2].body), 'card 3 states the real shield time: ' + B[2].body);
  assert(!B.some(b => /FOCUS|STANCE|STATS|PILOT button/i.test(b.title + b.body)), 'Focus, Stance and Stats are not taught in run 1');
  const words = T.prologue.wordCount();
  assert(words <= 50, 'the whole tutorial is at most 50 words (got ' + words + ')');
  console.log('  MEASURED: the tutorial is ' + B.length + ' cards, ' + words + ' words in all');
});

S.check('each card clears by DOING the thing: steer, pick a card, walk into the potion', () => {
  Math.random = mulberry32b(0x9f2b);
  try {
    T.banners.suppressAll();
    T.getProfile().achievements.totals.runs = 0;
    T.startRun();
    h.pump(2);
    quietField();
    T.setPilotMode('AUTO_ALL');
    for (let i = 0; i < 60 && !T.prologue.banner(); i++) h.pump(1);
    assert(T.prologue.banner() && T.prologue.banner().action === 'move', 'card 1 (MOVE) is up');
    // The pilot waits under the card; the player's own steering moves the hero.
    const x0 = st.player.x;
    h.pump(20);
    assert(Math.abs(st.player.x - x0) < 0.01, 'the pilot holds still while the MOVE card waits');
    kdown('d');
    h.pump(3);
    assert(st.pilotMode === 'AUTO_ALL', 'steering does not change the pilot mode');
    assert(st.player.x > x0, 'the held key moved the hero under the card');
    assert(T.prologue.bannerIdx === 1, 'steering cleared the MOVE card');
    h.key('keyup', { key: 'd' });
    // Card 2 grants a free level-up and opens the REAL draft, carrying the card's sentence.
    const lv0 = st.player.level;
    for (let i = 0; i < 120 && st.mode !== 'draft'; i++) h.pump(1);
    assert(st.mode === 'draft', 'the LEVEL UP card opened the real draft (mode ' + st.mode + ')');
    assert(st.player.level === lv0 + 1, 'one free level');
    assert(st.time === 0, 'and the run clock has still not started');
    assert(h.elements['ov-sub'].textContent === T.prologue.banners[1].body, 'the draft screen carries the card sentence: ' + h.elements['ov-sub'].textContent);
    assert(h.elements['ov-cards'].children.length >= 3, 'three cards to pick from');
    h.elements['ov-cards'].children[0].click();
    h.pump(3);
    assert(st.mode === 'playing' && T.prologue.bannerIdx === 2, 'the pick cleared the LEVEL UP card (idx ' + T.prologue.bannerIdx + ')');
    // Card 3: the pilot walks to the potion by itself; the drink ends the phase.
    let ended = -1, sawPotionCard = false;
    autoplay(60 * 8, (i) => {
      if (T.prologue.active && T.prologue.banner() && T.prologue.banner().action === 'drink') sawPotionCard = true;
      if (ended < 0 && !T.prologue.active) ended = i;
    });
    assert(sawPotionCard, 'the POTION card showed');
    assert(ended > 0 && st.player.invuln > C.PROLOGUE.INVULN_S - 9, 'the walk-in drank the potion and granted the shield');
    assert(T.prologue.buttonsLocked === false, 'and the pad buttons are back');
  } finally { Math.random = realRandom; }
});

S.check('a card nobody answers clears itself: an idle player still reaches the potion', () => {
  Math.random = mulberry32b(0x9f3c);
  try {
    T.banners.suppressAll();
    T.getProfile().achievements.totals.runs = 0;
    T.startRun();
    h.pump(2);
    quietField();
    T.setPilotMode('AUTO_ALL');
    let ended = -1;
    autoplay(60 * (C.PROLOGUE.CARD_WAIT_S + 30), (i) => {
      if (i === 60 * (C.PROLOGUE.CARD_WAIT_S - 2)) {
        assert(T.prologue.active && T.prologue.bannerIdx === 0, 'the MOVE card waits most of CARD_WAIT_S');
      }
      if (ended < 0 && !T.prologue.active) ended = i;
    });
    assert(ended > 60 * C.PROLOGUE.CARD_WAIT_S, 'the phase outlasted the first card wait');
    assert(ended < 60 * (C.PROLOGUE.CARD_WAIT_S + 28), 'and an untouched tutorial ends well inside MAX_S (' + (ended / 60).toFixed(1) + 's)');
    assert(st.player.level >= 2, 'the free level-up was still granted (the draft auto-picked)');
  } finally { Math.random = realRandom; }
});

S.check('nothing but steering is live through the phase: buttons and keys are inert', () => {
  Math.random = mulberry32b(0x9f4d);
  try {
    T.banners.suppressAll();
    T.getProfile().achievements.totals.runs = 0;
    T.startRun();
    h.pump(2);
    quietField();
    autoplay(40);
    assert(T.prologue.banner() !== null, 'fixture: card 1 up');
    const mode0 = st.pilotMode, focus0 = T.controller.focus, stance0 = T.controller.stance;
    for (const act of ['pilot', 'focus', 'stance', 'stats', 'settings', 'q', 'w', 'h', 'n', 'map', 'radar']) T.runAction(act);
    for (const k of ['o', 'Tab', 'g', 'i', 'm', 'r', 'q', 'e', 'h', 'n', 'p']) kdown(k);
    assert(st.mode === 'playing', 'no button or key opened a screen (mode ' + st.mode + ')');
    assert(st.pilotMode === mode0 && T.controller.focus === focus0 && T.controller.stance === stance0,
      'pilot, focus and stance are untouched');
    assert(st.mapOpen !== true, 'the map stayed shut');
    assert(T.prologue.bannerIdx === 0, 'and none of it cleared the MOVE card');
  } finally { Math.random = realRandom; }
});

S.check('SKIP: the corner button works in the walk window too, and takes two presses', () => {
  Math.random = mulberry32b(0x9a41);
  try {
    T.banners.suppressAll();
    T.getProfile().achievements.totals.runs = 0;
    T.startRun();
    h.pump(5);   // t < BANNER_WALK_S: no banner on screen, just the walk
    assert(T.prologue.banner() === null, 'fixture: the walk window (no card up)');
    // TWO-PRESS (owner 2026-09-18): the first tap only ARMS (TAP AGAIN) for
    // SKIP_CONFIRM_S; the second inside the window skips.
    tapCanvas(skipCenter().x, skipCenter().y);
    h.pump(2);
    assert(T.prologue.active === true && st.prologue.skipped !== true &&
      st.prologue.skipArmT > 0,
      'the first SKIP tap only ARMS (a deliberate two-press, no accidental skip)');
    assert((st.toasts || []).some(t => /TAP SKIP AGAIN TO CONFIRM/.test(t.msg)),
      'the arm toasted its instruction');
    // THE ARM DECAYS on the phase clock: past SKIP_CONFIRM_S a lone tap is
    // just an arm again — a stray tap can never skip.
    autoplay(Math.ceil((C.PROLOGUE.SKIP_CONFIRM_S + 0.5) * 60));
    assert(st.prologue.skipped !== true && !(st.prologue.skipArmT > 0),
      'the armed skip expired on its own (skipArmT ' + st.prologue.skipArmT + ')');
    tapCanvas(skipCenter().x, skipCenter().y);
    h.pump(2);
    assert(st.prologue.skipped !== true && st.prologue.skipArmT > 0,
      'after the expiry the next tap re-ARMS, still no skip');
    tapCanvas(skipCenter().x, skipCenter().y);
    h.pump(2);
    assert(T.prologue.active === true && st.prologue.skipped === true,
      'the second tap entered skipped mode with NO banner up (opt-out at every moment)');
    assert(T.prologue.buttonsLocked === false, 'the full control set restored immediately');
  } finally { Math.random = realRandom; }
});

S.check('SKIP: "stop explaining" - banners/tooltips gone, full set live, the potion sequence still runs', () => {
  Math.random = mulberry32b(0x9a44);
  try {
    T.banners.suppressAll();
    T.getProfile().achievements.totals.runs = 0;
    T.startRun();
    h.pump(2);
    quietField();
    // Banner #1 up, nothing done: the canvas SKIP tap enters skipped mode.
    // A parked on-screen walker (speed 0, full shape — the walk is ~90 frames,
    // a stub would drift to NaN) proves the clearing pulse still fires at the
    // drink.
    autoplay(60);
    assert(T.prologue.banner() !== null && T.prologue.buttonsLocked === true, 'fixture: banner up, locked');
    st.enemies.push({ typeId: 'CHASER', hp: 10, maxHp: 10, x: st.player.x + 10, y: st.player.y,
      w: 10, speed: 0, mx: 0, my: 0, age: 0, elite: false });
    const sc = skipCenter();
    tapCanvas(sc.x, sc.y); tapCanvas(sc.x, sc.y);   // arm, then confirm
    h.pump(2);
    assert(T.prologue.active === true && st.prologue.skipped === true,
      'the skip does NOT end the phase - it enters skipped mode ("stop explaining")');
    assert(T.prologue.buttonsLocked === false,
      'the FULL control set restored immediately (no hidden or inert leftovers)');
    // And everything WORKS from the press, mid-phase: the settings pause, the
    // map key (the settings pause freezes the skipped phase's clock too —
    // menu-like, unchanged).
    T.runAction('settings');
    assert(st.mode === 'settings', 'the settings pause works after a skip');
    kdown('Escape');
    assert(st.mode === 'playing', 'ESC resumes after a skip');
    kdown('m');
    assert(st.mode === 'playing' && st.mapOpen === true, 'the MAP key works after a skip (unstaged, now live)');
    kdown('m');
    // No banner and no tooltip ever again (the walk to the potion is ~2s, so
    // this window stays inside the skipped phase).
    let leak = false;
    autoplay(45, () => { if (T.prologue.active && T.prologue.banner() !== null) leak = true; });
    assert(!leak, 'no card appears after the skip');
    // THE POTION SEQUENCE RUNS AS NORMAL: the AUTO pilot walks to the visible
    // potion and drinks it; the effect is granted, the run clock starts.
    let drank = false, invAt = 0, shieldAt = 0, aliveAt = -1;
    autoplay(60 * 8, () => {
      if (!T.prologue.active && !drank) {
        drank = true; invAt = st.player.invuln; shieldAt = st.prologueShieldT;
        aliveAt = st.enemies.filter((e) => e.hp > 0).length;
      }
    });
    assert(drank, 'the pilot walked to the potion and drank it after the skip');
    assert(invAt >= C.PROLOGUE.INVULN_S - 1 && shieldAt > 40,
      'the effect was granted at the post-skip drink (45s invuln + shield)');
    assert(aliveAt === 0, 'the clearing pulse fired at the drink');
    assert(st.time > 0, 'the run clock started at the drink');
    // THE HINT LAYER IS RETIRED (2026-09-18): there is no scheduler left to
    // arm a chip mid-run — the staged tooltips are the only intro layer.
    assert(typeof T.onboarding.pending !== 'function' &&
      typeof T.onboarding.touchPath === 'function',
      'no hint layer exists to arm after a skip (retired; tooltips are the intro)');
  } finally { Math.random = realRandom; }
});

S.check('SKIP: the Escape twin + the un-walked potion still answers to the time bound', () => {
  Math.random = mulberry32b(0x2f17);
  try {
    T.banners.suppressAll();
    T.getProfile().achievements.totals.runs = 0;
    T.startRun();
    h.pump(2);
    quietField();
    autoplay(60);
    assert(T.prologue.banner() !== null, 'fixture: banner #1 up');
    kdown('Escape'); kdown('Escape');   // two-press: arm, then confirm
    h.pump(2);
    assert(T.prologue.active === true && st.prologue.skipped === true &&
      T.prologue.buttonsLocked === false,
      'the Escape twin entered skipped mode too (the tour\'s own skip idiom)');
    // The bound: park the potion far (the EXIT-2 fixture) — MAX_S of
    // unpaused time (skipped mode has no banner to freeze it) ends the
    // phase before the walk ever arrives, no shield.
    st.prologue.potion.x = -3900; st.prologue.potion.y = st.player.y;
    let bound = false;
    autoplay(60 * (C.PROLOGUE.MAX_S + 2), () => { if (!T.prologue.active) bound = true; });
    assert(bound, 'the un-walked potion answered to the time bound after a skip');
    assert(st.player.invuln < 5 && st.prologueShieldT <= 0,
      'the bound exit grants no shield');
    assert(st.time > 0, 'the run clock started at the bound');
  } finally { Math.random = realRandom; }
});

// ---------------------------------------------------------------------------
// THE GUARD — at phase end the control set EQUALS a normal run's.
// ---------------------------------------------------------------------------
S.check('THE GUARD: after the phase, the control set equals a normal run\'s', () => {
  Math.random = mulberry32b(0x9a55);
  try {
    T.banners.suppressAll();
    T.getProfile().achievements.totals.runs = 0;
    T.startRun();
    h.pump(2);
    quietField();
    T.setPilotMode('AUTO_ALL');
    autoplay(60 * 18, actBanners);
    assert(!T.prologue.active, 'fixture: the phase completed via the drink');
    const controlSet = () => ({
      locked: T.prologue.buttonsLocked,
      settings: (T.runAction('settings'), st.mode === 'settings'),
    });
    const after = controlSet();
    kdown('Escape');   // close what the snapshot opened (ESC resumes)
    assert(after.locked === false && after.settings === true, 'the post-phase control set is fully live');
    // Run #2, the normal-run reference: the SAME snapshot.
    T.getProfile().achievements.totals.runs = 1;
    T.startRun();
    h.pump(2);
    const normal = controlSet();
    kdown('Escape');
    assert(after.locked === normal.locked && after.settings === normal.settings,
      'EQUAL: the post-tutorial control set is exactly a normal run\'s');
    const mode0 = st.pilotMode;
    T.runAction('pilot');
    assert(st.pilotMode !== mode0, 'the PILOT toggle is an ordinary control after the phase');
    T.runAction('pilot');
  } finally { Math.random = realRandom; }
});

// ---------------------------------------------------------------------------
// THE EXITS — drunk (the choreography, actions carried by the player) and
// the stated bound.
// ---------------------------------------------------------------------------
S.check('EXIT 1, AUTO: the choreography walks and PAUSES at each banner; actions carry it to the drink', () => {
  Math.random = mulberry32b(0x9f4c);
  try {
    T.banners.suppressAll();
    // (the GUARD check above left runs=1 for its run-#2 comparison)
    T.getProfile().achievements.totals.runs = 0;
    T.startRun();
    h.pump(2);
    quietField();
    T.setPilotMode('AUTO');
    let sawHold = false, sawWalk = false, invulnAtEnd = 0, endedAtFrame = -1, tAtEnd = -1;
    const px = [];
    // A deliberate reader: actions land at most once a second, so each
    // banner actually HOLDS the pilot for a visible stretch (an instant-act
    // driver would never pause the walk at all).
    autoplay(60 * 20, (i) => {
      if (i % 60 === 0) actBanners();
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
    assert(endedAtFrame > 0 && endedAtFrame < 60 * 18,
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

S.check('EXIT 2, the bound: MAX_S ends a phase whose potion is never reached', () => {
  Math.random = mulberry32b(0x9f5d);
  try {
    T.banners.suppressAll();
    T.startRun();
    h.pump(2);
    quietField();
    // The potion parked far away: the idle phase keeps walking (addendum 2's
    // completion rule) but can never drink — the BOUND is this arm's exit.
    st.prologue.potion.x = -3900; st.prologue.potion.y = st.player.y;
    const bound = C.PROLOGUE.MAX_S;
    // Retargeted 60 -> 300 (owner 2026-09-18, verbatim in src/config.js: "we
    // have to make the timer on the tutorial like 5 minutes, not whatever it
    // is now. Someone complained they weren't able to get through it without
    // being kicked out"). The pin follows the OWNER-ORDERED value; the loop
    // below reads the bound symbolically.
    assert(bound === 300, 'the bound is stated: 300s (PROLOGUE.MAX_S)');
    // The potion is out of reach, so only the bound can end the phase. The
    // phase clock keeps ticking under a waiting card.
    let endedAt = -1;
    autoplay(60 * (bound + 5), (i) => {
      if (i === 60 * 5) {
        assert(T.prologue.banner() !== null && T.prologue.bannerIdx === 0, 'mid-check: card #1 up at 5s');
        assert(Math.abs(T.prologue.walkT - C.PROLOGUE.BANNER_WALK_S) < 0.05,
          'the walk clock stops under the card (walkT=' + T.prologue.walkT.toFixed(2) + ')');
        assert(T.prologue.t > 4, 'the phase clock keeps ticking under the card (t=' + T.prologue.t.toFixed(1) + ')');
      }
      if (endedAt < 0 && !T.prologue.active) endedAt = i;
    });
    assert(endedAt > 60 * (bound - 2), 'the phase ran to MAX_S (frame ' + endedAt + ')');
    assert(endedAt > 0, 'the phase ended at MAX_S with the banner still waiting (frame ' + endedAt + ')');
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
    autoplay(60 * 16, (i) => {
      actBanners();
      if (!drank && !T.prologue.active) { drank = true; tDrink = i; }
    });
    assert(drank, 'the potion was drunk this arm');
    quietField();
    // Park the pilot post-drink: the AUTO pilot would kite the parked chaser
    // below and the contact would never land (the clock is the only variable).
    T.setPilotMode('MANUAL');
    park();
    st.weapons.length = 0; st.player.stats.thorns = 0;   // disarmed: the shield is the variable
    const p = st.player;
    const maxHp = p.hp;
    // A chaser pressed against the pilot for the whole window (speed 0 — it
    // is parked ON the contact radius; the clock is the only variable). Its
    // pool outlasts the base volley, which still fires for the whole window.
    st.enemies.push({ typeId: 'CHASER', x: p.x + 6, y: p.y, w: 10, hp: 1e9, maxHp: 1e9,
      speed: 0, mx: 0, my: 0, age: 0, elite: false });
    // THE BOUNDARY, measured from the drink (the PICKUP anchor): the walk
    // window already burned (720 - tDrink) frames of the shield; top up to
    // exactly 44.9s since the drink (2694 frames at 60Hz) — still shielded —
    // then cross to 45.1s.
    const burned = 60 * 16 - tDrink;
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
    autoplay(60 * 16, (i) => { actBanners(); st.spawnTimer = 999; });
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

S.check('THE ABSORB: the phase end marks the coach flags seen; no hint strip ever mounts', () => {
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
    // the move hint (the phase walks the pilot itself here — the player's
    // staged controls are the intro, not the chips).
    T.setPilotMode('AUTO');
    // (The old no-hint-arms probe retired with the hint layer itself — the
    // staged tooltips are the only intro layer now. ONBOARDING RETIREMENT
    // 2026-09-18: the pin is the layer's ABSENCE — no 'hint-strip' element
    // can mount on any frame of the phase.)
    let hintMounts = 0;
    const body = globalThis.document.body;
    // The SCRIPTED LEVEL-UP banner fires the REAL draft coach on this
    // flagless profile (the harness document stub records no listeners, so
    // capture the tour's own keydown here) — a live coach pauses the sim, so
    // dismiss it through the tour's real Escape path or the phase can never
    // reach the drink.
    const docKeys = [];
    const prevAdd = globalThis.document.addEventListener;
    globalThis.document.addEventListener = (ev, cb) => { if (ev === 'keydown') docKeys.push(cb); };
    const pre = (i) => {
      actBanners();
      hintMounts += (body.children || []).filter(c => c && c.id === 'hint-strip').length;
      if ((body.children || []).some(c => c && c.id === 'tour-root')) {
        for (const cb of docKeys.slice()) cb({ key: 'Escape', preventDefault() {} });
      }
    };
    try {
      autoplay(60 * 30, pre);
    } finally {
      globalThis.document.addEventListener = prevAdd;
    }
    assert(hintMounts === 0, 'no hint-strip mounted on any frame of the phase (' + hintMounts + ')');
    assert(!T.prologue.active, 'the drink ended the phase');
    for (const k of Object.values(TOUR_KEYS)) {
      assert(globalThis.localStorage.getItem(k) === '1',
        'tour flag ' + k + ' marked seen (the coach layer is absorbed, not stacked)');
    }
  } finally { Math.random = realRandom; }
});

// ---------------------------------------------------------------------------
// THE KILL SWITCH (owner 2026-09-18): C.PROLOGUE.ENABLED ships default OFF —
// run #1 opens EXACTLY as it did before the prologue existed. Every section
// above runs with the flag ON (the { prologue: true } boot flips it); this
// one pins the SHIPPED DEFAULT: fresh profile, flag untouched, no phase, no
// lock, a live ordinary run.
S.check('kill switch: default OFF restores the pre-prologue run #1', () => {
  C.PROLOGUE.ENABLED = false;
  try {
    T.getProfile().achievements.totals.runs = 0;
    T.startRun();
    h.pump(2);
    assert(T.prologue.active === false,
      'run #1 of a fresh profile does NOT arm the prologue with the flag OFF');
    assert(T.prologue.buttonsLocked === false, 'no button lock without the phase');
    assert(st.mode === 'playing', 'the run is an ordinary live run');
    // GATE-VERSUS-REPLAY (REPLAY TOUR brief item 3): the flag gates ONLY the
    // AUTOMATIC arm. A DELIBERATE opt-in (armVeteranTutorial — the what's-new
    // accept and the manual's REPLAY TOUR both land there) bypasses the park.
    T.whatsNew.arm();
    T.startRun();
    h.pump(2);
    assert(T.prologue.active === true && st.assistedRun === true,
      'the deliberate opt-in arms the special run even with the flag OFF');
    // ... and the opt-in is CONSUMED: the run after it is ordinary again.
    T.startRun();
    h.pump(2);
    assert(!T.prologue.active && st.assistedRun === false,
      'the opt-in is consumed by the arm (the next run is ordinary, gate still OFF)');
  } finally { C.PROLOGUE.ENABLED = true; }   // this file's own boot state
});

// ---------------------------------------------------------------------------
S.done();
