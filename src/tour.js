// HORDES — FIRST-RUN GUIDED TOUR (docs/FIRST_RUN_TOUR_2026-09-11.md, rev 3).
//
// A staged, click-to-advance spotlight walkthrough — NOT a text wall (that
// remains banned). This module is the generic ENGINE; main.js owns the step
// definitions and staging:
//   Stage 1 (menu, first load): title cards — PLAY / SHOP / CHARACTERS /
//     SETTINGS / HOW TO PLAY. (The doc's "mode select" + "division/chip
//     selector" have no on-screen elements — the never-break rule skips
//     them. The EXIT-RUN control only exists IN RUN, so it is taught by the
//     in-run cog coachmark, stage 2.)
//   Stage 2 (in-run coachmarks): HUD readouts -> the cog/END RUN -> the
//     first DRAFT -> the arena boundary, each firing the first time the
//     element matters. main.js pauses the sim while a coachmark is up.
//
// MECHANICS CONTRACT (all doc requirements):
//   - dim the screen, spotlight ONE real element at a time; the spotlight
//     TRACKS the element (interval relayout — if the UI moves, it moves)
//   - one-line description per step
//   - advance ONLY on the tip card's own controls: NEXT / GOT IT button,
//     or Right / Enter / Space; Left backs up. A tap on the SHADE is INERT
//     (TUTORIAL_OVERLAY 2026-09-16: "the popups go away too easily" — the
//     old any-tap-advance burned a multi-step tip one stray tap at a time).
//   - first run only: flags persist via localStorage (injectable storage)
//   - always skippable: a visible SKIP control + Escape
//   - never break on a missing target: a step whose target() returns null
//     is skipped silently
//
// HEADLESS: every DOM touch goes through the `doc` (default
// globalThis.document) and storage is injectable — test_tour.mjs feeds
// fakes, exactly the meta.js pattern.
export const TOUR_KEYS = {
  stage1: 'hordes_tour_stage1',   // menu tour seen (done OR skipped)
  hud: 'hordes_tour_hud',         // stage-2 coachmarks, each fires once
  pilot: 'hordes_tour_pilot',
  focus: 'hordes_tour_focus',     // WAVE-22 (rev 4): the doctrine levers +
  stance: 'hordes_tour_stance',   // everything else in CONTROLS_INVENTORY's
  move: 'hordes_tour_move',       // MUST-COACHMARK list — the inventory's
  skills: 'hordes_tour_skills',   // coverage column is the acceptance bar.
  potions: 'hordes_tour_potions',
  stats: 'hordes_tour_stats',
  cog: 'hordes_tour_cog',
  draft: 'hordes_tour_draft',
  edge: 'hordes_tour_edge',
  // world interactables — fire the moment each first exists on the field
  chest: 'hordes_tour_chest',
  portal: 'hordes_tour_portal',
  arch: 'hordes_tour_arch',
  shrine: 'hordes_tour_shrine',
  // overlay screens that arrive with zero onboarding today
  intermission: 'hordes_tour_intermission',
  death: 'hordes_tour_death',
  settings: 'hordes_tour_settings',   // END RUN card, first in-run settings visit
  // G26 pre-run loadout: the just-in-time door coach. Owner 2026-09-15: "can it
  // present the coaching after the first weapon buyable is bought?" — it fires
  // the FIRST time the UNLOCKED-WEAPON SET grows beyond the starter kit (a
  // weapon shop purchase or grant), never from the title walk, once only. The
  // dedicated event test in test/test_g26_loadout.mjs pays for the
  // DISCOVERY_EXEMPT this door carries in test_tour.mjs.
  loadout: 'hordes_tour_loadout',
};

function detectStorage() {
  try {
    const s = globalThis.localStorage;
    if (s && typeof s.getItem === 'function') return s;
  } catch { /* locked-down contexts */ }
  return nullStorage();
}
function nullStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } };
}

export function tourFlag(key, storage) {
  const s = storage || detectStorage();
  try { return s.getItem(key) === '1'; } catch { return false; }
}
export function setTourFlag(key, val, storage) {
  const s = storage || detectStorage();
  try { val ? s.setItem(key, '1') : s.removeItem(key); } catch { /* best effort */ }
}
export function tourStage1Done(storage) { return tourFlag(TOUR_KEYS.stage1, storage); }
export function tourDone(storage) {
  return Object.values(TOUR_KEYS).every((k) => tourFlag(k, storage));
}
export function clearTourFlags(storage) {
  for (const k of Object.values(TOUR_KEYS)) setTourFlag(k, false, storage);
}

// ---------------------------------------------------------------------------
// Tour engine. steps: [{ id, text, target: () => element|null }]
// All spotlight geometry is in CSS pixels against the document viewport, so
// it works identically on a phone (targets are real tappable elements).
// ---------------------------------------------------------------------------
export class Tour {
  constructor({ steps, doc, storage, onDone, onSkip, passThrough = null }) {
    this.steps = steps;
    this.doc = doc || globalThis.document;
    this.storage = storage || detectStorage();
    this.onDone = onDone || (() => {});
    this.onSkip = onSkip || (() => {});
    // OPT-IN: a CSS selector for controls a tap may reach THROUGH the shade.
    // Only the title tour sets it (see _underlyingControl for why).
    this.passThrough = passThrough;
    this.idx = -1;
    this.root = null;         // #tour-root (shade + tip); rebuilt per start()
    this.tracker = null;      // the relayout interval
  }

  active() { return !!this.root; }

  // A tap that lands on a real, interactive control UNDER the shade (a title
  // menu card) is an intent to PRESS THAT CONTROL, not to advance the tour.
  // Opt-in via `passThrough`, and deliberately NOT the default: the in-run
  // coachmarks pause the sim under the shade, so a pass-through there would
  // silently pick a draft card the player only meant to dismiss the tip with.
  // The title has no such hazard - the card is the thing the player aimed at.
  _underlyingControl(ev) {
    if (!this.passThrough) return null;
    const d = this.doc;
    if (!ev || typeof ev.clientX !== 'number' || typeof ev.clientY !== 'number') return null;
    const at = d.elementsFromPoint;
    if (typeof at !== 'function') return null;   // fake docs / old browsers
    let stack;
    try { stack = at.call(d, ev.clientX, ev.clientY) || []; } catch { return null; }
    for (const el of stack) {
      if (!el || typeof el.closest !== 'function') continue;
      if (el === this.root) continue;
      if (this.root && typeof this.root.contains === 'function' && this.root.contains(el)) continue;
      const hit = el.closest(this.passThrough);
      if (hit) return hit;
    }
    return null;
  }

  start() {
    if (this.root) return;
    this.idx = -1;
    const d = this.doc;
    this.root = d.createElement('div');
    this.root.id = 'tour-root';
    // 4 shade rects leave a hole around the target (a plain overlay with a
    // CSS "hole" needs clip-path/mask tricks; 4 rects track a moving target
    // trivially and cost nothing).
    this.shades = [];
    for (let i = 0; i < 4; i++) {
      const s = d.createElement('div');
      s.className = 'tour-shade';
      this.root.appendChild(s);
      this.shades.push(s);
    }
    this.tip = d.createElement('div');
    this.tip.id = 'tour-tip';
    this.tip.innerHTML = '';
    this.root.appendChild(this.tip);
    // TUTORIAL_OVERLAY (owner-relayed 2026-09-16: "the popups go away too
    // easily when they try to push other things"): the shade SWALLOWS taps.
    // A tap that is not on a control of the tip card neither advances nor
    // dismisses — reaching for the thing the tip describes must not lose it.
    // The card's own buttons do the advancing; every button handler stops
    // propagation so this root handler never sees a control press.
    this.onPointerDown = (ev) => {
      if (ev && ev.stopPropagation) ev.stopPropagation();
      // WAVE-31: a finger tap on a title menu card used to be swallowed by the
      // shade (the tick note's "TAP TO CONTINUE, not the card you aimed at").
      // End the tour - the player has chosen their own path - and forward the
      // press so the card does what it looks like it does. The title tour is
      // the ONLY pass-through site; in-run coachmarks keep the swallow (a
      // pass-through there would silently pick a draft card).
      const under = this._underlyingControl(ev);
      if (under) {
        this._teardown();
        this.onDone();
        if (typeof under.click === 'function') under.click();
        return;
      }
      // Anything else: INERT by design (no advance, no dismiss).
    };
    this.root.addEventListener('pointerdown', this.onPointerDown);
    // Keyboard: Right/Enter/Space = next, Left = back, Escape = skip. No other
    // key does anything — the old WAVE-23 any-key advance was the other half
    // of the "goes away too easily" complaint. main.js swallows game keys
    // while a tour is live, so these presses have nowhere else to go.
    this.onKey = (ev) => {
      if (!ev) return;
      if (ev.key === 'Escape') { ev.preventDefault?.(); this.skip(); }
      else if (ev.key === 'ArrowRight' || ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault?.(); this.next();
      } else if (ev.key === 'ArrowLeft') { ev.preventDefault?.(); this.back(); }
    };
    d.addEventListener?.('keydown', this.onKey);
    (d.body || this.root).appendChild(this.root);
    // Track the target while mounted (menus are mostly static, but overlays
    // relayout — 120ms relayout keeps the hole on the real element).
    this.tracker = setInterval(() => this._layout(), 120);
    this._apply(-1 + 1); // step 0
  }

  next() {
    if (!this.root) return;
    this._apply(this.idx + 1);
  }

  back() {
    if (!this.root || this.idx <= 0) return;
    // _apply scans FORWARD from i for the first live target, and the CURRENT
    // step is live by construction — so back() can at worst land back on the
    // current step; it can never fall through to onDone.
    this._apply(this.idx - 1);
  }

  skip() {
    if (!this.root) return;
    this._teardown();
    this.onSkip(this.idx, this.steps.length);
  }

  _apply(i) {
    // Skip silently over steps whose target is missing (never break).
    while (i < this.steps.length) {
      let el = null;
      try { el = this.steps[i].target(); } catch { el = null; }
      if (el) { this.idx = i; this._show(el, this.steps[i]); return; }
      i++;
    }
    this._teardown();
    this.onDone();
  }

  _show(el, step) {
    this.target = el;
    // The card carries real controls (TUTORIAL_OVERLAY): a step counter on
    // multi-step tours ("2 OF 5"), BACK (hidden on the first step — never a
    // dead button), NEXT as the primary, and the standing SKIP. The final
    // step's primary COMPLETES the tour, so it reads as a finish (GOT IT) —
    // and it carries the replay note: REPLAY TOUR already exists in SETTINGS
    // (main.js); players only needed to be told. innerHTML is set once per
    // step (fakeEl test shims understand innerHTML text).
    const n = this.steps.length;
    const last = this.idx === n - 1;
    this.tip.innerHTML =
      (n > 1 ? `<span class="tour-count">${this.idx + 1} OF ${n}</span>` : '') +
      `<span class="tour-text">${step.text}</span>` +
      (last ? `<span class="tour-replay">Replay this any time from SETTINGS</span>` : '') +
      `<span class="tour-controls">` +
        (this.idx > 0 ? `<a class="tour-btn tour-back">BACK</a>` : '') +
        `<a class="tour-btn tour-next">${last ? 'GOT IT' : 'NEXT'}</a>` +
        `<a class="tour-skip">SKIP TOUR</a>` +
      `</span>`;
    // Every control press stops propagation so the root's swallow-all handler
    // never sees it. Buttons are >=44px hit targets inside the card (CSS),
    // never under the shade — the tip sits above the shade rects in DOM order.
    const bind = (sel, fn) => {
      const c = this.tip.querySelector ? this.tip.querySelector(sel) : null;
      if (c) c.addEventListener('pointerdown', (ev) => {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        if (ev && ev.preventDefault) ev.preventDefault();
        fn();
      });
    };
    bind('.tour-next', () => this.next());
    bind('.tour-back', () => this.back());
    bind('.tour-skip', () => this.skip());
    this._layout();
  }

  _layout() {
    if (!this.root || !this.target) return;
    const d = this.doc;
    let r;
    try { r = this.target.getBoundingClientRect(); } catch { this.next(); return; }
    if (!r || (!r.width && !r.height)) { this.next(); return; }   // vanished: move on, don't die
    const pad = 8;
    const vw = (d.defaultView && d.defaultView.innerWidth) || 480;
    const vh = (d.defaultView && d.defaultView.innerHeight) || 300;
    const L = Math.max(0, r.left - pad), T = Math.max(0, r.top - pad);
    const R = Math.min(vw, r.right + pad), B = Math.min(vh, r.bottom + pad);
    const set = (s, x, y, w, h) => {
      s.style.left = x + 'px'; s.style.top = y + 'px';
      s.style.width = w + 'px'; s.style.height = h + 'px';
    };
    set(this.shades[0], 0, 0, vw, T);          // above
    set(this.shades[1], 0, B, vw, vh - B);     // below
    set(this.shades[2], 0, T, L, B - T);       // left
    set(this.shades[3], R, T, vw - R, B - T);  // right
    // Tip: below the hole when it FITS, else above it; clamped into the
    // viewport on BOTH axes by the tip's own measured box, so it is reachable
    // at phone size and inside an embed (the old clamp used a hard-coded 190px
    // width and never bounded the bottom edge, so a target near the bottom of a
    // short viewport pushed the tip off-screen — "the tutorial goes off screen
    // in the galaxy embed").
    const tipW = Math.max(120, this.tip.offsetWidth || 190);
    const tipH = Math.max(24, this.tip.offsetHeight || 46);
    const maxLeft = Math.max(4, vw - tipW - 4);
    const maxTop = Math.max(4, vh - tipH - 4);
    this.tip.style.left = Math.max(4, Math.min(maxLeft, L)) + 'px';
    const below = B + 4 + tipH <= vh;
    const wantTop = below ? B + 4 : T - tipH - 4;
    this.tip.style.top = Math.max(4, Math.min(maxTop, wantTop)) + 'px';
    this.tip.style.maxWidth = (vw - 8) + 'px';
  }

  _teardown() {
    if (this.tracker) { clearInterval(this.tracker); this.tracker = null; }
    this.doc.removeEventListener?.('keydown', this.onKey);
    if (this.root && this.root.remove) this.root.remove();
    else if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root);
    this.root = null; this.target = null;
  }
}
