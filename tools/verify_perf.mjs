// HORDES - tools/verify_perf.mjs (E2 R10: THE PERF GATE - a PERMANENT tool).
// A real wall-clock frame-cost measurement in a REAL browser on the VPS:
// update+render milliseconds per frame (p50 / p95 / max) at the WAVE-2 HORDE
// PEAK. Spawn/entity-count changes recur; this is the gate that keeps them
// honest. It takes a BEFORE/AFTER label so a slice can pin its own delta.
//
// Method (each choice stated, none hidden):
//   * REAL Chrome (tools/browser.mjs), phone viewport 390x844 @dpr3, the game
//     booted through its OWN title and a REAL tap on START GAME; all TOUR_KEYS
//     set and state.time > 1.0 ASSERTED before any measurement (a paused game
//     measures as 0ms frames - the tick-38 lesson).
//   * window.requestAnimationFrame is wrapped BEFORE page scripts run, so
//     every game frame is timed callback-in to callback-out. That is the
//     update+render cost; the rAF PERIOD would measure the display cadence,
//     not the game. Headless rAF fires at ~60Hz, so a 120Hz PERIOD cannot be
//     measured in this harness - frame COST is cadence-independent, and the
//     table reads it against BOTH budgets (16.67ms / 8.33ms).
//   * The peak scene: the run is put at the wave-2 spawn density (state.time
//     forced just past the wave-1 boundary, boss/herald seams disabled, XP
//     pinned so no draft overlay pauses the field) and left to play for
//     --seconds while the AUTO pilot fights. Frame samples are attributed to
//     the 2s window around the PEAK live-enemy count - "the horde peak", not
//     an average of quiet frames.
//   * The VPS is the FLOOR (owner: if it holds 120Hz here it holds anywhere):
//     no GPU, software raster, and the box may be CONTENDED - so the node's
//     own loadavg is printed beside every table. A number without its load
//     is not evidence.
//
// Run: node tools/verify_perf.mjs [--label before] [--seconds 14] [--wave 2]
// Exit 1 if p95 at the peak exceeds the 60Hz budget (the gate), else 0.
import { withPage } from './browser.mjs';
import os from 'node:os';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const LABEL = opt('label', 'run');
const SECONDS = Number(opt('seconds', 14));
const WAVE = Number(opt('wave', 2));

const TOUR19 = ['stage1', 'hud', 'pilot', 'focus', 'stance', 'move', 'skills', 'potions',
  'stats', 'cog', 'draft', 'edge', 'chest', 'portal', 'arch', 'shrine',
  'intermission', 'death', 'settings'];

const pct = (sorted, q) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0;

const out = await withPage({ w: 390, h: 844, dpr: 3,
  startupScript:
    "try { localStorage.setItem('hordes_onboarded', '1'); } catch (e) {}\n" +
    'for (const k of ' + JSON.stringify(TOUR19) + ") { try { localStorage.setItem('hordes_tour_' + k, '1'); } catch (e) {} }\n" +
    // THE MEASUREMENT: time every game frame, callback-in to callback-out.
    // Installed before page scripts so main.js's frame() is always wrapped.
    `window.__ft = [];
     (() => { const orig = window.requestAnimationFrame.bind(window);
       window.requestAnimationFrame = (cb) => orig((t) => {
         const a = performance.now(); cb(t);
         window.__ft.push(performance.now() - a);
       }); })();` },
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
    if (!(playing && advancing)) throw new Error('the game did not start or the clock is frozen - refusing to measure');

    // The horde-peak scene: wave-N spawn density, no boss interrupt, no draft
    // pause, and a pilot strong enough to hold the field (not to clear it) so
    // the body count climbs to its natural peak.
    await p.evaluate(`(async () => {
      const T = (await import('./src/main.js')).__TEST;
      const st = T.state;
      st.time = ${(WAVE - 1) * 120 + 10};
      st.wave.num = ${WAVE};
      st.wave.endsAt = st.time + 1e9;
      st.wave.midBossDone = true;
      const p0 = st.player;
      Object.assign(p0.stats, { damage: 40, cooldown: 0.3, speed: 90, pickup: 40,
        projectiles: 3, maxHp: 1e6, pierce: 1 });
      p0.hp = 1e6; p0.xpNext = 1e12;
      for (const w of st.weapons) w.level = 4;
      window.__ft.length = 0;
    })()`);

    // Observe: sample frame costs + live bodies; keep the 2s around the peak.
    const samples = await p.evaluate(`(async () => {
      const st = (await import('./src/main.js')).__TEST.state;
      const out = [];
      for (let i = 0; i < ${SECONDS} * 5; i++) {
        await new Promise(r => setTimeout(r, 200));
        const ft = window.__ft.splice(0);
        out.push({ t: st.time, enemies: st.enemies.filter(e => e.hp > 0).length,
          frames: ft, mode: st.mode });
      }
      return out;
    })()`, true);

    let peak = { enemies: -1, idx: 0 };
    samples.forEach((s, i) => { if (s.enemies > peak.enemies) peak = { enemies: s.enemies, idx: i }; });
    const peakWindow = samples.slice(Math.max(0, peak.idx - 5), peak.idx + 6)
      .flatMap(s => s.frames).sort((a, b) => a - b);
    const all = samples.flatMap(s => s.frames).sort((a, b) => a - b);
    const over = (arr, ms) => arr.filter(v => v > ms).length;
    const row = (name, arr) => '  ' + name.padEnd(16) +
      ' p50 ' + pct(arr, 0.5).toFixed(2).padStart(6) + 'ms' +
      '  p95 ' + pct(arr, 0.95).toFixed(2).padStart(6) + 'ms' +
      '  max ' + (arr.length ? arr[arr.length - 1].toFixed(2) : '0').padStart(6) + 'ms' +
      '  n=' + arr.length +
      '  >16.67ms: ' + (100 * over(arr, 16.67) / (arr.length || 1)).toFixed(1) + '%' +
      '  >8.33ms: ' + (100 * over(arr, 8.33) / (arr.length || 1)).toFixed(1) + '%';

    const load = os.loadavg();
    console.log('PERF [' + LABEL + '] wave-' + WAVE + ' horde peak on the VPS floor (390x844 @dpr3, real Chrome)');
    console.log('  loadavg ' + load.map(v => v.toFixed(2)).join(' / ') + ' (label every number with its load)');
    console.log('  peak live enemies: ' + peak.enemies + ' at t=' + samples[peak.idx].t.toFixed(1) +
      's (mode ' + samples[peak.idx].mode + ')');
    console.log(row('PEAK WINDOW', peakWindow));
    console.log(row('FULL WINDOW', all));
    console.log('JSON ' + JSON.stringify({ label: LABEL, wave: WAVE, load: load.map(v => +v.toFixed(2)),
      peakEnemies: peak.enemies,
      peak: { p50: +pct(peakWindow, 0.5).toFixed(2), p95: +pct(peakWindow, 0.95).toFixed(2),
        max: +(peakWindow.length ? peakWindow[peakWindow.length - 1] : 0).toFixed(2), n: peakWindow.length },
      full: { p50: +pct(all, 0.5).toFixed(2), p95: +pct(all, 0.95).toFixed(2),
        max: +(all.length ? all[all.length - 1] : 0).toFixed(2), n: all.length } }));
    return pct(peakWindow, 0.95);
  });

const BUDGET_60 = 16.67;
console.log('GATE: peak p95 ' + out.toFixed(2) + 'ms vs the 60Hz budget ' + BUDGET_60 + 'ms' +
  (out <= BUDGET_60 ? ' - PASS' : ' - FAIL'));
process.exit(out <= BUDGET_60 ? 0 : 1);
