// HORDES - tools/verify_n1_chain_q.mjs (N1 slice 1 acceptance bar item 4).
// REAL browser, PHONE viewport 390x844 @dpr3, real finger taps. Proves the Q
// label reads the CLASS's skill id and that the label is actually PAINTED:
//   1. WITCH run  -> #q-skill textContent === 'CHAIN'
//   2. KNIGHT run -> #q-skill textContent === 'FROST'  (same page, profile swapped)
//   3. both PNGs are 1170x2532 (= 390x844 @3x) and the label bbox in the PNG
//      holds real ink (dark pixels), i.e. the text is drawn, not just in the DOM.
//   4. the Witch's Q actually FIRES in the live loop: effect frames with a
//      zap polyline of >= 5 points (5-7 nodes = the chain; her gun tops out at
//      4 nodes) are counted over a real run window.
// EVIDENCE DISCLOSURE: no vision model is reachable from this host, so the
// verdict is DOM text + PNG pixel ink + live-loop measurement, not a "looks
// right" judgement. Stated, not hidden.
// Run: node tools/verify_n1_chain_q.mjs
import { withPage } from './browser.mjs';
import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ART = 'docs/art/browser-verify-2026-09-12';
mkdirSync(ART, { recursive: true });
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); };

// Count dark (ink) pixels inside a viewport-space box of a captured PNG.
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
    let ink = 0, cols = new Set();
    for (let i = 0; i < d.length; i += 4) {
      const m = Math.max(d[i], d[i + 1], d[i + 2]);
      if (m > 110) ink++;
      cols.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]);
    }
    return { imgW: img.width, imgH: img.height, box: [x, y, w, h], px: w * h, ink, colours: cols.size };
  })()`, true);
}

async function bootRun(p, charId) {
  // Seed a purse through the game's OWN import seam, then equip the class.
  await p.evaluate(`(async () => {
    const m = await import('./src/meta.js');
    const T = (await import('./src/main.js')).__TEST;
    const prof = m.makeProfile();
    prof.gold = 20000;
    m.unlockCharacter(prof, ${JSON.stringify(charId)});
    const ok = m.equipCharacter(prof, ${JSON.stringify(charId)});
    T.save.importText(JSON.stringify(m.exportProfile(prof)));
    window.__seeded = ok;
  })()`);
  const seeded = await p.evaluate('window.__seeded');
  // REAL TAP: title -> START GAME.
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
  // the sim must actually ADVANCE: the tour coachmarks gate update(), so a
  // live clock is the proof the harness is looking at a running game.
  const advancing = await p.waitFor("(async () => { const st = (await import('./src/main.js')).__TEST.state; return st.mode === 'playing' && st.time > 1.0; })()", 10000, 200);
  const live = await p.evaluate("(async () => { const st = (await import('./src/main.js')).__TEST.state; return { mode: st.mode, time: +st.time.toFixed(2), enemies: st.enemies.length }; })()");
  return { seeded, playing, advancing, live };
}

const out = await withPage({ w: 390, h: 844, dpr: 3,
  startupScript: "try { localStorage.setItem('hordes_onboarded', '1'); } catch (e) {}" + "\n" + "for (const k of [\"stage1\", \"hud\", \"pilot\", \"focus\", \"stance\", \"move\", \"skills\", \"potions\", \"stats\", \"cog\", \"draft\", \"edge\", \"chest\", \"portal\", \"arch\", \"shrine\", \"intermission\", \"death\", \"settings\"]) { try { localStorage.setItem('hordes_tour_' + k, '1'); } catch (e) {} }" },
  async (p) => {
    const report = {};

    for (const [charId, expect] of [['WITCH', 'CHAIN'], ['KNIGHT', 'FROST']]) {
      if (charId === 'KNIGHT') { // same browser, fresh boot: profile swap
        await p.evaluate('location.reload()');
        await p.waitFor("!!document.getElementById('ov-cards')", 15000);
        await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
      }
      await p.waitFor("(async () => (await import('./src/main.js')).__TEST.state.mode !== 'intro')()", 15000);
      await p.waitFor("(async () => { const rv = (await import('./src/main.js')).__TEST.state.titleReveal; return !rv || rv.phase === 'settled'; })()", 8000);
      const boot = await bootRun(p, charId);
      const lbl = await p.evaluate("(() => { const e = document.getElementById('q-skill'); return { text: e ? e.textContent : null, w: e ? Math.round(e.getBoundingClientRect().width) : 0, h: e ? Math.round(e.getBoundingClientRect().height) : 0, box: (() => { const r = e.getBoundingClientRect(); return [Math.round(r.x) - 2, Math.round(r.y) - 2, Math.round(r.width) + 4, Math.round(r.height) + 4]; })() }; })()");
      // let a few real frames run so the HUD is settled before the capture
      await p.evaluate("(async () => { for (let i = 0; i < 6; i++) await new Promise(r => requestAnimationFrame(r)); })()");
      let chain = null;
      if (charId === 'WITCH') {
        chain = await p.evaluate(`(async () => {
          const T = (await import('./src/main.js')).__TEST;
          let chainFrames = 0, gunFrames = 0, maxNodes = 0; const t0sim = T.state.time;
          const t0 = performance.now();
          while (performance.now() - t0 < 12000) {
            for (const e of T.state.effects) {
              if (e.kind === 'zap' && e.points) {
                if (e.points.length >= 5) { chainFrames++; if (e.points.length > maxNodes) maxNodes = e.points.length; }
                else gunFrames++;
              }
            }
            await new Promise(r => requestAnimationFrame(r));
          }
          return { chainFrames, gunFrames, maxNodes, simAdvanced: +(T.state.time - t0sim).toFixed(2), enemies: T.state.enemies.length, mana: Math.round(T.state.player.mana) };
        })()`, true);
      }
      const shotFile = await p.shot('n1-chain-q-' + charId.toLowerCase());
      const dst = join(ART, 'n1-chain-q-' + charId.toLowerCase() + '-phone.png');
      copyFileSync(shotFile, dst);
      const ink = await inkInBox(p, dst, lbl.box);
      report[charId] = { boot, lbl, chain, png: dst, ink };
      check(`${charId}: run started (real tap on START GAME)`, boot.playing && boot.advancing, boot);
      check(`${charId}: #q-skill reads ${expect}`, lbl.text === expect, lbl.text);
      check(`${charId}: PNG is 1170x2532`, ink.imgW === 1170 && ink.imgH === 2532, [ink.imgW, ink.imgH]);
      check(`${charId}: the label bbox holds real ink in the PNG`, ink.ink > 8, ink);
      if (charId === 'WITCH') {
        check('WITCH: the new Q fires in the LIVE loop (>=1 zap polyline of >=5 nodes)', chain && chain.chainFrames >= 1, chain);
        check('WITCH: that polyline exceeds her gun (6 nodes vs the gun cap of 4)', chain && chain.maxNodes >= 6, chain);
        check('WITCH: the live sim advanced during the window (not a frozen frame)', chain && chain.simAdvanced > 8, chain);
      }
    }
    return report;
  });

for (const r of results) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.name} :: ${JSON.stringify(r.detail)}`);
console.log(JSON.stringify(out, null, 1));
const bad = results.filter((r) => !r.ok).length;
console.log(`verify_n1_chain_q: ${results.length - bad}/${results.length} checks passed`);
process.exit(bad ? 1 : 0);
