// THE CAMP: production worked out from timestamps, storage caps, buying,
// collecting, the run-start charges, and the v12 save migration (empty camp,
// Starting Artifact refunded) from real v10 and v11 save files.
// Run: node test/test_camp.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as META from '../src/meta.js';
import { PRE_UPDATE_KEY, STORAGE_KEY, PROFILE_VERSION, ARTIFACT_V11_PRICES } from '../src/save.js';
import { LEGACY_SHOP_V10 } from '../src/legacy_shop_v10.js';
import {
  CAMP_BUILDINGS, CAMP_STORE_HOURS, CAMP_CLOCK_SLACK_H, emptyCamp, sanitizeCamp, campPending, campCollect, campBuy,
  campSpendCharges, campNextCost, campHasStock, campStockLines,
} from '../src/camp.js';
import { suite } from './_harness.mjs';

const S = suite('test_camp');
const H = 3600 * 1000;
const T0 = 1_800_000_000_000;
const mine = CAMP_BUILDINGS.find(b => b.id === 'mine');
const forge = CAMP_BUILDINGS.find(b => b.id === 'forge');
const prof = (gold = 1e9) => ({ gold, camp: emptyCamp() });

// ---- production maths ----
S.check('an unbuilt camp makes nothing', () => {
  const p = prof();
  const got = campPending(p, T0 + 100 * H);
  assert.equal(got.gold, 0);
  assert.equal(campHasStock(got), false);
});
S.check('the mine makes its hourly rate, floored', () => {
  const p = prof();
  campBuy(p, 'mine', T0);
  assert.equal(campPending(p, T0 + 2 * H).gold, 2 * mine.levels[0].rate);
  assert.equal(campPending(p, T0 + 0.5 * H + 1).gold, Math.floor(0.5 * mine.levels[0].rate));
});
S.check('the mine stops at its storage cap; a very long absence pays the cap, once', () => {
  const p = prof();
  campBuy(p, 'mine', T0);
  const cap = CAMP_STORE_HOURS * mine.levels[0].rate;
  assert.equal(campPending(p, T0 + CAMP_STORE_HOURS * H).gold, cap);
  const year = campPending(p, T0 + 365 * 24 * H);
  assert.equal(year.gold, cap);
  assert.equal(year.goldFull, true);
  const g0 = p.gold;
  campCollect(p, T0 + 365 * 24 * H);
  assert.equal(p.gold - g0, cap);
  assert.equal(campPending(p, T0 + 365 * 24 * H).gold, 0, 'collected: the clock restarts');
});
// ---- the clock: a stamp ahead of it ----
S.check('a stamp a little ahead of the clock waits: nothing is paid or taken, and the stamp holds', () => {
  const p = prof();
  campBuy(p, 'mine', T0);
  campBuy(p, 'forge', T0);
  const slack = CAMP_CLOCK_SLACK_H * H;
  const back = campPending(p, T0 - slack);       // the clock went back, within the slack
  assert.equal(back.gold, 0);
  assert.equal(back.forge, 0);
  const g0 = p.gold;
  assert.equal(campCollect(p, T0 - slack).any, false);
  assert.equal(p.gold, g0);
  assert.equal(p.camp.since.mine, T0, 'the stamp moved');
  assert.equal(p.camp.pulled, undefined, 'a small step back used the pull-back');
  assert.equal(campPending(p, T0 + H).gold, mine.levels[0].rate, 'right again: counted from the old stamp');
});
S.check('a stamp far in the future: production resumes at once, counted from the first look', () => {
  const p = prof();
  campBuy(p, 'mine', T0 + 48 * H);          // bought while the clock ran two days fast
  campBuy(p, 'forge', T0 + 48 * H);
  const first = campPending(p, T0);
  assert.equal(first.gold, 0, 'the correction itself pays nothing');
  assert.equal(campPending(p, T0 + H).gold, mine.levels[0].rate, 'one real hour later: one hour of gold');
  const full = campPending(p, T0 + 9 * H);
  assert.equal(full.gold, CAMP_STORE_HOURS * mine.levels[0].rate);
  assert.equal(full.goldFull, true);
  assert.equal(campPending(p, T0 + forge.levels[0].hours * H).forge, 1, 'the forge charges on time too');
  // COLLECT banks it and the count carries on from there.
  const g0 = p.gold;
  const got = campCollect(p, T0 + 2 * H);
  assert.equal(got.gold, 2 * mine.levels[0].rate);
  assert.equal(p.gold - g0, 2 * mine.levels[0].rate);
  assert.equal(campPending(p, T0 + 2 * H).gold, 0);
  assert.equal(campPending(p, T0 + 3 * H).gold, mine.levels[0].rate);
  // Nothing is lost when the clock reaches the old stamp.
  assert.equal(campPending(p, T0 + 48 * H).gold, CAMP_STORE_HOURS * mine.levels[0].rate);
});
S.check('a max-level charge building with a stamp in the future charges again', () => {
  const p = prof();
  for (let i = 0; i < forge.levels.length; i++) campBuy(p, 'forge', T0);
  assert.equal(campNextCost(p, 'forge'), null);
  const hrs = forge.levels[forge.levels.length - 1].hours;
  campCollect(p, T0 + 100 * H);             // collected while the clock ran fast
  campSpendCharges(p);
  assert.equal(campPending(p, T0 + 1 * H).forge, 0);
  assert.equal(campPending(p, T0 + 1 * H + hrs * H).forge, 1, 'charged ' + hrs + ' h after the first look');
});
S.check('a clock moved forward and back pays one store more, once, however often it is done', () => {
  const p = prof();
  campBuy(p, 'mine', T0);
  const rate = mine.levels[0].rate, cap = CAMP_STORE_HOURS * rate;
  const g0 = p.gold;
  // Collect just short of a full store ahead, set the clock back, look; again and again.
  for (let i = 1; i <= 6; i++) {
    campCollect(p, T0 + CAMP_STORE_HOURS * H - i);
    campPending(p, T0);
  }
  assert.ok(p.gold - g0 <= 2 * cap, 'six cycles paid ' + (p.gold - g0) + ', more than two stores (' + 2 * cap + ')');
  assert.deepEqual(p.camp.pulled, { mine: true });
  // From here the building waits for the clock, as any stamp ahead of it does.
  const stamp = p.camp.since.mine;
  assert.ok(stamp > T0 + 7 * H, 'the stamp went back a second time');
  assert.equal(campPending(p, T0 + H).gold, 0);
  assert.equal(campCollect(p, T0 + 4 * H).any, false);
  assert.equal(campPending(p, stamp + H).gold, rate, 'past the stamp it counts again');
  // A bigger jump changes nothing: the pull-back is spent.
  campCollect(p, T0 + 500 * H);
  const g1 = p.gold;
  for (let i = 0; i < 4; i++) { campPending(p, T0); campCollect(p, T0 + 499 * H); }
  assert.equal(p.gold, g1, 'a second pull-back paid');
  assert.equal(p.camp.since.mine, T0 + 500 * H);
});
S.check('the pull-back is one per building: recorded, kept through a save, never for a small step', () => {
  const p = prof();
  campBuy(p, 'mine', T0 + 48 * H);
  campBuy(p, 'forge', T0);
  assert.equal(p.camp.pulled, undefined, 'a camp with a sane clock has no extra block');
  campPending(p, T0 + 2 * H);
  assert.deepEqual(p.camp.pulled, { mine: true }, 'the forge was not ahead: it keeps its own');
  assert.equal(p.camp.since.mine, T0 + 2 * H);
  assert.equal(p.camp.since.forge, T0);
  const saved = sanitizeCamp(JSON.parse(JSON.stringify(p.camp)));
  assert.equal(saved.dirty, false);
  assert.deepEqual(saved.camp, p.camp);
  // The forge's turn, later.
  campCollect(p, T0 + 300 * H);
  campSpendCharges(p);
  campPending(p, T0 + 3 * H);
  assert.deepEqual(p.camp.pulled, { mine: true, forge: true });
  assert.equal(p.camp.since.forge, T0 + 3 * H);
  // Damaged blocks repair: only `true` flags of real buildings are kept.
  assert.equal(sanitizeCamp({ ...emptyCamp(), pulled: 'x' }).dirty, true);
  assert.equal(sanitizeCamp({ ...emptyCamp(), pulled: 'x' }).camp.pulled, undefined);
  const bad = sanitizeCamp({ ...p.camp, pulled: { mine: 1, forge: true, nope: true } });
  assert.equal(bad.dirty, true);
  assert.deepEqual(bad.camp.pulled, { forge: true });
  assert.deepEqual(Object.keys(sanitizeCamp(emptyCamp()).camp).sort(), Object.keys(emptyCamp()).sort());
});
S.check('a charge building charges after its hours and holds one charge', () => {
  const p = prof();
  campBuy(p, 'forge', T0);
  const hrs = forge.levels[0].hours;
  assert.equal(campPending(p, T0 + (hrs - 0.1) * H).forge, 0);
  assert.equal(campPending(p, T0 + hrs * H).forge, 1);
  assert.equal(campPending(p, T0 + 50 * hrs * H).forge, 1, 'never more than one');
  campCollect(p, T0 + hrs * H);
  assert.equal(p.camp.charges.forge, 1);
  assert.equal(campPending(p, T0 + 3 * hrs * H).forge, 0, 'a held charge blocks the next one');
  assert.deepEqual(campSpendCharges(p), { forge: 1, library: 0, shrine: 0 });
  assert.equal(p.camp.charges.forge, 0);
  assert.deepEqual(campSpendCharges(p), { forge: 0, library: 0, shrine: 0 }, 'spent once');
});
S.check('buying: the price is taken, the level rises, an upgrade collects first', () => {
  const p = prof(400);
  assert.equal(campBuy(p, 'mine', T0).ok, true);
  assert.equal(p.gold, 0);
  assert.equal(campBuy(p, 'mine', T0).reason, 'gold');
  p.gold = mine.levels[1].cost;
  const made = campPending(p, T0 + 2 * H).gold;
  campBuy(p, 'mine', T0 + 2 * H);
  assert.equal(p.camp.levels.mine, 2);
  assert.equal(p.gold, made, 'the stored gold was banked, the price taken');
  for (let i = 2; i < mine.levels.length; i++) { p.gold = 1e9; campBuy(p, 'mine', T0); }
  assert.equal(campNextCost(p, 'mine'), null);
  assert.equal(campBuy(p, 'mine', T0).reason, 'max');
});
S.check('stock lines are short and plain', () => {
  const p = prof();
  campBuy(p, 'mine', T0); campBuy(p, 'library', T0);
  const lines = campStockLines(campPending(p, T0 + 9 * H));
  assert.deepEqual(lines, ['Gold Mine: +' + (CAMP_STORE_HOURS * 150).toLocaleString('en-US') + ' gold (full)', 'Library: one free reroll']);
});
S.check('sanitizeCamp: junk repairs to a clean camp and is reported', () => {
  assert.equal(sanitizeCamp(undefined).dirty, false);
  assert.equal(sanitizeCamp('x').dirty, true);
  const r = sanitizeCamp({ levels: { mine: 99, forge: -2, library: 'a', shrine: 1.7 },
    since: { mine: -5, forge: T0 }, charges: { forge: 7 } });
  assert.equal(r.dirty, true);
  assert.deepEqual(r.camp.levels, { mine: mine.levels.length, forge: 0, library: 0, shrine: 1 });
  assert.equal(r.camp.since.mine, 0);
  assert.equal(r.camp.charges.forge, 1);
  const clean = sanitizeCamp(r.camp);
  assert.equal(clean.dirty, false, 'a clean camp passes unchanged');
});

// ---- save migration ----
function store(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: k => { m.delete(k); } };
}
const raw10 = readFileSync(new URL('./fixtures/profile_v10_written_by_v10_build.json', import.meta.url), 'utf8');
const raw11 = readFileSync(new URL('./fixtures/profile_v11_written_by_v11_build.json', import.meta.url), 'utf8');

S.check('schema is 13', () => assert.equal(PROFILE_VERSION, 13));
S.check('a v10 save: migrates to 12 with an empty camp, and the pre-update copy is kept', () => {
  const s = store({ [STORAGE_KEY]: raw10 });
  const r = META.loadProfileResult(s);
  assert.equal(r.profile.version, 13);
  assert.deepEqual(r.profile.camp, emptyCamp());
  assert.deepEqual(r.migrations, [10, 11, 12]);
  assert.equal(s.getItem(PRE_UPDATE_KEY), raw10, 'schema < 11 still keeps the untouched save');
  assert.equal(r.profile.campRefund, undefined, 'no Starting Artifact on this save, no camp refund');
});
S.check('a v10 save that owned the Starting Artifact is refunded once, at the v10 price', () => {
  const p10 = JSON.parse(raw10);
  p10.purchased.artifact = 2;
  const r = META.loadProfileResult(store({ [STORAGE_KEY]: JSON.stringify(p10) }));
  const plain = META.loadProfileResult(store({ [STORAGE_KEY]: raw10 }));
  assert.equal(r.profile.gold - plain.profile.gold, LEGACY_SHOP_V10.artifact[0] + LEGACY_SHOP_V10.artifact[1]);
  assert.equal(r.profile.purchased.artifact, undefined);
  assert.equal(r.profile.campRefund, undefined, 'v10 -> v11 already paid it');
});
S.check('a v11 save (written by the v11 build): artifact refunded from the ledger, row removed, camp empty', () => {
  const p11 = JSON.parse(raw11);
  assert.equal(p11.version, 11);
  assert.equal(p11.purchased.artifact, 2);
  const s = store({ [STORAGE_KEY]: raw11 });
  const r = META.loadProfileResult(s);
  const paid = p11.spendLedger.artifact.reduce((a, b) => a + b, 0);
  assert.equal(paid, ARTIFACT_V11_PRICES[0] + ARTIFACT_V11_PRICES[1]);
  assert.equal(r.profile.version, 13);
  assert.deepEqual(r.migrations, [11, 12]);
  assert.equal(r.profile.gold, p11.gold + paid);
  assert.equal(r.profile.purchased.artifact, undefined);
  assert.equal(r.profile.spendLedger.artifact, undefined);
  assert.equal(r.profile.purchased.dmg, 1, 'other rows are kept');
  assert.deepEqual(r.profile.campRefund, { version: 12, gold: paid });
  assert.deepEqual(r.profile.camp, emptyCamp());
  assert.equal(s.getItem(PRE_UPDATE_KEY), null, 'a v11 save does not trigger the pre-update copy');
});
S.check('the v12 refund happens once: a saved v12 profile reloads untouched', () => {
  const s = store({ [STORAGE_KEY]: raw11 });
  const r = META.loadProfileResult(s);
  r.profile.camp.levels.mine = 2;
  r.profile.camp.since.mine = T0;
  META.saveProfile(r.profile, s);
  const again = META.loadProfileResult(s);
  assert.equal(again.status, 'current');
  assert.equal(again.profile.gold, r.profile.gold);
  assert.equal(again.profile.camp.levels.mine, 2, 'the camp persists');
  assert.equal(again.profile.camp.since.mine, T0);
  // A camp whose stamp was pulled back keeps that through a save.
  campPending(again.profile, T0 - 5 * H);
  META.saveProfile(again.profile, s);
  const third = META.loadProfileResult(s);
  assert.equal(third.status, 'current');
  assert.ok(!third.repairs.includes('camp'), 'nothing to repair: ' + third.repairs);
  assert.deepEqual(third.profile.camp.pulled, { mine: true });
  assert.equal(third.profile.camp.since.mine, T0 - 5 * H);
  assert.equal(campPending(third.profile, T0 + 2 * H).gold, 7 * mine.levels[1].rate);
});
S.check('a v11 save with no ledger entry is refunded at the v11 list price', () => {
  const p11 = JSON.parse(raw11);
  delete p11.spendLedger.artifact;
  p11.purchased.artifact = 3;
  const r = META.loadProfileResult(store({ [STORAGE_KEY]: JSON.stringify(p11) }));
  assert.equal(r.profile.gold, p11.gold + ARTIFACT_V11_PRICES[0] + ARTIFACT_V11_PRICES[1] + ARTIFACT_V11_PRICES[2]);
});
S.check('a damaged camp in a v12 save repairs and is reported', () => {
  const p = JSON.parse(raw11);
  p.version = 12;
  delete p.purchased.artifact;
  p.camp = { levels: { mine: 'lots' } };
  const r = META.loadProfileResult(store({ [STORAGE_KEY]: JSON.stringify(p) }));
  assert.ok(r.repairs.includes('camp'));
  assert.deepEqual(r.profile.camp, emptyCamp());
});

S.check('a built building whose stamp was lost starts counting from the first look', () => {
  const p = { gold: 0, camp: emptyCamp() };
  p.camp.levels.mine = 1; p.camp.since.mine = 0;
  const t0 = 1.8e12, H = 3600e3;
  assert.equal(campPending(p, t0).gold, 0);
  assert.equal(p.camp.since.mine, t0, 'the first look writes the stamp');
  assert.equal(campPending(p, t0 + 4 * H).gold, 4 * CAMP_BUILDINGS[0].levels[0].rate);
});

S.done();
process.exit(0);
