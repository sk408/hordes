// A whole run in real Chrome, end to end: the first boss, the escape
// cinematic, boss rules, travel after waves 2 and 4, the maw and beyond.
// The hero is kept alive so the run reaches the late screens; every overlay
// is answered the way a player would (first card, CONTINUE, GOT IT).
//   HORDES_CHROME=<chrome.exe> node tools/soak_run.mjs [outDir] [--minutes 14] [--stay] [--vp phone]
// Prints the run's timeline (mode changes, waves, stages, rules) and any
// console error, and writes a screenshot at each wave start.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const flag = (name, dflt) => { const i = argv.indexOf(name); return i >= 0 ? (argv.splice(i, 2)[1] ?? true) : dflt; };
const minutes = Number(flag('--minutes', 14));
const vpName = flag('--vp', 'desktop');
const stay = argv.includes('--stay') ? (argv.splice(argv.indexOf('--stay'), 1), true) : false;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.resolve(argv[0] || path.join(ROOT, 'docs/art/soak'));
fs.mkdirSync(outDir, { recursive: true });
process.env.HORDES_SHOT_DIR = outDir;
const { withPage } = await import('./browser.mjs');

const STARTUP = `
(() => {
  let s = 20261003;
  Math.random = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  let now = 1000; const q = [];
  performance.now = () => now;
  window.requestAnimationFrame = (cb) => { q.push(cb); return q.length; };
  window.__pump = (n) => { for (let i = 0; i < n; i++) { now += 1000 / 60; const cb = q.shift(); if (!cb) return i; cb(now); } return n; };
  try { localStorage.setItem('hordes_onboarded', '1'); } catch (e) {}
  for (const k of ['stage1','hud','pilot','focus','stance','move','skills','radar','map','zoom','draft','shop','chest','portal','arch','shrine','potion','elite','boss']) {
    try { localStorage.setItem('hordes_tour_' + k, '1'); } catch (e) {}
  }
})();`;

const BOOT = `(async () => {
  const m = await import('/src/main.js');
  const T = m.__TEST; window.T = T;
  window.__log = []; window.__last = '';
  window.__pump(5);
  T.startRun();
  window.__pump(2);
  // The guided first run is skipped with its own two presses.
  if (T.tut.live) { window.__pump(40); T.tut.skip(performance.now()); T.tut.skip(performance.now()); window.__pump(2); }
  return { mode: T.state.mode, guided: T.tut.live, pilot: T.state.pilotMode };
})()`;

// Pump `frames` frames, answering every overlay. Returns what happened.
const STEP = (frames, stayHere) => `(() => {
  const T = window.T, S = T.state, L = window.__log;
  const note = (m) => { if (m !== window.__last) { window.__last = m; L.push('[' + Math.floor(S.time / 60) + ':' + String(Math.floor(S.time % 60)).padStart(2, '0') + '] ' + m); } };
  const card = (re) => [...document.querySelectorAll('#ov-cards .card')].find(c => re.test(c.textContent || ''));
  let idle = 0;
  for (let i = 0; i < ${frames}; i++) {
    const n = window.__pump(1);
    if (n === 0) { note('NO FRAME (the loop stopped)'); break; }
    const p = S.player;
    if (p && p.stats && S.mode !== 'dead') p.hp = p.stats.maxHp;
    const tag = S.mode + ' w' + S.wave.num + ' ' + S.stage + (S.bossRule ? ' rule:' + S.bossRule.id + (S.bossRule.live ? '(live)' : '') : '');
    note(tag);
    const hint = document.querySelector('.tut-btn');
    if (T.tut.model && hint && hint.offsetParent !== null && i % 30 === 29) { hint.dispatchEvent(new PointerEvent('pointerdown')); hint.click(); }
    if (S.mode === 'playing' || S.mode === 'finale' || S.mode === 'escape' || S.mode === 'portal-cine') { idle = 0; continue; }
    idle++;
    if (idle % 45 !== 44) continue;   // give each screen most of a second, like a person
    if (S.mode === 'intermission') {
      const c = ${stayHere ? `card(/STAY HERE/) || ` : ''}card(/CONTINUE/);
      if (c) { note('press: ' + (c.querySelector('.name') || c).textContent + ' - ' + (c.querySelector('.desc') || c).textContent.slice(0, 70)); c.click(); }
    } else if (S.mode === 'dead' || S.mode === 'won') { break; }
    else {
      const c = document.querySelector('#ov-cards .card');
      if (c) c.click(); else window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    }
  }
  const out = L.splice(0);
  return { log: out, t: S.time, mode: S.mode, wave: S.wave.num, stage: S.stage, seen: S.stagesSeen, level: S.player.level,
    enemies: S.enemies.length, quests: (S.quests || []).map(q => q.id + (q.done ? ':done' : q.closed ? ':closed' : '')) };
})()`;

const VPS = {
  desktop: { name: 'desktop', w: 1280, h: 720, dpr: 1, mobile: false },
  phone: { name: 'phone', w: 844, h: 390, dpr: 2, mobile: true },
};
const vp = VPS[vpName] || VPS.desktop;

await withPage({ ...vp, startupScript: STARTUP, timeoutMs: 120000 }, async (page) => {
  await page.sleep(400);
  console.log('boot:', JSON.stringify(await page.evaluate(BOOT, true)));
  let lastWave = 0, shots = 0;
  const t0 = Date.now();
  for (let chunk = 0; chunk < 400; chunk++) {
    const r = await page.evaluate(STEP(600, stay));
    for (const line of r.log) console.log(line);
    if (r.wave !== lastWave && r.mode === 'playing') {
      lastWave = r.wave;
      await page.shot(`soak-${vp.name}-wave${String(r.wave).padStart(2, '0')}-${String(r.stage).toLowerCase()}`);
      shots++;
    }
    if (page.errors.length) { console.log('ERRORS:', JSON.stringify(page.errors.slice(0, 8))); break; }
    if (r.mode === 'dead' || r.mode === 'won' || r.t >= minutes * 60) {
      console.log('end:', JSON.stringify({ t: Math.round(r.t), mode: r.mode, wave: r.wave, stage: r.stage, seen: r.seen, level: r.level, quests: r.quests }));
      break;
    }
  }
  await page.shot(`soak-${vp.name}-end`);
  console.log('errors:', page.errors.length, 'shots:', shots + 1, 'wall s:', Math.round((Date.now() - t0) / 1000));
});
console.log('wrote', outDir);
