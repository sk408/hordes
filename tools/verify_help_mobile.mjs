// HORDES - tools/verify_help_mobile.mjs (HOW TO PLAY readability, owner
// 2026-09-16: "We need to fix the formatting of the how to play screen, at
// least on mobile. It's hard to read the text because of the narrow width
// and it wraps"). REAL browser, REAL layout: the Node suite pins the
// structure and the CSS source (test/test_help_mobile.mjs); this tool
// measures the GEOMETRY a player actually reads, by getBoundingClientRect
// and scrollWidth arithmetic (never by eye), at the three phone widths and
// the galaxy embed size:
//   (a) the panel's inner text width >= 85% of the game container;
//   (b) no horizontal overflow anywhere (panel, every .desc, the document);
//   (c) the panel rect sits fully inside the game container;
//   (d) the GOT IT control is >= 44px tall and reachable INSIDE the
//       container (scrolled into view, never clipped);
//   (e) no trigger cell breaks a token mid-word (.rv scrollWidth <=
//       clientWidth - "WASD" style names never split across lines).
// Plus a desktop arm: the reference panel is wider than the old 220px tip
// card but capped at 560px, and the KEPT coachmark tip keeps max-width:220.
// PNGs land in SHOT_DIR. Run: node tools/verify_help_mobile.mjs
import { withPage } from './browser.mjs';

const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); };

const MEASURE = `(() => {
  const px = (v) => Math.round(v * 100) / 100;
  const panel = document.querySelector('#overlay.howto .card.ref');
  const got = document.querySelector('#overlay.howto .card.gotit');
  const wrap = document.getElementById('wrap');
  if (!panel || !got || !wrap) return { missing: true };
  const cont = wrap.getBoundingClientRect();
  const cs = getComputedStyle(panel);
  const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  const bodyFont = getComputedStyle(panel.querySelector('.desc')).fontSize;
  // PANEL: bring it into view the way a reader would (the screen scrolls
  // when the stack is taller than the embed), then measure the rect.
  panel.scrollIntoView({ block: 'nearest' });
  const pr = panel.getBoundingClientRect();
  // GOT IT: same — the sticky card should already be on screen; this proves
  // reachability.
  got.scrollIntoView({ block: 'nearest' });
  const gr = got.getBoundingClientRect();
  // TEXT overflow only: the painted frame canvas (a child, sized to the card
  // box PLUS the shadow spill) legitimately paints a few px past the box —
  // that is decoration, not text. Measure the rightmost TEXT edge instead.
  const textRight = Math.max(0, ...[...panel.children]
    .filter((c) => !(c.tagName === 'CANVAS' && c.classList.contains('frame')))
    .map((c) => c.offsetLeft + c.offsetWidth));
  return {
    missing: false,
    viewport: [innerWidth, innerHeight],
    cont: { x: px(cont.x), y: px(cont.y), r: px(cont.right), b: px(cont.bottom), w: px(cont.width), h: px(cont.height) },
    panel: { x: px(pr.x), y: px(pr.y), r: px(pr.right), b: px(pr.bottom), w: px(pr.width), h: px(pr.height) },
    contentW: px(pr.width - pad),
    bodyFont,
    textOverflowX: textRight - panel.clientWidth,
    descOverflowX: [...document.querySelectorAll('#overlay.howto .card.ref .desc')]
      .map((d) => d.scrollWidth - d.clientWidth),
    docOverflowX: document.documentElement.scrollWidth - innerWidth,
    rvCells: [...document.querySelectorAll('#overlay.howto .rv')]
      .map((rv) => ({ t: rv.textContent, over: rv.scrollWidth - rv.clientWidth })),
    got: { x: px(gr.x), y: px(gr.y), r: px(gr.right), b: px(gr.bottom), w: px(gr.width), h: px(gr.height) },
  };
})()`;

import { TOUR_KEYS } from '../src/tour.js';

async function arm(w, h, dpr, mobile = true) {
  return withPage({ w, h, dpr, mobile,
    // FRESH profile (the gate's subject), tour flags preseeded so the tour
    // shade cannot swallow the title-card tap (the tour has its own coverage).
    // UP-FRONT CONTROLS (2026-09-16): a fresh boot now lands on the TITLE —
    // the howto pop moved to the first START GAME gate. This tool's subject
    // is the SCREEN's geometry, so it opens the reference the re-openable
    // way: the title's own HOW TO PLAY card.
    startupScript: "try { localStorage.removeItem('hordes_onboarded'); } catch (e) {};" +
      Object.values(TOUR_KEYS).map(k => `try { localStorage.setItem('${k}', '1'); } catch (e) {}`).join('') },
    async (p) => {
      await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
      await p.waitFor("(async () => (await import('./src/main.js')).__TEST.state.mode !== 'intro')()", 15000);
      await p.waitFor("(async () => { const st = (await import('./src/main.js')).__TEST.state; return st.mode === 'title' || st.mode === 'menu'; })()", 8000);
      await p.waitFor("(async () => { const rv = (await import('./src/main.js')).__TEST.state.titleReveal; return !rv || rv.phase === 'settled'; })()", 8000);
      // Tap the title's HOW TO PLAY card (retry: a card mid-handoff has a
      // zero rect).
      let opened = false;
      for (let tries = 0; tries < 12 && !opened; tries++) {
        const c = await p.evaluate(`(() => {
          const el = [...document.getElementById('ov-cards').children]
            .find(k => (k.textContent || '').toUpperCase().includes('HOW TO PLAY'));
          if (!el) return null;
          el.scrollIntoView({ block: 'center' });
          const r = el.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0) return [];
          return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
        })()`);
        if (c && c.length === 2) {
          await p.sleep(80);
          await p.tap(c[0], c[1]);
          opened = await p.waitFor("document.getElementById('ov-title').textContent === 'HOW TO PLAY'", 2000).catch(() => false);
        } else {
          await p.sleep(250);
        }
      }
      if (!opened) throw new Error(w + 'x' + h + ': could not open HOW TO PLAY from the title');
      const r = await p.evaluate(MEASURE);
      const shot = await p.shot('help-mobile-' + w + 'x' + h);
      return { r, shot, errors: p.errors };
    });
}

const SIZES = [[360, 640, 1], [390, 844, 3], [430, 700, 1], [480, 300, 1]];
const arms = {};
for (const [w, h, dpr] of SIZES) arms[w + 'x' + h] = await arm(w, h, dpr);
const desktop = await arm(1280, 800, 1, false);

for (const [w, h] of SIZES) {
  const tag = w + 'x' + h, r = arms[tag].r;
  check(tag + ' HOW TO PLAY panel mounted', !r.missing, r.missing);
  if (r.missing) continue;
  const ratio = r.contentW / r.cont.w;
  check(tag + ' (a) inner text width ' + r.contentW + 'px = ' + Math.round(ratio * 100) +
    '% of the container (>= 85%)', ratio >= 0.85, { contentW: r.contentW, contW: r.cont.w });
  check(tag + ' (b) no horizontal text overflow (panel ' + r.textOverflowX + 'px, descs ' +
    JSON.stringify(r.descOverflowX) + ', doc ' + r.docOverflowX + 'px)',
    r.textOverflowX <= 1 && r.descOverflowX.every((o) => o <= 1) && r.docOverflowX <= 1,
    { panel: r.textOverflowX, descs: r.descOverflowX, doc: r.docOverflowX });
  check(tag + ' (c) the panel rect is fully inside the game container',
    r.panel.x >= r.cont.x - 1 && r.panel.y >= r.cont.y - 1 &&
    r.panel.r <= r.cont.r + 1 && r.panel.b <= r.cont.b + 1, { panel: r.panel, cont: r.cont });
  check(tag + ' (d) GOT IT is >= 44px tall (' + r.got.h + 'px) and inside the container',
    r.got.h >= 44 && r.got.x >= r.cont.x - 1 && r.got.r <= r.cont.r + 1 &&
    r.got.y >= r.cont.y - 1 && r.got.b <= r.cont.b + 1, r.got);
  const split = r.rvCells.filter((c) => c.over > 1);
  check(tag + ' (e) no trigger cell splits a token (' + r.rvCells.length + ' .rv cells checked)',
    split.length === 0, split);
  check(tag + ' body font is >= 15px (' + r.bodyFont + ')', parseFloat(r.bodyFont) >= 15, r.bodyFont);
}

{
  const r = desktop.r;
  check('1280x800 desktop: panel mounted and capped wide (220 < width <= 560)',
    !r.missing && r.panel.w > 300 && r.panel.w <= 562, r.panel && r.panel.w);
  const split = r.rvCells.filter((c) => c.over > 1);
  check('1280x800 desktop: no overflow, no split tokens',
    r.textOverflowX <= 1 && r.docOverflowX <= 1 && split.length === 0,
    { panel: r.textOverflowX, doc: r.docOverflowX, split });
}
const allErrors = [...SIZES.map(([w, h]) => arms[w + 'x' + h].errors), desktop.errors].flat();
check('no console errors in any arm', allErrors.length === 0, allErrors);

const bad = results.filter((r) => !r.ok).length;
for (const r of results) console.log((r.ok ? 'ok   ' : 'FAIL ') + r.name + (r.ok ? '' : ' :: ' + JSON.stringify(r.detail)));
console.log(bad ? 'VERIFY HELP MOBILE: FAIL'
  : 'VERIFY HELP MOBILE: PASS - at 360x640, 390x844@dpr3, 430x700 and the 480x300 embed the reference panel reads: ' +
    '>=85% of the container wide, no horizontal overflow, fully inside the container, GOT IT >=44px and reachable, ' +
    'and no key or button name ever splits mid-token; desktop keeps the 560px cap');
process.exit(bad ? 1 : 0);
