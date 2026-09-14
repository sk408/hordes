// HORDES — W7b acceptance #1, REAL BROWSER: a live draft offers a COMMON flat
// card, a RARE percent card, and a MYTHIC chase, with the tier badge rendered
// in the rarity.js tell colours. 390x844 @dpr3, all 19 TOUR_KEYS set, and
// state.time asserted ADVANCING before anything is measured (the withPage
// frozen-game trap: 7 of 19 keys is a paused game that still reads 'playing').
//
// Method: boot the real page, start a run through the REAL __TEST.startRun
// seam, prove the sim clock moves, then force every mythic gate open and cycle
// REAL openDraft() offers until one offer shows all three tiers (the RENDER is
// what is verified here — the offer RATES are measured headlessly in
// test/test_w7b_draft_ladder.mjs). The badges' COMPUTED colours are read off
// the live DOM (rgb(111,216,255) = #6fd8ff RARE, rgb(200,154,255) = #c89aff
// MYTHIC), and the PNG is the artifact.
// EVIDENCE DISCLOSURE: no vision model on this host — the verdict is DOM text +
// computed style + live-clock assertion + PNG dimensions/ink, not a
// "looks right" judgement.
// Run: node tools/verify_w7b_ladder.mjs
import { withPage, SHOT_DIR } from './browser.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const TOUR19 = ['stage1', 'hud', 'pilot', 'focus', 'stance', 'move', 'skills', 'potions',
  'stats', 'cog', 'draft', 'edge', 'chest', 'portal', 'arch', 'shrine',
  'intermission', 'death', 'settings'];

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok, detail });
  console.log((ok ? 'ok - ' : 'FAIL - ') + name + (detail ? '  (' + detail + ')' : ''));
};

const out = await withPage({ w: 390, h: 844, dpr: 3, timeoutMs: 60000,
  startupScript: "try { localStorage.setItem('hordes_onboarded', '1'); } catch (e) {}" + "\n" +
    'for (const k of ' + JSON.stringify(TOUR19) + ") { try { localStorage.setItem('hordes_tour_' + k, '1'); } catch (e) {} }" },
  async (p) => {
    await p.waitFor("(async () => (await import('./src/main.js')).__TEST.state.mode !== 'intro')()", 20000);
    await p.waitFor("(async () => { const rv = (await import('./src/main.js')).__TEST.state.titleReveal; return !rv || rv.phase === 'settled'; })()", 8000);

    // Start a run through the REAL seam and prove the clock advances BEFORE
    // any measurement (the frozen-game trap).
    await p.evaluate(`(async () => { (await import('./src/main.js')).__TEST.startRun(); })()`);
    const t0 = await p.evaluate(`(async () => (await import('./src/main.js')).__TEST.state.time)()`);
    await new Promise(r => setTimeout(r, 1500));
    const t1 = await p.evaluate(`(async () => (await import('./src/main.js')).__TEST.state.time)()`);
    check('sim clock advances in the live page before measuring', t1 > t0 + 0.5,
      `t ${t0.toFixed(2)} -> ${t1.toFixed(2)}`);

    // Cycle REAL offers until one shows all three tiers (gates forced open;
    // weights boosted after 300 tries only to bound the search — the render,
    // not the rate, is under test here).
    const found = await p.evaluate(`(async () => {
      const T = (await import('./src/main.js')).__TEST;
      const C = await import('./src/config.js');
      T.state.chasePool = { second_wind: true, storm_shards: true, full_hand: true };
      const scan = () => {
        const cards = Array.from(document.getElementById('ov-cards').children);
        const tag = (c) => {
          const b = c.querySelector('.syn');
          if (b && /^(RARE|MYTHIC)$/.test(b.textContent)) return b.textContent;
          const h = c.innerHTML || '';
          // a COMMON FLAT card = an unbadged stat card (not a weapon grant or
          // level-up, not a RUN RULE / SKILL family card)
          if (h.includes('NEW WEAPON') || h.includes(' UP</div>') ||
              h.includes('RUN RULE') || h.includes('SKILL -')) return 'other';
          return 'FLAT';
        };
        const tiers = new Set(cards.map(tag));
        const names = cards.map(c => (c.querySelector('.name') || {}).textContent || '');
        return { tiers, names, n: cards.length };
      };
      for (let i = 0; i < 800; i++) {
        if (i === 300) { C.DRAFT_LADDER.RARE_WEIGHT *= 3; C.DRAFT_LADDER.MYTHIC_WEIGHT *= 3; }
        T.openDraft();
        const s = scan();
        if (s.tiers.has('FLAT') && s.tiers.has('RARE') && s.tiers.has('MYTHIC')) {
          return { tries: i + 1, names: s.names, n: s.n };
        }
        T.state.mode = 'playing';
      }
      return null;
    })()`, true);
    check('one live offer shows a COMMON flat + RARE + MYTHIC together', !!found,
      found ? `tries ${found.tries}, cards: ${found.names.join(' | ')}` : 'not found in 800 offers');
    if (!found) return;

    // The badge is ON the card, in the tier's tell colour (computed style off
    // the live DOM — the same evidence bar as a pixel sample for DOM text).
    const badges = await p.evaluate(`(() => {
      const cards = Array.from(document.getElementById('ov-cards').children);
      return cards.map(c => {
        const b = c.querySelector('.syn');
        return b && /^(RARE|MYTHIC)$/.test(b.textContent)
          ? { tier: b.textContent, color: getComputedStyle(b).color } : null;
      }).filter(Boolean);
    })()`);
    const rare = badges.find(b => b.tier === 'RARE');
    const mythic = badges.find(b => b.tier === 'MYTHIC');
    check('RARE badge computes to the cyan tell #6fd8ff', rare && rare.color === 'rgb(111, 216, 255)',
      JSON.stringify(rare));
    check('MYTHIC badge computes to the violet tell #c89aff', mythic && mythic.color === 'rgb(200, 154, 255)',
      JSON.stringify(mythic));

    // The overlay is genuinely UP (visible), then the artifact PNG.
    const up = await p.evaluate(`(() => {
      const ov = document.getElementById('overlay');
      const r = document.getElementById('ov-cards').getBoundingClientRect();
      return { display: getComputedStyle(ov).display, w: r.width, h: r.height };
    })()`);
    check('the draft overlay is displayed with laid-out cards', up.display === 'flex' && up.w > 50 && up.h > 50,
      JSON.stringify(up));
    const shot = await p.shot('w7b_ladder_offer');
    const dim = await p.evaluate(`(async () => {
      const b64 = '${readFileSync(join(SHOT_DIR, 'w7b_ladder_offer.png')).toString('base64')}';
      const img = await createImageBitmap(await (await fetch('data:image/png;base64,' + b64)).blob());
      return { w: img.width, h: img.height };
    })()`, true);
    check('artifact PNG is 390x844 @dpr3', dim.w === 1170 && dim.h === 2532, JSON.stringify(dim) + ' at ' + shot);
  });

const errs = (out && out.errors) || [];
check('no page errors during the probe', errs.length === 0, errs.slice(0, 3).join(' ; '));
const failed = results.filter(r => !r.ok);
console.log(failed.length === 0 ? 'verify_w7b_ladder: ALL CHECKS PASSED' : `verify_w7b_ladder: ${failed.length} FAILURES`);
process.exit(failed.length === 0 ? 0 : 1);
