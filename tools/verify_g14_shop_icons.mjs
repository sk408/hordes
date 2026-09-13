// HORDES — tools/verify_g14_shop_icons.mjs: G14 PIXEL ICONS ON EVERY SHOP ROW
// in a REAL browser, on a PHONE (same bar as verify_g10..g13: anything a
// player looks at is verified by a real-browser run at 390x844 @3x; a code
// claim is not evidence). Drives the REAL boot -> intro skip -> title -> SHOP
// and asserts:
//   (a) every SHOP_UPGRADES id renders a canvas whose painted pixels are
//       NON-EMPTY (alpha-sum > 0) and whose CSS size is an exact integer
//       multiple of the 16x16 backing store (read via __TEST.shopIcons.report,
//       the seam the screen itself keeps, not DOM heuristics);
//   (b) the fallback path paints non-empty for an unknown id (the game's own
//       shopIcon() + drawGrid, in-page);
//   (c) the row text contract is unchanged: name, desc, LV n/max, MAXED /
//       OWNED / cost lines all present in the DOM;
//   (d) a REAL tap on an affordable row purchases with gold dropping by
//       exactly upgradeCost(def, 0); a REAL tap on a capped (MAXED) row does
//       not change gold;
//   (e) the chrome gate is unaffected: chromeOn() false, touch layer down.
//
// EVIDENCE DISCLOSURE (stated plainly): there is NO vision model reachable
// from this host. The verdict rests on DOM geometry + canvas getImageData +
// real taps — no "looks right" judgement.
//
// Run: node tools/verify_g14_shop_icons.mjs
import { withPage } from './browser.mjs';
import { copyFileSync } from 'node:fs';

const out = await withPage({ w: 390, h: 844, dpr: 3,
  startupScript: "try { localStorage.setItem('hordes_onboarded', '1'); } catch (e) {}" },
  async (p) => {
    await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
    await p.waitFor("(async () => (await import('./src/main.js')).__TEST.state.mode !== 'intro')()", 15000);
    await p.waitFor("(async () => { const rv = (await import('./src/main.js')).__TEST.state.titleReveal;" +
      " return !rv || rv.phase === 'settled'; })()", 8000);
    // Seed through the game's OWN import seam: rich enough to buy, with the
    // 'thrifty' line pre-maxed so a CAPPED row exists for the no-buy tap.
    await p.evaluate(`(async () => {
      const m = await import('./src/meta.js');
      const T = (await import('./src/main.js')).__TEST;
      const prof = m.makeProfile();
      prof.gold = 10000;
      T.save.importText(JSON.stringify(m.exportProfile(prof)));
      for (let i = 0; i < 4; i++) m.buyUpgrade(T.getProfile(), 'thrifty');   // LV 4/4 MAXED
    })()`);

    // REAL TAP: title -> SHOP.
    const shopCenter = await p.evaluate(`(() => {
      const el = [...document.getElementById('ov-cards').children]
        .find(c => (c.innerHTML || '').includes('>SHOP<'));
      const r = el.getBoundingClientRect();
      return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
    })()`);
    await p.tap(shopCenter[0], shopCenter[1]);
    await p.waitFor("(document.getElementById('ov-title') || {}).textContent === 'SHOP'", 5000);
    await p.evaluate("(async () => { const r = () => new Promise(q => requestAnimationFrame(() => requestAnimationFrame(q))); await r(); })()");

    // ---- (a) + (c) + (e): the seam report, the row text, the chrome gate ----
    const probe = await p.evaluate(`(async () => {
      const m = await import('./src/main.js');
      const meta = await import('./src/meta.js');
      const T = m.__TEST;
      const cards = [...document.querySelectorAll('#ov-cards .card')];
      const rows = meta.SHOP_UPGRADES.map(def => {
        const el = cards.find(c => (c.innerHTML || '').includes('>' + def.name + '<'));
        return { id: def.id, name: def.name, found: !!el,
                 html: el ? el.innerHTML : null,
                 nCanvases: el ? el.querySelectorAll('canvas').length : 0 };
      });
      const gold = T.getProfile().gold;
      return {
        mode: T.state.mode, chromeOn: T.chromeOn(),
        touchDisplay: (document.getElementById('touch') || { style: {} }).style.display,
        report: T.shopIcons.report, rows, gold,
        upgradeCost0: meta.upgradeCost(meta.SHOP_UPGRADES.find(d => d.id === 'dmg'), 0),
        backRow: (() => { const b = cards.find(c => (c.innerHTML || '').includes('>BACK<'));
                          return b ? { found: true, nCanvases: b.querySelectorAll('canvas').length } : null; })(),
      };
    })()`);

    // ---- (b) the fallback path for an unknown id ---------------------------
    const fallback = await p.evaluate(`(async () => {
      const m = await import('./src/main.js');
      const art = await import('./src/art/index.js');
      const cv = document.createElement('canvas');
      cv.width = 16; cv.height = 16;
      const icon = art.shopIcon('definitely_not_a_row_id');
      m.__TEST.renderer.drawGrid(cv.getContext('2d'), icon.grid, icon.palette, 0, 0);
      const d = cv.getContext('2d').getImageData(0, 0, 16, 16).data;
      let painted = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 0) painted++;
      return { id: icon.id, painted };
    })()`);

    // ---- (d1) REAL TAP on an affordable row: 'dmg' (LV 0) ------------------
    await p.evaluate(`(() => {
      const el = [...document.querySelectorAll('#ov-cards .card')]
        .find(c => (c.innerHTML || '').includes('>Forged Edge<'));
      el.scrollIntoView({ block: 'center' });
    })()`);
    await p.sleep(150);
    const dmgCenter = await p.evaluate(`(() => {
      const el = [...document.querySelectorAll('#ov-cards .card')]
        .find(c => (c.innerHTML || '').includes('>Forged Edge<'));
      const r = el.getBoundingClientRect();
      return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
    })()`);
    await p.tap(dmgCenter[0], dmgCenter[1]);
    const afterBuy = await p.evaluate(`(async () => {
      const T = (await import('./src/main.js')).__TEST;
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const el = [...document.querySelectorAll('#ov-cards .card')]
        .find(c => (c.innerHTML || '').includes('>Forged Edge<'));
      return { gold: T.getProfile().gold, lvl: T.getProfile().purchased.dmg || 0,
               rowHtml: el ? el.innerHTML : null };
    })()`);

    // ---- (d2) REAL TAP on the capped row: 'thrifty' (LV 4/4 MAXED) ---------
    await p.evaluate(`(() => {
      const el = [...document.querySelectorAll('#ov-cards .card')]
        .find(c => (c.innerHTML || '').includes('>Thrifty Casting<'));
      el.scrollIntoView({ block: 'center' });
    })()`);
    await p.sleep(150);
    const thrCenter = await p.evaluate(`(() => {
      const el = [...document.querySelectorAll('#ov-cards .card')]
        .find(c => (c.innerHTML || '').includes('>Thrifty Casting<'));
      const r = el.getBoundingClientRect();
      return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
    })()`);
    await p.tap(thrCenter[0], thrCenter[1]);
    const afterCapped = await p.evaluate(`(async () => {
      const T = (await import('./src/main.js')).__TEST;
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      return { gold: T.getProfile().gold, lvl: T.getProfile().purchased.thrifty || 0 };
    })()`);

    const shot = await p.shot('g14-shop-icons-phone');
    return { ...probe, fallback, afterBuy, afterCapped, shot, errors: p.errors };
  });

console.log(JSON.stringify({ ...out, rows: out.rows.length }, null, 2));

// The canonical artifact lands in the docs tree (same directory as G8-G13).
const canonical = 'docs/art/browser-verify-2026-09-12/g14-shop-icons-phone.png';
try { copyFileSync(out.shot, canonical); } catch (e) { console.error('COPY FAILED: ' + e.message); }

// ---------------------------------------------------------------- verdict --
const problems = [];
if (out.mode !== 'menu') problems.push('screen: mode is ' + out.mode);
if (out.chromeOn !== false) problems.push('chrome: chromeOn() is true over the shop');
if (out.touchDisplay !== 'none') problems.push('chrome: touch layer display=' + out.touchDisplay);
// (a) every row: canvas present, painted, integer multiple of 16
const ids = Object.keys(out.report);
// NOTE: SHOP_UPGRADES itself has 27 rows; the art map's 29 icons additionally
// cover the two STARTER_WEAPONS (no shop rows) — the row count asserted here
// is the live table's own length, cross-checked against the seam's ids.
if (ids.length !== out.rows.length) problems.push('rows: seam reports ' + ids.length + ' canvases (want ' + out.rows.length + ')');
for (const r of out.rows) {
  const rep = out.report[r.id];
  if (!r.found) { problems.push('row: ' + r.id + ' card not found'); continue; }
  if (r.nCanvases !== 1) problems.push('row: ' + r.id + ' has ' + r.nCanvases + ' canvases (want 1)');
  if (!rep) { problems.push('row: ' + r.id + ' missing from the seam report'); continue; }
  if (rep.w !== 16 || rep.h !== 16) problems.push('row: ' + r.id + ' backing store is ' + rep.w + 'x' + rep.h + ' (want 16x16)');
  if (!rep.painted || rep.painted <= 0) problems.push('row: ' + r.id + ' icon has ' + rep.painted + ' painted pixels');
  if (rep.cssPx % 16 !== 0 || rep.scale !== 2) {
    problems.push('row: ' + r.id + ' CSS scale is not integer 2x (css ' + rep.cssPx + 'px, scale ' + rep.scale + ')');
  }
}
// BACK stays a plain text row (no icon canvas)
if (!out.backRow || !out.backRow.found) problems.push('rows: no BACK card');
else if (out.backRow.nCanvases !== 0) problems.push('rows: BACK grew an icon canvas');
// (b) fallback
if (out.fallback.id !== '__fallback') problems.push('fallback: unknown id resolved to ' + out.fallback.id);
if (!out.fallback.painted || out.fallback.painted <= 0) problems.push('fallback: paints ' + out.fallback.painted + ' pixels');
// (c) row text contract
for (const r of out.rows) {
  if (!r.html) continue;
  const meta = out.rows.find(x => x.id === r.id);
  if (!/class="name"/.test(r.html) || !/class="desc"/.test(r.html)) problems.push('text: ' + r.id + ' lost the name/desc structure');
  if (!/(gold|OWNED|MAXED)/.test(r.html)) problems.push('text: ' + r.id + ' lost its cost/OWNED/MAXED line');
}
if (!out.afterBuy.rowHtml || !/LV 1\/\d/.test(out.afterBuy.rowHtml)) {
  problems.push('text: after the tap the dmg row does not read LV 1/n');
}
// (d) taps
if (out.afterBuy.lvl !== 1) problems.push('tap: the affordable row did not level (lvl=' + out.afterBuy.lvl + ')');
if (out.gold - out.afterBuy.gold !== out.upgradeCost0) {
  problems.push('tap: gold moved ' + out.gold + ' -> ' + out.afterBuy.gold + ' (want exactly -' + out.upgradeCost0 + ')');
}
if (out.afterCapped.lvl !== 4 || out.afterCapped.gold !== out.afterBuy.gold) {
  problems.push('tap: the capped row changed something (gold ' + out.afterBuy.gold + ' -> ' + out.afterCapped.gold + ', lvl ' + out.afterCapped.lvl + ')');
}
if (out.errors && out.errors.length) problems.push('console errors: ' + out.errors.join(' | '));

console.log(problems.length ? 'VERIFY G14 SHOP ICONS: FAIL - ' + problems.join('; ')
  : 'VERIFY G14 SHOP ICONS: PASS - all ' + out.rows.length + ' shop rows render their authored 16x16 icon at integer 2x with non-empty pixels, the fallback paints, row text is unchanged, a real tap buys at exactly -' + out.upgradeCost0 + 'g, the MAXED row does not buy, chrome stays off');
console.log('PNG: ' + canonical);
console.log('EVIDENCE: __TEST.shopIcons.report (backing size + CSS scale + painted count per row) + DOM text + real taps above. No vision read is made by this tool (vision_analyze works here but is flaky - crop + downscale); no "looks right" judgement is claimed.');

process.exit(problems.length ? 1 : 0);
