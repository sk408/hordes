// Chrome check for the menu font's review fixes (R5 "one pixel font").
// Run through the lock:
//   HORDES_CHROME=... node tools/verify_menu_font.mjs [desktop|land|portrait ...]
// At each size, with the font on, it checks on the real page:
//   1. ligatures are off: "first fill" is as wide as with ligatures forced off,
//      and body and buttons say font-variant-ligatures: none;
//   2. the pre-run's dim STAGE card text reaches 4.5:1 against the real pixels
//      behind it (shot with the text, shot again with all text transparent,
//      9 samples behind each text box, the text's opacity chain applied);
//   3. the camp's buy lines are 11 px (the grid size);
//   4. every card name that shows the caret keeps a gap to it (title, pre-run,
//      camp, a draft, the intermission);
//   5. the trophies caption reaches 4.5:1 over the lock picture;
//   6. no page errors. Real clicks (desktop) or taps (phones) open the screens.
// Prints one line per check and exits 1 on any failure.
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!process.env.HORDES_SHOT_DIR) process.env.HORDES_SHOT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hordes-mf-'));
const { withPage } = await import('./browser.mjs');

const VPS = {
  desktop: { w: 1280, h: 720, dpr: 1, mobile: false },
  land: { w: 844, h: 390, dpr: 2, mobile: true },
  portrait: { w: 390, h: 844, dpr: 2, mobile: true },
};
const names = process.argv.slice(2).filter((a) => VPS[a]);
const PLAYED = `try { localStorage.setItem('hordes_profile_v1', JSON.stringify({ version: 11, lastPlayed: Date.now(),
  gold: 4240, bestTime: 296, unlockedWeapons: ['VOLLEY', 'BOOMERANG', 'ORBIT'],
  purchased: { hp: 2, dmg: 1, reroll: 1, skip: 1, banish: 1 },
  achievements: { totals: { runs: 6, bestGold: 610 } }, shopRefund: { version: 11, gold: 0, rows: 0 } }));
  localStorage.setItem('hordes_tour_draft', '1'); } catch (e) {}`;

const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

// Text runs inside `sel`: colour, opacity chain, first text rect.
const TEXTS = (sel) => `(() => { const out = [];
  const opac = (el) => { let o = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) o *= +getComputedStyle(e).opacity; return o; };
  for (const el of document.querySelectorAll(${JSON.stringify(sel)})) {
    const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const tn = [...el.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim()); if (!tn) continue;
    const rg = document.createRange(); rg.selectNodeContents(tn); const q = [...rg.getClientRects()].find((q) => q.width > 2 && q.height > 2); if (!q) continue;
    const m = /rgba?\\(([^)]+)\\)/.exec(cs.color).slice(1)[0].split(/[ ,/]+/).filter(Boolean).map(Number);
    out.push({ text: tn.textContent.trim().slice(0, 40), rgb: m.slice(0, 3), a: (m.length > 3 ? m[3] : 1) * opac(el), r: [q.left, q.top, q.width, q.height] });
  } return out; })()`;
const HIDE = `(() => { const s = document.createElement('style'); s.id = '__hide'; s.textContent = '*, *::before, *::after { color: transparent !important; text-shadow: none !important; -webkit-text-fill-color: transparent !important; }'; document.head.appendChild(s); })()`;
const UNHIDE = `document.getElementById('__hide') && document.getElementById('__hide').remove()`;
// Card names that show the caret: the gap from the caret's right edge to the text.
const CARET = `(() => { const c = document.createElement('canvas').getContext('2d'); const out = [];
  for (const n of document.querySelectorAll('#ov-cards .card .name')) {
    const b = getComputedStyle(n, '::before'); if (!b.content || b.content === 'none' || b.display === 'none') continue;
    const r = n.getBoundingClientRect(); if (!r.width || getComputedStyle(n).visibility === 'hidden') continue;
    const tn = [...n.childNodes].find((x) => x.nodeType === 3 && x.textContent.trim()) || n.firstChild; if (!tn) continue;
    const rg = document.createRange(); rg.selectNodeContents(tn.nodeType === 3 ? tn : n); const q = [...rg.getClientRects()].find((q) => q.width > 1); if (!q) continue;
    c.font = b.fontSize + ' ' + b.fontFamily;
    const caretR = r.left + parseFloat(b.left) + c.measureText(JSON.parse(b.content)).width;
    out.push({ name: n.textContent.trim().slice(0, 24), gap: +(q.left - caretR).toFixed(1) });
  } return out; })()`;

let fails = 0;
const say = (ok, what) => { if (!ok) fails++; console.log((ok ? 'ok   ' : 'FAIL ') + what); };

async function contrastOver(page, sel, tag) {
  const texts = await page.evaluate(TEXTS(sel));
  await page.evaluate(HIDE); await page.sleep(80);
  const f = await page.shot('mf-bg-' + tag);
  await page.evaluate(UNHIDE);
  const samples = {};
  texts.forEach((t, i) => { const [x, y, w, h] = t.r;
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) samples[i + '_' + a + b] = [x + w * (0.15 + 0.35 * a), y + h * (0.2 + 0.3 * b)]; });
  const px = texts.length ? (await page.readShot(f, samples)).px : {};
  if (!process.env.MF_KEEP) { try { fs.unlinkSync(f); } catch {} } else console.log('     shot ' + f);
  return texts.map((t, i) => {
    const rs = Object.keys(px).filter((k) => k.startsWith(i + '_')).map((k) => px[k])
      .map((bg) => [ratio(t.rgb.map((v, j) => v * t.a + bg[j] * (1 - t.a)), bg), bg]).sort((p, q) => p[0] - q[0]);
    return { text: t.text, min: rs.length ? +rs[0][0].toFixed(2) : null, bg: rs.length ? rs[0][1] : null, rgb: t.rgb, a: +t.a.toFixed(2) };
  });
}

for (const vpName of (names.length ? names : Object.keys(VPS))) {
  const vp = VPS[vpName];
  console.log('--- ' + vpName + ' ' + vp.w + 'x' + vp.h);
  await withPage({ ...vp, skipPrologue: true, startupScript: PLAYED, timeoutMs: 90000, root: ROOT }, async (page) => {
    const press = async (name) => {
      const r = await page.evaluate(`(() => { const c = [...document.querySelectorAll('#ov-cards .card')].find((c) => (c.querySelector('.name') || {}).textContent.trim().startsWith(${JSON.stringify(name)})); if (!c) return null; c.scrollIntoView({ block: 'center' }); const r = c.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      if (!r) return false;
      if (vp.mobile) await page.tap(Math.round(r[0]), Math.round(r[1]), 1); else await page.click(Math.round(r[0]), Math.round(r[1]));
      await page.sleep(400);
      return true;
    };
    const caretOk = async (where) => {
      const cs = await page.evaluate(CARET);
      const bad = cs.filter((c) => c.gap < 1);
      say((cs.length > 0 || where === 'draft') && !bad.length, `caret gap on ${where}: ${cs.length} names, smallest ${cs.length ? Math.min(...cs.map((c) => c.gap)) : '-'} px` + (bad.length ? ' TOUCHING ' + JSON.stringify(bad) : ''));
    };
    await page.waitFor(`document.readyState === 'complete'`, 15000, 100);
    await page.sleep(500);
    await page.evaluate(`(async () => { const m = await import('/src/main.js'); window.T = m.__TEST; return 1; })()`, true);
    await page.key('x');
    await page.waitFor(`T.state.mode === 'title' && +getComputedStyle(document.getElementById('overlay')).opacity === 1`, 8000, 30);
    await page.evaluate(`document.querySelectorAll('.wn-over').forEach((e) => e.remove())`);
    await page.evaluate(`T.menus.showTitle()`);
    const on = await page.waitFor(`document.documentElement.classList.contains('px-font')`, 5000, 50);
    say(on, 'the menu font is on');

    // 1. ligatures
    const lig = await page.evaluate(`(() => { const s = document.createElement('span'); s.textContent = 'first fill'; document.getElementById('overlay').appendChild(s);
      const inh = s.getBoundingClientRect().width; s.style.fontVariantLigatures = 'none'; const off = s.getBoundingClientRect().width;
      s.style.fontVariantLigatures = 'normal'; s.style.fontFeatureSettings = 'normal'; const forced = s.getBoundingClientRect().width; s.remove();
      const b = document.createElement('button'); document.body.appendChild(b); const bl = getComputedStyle(b).fontVariantLigatures; b.remove();
      return { inh, off, forced, body: getComputedStyle(document.body).fontVariantLigatures, button: bl }; })()`);
    say(Math.abs(lig.inh - lig.off) < 0.01 && lig.body === 'none' && lig.button === 'none',
      `ligatures off: "first fill" ${lig.inh.toFixed(1)} px, ${lig.off.toFixed(1)} px with none, ${lig.forced.toFixed(1)} px with them forced on; body ${lig.body}, button ${lig.button}`);
    await caretOk('title');

    // 2. the pre-run's dim card over the title art
    // The title can still be settling (its frames are painted a beat later),
    // so a press that lands too early is tried again, up to three times.
    let pre = false, tries = 0;
    while (!pre && tries < 3) {
      tries++; await page.sleep(500);
      say(await press('PLAY'), 'a real ' + (vp.mobile ? 'tap' : 'click') + ' on PLAY (try ' + tries + ')');
      pre = await page.waitFor(`document.querySelectorAll('#ov-cards .card.setup').length > 0`, 1500, 50);
    }
    say(pre, 'it opened the pre-run: ' + JSON.stringify(await page.evaluate(`({ mode: T.state.mode, setup: document.querySelectorAll('#ov-cards .card.setup').length, dim: document.querySelectorAll('#ov-cards .card.dim').length, names: [...document.querySelectorAll('#ov-cards .card .name')].map((n) => n.textContent.trim()).slice(0, 8) })`)));
    await page.sleep(400);
    const dim = await contrastOver(page, '#ov-cards .card.dim .name, #ov-cards .card.dim .desc, #ov-cards .card.dim .key, #ov-cards .card.dim .syn', vpName + '-prerun');
    say(dim.length > 0, 'pre-run has dim card text: ' + dim.length + ' runs');
    for (const d of dim) say(d.min >= 4.5, `pre-run dim "${d.text}" lowest contrast ${d.min}:1 over the real pixels (text ${d.rgb} at ${d.a}, behind it ${d.bg})`);
    await caretOk('pre-run');
    await page.key('Escape'); await page.sleep(300);
    if (await page.evaluate(`T.state.mode !== 'title'`)) { await page.evaluate(`T.menus.showTitle()`); await page.sleep(250); }

    // 3. the camp's buy lines
    say(await press('CAMP'), 'a real press on CAMP');
    const buys = await page.evaluate(`[...document.querySelectorAll('#ov-cards .buy')].map((b) => getComputedStyle(b).fontSize)`);
    say(buys.length > 0 && buys.every((s) => s === '11px'), 'camp buy lines: ' + JSON.stringify(buys));
    await caretOk('camp');
    await page.evaluate(`T.menus.showTitle()`); await page.sleep(250);

    // 4. the shop's buy lines (the variable the code sets)
    say(await press('SHOP'), 'a real press on SHOP');
    const sbuys = await page.evaluate(`[...new Set([...document.querySelectorAll('#ov-cards .buy')].map((b) => getComputedStyle(b).fontSize))]`);
    // The buy line is a span only where the shop abbreviates its rows.
    say(sbuys.every((s) => s === '11px'), 'shop buy lines: ' + (sbuys.length ? JSON.stringify(sbuys) : 'none at this size (rows not abbreviated)'));
    await page.evaluate(`T.menus.showTitle()`); await page.sleep(250);

    // 5. trophies caption over the lock art
    await page.evaluate(`T.openTrophies()`); await page.sleep(400);
    const tro = await contrastOver(page, '#overlay > h1, #overlay > .sub', vpName + '-trophies');
    for (const d of tro) say(d.min >= 4.5, `trophies "${d.text}" lowest contrast ${d.min}:1 over the real pixels`);
    await page.evaluate(`T.closeTrophies && T.closeTrophies()`);
    await page.evaluate(`T.menus.showTitle()`); await page.sleep(250);

    // 6. a draft and the intermission, in a run
    await page.evaluate(`T.startRun()`); await page.sleep(1500);
    await page.evaluate(`(() => { const p = T.state.player; p.stats.maxHp = 4000; p.hp = 4000; const b = document.querySelector('#tut-panel .tut-btn'); if (b) b.click(); })()`);
    await page.evaluate(`(() => { const st = T.state; st.mode = 'playing'; st.pendingDrafts = 1; T.openDraft(); })()`);
    await page.waitFor(`T.state.mode === 'draft'`, 5000, 30); await page.sleep(900);
    await caretOk('draft');
    await page.key('1'); await page.sleep(900);
    await page.evaluate(`(() => { const S = T.state; S.mode = 'playing'; document.getElementById('overlay').style.display = 'none'; S.enemies.length = 0; S.wave.num = 2; S.wave.cinePending = false; T.travel.intermission(); })()`);
    await page.sleep(900);
    await caretOk('intermission');
    say(page.errors.length === 0, 'page errors: ' + JSON.stringify(page.errors.slice(0, 4)));
  });
}
console.log(fails ? `verify_menu_font: ${fails} FAILED` : 'verify_menu_font: ALL OK');
process.exit(fails ? 1 : 0);
