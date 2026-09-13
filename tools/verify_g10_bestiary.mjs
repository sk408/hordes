// HORDES — tools/verify_g10_bestiary.mjs: G10 PART B in a REAL browser, on a
// PHONE. Same bar as verify_g8_rewrites.mjs (the build plan's rule: anything a
// player looks at is verified by a real-browser screenshot on a phone
// viewport; a code claim is not evidence). This drives the REAL title ->
// BESTIARY card -> mode 'bestiary' at 390x844 @3x twice:
//   1. FRESH profile — every entry masked ('???', 'not yet encountered'), the
//      full ring walkable, the canvas showcase painted (renderer.bestiary
//      seam) over a dark backdrop;
//   2. SEEDED profile — recordEncounter-driven discoveries un-mask their
//      entries (the real caption, the model's own numbers).
// It reads card/caption geometry out of the DOM (in-viewport, unclipped) and
// samples the captured PNG.
//
// EVIDENCE DISCLOSURE (the brief requires it stated plainly): there is NO
// vision model reachable from this host. The verdict below rests on DOM
// geometry + readShot pixel samples, not on any "looks right" judgement.
//
// Run: node tools/verify_g10_bestiary.mjs
import { withPage } from './browser.mjs';

const out = await withPage({ w: 390, h: 844, dpr: 3,
  startupScript: "try { localStorage.setItem('hordes_onboarded', '1'); } catch (e) {}" },
  async (p) => {
    await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
    await p.waitFor("(async () => (await import('./src/main.js')).__TEST.state.mode !== 'intro')()", 15000);

    const probe = `(async () => {
      const m = await import('./src/main.js');
      const T = m.__TEST, state = T.state;
      const raf = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const rect = (el) => { const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
      const domState = () => {
        const vp = { w: window.innerWidth, h: window.innerHeight };
        const els = [...document.querySelectorAll('#ov-cards .card')];
        const sub = document.getElementById('ov-sub');
        const title = document.getElementById('ov-title');
        const overlay = document.getElementById('overlay');
        const cards = els.map(el => ({ rect: rect(el),
          text: (el.textContent || '').replace(/\\s+/g, ' ').trim() }));
        const subR = rect(sub);
        return {
          mode: state.mode, vp, cards,
          title: (title.textContent || '').trim(),
          sub: (sub.textContent || '').replace(/\\s+/g, ' ').trim(),
          subRect: subR,
          cardsInView: cards.every(c => c.rect.x >= 0 && c.rect.y >= 0 &&
            c.rect.x + c.rect.w <= vp.w && c.rect.y + c.rect.h <= vp.h),
          subInView: subR.x >= 0 && subR.y >= 0 && subR.x + subR.w <= vp.w && subR.y + subR.h <= vp.h,
          subClipped: sub.scrollHeight > sub.clientHeight + 1 || sub.scrollWidth > sub.clientWidth + 1,
          overlayBg: overlay.style.background, overlayJustify: overlay.style.justifyContent,
          seam: T.renderer.bestiary && { ...T.renderer.bestiary },
        };
      };
      const results = {};

      // ---- 1. FRESH: title card -> the guide, masked --------------------------
      state.mode = 'menu';
      T.openBestiary();
      await raf();
      const fresh = domState();
      const ids = T.bestiaryDisplayIds();
      // Walk the WHOLE ring: every entry masked on a fresh profile.
      const maskedWalk = [];
      for (let i = 0; i < ids.length; i++) {
        state.bestiaryIdx = i; T.bestiaryStep(0);
        maskedWalk.push(document.getElementById('ov-title').textContent === '???');
      }
      results.fresh = { ...fresh, ringSize: ids.length,
        allMasked: maskedWalk.every(Boolean),
        ringSeam: T.renderer.bestiary && T.renderer.bestiary.scale >= 1 };
      T.closeBestiary(); state.mode = 'menu';

      // ---- 2. SEEDED: recordEncounter-driven discoveries un-mask ---------------
      const enc = await import('./src/encounters.js');
      const profile = T.getProfile();
      enc.recordEncounter(profile, 'enemy:CHASER', { wave: 1, at: 2 });
      enc.recordEncounter(profile, 'enemy:CHASER', { wave: 4, at: 130 });
      enc.recordEncounter(profile, 'enemy:BRUTE', { wave: 3, at: 95, tier: 'MYTHIC' });
      enc.recordEncounter(profile, 'boss:HERALD', { wave: 1, at: 60 });
      T.openBestiary();
      await raf();
      const seededIdx = T.bestiaryDisplayIds().indexOf('enemy:CHASER');
      state.bestiaryIdx = seededIdx; T.bestiaryStep(0);
      await raf();
      const chaser = domState();
      const bruteIdx = T.bestiaryDisplayIds().indexOf('enemy:BRUTE');
      state.bestiaryIdx = bruteIdx; T.bestiaryStep(0);
      await raf();
      const brute = domState();
      results.seeded = { seen: enc.seenCount(profile), total: enc.totalEncounters(),
        chaser, brute,
        chaserNamed: chaser.title === 'CHASER', chaserHasStats: /hp x/.test(chaser.sub),
        bruteTier: /best tier: MYTHIC/.test(brute.sub) };
      return results;
    })()`;

    const res = await p.evaluate(probe);
    const shot = await p.shot('g10-bestiary-phone');
    // readShot takes a LABEL -> [x, y] map in CSS px (it scales by the dpr).
    const px = await p.readShot(shot, {
      canvasCenter: [195, 340],      // the showcase area above the bottom chrome
      caption: [195, 790],           // the caption block pushed to the bottom
    });
    return { ...res, shot, sample: px };
  });

console.log(JSON.stringify(out, null, 2));
const problems = [];
const f = out.fresh, s = out.seeded;
if (f.mode !== 'bestiary') problems.push('fresh: mode is ' + f.mode);
if (f.title !== '???') problems.push('fresh: title is ' + JSON.stringify(f.title) + ', not the mask');
if (!f.allMasked) problems.push('fresh: some entry leaked its name over the full ring walk');
if (!f.ringSize || f.ringSize < 10) problems.push('fresh: ring size ' + f.ringSize);
if (!f.cardsInView) problems.push('fresh: a chrome card is outside the phone viewport');
if (!f.subInView || f.subClipped) problems.push('fresh: the caption is clipped or off-viewport');
if (f.overlayBg !== 'transparent' || f.overlayJustify !== 'flex-end') {
  problems.push('fresh: overlay overrides missing (bg=' + f.overlayBg + ', justify=' + f.overlayJustify + ')');
}
if (!f.ringSeam) problems.push('fresh: the canvas showcase did not paint (seam null)');
if (!s || !s.chaserNamed || !s.chaserHasStats) problems.push('seeded: the CHASER entry did not un-mask with stats');
if (!s || !s.bruteTier) problems.push('seeded: the BRUTE entry does not report its best tier');
if (!s || s.seen < 3 || s.seen >= s.total) problems.push('seeded: seen count ' + (s && s.seen) + '/' + (s && s.total));
const c = out.sample && out.sample.px && out.sample.px.canvasCenter;
if (!c || c.some(v => typeof v !== 'number')) problems.push('pixel sample missing');
else if (Math.max(c[0], c[1], c[2]) > 90) problems.push('canvas centre is not the dark backdrop: ' + JSON.stringify(c));

console.log(problems.length ? 'VERIFY G10 BESTIARY: FAIL - ' + problems.join('; ')
  : 'VERIFY G10 BESTIARY: PASS - phone guide masked fresh, un-masked seeded, chrome in viewport');
console.log('EVIDENCE: DOM geometry + readShot pixel samples above. No vision read is made by this tool (vision_analyze works here but is flaky - crop + downscale); no "looks right" judgement is claimed.');
process.exit(problems.length ? 1 : 0);
