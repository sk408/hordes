#!/usr/bin/env node
// HORDES — measure the music's loudness at the game's output (2026-11-17).
//
// Real Chrome (tools/browser.mjs, one headless instance) renders, through the
// REAL src/audio.js graph at default volumes (music bus 0.5, master 0.15) into
// an OfflineAudioContext at 48 kHz:
//   - ~16 s windows of the synth run song (three places in the song) and of the
//     synth boss section, driven by audio.js's own scheduleStep/scheduleBossStep;
//   - ~16 s of each recorded loop in src/music_manifest.js, played by the real
//     recorded-music engine (fetch + decode + its source/gain/duck chain) with
//     MUSIC_TRIM_DB forced to 0.
// Each render is measured in-page as integrated loudness (ITU-R BS.1770
// K-weighting, 400 ms blocks, absolute and relative gates) plus RMS and peak.
// It prints the numbers and the trim that puts the recorded beds 3 dB above
// the synth run song (the spec, section 5). It writes nothing.
//
// Run: HORDES_CHROME="C:/Program Files/Google/Chrome/Application/chrome.exe" node tools/measure_music_loudness.mjs
import { withPage } from './browser.mjs';
import { MUSIC_TRACKS } from '../src/music_manifest.js';

const PAGE = '<!doctype html><meta charset="utf-8"><title>loudness</title><body>loudness probe</body>';
const SR = 48000;
const DUR = 16;

const SCRIPT = (slots) => `(async () => {
  const A = await import('/src/audio.js');
  const SR = ${SR}, DUR = ${DUR};
  // BS.1770 K-weighting at 48 kHz (two biquads), then gated block loudness.
  function biquad(x, b, a) {
    const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) {
      const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2;
      x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
    }
    return y;
  }
  function measure(buf, from) {
    const s0 = Math.floor(from * SR);
    const chans = [];
    let peak = 0, sq = 0, n = 0;
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const raw = buf.getChannelData(c).subarray(s0);
      for (let i = 0; i < raw.length; i++) { const v = raw[i]; sq += v * v; n++; const a = v < 0 ? -v : v; if (a > peak) peak = a; }
      const k1 = biquad(raw, [1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585]);
      chans.push(biquad(k1, [1, -2, 1], [1, -1.99004745483398, 0.99007225036621]));
    }
    const blk = Math.round(0.4 * SR), hop = Math.round(0.1 * SR);
    const z = [];
    for (let st = 0; st + blk <= chans[0].length; st += hop) {
      let e = 0;
      for (const ch of chans) { let s = 0; for (let i = st; i < st + blk; i++) s += ch[i] * ch[i]; e += s / blk; }
      z.push(e);
    }
    const L = (e) => -0.691 + 10 * Math.log10(e);
    let g = z.filter((e) => L(e) > -70);
    const rel = L(g.reduce((a, b) => a + b, 0) / Math.max(1, g.length)) - 10;
    g = g.filter((e) => L(e) > rel);
    const lufs = L(g.reduce((a, b) => a + b, 0) / Math.max(1, g.length));
    return { lufs: +lufs.toFixed(2), rmsDb: +(10 * Math.log10(sq / n)).toFixed(2), peakDb: +(20 * Math.log10(peak)).toFixed(2) };
  }
  function fresh(len) {
    const oc = new OfflineAudioContext(2, Math.round(SR * len), SR);
    A.AUDIO_TEST.reset();
    A.AUDIO_TEST.setDeps({ AudioContext: function () { return oc; }, trimDb: 0 });
    A.init();
    return oc;
  }
  const out = { synth: {}, rec: {} };
  const STEP = 60 / 132 / 4;
  for (const [name, bar, boss] of [['run_bar1', 0, false], ['run_bar41', 40, false], ['run_bar73', 72, false], ['boss', 0, true]]) {
    const oc = fresh(DUR + 0.2);
    let t = 0.05;
    for (let i = 0; t < DUR + 0.05; i++, t += STEP) (boss ? A.AUDIO_TEST.scheduleBossStep : A.AUDIO_TEST.scheduleStep)(bar * 16 + i, t);
    out.synth[name] = measure(await oc.startRendering(), 0.05);
  }
  for (const slot of ${JSON.stringify(slots)}) {
    const oc = fresh(DUR + 0.6);
    const boss = slot === 'boss' || slot === 'maw';
    const stage = { run_ash: 'ASHEN_WASTE', run_bone: 'BONE_DESERT', run_void: 'VOID_REACH' }[slot] || 'VERDANT_HOLLOW';
    const scene = slot === 'title' ? 'title' : slot === 'escape' ? 'escape' : 'run';
    A.setMusicContext({ scene, stage, wave: 1, runNo: 1, maw: slot === 'maw' });
    const t0 = performance.now();
    while (!(A.AUDIO_TEST.music() && A.AUDIO_TEST.music().buffers.includes(slot))) {
      if (performance.now() - t0 > 20000) throw new Error('no decode for ' + slot);
      await new Promise((r) => setTimeout(r, 50));
      A.setMusicContext({ scene, stage, wave: 1, runNo: 1, maw: slot === 'maw' });
    }
    if (boss) A.setMusicMode('boss');
    if (scene !== 'title') A.startMusic();
    const cur = A.AUDIO_TEST.music().cur;
    const buf = await oc.startRendering();
    A.stopMusic(); A.setMusicMode('run');
    out.rec[slot] = { ...measure(buf, 0.5), played: cur };
  }
  A.AUDIO_TEST.reset();
  return out;
})()`;

const loops = Object.keys(MUSIC_TRACKS).filter((s) => MUSIC_TRACKS[s].kind === 'loop');
await withPage({ w: 390, h: 844, url: 'measure.html', extra: { '/measure.html': PAGE }, timeoutMs: 60000 }, async (page) => {
  const r = await page.evaluate(SCRIPT(loops), true);
  const pow = (l) => Math.pow(10, l / 10);
  const runWins = ['run_bar1', 'run_bar41', 'run_bar73'].map((k) => r.synth[k].lufs);
  const synthRun = 10 * Math.log10(runWins.reduce((a, l) => a + pow(l), 0) / runWins.length);
  const recs = Object.values(r.rec).map((x) => x.lufs);
  const recMean = 10 * Math.log10(recs.reduce((a, l) => a + pow(l), 0) / recs.length);
  const trim = synthRun + 3 - recMean;
  console.log(JSON.stringify(r, null, 1));
  console.log('synth run song (energy mean of 3 windows): ' + synthRun.toFixed(2) + ' LUFS at the output');
  console.log('recorded loops at trim 0 (energy mean):    ' + recMean.toFixed(2) + ' LUFS at the output');
  for (const [s, x] of Object.entries(r.rec)) console.log('  ' + s.padEnd(10) + x.lufs.toFixed(2) + ' LUFS (' + (x.lufs - recMean).toFixed(2) + ' LU from the mean, played ' + x.played + ')');
  console.log('MUSIC_TRIM_DB for +3 dB over the synth: ' + trim.toFixed(1));
  if (page.errors && page.errors.length) console.log('page errors: ' + page.errors.join(' | '));
});
