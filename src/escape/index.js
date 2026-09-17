// HORDES — V1 THE ESCAPE SEQUENCE: mode entry + frame pump. main.js hands over
// a canvas context and ONE narrow seam (`ESCAPE.frame` from the main frame
// loop, `ESCAPE.onKey` from the keydown/keyup path); this module owns the sim,
// the AUTO/MANUAL input split, the side-view render, the skip affordance and
// the payout, then hands the run back through `onEnd` — SOFT, always: the
// escape ends at a portal contact, a wall contact, a fall or a skip, and the
// RUN ITSELF continues (no death path out of this directory).
//
// The mode is SELF-CONTAINED (brief HOUSE RULES): it reads no stats, no draft,
// no loot, no meta bonuses. The ONLY profile touch is the payout's direct bank
// credit (payout.js) and the paid-skip ownership flag — both one-way reads of
// things the escape itself earned or the shop sold.
import { createSim, step } from './sim.js';
import { inputFor } from './auto.js';
import * as R from './render.js';
import { collect, payoutFor, bestGoldOf } from './payout.js';

// How long the outcome card holds before the hand-back (presentation only —
// the sim is already frozen; the hold accumulates the SAME dt the pump hands
// in, so a headless pump walks through it exactly like a real display).
const OUTCOME_HOLD = 1.4;

let sim = null;
let ctx = null;
let profile = null;
let onEnd = null;
let auto = true;
let holdT = 0;              // dt accumulated since the outcome landed
let ended = false;
let endedPayload = null;
// V1 play-test entry (the in-run settings TEST button): the escape's payout
// is REPEATABLE currency, so a test entry wired to the normal path would be a
// repeatable faucet. A test entry collects NOTHING — the flag travels this
// module's own begin opts, never a second entry point.
let testEntry = false;
// VK9P4 THE LIVE MODE TOGGLE: main.js hands in `getAuto` (read LIVE each
// frame — the pilot pref is the ONE source of truth, and a flip mid-run takes
// effect on the very next frame) and `onToggleMode` (the callback into
// main's swapPilotMode, which persists the pref and toasts). The escape keeps
// NO pilot state of its own: `auto` above remains only the entry default for
// the case where main hands over no getter (tests, the __TEST seam).
let getAutoFn = null;
let onToggleMode = null;
let lastAuto = true;         // the flip detector (edges dropped on a change)

// MANUAL input state (the escape's own controller surface — never the
// overhead decide() seam; the brief forbids branching that).
const held = { left: false, right: false };
// P2B99: the touch pads HOLD (a finger down on LEFT/RIGHT keeps running that
// way; lifting it is the BRAKE the appendage gauntlet is timed around). The
// pad-held flags are SEPARATE from the key-held ones so a keyup cannot drop a
// finger that is still down, and pointerUp cannot drop a held key. Each pad
// remembers WHICH pointer owns it (two-thumb play: the right thumb taps
// JUMP while the left thumb still holds RUN — that tap's own pointerup must
// release only its own pad, never the run finger).
const padHeld = { left: false, right: false };
const padPid = { left: null, right: null };
let jumpEdge = false;       // EDGE-gated: one press = one jump
let dashEdge = false;
let kickEdge = false;       // VK9P4: the manual-only KICK (auto never sets it)
let tapJump = false;

function paidSkipOwned() {
  return !!(profile && profile.purchased && (profile.purchased.escapeskip | 0) >= 1);
}

// Begin the escape. opts: { seed, ctx, profile, auto, onEnd, test,
// getAuto, onToggleMode }.
export function begin(opts = {}) {
  sim = createSim((opts.seed | 0) || 1);
  ctx = opts.ctx || null;
  profile = opts.profile || null;
  onEnd = opts.onEnd || null;
  auto = opts.auto !== false;
  testEntry = !!opts.test;
  getAutoFn = opts.getAuto || null;
  onToggleMode = opts.onToggleMode || null;
  holdT = 0; ended = false; endedPayload = null;
  held.left = held.right = false;
  padHeld.left = padHeld.right = false; padPid.left = padPid.right = null;
  jumpEdge = dashEdge = kickEdge = tapJump = false;
  lastAuto = isAuto();
}

export function current() { return sim; }
// The LIVE pilot mode (VK9P4): when main hands in getAuto the escape reads it
// EVERY frame — a flip mid-run changes the input path on the next frame with
// no restart and no lost progress (the sim is untouched; only WHO drives it
// changes). Falls back to the entry default when no getter was handed in.
export function isAuto() { return getAutoFn ? !!getAutoFn() : auto; }

function manualInput() {
  const input = {
    moveX: (held.right || padHeld.right) ? 1 : (held.left || padHeld.left) ? -1 : 0,
    jump: jumpEdge || tapJump,
    dash: dashEdge,
    kick: kickEdge,       // VK9P4: the manual-only pursuer clear
    autoClamp: null,
  };
  jumpEdge = false; dashEdge = false; kickEdge = false; tapJump = false;
  return input;
}

function finish(result) {
  if (ended) return;
  ended = true;
  let payout = 0;
  // Payout rule: COMPLETE always pays; SKIP pays ONLY with the paid-skip
  // unlock (the owner's "skip = forgo" rule, overridable by purchase);
  // caught/fell NEVER pay — the failure is soft but the purse is not.
  // A TEST entry never pays, whatever the outcome (see `testEntry` above).
  if (profile && !testEntry && (result === 'complete' || (result === 'skip' && paidSkipOwned()))) {
    payout = collect(profile);
  }
  endedPayload = {
    result,
    payout,
    test: testEntry,
    paidSkipUsed: result === 'skip' && paidSkipOwned(),
    bestGold: profile ? bestGoldOf(profile) : 0,
    seconds: sim.t,
    distance: sim.player.x,
    seed: sim.seed,
  };
  if (onEnd) onEnd(endedPayload);
}

export function skip() {
  if (!sim || sim.outcome) return;
  sim.outcome = 'skip';
  holdT = 0;
}

// A pointer in VIRTUAL coordinates (main.js maps the click for us; `pid` is
// the pointerId when the surface has one). Hit order: SKIP, then the MODE
// switch (both players — owner ask), then the MANUAL pads — LEFT/RIGHT HOLD
// (the OWNING pointer's lift releases), JUMP/DASH/KICK are edges — then a tap
// anywhere else is a JUMP (manual play on a phone). The button pads only fire
// in manual — in auto the pads are not drawn and their rects stay inert (the
// auto path is byte-identical to before).
export function pointer(px, py, pid) {
  if (!sim || sim.outcome) return;
  if (R.skipHit(px, py)) { skip(); return; }
  if (R.modeHit(px, py)) { if (onToggleMode) onToggleMode(); return; }
  if (!isAuto()) {
    if (R.leftHit(px, py)) { padHeld.left = true; if (pid != null) padPid.left = pid; return; }
    if (R.rightHit(px, py)) { padHeld.right = true; if (pid != null) padPid.right = pid; return; }
    if (R.jumpHit(px, py)) { tapJump = true; return; }
    if (R.dashHit(px, py)) { dashEdge = true; return; }
    if (R.kickHit(px, py)) { kickEdge = true; return; }
  }
  tapJump = true;
}

// The lift of a held pad (main.js routes pointerup/pointercancel here, with
// the pointerId). With an owner id, the lift releases only THAT pointer's pad
// (a JUMP tap's lift must not drop the RUN finger still holding its pad — the
// two-thumb phone pattern). Without one (tests, the headless seam) any lift
// releases BOTH direction pads — a finger that slid off its pad must not
// leave a phantom run pinned (the gauntlet's brake is exactly this lift).
export function pointerUp(pid) {
  if (pid == null) { padHeld.left = padHeld.right = false; padPid.left = padPid.right = null; return; }
  if (padPid.left === pid) { padHeld.left = false; padPid.left = null; }
  if (padPid.right === pid) { padHeld.right = false; padPid.right = null; }
}

// A help-mode probe (main.js calls it while the reference is armed, INSTEAD
// of pointer()): explain the touch target under the point — never activate
// it. The strings are the escape's own (this directory owns its copy).
export function explain(px, py) {
  if (R.skipHit(px, py)) return 'SKIP — end the escape now; the payout is forgone without the paid writ';
  if (R.modeHit(px, py)) return 'MODE — switch between the AUTO pilot and MANUAL play (same setting as the run)';
  if (R.leftHit(px, py)) return 'RUN LEFT — hold to run, lift to brake (hold STILL to time the boss arms)';
  if (R.rightHit(px, py)) return 'RUN RIGHT — hold to run, lift to brake (the brake is how you time the boss arms)';
  if (R.jumpHit(px, py)) return 'JUMP — manual pad: leap the gaps (same jump as the auto pilot)';
  if (R.dashHit(px, py)) return 'DASH — manual pad: the short speed burst (same dash as the auto pilot)';
  if (R.kickHit(px, py)) return 'KICK — manual pad: stomp the pursuit pack off your tail (bounded: cooldown + a short clear window)';
  return 'THE ESCAPE — run right. Gaps are lethal falls, the horde wall behind is the timer, the boss arms guard the finale.';
}

export function onKey(k, down) {
  if (!sim || sim.outcome) return;
  const key = k.toLowerCase();
  if (key === 'arrowleft' || key === 'a') held.left = down;
  else if (key === 'arrowright' || key === 'd') held.right = down;
  else if ((key === ' ' || key === 'arrowup' || key === 'w') && down) jumpEdge = true;
  else if ((key === 'shift' || key === 'x') && down) dashEdge = true;
  else if ((key === 's' || key === 'arrowdown') && down && !isAuto()) kickEdge = true;
  else if ((key === 'o' || key === 'm') && down) { if (onToggleMode) onToggleMode(); }
  else if (key === 'escape' && down) skip();
}

// The frame pump main.js calls. dt is REAL seconds (the escape has no
// earned-moment dilation — a change of pace keeps a steady clock).
export function frame(c, dt) {
  if (!sim) return;
  const autoNow = isAuto();
  // A mid-run flip changes WHO drives the sim, never the sim. On the frame
  // the mode CHANGES, the manual edges are dropped (a half-press can never
  // leak across the switch) — the runner keeps position, velocity and the
  // wall keeps its clock: no lost progress, no double-fire.
  if (autoNow !== lastAuto) {
    held.left = held.right = false;
    padHeld.left = padHeld.right = false; padPid.left = padPid.right = null;
    jumpEdge = dashEdge = kickEdge = tapJump = false;
    lastAuto = autoNow;
  }
  if (!sim.outcome) {
    const input = autoNow ? inputFor(sim) : manualInput();
    step(sim, Math.min(0.05, Math.max(0, dt)), input);
    if (sim.outcome) holdT = 0;
  } else if (!ended) {
    // The outcome card holds OUTCOME_HOLD of pump time, then the hand-back.
    holdT += Math.max(0, dt);
    if (holdT >= OUTCOME_HOLD) finish(sim.outcome);
  }
  if (c) {
    const pay = paidSkipOwned();
    R.draw(c, sim, {
      paidSkip: pay,
      manual: !autoNow,
      outcomeSub: testEntry
        ? 'TEST RUN — NO PAYOUT'
        : sim.outcome === 'complete'
          ? '+ ' + payoutFor(bestGoldOf(profile || {})) + ' gold to the bank'
          : sim.outcome === 'skip'
            ? (pay ? 'paid skip: payout collected' : 'skipped: payout forgone')
            : '',
    });
  }
}

export function isEnded() { return ended; }
export function payload() { return endedPayload; }
