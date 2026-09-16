// HORDES - tools/verify_g4_complaints.mjs (G4: the eight galaxy.click playtest
// complaints, verified item by item against the build). A VERIFICATION slice:
// no game code is touched. Real Chrome at 390x844 @dpr3 (the owner's phone form
// factor) via the shared tools/browser.mjs driver; ALL TOUR_KEYS on this tree
// are set (counted and printed) and state.time > 1.0 is ASSERTED before any
// measurement - a code claim is not evidence for anything a player looks at.
//
// Arms: `node tools/verify_g4_complaints.mjs --item N` (N = 1..8) runs one
// complaint; no flag runs all eight (concurrently, to fit the 60s wall cap).
// Each arm prints its own wall ms, takes exactly one 1170x2532 PNG into
// docs/art/g4-complaints-2026-09-16/, and ends with the machine-readable line
//   G4 ITEM <n> | <VERIFIED FIXED|STILL TRUE|NOT VERIFIABLE> | <numbers> | <png>
// rc=0 when the report was produced (an honest STILL TRUE is a VALID outcome);
// rc=1 only when a check COULD NOT RUN (missing element, timeout, harness
// breakage). Console errors are collected, never swallowed (complaint 8).
import { withPage } from './browser.mjs';
import { copyFileSync, mkdirSync } from 'node:fs';
import { TOUR_KEYS } from '../src/tour.js';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const ART = 'docs/art/g4-complaints-2026-09-16';
mkdirSync(ART, { recursive: true });

const W = 390, H = 844, DPR = 3;
const ALL_KEYS = Object.values(TOUR_KEYS);   // counted on this tree, printed per arm

// ---------------------------------------------------------------------------
// The report machinery (exported so test/test_g4_complaints_report.mjs can
// check the report is COMPLETE and honest without a browser).
// ---------------------------------------------------------------------------
export const VERDICTS = ['VERIFIED FIXED', 'STILL TRUE', 'NOT VERIFIABLE'];
export const G5_XREF = 'G5 (docs/HORDES_GOALS_2026-09-12.md :2070) - owner measurement freeze: no cohort, no rate table, no simulation';
export const ITEMS = [
  { n: 1, complaint: 'no idea what is going on at all', check: 'first-run tour fires + stage1/hud keys consumed through the real loop; hints panel toggled with a REAL tap and renders a non-zero line count; on-screen labels read back (pad badges + canvas XP label ink)' },
  { n: 2, complaint: "there's no xp bar", check: 'the empty trough is DRAWN (sampled pixels + ink count at 0%), then XP granted through the real gem-pickup seam and the filled pixels differ (ink delta printed)' },
  { n: 3, complaint: 'no tutorial', check: 'TOUR_KEYS count printed; stage-2 coachmark total >= 15; HOW TO PLAY opened by real taps from the title menu; overlay visible with non-empty copy (first line printed)' },
  { n: 4, complaint: 'the large text is very fuzzy', check: 'every RES_MODES entry reachable by real taps and persisted at the storage layer resMode() reads each call; canvas backing-store vs viewport*dpr and the HUD text-region ink + edge counts measured in AUTO and forced 4; whether the modes change rasterisation is stated plainly' },
  { n: 5, complaint: 'balance is nonexistent, character shredded everything', check: 'MEASUREMENT FROZEN by owner directive - no cohort, no rate table, no simulation. Functional-only: wave/arch/stage hooks reachable in a live run; ' + G5_XREF },
  { n: 6, complaint: 'no way to exit a run early', check: 'in a live run the cog opens with a REAL tap, the END RUN control is onScreen (rect printed), two REAL taps end the run (mode transition + end card measured, not name-only), and the settings/END-RUN tour key exists in TOUR_KEYS' },
  { n: 7, complaint: 'the edge of the map is not clearly defined', check: 'the arena wall band sampled in a live run renders as its own colour (sampled values printed vs ground); the player driven past the boundary stays clamped inside +-RIM (before/after coordinates printed)' },
  { n: 8, complaint: 'all over the place', check: 'at 390x844 @dpr3 zero overlapping critical chrome (the main.js :232/:247-248 selector set, #hints included via a REAL toggle tap), the menu overlay is OFF during live play, and the console error count is zero' },
];

export function fmtSummaryLine(n, verdict, numbers, png) {
  return `G4 ITEM ${n} | ${verdict} | ${numbers} | ${png}`;
}
export function parseSummaryLine(line) {
  const m = /^G4 ITEM ([1-8]) \| (VERIFIED FIXED|STILL TRUE|NOT VERIFIABLE) \| (.+) \| (\S+\.png)$/.exec(line);
  return m ? { n: Number(m[1]), verdict: m[2], numbers: m[3], png: m[4] } : null;
}
// Honest-report gate: exactly 8 rows, verdict from the allowed set, non-empty
// evidence, item 5 carrying the freeze cross-reference.
export function validateReport(rows) {
  const problems = [];
  if (!Array.isArray(rows) || rows.length !== 8) problems.push('expected exactly 8 rows, got ' + (rows ? rows.length : rows));
  else {
    rows.forEach((r, i) => {
      if (r.n !== i + 1) problems.push('row ' + i + ' out of order (n=' + r.n + ')');
      if (!VERDICTS.includes(r.verdict)) problems.push('item ' + r.n + ' verdict not in allowed set: ' + JSON.stringify(r.verdict));
      if (!r.evidence || !String(r.evidence).trim()) problems.push('item ' + r.n + ' has empty evidence');
      if (!r.png || !/\.png$/.test(r.png)) problems.push('item ' + r.n + ' missing png');
    });
    const five = rows.find((r) => r.n === 5);
    if (five && !/G5|freeze/i.test(String(five.evidence))) problems.push('item 5 evidence lacks the G5 freeze cross-reference');
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Shared real-browser helpers
// ---------------------------------------------------------------------------
const T = `(await import('./src/main.js')).__TEST`;
const escKey = (p) => p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
const cardCenter = (pred) => `(() => {
  const el = [...document.getElementById('ov-cards').children].find(${pred});
  if (!el) return null;
  if (el.scrollIntoView) el.scrollIntoView({ block: 'center' });
  const r = el.getBoundingClientRect();
  return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
})()`;
const byName = (name) => cardCenter(`c => c.querySelector('.name') && c.querySelector('.name').textContent === ${JSON.stringify(name)}`);
const tapAt = async (p, label, at) => {
  if (!at || !Number.isFinite(at[0]) || !Number.isFinite(at[1])) throw new Error('tap target missing/bad: ' + label + ' ' + JSON.stringify(at));
  await p.tap(at[0], at[1]);
};
const rectOfSel = (sel) => `(() => {
  const el = document.querySelector(${JSON.stringify(sel)});
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
})()`;
const tourMissing = (keysJson) => `${keysJson}.filter(k => localStorage.getItem(k) !== '1').length`;
// Event-gated coachmarks (chest/portal/draft/...) can pop at any moment and
// their z-50 root swallows taps - clear any live one before interactive taps.
async function dismissAnyCoachmark(p) {
  for (let i = 0; i < 40; i++) {
    const active = await p.evaluate(`(() => { const r = document.getElementById('tour-root'); return !!(r && r.isConnected); })()`);
    if (!active) return true;
    await p.tap(30, 200);
    await p.sleep(250);
  }
  return false;
}

const STARTUP_ALL = `
try {
  localStorage.setItem('hordes_onboarded', '1');
  for (const k of ${JSON.stringify(ALL_KEYS)}) localStorage.setItem(k, '1');
} catch (e) {}`;

async function toTitle(p) {
  await escKey(p);   // skip the intro movie
  await p.waitFor(`(async () => ${T}.state.mode !== 'intro')()`, 15000);
  await p.waitFor(`(async () => { const rv = ${T}.state.titleReveal; return !rv || rv.phase === 'settled'; })()`, 10000);
  const up = await p.waitFor(`(() => {
    const el = [...document.getElementById('ov-cards').children]
      .find(c => (c.textContent || '').toUpperCase().includes('START GAME'));
    return !!el && el.getBoundingClientRect().width > 0;
  })()`, 10000, 250);
  if (!up) throw new Error('no START GAME card at title');
}
async function startRunLive(p) {
  const startAt = await p.evaluate(cardCenter(`c => (c.textContent || '').toUpperCase().includes('START GAME')`));
  await tapAt(p, 'START GAME', startAt);
  const ok = await p.waitFor(`(async () => { const s = ${T}.state; return s.mode === 'playing' && s.time > 1.0; })()`, 20000, 200);
  if (!ok) throw new Error('run never went live with state.time > 1.0');
  return await p.evaluate(`(async () => +${T}.state.time.toFixed(2))()`);
}
// The house-rule preamble EVERY measurement arm runs: assert all TOUR_KEYS set
// (print the tree's count) and state.time > 1.0 BEFORE any measurement.
async function runArmPreamble(p) {
  const missing = await p.evaluate(tourMissing(JSON.stringify(ALL_KEYS)));
  if (missing !== 0) throw new Error('TOUR_KEYS not all set: ' + missing + ' missing of ' + ALL_KEYS.length);
  await toTitle(p);
  const t = await startRunLive(p);
  return { keys: ALL_KEYS.length, time: t };
}

// Canvas pixel sampler: region in 480x300 VIEW coords -> {ink, edges, modalPx}.
// ink = pixels whose colour differs from the region's modal colour by > 60
// (1-based channel sum); edges = pixels differing from their LEFT neighbour -
// a crispness proxy (crisp pixel art has many hard vertical transitions).
const SAMPLE_REGION = `(async (vx, vy, vw, vh) => {
  const cv = document.getElementById('game');
  const g = cv.getContext('2d');
  const k = cv.width / 480;
  const x0 = Math.round(vx * k), y0 = Math.round(vy * k);
  const w = Math.max(1, Math.round(vw * k)), h = Math.max(1, Math.round(vh * k));
  const d = g.getImageData(x0, y0, w, h).data;
  const counts = new Map(); const px = [];
  for (let i = 0; i < w * h; i++) {
    const r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2];
    const key = (r >> 4) + ',' + (gg >> 4) + ',' + (b >> 4);
    counts.set(key, (counts.get(key) || 0) + 1);
    px.push([r, gg, b]);
  }
  let modal = null, best = 0;
  for (const [key, n] of counts) if (n > best) { best = n; modal = key; }
  const mrgb = modal.split(',').map((v) => +v * 16);
  let ink = 0;
  for (const [r, gg, b] of px) if (Math.abs(r - mrgb[0]) + Math.abs(gg - mrgb[1]) + Math.abs(b - mrgb[2]) > 60) ink++;
  let edges = 0;
  for (let y = 0; y < h; y++) for (let x = 1; x < w; x++) {
    const i = y * w + x, j = i - 1;
    if (Math.abs(px[i][0] - px[j][0]) + Math.abs(px[i][1] - px[j][1]) + Math.abs(px[i][2] - px[j][2]) > 60) edges++;
  }
  return { canvasW: cv.width, canvasH: cv.height, k: +k.toFixed(3), modalPx: mrgb, ink, edges };
})`;
const sampleRegion = (p, vx, vy, vw, vh) =>
  p.evaluate(`${SAMPLE_REGION}(${vx}, ${vy}, ${vw}, ${vh})`, true);
const samplePoint = (p, vx, vy) =>
  p.evaluate(`(() => {
    const cv = document.getElementById('game');
    const k = cv.width / 480;
    const d = cv.getContext('2d').getImageData(Math.round(${vx} * k), Math.round(${vy} * k), 1, 1).data;
    return [d[0], d[1], d[2]];
  })()`);

async function shot(p, name) {
  const f = await p.shot(name);
  copyFileSync(f, ART + '/' + name + '.png');
  return name + '.png';
}

// ---------------------------------------------------------------------------
// The eight arms. Each returns { verdict, numbers, png, errors } or throws
// (COULD NOT RUN -> rc=1).
// ---------------------------------------------------------------------------

// 1. "no idea what is going on at all" - tour + hints panel + on-screen labels.
// This arm boots with stage1+hud UNSET (they are the two under test); every
// other TOUR_KEY is set. The tour must FIRE and its keys be consumed through
// the real loop.
async function item1() {
  const keysUnderTest = [TOUR_KEYS.stage1, TOUR_KEYS.hud];
  const startup = `
try {
  for (const k of ${JSON.stringify(ALL_KEYS.filter((k) => !keysUnderTest.includes(k)))}) localStorage.setItem(k, '1');
} catch (e) {}`;
  return await withPage({ w: W, h: H, dpr: DPR, mobile: true, skipTour: false, startupScript: startup },
    async (p) => {
      await escKey(p);   // skip intro
      await p.waitFor(`(async () => ${T}.state.mode !== 'intro')()`, 15000);
      // First boot auto-pops HOW TO PLAY (main.js :6731) - a REAL tap on the
      // GOT IT card dismisses it and lands on the title.
      const htp = await p.waitFor(`document.getElementById('ov-title').textContent === 'HOW TO PLAY'`, 10000, 200);
      if (!htp) throw new Error('first-boot HOW TO PLAY never auto-popped');
      await p.sleep(300);
      await tapAt(p, 'GOT IT', await p.evaluate(byName('GOT IT')));
      // The stage-1 menu tour fires on the fresh title (maybeStartMenuTour).
      const tourFired = await p.waitFor(`(() => { const r = document.getElementById('tour-root'); return !!(r && r.isConnected); })()`, 8000, 150);
      if (!tourFired) throw new Error('stage-1 tour never fired on fresh boot');
      const stage1Before = await p.evaluate(`localStorage.getItem(${JSON.stringify(TOUR_KEYS.stage1)})`);
      await escKey(p);   // Escape skips the tour -> onSkip sets the stage1 flag
      await p.waitFor(`localStorage.getItem(${JSON.stringify(TOUR_KEYS.stage1)}) === '1'`, 5000);
      // Run; the hud coachmark fires in-run - dismiss each through REAL taps.
      await toTitleNoIntro(p);
      await tapAt(p, 'START GAME', await p.evaluate(cardCenter(`c => (c.textContent || '').toUpperCase().includes('START GAME')`)));
      const consumed = [];
      for (let i = 0; i < 30; i++) {
        const active = await p.evaluate(`(() => { const r = document.getElementById('tour-root'); return !!(r && r.isConnected); })()`);
        if (!active) break;
        await p.tap(30, 200);   // passThrough only covers menu cards; in-run any tap advances
        await p.sleep(200);
        const got = await p.evaluate(`[${JSON.stringify(ALL_KEYS)}].filter(k => localStorage.getItem(k) === '1')`);
        consumed.length = 0; consumed.push(...got);
      }
      const missing = await p.evaluate(tourMissing(JSON.stringify(ALL_KEYS)));
      const live = await p.waitFor(`(async () => { const s = ${T}.state; return s.mode === 'playing' && s.time > 1.0; })()`, 15000, 200);
      if (!live) throw new Error('run never went live after coachmarks');
      const runTime = await p.evaluate(`(async () => +${T}.state.time.toFixed(2))()`);
      // Hints panel: REAL tap on the "?" chrome button toggles it ON. Clear any
      // late event-gated coachmark first (its z-50 root would eat the tap);
      // retry if one popped in between.
      await dismissAnyCoachmark(p);
      const hintsBefore = await p.evaluate(`(() => { const h = document.getElementById('hints'); return h.classList.contains('on'); })()`);
      let hintsOn = false;
      for (let i = 0; i < 3 && !hintsOn; i++) {
        await tapAt(p, '? button', await p.evaluate(`(() => { const r = document.querySelector('[data-act="help"]').getBoundingClientRect(); return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)]; })()`));
        await p.sleep(250);
        await dismissAnyCoachmark(p);
        hintsOn = await p.evaluate(`(() => document.getElementById('hints').classList.contains('on'))()`);
      }
      const hintLines = await p.evaluate(`document.getElementById('hints').innerHTML.split('<br>').length`);
      // On-screen labels: the pad badges (FOCUS/STANCE/PILOT) + canvas XP label ink.
      const badges = await p.evaluate(`(() => ({
        focus: document.getElementById('tc-focus').textContent,
        stance: document.getElementById('tc-stance').textContent,
        pilot: document.getElementById('tc-pilot').textContent,
        hudText: (document.getElementById('hud').textContent || '').slice(0, 90),
      }))()`);
      const xpLabel = await sampleRegion(p, 0, 30, 24, 14);
      const png = await shot(p, 'g4-item1-tour-hints-labels');
      // The two keys under test must be consumed; event-gated coachmarks
      // (chest/portal/draft/...) fire on their own moments and are NOT
      // required here - the honest count is printed.
      const stage1Set = await p.evaluate(`localStorage.getItem(${JSON.stringify(TOUR_KEYS.stage1)}) === '1'`);
      const hudSet = await p.evaluate(`localStorage.getItem(${JSON.stringify(TOUR_KEYS.hud)}) === '1'`);
      const ok = stage1Before === null && stage1Set && hudSet && hintsOn === true && hintLines > 0 && xpLabel.ink > 0
        && badges.focus && badges.stance && badges.pilot;
      return {
        verdict: ok ? 'VERIFIED FIXED' : 'STILL TRUE',
        numbers: `first-boot HOW TO PLAY auto-popped + dismissed by REAL tap (GOT IT); tour fired on fresh boot (stage1 flag before skip: ${JSON.stringify(stage1Before)}); stage1+hud consumed through the real loop (${stage1Set ? 'stage1 OK' : 'STAGE1 MISSING'} / ${hudSet ? 'hud OK' : 'HUD MISSING'}; ${ALL_KEYS.length - missing} of ${ALL_KEYS.length} total keys set at sample time - the rest are event-gated); hints toggled by REAL tap (${hintsBefore ? 'was on' : 'was off'} -> ${hintsOn ? 'on' : 'OFF - TOGGLE FAILED'}, ${hintLines} lines); pad badges ${badges.focus}/${badges.stance}/${badges.pilot}; canvas XP-label ink=${xpLabel.ink}px; state.time=${runTime}s`,
        png, errors: p.errors,
      };
    });
}
// toTitle without the intro-skip (already done in item1's flow)
async function toTitleNoIntro(p) {
  await p.waitFor(`(async () => { const rv = ${T}.state.titleReveal; return !rv || rv.phase === 'settled'; })()`, 10000);
  await p.waitFor(`(() => {
    const el = [...document.getElementById('ov-cards').children]
      .find(c => (c.textContent || '').toUpperCase().includes('START GAME'));
    return !!el && el.getBoundingClientRect().width > 0;
  })()`, 10000, 250);
}

// 2. "there's no xp bar" - the bar exists AND its EMPTY state reads as a bar.
async function item2() {
  return await withPage({ w: W, h: H, dpr: DPR, mobile: true, skipTour: false, startupScript: STARTUP_ALL },
    async (p) => {
      const pre = await runArmPreamble(p);
      // t~0: the EMPTY trough must be drawn (frame + ticks + trough), not background.
      const before = await sampleRegion(p, 20, 35, 140, 10);
      const troughPx = await samplePoint(p, 90, 40);         // trough centre
      const framePx = await samplePoint(p, 21, 36);           // steel frame edge
      const xpFrac0 = await p.evaluate(`(async () => { const r = ${T}.renderer; return r && r.hudChrome ? +r.hudChrome.xpFrac.toFixed(3) : null; })()`);
      // Grant XP through the REAL gem-pickup seam (entities.makeGem + the
      // proximity pickup loop in main.js update - the same path a kill rides).
      const grant = await p.evaluate(`(async () => {
        const E = await import('./src/entities.js');
        const p = ${T}.state.player;
        const need = Math.max(1, Math.floor((p.xpNext - p.xp) * 0.5));
        ${T}.state.gems.push(E.makeGem(p.x, p.y, need));
        return { x: p.x, y: p.y, xp: p.xp, next: p.xpNext, gemXp: need };
      })()`, true);
      await p.sleep(700);   // let the live pickup loop run
      const after = await sampleRegion(p, 20, 35, 140, 10);
      const filledPx = await samplePoint(p, 30, 40);
      const xpFrac1 = await p.evaluate(`(async () => { const r = ${T}.renderer; return r && r.hudChrome ? +r.hudChrome.xpFrac.toFixed(3) : null; })()`);
      const png = await shot(p, 'g4-item2-xp-bar-fill');
      const delta = after.ink - before.ink;
      const ok = before.ink > 20 && delta > 0 && xpFrac1 > 0;
      return {
        verdict: ok ? 'VERIFIED FIXED' : 'STILL TRUE',
        numbers: `empty trough DRAWN (ink=${before.ink}px, trough rgb=${troughPx}, frame rgb=${framePx}); after gem grant (xp +${grant.gemXp} via the real pickup seam) fill ink=${after.ink}px (delta +${delta}), xpFrac ${xpFrac0} -> ${xpFrac1}, trough->fill rgb ${troughPx} -> ${filledPx}; TOUR_KEYS=${pre.keys}; state.time=${pre.time}s`,
        png, errors: p.errors,
      };
    });
}

// 3. "no tutorial" - first-run tour + HOW TO PLAY + hints.
async function item3() {
  return await withPage({ w: W, h: H, dpr: DPR, mobile: true, skipTour: false, startupScript: STARTUP_ALL },
    async (p) => {
      const pre = await runArmPreamble(p);
      // END RUN back to title for the menu-side checks.
      await tapAt(p, 'settings cog', await p.evaluate(`(() => { const r = document.querySelector('[data-act="settings"]').getBoundingClientRect(); return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)]; })()`));
      await p.waitFor(`(async () => ${T}.state.mode === 'settings')()`, 5000);
      await tapAt(p, 'END RUN', await p.evaluate(byName('END RUN')));
      await p.sleep(200);
      const conf = await p.evaluate(byName('CONFIRM END RUN?'));
      if (conf) await tapAt(p, 'CONFIRM END RUN', conf);
      await p.waitFor(`(async () => ${T}.state.mode === 'dead')()`, 5000);
      await tapAt(p, 'TITLE', await p.evaluate(byName('TITLE')));
      await p.waitFor(`document.getElementById('ov-title').textContent === 'HORDES'`, 5000);
      // Real tap path: SETUP door -> HOW TO PLAY.
      await p.sleep(300);
      await tapAt(p, 'SETUP', await p.evaluate(byName('SETUP')));
      await p.waitFor(`(() => [...document.getElementById('ov-cards').children].some(c => c.querySelector('.name') && c.querySelector('.name').textContent === 'HOW TO PLAY'))()`, 5000);
      await tapAt(p, 'HOW TO PLAY', await p.evaluate(byName('HOW TO PLAY')));
      const visible = await p.waitFor(`document.getElementById('ov-title').textContent === 'HOW TO PLAY'`, 5000);
      if (!visible) throw new Error('HOW TO PLAY overlay never opened');
      const firstLine = await p.evaluate(`(() => (document.getElementById('ov-sub').textContent || '').split('\\n')[0].trim())()`);
      const cardCount = await p.evaluate(`document.getElementById('ov-cards').children.length`);
      const png = await shot(p, 'g4-item3-how-to-play');
      const coachmarks = ALL_KEYS.length - 1;   // stage-2 keys (stage1 is the menu walk)
      const ok = coachmarks >= 15 && cardCount >= 2 && !!firstLine;
      return {
        verdict: ok ? 'VERIFIED FIXED' : 'STILL TRUE',
        numbers: `TOUR_KEYS=${ALL_KEYS.length} on this tree, stage-2 coachmark keys=${coachmarks} (>=15); HOW TO PLAY opened by REAL taps (SETUP door -> card), overlay visible with ${cardCount} cards, first line "${firstLine}"; live run first (${pre.time}s)`,
        png, errors: p.errors,
      };
    });
}

// 4. "the large text is very fuzzy" - resolution modes + HUD text legibility.
async function item4() {
  return await withPage({ w: W, h: H, dpr: DPR, mobile: true, skipTour: false, startupScript: STARTUP_ALL },
    async (p) => {
      await toTitle(p);
      // SETTINGS lives behind the SETUP door (U1 reorg).
      await tapAt(p, 'SETUP', await p.evaluate(byName('SETUP')));
      await p.waitFor(`(() => [...document.getElementById('ov-cards').children].some(c => c.querySelector('.name') && c.querySelector('.name').textContent === 'SETTINGS'))()`, 5000);
      await tapAt(p, 'SETTINGS', await p.evaluate(byName('SETTINGS')));
      await p.waitFor(`document.getElementById('ov-title').textContent === 'SETTINGS'`, 5000);
      const resCard = () => byName('RESOLUTION');
      // The card's sub-line names the live mode; each tap cycles one entry.
      const seen = [];
      const tapRes = async () => {
        await tapAt(p, 'RESOLUTION', await p.evaluate(resCard()));
        await p.sleep(250);
        return p.evaluate(`(() => { const c = [...document.getElementById('ov-cards').children].find(c => { const n = c.querySelector('.name'); return n && n.textContent === 'RESOLUTION'; }); return c ? c.querySelector('.desc').textContent : null; })()`);
      };
      const subNow = await p.evaluate(`(() => { const c = [...document.getElementById('ov-cards').children].find(c => { const n = c.querySelector('.name'); return n && n.textContent === 'RESOLUTION'; }); return c ? c.querySelector('.desc').textContent : null; })()`);
      seen.push(subNow);
      for (let i = 0; i < 4; i++) seen.push(await tapRes());   // AUTO -> PIXEL-PERFECT -> 2 -> 3 -> 4
      const stored = await p.evaluate(`localStorage.getItem('hordes_resolution')`);
      // Measure the canvas in forced-4 mode...
      const canvas4 = await p.evaluate(`(() => { const cv = document.getElementById('game'); return { w: cv.width, h: cv.height, cssW: Math.round(cv.getBoundingClientRect().width), cssH: Math.round(cv.getBoundingClientRect().height) }; })()`);
      const hud4 = await sampleRegion(p, 0, 0, 480, 48);
      // ...then one more tap wraps '4' -> AUTO; measure again.
      await tapRes();
      const storedAuto = await p.evaluate(`localStorage.getItem('hordes_resolution')`);
      const canvasA = await p.evaluate(`(() => { const cv = document.getElementById('game'); return { w: cv.width, h: cv.height, cssW: Math.round(cv.getBoundingClientRect().width), cssH: Math.round(cv.getBoundingClientRect().height) }; })()`);
      const hudA = await sampleRegion(p, 0, 0, 480, 48);
      const png = await shot(p, 'g4-item4-resolution-settings');
      const allModes = ['AUTO', 'PIXEL-PERFECT', '2', '3', '4'].every((m) => seen.some((s) => (s || '').includes(m)));
      const modesChangeRaster = canvas4.w !== canvasA.w || canvas4.h !== canvasA.h;
      const backingAtDeviceRes = canvasA.w === W * DPR;   // WAVE-23: backing = CSS x dpr
      const ok = allModes && stored === '4' && storedAuto === 'AUTO' && backingAtDeviceRes;
      return {
        verdict: ok ? 'VERIFIED FIXED' : 'STILL TRUE',
        numbers: `all 5 RES_MODES reached by REAL taps (${seen.map((s) => (s || '').match(/currently (\S+)/) ? s.match(/currently (\S+)/)[1] : '?').join(' -> ')}); persists at the storage layer resMode() reads each call (hordes_resolution '${stored}' then '${storedAuto}'); backing store AUTO=${canvasA.w}x${canvasA.h} vs forced-4=${canvas4.w}x${canvas4.h} (viewport*dpr=${W * DPR}x${H * DPR}); the modes ${modesChangeRaster ? 'CHANGE' : 'DO NOT CHANGE'} rasterisation at 390x844 (integer scales clamp to the viewport-limited fit) - but AUTO already rasterises at FULL device resolution (backing=CSS*dpr), HUD top-strip ink=${hudA.ink}px edges=${hudA.edges} (AUTO) vs ink=${hud4.ink}px edges=${hud4.edges} (4)`,
        png, errors: p.errors,
      };
    });
}

// 5. "balance is nonexistent" - NOT VERIFIABLE under the owner's measurement
// freeze. Functional wiring checks only.
async function item5() {
  return await withPage({ w: W, h: H, dpr: DPR, mobile: true, skipTour: false, startupScript: STARTUP_ALL },
    async (p) => {
      const pre = await runArmPreamble(p);
      await p.sleep(2500);   // let a wave spawn + an arch gate appear
      const live = await p.evaluate(`(async () => {
        const T = ${T};
        const arch = await import('./src/arches.js');
        return {
          wave: T.state.wave.num,
          arches: T.state.arches.length,
          archBuffs: T.state.archBuffs.length,
          tickArches: typeof arch.tickArches,
          stagesSeam: typeof T.stages === 'object' && typeof T.stages.cycle === 'function' && typeof T.stages.unlocked === 'function',
          challengeSeam: typeof T.challenge === 'object' && typeof T.challenge.cycle === 'function',
          stageLive: T.state.stage,
        };
      })()`, true);
      const png = await shot(p, 'g4-item5-hooks-live');
      const wired = live.wave >= 1 && live.arches >= 0 && live.tickArches === 'function' && live.stagesSeam && live.challengeSeam;
      return {
        verdict: 'NOT VERIFIABLE',
        numbers: `${G5_XREF}. Functional wiring measured only: wave=${live.wave} live, arch gates spawned=${live.arches}, arches.tickArches=${live.tickArches}, stage+challenge seams reachable=${live.stagesSeam}/${live.challengeSeam}, live stage=${JSON.stringify(live.stageLive)}; state.time=${pre.time}s. NO balance verdict was attempted`,
        png, errors: p.errors, wired,
      };
    });
}

// 6. "no way to exit a run early" - exit-run exists AND is taught.
async function item6() {
  return await withPage({ w: W, h: H, dpr: DPR, mobile: true, skipTour: false, startupScript: STARTUP_ALL },
    async (p) => {
      const pre = await runArmPreamble(p);
      const cogAt = await p.evaluate(`(() => { const r = document.querySelector('[data-act="settings"]').getBoundingClientRect(); return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)]; })()`);
      await tapAt(p, 'settings cog', cogAt);
      const inSettings = await p.waitFor(`(async () => ${T}.state.mode === 'settings')()`, 5000);
      if (!inSettings) throw new Error('cog tap did not open settings');
      const endRect = await p.evaluate(`(() => {
        const el = [...document.getElementById('ov-cards').children].find(c => c.querySelector('.name') && c.querySelector('.name').textContent === 'END RUN');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
      })()`);
      if (!endRect) throw new Error('no END RUN card in the in-run settings');
      const onScreen = endRect[0] >= 0 && endRect[1] >= 0 && endRect[0] + endRect[2] <= W && endRect[1] + endRect[3] <= H;
      await tapAt(p, 'END RUN', [endRect[0] + endRect[2] / 2, endRect[1] + endRect[3] / 2]);
      await p.sleep(250);
      const conf = await p.evaluate(byName('CONFIRM END RUN?'));
      if (conf) await tapAt(p, 'CONFIRM END RUN', conf);
      const dead = await p.waitFor(`(async () => ${T}.state.mode === 'dead')()`, 5000);
      const endTitle = await p.evaluate(`document.getElementById('ov-title').textContent`);
      const endCardRect = await p.evaluate(rectOfSel('#ov-title'));
      const overlayShown = await p.evaluate(`getComputedStyle(document.getElementById('overlay')).display !== 'none'`);
      const png = await shot(p, 'g4-item6-end-run-card');
      const settingsKey = 'settings' in TOUR_KEYS;
      const ok = onScreen && dead && endTitle === 'RUN ENDED' && overlayShown && endCardRect[2] > 0 && settingsKey;
      return {
        verdict: ok ? 'VERIFIED FIXED' : 'STILL TRUE',
        numbers: `cog opened by REAL tap; END RUN card rect=[${endRect}] onScreen=${onScreen}; two REAL taps -> mode='dead' (transition measured), end card "${endTitle}" rect=[${endCardRect}] overlay display!=none=${overlayShown}; END-RUN taught: TOUR_KEYS.settings=${TOUR_KEYS.settings}; run was live ${pre.time}s before exit`,
        png, errors: p.errors,
      };
    });
}

// 7. "the edge of map is not clearly defined" - wall + clamp.
async function item7() {
  return await withPage({ w: W, h: H, dpr: DPR, mobile: true, skipTour: false, startupScript: STARTUP_ALL },
    async (p) => {
      const pre = await runArmPreamble(p);
      const RIM = 600, WALL = 12;   // C.GROUND.RIM / C.GROUND.WALL (config.js :425/:429)
      // Park the player near the EAST rim so the wall band is on screen, and
      // let the WAVE-27 deadzone camera settle.
      await p.evaluate(`(async () => { const p = ${T}.state.player; p.x = ${RIM - 45}; p.y = 0; })()`);
      await p.sleep(1200);
      const geo = await p.evaluate(`(async () => {
        const T = ${T};
        const cv = document.getElementById('game');
        const zs = T.state.zoomScale || 1;
        const cam = T.state.cam;
        // world -> view (zoom Z): sx = 240 + (wx - cam.x - 240) * Z   (main.js worldRegion)
        const sx = (wx) => 240 + (wx - cam.x - 240) * zs;
        return { camX: +cam.x.toFixed(1), zs, canvasW: cv.width, wallViewX: +sx(${RIM}).toFixed(1), bandW: +(sx(${RIM + WALL}) - sx(${RIM})).toFixed(1) };
      })()`, true);
      const wallSides = await p.evaluate(`(async () => { const w = ${T}.renderer.arenaWall; return w ? w.sides.map(s => s.side) : null; })()`);
      // Sample a column sweep across the predicted band at three rows, plus a
      // ground reference 40 view-px inside the arena.
      const rows = [100, 150, 200];
      const cols = [-8, -3, 0, 3, 6, 9, 14];
      const sweep = [];
      for (const vy of rows) {
        const row = [];
        for (const dx of cols) row.push(await samplePoint(p, geo.wallViewX + dx, vy));
        sweep.push(row);
      }
      const ground = [await samplePoint(p, geo.wallViewX - 40, 150), await samplePoint(p, geo.wallViewX - 20, 100)];
      // Colour distance of each band column vs the ground reference.
      const dist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
      const bandVsGround = cols.map((dx, i) => sweep[1][i] ? dist(sweep[1][i], ground[0]) : -1);
      const bandDistinct = Math.max(...bandVsGround.slice(2, 7)) > 30;   // stone tint vs ground (measured ~46)
      // Clamp: drive the player past the boundary on BOTH axes; the live
      // update loop must hold them inside +-RIM.
      const clamp = await p.evaluate(`(async () => {
        const p = ${T}.state.player;
        const out = [];
        for (const [x, y] of [[${RIM + 80}, 0], [-${RIM + 80}, 0], [0, ${RIM + 80}], [0, -${RIM + 80}]]) {
          p.x = x; p.y = y;
          await new Promise(r => setTimeout(r, 350));
          out.push({ set: [x, y], got: [+p.x.toFixed(1), +p.y.toFixed(1)] });
        }
        return out;
      })()`, true);
      const held = clamp.every((c) => Math.abs(c.got[0]) <= RIM && Math.abs(c.got[1]) <= RIM);
      const png = await shot(p, 'g4-item7-arena-wall');
      const ok = bandDistinct && held && Array.isArray(wallSides) && wallSides.includes('E');
      return {
        verdict: ok ? 'VERIFIED FIXED' : 'STILL TRUE',
        numbers: `wall band rendered as its own colour: cam.x=${geo.camX} zs=${geo.zs} wallViewX=${geo.wallViewX} (band ${geo.bandW} view px wide, canvas ${geo.canvasW}px = ${geo.canvasW / 480}x view), renderer.arenaWall sides=[${wallSides}], band rgb vs ground dist=[${bandVsGround}] (ground ${JSON.stringify(ground[0])}); clamp held on all 4 drives: ${clamp.map(c => c.set.join(',') + '->' + c.got.join(',')).join(' | ')} (|x|,|y| <= ${RIM}); state.time=${pre.time}s`,
        png, errors: p.errors,
      };
    });
}

// 8. "all over the place" - coherence: no overlapping critical chrome, the
// menu overlay is OFF during live play, zero console errors.
async function item8() {
  return await withPage({ w: W, h: H, dpr: DPR, mobile: true, skipTour: false, startupScript: STARTUP_ALL },
    async (p) => {
      const pre = await runArmPreamble(p);
      // Include #hints in the measured set by toggling it ON with a REAL tap
      // (the same selector set main.js topChromeBottom() measures).
      await tapAt(p, '? button', await p.evaluate(`(() => { const r = document.querySelector('[data-act="help"]').getBoundingClientRect(); return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)]; })()`));
      await p.sleep(250);
      const chromeRects = await p.evaluate(`(() => {
        const sels = ['#hud', '#tc-cog', '#tc-help', '#tc-radar', '#tc-map', '#hints'];
        const out = {};
        for (const s of sels) {
          const el = document.querySelector(s);
          if (!el) { out[s] = null; continue; }
          const cs = getComputedStyle(el);
          if (cs.display === 'none') { out[s] = 'hidden'; continue; }
          const r = el.getBoundingClientRect();
          out[s] = [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
        }
        return out;
      })()`);
      const pairs = [];
      const names = Object.keys(chromeRects).filter((k) => Array.isArray(chromeRects[k]));
      for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
        const a = chromeRects[names[i]], b = chromeRects[names[j]];
        const ox = Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]));
        const oy = Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));
        if (ox > 0 && oy > 0) pairs.push(names[i] + 'x' + names[j] + '=' + ox * oy + 'px2');
      }
      const overlayOff = await p.evaluate(`getComputedStyle(document.getElementById('overlay')).display === 'none'`);
      const chromeLive = await p.evaluate(`(async () => ${T}.state.mode)()`);
      const hintsOn = await p.evaluate(`document.getElementById('hints').classList.contains('on')`);
      const png = await shot(p, 'g4-item8-chrome-coherence');
      const errs = p.errors.length;
      const ok = pairs.length === 0 && overlayOff && chromeLive === 'playing' && hintsOn && errs === 0;
      return {
        verdict: ok ? 'VERIFIED FIXED' : 'STILL TRUE',
        numbers: `overlapping critical-chrome pairs=${pairs.length}${pairs.length ? ' (' + pairs.join(', ') + ')' : ''} over [${names.join(', ')}] rects ${JSON.stringify(chromeRects)}; menu overlay OFF during live play=${overlayOff} (mode='${chromeLive}'); #hints on=${hintsOn}; console errors across the arm=${errs}${errs ? ' :: ' + p.errors.join(' | ') : ''}; state.time=${pre.time}s; TOUR_KEYS=${ALL_KEYS.length}`,
        png, errors: p.errors,
      };
    });
}

const ARMS = { 1: item1, 2: item2, 3: item3, 4: item4, 5: item5, 6: item6, 7: item7, 8: item8 };

// ---------------------------------------------------------------------------
// main (guarded so the unit test can import the report machinery browser-free)
// ---------------------------------------------------------------------------
function mainArgv() {
  const idx = process.argv.indexOf('--item');
  if (idx === -1) return null;
  const n = Number(process.argv[idx + 1]);
  if (!Number.isInteger(n) || n < 1 || n > 8) {
    console.error('bad --item: ' + process.argv[idx + 1] + ' (want 1..8)');
    process.exit(2);
  }
  return n;
}

const isMain = (() => {
  try { return process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href; }
  catch { return false; }
})();

async function main() {
  console.log(`G4 complaints verification - real Chrome ${W}x${H} @dpr${DPR}, TOUR_KEYS on this tree = ${ALL_KEYS.length} (${ALL_KEYS.join(', ')})`);
  const only = mainArgv();
  const ids = only ? [only] : [1, 2, 3, 4, 5, 6, 7, 8];
  const t0 = Date.now();
  const rows = [];
  // Full walk: arms run CONCURRENTLY (8 real Chromes) so the whole command
  // fits the owner's 60-second wall cap; each arm prints its own wall ms.
  const settled = await Promise.allSettled(ids.map(async (n) => {
    const s = Date.now();
    try {
      const r = await ARMS[n]();
      const ms = Date.now() - s;
      console.log(`item ${n} wall ${ms}ms (${(ms / 1000).toFixed(1)}s)`);
      return { n, ...r, ms };
    } catch (e) {
      const ms = Date.now() - s;
      console.error(`item ${n} COULD NOT RUN after ${ms}ms: ${e.message}`);
      return { n, error: e.message, ms };
    }
  }));
  let couldNotRun = 0;
  for (const s of settled) {
    const r = s.value;
    if (r.error) { couldNotRun++; rows.push({ n: r.n, verdict: 'COULD NOT RUN', evidence: r.error, png: '' }); continue; }
    rows.push({ n: r.n, verdict: r.verdict, evidence: r.numbers, png: r.png });
  }
  rows.sort((a, b) => a.n - b.n);
  console.log('--- G4 SUMMARY ---');
  for (const r of rows) console.log(fmtSummaryLine(r.n, r.verdict, r.evidence, r.png || 'none'));
  const problems = only ? [] : validateReport(rows);   // --item arms produce 1 row by design
  if (problems.length) console.log('REPORT SELF-CHECK PROBLEMS: ' + problems.join('; '));
  const totalErrs = settled.reduce((a, s) => a + (s.value && s.value.errors ? s.value.errors.length : 0), 0);
  console.log(`console errors across the walk: ${totalErrs}`);
  console.log(`total wall ${Date.now() - t0}ms (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  if (couldNotRun || problems.length) process.exit(1);
  process.exit(0);
}

if (isMain) main();
