// WHAT A TROPHY GIVES IS SAID WHERE THE PLAYER SEES IT (2026-10-03).
//
// Steve, on the live build: "it seems like the elites upgrades in the shop
// purchase themselves for some reason". They did: the 100-kill trophy gave the
// Swift Elites shop row for nothing in a player's first run or two, the only
// notice was a toast the end screen wipes, and the shop then read OWNED.
//
//   - The elite modifiers are not shop rows any more. The kill trophies bring
//     them, and the end card says so as a NEW THREAT.
//   - A trophy that gives a shop row (a weapon) names it on the end card, and
//     the shop card reads OWNED · trophy reward.
//   - What a profile paid for an elite row comes back, once, with a notice.
// Run: node test/test_trophy_notice.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { boot, suite } from './_harness.mjs';
import { SHOP_UPGRADES, SHOP_BY_ID, ELITE_MODIFIERS, WEAPON_PRICES, STORAGE_KEY } from '../src/meta.js';
import { TROPHY_ART } from '../src/art/index.js';
import { ACHIEVEMENT_BY_ID } from '../src/achievements.js';

const S = suite('test_trophy_notice');
const h = await boot({ storage: [['hordes_onboarded', '1']] });
const { T, state: st, elements: el, pump } = h;
T.banners.suppressAll();
const prof = T.getProfile();
const sub = () => el['ov-sub'].innerHTML || '';
const cards = () => el['ov-cards'].children;
const cardNamed = (name) => [...cards()].find(c => (c.innerHTML || '').includes('>' + name + '<')) || null;
const quiet = () => { st.spawnTimer = 1e9; st.wave.endsAt = st.time + 1e9; st.enemies.length = 0; };
// A run that ends with these numbers, through the real death funnel.
function runEnding({ kills = 0, bossKills = 0 }) {
  T.startRun();
  pump(3);
  quiet();
  assert.equal(st.mode, 'playing');
  st.player.kills = kills;
  st.runCounts.bossKills = bossKills;
  T.die();
  for (let i = 0; i < 6 && st.mode !== 'dead'; i++) { h.key('keydown', { key: 'x', preventDefault() {} }); pump(2); }
  assert.equal(st.mode, 'dead', 'the end card is up');
  return sub();
}

S.check('the shop sells no elite modifier', () => {
  assert.ok(!SHOP_UPGRADES.some(r => r.kind === 'elite' || /elite/i.test(r.id) || / Elites$/.test(r.name)));
  T.shop.open();
  const names = [...cards()].map(c => (c.innerHTML || ''));
  assert.ok(names.length >= SHOP_UPGRADES.length, 'the shop is open (' + names.length + ' cards)');
  assert.ok(!names.some(n => /Elites/.test(n)), 'no card names an elite upgrade');
  T.showTitle();
});

S.check('a trophy that gives nothing is named on the end card, with no reward or threat line', () => {
  const html = runEnding({ kills: 40 });        // the first kill ever: FIRST_BLOOD
  const name = TROPHY_ART.FIRST_BLOOD.name;
  assert.ok(html.includes('<span class="earn">TROPHY: ' + name + '</span>'), html);
  assert.ok(!/TROPHY REWARD|NEW THREAT/.test(html), html);
  assert.deepEqual(st.runTrophies, { earned: [name], granted: [], threats: [] });
  assert.deepEqual(prof.unlockedElites, []);
});

S.check('the 100-kill trophy: the end card names it and the threat it brings, in plain words', () => {
  const gold0 = prof.gold;
  const html = runEnding({ kills: 60 });        // 40 + 60 = 100 across the two runs
  assert.ok(prof.unlockedElites.includes('SWIFT'), 'the trophy brought SWIFT');
  const name = TROPHY_ART.KILLS_100.name;
  assert.ok(html.includes('<span class="earn">TROPHY: ' + name + '</span>'), html);
  assert.ok(html.includes('<span class="cause">NEW THREAT: ' + ELITE_MODIFIERS.SWIFT.desc + '</span>'), html);
  assert.ok(!/TROPHY REWARD/.test(html), 'a threat is not called a reward: ' + html);
  assert.ok(!/gold|shop/i.test(ELITE_MODIFIERS.SWIFT.desc), 'and the line carries no shop talk');
  assert.deepEqual(st.runTrophies.threats, [ELITE_MODIFIERS.SWIFT.desc]);
  // The lines sit before the BUY NEXT goal, after the gold.
  assert.ok(html.indexOf('GOLD EARNED') < html.indexOf('TROPHY: ') && (html.indexOf('BUY NEXT') < 0 || html.indexOf('TROPHY: ') < html.indexOf('BUY NEXT')));
  // The trophy moved no gold beyond what the run paid.
  assert.equal(prof.gold - gold0, st.runSettled.gold);
  // The card is rebuilt from state after a visit to the shop: the lines survive.
  cardNamed('SHOP').click();
  assert.equal(st.mode, 'menu');
});

S.check('a run with no trophy has no trophy line, and one already earned is not announced twice', () => {
  const html = runEnding({ kills: 5 });
  assert.ok(!/TROPHY|NEW THREAT/.test(html), html);
  assert.deepEqual(st.runTrophies, { earned: [], granted: [], threats: [] });
  assert.equal(prof.unlockedElites.filter(e => e === 'SWIFT').length, 1);
});

S.check('a trophy that gives a weapon: named FREE on the end card, and the shop says where it came from', () => {
  const ach = ACHIEVEMENT_BY_ID.FIRST_BOSS;
  assert.deepEqual(ach.unlock, { kind: 'shopRow', id: 'weapon_orbit' });
  const row = SHOP_BY_ID.weapon_orbit;
  assert.ok(!prof.unlockedWeapons.includes('ORBIT'));
  const gold0 = prof.gold;
  const html = runEnding({ kills: 3, bossKills: 1 });
  assert.ok(prof.unlockedWeapons.includes('ORBIT'), 'granted');
  assert.ok(html.includes('TROPHY: ' + TROPHY_ART.FIRST_BOSS.name), html);
  assert.ok(html.includes('<span class="next">TROPHY REWARD, FREE: ' + row.name + '</span>'), html);
  assert.ok(!/NEW THREAT/.test(html));
  assert.equal(prof.gold - gold0, st.runSettled.gold, 'free: no gold left the bank for it');
  // In the shop: OWNED, and why.
  T.shop.open();
  const orbit = cardNamed(row.name);
  assert.ok(orbit, 'the row is on the page');
  assert.match(orbit.innerHTML, /OWNED( · trophy reward|·TROPHY)/, orbit.innerHTML);
  // A weapon bought with gold, with no trophy behind it, reads plain OWNED.
  const paid = SHOP_UPGRADES.find(r => r.kind === 'weapon' && !prof.unlockedWeapons.includes(r.weaponId) &&
    !Object.values(ACHIEVEMENT_BY_ID).some(a => a.unlock && a.unlock.kind === 'shopRow' && a.unlock.id === r.id));
  assert.ok(paid, 'fixture: a weapon row no trophy gives');
  prof.gold = WEAPON_PRICES[paid.weaponId];
  T.shop.open();
  cardNamed(paid.name).click();
  assert.ok(prof.unlockedWeapons.includes(paid.weaponId) && prof.gold === 0, 'bought for its price');
  const bought = cardNamed(paid.name);
  assert.match(bought.innerHTML, /OWNED/);
  assert.ok(!/trophy|TROPHY/.test(bought.innerHTML), bought.innerHTML);
  T.showTitle();
});

S.check('the trophy gallery calls an elite modifier a threat, and a weapon an unlock', () => {
  const lineFor = (id) => {
    T.showTitle();
    T.openTrophies();
    st.trophyIdx = Object.keys(TROPHY_ART).filter(k => k !== 'LOCKED').indexOf(id);
    T.trophiesStep(0);
    assert.equal(st.trophyView.id, id);
    return sub();
  };
  assert.ok(lineFor('KILLS_100').includes('new threat: Swift Elites (already out there)'), sub());
  assert.ok(lineFor('KILLS_1000').includes('brings a new threat: Splitting Elites'), sub());
  assert.ok(/unlock: .* \(already owned\)/.test(lineFor('FIRST_BOSS')), sub());
  T.closeTrophies();
});

// ---- the refund, through the real boot (read only: no frames after these) ----
const REAL_V10 = readFileSync(new URL('./fixtures/profile_v10_written_by_v10_build.json', import.meta.url), 'utf8');
const paidForSwift = JSON.parse(REAL_V10).spendLedger.elite_swift[0];
const hB = await boot({ storage: [[STORAGE_KEY, REAL_V10]], variant: 'elite-refund' });
let goldAfter = 0;
S.check('a save that paid for an elite row gets exactly that gold back, is told, and keeps the elite', () => {
  assert.equal(paidForSwift, 10000, 'fixture: this save paid 10000 for Swift Elites');
  const p = hB.T.getProfile();
  const base = JSON.parse(REAL_V10).gold + p.shopRefund.gold;   // the v11 shop refund is its own thing
  assert.equal(p.gold, base + paidForSwift);
  assert.ok(!('elite_swift' in p.spendLedger), 'the ledger entry went with the refund');
  assert.deepEqual(p.unlockedElites, ['SWIFT']);
  assert.ok(hB.T.save.notice.includes('THE ELITE UPGRADES LEFT THE SHOP. Refunded: +10000 GOLD. The elites you unlocked stay.'), hB.T.save.notice);
  goldAfter = p.gold;
  hB.T.save.autosave();
});
const hC = await boot({ storage: [...hB.storage], variant: 'elite-refund-2' });
S.check('the next boot refunds nothing more and says nothing', () => {
  assert.equal(hC.T.getProfile().gold, goldAfter);
  assert.ok(!/ELITE/.test(hC.T.save.notice || ''), String(hC.T.save.notice));
  assert.deepEqual(hC.T.getProfile().unlockedElites, ['SWIFT']);
});

S.done();
process.exit(0);
