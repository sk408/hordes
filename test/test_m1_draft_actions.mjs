// M1 draft actions: REROLL / SKIP / BANISH on the level-up draft. Charges are
// per run, granted by the shop rows reroll / skip / banish.
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';
import { applyMetaBonuses, SHOP_BY_ID } from '../src/meta.js';
import { DRAFT_ACTIONS } from '../src/config.js';

const S = suite('test_m1_draft_actions');
const h = await boot();
const T = h.T, st = h.state;
const prof = T.getProfile();
const cards = () => h.elements['ov-cards'].children;
const offers = () => cards().map(c => c._draftOffer);
const buttons = () => (T.draftActions.el ? T.draftActions.el.children : []);
const openOne = () => { st.pendingDrafts = 1; T.openDraft(); };
const start = (levels) => {
  for (const id of ['reroll', 'skip', 'banish']) delete prof.purchased[id];
  Object.assign(prof.purchased, levels);
  T.startRun(); h.pump(1);
  st.enemies.length = 0; st.spawnTimer = 1e9;
};

S.check('the shop rows grant the per-run charges', () => {
  const s = applyMetaBonuses({ damage: 1, maxHp: 1, maxMana: 1 }, { reroll: 3, skip: 2, banish: 1 });
  assert.deepEqual([s.draftRerolls, s.draftSkips, s.draftBanishes], [3, 2, 1]);
  for (const id of ['reroll', 'skip', 'banish']) assert.ok(SHOP_BY_ID[id].maxLevel >= 2, id);
  start({ reroll: 2, skip: 1, banish: 1 });
  assert.deepEqual({ ...T.draftActions.charges }, { reroll: 2, skip: 1, banish: 1 });
});

S.check('a profile that owns none sees no buttons and the keys do nothing', () => {
  start({});
  openOne();
  assert.equal(T.draftActions.el, null);
  const before = offers().map(o => o.id).join();
  h.key('keydown', { key: 'r' }); h.key('keydown', { key: 's' }); h.key('keydown', { key: 'b' });
  assert.equal(st.mode, 'draft');
  assert.equal(offers().map(o => o.id).join(), before);
  cards()[0].click();
  assert.equal(st.mode, 'playing');
});

S.check('REROLL spends a charge and presents a fresh draft; none left = no-op', () => {
  start({ reroll: 2 });
  openOne();
  assert.equal(buttons().length, 3, 'the three buttons sit under the cards');
  assert.ok(/REROLL \[R\] x2/.test(buttons()[0].textContent));
  h.key('keydown', { key: 'r' });
  assert.equal(st.mode, 'draft');
  assert.equal(T.draftActions.charges.reroll, 1);
  assert.equal(st.pendingDrafts, 1, 'a reroll does not consume the draft');
  assert.ok(cards().length >= 3);
  buttons()[0].click();                           // click/touch path
  assert.equal(T.draftActions.charges.reroll, 0);
  assert.equal(T.draftActions.reroll(), false);
  assert.equal(st.mode, 'draft');
  cards()[0].click();
  assert.equal(st.mode, 'playing');
});

S.check('SKIP takes no card, heals a share of max HP and closes the draft', () => {
  start({ skip: 1 });
  const p = st.player;
  p.hp = 10;
  const stats0 = JSON.stringify(p.stats), levels0 = st.weapons.map(w => w.level || 1).join();
  openOne();
  h.key('keydown', { key: 's' });
  assert.equal(st.mode, 'playing');
  assert.equal(st.pendingDrafts, 0);
  assert.equal(T.draftActions.charges.skip, 0);
  assert.equal(p.hp, 10 + DRAFT_ACTIONS.SKIP_HEAL_FRAC * p.stats.maxHp);
  assert.equal(JSON.stringify(p.stats), stats0, 'no card effect landed');
  assert.equal(st.weapons.map(w => w.level || 1).join(), levels0);
  assert.equal(T.draftActions.el, null, 'the buttons leave with the draft');
  openOne();
  h.key('keydown', { key: 's' });
  assert.equal(st.mode, 'draft', 'no charge left: the draft stays');
  cards()[0].click();
});

S.check('BANISH: arm, choose a card, and it never comes back this run', () => {
  start({ banish: 1 });
  openOne();
  h.key('keydown', { key: 'b' });
  assert.equal(T.draftActions.armed, true);
  h.key('keydown', { key: 'Escape' });
  assert.equal(T.draftActions.armed, false, 'ESC disarms');
  h.key('keydown', { key: 'b' });
  const victim = offers()[1];
  const key = T.draftActions.banKey(victim);
  h.key('keydown', { key: '2' });                 // the digit banishes while armed
  assert.equal(st.mode, 'draft', 'the draft is redrawn, not consumed');
  assert.equal(st.pendingDrafts, 1);
  assert.equal(T.draftActions.charges.banish, 0);
  assert.equal(T.draftActions.armed, false);
  assert.ok(T.draftActions.banned.has(key));
  for (let i = 0; i < 60; i++) {
    assert.ok(!offers().some(o => T.draftActions.banKey(o) === key), 'banished card offered again');
    T.openDraft();
  }
  h.key('keydown', { key: 'b' });
  assert.equal(T.draftActions.armed, false, 'no charge left: cannot arm');
  cards()[0].click();
  assert.equal(st.mode, 'playing');
});

S.check("a weapon's level-up cards are banished as one line", () => {
  assert.equal(T.draftActions.banKey({ id: 'lvl_NOVA_PULSE_3' }), 'lvl_NOVA_PULSE');
  assert.equal(T.draftActions.banKey({ id: 'lvl_VOLLEY_1' }), T.draftActions.banKey({ id: 'lvl_VOLLEY_7' }));
  assert.equal(T.draftActions.banKey({ id: 'dmg' }), 'dmg');
});

S.check('charges and banishments are per run', () => {
  start({ reroll: 1, banish: 1 });
  assert.deepEqual({ ...T.draftActions.charges }, { reroll: 1, skip: 0, banish: 1 });
  assert.equal(T.draftActions.banned.size, 0);
});

S.check('the AUTO auto-pick takes a card and never spends a charge', () => {
  start({ reroll: 2, skip: 2, banish: 2 });
  T.draftAuto.rng = () => 0;
  const n0 = T.draftAuto.count;
  openOne();
  h.pump(60 * 8);                                  // past the auto-pick window
  assert.equal(T.draftAuto.count, n0 + 1);
  assert.equal(st.mode, 'playing');
  assert.deepEqual({ ...T.draftActions.charges }, { reroll: 2, skip: 2, banish: 2 });
});

for (const id of ['reroll', 'skip', 'banish']) delete prof.purchased[id];
S.done();
process.exit(0);
