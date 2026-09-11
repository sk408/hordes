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
//   - advance ONLY on click/tap (pointerdown); no timers
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
  constructor({ steps, doc, storage, onDone, onSkip, advanceHint = 'TAP TO CONTINUE' }) {
    this.steps = steps;
    this.doc = doc || globalThis.document;
    this.storage = storage || detectStorage();
    this.onDone = onDone || (() => {});
    this.onSkip = onSkip || (() => {});
    this.advanceHint = advanceHint;
    this.idx = -1;
    this.root = null;         // #tour-root (shade + tip); rebuilt per start()
    this.tracker = null;      // the relayout interval
  }

  active() { return !!this.root; }

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
    // Click ANYWHERE on the shade = advance (the player sets the pace). The
    // SKIP control inside the tip stops propagation.
    this.onPointerDown = (ev) => {
      if (ev && ev.stopPropagation) ev.stopPropagation();
      this.next();
    };
    this.root.addEventListener('pointerdown', this.onPointerDown);
    this.onKey = (ev) => {
      if (ev && ev.key === 'Escape') { ev.preventDefault?.(); this.skip(); }
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
    // One line of description + the advance hint + SKIP. innerHTML is set
    // once per step (fakeEl test shims understand innerHTML text).
    this.tip.innerHTML =
      `<span class="tour-text">${step.text}</span>` +
      `<span class="tour-hint">${this.advanceHint} · </span>` +
      `<a class="tour-skip">SKIP TOUR</a>`;
    const skipEl = this.tip.querySelector ? this.tip.querySelector('.tour-skip') : null;
    if (skipEl) {
      skipEl.addEventListener('pointerdown', (ev) => {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        this.skip();
      });
    }
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
    // Tip: below the hole when it fits, else above. Clamped to the viewport
    // so it is reachable at phone size.
    this.tip.style.left = Math.max(4, Math.min(vw - 190, L)) + 'px';
    const below = B + 34 <= vh;
    this.tip.style.top = (below ? B + 4 : Math.max(2, T - 34)) + 'px';
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
