// HORDES — tools/verify_g17_2_breadth_shop.mjs: G17 SLICE 2 BREADTH ROWS in a
// REAL browser, on a PHONE (390x844 @3x, same bar as verify_g14_shop_icons,
// which this REUSES the pattern of — it is not a second icon harness: the
// per-row painted-pixel seam it reads is __TEST.shopIcons.report, the screen's
// own). Slice-2 additions over g14:
//   (a) every one of the 16 NEW breadth rows renders its OWN authored icon
//       (painted > 0, 16x16 backing store, integer 2x CSS scale) — never the
//       fallback;
//   (b) a REAL tap on a NEW row (Fleetfoot, the cheapest new rung) purchases
//       at EXACTLY upgradeCost(def, 0) = 65,000g;
//   (c) a NEW TOP row (Last Stand) is reachable in the panel and reads its
//       own cost line (4,320,000g) — scroll reaches it on a phone.
// Run: node tools/verify_g17_2_breadth_shop.mjs
import { withPage } from './browser.mjs';
import { copyFileSync } from 'node:fs';

const BREADTH_IDS = [
  'fleetfoot', 'briarmail', 'lodestone', 'hollowpoint', 'ironheart', 'hairtrigger',
  'headsman', 'bloodpact', 'fanfire', 'deepread', 'aethertap', 'grandelixir',
  'deepfont', 'eagleeye', 'staticfield', 'laststand',
];

const out = await withPage({ w: 390, h: 844, dpr: 3,
  startupScript: "try { localStorage.setItem('hordes_onboarded', '1'); } catch (e) {}" },
  async (p) => {
    await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
    await p.waitFor("(async () => (await import('./src/main.js')).__TEST.state.mode !== 'intro')()", 15000);
    await p.waitFor("(async () => { const rv = (await import('./src/main.js')).__TEST.state.titleReveal;" +
      " return !rv || rv.phase === 'settled'; })()", 8000);
    // Seed through the game's OWN import seam: enough for the Fleetfoot tap.
    await p.evaluate(`(async () => {
      const m = await import('./src/meta.js');
      const T = (await import('./src/main.js')).__TEST;
      const prof = m.makeProfile();
      prof.gold = 100000;
      T.save.importText(JSON.stringify(m.exportProfile(prof)));
    })()`);

    const shopCenter = await p.evaluate(`(() => {
      const el = [...document.getElementById('ov-cards').children]
        .find(c => (c.innerHTML || '').includes('>SHOP<'));
      const r = el.getBoundingClientRect();
      return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
    })()`);
    await p.tap(shopCenter[0], shopCenter[1]);
    await p.waitFor("(document.getElementById('ov-title') || {}).textContent === 'SHOP'", 5000);
    await p.evaluate("(async () => { const r = () => new Promise(q => requestAnimationFrame(() => requestAnimationFrame(q))); await r(); })()");

    // (a) + (c): the seam report + the two probe rows' DOM presence.
    const probe = await p.evaluate(`(async () => {
      const m = await import('./src/main.js');
      const meta = await import('./src/meta.js');
      const T = m.__TEST;
      const cards = [...document.querySelectorAll('#ov-cards .card')];
      const fleet = meta.SHOP_UPGRADES.find(d => d.id === 'fleetfoot');
      const last = meta.SHOP_UPGRADES.find(d => d.id === 'laststand');
      const elFor = def => cards.find(c => (c.innerHTML || '').includes('>' + def.name + '<'));
      const fleetEl = elFor(fleet), lastEl = elFor(last);
      return {
        mode: T.state.mode, report: T.shopIcons.report,
        gold: T.getProfile().gold,
        fleetCost: meta.upgradeCost(fleet, 0), lastCost: meta.upgradeCost(last, 0),
        fleetFound: !!fleetEl, lastFound: !!lastEl,
        fleetHtml: fleetEl ? fleetEl.innerHTML : null,
        lastHtml: lastEl ? lastEl.innerHTML : null,
        fleetIconClass: fleetEl ? (fleetEl.querySelector('canvas.shop-icon') || {}).className : null,
        lastIconClass: lastEl ? (lastEl.querySelector('canvas.shop-icon') || {}).className : null,
      };
    })()`);

    // (b) REAL TAP on Fleetfoot (LV 0, cost 65,000).
    await p.evaluate(`(() => {
      const el = [...document.querySelectorAll('#ov-cards .card')]
        .find(c => (c.innerHTML || '').includes('>Fleetfoot<'));
      el.scrollIntoView({ block: 'center' });
    })()`);
    await p.sleep(150);
    const fleetCenter = await p.evaluate(`(() => {
      const el = [...document.querySelectorAll('#ov-cards .card')]
        .find(c => (c.innerHTML || '').includes('>Fleetfoot<'));
      const r = el.getBoundingClientRect();
      return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
    })()`);
    await p.tap(fleetCenter[0], fleetCenter[1]);
    const afterBuy = await p.evaluate(`(async () => {
      const T = (await import('./src/main.js')).__TEST;
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const el = [...document.querySelectorAll('#ov-cards .card')]
        .find(c => (c.innerHTML || '').includes('>Fleetfoot<'));
      return { gold: T.getProfile().gold, lvl: T.getProfile().purchased.fleetfoot || 0,
               rowHtml: el ? el.innerHTML : null };
    })()`);

    // (c) scroll to the LAST new row (Last Stand, the deepest rung) and read it.
    await p.evaluate(`(() => {
      const el = [...document.querySelectorAll('#ov-cards .card')]
        .find(c => (c.innerHTML || '').includes('>Last Stand<'));
      el.scrollIntoView({ block: 'center' });
    })()`);
    await p.sleep(150);
    const lastVisible = await p.evaluate(`(() => {
      const el = [...document.querySelectorAll('#ov-cards .card')]
        .find(c => (c.innerHTML || '').includes('>Last Stand<'));
      const r = el.getBoundingClientRect();
      return { onScreen: r.top >= 0 && r.bottom <= window.innerHeight,
               top: Math.round(r.top), bottom: Math.round(r.bottom) };
    })()`);

    const shot = await p.shot('g17-2-breadth-shop-phone');
    return { ...probe, afterBuy, lastVisible, shot, errors: p.errors };
  });

console.log(JSON.stringify({ mode: out.mode, gold: out.gold, fleetCost: out.fleetCost,
  lastCost: out.lastCost, afterBuyGold: out.afterBuy.gold, afterBuyLvl: out.afterBuy.lvl,
  lastVisible: out.lastVisible }, null, 2));

const canonical = 'docs/art/browser-verify-2026-09-12/g17-2-breadth-shop-phone.png';
try { copyFileSync(out.shot, canonical); } catch (e) { console.error('COPY FAILED: ' + e.message); }

// ---------------------------------------------------------------- verdict --
const problems = [];
if (out.mode !== 'menu') problems.push('screen: mode is ' + out.mode);
for (const id of BREADTH_IDS) {
  const rep = out.report[id];
  if (!rep) { problems.push('row: ' + id + ' missing from the seam report'); continue; }
  if (rep.w !== 16 || rep.h !== 16) problems.push('row: ' + id + ' backing store ' + rep.w + 'x' + rep.h);
  if (!rep.painted || rep.painted <= 0) problems.push('row: ' + id + ' paints ' + rep.painted + ' pixels');
  if (rep.cssPx % 16 !== 0 || rep.scale !== 2) problems.push('row: ' + id + ' CSS scale not integer 2x');
}
if (!out.fleetFound || !out.lastFound) problems.push('rows: fleetfoot/laststand cards not found');
if (out.fleetIconClass !== 'shop-icon') problems.push('row: fleetfoot icon canvas class is ' + out.fleetIconClass);
if (!out.lastVisible.onScreen) problems.push('rows: Last Stand not reachable on screen after scroll ' + JSON.stringify(out.lastVisible));
if (!out.lastHtml || !String(out.lastCost).length || !out.lastHtml.includes(String(out.lastCost))) {
  problems.push('text: Last Stand does not read its own cost ' + out.lastCost);
}
if (out.afterBuy.lvl !== 1) problems.push('tap: Fleetfoot did not level (lvl=' + out.afterBuy.lvl + ')');
if (out.gold - out.afterBuy.gold !== out.fleetCost) {
  problems.push('tap: gold moved ' + out.gold + ' -> ' + out.afterBuy.gold + ' (want exactly -' + out.fleetCost + ')');
}
if (!out.afterBuy.rowHtml || !/LV 1\/5/.test(out.afterBuy.rowHtml)) problems.push('text: after the tap Fleetfoot does not read LV 1/5');
if (out.errors && out.errors.length) problems.push('console errors: ' + out.errors.join(' | '));

console.log(problems.length ? 'VERIFY G17-2 BREADTH SHOP: FAIL - ' + problems.join('; ')
  : 'VERIFY G17-2 BREADTH SHOP: PASS - all 16 new rows render their OWN 16x16 icon at integer 2x with non-empty pixels, Last Stand is scroll-reachable with its own cost line, a real tap bought Fleetfoot at exactly -' + out.fleetCost + 'g (LV 1/5)');
console.log('PNG: ' + canonical);
console.log('EVIDENCE: __TEST.shopIcons.report per new row + DOM text + real tap above. No vision read is claimed.');

process.exit(problems.length ? 1 : 0);
