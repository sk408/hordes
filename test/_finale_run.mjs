// Helper for test/test_finale_arena.mjs (not a test; the suite runs test_*.mjs only).
// Plays a seeded run into the Maw's fight on Whiteout and prints what happened.
// argv[2]: ON (the arena drawn), HELD (the arena held off), OFF (LIGHTING OFF).
// Run under test/_seed_random.mjs.
import { boot } from './_harness.mjs';

const h = await boot();
const T = h.T;
const how = process.argv[2] || 'ON';
T.light.setLighting(how === 'OFF' ? 'OFF' : 'ON');
if (how === 'HELD') T.renderer.light.arenaK = () => 0;
T.stages.select('WHITEOUT');
T.startRun();
h.skipMovie();
for (let i = 0; i < 60 * 8 && T.state.mode === 'playing'; i++) h.pump(1);
const S = T.state, p = S.player;
S.wave.num = 10;
T.deathCine.startFinale();
let frames = 0, mawShots = 0;
for (let i = 0; i < 60 * 20; i++) {
  if (S.mode !== 'finale') break;
  p.hp = Math.max(p.hp, 1);
  h.pump(1);
  frames++;
  mawShots = Math.max(mawShots, (S.enemyShots || []).filter((s) => s.kind === 'maw').length);
}
const r = (v) => Math.round(v * 1000) / 1000;
const b = S.finalBoss;
console.log(JSON.stringify({
  frames, mode: S.mode, time: r(S.time), hp: r(p.hp), x: r(p.x), y: r(p.y), mawShots,
  maw: b ? [r(b.x), r(b.y), r(b.hp), r(b.age)] : null, shots: (S.enemyShots || []).length,
  s0: S.enemyShots && S.enemyShots[0] ? [r(S.enemyShots[0].x), r(S.enemyShots[0].y)] : null, mask: S.volleyMask,
}));
