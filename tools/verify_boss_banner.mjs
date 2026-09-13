// HORDES — VERIFY the two-line boss banner at phone size (390x844 CSS, the
// canvas view space is 480x300).
//
// WHY THIS EXISTS: there is no vision model on this host, so "look at the
// screenshot" is not evidence. This drives a REAL headless Chrome (tools/
// browser.mjs), forces each boss wave through the game's own spawn path, then
// paints the live banner onto an OffscreenCanvas through a recording context
// and measures two independent ways:
//   1. ctx.measureText() with the EXACT font string the renderer set for each
//      line (the recorder captures the font at each fillText call);
//   2. a PIXEL SCAN of the painted canvas — the ink bbox (non-plate,
//      non-band pixels) and the plate bbox (the recorded fillRect).
// Acceptance: no bbox touches x=0 or x=479, and the plate is narrower than the
// view.
//
// Usage: node tools/verify_boss_banner.mjs [--waves 1,3,6,9]
import { withPage } from './browser.mjs';

const argv = process.argv.slice(2);
const WAVES = argv.includes('--waves')
  ? argv[argv.indexOf('--waves') + 1].split(',').map(Number)
  : [1, 3, 6, 9];

const PAGE = `
(async () => {
  const cfg = await import('/src/config.js');
  const C = cfg.CONFIG;
  const main = await import('/src/main.js');   // SAME module instance as the page
  const T = main.__TEST;

  // Recording 2d context: passes every call through to the real OffscreenCanvas
  // ctx (so measureText is the real font engine and the pixels are real), while
  // capturing the font in force at each fillText / the fillStyle at each fillRect.
  function recorder(real) {
    const rec = { texts: [], rects: [] };
    let font = '', fill = '';
    const p = new Proxy(real, {
      get(t, prop) {
        if (prop === 'font') return font;
        if (prop === 'fillStyle') return fill;
        if (prop === 'measureText') return (s) => t.measureText(s);
        if (prop === 'fillText') return (txt, x, y) => { rec.texts.push({ txt, x, y, font, fill }); return t.fillText(txt, x, y); };
        if (prop === 'fillRect') return (x, y, w, h) => { rec.rects.push({ x, y, w, h, fill }); return t.fillRect(x, y, w, h); };
        const v = t[prop];
        return typeof v === 'function' ? v.bind(t) : v;
      },
      set(t, prop, v) {
        if (prop === 'font') font = v;
        if (prop === 'fillStyle') fill = v;
        t[prop] = v;
        return true;
      },
    });
    return { ctx: p, rec };
  }

  const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const out = { view: { w: C.VIEW_W, h: C.VIEW_H }, css: { w: innerWidth, h: innerHeight }, rows: [] };

  for (const wave of ${JSON.stringify(WAVES)}) {
    T.startRun();
    await frame(); await frame(); await frame();
    const st = T.state;
    st.wave.num = wave;
    st.wave.endsAt = st.time;              // the boss spawns on the next tick
    let guard = 0;
    while (!(st.wave.bosses || []).length && guard++ < 200) await frame();
    const banner = st.bossBanner;
    if (!banner) { out.rows.push({ wave, error: 'no banner spawned' }); continue; }
    // alpha 1 is the steady state (ramps in over 0.35s, out over the last 0.6s)
    await sleep(450);
    const live = st.bossBanner || banner;

    // ---- paint the LIVE banner onto a clean offscreen canvas ----
    const cv = new OffscreenCanvas(C.VIEW_W, C.VIEW_H);
    const real = cv.getContext('2d', { willReadFrequently: true });
    const { ctx, rec } = recorder(real);
    T.renderer.drawBossBanner(ctx, { bossBanner: { names: live.names, verb: live.verb, title: live.title, sub: live.sub, ttl: 2.0 } });

    // ---- plate bbox: the widest dark plate rect (PLATE_SOLID) ----
    const plateColor = C.HUD.PLATE_SOLID;
    const plates = rec.rects.filter((r) => r.fill === plateColor);
    const plate = plates.sort((a, b) => b.w * b.h - a.w * a.h)[0];

    // ---- pixel scan ----
    // Plate pixels composite to a known premultiplied-free RGBA over the
    // transparent canvas; the letterbox bands (#08080f, full width) are
    // excluded by scanning only the rows strictly inside the plate.
    const px = real.getImageData(0, 0, C.VIEW_W, C.VIEW_H).data;
    const isPlate = (i) => px[i] === 6 && px[i + 1] === 6 && px[i + 2] === 12;
    const inkAt = (x, y) => { const i = (y * C.VIEW_W + x) * 4; return px[i + 3] > 0 && !isPlate(i); };
    let ink = { x0: 1e9, y0: 1e9, x1: -1, y1: -1 };
    if (plate) {
      for (let y = plate.y + 1; y < plate.y + plate.h - 1; y++) {
        for (let x = 0; x < C.VIEW_W; x++) {
          if (!inkAt(x, y)) continue;
          if (x < ink.x0) ink.x0 = x; if (x > ink.x1) ink.x1 = x;
          if (y < ink.y0) ink.y0 = y; if (y > ink.y1) ink.y1 = y;
        }
      }
    }

    // ---- per-line measured width, in the EXACT font the renderer painted ----
    const lines = [];
    for (const t of rec.texts) {
      if (t.fill !== '#ffd75e' && t.fill !== '#e4e4ee') continue;   // the visible pass (skip the shade pass)
      real.font = t.font;
      const m = real.measureText(t.txt).width;
      lines.push({ txt: t.txt, font: t.font, px: parseInt(/(\\d+)px/.exec(t.font)[1], 10), width: +m.toFixed(2), y: t.y });
    }
    out.rows.push({
      wave, bossCount: st.wave.bosses.length, names: live.names || null, verb: live.verb || null,
      lines, plate: plate ? { x: plate.x, y: plate.y, w: plate.w, h: plate.h } : null,
      ink: ink.x1 >= 0 ? ink : null, view: { w: C.VIEW_W, h: C.VIEW_H },
    });
  }
  return out;
})()
`;

const res = await withPage({ w: 390, h: 844, dpr: 2, mobile: true }, async (p) => {
  await p.waitFor('true', 500);
  const data = await p.evaluate(PAGE, true);
  return { data, errors: p.errors, viewport: p.viewport };
});

const { data } = res;
console.log(`\nHORDES boss banner — view ${data.view.w}x${data.view.h} (canvas), page ${data.css.w}x${data.css.h} CSS\n`);
let fail = 0;
const check = (label, ok, detail = '') => {
  if (!ok) { fail++; console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); }
  else console.log('  ok   ' + label + (detail ? ' — ' + detail : ''));
};
for (const r of data.rows) {
  if (r.error) { check(`wave ${r.wave}`, false, r.error); continue; }
  console.log(`--- wave ${r.wave} (${r.bossCount} boss${r.bossCount > 1 ? 'es' : ''}) names=${JSON.stringify(r.names)} verb=${JSON.stringify(r.verb)}`);
  for (const l of r.lines) {
    console.log(`      ${String(l.px).padStart(2)}px  w=${String(l.width).padStart(7)}  x=[${(r.view.w / 2 - l.width / 2).toFixed(1)}, ${(r.view.w / 2 + l.width / 2).toFixed(1)}]  "${l.txt}"  [${l.font}]`);
  }
  console.log(`      plate ${JSON.stringify(r.plate)}   ink ${JSON.stringify(r.ink)}`);
  const fits = r.lines.every((l) => l.width <= r.view.w - 2 * 14);
  check(`wave ${r.wave}: every line fits the text box`, fits, r.lines.map((l) => `${l.px}px/${l.width}`).join(' '));
  check(`wave ${r.wave}: plate narrower than the view`, !!r.plate && r.plate.w < r.view.w, r.plate && `plate ${r.plate.x}..${r.plate.x + r.plate.w} of ${r.view.w}`);
  check(`wave ${r.wave}: plate clear of both edges`, !!r.plate && r.plate.x > 0 && r.plate.x + r.plate.w < r.view.w);
  check(`wave ${r.wave}: INK clear of both edges (no glyph at x=0 / x=479)`,
    !!r.ink && r.ink.x0 > 0 && r.ink.x1 < r.view.w - 1, r.ink && `ink x=[${r.ink.x0}, ${r.ink.x1}] y=[${r.ink.y0}, ${r.ink.y1}]`);
  check(`wave ${r.wave}: NAME line is the largest type`, (() => {
    const n = r.lines.findIndex((l) => (r.names || []).includes(l.txt));
    return n >= 0 && r.lines.slice(0, (r.names || []).length).every((l) => l.px > (r.verb ? r.lines.find((q) => q.txt === r.verb).px : 0));
  })(), r.lines.map((l) => l.px).join('px / ') + 'px');
}
console.log('');
if (res.errors.length) { console.log('PAGE ERRORS:'); for (const e of res.errors) console.log('  ' + e); }
console.log(fail === 0 ? 'BOSS BANNER: PASS' : `BOSS BANNER: FAIL (${fail})`);
process.exit(fail === 0 ? 0 : 1);
