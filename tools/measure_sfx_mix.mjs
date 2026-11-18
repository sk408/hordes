#!/usr/bin/env node
// HORDES — measure every sound effect and movie cue in the old and the new mix
// (R1 mix pass, 2026-11-18).
//
// Real Chrome (tools/browser.mjs, one headless instance) renders each sound
// alone, a busy fight (listen/sfx_scenes.js: minute 10 by the sound gates) and
// the worst case (the busy fight with every loud sound on one instant) through
// the REAL src/audio.js graph at default volumes into an OfflineAudioContext
// at 48 kHz, once per mix. For reference it also renders 16 s of the synth run
// song and of one recorded run loop (run_wilds, at its real MUSIC_TRIM_DB).
// It prints a table: peak dBFS, RMS dBFS while the sound plays, and the
// loudest 400 ms in LUFS. It writes nothing unless given --json <file>.
//
// Run: HORDES_CHROME="C:/Program Files/Google/Chrome/Application/chrome.exe" node tools/measure_sfx_mix.mjs [--json out.json]
import fs from 'node:fs';
import { withPage } from './browser.mjs';

const PAGE = '<!doctype html><meta charset="utf-8"><title>sfx mix</title><body>sfx mix probe</body>';

const SCRIPT = `(async () => {
  const A = await import('/src/audio.js');
  const S = await import('/listen/sfx_scenes.js');
  const out = { items: {}, fight: {}, worst: {}, music: {} };
  for (const g of S.GROUPS) for (const it of g.items) {
    const k = S.itemKey(it);
    out.items[k] = { group: g.id };
    for (const mix of ['old', 'new']) out.items[k][mix] = S.measure(await S.render(A, { item: it }, mix));
  }
  for (const mix of ['old', 'new']) {
    out.fight[mix] = S.measure(await S.render(A, { fight: true }, mix));
    out.worst[mix] = S.measure(await S.render(A, { worst: true }, mix));
  }
  // The music for reference: 16 s of the synth song from bar 41, and of run_wilds.
  const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
  for (const mix of ['old', 'new']) {
    let oc = new OfflineAudioContext(2, S.SR * 16.2, S.SR);
    A.AUDIO_TEST.setDeps({ AudioContext: function () { return oc; }, storage: mem() });
    A.AUDIO_TEST.reset(); A.init(); A.setMixMode(mix);
    let t = 0.05; const STEP = 60 / 132 / 4;
    for (let i = 0; t < 16.05; i++, t += STEP) A.AUDIO_TEST.scheduleStep(40 * 16 + i, t);
    out.music['synth ' + mix] = S.measure(await oc.startRendering());
    oc = new OfflineAudioContext(2, S.SR * 16.6, S.SR);
    A.AUDIO_TEST.setDeps({ AudioContext: function () { return oc; }, storage: mem() });
    A.AUDIO_TEST.reset(); A.init(); A.setMixMode(mix);
    const c = { scene: 'run', stage: 'VERDANT_HOLLOW', wave: 1, runNo: 1 };
    A.setMusicContext(c);
    const t0 = performance.now();
    while (!(A.AUDIO_TEST.music() && A.AUDIO_TEST.music().buffers.includes('run_wilds'))) {
      if (performance.now() - t0 > 20000) throw new Error('no decode');
      await new Promise((r) => setTimeout(r, 50));
      A.setMusicContext(c);
    }
    A.startMusic();
    out.music['run_wilds ' + mix] = S.measure(await oc.startRendering());
    A.stopMusic();
  }
  S.restore(A);
  return out;
})()`;

const arg = process.argv.indexOf('--json');
await withPage({ w: 390, h: 844, url: 'measure.html', extra: { '/measure.html': PAGE }, timeoutMs: 120000 }, async (page) => {
  const r = await page.evaluate(SCRIPT, true);
  if (arg > 0) fs.writeFileSync(process.argv[arg + 1], JSON.stringify(r, null, 1));
  const f = (x) => String(x.toFixed(1)).padStart(6);
  const row = (name, o, n) => '| ' + name.padEnd(22) + ' | ' + f(o.peakDb) + ' | ' + f(o.rmsDb) + ' | ' + f(o.momentaryLufs)
    + ' | ' + f(n.peakDb) + ' | ' + f(n.rmsDb) + ' | ' + f(n.momentaryLufs) + ' |';
  console.log('| sound                  | old pk | old rms | old M  | new pk | new rms | new M  |');
  console.log('|---|---|---|---|---|---|---|');
  let grp = '';
  for (const [k, v] of Object.entries(r.items)) {
    if (v.group !== grp) { grp = v.group; console.log('| **' + grp + '** | | | | | | |'); }
    console.log(row(k, v.old, v.new));
  }
  console.log(row('BUSY FIGHT (8 s)', r.fight.old, r.fight.new));
  console.log(row('WORST CASE', r.worst.old, r.worst.new));
  console.log('busy fight integrated: old ' + r.fight.old.lufs + ' LUFS, new ' + r.fight.new.lufs + ' LUFS');
  for (const [k, v] of Object.entries(r.music)) console.log('music ' + k + ': ' + v.lufs + ' LUFS, peak ' + v.peakDb + ' dBFS');
  if (page.errors && page.errors.length) console.log('page errors: ' + page.errors.join(' | '));
});
