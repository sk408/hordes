// HORDES - integ4: the elite hint ("Glowing enemies are elites") rings a real
// elite, never the wave boss. A boss is built on an elite chassis (elite: true)
// but wears its own dark body and rim (bossdark), not the elite gold, so a
// ring on it taught a new player the wrong look. Bosses have their own hints.
// Run: node test/test_elite_hint.mjs
import assert from 'node:assert';
import { suite, boot } from './_harness.mjs';

const s = suite('test_elite_hint');
const h = await boot({ hints: true, storage: [['hordes_onboarded', '1']] });
const T = h.T, st = T.state;
T.banners.suppressAll();
st.mode = 'menu'; T.startRun();
h.pump(5);

// Clear the field of everything another hint could point at.
const clear = () => {
  st.enemies.length = 0; st.chests = []; st.sites = []; st.arches = []; st.portal = null;
  st.secrets = []; st.wave.boss = null; st.wave.midBosses = [];
};
// Pump for a while with the enemies held beside the hero; every hint that comes
// up is read and pressed away, so the next one can show. The ids seen.
const watch = (frames) => {
  const seen = new Set();
  for (let i = 0; i < frames; i++) {
    h.pump(1, () => { for (const e of st.enemies) { e.x = st.player.x + 60; e.y = st.player.y; e.hp = Math.max(e.hp, 1); } });
    const m = T.tut.model;
    if (m && m.id) { seen.add(m.id); T.tut.press(m.shownMs + 2000); }
  }
  return seen;
};
clear();
watch(240);   // let the hints the start of a run brings come and go

s.check('the wave boss on screen does not get the elite hint', () => {
  clear();
  T.bossRules.spawnBoss();
  const boss = st.enemies.find((e) => e.boss);
  assert.ok(boss && boss.elite, 'a boss is built with elite: true');
  st.wave.boss = null;   // keep the boss's own hint out of the way
  const seen = watch(600);
  assert.ok(!seen.has('hint:elite'), 'the elite hint rang the boss: ' + [...seen].join(', '));
});

s.check('a real elite on screen does get it', () => {
  clear();
  T.bossRules.spawnBoss();
  const e = st.enemies.find((x) => x.boss);
  e.boss = false; e.bossSprite = null; e.bossId = null;   // the same chassis, as a plain elite
  st.enemies.length = 0; st.enemies.push(e);
  st.wave.boss = null;
  const seen = watch(600);
  assert.ok(seen.has('hint:elite'), 'the elite hint, got ' + [...seen].join(', '));
});

s.done();
