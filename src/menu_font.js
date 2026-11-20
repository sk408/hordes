// THE MENU FONT (R5 "one pixel font for all menus").
//
// Every menu and overlay is set in Pixelify Sans (assets/fonts, SIL Open Font
// License 1.1). The canvas HUD keeps its own type: monospace painted at the
// game's 480x300 and scaled up by whole numbers.
//
// How it arrives:
// - It is asked for with the FontFace API during boot (main.js, just before
//   the frame loop starts) and nothing waits for it: the first frame is drawn
//   while it loads. Asking during boot, not later, keeps the rule that a page
//   fetches no precached file after its first frame (an old page after an
//   update would get the new release's file; test_sw_manifest G2). LOADING
//   and the tap-to-reload screen are set in plain monospace and never wait.
// - Until it is there, and for good if it fails, the menus keep today's font.
// - When it is there, <html> gets the class `px-font`. If a menu is on screen
//   and visible at that moment, the switch waits for the next screen change
//   (or for the overlay to hide), so text never jumps under the player's eyes.
//
// Why the sizes change with it: the font is drawn on a grid of 11 pixels to
// the em (a font pixel is 91 of its 1000 units). At 11 px one font pixel is
// one screen pixel, at 22 px two; any size between gives stems of mixed width
// and grey edges (measured in Chrome at device pixel ratios 1, 2 and 3). The
// bold axis is never crisp at these sizes, so the face is registered at
// weight 400 only and html.px-font turns off synthetic bold: emphasis in the
// menus comes from size and colour. So at the switch every font size the
// stylesheets declare is moved onto the grid with GRID_SIZE below (rules that
// name monospace themselves are left as they are: LOADING, the update notice,
// the touch pads), and the originals are kept so the switch can be undone.

export const MENU_FONT = {
  family: 'Pixelify Sans',
  url: 'assets/fonts/PixelifySans-latin.woff2',
  cls: 'px-font',
  weight: '400',
};

// The grid sizes, and the one rule that maps a declared size onto them.
export const GRID_PX = [11, 22, 44];
export function gridSize(px) {
  if (!(px > 0)) return px;
  if (px <= 16.5) return 11;
  if (px <= 33) return 22;
  return 44;
}

// Characters the menus show that the font does not have. Each one either has
// a replacement in the font (changed in the source, listed here for the test)
// or stays in the symbol fallback on purpose.
//   SYMBOL_FALLBACK: the card suits (the stats page lists the hand as "7♥");
//   the font has no suits and a letter would lose the meaning, so the browser
//   draws them from its symbol font. The quest chip's arrows are canvas HUD
//   text (render.js, monospace) and never reach the menu font.
export const SYMBOL_FALLBACK = {
  '♠': 'card suit (DOM: stats page hand)',
  '♥': 'card suit (DOM: stats page hand)',
  '♦': 'card suit (DOM: stats page hand)',
  '♣': 'card suit (DOM: stats page hand)',
  '▴': 'canvas HUD only (quest chip, render.js)',
  '▾': 'canvas HUD only (quest chip, render.js)',
};
export const REPLACED = {
  '‣': '›',   // the card-name bullet: a triangle bullet became a single angle quote
  '↔': '/',        // help reference: "auto <-> manual" became "auto / manual"
};

// ---- state ------------------------------------------------------------------
// status: 'idle' (not asked yet), 'loading', 'ready' (loaded, waiting to
// switch), 'on' (switched), 'failed' (today's font for this session).
const st = { status: 'idle', startedAt: -1, readyAt: -1, onAt: -1, error: null, saved: null };
export function menuFontState() { return { ...st, saved: st.saved ? st.saved.length : 0 }; }
export function menuFontOn() { return st.status === 'on'; }

// Whether the player can see a menu right now: the overlay is shown and not
// faded out (the title's art-only beat has it at opacity 0).
export function menuVisible(overlay) {
  if (!overlay || !overlay.style) return false;
  const s = overlay.style;
  if (s.display === 'none' || s.display === '') return false;
  if (s.opacity !== '' && Number(s.opacity) < 0.05) return false;
  return true;
}

// The shop's abbreviated buy line ("LV 0/5·180g") stays on one line: today's
// font shrinks it to fit the card (9 to 12 px, monospace is 0.6 em a
// character). With the menu font on it is always 11 px, the grid size and
// the smallest the menus use; the font is no wider than 0.6 em a character.
export function shopBuyPx(cardW, maxCh, fontOn) {
  if (fontOn) return 11;
  return Math.max(9, Math.min(12, Math.floor((cardW - 16) / (0.6 * maxCh))));
}

// Visit every style rule of every same-origin stylesheet (into @media blocks).
function eachRule(doc, fn) {
  const sheets = (doc && doc.styleSheets) ? [...doc.styleSheets] : [];
  const walk = (rules) => {
    for (const r of rules) {
      if (r.cssRules && !r.style) { walk([...r.cssRules]); continue; }
      if (r.style) fn(r);
      if (r.cssRules && r.cssRules.length) walk([...r.cssRules]);
    }
  };
  for (const sh of sheets) {
    let rules = null;
    try { rules = sh.cssRules; } catch { rules = null; }   // cross-origin: not ours
    if (rules) walk([...rules]);
  }
}

// Rules for the in-run DOM controls, LOADING and the update notice keep their
// sizes: they stay in monospace (index.html), beside the canvas HUD.
export const KEEP_SEL = /#touch\b|#hud\b|#boot-msg\b|#sw-update\b/;

// Move every declared px font size onto the grid; remember the originals.
export function snapSheetSizes(doc) {
  const saved = [];
  eachRule(doc, (r) => {
    const fs = r.style.getPropertyValue('font-size');
    const fam = r.style.getPropertyValue('font-family');
    if (!fs || /monospace/i.test(fam || '') || KEEP_SEL.test(r.selectorText || '')) return;
    // A plain size, or a variable's fallback ("var(--shop-buy-fs, 12px)"):
    // the code sets the variable itself on the grid (shopBuyPx), and the
    // fallback is what shows where it does not (the camp).
    const m = /^\s*([\d.]+)px\s*$/.exec(fs);
    const v = m ? null : /^(\s*var\(\s*--[\w-]+\s*,\s*)([\d.]+)px(\s*\)\s*)$/.exec(fs);
    if (!m && !v) return;
    const px = parseFloat(m ? m[1] : v[2]);
    const to = gridSize(px);
    if (to === px) return;
    const prio = r.style.getPropertyPriority('font-size');
    saved.push([r, fs, prio]);
    r.style.setProperty('font-size', m ? to + 'px' : v[1] + to + 'px' + v[3], prio);
  });
  return saved;
}
export function restoreSheetSizes(saved) {
  for (const [r, fs, prio] of saved || []) r.style.setProperty('font-size', fs, prio);
}

// Switch the menus to the font (only once it has loaded).
export function applyMenuFont(doc) {
  if (st.status !== 'ready') return false;
  st.saved = snapSheetSizes(doc);
  const root = doc && doc.documentElement;
  if (root && root.classList) root.classList.add(MENU_FONT.cls);
  st.status = 'on';
  st.onAt = nowMs();
  return true;
}
// Back to today's font (tests, and a safety valve).
export function removeMenuFont(doc) {
  if (st.status !== 'on') return false;
  restoreSheetSizes(st.saved);
  st.saved = null;
  const root = doc && doc.documentElement;
  if (root && root.classList) root.classList.remove(MENU_FONT.cls);
  st.status = 'ready';
  return true;
}

// Called at a screen change (openMenu) and once a frame: switch if the font
// is waiting and nobody is looking at a menu (or a new screen is being built).
export function maybeApplyMenuFont(doc, overlay, screenChange = false) {
  if (st.status !== 'ready') return false;
  if (!screenChange && menuVisible(overlay)) return false;
  return applyMenuFont(doc);
}

const nowMs = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

// Start loading. Called once, during boot. `env` carries the
// browser objects so the node tests can hand in fakes. Never throws.
export function loadMenuFont(env = {}) {
  if (st.status !== 'idle') return null;
  const doc = env.doc || (typeof document !== 'undefined' ? document : null);
  const FF = env.FontFace || (typeof FontFace !== 'undefined' ? FontFace : null);
  const fonts = env.fonts || (doc && doc.fonts) || null;
  const overlay = env.overlay || null;
  st.startedAt = nowMs();
  if (!doc || !FF || !fonts || typeof fonts.add !== 'function') {
    st.status = 'failed'; st.error = 'no FontFace';
    return null;
  }
  st.status = 'loading';
  let face;
  try {
    face = new FF(MENU_FONT.family, 'url(' + (env.url || MENU_FONT.url) + ')',
      { weight: MENU_FONT.weight, style: 'normal', display: 'swap' });
  } catch (e) {
    st.status = 'failed'; st.error = String(e && e.message || e);
    return null;
  }
  return Promise.resolve().then(() => face.load()).then((f) => {
    fonts.add(f || face);
    st.status = 'ready';
    st.readyAt = nowMs();
    maybeApplyMenuFont(doc, overlay, false);
    return true;
  }, (e) => {
    st.status = 'failed'; st.error = String(e && e.message || e);
    return false;
  });
}

// Tests only: back to a fresh page.
export function __resetMenuFont() {
  st.status = 'idle'; st.startedAt = -1; st.readyAt = -1; st.onAt = -1; st.error = null; st.saved = null;
}
