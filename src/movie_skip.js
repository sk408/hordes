// HORDES - the one skip rule every movie uses.
//
// The intro, the portal movie, the death movie and the escape chase all skip
// the same way. Import this module from any new movie; do not write a second
// skip rule.
//
// THE RULE
//   1. A press in the first SKIP_GUARD_S seconds of a movie is ignored. A
//      movie often starts while the player is still steering and firing, so a
//      key or tap meant for the fight must not end it.
//   2. After that, the first press (any key, a click or a tap) only shows the
//      SKIP prompt, for SKIP_ASK_S seconds.
//   3. While the prompt is up, a press that means it skips: a skip key (ESC,
//      ENTER or SPACE) or a click or tap on the SKIP button.
//   4. Any other press just shows the prompt again. A key held down (an
//      auto-repeat) is not a press: the caller drops ev.repeat.
// Unattended and background runs never press anything: the caller ends the
// movie by itself, as before.
//
// HOW A MOVIE USES IT
//   const skip = createSkip();            // when the movie starts
//   tickSkip(skip, dt);                    // every frame, real seconds
//   pressSkip(skip, tSeconds, confirm, tap) // on a key, click or tap; true: skip now
//   drawSkip(g, skip, { idle })            // last thing drawn in the frame
// `confirm` is isSkipKey(key) for a key, skipHit(vx, vy) for a pointer.
// The state is a plain object { ask, askTap }, so a movie may keep it on its
// own state object (the escape does).

export const SKIP_GUARD_S = 0.4;   // a press this soon after the start is ignored
export const SKIP_ASK_S = 2.5;     // how long the prompt stays up after a press

// The view is 480 x 300 (CONFIG.VIEW_W/H). The button sits top right; the box
// a tap may land in is wider, so a thumb finds it.
const W = 480, H = 300;
export const SKIP_RECT = { x: W - 50, y: 2, w: 44, h: 12 };
export const SKIP_HIT = { x: W - 112, y: 0, w: 112, h: 46 };

const GOLD = '#ffd75e', DARK = '#06060b';

export function createSkip() { return { ask: 0, askTap: false }; }

// Is this key (KeyboardEvent.key) a skip key?
export function isSkipKey(key) {
  const k = String(key || '').toLowerCase();
  return k === 'escape' || k === 'enter' || k === ' ';
}

// Count the prompt down. `dt` in real seconds.
export function tickSkip(s, dt) {
  if (s && s.ask > 0) s.ask = Math.max(0, s.ask - Math.max(0, Number(dt) || 0));
}

// One press at movie time `t` (seconds). Returns true when the movie should
// end now. `tap`: the press came from a pointer, so the prompt says where to
// press: true for a finger (or a pointer of unknown kind), 'mouse' for a
// mouse click, which gets the desktop wording.
export function pressSkip(s, t, confirm = false, tap = false) {
  if (!s || !(t >= SKIP_GUARD_S)) return false;
  if (confirm && s.ask > 0) { s.ask = 0; return true; }
  s.ask = SKIP_ASK_S;
  s.askTap = tap === 'mouse' ? 'mouse' : !!tap;
  return false;
}

// The words under the button: what the second press must be.
export function skipPrompt(askTap) {
  if (askTap === 'mouse') return 'click SKIP or press ESC';
  return askTap ? 'tap SKIP to skip' : 'ESC or ENTER to skip';
}

// The size of the button, its label and the prompt for a movie with no film
// bar (the intro, portal and death movies), from `scale`, the CSS pixels one
// view pixel takes on screen. The text is at least 12 view px and at least
// 12 CSS px (a phone held upright shows the view at about 0.8), capped at 20.
export function skipLayout(scale = 1) {
  const sc = Number(scale) > 0 ? Number(scale) : 1;
  const font = Math.max(12, Math.min(20, Math.ceil(12 / sc)));
  const w = Math.round(font * 5), h = Math.round(font * 1.5);
  return { font, strip: Math.round(font * 1.65), rect: { x: W - w - 6, y: 2, w, h } };
}

// Is (vx, vy), in view pixels, on the SKIP button?
export function skipHit(vx, vy) {
  const r = SKIP_HIT;
  return vx >= r.x && vx < r.x + r.w && vy >= r.y && vy < r.y + r.h;
}

// Draw the button and the prompt. With `idle` the button is outlined even
// before a press (the escape's film bar, which fixes its size: SKIP_RECT);
// without it nothing shows until the first press, and the button and the
// prompt are sized by skipLayout(opts.scale) so a phone can read them.
export function drawSkip(g, s, opts = {}) {
  const asking = !!(s && s.ask > 0);
  if (!asking && !opts.idle) return;
  const lay = opts.idle ? null : skipLayout(opts.scale);
  const r = lay ? lay.rect : SKIP_RECT;
  g.font = 'bold ' + (lay ? lay.font : 9) + 'px monospace';
  g.textBaseline = 'middle';
  if (asking) {
    g.fillStyle = GOLD;
    g.fillRect(r.x, r.y, r.w, r.h);
  } else {
    g.fillStyle = '#3a3a4c';
    g.fillRect(r.x, r.y, r.w, 1); g.fillRect(r.x, r.y + r.h - 1, r.w, 1);
    g.fillRect(r.x, r.y, 1, r.h); g.fillRect(r.x + r.w - 1, r.y, 1, r.h);
  }
  g.textAlign = 'center';
  g.fillStyle = asking ? DARK : '#b8b8cc';
  g.fillText('SKIP', r.x + r.w / 2, r.y + r.h / 2 + 0.5);
  // The prompt says what the second press must be.
  if (asking) {
    const strip = lay ? lay.strip : 16;
    if (lay) {   // no film bar under it: give it a strip to sit on
      g.fillStyle = DARK;
      g.fillRect(0, H - strip, W, strip);
    }
    g.fillStyle = '#e8e8f0';
    g.font = 'bold ' + (lay ? lay.font : 8) + 'px monospace';
    g.fillText(skipPrompt(s.askTap), W / 2, H - strip / 2 + 0.5);
  }
  g.textAlign = 'left';
}
