#!/usr/bin/env node
// HORDES: the ADVANCED page with the SOUND EFFECTS row (R4 recorded sound effects), captured
// in headless Chrome at 1280x720 and at 390x844 (an upright phone), from the title and from a
// run's pause, before (another tree, --root) and after (this tree). The row is pressed for real
// (a click, or a tap on the phone) and the page captured again. Prints whether the row is on
// screen, the stored choice, the page's console errors, and whether the grid overflows.
// Run (through the lock): HORDES_CHROME=... HORDES_SHOT_DIR=<dir> node tools/capture_sfx_advanced.mjs --tag after [--root <dir>]
import path from 'node:path';
import { withPage } from './browser.mjs';

const ai = process.argv.indexOf('--root');
const root = ai > 0 ? path.resolve(process.argv[ai + 1]) : undefined;
const ti = process.argv.indexOf('--tag');
const tag = ti > 0 ? process.argv[ti + 1] : 'after';
const VPS = [
  { name: 'desktop', w: 1280, h: 720, dpr: 1, mobile: false },
  { name: 'phone', w: 390, h: 844, dpr: 2, mobile: true },
];
const BOOT = `(async () => { const m = await import('/src/main.js'); window.T = m.__TEST; return T.state.mode; })()`;
const INFO = `(() => {
  const cards = [...document.querySelectorAll('#ov-cards > *')];
  const row = cards.find((c) => /SOUND EFFECTS/.test(c.textContent));
  const r = row && row.getBoundingClientRect();
  const all = cards.map((c) => c.getBoundingClientRect());
  return { cards: cards.length, row: row ? row.textContent.replace(/\\s+/g, ' ').trim() : null,
    rowOnScreen: !!r && r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth,
    lowest: Math.round(Math.max(...all.map((b) => b.bottom))), vh: innerHeight,
    sideways: document.documentElement.scrollWidth > innerWidth,
    stored: localStorage.getItem('hordes_audio_sfx_src') };
})()`;
for (const vp of VPS) {
  await withPage({ ...vp, root, timeoutMs: 60000 }, async (page) => {
    await page.sleep(300);
    await page.evaluate(BOOT, true);
    await page.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }))`);
    await page.waitFor(`T.state.mode === 'title'`, 8000, 30);
    await page.sleep(300);
    await page.evaluate(`T.menus.showAdvanced(false)`); await page.sleep(400);
    console.log(tag, vp.name, 'title', JSON.stringify(await page.evaluate(INFO)));
    await page.shot(`sfx-advanced-title-${vp.name}-${tag}`);
    const press = async () => {
      const r = await page.evaluate(`(() => { const c = [...document.querySelectorAll('#ov-cards > *')].find((x) => /SOUND EFFECTS/.test(x.textContent));
        if (!c) return null; c.scrollIntoView({ block: 'center' }); const b = c.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; })()`);
      if (!r) return false;
      await page.sleep(80);
      if (vp.mobile) await page.tap(r[0], r[1], 1); else await page.click(r[0], r[1]);
      await page.sleep(400);
      return true;
    };
    if (await press()) {
      console.log(tag, vp.name, 'pressed', JSON.stringify(await page.evaluate(INFO)));
      await page.shot(`sfx-advanced-title-pressed-${vp.name}-${tag}`);
    }
    // In a run: the pause, then ADVANCED.
    await page.evaluate(`T.startRun()`); await page.sleep(1500);
    await page.evaluate(`T.menus.showAdvanced(true)`); await page.sleep(400);
    console.log(tag, vp.name, 'in-run', JSON.stringify(await page.evaluate(INFO)));
    await page.shot(`sfx-advanced-run-${vp.name}-${tag}`);
    console.log(tag, vp.name, 'console errors', page.errors.length, page.errors.slice(0, 3).join(' | '));
  });
}
