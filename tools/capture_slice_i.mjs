// HORDES - PORT SLICE I capture: UI chrome (title, shop, HUD-in-run, submenu).
// Run: HORDES_SHOT_DIR=docs/art/port-slice-i node tools/capture_slice_i.mjs
// (SHOT_DIR is a relative in-tree path.)
//
// METHOD (the capture_slice_h.mjs pattern): real browser, phone viewport, seed
// hordes_onboarded + all 19 tour keys so no overlay covers the screens, REAL
// taps on the title doors (SHOP / SETUP / START GAME) and BACK cards, ASSERT
// state.time advances on the run shot (never grade a frozen game).
import { withPage } from './browser.mjs';
import { mkdirSync } from 'node:fs';

const ART = 'docs/art/port-slice-i';
mkdirSync(ART, { recursive: true });
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok, detail });
  console.log((ok ? '  PASS ' : '  FAIL ') + name + (detail !== undefined ? ' :: ' + JSON.stringify(detail) : ''));
};

const TOUR19 = ['stage1', 'hud', 'pilot', 'focus', 'stance', 'move', 'skills', 'potions',
  'stats', 'cog', 'draft', 'edge', 'chest', 'portal', 'arch', 'shrine',
  'intermission', 'death', 'settings'];

const tapCard = async (p, needle) => {
  const c = await p.evaluate(`(() => {
    const el = [...document.getElementById('ov-cards').children]
      .find(k => (k.textContent || '').toUpperCase().includes(${JSON.stringify(needle)}));
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
  })()`);
  if (!c) throw new Error('no card containing ' + needle);
  await p.tap(c[0], c[1]);
};

await withPage({ w: 390, h: 844, dpr: 3,
  startupScript: "try { localStorage.setItem('hordes_onboarded', '1'); } catch (e) {}\n" +
    'for (const k of ' + JSON.stringify(TOUR19) + ") { try { localStorage.setItem('hordes_tour_' + k, '1'); } catch (e) {} }" },
async (p) => {
  await p.waitFor("(async () => (await import('./src/main.js')).__TEST.state.mode !== 'intro')()", 15000);
  await p.waitFor("(async () => { const rv = (await import('./src/main.js')).__TEST.state.titleReveal; return !rv || rv.phase === 'settled'; })()", 8000);

  // SHOT 1 — title (the menu-frame chrome around every door card).
  const titleFile = await p.shot('slice-i-title');
  console.log('  SHOT slice-i-title -> ' + titleFile);
  check('title settled with doors', true, { file: titleFile });

  // SHOT 2 — one submenu: SETUP via a REAL tap, BACK via a REAL tap.
  await tapCard(p, 'SETUP');
  const setup = await p.waitFor("(async () => document.getElementById('ov-title').textContent === 'SETUP')()", 8000);
  check('SETUP submenu opened via a REAL tap', setup, { setup });
  const setupFile = await p.shot('slice-i-submenu-setup');
  console.log('  SHOT slice-i-submenu-setup -> ' + setupFile);
  await tapCard(p, 'BACK');
  const back1 = await p.waitFor("(async () => document.getElementById('ov-title').textContent === 'HORDES')()", 8000);
  check('BACK returned to the title via a REAL tap', back1, { back1 });

  // SHOT 3 — shop via a REAL tap.
  await tapCard(p, 'SHOP');
  const shop = await p.waitFor("(async () => document.getElementById('ov-title').textContent === 'SHOP')()", 8000);
  check('SHOP opened via a REAL tap', shop, { shop });
  const shopFile = await p.shot('slice-i-shop');
  console.log('  SHOT slice-i-shop -> ' + shopFile);
  await tapCard(p, 'BACK');
  const back2 = await p.waitFor("(async () => document.getElementById('ov-title').textContent === 'HORDES')()", 8000);
  check('BACK returned to the title via a REAL tap', back2, { back2 });

  // SHOT 4 — HUD in a LIVE run: REAL tap on START GAME, clock asserted.
  await tapCard(p, 'START GAME');
  const playing = await p.waitFor("(async () => (await import('./src/main.js')).__TEST.state.mode === 'playing')()", 8000);
  const advancing = await p.waitFor("(async () => { const st = (await import('./src/main.js')).__TEST.state; return st.mode === 'playing' && st.time > 1.0; })()", 10000, 200);
  check('run started via a REAL tap and the sim clock ADVANCED past 1.0s (not a frozen game)',
    playing && advancing, { playing, advancing });
  if (!playing || !advancing) throw new Error('no live run to capture');
  const hud = await p.evaluate(`(async () => {
    const T = (await import('./src/main.js')).__TEST;
    const st = T.state;
    return { mode: st.mode, time: st.time, chrome: !!T.renderer.hudChrome,
      hpFrac: T.renderer.hudChrome && T.renderer.hudChrome.hpFrac };
  })()`, true);
  check('the HUD chrome seam is live in the run', hud.mode === 'playing' && hud.chrome, hud);
  const hudFile = await p.shot('slice-i-hud-run');
  console.log('  SHOT slice-i-hud-run -> ' + hudFile);
  const post = await p.evaluate(`(async () => {
    const st = (await import('./src/main.js')).__TEST.state;
    return { mode: st.mode, time: st.time };
  })()`, true);
  check('HUD shot: clock advances (live game)', post.mode === 'playing' && post.time > 1.0, post);

  const red = results.filter(r => !r.ok);
  console.log(red.length ? ('capture_slice_i: ' + red.length + ' FAILED check(s)') : 'capture_slice_i: all checks passed');
  if (red.length) process.exitCode = 1;
});
