import { boot } from '/home/claude/projects/hordes/test/_harness.mjs';
import { DEFAULT_STAGE_ID } from '/home/claude/projects/hordes/src/stages.js';

const h = await boot();
const T = h.T, st = T.state;

function cohort(stageId, frames) {
  st.mode = 'menu';
  h.elements['ov-cards'].innerHTML = '';
  T.stages.select(stageId);
  T.startRun();
  const byType = {}, seen = new Set();
  h.pump(frames, () => {
    for (const e of st.enemies) {
      if (seen.has(e)) continue;
      seen.add(e);
      (byType[e.typeId] = byType[e.typeId] || []).push(e);
    }
  });
  return { byType, chests: st.runCounts.chests, time: st.time };
}

const N = 25;
let flake = 0, withChest = 0;
for (let i = 0; i < N; i++) {
  const base = cohort(DEFAULT_STAGE_ID, 900);
  const snow = cohort('SNOWFIELD', 900);
  const sc = snow.byType.CHASER || [], bc = base.byType.CHASER || [];
  const smin = Math.min(...sc.map(e => e.maxHp));
  const bmin = Math.min(...bc.map(e => e.maxHp));
  const ratio = smin / bmin;
  const unstamped = sc.filter(e => e.maxHp === 12).length;
  const hist = {};
  for (const e of sc) hist[e.maxHp] = (hist[e.maxHp] || 0) + 1;
  if (Math.abs(ratio - 1.5) > 1e-9) flake++;
  if (snow.chests > 0) withChest++;
  console.log(`run ${i}: ratio=${ratio} snowMin=${smin} baseMin=${bmin} unstampedSnowCHASERs=${unstamped} snowChests=${snow.chests} baseChests=${base.chests} snowHpHist=${JSON.stringify(hist)}`);
}
console.log(`SUMMARY N=${N} flake=${flake} runsWithSnowChest=${withChest}`);
