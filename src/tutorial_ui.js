// HORDES — the tutorial's DOM: one small panel (a sentence, at most one button
// and the SKIP link) and up to two rings around what the sentence points at.
// The logic lives in src/tutorial.js; this file only paints and reports
// presses. Everything goes through the injected `doc`, so the headless tests
// run it against the stub DOM.
//
// Anti-misclick, the DOM half:
//   - the root and the panel body take no pointer events: a tap or drag on
//     the play field goes to the game, never to the tutorial;
//   - a button reports a press only when the pointer went DOWN on that button,
//     and passes the down time on so the logic can refuse a press that began
//     before the panel appeared or inside its guard time.

const GAP = 8;

function hit(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}
function grow(r, m) {
  return { left: r.left - m, top: r.top - m, right: r.right + m, bottom: r.bottom + m };
}

// Where the panel goes. `bounds` is the play area (the canvas rect in a run,
// the viewport on a menu), `view` the viewport, `size` the panel's box,
// `targets` the rects it points at and `avoid` other rects it must not cover
// (the touch pads). Returns { left, top, slot }. The slots are bands above and
// below the middle of the play area and, when the viewport is taller than the
// play area, the strip under it; the first one that covers neither a target
// nor an avoid rect wins. The middle of the play area is never a slot.
export function placePanel(bounds, view, size, targets = [], avoid = [], menu = false) {
  const cx = bounds.left + bounds.width / 2;
  const left = Math.max(view.left + GAP, Math.min(view.right - size.w - GAP, cx - size.w / 2));
  const at = (top, slot) => ({ left, top: Math.round(top), slot });
  const upper = at(bounds.top + bounds.height * (menu ? 0.02 : 0.16), 'upper');
  const lower = at(bounds.top + bounds.height * (menu ? 0.98 : 0.80) - size.h, 'lower');
  const below = at(bounds.bottom + GAP, 'below');
  const tcy = targets.length
    ? targets.reduce((s, r) => s + (r.top + r.bottom) / 2, 0) / targets.length
    : bounds.top;
  const targetHigh = tcy < bounds.top + bounds.height / 2;
  const order = targetHigh ? [lower, upper] : [upper, lower];
  if (below.top + size.h + GAP <= view.bottom) order.splice(targetHigh ? 0 : 1, 0, below);
  const box = (c) => ({ left: c.left, top: c.top, right: c.left + size.w, bottom: c.top + size.h });
  const clear = (c, rects) => rects.every(r => !hit(box(c), grow(r, GAP)));
  const inView = (c) => c.top >= view.top && c.top + size.h <= view.bottom;
  return order.find(c => inView(c) && clear(c, targets) && clear(c, avoid)) ||
    order.find(c => inView(c) && clear(c, targets)) || order[0];
}

export class TutorialUI {
  constructor({ doc, now, onPrimary, onSkip }) {
    this.doc = doc || globalThis.document;
    this.now = now || (() => globalThis.performance.now());
    this.onPrimary = onPrimary;
    this.onSkip = onSkip;
    this.root = null;
    this.key = '';
    this.pos = null;       // where the panel was placed for the step on show
    this.model = null;
  }

  _build() {
    const d = this.doc;
    const mk = (id, cls) => {
      const e = d.createElement('div');
      if (id) e.id = id;
      if (cls) e.className = cls;
      return e;
    };
    this.root = mk('tut-root');
    this.rings = [mk('', 'tut-ring'), mk('', 'tut-ring')];
    for (const r of this.rings) this.root.appendChild(r);
    this.panel = mk('tut-panel');
    this.textEl = mk('', 'tut-text');
    this.rowEl = mk('', 'tut-row');
    this.btnEl = this._button('tut-btn', (ms) => this.onPrimary(ms));
    this.skipEl = this._button('tut-skip', (ms) => this.onSkip(ms));
    this.rowEl.appendChild(this.btnEl);
    this.rowEl.appendChild(this.skipEl);
    this.panel.appendChild(this.textEl);
    this.panel.appendChild(this.rowEl);
    this.root.appendChild(this.panel);
    (d.body || d.documentElement).appendChild(this.root);
  }

  // A control that fires only for a press that went down on it.
  _button(cls, fire) {
    const b = this.doc.createElement('button');
    b.className = cls;
    b.type = 'button';
    let downMs = NaN;
    b.addEventListener('pointerdown', (ev) => {
      downMs = this.now();
      if (ev && ev.stopPropagation) ev.stopPropagation();
    });
    b.addEventListener('click', (ev) => {
      if (ev && ev.stopPropagation) ev.stopPropagation();
      const ms = downMs;
      downMs = NaN;
      if (Number.isFinite(ms)) fire(ms);
    });
    return b;
  }

  // Paint `model` ({ id, text, button, skip, n, of }) or hide when null.
  // `rects` are the target rects, `geo` = { bounds, view, avoid, menu }.
  render(model, rects, geo) {
    if (!model) { this.hide(); return; }
    if (!this.root) this._build();
    this.model = model;
    const key = [model.id, model.text, model.button || '', model.skip || ''].join('|');
    const stepKey = model.id + '|' + (geo.view.right - geo.view.left) + 'x' + (geo.view.bottom - geo.view.top);
    if (key !== this.key) {
      this.key = key;
      this.textEl.textContent = model.text;
      this.btnEl.textContent = model.button || '';
      this.btnEl.style.display = model.button ? '' : 'none';
      this.skipEl.textContent = model.skip || '';
      this.skipEl.style.display = model.skip ? '' : 'none';
      this.rowEl.style.display = (model.button || model.skip) ? '' : 'none';
    }
    this.root.style.display = '';
    // The panel is placed once per step (and again if the viewport changes),
    // so it forms in place and never chases a moving target.
    if (stepKey !== this.stepKey || !this.pos) {
      this.stepKey = stepKey;
      const vw = geo.view.right - geo.view.left;
      this.panel.style.maxWidth = Math.min(440, Math.round(vw - 2 * GAP)) + 'px';
      const size = { w: this.panel.offsetWidth || Math.min(440, vw - 2 * GAP), h: this.panel.offsetHeight || 64 };
      this.pos = placePanel(geo.bounds, geo.view, size, rects, geo.avoid, geo.menu);
      this.panel.style.left = Math.round(this.pos.left) + 'px';
      this.panel.style.top = Math.round(this.pos.top) + 'px';
    }
    this.rings.forEach((ring, i) => {
      const r = rects[i];
      if (!r) { ring.style.display = 'none'; return; }
      ring.style.display = '';
      ring.style.left = Math.round(r.left - 4) + 'px';
      ring.style.top = Math.round(r.top - 4) + 'px';
      ring.style.width = Math.round(r.right - r.left + 8) + 'px';
      ring.style.height = Math.round(r.bottom - r.top + 8) + 'px';
    });
  }

  hide() {
    if (this.root && this.model) this.root.style.display = 'none';
    this.model = null;
    this.key = '';
    this.stepKey = '';
    this.pos = null;
  }

  get visible() { return !!this.model; }
}
