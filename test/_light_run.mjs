// Helper for test/test_light.mjs (not a test; the suite runs test_*.mjs only).
// Plays a seeded run on the Void Reach (a dark stage: the layer is up) with
// the lighting set to argv[2] (ON / LOW / OFF) and prints what happened, so
// the test can compare ON against OFF. Run under test/_seed_random.mjs.
import { boot } from './_harness.mjs';

const h = await boot();
const T = h.T;
T.light.setLighting(process.argv[2] || 'ON');
T.stages.select('VOID_REACH');
T.startRun();
h.skipMovie();
let frames = 0;
for (let i = 0; i < 60 * 45; i++) {
  if (T.state.mode !== 'playing') break;
  h.pump(1);
  frames++;
}
const S = T.state, p = S.player;
const r = (v) => Math.round(v * 1000) / 1000;
console.log(JSON.stringify({
  frames, mode: S.mode, time: r(S.time), hp: r(p.hp), x: r(p.x), y: r(p.y), kills: p.kills,
  enemies: S.enemies.length, gems: S.gems.length, shots: (S.enemyShots || []).length,
  e0: S.enemies[0] ? [r(S.enemies[0].x), r(S.enemies[0].y)] : null,
}));
