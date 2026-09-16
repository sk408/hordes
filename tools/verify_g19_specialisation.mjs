// HORDES - tools/verify_g19_specialisation.mjs (G19 SLICE 2: the legible
// identity). REAL Chrome 390x844 @dpr3, touch emulation, every TOUR_KEY on
// this tree set (counted and reported), and state.time > 1.0 asserted BEFORE
// ANY MEASUREMENT (the house rule): a real run is started and ended first,
// then every arm below runs on real taps against the live UI.
//
//   (0) house rule: run live, state.time > 1.0, all TOUR_KEYS set, END RUN
//       -> title (bank left UNDER every unlock price so WITCH/ROGUE/PALADIN
//       stay LOCKED - legibility before investment is the point);
//   (1) the EQUIP screen (title CHARACTERS card): every one of the four
//       pilots is selected by a REAL tap and the rendered STRONG/WEAK kit
//       lines are READ BACK and compared against the string DERIVED from
//       CHARACTER_SPECIALTIES (one of them LOCKED - WITCH); PNG;
//   (2) the per-character SHOP ROWS screen (SHOP -> CHARACTERS door ->
//       Knight): the sub-line carries the same derived STRONG/WEAK copy; PNG.
// Zero console errors. PNGs -> docs/art/g19-specialisation-2026-09-16/.
// Run: node tools/verify_g19_specialisation.mjs
import { withPage } from './browser.mjs';
import { copyFileSync, mkdirSync } from 'node:fs';
import { TOUR_KEYS } from '../src/tour.js';
import { CHARACTERS, specialtyLines } from '../src/meta.js';

const ART = 'docs/art/g19-specialisation-2026-09-16';
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
const tapAt = async (p, label, at) => {
  if (!at || !Number.isFinite(at[0]) || !Number.isFinite(at[1])) throw new Error('tap target missing/bad: ' + label + ' ' + JSON.stringify(at));
  await p.tap(at[0], at[1]);
};

// The node-side derivation (the SAME helper the screens call — the whole point
// is that the DOM cannot disagree with the table).
const EXPECTED = {};
for (const cid of Object.keys(CHARACTERS)) EXPECTED[cid] = specialtyLines(cid);

const arm = await withPage({ w: 390, h: 844, dpr: 3, mobile: true, skipTour: false, startupScript: STARTUP },
  async (p) => {
    // ---- (0) the house rule: a REAL run first, time asserted ----
    await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
    await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode !== 'intro')()`, 15000);
    await p.waitFor(`(async () => { const rv = (await import('./src/main.js')).__TEST.state.titleReveal; return !rv || rv.phase === 'settled'; })()`, 8000);
    const missing = await p.evaluate(`${JSON.stringify(KEYS)}.filter(k => localStorage.getItem(k) !== '1').length`);
    const startUp = await p.waitFor(`(() => {
      const el = [...document.getElementById('ov-cards').children]
        .find(k => (k.textContent || '').toUpperCase().includes('START GAME'));
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0;
    })()`, 10000, 250);
    const start = startUp ? await p.evaluate(`(() => {
      const el = [...document.getElementById('ov-cards').children]
        .find(k => (k.textContent || '').toUpperCase().includes('START GAME'));
      const r = el.getBoundingClientRect();
      return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
    })()`) : null;
    await tapAt(p, 'START GAME', start);
    const runLive = await p.waitFor(`(async () => { const s = ${T}.state; return s.mode === 'playing' && s.time > 1.0; })()`, 12000, 200);
    const runTime = await p.evaluate(`(async () => +${T}.state.time.toFixed(2))()`);
    // END RUN (two real taps through the settings screen) -> back to title.
    const cog = await p.evaluate(`(() => {
      const el = document.querySelector('[data-act="settings"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
    })()`);
    await tapAt(p, 'settings cog', cog);
    await p.waitFor(`(async () => ${T}.state.mode === 'settings')()`, 5000);
    const end1 = await p.evaluate(byName('END RUN'));
    await tapAt(p, 'END RUN', end1);
    await p.sleep(200);
    const end2 = await p.evaluate(byName('CONFIRM END RUN?'));
    if (end2) await tapAt(p, 'CONFIRM END RUN', end2);
    await p.waitFor(`(async () => ${T}.state.mode === 'dead')()`, 5000);
    const title = await p.evaluate(byName('TITLE'));
    if (title) await tapAt(p, 'TITLE', title);
    await p.waitFor(`document.getElementById('ov-title').textContent === 'HORDES'`, 5000);

    // Bank UNDER every unlock price: selecting stays free, nobody gets bought.
    await p.evaluate(`(async () => { ${T}.getProfile().gold = 2000; })()`);

    // ---- (1) the EQUIP screen: read back every pilot's identity lines ----
    const charsAt = await p.evaluate(byName('CHARACTERS'));
    await tapAt(p, 'CHARACTERS', charsAt);
    await p.waitFor(`document.getElementById('ov-title').textContent === 'CHARACTERS'`, 5000);
    const kits = {};
    for (const cid of Object.keys(CHARACTERS)) {
      await p.sleep(150);   // let the deferred frame-card batch land before measuring
      const at = await p.evaluate(`(() => {
        const el = document.querySelector('[data-pilot=${JSON.stringify(cid)}]');
        if (!el) return null;
        if (el.scrollIntoView) el.scrollIntoView({ block: 'center' });
        const r = el.getBoundingClientRect();
        return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
      })()`);
      await tapAt(p, 'pilot card ' + cid, at);
      await p.sleep(250);
      kits[cid] = await p.evaluate(`(async () => {
        const el = document.getElementById('char-kit');
        const desc = el ? el.querySelector('.desc') : null;
        return {
          text: desc ? desc.textContent : null,
          locked: !((${T}.getProfile().unlockedCharacters || []).includes(${JSON.stringify(cid)})),
        };
      })()`);
    }
    const equipShot = await p.shot('g19s2-equip-identity');

    // ---- (2) the SHOP ROWS screen: the sub-line carries the same copy ----
    await escBack(p);
    await p.waitFor(`document.getElementById('ov-title').textContent === 'HORDES'`, 5000);
    await tapAt(p, 'SHOP', await p.evaluate(byName('SHOP')));
    await p.waitFor(`document.getElementById('ov-title').textContent === 'SHOP'`, 5000);
    await tapAt(p, 'CHARACTERS', await p.evaluate(byName('CHARACTERS')));
    await p.waitFor(`document.getElementById('ov-title').textContent === 'CHARACTERS'`, 5000);
    await tapAt(p, 'Knight', await p.evaluate(byName('Knight')));
    const rowsUp = await p.waitFor(`document.getElementById('ov-title').textContent === 'KNIGHT'`, 5000);
    const rowsSub = await p.evaluate(`(() => document.getElementById('ov-sub').textContent)()`);
    const rowsShot = await p.shot('g19s2-rows-identity');

    return { missing, runLive, runTime, kits, equipShot, rowsUp, rowsSub, rowsShot, errors: p.errors };
  });

// ---- verdict ----------------------------------------------------------------
check('(0) house rule: run live with state.time > 1.0 BEFORE any measurement (' + arm.runTime + 's) and all ' + KEYS.length + ' TOUR_KEYS on this tree set',
  arm.runLive === true && arm.runTime > 1.0 && arm.missing === 0,
  { runTime: arm.runTime, missing: arm.missing, tourKeys: KEYS.length });

for (const cid of Object.keys(CHARACTERS)) {
  const exp = EXPECTED[cid];
  const kit = arm.kits[cid];
  check('(1) ' + cid + (kit && kit.locked ? ' (LOCKED)' : '') + ' kit reads back the DERIVED identity: "' + exp.strong + '" / "' + exp.weak + '"',
    !!kit && !!kit.text && kit.text.includes(exp.strong) && kit.text.includes(exp.weak),
    { rendered: kit && kit.text, expected: exp, locked: kit && kit.locked });
}
check('(1-lock) at least one read-back pilot was LOCKED (legibility before investment)',
  Object.values(arm.kits).some(k => k.locked && k.text && k.text.includes('STRONG:')),
  { locked: Object.fromEntries(Object.entries(arm.kits).map(([c, k]) => [c, k.locked])) });

const knightExp = EXPECTED.KNIGHT;
check('(2) the SHOP ROWS screen carries the same derived copy (ov-sub): "' + knightExp.strong + '" / "' + knightExp.weak + '"',
  arm.rowsUp === true && (arm.rowsSub || '').includes(knightExp.strong) && (arm.rowsSub || '').includes(knightExp.weak),
  { rowsSub: arm.rowsSub, expected: knightExp });
check('no console errors in the arm', arm.errors.length === 0, arm.errors);

let copied = 0;
for (const s of [arm.equipShot, arm.rowsShot]) {
  if (!s) continue;
  try { copyFileSync(s, ART + '/' + s.split('/').pop()); copied++; } catch (e) { console.error('COPY FAILED: ' + e.message); }
}
check('PNGs copied into ' + ART + ' (equip-screen identity, rows-screen identity)', copied === 2, { copied });

const bad = results.filter((r) => !r.ok).length;
console.log(bad ? 'VERIFY G19 SPECIALISATION: FAIL' : 'VERIFY G19 SPECIALISATION: PASS - real-tap identity read-back on the equip screen (4 pilots incl. a LOCKED one) and the shop rows screen, ' + copied + ' PNGs in ' + ART);
process.exit(bad ? 1 : 0);
