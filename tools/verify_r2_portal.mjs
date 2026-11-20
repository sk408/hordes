// HORDES - the portal movie (back in round 8) in a real headless Chrome: wave
// 2's kill, walk and full movie (6.9 s) then the intermission; the road shot at
// CONTINUE before a stage change; the double wave 3 in the same run, whose
// first boss falls alone, with the short movie (3.5 s); a new run with the full
// movie again, skipped by real key or tap; CONTINUE by real click or tap; and
// 0 console errors. It also writes frame strips (12 frames at even time steps:
// the whole flow, the movie alone, the first 1.7 s after CONTINUE), so the same
// script makes the BEFORE sheets against the main tree:
//   HORDES_SHOT_DIR=<dir> node tools/verify_r2_portal.mjs --tag after
//   HORDES_SHOT_DIR=<dir> node tools/verify_r2_portal.mjs --tag before --sheets-only --root D:\hordes-claude
import { withPage } from './browser.mjs';
import { TOUR_KEYS } from '../src/tour.js';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const TAG = arg('--tag', 'after');
const ROOT = arg('--root', null);
const ONLY_SHEETS = argv.includes('--sheets-only');

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok });
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (detail !== undefined ? ' :: ' + JSON.stringify(detail) : ''));
};
// The same random stream in both trees (a seeded Math.random before the game loads).
const STARTUP = `try {
  localStorage.setItem('hordes_onboarded', '1');
  for (const k of ${JSON.stringify(Object.values(TOUR_KEYS))}) localStorage.setItem(k, '1');
  let a = 20261118 >>> 0;
  Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
} catch (e) {}`;

const HELPERS = `(async () => {
  const T = (await import('./src/main.js')).__TEST;
  window.__T = T;
  window.__park = null;
  window.__rec = null;
  const game = document.getElementById('game');
  const loop = () => {
    if (window.__park) window.__park();
    const r = window.__rec;
    if (r && r.on) {
      const now = performance.now();
      if (now - r.last >= 80) {
        r.last = now;
        const c = document.createElement('canvas');
        c.width = 480; c.height = Math.round(480 * game.height / game.width);
        const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
        g.drawImage(game, 0, 0, c.width, c.height);
        r.frames.push({ t: now - r.t0, abs: now, c, mode: T.state.mode + (T.movies.current && T.state.mode === 'portal-cine' ? '/' + T.movies.current.kind : '') });
      }
      if (r.until && r.until()) r.on = false;
    }
    requestAnimationFrame(loop);
  };
  loop();
  // A run as the pilot, on the wave, nothing spawning, the AUTO pilot walking.
  window.__run = (pilot, wave) => {
    T.getProfile().equippedCharacter = pilot;
    T.startRun();
    try { T.setPilotMode('AUTO_ALL'); } catch (e) {}
    const s = T.state;
    s.spawnTimer = 1e9; s.wave.midAt = s.time + 1e9; s.wave.num = wave;
    s.player.invuln = 1e6;
    s.wave.endsAt = s.time;   // the boss comes now
    window.__park = () => {
      const st = T.state;
      st.player.invuln = 1e6;
      if ((st.wave.bosses || []).some(b => b.hp > 0)) st.wave.endsAt = st.time + 1e9;
      st.spawnTimer = 1e9;
      // Cards on the way are picked at once (the first card).
      // (after 0.7 s on screen, so the strips show the card)
      if (st.mode === 'draft' || st.mode === 'evolve') {
        if (!window.__cardAt) window.__cardAt = performance.now();
        const c = document.querySelector('#ov-cards > *');
        if (c && performance.now() - window.__cardAt > 700) { c.click(); window.__cardAt = 0; }
      } else window.__cardAt = 0;
    };
  };
  // The next wave of the same run (the run's movie count goes on).
  window.__wave = (wave) => {
    const s = T.state;
    s.spawnTimer = 1e9; s.wave.midAt = s.time + 1e9; s.wave.num = wave;
    s.wave.endsAt = s.time;   // the boss comes now
  };
  // Kill the cast members listed (indexes) and record until the intermission.
  // level: the kill's own gems level the hero up (a card at the kill).
  window.__kill = (which, level) => {
    const st = T.state;
    if (level) st.player.xp = st.player.xpNext - 1;
    const cast = (st.wave.bosses || []).filter(b => b.hp > 0);
    window.__rec = { on: true, t0: performance.now(), last: performance.now() - 70, frames: [],
      until: () => {
        const r = window.__rec;
        if (T.state.mode === 'intermission' && !r.inter) r.inter = performance.now();
        return (r.inter && performance.now() - r.inter > 600) || performance.now() - r.t0 > 18000;
      } };
    for (const i of which) if (cast[i]) cast[i].hp = 0;
    return cast.map(b => b.bossId);
  };
  // Record the first 1.5 s after CONTINUE (the frames before are kept for the
  // joined strip: the movie, the intermission, CONTINUE, the road shot).
  window.__recFor = (ms) => {
    window.__kept = window.__rec ? window.__rec.frames : [];
    window.__rec = { on: true, t0: performance.now(), last: -1e9, frames: [],
      until: () => performance.now() - window.__rec.t0 > ms };
  };
  // The strip: 12 frames at even steps over what was recorded.
  // only: keep the frames of one mode (the movie alone), timed from its first.
  // joined: the kept frames from the movie's start, then these.
  window.__strip = (title, only, joined) => {
    // (The first copy is taken before the game has painted that frame: blank.)
    let fr = window.__rec.frames.slice(1);
    if (joined) {
      const k = window.__kept || [];
      const i = k.findIndex(f => f.mode === 'portal-cine/portal');
      fr = (i >= 0 ? k.slice(i) : k).concat(fr);
      const a0 = fr.length ? fr[0].abs : 0;
      fr = fr.map(f => ({ ...f, t: f.abs - a0 }));
    }
    if (only) {
      fr = fr.filter(f => f.mode === only);
      const t0 = fr.length ? fr[0].t : 0;
      fr = fr.map(f => ({ ...f, t: f.t - t0 }));
    }
    const end = fr.length ? fr[fr.length - 1].t : 0;
    const n = 12, pick = [];
    for (let i = 0; i < n; i++) {
      const want = end * i / (n - 1);
      let best = fr[0];
      for (const f of fr) if (Math.abs(f.t - want) < Math.abs(best.t - want)) best = f;
      pick.push(best);
    }
    const vw = innerWidth, vh = innerHeight, cols = vw > vh ? 4 : 2, rows = Math.ceil(n / cols);
    const head = 28, pad = 4;
    const ar = fr.length ? fr[0].c.height / 480 : 0.625;
    let fw = Math.floor((vw - pad * (cols + 1)) / cols), fh = Math.floor(fw * ar);
    const maxH = Math.floor((vh - head - pad * (rows + 1)) / rows);
    if (fh > maxH) { fh = maxH; fw = Math.floor(fh / ar); }
    const c = document.createElement('canvas');
    c.width = vw; c.height = vh;
    c.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;width:' + vw + 'px;height:' + vh + 'px';
    const g = c.getContext('2d');
    g.fillStyle = '#202028'; g.fillRect(0, 0, vw, vh);
    g.fillStyle = '#fff'; g.font = 'bold 13px monospace';
    g.fillText(title + ' (' + Math.round(end) + ' ms)', 8, 19);
    g.imageSmoothingEnabled = false;
    pick.forEach((f, i) => {
      if (!f) return;
      const x = pad + (i % cols) * (fw + pad), y = head + pad + Math.floor(i / cols) * (fh + pad);
      g.drawImage(f.c, x, y, fw, fh);
      g.fillStyle = 'rgba(0,0,0,0.65)'; g.fillRect(x, y, 128, 16);
      g.fillStyle = '#ffd75e'; g.font = 'bold 11px monospace';
      g.fillText('t=' + Math.round(f.t) + 'ms ' + f.mode, x + 3, y + 12);
    });
    document.body.appendChild(c);
    window.__sheet = c;
    return { frames: fr.length, end: Math.round(end) };
  };
})()`;

const mode = `window.__T.state.mode`;

async function arm(w, h, mobile, how) {
  await withPage({ w, h, dpr: 1, mobile, startupScript: STARTUP, ...(ROOT ? { root: ROOT } : {}) }, async (pg) => {
    const { evaluate, waitFor, sleep } = pg;
    const size = w + 'x' + h;
    await waitFor(`!!document.getElementById('game')`, 15000);
    await evaluate(HELPERS, true);
    await waitFor(`window.__T.state.mode === 'intro'`, 8000);
    await evaluate(`window.__T.movies.current.t0 = performance.now() - 1000`);
    await sleep(500);
    // Skip the intro with two presses (the one rule).
    for (let i = 0; i < 2; i++) { await pg.key('Escape'); await sleep(150); }
    await sleep(300);
    const strip = async (name, title, only, joined) => {
      const r = await evaluate(`window.__strip(${JSON.stringify(title)}, ${JSON.stringify(only || null)}, ${!!joined})`);
      await sleep(80);
      await pg.shot('portal_' + name + '_' + TAG + '_' + size);
      await evaluate(`window.__sheet && window.__sheet.remove()`);
      return r;
    };
    // Where the game's canvas is, to turn view coordinates into a tap.
    const at = async (vx, vy) => evaluate(`(() => { const r = document.getElementById('game').getBoundingClientRect();
      return [r.left + ${vx} / 480 * r.width, r.top + ${vy} / 300 * r.height]; })()`);
    const press = async (vx, vy) => {
      const [x, y] = await at(vx, vy);
      if (how === 'tap') await pg.tap(x, y); else await pg.click(x, y);
    };

    const movieUp = `${mode} === 'portal-cine' && window.__T.movies.current && window.__T.movies.current.kind === 'portal'`;
    // CONTINUE on the intermission by real input: the key (desktop) the first
    // time, then a click (desktop) or a tap (phone) on the card.
    const continueBy = async (byKey) => {
      if (byKey && how === 'key') { await pg.key('c'); return; }
      const xy = await evaluate(`(() => { const c = [...document.querySelectorAll('#ov-cards > *')].find(c => /CONTINUE/.test(c.innerHTML));
        if (!c) return null; const r = c.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      if (!xy) { check(size + ' the CONTINUE card is there', false); return; }
      if (how === 'tap') await pg.tap(xy[0], xy[1]); else await pg.click(xy[0], xy[1]);
    };

    // 1. Wave 2 (a stage change follows), the Witch: the kill, the walk, the full movie.
    await evaluate(`window.__run('WITCH', 2)`);
    await waitFor(`(window.__T.state.wave.bosses || []).some(b => b.hp > 0)`, 15000);
    await sleep(4500);   // the boss's name banner has gone, as in a real fight
    const cast2 = await evaluate(`window.__kill([0], true)`);
    if (!ONLY_SHEETS) {
      await sleep(250);
      check(size + ' wave 2: no movie at the kill, the fight goes on', await evaluate(`${mode} !== 'portal-cine'`));
      await waitFor(movieUp, 15000);
      check(size + ' wave 2: the walk-in starts the full movie', await evaluate(`${movieUp} && !window.__T.movies.current.opts.repeat && window.__T.portalCine.duration > 6800`));
      check(size + ' wave 2: the Witch and ' + cast2[0], await evaluate(`window.__T.movies.current.opts.hero.id + '/' + window.__T.movies.current.opts.boss.id`) === 'WITCH/' + cast2[0]);
    }
    await waitFor(`${mode} === 'intermission'`, 25000);
    await sleep(800);
    const s2 = await strip('wave2', TAG.toUpperCase() + ' - wave 2, Witch: boss kill to intermission');
    if (!ONLY_SHEETS) check(size + ' wave 2: the intermission after the movie', s2.end >= 6800, s2);
    if (!ONLY_SHEETS) check(size + ' wave 2: the level-up card came at the kill, before the movie', await evaluate(`(() => { const f = window.__rec.frames.map(f => f.mode); const d = f.indexOf('draft'), m = f.indexOf('portal-cine/portal'); return d >= 0 && m > d && f.lastIndexOf('draft') < m; })()`));
    const m2 = await strip('movie_full', TAG.toUpperCase() + ' - the portal movie at the first portal of the run (Witch, ' + cast2[0] + ')', 'portal-cine/portal');
    if (!ONLY_SHEETS) check(size + ' the full movie ran about 6.9 s', m2.end > 6400 && m2.end < 7300, m2);
    // 2. CONTINUE: the road to the next stage.
    const stage0 = await evaluate(`window.__T.state.stage`);
    await evaluate(`window.__recFor(1700)`);
    await continueBy(true);
    await sleep(120);
    if (!ONLY_SHEETS) {
      check(size + ' CONTINUE: the road shot plays', await evaluate(`${mode} === 'portal-cine' && window.__T.movies.current.kind === 'road'`));
      check(size + ' the road shows the new stage', await evaluate(`window.__T.state.stage !== ${JSON.stringify(stage0)} && window.__T.movies.current.opts.scene.stage === window.__T.state.stage`));
    }
    await sleep(1800);
    await strip('road', TAG.toUpperCase() + ' - CONTINUE after wave 2: the first 1.7 s');
    await strip('to_stage', TAG.toUpperCase() + ' - wave 2 on to the new stage: the movie, the intermission, CONTINUE, the road shot', null, true);
    if (!ONLY_SHEETS) {
      check(size + ' then play on the new stage', await evaluate(`${mode} === 'playing'`));
      check(size + ' the road shot is not counted as a portal movie', await evaluate(`window.__T.movies.runSeen('portal') === 1 && window.__T.movies.runSeen('road') === 1`));
    }

    // 3. Wave 3 of the same run, a double wave: the first boss falls while the other lives.
    await evaluate(`window.__wave(3)`);
    await waitFor(`(window.__T.state.wave.bosses || []).filter(b => b.hp > 0).length === 2`, 15000);
    await sleep(4500);
    const cast3 = await evaluate(`window.__kill([0])`);
    if (!ONLY_SHEETS) {
      await sleep(250);
      check(size + ' wave 3 (double): the survivor is swept', await evaluate(`!(window.__T.state.wave.bosses || []).some(b => b.hp > 0)`));
      await waitFor(movieUp, 15000);
      check(size + ' wave 3 (double): the short movie for the first to fall', await evaluate(`${movieUp} && window.__T.movies.current.opts.repeat && window.__T.portalCine.duration === 3500 && window.__T.movies.current.opts.boss.id === ${JSON.stringify(cast3[0])}`), cast3);
    }
    await waitFor(`${mode} === 'intermission'`, 20000);
    await sleep(800);
    await strip('wave3', TAG.toUpperCase() + ' - wave 3 (double), first boss falls alone: kill to intermission');
    const m3 = await strip('movie_short', TAG.toUpperCase() + ' - the short portal movie, a later portal in the same run (Witch, ' + cast3[0] + ')', 'portal-cine/portal');
    if (!ONLY_SHEETS) {
      check(size + ' the short movie ran about 3.5 s', m3.end > 3100 && m3.end < 3900, m3);
      const w3 = await evaluate(`window.__T.state.wave.num`);
      await continueBy(false);
      await sleep(300);
      check(size + ' CONTINUE by ' + (how === 'tap' ? 'tap' : 'click') + ': the next wave, no road shot', await evaluate(`${mode} === 'playing' && window.__T.state.wave.num === ${w3 + 1}`));
    }

    if (!ONLY_SHEETS) {
      // 4. A new run: the full movie again, skipped by real input.
      await evaluate(`window.__run('ROGUE', 2)`);
      await waitFor(`(window.__T.state.wave.bosses || []).some(b => b.hp > 0)`, 15000);
      // An attended arrival plays the boss sting first (1.5 s, it holds the sim).
      await waitFor(`!window.__T.bossSting.live`, 8000);
      await sleep(300);
      await evaluate(`window.__kill([0]); window.__rec.on = false`);
      await waitFor(movieUp, 15000);
      check(size + ' a new run: the full movie again', await evaluate(`!window.__T.movies.current.opts.repeat`));
      await sleep(600);
      if (how === 'key') await pg.key('Escape'); else await press(240, 150);
      await sleep(100);
      check(size + ' skip: the first ' + how + ' shows SKIP, the movie goes on', await evaluate(`${movieUp} && window.__T.movies.current.skip.ask > 0`));
      await pg.shot('portal_chrome_skip_' + how + '_' + size);
      if (how === 'key') await pg.key('Enter'); else await press(455, 8);
      await sleep(150);
      check(size + ' skip: the second ' + how + ' ends the movie: the intermission', await evaluate(`${mode} === 'intermission'`));
      // The road shot after it has its own skip: not skipped by the movie's.
      await sleep(500);
      await continueBy(true);
      await sleep(150);
      check(size + ' the road shot after a skipped movie still plays', await evaluate(`${mode} === 'portal-cine' && window.__T.movies.current.kind === 'road' && window.__T.movies.current.skip.ask === 0`));
      await waitFor(`${mode} === 'playing'`, 5000);
      const errs = pg.errors.filter(e => !/favicon|ERR_FILE_NOT_FOUND|404/.test(String(e && (e.text || e.message || e))));
      check(size + ' 0 console errors', errs.length === 0, errs.slice(0, 3));
    }
  });
}

await arm(1280, 720, false, 'key');
await arm(390, 844, true, 'tap');
const failed = results.filter(r => !r.ok);
console.log((failed.length ? 'FAILED ' + failed.length : 'ALL OK') + ' (' + results.length + ' checks)');
process.exitCode = failed.length ? 1 : 0;
