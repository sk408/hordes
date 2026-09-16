// HORDES - tools/verify_upfront.mjs (UP-FRONT CONTROLS, owner 2026-09-16:
// "Wouldn't the buttons need to be explained right away? ...people complained
// about not understanding"). REAL browser, REAL taps, FRESH profile:
//   1. THE FIRST-RUN GATE end-to-end: fresh boot -> title -> tap START GAME
//      -> the reference screen (HOW TO PLAY) shows BEFORE the run, no hint
//      strip under it -> tap GOT IT -> the run is live and the clock
//      advances; a second run never re-shows the gate.
//   2. THE NAMED CONTROL ROW: every cog-row button carries a readable NAME
//      (SETTINGS / HELP / RADAR / MAP), each fully inside the viewport, the
//      row causes no document overflow, and the labels never overlap each
//      other — at 390x844 (phone) and 1280x800 (desktop).
// Run: node tools/verify_upfront.mjs
import { withPage } from './browser.mjs';
import { TOUR_KEYS } from '../src/tour.js';

const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); };

async function arm(w, h, dpr, mobile) {
  // Fresh profile for the GATE, with the first-run tour flags preseeded: the
  // tour has its own coverage (test_tour.mjs), and its shade swallows taps
  // over the death screen, which would deadlock this verifier's RETURN TO
  // TITLE leg. Same preseed the headless smoke uses.
  const seed = "try { localStorage.removeItem('hordes_onboarded'); } catch (e) {};" +
    Object.values(TOUR_KEYS).map(k => `try { localStorage.setItem('${k}', '1'); } catch (e) {}`).join('');
  return withPage({ w, h, dpr, mobile, startupScript: seed },
    async (p) => {
      await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
      await p.waitFor("(async () => (await import('./src/main.js')).__TEST.state.mode !== 'intro')()", 15000);
      await p.waitFor("(async () => { const st = (await import('./src/main.js')).__TEST.state; return st.mode === 'title' || st.mode === 'menu'; })()", 8000);
      await p.waitFor("(async () => { const rv = (await import('./src/main.js')).__TEST.state.titleReveal; return !rv || rv.phase === 'settled'; })()", 8000);
      const tapCard = async (needle) => {
        // Retry up to ~3s: a card mid-transition (death cinematic handing
        // off to the screen) has a zero rect — tap only a laid-out card.
        for (let tries = 0; tries < 12; tries++) {
          const c = await p.evaluate(`(() => {
            const el = [...document.getElementById('ov-cards').children]
              .find(k => (k.textContent || '').toUpperCase().includes(${JSON.stringify(needle)}));
            if (!el) return null;
            el.scrollIntoView({ block: 'center' });
            const r = el.getBoundingClientRect();
            if (r.width <= 0 || r.height <= 0) return [];
            return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
          })()`);
          if (c && c.length === 2) { await p.sleep(80); await p.tap(c[0], c[1]); return; }
          await p.sleep(250);
        }
        throw new Error('no tappable ' + needle + ' card');
      };

      // ---- the gate ----
      const titleFirst = await p.evaluate("document.getElementById('ov-title').textContent");
      await tapCard('START GAME');
      const gate = await p.evaluate(`(() => ({
        title: document.getElementById('ov-title').textContent,
        howto: document.getElementById('overlay').classList.contains('howto'),
        hintStrip: !!document.querySelector('#hint-strip'),
        mode: (window.__gateMode = true),
      }))()`);
      const gateMode = await p.evaluate("(async () => (await import('./src/main.js')).__TEST.state.mode)()");
      await tapCard('GOT IT');
      const playing = await p.waitFor("(async () => (await import('./src/main.js')).__TEST.state.mode === 'playing')()", 8000);
      const advancing = await p.waitFor("(async () => { const st = (await import('./src/main.js')).__TEST.state; return st.mode === 'playing' && st.time > 0.5; })()", 10000, 200);

      // ---- the named control row (live during the run) ----
      const row = await p.evaluate(`(() => {
        const ids = ['tc-map', 'tc-radar', 'tc-help', 'tc-cog'];
        const want = { 'tc-map': 'MAP', 'tc-radar': 'RADAR', 'tc-help': 'HELP', 'tc-cog': 'SETTINGS' };
        const px = (v) => Math.round(v * 100) / 100;
        const btns = ids.map((id) => {
          const el = document.getElementById(id);
          const r = el.getBoundingClientRect();
          return { id, label: el.textContent.trim(), want: want[id],
            x: px(r.x), r: px(r.right), y: px(r.y), b: px(r.bottom), w: px(r.width), h: px(r.height) };
        });
        return { btns, vw: innerWidth, vh: innerHeight,
          docOverflowX: document.documentElement.scrollWidth - innerWidth };
      })()`);

      // ---- the gate never re-shows: die -> RETURN TO TITLE -> START GAME ----
      await p.evaluate("(async () => (await import('./src/main.js')).__TEST.die())()");
      await p.waitFor("(async () => ['dead','death-cine'].includes((await import('./src/main.js')).__TEST.state.mode))()", 8000);
      const mode1 = await p.evaluate("(async () => (await import('./src/main.js')).__TEST.state.mode)()");
      if (mode1 === 'death-cine') {
        await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }))");
        await p.sleep(300);
      }
      // RETURN TO TITLE: the death screen's own TITLE card (the real path).
      await tapCard('TITLE');
      await p.waitFor("(async () => (await import('./src/main.js')).__TEST.state.mode === 'title')()", 8000);
      await p.waitFor("(async () => { const rv = (await import('./src/main.js')).__TEST.state.titleReveal; return !rv || rv.phase === 'settled'; })()", 8000);
      await tapCard('START GAME');
      const second = await p.waitFor("(async () => (await import('./src/main.js')).__TEST.state.mode === 'playing')()", 8000);
      const secondTitle = await p.evaluate("document.getElementById('ov-title').textContent");

      const shot = await p.shot('upfront-' + w + 'x' + h);
      return { titleFirst, gate, gateMode, playing, advancing, row, second, secondTitle, shot, errors: p.errors };
    });
}

const SIZES = [[390, 844, 3, true], [1280, 800, 1, false]];
const arms = {};
for (const [w, h, dpr, mobile] of SIZES) arms[w + 'x' + h] = await arm(w, h, dpr, mobile);

for (const [w, h] of SIZES.map(([w, h]) => [w, h])) {
  const tag = w + 'x' + h, a = arms[tag];
  check(tag + ' fresh boot lands on the TITLE (got "' + a.titleFirst + '")', a.titleFirst === 'HORDES', a.titleFirst);
  check(tag + ' START GAME shows the reference gate BEFORE the run',
    a.gate.title === 'HOW TO PLAY' && a.gate.howto && a.gateMode !== 'playing',
    { gate: a.gate, mode: a.gateMode });
  check(tag + ' no hint strip mounts under the gate', !a.gate.hintStrip, a.gate.hintStrip);
  check(tag + ' GOT IT starts the run and the clock advances', a.playing && a.advancing,
    { playing: a.playing, advancing: a.advancing });
  const bad = a.row.btns.filter(b => b.label !== b.want);
  check(tag + ' every cog-row button is NAMED (' + a.row.btns.map(b => b.label).join(' / ') + ')',
    bad.length === 0, bad);
  const off = a.row.btns.filter(b => b.x < -0.01 || b.y < -0.01 || b.r > a.row.vw + 0.01 || b.b > a.row.vh + 0.01);
  check(tag + ' every named button sits fully inside the viewport', off.length === 0, off);
  check(tag + ' the named row causes no document overflow (' + a.row.docOverflowX + 'px)',
    a.row.docOverflowX <= 1, a.row.docOverflowX);
  const sorted = [...a.row.btns].sort((x, y2) => x.x - y2.x);
  let overlap = false;
  for (let i = 1; i < sorted.length; i++) if (sorted[i].x < sorted[i - 1].r - 0.01) overlap = true;
  check(tag + ' the named buttons do not overlap each other', !overlap, sorted.map(b => [b.x, b.r]));
  check(tag + ' the gate never re-shows: second START GAME goes straight into the run',
    a.second && a.secondTitle !== 'HOW TO PLAY', { second: a.second, title: a.secondTitle });
}
const allErrors = SIZES.map(([w, h]) => arms[w + 'x' + h].errors).flat();
check('no console errors in any arm', allErrors.length === 0, allErrors);

const bad = results.filter((r) => !r.ok).length;
for (const r of results) console.log((r.ok ? 'ok   ' : 'FAIL ') + r.name + (r.ok ? '' : ' :: ' + JSON.stringify(r.detail)));
console.log(bad ? 'VERIFY UPFRONT: FAIL'
  : 'VERIFY UPFRONT: PASS - fresh START GAME shows the reference gate before the run (no hint under it, GOT IT starts a live, advancing run, never re-shown), ' +
    'and the control row is self-explaining: SETTINGS / HELP / RADAR / MAP, on-screen, non-overlapping, at phone and desktop widths');
process.exit(bad ? 1 : 0);
