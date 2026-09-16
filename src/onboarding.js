// HORDES — ONBOARDING REWORK (owner-approved 2026-09-16).
//
// The 25-card tour is replaced by IN-CONTEXT touches through one hint strip,
// in answer to the galaxy.click feedback ("tons of information thrown at you
// without context", "skipped like 8 tutorial blurbs because I was moving
// manually"). This module is the ENGINE for the layer; main.js owns the
// triggers, the demonstration detection and the storage flags.
//
// THE INVARIANTS (every one asserted in test/test_onboarding.mjs):
//   1. A hint NEVER pauses the sim — the engine has no gate on the frame
//      loop at all; main.js ticks it every playing frame, update or not.
//   2. A hint NEVER captures input — the strip carries `pointer-events:
//      none` BY CONSTRUCTION (inline style at mount), never registers a
//      listener, and has NO dismiss controls (nothing to close by accident).
//   3. Auto-fade after HINT_FADE_S; at most ONE hint visible at a time;
//      later triggers QUEUE rather than stack.
//   4. TEACH-UNTIL-DEMONSTRATED is main.js's side (the flags below); the
//      engine only offers `retire` so a demonstrated hint leaves immediately.
//   5. Anchored to the GAME CONTAINER, clamped fully inside it, never
//      overlapping the joystick or the skill buttons (layoutStrip).
//   6. No emojis anywhere (owner rule).
//
// OBJECT LABELS (the old chest / portal / arch / shrine tags) were REMOVED
// 2026-09-16 — see the note at HINT_FADE_S below.

// Visible lifetime of a hint strip (spec: "auto-fade after ~5-6s").
export const HINT_FADE_S = 5.5;
// OBJECT LABELS REMOVED (owner 2026-09-16: "a bit annoying, and sometimes
// they persist after the run"): the tag engine class and its fade constant
// are deleted outright — no dormant copy behind a flag. Object knowledge
// lives in the reference screen's THE FIELD page. Pinned by
// test/test_notags.mjs (symbol absence in the shipped source).

// ---------------------------------------------------------------------------
// PURE layout: where does a w x h strip sit inside the container?
// ---------------------------------------------------------------------------
// Candidates in order: top-centre (the default read), bottom-centre, then
// mid-centre. The first candidate that clears every avoid rect (the joystick
// and the touch buttons, inflated by a 4px margin) wins; the result is then
// clamped fully inside the container (4px inset) so a 480x300 embed can
// never clip it — the tour's own embed lesson (tour.js _layout) applied to
// the hint strip. PURE: rects in, rect out.
export function layoutStrip(cRect, w, h, avoidRects = []) {
  const hit = (r) => avoidRects.some(a =>
    r.left < a.right + 4 && r.right > a.left - 4 &&
    r.top < a.bottom + 4 && r.bottom > a.top - 4);
  const cx = cRect.left + (cRect.width - w) / 2;
  const cands = [
    { left: cx, top: cRect.top + 6 },
    { left: cx, top: cRect.bottom - h - 6 },
    { left: cx, top: cRect.top + (cRect.height - h) / 2 },
  ];
  let pick = cands[0];
  for (const c of cands) {
    const r = { left: c.left, top: c.top, right: c.left + w, bottom: c.top + h };
    if (!hit(r)) { pick = c; break; }
  }
  return {
    left: Math.max(cRect.left + 4, Math.min(cRect.right - w - 4, pick.left)),
    top: Math.max(cRect.top + 4, Math.min(cRect.bottom - h - 4, pick.top)),
    width: w, height: h,
  };
}

// ---------------------------------------------------------------------------
// Hint strip: one line, one at a time, queued, auto-fading, inert.
// ---------------------------------------------------------------------------
export class HintStrip {
  // anchor: () => container rect (the game container); avoid: () => rects to
  // keep clear (joystick + buttons). mount: where the strip element lives
  // (document.body — the tour precedent); position is absolute in viewport
  // coords, recomputed every tick so a resize re-clamps it.
  constructor({ anchor, avoid = () => [], mount, doc } = {}) {
    this.doc = doc || globalThis.document;
    this.anchor = anchor;
    this.avoid = avoid;
    this.mount = mount || (this.doc && this.doc.body);
    this.queue = [];        // [{ id, text }]
    this.current = null;    // { id, text, life }
    this.el = null;         // the #hint-strip element, mounted only while shown
  }

  // Queue a hint. Duplicates by id are dropped; the CURRENT hint is never
  // displaced (invariant 3: later triggers queue, never stack).
  show(id, text) {
    if (this.current && this.current.id === id) return;
    if (this.queue.some(h => h.id === id)) return;
    this.queue.push({ id, text });
  }

  // A demonstrated (or otherwise retired) hint leaves NOW: out of the queue,
  // off the screen if it is the current one.
  retire(id) {
    this.queue = this.queue.filter(h => h.id !== id);
    if (this.current && this.current.id === id) { this._unmount(); }
  }

  clear() { this.queue = []; this._unmount(); }
  get visibleId() { return this.current ? this.current.id : null; }

  update(dt) {
    if (!this.current && this.queue.length) {
      this.current = { ...this.queue.shift(), life: HINT_FADE_S };
      this._mount(this.current.text);
    }
    if (this.current) {
      this.current.life -= dt;
      if (this.current.life <= 0) this._unmount();
      else this._layout();
    }
  }

  _mount(text) {
    if (this.el) this._unmount();
    const el = this.doc.createElement('div');
    el.id = 'hint-strip';
    if (el.style && el.style.cssText !== undefined) {
      // Inline style, tour-tip precedent. pointer-events:NONE is the input
      // invariant: the strip can never eat a tap a movement key or a joystick
      // drag — everything passes through to the canvas under it.
      el.style.cssText =
        'position:absolute;pointer-events:none;z-index:60;' +
        'max-width:280px;padding:5px 10px;font-size:11px;letter-spacing:1px;' +
        'color:#e8e8f4;background:rgba(6,6,12,0.82);border:1px solid #6a6a7c;';
    }
    el.textContent = text;
    if (this.mount && this.mount.appendChild) this.mount.appendChild(el);
    this.el = el;
    this._layout();
  }

  _layout() {
    if (!this.el) return;
    let cRect;
    try { cRect = this.anchor(); } catch { return; }
    if (!cRect) return;
    const w = Math.min(280, (cRect.width || 480) - 8);
    const h = 24;
    let avoid = [];
    try { avoid = this.avoid() || []; } catch { avoid = []; }
    const r = layoutStrip(cRect, w, h, avoid);
    if (this.el.style) {
      // NaN-safe (display bug 2026-09-16): 'NaNpx' is dropped by the browser
      // and the strip falls below the fold, clipped — never write it.
      if (Number.isFinite(r.left) && Number.isFinite(r.top)) {
        this.el.style.left = r.left + 'px';
        this.el.style.top = r.top + 'px';
      }
    }
  }

  _unmount() {
    if (this.el) {
      if (this.el.remove) this.el.remove();
      else if (this.el.parentNode) this.el.parentNode.removeChild(this.el);
      this.el = null;
    }
    this.current = null;
  }
}


// ---------------------------------------------------------------------------
// Teach-until-demonstrated flags (the persistence side of invariant 4).
// ---------------------------------------------------------------------------
// Per hint id:
//   *_done  — the player PERFORMED the taught action: never shown again.
//   *_runs  — runs ENDED without the demonstration. At GIVE_UP_RUNS the hint
//             retires either way: a once-ever flag plus an easy dismissal is
//             exactly how a hint gets permanently missed, so the hint keeps
//             its chance across runs — but not forever.
export const GIVE_UP_RUNS = 3;
// PER-CONTROL INTRODUCTIONS (owner 2026-09-16) widened the id set from the
// two in-context touches (move, portal) to every control that names itself
// at its first relevant moment. Every id here gets the same store treatment:
// retire-on-demonstration, at most once per run, give up after 3 runs.
export const HINT_IDS = [
  'move', 'portal',
  'potion-hp', 'potion-mp', 'skill-q', 'skill-w',
  'focus', 'stance', 'pilot', 'radar', 'map', 'stats',
  // '?' SUPPLEMENT (2026-09-16): the "?" affordance introduces itself too —
  // its explanation used to live only INSIDE the screen it opens (circular).
  'help',
];
const keyDone = (id) => 'hordes_hint_' + id + '_done';
const keyRuns = (id) => 'hordes_hint_' + id + '_runs';

export function makeHintStore(storage) {
  const s = storage;
  const read = (k) => { try { return s.getItem(k); } catch { return null; } };
  const write = (k, v) => { try { v === null ? s.removeItem(k) : s.setItem(k, v); } catch { /* shim */ } };
  return {
    done(id) { return read(keyDone(id)) === '1'; },
    setDone(id) { write(keyDone(id), '1'); },
    runs(id) { const v = parseInt(read(keyRuns(id)), 10); return Number.isFinite(v) ? v : 0; },
    bumpRuns(id) { write(keyRuns(id), String(this.runs(id) + 1)); },
    // REPLAY TOUR re-arms everything: the demonstration flags AND the
    // give-up counters (the tour's clearTourFlags precedent).
    reset() { for (const id of HINT_IDS) { write(keyDone(id), null); write(keyRuns(id), null); } },
  };
}
