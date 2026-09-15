// HORDES - tools/verify_g21_combos.mjs (G21 slice 2, R8: a CROSS-TAG COMBO card
// is REAL in the browser draft at phone size, and only when it should be).
//
// WHY A NEW FILE rather than extending tools/verify_g21_rewrite_cards.mjs: the
// slice-1 verifier's whole flow is built around ONE-TAG matching (its `tagRe`
// matches `^(TAG)(\\+TAG)* - ` and it stops at the FIRST tagged card), and its
// fixture holds NOTHING — which is exactly the state in which a combo is
// (correctly) absent from the pool. A combo needs a BOTH-SIDES proof: absent
// with one constituent, present with both. That is a different fixture, a
// different matcher and a different negative control, so this is its own tool
// and the slice-1 file is left byte-stable.
//
// REAL Chrome, PHONE viewport 390x844 @dpr3, real finger taps. Proves:
//   1. the run boots through the game's OWN title and a REAL tap on START GAME;
//      all 19 TOUR_KEYS are set and the sim clock is ASSERTED past 1.0s before
//      anything is measured (the frozen-game trap: a harness that skips this
//      measures a paused game).
//   2. NEGATIVE CONTROL: with NO constituents owned, no combo card can reach the
//      real draft — measured over a fixed attempt budget (deterministic: the
//      combos are not in the pool at all, so the count must be exactly 0).
//   3. POSITIVE: with BOTH constituents granted, a combo card renders through
//      the REAL openDraft seam (no weight rigging); the attempt count is the
//      honest measure of the family's share at half weight.
//   4. the combo's desc carries BOTH tags from REWRITE_TAGS as a `TAG+TAG - `
//      prefix and is FULLY INSIDE the card bounds at phone size (no horizontal
//      overflow; the desc rect sits inside the card rect).
//   5. ONE PNG at 1170x2532 of the open draft, READ BACK from the COPIED
//      ARTIFACT (not the tmp capture): its dimensions and the bright-ink count
//      inside the combo card's screen box.
// EVIDENCE DISCLOSURE: the verdict is live-DOM measurement + PNG dimensions and
// ink read back off the committed file - not a "looks right" judgement.
// Run: node tools/verify_g21_combos.mjs
import { withPage } from './browser.mjs';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
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
const TAGS = ['FROST', 'CHAIN', 'ORBIT', 'BURN', 'CONDUCT'];
const COMBO_ATTEMPTS = 8000;

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

// Sweep the REAL draft seam for a card whose desc is a `TAG+TAG - ` combo,
// twice: once with no constituents owned (expect zero hits) and once with both
// owned (expect a hit). No weight rigging anywhere - T.openDraft() is the game.
// The two-tag read is a plain string split, NOT a regex: the escaping of `\\+`
// through two nested source layers is exactly the kind of thing that silently
// matches something else (and a wrong optional group still passes when it is
// never needed).
const sweep = (p, attempts) => p.evaluate(`(async () => {
  const T = (await import('./src/main.js')).__TEST;
  const TAGS = ${JSON.stringify(TAGS)};
  const comboOf = (s) => {
    const i = String(s || '').indexOf(' - ');
    if (i < 0) return null;
    const parts = String(s).slice(0, i).split('+');
    if (parts.length !== 2) return null;
    return parts.every(x => TAGS.includes(x)) ? parts : null;
  };
  const seen = new Set();
  let attempts = 0, hit = null;
  for (; attempts < ${attempts} && !hit; attempts++) {
    T.openDraft();
    for (const el of document.getElementById('ov-cards').children) {
      const d = el.querySelector('.desc');
      const t = (d && d.textContent) || '';
      if (t) seen.add(t.slice(0, 24));
      const tags = comboOf(t);
      if (d && tags) {
        const er = el.getBoundingClientRect(), dr = d.getBoundingClientRect();
        hit = { name: (el.querySelector('.name') || {}).textContent || '',
          desc: t, attempts: attempts + 1, tags,
          fitsW: d.scrollWidth <= el.clientWidth,
          inside: dr.left >= er.left && dr.right <= er.right &&
                  dr.top >= er.top && dr.bottom <= er.bottom,
          box: [er.left, er.top, er.width, er.height],
          viewport: [innerWidth, innerHeight, devicePixelRatio] };
        break;
      }
    }
  }
  return { hit, attempts, distinctDescs: seen.size, mode: T.state.mode,
    time: T.state.time, rewrites: Object.keys(T.state.player.rewrites || {}) };
})()`, true);

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
    // THE FROZEN-GAME ASSERTION: nothing below is measured until the sim clock
    // has actually advanced past one second.
    const advancing = await p.waitFor("(async () => { const st = (await import('./src/main.js')).__TEST.state; return st.mode === 'playing' && st.time > 1.0; })()", 10000, 200);
    check('run started via a REAL tap and the sim clock ADVANCED past 1.0s (not a frozen game)',
      playing && advancing, { playing, advancing });

    // ---- NEGATIVE CONTROL: nothing owned, so no combo is in the pool ----
    // (The real seam leaves the run in `draft` mode once it has been opened,
    // so the liveness read here is the SIM CLOCK, recorded per sweep, not the
    // mode string.)
    const before = await sweep(p, 400);
    check('no combo reaches the real draft with NO constituents owned (negative control)',
      before.attempts === 400 && before.hit === null &&
        before.time > 1.0 && before.rewrites.length === 0,
      { attempts: before.attempts, hits: before.hit ? 1 : 0, simClock: before.time,
        distinctDescs: before.distinctDescs, rewrites: before.rewrites });

    // ---- POSITIVE: grant BOTH constituents of two combos ----
    // rime + ignite wake THERMAL SHOCK; wideorbit + rime wake GLACIAL ORBIT.
    // Three of the four finite slots are spent, so the family is still open.
    const granted = await p.evaluate(`(async () => {
      const T = (await import('./src/main.js')).__TEST;
      const { grantRewrite } = await import('./src/rewrites.js');
      const { makeWeapon } = await import('./src/weapons.js');
      for (const id of ['rime', 'ignite', 'wideorbit']) grantRewrite(T.state, id);
      T.state.weapons.push(makeWeapon('ORBIT'));
      return { rewrites: Object.keys(T.state.player.rewrites), time: T.state.time,
        slots: (await import('./src/config.js')).CONFIG.REWRITE_SLOTS };
    })()`, true);
    check('both constituents granted on the live run (three of four slots spent)',
      granted.rewrites.length === 3 && granted.slots === 4 && granted.time > 1.0,
      { rewrites: granted.rewrites, slots: granted.slots, time: granted.time });

    const found = await sweep(p, COMBO_ATTEMPTS);
    check('a COMBO card rendered through the REAL openDraft seam (attempts printed)',
      !!found.hit && found.time > 1.0, found.hit
        ? { name: found.hit.name, desc: found.hit.desc, attempts: found.hit.attempts,
            simClock: found.time, distinctDescs: found.distinctDescs }
        : { attempts: found.attempts, distinctDescs: found.distinctDescs });
    if (!found.hit) throw new Error('no combo card in ' + COMBO_ATTEMPTS + ' real drafts');
    check('the combo desc carries BOTH tags as a TAG+TAG - prefix',
      found.hit.tags.length === 2 && found.hit.tags[0] !== found.hit.tags[1] &&
        found.hit.desc.startsWith(found.hit.tags.join('+') + ' - '),
      { desc: found.hit.desc, tags: found.hit.tags });
    check('the combo desc is FULLY INSIDE the card bounds at phone size (390x844)',
      found.hit.fitsW && found.hit.inside && found.hit.viewport[0] === 390 &&
        found.hit.viewport[1] === 844 && found.hit.viewport[2] === 3,
      { fitsW: found.hit.fitsW, inside: found.hit.inside, viewport: found.hit.viewport });

    // ---- ONE PNG, then READ THE COPIED ARTIFACT BACK ----
    const shotFile = await p.shot('g21-combo-draft-phone');
    const dest = join(ART, 'g21-combo-draft-phone.png');
    copyFileSync(shotFile, dest);
    const ink = await readBack(p, dest, found.hit.box);
    check('PNG is 1170x2532 (390x844 @dpr3)',
      ink.imgW === 1170 && ink.imgH === 2532, { imgW: ink.imgW, imgH: ink.imgH });
    check('ink-bbox: the combo card paints bright ink inside its screen box',
      ink.ink > 50, { ink: ink.ink, meanInk: ink.meanInk,
        box: found.hit.box.map(v => +v.toFixed(1)) });
    return { hit: found.hit, dest };
  });

const bad = results.filter(r => !r.ok);
console.log('PNG: ' + out.dest);
console.log('COMBO RENDERED: ' + out.hit.name + ' -- ' + out.hit.desc +
  '  (attempt ' + out.hit.attempts + ')');
console.log(bad.length ? `VERIFY G21 COMBOS: ${bad.length} FAILURES` : 'VERIFY G21 COMBOS: ALL ' + results.length + ' CHECKS PASSED');
process.exit(bad.length ? 1 : 0);
