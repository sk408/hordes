// HORDES - tools/verify_card_art.mjs (CARD ART track acceptance bar item 2).
// REAL browser, PHONE viewport 390x844 @dpr3 (Chrome for Testing), live game
// booted to mode 'playing' with all 19 TOUR_KEYS set and state.time asserted
// ADVANCING before anything is measured. The 13-card deck is painted onto an
// overlay of 24x34 backing canvases, CSS-scaled by the INTEGER factor 3 with
// image-rendering: pixelated — one canvas through drawCard's default painter,
// plus one card painted a second time through the game's OWN
// __TEST.renderer.drawGrid to prove the wired seam gives the same pixels.
// The screenshot is then READ BACK: for every card, EVERY display block
// (9x9 device px = 1 backing px at 3 CSS x 3 dpr) is centre-sampled and
// compared against the exact palette hex — zero off-palette colours means
// zero blended pixels and integer-scaled edges, and per-card signature
// colours prove the pips/motifs are distinguishable at display size.
// EVIDENCE DISCLOSURE: no vision model on this host — the verdict is pixel
// sampling of a screenshot that was decoded and read, never a "looks right"
// judgement. The artifact PNG lands in docs/art/card-art-verify-2026-09-14/.
// Run: node tools/verify_card_art.mjs
import { withPage } from './browser.mjs';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ART = 'docs/art/card-art-verify-2026-09-14';
mkdirSync(ART, { recursive: true });
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); };

const SCALE = 3;      // integer CSS scale: 24x34 backing -> 72x102 CSS px
const BG = '#1a1e28'; // overlay backing colour (behind the transparent corners)

const out = await withPage({ w: 390, h: 844, dpr: 3,
  startupScript: "try { localStorage.setItem('hordes_onboarded', '1'); } catch (e) {}\n" +
    "for (const k of [\"stage1\", \"hud\", \"pilot\", \"focus\", \"stance\", \"move\", \"skills\", \"potions\", \"stats\", \"cog\", \"draft\", \"edge\", \"chest\", \"portal\", \"arch\", \"shrine\", \"intermission\", \"death\", \"settings\"]) { try { localStorage.setItem('hordes_tour_' + k, '1'); } catch (e) {} }" },
  async (p) => {
    const report = {};

    // ---- boot a REAL run (the frozen-game trap: never grade a paused game) --
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
    report.playing = await p.waitFor("(async () => (await import('./src/main.js')).__TEST.state.mode === 'playing')()", 8000);
    // state.time must ADVANCE before any pixel is measured.
    report.advancing = await p.waitFor("(async () => { const st = (await import('./src/main.js')).__TEST.state; return st.mode === 'playing' && st.time > 1.0; })()", 10000, 200);
    report.t0 = await p.evaluate("(async () => +(await import('./src/main.js')).__TEST.state.time.toFixed(2))()");

    // ---- paint the deck: 13 drawCard canvases + 1 via the game's own seam ---
    report.paint = await p.evaluate(`(async () => {
      const { CARD_IDS, CARD_W, CARD_H } = await import('./src/art/cards.js');
      const { drawCard } = await import('./src/render_cards.js');
      const T = (await import('./src/main.js')).__TEST;
      const host = document.createElement('div');
      host.id = 'card-art-verify';
      host.style.cssText = 'position:fixed;left:8px;top:8px;z-index:9999;display:grid;' +
        'grid-template-columns:repeat(4, ${24 * SCALE}px);gap:8px;background:${BG};padding:8px;';
      document.body.appendChild(host);
      const boxes = {};
      const mk = (id, painter) => {
        const cv = document.createElement('canvas');
        cv.width = CARD_W; cv.height = CARD_H;
        cv.style.width = (CARD_W * ${SCALE}) + 'px';
        cv.style.height = (CARD_H * ${SCALE}) + 'px';
        cv.style.imageRendering = 'pixelated';
        cv.dataset.card = id;
        host.appendChild(cv);
        painter(cv.getContext('2d'), id);
        const r = cv.getBoundingClientRect();
        boxes[id] = { left: r.left, top: r.top, w: r.width, h: r.height };
        return cv;
      };
      for (const id of CARD_IDS) mk(id, (g, cid) => drawCard(g, cid, 0, 0, 1));
      // The WIRED path: the same card through the game renderer's own drawGrid.
      const seamCv = mk('hp', async () => {});
      const { cardArt } = await import('./src/art/cards.js');
      const art = cardArt('hp');
      T.renderer.drawGrid(seamCv.getContext('2d'), art.grid, art.palette, 0, 0, 1);
      // Same-pixels proof, in-page: drawCard's painter vs the renderer's seam.
      const a = host.children[0].getContext('2d').getImageData(0, 0, CARD_W, CARD_H).data;
      const b = seamCv.getContext('2d').getImageData(0, 0, CARD_W, CARD_H).data;
      let diff = 0;
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff++;
      return { cards: CARD_IDS.length, seamDiffBytes: diff, boxes };
    })()`, true);
    check('run is playing and state.time advanced BEFORE measuring (t=' + report.t0 + 's)',
      report.playing && report.advancing && report.t0 > 1.0, report.t0);
    check('13 cards painted + 1 via the game renderer seam', report.paint.cards === 13, report.paint.cards);
    check('drawCard and renderer.drawGrid paint byte-identical pixels', report.paint.seamDiffBytes === 0, report.paint.seamDiffBytes);

    // ---- let the compositor settle, then capture and READ THE SCREENSHOT ----
    await p.evaluate("(async () => { for (let i = 0; i < 4; i++) await new Promise(r => requestAnimationFrame(r)); })()");
    const shotFile = await p.shot('card-deck-phone');
    const dst = join(ART, 'card-deck-phone.png');
    copyFileSync(shotFile, dst);
    report.png = dst;

    const shotB64 = readFileSync(dst).toString('base64');
    const measure = await p.evaluate(`(async () => {
      const { CARD_IDS, CARD_W, CARD_H, CARD_ART } = await import('./src/art/cards.js');
      const b64 = '${shotB64}';
      const img = await createImageBitmap(await (await fetch('data:image/png;base64,' + b64)).blob());
      const c = new OffscreenCanvas(img.width, img.height);
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      const dpr = img.width / innerWidth;
      const boxes = ${JSON.stringify(report.paint.boxes)};
      const hex = (r, gg, b) => '#' + [r, gg, b].map(v => v.toString(16).padStart(2, '0')).join('');
      const BG = '${BG}';
      const per = {};
      let totalBlocks = 0, badBlocks = 0, offPalettePx = 0;
      for (const id of CARD_IDS) {
        const art = CARD_ART[id];
        const box = boxes[id];
        const ox = Math.round(box.left * dpr), oy = Math.round(box.top * dpr);
        const block = Math.round(${SCALE} * dpr);   // device px per backing px
        const colours = new Set();
        let bad = 0, off = 0;
        const sig = {};
        for (let sy = 0; sy < CARD_H; sy++) {
          for (let sx = 0; sx < CARD_W; sx++) {
            const v = art.grid[sy][sx];
            const want = v ? art.palette[v] : BG;
            const d = g.getImageData(ox + sx * block + (block >> 1), oy + sy * block + (block >> 1), 1, 1).data;
            const got = hex(d[0], d[1], d[2]);
            colours.add(got);
            if (got !== want) bad++;
            if (v >= 5) sig[v] = (sig[v] || 0) + 1;   // motif-colour presence
          }
        }
        // WHOLE-REGION sweep: every device pixel in the bbox must be a palette
        // (or backing) colour — an antialiased edge would introduce a blend.
        const region = g.getImageData(ox, oy, CARD_W * block, CARD_H * block).data;
        const allowed = new Set([...Object.values(art.palette).map((h) => h.toLowerCase()), BG]);
        for (let i = 0; i < region.length; i += 4) {
          if (!allowed.has(hex(region[i], region[i + 1], region[i + 2]).toLowerCase())) off++;
        }
        totalBlocks += CARD_W * CARD_H; badBlocks += bad; offPalettePx += off;
        per[id] = { bad, off, colours: colours.size, sig };
      }
      // Motifs distinguishable at display size: every card's motif colour set,
      // as READ FROM THE SCREENSHOT, is present and pairwise distinct.
      const motifSets = {};
      for (const id of CARD_IDS) {
        const art = CARD_ART[id];
        const box = boxes[id];
        const ox = Math.round((box.left + box.w / 4) * dpr), oy = Math.round((box.top + box.h / 4) * dpr);
        const region = g.getImageData(ox, oy, Math.round(box.w / 2 * dpr), Math.round(box.h / 2 * dpr)).data;
        const set = new Set();
        for (let i = 0; i < region.length; i += 4) set.add(hex(region[i], region[i + 1], region[i + 2]));
        motifSets[id] = [...set].sort().join('|');
      }
      const distinct = new Set(Object.values(motifSets)).size;
      return { imgW: img.width, imgH: img.height, dpr, block: Math.round(${SCALE} * dpr),
        totalBlocks, badBlocks, offPalettePx, per, motifSets, distinct };
    })()`, true);
    report.measure = measure;
    report.t1 = await p.evaluate("(async () => +(await import('./src/main.js')).__TEST.state.time.toFixed(2))()");

    check('PNG is 1170x2532 (390x844 @dpr3)', measure.imgW === 1170 && measure.imgH === 2532, [measure.imgW, measure.imgH]);
    check('display block is 9x9 device px (integer 3x CSS at dpr3)', measure.block === 9, measure.block);
    check('EVERY display block centre is the exact palette colour (' + measure.badBlocks + '/' + measure.totalBlocks + ' wrong)',
      measure.badBlocks === 0, measure.badBlocks);
    check('ZERO blended/off-palette device pixels in all 13 card bboxes', measure.offPalettePx === 0, measure.offPalettePx);
    check('all 13 motif regions are pairwise distinct AT DISPLAY SIZE', measure.distinct === 13, measure.distinct);
    check('the sim kept advancing through the measurement (t ' + report.t0 + 's -> ' + report.t1 + 's)',
      report.t1 > report.t0, [report.t0, report.t1]);
    return report;
  });

for (const r of results) console.log((r.ok ? 'ok   ' : 'FAIL ') + r.name + ' :: ' + JSON.stringify(r.detail));
console.log('--- per-card measurements (display-read) ---');
for (const id of Object.keys(out.measure.per)) {
  const m = out.measure.per[id];
  console.log(id + ': colours=' + m.colours + ' badBlocks=' + m.bad + ' offPalettePx=' + m.off +
    ' motifInk=' + JSON.stringify(m.sig));
}
const bad = results.filter((r) => !r.ok).length;
console.log('verify_card_art: ' + (results.length - bad) + '/' + results.length + ' checks passed');
process.exit(bad ? 1 : 0);
