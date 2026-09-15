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

// MANUAL input state (the escape's own controller surface — never the
// overhead decide() seam; the brief forbids branching that).
const held = { left: false, right: false };
let jumpEdge = false;       // EDGE-gated: one press = one jump
let dashEdge = false;
let tapJump = false;

function paidSkipOwned() {
  return !!(profile && profile.purchased && (profile.purchased.escapeskip | 0) >= 1);
}

// Begin the escape. opts: { seed, ctx, profile, auto, onEnd }.
export function begin(opts = {}) {
  sim = createSim((opts.seed | 0) || 1);
  ctx = opts.ctx || null;
  profile = opts.profile || null;
  onEnd = opts.onEnd || null;
  auto = opts.auto !== false;
  holdT = 0; ended = false; endedPayload = null;
  held.left = held.right = false;
  jumpEdge = dashEdge = tapJump = false;
}

export function current() { return sim; }

function manualInput() {
  const input = {
    moveX: held.right ? 1 : held.left ? -1 : 0,
    jump: jumpEdge || tapJump,
    dash: dashEdge,
    autoClamp: null,
  };
  jumpEdge = false; dashEdge = false; tapJump = false;
  return input;
}

function finish(result) {
  if (ended) return;
  ended = true;
  let payout = 0;
  // Payout rule: COMPLETE always pays; SKIP pays ONLY with the paid-skip
  // unlock (the owner's "skip = forgo" rule, overridable by purchase);
  // caught/fell NEVER pay — the failure is soft but the purse is not.
  if (profile && (result === 'complete' || (result === 'skip' && paidSkipOwned()))) {
    payout = collect(profile);
  }
  endedPayload = {
    result,
    payout,
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

// A pointer in VIRTUAL coordinates (main.js maps the click for us): the skip
// rect first, then a tap anywhere is a JUMP (manual play on a phone).
export function pointer(px, py) {
  if (!sim || sim.outcome) return;
  if (R.skipHit(px, py)) { skip(); return; }
  tapJump = true;
}

export function onKey(k, down) {
  if (!sim || sim.outcome) return;
  const key = k.toLowerCase();
  if (key === 'arrowleft' || key === 'a') held.left = down;
  else if (key === 'arrowright' || key === 'd') held.right = down;
  else if ((key === ' ' || key === 'arrowup' || key === 'w') && down) jumpEdge = true;
  else if ((key === 'shift' || key === 'x') && down) dashEdge = true;
  else if (key === 'escape' && down) skip();
}

// The frame pump main.js calls. dt is REAL seconds (the escape has no
// earned-moment dilation — a change of pace keeps a steady clock).
export function frame(c, dt) {
  if (!sim) return;
  if (!sim.outcome) {
    const input = auto ? inputFor(sim) : manualInput();
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
      outcomeSub: sim.outcome === 'complete'
        ? '+ ' + payoutFor(bestGoldOf(profile || {})) + ' gold to the bank'
        : sim.outcome === 'skip'
          ? (pay ? 'paid skip: payout collected' : 'skipped: payout forgone')
          : '',
    });
  }
}

export function isEnded() { return ended; }
export function payload() { return endedPayload; }
