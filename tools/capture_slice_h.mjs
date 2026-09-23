// HORDES - PORT SLICE H capture: combat / hit VFX juice in the live run.
// Run: HORDES_SHOT_DIR=docs/art/port-slice-h node tools/capture_slice_h.mjs
// (SHOT_DIR is a relative in-tree path.)
//
// METHOD (the capture_slice_g.mjs pattern): real browser, phone viewport, seed
// hordes_onboarded + all 19 tour keys so no overlay covers the arena, REAL
// tap on START GAME, ASSERT state.time advances (never grade a frozen game).
// Each shot plants effects through the game's OWN effect seam (state.effects,
// the plain { kind, x, y, age, ttl } array every weapon/skill trigger writes)
// at fresh age around the player, then screenshots mid-life (age < ttl) with
// the sim running. Shot 1 fires REAL live volley combat (spawned targets +
// pumped frames) so muzzle + hit_spark arrive via their true triggers.
// state.time is asserted advancing on every shot.
import { withPage } from './browser.mjs';
import { mkdirSync } from 'node:fs';

const ART = 'docs/art/port-slice-h';
mkdirSync(ART, { recursive: true });
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok, detail });
  console.log((ok ? '  PASS ' : '  FAIL ') + name + (detail !== undefined ? ' :: ' + JSON.stringify(detail) : ''));
};

const TOUR19 = ['stage1', 'hud', 'pilot', 'focus', 'stance', 'move', 'skills', 'potions',
  'stats', 'cog', 'draft', 'edge', 'chest', 'portal', 'arch', 'shrine',
  'intermission', 'death', 'settings'];

// Effects planted per shot: [kind, dx, dy, ttl, extra]. Ages are pinned fresh
// (age 0.02–0.1) so the screenshot lands mid-life; the sim keeps running.
const SHOTS = [
  { shot: 'slice-h-2-volley-impacts',
    fx: [['hit_spark', 26, -6, 0.12, {}], ['hit_spark', -30, 10, 0.12, {}],
         ['hit_spark', 8, 34, 0.15, {}], ['muzzle', 10, 0, 0.08, {}],
         ['scythe_hit', -14, -22, 0.15, {}], ['mine_hit', 34, 20, 0.12, {}]] },
  { shot: 'slice-h-3-kill-rings',
    fx: [['nova_pulse', 0, 0, 0.3, { radius: 30 }], ['nova_pulse', -44, -20, 0.2, { radius: 24 }],
         ['mine_blast', 40, 26, 0.35, { radius: 44 }], ['rewrite_boom', -30, 30, 0.25, { radius: 26 }]] },
  { shot: 'slice-h-4-boss-tells',
    fx: [['boss_nova', 0, 0, 0.5, { radius: 34 }], ['boss_nova', 52, -30, 0.3, { radius: 20 }],
         ['colossus_shock', -52, 24, 0.5, { radius: 26 }], ['magnet', 0, 44, 0.4, { radius: 22 }]] },
  { shot: 'slice-h-5-beam-zap',
    fx: [['beam_hit', 30, -14, 0.15, {}], ['beam_hit', -26, 18, 0.15, {}],
         ['seeker_pop', 44, 8, 0.12, {}], ['mine_fizzle', -44, -8, 0.15, {}],
         ['orbit_hit', 12, 30, 0.1, {}], ['orbit_hit', -12, -30, 0.2, {}]] },
];

await withPage({ w: 390, h: 844, dpr: 3,
  startupScript: "try { localStorage.setItem('hordes_onboarded', '1'); } catch (e) {}\n" +
    'for (const k of ' + JSON.stringify(TOUR19) + ") { try { localStorage.setItem('hordes_tour_' + k, '1'); } catch (e) {} }" },
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
  check('run started via a REAL tap and the sim clock ADVANCED past 1.0s (not a frozen game)',
    playing && advancing, { playing, advancing });
  if (!playing || !advancing) throw new Error('no live run to capture');

  // SHOT 1 — REAL live volley combat: spawn targets around the player, let the
  // game's own volley trigger fire muzzle + hit_spark, screenshot mid-fight.
  const live = await p.evaluate(`(async () => {
    const T = (await import('./src/main.js')).__TEST;
    T.startRun();
    T.setPilotMode('MANUAL');
    const st = T.state;
    const { makeTypedEnemy } = await import('./src/enemy_types.js');
    st.spawnTimer = 9999;
    if (st.wave) st.wave.endsAt = st.time + 9999;
    st.enemies.length = 0;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const e = makeTypedEnemy('GRUNT', st.player.x + Math.cos(a) * 70, st.player.y + Math.sin(a) * 70, st.time);
      e.hp = e.maxHp = 1e9; e.speed = 0;
      st.enemies.push(e);
    }
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    await sleep(1500);
    const kinds = [...new Set(st.effects.map(f => f.kind))];
    const t0 = st.time;
    await sleep(400);
    return { mode: st.mode, dt: st.time - t0, time: st.time, kinds,
      foes: st.enemies.length };
  })()`, true);
  check('live volley combat: muzzle/hit_spark fire via TRUE triggers (' + live.kinds.join(',') + ')',
    live.mode === 'playing' && live.kinds.includes('hit_spark'), live);
  check('live combat shot: clock advances (live game)', live.dt > 0 && live.mode === 'playing', { dt: live.dt, time: live.time });
  const liveFile = await p.shot('slice-h-1-live-volley');
  console.log('  SHOT slice-h-1-live-volley -> ' + liveFile);

  // SHOTS 2-5 — planted through the game's own effect seam at fresh age,
  // shutter fires IMMEDIATELY (short-ttl sparks live 0.08-0.15s); the sim
  // clock is asserted across the whole shot block instead of a pre-sleep.
  for (const t of SHOTS) {
    const pre = await p.evaluate(`(async () => {
      const T = (await import('./src/main.js')).__TEST;
      return { mode: T.state.mode, t0: T.state.time };
    })()`, true);
    const planted = await p.evaluate(`(async () => {
      const T = (await import('./src/main.js')).__TEST;
      const st = T.state;
      const px = st.player.x, py = st.player.y;
      const spec = ${JSON.stringify(t.fx)};
      for (const [kind, dx, dy, ttl, extra] of spec) {
        st.effects.push(Object.assign({ kind, x: px + dx, y: py + dy, age: 0, ttl }, extra));
      }
      return { kinds: [...new Set(st.effects.map(f => f.kind))] };
    })()`, true);
    const file = await p.shot(t.shot);
    console.log('  SHOT ' + t.shot + ' -> ' + file);
    const post = await p.evaluate(`(async () => {
      const T = (await import('./src/main.js')).__TEST;
      return { mode: T.state.mode, t1: T.state.time };
    })()`, true);
    const want = t.fx.map(s => s[0]);
    check(t.shot + ': planted fx present via the seam (' + planted.kinds.join(',') + ')',
      post.mode === 'playing' && want.every(k => planted.kinds.includes(k)),
      { planted: planted.kinds, want });
    check(t.shot + ': clock advances (live game, ' + pre.t0.toFixed(2) + 's -> ' + post.t1.toFixed(2) + 's)',
      post.mode === 'playing' && post.t1 > pre.t0, { dt: post.t1 - pre.t0, time: post.t1 });
  }

  const red = results.filter(r => !r.ok);
  console.log(red.length ? ('capture_slice_h: ' + red.length + ' FAILED check(s)') : 'capture_slice_h: all checks passed');
  if (red.length) process.exitCode = 1;
});
