// M2 perf probe: canvas draw calls (fillRect + drawImage) per rendered frame
// at fixed enemy counts, through the real renderer under the headless
// harness. `--cache` installs a counting canvas factory so the sprite cache
// runs its drawImage path instead of the headless fillRect fallback.
//   node tools/m2_drawcalls.mjs [--cache] [--breakdown]
import { boot } from '../test/_harness.mjs';

const useCache = process.argv.includes('--cache');
const breakdown = process.argv.includes('--breakdown');
const h = await boot({ measurement: false });
const { T, state, rec } = h;
if (useCache) {
  const sc = await import('../src/sprite_cache.js');
  sc.SPRITE_CACHE_TEST.forceFakeCanvas();
}
const { makeTypedEnemy } = await import('../src/enemy_types.js');
T.startRun();
h.pump(30);

function fill(n) {
  state.enemies.length = 0;
  const p = state.player; let s = 7;
  const r = () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296;
  const ids = ['CHASER', 'CHASER', 'CHASER', 'SWARMER', 'SWARMER', 'BRUTE', 'SPITTER', 'DASHER', 'TICK', 'WARLOCK'];
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, d = 40 + r() * 190;
    const e = makeTypedEnemy(ids[i % ids.length], p.x + Math.cos(a) * d, p.y + Math.sin(a) * d * 0.7, state.time, { elite: i % 97 === 0 });
    e.age = r(); e.hp = e.maxHp = 1e6; e.speed = 0;
    if (i % 5 === 0) e.hp = e.maxHp * 0.5;
    if (i % 11 === 0) e.flash = 1;
    state.enemies.push(e);
  }
}
function frameOps() {
  rec.rects.length = 0; rec.on = true;
  T.renderer.render(state, state.cam);
  rec.on = false;
  return rec.rects.length;
}
const out = {};
for (const n of [0, 100, 300, 1000, 2000]) {
  fill(n);
  out[n] = frameOps();
}
console.log((useCache ? 'cache ON ' : 'cache OFF') + ' draw calls/frame by enemy count: ' + JSON.stringify(out));
if (breakdown) {
  fill(0);
  const R = T.renderer, per = {};
  for (const m of ['drawGround', 'drawLandmarks', 'drawRelief', 'drawTerrace', 'drawArenaWall', 'drawPlayHud', 'drawWeatherParticles', 'drawWeatherSky']) {
    const orig = R[m].bind(R);
    R[m] = (...a) => { const b = rec.rects.length; const v = orig(...a); per[m] = (per[m] || 0) + rec.rects.length - b; return v; };
  }
  const total = frameOps();
  console.log('breakdown (0 enemies):', JSON.stringify(per), 'total', total);
}
process.exit(0);
