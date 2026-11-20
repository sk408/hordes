// Chrome check for the menus' type and readability (R5 PLAY and contrast;
// round 8 "font2": the pixel font is gone, every menu is in monospace again).
// Run through the lock:
//   HORDES_CHROME=... node tools/verify_menu_font.mjs [desktop|land|portrait|small ...]
// At each size it checks on the real page:
//   1. no web font: the server saw no request for a font file, the page has
//      no font face loaded, menus and buttons compute to monospace, and the
//      card names keep their own size (16 px, nothing snapped);
//   2. PLAY is the title's main button: its name is larger than every other
//      tile's, its tile is the widest, on its own row (desktop, upright phone)
//      or leading the first row (sideways phone), and nothing on the title
//      scrolls;
//   3. the pre-run's dim STAGE card text reaches 4.5:1 against the real pixels
//      behind it (shot with the text, shot again with all text transparent,
//      9 samples behind each text box, the text's opacity chain applied);
//   4. the camp's buy lines are back at 12 px, the shop's at 9 to 12 px;
//   5. the trophies caption reaches 4.5:1 over the lock picture;
//   6. a draft and the intermission open (the caret gaps are printed);
//   7. What's New: the SHOW ME offer and CLOSE in view, the note not scrolling;
//   8. no page errors. Real clicks (desktop) or taps (phones) open the screens.
// Prints one line per check and exits 1 on any failure.
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
// MF_ROOT serves another tree with this check (to compare: the tree before the font, today's).
const ROOT = process.env.MF_ROOT ? path.resolve(process.env.MF_ROOT) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!process.env.HORDES_SHOT_DIR) process.env.HORDES_SHOT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hordes-mf-'));
const { withPage } = await import('./browser.mjs');

const VPS = {
  desktop: { w: 1280, h: 720, dpr: 1, mobile: false },
  land: { w: 844, h: 390, dpr: 2, mobile: true },
  portrait: { w: 390, h: 844, dpr: 2, mobile: true },
  small: { w: 375, h: 667, dpr: 2, mobile: true },
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
      const line = `caret gap on ${where}: ${cs.length} names, smallest ${cs.length ? Math.min(...cs.map((c) => c.gap)) : '-'} px` + (bad.length ? ' TOUCHING ' + JSON.stringify(bad) : '');
      // The draft's playing cards have no caret (it sat on their number). On
      // the other screens a long name can reach the caret on a phone: that is
      // how they were before the pixel font, so it is printed, not failed.
      if (where === 'draft') say(cs.length === 0, line);
      else if (bad.length) console.log('info ' + line + ' (as before the pixel font)');
      else say(cs.length > 0, line);
    };
    await page.waitFor(`document.readyState === 'complete'`, 15000, 100);
    await page.sleep(500);
    await page.evaluate(`(async () => { const m = await import('/src/main.js'); window.T = m.__TEST; return 1; })()`, true);
    await page.key('x');
    await page.waitFor(`T.state.mode === 'title' && +getComputedStyle(document.getElementById('overlay')).opacity === 1`, 8000, 30);
    // What's New (this profile has not read it): its offer and CLOSE are in
    // view inside the note and on the screen, and the note does not scroll.
    await page.waitFor(`!!document.querySelector('.wn-over')`, 8000, 50);
    await page.sleep(400);
    const wn = await page.evaluate(`(() => { const n = document.querySelector('.wn-over'), nb = n.getBoundingClientRect();
      const vis = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return r.top >= nb.top - 1 && r.bottom <= nb.bottom + 1 && r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth; };
      return { offer: vis(n.querySelector('.offer')), close: vis(n.querySelector('.wn-close')), desc: getComputedStyle(n.querySelector('.desc')).fontSize, scroll: n.scrollHeight - n.clientHeight }; })()`);
    say(wn.close === true && wn.offer !== false && wn.scroll <= 1, `What's New: the offer and CLOSE are in view, the note does not scroll (${JSON.stringify(wn)})`);
    await page.evaluate(`document.querySelectorAll('.wn-over').forEach((e) => e.remove())`);
    await page.evaluate(`T.menus.showTitle()`);
    await page.sleep(1500);   // anything the page would ask for late has been asked for
    const fontReqs = page.server.log.filter((e) => /\.(woff2?|ttf|otf|eot)$/i.test(e.path)).map((e) => e.path);
    say(page.server.log.length > 5 && fontReqs.length === 0, 'no font file requested (' + page.server.log.length + ' requests): ' + JSON.stringify(fontReqs));
    const ff = await page.evaluate(`(() => { const b = document.createElement('button'); document.body.appendChild(b); const bf = getComputedStyle(b).fontFamily; b.remove();
      const n = document.querySelector('#ov-cards .card:not(.main) .name');
      return { faces: [...document.fonts].map((f) => f.family), px: document.documentElement.className, body: getComputedStyle(document.body).fontFamily, button: bf,
        name: n ? getComputedStyle(n).fontFamily + ' ' + getComputedStyle(n).fontSize : null }; })()`);
    // Buttons keep the browser's own button font, as before the pixel font.
    say(ff.faces.length === 0 && !/px-font/.test(ff.px) && ff.body === 'monospace' && /^monospace (1[3-9]|2\d)px$/.test(ff.name || '') && !/pixelify/i.test(ff.button),
      'no web font: faces ' + JSON.stringify(ff.faces) + ', body ' + ff.body + ', a tile name ' + ff.name + ', button ' + ff.button);

    // PLAY: the one main button
    const play = await page.evaluate(`(() => { const ov = document.getElementById('overlay');
      const cards = [...document.querySelectorAll('#ov-cards .card')].map((c) => { const r = c.getBoundingClientRect(); const n = c.querySelector('.name');
        return { name: n.textContent.trim(), main: c.classList.contains('main'), fs: parseFloat(getComputedStyle(n).fontSize), w: r.width, top: Math.round(r.top), bottom: Math.round(r.bottom), left: r.left, right: r.right }; });
      return { cards, scroll: ov.scrollHeight - ov.clientHeight, vw: innerWidth, vh: innerHeight }; })()`);
    const pm = play.cards.filter((c) => c.main), rest = play.cards.filter((c) => !c.main);
    const P = pm[0];
    say(pm.length === 1 && P.name === 'PLAY', 'one main button, PLAY: ' + JSON.stringify(pm.map((c) => c.name)));
    if (P) {
      say(rest.every((c) => P.fs > c.fs), `PLAY's name ${P.fs} px, the others ${[...new Set(rest.map((c) => c.fs))].join('/')} px`);
      say(rest.every((c) => P.w > c.w), `PLAY's tile ${P.w.toFixed(0)} px wide, the widest other ${Math.max(...rest.map((c) => c.w)).toFixed(0)} px`);
      const sameRow = rest.filter((c) => c.top < P.bottom && c.bottom > P.top);
      const sideways = vp.mobile && vp.w > vp.h;
      say(sideways ? sameRow.every((c) => c.left >= P.right - 1) : sameRow.length === 0,
        sideways ? 'PLAY leads the first row (' + sameRow.length + ' tiles beside it)' : 'PLAY has a row of its own');
      say(P.right <= play.vw && P.left >= 0 && P.bottom <= play.vh, 'PLAY is on screen: ' + JSON.stringify([P.left, P.top, P.right, P.bottom].map(Math.round)));
    }
    // 375x667: the title scrolled before the pixel font too (116 px in the
    // tree before it, 53 px with it): printed, not failed.
    if (vpName === 'small') console.log('info the title scrolls ' + play.scroll + ' px at 375x667 (116 px before the pixel font)');
    else say(play.scroll <= 1, 'the title does not scroll (' + play.scroll + ' px)');
    if (process.env.MF_SHOTS) await page.shot('mf-title-' + vpName);
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
    say(buys.length > 0 && buys.every((s) => s === '12px'), 'camp buy lines at 12 px (the size before the font): ' + JSON.stringify(buys));
    await caretOk('camp');
    await page.evaluate(`T.menus.showTitle()`); await page.sleep(250);

    // 4. the shop's buy lines (the variable the code sets)
    say(await press('SHOP'), 'a real press on SHOP');
    const sbuys = await page.evaluate(`[...new Set([...document.querySelectorAll('#ov-cards .buy')].map((b) => getComputedStyle(b).fontSize))]`);
    // The buy line is a span only where the shop abbreviates its rows.
    say(sbuys.every((s) => parseFloat(s) >= 9 && parseFloat(s) <= 12), 'shop buy lines 9 to 12 px: ' + (sbuys.length ? JSON.stringify(sbuys) : 'none at this size (rows not abbreviated)'));
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
    say(await page.evaluate(`T.state.mode === 'draft' && document.querySelectorAll('#ov-cards .card.dcard').length > 0`), 'a draft of playing cards is open');
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
