// HORDES - tools/verify_g19_characters.mjs (G19 SLICE 1: per-character
// upgrades). REAL Chrome 390x844 @dpr3, touch emulation, all 19 TOUR_KEYS
// set, and state.time > 1.0 asserted BEFORE ANY MEASUREMENT (the house rule):
// a real run is started and ended first, then every arm below runs on real
// taps against the live UI.
//
//   (0) house rule: run live, state.time > 1.0, 19 flags, END RUN -> title;
//   (1) the GLOBAL floor arm: buy the global 'well' row by a real tap (so the
//       per-character arms can prove the global layer rides BOTH characters);
//   (2) the CHARACTERS door on the SHOP screen: real tap opens the list, then
//       a pilot's row list; PNG;
//   (3) ONE-TAP purchase of knight_vigor: gold debited by EXACTLY the printed
//       cost, the row re-renders LV 1/<max>; PNG;
//   (4) the PREVIEW follows: the KNIGHT kit's maxHp moves, the WITCH kit's
//       numbers stay put (her levels stay 0), and BOTH kits carry the global
//       well bonus (the floor is untouched);
//   (5) a LOCKED character (WITCH, bank deliberately under her unlock price)
//       refuses the buy: gold unchanged, level still 0; PNG.
// Zero console errors. PNGs -> docs/art/g19-characters-2026-09-15/.
// Run: node tools/verify_g19_characters.mjs
import { withPage } from './browser.mjs';
import { copyFileSync, mkdirSync } from 'node:fs';
import { TOUR_KEYS } from '../src/tour.js';

const ART = 'docs/art/g19-characters-2026-09-15';
mkdirSync(ART, { recursive: true });

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok, detail });
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (detail !== undefined ? ' :: ' + JSON.stringify(detail) : ''));
};

const KEYS = Object.values(TOUR_KEYS);
const STARTUP = `
try {
  localStorage.setItem('hordes_onboarded', '1');
  for (const k of ${JSON.stringify(KEYS)}) localStorage.setItem(k, '1');
} catch (e) {}`;

const T = `(await import('./src/main.js')).__TEST`;
const cardCenter = (pred) => `(() => {
  const el = [...document.getElementById('ov-cards').children].find(${pred});
  if (!el) return null;
  if (el.scrollIntoView) el.scrollIntoView({ block: 'center' });
  const r = el.getBoundingClientRect();
  return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
})()`;
const byName = (name) => cardCenter(`c => c.querySelector('.name') && c.querySelector('.name').textContent === ${JSON.stringify(name)}`);
const escBack = (p) => p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");

const arm = await withPage({ w: 390, h: 844, dpr: 3, mobile: true, skipTour: false, startupScript: STARTUP },
  async (p) => {
    // ---- (0) the house rule: a REAL run first, time asserted ----
    await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
    await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode !== 'intro')()`, 15000);
    await p.waitFor(`(async () => { const rv = (await import('./src/main.js')).__TEST.state.titleReveal; return !rv || rv.phase === 'settled'; })()`, 8000);
    const missing = await p.evaluate(`${JSON.stringify(KEYS)}.filter(k => localStorage.getItem(k) !== '1').length`);
    const start = await p.evaluate(`(() => {
      const el = [...document.getElementById('ov-cards').children]
        .find(k => (k.textContent || '').toUpperCase().includes('START GAME'));
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
    })()`);
    if (!start) throw new Error('no START GAME card');
    await p.tap(start[0], start[1]);
    const runLive = await p.waitFor(`(async () => { const s = ${T}.state; return s.mode === 'playing' && s.time > 1.0; })()`, 12000, 200);
    const runTime = await p.evaluate(`(async () => +${T}.state.time.toFixed(2))()`);
    // END RUN (two real taps through the settings screen) -> back to title.
    const cog = await p.evaluate(`(() => {
      const el = document.querySelector('[data-act="settings"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
    })()`);
    await p.tap(cog[0], cog[1]);
    await p.waitFor(`(async () => ${T}.state.mode === 'settings')()`, 5000);
    const end1 = await p.evaluate(byName('END RUN'));
    await p.tap(end1[0], end1[1]);
    await p.sleep(200);
    const end2 = await p.evaluate(byName('CONFIRM END RUN?'));
    if (end2) await p.tap(end2[0], end2[1]);
    await p.waitFor(`(async () => ${T}.state.mode === 'dead')()`, 5000);
    const title = await p.evaluate(byName('TITLE'));
    if (title) await p.tap(title[0], title[1]);
    await p.waitFor(`document.getElementById('ov-title').textContent === 'HORDES'`, 5000);

    // ---- fund the bank (disclosed seam, same as the shop-latency tool) ----
    await p.evaluate(`(async () => { ${T}.getProfile().gold = 500000; })()`);

    // ---- (1) buy the GLOBAL 'well' row by a real tap (the floor arm) ----
    const wellInfo = await p.evaluate(`(async () => {
      const { SHOP_UPGRADES, upgradeCost } = await import('./src/meta.js');
      const def = SHOP_UPGRADES.find(d => d.id === 'well');
      const prof = ${T}.getProfile();
      return { name: def.name, cost: upgradeCost(def, prof.purchased.well || 0) };
    })()`);
    await p.tap(...await p.evaluate(byName('SHOP')));
    await p.waitFor(`document.getElementById('ov-title').textContent === 'SHOP'`, 5000);
    const wellCard = await p.evaluate(byName(wellInfo.name));
    await p.tap(wellCard[0], wellCard[1]);
    await p.sleep(400);
    const afterWell = await p.evaluate(`(async () => ({ well: ${T}.getProfile().purchased.well || 0 }) )()`);

    // ---- kit snapshots BEFORE the per-character purchase ----
    const readKit = async (pilot, fund) => {
      await escBack(p);
      await p.waitFor(`document.getElementById('ov-title').textContent === 'HORDES'`, 5000);
      if (fund !== undefined) await p.evaluate(`(async () => { ${T}.getProfile().gold = ${fund}; })()`);
      await p.tap(...await p.evaluate(byName('CHARACTERS')));
      await p.waitFor(`document.getElementById('ov-title').textContent === 'CHARACTERS'`, 5000);
      await p.tap(...await p.evaluate(`(() => {
        const el = document.querySelector('[data-pilot=${JSON.stringify(pilot)}]');
        if (!el) return null;
        if (el.scrollIntoView) el.scrollIntoView({ block: 'center' });
        const r = el.getBoundingClientRect();
        return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
      })()`));
      await p.sleep(250);
      return p.evaluate(`(() => {
        const el = document.getElementById('char-kit');
        return el ? JSON.parse(el.getAttribute('data-kit')) : null;
      })()`);
    };
    // WITCH's kit is read with the bank UNDER her unlock price so the tap
    // selects (previewing is free) but cannot buy.
    const witchBefore = await readKit('WITCH', 2000);
    const knightBefore = await readKit('KNIGHT', 500000);

    // ---- (2) the CHARACTERS door on the SHOP screen ----
    await escBack(p);
    await p.waitFor(`document.getElementById('ov-title').textContent === 'HORDES'`, 5000);
    await p.tap(...await p.evaluate(byName('SHOP')));
    await p.waitFor(`document.getElementById('ov-title').textContent === 'SHOP'`, 5000);
    const doorAt = await p.evaluate(byName('CHARACTERS'));
    await p.tap(doorAt[0], doorAt[1]);
    const listUp = await p.waitFor(`document.getElementById('ov-title').textContent === 'CHARACTERS'`, 5000);
    const listShot = await p.shot('g19-door+list');
    const knightDoor = await p.evaluate(byName('Knight'));
    await p.tap(knightDoor[0], knightDoor[1]);
    const rowsUp = await p.waitFor(`document.getElementById('ov-title').textContent === 'KNIGHT'`, 5000);

    // ---- (3) ONE-TAP purchase of knight_vigor ----
    const vigor = await p.evaluate(`(async () => {
      const { CHARACTER_UPGRADE_BY_ID, upgradeCost } = await import('./src/meta.js');
      const def = CHARACTER_UPGRADE_BY_ID.knight_vigor;
      const prof = ${T}.getProfile();
      return { name: def.name, maxLevel: def.maxLevel, cost: upgradeCost(def, 0), gold: prof.gold };
    })()`);
    const rowsShotBefore = await p.shot('g19-rows-before');
    const vigorCard = await p.evaluate(byName(vigor.name));
    await p.tap(vigorCard[0], vigorCard[1]);
    await p.sleep(400);
    const afterBuy = await p.evaluate(`(async () => {
      const { getCharacterUpgradeLevel } = await import('./src/meta.js');
      const prof = ${T}.getProfile();
      const el = [...document.querySelectorAll('#ov-cards .card .name')]
        .find(n => n.textContent === 'Iron Vigor');
      const row = el ? el.closest('.card') : null;
      return { gold: prof.gold, level: getCharacterUpgradeLevel(prof, 'KNIGHT', 'knight_vigor'),
        sub: row ? row.querySelector('.desc').textContent : null,
        witch: getCharacterUpgradeLevel(prof, 'WITCH', 'witch_wellspring') };
    })()`);
    const rowsShotAfter = await p.shot('g19-rows-after-buy');

    // ---- (4) the preview follows, isolation + global floor ----
    const knightAfter = await readKit('KNIGHT', 500000);
    const witchAfter = await readKit('WITCH', 2000);

    // ---- (5) LOCKED refusal: WITCH rows refuse the buy ----
    await escBack(p);
    await p.waitFor(`document.getElementById('ov-title').textContent === 'HORDES'`, 5000);
    await p.tap(...await p.evaluate(byName('SHOP')));
    await p.waitFor(`document.getElementById('ov-title').textContent === 'SHOP'`, 5000);
    await p.tap(...await p.evaluate(byName('CHARACTERS')));
    await p.waitFor(`document.getElementById('ov-title').textContent === 'CHARACTERS'`, 5000);
    await p.tap(...await p.evaluate(byName('Witch')));
    const witchRowsUp = await p.waitFor(`document.getElementById('ov-title').textContent === 'WITCH'`, 5000);
    const lockScreen = await p.evaluate(`(() => ({
      sub: document.getElementById('ov-sub').textContent,
      rowSub: [...document.querySelectorAll('#ov-cards .card .desc')].map(d => d.textContent)[0],
    }))()`);
    const goldBeforeRefusal = await p.evaluate(`(async () => ${T}.getProfile().gold )()`);
    const wellCard2 = await p.evaluate(byName('Wellspring'));
    await p.tap(wellCard2[0], wellCard2[1]);
    await p.sleep(400);
    const refusal = await p.evaluate(`(async () => {
      const { getCharacterUpgradeLevel } = await import('./src/meta.js');
      const prof = ${T}.getProfile();
      return { gold: prof.gold, level: getCharacterUpgradeLevel(prof, 'WITCH', 'witch_wellspring'),
        unlocked: prof.unlockedCharacters.includes('WITCH') };
    })()`);
    const lockedShot = await p.shot('g19-locked-refusal');

    return { missing, runLive, runTime, wellInfo, afterWell, witchBefore, knightBefore,
      listUp, rowsUp, rowsShotBefore, vigor, afterBuy, rowsShotAfter, knightAfter, witchAfter,
      witchRowsUp, lockScreen, goldBeforeRefusal, refusal, lockedShot, listShot, errors: p.errors };
  });

// ---- verdict ----------------------------------------------------------------
check('(0) house rule: run live with state.time > 1.0 BEFORE any measurement (' + arm.runTime + 's) and all ' + KEYS.length + ' tour flags set',
  arm.runLive === true && arm.runTime > 1.0 && arm.missing === 0,
  { runTime: arm.runTime, missing: arm.missing });
check('(1) the GLOBAL floor arm: bought ' + arm.wellInfo.name + ' for ' + arm.wellInfo.cost + ' gold by a real tap',
  arm.afterWell.well === 1, arm.afterWell);
check('(2) the CHARACTERS door opens from the SHOP screen by a real tap, and the KNIGHT row list opens',
  arm.listUp === true && arm.rowsUp === true, { listUp: arm.listUp, rowsUp: arm.rowsUp });
check('(3) ONE-TAP purchase: gold debited EXACTLY ' + arm.vigor.cost + ' (' + arm.vigor.gold + ' -> ' + arm.afterBuy.gold + '), row re-rendered LV 1/' + arm.vigor.maxLevel,
  arm.afterBuy.gold === arm.vigor.gold - arm.vigor.cost && arm.afterBuy.level === 1 &&
  new RegExp('LV 1/' + arm.vigor.maxLevel).test(arm.afterBuy.sub || ''),
  { after: arm.afterBuy });
check('(4a) the PREVIEW moved with the purchase: KNIGHT kit maxHp ' + arm.knightBefore.maxHp + ' -> ' + arm.knightAfter.maxHp + ' (+' + arm.vigor.cost + ' gold bought +12 max HP)',
  arm.knightAfter.maxHp === arm.knightBefore.maxHp + 12,
  { before: arm.knightBefore.maxHp, after: arm.knightAfter.maxHp });
check('(4b) isolation in the UI: the WITCH kit stayed put (maxHp ' + arm.witchBefore.maxHp + ' -> ' + arm.witchAfter.maxHp + ', her rows level ' + arm.afterBuy.witch + ')',
  arm.witchAfter.maxHp === arm.witchBefore.maxHp && arm.afterBuy.witch === 0 &&
  JSON.stringify(arm.witchAfter) === JSON.stringify(arm.witchBefore),
  { witchBefore: arm.witchBefore, witchAfter: arm.witchAfter });
check('(4c) the GLOBAL layer rides BOTH characters (well bonus present on KNIGHT ' + arm.knightAfter.maxMana + ' and WITCH ' + arm.witchAfter.maxMana + ' max mana)',
  arm.knightAfter.maxMana > 100 && arm.witchAfter.maxMana > 150 &&
  arm.knightAfter.maxMana === arm.knightBefore.maxMana && arm.witchAfter.maxMana === arm.witchBefore.maxMana,
  { knight: arm.knightAfter.maxMana, witch: arm.witchAfter.maxMana });
check('(5) a LOCKED character REFUSES the buy: screen says so, gold ' + arm.goldBeforeRefusal + ' unchanged, witch_wellspring still ' + arm.refusal.level + ', still locked',
  arm.witchRowsUp === true && /LOCKED/i.test(arm.lockScreen.sub) && /LOCKED/i.test(arm.lockScreen.rowSub) &&
  arm.refusal.gold === arm.goldBeforeRefusal && arm.refusal.level === 0 && arm.refusal.unlocked === false,
  { lockScreen: arm.lockScreen, refusal: arm.refusal });
check('no console errors in the arm', arm.errors.length === 0, arm.errors);

let copied = 0;
for (const s of [arm.listShot, arm.rowsShotBefore, arm.rowsShotAfter, arm.lockedShot]) {
  if (!s) continue;
  try { copyFileSync(s, ART + '/' + s.split('/').pop()); copied++; } catch (e) { console.error('COPY FAILED: ' + e.message); }
}
check('PNGs copied into ' + ART + ' (door+list, rows before, rows after the buy, locked refusal)', copied === 4, { copied });

const bad = results.filter((r) => !r.ok).length;
console.log(bad ? 'VERIFY G19 CHARACTERS: FAIL' : 'VERIFY G19 CHARACTERS: PASS - real-tap door/list/buy/preview/isolation/global-floor/locked-refusal, ' + copied + ' PNGs in ' + ART);
process.exit(bad ? 1 : 0);
