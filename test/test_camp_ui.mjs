// The camp on the title: the CAMP card appears after two finished runs, the
// camp screen has one card per building, COLLECT and BACK; buying and
// collecting go through the real cards and are saved.
// Run: node test/test_camp_ui.mjs
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';
import { CAMP_BUILDINGS, CAMP_STORE_HOURS } from '../src/camp.js';
import { xpForLevel } from '../src/config.js';

const S = suite('test_camp_ui');
const h = await boot({ storage: [['hordes_onboarded', '1']] });
const T = h.T, st = h.state;
T.banners.suppressAll();
let wall = 1_800_000_000_000;
T.auto.clock = () => wall;
const cards = () => [...h.elements['ov-cards'].children];
const names = () => cards().map(c => ((c.innerHTML || '').match(/class="name">([^<]*)</) || [])[1] || '');
const card = (n) => cards().find(c => ((c.innerHTML || '').match(/class="name">([^<]*)</) || [])[1] === n);
const prof = T.getProfile();

S.check('no CAMP card before two finished runs', () => {
  T.showTitle();
  assert.ok(!names().includes('CAMP'), names().join(','));
});
S.check('after two runs the title has a CAMP card with the strip', () => {
  prof.achievements.totals.runs = 2;
  T.showTitle();
  const c = card('CAMP');
  assert.ok(c, names().join(','));
  assert.ok(/build a gold mine/.test(c.innerHTML));
  assert.ok((c.children || []).some(ch => ch.className === 'camp-strip'), 'the strip canvas rides on the card');
});
S.check('the camp screen: four buildings, COLLECT, BACK', () => {
  card('CAMP').click();
  assert.equal(st.mode, 'menu');
  assert.equal(h.elements['ov-title'].textContent, 'CAMP');
  assert.deepEqual(names(), [...CAMP_BUILDINGS.map(b => b.name), 'COLLECT', 'BACK']);
  assert.ok(/dim/.test(card('COLLECT').className), 'nothing to collect yet');
});
S.check('a building you cannot afford does nothing', () => {
  prof.gold = 100;
  card('GOLD MINE').click();
  assert.equal(prof.camp.levels.mine, 0);
  assert.equal(prof.gold, 100);
});
S.check('buying the mine takes the price, saves, and shows Lv 1', () => {
  prof.gold = 1000;
  T.showTitle(); card('CAMP').click();
  card('GOLD MINE').click();
  assert.equal(prof.camp.levels.mine, 1);
  assert.equal(prof.gold, 1000 - CAMP_BUILDINGS[0].levels[0].cost);
  assert.ok(names().includes('GOLD MINE · Lv 1'), names().join(','));
  const saved = JSON.parse(h.storage.get('hordes_profile_v1'));
  assert.equal(saved.camp.levels.mine, 1, 'saved');
});
S.check('later: the title card says what is ready; COLLECT banks it', () => {
  wall += 3 * 3600 * 1000;
  T.showTitle();
  assert.ok(/\+450 gold ready/.test(card('CAMP').innerHTML), card('CAMP').innerHTML);
  card('CAMP').click();
  const g0 = prof.gold;
  card('COLLECT').click();
  assert.equal(prof.gold - g0, 450);
  assert.ok(/dim/.test(card('COLLECT').className));
  wall += 100 * 3600 * 1000;
  T.showTitle(); card('CAMP').click();
  card('COLLECT').click();
  assert.equal(prof.gold - g0, 450 + CAMP_STORE_HOURS * 150, 'a long absence pays the cap');
  card('BACK').click();
  assert.equal(st.mode, 'title');
});
S.check('a Forge charge levels the first weapon at the next run start, once', () => {
  prof.gold = 1e6;
  T.showTitle(); card('CAMP').click();
  card('FORGE').click();
  wall += 9 * 3600 * 1000;
  T.showTitle(); card('CAMP').click();
  card('COLLECT').click();
  assert.equal(prof.camp.charges.forge, 1);
  T.startRun(); h.pump(1);
  const lead = st.weapons[0].level;
  assert.equal(prof.camp.charges.forge, 0, 'spent');
  T.startRun(); h.pump(1);
  assert.equal(st.weapons[0].level, lead - 1, 'the next run has no charge');
});
S.check('a Library charge adds one reroll to the next run', () => {
  T.startRun();
  const base = st.draftCharges.reroll;
  prof.camp.charges.library = 1;
  T.startRun();
  assert.equal(st.draftCharges.reroll, base + 1);
  assert.equal(prof.camp.charges.library, 0, 'spent');
});
S.check('a Shrine charge opens one joker offer at the start; later drafts still stack', () => {
  const w0 = T.jokers.draftWeight;
  T.jokers.draftWeight = 0;   // no joker cards in the level drafts below
  prof.camp.charges.shrine = 1;
  T.startRun(); h.pump(1);
  assert.equal(prof.camp.charges.shrine, 0, 'spent');
  assert.equal(st.mode, 'draft');
  assert.equal(h.elements['ov-title'].textContent, 'JOKER');
  assert.match(h.elements['ov-sub'].textContent, /^your camp shrine: take 1 joker/);
  cards()[0].click();
  assert.equal(st.mode, 'playing');
  assert.equal(st.pendingDrafts, 0);
  assert.equal(st.jokerOffers, 0);
  // Two level-ups from one gem: both drafts open, one after the other.
  st.enemies.length = 0; st.spawnTimer = 1e9;
  const p = st.player, lv0 = p.level;
  p.xp = p.xpNext + xpForLevel(p.level + 1) + 0.01;
  T.m3.pushGem({ x: p.x, y: p.y, xp: 1e-6 });
  h.pump(1);
  assert.equal(p.level - lv0, 2, 'two levels gained');
  let drafts = 0;
  while (st.mode === 'draft' && drafts < 5) { drafts++; cards()[0].click(); }
  assert.equal(drafts, 2, 'one draft per level');
  assert.equal(st.pendingDrafts, 0);
  T.jokers.draftWeight = w0;
});

S.done();
process.exit(0);
