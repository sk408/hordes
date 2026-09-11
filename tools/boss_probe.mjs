// HORDES — one-off probe: watch wave-1 GRAVELMAW fights in detail.
// Usage: node tools/boss_probe.mjs [--runs N]
import '../src/config.js';

const args = process.argv.slice(2);
const RUNS = args.includes('--runs') ? Number(args[args.indexOf('--runs') + 1]) : 24;
const WANT = 6;   // stop after this many observed wave-1 endboss fights

const noop = () => {};
const fakeCtx = new Proxy({}, {
  get(t, p) { return typeof p === 'string' ? noop : undefined; },
  set() { return true; },
});
const fakeEl = () => {
  const el = { textContent: '', style: {}, children: [], onclick: null,
    click() { if (this.onclick) this.onclick(); }, addEventListener() {} };
  Object.defineProperty(el, 'innerHTML', {
    get() { return this._html ?? ''; },
    set(v) { this._html = v; if (v === '') el.children.length = 0; },
  });
  el.appendChild = (c) => { el.children.push(c); };
  return el;
};
const elements = {};
globalThis.document = {
  getElementById: (id) => elements[id] ?? (elements[id] = id === 'game'
    ? { width: 0, height: 0, getContext: () => fakeCtx, createElement: () => fakeEl() }
    : fakeEl()),
  createElement: () => fakeEl(),
};
let keyHandler = null;
globalThis.window = { addEventListener: (ev, cb) => { if (ev === 'keydown') keyHandler = cb; } };
let now = 0;
globalThis.performance = { now: () => now };
const rafQueue = [];
globalThis.requestAnimationFrame = (cb) => { rafQueue.push(cb); return rafQueue.length; };
globalThis.location = { reload: noop };
const lsBack = new Map([['hordes_onboarded', '1']]);
import { TOUR_KEYS } from '../src/tour.js';
for (const k of Object.values(TOUR_KEYS)) lsBack.set(k, '1');
globalThis.localStorage = {
  getItem: (k) => (lsBack.has(k) ? lsBack.get(k) : null),
  setItem: (k, v) => lsBack.set(k, String(v)),
  removeItem: (k) => lsBack.delete(k),
};

const mainMod = await import('../src/main.js');
const st = mainMod.__TEST.state;
const dtMs = 1000 / 60;
const cards = () => elements['ov-cards'] ? elements['ov-cards'].children : [];
const cardTitled = (t) => cards().find(c => (c.innerHTML || '').includes(t));
const overlayUp = () => elements['overlay'] && elements['overlay'].style.display === 'flex';

function frame() {
  now += dtMs;
  const cb = rafQueue.shift();
  if (!cb) throw new Error('raf died');
  cb(now);
  if (st.mode === 'dead') return 'dead';
  if (overlayUp() && cards().length > 0 && keyHandler) {
    if (st.mode === 'draft' || st.mode === 'evolve') {
      let key = '1';
      for (const c of cards()) {
        if ((c.innerHTML || '').includes('NEW WEAPON')) { key = String(cards().indexOf(c) + 1); break; }
      }
      keyHandler({ key });
      return;
    }
    const cont = cardTitled('CONTINUE');
    if (cont) { cont.click(); return; }
    const play = cardTitled('PLAY');
    if (play) { play.click(); return; }
    keyHandler({ key: '1' });
  }
  return 'playing';
}

let fights = 0;
for (let r = 1; r <= RUNS && fights < WANT; r++) {
  mainMod.__TEST.startRun();
  let seen = false, logged = 0, fightT0 = null, hp0 = 0, phase = '';
  const cap = 420 * 60;
  for (let i = 0; i < cap; i++) {
    const bosses = st.wave.bosses || [];
    const b = bosses[0];
    if (!seen && bosses.length > 0 && st.wave.num === 1) {
      seen = true; fightT0 = st.time; hp0 = b.hp; phase = 'spawn';
      console.log(`\n--- run ${r}: endboss up at t=${st.time.toFixed(0)}s bossHp=${b.hp.toFixed(0)} playerHp=${st.player.hp.toFixed(0)} px=${st.player.x.toFixed(0)},${st.player.y.toFixed(0)} bx=${b.x.toFixed(0)},${b.y.toFixed(0)}`);
    }
    if (seen && bosses.length > 0 && i % 120 === 0) {   // every 2s
      const d = Math.hypot(b.x - st.player.x, b.y - st.player.y);
      const fight = (st.time - fightT0).toFixed(0);
      console.log(`  t+${fight}s bossHp=${b.hp.toFixed(0)}/${hp0.toFixed(0)} dist=${d.toFixed(0)} playerHp=${st.player.hp.toFixed(0)} enemies=${st.enemies.length} bossSpeed=${(b.speed || 0).toFixed(0)}`);
    }
    if (seen && bosses.length === 0) { console.log(`  boss DEAD at fight t+${(st.time - fightT0).toFixed(0)}s (player hp ${st.player.hp.toFixed(0)})`); fights++; break; }
    if (frame() === 'dead') {
      if (seen) { console.log(`  PLAYER DIED at fight t+${(st.time - fightT0).toFixed(0)}s — ${st.deathBy?.name || st.deathBy?.typeId} (${st.deathBy?.cause})`); fights++; }
      break;
    }
  }
  if (seen && fights < WANT && st.wave.bosses && st.wave.bosses.length > 0) console.log('  (run capped)');
}
console.log(`\nobserved ${fights} wave-1 endboss fights`);
