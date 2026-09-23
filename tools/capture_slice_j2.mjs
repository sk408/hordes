// HORDES - PORT SLICE J2 capture: per-archetype projectile bodies in flight.
// Run: HORDES_SHOT_DIR=docs/art/port-slice-j2 node tools/capture_slice_j2.mjs
// (SHOT_DIR is a relative in-tree path.)
//
// METHOD (the capture_slice_h.mjs pattern): real browser, phone viewport, seed
// hordes_onboarded + all 19 tour keys so no overlay covers the arena, REAL
// tap on START GAME, ASSERT state.time advances (never grade a frozen game).
// Shot 1 fires REAL live volley combat (spawned targets + pumped frames) so
// volley arrows arrive via their true trigger. Shots 2-5 grant REAL weapon
// instances (weapons.js makeWeapon, the same object the draft path creates)
// into the live run's state.weapons, spawn live targets, and screenshot while
// the game's OWN update paths (updateWeapons + the volley integrator) fly
// the bodies — every projectile/effect on screen arrives through its true
// trigger, never planted. state.time is asserted advancing on every shot.
import { withPage } from './browser.mjs';
import { mkdirSync } from 'node:fs';

const ART = 'docs/art/port-slice-j2';
mkdirSync(ART, { recursive: true });
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok, detail });
  console.log((ok ? '  PASS ' : '  FAIL ') + name + (detail !== undefined ? ' :: ' + JSON.stringify(detail) : ''));
};

const TOUR19 = ['stage1', 'hud', 'pilot', 'focus', 'stance', 'move', 'skills', 'potions',
  'stats', 'cog', 'draft', 'edge', 'chest', 'portal', 'arch', 'shrine',
  'intermission', 'death', 'settings'];

// Per shot: weapons granted (real instances) + kinds that must be observed
// live (projectiles or effects) during the sampling window before the shutter.
const SHOTS = [
  { shot: 'slice-j2-2-orbit-boomerang', grant: ['ORBIT', 'BOOMERANG'],
    wantProj: ['boomerang'], wantFx: ['orbit'] },
  { shot: 'slice-j2-3-seeker-mine', grant: ['SEEKER', 'MINE'],
    wantProj: ['seeker', 'mine'], wantFx: [] },
  { shot: 'slice-j2-4-zap-nova', grant: ['ZAP', 'NOVA_PULSE'],
    wantProj: [], wantFx: ['zap', 'nova_pulse'] },
  { shot: 'slice-j2-5-scythe-beam', grant: ['SCYTHE', 'BEAM'],
    wantProj: [], wantFx: ['scythe_arc', 'beam'] },
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

  // SHOT 1 — REAL live volley combat: ring of targets, the base volley fires
  // volley arrows through its true trigger; screenshot mid-fight.
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
    // Accumulate over a window (instant-effect ttls are short, cooldowns are
    // long): the UNION proves bodies flew through true triggers; the shutter
    // fires right after a poll that still shows a volley arrow mid-flight.
    let kinds = new Set(), nProjMax = 0, liveProj = 0;
    for (let i = 0; i < 10; i++) {
      for (const f of st.effects) kinds.add(f.kind);
      liveProj = st.projectiles.length;
      if (liveProj > nProjMax) nProjMax = liveProj;
      if (liveProj > 0 && kinds.has('hit_spark')) break;
      await sleep(200);
    }
    kinds = [...kinds];
    const t0 = st.time;
    await sleep(400);
    return { mode: st.mode, dt: st.time - t0, time: st.time, kinds, nProj: nProjMax,
      foes: st.enemies.length };
  })()`, true);
  check('live volley combat: arrows + muzzle/hit_spark fire via TRUE triggers (' + live.kinds.join(',') + ')',
    live.mode === 'playing' && live.nProj > 0 && live.kinds.includes('hit_spark'), live);
  check('live combat shot: clock advances (live game)', live.dt > 0 && live.mode === 'playing', { dt: live.dt, time: live.time });
  const liveFile = await p.shot('slice-j2-1-live-volley');
  console.log('  SHOT slice-j2-1-live-volley -> ' + liveFile);

  // SHOTS 2-5 — grant real weapon instances, spawn live targets, sample until
  // every wanted body is observed mid-flight through the real update paths
  // (retry loop: instant-effect ttls are short, cooldowns are long), then
  // shutter immediately and assert the clock advanced across the shot.
  for (const t of SHOTS) {
    const pre = await p.evaluate(`(async () => {
      const T = (await import('./src/main.js')).__TEST;
      const { makeWeapon } = await import('./src/weapons.js');
      const { makeTypedEnemy } = await import('./src/enemy_types.js');
      T.startRun();
      T.setPilotMode('MANUAL');
      const st = T.state;
      st.spawnTimer = 9999;
      if (st.wave) st.wave.endsAt = st.time + 9999;
      st.enemies.length = 0;
      st.weapons.length = 0;
      for (const id of ${JSON.stringify(t.grant)}) st.weapons.push(makeWeapon(id));
      if (st.player.mana !== undefined && st.player.stats && st.player.stats.maxMana) {
        st.player.mana = st.player.stats.maxMana;   // the pool is full: ZAP may fire
      } else if (st.player.mana !== undefined) { st.player.mana = 999; }
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const e = makeTypedEnemy('GRUNT', st.player.x + Math.cos(a) * 80, st.player.y + Math.sin(a) * 80, st.time);
        e.hp = e.maxHp = 1e9; e.speed = 0;
        st.enemies.push(e);
      }
      return { mode: T.state.mode, t0: T.state.time, granted: st.weapons.map(w => w.type) };
    })()`, true);
    check(t.shot + ': granted real instances (' + (pre.granted || []).join(',') + ')',
      pre.mode === 'playing' && t.grant.every(g => (pre.granted || []).includes(g)), pre);
    // Sample until all wanted bodies are live (up to ~12s: BEAM cd is 4s).
    // The UNION over a 500ms poll window proves each body flew through its
    // true trigger (instant-effect ttls are 0.1-0.35s, so a single snapshot
    // can straddle two fires); the shutter fires immediately after.
    let seen = { proj: [], fx: [] };
    for (let tries = 0; tries < 24; tries++) {
      seen = await p.evaluate(`(async () => {
        const st = (await import('./src/main.js')).__TEST.state;
        const sleep = (ms) => new Promise(r => setTimeout(r, ms));
        const proj = new Set(), fx = new Set();
        for (let i = 0; i < 5; i++) {
          for (const pr of st.projectiles) proj.add(pr.kind || 'volley');
          for (const f of st.effects) fx.add(f.kind);
          await sleep(100);
        }
        return { proj: [...proj], fx: [...fx], time: st.time, mode: st.mode };
      })()`, true);
      const okP = t.wantProj.every(k => seen.proj.includes(k));
      const okF = t.wantFx.every(k => seen.fx.includes(k));
      if (okP && okF) break;
    }
    check(t.shot + ': wanted bodies live via TRUE triggers (proj ' + seen.proj.join(',') +
      ' / fx ' + seen.fx.join(',') + ')',
      t.wantProj.every(k => seen.proj.includes(k)) && t.wantFx.every(k => seen.fx.includes(k)), seen);
    const file = await p.shot(t.shot);
    console.log('  SHOT ' + t.shot + ' -> ' + file);
    const post = await p.evaluate(`(async () => {
      const T = (await import('./src/main.js')).__TEST;
      return { mode: T.state.mode, t1: T.state.time };
    })()`, true);
    check(t.shot + ': clock advances (live game, ' + Number(pre.t0).toFixed(2) + 's -> ' + Number(post.t1).toFixed(2) + 's)',
      post.mode === 'playing' && post.t1 > pre.t0, { dt: post.t1 - pre.t0, time: post.t1 });
  }

  const red = results.filter(r => !r.ok);
  console.log(red.length ? ('capture_slice_j2: ' + red.length + ' FAILED check(s)') : 'capture_slice_j2: all checks passed');
  if (red.length) process.exitCode = 1;
});
