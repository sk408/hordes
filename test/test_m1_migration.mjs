// M1 save migration (schema v10 -> v11): every old stat shop row is refunded at
// its v10 price and reset; weapon / elite / character unlocks stay owned; the
// player is told once. Fixtures: a fresh, a mid and a maxed v10 profile.
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';
import {
  loadProfileResult, saveProfile, importProfileText, exportProfileText,
  STORAGE_KEY, PROFILE_VERSION, SHOP_BY_ID, WEAPON_PRICES, ELITE_MODIFIERS,
  bannerSeen, buyUpgrade, upgradeCost, makeProfile,
} from '../src/meta.js';
import { LEGACY_SHOP_V10, refundLegacyShop } from '../src/legacy_shop_v10.js';
import { readFileSync } from 'node:fs';

const S = suite('test_m1_migration');

const mem = (json) => {
  const m = new Map(json ? [[STORAGE_KEY, JSON.stringify(json)]] : []);
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, map: m };
};
const sum = (a) => a.reduce((x, y) => x + y, 0);

// ---- the fixtures: what a v10 build wrote (every field present) ------------
const v10 = (over) => ({ ...makeProfile(), ...over, version: 10 });
const FRESH_V10 = v10({
  gold: 320, purchased: {}, unlockedCharacters: ['KNIGHT'], equippedCharacter: 'KNIGHT',
  unlockedWeapons: ['VOLLEY', 'BOOMERANG'], unlockedElites: [], bestTime: 12,
});
const MID_V10 = v10({
  gold: 500,
  purchased: { dmg: 3, hp: 2, crit: 1, might: 2, slots: 1, focus: 1 },
  unlockedCharacters: ['KNIGHT', 'ROGUE'], equippedCharacter: 'ROGUE',
  unlockedWeapons: ['VOLLEY', 'BOOMERANG', 'ORBIT', 'JAVELIN'], unlockedElites: ['SWIFT'],
  loadout: ['ORBIT', 'JAVELIN'],
  characters: { ROGUE: { upgrades: { rogue_fleet: 2 } } },
  spendLedger: { dmg: [125, 250, 325], hp: [100, 250], weapon_orbit: [200], 'cunlock:ROGUE': [2500] },
  banners: { TOKEN: 1 }, bestTime: 140, runPurse: 0,
});
const MAXED_V10 = v10({
  gold: 1234,
  purchased: Object.fromEntries(Object.entries(LEGACY_SHOP_V10).map(([id, p]) => [id, p.length])),
  unlockedCharacters: ['KNIGHT', 'WITCH', 'ROGUE', 'PALADIN'], equippedCharacter: 'WITCH',
  unlockedWeapons: ['VOLLEY', 'BOOMERANG', ...Object.keys(WEAPON_PRICES)],
  unlockedElites: Object.keys(ELITE_MODIFIERS),
  apex: { owned: ['apex_mark'], enabled: true, unlocked: true },
  bestTime: 1800,
});
// MID_V10 owns SWIFT with no ledger entry and without the 100-kill trophy: it
// was bought before the ledger existed. The elite rows have left the shop, so
// the game (not the migration) refunds it at the row's last price, once.
const ELITE_REFUND = 3000;
const MID_REFUND = 125 + 250 + 325   // dmg 3
  + 100 + 250                        // hp 2
  + 300                              // crit 1
  + 300 + 510                        // might 2 (a removed row)
  + 3000                             // slots 1
  + 200;                             // focus 1
const MAXED_REFUND = sum(Object.values(LEGACY_SHOP_V10).map(sum));

S.check('the legacy table is frozen and covers the 47 v10 stat rows', () => {
  assert.equal(Object.keys(LEGACY_SHOP_V10).length, 47);
  assert.ok(Object.isFrozen(LEGACY_SHOP_V10));
  assert.deepEqual(LEGACY_SHOP_V10.dmg, [125, 250, 325, 650, 1200]);
  assert.equal(LEGACY_SHOP_V10.laststand[0], 4320000);
  assert.equal(MAXED_REFUND, 43690241, 'the v10 stat catalogue summed to 43,690,241 gold');
  assert.equal(PROFILE_VERSION, 13);
});

S.check('refundLegacyShop is pure, clamps levels, and keeps ids it does not know', () => {
  const input = { dmg: 99, hp: -3, crit: 'x', future_row: 4, reroll: 2 };
  const res = refundLegacyShop(input);
  assert.equal(res.gold, sum(LEGACY_SHOP_V10.dmg), 'an over-cap level refunds the whole row, no more');
  assert.equal(res.rows, 1);
  assert.deepEqual(res.purchased, { future_row: 4, reroll: 2 });
  assert.deepEqual(input, { dmg: 99, hp: -3, crit: 'x', future_row: 4, reroll: 2 }, 'input untouched');
});

S.check('FRESH v10 profile: nothing to refund, nothing announced', () => {
  const r = loadProfileResult(mem(FRESH_V10));
  assert.equal(r.status, 'migrated');
  assert.equal(r.profile.version, PROFILE_VERSION);
  assert.equal(r.profile.gold, 320);
  assert.deepEqual(r.profile.purchased, {});
  assert.equal(r.profile.shopRefund, undefined);
  assert.deepEqual(r.profile.unlockedWeapons, ['VOLLEY', 'BOOMERANG']);
});

S.check('MID v10 profile: every stat row refunded at its old price, unlocks kept', () => {
  const r = loadProfileResult(mem(MID_V10));
  const p = r.profile;
  assert.equal(r.status, 'migrated');
  assert.equal(MID_REFUND, 5360);
  assert.equal(p.gold, 500 + MID_REFUND);
  assert.deepEqual(p.purchased, {}, 'changed rows reset to level 0');
  assert.deepEqual(p.shopRefund, { version: 11, gold: MID_REFUND, rows: 6 });
  assert.deepEqual(p.unlockedWeapons, ['VOLLEY', 'BOOMERANG', 'ORBIT', 'JAVELIN']);
  assert.deepEqual(p.unlockedElites, ['SWIFT']);
  assert.deepEqual(p.unlockedCharacters, ['KNIGHT', 'ROGUE']);
  assert.equal(p.equippedCharacter, 'ROGUE');
  assert.deepEqual(p.loadout, ['ORBIT', 'JAVELIN'], 'a stored loadout survives');
  assert.equal(p.characters.ROGUE.upgrades.rogue_fleet, 2, 'per-character upgrades are not shop rows');
  assert.equal(p.spendLedger.dmg, undefined, 'refunded rows leave the sell-back ledger');
  assert.equal(p.spendLedger.hp, undefined);
  assert.deepEqual(p.spendLedger.weapon_orbit, [200], 'unlock ledger entries stay');
  assert.deepEqual(p.spendLedger['cunlock:ROGUE'], [2500]);
  assert.equal(p.banners.TOKEN, 1);
  assert.equal(p.bestTime, 140);
});

S.check('MAXED v10 profile: the whole old catalogue comes back as gold', () => {
  const r = loadProfileResult(mem(MAXED_V10));
  const p = r.profile;
  assert.equal(p.gold, 1234 + MAXED_REFUND);
  assert.deepEqual(p.purchased, {});
  assert.equal(p.shopRefund.rows, 47);
  assert.equal(p.unlockedWeapons.length, 2 + Object.keys(WEAPON_PRICES).length);
  assert.equal(p.unlockedElites.length, 3);
  assert.deepEqual(p.apex.owned, ['apex_mark']);
  // The refund buys the new catalogue back outright.
  let bought = 0;
  for (const id of Object.keys(SHOP_BY_ID)) while (buyUpgrade(p, id)) bought++;
  for (const def of Object.values(SHOP_BY_ID)) {
    if (!def.kind) assert.equal(p.purchased[def.id], def.maxLevel, def.id + ' re-bought to its cap');
  }
  assert.ok(bought > 100 && p.gold > 0);
});

S.check('the refund happens once: a saved v11 profile reloads untouched', () => {
  const store = mem(MID_V10);
  const first = loadProfileResult(store).profile;
  assert.ok(buyUpgrade(first, 'dmg'), 'spend some of the refund on a NEW row level');
  const goldAfterBuy = first.gold;
  assert.equal(goldAfterBuy, 500 + MID_REFUND - upgradeCost(SHOP_BY_ID.dmg, 0));
  saveProfile(first, store);
  const again = loadProfileResult(store);
  assert.equal(again.status, 'current');
  assert.equal(again.profile.gold, goldAfterBuy, 'no second refund');
  assert.equal(again.profile.purchased.dmg, 1, 'a level bought on v11 is kept');
});

S.check('importing a v10 export refunds through the same chain', () => {
  const res = importProfileText(JSON.stringify(MID_V10));
  assert.equal(res.ok, true);
  assert.equal(res.status, 'imported-migrated');
  assert.equal(res.profile.gold, 500 + MID_REFUND);
  const round = importProfileText(exportProfileText(res.profile));
  assert.equal(round.status, 'imported');
  assert.equal(round.profile.gold, 500 + MID_REFUND);
});

S.check('older saves (no version) run the whole chain and are refunded too', () => {
  const r = loadProfileResult(mem({ gold: 10, purchased: { dmg: 2 }, unlockedCharacters: ['KNIGHT'], equippedCharacter: 'KNIGHT' }));
  assert.equal(r.profile.version, PROFILE_VERSION);
  assert.equal(r.profile.gold, 10 + 125 + 250);
  assert.deepEqual(r.profile.purchased, {});
});

// ---- a save file written by the v10 build itself ---------------------------
// test/fixtures/profile_v10_written_by_v10_build.json is the raw storage
// payload the pre-M1 code (6cd4629^) saved after these purchases with its own
// buyUpgrade: dmg x3, hp x2, crit, might x2, slots, potions x2, split x3, luck,
// vampire, three weapons, one elite, the Rogue and one Knight upgrade.
S.check('a real v10 save file: gold + refund add up by hand, and it is refunded once', () => {
  const raw = readFileSync(new URL('./fixtures/profile_v10_written_by_v10_build.json', import.meta.url), 'utf8');
  const before = JSON.parse(raw);
  assert.equal(before.version, 10);
  assert.equal(before.gold, 1951346);
  const paid = (125 + 250 + 325) + (100 + 250) + 300 + (300 + 510) + 3000 + (250 + 375)
    + (400 + 540 + 729) + 14000 + 400;
  assert.equal(paid, 21854);
  assert.equal(paid, sum(Object.entries(before.spendLedger)
    .filter(([k]) => LEGACY_SHOP_V10[k]).map(([, a]) => sum(a))), 'the refund equals what the v10 ledger says was paid');
  const store = { m: new Map([[STORAGE_KEY, raw]]), getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }, setItem(k, v) { this.m.set(k, String(v)); }, removeItem(k) { this.m.delete(k); } };
  const r = loadProfileResult(store);
  assert.equal(r.status, 'migrated');
  assert.deepEqual(r.repairs, [], 'nothing needed repair');
  assert.equal(r.profile.gold, 1951346 + 21854);
  assert.deepEqual(r.profile.shopRefund, { version: 11, gold: 21854, rows: 9 });
  assert.deepEqual(r.profile.purchased, {});
  assert.deepEqual(r.profile.unlockedWeapons, before.unlockedWeapons);
  assert.deepEqual(r.profile.unlockedElites, ['SWIFT']);
  assert.deepEqual(r.profile.unlockedCharacters, ['KNIGHT', 'ROGUE']);
  assert.equal(r.profile.characters.KNIGHT.upgrades.knight_vigor, 1);
  assert.equal(r.profile.bestTime, 412);
  assert.deepEqual(Object.keys(r.profile.spendLedger).sort(),
    ['char:KNIGHT:knight_vigor', 'cunlock:ROGUE', 'elite_swift', 'weapon_javelin', 'weapon_nova_pulse', 'weapon_orbit']);
  // Loading the untouched v10 payload again gives the same gold (not more).
  assert.equal(loadProfileResult(store).profile.gold, 1951346 + 21854);
  // Saved as v11 and reloaded, twice: no further refund.
  saveProfile(r.profile, store);
  const again = loadProfileResult(store);
  assert.equal(again.status, 'current');
  assert.equal(again.profile.gold, 1951346 + 21854);
  saveProfile(again.profile, store);
  assert.equal(loadProfileResult(store).profile.gold, 1951346 + 21854);
});

S.check('a refunded save that lost its version field is not refunded again', () => {
  const first = loadProfileResult(mem(MID_V10)).profile;
  assert.ok(buyUpgrade(first, 'dmg') && buyUpgrade(first, 'hp'));
  const gold = first.gold;
  const stripped = JSON.parse(JSON.stringify(first));
  delete stripped.version;
  const r = loadProfileResult(mem(stripped));
  assert.equal(r.profile.gold, gold, 'the refund marker blocks a second refund');
  assert.equal(r.profile.purchased.dmg, 1, 'levels bought on v11 are kept');
});

// ---- the one-time notice, through the real boot --------------------------
const h = await boot({ storage: [[STORAGE_KEY, JSON.stringify(MID_V10)]], variant: 'mig-mid' });
S.check('the game tells a refunded player once (banner ledger)', () => {
  assert.equal(h.T.save.status, 'migrated');
  assert.ok(/refunded/.test(h.T.save.notice) && h.T.save.notice.includes(String(MID_REFUND)), h.T.save.notice);
  assert.ok(bannerSeen(h.T.getProfile(), 'shop_refund_v11'));
  // The retired elite row is refunded in the same boot and said in the same line.
  assert.ok(h.T.save.notice.includes('THE ELITE UPGRADES LEFT THE SHOP. Refunded: +' + ELITE_REFUND + ' GOLD'), h.T.save.notice);
  assert.equal(h.T.getProfile().gold, 500 + MID_REFUND + ELITE_REFUND);
  assert.deepEqual(h.T.getProfile().unlockedElites, ['SWIFT'], 'the elite stays unlocked');
  assert.ok(bannerSeen(h.T.getProfile(), 'elite_rows_retired'));
  h.T.showTitle();
  assert.ok((h.elements['ov-sub'].innerHTML || '').includes("refunded"), "the title shows the notice");
});
h.T.save.autosave();
const h2 = await boot({ storage: [...h.storage], variant: 'mig-mid-2' });
S.check('a second boot of the migrated save shows no notice and refunds nothing more', () => {
  assert.equal(h2.T.save.status, 'current');
  assert.equal(h2.T.save.notice, null);
  assert.equal(h2.T.getProfile().gold, 500 + MID_REFUND + ELITE_REFUND);
});
const h3 = await boot({ storage: [[STORAGE_KEY, JSON.stringify(FRESH_V10)]], variant: 'mig-fresh' });
S.check('a profile with nothing to refund gets no notice', () => {
  assert.equal(h3.T.save.notice, null);
});

const h4 = await boot({ variant: 'mig-import' });
S.check('importing an old save file in the game announces the refund too, once', () => {
  const res = h4.T.save.importText(JSON.stringify(MID_V10));
  assert.equal(res.ok, true);
  assert.equal(h4.T.getProfile().gold, 500 + MID_REFUND + ELITE_REFUND);
  assert.ok(/refunded/.test(h4.T.save.notice) && h4.T.save.notice.includes(String(MID_REFUND)), h4.T.save.notice);
  assert.ok(h4.T.save.notice.includes('Refunded: +' + ELITE_REFUND + ' GOLD'), h4.T.save.notice);
  const again = h4.T.save.importText(exportProfileText(h4.T.getProfile()));
  assert.equal(again.ok, true);
  assert.equal(h4.T.getProfile().gold, 500 + MID_REFUND + ELITE_REFUND, 're-importing the refunded save adds nothing');
  assert.ok(!/refunded/i.test(h4.T.save.notice), h4.T.save.notice);
});

S.done();
process.exit(0);
