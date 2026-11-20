// HORDES - R2 death movie ("the escape that fails") in a real headless Chrome.
// Three real deaths in a real fight, each with a non-Knight pilot: a contact
// kill, a shot from range, a boss. For each: the cast and the frozen frame the
// movie was handed, its sound cues, the skip by a real key, click or tap (the
// first plays out to the end card), 0 console errors. With --sheets it writes
// frame strips (12 frames at even steps, first and repeat viewing) drawn by
// the movie module from the movie record the game built; run once more with
// --root D:/hordes-claude --tag before for the old movie.
//   node tools/verify_r2_death.mjs
//   HORDES_SHOT_DIR=<dir> node tools/verify_r2_death.mjs --sheets --tag after
//   HORDES_SHOT_DIR=<dir> node tools/verify_r2_death.mjs --sheets --tag before --root D:\hordes-claude
import { withPage } from './browser.mjs';
import { TOUR_KEYS } from '../src/tour.js';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const SHEETS = argv.includes('--sheets');
const TAG = arg('--tag', 'after');
const ROOT = arg('--root', null);
const BEFORE = TAG === 'before';

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok });
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (detail !== undefined ? ' :: ' + JSON.stringify(detail) : ''));
};
const STARTUP = `try {
  localStorage.setItem('hordes_onboarded', '1');
  for (const k of ${JSON.stringify(Object.values(TOUR_KEYS))}) localStorage.setItem(k, '1');
} catch (e) {}`;

const HELPERS = `(async () => {
  const T = (await import('./src/main.js')).__TEST;
  const { makeTypedEnemy } = await import('./src/enemy_types.js');
  window.__T = T;
  window.__cues = [];
  const real = T.audio.get();
  if (real.playDeathCue) T.audio.set({ ...real, playDeathCue(ph) { window.__cues.push(ph); return real.playDeathCue(ph); } });
  window.__park = null;
  window.__ring = [];
  window.__hold = () => { for (const r of window.__ring) { r.e.x = r.x; r.e.y = r.y; r.e.vx = 0; r.e.vy = 0; r.e.attached = false; } };
  const loop = () => { if (window.__park) window.__park(); requestAnimationFrame(loop); };
  loop();
  // A fight: the pilot in a ring of the horde, nobody hurt, for a moment.
  window.__fight = (pilot, wave) => {
    T.getProfile().equippedCharacter = pilot;
    T.startRun();
    const s = T.state, p = s.player;
    s.spawnTimer = 1e9; s.wave.midAt = s.time + 1e9; s.wave.num = wave;
    s.wave.endsAt = s.time + 1e9;
    p.potions.hp = 0;
    // The ring is pinned where it was placed every frame: only the killer the
    // case places can reach the hero (a Tick in the ring latched on and drained
    // the last hit point once, named as the killer).
    const ring = [];
    // No Tick in the ring: a Tick drains the hero from 14 px whatever its attached flag says,
    // and the case's own killer nudges the hero toward the ring (about 1 run in 3 a ring Tick
    // took the last hit point and was named as the killer).
    const types = ['CHASER', 'SWARMER', 'CHASER', 'BRUTE', 'SWARMER', 'CHASER', 'SWARMER', 'CHASER', 'SWARMER', 'CHASER', 'BRUTE', 'CHASER'];
    types.forEach((id, i) => {
      const a = i / types.length * Math.PI * 2, r = 55 + (i % 3) * 22;
      const e = makeTypedEnemy(id, p.x + Math.cos(a) * r, p.y + Math.sin(a) * r * 0.8, s.time);
      e.hp = e.maxHp = 1e6; e.speed = 0;
      s.enemies.push(e);
      ring.push({ e, x: e.x, y: e.y });
    });
    window.__ring = ring;
    window.__park = () => { const st = T.state; if (st.mode === 'playing') { st.player.invuln = 1e6; window.__hold(); } };
    window.__killer = null;
  };
  // The killer joins the fight where it will kill from, a moment before.
  window.__place = (how) => {
    const s = T.state, p = s.player;
    if (how === 'boss') { window.__killer = (s.wave.bosses || []).find(e => e.hp > 0); }
    else {
      const k = makeTypedEnemy(how === 'shot' ? 'SPITTER' : 'CHASER', p.x + (how === 'shot' ? 120 : 9), p.y + (how === 'shot' ? -60 : 2), s.time);
      k.hp = k.maxHp = 1e6; s.enemies.push(k);
      window.__killer = k;
    }
    const k = window.__killer, dx = how === 'shot' ? 120 : how === 'boss' ? 12 : 9, dy = how === 'shot' ? -60 : 2;
    window.__park = () => { const st = T.state; if (st.mode !== 'playing') return; window.__hold(); k.speed = 0; k.x = p.x + dx; k.y = p.y + dy; if (!window.__armed) p.invuln = 1e6; };
    window.__armed = false;
  };
  window.__kill = (how) => {
    const s = T.state, p = s.player;
    window.__armed = true;
    p.hp = 1; p.invuln = 0;
    if (how === 'shot') {
      s.enemyShots.push({ x: p.x, y: p.y, vx: 0, vy: 0, damage: 999, age: 0, kind: 'spit',
        src: { typeId: 'SPITTER', bossId: null, name: null, midBoss: false }, from: window.__killer });
    }
  };
  return true;
})()`;

const mode = `window.__T.state.mode`;
const ask = `(window.__T.movies.current ? window.__T.movies.current.skip.ask : -1)`;
const toCss = (vx, vy) => `(() => { const r = document.getElementById('game').getBoundingClientRect();
  return [r.left + ${vx} / 480 * r.width, r.top + ${vy} / 300 * r.height]; })()`;

async function press(pg, how, vx, vy, k) {
  if (how === 'key') return pg.key(k);
  const [x, y] = await pg.evaluate(toCss(vx, vy));
  return how === 'tap' ? pg.tap(x, y, 1) : pg.click(x, y);
}

// Frame strips straight from the movie module, from the record the game built.
async function strip(pg, name, label, repeat) {
  const ok = await pg.evaluate(`(async () => {
    const D = await import('./src/death_cine.js');
    const m = window.__T.movies.current;
    const opts = { ...m.opts, repeat: ${repeat} };
    const cause = window.__T.state.deathBy ? window.__T.state.deathBy.cause : 'unknown';
    const dur = D.durationOf ? D.durationOf(opts) : D.CINE_DURATION;
    const vw = innerWidth, vh = innerHeight, cols = vw > vh ? 4 : 2, n = 12, rows = Math.ceil(n / cols);
    const head = 28, pad = 4;
    const fw = Math.floor((vw - pad * (cols + 1)) / cols);
    let fh = Math.floor(fw * 300 / 480);
    const maxH = Math.floor((vh - head - pad * (rows + 1)) / rows);
    let s = fw / 480;
    if (fh > maxH) { fh = maxH; s = fh / 300; }
    const c = document.createElement('canvas');
    c.width = vw; c.height = vh;
    c.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;width:' + vw + 'px;height:' + vh + 'px';
    const g = c.getContext('2d');
    g.fillStyle = '#202028'; g.fillRect(0, 0, vw, vh);
    g.fillStyle = '#fff'; g.font = 'bold 13px monospace';
    g.fillText(${JSON.stringify(TAG.toUpperCase())} + ' - death movie, ' + ${JSON.stringify(label)} + (${repeat} ? ', seen before' : ', first viewing') + ', ' + Math.round(dur) + ' ms', 8, 19);
    const off = document.createElement('canvas'); off.width = 480; off.height = 300;
    const og = off.getContext('2d');
    for (let i = 0; i < n; i++) {
      const t = Math.round(i * dur / (n - 1) * 0.985);
      og.setTransform(1, 0, 0, 1, 0, 0); og.clearRect(0, 0, 480, 300);
      D.render(og, t, cause, opts);
      const x = pad + (i % cols) * (Math.floor(480 * s) + pad), y = head + pad + Math.floor(i / cols) * (Math.floor(300 * s) + pad);
      g.imageSmoothingEnabled = false;
      g.drawImage(off, x, y, Math.floor(480 * s), Math.floor(300 * s));
      g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(x, y, 78, 16);
      g.fillStyle = '#ffd75e'; g.font = 'bold 12px monospace'; g.fillText('t=' + t + 'ms', x + 4, y + 12);
    }
    document.body.appendChild(c);
    window.__sheet = c;
    return true;
  })()`);
  await pg.sleep(100);
  if (ok) await pg.shot(name);
  await pg.evaluate(`window.__sheet && window.__sheet.remove()`);
}

const CASES = [
  { how: 'contact', pilot: 'ROGUE', wave: 1, killer: 'CHASER', label: 'Rogue, a Chaser in melee' },
  { how: 'shot', pilot: 'WITCH', wave: 1, killer: 'SPITTER', label: 'Witch, a Spitter at range' },
  { how: 'boss', pilot: 'PALADIN', wave: 2, killer: null, label: 'Paladin, the wave-2 boss' },
];

async function arm(w, h, mobile, presses) {
  await withPage({ w, h, dpr: 1, mobile, startupScript: STARTUP, ...(ROOT ? { root: ROOT } : {}) }, async (pg) => {
    const { evaluate, waitFor, sleep } = pg;
    const size = w + 'x' + h;
    await waitFor(`!!(window.__hordesBooted || document.getElementById('game'))`, 15000);
    await evaluate(HELPERS);
    await waitFor(`window.__T.state.mode === 'intro'`, 5000);
    await sleep(500);
    await press(pg, 'key', 0, 0, 'x'); await press(pg, 'key', 0, 0, 'Escape');
    for (let ci = 0; ci < CASES.length; ci++) {
      const c = CASES[ci], label = size + ' ' + c.how;
      await evaluate(`window.__fight(${JSON.stringify(c.pilot)}, ${c.wave})`);
      if (c.how === 'boss') {
        await evaluate(`window.__T.state.wave.endsAt = window.__T.state.time`);
        await waitFor(`(window.__T.state.wave.bosses || []).some(b => b.hp > 0)`, 20000);
        await sleep(3500);   // past the boss's arrival banner
        await waitFor(`!window.__T.bossSting.live`, 8000);   // and its arrival sting (it holds the sim)
      }
      await evaluate(`window.__place(${JSON.stringify(c.how)})`);
      await sleep(900);   // the fight runs a moment
      await evaluate(`window.__cues.length = 0; window.__kill(${JSON.stringify(c.how)})`);
      await waitFor(`window.__T.state.mode === 'death-cine'`, 10000);
      // The frozen copy is taken on the movie's first frame, not when the mode
      // turns: read it once that frame has run (a read in between saw no copy).
      await waitFor(`(() => { const m = window.__T.movies.current; const f = m && m.opts && m.opts.freeze; return !(f && f.pending); })()`, 5000);
      const info = await evaluate(`(() => { const o = window.__T.movies.current.opts;
        return { hero: o.hero && o.hero.id, killer: o.killer && o.killer.id, kind: o.killer && o.killer.kind,
          snap: !!(o.freeze && o.freeze.snap && o.freeze.snap.width > 0), at: o.freeze && o.freeze.killer,
          hat: o.freeze && o.freeze.hero, cause: window.__T.state.deathBy.cause, repeat: o.repeat }; })()`);
      check(label + ': the pilot of the run', info.hero === c.pilot, info.hero);
      check(label + ': the real killer', c.killer ? info.killer === c.killer : info.kind === 'boss', info);
      if (!BEFORE) {
        check(label + ': the frozen frame of the fight is a canvas', info.snap);
        const far = c.how === 'shot';
        const dist = info.at && info.hat ? Math.hypot(info.at.x - info.hat.x, info.at.y - info.hat.y) : -1;
        check(label + ': the killer is placed where it stood', far ? dist > 80 : dist >= 0 && dist < 60, { dist: Math.round(dist) });
      }
      if (SHEETS) {
        const nm = 'death_' + c.how + '_' + TAG + '_' + size;
        await strip(pg, nm, c.label, false);
        await strip(pg, nm.replace('_' + TAG, '-repeat_' + TAG), c.label, true);
      }
      if (ci === 0) {
        // The first death plays out: every cue, then the end card.
        await evaluate(`window.__T.movies.current.t0 = performance.now()`);
        await waitFor(`window.__T.state.mode === 'dead'`, 9000);
        const cues = await evaluate(`window.__cues.slice()`);
        if (!BEFORE) check(label + ': its own cues, in order', cues.join() === 'FREEZE,ROAD,LUNGE,HIT,SLUMP,CLOSE', cues);
        const ov = await evaluate(`(() => { const o = document.getElementById('overlay'); return { shown: o.style.display, text: o.innerText.slice(0, 400) }; })()`);
        check(label + ': the end card follows, naming the killer', ov.shown === 'flex' && /CHASER/.test(ov.text), ov.text.slice(0, 120));
        if (SHEETS) await pg.shot('chrome_endcard_' + TAG + '_' + size);
      } else {
        const how = presses[ci % presses.length];
        await sleep(500);
        await press(pg, how, 240, 150, 'x');
        check(label + ': the first ' + how + ' shows SKIP', (await evaluate(mode)) === 'death-cine' && (await evaluate(ask)) > 0);
        await sleep(150);
        if (SHEETS && ci === 1) await pg.shot('chrome_skip_' + how + '_' + TAG + '_' + size);
        await press(pg, how, 455, 8, 'Escape');
        await sleep(200);
        check(label + ': the second ' + how + ' skips to the end card', (await evaluate(mode)) === 'dead');
      }
    }
    const errs = pg.errors.filter(e => !/favicon|ERR_FILE_NOT_FOUND|404/.test(String(e && (e.text || e.message || e))));
    check(size + ' 0 console errors', errs.length === 0, errs.slice(0, 3));
  });
}

await arm(1280, 720, false, ['key', 'click']);
await arm(390, 844, true, ['tap', 'tap']);
const failed = results.filter(r => !r.ok);
console.log((failed.length ? 'FAILED ' + failed.length : 'ALL OK') + ' (' + results.length + ' checks)');
process.exitCode = failed.length ? 1 : 0;
