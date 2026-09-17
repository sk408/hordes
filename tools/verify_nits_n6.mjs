// HORDES - tools/verify_nits_n6.mjs (NITS N6, audit 2026-09-16, brief
// docs/briefs/NITS_N1_N6.md): MEASURE-FIRST. Two static-content draw paths
// were accused of per-frame waste — (a) the boss banner re-fitting its text
// via repeated measureText (fitPx walks the px ladder) every frame of its
// life; (b) the radar plate/rim repainting ~4,700 sqrt-gated 1px fills per
// frame for a static disc. The audit itself disclosed neither was measured
// in-browser, so this tool measures the REAL per-frame cost in real Chrome
// at 390x844 before anything lands:
//   - a real run playing, radar ON (toggled the real way, the R key);
//   - a boss banner driven LIVE (state.bossBanner — the exact object shape
//     spawnWaveBosses writes — painted by the real rAF loop for its whole
//     2.5s life; the game loop decrements ttl and clears it itself);
//   - per-path wall time via performance.now() wrappers around the renderer
//     methods the loop itself calls, plus a measureText call counter on the
//     live ctx (the fitPx seam).
// Verdict rule (the brief): >= 0.1 ms/frame -> land the cache (and re-measure
// here); < 0.1 ms/frame -> leave the code alone and report the number.
// Run: node tools/verify_nits_n6.mjs
import { withPage } from './browser.mjs';
import { TOUR_KEYS } from '../src/tour.js';

const SIZES = [[390, 844, 3]];

async function arm(w, h, dpr) {
  return withPage({ w, h, dpr, mobile: true,
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
      if (!playing) throw new Error(w + 'x' + h + ': could not start the run');
      await p.waitFor("(async () => { const st = (await import('./src/main.js')).__TEST.state; return st.mode === 'playing' && st.time > 1.0; })()", 10000, 200);

      // Instrument the two accused paths at the REAL seams the loop calls,
      // plus measureText on the live ctx (the fitPx cost).
      await p.evaluate(`(async () => {
        const m = await import('./src/main.js');
        const R = m.__TEST.renderer;
        const n6 = { radar: { ms: 0, n: 0 }, banner: { ms: 0, n: 0 }, measureText: 0, frames: 0 };
        window.__n6 = n6;
        for (const [name, slot] of [['drawRadar', 'radar'], ['drawBossBanner', 'banner']]) {
          const orig = R[name].bind(R);
          R[name] = (...a) => {
            const t0 = performance.now();
            try { return orig(...a); } finally { n6[slot].ms += performance.now() - t0; n6[slot].n++; }
          };
        }
        const ctx = R.ctx || (R.canvas && R.canvas.getContext('2d'));
        if (ctx) {
          const origM = ctx.measureText.bind(ctx);
          ctx.measureText = (...a) => { n6.measureText++; return origM(...a); };
        }
        const raf = window.requestAnimationFrame.bind(window);
        window.requestAnimationFrame = (cb) => raf((t) => { n6.frames++; cb(t); });
      })()`);

      // Radar ON the real way (the R key — the same seam the cog button uses).
      await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true }))");
      await p.waitFor("(async () => (await import('./src/main.js')).__TEST.renderer.radar !== null)()", 4000);
      // Baseline: radar-only frames.
      await p.sleep(1000);
      const radarOnly = await p.evaluate('window.__n6');

      // Boss banner driven LIVE: the exact object shape spawnWaveBosses
      // writes; the loop owns its whole life (ttl decrement + clear).
      await p.evaluate(`(async () => {
        const st = (await import('./src/main.js')).__TEST.state;
        st.bossBanner = {
          names: ['GRIMWARDEN THE UNDYING'],
          verb: 'APPROACHES',
          title: 'GRIMWARDEN THE UNDYING APPROACHES',
          sub: 'THE CRYPT YAWNS FOR YOU',
          ttl: 2.5,
        };
      })()`);
      await p.sleep(3000);   // the banner's full life + margin
      const withBanner = await p.evaluate('window.__n6');
      await p.waitFor("(async () => (await import('./src/main.js')).__TEST.state.bossBanner === null)()", 4000).catch(() => {});
      return { radarOnly, withBanner, errors: p.errors };
    });
}

for (const [w, h, dpr] of SIZES) {
  const a = await arm(w, h, dpr);
  if (a.errors.length) console.log('console errors: ' + JSON.stringify(a.errors));
  const r = a.radarOnly.radar, b0 = a.radarOnly.banner;
  const b = { ms: a.withBanner.banner.ms - b0.ms, n: a.withBanner.banner.n - b0.n };
  const meas = a.withBanner.measureText - a.radarOnly.measureText;
  const frames = a.withBanner.frames - a.radarOnly.frames;
  const per = (slot) => slot.n ? (slot.ms / slot.n) : 0;
  console.log(`${w}x${h}@dpr${dpr} N6 MEASUREMENT (real Chrome, live run, rAF loop):`);
  console.log(`  (b) radar plate/rim repaint: ${r.n} drawRadar calls, ${r.ms.toFixed(3)} ms total = ${per(r).toFixed(4)} ms/frame`);
  console.log(`  (a) boss banner re-fit: ${b.n} drawBossBanner calls (banner life), ${b.ms.toFixed(3)} ms total = ${per(b).toFixed(4)} ms/frame, ${meas} measureText calls (${b.n ? (meas / b.n).toFixed(1) : 0}/frame)`);
  console.log(`  loop frames counted: ${frames}`);
  const RADAR_LAND = per(r) >= 0.1, BANNER_LAND = per(b) >= 0.1;
  console.log(`  VERDICT per the brief (>= 0.1 ms/frame lands, below leaves the code alone):`);
  console.log(`    radar:  ${per(r).toFixed(4)} ms/frame -> ${RADAR_LAND ? 'LAND the prerendered-plate cache' : 'DO NOT LAND — report the number, leave the code alone'}`);
  console.log(`    banner: ${per(b).toFixed(4)} ms/frame -> ${BANNER_LAND ? 'LAND the per-banner fit cache' : 'DO NOT LAND — report the number, leave the code alone'}`);
}
