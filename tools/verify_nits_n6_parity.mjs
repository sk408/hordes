// HORDES - tools/verify_nits_n6_parity.mjs (NITS N6, PIXEL-PARITY BAR).
// Usage: node tools/verify_nits_n6_parity.mjs pre|post
//
// 'pre'  (run on the UNCHANGED tree): paints the radar plate/rim the exact
//         way render.js drawRadar does today (the reference loops, injected
//         into the page) onto a scratch canvas and hashes the bytes; runs
//         the banner fit ladder (the reference widthOf/fitPx) on the live
//         ctx and records the sizes. Saved to /tmp/n6_pre.json.
// 'post' (run after the caches land): hashes the renderer's CACHE canvas and
//         compares it to a fresh reference paint (byte-identical bar), reads
//         the cached banner fit and compares it to a fresh ladder run, and
//         re-checks both against the saved 'pre' values. A cache that changes
//         one pixel is a regression, not an optimisation.
import { withPage } from './browser.mjs';
import { TOUR_KEYS } from '../src/tour.js';
import { readFileSync, writeFileSync } from 'node:fs';

const mode = process.argv[2];
if (mode !== 'pre' && mode !== 'post') {
  console.error('usage: node tools/verify_nits_n6_parity.mjs pre|post');
  process.exit(2);
}
const PRE_PATH = '/tmp/n6_pre.json';

// The REFERENCE implementations — verbatim copies of the live algorithms the
// caches must reproduce: drawRadar's plate/rim/ring/pip loops and the banner
// fit ladder (widthOf/fitPx over the same HUD constants).
const REF = `
const C = (await import('./src/config.js')).CONFIG;
const refPlateHash = async () => {
  const R = 34;                                   // render.js RADAR_DISPLAY_R
  const focusR = Math.round((C.AUTOPILOT.FOCUS_RANGE || 0) * R / 330);
  const off = document.createElement('canvas');
  off.width = 2 * R + 1; off.height = 2 * R + 1;
  const g = off.getContext('2d');
  const cx = R, cy = R;
  for (let dy = -R; dy <= R; dy++) {
    const half = Math.floor(Math.sqrt(R * R - dy * dy));
    g.fillStyle = C.HUD.PLATE;
    g.fillRect(cx - half, cy + dy, half * 2 + 1, 1);
  }
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > R || d <= R - 1.5) continue;
      g.fillStyle = C.HUD.FRAME;
      g.fillRect(cx + dx, cy + dy, 1, 1);
    }
  }
  if (focusR > 1) {
    g.fillStyle = 'rgba(184,224,255,0.28)';
    for (let dy = -focusR; dy <= focusR; dy++) {
      for (let dx = -focusR; dx <= focusR; dx++) {
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > focusR || d <= focusR - 1.2) continue;
        g.fillRect(cx + dx, cy + dy, 1, 1);
      }
    }
  }
  g.fillStyle = '#e8e8f0';
  g.fillRect(cx - 1, cy - 1, 3, 3);
  const d = g.getImageData(0, 0, off.width, off.height).data;
  let h = 0x811c9dc5;
  for (let i = 0; i < d.length; i++) { h ^= d[i]; h = (h * 0x01000193) >>> 0; }
  return { hash: h, bytes: d.length };
};
const refBannerFit = async () => {
  const m = await import('./src/main.js');
  const g = m.__TEST.renderer.ctx;
  const HUD = C.HUD;
  const W = C.VIEW_W;
  const padX = HUD.BANNER_PLATE_PAD_X;
  const edge = HUD.BANNER_EDGE_MARGIN;
  const maxTextW = W - 2 * edge - 2 * padX;
  const widthOf = (txt, px, bold) => {
    g.font = (bold ? 'bold ' : '') + px + 'px monospace';
    const mm = g.measureText(txt);
    return (mm && typeof mm.width === 'number' && mm.width > 0) ? mm.width : txt.length * px * 0.6021;
  };
  const fitPx = (txt, lo, hi, bold) => {
    let px = hi;
    while (px > lo && widthOf(txt, px, bold) > maxTextW) px--;
    return px;
  };
  const names = ['GRIMWARDEN THE UNDYING'];
  const verb = 'APPROACHES';
  const sub = 'THE CRYPT YAWNS FOR YOU';
  const longestName = names.reduce((a, s) => (s.length > a.length ? s : a), '');
  const namePx = fitPx(longestName, HUD.BANNER_NAME_MIN_PX, HUD.BANNER_NAME_MAX_PX, true);
  const verbMax = Math.max(HUD.BANNER_VERB_MIN_PX,
    Math.min(HUD.BANNER_VERB_MAX_PX, Math.round(namePx * HUD.BANNER_VERB_RATIO)));
  const verbPx = fitPx(verb, HUD.BANNER_VERB_MIN_PX, verbMax, true);
  const subPx = fitPx(sub, 10, HUD.BANNER_SUB_PX, false);
  const lines = [];
  for (const s of names) lines.push({ txt: s, px: namePx, bold: true });
  if (verb) lines.push({ txt: verb, px: verbPx, bold: true });
  if (sub) lines.push({ txt: sub, px: subPx, bold: false });
  const gap = HUD.BANNER_LINE_GAP, padY = HUD.BANNER_PLATE_PAD_Y;
  for (const l of lines) l.h = Math.round(l.px * 1.16) + gap;
  const widest = lines.reduce((mm, l) => Math.max(mm, widthOf(l.txt, l.px, l.bold)), 0);
  const plateW = Math.min(Math.round(widest + 2 * padX), W - 2 * edge);
  const bodyH = lines.reduce((a, l) => a + l.h, 0) - gap;
  const plateH = Math.round(bodyH + 2 * padY);
  return { namePx, verbPx, subPx, plateW, plateH };
};
`;

async function arm() {
  return withPage({ w: 390, h: 844, dpr: 3, mobile: true,
    startupScript: "try { localStorage.setItem('hordes_onboarded', '1'); } catch (e) {}" +
      Object.values(TOUR_KEYS).map(k => `try { localStorage.setItem('${k}', '1'); } catch (e) {}`).join('') },
    async (p) => {
      await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
      await p.waitFor("(async () => (await import('./src/main.js')).__TEST.state.mode !== 'intro')()", 15000);
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
      if (!playing) throw new Error('could not start the run');
      await p.waitFor("(async () => { const st = (await import('./src/main.js')).__TEST.state; return st.mode === 'playing' && st.time > 1.0; })()", 10000, 200);

      if (mode === 'post') {
        // Radar ON so the cache exists, banner up so the fit cache exists.
        await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true }))");
        await p.waitFor("(async () => (await import('./src/main.js')).__TEST.renderer.radar !== null)()", 4000);
        await p.evaluate(`(async () => {
          const st = (await import('./src/main.js')).__TEST.state;
          st.bossBanner = { names: ['GRIMWARDEN THE UNDYING'], verb: 'APPROACHES',
            title: 'GRIMWARDEN THE UNDYING APPROACHES', sub: 'THE CRYPT YAWNS FOR YOU', ttl: 2.5 };
        })()`);
        await p.sleep(300);
      }

      // The reference values, always computed fresh in-page.
      const ref = await p.evaluate(`(async () => { ${REF} ` +
        ` return { plate: await refPlateHash(), banner: await refBannerFit() }; })()`);

      if (mode === 'pre') {
        writeFileSync(PRE_PATH, JSON.stringify(ref));
        console.log('PRE capture saved to ' + PRE_PATH + ':');
        console.log('  plate hash ' + ref.plate.hash + ' (' + ref.plate.bytes + ' bytes)');
        console.log('  banner fit ' + JSON.stringify(ref.banner));
        return;
      }

      // POST: compare the LIVE cache against the fresh reference and the pre save.
      const pre = JSON.parse(readFileSync(PRE_PATH, 'utf8'));
      const cache = await p.evaluate(`(async () => {
        const m = await import('./src/main.js');
        const R = m.__TEST.renderer;
        const out = { builds: R.radarPlateBuilds, fits: R.bossBannerFits, plate: null, banner: null };
        const cv = R._radarPlate;
        if (cv) {
          const g = cv.getContext('2d');
          const d = g.getImageData(0, 0, cv.width, cv.height).data;
          let h = 0x811c9dc5;
          for (let i = 0; i < d.length; i++) { h ^= d[i]; h = (h * 0x01000193) >>> 0; }
          out.plate = { hash: h, bytes: d.length, w: cv.width, h: cv.height };
        }
        if (R._bannerFit) out.banner = { namePx: R._bannerFit.namePx, verbPx: R._bannerFit.verbPx,
          subPx: R._bannerFit.subPx, plateW: R._bannerFit.plateW, plateH: R._bannerFit.plateH };
        return out;
      })()`);

      let bad = 0;
      const check = (name, ok, detail) => { console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : ' :: ' + JSON.stringify(detail))); if (!ok) bad++; };
      check('radar cache canvas is byte-identical to the fresh reference paint (hash ' +
        cache.plate.hash + ' vs ' + ref.plate.hash + ')',
        cache.plate.hash === ref.plate.hash && cache.plate.bytes === ref.plate.bytes, { cache: cache.plate, ref: ref.plate });
      check('radar cache matches the PRE-capture hash (' + pre.plate.hash + ')',
        cache.plate.hash === pre.plate.hash, { pre: pre.plate, cache: cache.plate });
      check('banner cached fit equals the fresh ladder run (' + JSON.stringify(cache.banner) + ')',
        JSON.stringify(cache.banner) === JSON.stringify(ref.banner), { cache: cache.banner, ref: ref.banner });
      check('banner cached fit equals the PRE-capture fit',
        JSON.stringify(cache.banner) === JSON.stringify(pre.banner), { pre: pre.banner, cache: cache.banner });
      check('the plate built exactly once (builds=' + cache.builds + ') and the fit ran once (fits=' + cache.fits + ')',
        cache.builds === 1 && cache.fits === 1, cache);
      console.log(bad ? 'N6 PARITY: FAIL' : 'N6 PARITY: PASS - cache output byte-identical to the pre-cache algorithms');
      process.exitCode = bad ? 1 : 0;
    });
}
await arm();
