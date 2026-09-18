// HORDES - tools/verify_help_clearance.mjs (THE HELP CARD MUST NOT COVER THE
// CONTROLS IT IS EXPLAINING, remy:orchestrator 2026-09-17). REAL browser, REAL
// taps, touch layer LIVE, by BOUNDING-BOX arithmetic (jsdom cannot lay text
// out). For EVERY control that can be tapped in help mode — the left pad
// (FOCUS/STANCE/PILOT/STATS), the joystick (the screen-centre case), the right
// pad (Q/W/HP/MP), the top cog row (SETTINGS/RADAR/MAP) — with the explainer
// open:
//   * the explainer rect intersects NO visible control rect with >= 8px
//     clearance (the touch cluster, the cog row, the leave strip included);
//   * it stays fully inside the viewport;
//   * the page never scrolls horizontally;
//   * the taps still EXPLAIN, not activate (stance badge unchanged, radar and
//     map state untouched, help still armed).
// The HELP cog itself is excluded: its tap LEAVES the mode (there is no
// explainer to place). Corner cases demanded by the brief are covered by the
// full sweep: FOCUS (nearest the left edge), SETTINGS (right edge), the pad
// bottoms (bottom edge) and #joy (nearest the screen centre).
// Usage: node tools/verify_help_clearance.mjs [WxH ...]   (default: all sizes)
import { withPage } from './browser.mjs';
import { TOUR_KEYS } from '../src/tour.js';

const ALL_SIZES = [[320, 568, 1], [360, 800, 1], [390, 844, 3], [568, 320, 1]];
const argSizes = process.argv.slice(2);
const SIZES = argSizes.length
  ? ALL_SIZES.filter(([w, h]) => argSizes.includes(w + 'x' + h))
  : ALL_SIZES;
if (!SIZES.length) { console.error('no matching sizes for ' + argSizes.join(',')); process.exit(2); }

const results = [];
const check = (name, ok, detail) => results.push({ name, ok: !!ok, detail });

const center = (sel) => `(() => {
  const el = document.querySelector('${sel}');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return [];
  return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
})()`;

// Every control rect the placement must clear, read from the live DOM at
// measure time (the same set the placement rule reads). Generalised over the
// SURFACE being measured (owner 2026-09-17: the pre-tap BANNER must clear the
// controls too, and the rule must hold for EVERY help-mode surface): the
// surface's own rect is excluded from its control set, every OTHER help
// surface that is currently visible counts as chrome it must not cover.
const measureOf = (surfaceId) => `(() => {
  const px = (v) => Math.round(v * 100) / 100;
  const surf = document.getElementById('${surfaceId}');
  const controls = [];
  const see = (el) => {
    if (!el || el === surf) return;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0)
      controls.push({ id: el.id || el.dataset.act || el.tagName, x: px(r.left), y: px(r.top),
        r: px(r.right), b: px(r.bottom), w: px(r.width), h: px(r.height) });
  };
  document.querySelectorAll('#touch button, #joy').forEach(see);
  see(document.getElementById('help-hud'));
  see(document.getElementById('help-tip'));
  const tr = surf.getBoundingClientRect();
  return { vw: innerWidth, vh: innerHeight,
    tip: { x: px(tr.left), y: px(tr.top), r: px(tr.right), b: px(tr.bottom),
      w: px(tr.width), h: px(tr.height), display: getComputedStyle(surf).display,
      text: (surf.textContent || '').slice(0, 60) },
    controls,
    docOverflowX: document.documentElement.scrollWidth - innerWidth };
})()`;

const CLEAR = 8;   // the brief's clearance
const clears = (a, b) =>
  a.r + CLEAR <= b.x || b.r + CLEAR <= a.x || a.b + CLEAR <= b.y || b.b + CLEAR <= a.y;

// [selector, needle-in-tip-text] — needle null accepts any non-empty tip.
const PROBES = [
  ['#touch button[data-act="focus"]', 'FOCUS'],
  ['#touch button[data-act="stance"]', 'STANCE'],
  ['#touch button[data-act="pilot"]', 'PILOT'],
  ['#tc-stats', 'STATS'],
  ['#joy', null],                     // the screen-centre case (MOVE line)
  ['#touch button[data-act="q"]', null],
  ['#touch button[data-act="w"]', null],
  ['#touch button[data-act="h"]', null],
  ['#touch button[data-act="n"]', null],
  ['#tc-cog', 'SETTINGS'],            // nearest the right edge
  ['#tc-radar', 'RADAR'],
  ['#tc-map', 'MAP'],
];

async function arm(w, h, dpr) {
  return withPage({ w, h, dpr, mobile: true,
    startupScript: "try { localStorage.setItem('hordes_onboarded', '1'); } catch (e) {}" +
      Object.values(TOUR_KEYS).map(k => `try { localStorage.setItem('${k}', '1'); } catch (e) {}`).join('') },
    async (p) => {
      await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
      await p.waitFor("(async () => (await import('./src/main.js')).__TEST.state.mode !== 'intro')()", 15000);
      // FIRST-RUN PROLOGUE (2026-09-18): a fresh browser profile's run #1
      // opens the choreographed prologue (the pilot is not player-driven) —
      // stamp runs=1 (the harness convention) so this verifier drives an
      // ordinary run.
      await p.evaluate(`(async () => { const T2 = (await import('./src/main.js')).__TEST;
        const pr = T2.getProfile();
        if (pr && pr.achievements && pr.achievements.totals) pr.achievements.totals.runs = 1;
        return true; })()`);
      await p.waitFor("(async () => (await import('./src/main.js')).__TEST.state.mode === 'title')()", 8000);
      await p.waitFor("(async () => { const rv = (await import('./src/main.js')).__TEST.state.titleReveal; return !rv || rv.phase === 'settled'; })()", 8000);
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
        } else { await p.sleep(250); }
      }
      if (!playing) throw new Error(w + 'x' + h + ': could not start the run');
      await p.waitFor("(async () => { const st = (await import('./src/main.js')).__TEST.state; return st.mode === 'playing' && st.time > 1.0; })()", 10000, 200);
      // Bind MANUAL the REAL way (two 'o' keydowns: AUTO_ALL -> AUTO_MOVE ->
      // MANUAL) so the joystick — the screen-centre corner case — is LIVE.
      await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', bubbles: true }))");
      await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', bubbles: true }))");
      await p.waitFor("document.getElementById('joy').style.display === 'block'", 4000);

      const before = await p.evaluate(
        "(document.getElementById('tc-stance') || { textContent: 'BALANCED' }).textContent");
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

      // SURFACE 1 of the general rule: the PRE-TAP BANNER (#help-hud) — what
      // the owner sees the moment ? is pushed, before anything is tapped. It
      // must be up, and it must clear the controls exactly like the explainer.
      const banner = await p.evaluate(measureOf('help-hud'));
      if (banner.tip.display !== 'block')
        throw new Error(w + 'x' + h + ': help-mode banner never showed');

      const probes = [];
      for (const [sel, needle] of PROBES) {
        let up = false;
        for (let tries = 0; tries < 8 && !up; tries++) {
          const c = await p.evaluate(center(sel));
          if (c && c.length === 2) {
            await p.tap(c[0], c[1]);
            up = await p.evaluate(`(() => { const el = document.getElementById('help-tip');
              return el && el.style.display === 'block' && el.textContent.trim().length > 0` +
              (needle ? ` && el.textContent.toUpperCase().includes('${needle}')` : '') + '; })()');
          }
          if (!up) await p.sleep(200);
        }
        if (!up) throw new Error(w + 'x' + h + ': ' + sel + ' probe showed no explainer');
        probes.push({ sel, m: await p.evaluate(measureOf('help-tip')) });
      }
      const live = await p.evaluate(`(async () => { const st = (await import('./src/main.js')).__TEST.state;
        return { help: st.helpMode, mapOpen: st.mapOpen, radarOn: st.radarOn,
          stance: (document.getElementById('tc-stance') || {}).textContent }; })()`);
      return { before, banner, probes, live, errors: p.errors };
    });
}

const arms = {};
for (const [w, h, dpr] of SIZES) arms[w + 'x' + h] = await arm(w, h, dpr);

// ------------------------------------------------------------------ verdict --
const checkSurface = (tag, label, m) => {
  const clipped = m.controls.filter((c) => !clears(m.tip, c));
  check(tag + ' ' + label + ': clears EVERY visible control rect by >= ' +
    CLEAR + 'px (rect ' + m.tip.x + ',' + m.tip.y + ' ' + m.tip.w + 'x' + m.tip.h +
    ' vs ' + m.controls.length + ' controls; clipped: ' +
    (clipped.map((c) => c.id).join(',') || 'none') + ')',
    clipped.length === 0, { rect: m.tip, clipped });
  check(tag + ' ' + label + ': stays inside the viewport',
    m.tip.x >= -0.5 && m.tip.y >= -0.5 && m.tip.r <= m.vw + 0.5 && m.tip.b <= m.vh + 0.5, m.tip);
  check(tag + ' ' + label + ': no horizontal page overflow (' + m.docOverflowX + 'px)',
    m.docOverflowX <= 1, m.docOverflowX);
};
for (const [w, h] of SIZES) {
  const tag = w + 'x' + h, a = arms[tag];
  // SURFACE 1: the pre-tap banner (owner 2026-09-17's report).
  checkSurface(tag, 'banner #help-hud (shown when ? is pushed, before any tap)', a.banner);
  // SURFACE 2: the explainer, one check set per tappable control.
  for (const { sel, m } of a.probes) checkSurface(tag, sel + ' explainer', m);
  check(tag + ' the probes EXPLAIN, not activate (help armed, stance unchanged, radar off, map closed)',
    a.live.help === true && a.live.mapOpen === false && a.live.radarOn === false &&
    a.live.stance === a.before &&
    a.probes.every(({ m }) => m.tip.display === 'block'),
    { live: a.live, stance0: a.before });
}
{
  const allErrors = SIZES.map(([w, h]) => arms[w + 'x' + h].errors).flat();
  check('no console errors in any arm', allErrors.length === 0, allErrors);
}

const bad = results.filter((r) => !r.ok).length;
for (const r of results) console.log((r.ok ? 'ok   ' : 'FAIL ') + r.name + (r.ok ? '' : ' :: ' + JSON.stringify(r.detail)));
console.log(bad ? 'VERIFY HELP CLEARANCE: FAIL' :
  'VERIFY HELP CLEARANCE: PASS - at ' + SIZES.map(([w, h]) => w + 'x' + h).join(', ') +
  ' (real run, real taps): EVERY help-mode surface (the pre-tap banner #help-hud AND the ' +
  'explainer for every tappable control) clears every visible control rect (incl. the ' +
  'leave strip and the joystick) by >= 8px, stays inside the viewport, causes no ' +
  'horizontal overflow, and the taps explain rather than activate (' +
  results.length + ' checks)');
process.exit(bad ? 1 : 0);
