// HORDES — G9 FOLLOW-UP: the counters the trophy summary was missing.
// Run: node test/test_trophy_hooks.mjs
//
// The G9 parent verification found that FOUR trophies could never be earned:
// FIRST_BOSS and BOSS_SLAYER_5 (no boss counter), CHESTS_25 (no chest counter)
// and UNTOUCHED_WAVE (no wave-clean tracker). CHESTS_25 is not cosmetic — it is
// the unlock row for the PALADIN character, so the gap locked real content.
//
// Everything below is driven through the LIVE loop (state in, real update()
// out) and then through the REAL death funnel (die -> settleRunGold ->
// recordRunAchievements -> recordRun). Nothing is poked into the profile.
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';
import { ACHIEVEMENT_BY_ID, isEarned, ownsUnlock, gallerySummary } from '../src/achievements.js';

const S = suite('test_trophy_hooks');
const h = await boot({ storage: [['hordes_onboarded', '1']] });
const st = h.state;
const T = h.T;

// SUITE-FLAKES identity B — CAUSE NAMED WITH EVIDENCE, then the sanctioned
// fixture fix. The chest loop below counts FRAMES (one pump per pushed chest),
// and opening a chest rolls the CHEST-channel EVOLUTION TOKEN (main.js:1959).
// The first-ever TOKEN banner is a PERSISTED per-profile event that HOLDS the
// sim for 2.5s (grantEvolutionToken -> state.bannerHold), and a fresh harness
// profile has not seen it: in 40 probe runs the hold landed mid-loop 5 times —
// the pickup counter froze at 2 / 13 / 23 of 25 while mode stayed 'playing'
// and st.bannerHold decayed 2.5 -> 2.1 under the banner
// 'EVOLUTION TOKEN ACQUIRED'. Not a game defect (the hold is deliberate), and
// the game ships the sanctioned seam for exactly this case — "a probe that
// COUNTS FRAMES must be banner-inert" (main.js:5830). Assertions untouched.
T.banners.suppressAll();

// A live hostile parked on the hero: the contact path in update() is the one
// real damage source a headless test can aim without inventing shots.
function parkOnHero() {
  for (let i = 0; i < 240 && st.enemies.filter(e => !e.boss && e.hp > 0).length === 0; i++) h.pump(1);
  const e = st.enemies.find(x => !x.boss && x.hp > 0);
  assert.ok(e, 'the live spawner produced a hostile to park on the hero');
  e.x = st.player.x; e.y = st.player.y;
  st.player.invuln = 0;
  return e;
}

S.check('a wave finished without a hit banks UNTOUCHED_WAVE; a hit clears it', () => {
  if (st.mode === 'intro') h.key('keydown', { key: 'x', preventDefault() {} });
  T.startRun();
  h.pump(2);
  assert.equal(st.mode, 'playing', 'run live');
  assert.equal(st.runCounts.waveTookDamage, false, 'nothing has landed on a fresh run');
  assert.equal(st.runCounts.untouchedWave, false, 'and no wave has banked yet');
  T.run.nextWave();                       // the wave-completion seam
  assert.equal(st.runCounts.untouchedWave, true, 'the finished wave banked untouched');
  assert.equal(st.runCounts.waveTookDamage, false, 'and the ledger reset for the wave ahead');

  // Now a real hostile hit, through the live contact path.
  const p = st.player;
  p.hp = p.stats.maxHp;                   // survive it (the per-hit cap is 0.5 x maxHp)
  parkOnHero();
  h.pump(3);
  assert.equal(st.runCounts.waveTookDamage, true, 'the contact path flagged the wave');
  T.run.nextWave();
  assert.equal(st.runCounts.untouchedWave, true, 'the earlier untouched wave is not revoked');
});

S.check('the LIVE loop counts boss kills and OPENED chests', () => {
  // A HERALD-shaped boss death: same death sweep, same counter, but the payout
  // does not open a portal (so the run stays live for the chest work below).
  st.enemies.push({ boss: true, midBoss: true, hp: 0, x: st.player.x + 40, y: st.player.y,
    xp: 5, maxHp: 40, w: 24, h: 24 });
  h.pump(2);
  assert.equal(st.runCounts.bossKills, 1, 'the boss death was counted by the live loop');
  assert.equal(st.mode, 'playing', 'and the run is still live');

  st.chests.length = 0;                   // drop the herald's un-opened drops
  const base = st.runCounts.chests;
  for (let i = 0; i < 25; i++) {
    st.chests.push({ id: 't' + i, x: st.player.x, y: st.player.y, age: 0 });
    st.player.hp = st.player.stats.maxHp; // the parked hostile must not end the run here
    h.pump(1);
  }
  assert.equal(st.runCounts.chests - base, 25,
    'every picked-up chest was counted (' + (st.runCounts.chests - base) + ')');

  // An EXPIRED chest is not an opened one — the ledger must not count despawns.
  const before = st.runCounts.chests;
  st.chests.push({ id: 'expired', x: st.player.x + 900, y: st.player.y, age: 999 });
  h.pump(1);
  assert.equal(st.runCounts.chests, before, 'a despawned chest did not count');
});

S.check('a REAL death earns the four counter trophies and grants PALADIN', () => {
  const profile = T.getProfile();
  const before = gallerySummary(profile).earned;
  for (const id of ['FIRST_BOSS', 'CHESTS_25', 'UNTOUCHED_WAVE']) {
    assert.ok(!isEarned(profile, id), id + ' is unearned before the run settles');
  }
  assert.equal(st.mode, 'playing', 'still in the run');
  st.player.hp = 0.01;                    // one contact tick ends the run
  st.player.invuln = 0;
  // WAVE-28: the AUTO pilot's auto-drink (CONFIG.AUTOPILOT.AUTO_DRINK) would
  // legitimately heal this dip out of a carried charge, so the inventory is
  // emptied — this check is about the death funnel granting the trophies, and
  // every assertion below is unchanged.
  st.player.potions.hp = 0;
  parkOnHero();
  // RETARGETED 2026-09-15 (G15 death movie): die() now lands in 'death-cine'
  // first — pump to the movie, skip it with any key (the movie's own skip
  // contract), then the run has ended through die() and every assertion
  // below runs unchanged.
  for (let i = 0; i < 30 && st.mode !== 'death-cine' && st.mode !== 'dead'; i++) h.pump(1);
  h.key('keydown', { key: 'x', preventDefault() {} });   // any key skips the movie
  for (let i = 0; i < 4 && st.mode !== 'dead'; i++) h.pump(1);
  assert.equal(st.mode, 'dead', 'the run ended through die()');

  for (const id of ['FIRST_BOSS', 'CHESTS_25', 'UNTOUCHED_WAVE']) {
    assert.ok(isEarned(profile, id), id + ' was earned by the real death funnel');
  }
  assert.ok(!isEarned(profile, 'BOSS_SLAYER_5'),
    'one boss is not five — the counter is a count, not a flag');
  assert.ok(gallerySummary(profile).earned > before, 'the gallery moved forward');
  const u = ACHIEVEMENT_BY_ID.CHESTS_25.unlock;
  assert.equal(u.kind, 'character', 'CHESTS_25 unlocks a character');
  assert.ok(ownsUnlock(profile, u),
    'the PALADIN row is reachable now that chests are counted from live state');
});

S.check('the counters restart with the run (no bleed across runs)', () => {
  T.startRun();
  h.pump(2);
  assert.deepEqual(st.runCounts,
    { bossKills: 0, chests: 0, waveTookDamage: false, untouchedWave: false,
      tokens: { kill: 0, chest: 0, drop: 0 },   // EVOLUTION TOKEN channel ledger
      // E1: the run-purse ledger rides the same reset (GOLD_TIER tiers).
      gold: { earned: 0, spent: 0,
        kills: { CHAFF: 0, GRUNT: 0, MID: 0, HEAVY: 0, ELITE: 0, MID_BOSS: 0, BOSS: 0 } } },
    'startRun resets the trophy ledger');
});

S.done();
