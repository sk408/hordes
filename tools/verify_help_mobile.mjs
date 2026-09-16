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
//
// MANUAL v2 (owner 2026-09-16, portrait phone: "the card doesn't show on the
// screen. It's cut off"): every page of the paginated manual is measured at
// 320x568 / 360x800 / 568x320 AND the original sizes, each page must fit the
// VIEWPORT horizontally (the letterboxed container may be WIDER than the
// phone — the old clamp was container-only and the card sat past the right
// edge), and an IN-RUN arm measures the live hint strip: fully inside the
// viewport, no mid-sentence wrap, and clear of the projected canvas HUD
// readout block (native (0,0)-(200,52) = the HP/MP/XP/GOLD bars).
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
      // MANUAL v2: measure EVERY page of the paginated manual (page 1 is up
      // on open; 2-4 through the real page seam).
      const pages = [await p.evaluate(MEASURE)];
      for (let pg = 2; pg <= 4; pg++) {
        await p.evaluate(`(async () => { const m = await import('./src/main.js'); m.__TEST.manual.goto(${pg}); })()`);
        await p.sleep(60);
        pages.push(await p.evaluate(MEASURE));
      }
      const shot = await p.shot('help-mobile-' + w + 'x' + h);
      return { pages, errors: p.errors };
    });
}

// MANUAL v2 IN-RUN ARM: a returning player (onboarded=1) starts a run, the
// live hint strip is shown the real way, and the manual is opened through the
// in-run settings door — the strip must fit the viewport, never wrap a line
// mid-sentence, and never sit on the projected canvas HUD bars; the manual
// panel must fit the viewport horizontally.
async function armRun(w, h, dpr, mobile = true) {
  return withPage({ w, h, dpr, mobile,
    startupScript: "try { localStorage.setItem('hordes_onboarded', '1'); } catch (e) {};" +
      Object.values(TOUR_KEYS).map(k => `try { localStorage.setItem('${k}', '1'); } catch (e) {}`).join('') },
    async (p) => {
      await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
      await p.waitFor("(async () => (await import('./src/main.js')).__TEST.state.mode === 'title')()", 15000);
      await p.waitFor("(async () => { const rv = (await import('./src/main.js')).__TEST.state.titleReveal; return !rv || rv.phase === 'settled'; })()", 8000);
      // START GAME (a returning player goes straight into the run).
      let playing = false;
      for (let tries = 0; tries < 12 && !playing; tries++) {
        const c = await p.evaluate(`(() => {
          const el = [...document.getElementById('ov-cards').children]
            .find(k => (k.textContent || '').toUpperCase().includes('START GAME'));
          if (!el) return null;
          const r = el.getBoundingClientRect();
          if (r.width <= 0) return [];
          return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
        })()`);
        if (c && c.length === 2) {
          await p.sleep(80);
          await p.tap(c[0], c[1]);
          playing = await p.waitFor("(async () => (await import('./src/main.js')).__TEST.state.mode === 'playing')()", 4000).catch(() => false);
        } else {
          await p.sleep(250);
        }
      }
      if (!playing) throw new Error(w + 'x' + h + ': could not start the run');
      // Show the strip the real way, let the live loop tick it once.
      await p.evaluate(`(async () => {
        const m = await import('./src/main.js');
        m.__TEST.onboarding.strip.show('map', 'MAP: open the world map (the fight keeps running)');
      })()`);
      await p.sleep(250);
      const strip = await p.evaluate(`(() => {
        const el = document.getElementById('hint-strip');
        if (!el) return { missing: true };
        const r = el.getBoundingClientRect();
        const cv = document.getElementById('game');
        const cr = cv.getBoundingClientRect();
        // The canvas HUD readout block: native (0,0)-(200,52) of a 480x300
        // view, projected to screen coords (the same seam as canvasRegion).
        const hud = {
          x: cr.x + (200 / 480) * cr.width, y: cr.y + (52 / 300) * cr.height,
        };
        const px = (v) => Math.round(v * 100) / 100;
        return {
          missing: false, vw: innerWidth, vh: innerHeight,
          x: px(r.x), y: px(r.y), r: px(r.right), b: px(r.bottom), w: px(r.width), h: px(r.height),
          wrapX: el.scrollWidth - el.clientWidth,
          hud: { x: px(hud.x), y: px(hud.y) },
          touchShown: (() => { const t = document.getElementById('touch'); return t && getComputedStyle(t).display !== 'none'; })(),
        };
      })()`);
      const stripShot = await p.shot('help-run-strip-' + w + 'x' + h);
      // POTION ICONS (owner 2026-09-16): the vial must sit inside its button,
      // clear of the counter badge and leave the HP/MP label readable — at
      // the smallest supported sizes.
      const icons = await p.evaluate(`(() => {
        const out = [];
        for (const [act, name] of [['h', 'HP'], ['n', 'MP']]) {
          const btn = document.querySelector('#touch button[data-act="' + act + '"]');
          const ic = btn && btn.querySelector('.potion');
          const badge = btn && btn.querySelector('.badge');
          if (!btn || !ic || !badge) { out.push({ act, missing: true }); continue; }
          const px = (v) => Math.round(v * 100) / 100;
          const b = btn.getBoundingClientRect(), i = ic.getBoundingClientRect(), g = badge.getBoundingClientRect();
          const box = (r) => ({ x: r.x, y: r.y, r: r.right, b: r.bottom });
          const bb = box(b), ib = box(i), gb = box(g);
          const overlap = (r1, r2) => r1.x < r2.r && r1.r > r2.x && r1.y < r2.b && r1.b > r2.y;
          out.push({
            act, missing: false, hasName: (btn.textContent || '').includes(name),
            inside: ib.x >= bb.x - 0.5 && ib.y >= bb.y - 0.5 && ib.r <= bb.r + 0.5 && ib.b <= bb.b + 0.5,
            w: px(i.width), h: px(i.height),
            hitsBadge: overlap(ib, gb),
            badgeReadable: g.height >= 10,
          });
        }
        return out;
      })()`);
      // The in-run manual door: settings -> HOW TO PLAY, then measure.
      await p.evaluate(`(async () => { const m = await import('./src/main.js'); m.__TEST.openSettings(); })()`);
      let refOpen = false;
      for (let tries = 0; tries < 8 && !refOpen; tries++) {
        const c = await p.evaluate(`(() => {
          const el = [...document.getElementById('ov-cards').children]
            .find(k => (k.textContent || '').toUpperCase().includes('HOW TO PLAY'));
          if (!el) return null;
          el.scrollIntoView({ block: 'center' });
          const r = el.getBoundingClientRect();
          if (r.width <= 0) return [];
          return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
        })()`);
        if (c && c.length === 2) {
          await p.sleep(80);
          await p.tap(c[0], c[1]);
          refOpen = await p.waitFor("document.getElementById('ov-title').textContent === 'HOW TO PLAY'", 2000).catch(() => false);
        } else {
          await p.sleep(250);
        }
      }
      if (!refOpen) throw new Error(w + 'x' + h + ': could not open HOW TO PLAY in-run');
      const panel = await p.evaluate(MEASURE);
      const panelShot = await p.shot('help-run-' + w + 'x' + h);
      return { strip, icons, panel, errors: p.errors };
    });
}

const SIZES = [[320, 568, 1], [360, 640, 1], [360, 800, 1], [390, 844, 3], [430, 700, 1], [480, 300, 1], [568, 320, 1]];
const arms = {};
for (const [w, h, dpr] of SIZES) arms[w + 'x' + h] = await arm(w, h, dpr);
const desktop = await arm(1280, 800, 1, false);
// MANUAL v2 in-run arm: the three owner-fault geometries live mid-run too.
const RUN_SIZES = [[320, 568, 1], [360, 800, 1], [568, 320, 1]];
const runArms = {};
for (const [w, h, dpr] of RUN_SIZES) runArms[w + 'x' + h] = await armRun(w, h, dpr);

for (const [w, h] of SIZES) {
  const tag = w + 'x' + h;
  for (let pg = 1; pg <= 4; pg++) {
    const r = arms[tag].pages[pg - 1];
    const ptag = tag + ' p' + pg;
    check(ptag + ' HOW TO PLAY panel mounted', !r.missing, r.missing);
    if (r.missing) continue;
    const ratio = r.contentW / r.cont.w;
    check(ptag + ' (a) inner text width ' + r.contentW + 'px = ' + Math.round(ratio * 100) +
      '% of the container (>= 85%)', ratio >= 0.85, { contentW: r.contentW, contW: r.cont.w });
    check(ptag + ' (b) no horizontal text overflow (panel ' + r.textOverflowX + 'px, descs ' +
      JSON.stringify(r.descOverflowX) + ', doc ' + r.docOverflowX + 'px)',
      r.textOverflowX <= 1 && r.descOverflowX.every((o) => o <= 1) && r.docOverflowX <= 1,
      { panel: r.textOverflowX, descs: r.descOverflowX, doc: r.docOverflowX });
    check(ptag + ' (c) the panel rect is fully inside the game container',
      r.panel.x >= r.cont.x - 1 && r.panel.y >= r.cont.y - 1 &&
      r.panel.r <= r.cont.r + 1 && r.panel.b <= r.cont.b + 1, { panel: r.panel, cont: r.cont });
    // (f) MANUAL v2: HORIZONTAL viewport fit — the letterboxed container can
    // be WIDER than a narrow phone, so "inside the container" alone let the
    // owner's card sit past the right edge. The card must be on the SCREEN.
    check(ptag + ' (f) the panel fits the VIEWPORT horizontally (owner: cut off)',
      r.panel.x >= -0.5 && r.panel.r <= r.viewport[0] + 0.5, { panel: r.panel, vw: r.viewport[0] });
    check(ptag + ' (f2) GOT IT fits the VIEWPORT horizontally',
      r.got.x >= -0.5 && r.got.r <= r.viewport[0] + 0.5, { got: r.got, vw: r.viewport[0] });
    check(ptag + ' (d) GOT IT is >= 44px tall (' + r.got.h + 'px) and inside the container',
      r.got.h >= 44 && r.got.x >= r.cont.x - 1 && r.got.r <= r.cont.r + 1 &&
      r.got.y >= r.cont.y - 1 && r.got.b <= r.cont.b + 1, r.got);
    // (g) MANUAL v2: after scrollIntoView, GOT IT is fully on the screen
    // vertically too (reachable, never past the fold).
    check(ptag + ' (g) GOT IT is reachable inside the viewport (top ' + r.got.y +
      ', bottom ' + r.got.b + ' of ' + r.viewport[1] + ')',
      r.got.y >= -0.5 && r.got.b <= r.viewport[1] + 0.5, r.got);
    const split = r.rvCells.filter((c) => c.over > 1);
    check(ptag + ' (e) no trigger cell splits a token (' + r.rvCells.length + ' .rv cells checked)',
      split.length === 0, split);
    check(ptag + ' body font is >= 15px (' + r.bodyFont + ')', parseFloat(r.bodyFont) >= 15, r.bodyFont);
  }
}

{
  const r = desktop.pages[0];
  check('1280x800 desktop: panel mounted and capped wide (220 < width <= 560)',
    !r.missing && r.panel.w > 300 && r.panel.w <= 562, r.panel && r.panel.w);
  const split = r.rvCells.filter((c) => c.over > 1);
  check('1280x800 desktop: no overflow, no split tokens',
    r.textOverflowX <= 1 && r.docOverflowX <= 1 && split.length === 0,
    { panel: r.textOverflowX, doc: r.docOverflowX, split });
}

// ---- MANUAL v2: the in-run geometries (strip + panel) at the owner sizes ----
for (const [w, h] of RUN_SIZES) {
  const tag = w + 'x' + h, a = runArms[tag], sp = a.strip;
  check(tag + ' in-run: the hint strip mounted', !sp.missing, sp.missing);
  if (!sp.missing) {
    // The strip sits fully inside the viewport (owner: "text runs past the
    // right edge"), never wraps mid-sentence, and clears the HUD bars.
    check(tag + ' in-run: the strip fits the viewport (x ' + sp.x + '..' + sp.r +
      ' of ' + sp.vw + ', y ' + sp.y + '..' + sp.b + ' of ' + sp.vh + ')',
      sp.x >= -0.5 && sp.r <= sp.vw + 0.5 && sp.y >= -0.5 && sp.b <= sp.vh + 0.5,
      { strip: sp, vw: sp.vw, vh: sp.vh });
    check(tag + ' in-run: the strip never wraps mid-sentence (scrollWidth-clientWidth=' +
      sp.wrapX + ')', sp.wrapX <= 1, sp.wrapX);
    // HUD overlap (owner: "overlaps HUD bars (HP/MP/XP/GOLD)"): the strip's
    // box must clear the projected native (0,0)-(200,52) readout block. The
    // strip yields the top row when it would sit on the bars.
    const clear = sp.b <= sp.hud.y + 1 || sp.y >= sp.hud.y - 1;
    check(tag + ' in-run: the strip clears the HUD readout block (owner: overlaps the bars)',
      clear, { strip: { y: sp.y, b: sp.b }, hudBottom: sp.hud.y });
  }
  // POTION ICONS: the vial sits inside its button, never hits the counter,
  // and the HP/MP label survives.
  for (const ic of (a.icons || [])) {
    check(tag + ' potion icon ' + ic.act.toUpperCase() + ': mounted inside the button, ' +
      ic.w + 'x' + ic.h + 'px, clear of the badge, label present',
      !ic.missing && ic.inside && !ic.hitsBadge && ic.hasName && ic.w >= 10 && ic.h >= 14, ic);
  }
  const r = a.panel;
  check(tag + ' in-run: the manual panel fits the VIEWPORT horizontally',
    !r.missing && r.panel.x >= -0.5 && r.panel.r <= r.viewport[0] + 0.5,
    r.missing ? r.missing : { panel: r.panel, vw: r.viewport[0] });
}
const allErrors = [...SIZES.map(([w, h]) => arms[w + 'x' + h].errors),
  ...RUN_SIZES.map(([w, h]) => runArms[w + 'x' + h].errors), desktop.errors].flat();
check('no console errors in any arm', allErrors.length === 0, allErrors);

const bad = results.filter((r) => !r.ok).length;
for (const r of results) console.log((r.ok ? 'ok   ' : 'FAIL ') + r.name + (r.ok ? '' : ' :: ' + JSON.stringify(r.detail)));
console.log(bad ? 'VERIFY HELP MOBILE: FAIL'
  : 'VERIFY HELP MOBILE: PASS - every manual page at 320x568, 360x640, 360x800, 390x844@dpr3, ' +
    '430x700, 480x300 and 568x320: >=85% of the container wide, no horizontal overflow, fully ' +
    'inside container AND viewport, GOT IT >=44px and reachable, no token splits; in-run at ' +
    '320x568 / 360x800 / 568x320 the hint strip fits the viewport, never wraps mid-sentence and ' +
    'clears the HUD bars; desktop keeps the 560px cap');
process.exit(bad ? 1 : 0);
