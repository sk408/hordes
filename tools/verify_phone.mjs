// playwright is deliberately NOT a repo dependency (the repo ships code-only), and ESM
// resolves bare specifiers from THIS file's directory - so resolve it through a CJS require
// rooted at PW_BASE (default /tmp/pw, the scratch install).
import { createRequire } from 'module';
const require = createRequire((process.env.PW_BASE || '/tmp/pw').replace(/\/?$/, '/') + 'noop.js');
const { chromium } = require('playwright');
import fs from 'fs';
// HORDES - phone-form-factor browser verification (390x844 @3x DPR, touch, iPhone UA).
// Why it exists: the build plan requires every player-visible thing to be verified in a REAL
// browser on a PHONE viewport, and a canvas claim is not evidence. This tool boots the title,
// opens the trophy gallery, walks the ring to a chosen trophy, and prints measured canvas pixels
// (bright-pixel count / bbox / band counts / sampled hex) plus the DOM chrome gate as JSON, while
// writing screenshots to $SHOTS_DIR.
//
// Setup on a fresh host (no browser was installed before 2026-09-12):
//   mkdir -p /tmp/pw && cd /tmp/pw && npm init -y && npm i -D playwright@1.49.1
//   npx playwright install chromium        # ~161MB, lands in ~/.cache/ms-playwright
//   python3 -m http.server 8137 --bind 127.0.0.1   # served from the repo root
//   node tools/gen_earned_profile.mjs      # writes /tmp/pw/earned_profile.json (the 'earned' case)
//   cd /tmp/pw && HORDES_URL=http://127.0.0.1:8137/ node /path/to/hordes/tools/verify_phone.mjs
//
// NOTE: the playwright package is NOT a repo dependency (the repo ships code-only); this tool
// expects it resolvable from the cwd. Playwright's own locator.click() is INTERCEPTED by the
// first-run tour's shade over the title menu, so menu cards are clicked with el.click() through
// evaluate - the same handler a finger tap fires, once the tour shade is out of the way.
const URL = process.env.HORDES_URL || 'http://127.0.0.1:8137/';
const earned = JSON.parse(fs.readFileSync('/tmp/pw/earned_profile.json', 'utf8'));
const SHOTS_DIR = process.env.SHOTS_DIR || '/tmp/shots';
const KEY = 'hordes_profile_v1';

async function stats(page) {
  return page.evaluate(() => {
    const cv = document.querySelector('canvas'); if (!cv) return { error: 'no canvas' };
    const g = cv.getContext('2d'), W = cv.width, H = cv.height, d = g.getImageData(0, 0, W, H).data;
    let bright = 0, minX = 1e9, minY = 1e9, maxX = -1, maxY = -1, top = 0, bot = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4, m = Math.max(d[i], d[i + 1], d[i + 2]);
      if (m > 60) { bright++; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (y < H * 0.12) top++; if (y > H * 0.88) bot++; }
    }
    const hex = i => '#' + [d[i], d[i + 1], d[i + 2]].map(v => v.toString(16).padStart(2, '0')).join('');
    return { canvas: [W, H], bright, bbox: maxX < 0 ? null : [minX, minY, maxX, maxY], topBandBright: top, botBandBright: bot,
      centerHex: hex(((H >> 1) * W + (W >> 1)) * 4), cornerHex: hex((8 * W + 8) * 4) };
  });
}
const gate = p => p.evaluate(() => ['#hud', '#hints', '#touch', '#joy'].map(id => { const e = document.querySelector(id); return id + '=' + (e ? getComputedStyle(e).display : 'missing'); }).join(' '));
const txt = p => p.locator('body').innerText().then(t => t.replace(/\n+/g, ' | ').slice(0, 240));

async function boot(page) {
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(2200);
  await page.mouse.click(195, 400);
  await page.waitForTimeout(1500);
  await page.keyboard.press('Escape');
  await page.waitForSelector('text=/TROPHIES/', { timeout: 20000 });
  await page.waitForTimeout(400);
}
const clickCard = (page, label) => page.evaluate(l => {
  const el = [...document.querySelectorAll('#ov-cards > *')].find(e => new RegExp(l, 'i').test(e.innerText || ''));
  if (!el) return 'no card';
  el.click(); return 'clicked';
}, label);

async function ctxOf(browser, seed) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  if (seed) await ctx.addInitScript(([k, p]) => { try { localStorage.setItem(k, JSON.stringify(p)); } catch (e) {} }, [KEY, earned]);
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGEERROR', String(e.message).split('\n')[0]));
  return { ctx, page };
}
const browser = await chromium.launch();
const report = {};

// --- A: does the first-run tour block a REAL tap on the title menu? ---
{
  const { ctx, page } = await ctxOf(browser, false);
  await boot(page);
  report.A_tourDom = await page.evaluate(() => {
    const tip = document.getElementById('tour-tip'), shade = document.querySelector('.tour-shade');
    const btns = tip ? [...tip.querySelectorAll('button,[role=button],[data-tour-next],.tour-btn')].map(b => (b.innerText || b.id || b.className).slice(0, 24)) : [];
    return { tipPresent: !!tip, tipPointerEvents: tip ? getComputedStyle(tip).pointerEvents : null,
      shadePresent: !!shade, shadePointerEvents: shade ? getComputedStyle(shade).pointerEvents : null,
      shadeZ: shade ? getComputedStyle(shade).zIndex : null,
      tipHtml: tip ? tip.outerHTML.replace(/\s+/g, ' ').slice(0, 300) : null, tourButtons: btns };
  });
  const before = await txt(page);
  const box = await page.evaluate(() => {
    const el = [...document.querySelectorAll('#ov-cards > *')].find(e => /TROPHIES/i.test(e.innerText || ''));
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  });
  await page.mouse.click(box.x, box.y);            // a real finger tap on the TROPHIES card
  await page.waitForTimeout(1200);
  report.A_afterRealTap = { tapped: box, before: before.slice(0, 90), after: (await txt(page)).slice(0, 90),
    opened: /LOCKED|PREV/.test(await page.locator('body').innerText()) };
  await page.screenshot({ path: `${SHOTS_DIR}/phone-title-tourblock.png` });
  await ctx.close();
}
// --- B: gallery pixels, LOCKED vs EARNED, phone viewport ---
for (const [tag, seed] of [['locked', false], ['earned', true]]) {
  const { ctx, page } = await ctxOf(browser, seed);
  await boot(page);
  report[`B_${tag}_title`] = await txt(page);
  await clickCard(page, 'TROPHIES');
  await page.waitForTimeout(900);
  for (let i = 0; i < 21 && !/FIRST BLOOD/i.test(await page.locator('body').innerText()); i++) {
    await page.evaluate(() => { const b = [...document.querySelectorAll('button,[role=button],div')].find(e => /^NEXT/.test((e.innerText || '').trim())); if (b) b.click(); });
    await page.waitForTimeout(200);
  }
  report[`B_${tag}_caption`] = await txt(page);
  report[`B_${tag}_gate`] = await gate(page);
  report[`B_${tag}_stats`] = await stats(page);
  await page.screenshot({ path: `${SHOTS_DIR}/phone-gallery-${tag}.png` });
  await ctx.close();
}
// --- C: the play HUD control (same measurement while a run is live) ---
{
  const { ctx, page } = await ctxOf(browser, false);
  await boot(page);
  await clickCard(page, '^PLAY');
  await page.waitForTimeout(6000);
  report.C_play_stats = await stats(page);
  report.C_play_text = await txt(page);
  await page.screenshot({ path: `${SHOTS_DIR}/phone-play-control.png` });
  await ctx.close();
}
await browser.close();
console.log(JSON.stringify(report, null, 1));
