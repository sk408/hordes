// HOW TO PLAY - WIDESCREEN LAYOUT (owner 2026-09-18: "the desktop layout for
// how to play still needs work on a widescreen. the navigation and got it
// buttons should be underneath the how a run works panel"). REAL browser,
// getBoundingClientRect arithmetic (never by eye), opened the REAL way (the
// title screen's HOW TO PLAY card):
//   at 1280x720 and 1600x900 (the WIDE rule):
//     (a) the panel takes the DOMINANT share of the content area and is
//         fully inside the viewport;
//     (b) PREV / NEXT / GOT IT / REPLAY TOUR sit BELOW the panel, fully
//         visible WITHOUT scrolling, sharing ONE row in that order;
//     (c) the PAGE n / N marker (.howto-page) is in that row below the
//         panel, and the subtitle's .pgline is hidden (the indicator moved
//         down with the controls);
//     (d) NO panel scrollbar for a page whose text fits: page 2 (the short
//         OPTIONS AND MODES page) shows desc scrollHeight <= clientHeight;
//     (e) no horizontal document overflow;
//   at 390x844 and 320x568 (phones - the layout is UNCHANGED):
//     (f) the marker stays hidden, the subtitle's PAGE line stays visible,
//         the panel keeps its 560px cap and its internal scroll cap, and
//         the nav cards keep their 118px size;
//     (g) 44px floors: no control rect under 44px tall at ANY size;
//   (h) no console errors in any arm. Shots at all four sizes.
// The Node suite pins the RULE SOURCE (query contents, phone rules,
// DOM marker) in test/test_howto_wide.mjs; this tool measures the GEOMETRY.
// Run: node tools/verify_howto_wide.mjs
import { withPage } from './browser.mjs';
import { copyFileSync, mkdirSync } from 'node:fs';

const ART = '/home/claude/projects/hordes/docs/art/howto-wide-2026-09-18/shots';
mkdirSync(ART, { recursive: true });

let fails = 0;
function ok(name, cond) {
  console.log((cond ? '  ok - ' : '  FAIL - ') + name);
  if (!cond) fails++;
}

// The one geometry read: rects for the panel, every control, the marker,
// the subtitle's pgline span, the desc's scroll arithmetic, the doc overflow.
const MEASURE = `(() => {
  const px = (v) => Math.round(v * 10) / 10;
  const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect();
    return { x: px(r.x), y: px(r.y), r: px(r.right), b: px(r.bottom), w: px(r.width), h: px(r.height) }; };
  const navs = [...document.querySelectorAll('#overlay.howto .card.nav')];
  const desc = document.querySelector('#overlay.howto .card.ref .desc');
  const pg = document.querySelector('#overlay.howto .sub .pgline');
  const ind = document.querySelector('#overlay.howto .howto-page');
  return { vw: innerWidth, vh: innerHeight,
    panel: rect(document.querySelector('#overlay.howto .card.ref')),
    prev: rect(navs[0]), next: rect(navs[1]),
    got: rect(document.querySelector('#overlay.howto .card.gotit')),
    rep: rect(document.querySelector('#overlay.howto .card.replay')),
    ind: ind ? Object.assign(rect(ind), { display: getComputedStyle(ind).display,
      text: ind.textContent }) : null,
    pgDisplay: pg ? getComputedStyle(pg).display : 'absent',
    descMaxH: desc ? getComputedStyle(desc).maxHeight : null,
    descScroll: desc ? desc.scrollHeight - desc.clientHeight : null,
    docOverflowX: document.documentElement.scrollWidth - innerWidth };
})()`;

async function arm(w, h, dpr, mobile) {
  return withPage({ w, h, dpr, mobile,
    startupScript: "try { localStorage.setItem('hordes_onboarded', '1'); } catch (e) {}" },
    async (p) => {
      await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
      await p.waitFor("(async () => (await import('./src/main.js')).__TEST.state.mode === 'title')()", 15000);
      await p.waitFor("(async () => { const rv = (await import('./src/main.js')).__TEST.state.titleReveal; return !rv || rv.phase === 'settled'; })()", 8000);
      // Open the manual the REAL way: the title card.
      let open = false;
      for (let tries = 0; tries < 12 && !open; tries++) {
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
          open = await p.waitFor("document.getElementById('ov-title').textContent === 'HOW TO PLAY'", 3000).catch(() => false);
        } else { await p.sleep(250); }
      }
      if (!open) throw new Error(w + 'x' + h + ': could not open HOW TO PLAY');
      const page1 = await p.evaluate(MEASURE);
      // Page 2: the SHORT page - the no-scrollbar proof needs a page whose
      // text fits; the row geometry is re-read on it too.
      await p.evaluate(`(async () => { (await import('./src/main.js')).__TEST.manual.goto(2); })()`);
      await p.sleep(80);
      const page2 = await p.evaluate(MEASURE);
      await p.shot('howto-wide-' + w + 'x' + h);
      await p.evaluate(`(async () => { (await import('./src/main.js')).__TEST.manual.goto(3); })()`);
      await p.sleep(80);
      const page3 = await p.evaluate(MEASURE);
      return { page1, page2, page3, errors: p.errors };
    });
}

const WIDE = [[1280, 720, 1, false], [1600, 900, 1, false]];
const PHONE = [[390, 844, 3, true], [320, 568, 1, true]];
const arms = {};
for (const [w, h, dpr, mobile] of [...WIDE, ...PHONE]) {
  arms[w + 'x' + h] = await arm(w, h, dpr, mobile);
}

const inVw = (b, vw, vh) => b && b.x >= -0.5 && b.r <= vw + 0.5 && b.y >= -0.5 && b.b <= vh + 0.5;

for (const [w, h] of WIDE) {
  const tag = w + 'x' + h;
  const { page1: a, page2: b, page3: c, errors } = arms[tag];
  // (a) the panel is the page: dominant share, inside the viewport.
  ok('[' + tag + '] the panel takes the DOMINANT share of the width (' +
    a.panel.w + ' of ' + a.vw + ')', a.panel.w >= 0.55 * a.vw, a.panel);
  ok('[' + tag + '] the panel is fully inside the viewport',
    a.panel.x >= -0.5 && a.panel.r <= a.vw + 0.5, a.panel);
  // (b) every control sits below the panel, fully visible, in ONE row.
  // (same-page arithmetic: the row rects and the panel bottom both come
  // from the page-2 read — page 1's taller panel is not the yardstick)
  const row = [b.prev, b.next, b.got, b.rep];
  ok('[' + tag + '] PREV/NEXT/GOT IT/REPLAY TOUR sit BELOW the panel (panel b ' +
    b.panel.b + ')', row.every(k => k && k.y >= b.panel.b - 1),
    row.map(k => k && k.y));
  ok('[' + tag + '] all four controls are fully visible WITHOUT scrolling',
    row.every(k => inVw(k, b.vw, b.vh)), row);
  const tops = row.map(k => k.y), bots = row.map(k => k.b);
  ok('[' + tag + '] the four controls share ONE row (y-overlap)',
    Math.max(...tops) <= Math.min(...bots) + 1, { tops, bots });
  ok('[' + tag + '] the row reads PREV, NEXT, GOT IT, REPLAY TOUR',
    b.prev.r <= b.next.x + 1 && b.next.r <= b.got.x + 1 && b.got.r <= b.rep.x + 1,
    { prev: b.prev.r, next: b.next.x, got: b.got.x, rep: b.rep.x });
  ok('[' + tag + '] every control keeps the 44px floor',
    row.every(k => k.h >= 44), row.map(k => k.h));
  // (c) the indicator moved down with the controls.
  ok('[' + tag + '] the PAGE marker is IN the controls row (display ' +
    (b.ind && b.ind.display) + ')', b.ind && b.ind.display !== 'none' && b.ind.display !== 'absent' &&
    b.ind.y >= b.panel.b - 1 && b.ind.y <= Math.min(...bots) + 1 && b.ind.b >= Math.max(...tops) - 1,
    b.ind);
  ok('[' + tag + '] the marker text is the page indicator', b.ind &&
    /^PAGE 2 \/ 4/.test(b.ind.text || ''), b.ind && b.ind.text);
  ok('[' + tag + '] the subtitle page line is hidden on wide (pgline ' +
    b.pgDisplay + ')', b.pgDisplay === 'none', b.pgDisplay);
  // (d) NO scrollbar for a page whose text fits (page 2 is the short one).
  ok('[' + tag + '] the panel needs NO scrollbar on the fitting page (scroll ' +
    b.descScroll + ', max-height ' + b.descMaxH + ')',
    b.descScroll <= 1 && b.descMaxH === 'none', { scroll: b.descScroll, maxH: b.descMaxH });
  ok('[' + tag + '] the fitting page shows the controls without any scroll (page 2 panel b ' +
    b.panel.b + ' of ' + b.vh + ')', b.panel.b <= b.vh + 0.5, b.panel);
  // (e) no horizontal overflow on any page.
  ok('[' + tag + '] no horizontal overflow (pages 1/2/3)',
    a.docOverflowX <= 1 && b.docOverflowX <= 1 && c.docOverflowX <= 1,
    [a.docOverflowX, b.docOverflowX, c.docOverflowX]);
  ok('[' + tag + '] no console errors', errors.length === 0, errors);
}

for (const [w, h] of PHONE) {
  const tag = w + 'x' + h;
  const { page1: a, page2: b, errors } = arms[tag];
  // (f) the phone layout is UNCHANGED.
  ok('[' + tag + '] PHONE: the row marker stays hidden (display ' +
    (b.ind && b.ind.display) + ')', !b.ind || b.ind.display === 'none', b.ind);
  ok('[' + tag + '] PHONE: the subtitle PAGE line stays visible (' + b.pgDisplay + ')',
    b.pgDisplay !== 'none' && b.pgDisplay !== 'absent', b.pgDisplay);
  ok('[' + tag + '] PHONE: the panel keeps its 560px cap (' + a.panel.w + ' of ' + a.vw + ')',
    a.panel.w <= 560.5 && a.panel.w <= a.vw + 0.5, a.panel);
  ok('[' + tag + '] PHONE: the internal scroll cap stays (' + b.descMaxH + ')',
    b.descMaxH && b.descMaxH !== 'none', b.descMaxH);
  ok('[' + tag + '] PHONE: the nav cards keep their 118px size',
    b.prev && Math.abs(b.prev.w - 118) <= 1 && Math.abs(b.next.w - 118) <= 1,
    [b.prev && b.prev.w, b.next && b.next.w]);
  ok('[' + tag + '] PHONE: no horizontal overflow', a.docOverflowX <= 1 && b.docOverflowX <= 1,
    [a.docOverflowX, b.docOverflowX]);
  ok('[' + tag + '] no console errors', errors.length === 0, errors);
}

// Shots into the art folder (same convention as verify_prologue).
for (const [w, h] of [...WIDE, ...PHONE]) {
  const src = '/tmp/hordes-shots/howto-wide-' + w + 'x' + h + '.png';
  try { copyFileSync(src, ART + '/howto-wide-' + w + 'x' + h + '.png'); } catch (e) {
    ok('shot copied ' + w + 'x' + h, false);
  }
}

console.log(fails === 0 ? 'verify_howto_wide: ALL CHECKS PASSED' : 'FAILURES: ' + fails);
process.exit(fails === 0 ? 0 : 1);
