// HORDES - tools/verify_help_fit.mjs (HELP POPUPS MUST FIT THE MOBILE
// VIEWPORT, owner 2026-09-16: "The ? Tap works as intended now but the
// popups are too wide for mobile screen."). REAL browser, REAL taps, touch
// layer LIVE (withPage's mobile mode enables CDP touch emulation, so the
// page derives #touch.on itself — no class is forced by this tool).
//
// The proof, by getBoundingClientRect arithmetic (never by eye), at ALL
// FOUR task sizes (320x568, 360x800, 390x844 @dpr3, 568x320) with a REAL
// run playing:
//   (a) the CONTROL EXPLAINER (#help-tip) — probed the REAL way, by tapping
//       the STANCE pad button (the LONGEST controls_ref line: 'tune the
//       run: SAFE keeps clear, GREEDY banks loot faster') and, separately,
//       the MAP cog (a control anchored near the RIGHT screen edge) — sits
//       fully inside the viewport (left >= 0, right <= innerWidth), its
//       text wraps INSIDE the box (scrollWidth <= clientWidth + 1), and the
//       page never scrolls horizontally (documentElement.scrollWidth <=
//       innerWidth + 1);
//   (b) the leave strip (#help-hud) fits the viewport the same way;
//   (c) the tap EXPLAINS, it does not activate: help mode stays armed, the
//       stance badge is unchanged and the map stays CLOSED after its probe;
//   (d) a MANUAL page (page 1 and the longest page 3, opened in-run through
//       the settings door) fits the viewport horizontally, no page overflow;
//   (e) no console errors in any arm.
// The Node suite pins the SHARED RULE (one --fit-w clamp behind every help
// surface) in test/test_help_fit.mjs; this tool measures the GEOMETRY.
// Run: node tools/verify_help_fit.mjs
import { withPage } from './browser.mjs';
import { TOUR_KEYS } from '../src/tour.js';

const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); };

const center = (sel) => `(() => {
  const el = document.querySelector('${sel}');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return [];
  return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
})()`;

// The tip/hud geometry read: rect + wrap arithmetic + the doc's overflow.
const TIP_MEASURE = `(() => {
  const px = (v) => Math.round(v * 100) / 100;
  const read = (id) => {
    const el = document.getElementById(id);
    if (!el) return { missing: true };
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { missing: false, x: px(r.left), y: px(r.top), r: px(r.right), b: px(r.bottom),
      w: px(r.width), h: px(r.height), display: cs.display, whiteSpace: cs.whiteSpace,
      text: (el.textContent || '').slice(0, 90), wrapX: el.scrollWidth - el.clientWidth };
  };
  return { vw: innerWidth, vh: innerHeight,
    tip: read('help-tip'), hud: read('help-hud'),
    stanceBadge: (document.getElementById('tc-stance') || {}).textContent,
    docOverflowX: document.documentElement.scrollWidth - innerWidth };
})()`;

// The manual page geometry read (panel + GOT IT footer + doc overflow).
const PANEL_MEASURE = `(() => {
  const px = (v) => Math.round(v * 100) / 100;
  const panel = document.querySelector('#overlay.howto .card.ref');
  const got = document.querySelector('#overlay.howto .card.gotit');
  if (!panel || !got) return { missing: true };
  panel.scrollIntoView({ block: 'nearest' });
  const pr = panel.getBoundingClientRect();
  got.scrollIntoView({ block: 'nearest' });
  const gr = got.getBoundingClientRect();
  return { missing: false, vw: innerWidth,
    panel: { x: px(pr.x), r: px(pr.right), w: px(pr.width) },
    got: { x: px(gr.x), r: px(gr.right) },
    docOverflowX: document.documentElement.scrollWidth - innerWidth };
})()`;

async function arm(w, h, dpr) {
  return withPage({ w, h, dpr, mobile: true,
    startupScript: "try { localStorage.setItem('hordes_onboarded', '1'); } catch (e) {}" +
      Object.values(TOUR_KEYS).map(k => `try { localStorage.setItem('${k}', '1'); } catch (e) {}`).join('') },
    async (p) => {
      await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
      await p.waitFor("(async () => (await import('./src/main.js')).__TEST.state.mode !== 'intro')()", 15000);
      await p.waitFor("(async () => (await import('./src/main.js')).__TEST.state.mode === 'title')()", 8000);
      await p.waitFor("(async () => { const rv = (await import('./src/main.js')).__TEST.state.titleReveal; return !rv || rv.phase === 'settled'; })()", 8000);
      // START GAME (retry: a card mid-handoff has a zero rect).
      let playing = false;
      for (let tries = 0; tries < 12 && !playing; tries++) {
        const c = await p.evaluate(`(() => {
          const el = [...document.getElementById('ov-cards').children]
            .find(k => (k.textContent || '').toUpperCase().includes('START GAME'));
          if (!el) return null;
          el.scrollIntoView({ block: 'center' });
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
      await p.waitFor("(async () => { const st = (await import('./src/main.js')).__TEST.state; return st.mode === 'playing' && st.time > 1.0; })()", 10000, 200);
      const stanceBadge0 = await p.evaluate("(document.getElementById('tc-stance') || { textContent: 'BALANCED' }).textContent");

      // Arm help mode the REAL way: tap the HELP cog.
      let armed = false;
      for (let tries = 0; tries < 8 && !armed; tries++) {
        const c = await p.evaluate(center('#tc-help'));
        if (c && c.length === 2) {
          await p.tap(c[0], c[1]);
          armed = await p.waitFor("(async () => (await import('./src/main.js')).__TEST.state.helpMode === true)()", 2000).catch(() => false);
        } else { await p.sleep(250); }
      }
      if (!armed) throw new Error(w + 'x' + h + ': could not arm help mode');

      // (a) STANCE: the longest explainer line, via a REAL pad tap.
      const tapProbe = async (sel, needle) => {
        for (let tries = 0; tries < 8; tries++) {
          const c = await p.evaluate(center(sel));
          if (c && c.length === 2) {
            await p.tap(c[0], c[1]);
            const up = await p.evaluate(`(() => { const el = document.getElementById('help-tip');
              return el && el.style.display === 'block' && el.textContent.toUpperCase().includes('${needle}'); })()`);
            if (up) return true;
          }
          await p.sleep(200);
        }
        return false;
      };
      if (!(await tapProbe('#touch button[data-act="stance"]', 'STANCE')))
        throw new Error(w + 'x' + h + ': the STANCE probe showed no explainer');
      const m1 = await p.evaluate(TIP_MEASURE);
      // (a2) MAP: the cog anchored near the RIGHT screen edge.
      if (!(await tapProbe('#tc-map', 'MAP')))
        throw new Error(w + 'x' + h + ': the MAP probe showed no explainer');
      const m2 = await p.evaluate(TIP_MEASURE);
      const live = await p.evaluate(`(async () => { const m = await import('./src/main.js');
        return { help: m.__TEST.state.helpMode, mapOpen: m.__TEST.state.mapOpen }; })()`);

      // Leave help mode (REAL tap), then open the manual in-run: settings
      // door -> HOW TO PLAY card.
      let left = false;
      for (let tries = 0; tries < 8 && !left; tries++) {
        const c = await p.evaluate(center('#tc-help'));
        if (c && c.length === 2) {
          await p.tap(c[0], c[1]);
          left = await p.waitFor("(async () => (await import('./src/main.js')).__TEST.state.helpMode === false)()", 2000).catch(() => false);
        } else { await p.sleep(250); }
      }
      if (!left) throw new Error(w + 'x' + h + ': could not leave help mode');
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
        } else { await p.sleep(250); }
      }
      if (!refOpen) throw new Error(w + 'x' + h + ': could not open HOW TO PLAY in-run');
      const page1 = await p.evaluate(PANEL_MEASURE);
      await p.evaluate(`(async () => { const m = await import('./src/main.js'); m.__TEST.manual.goto(3); })()`);
      await p.sleep(60);
      const page3 = await p.evaluate(PANEL_MEASURE);
      const shot = await p.shot('help-fit-' + w + 'x' + h);
      return { m1, m2, live, stanceBadge0, page1, page3, shot, errors: p.errors };
    });
}

const SIZES = [[320, 568, 1], [360, 800, 1], [390, 844, 3], [568, 320, 1]];
const arms = {};
for (const [w, h, dpr] of SIZES) arms[w + 'x' + h] = await arm(w, h, dpr);

// ---------------------------------------------------------------- verdict --
const fitsVw = (b, vw) => b && !b.missing && b.x >= -0.5 && b.r <= vw + 0.5;
for (const [w, h] of SIZES) {
  const tag = w + 'x' + h, a = arms[tag];
  check(tag + ' (a) the STANCE explainer (longest line) fits the viewport (x ' + a.m1.tip.x +
    ' .. ' + a.m1.tip.r + ' of ' + a.m1.vw + ')', fitsVw(a.m1.tip, a.m1.vw), a.m1.tip);
  check(tag + ' (a) the explainer text wraps INSIDE its box (scrollWidth-clientWidth=' +
    a.m1.tip.wrapX + ')', a.m1.tip.wrapX <= 1, a.m1.tip);
  check(tag + ' (a2) the MAP explainer (edge-anchored control) fits the viewport (x ' +
    a.m2.tip.x + ' .. ' + a.m2.tip.r + ' of ' + a.m2.vw + ')', fitsVw(a.m2.tip, a.m2.vw), a.m2.tip);
  check(tag + ' (a2) the MAP explainer wraps inside its box (wrapX=' + a.m2.tip.wrapX + ')',
    a.m2.tip.wrapX <= 1, a.m2.tip);
  check(tag + ' (b) the leave strip fits the viewport (x ' + a.m1.hud.x + ' .. ' +
    a.m1.hud.r + ' of ' + a.m1.vw + ')', fitsVw(a.m1.hud, a.m1.vw), a.m1.hud);
  check(tag + ' no horizontal page overflow with the tips up (doc over ' + a.m1.docOverflowX +
    ' / ' + a.m2.docOverflowX + 'px)', a.m1.docOverflowX <= 1 && a.m2.docOverflowX <= 1,
    { m1: a.m1.docOverflowX, m2: a.m2.docOverflowX });
  check(tag + ' (c) the taps EXPLAIN, not activate: help still armed, stance badge unchanged (' +
    a.m1.stanceBadge + '), map still closed',
    a.live.help === true && a.m1.stanceBadge === a.stanceBadge0 && a.live.mapOpen === false, a.live);
  check(tag + ' (d) manual page 1 fits the viewport horizontally (x ' + a.page1.panel.x +
    ' .. ' + a.page1.panel.r + ' of ' + a.page1.vw + ', doc over ' + a.page1.docOverflowX + 'px)',
    !a.page1.missing && fitsVw(a.page1.panel, a.page1.vw) && fitsVw(a.page1.got, a.page1.vw) &&
    a.page1.docOverflowX <= 1, a.page1);
  check(tag + ' (d) manual page 3 (CONTROLS, longest) fits the viewport horizontally (x ' +
    a.page3.panel.x + ' .. ' + a.page3.panel.r + ' of ' + a.page3.vw + ', doc over ' +
    a.page3.docOverflowX + 'px)',
    !a.page3.missing && fitsVw(a.page3.panel, a.page3.vw) && fitsVw(a.page3.got, a.page3.vw) &&
    a.page3.docOverflowX <= 1, a.page3);
  console.log('PNG: ' + a.shot);
}
{
  const allErrors = SIZES.map(([w, h]) => arms[w + 'x' + h].errors).flat();
  check('no console errors in any arm', allErrors.length === 0, allErrors);
}

const bad = results.filter((r) => !r.ok).length;
for (const r of results) console.log((r.ok ? 'ok   ' : 'FAIL ') + r.name + (r.ok ? '' : ' :: ' + JSON.stringify(r.detail)));
console.log(bad ? 'VERIFY HELP FIT: FAIL'
  : 'VERIFY HELP FIT: PASS - at 320x568, 360x800, 390x844@dpr3 and 568x320 (real run, real taps): ' +
    'the control explainer (STANCE, the longest line, and MAP, the edge-anchored cog) and the leave ' +
    'strip sit fully inside the viewport, the text wraps inside the box, the page never scrolls ' +
    'horizontally, the taps explain rather than activate (stance unchanged, map closed), and the ' +
    'manual pages (1 and 3) fit the viewport');
process.exit(bad ? 1 : 0);
