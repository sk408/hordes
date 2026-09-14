// HORDES - tools/verify_e2_horde.mjs (E2 acceptance bar: the wave-2 HORDE in
// the REAL browser - tripled chaff, the mid-boss-bodied heavy tier, and the
// FLYING SHRIKE drawn at altitude with its ground shadow).
// REAL browser, PHONE viewport 390x844 @dpr3, real finger taps. Proves:
//   1. the run boots through the game's OWN title and a REAL tap on START
//      GAME; all 19 TOUR_KEYS are set and the sim clock is ASSERTED past
//      1.0s before anything is measured (the tick-38 lesson: a harness that
//      skips this measures a FROZEN game).
//   2. forced to the wave-2 horde, the guaranteed debut ring lands: one
//      BRUTE, one DASHER, one TICK and one SHRIKE on the field, every heavy
//      carrying EXACTLY midBossHp(waveNum-1, tick) x heat (R2/R3, read off
//      the live config export in-page - never a restated number).
//   3. the horde is real: live plain chaff outnumber heavies on the field
//      (R5/R3) and the SHRIKE is flagged flying with z > 0 (R9).
//   4. ONE PNG at 1170x2532 with an ink-bbox check on the SHRIKE's body box
//      at ALTITUDE (ground screen pos minus z through the SAME zoom
//      transform render.js uses) - the shadow rect geometry itself is pinned
//      by test/test_e2_horde.mjs through the real renderer.
// EVIDENCE DISCLOSURE: the ground shadow is rgba(0,0,0,0.35) - dark ink on
// dark ground does not register on a bright-ink bbox, so the shadow's proof
// is the unit test's rect assertion plus a human-readable PNG, stated not
// hidden.
// Run: node tools/verify_e2_horde.mjs
import { withPage } from './browser.mjs';
import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

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

// Count ink pixels inside a viewport-CSS-space box of a captured PNG.
async function inkInBox(p, file, box) {
  const b64 = (await import('node:fs')).readFileSync(file).toString('base64');
  return p.evaluate(`(async () => {
    const img = await createImageBitmap(await (await fetch('data:image/png;base64,${b64}')).blob());
    const c = new OffscreenCanvas(img.width, img.height); const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const sx = img.width / innerWidth, sy = img.height / innerHeight;
    const x = Math.round(${box[0]} * sx), y = Math.round(${box[1]} * sy);
    const w = Math.round(${box[2]} * sx), h = Math.round(${box[3]} * sy);
    const d = g.getImageData(x, y, w, h).data;
    let ink = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (Math.max(d[i], d[i + 1], d[i + 2]) > 110) ink++;
    }
    return { imgW: img.width, imgH: img.height, ink };
  })()`, true);
}

const out = await withPage({ w: 390, h: 844, dpr: 3,
  startupScript: "try { localStorage.setItem('hordes_onboarded', '1'); } catch (e) {}\n" +
    'for (const k of ' + JSON.stringify(TOUR19) + ") { try { localStorage.setItem('hordes_tour_' + k, '1'); } catch (e) {} }" },
  async (p) => {
    await p.waitFor("(async () => (await import('./src/main.js')).__TEST.state.mode !== 'intro')()", 15000);
    await p.waitFor("(async () => { const rv = (await import('./src/main.js')).__TEST.state.titleReveal; return !rv || rv.phase === 'settled'; })()", 8000);
    const c = await p.evaluate(`(() => {
      const el = [...document.getElementById('ov-cards').children]
        .find(k => (k.textContent || '').toUpperCase().includes('START GAME'));
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
    })()`);
    if (!c) throw new Error('no START GAME card on the title');
    await p.tap(c[0], c[1]);
    const playing = await p.waitFor("(async () => (await import('./src/main.js')).__TEST.state.mode === 'playing')()", 8000);
    const advancing = await p.waitFor("(async () => { const st = (await import('./src/main.js')).__TEST.state; return st.mode === 'playing' && st.time > 1.0; })()", 10000, 200);
    check('run started via a REAL tap and the sim clock ADVANCED past 1.0s (not a frozen game)',
      playing && advancing, { playing, advancing });

    // Force the wave-2 horde: plant the 120s-wave number, keep the wave from
    // ending, keep the player alive for the scene, let the first spawn tick
    // fire the guaranteed debut ring through the REAL spawnWave.
    await p.evaluate(`(async () => {
      const st = (await import('./src/main.js')).__TEST.state;
      st.time = 121; st.wave.num = 2; st.wave.endsAt = 1e9; st.wave.midBossDone = true;
      st.spawnTimer = 0;
      st.player.stats.maxHp = 1e6; st.player.hp = 1e6;
      st.player.xpNext = 1e12;   // no draft pause mid-scene
    })()`);
    const debut = await p.waitFor(`(async () => {
      const st = (await import('./src/main.js')).__TEST.state;
      if (!st.wave.e2HeavyDebut) return false;
      return ['BRUTE', 'DASHER', 'TICK', 'SHRIKE'].every(id =>
        st.enemies.some(e => e.typeId === id && e.hp > 0));
    })()`, 15000, 100);
    check('the guaranteed debut ring landed: BRUTE + DASHER + TICK + SHRIKE on the field', !!debut);

    const heavyHp = await p.evaluate(`(async () => {
      const st = (await import('./src/main.js')).__TEST.state;
      const cfg = await import('./src/config.js');
      const heat = (await import('./src/heat.js')).heatMultipliers(
        (await import('./src/heat.js')).heatOf(st)).hp;
      const tick = Math.floor(st.time / 30);
      const want = cfg.midBossHp(st.wave.num - 1, tick) * heat;
      const heavies = st.enemies.filter(e => e.hp > 0 &&
        ['BRUTE', 'DASHER', 'TICK', 'SHRIKE'].includes(e.typeId) && !e.elite);
      const off = heavies.filter(e => Math.abs(e.maxHp - want) > 1e-9 * want)
        .map(e => e.typeId + ':' + Math.round(e.maxHp));
      return { tick, heat, want, count: heavies.length, off };
    })()`, true);
    check('R2: every live heavy carries EXACTLY midBossHp(waveNum-1, tick) x heat',
      heavyHp.count > 0 && heavyHp.off.length === 0, heavyHp);

    const mixReady = await p.waitFor(`(async () => {
      const st = (await import('./src/main.js')).__TEST.state;
      const types = await import('./src/enemy_types.js');
      let chaff = 0, heavy = 0;
      for (const e of st.enemies) {
        if (e.hp <= 0 || e.boss) continue;
        const t = types.ENEMY_TYPES[e.typeId];
        if (t && t.chaff) chaff++;
        else if (t && t.heavy) heavy++;
      }
      return chaff > 0 && heavy > 0 && chaff > heavy * 3;
    })()`, 20000, 250);
    const mix = await p.evaluate(`(async () => {
      const st = (await import('./src/main.js')).__TEST.state;
      const types = await import('./src/enemy_types.js');
      let chaff = 0, heavy = 0;
      for (const e of st.enemies) {
        if (e.hp <= 0 || e.boss) continue;
        const t = types.ENEMY_TYPES[e.typeId];
        if (t && t.chaff) chaff++;
        else if (t && t.heavy) heavy++;
      }
      const shrike = st.enemies.find(e => e.typeId === 'SHRIKE' && e.hp > 0);
      return { chaff, heavy, shrike: shrike ? { z: shrike.z, flying: !!shrike.flying } : null };
    })()`, true);
    check('R5/R3: the horde is real - live plain chaff outnumber heavies', !!mixReady, mix);
    check('R9: a SHRIKE is on the field, flagged flying, altitude z > 0',
      !!(mix.shrike && mix.shrike.flying && mix.shrike.z > 0), mix.shrike);

    // Pin a showcase SHRIKE near the player at cruise hover for the PNG
    // (age pinned so z is deterministic-ish), then read its screen box
    // through the SAME zoom transform render.js uses and shoot.
    await p.evaluate(`(async () => {
      const st = (await import('./src/main.js')).__TEST.state;
      const types = await import('./src/enemy_types.js');
      const e = types.makeTypedEnemy('SHRIKE', st.player.x + 80, st.player.y - 20, st.time);
      e.age = 1.0;
      st.enemies.push(e);
    })()`);
    await new Promise(r => setTimeout(r, 120));   // a couple of frames: z integrates live
    const boxes = await p.evaluate(`(async () => {
      const st = (await import('./src/main.js')).__TEST.state;
      const e = st.enemies.find(x => x.typeId === 'SHRIKE' && x.hp > 0 &&
        Math.hypot(x.x - st.player.x, x.y - st.player.y) < 140);
      if (!e) return null;
      const Z = st.zoomScale || 1;
      const dx = e.x - st.cam.x, dy = e.y - st.cam.y;
      const gx = 240 + (dx - 240) * Z, gy = 150 + (dy - 150) * Z;   // ground (device space)
      const by = 150 + (dy - (e.z || 0) - 150) * Z;                 // body at altitude
      const r = document.getElementById('game').getBoundingClientRect();
      const css = (devX, devY) => [r.left + (devX / 480) * r.width, r.top + (devY / 300) * r.height];
      const [bx, byy] = css(gx, by);
      const [sx2, sy2] = css(gx, gy);
      return { z: e.z, Z, body: [bx - 30, byy - 30, 60, 60], ground: [sx2 - 30, sy2 - 30, 60, 60] };
    })()`, true);
    if (!boxes) throw new Error('the showcase SHRIKE vanished before the shot');
    const shotFile = await p.shot('e2-horde-phone');
    const inkBody = await inkInBox(p, shotFile, boxes.body);
    check('PNG is 1170x2532 (390x844 @dpr3)', inkBody.imgW === 1170 && inkBody.imgH === 2532,
      { imgW: inkBody.imgW, imgH: inkBody.imgH });
    check('ink-bbox: the SHRIKE body paints bright ink at ALTITUDE (ground y - z)',
      inkBody.ink > 40, { ink: inkBody.ink, z: +boxes.z.toFixed(1), Z: boxes.Z, box: boxes.body.map(v => +v.toFixed(1)) });
    console.log('NOTE: the ground shadow is dark-on-dark by design (rgba 0,0,0,0.35); its rect ' +
      'geometry is asserted by test/test_e2_horde.mjs through the real renderer.');
    return shotFile;
  });

const dest = join(ART, 'e2-horde-phone.png');
copyFileSync(out, dest);
const bad = results.filter(r => !r.ok);
console.log('PNG: ' + dest + ' (src ' + out + ')');
console.log(bad.length ? `VERIFY E2 HORDE: ${bad.length} FAILURES` : 'VERIFY E2 HORDE: ALL ' + results.length + ' CHECKS PASSED');
process.exit(bad.length ? 1 : 0);
