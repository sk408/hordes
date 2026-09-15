// HORDES - tools/verify_g21_rewrite_cards.mjs (G21 slice 1, R8: the tag-
// prefixed rewrite card is REAL in the browser draft at phone size).
// REAL browser, PHONE viewport 390x844 @dpr3, real finger taps. Proves:
//   1. the run boots through the game's OWN title and a REAL tap on START
//      GAME; all 19 TOUR_KEYS are set and the sim clock is ASSERTED past
//      1.0s before anything is measured (the tick-38 lesson: a harness that
//      skips this measures a FROZEN game).
//   2. a TAGGED rewrite card renders through the REAL draft seam (openDraft,
//      no weight rigging): the loop re-opens the real draft until the rng
//      deals one, and the attempt count is printed. The desc starts with the
//      REWRITE_TAGS prefix ("TAG - ..." / "TAG+TAG - ...").
//   3. the tag-prefixed desc is FULLY INSIDE the card bounds at phone size:
//      no horizontal overflow (scrollWidth <= clientWidth) and the desc rect
//      sits inside the card rect.
//   4. ONE PNG at 1170x2532 of the open draft with an ink-bbox check on the
//      tagged card's screen box.
// EVIDENCE DISCLOSURE: the verdict is live-DOM measurement + PNG
// dimensions/ink, read back by the reporter — not a "looks right" judgement.
// Run: node tools/verify_g21_rewrite_cards.mjs
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

    // Force-draft a TAGGED rewrite card through the REAL seam: re-open the
    // live draft until the weighted rng deals a card whose desc carries the
    // REWRITE_TAGS prefix. No weight rigging — the attempt count is the
    // honest measure of the family share at REWRITE_CARD_WEIGHT.
    const found = await p.evaluate(`(async () => {
      const T = (await import('./src/main.js')).__TEST;
      const { REWRITE_TAGS } = await import('./src/rewrites.js');
      const tagRe = new RegExp('^(' + REWRITE_TAGS.join('|') + ')(\\\\+(' + REWRITE_TAGS.join('|') + '))* - ');
      let attempts = 0, hit = null;
      for (; attempts < 600 && !hit; attempts++) {
        T.openDraft();
        for (const el of document.getElementById('ov-cards').children) {
          const d = el.querySelector('.desc');
          if (d && tagRe.test(d.textContent || '')) {
            const er = el.getBoundingClientRect(), dr = d.getBoundingClientRect();
            hit = { name: (el.querySelector('.name') || {}).textContent || '',
              desc: d.textContent, attempts: attempts + 1,
              fitsW: d.scrollWidth <= el.clientWidth,
              inside: dr.left >= er.left && dr.right <= er.right &&
                      dr.top >= er.top && dr.bottom <= er.bottom,
              box: [er.left, er.top, er.width, er.height] };
            break;
          }
        }
      }
      return { hit, mode: T.state.mode };
    })()`, true);
    check('a TAGGED rewrite card rendered through the REAL openDraft seam (attempts printed)',
      !!found.hit, found.hit ? { name: found.hit.name, desc: found.hit.desc, attempts: found.hit.attempts } : { attempts: 600 });
    if (!found.hit) throw new Error('no tagged rewrite card in 600 real drafts');
    check('the desc carries the REWRITE_TAGS prefix (TAG[+TAG] - ...)',
      /^(FROST|CHAIN|ORBIT|BURN|CONDUCT)(\+(FROST|CHAIN|ORBIT|BURN|CONDUCT))* - /.test(found.hit.desc),
      { desc: found.hit.desc });
    check('the tag-prefixed desc is FULLY INSIDE the card bounds at phone size',
      found.hit.fitsW && found.hit.inside, { fitsW: found.hit.fitsW, inside: found.hit.inside });

    // PNG: the open draft with the tagged card on screen, then ink-bbox.
    const shotFile = await p.shot('g21-rewrite-draft-phone');
    const ink = await inkInBox(p, shotFile, found.hit.box);
    check('PNG is 1170x2532 (390x844 @dpr3)', ink.imgW === 1170 && ink.imgH === 2532,
      { imgW: ink.imgW, imgH: ink.imgH });
    check('ink-bbox: the tagged card paints bright ink inside its screen box',
      ink.ink > 50, { ink: ink.ink, box: found.hit.box.map(v => +v.toFixed(1)) });
    return shotFile;
  });

const dest = join(ART, 'g21-rewrite-draft-phone.png');
copyFileSync(out, dest);
const bad = results.filter(r => !r.ok);
console.log('PNG: ' + dest + ' (src ' + out + ')');
console.log(bad.length ? `VERIFY G21 REWRITE CARDS: ${bad.length} FAILURES` : 'VERIFY G21 REWRITE CARDS: ALL ' + results.length + ' CHECKS PASSED');
process.exit(bad.length ? 1 : 0);
