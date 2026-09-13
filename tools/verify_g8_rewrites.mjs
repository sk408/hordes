// HORDES — tools/verify_g8_rewrites.mjs: G8 STEP 2 in a REAL browser, on a PHONE.
// Same bar as verify_g8_skills.mjs (the build plan's rule: anything a player
// looks at is verified by a real-browser screenshot on a phone viewport; a
// code claim is not evidence). This drives the REAL src/main.js openDraft() at
// 390x844 @3x, seeds drafts until a REWRITE card (Pierce All / Chain Reaction /
// Blood Harvest — family weight 3 x REWRITE_CARD_WEIGHT) reaches the offer,
// reads the rendered card geometry out of the DOM (is the desc clipped? is
// every card inside the viewport?) and samples the captured PNG inside the
// rewrite card.
//
// EVIDENCE DISCLOSURE (the brief requires it stated plainly): there is NO
// vision model reachable from this host. The verdict below rests on DOM
// geometry + readShot pixel samples, not on any "looks right" judgement.
//
// Run: node tools/verify_g8_rewrites.mjs
import { withPage } from './browser.mjs';
import { REWRITES } from '../src/rewrites.js';

// The family's cards are found by their player-facing NAME. They used to be
// found by grepping for the internal 'REWRITE - ' label, which is exactly the
// leaked marker that has now been removed from player copy - so the old
// matcher would silently find nothing.
const REWRITE_NAMES = Object.values(REWRITES).map(r => r.name);
const isRewriteText = (t) => REWRITE_NAMES.some(n => (t || '').includes(n));

const out = await withPage({ w: 390, h: 844, dpr: 3,
  startupScript: "try { localStorage.setItem('hordes_onboarded', '1'); } catch (e) {}" },
  async (p) => {
    await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
    await p.waitFor("(async () => (await import('./src/main.js')).__TEST.state.mode !== 'intro')()", 15000);
    const res = await p.evaluate(`(async () => {
      const m = await import('./src/main.js');
      const { makeWeapon } = await import('./src/weapons.js');
      const T = m.__TEST, state = T.state;
      state.weapons = ['VOLLEY', 'BOOMERANG'].map(makeWeapon);
      const seeded = (seed) => { let a = seed >>> 0;
        return () => { a = (a + 0x6D2B79F5) | 0;
          let t = Math.imul(a ^ (a >>> 15), 1 | a);
          t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
      const real = Math.random;
      let found = null, tries = 0;
      try {
        for (let i = 1; i <= 400 && !found; i++) {
          Math.random = seeded(i * 7919);
          T.openDraft();
          tries++;
          const els = [...document.querySelectorAll('#ov-cards .card')];
          const hit = els.find(el => isRewriteText(el.textContent));
          if (hit) found = { seed: i * 7919, texts: els.map(el => el.textContent.replace(/\\s+/g, ' ').trim()) };
        }
      } finally { Math.random = real; }
      const rect = (el) => { const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
      const els = [...document.querySelectorAll('#ov-cards .card')];
      const cards = els.map(el => { const r = rect(el); const desc = el.querySelector('.desc');
        return { rect: r, clipped: desc ? (desc.scrollHeight > desc.clientHeight + 1 ||
          desc.scrollWidth > desc.clientWidth + 1) : null,
          descLines: desc ? Math.round(desc.getBoundingClientRect().height) : null,
          text: (el.textContent || '').replace(/\\s+/g, ' ').trim() }; });
      const vp = { w: window.innerWidth, h: window.innerHeight };
      return { mode: state.mode, tries, found: !!found, seed: found && found.seed, cards, vp,
        inView: cards.every(c => c.rect.x >= 0 && c.rect.y >= 0 &&
          c.rect.x + c.rect.w <= vp.w && c.rect.y + c.rect.h <= vp.h),
        anyClipped: cards.some(c => c.clipped === true),
        overlay: getComputedStyle(document.getElementById('overlay')).display };
    })()`);
    const shot = await p.shot('g8-step2-rewrite-draft-phone');
    const target = res.cards.find(c => isRewriteText(c.text)) || res.cards[0];
    // readShot takes a LABEL -> [x, y] map in CSS px (it scales by the captured dpr).
    const px = await p.readShot(shot, {
      rewriteCardText: [Math.round(target.rect.x + target.rect.w / 2), Math.round(target.rect.y + 40)],
      rewriteCardBody: [Math.round(target.rect.x + target.rect.w / 2), Math.round(target.rect.y + target.rect.h / 2)],
    });
    return { ...res, shot, sample: px };
  });

console.log(JSON.stringify(out, null, 2));
const rewrite = (out.cards || []).find(c => isRewriteText(c.text));
const problems = [];
if (out.mode !== 'draft') problems.push('mode is ' + out.mode + ', not draft');
if (!out.found) problems.push('no REWRITE card reached the pool in ' + out.tries + ' drafts');
if ((out.cards || []).length !== 3) problems.push('rendered ' + (out.cards || []).length + ' cards, not 3');
if (!out.inView) problems.push('a card is outside the phone viewport');
if (out.anyClipped) problems.push('a card description is clipped');
if (out.overlay !== 'flex') problems.push('overlay display is ' + out.overlay);
console.log(problems.length ? 'VERIFY G8 STEP 2: FAIL - ' + problems.join('; ')
  : 'VERIFY G8 STEP 2: PASS - phone draft shows the rewrite card unclipped');
console.log('EVIDENCE: DOM geometry + readShot pixel samples above. No vision model is ' +
  'reachable from this host; no "looks right" judgement is claimed.');
process.exit(problems.length ? 1 : 0);
