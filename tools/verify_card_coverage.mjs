// HORDES - tools/verify_card_coverage.mjs (CARD ART COVERAGE acceptance bar).
// REAL browser, PHONE viewport 390x844 @dpr3 (Chrome for Testing), live game
// booted to mode 'playing' with all 19 TOUR_KEYS set and state.time asserted
// ADVANCING before anything is measured (the frozen-game trap).
//
// The proof: drafts are opened through the REAL __TEST.openDraft seam until
// ONE draft offers BOTH a WEAPON level-up card (lvl_*) AND Quick Hands (rate)
// — the two families that used to fall back to plain text. Every offered card
// must carry a .card-art canvas with REAL drawCard pixels (inked, on-palette);
// the level-up card is then INSPECTED (the R2 flow) and the big inspect art is
// asserted inked too. ONE PNG (1170x2532) of the offer view is captured, then
// READ BACK: for the lvl_* and rate canvases, EVERY inked backing cell is
// centre-sampled in the decoded screenshot and compared against the exact
// palette hex — zero bad blocks means the cards on screen ARE the deck art.
// The artifact lands in docs/art/card-art-verify-2026-09-14/.
// Run: node tools/verify_card_coverage.mjs
import { withPage } from './browser.mjs';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ART = 'docs/art/card-art-verify-2026-09-14';
mkdirSync(ART, { recursive: true });
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); };

const out = await withPage({ w: 390, h: 844, dpr: 3,
  startupScript: "try { localStorage.setItem('hordes_onboarded', '1'); } catch (e) {}\n" +
    "for (const k of [\"stage1\", \"hud\", \"pilot\", \"focus\", \"stance\", \"move\", \"skills\", \"potions\", \"stats\", \"cog\", \"draft\", \"edge\", \"chest\", \"portal\", \"arch\", \"shrine\", \"intermission\", \"death\", \"settings\"]) { try { localStorage.setItem('hordes_tour_' + k, '1'); } catch (e) {} }" },
  async (p) => {
    const report = {};

    // ---- boot a REAL run (never grade a paused game) -----------------------
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

    // ---- open drafts until ONE offers BOTH a lvl_* card AND Quick Hands ----
    report.draft = await p.evaluate(`(async () => {
      const T = (await import('./src/main.js')).__TEST;
      const { cardArt } = await import('./src/art/cards.js');
      const { deckIdForOffer, OFFER_ART_SCALE } = await import('./src/draft_card_art.js');
      let found = null, tries = 0;
      for (; tries < 600 && !found; tries++) {
        T.state.mode = 'playing'; T.state.pendingDrafts = 1; T.openDraft();
        const ids = [...document.getElementById('ov-cards').children].map((el) => el._draftOffer.id);
        if (ids.some((id) => id.startsWith('lvl_')) && ids.includes('rate')) found = ids;
      }
      if (!found) return { ok: false, tries };
      // Every offered card: a .card-art canvas whose pixels are the REAL deck art.
      const hex = (n) => n.toString(16).padStart(2, '0');
      const cards = [...document.getElementById('ov-cards').children].map((el) => {
        const u = el._draftOffer;
        const cv = [...el.children].find((k) => k.className === 'card-art');
        const deckId = deckIdForOffer(u.id);
        const out = { offer: u.id, deckId, hasCanvas: !!cv, ink: 0, badCells: 0, sampled: 0, box: null };
        if (!cv || !deckId) return out;
        const art = cardArt(deckId);
        const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
        const s = OFFER_ART_SCALE;
        for (let y = 0; y < art.grid.length; y++) {
          for (let x = 0; x < art.grid[0].length; x++) {
            const v = art.grid[y][x];
            if (!v) continue;
            // backing cell (x,y) is an s x s block; centre-sample it.
            const i = ((y * s + (s >> 1)) * cv.width + (x * s + (s >> 1))) * 4;
            if (d[i + 3] > 0) out.ink++;
            const want = art.palette[v];
            const got = '#' + hex(d[i]) + hex(d[i + 1]) + hex(d[i + 2]);
            out.sampled++;
            if (got !== want) out.badCells++;
          }
        }
        const r = cv.getBoundingClientRect();
        out.box = { left: r.left, top: r.top, w: r.width, h: r.height };
        out.scale = OFFER_ART_SCALE;
        return out;
      });
      return { ok: true, tries, offers: found, cards };
    })()`, true);
    check('run is playing and state.time advanced BEFORE measuring (t=' + report.t0 + 's)',
      report.playing && report.advancing && report.t0 > 1.0, report.t0);
    check('a draft offering BOTH a weapon level-up AND Quick Hands was found (tries=' + (report.draft.tries || '?') + ')',
      report.draft.ok, report.draft.offers);
    const cards = report.draft.cards || [];
    check('EVERY offered card carries a .card-art canvas (no plain-text fallback)',
      cards.length > 0 && cards.every((k) => k.hasCanvas && k.deckId), cards.map((k) => k.offer + '->' + k.deckId));
    check('every offered canvas is REAL deck art (inked, every inked cell on-palette)',
      cards.every((k) => k.ink > 200 && k.badCells === 0), cards.map((k) => k.offer + ':ink' + k.ink + ':bad' + k.badCells));

    // ---- R2: the inspect box shows the big art for the level-up card too ---
    report.inspect = await p.evaluate(`(async () => {
      const T = (await import('./src/main.js')).__TEST;
      const el = [...document.querySelectorAll('#ov-cards > div')]
        .find((k) => k._draftOffer && k._draftOffer.id.startsWith('lvl_'));
      if (!el) return { ok: false, why: 'no lvl card element' };
      const id = el._draftOffer.id;
      el.click();
      const box = document.getElementById('draft-inspect');
      const cv = box ? [...box.querySelectorAll('canvas')].find((k) => k.className === 'card-art-inspect') : null;
      let ink = 0;
      if (cv) {
        const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
        for (let i = 3; i < d.length; i += 4) if (d[i] > 0) ink++;
      }
      const shown = box && box.style.display !== 'none' && T.draftInspectId() === id;
      // ESC back to the offer view for the artifact screenshot.
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      const back = T.draftInspectId() === null;
      return { ok: !!(shown && cv && ink > 400 && back), id, ink, shown, hasCanvas: !!cv, back };
    })()`, true);
    check('inspect->confirm shows the BIG card art for the weapon level-up (R2)', report.inspect.ok, report.inspect);

    // ---- settle, capture the ONE artifact PNG, READ IT BACK ----------------
    await p.evaluate("(async () => { for (let i = 0; i < 4; i++) await new Promise(r => requestAnimationFrame(r)); })()");
    const shotFile = await p.shot('draft-coverage-phone');
    const dst = join(ART, 'draft-coverage-phone.png');
    copyFileSync(shotFile, dst);
    report.png = dst;

    const shotB64 = readFileSync(dst).toString('base64');
    const measure = await p.evaluate(`(async () => {
      const { cardArt } = await import('./src/art/cards.js');
      const b64 = '${shotB64}';
      const img = await createImageBitmap(await (await fetch('data:image/png;base64,' + b64)).blob());
      const c = new OffscreenCanvas(img.width, img.height);
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      const dpr = img.width / innerWidth;
      const hex = (r, gg, b) => '#' + [r, gg, b].map((v) => v.toString(16).padStart(2, '0')).join('');
      const targets = ${JSON.stringify(cards.filter((k) => k.offer.startsWith('lvl_') || k.offer === 'rate').map((k) => ({ offer: k.offer, deckId: k.deckId, box: k.box, scale: k.scale })))};
      const per = {};
      for (const t of targets) {
        const art = cardArt(t.deckId);
        const block = Math.round(t.scale * dpr);       // device px per backing px
        const ox = Math.round(t.box.left * dpr), oy = Math.round(t.box.top * dpr);
        let bad = 0, sampled = 0;
        for (let sy = 0; sy < art.grid.length; sy++) {
          for (let sx = 0; sx < art.grid[0].length; sx++) {
            const v = art.grid[sy][sx];
            if (!v) continue;                          // transparent shows the card div behind
            const want = art.palette[v];
            const d = g.getImageData(ox + sx * block + (block >> 1), oy + sy * block + (block >> 1), 1, 1).data;
            sampled++;
            if (hex(d[0], d[1], d[2]) !== want) bad++;
          }
        }
        per[t.offer] = { deckId: t.deckId, bad, sampled, block };
      }
      return { imgW: img.width, imgH: img.height, dpr, per };
    })()`, true);
    report.measure = measure;
    // Close the draft (the number-key quick-pick) so the sim unfreezes, then
    // prove the game is still advancing after all that measuring.
    await p.evaluate(`(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }));
    })()`);
    report.closed = await p.waitFor("(async () => (await import('./src/main.js')).__TEST.state.mode === 'playing')()", 5000);
    report.t1 = await p.evaluate("(async () => +(await import('./src/main.js')).__TEST.state.time.toFixed(2))()");

    check('PNG is 1170x2532 (390x844 @dpr3)', measure.imgW === 1170 && measure.imgH === 2532, [measure.imgW, measure.imgH]);
    for (const offer of Object.keys(measure.per)) {
      const m = measure.per[offer];
      check('SCREENSHOT-READ ' + offer + ' (' + m.deckId + '): every inked block is the exact palette colour (' + m.bad + '/' + m.sampled + ' wrong)',
        m.bad === 0, m);
    }
    check('the draft closed and the sim is advancing again (t ' + report.t0 + 's -> ' + report.t1 + 's)',
      report.closed && report.t1 > report.t0, [report.t0, report.t1]);
    return report;
  });

for (const r of results) console.log((r.ok ? 'ok   ' : 'FAIL ') + r.name + ' :: ' + JSON.stringify(r.detail));
const bad = results.filter((r) => !r.ok).length;
console.log('verify_card_coverage: ' + (results.length - bad) + '/' + results.length + ' checks passed');
process.exit(bad ? 1 : 0);
