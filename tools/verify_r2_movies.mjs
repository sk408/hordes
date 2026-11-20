// HORDES - R2 movies in a real headless Chrome: the one skip rule by real key,
// click and tap in every movie (the intro, the escape, the portal movie, the
// road shot before a stage change, the death movie), the cast
// each movie is handed, and 0 console errors. With --sheets it also writes the before/after frame strips
// (run once against this tree, once with --root D:/hordes-claude --tag before).
//   node tools/verify_r2_movies.mjs
//   HORDES_SHOT_DIR=<dir> node tools/verify_r2_movies.mjs --sheets --tag after
//   HORDES_SHOT_DIR=<dir> node tools/verify_r2_movies.mjs --sheets-only --tag before --root D:/hordes-claude
import { withPage } from './browser.mjs';
import { TOUR_KEYS } from '../src/tour.js';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const SHEETS = argv.includes('--sheets') || argv.includes('--sheets-only');
const ONLY_SHEETS = argv.includes('--sheets-only');
const TAG = arg('--tag', 'after');
const ROOT = arg('--root', null);

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok });
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (detail !== undefined ? ' :: ' + JSON.stringify(detail) : ''));
};
const STARTUP = `try {
  localStorage.setItem('hordes_onboarded', '1');
  for (const k of ${JSON.stringify(Object.values(TOUR_KEYS))}) localStorage.setItem(k, '1');
} catch (e) {}`;

// In-page helpers, installed once per page.
const HELPERS = `(async () => {
  const T = (await import('./src/main.js')).__TEST;
  const { makeTypedEnemy } = await import('./src/enemy_types.js');
  window.__T = T;
  window.__park = null;
  const loop = () => { if (window.__park) window.__park(); requestAnimationFrame(loop); };
  loop();
  // A run as the given pilot, on the given wave, nothing spawning.
  window.__run = (pilot, wave) => {
    T.getProfile().equippedCharacter = pilot;
    T.startRun();
    const s = T.state;
    s.spawnTimer = 1e9; s.wave.midAt = s.time + 1e9; s.wave.num = wave;
    s.player.invuln = 1e6;
    s.wave.endsAt = s.time;   // the boss comes now
    window.__park = () => {
      const st = T.state;
      if (st.mode !== 'playing') return;
      st.player.invuln = 1e6;
      const live = (st.wave.bosses || []).filter(b => b.hp > 0);
      if (live.length) { st.wave.endsAt = st.time + 1e9; for (const b of live) b.hp = 0; }
      if (st.portal) { st.player.x = st.portal.x; st.player.y = st.portal.y; }
    };
  };
  // A death to the given enemy type (extra: fields such as a bossId).
  window.__die = (pilot, typeId, extra) => {
    T.getProfile().equippedCharacter = pilot;
    T.startRun();
    const s = T.state, p = s.player;
    p.hp = 1; p.invuln = 0; p.potions.hp = 0;
    s.spawnTimer = 999; s.wave.endsAt = s.time + 9999; s.enemies.length = 0;
    const k = makeTypedEnemy(typeId, p.x, p.y, s.time);
    k.hp = k.maxHp = 1e6; k.speed = 0; Object.assign(k, extra || {});
    s.enemies.push(k);
    window.__park = () => {
      const st = T.state;
      if (st.mode !== 'playing') { window.__park = null; return; }
      const e = st.enemies[0];
      if (e) { e.x = st.player.x; e.y = st.player.y; e.speed = 0; }
    };
  };
  return true;
})()`;

const mode = `window.__T.state.mode`;
const ask = `(window.__T.state.mode === 'escape' ? window.__T.escape.cine.ask : (window.__T.movies.current ? window.__T.movies.current.skip.ask : -1))`;
// How old the movie is by its own clock, in seconds; -1 when the tool cannot
// read it (the escape chase keeps its own clock).
const movieAge = `(() => { const T = window.__T; if (T.state.mode === 'escape') return -1; const m = T.movies.current;
  if (!m) return -1; return (performance.now() - m.t0) / 1000; })()`;
// A view point (480x300) to CSS pixels through the live canvas rect.
const toCss = (vx, vy) => `(() => { const r = document.getElementById('game').getBoundingClientRect();
  return [r.left + ${vx} / 480 * r.width, r.top + ${vy} / 300 * r.height]; })()`;

// liveExpr: an in-page test that the movie is still up (default: the mode is
// movieMode). The portal movie and the road shot share 'portal-cine', so each
// passes its own (the mode and the movie's kind). firstKey: the key of the
// first press (any key shows SKIP).
async function skipRule(pg, label, movieMode, how, liveExpr = null, firstKey = 'x') {
  const { evaluate, sleep } = pg;
  const live = async () => !!(await evaluate(liveExpr || `${mode} === ${JSON.stringify(movieMode)}`));
  await sleep(150);   // inside the 0.4 s guard
  // On a loaded machine the movie can be older than the guard before this press lands; the
  // press would then show SKIP, as it should, and this check and the next would fail for no
  // fault of the game. So the guard is checked only when the press can land inside it.
  const age = await evaluate(movieAge);
  if (age >= 0.3) {
    console.log('note ' + label + ': the movie was ' + age.toFixed(2) + ' s old before the first press (a busy machine); the 0.4 s guard is not checked in this arm');
  } else {
    if (how === 'key') await pg.key('Escape');
    else { const [x, y] = await evaluate(toCss(455, 8)); await (how === 'tap' ? pg.tap(x, y, 1) : pg.click(x, y)); }
    const ageAfter = await evaluate(movieAge);
    const a0 = await evaluate(ask);
    // The press itself may have landed late (the round trip took the movie past the guard).
    if (ageAfter >= 0.4 && a0 > 0) console.log('note ' + label + ': the first press landed at ' + ageAfter.toFixed(2) + ' s, past the guard; it showed SKIP, which is right');
    else check(label + ': a press in the first moments is ignored', (await live()) && a0 === 0, { mode: await evaluate(mode), ask: a0, age: ageAfter });
  }
  await sleep(450);
  if (!((await evaluate(ask)) > 0)) {
    if (how === 'key') await pg.key(firstKey);
    else { const [x, y] = await evaluate(toCss(240, 150)); await (how === 'tap' ? pg.tap(x, y, 1) : pg.click(x, y)); }
  }
  const a1 = await evaluate(ask);
  check(label + ': the first ' + how + ' shows SKIP', (await live()) && a1 > 0, { mode: await evaluate(mode), ask: a1 });
  await sleep(120);
  if (SHEETS) await pg.shot('chrome_' + how + '_' + label.replace(/\W+/g, '_'));
  if (how === 'key') await pg.key('Escape');
  else { const [x, y] = await evaluate(toCss(455, 8)); await (how === 'tap' ? pg.tap(x, y, 1) : pg.click(x, y)); }
  await sleep(150);
  const m2 = await evaluate(mode);
  check(label + ': the second ' + how + ' skips', !(await live()), m2);
  return m2;
}

// hows: the press each movie is skipped with ('key', 'click' or 'tap').
async function arm(w, h, mobile, hows, withSheets) {
  await withPage({ w, h, dpr: 1, mobile, startupScript: STARTUP, ...(ROOT ? { root: ROOT } : {}) }, async (pg) => {
    const { evaluate, waitFor, sleep } = pg;
    const tag = w + 'x' + h;
    if (ONLY_SHEETS) {
      if (!withSheets) return;
      await waitFor(`!!document.getElementById('game')`, 15000);
      await waitFor(`import('./src/death_cine.js').then(() => true, () => false)`, 15000);
      await sheets(pg, tag);
      return;
    }
    await waitFor(`!!(window.__hordesBooted || document.getElementById('game'))`, 15000);
    await evaluate(HELPERS);
    // The intro: the page boots into it.
    await waitFor(`window.__T.state.mode === 'intro'`, 5000);
    check(tag + ' intro carries the equipped pilot', (await evaluate(`window.__T.movies.current.opts.hero.id`)) === 'KNIGHT');
    // The original movie for every player: this profile has a finished run,
    // and it still gets the full 7 s (no short cut for a returning player).
    const introLen = await evaluate(`import('./src/intro.js').then(I => [I.INTRO_DURATION, I.durationOf(window.__T.movies.current.opts), 'returning' in window.__T.movies.current.opts])`);
    check(tag + ' intro is the original 7 s movie for a returning player', introLen[0] === 7000 && introLen[1] === 7000 && introLen[2] === false, introLen);
    await evaluate(`window.__T.movies.current.t0 = performance.now()`);
    await skipRule(pg, tag + ' intro', 'intro', hows.intro);
    // The escape (wave 1), as the Rogue.
    await evaluate(`window.__run('ROGUE', 1)`);
    await waitFor(`window.__T.state.mode === 'escape'`, 20000);
    check(tag + ' escape: Rogue and Gravelmaw', (await evaluate(`window.__T.escape.cine.scene.character + '/' + window.__T.escape.cine.scene.bossId`)) === 'ROGUE/GRAVELMAW');
    await skipRule(pg, tag + ' escape', 'escape', hows.escape);
    await evaluate(`window.__T.state.mode === 'intermission' && window.__park && (window.__park = null)`);
    // The portal movie (wave 2), as the Witch: Choir Mother is wave 2's boss.
    // The kill plays on the field (a card it earns opens there); the walk-in
    // starts the movie in 'portal-cine', the first of the run in full.
    await evaluate(`window.__run('WITCH', 2)`);
    const portalUp = `window.__T.state.mode === 'portal-cine' && window.__T.movies.current.kind === 'portal'`;
    for (let i = 0; i < 60 && !(await evaluate(portalUp)); i++) {
      if (['draft', 'evolve'].includes(await evaluate(mode))) await pg.key('1');
      await sleep(250);
    }
    check(tag + ' portal: the walk-in plays the movie, in full', (await evaluate(portalUp)) && !(await evaluate(`window.__T.movies.current.opts.repeat`)));
    const cast = await evaluate(`window.__T.movies.current.opts.hero.id + '/' + window.__T.movies.current.opts.boss.id`);
    check(tag + ' portal: the Witch and the boss killed', cast === 'WITCH/CHOIR_MOTHER', cast);
    await evaluate(`window.__T.movies.current.t0 = performance.now()`);   // the guard, timed from here
    await skipRule(pg, tag + ' portal', 'portal-cine', hows.portal, portalUp);
    await sleep(200);
    check(tag + ' portal: the intermission after the movie', (await evaluate(mode)) === 'intermission', await evaluate(mode));
    // The road shot (CONTINUE after wave 2 moves to the next stage): 1.5 s,
    // under the same skip rule.
    await sleep(700);   // past the next screen's input guard
    if (hows.road === 'key') await pg.key('c');
    else {
      const [cx, cy] = await evaluate(`(() => { const c = [...document.querySelectorAll('#ov-cards > *')].find(c => /CONTINUE/.test(c.innerHTML));
        c.scrollIntoView({ block: 'center' }); const b = c.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; })()`);
      await (hows.road === 'tap' ? pg.tap(cx, cy, 1) : pg.click(cx, cy));
    }
    await waitFor(`window.__T.state.mode === 'portal-cine'`, 3000);
    check(tag + ' road: CONTINUE plays the road shot', (await evaluate(`window.__T.movies.current.kind`)) === 'road', await evaluate(`window.__T.movies.current.kind`));
    check(tag + ' road: the run\'s pilot', (await evaluate(`window.__T.movies.current.opts.hero.id`)) === 'WITCH');
    await skipRule(pg, tag + ' road', 'portal-cine', hows.road, `window.__T.state.mode === 'portal-cine' && window.__T.movies.current.kind === 'road'`);
    await evaluate(`window.__park = null`);
    // The death movie, as the Paladin, killed by Pyraxis.
    await evaluate(`window.__die('PALADIN', 'BRUTE', { bossId: 'PYRAXIS' })`);
    await waitFor(`window.__T.state.mode === 'death-cine'`, 10000);
    const dc = await evaluate(`window.__T.movies.current.opts.hero.id + '/' + window.__T.movies.current.opts.killer.id`);
    check(tag + ' death: the Paladin and Pyraxis', dc === 'PALADIN/PYRAXIS', dc);
    await skipRule(pg, tag + ' death', 'death-cine', hows.death);
    check(tag + ' the payoff card is up', (await evaluate(mode)) === 'dead');
    // Seen counts after one of each.
    const seen = await evaluate(`localStorage.getItem('hordes_movies_seen')`);
    check(tag + ' seen counts stored with the settings', /"intro":1/.test(seen) && /"portal":1/.test(seen) && /"road":1/.test(seen) && /"death":1/.test(seen) && /"escape":1/.test(seen), seen);
    const errs = pg.errors.filter(e => !/favicon|ERR_FILE_NOT_FOUND|404/.test(String(e && (e.text || e.message || e))));
    check(tag + ' 0 console errors', errs.length === 0, errs.slice(0, 3));
    if (SHEETS && withSheets) await sheets(pg, tag);
  });
}

// Frame strips: 10 frames at even steps over each movie, drawn straight from
// the movie module (the same render the game calls) with the time on each.
async function sheets(pg, tag) {
  const { evaluate, sleep } = pg;
  for (const [movie, label] of [['portal', 'Witch kills Pyraxis, first portal of the run'], ['portal-repeat', 'Witch, Pyraxis, a later portal in the run'], ['road', 'Witch, to the next stage'], ['death', 'Rogue, killed by Pyraxis'], ['death-repeat', 'Rogue, Pyraxis, seen before']]) {
    if (TAG === 'before' && /repeat/.test(movie)) continue;
    const ok = await evaluate(`(async () => {
      let B = null, RS = null;
      try { B = await import('./src/portal_cine.js'); } catch (e) { B = null; }
      try { RS = await import('./src/road_shot.js'); } catch (e) { RS = null; }
      const D = await import('./src/death_cine.js');
      let cast = null;
      try { cast = await import('./src/movie_cast.js'); } catch (e) { cast = null; }
      const repeat = ${JSON.stringify(movie)}.endsWith('-repeat');
      const kind = ${JSON.stringify(movie)}.replace('-repeat', '');
      if (kind === 'portal' && !B) return false;   // a tree without the movie
      if (kind === 'road' && !RS) return false;
      const opts = cast ? { hero: cast.pilotLook(kind === 'death' ? 'ROGUE' : 'WITCH'), boss: cast.bossLook('PYRAXIS'),
        killer: cast.killerLook({ typeId: 'BRUTE', bossId: 'PYRAXIS' }), repeat,
        bx: 240, by: 170, px: 240, py: 175, hx: 200, hy: 180, zoom: 2, entering: true,
        scene: RS ? RS.sceneFor({ seed: 7, stage: 'ASHEN_WASTE', character: 'WITCH' }) : null, name: 'ASHEN WASTE' } : {};
      const dur = kind === 'portal' ? B.durationOf(opts) : kind === 'road' ? RS.DURATION * 1000
        : (D.durationOf ? D.durationOf(opts) : D.CINE_DURATION);
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
      g.fillStyle = '#fff'; g.font = 'bold 14px monospace';
      g.fillText(${JSON.stringify(TAG.toUpperCase())} + ' - ' + kind + ' movie (' + ${JSON.stringify(label)} + ') ' + Math.round(dur) + ' ms', 8, 19);
      const off = document.createElement('canvas'); off.width = 480; off.height = 300;
      const og = off.getContext('2d');
      for (let i = 0; i < n; i++) {
        const t = Math.round(i * dur / (n - 1) * 0.985);
        og.setTransform(1, 0, 0, 1, 0, 0); og.clearRect(0, 0, 480, 300);
        if (kind === 'portal') B.render(og, t, opts);
        else if (kind === 'road') RS.render(og, t / 1000, opts);
        else D.render(og, t, 'contact', opts);
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
    await sleep(100);
    if (ok) await pg.shot(movie + '_' + TAG + '_' + tag);
    await evaluate(`window.__sheet && window.__sheet.remove()`);
  }
}

await arm(1280, 720, false, { intro: 'key', escape: 'click', portal: 'key', road: 'click', death: 'click' }, true);
if (!ONLY_SHEETS) await arm(1280, 720, false, { intro: 'click', escape: 'key', portal: 'click', road: 'key', death: 'key' }, false);
await arm(390, 844, true, { intro: 'tap', escape: 'tap', portal: 'tap', road: 'tap', death: 'tap' }, true);
const failed = results.filter(r => !r.ok);
console.log((failed.length ? 'FAILED ' + failed.length : 'ALL OK') + ' (' + results.length + ' checks)');
process.exitCode = failed.length ? 1 : 0;
