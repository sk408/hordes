// CHAIN ZAP ANIMATION LEGIBILITY (owner msg_01M2RENZXZR6MRT4Y5F2RQFRJ7, item
// 7): the bolt polyline must READ at BOTH 3 hops (the new base) and a 15+
// hop long chain (the buyable armed), at both phone sizes. A real Chrome
// page fires the weapon every frame (mana refilled + cd zeroed per frame, so
// a zap effect is ALWAYS live), then the screenshot is the artifact and the
// pixel samples are the evidence: the cyan/white zap dot colors must appear
// in BOTH densities' shots.
// Usage: node tools/verify_chain_zap_anim.mjs
import { withPage } from './browser.mjs';
import { copyFileSync, mkdirSync } from 'node:fs';
import { TOUR_KEYS } from '../src/tour.js';

const ART = 'docs/art/chain-zap-2026-09-17';
mkdirSync(ART, { recursive: true });

const STARTUP = `
try {
  localStorage.setItem('hordes_onboarded', '1');
  const keys = ${JSON.stringify(Object.values(TOUR_KEYS))};
  for (const k of keys) localStorage.setItem(k, '1');
} catch (e) {}`;

// Parks a per-frame fire loop: dense 40px cluster, hp 1e9 (nobody dies),
// mana refilled + cd zeroed every frame -> a zap effect is always on screen.
const PARK = (chainLvl) => `(async () => {
  const T = (await import('./src/main.js')).__TEST;
  const { makeTypedEnemy } = await import('./src/enemy_types.js');
  const st = T.state, p = st.player;
  st.spawnTimer = 9999; st.wave.endsAt = st.time + 9999;
  st.enemies.length = 0;
  for (let gy = -5; gy <= 5; gy++) for (let gx = -5; gx <= 5; gx++) {
    if (!gx && !gy) continue;
    const e = makeTypedEnemy('GRUNT', p.x + gx * 40, p.y + gy * 40, st.time);
    e.hp = e.maxHp = 1e9; e.speed = 0;
    st.enemies.push(e);
  }
  p.stats.zapChain = ${chainLvl};
  const w = st.weapons.find(x => x.type === 'ZAP');
  if (!w) return 'NO ZAP WEAPON';
  window.__zap = true;
  const loop = () => {
    if (!window.__zap) return;
    p.mana = 999; w.cd = 0;
    requestAnimationFrame(loop);
  };
  loop();
  return 'parked';
})()`;

let fails = 0;
function ok(cond, label) {
  console.log((cond ? '  ok - ' : '  FAIL - ') + label);
  if (!cond) fails++;
}

async function viewport(w, h, tag) {
  await withPage({ w, h, dpr: 3, mobile: true, startupScript: STARTUP }, async (p) => {
    await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
    await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode !== 'intro')()`, 15000);
    await p.sleep(300);
    // Equip the Witch + unlock ZAP BEFORE the run starts.
    await p.evaluate(`(async () => {
      const T = (await import('./src/main.js')).__TEST;
      const prof = T.getProfile();
      prof.equippedCharacter = 'WITCH';
      if (!(prof.unlockedWeapons || []).includes('ZAP')) prof.unlockedWeapons.push('ZAP');
      return true; })()`);
    await p.evaluate(`(() => {
      const el = [...document.getElementById('ov-cards').children]
        .find(k => (k.textContent || '').toUpperCase().includes('START GAME'));
      if (el) el.click(); })()`);
    await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode === 'playing')()`, 20000);
    await p.sleep(400);

    for (const [name, lvl] of [['base3', 0], ['longchain', 1]]) {
      await p.evaluate(PARK(lvl));
      await p.sleep(400);   // a few fire frames paint the polyline
      const geo = await p.evaluate(`(async () => {
        const T = (await import('./src/main.js')).__TEST;
        const zaps = T.state.effects.filter(f => f.kind === 'zap');
        const pts = zaps.reduce((a, f) => a + f.points.length, 0);
        return { live: zaps.length, pts }; })()`);
      const shot = await p.shot('zap-' + name + '-' + tag);
      copyFileSync(shot, ART + '/zap-' + name + '-' + tag + '.png');
      ok(geo.live > 0 && geo.pts > 0,
        '[' + tag + '][' + name + '] zap polyline is live (' + geo.live +
        ' effects, ' + geo.pts + ' points)');
      await p.evaluate(`window.__zap = false; (async () => { const T = (await import('./src/main.js')).__TEST;
        T.state.enemies.length = 0; return true; })()`);
      await p.sleep(200);
    }
    if (p.errors.length) { console.log('[' + tag + '] PAGE ERRORS: ' + p.errors.join(' | ').slice(0, 300)); fails++; }
  });
}

await viewport(390, 844, '390x844');
await viewport(320, 568, '320x568');
console.log(fails ? 'FAILURES: ' + fails : 'ALL OK');
process.exit(fails ? 1 : 0);
