// HORDES — VERIFY the 0.98 player-feedback fixes in a REAL browser, by
// measurement (there is no vision model on this host).
//
//   D1 synergy announce: the OLD painter (one unwrapped 9px line) is painted
//      for comparison, then the SHIPPED renderer paints the same toast. Both
//      are measured two ways: (a) ctx.measureText() in the exact font the
//      renderer set, (b) a PIXEL SCAN of the real canvas (ink bbox = pixels
//      that are neither transparent nor the dark plate colour).
//   D2 (DOM, headless): test/test_feedback_098.mjs asserts the owned pilot's
//      ability description is in the overlay HTML.
//   D3 HP/MP/XP numbers: painted through the shipped HUD, then measured +
//      pixel-scanned, and checked against the run clock's column.
//
// Usage: node tools/verify_098_feedback.mjs [--synergy 0] [--json]
import { withPage } from './browser.mjs';

const PAGE = `
(async () => {
  const cfg = await import('/src/config.js');
  const C = cfg.CONFIG;
  const syn = await import('/src/synergies.js');
  const main = await import('/src/main.js');     // SAME module instance as the page
  const T = main.__TEST;
  T.startRun();
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
  await frame(); await frame();

  // Recording 2d context: passes every call through to a REAL OffscreenCanvas
  // ctx (real font engine, real pixels), capturing the font/fill in force.
  function recorder(real) {
    const rec = { texts: [], rects: [] };
    let font = '', fill = '';
    const p = new Proxy(real, {
      get(t, prop) {
        if (prop === 'font') return font;
        if (prop === 'fillStyle') return fill;
        if (prop === 'measureText') return (s) => t.measureText(s);
        if (prop === 'fillText') return (txt, x, y) => { rec.texts.push({ txt: String(txt), x, y, font, fill }); return t.fillText(txt, x, y); };
        if (prop === 'fillRect') return (x, y, w, h) => { rec.rects.push({ x, y, w, h, fill }); return t.fillRect(x, y, w, h); };
        const v = t[prop];
        return typeof v === 'function' ? v.bind(t) : v;
      },
      set(t, prop, v) { if (prop === 'font') font = v; if (prop === 'fillStyle') fill = v; t[prop] = v; return true; },
    });
    return { ctx: p, rec };
  }
  function newCanvas() {
    const cv = new OffscreenCanvas(C.VIEW_W, C.VIEW_H);
    return { cv, real: cv.getContext('2d', { willReadFrequently: true }) };
  }
  // The plate colour composites to its raw rgb over a transparent canvas, so
  // "ink" = a painted pixel that is NOT the plate (or the HUD frame/trough).
  const isPlate = (d, i) => (d[i] === 4 && d[i + 1] === 4 && d[i + 2] === 10);
  function inkBox(real, y0, y1, x0 = 0, x1 = C.VIEW_W) {
    const d = real.getImageData(0, 0, C.VIEW_W, C.VIEW_H).data;
    const box = { x0: 1e9, y0: 1e9, x1: -1, y1: -1, n: 0 };
    for (let y = Math.max(0, y0 | 0); y < Math.min(C.VIEW_H, y1 | 0); y++) {
      for (let x = Math.max(0, x0 | 0); x < Math.min(C.VIEW_W, x1 | 0); x++) {
        const i = (y * C.VIEW_W + x) * 4;
        if (d[i + 3] === 0 || isPlate(d, i)) continue;
        box.n++;
        if (x < box.x0) box.x0 = x; if (x > box.x1) box.x1 = x;
        if (y < box.y0) box.y0 = y; if (y > box.y1) box.y1 = y;
      }
    }
    return box.n ? box : null;
  }

  const FEED_FONT = C.HUD.FEED_PX + 'px monospace';
  const measure = (real, s, font) => { real.font = font; return +real.measureText(s).width.toFixed(2); };

  // ---- the seven announces, built exactly as main.js refreshSynergies does ----
  const msgs = syn.SYNERGIES.map((s) => {
    const d = syn.describeSynergy(s);
    return { name: d.name, msg: 'SYNERGY: ' + d.name.toUpperCase() + ' — ' + d.desc };
  });

  // ---- D1: OLD painter (one unwrapped line), for the before-number ----
  function paintOld(msg) {
    const { cv, real } = newCanvas();
    real.font = FEED_FONT; real.textBaseline = 'top';
    const fw = msg.length * 6 + 3;                 // the shipped-then formula
    real.fillStyle = C.HUD.PLATE; real.fillRect(5, 86 - 2, fw, 11);
    real.fillStyle = '#e4e4ee'; real.fillText(msg, 7, 86);
    return { cv, real, plateW: fw };
  }
  // ---- D1: SHIPPED painter, through the real drawHudChrome ----
  function paintNew(toasts) {
    T.state.toasts = toasts;
    const { cv, real } = newCanvas();
    const { ctx, rec } = recorder(real);
    T.renderer.drawHudChrome(ctx, T.state);
    T.state.toasts = [];
    return { cv, real, rec };
  }

  const out = { view: { w: C.VIEW_W, h: C.VIEW_H }, css: { w: innerWidth, h: innerHeight }, synergy: [], bars: null };

  for (const m of msgs) {
    const oldP = paintOld(m.msg);
    const oldInk = inkBox(oldP.real, 82, 100);
    const newP = paintNew([{ msg: m.msg, ttl: 3, tint: null }]);
    const entry = (T.renderer.hudChrome.feed || [])[0] || {};
    const lines = entry.lines || [];
    const painted = newP.rec.texts.filter((t) => lines.includes(t.txt));
    const measured = lines.map((ln) => measure(newP.real, ln, FEED_FONT));
    const lineRight = painted.map((t, i) => +(t.x + measured[i]).toFixed(2));
    const bandTop = 82, bandBot = 86 - 2 + lines.length * 10 + 3;
    const newInk = inkBox(newP.real, bandTop, bandBot);
    const plate = newP.rec.rects.find((r) => r.x === 5 && r.y === 84);
    out.synergy.push({
      name: m.name,
      oldWidth: measure(oldP.real, m.msg, FEED_FONT),   // the true advance, not the estimate
      oldPlateW: oldP.plateW,
      oldInk,                                            // clipped at x=479 => touched the edge
      lines, measured, lineRight, plateW: plate ? plate.w : null, newInk,
    });
  }

  // ---- D3: the bars, live values, painted through the shipped HUD ----
  const p = T.state.player;
  p.hp = 74; p.stats.maxHp = 120;
  p.mana = 33; p.stats.maxMana = 60;
  p.xp = 42; p.xpNext = 100;
  const barP = paintNew([]);
  const chrome = T.renderer.hudChrome;
  const wants = [chrome.hpText, chrome.mpText, chrome.xpText].filter(Boolean);
  const vals = barP.rec.texts.filter((t) => wants.includes(t.txt));
  const clock = barP.rec.texts.find((t) => /^\\d\\d:\\d\\d$/.test(t.txt));
  out.bars = {
    values: vals.map((t) => ({
      txt: t.txt, x: t.x, y: t.y, font: t.font,
      width: measure(barP.real, t.txt, t.font),
      right: +(t.x + measure(barP.real, t.txt, t.font)).toFixed(2),
      plate: (barP.rec.rects.find((r) => r.n === undefined && r.x <= t.x && r.x + r.w >= t.x + 6 &&
        r.y <= t.y + 8 && r.y + r.h >= t.y + 3) || null) &&
        (barP.rec.rects.filter((r) => r.x <= t.x && r.x + r.w >= t.x + 6 &&
          r.y <= t.y + 8 && r.y + r.h >= t.y + 3)[0] || null),
    })),
    chrome: { hpText: chrome.hpText, mpText: chrome.mpText, xpText: chrome.xpText },
    clock: clock ? { txt: clock.txt, x: clock.x, width: measure(barP.real, clock.txt, clock.font) } : null,
    barEnd: 132,
    // ink inside the value plate column, proving the numbers really rasterised
    ink: inkBox(barP.real, 11, 34, 134, 196),
    inkAtCssScale: null,
  };
  return out;
})()
`;

const argv = process.argv.slice(2);
const wantsJson = argv.includes('--json');
const res = await withPage({ w: 390, h: 844, dpr: 2, mobile: true }, async (p) => {
  await p.waitFor('true', 500);
  const data = await p.evaluate(PAGE, true);
  return { data, errors: p.errors, viewport: p.viewport };
});
const { data } = res;

let fail = 0;
const check = (label, ok, detail = '') => {
  if (!ok) { fail++; console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); }
  else console.log('  ok   ' + label + (detail ? ' — ' + detail : ''));
};

if (wantsJson) {
  console.log(JSON.stringify(data, null, 2));
} else {
  console.log(`\nHORDES 0.98 feedback — view ${data.view.w}x${data.view.h} (canvas), page ${data.css.w}x${data.css.h} CSS\n`);
  console.log('D1 — SYNERGY ANNOUNCE (old single line vs shipped wrap)');
  let oldClippedCount = 0;
  for (const r of data.synergy) {
    // The OLD painter placed the text at x=7 in ONE line: its real advance is
    // oldWidth, and its plate used the char estimate (oldPlateW). Clipped =
    // the advance (or the plate) runs past the last column of the view.
    const textClipped = 7 + r.oldWidth > data.view.w;
    const plateClipped = 5 + r.oldPlateW > data.view.w;
    if (textClipped) oldClippedCount++;
    console.log(`  ${r.name}`);
    console.log(`     OLD   text advance ${String(r.oldWidth).padStart(7)}px -> right edge ${(7 + r.oldWidth).toFixed(1)}px   plate ${String(r.oldPlateW).padStart(4)}px -> ${5 + r.oldPlateW}px${textClipped ? '   TEXT CLIPPED AT x=' + (data.view.w - 1) : ''}`);
    console.log(`     NEW   ${r.lines.length} line${r.lines.length > 1 ? 's' : ''}, measured ${r.measured.map((w) => w.toFixed(2)).join(' + ')}px  rightmost ${Math.max(...r.lineRight).toFixed(1)}px  plate ${r.plateW}px  ink x=[${r.newInk.x0}, ${r.newInk.x1}] y=[${r.newInk.y0}, ${r.newInk.y1}]`);
    check(`${r.name}: the OLD unwrapped plate overflowed the ${data.view.w}px view`, plateClipped,
      `${r.oldPlateW}px -> x=${5 + r.oldPlateW}`);
    check(`${r.name}: the OLD line's real advance ${textClipped ? 'was CLIPPED (ink hard against the edge)' : 'just fitted — no overflow to fix'}`,
      textClipped ? !!r.oldInk && r.oldInk.x1 >= data.view.w - 3 : !textClipped,
      textClipped ? `advance ${r.oldWidth}px, ink reached x=${r.oldInk ? r.oldInk.x1 : '-'}` : `advance ${r.oldWidth}px of ${data.view.w}`);
    check(`${r.name}: every wrapped line fits (<= ${data.view.w - 14}px)`, r.measured.every((w) => w <= data.view.w - 14),
      r.measured.map((w) => w.toFixed(2)).join(' / '));
    check(`${r.name}: wrapped ink clear of both edges (x0 > 0, x1 < ${data.view.w - 1})`,
      !!r.newInk && r.newInk.x0 > 0 && r.newInk.x1 < data.view.w - 1,
      r.newInk && `ink x=[${r.newInk.x0}, ${r.newInk.x1}]`);
    check(`${r.name}: plate inside the view and covering the ink`,
      r.plateW <= data.view.w - 5 && r.plateW >= (r.newInk ? r.newInk.x1 - 5 : 1e9), `plate ${r.plateW}px`);
  }
  console.log(`  -> ${data.synergy.length}/${data.synergy.length} old plates overflowed; ${oldClippedCount}/${data.synergy.length} old lines were actually clipped by the canvas edge`);
  console.log('\nD3 — HP / MP / XP NUMBERS');
  const b = data.bars;
  for (const v of b.values) {
    console.log(`  ${v.txt.padEnd(8)} x=${String(v.x).padStart(3)} y=${String(v.y).padStart(2)} w=${String(v.width).padStart(6)} right=${String(v.right).padStart(6)} [${v.font}]`);
  }
  console.log(`  clock: ${b.clock ? b.clock.txt + ' x=' + b.clock.x + ' w=' + b.clock.width : 'none'}   value-plate ink: ${JSON.stringify(b.ink)}`);
  check('HP value painted, inside the view', b.values.some((v) => /^\d+\/\d+$/.test(v.txt) && v.txt === b.chrome.hpText) &&
    b.values.every((v) => v.right < data.view.w), b.chrome.hpText);
  check('every value clear of the bar end (x >= 134)', b.values.every((v) => v.x >= 134),
    b.values.map((v) => v.txt + '@' + v.x).join(' '));
  check('every value stops short of the run clock', !!b.clock && b.values.every((v) => v.right < b.clock.x - 2),
    b.clock && `rightmost ${Math.max(...b.values.map((v) => v.right))} < clock x=${b.clock.x}`);
  check('each value rides a plate', b.values.every((v) => !!v.plate),
    b.values.map((v) => v.txt + ':' + (v.plate ? v.plate.w + 'x' + v.plate.h + '@' + v.plate.x : 'NONE')).join(' '));
  check('the numbers really rasterised (ink inside the value column)',
    !!b.ink && b.ink.n > 40, b.ink && `${b.ink.n} ink px, x=[${b.ink.x0}, ${b.ink.x1}] y=[${b.ink.y0}, ${b.ink.y1}]`);
  console.log('');
  if (res.errors.length) { console.log('PAGE ERRORS:'); for (const e of res.errors) console.log('  ' + e); }
}
console.log(fail === 0 ? '0.98 FEEDBACK: PASS' : `0.98 FEEDBACK: FAIL (${fail})`);
process.exit(fail === 0 ? 0 : 1);
