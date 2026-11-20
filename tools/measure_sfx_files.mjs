#!/usr/bin/env node
// HORDES: measure the recorded sound-effect candidates (R4, assets/sfx/) against the synth,
// in real Chrome, on the listening page (listen/index.html), phone sized (390x844).
//   - fetch + decode every file one at a time (the game's loader does the same): time, bytes,
//     decoded memory, and the silence each mp3 decodes with before its sound starts;
//   - each slot alone: the synth against every candidate (loudest 400 ms, LUFS);
//   - the busy fight (listen/sfx_scenes.js, minute 10 by the sound gates) with SYNTH and with
//     RECORDED (the picks of src/sfx_files.js), and with each candidate alone in its slot:
//     the busiest second (LUFS) and the peak (dBFS, 0 is clipping); the worst case too;
//   - presses the page's pick buttons for real (taps) and reads the picks line back;
//   - console errors. Writes a phone screenshot of the pick section (shot sfx_pick_phone).
// Run (through the lock): HORDES_CHROME=... node tools/measure_sfx_files.mjs [--json out.json] [--desktop]
import fs from 'node:fs';
import { withPage } from './browser.mjs';
import { verdict } from './sfx_files_verdict.mjs';

const desktop = process.argv.includes('--desktop');
const SCRIPT = `(async () => {
  const A = window.__aud.A;
  const S = await import('./listen/sfx_scenes.js');
  const F = await import('./src/sfx_files.js');
  const buffers = window.__aud.rec.buffers;
  const out = { load: window.__aud.recLoad, lead: {}, alone: {}, fight: {}, worst: {}, slots: {} };
  for (const [u, b] of buffers) {
    const d = b.getChannelData(0); let pk = 0; for (const v of d) pk = Math.max(pk, Math.abs(v));
    let i = 0; while (i < d.length && Math.abs(d[i]) < pk * 0.05) i++;
    out.lead[u.split('/').pop()] = Math.round(i / b.sampleRate * 10000) / 10;
  }
  const m = async (job) => S.measure(await S.render(A, job, 'new'));
  for (const s of S.PICK_SLOTS) {
    const cands = F.SFX_CANDIDATES[s.slot];
    const n = Math.max(...cands.map((c) => c.files.length));
    const r = { synth: (await m({ variations: { slot: s.slot, n } })).momentaryLufs, cands: {} };
    const sceneJob = (sfx) => s.scene === 'menu' ? { menu: true, sfx } : { fight: true, sfx };
    const sc = await m(sceneJob(null));
    r.sceneSynth = sc.busiestSecondLufs; r.scenePeakSynth = sc.peakDb;
    for (const c of cands) {
      const sfx = { sets: { [s.slot]: c.files }, buffers };
      const a = await m({ variations: { slot: s.slot, n: c.files.length }, sfx });
      const f = await m(sceneJob(sfx));
      r.cands[c.id] = { alone: a.momentaryLufs, scene: f.busiestSecondLufs, scenePeak: f.peakDb };
    }
    out.slots[s.slot] = r;
  }
  const picks = { sets: F.pickedSets(), buffers };
  out.fight.synth = await m({ fight: true });
  out.fight.recorded = await m({ fight: true, sfx: picks });
  out.fight.synthMeaning = await m({ fight: true, meaning: true });
  out.fight.recordedMeaning = await m({ fight: true, meaning: true, sfx: picks });
  out.worst.synth = await m({ worst: true });
  out.worst.recorded = await m({ worst: true, sfx: picks });
  S.restore(A);
  return out;
})()`;

const arg = process.argv.indexOf('--json');
const size = desktop ? { w: 1280, h: 720 } : { w: 390, h: 844 };
await withPage({ ...size, url: 'listen/index.html', timeoutMs: 170000 }, async (page) => {
  await page.waitFor('window.__aud && window.__aud.ready && window.__aud.recLoad', 120000);
  // Real presses: pick B for the hit, Keep synth for the kill, then read the line.
  const press = async (sel) => {
    const r = await page.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.scrollIntoView({ block: 'center' });
      const b = e.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; })()`);
    await page.sleep(80);
    if (desktop) await page.click(r[0], r[1]); else await page.tap(r[0], r[1], 1);
  };
  await press('button.pick[data-slot="hit"][data-id="woodtap"]');
  await press('button.pick[data-slot="kill"][data-id="synth"]');
  await press('.pk[data-slot="gem"] .row:nth-of-type(1) button:nth-of-type(2)');   // Alone: candidate A
  await page.waitFor('window.__aud.played.length >= 1', 20000);
  await press('.pk[data-slot="uiMove"] .row:nth-of-type(2) button:nth-of-type(2)'); // In the menus: candidate A
  await page.waitFor('window.__aud.played.length >= 2', 20000);
  const ui = await page.evaluate(`({ line: document.getElementById('pickText').textContent,
    stored: localStorage.getItem('hordes_listen_sfx_picks'), game: localStorage.getItem('hordes_audio_sfx_src'),
    played: window.__aud.played.slice(), sideways: document.documentElement.scrollWidth > innerWidth })`);
  // COPY: copied to the clipboard, or (no clipboard here) the line is selected.
  await press('#copyPicks');
  await page.sleep(150);
  ui.copied = await page.evaluate(`document.getElementById('copied').textContent`);
  // Remembered: the same picks line after a reload.
  await page.reload();
  await page.waitFor('window.__aud && window.__aud.ready && window.__aud.recLoad', 120000);
  ui.lineAfterReload = await page.evaluate(`document.getElementById('pickText').textContent`);
  await press('.pk[data-slot="hit"]');
  await page.shot(desktop ? 'sfx_pick_desktop' : 'sfx_pick_phone');
  const r = await page.evaluate(SCRIPT, true);
  r.ui = ui; r.errors = page.errors || [];
  if (arg > 0) fs.writeFileSync(process.argv[arg + 1], JSON.stringify(r, null, 1));
  const L = r.load;
  console.log('load: ' + L.files + ' files, ' + (L.bytes / 1024).toFixed(1) + ' KB, fetch+decode ' + L.ms.toFixed(0) + ' ms (decode ' + L.decodeMs.toFixed(0)
    + ' ms), decoded ' + (L.decodedBytes / 1024).toFixed(0) + ' KB, failed ' + L.failed.length);
  const leads = Object.values(r.lead);
  console.log('lead-in before the sound: max ' + Math.max(...leads) + ' ms, mean ' + (leads.reduce((a, b) => a + b, 0) / leads.length).toFixed(1) + ' ms');
  for (const [slot, s] of Object.entries(r.slots)) {
    console.log(slot + ': synth alone ' + s.synth + ', scene ' + s.sceneSynth + ' / pk ' + s.scenePeakSynth);
    for (const [id, c] of Object.entries(s.cands)) console.log('   ' + id.padEnd(12) + ' alone ' + c.alone + '  scene ' + c.scene + ' (' + (c.scene - s.sceneSynth).toFixed(1) + ' dB)  pk ' + c.scenePeak);
  }
  const f = r.fight;
  console.log('BUSY FIGHT busiest second: synth ' + f.synth.busiestSecondLufs + ', recorded ' + f.recorded.busiestSecondLufs + ' (' + (f.recorded.busiestSecondLufs - f.synth.busiestSecondLufs).toFixed(2) + ' dB); peak ' + f.synth.peakDb + ' / ' + f.recorded.peakDb);
  console.log('  with the R4 cues: synth ' + f.synthMeaning.busiestSecondLufs + ', recorded ' + f.recordedMeaning.busiestSecondLufs + '; peak ' + f.synthMeaning.peakDb + ' / ' + f.recordedMeaning.peakDb);
  console.log('WORST CASE peak: synth ' + r.worst.synth.peakDb + ', recorded ' + r.worst.recorded.peakDb);
  console.log('page: ' + JSON.stringify(ui));
  console.log('console errors: ' + r.errors.length + (r.errors.length ? ' ' + r.errors.join(' | ') : ''));
  // The verdict: the rules of the task. Any FAIL line makes the exit code 1.
  const fails = verdict(r);
  for (const x of fails) console.log('FAIL ' + x);
  console.log(fails.length ? 'measure_sfx_files: ' + fails.length + ' FAIL' : 'measure_sfx_files: PASS');
  if (fails.length) process.exitCode = 1;
});

