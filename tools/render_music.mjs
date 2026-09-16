#!/usr/bin/env node
// HORDES — offline render of the WHOLE music cycle through the REAL synthesis
// path (2026-09-16 owner request: "longer music").
//
// Real Chrome (tools/browser.mjs over CDP) loads tools/render_music.html,
// which imports src/audio.js itself and drives the module's own scheduleStep
// against an injected OfflineAudioContext — the same tone()/noise() calls the
// live lookahead scheduler makes. This driver collects the raw float32 PCM,
// writes:
//   /tmp/hordes_music_full.wav  — the entire cycle (+ 50ms lead-in)
//   /tmp/hordes_music_30s.wav   — a 30s excerpt starting mid-cycle
// and measures the loop seam. The cycle length comes from the SAME constants
// the game uses (imported from src/audio.js), so a BPM or section change
// updates both the render and the game.
//
// Run: node tools/render_music.mjs
import http from 'node:http';
import fs from 'node:fs';
import { MUSIC } from '../src/audio.js';
import { withPage } from './browser.mjs';

const SR = 44100;
const LEAD = 0.05;                       // must match render_music.html
const OUT_FULL = '/tmp/hordes_music_full.wav';
const OUT_30 = '/tmp/hordes_music_30s.wav';
// Seam thresholds: the coda's final voices (bass at step 0/8, hat at 14, lead
// at 13) all decay to their 1e-4 envelope floor well inside the final bar, so
// the loop point must be near-silent. 1e-3 peak in the final 20 ms is -60
// dBFS — far below anything audible; a click would sit orders above it.
const SEAM_WINDOW_S = 0.02;
const SEAM_MAX_TAIL = 1e-3;

// 16-bit PCM mono WAV.
function wav16(f32, sr) {
  const n = f32.length;
  const out = Buffer.alloc(44 + n * 2);
  out.write('RIFF', 0); out.writeUInt32LE(36 + n * 2, 4); out.write('WAVE', 8);
  out.write('fmt ', 12); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20);
  out.writeUInt16LE(1, 22); out.writeUInt32LE(sr, 24); out.writeUInt32LE(sr * 2, 28);
  out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34);
  out.write('data', 36); out.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, f32[i]));
    out.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  return out;
}

const chunks = [];
const sink = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const parts = [];
  req.on('data', d => parts.push(d));
  req.on('end', () => { chunks.push(Buffer.concat(parts)); res.writeHead(200); res.end('ok'); });
});
await new Promise(r => sink.listen(0, '127.0.0.1', r));
const sinkPort = sink.address().port;

let info;
try {
  await withPage({
    w: 480, h: 300, mobile: false, url: 'tools/render_music.html',
    skipTour: false, timeoutMs: 180000,
    startupScript: `window.SINK_URL = 'http://127.0.0.1:${sinkPort}/sink';`,
  }, async (page) => {
    if (!await page.waitFor('window.__RENDER_DONE', 170000)) {
      throw new Error('render never finished; page errors: ' + JSON.stringify(page.errors));
    }
    info = await page.evaluate('window.__RENDER_DONE');
    if (page.errors.length) console.error('page warnings:', page.errors);
  });
} finally {
  sink.close();
}

const raw = Buffer.concat(chunks);
const f32 = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
const cycle = MUSIC.SONG.cycleSeconds;
if (info.samples !== f32.length) throw new Error(`sample count mismatch: page ${info.samples} vs sink ${f32.length}`);

fs.writeFileSync(OUT_FULL, wav16(f32, SR));
const midStart = Math.floor((LEAD + cycle / 2) * SR);          // mid-cycle
const excerpt = f32.subarray(midStart, midStart + 30 * SR);
fs.writeFileSync(OUT_30, wav16(excerpt, SR));

// ---- seam measurement (raw) ----
const seam = Math.floor((LEAD + cycle) * SR);                  // loop point
const win = Math.floor(SEAM_WINDOW_S * SR);
let tailMax = 0, tailRms = 0, headRms = 0, peak = 0, wrapDelta = 0, seamGradMax = 0;
for (let i = seam - win; i < seam; i++) {
  const a = Math.abs(f32[i]); if (a > tailMax) tailMax = a;
  tailRms += f32[i] * f32[i];
}
tailRms = Math.sqrt(tailRms / win);
wrapDelta = Math.abs(f32[seam] - f32[seam - 1]);               // across the wrap
for (let i = seam - win; i < seam + win - 1; i++) {
  const d = Math.abs(f32[i + 1] - f32[i]); if (d > seamGradMax) seamGradMax = d;
}
const headStart = Math.floor(LEAD * SR);                       // bar 1 head
for (let i = headStart; i < headStart + win; i++) headRms += f32[i] * f32[i];
headRms = Math.sqrt(headRms / win);
for (let i = 0; i < f32.length; i++) { const a = Math.abs(f32[i]); if (a > peak) peak = a; }

const seamOk = tailMax < SEAM_MAX_TAIL;
console.log(`render: ${info.samples} samples @ ${SR}Hz = ${(info.samples / SR).toFixed(2)}s (cycle ${(cycle).toFixed(2)}s)`);
console.log(`wrote ${OUT_FULL} (${(fs.statSync(OUT_FULL).size / 1e6).toFixed(1)} MB)`);
console.log(`wrote ${OUT_30} (30.00s from mid-cycle t=${(cycle / 2).toFixed(1)}s, ${(fs.statSync(OUT_30).size / 1e6).toFixed(1)} MB)`);
console.log(`seam @ t=${(LEAD + cycle).toFixed(3)}s: tail-${SEAM_WINDOW_S * 1000}ms max|x|=${tailMax.toExponential(3)} tailRMS=${tailRms.toExponential(3)} headRMS=${headRms.toExponential(3)} wrapDelta=${wrapDelta.toExponential(3)} seamGradientMax=${seamGradMax.toExponential(3)} (cyclePeak=${peak.toFixed(4)})`);
console.log(`seam verdict: ${seamOk ? 'CLEAN' : 'CLICK'} (threshold max|x| tail < ${SEAM_MAX_TAIL})`);
if (!seamOk) process.exit(1);
