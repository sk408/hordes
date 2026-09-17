// STARTING ARENA IMPROVE (task msg_01M2RK2K, 2026-09-17): photographs the
// VERDANT HOLLOW field + the SETUP STAGE card at both phone sizes, BEFORE
// and AFTER the improve. Same-shot assertions: the card carries the measured
// numbers (ranged/heavy share, hp/dmg/spawn multipliers, relief), and the
// after field paints the authored heart-stump + gate stones (stage-gated).
// Run: node tools/verify_arena_improve.mjs before|after
import { withPage } from './browser.mjs';
import { copyFileSync } from 'node:fs';

const ART = '/home/claude/projects/hordes/docs/art/arena-improve-2026-09-17/shots';
const phase = process.argv[2] || 'after';

let fails = 0;
function ok(cond, label) {
  console.log((cond ? '  ok - ' : '  FAIL - ') + label);
  if (!cond) fails++;
}

async function viewport(w, h, tag) {
  await withPage({ w, h, dpr: 3, mobile: true,
    startupScript: "try { localStorage.setItem('hordes_onboarded', '1'); } catch (e) {}" },
  async (p) => {
    await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
    await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode !== 'intro')()`, 15000);
    await p.sleep(400);
    const T = () => p.evaluate(`(async () => (await import('./src/main.js')).__TEST)()`);
    let t = await T();

    // ---- the STAGE card (SETUP), with its numbers.
    const clickCard = (label2) => p.evaluate(`(() => {
      const el = [...document.getElementById('ov-cards').children]
        .find(k => (k.textContent || '').toUpperCase().includes(${JSON.stringify(label2)}));
      if (!el) return false; el.click(); return true; })()`);
    ok(await clickCard('SETUP'), '[' + tag + '] SETUP opened');
    await p.sleep(150);
    let shot = await p.shot(phase + '-stagecard-' + tag);
    copyFileSync(shot, ART + '/' + phase + '-stagecard-' + tag + '.png');
    const cardHtml = await p.evaluate(`(document.getElementById('ov-cards').children[1] || {}).innerHTML || ''`);
    const sub = (cardHtml.match(/class="desc">([\s\S]*?)<\/div>/) || [])[1] || '';
    ok(/ranged \d+%/.test(sub) && /heav(y|ies) \d+%/.test(sub),
      '[' + tag + '] the STAGE card states the measured shares: ' + sub.slice(0, 120));
    ok(/hp x\d/.test(sub) && /dmg x\d/.test(sub) && /spawn x\d/.test(sub),
      '[' + tag + '] the STAGE card states the foe multipliers');
    ok(/relief/.test(sub), '[' + tag + '] the STAGE card states the relief character');

    // ---- the field: a live VERDANT run, mid-fight.
    t = await T();
    await p.evaluate(`(async () => { const T2 = (await import('./src/main.js')).__TEST; T2.showTitle(); })()`);
    await p.sleep(150);
    ok(await clickCard('START GAME'), '[' + tag + '] START GAME pressed');
    await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode === 'playing')()`, 20000);
    await p.sleep(3000);   // some field life before the shot
    shot = await p.shot(phase + '-field-' + tag);
    copyFileSync(shot, ART + '/' + phase + '-field-' + tag + '.png');

    // AFTER-only structural reads (the authored heart + gates are new).
    if (phase === 'after') {
      const lm = await p.evaluate(`(async () => {
        const T2 = (await import('./src/main.js')).__TEST;
        const R = T2.renderer, st = T2.state;
        const noop = () => {};
        const stubCtx = new Proxy({}, { get: (t, k) =>
          (k === 'fillStyle' || k === 'globalAlpha') ? undefined : noop, set: () => true });
        const seen = new Set();
        // Sweep the whole arena through the renderer's own landmark seam.
        for (let cy = -900; cy <= 900 - 300; cy += 300) {
          for (let cx = -900; cx <= 900 - 480; cx += 480) {
            R.drawLandmarks(stubCtx, st.groundSeed || 1, { x: cx, y: cy }, undefined, 'VERDANT_HOLLOW');
            for (const l of (R.landmarks || [])) seen.add(l.kind);
          }
        }
        return [...seen];
      })()`);
      ok(lm.includes('STUMP'), '[' + tag + '] the heart stump is painted (kinds: ' + lm.join(',') + ')');
      ok(lm.includes('GATE'), '[' + tag + '] the gate stones are painted');
      ok(lm.includes('GROVE'), '[' + tag + '] groves appear on the verdant field');
    }

    const errors = p.errors;
    if (errors.length) { console.log('[' + tag + '] PAGE ERRORS: ' + errors.join(' | ').slice(0, 300)); fails++; }
  });
}

await viewport(390, 844, '390x844');
await viewport(320, 568, '320x568');
console.log(fails ? 'VERIFY FAILED: ' + fails : 'verify_arena_improve ' + phase + ': ALL SHOTS CAPTURED (both viewports)');
process.exit(fails ? 1 : 0);
