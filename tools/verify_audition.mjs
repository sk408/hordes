#!/usr/bin/env node
// HORDES — real-Chrome check of the listening page, listen/index.html (R1).
// One headless Chrome at a time (tools/browser.mjs). For a desktop window
// (1280x720, mouse clicks) and a phone (390x844, finger taps), served from the
// repo root and from a sub-path like the test build's /hordes-claude/:
//   - the page measures every sound and says it is ready;
//   - every sound button, pressed for real, puts signal on the analyser;
//   - the OLD / NEW switch is saved where the game reads it (hordes_audio_mix);
//   - the busy fight, the fight with music (the recorded run track starts)
//     and the worst case all sound, and the worst case never passes 0 dBFS
//     in the new mix;
//   - no sideways scroll, no console errors.
// All four arms take longer than three minutes. --arm <n> (1..4) runs one:
//   node tools/verify_audition.mjs --arm 1    (1 desktop root, 2 phone root,
//                                              3 desktop sub-path, 4 phone sub-path)
// Run: HORDES_CHROME="C:/Program Files/Google/Chrome/Application/chrome.exe" node tools/verify_audition.mjs
import path from 'node:path';
import { withPage, ROOT } from './browser.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0, oks = 0;
const okc = (label, name, pass, info) => {
  if (pass) oks++; else fails++;
  console.log((pass ? '  ok   ' : '  FAIL ') + label + ': ' + name + (info !== undefined ? '  ' + JSON.stringify(info) : ''));
};

// Polls the analyser for `ms`: the loudest RMS frame and the largest sample.
const PEAK = (ms) => `(async () => {
  let rms = -200, peak = 0; const t0 = performance.now();
  while (performance.now() - t0 < ${ms}) {
    rms = Math.max(rms, window.__aud.level());
    const s = window.__aud.A.AUDIO_TEST.state();
    const an = s.ctx && window.__peakAn && window.__peakAn.context === s.ctx ? window.__peakAn : null;
    if (an) { const d = new Float32Array(an.fftSize); an.getFloatTimeDomainData(d); for (const v of d) peak = Math.max(peak, Math.abs(v)); }
    await new Promise((r) => setTimeout(r, 15));
  }
  return { rms: Math.round(rms * 10) / 10, peakDb: peak > 0 ? Math.round(200 * Math.log10(peak)) / 10 : -200 };
})()`;
// An analyser after the limiter (the shaper's output is what reaches the speakers).
const TAP_OUT = `(() => {
  const A = window.__aud.A, s = A.AUDIO_TEST.state();
  const node = A.AUDIO_TEST.limiter().node || s.master;
  window.__peakAn = s.ctx.createAnalyser(); window.__peakAn.fftSize = 2048; node.connect(window.__peakAn);
  return !!A.AUDIO_TEST.limiter().node;
})()`;

async function run(label, opts, phone) {
  await withPage({ ...opts, timeoutMs: 120000 }, async (page) => {
    await page.waitFor('window.__aud && window.__aud.ready', 90000);
    okc(label, 'the page measured every sound', true, await page.evaluate("document.getElementById('status').textContent"));
    const press = async (sel) => {
      const r = await page.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.scrollIntoView({ block: 'center' });
        const b = e.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; })()`);
      await sleep(60);
      if (phone) await page.tap(r[0], r[1], 1); else await page.click(r[0], r[1]);
    };
    const keys = await page.evaluate("[...document.querySelectorAll('.snd')].map(b => b.dataset.key)");
    const silent = [];
    for (const k of keys) {
      await press('.snd[data-key="' + k + '"]');
      const lv = await page.evaluate(PEAK(k === 'intro:OVERTAKE' ? 600 : 300), true);
      if (!(lv.rms > -90)) silent.push(k + ' ' + lv.rms);
    }
    const played = await page.evaluate('window.__aud.played.length');
    okc(label, 'every sound button plays (signal at the analyser)', silent.length === 0 && played === keys.length, { buttons: keys.length, played, silent });
    // The switch.
    await press('#mixOld');
    okc(label, 'OLD MIX is saved for the game', await page.evaluate("localStorage.getItem('hordes_audio_mix') === 'old' && document.getElementById('mixOld').getAttribute('aria-pressed') === 'true'"));
    await press('#fight');
    await sleep(300);
    const oldFight = await page.evaluate(PEAK(1500), true);
    await press('#mixNew');
    okc(label, 'NEW MIX is saved for the game', await page.evaluate("localStorage.getItem('hordes_audio_mix') === 'new' && document.getElementById('mixNew').getAttribute('aria-pressed') === 'true'"));
    await press('#fight');
    await sleep(300);
    const newFight = await page.evaluate(PEAK(1500), true);
    okc(label, 'the busy fight sounds in both mixes, louder in the new', oldFight.rms > -70 && newFight.rms > oldFight.rms, { old: oldFight.rms, new: newFight.rms });
    await press('#worst');
    await sleep(100);
    const lim = await page.evaluate(TAP_OUT);
    const worst = await page.evaluate(PEAK(5500), true);
    okc(label, 'the worst case sounds and stays under 0 dBFS after the limiter', lim && worst.rms > -60 && worst.peakDb < 0, worst);
    await press('#fightMusic');
    await page.waitFor("window.__aud.A.AUDIO_TEST.music() && window.__aud.A.AUDIO_TEST.music().cur === 'run_wilds'", 15000).catch(() => {});
    const mus = await page.evaluate("window.__aud.A.AUDIO_TEST.music() && window.__aud.A.AUDIO_TEST.music().cur");
    const fm = await page.evaluate(PEAK(800), true);
    okc(label, 'BUSY FIGHT + MUSIC plays the recorded run track under the fight', mus === 'run_wilds' && fm.rms > -70, { cur: mus, rms: fm.rms });
    await press('#stop');
    const wide = await page.evaluate('document.scrollingElement.scrollWidth <= window.innerWidth');
    okc(label, 'no sideways scroll', wide);
    if (opts.shot) {
      await page.evaluate('window.scrollTo(0, 0)');
      await sleep(150);
      console.log('  shot ' + await page.shot(opts.shot));
    }
    okc(label, '0 console errors', page.errors.length === 0, page.errors.slice(0, 3));
  });
}

const sub = path.basename(ROOT);   // the repo folder: /<name>/listen/index.html, as on the test build
const ARM_I = process.argv.indexOf('--arm');
const ONLY_ARM = ARM_I >= 0 ? Number(process.argv[ARM_I + 1]) : 0;
if (ARM_I >= 0 && !(ONLY_ARM >= 1 && ONLY_ARM <= 4)) throw new Error('--arm takes 1, 2, 3 or 4');
const want = (n) => !ONLY_ARM || ONLY_ARM === n;
if (want(1)) await run('desktop 1280x720, root', { w: 1280, h: 720, dpr: 1, mobile: false, url: 'listen/index.html', shot: 'audition_desktop' }, false);
if (want(2)) await run('phone 390x844, root', { w: 390, h: 844, dpr: 2, mobile: true, url: 'listen/index.html', shot: 'audition_phone' }, true);
if (want(3)) await run('desktop 1280x720, /' + sub + '/', { w: 1280, h: 720, dpr: 1, mobile: false, root: path.dirname(ROOT), url: sub + '/listen/index.html' }, false);
if (want(4)) await run('phone 390x844, /' + sub + '/', { w: 390, h: 844, dpr: 2, mobile: true, root: path.dirname(ROOT), url: sub + '/listen/index.html' }, true);
console.log(oks + '/' + (oks + fails) + ' checks passed');
process.exit(fails ? 1 : 0);
