// HORDES — VERIFY the horde warning stays OFF the dodge path (player review
// addendum 2026-09-17: "could you please remove the big flashing warning in
// the middle of the game when a horde is coming... it is really hard to see
// through it"; owner: keep it, ZERO warning pixels inside the play area).
//
// This is the FAILS-FIRST acceptance for the fix: it must FAIL against the
// pre-fix build (the centre-plate banner) and PASS after. It drives a REAL
// headless Chrome (tools/browser.mjs), forces a boss wave through the game's
// own spawn path, and measures the banner's pixels two ways:
//   1. the recording ctx's fillRect/fillText records (exact geometry);
//   2. a pixel scan of the painted canvas (what is actually on screen).
//
// THE RULE, as stated in the task: the play area is the region the player
// dodges through, around the player. The HUD band (top strip) and the screen
// edges are NOT part of it. Between the warning's start and first contact:
//   - the PLAY RECT contains ZERO warning pixels (plate, ink, letterbox — any
//     banner paint), at BOTH phone sizes;
//   - the HUD-band warning state is visible and legible (ink on a plate in
//     the top band);
//   - the edge cue is visible on the edge the horde enters from;
//   - the warning's armed ttl ends at least CLEAR_MARGIN before the fastest
//     spawn's estimated contact (distance / speed, stationary player).
//
// Usage: node tools/verify_horde_warning.mjs
import { withPage } from './browser.mjs';

const PAGE = `
(async () => {
  const cfg = await import('/src/config.js');
  const C = cfg.CONFIG;
  const main = await import('/src/main.js');   // SAME module instance as the page
  const T = main.__TEST;

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

  T.startRun();
  await frame(); await frame(); await frame();
  const st = T.state;
  st.wave.num = 3;                 // a two-boss wave: the widest old banner
  st.wave.endsAt = st.time;        // the boss spawns on the next tick
  let guard = 0;
  while (!(st.wave.bosses || []).length && guard++ < 200) await frame();
  const banner = st.bossBanner;
  if (!banner) return { error: 'no banner spawned' };

  // First-contact estimate for the FASTEST spawn: distance/speed, stationary
  // player (the player moving toward the spawn only makes contact sooner, so
  // this is the GENEROUS bound the timing assertion uses).
  const p0 = st.player;
  let eta = 1e9, edgeOf = null;
  const edges = new Set();
  for (const b of st.wave.bosses) {
    const dx = b.x - p0.x, dy = b.y - p0.y;
    const dist = Math.hypot(dx, dy);
    if (dist / (b.speed || 1) < eta) eta = dist / (b.speed || 1);
    const c = dx / (dist || 1), s = dy / (dist || 1);
    const e = Math.abs(c) >= Math.abs(s) ? (c > 0 ? 'right' : 'left') : (s > 0 ? 'bottom' : 'top');
    edges.add(e);
  }

  // Paint the LIVE banner onto a clean offscreen canvas at FULL alpha
  // (ttl 2.0 > any fade-out window, so the geometry measured is the worst
  // case the player can ever see).
  const cv = new OffscreenCanvas(C.VIEW_W, C.VIEW_H);
  const real = cv.getContext('2d', { willReadFrequently: true });
  const { ctx, rec } = recorder(real);
  T.renderer.drawBossBanner(ctx, { bossBanner: { names: banner.names, verb: banner.verb,
    title: banner.title, sub: banner.sub, ttl: 2.0, dur: banner.dur || 2.0,
    edges: banner.edges || null }, player: p0, bannerHold: 0 });

  // EVERY pixel the banner painted (alpha>0 anywhere in the canvas: plate,
  // rules, letterbox, ink — regardless of colour).
  const px = real.getImageData(0, 0, C.VIEW_W, C.VIEW_H).data;
  const painted = [];
  for (let y = 0; y < C.VIEW_H; y++) {
    for (let x = 0; x < C.VIEW_W; x++) {
      if (px[(y * C.VIEW_W + x) * 4 + 3] > 0) painted.push({ x, y });
    }
  }
  const stripInk = rec.texts.filter(t => t.fill === '#ffd75e' || t.fill === '#e4e4ee');
  return {
    view: { w: C.VIEW_W, h: C.VIEW_H }, css: { w: innerWidth, h: innerHeight },
    bossCount: st.wave.bosses.length, names: banner.names,
    armedTtl: banner.ttl, eta, edges: [...edges],
    texts: rec.texts, stripInkCount: stripInk.length,
    painted, paintedCount: painted.length,
  };
})()
`;

const SIZES = [
  { w: 390, h: 844, dpr: 2, mobile: true },
  { w: 320, h: 568, dpr: 2, mobile: true },
];

// The PLAY RECT: the view minus the HUD band (top 18 view px) and the screen
// edges (8 view px each side) — the region the player dodges through.
const HUD_BAND = 18, EDGE = 8;

let fail = 0, total = 0;
const check = (label, ok, detail = '') => {
  total++;
  if (!ok) { fail++; console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); }
  else console.log('  ok   ' + label + (detail ? ' — ' + detail : ''));
};

for (const size of SIZES) {
  const res = await withPage(size, async (p) => {
    await p.waitFor('true', 500);
    const data = await p.evaluate(PAGE, true);
    return { data, errors: p.errors };
  });
  const { data } = res;
  const tag = size.w + 'x' + size.h;
  console.log(`\n--- ${tag} (canvas view ${data.view.w}x${data.view.h})`);
  if (data.error) { check(tag, false, data.error); continue; }
  const W = data.view.w, H = data.view.h;
  const inPlay = (q) => q.x >= EDGE && q.x < W - EDGE && q.y >= HUD_BAND && q.y < H - EDGE;
  const playPainted = data.painted.filter(inPlay);
  check(`${tag}: ZERO warning pixels inside the play rect (${playPainted.length}/${data.paintedCount} painted)`,
    playPainted.length === 0,
    playPainted.length ? `first offender at (${playPainted[0].x},${playPainted[0].y})` : '');
  // The HUD-band warning state: gold/e4 ink SOMEWHERE in the top band, with a
  // plate under it (legibility), and nowhere outside band+edges.
  const bandInk = data.texts.filter(t => (t.fill === '#ffd75e' || t.fill === '#e4e4ee') && t.y < HUD_BAND);
  check(`${tag}: HUD-band warning text is painted in the top band`, bandInk.length > 0,
    data.texts.map(t => t.txt + '@y' + Math.round(t.y)).join(' | ') || 'no texts');
  check(`${tag}: the warning text names the HORDE`, bandInk.some(t => /HORDE/i.test(t.txt)),
    bandInk.map(t => t.txt).join(' | '));
  // The edge cue: some banner paint on a screen edge.
  const edgePainted = data.painted.filter(q => q.x < EDGE || q.x >= W - EDGE || q.y < HUD_BAND || q.y >= H - EDGE)
    .filter(q => q.y >= HUD_BAND || q.x < EDGE || q.x >= W - EDGE);   // edge frame, not the HUD strip
  check(`${tag}: the edge cue paints the screen-edge frame`, edgePainted.length > 0,
    edgePainted.length + ' edge pixels');
  // Timing: the armed ttl ends before the fastest spawn's estimated contact
  // (CLEAR_MARGIN held by the set-site clamp; the verifier allows a floor of
  // 0.25s so TTL_MIN cannot mask a violation).
  check(`${tag}: armed ttl (${(+data.armedTtl).toFixed(2)}s) ends before first contact (eta ${(+data.eta).toFixed(2)}s)`,
    +data.armedTtl <= +data.eta - 0.25,
    `ttl=${data.armedTtl} eta=${data.eta}`);
}
console.log('');
if (fail) console.log(`HORDE WARNING: FAIL (${fail}/${total})`);
else console.log(`HORDE WARNING: PASS (${total}/${total})`);
process.exit(fail ? 1 : 0);
