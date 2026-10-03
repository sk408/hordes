// HORDES - travel: after waves 2 and 4 the portal leads on to another stage.
//   pure:  which waves travel, the pool (unlocked stages and the next one),
//          the seeded order, where the portal leads
//   live:  the intermission's cards; CONTINUE moves the run (new stage, new
//          field, the hero at the centre, loot brought along) and keeps the
//          build, the quests, the boss rules and the tallies; STAY HERE keeps
//          the field; the end screen names the journey
// Run: node test/test_travel.mjs
import assert from 'node:assert';
import { suite, boot } from './_harness.mjs';
import { TRAVEL, TRAVEL_HINT, travelDue, travelPool, rollTravelOrder, travelDestination } from '../src/travel.js';
import { STAGES, STAGE_IDS, DEFAULT_STAGE_ID, stageOf } from '../src/stages.js';
import { mulberry32, sitesUsed } from '../src/sites.js';
import { buildingRects } from '../src/stage_buildings.js';
import { HINTS } from '../src/tutorial.js';
import { CONFIG as C } from '../src/config.js';

const s = suite('test_travel');
const END = C.ESCALATION.END_WAVE;

// ------------------------------------------------------------- pure
s.check('the portal leads on after waves 2 and 4, never on the maw\'s wave or after it', () => {
  assert.equal(TRAVEL.EVERY, 2);
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8].map(w => travelDue(w, END)),
    [false, true, false, true, false, false, false, false]);
  assert.equal(travelDue(0, END), false);
});

s.check('the pool: every unlocked stage and the first locked one after them', () => {
  const only = (ids) => (id) => ids.includes(id);
  assert.deepEqual(travelPool(only([STAGE_IDS[0]])), STAGE_IDS.slice(0, 2), 'a new profile looks one stage ahead');
  assert.deepEqual(travelPool(only(STAGE_IDS.slice(0, 3))), STAGE_IDS.slice(0, 4));
  assert.deepEqual(travelPool(() => true), STAGE_IDS, 'everything unlocked: every stage');
  assert.deepEqual(travelPool(only([STAGE_IDS[0], STAGE_IDS[2]])), [STAGE_IDS[0], STAGE_IDS[2], STAGE_IDS[3]]);
});

s.check('the order is the pool shuffled by the seed', () => {
  const a = rollTravelOrder(mulberry32(5), () => true), b = rollTravelOrder(mulberry32(5), () => true);
  assert.deepEqual(a, b);
  assert.deepEqual(a.slice().sort(), STAGE_IDS.slice().sort());
  const seen = new Set();
  for (let i = 1; i <= 30; i++) seen.add(rollTravelOrder(mulberry32(i), () => true).join());
  assert.ok(seen.size > 20);
});

s.check('the destination: the first stage not visited yet, else another one; never the current', () => {
  const order = ['C', 'A', 'B'];
  assert.equal(travelDestination(order, 'A', ['A']), 'C');
  assert.equal(travelDestination(order, 'C', ['A', 'C']), 'B');
  assert.equal(travelDestination(order, 'B', ['A', 'C', 'B']), 'C', 'all seen: a new field of an old stage');
  assert.equal(travelDestination(['A'], 'A', ['A']), null);
  assert.equal(travelDestination(null, 'A', []), null);
});

s.check('a tally of sites adds onto the fields before it', () => {
  const used = [{ kind: 'altar', state: 'spent' }, { kind: 'brazier', state: 'spent' }, { kind: 'shrine', state: 'unused' }];
  const one = sitesUsed(used);
  assert.deepEqual([one.altar, one.brazier, one.shrine, one.total], [1, 1, 0, 2]);
  const two = sitesUsed(used, one);
  assert.deepEqual([two.altar, two.brazier, two.total], [2, 2, 4]);
  assert.deepEqual(one.total, 2, 'the earlier tally is not changed');
});

s.check('the first-time hint is the sentence in the hint book', () => {
  assert.equal(HINTS.travel.text, TRAVEL_HINT);
});

// ------------------------------------------------------------- live
const h = await boot({ storage: [['hordes_onboarded', '1']] });
const T = h.T, st = T.state;
T.banners.suppressAll();
const cards = () => h.elements['ov-cards'].children;
const card = (re) => cards().find(c => re.test(c.innerHTML || ''));
// A fresh run parked in the intermission after `wave`.
const atIntermission = (wave) => {
  st.mode = 'menu'; T.startRun();
  st.enemies.length = 0;
  st.wave.num = wave;
  st.wave.cinePending = false;
  T.travel.intermission();
  assert.equal(st.mode, 'intermission');
};

s.check('a new run: an order to travel in, one stage seen, and no travel after wave 1', () => {
  atIntermission(1);
  assert.equal(st.stage, DEFAULT_STAGE_ID);
  assert.deepEqual(st.stagesSeen, [DEFAULT_STAGE_ID]);
  assert.ok(st.travelOrder.length >= 2 && st.travelOrder.includes(STAGE_IDS[1]), 'a new profile can look one stage ahead');
  assert.equal(T.travel.target(), null);
  assert.ok(card(/>CONTINUE</) && /into wave 2/.test(card(/>CONTINUE</).innerHTML));
  assert.equal(card(/STAY HERE/), undefined);
});

s.check('after wave 2 CONTINUE names where the portal leads, and STAY HERE is offered', () => {
  atIntermission(2);
  const dest = T.travel.target();
  assert.ok(dest && dest !== st.stage);
  const c = card(/>CONTINUE</);
  assert.ok(c.innerHTML.includes('the portal leads on to ' + stageOf(dest).name), c.innerHTML);
  assert.ok(c.innerHTML.includes(stageOf(dest).blurb));
  assert.ok(/wave 3/.test(c.innerHTML));
  assert.ok(/keep this field \(VERDANT HOLLOW\)/.test(card(/STAY HERE/).innerHTML));
  assert.equal(cards().indexOf(c), 0, 'CONTINUE is the first card (the key and the idle pick)');
});

s.check('CONTINUE travels: a new stage and field, the hero at the centre, the run carried over', () => {
  atIntermission(2);
  const dest = T.travel.target();
  const p = st.player;
  const before = { seed: st.groundSeed, atlas: st.atlas, sites: st.sites, quests: st.quests, order: st.bossRuleOrder,
    level: p.level, weapons: st.weapons.length, time: st.time, poi: st.poi };
  st.quests[0].n = 1;
  p.x += 300; p.y -= 200;
  // One brazier was broken on the first field.
  const br = st.sites.find(x => x.kind === 'brazier'); br.state = 'spent';
  st.toasts.length = 0;
  card(/>CONTINUE</).click();
  assert.equal(st.mode, 'playing');
  assert.equal(st.stage, dest);
  assert.deepEqual(st.stagesSeen, [DEFAULT_STAGE_ID, dest]);
  assert.equal(st.wave.num, 3);
  assert.notEqual(st.groundSeed, before.seed, 'a new field');
  assert.notEqual(st.atlas, before.atlas, 'the map starts again');
  assert.notEqual(st.sites, before.sites);
  assert.notEqual(st.poi, before.poi);
  assert.ok(st.sites.length > 5 && st.sites.every(x => x.state !== 'spent'), 'fresh sites');
  assert.deepEqual([p.x, p.y], [C.VIEW_W / 2, C.VIEW_H / 2]);
  assert.deepEqual([st.cam.x, st.cam.y], [0, 0]);
  assert.equal(st.quests, before.quests, 'the quests carry over');
  assert.equal(st.quests[0].n, 1);
  assert.equal(st.bossRuleOrder, before.order, 'so do the boss rules');
  assert.ok(st.bossRule && !st.bossRule.live, 'wave 3 has its rule');
  assert.deepEqual([p.level, st.weapons.length, st.time], [before.level, before.weapons, before.time]);
  assert.equal(st.sitesBefore.brazier, 1, 'what the first field gave is kept');
  // The feed holds three lines. When the run's board has "reach wave 3", that
  // quest finishes on arrival and its line pushes the oldest (the portal's)
  // out; the wave line names the stage either way. (This check failed about
  // one run in eight on the board roll before it allowed for that.)
  const msgs = st.toasts.map(t => t.msg);
  assert.ok(msgs.includes('THE PORTAL LEADS ON: ' + stageOf(dest).name) || msgs.some(m => /^QUEST DONE/.test(m)), JSON.stringify(msgs));
  assert.ok(msgs.includes('WAVE 3 - ' + stageOf(dest).name), JSON.stringify(msgs));
  // The new field belongs to the new stage: its buildings and its enemy pool.
  assert.ok(buildingRects(st.groundSeed, st.stage).length > 0);
  for (let i = 0; i < 30; i++) h.pump(1, () => { p.hp = p.stats.maxHp; });
  assert.equal(st.mode, 'playing', 'the run plays on');
});

s.check('STAY HERE keeps the stage, the field and the map', () => {
  atIntermission(2);
  const seed = st.groundSeed, atlas = st.atlas, sites = st.sites;
  card(/STAY HERE/).click();
  assert.equal(st.mode, 'playing');
  assert.equal(st.wave.num, 3);
  assert.deepEqual([st.stage, st.groundSeed], [DEFAULT_STAGE_ID, seed]);
  assert.equal(st.atlas, atlas);
  assert.equal(st.sites, sites);
  assert.deepEqual(st.stagesSeen, [DEFAULT_STAGE_ID]);
});

s.check('loot left on the field arrives round the hero, clear of buildings', () => {
  atIntermission(2);
  const p = st.player;
  st.chests.push({ x: p.x + 900, y: p.y - 700, age: 0 });
  st.gems.push({ x: p.x - 800, y: p.y + 600, xp: 5, age: 0 });
  st.drops.push({ x: p.x + 1000, y: p.y + 1000, kind: 'hp', age: 0 });
  st.itemDrops.push({ x: p.x - 1100, y: p.y - 900, item: { name: 'x', affixes: [] }, age: 0 });
  const loot = [st.chests[st.chests.length - 1], st.gems[st.gems.length - 1], st.drops[st.drops.length - 1], st.itemDrops[st.itemDrops.length - 1]];
  T.run.nextWave();
  const rects = buildingRects(st.groundSeed, st.stage);
  for (const o of loot) {
    assert.ok(Math.hypot(o.x - p.x, o.y - p.y) < 120, 'near the hero: ' + Math.round(Math.hypot(o.x - p.x, o.y - p.y)));
    assert.ok(!rects.some(q => o.x > q.x && o.x < q.x + q.w && o.y > q.y && o.y < q.y + q.h), 'not inside a building');
  }
});

s.check('the plain continue (the key, auto-continue, the simulator) travels too', () => {
  atIntermission(2);
  const dest = T.travel.target();
  T.run.nextWave();
  assert.equal(st.stage, dest);
});

s.check('after wave 4 the portal leads to a stage the run has not seen; waves 3 and 5 do not travel', () => {
  atIntermission(2);
  T.travel.order = [STAGE_IDS[1], STAGE_IDS[0], STAGE_IDS[2]];
  T.run.nextWave();
  assert.equal(st.stage, STAGE_IDS[1]);
  st.mode = 'playing'; T.travel.intermission();   // wave 3 cleared
  assert.equal(T.travel.target(), null);
  assert.equal(card(/STAY HERE/), undefined);
  T.run.nextWave();
  st.mode = 'playing'; T.travel.intermission();   // wave 4 cleared
  assert.equal(T.travel.target(), STAGE_IDS[2]);
  T.run.nextWave();
  assert.deepEqual(st.stagesSeen, [STAGE_IDS[0], STAGE_IDS[1], STAGE_IDS[2]]);
  assert.equal(st.wave.num, 5);
  st.mode = 'playing'; T.travel.intermission();   // wave 5: the maw's wave
  assert.equal(T.travel.target(), null);
});

s.check('a portal that leads back says so: a new field of a stage seen before, in plain words for the first stage', () => {
  atIntermission(2);
  T.travel.order = [STAGE_IDS[1], STAGE_IDS[0]];
  T.run.nextWave();                               // on stage 2 now
  T.run.nextWave();                               // wave 4
  st.mode = 'playing'; T.travel.intermission();
  assert.equal(T.travel.target(), STAGE_IDS[0], 'nothing unseen is left: back to the first stage');
  const html = card(/>CONTINUE</).innerHTML;
  assert.ok(html.includes('the portal leads on to a new field of VERDANT HOLLOW: a mixed horde, no twist'), html);
  assert.ok(!html.includes('the game as designed'));
  const seed = st.groundSeed;
  T.run.nextWave();
  assert.equal(st.stage, STAGE_IDS[0]);
  assert.notEqual(st.groundSeed, seed, 'a new field, not the one the run began on');
});

s.check('the end screen names the journey; a run that stayed shows its one stage as before', () => {
  atIntermission(2);
  const dest = T.travel.target();
  T.run.nextWave();
  const html = T.endScreenBody({ lead: 'x', gold: 0, firstClear: false });
  assert.ok(html.includes('VERDANT HOLLOW &gt; ' + stageOf(dest).name), html.slice(0, 200));
  atIntermission(1);
  const plain = T.endScreenBody({ lead: 'x', gold: 0, firstClear: false });
  assert.ok(!plain.includes('VERDANT HOLLOW'), 'the default stage alone is not tagged');
});

s.check('a new run starts where the player chose, with nothing kept from the journey', () => {
  atIntermission(2);
  T.run.nextWave();
  st.mode = 'menu'; T.startRun();
  assert.equal(st.stage, DEFAULT_STAGE_ID);
  assert.deepEqual(st.stagesSeen, [DEFAULT_STAGE_ID]);
  assert.equal(st.sitesBefore, null);
});

s.done();
