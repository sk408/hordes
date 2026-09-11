// HORDES — WAVE-20 boss-balance batch sim. Runs N full runs of the REAL
// game loop headless (smoke.mjs's DOM-shim pattern: rafQueue pumping +
// overlay auto-play), records WHERE each run died via state.deathBy (the
// WAVE-20 death-cause stamp), and prints a per-wave death-cause table.
//
// Targets (Sk408 spec): out of each 10-run cohort, the wave-N HERALD should
// claim 1-3 runs and the wave-N END BOSS 5-8 — a ladder of checkpoints the
// player climbs as the profile grows.
//
// Usage: node tools/boss_sim.mjs [--runs N] [--max-seconds S]
import { CONFIG as CFG } from '../src/config.js';

const args = process.argv.slice(2);
const argOf = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? Number(args[i + 1]) : dflt;
};
const RUNS = argOf('--runs', 20);
const MAX_SECONDS = argOf('--max-seconds', 14 * 60);   // hard cap per run
// --profile partial: simulate an EARLY-SHOPPER save (~2200g spent: ORBIT+ZAP
// bought, Forged Edge 2, Vitality 3) so the fresh-vs-partial death-wave gap
// — the progression curve the DIFFICULTY doc asks to be measured — is visible.
const PARTIAL = args.includes('--profile') && args[args.indexOf('--profile') + 1] === 'partial';

// ---- DOM shims (smoke.mjs pattern, trimmed to what main.js touches) -------
const noop = () => {};
const fakeCtx = new Proxy({}, {
  get(t, prop) {
    if (prop === 'fillStyle' || prop === 'globalAlpha') return undefined;
    return typeof prop === 'string' ? noop : undefined;
  },
  set() { return true; },
});
const fakeCanvas = { width: 0, height: 0, getContext: () => fakeCtx, createElement: () => fakeEl() };
const fakeEl = () => {
  const el = {
    textContent: '', style: {}, children: [], onclick: null,
    click() { if (this.onclick) this.onclick(); },
    addEventListener() {},
  };
  Object.defineProperty(el, 'innerHTML', {
    get() { return this._html ?? ''; },
    set(v) { this._html = v; if (v === '') el.children.length = 0; },
  });
  el.appendChild = (child) => { el.children.push(child); };
  return el;
};
const elements = {};
globalThis.document = {
  getElementById: (id) => elements[id] ?? (elements[id] = id === 'game' ? { ...fakeCanvas, getContext: () => fakeCtx } : fakeEl()),
  createElement: () => fakeEl(),
};
let keyHandler = null;
globalThis.window = { addEventListener: (ev, cb) => { if (ev === 'keydown') keyHandler = cb; } };
let now = 0;
globalThis.performance = { now: () => now };
const rafQueue = [];
globalThis.requestAnimationFrame = (cb) => { rafQueue.push(cb); return rafQueue.length; };
globalThis.location = { reload: noop };
const lsBack = new Map([['hordes_onboarded', '1']]);   // skip first-boot overlay
// WAVE-21: tour flags preseeded — no stage-2 coachmark may pause the sim
// mid-cohort (tour covered by test_tour.mjs).
import { TOUR_KEYS } from '../src/tour.js';
for (const k of Object.values(TOUR_KEYS)) lsBack.set(k, '1');
if (PARTIAL) {
  lsBack.set('hordes_profile_v1', JSON.stringify({
    gold: 0,
    purchased: { dmg: 2, hp: 3 },                        // ~610g stat lines
    unlockedWeapons: ['VOLLEY', 'BOOMERANG', 'ORBIT', 'ZAP'], // ~1200g
    unlockedCharacters: ['KNIGHT'],
    equippedCharacter: 'KNIGHT',
    unlockedElites: [],
  }));
}
globalThis.localStorage = {
  getItem: (k) => (lsBack.has(k) ? lsBack.get(k) : null),
  setItem: (k, v) => { lsBack.set(k, String(v)); },
  removeItem: (k) => { lsBack.delete(k); },
};

const mainMod = await import('../src/main.js');
const st = mainMod.__TEST.state;
const dtMs = 1000 / 60;

// The intermission CONTINUE card advances the wave; death screens end a run.
const cards = () => elements['ov-cards'] ? elements['ov-cards'].children : [];
const cardTitled = (t) => cards().find(c => (c.innerHTML || '').includes(t));
const overlayUp = () => {
  const ov = elements['overlay'];
  return ov && ov.style.display === 'flex';
};

// One frame of the real loop + overlay auto-play. Returns 'dead' when the
// run ended this frame (state.deathBy is already stamped by die()).
function frame() {
  now += dtMs;
  const cb = rafQueue.shift();
  if (!cb) throw new Error('raf died');
  cb(now);
  if (st.mode === 'dead') return 'dead';
  if (overlayUp() && cards().length > 0 && keyHandler) {
    // Draft/evolve: prefer NEW WEAPON, else card 1 (smoke's policy).
    if (st.mode === 'draft' || st.mode === 'evolve') {
      let key = '1';
      for (const c of cards()) {
        const html = c.innerHTML || '';
        if (html.includes('NEW WEAPON')) { key = String(cards().indexOf(c) + 1); break; }
      }
      keyHandler({ key });
      return;
    }
    // Intermission: CONTINUE into the next wave (skip paid chests/choices).
    const cont = cardTitled('CONTINUE');
    if (cont) { cont.click(); return; }
    // Menus at boot etc.: PLAY if present, else dismiss with '1'.
    const play = cardTitled('PLAY');
    if (play) { play.click(); return; }
    keyHandler({ key: '1' });
  }
  return 'playing';
}

// Death-cause classification for the report.
function classify(d) {
  if (!d) return 'unknown';
  if (d.midBoss) return 'HERALD';
  if (d.bossId) return 'ENDBOSS:' + d.bossId;
  if (d.typeId === 'PILLAR') return 'PILLAR';
  if (d.cause === 'shot') return 'shot:' + d.typeId;
  if (d.cause === 'drain') return 'drain';
  return 'contact:' + d.typeId;
}

const runs = [];
for (let r = 1; r <= RUNS; r++) {
  mainMod.__TEST.startRun();
  let ended = null;
  const capFrames = (MAX_SECONDS * 60) | 0;
  for (let i = 0; i < capFrames; i++) {
    if (frame() === 'dead') { ended = st.deathBy; break; }
  }
  const rec = ended
    ? { wave: ended.wave ?? st.wave.num, time: Math.floor(ended.time ?? st.time),
        cause: classify(ended), killer: ended.name || ended.typeId || '?' }
    : { wave: st.wave.num, time: Math.floor(st.time), cause: 'SURVIVED', killer: '-' };
  runs.push(rec);
  console.log(`run ${String(r).padStart(2)}: wave ${rec.wave} @ ${rec.time}s — ${rec.cause}${rec.killer !== '-' ? ' (' + rec.killer + ')' : ''}`);
}

// ---- report: deaths per wave x cause ---------------------------------------
const byWave = new Map();
for (const rec of runs) {
  const key = rec.cause === 'SURVIVED' ? 'survived' : rec.cause;
  const w = byWave.get(rec.wave) || {};
  w[key] = (w[key] || 0) + 1;
  byWave.set(rec.wave, w);
}
console.log('\n=== DEATHS BY WAVE x CAUSE (cohort of ' + RUNS + (PARTIAL ? ', PARTIAL save' : ', FRESH save') + ') ===');
console.log('target: HERALD 1-3 and ENDBOSS 5-8 per 10 runs of each wave');
for (const w of [...byWave.keys()].sort((a, b) => a - b)) {
  const counts = byWave.get(w);
  const parts = Object.entries(counts).map(([k, v]) => `${k}:${v}`).join('  ');
  console.log(`wave ${w}: ${parts}`);
}
const totalWaves = runs.map(r => r.wave);
const clear1 = runs.filter(r => r.wave > 1).length;
console.log(`\nwave-1 clear rate: ${clear1}/${RUNS} · deepest wave reached: ${Math.max(...totalWaves)}`);
const avg = (runs.reduce((s, r) => s + r.time, 0) / runs.length).toFixed(0);
console.log(`mean survival: ${avg}s (WAVE_LENGTH=${CFG.ESCALATION.WAVE_LENGTH}s, MIDBOSS at ${CFG.ESCALATION.WAVE_LENGTH * (1 - CFG.ESCALATION.MIDBOSS.AT_FRACTION)}s)`);
