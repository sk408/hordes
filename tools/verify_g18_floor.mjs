// HORDES - tools/verify_g18_floor.mjs (G18 SLICE 2, acceptance 4: the game
// still plays on the restored tree). Real Chrome, 390x844 @dpr3 touch:
//   1. ALL TOUR_KEYS set up front (list derived from src/tour.js itself, so a
//      new key makes this stale-list-visible, never silently short).
//   2. START GAME tapped from the title; mode polled to 'playing'.
//   3. state.time > 1.0 asserted BEFORE any measurement is claimed.
//   4. ONE PNG at the device's natural backing store, asserted exactly
//      1170x2532, saved to docs/art/g18-floor-2026-09-15/.
//   5. Zero console errors across the whole arm.
// Run: node tools/verify_g18_floor.mjs
import { withPage } from './browser.mjs';
import { copyFileSync, mkdirSync } from 'node:fs';
import { TOUR_KEYS } from '../src/tour.js';

const ART = 'docs/art/g18-floor-2026-09-15';
mkdirSync(ART, { recursive: true });

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok, detail });
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (detail !== undefined ? ' :: ' + JSON.stringify(detail) : ''));
};

const KEY_NAMES = Object.values(TOUR_KEYS);            // 'hordes_tour_*' full ids
const STARTUP = `try {
  localStorage.setItem('hordes_onboarded', '1');
  for (const k of ${JSON.stringify(KEY_NAMES)}) localStorage.setItem(k, '1');
} catch (e) {}`;

const MAIN = "(async () => (await import('./src/main.js')).__TEST)()";
const cardCenter = (title) => `(() => {
  const el = [...document.getElementById('ov-cards').children]
    .find(k => (k.textContent || '').includes(${JSON.stringify(title)}));
  if (!el) return null;
  el.scrollIntoView({ block: 'center' });
  const r = el.getBoundingClientRect();
  return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
})()`;

const shotPath = await withPage({ w: 390, h: 844, dpr: 3, mobile: true, skipTour: false, startupScript: STARTUP },
  async (p) => {
    // Boot to the title (intro skip -> reveal settle), the standard pair.
    await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
    await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode !== 'intro')()`, 15000);
    await p.waitFor(`(async () => { const rv = (await import('./src/main.js')).__TEST.state.titleReveal; return !rv || rv.phase === 'settled'; })()`, 8000);
    check('title live, all tour flags set', true, { keys: KEY_NAMES.length });

    const flags = await p.evaluate(`(() => {
      let n = 0; for (const k of ${JSON.stringify(KEY_NAMES)}) if (localStorage.getItem(k) === '1') n++;
      return n;
    })()`);
    check('all ' + KEY_NAMES.length + ' TOUR_KEYS are "1" in localStorage', flags === KEY_NAMES.length, { flags });

    const c = await p.evaluate(cardCenter('START GAME'));
    if (!c) throw new Error('no START GAME card on the title');
    const up = p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode === 'playing')()`, 12000, 40);
    await p.tap(c[0], c[1]);
    check('START GAME tap -> mode=playing', await up);

    // The bar: state.time > 1.0 BEFORE measuring anything else.
    const tOk = await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.time > 1.0)()`, 8000, 50);
    const tVal = await p.evaluate(`(async () => (await import('./src/main.js')).__TEST.state.time)()`);
    check('state.time > 1.0 asserted BEFORE measuring', tOk && tVal > 1.0, { time: +tVal.toFixed(2) });

    const live = await p.evaluate(`(async () => {
      const T = (await import('./src/main.js')).__TEST;
      const p = T.state.player;
      return { mode: T.state.mode, time: +T.state.time.toFixed(2), hp: Math.round(p.hp),
        maxHp: p.stats.maxHp, enemies: T.state.enemies.length, wave: T.state.wave.num };
    })()`);
    check('run is live (enemies spawned, wave 1)', live.mode === 'playing' && live.enemies > 0, live);

    const f = await p.shot('g18_floor_live');
    // hpfill [40,77] is the HUD HP bar's painted fill (render.js drawBar(22,16,
    // 110,5,'#ff5566') in VIEW coords -> CSS x 18..107, y 75..78 at the 390x844
    // viewport; located by scanning the PNG for the red-dominant run, not guessed).
    const dims = await p.readShot(f, { corner: [10, 10], hpfill: [40, 77] });
    check('PNG backing store exactly 1170x2532', dims.w === 1170 && dims.h === 2532, { w: dims.w, h: dims.h });
    // The HUD's HP bar fill is red-dominant; the arena corner is not. The
    // first probe compared two dark pixels (arena center vs corner) and
    // proved nothing -- this sample reads the actual HUD paint.
    const hp = dims.px.hpfill;
    check('gameplay pixels present (HP fill red-dominant vs arena corner)',
      hp[0] > hp[1] && hp[0] > hp[2] && JSON.stringify(dims.px.corner) !== JSON.stringify(hp),
      { hpfill: hp, corner: dims.px.corner });

    check('zero console errors', p.errors.length === 0, p.errors);
    return f;
  });

copyFileSync(shotPath, ART + '/g18_floor_live.png');
const allOk = results.every(r => r.ok);
console.log('VERIFY G18 FLOOR (game still plays on the restored tree): ' + (allOk ? 'PASS' : 'FAIL'));
console.log('screenshot: ' + ART + '/g18_floor_live.png');
if (!allOk) process.exit(1);
