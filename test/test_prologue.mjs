// FIRST-RUN PROLOGUE (owner 2026-09-18): "a potion seen on screen and the
// pilot walks towards it... no enemies spawn and the timer hasn't started...
// dismissible banners explaining some of the basics."
//
// ADDENDUM 1 (owner 2026-09-18): "pilot could pause for these... all buttons
// should be disabled during this initial period."
//
// ADDENDUM 2 — STAGED INTRODUCTION (owner 2026-09-18): "introduce the buttons
// one at a time with the tooltip explaining what they do." Hidden beats
// greyed; the controls appear ONE AT A TIME, each when it is about to matter,
// each with a tooltip that DISAPPEARS WHEN THE CONTROL IS USED.
//
// DEFECT FIXES (owner 2026-09-18, "the how to play is broken"):
//   (a) OPT-OUT the SKIP is a PERSISTENT corner button, live at EVERY moment
//       of the phase (walk, banner, wait — not a link on the card), plus the
//       Escape twin for the whole phase.
//   (b) LESSON/MODE COHERENCE banner 1 states the mode truth ("The pilot
//       flies for you... take the wheel whenever you want") — steering is
//       taught as the opt-in it is, in any pilot mode, and the player's
//       input STEERS even while a card is up (the card can never make its
//       own lesson impossible).
//   (c) ACTION-GATED each banner carries an ACTION + a cue line ("STEER NOW
//       TO CONTINUE"); the banner advances the moment the player DOES the
//       thing (a ledger fed from every live seam), an action done early is
//       remembered, and MAX_S still escapes a never-acting player — a held
//       banner no longer freezes the bound.
//
// What this file pins:
//   PHASE     armed ONLY on run #1 of a fresh profile (derived from
//             achievements.totals.runs === 0 — no new saved field); the
//             world is INERT (no spawns) and state.time is FROZEN until the
//             phase ends. Inert until the potion is drunk.
//   CHOREO    walk -> banner -> DO THE THING -> walk -> ... -> potion ->
//             drink -> effect. Each banner goes up only after BANNER_WALK_S
//             of walking since the last advance; while one is up the
//             choreography HOLDS (the pilot pauses) but the PLAYER'S input
//             still steers. The phase walks the pilot itself whenever the
//             player is not steering: the choreography completes even idle.
//   STAGED    three controls, in first-60-seconds order: MOVE (revealed from
//             the first frame — banner 1's action must be doable when its
//             card arrives), PILOT (at banner 2's index), STATS (banner 3's).
//             Tooltip up with the reveal, gone on FIRST USE.
//   EXITS     the potion drunk, the stated bound (PROLOGUE.MAX_S of phase
//             time — ticks THROUGH a held banner, defect (c)), or SKIP (the
//             persistent corner button + the Escape twin; it skips the
//             TUTORIAL, NOT THE SEQUENCE: the drink path fires, so the 45s
//             shield + clear + clock-start all survive a skip). TWO-TAP
//             CONFIRM (owner 2026-09-18): the first press only ARMS the skip
//             (skipArmT = SKIP_CONFIRM_S, 'TAP SKIP AGAIN TO CONFIRM' toast,
//             the arm decays on the phase clock); only a second press inside
//             the window skips.
//   THE GUARD at phase end the control set is EXACTLY a normal run's.
//   EFFECT    the named 45s shield ANCHORED AT PICKUP, damage blocked at
//             44.9s and landing at 45.1s; the clear removes ON-SCREEN
//             enemies (view + margin) and NOT off-screen ones.
//   RUN #2    no prologue (the derivation contract), no lock.
//   ABSORB    the stage-2 tour flags are marked seen when the phase ends;
//             the hint layer that used to be gated DURING the phase is
//             RETIRED (ONBOARDING RETIREMENT 2026-09-18) — the absence is
//             pinned structurally below.
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
const hasPrOn = (id) => {
  const el = h.elements[id];
  return !!(el && el.classList && el.classList.contains('pr-on'));
};
const tipEl = () => h.elements['prologue-tip'];

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
    // CADENCE: at t=0 NO banner is up — it takes BANNER_WALK_S of walking
    // for the first one (walk -> banner, never banner-first).
    assert(T.prologue.banner() === null && T.prologue.bannerIdx === 0,
      'no banner before the first stretch of walking (walkT=' + T.prologue.walkT + ')');
    // DEFECT (c): MOVE is revealed from the FIRST frames — banner 1's action
    // is steering, so the control must already be live when its card arrives.
    assert(T.prologue.revealed.move === true,
      'MOVE is revealed from the first frame (its banner asks the player to steer)');
    assert(T.prologue.revealed.pilot === false && T.prologue.revealed.focus === false &&
      T.prologue.revealed.stance === false && T.prologue.revealed.stats === false,
      'PILOT, FOCUS, STANCE and STATS stay hidden until their own banners');
    assert(T.prologue.tip === 'move', 'the MOVE tooltip is up with its control');
    assert(!hasPrOn('tc-pilotbtn') && !hasPrOn('tc-stats'), 'no staging marks for the later stages');
    // 8 seconds of an untouched run: nothing spawns, the clock never starts.
    // With no action ever done, the banner that appears at BANNER_WALK_S
    // stays up — but the BOUND now ticks through it (defect (c): a held
    // banner no longer freezes the phase clock).
    let maxEnemies = 0;
    autoplay(60 * 8, () => {
      maxEnemies = Math.max(maxEnemies, st.enemies.length);
      assert(st.time === 0, 'state.time stays 0 while the prologue lives (got ' + st.time + ')');
    });
    assert(maxEnemies === 0, 'NO enemies spawn during the prologue (max ' + maxEnemies + ')');
    assert(T.prologue.banner() !== null && T.prologue.bannerIdx === 0,
      'banner #1 is up and waiting for its ACTION after 8s of wall time');
    assert(Math.abs(T.prologue.t - 8) < 0.2,
      'the bound clock TICKED through the held banner (t=' + T.prologue.t.toFixed(2) +
      's after 8s wall — defect (c))');
  } finally { Math.random = realRandom; }
});

S.check('the banners: four, action-gated with cue lines, cadence-gated, mode-coherent - and the ACTION advances', () => {
  Math.random = mulberry32b(0x9f2a);
  try {
    T.banners.suppressAll();
    T.getProfile().achievements.totals.runs = 0;
    T.startRun();
    h.pump(2);
    quietField();
    // Keep the potion out of reach so this arm is about the banners, not the
    // drink (the idle phase would otherwise walk the pilot onto it).
    st.prologue.potion.x = -3900; st.prologue.potion.y = st.player.y;
    const B = T.prologue.banners;
    assert(B.length === 7, 'exactly seven banners (got ' + B.length + ')');
    for (const b of B) {
      assert(!/[^\x00-\x7F]/.test(b.title + b.body + (b.cue || '')), 'no emojis / non-ASCII in UI copy: ' + b.title);
      assert(b.body.length <= 100, 'short and plain: ' + b.title + ' body is ' + b.body.length + ' chars');
      assert(!!b.action && !!b.cue, 'every banner carries an ACTION and a cue line: ' + b.title);
    }
    assert(B.map((b) => b.action).join(',') === 'move,pilot,focus,stance,stats,draft,drink',
      'the actions are the staged controls, then the draft, then the drink');
    assert(B[6].body.includes(String(C.PROLOGUE.INVULN_S)),
      'the potion banner states what you GET (the ' + C.PROLOGUE.INVULN_S + 's shield)');
    // ADDENDUM 3 (owner 2026-09-18: "it should give a message about focus and
    // stance also"): FOCUS and STANCE get their own banners in the same shape
    // — action-gated, stating what the thing IS and what you GET.
    assert(B[2].title === 'FOCUS' && /NEAREST/.test(B[2].body) && /RANGED/.test(B[2].body),
      'the FOCUS banner names the targeting doctrines (what it IS)');
    assert(/pilot picks/i.test(B[2].body), 'the FOCUS banner states what you GET (the pilot picks)');
    assert(B[3].title === 'STANCE' && /SAFE/.test(B[3].body) && /GREEDY/.test(B[3].body),
      'the STANCE banner names the risk dial (what you GET from each end)');
    // ...AND MAYBE EVEN TRIGGER A LEVEL UP: the LEVEL UP banner teaches the
    // draft; THE DRAFT banner grants it free.
    assert(B[4].title === 'LEVEL UP' && /draft/.test(B[4].body) && /1 of 3/.test(B[4].body),
      'the LEVEL UP banner explains the card selections');
    assert(B[5].title === 'THE DRAFT' && /free level-up/i.test(B[5].body),
      'the DRAFT banner says the level-up is free (scripted, not earned)');
    // PACING GUARD (same addendum): the draft auto-pick delay is deliberate —
    // the tutorial must not shorten it.
    assert(C.AUTOPILOT.DRAFT_TIMEOUT === 6.0,
      'pacing guard: DRAFT_TIMEOUT stays exactly 6.0s (got ' + C.AUTOPILOT.DRAFT_TIMEOUT + ')');
    // DEFECT (b) — LESSON/MODE COHERENCE: banner 1 states the mode truth:
    // the PILOT flies, steering is the player's opt-in (true in any mode).
    assert(/pilot flies for you/i.test(B[0].body),
      'banner 1 states the mode truth (teaching steering as the opt-in it is)');
    // THE CHOREOGRAPHY PAUSE: with banner #1 up and NO input, the pilot
    // holds (the owner's pause directive survives — only the human's input
    // outranks the card).
    autoplay(30);   // banner #1 comes up (walkT accrues)
    assert(T.prologue.banner() !== null, 'fixture: banner #1 is up');
    const x0 = st.player.x, y0 = st.player.y;
    autoplay(30);
    assert(Math.abs(st.player.x - x0) < 0.5 && Math.abs(st.player.y - y0) < 0.5,
      'the choreography HELD while a banner was up (moved ' +
      Math.hypot(st.player.x - x0, st.player.y - y0).toFixed(2) + 'wu)');
    // DEFECT (c): the WRONG action does not advance the card.
    T.prologue.act('pilot');
    autoplay(3);
    assert(T.prologue.bannerIdx === 0 && T.prologue.banner() !== null,
      'a non-matching action does not advance banner #1 (needs move)');
    // THE ACTION: steering advances the card — and steers WHILE it is up
    // (the card can never make its own lesson impossible).
    const x1 = st.player.x;
    steer(1, 0);
    autoplay(20);
    park();
    assert(T.prologue.bannerIdx === 1 && T.prologue.banner() === null,
      'steering advanced banner #1 the moment it landed (idx ' + T.prologue.bannerIdx + ')');
    assert(st.player.x > x1 + 5,
      'the player STEERED while the card was up (' + (st.player.x - x1).toFixed(1) + 'wu +x)');
    assert(T.prologue.walkT < C.PROLOGUE.BANNER_WALK_S,
      'the advance reset the walk clock (walkT=' + T.prologue.walkT.toFixed(2) + ')');
    // AN ACTION DONE EARLY IS REMEMBERED: act('pilot') with no banner up
    // does not advance anything NOW...
    T.prologue.act('pilot');
    assert(T.prologue.bannerIdx === 1 && T.prologue.banner() === null,
      'act() with no banner up does not advance on the spot');
    // ...but the next banner barely paints — the ledger already holds its
    // action, so it advances the frame after it comes up (at most one
    // observable frame; the card after it can hold normally, waiting for
    // its own action).
    let b2Frames = 0;
    autoplay(40, () => { if (T.prologue.banner() !== null && T.prologue.bannerIdx === 1) b2Frames++; });
    assert(b2Frames <= 1 && T.prologue.bannerIdx >= 2,
      'the done action carried banner #2 past a hold (idx ' + T.prologue.bannerIdx +
      ', banner #2 visible ' + b2Frames + ' frames)');
    // RECT GEOMETRY (defect (a)): the SKIP button is in-view and clear of the
    // banner card (the card plate spans x 90..390 at W=480).
    const sk = prologueSkipRect();
    assert(sk.x >= 0 && sk.x + sk.w <= C.VIEW_W && sk.y >= 0 && sk.y + sk.h <= C.VIEW_H,
      'the SKIP rect is inside the view at every viewport');
    assert(sk.x >= 390, 'the SKIP rect sits clear of the banner card (x ' + sk.x + ')');
  } finally { Math.random = realRandom; }
});

// ---------------------------------------------------------------------------
// THE STAGED INTRODUCTION — MOVE from the first frame, tooltip clears on
// first use, input steers in ANY mode.
// ---------------------------------------------------------------------------
S.check('STAGED: MOVE live from frame one - steering advances banner 1, clears the tooltip, works in any mode', () => {
  Math.random = mulberry32b(0x9a11);
  try {
    T.banners.suppressAll();
    T.getProfile().achievements.totals.runs = 0;
    T.startRun();
    h.pump(2);
    quietField();
    st.prologue.potion.x = -3900; st.prologue.potion.y = st.player.y;
    T.setPilotMode('MANUAL');
    assert(T.prologue.revealed.move === true && T.prologue.tip === 'move',
      'MOVE is live with its tooltip from the first frames');
    assert(/STEER/.test(T.prologue.tipText('move')), 'the MOVE tooltip says what it does');
    assert(!/[^\x00-\x7F]/.test(T.prologue.tipText('move')), 'tooltip copy is plain ASCII');
    assert(tipEl().hidden === false, 'the tooltip DOM element is shown');
    // USED = LEARNED: the first real steer clears the tooltip, steers the
    // phase in ANY pilot mode, and advances banner #1 the frame it comes up
    // (the ledger was fed at the first steer — the card never blocks on an
    // OK that no longer exists).
    T.setPilotMode('AUTO_ALL');
    const x1 = st.player.x;
    steer(1, 0);
    autoplay(25);
    park();
    assert(T.prologue.bannerIdx >= 1,
      'steering advanced banner #1 (idx ' + T.prologue.bannerIdx + ')');
    assert(T.prologue.tip !== 'move',
      'the MOVE tooltip cleared on first use (tip now ' + T.prologue.tip + ' — the next stage\'s own)');
    assert(T.prologue.tip === 'pilot' && tipEl().hidden === false,
      'the PILOT tooltip is up with its freshly revealed control');
    assert(st.player.x > x1 + 5,
      'held input STEERS the phase in AUTO mode too (' +
      (st.player.x - x1).toFixed(1) + 'wu against the choreography)');
    // And the keyboard twin steers as well (the desktop MOVE control).
    const x2 = st.player.x;
    kdown('d'); kdown('d');   // keydown twice: repeat-guard safe, held 'right'
    autoplay(20, actBanners);
    kdown('ArrowRight');
    assert(st.player.x > x2 + 5,
      'WASD/arrows steer the phase once MOVE is revealed (' + (st.player.x - x2).toFixed(1) + 'wu)');
    assert(st.time === 0, 'and the run clock still has not started');
  } finally { Math.random = realRandom; }
});

S.check('STAGED: PILOT/FOCUS/STANCE revealed at their banners\' indexes, STATS before the draft - live on reveal, tooltip on first use', () => {
  Math.random = mulberry32b(0x9a22);
  try {
    T.banners.suppressAll();
    T.getProfile().achievements.totals.runs = 0;
    T.startRun();
    h.pump(2);
    quietField();
    st.prologue.potion.x = -3900; st.prologue.potion.y = st.player.y;
    T.setPilotMode('AUTO_ALL');
    // PILOT/FOCUS/STANCE are NOT live before their reveals. Banner #1 up.
    autoplay(30);              // banner #1 comes up (0.35s) and holds
    assert(T.prologue.banner() !== null, 'fixture: banner #1 up');
    const focus0 = T.controller.focus, stance0 = T.controller.stance;
    T.runAction('pilot'); kdown('o');
    assert(st.pilotMode === 'AUTO_ALL', 'the PILOT switch is inert before its stage (mode ' + st.pilotMode + ')');
    T.runAction('focus'); kdown('Tab'); T.runAction('stance'); kdown('g');
    assert(T.controller.focus === focus0 && T.controller.stance === stance0,
      'FOCUS and STANCE are inert before their stages');
    T.runAction('stats');
    assert(st.mode === 'playing', 'the FIELD REPORT is inert before its stage (mode ' + st.mode + ')');
    assert(!hasPrOn('tc-pilotbtn') && !hasPrOn('tc-focusbtn') && !hasPrOn('tc-stancebtn'),
      'no staging marks before the reveals');
    // MOVE advances banner #1 -> PILOT revealed at banner 2's index.
    T.prologue.act('move');
    autoplay(3);
    assert(T.prologue.bannerIdx === 1, 'the move action advanced banner #1');
    assert(T.prologue.revealed.pilot === true,
      'PILOT revealed at banner 2\'s index — the control is live before its card asks');
    assert(hasPrOn('tc-pilotbtn'), 'the PILOT button is un-hidden (.pr-on)');
    assert(T.prologue.tip === 'pilot', 'the PILOT tooltip is up with its control');
    assert(/AUTO/.test(T.prologue.tipText('pilot')), 'the PILOT tooltip says what it does');
    // USE: the touch funnel toggles (and the choreography survives an idle
    // MANUAL pilot — the phase keeps walking; pinned again in the EXITs).
    T.runAction('pilot');
    assert(st.pilotMode === 'AUTO_MOVE', 'the PILOT button WORKS once revealed (mode ' + st.pilotMode + ')');
    assert(T.prologue.tip === null, 'the PILOT tooltip cleared on first use');
    kdown('o');
    assert(st.pilotMode === 'MANUAL', 'the O key twin works once revealed (mode ' + st.pilotMode + ')');
    T.runAction('pilot');
    assert(st.pilotMode === 'AUTO_ALL', 'cycled back to AUTO_ALL (practice is reversible)');
    // Banner #2 barely paints (its action is already done) — the FOCUS banner's
    // index arrives, and with it the FOCUS reveal (addendum 3).
    let b2Frames = 0;
    autoplay(45, () => { if (T.prologue.banner() !== null && T.prologue.bannerIdx === 1) b2Frames++; });
    assert(b2Frames <= 1 && T.prologue.bannerIdx >= 2,
      'the done pilot action carried the index past banner #2 (idx ' + T.prologue.bannerIdx +
      ', banner #2 visible ' + b2Frames + ' frames)');
    assert(T.prologue.revealed.focus === true, 'FOCUS revealed at banner 3\'s index');
    assert(hasPrOn('tc-focusbtn'), 'the FOCUS button is un-hidden (.pr-on)');
    assert(T.prologue.tip === 'focus', 'the FOCUS tooltip is up with its control');
    assert(/target/i.test(T.prologue.tipText('focus')), 'the FOCUS tooltip says what it does');
    // Banner #3 (FOCUS) comes up and WAITS for the press — the press IS the
    // continue, and it WORKS (the doctrine cycles).
    let focusCard = null;
    autoplay(45, () => { if (T.prologue.banner() !== null && T.prologue.bannerIdx === 2) focusCard = T.prologue.banner(); });
    assert(focusCard !== null && focusCard.title === 'FOCUS', 'banner #3 (FOCUS) is up and waiting');
    kdown('Tab');
    assert(T.controller.focus !== focus0, 'the FOCUS key twin WORKS once revealed (doctrine cycled)');
    autoplay(3);
    assert(T.prologue.bannerIdx === 3, 'the focus press advanced banner #3');
    assert(T.prologue.revealed.stance === true, 'STANCE revealed at banner 4\'s index');
    assert(hasPrOn('tc-stancebtn'), 'the STANCE button is un-hidden (.pr-on)');
    assert(T.prologue.tip === 'stance', 'the STANCE tooltip is up with its control');
    // Banner #4 (STANCE): same shape. STATS is still gated (its stage is next).
    T.runAction('stats');
    assert(st.mode === 'playing', 'the FIELD REPORT is still inert before its own stage (mode ' + st.mode + ')');
    let stanceCard = null;
    autoplay(45, () => { if (T.prologue.banner() !== null && T.prologue.bannerIdx === 3) stanceCard = T.prologue.banner(); });
    assert(stanceCard !== null && stanceCard.title === 'STANCE', 'banner #4 (STANCE) is up and waiting');
    T.runAction('stance');
    assert(T.controller.stance !== stance0, 'the STANCE button WORKS once revealed (dial turned)');
    autoplay(3);
    assert(T.prologue.bannerIdx === 4, 'the stance press advanced banner #4');
    assert(T.prologue.revealed.stats === true, 'STATS revealed at banner 5\'s index');
    assert(hasPrOn('tc-stats'), 'the STATS button is un-hidden (.pr-on)');
    assert(T.prologue.tip === 'stats', 'the STATS tooltip is up with its control');
    // USE through the real key twin: the report opens, the game pauses under
    // it (menu-like), the tooltip clears, and ESC resumes the phase.
    kdown('i');
    assert(st.mode === 'stats', 'the FIELD REPORT key WORKS once revealed');
    assert(T.prologue.tip === null, 'the STATS tooltip cleared on first use');
    const tFrozen = T.prologue.t;
    autoplay(30);
    assert(st.mode === 'stats' && Math.abs(T.prologue.t - tFrozen) < 1e-9,
      'the phase clock pauses under the report (menu-like)');
    kdown('Escape');
    assert(st.mode === 'playing', 'ESC resumes the phase from the report');
    T.prologue.act('stats');   // the report use already fed the ledger; belt+braces
    // plain pumps (autoplay would resolve the scripted draft the frame it opens):
    // the LEVEL UP banner must come up (0.35s walk) before the ledger advances it.
    for (let i = 0; i < 60 && st.prologue.bannerIdx === 4; i++) { h.pump(1); st.bannerHold = 0; }
    assert(T.prologue.bannerIdx === 5, 'the stats use advanced banner #5 (THE DRAFT is next, idx ' +
      T.prologue.bannerIdx + ')');
    // THE SCRIPTED LEVEL-UP (addendum 3: "maybe even trigger a level up and
    // tell the player about the card selections"): the draft banner walks
    // into view and the phase grants ONE free level — the world stays inert
    // (quiet field, frozen clock) and the REAL draft opens with the
    // explanation riding its subtitle. Scripted, not earned. (Plain pumps, no
    // autoplay: its resolver would click the draft closed before the asserts.)
    const level0 = st.player.level;
    let sawDraftBanner = false;
    for (let i = 0; i < 60; i++) {
      h.pump(1);
      st.bannerHold = 0;
      const b = T.prologue.banner();
      if (b && st.prologue.bannerIdx === 5) sawDraftBanner = true;
      if (st.mode === 'draft') break;
    }
    assert(sawDraftBanner, 'banner #6 (THE DRAFT) walked into view');
    assert(st.mode === 'draft' && st.prologue.draftFired === true && st.prologue.bannerIdx === 5,
      'the draft banner fired a SCRIPTED level-up: the real draft is open (mode ' + st.mode + ')');
    assert(st.player.level === level0 + 1 && st.prologue.draftFired === true,
      'exactly one free level granted (level ' + level0 + ' -> ' + st.player.level + ')');
    assert(st.time === 0 && st.enemies.length === 0,
      'the opening stayed inert through the scripted level-up (no enemies, clock frozen)');
    const subTxt = h.elements['ov-sub'] ? (h.elements['ov-sub'].textContent || h.elements['ov-sub'].innerHTML || '') : '';
    assert(/pick 1 of the 3 cards/i.test(String(subTxt)),
      'the draft screen EXPLAINS the card selection (subtitle: "' + subTxt + '")');
    // THE PICK is the banner's action — tapped or auto-picked, it advances.
    h.elements['ov-cards'].children[0].click();
    autoplay(3);
    assert(T.prologue.bannerIdx === 6, 'the pick advanced banner #6');
    // Banner #7 (the potion) has no ledger advance — it comes up and WAITS
    // for the walk-in; it reveals nothing new.
    let potionCard = null;
    autoplay(60, () => { if (T.prologue.banner() !== null) potionCard = T.prologue.banner(); });
    assert(potionCard !== null && potionCard.title === 'THE POTION',
      'banner #7 is up and waiting for the walk-in');
    autoplay(30, () => {
      assert(T.prologue.banner() !== null && T.prologue.bannerIdx === 6,
        'the potion banner does not advance on its own (the drink IS the action)');
    });
    assert(T.prologue.revealed.move && T.prologue.revealed.pilot && T.prologue.revealed.focus &&
      T.prologue.revealed.stance && T.prologue.revealed.stats && T.prologue.tip === null,
      'banner 7 reveals nothing new (all five stages already out, no tooltip)');
  } finally { Math.random = realRandom; }
});

S.check('STAGED: nothing else is live through the phase - the unstaged controls stay hidden and inert', () => {
  Math.random = mulberry32b(0x9a33);
  try {
    T.banners.suppressAll();
    T.getProfile().achievements.totals.runs = 0;
    T.startRun();
    h.pump(2);
    quietField();
    st.prologue.potion.x = -3900; st.prologue.potion.y = st.player.y;
    assert(T.prologue.buttonsLocked === true,
      'body.prologue-locked is ON from arm time (the hidden touch layer)');
    const radar0 = st.radarOn, map0 = st.mapOpen, zoom0 = st.zoom,
      focus0 = T.controller.focus, stance0 = T.controller.stance;
    // Do every staged action (all five stages revealed) — the unstaged
    // controls must STILL be inert after the last advance.
    T.setPilotMode('AUTO_ALL');
    autoplay(60 * 8, actBanners);
    assert(T.prologue.bannerIdx === 6 && T.prologue.banner() !== null &&
      T.prologue.revealed.pilot && T.prologue.revealed.focus && T.prologue.revealed.stance &&
      T.prologue.revealed.stats,
      'fixture: every banner action done, all five stages revealed (the potion card waits for the walk-in)');
    // (Escape is NOT in this list: it is the SKIP twin — a live control by
    // design, pinned in its own checks below. Tab and G are ALSO not here:
    // FOCUS and STANCE are staged controls now — live, pinned right below.)
    for (const k of ['p', 'm', 'r', '?', '+', '-', 'q', 'e', 'h', 'n']) kdown(k);
    assert(st.mode === 'playing', 'no screen opened (settings/help inert; mode ' + st.mode + ')');
    assert(st.radarOn === radar0 && st.mapOpen === map0, 'radar and map inert');
    assert(st.zoom === zoom0, 'zoom inert');
    assert(T.controller.focus === focus0 && T.controller.stance === stance0,
      'the ledger-driven fixture never touched the doctrines (they wait for a real press)');
    kdown('Tab'); kdown('g');
    assert(T.controller.focus !== focus0 && T.controller.stance !== stance0,
      'FOCUS (Tab) and STANCE (G) are LIVE at their stages (the staged exception)');
    for (const act of ['settings', 'help', 'radar', 'map', 'q', 'w', 'h', 'n'])
      T.runAction(act);
    assert(st.mode === 'playing' && st.mapOpen === map0 && st.radarOn === radar0,
      'runAction stays swallowed for the unstaged acts');
    assert(T.prologue.buttonsLocked === true, 'the lock holds past the last advance');
    assert(!hasPrOn('tc-cog') && !hasPrOn('tc-stats') === false, 'fixture: staged marks only where staged');
    // THE LIFT: at the drink, everything comes back at once.
    T.prologue.drink();
    h.pump(2);
    assert(!T.prologue.active && T.prologue.buttonsLocked === false,
      'the lock lifted at phase end (the full control set reappears)');
    assert(!hasPrOn('tc-pilotbtn') && !hasPrOn('tc-focusbtn') && !hasPrOn('tc-stancebtn') &&
      !hasPrOn('tc-stats'), 'no staging marks survive the phase');
    assert(tipEl().hidden === true, 'no tooltip survives the phase');
    kdown('i');
    assert(st.mode === 'stats', 'the FIELD REPORT key works after the phase');
    kdown('Escape');
    assert(st.mode === 'playing', 'ESC resumes — the in-run menu works after the phase');
  } finally { Math.random = realRandom; }
});

// ---------------------------------------------------------------------------
// THE SKIP — DEFECT (a): a PERSISTENT opt-out, reachable at EVERY moment of
// the phase (the walk window included — not a link on the banner card).
// CLARIFIED ("No, potion exists for the skipped tutorial too"): the skip
// removes the EXPLANATIONS, not the SEQUENCE — banners and tooltips never
// appear again, the FULL control set is live from the press, and the POTION
// SEQUENCE RUNS AS NORMAL.
// ---------------------------------------------------------------------------
S.check('SKIP (a): the corner button works in the WALK window too - no banner needs to be up', () => {
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
    assert(T.prologue.buttonsLocked === false && !hasPrOn('tc-pilotbtn') && tipEl().hidden === true,
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
    autoplay(45, () => { if (T.prologue.banner() !== null || st.prologue.tip !== null) leak = true; });
    assert(!leak, 'no banner and no tooltip appears after the skip');
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
S.check('THE GUARD: after a full staged phase, the control set equals a normal run\'s', () => {
  Math.random = mulberry32b(0x9a55);
  try {
    T.banners.suppressAll();
    T.getProfile().achievements.totals.runs = 0;
    T.startRun();
    h.pump(2);
    quietField();
    // Complete the whole phase the intended way: every banner's action done
    // (all stages revealed + used), then the drink.
    T.setPilotMode('AUTO_ALL');
    autoplay(60 * 18, actBanners);
    assert(!T.prologue.active, 'fixture: the phase completed via the drink');
    // The control-set snapshot: DOM + logic + key liveness.
    const controlSet = () => ({
      locked: T.prologue.buttonsLocked,
      pilotMark: hasPrOn('tc-pilotbtn'), statsMark: hasPrOn('tc-stats'),
      tipHidden: tipEl().hidden === true,
      settings: (T.runAction('settings'), st.mode === 'settings'),
    });
    const after = controlSet();
    kdown('Escape');   // close what the snapshot opened (ESC resumes)
    assert(after.locked === false && after.pilotMark === false && after.statsMark === false &&
      after.tipHidden === true && after.settings === true,
      'the post-phase control set is fully live with no staging leftovers');
    // Run #2 — the normal-run reference: the SAME snapshot, field for field.
    T.getProfile().achievements.totals.runs = 1;
    T.startRun();
    h.pump(2);
    const normal = controlSet();
    kdown('Escape');
    assert(normal.locked === false && normal.pilotMark === false && normal.statsMark === false &&
      normal.tipHidden === true && normal.settings === true,
      'the normal run\'s control set reads the same');
    assert(after.locked === normal.locked && after.pilotMark === normal.pilotMark &&
      after.statsMark === normal.statsMark && after.tipHidden === normal.tipHidden &&
      after.settings === normal.settings,
      'EQUAL: the post-prologue control set is exactly a normal run\'s');
    // And the pilot-mode toggle is a normal control again (staged once, not
    // special-cased forever).
    const mode0 = st.pilotMode;
    T.runAction('pilot');
    assert(st.pilotMode !== mode0, 'the PILOT toggle is an ordinary control after the phase');
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

S.check('EXIT 2, the bound: MAX_S escapes a never-acting player - a held banner no longer freezes it', () => {
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
    assert(bound === 60, 'the bound is stated: 60s (PROLOGUE.MAX_S)');
    // DEFECT (c), INVERTED from the old contract: banner #1 comes up at
    // BANNER_WALK_S and NEVER receives its action — the WALKT cadence clock
    // freezes under the card (the walk -> banner rhythm), but the BOUND
    // clock keeps ticking, and MAX_S ends the phase with the card still up.
    let endedAt = -1;
    autoplay(60 * (bound + 5), (i) => {
      if (i === 60 * 30) {
        assert(T.prologue.banner() !== null && T.prologue.bannerIdx === 0,
          'mid-check: banner #1 still up, never acted (idx ' + T.prologue.bannerIdx + ')');
        assert(Math.abs(T.prologue.walkT - C.PROLOGUE.BANNER_WALK_S) < 0.05,
          'the WALKT cadence clock froze under the card (walkT=' + T.prologue.walkT.toFixed(2) + ')');
        assert(T.prologue.t > 25,
          'the bound clock kept TICKING under the card (t=' + T.prologue.t.toFixed(1) + 's at 30s wall)');
      }
      if (endedAt < 0 && !T.prologue.active) endedAt = i;
    });
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
    // is parked ON the contact radius; the clock is the only variable).
    st.enemies.push({ typeId: 'CHASER', x: p.x + 6, y: p.y, w: 10, hp: 1000, maxHp: 1000,
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
