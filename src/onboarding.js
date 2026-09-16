// HORDES — ONBOARDING REWORK (owner-approved 2026-09-16).
//
// The 25-card tour is replaced by 3 IN-CONTEXT touches + OBJECT TAGS, in
// answer to the galaxy.click feedback ("tons of information thrown at you
// without context", "skipped like 8 tutorial blurbs because I was moving
// manually"). This module is the ENGINE for the new layer; main.js owns the
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
//   6. No emojis anywhere (owner rule) — the off-screen arrow is ASCII.
//
// Object tags (chest / portal / arch / shrine) name the thing the player is
// already looking at: a small floating label anchored to the OBJECT's screen
// position, plus an ASCII edge arrow when the object is off-screen.

// Visible lifetime of a hint strip (spec: "auto-fade after ~5-6s").
export const HINT_FADE_S = 5.5;
// A tag lingers a beat longer than a hint — it rides an object the player
// may still be walking toward.
export const TAG_FADE_S = 6;

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
// Object tags: chest / portal / arch / shrine, anchored to the object.
// ---------------------------------------------------------------------------
export class ObjectTags {
  // view: () => the canvas's CSS rect (the visible world). A tag whose
  // object is OUTSIDE that rect clamps to the edge and carries an ASCII
  // arrow pointing at it; a tag inside sits just above the object.
  constructor({ anchor, view, mount, doc } = {}) {
    this.doc = doc || globalThis.document;
    this.anchor = anchor;
    this.view = view;
    this.mount = mount || (this.doc && this.doc.body);
    this.tags = new Map();  // kind -> { label, locate, life, el }
    // DISPLAY BUG 2026-09-16 (owner: "only the movement one displays"): this
    // layer had TWO invisible failure modes — a locate() throw was swallowed
    // by a bare catch (silent unmount), and a non-finite placement wrote
    // style.left='NaNpx', which a real browser IGNORES: the element falls to
    // its static position below the fold and overflow:hidden clips it —
    // mounted but invisible, the exact reported symptom. Both are COUNTED
    // here, never swallowed; a healthy run asserts zero (test_onboarding C).
    this.failures = { locate: 0, place: 0 };
  }

  // locate: () => { left, top } CSS px (the object's screen point), or null
  // when the object is gone (the tag leaves with it).
  show(kind, label, locate) {
    this.tags.set(kind, { label, locate, life: TAG_FADE_S, el: null });
  }

  active(kind) { return this.tags.has(kind); }

  clear() {
    for (const t of this.tags.values()) this._unmount(t);
    this.tags.clear();
  }

  update(dt) {
    for (const [kind, t] of [...this.tags]) {
      let at = null;
      let threw = false;
      try { at = t.locate(); } catch { threw = true; }
      if (threw) this.failures.locate++;   // visible, never a silent swallow
      t.life -= dt;
      if (!at || t.life <= 0) {
        this._unmount(t);
        this.tags.delete(kind);
        continue;
      }
      // NaN-safe placement: never write a non-finite left/top (the browser
      // drops 'NaNpx' and the tag renders below the fold, clipped). Count it,
      // skip the frame — the tag stays armed and its life keeps burning.
      if (!Number.isFinite(at.left) || !Number.isFinite(at.top)) {
        this.failures.place++;
        continue;
      }
      if (!t.el) this._mount(kind, t);
      this._place(t, at);
    }
  }

  _mount(kind, t) {
    const el = this.doc.createElement('div');
    el.id = 'tag-' + kind;
    if (el.style && el.style.cssText !== undefined) {
      // pointer-events:none — a tag is a label, never a button.
      el.style.cssText =
        'position:absolute;pointer-events:none;z-index:59;' +
        'padding:2px 6px;font-size:10px;letter-spacing:1px;color:#ffe07a;' +
        'background:rgba(6,6,12,0.75);border:1px solid #4a4a5c;';
    }
    if (this.mount && this.mount.appendChild) this.mount.appendChild(el);
    t.el = el;
  }

  _place(t, at) {
    let vRect;
    try { vRect = this.view(); } catch { vRect = null; }
    if (!vRect || !t.el) return;
    let x = at.left, y = at.top, arrow = '';
    const inL = vRect.left + 6, inR = vRect.right - 6;
    const inT = vRect.top + 6, inB = vRect.bottom - 6;
    if (x < vRect.left || x > vRect.right || y < vRect.top || y > vRect.bottom) {
      // Off-screen: clamp to the edge and point the way (ASCII — no emojis).
      const cx = Math.max(inL, Math.min(inR, x));
      const cy = Math.max(inT, Math.min(inB, y));
      const dx = x - cx, dy = y - cy;
      arrow = Math.abs(dx) >= Math.abs(dy)
        ? (dx > 0 ? '> ' : '< ')
        : (dy > 0 ? 'v ' : '^ ');
      x = cx; y = cy;
    } else {
      y = y - 14;   // sit just above the object
    }
    // Clamp inside the game container (never overlap the HUD chrome edges).
    let cRect;
    try { cRect = this.anchor(); } catch { cRect = null; }
    if (cRect) {
      x = Math.max(cRect.left + 4, Math.min(cRect.right - 40, x));
      y = Math.max(cRect.top + 4, Math.min(cRect.bottom - 16, y));
    }
    t.el.textContent = arrow + t.label;
    if (t.el.style) { t.el.style.left = x + 'px'; t.el.style.top = y + 'px'; }
  }

  _unmount(t) {
    if (t.el) {
      if (t.el.remove) t.el.remove();
      else if (t.el.parentNode) t.el.parentNode.removeChild(t.el);
      t.el = null;
    }
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
export const HINT_IDS = ['move', 'portal'];
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
