// HORDES - PORT SLICE B capture: every enemy type renders its art in a live run.
// Run: HORDES_SHOT_DIR=docs/art/port-slice-b node tools/capture_slice_b.mjs
// (SHOT_DIR is a relative in-tree path.)
//
// METHOD (the capture_slice_a.mjs pattern): real browser, phone viewport, seed
// hordes_onboarded + all 19 tour keys so no overlay covers the arena, REAL
// tap on START GAME, ASSERT state.time advances (never grade a frozen game).
// Per type: a FRESH run via the game's own startRun (full hp each time), plant
// ONE typed enemy beside the MANUAL pilot via makeTypedEnemy (capture-only —
// no code number changes), ASSERT the live seam (state.enemies carries the
// type + the clock advances), screenshot with the sim running.
import { withPage } from './browser.mjs';
import { mkdirSync } from 'node:fs';

const ART = 'docs/art/port-slice-b';
mkdirSync(ART, { recursive: true });
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok, detail });
  console.log((ok ? '  PASS ' : '  FAIL ') + name + (detail !== undefined ? ' :: ' + JSON.stringify(detail) : ''));
};

const TOUR19 = ['stage1', 'hud', 'pilot', 'focus', 'stance', 'move', 'skills', 'potions',
  'stats', 'cog', 'draft', 'edge', 'chest', 'portal', 'arch', 'shrine',
  'intermission', 'death', 'settings'];

const TARGETS = [
  { type: 'CHASER', shot: 'slice-b-chaser' },
  { type: 'SWARMER', shot: 'slice-b-swarmer' },
  { type: 'BRUTE', shot: 'slice-b-brute' },
  { type: 'SPITTER', shot: 'slice-b-spitter' },
  { type: 'DASHER', shot: 'slice-b-dasher' },
  { type: 'WARLOCK', shot: 'slice-b-warlock' },
  { type: 'TICK', shot: 'slice-b-tick' },
  { type: 'COLOSSUS', shot: 'slice-b-colossus' },
  { type: 'PILLAR', shot: 'slice-b-pillar' },
  { type: 'SHRIKE', shot: 'slice-b-shrike' },
  { type: 'BRUTE', elite: true, shot: 'slice-b-elite-brute' },
  { type: 'GRAVELMAW', boss: true, shot: 'slice-b-boss-gravelmaw' },
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

  for (const t of TARGETS) {
    const planted = await p.evaluate(`(async () => {
      const T = (await import('./src/main.js')).__TEST;
      const ET = await import('./src/enemy_types.js');
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      T.startRun();
      T.setPilotMode('MANUAL');
      const st = T.state;
      st.enemies.length = 0;
      st.player.x = 0; st.player.y = 0;
      st.player.hp = st.player.maxHp;
      let e;
      if (${JSON.stringify(!!t.boss)}) {
        const B = await import('./src/bosses.js');
        e = ET.makeTypedEnemy('BRUTE', 46, -6, 0, {});
        e.boss = true;
        e.bossId = 'GRAVELMAW';
        e.bossSprite = B.BOSS_SPRITES.GRAVELMAW;
        e.w = 24; e.h = 24;
      } else {
        e = ET.makeTypedEnemy(${JSON.stringify(t.type)}, 46, -6, 0, ${t.elite ? '{ elite: true }' : '{}'});
      }
      e.age = 0.35;
      // Capture-only padding so the subject survives the pilot's auto-fire
      // for the shot (no code number changes).
      e.hp = e.maxHp = Math.max(e.maxHp, 5000);
      st.enemies.push(e);
      const t0 = st.time;
      await sleep(700);
      const live = st.enemies.find(x => x === e);
      return { present: !!live, typeId: live && live.typeId, boss: !!(live && live.boss),
        elite: !!(live && live.elite), mode: st.mode, dt: st.time - t0,
        px: Math.round(st.player.x), py: Math.round(st.player.y),
        ex: live ? Math.round(live.x) : null, ey: live ? Math.round(live.y) : null };
    })()`, true);
    const wantType = t.boss ? true : planted.typeId === t.type;
    check(t.shot + ': planted ' + (t.boss ? 'boss GRAVELMAW' : t.type + (t.elite ? ' (elite)' : '')) + ' stands beside the pilot',
      !!planted.present && wantType && planted.mode === 'playing',
      { typeId: planted.typeId, boss: planted.boss, elite: planted.elite, mode: planted.mode, at: [planted.ex, planted.ey] });
    check(t.shot + ': live game (clock advances around the shot)',
      planted.dt > 0, { dt: planted.dt, player: [planted.px, planted.py] });
    const file = await p.shot(t.shot);
    console.log('  SHOT ' + t.shot + ' -> ' + file);
  }
  const red = results.filter(r => !r.ok);
  console.log(red.length ? ('capture_slice_b: ' + red.length + ' FAILED check(s)') : 'capture_slice_b: all checks passed');
  if (red.length) process.exitCode = 1;
});
