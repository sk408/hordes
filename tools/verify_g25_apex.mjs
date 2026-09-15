// HORDES - tools/verify_g25_apex.mjs (G25 slice 1: the apex tier is REAL in
// the browser at phone size, on the screens the player taps).
//
// REAL Chrome, PHONE viewport 390x844 @dpr3, real finger taps. Proves:
//   A. PRE-COMPLETION (fresh profile): the shop DOM has NO APEX row at all -
//      the panel is ABSENT (not greyed) until the catalogue is finished, and
//      the live gate reads locked.
//   B. COMPLETED profile (every SHOP row owned, seeded through the real
//      localStorage key the game boots from): the APEX row appears, the panel
//      opens via a REAL tap (ovTitle 'APEX'), the BANK + both item costs are
//      stated, and the toggle flips the REAL persisted state.
//   C. INSUFFICIENT GOLD IS REFUSED: a REAL tap on the 550,000 item at
//      500,000 gold debits nothing and owns nothing; after the top-up the
//      same tap buys it (gold debited exactly baseCost).
//   D. APEX ON: a REAL tap on START GAME boots a run whose sim clock is
//      ASSERTED past 1.0s BEFORE anything is measured, the TEXT HUD carries
//      the APEX MARK OF THE GRIND flourish, and the REAL death screen
//      (through die(), the loop's own death seam) renders the APEX RUN
//      clause. The byte-identity contract is asserted on the LIVE module's
//      own endScreenBody: OFF === ON-minus-the-clause, string equality.
//   E. APEX OFF: a second REAL run (toggled off between runs) has NO APEX
//      text in the HUD and NO APEX text on its death screen.
//   F. TWO PNGs at 1170x2532 (apex panel + HUD with the flourish), READ BACK
//      from the COPIED ARTIFACTS: dimensions + bright-ink counts inside the
//      panel box and the HUD box.
// EVIDENCE DISCLOSURE: the verdict is live-DOM measurement + PNG dimensions
// and ink read back off the committed files - there is NO vision model in
// this job, so "looks right" is never claimed; ink and state are the evidence.
// FIXTURE DISCLOSURE: the gold top-up between the refused and the successful
// purchase (profile.gold 500000 -> 600000, in-page on the live profile) is
// the same fixture discipline the suite uses; it touches no gate, cost, or
// purchase code path - buyApex still runs its own affordability test.
// Run: node tools/verify_g25_apex.mjs
import { withPage } from './browser.mjs';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  makeProfile, SHOP_UPGRADES, shopRowOwned, buyUpgrade, APEX_BY_ID,
} from '../src/meta.js';

const ART = 'docs/art/browser-verify-2026-09-12';
mkdirSync(ART, { recursive: true });
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok, detail });
  console.log((ok ? '  PASS ' : '  FAIL ') + name + (detail !== undefined ? ' :: ' + JSON.stringify(detail) : ''));
};

const TOUR19 = ['stage1', 'hud', 'pilot', 'focus', 'stance', 'move', 'skills', 'potions',
  'stats', 'cog', 'draft', 'edge', 'chest', 'portal', 'arch', 'shrine',
  'intermission', 'death', 'settings'];

// The completed profile, built through the REAL catalogue buyers in-node:
// every SHOP row bought to its own ownership bar (the gate condition), then
// the bank set to the tool's starting figure.
function completedProfilePayload(gold) {
  const p = makeProfile();
  p.gold = 1e12;
  for (const def of SHOP_UPGRADES) {
    let guard = 0;
    while (!shopRowOwned(p, def) && buyUpgrade(p, def.id)) {
      if (++guard > 100) throw new Error('runaway buy loop on ' + def.id);
    }
  }
  if (!SHOP_UPGRADES.every(def => shopRowOwned(p, def))) throw new Error('fixture gate not open');
  p.gold = gold;
  return JSON.stringify({ ...p, version: 8 });
}

// Count bright-ink pixels inside a viewport-CSS-space box of a PNG file.
async function readBack(p, file, box) {
  const b64 = readFileSync(file).toString('base64');
  return p.evaluate(`(async () => {
    const img = await createImageBitmap(await (await fetch('data:image/png;base64,${b64}')).blob());
    const c = new OffscreenCanvas(img.width, img.height); const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const sx = img.width / innerWidth, sy = img.height / innerHeight;
    const x = Math.round(${box[0]} * sx), y = Math.round(${box[1]} * sy);
    const w = Math.round(${box[2]} * sx), h = Math.round(${box[3]} * sy);
    const d = g.getImageData(x, y, w, h).data;
    let ink = 0, bright = [0, 0, 0];
    for (let i = 0; i < d.length; i += 4) {
      const mx = Math.max(d[i], d[i + 1], d[i + 2]);
      if (mx > 110) { ink++; bright[0] += d[i]; bright[1] += d[i + 1]; bright[2] += d[i + 2]; }
    }
    if (ink) bright = bright.map(v => Math.round(v / ink));
    return { imgW: img.width, imgH: img.height, ink, meanInk: bright };
  })()`, true);
}

// Shared card-tap helper (title/shop/apex panel cards all live in ov-cards).
const centerOfExpr = (up) => `(() => {
  const el = [...document.getElementById('ov-cards').children]
    .find(k => (k.textContent || '').toUpperCase().includes(${JSON.stringify(up)}));
  if (!el) return null;
  let r = el.getBoundingClientRect();
  const ov = document.getElementById('overlay');
  if (ov) {
    if (r.bottom > innerHeight - 8) { ov.scrollTop += r.bottom - innerHeight + 24; r = el.getBoundingClientRect(); }
    else if (r.top < 8) { ov.scrollTop += r.top - 24; r = el.getBoundingClientRect(); }
  }
  if (r.bottom > innerHeight + 40 || r.top < -40 || r.right < 0 || r.left > innerWidth) return null;
  return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
})()`;
async function tapCard(p, up) {
  const c = await p.evaluate(centerOfExpr(up));
  if (!c) return null;
  await p.tap(c[0], c[1]);
  return c;
}
const cardTexts = (p) => p.evaluate(
  `(() => [...document.getElementById('ov-cards').children].map(c => (c.textContent || '').split('\\n')[0]))()`);

// ===========================================================================
// SESSION A - the fresh profile: the tier must be ABSENT, not greyed.
// ===========================================================================
await withPage({ w: 390, h: 844, dpr: 3,
  startupScript: "try { localStorage.setItem('hordes_onboarded', '1'); } catch (e) {}\n" +
    'for (const k of ' + JSON.stringify(TOUR19) + ") { try { localStorage.setItem('hordes_tour_' + k, '1'); } catch (e) {} }",
}, async (p) => {
  await p.waitFor("(async () => (await import('./src/main.js')).__TEST.state.mode !== 'intro')()", 15000);
  await p.waitFor("(async () => { const rv = (await import('./src/main.js')).__TEST.state.titleReveal; return !rv || rv.phase === 'settled'; })()", 8000);
  const gate = await p.evaluate(`(async () => {
    const M = await import('./src/meta.js');
    return { unlocked: M.apexUnlocked(M.makeProfile()), hasSave: !!(await import('./src/save.js')).detectStorage().getItem('hordes_profile_v1') };
  })()`, true);
  check('A1 fresh browser: the live gate reads LOCKED and no save exists',
    gate.unlocked === false && gate.hasSave === false, gate);
  const shop = await tapCard(p, 'SHOP');
  check('A2 the shop opens via a REAL tap', !!shop);
  const cards = await cardTexts(p);
  check('A3 the shop DOM has NO APEX row (the panel is absent, not greyed)',
    !cards.some(t => /APEX/.test(t)), { cards });
});

// ===========================================================================
// SESSION B - the completed profile: panel, toggle, purchase, two real runs.
// ===========================================================================
const SEED_GOLD = 500000;
const out = await withPage({ w: 390, h: 844, dpr: 3,
  startupScript: "try { localStorage.setItem('hordes_onboarded', '1'); } catch (e) {}\n" +
    'for (const k of ' + JSON.stringify(TOUR19) + ") { try { localStorage.setItem('hordes_tour_' + k, '1'); } catch (e) {} }\n" +
    "try { localStorage.setItem('hordes_profile_v1', " + JSON.stringify(completedProfilePayload(SEED_GOLD)) + "); } catch (e) {}",
}, async (p) => {
  await p.waitFor("(async () => (await import('./src/main.js')).__TEST.state.mode !== 'intro')()", 15000);
  await p.waitFor("(async () => { const rv = (await import('./src/main.js')).__TEST.state.titleReveal; return !rv || rv.phase === 'settled'; })()", 8000);
  const boot = await p.evaluate(`(async () => {
    const T = (await import('./src/main.js')).__TEST;
    const M = await import('./src/meta.js');
    return { gate: M.apexUnlocked(T.getProfile()), gold: T.getProfile().gold,
             saveStatus: T.save.status, version: T.save.version };
  })()`, true);
  check('B1 the seeded completed save BOOTS (v8) with the gate open and the seeded bank',
    boot.gate === true && boot.gold === SEED_GOLD && boot.version === 8, boot);

  await tapCard(p, 'SHOP');
  const cards = await cardTexts(p);
  check('B2 the shop now carries the APEX row', cards.some(t => /APEX/.test(t)), { cards });
  const panel = await tapCard(p, 'APEX');
  check('B3 the APEX panel opens via a REAL tap (ovTitle APEX)',
    !!panel && await p.evaluate(`(() => document.getElementById('ov-title').textContent)()`) === 'APEX');

  const body = await p.evaluate(`(() => document.getElementById('ov-sub').textContent || '')()`);
  const markCost = String(APEX_BY_ID.apex_mark.baseCost);
  const fireCost = String(APEX_BY_ID.apex_endless_fire.baseCost);
  check('B4 the panel states the BANK and BOTH item costs match baseCost',
    body.includes(`BANK: ${SEED_GOLD}`) &&
    (await cardTexts(p)).some(t => t.includes(markCost)) &&
    (await cardTexts(p)).some(t => t.includes(fireCost)),
    { bankLine: body.slice(0, 60), markCost, fireCost });

  // ---- C: insufficient gold refused, then the top-up buys it ----
  await tapCard(p, 'MARK OF THE GRIND');
  const refused = await p.evaluate(`(async () => {
    const T = (await import('./src/main.js')).__TEST;
    const pr = T.getProfile();
    return { gold: pr.gold, owned: pr.apex.owned.slice(), enabled: pr.apex.enabled };
  })()`, true);
  check('C1 a REAL tap at 500,000 gold on the 550,000 item debits NOTHING and owns NOTHING',
    refused.gold === SEED_GOLD && refused.owned.length === 0 && refused.enabled === false, refused);
  // Fixture top-up (disclosed in the header): the affordability test still
  // belongs to buyApex - only the bank moved.
  await p.evaluate(`(async () => { (await import('./src/main.js')).__TEST.getProfile().gold = 600000; })()`, true);
  await tapCard(p, 'MARK OF THE GRIND');
  const bought = await p.evaluate(`(async () => {
    const T = (await import('./src/main.js')).__TEST;
    const pr = T.getProfile();
    return { gold: pr.gold, owned: pr.apex.owned.slice(), persisted: JSON.parse(localStorage.getItem('hordes_profile_v1')).apex.owned };
  })()`, true);
  check('C2 after the top-up the SAME tap buys it: gold debited EXACTLY baseCost, ownership persisted to localStorage',
    bought.gold === 600000 - APEX_BY_ID.apex_mark.baseCost &&
    bought.owned.includes('apex_mark') &&
    JSON.stringify(bought.persisted) === JSON.stringify(['apex_mark']), bought);

  // ---- the toggle flips the REAL persisted state ----
  const t0 = await p.evaluate(`(async () => (await import('./src/main.js')).__TEST.getProfile().apex.enabled)()`, true);
  await tapCard(p, 'APEX OFF');
  const t1 = await p.evaluate(`(async () => {
    const T = (await import('./src/main.js')).__TEST;
    return { enabled: T.getProfile().apex.enabled,
             persisted: JSON.parse(localStorage.getItem('hordes_profile_v1')).apex.enabled,
             card: [...document.getElementById('ov-cards').children].map(c => (c.textContent || '').split('\\n')[0]).find(t => t.includes('APEX ON') || t.includes('APEX OFF')) };
  })()`, true);
  check('B5 a REAL tap on the toggle row flips apex OFF -> ON in the live profile AND in localStorage',
    t0 === false && t1.enabled === true && t1.persisted === true &&
    typeof t1.card === 'string' && t1.card.startsWith('APEX ON'), t1);

  // ---- PNG #1: the panel screen, ink read back ----
  const panelBox = await p.evaluate(`(() => { const r = document.getElementById('overlay').getBoundingClientRect();
    return [r.left, r.top, r.width, r.height]; })()`);
  const shotPanel = await p.shot('g25-apex-panel-phone');
  const destPanel = join(ART, 'g25-apex-panel-phone.png');
  copyFileSync(shotPanel, destPanel);
  const inkPanel = await readBack(p, destPanel, panelBox);
  check('F1 the apex-panel PNG is 1170x2532 and the panel box paints bright ink (no vision model - ink only)',
    inkPanel.imgW === 1170 && inkPanel.imgH === 2532 && inkPanel.ink > 200,
    { imgW: inkPanel.imgW, imgH: inkPanel.imgH, ink: inkPanel.ink, meanInk: inkPanel.meanInk });

  // ---- D: apex ON run - flourish, byte-identity, the APEX RUN clause ----
  await tapCard(p, 'BACK');            // panel -> shop
  await tapCard(p, 'BACK');            // shop -> title
  const start = await tapCard(p, 'START GAME');
  check('D1 run 1 starts via a REAL tap on START GAME', !!start);
  const advancing = await p.waitFor("(async () => { const st = (await import('./src/main.js')).__TEST.state; return st.mode === 'playing' && st.time > 1.0; })()", 12000, 200);
  const stamps = await p.evaluate(`(async () => { const T = (await import('./src/main.js')).__TEST;
    T.hudText.set(true);
    const s = T.state;
    return { run: s.apexRun, fire: s.apexFire, mark: s.apexMark, time: s.time };
  })()`, true);
  check('D2 the frozen-game assertion holds (clock past 1.0s) and the run carries the apex stamps',
    advancing && stamps.run === true && stamps.mark === true && stamps.fire === false,
    { advancing, stamps });   // fire false: only the PROOF item is owned this run
  // The HUD node refreshes once per frame - poll for the flourish line.
  const flourish = await p.waitFor(`(() => (document.getElementById('hud').textContent || '').includes('APEX MARK OF THE GRIND'))()`, 8000, 150);
  const hudLine = await p.evaluate(`(() => (document.getElementById('hud').textContent || '').split('\\n').find(l => l.includes('APEX')) || '')()`);
  check('D3 the TEXT HUD carries the APEX MARK OF THE GRIND flourish line',
    !!flourish && hudLine.trim() === 'APEX MARK OF THE GRIND', { hudLine });

  // ---- PNG #2: the HUD with the flourish ----
  const hudBox = await p.evaluate(`(() => { const r = document.getElementById('hud').getBoundingClientRect();
    return [r.left, r.top, r.width, r.height]; })()`);
  const shotHud = await p.shot('g25-apex-hud-phone');
  const destHud = join(ART, 'g25-apex-hud-phone.png');
  copyFileSync(shotHud, destHud);
  const inkHud = await readBack(p, destHud, hudBox);
  check('F2 the HUD PNG is 1170x2532 and the HUD box paints bright ink (no vision model - ink only)',
    inkHud.imgW === 1170 && inkHud.imgH === 2532 && inkHud.ink > 50,
    { imgW: inkHud.imgW, imgH: inkHud.imgH, ink: inkHud.ink, meanInk: inkHud.meanInk });

  // ---- byte-identity on the LIVE module's own end-screen function ----
  const ident = await p.evaluate(`(async () => {
    const T = (await import('./src/main.js')).__TEST;
    const args = { lead: 'YOU DIED', cause: 'A TEST BRUTE', gold: 1234, firstClear: false };
    const s = T.state;
    const prev = s.apexRun;            // restore the LIVE stamp afterwards
    s.apexRun = false;
    const off = T.endScreenBody({ ...args });
    delete s.apexRun;
    const absent = T.endScreenBody({ ...args });
    s.apexRun = true;
    const on = T.endScreenBody({ ...args });
    s.apexRun = prev;
    return { offNoApex: !off.includes('APEX'), absentIdentical: absent === off,
             onIsClausePlusOff: on === '<span class="cause">APEX RUN</span><br>' + off };
  })()`, true);
  check('D4 byte-identity on the LIVE endScreenBody: OFF === absent-field shape, ON === OFF + exactly the clause',
    ident.offNoApex && ident.absentIdentical && ident.onIsClausePlusOff, ident);

  // ---- the REAL death screen carries the clause ----
  await p.evaluate(`(async () => { (await import('./src/main.js')).__TEST.die(); })()`, true);
  const dead1 = await p.waitFor("(async () => (await import('./src/main.js')).__TEST.state.mode === 'dead')()", 8000);
  const end1 = await p.evaluate(`(() => document.getElementById('ov-sub').innerHTML)()`);
  check('D5 dying through the loop\'s own death seam renders the APEX RUN clause',
    dead1 && end1.includes('<span class="cause">APEX RUN</span>'),
    { head: end1.slice(0, 120) });

  // ---- E: toggle OFF between runs -> the next run + its end screen are clean ----
  await p.evaluate(`(async () => { const M = await import('./src/meta.js');
    M.setApexEnabled((await import('./src/main.js')).__TEST.getProfile(), false); })()`, true);
  await tapCard(p, 'RETRY');
  const advancing2 = await p.waitFor("(async () => { const st = (await import('./src/main.js')).__TEST.state; return st.mode === 'playing' && st.time > 1.0; })()", 12000, 200);
  const clean = await p.evaluate(`(async () => { const T = (await import('./src/main.js')).__TEST;
    T.hudText.set(true);
    const s = T.state;
    const t = document.getElementById('hud').textContent || '';
    return { run: s.apexRun, fire: s.apexFire, mark: s.apexMark, time: s.time,
             hudLen: t.length, hudHasApex: t.includes('APEX') };
  })()`, true);
  check('E1 run 2 (toggled OFF) is clean: no stamps, no APEX text in a RENDERED HUD, clock past 1.0s',
    advancing2 && clean.run === false && clean.fire === false && clean.mark === false &&
    clean.hudHasApex === false && clean.hudLen > 100,
    { advancing2, clean });
  await p.evaluate(`(async () => { (await import('./src/main.js')).__TEST.die(); })()`, true);
  const dead2 = await p.waitFor("(async () => (await import('./src/main.js')).__TEST.state.mode === 'dead')()", 8000);
  const end2 = await p.evaluate(`(() => document.getElementById('ov-sub').innerHTML)()`);
  check('E2 the OFF run\'s death screen contains NO APEX text anywhere',
    dead2 && !/APEX/i.test(end2), { head: end2.slice(0, 120) });

  return { destPanel, destHud };
});

const bad = results.filter(r => !r.ok);
console.log('PNG: ' + out.destPanel);
console.log('PNG: ' + out.destHud);
console.log(bad.length ? `VERIFY G25 APEX: ${bad.length} FAILURES` : 'VERIFY G25 APEX: ALL ' + results.length + ' CHECKS PASSED');
process.exit(bad.length ? 1 : 0);
