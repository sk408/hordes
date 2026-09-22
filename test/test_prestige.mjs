// HORDES — PRESTIGE system (owner-designed, player-facing).
//
// Owner spec: surviving to 30:00 offers PRESTIGE (run resets at P+1, P from
// 0); enemy strength x1.5^P (hp AND damage); gold income x2^P (all sources,
// same seam); speed unlocks P1->3x, P2->5x, P3+->7x on fixed-substep sim
// (N fixed-dt steps per frame, never scaled dt); tier persists in the
// profile; gold outpaces difficulty by design (do not "correct").
//
// Covers: pure mults at P0/P1/P2, speed gates, persistence roundtrip, the
// offer firing on 30:00 survival only (never on death), and substep
// determinism (a seeded fast run matches 1x within the stated tolerance).
// Run: node test/test_prestige.mjs
import assert from 'node:assert';
import {
  PRESTIGE, normalizePrestige, getPrestige, setPrestige,
  prestigeEnemyMult, prestigeGoldMult,
  prestigeAllowedSpeeds, prestigeCanUseSpeed, prestigeNormSpeed,
  prestigeNextSpeed, prestigeOfferForRun,
} from '../src/prestige.js';
import { STORAGE_KEY } from '../src/meta.js';
import { makeTypedEnemy } from '../src/enemy_types.js';
import { boot } from './_harness.mjs';

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const realRandom = Math.random;

// ---- 1. pure mults: 1 / 1.5 / 2.25 enemy, 1 / 2 / 4 gold --------------------
{
  assert.deepEqual([0, 1, 2].map(prestigeEnemyMult), [1, 1.5, 2.25],
    'enemy strength x1.5^P at P0/P1/P2');
  assert.deepEqual([0, 1, 2].map(prestigeGoldMult), [1, 2, 4],
    'gold income x2^P at P0/P1/P2');
  assert.equal(prestigeEnemyMult(3), 3.375, 'P3 enemy is 3.375x');
  assert.equal(prestigeGoldMult(3), 8, 'P3 gold is 8x');
  // Normalisation fails closed: garbage tiers read as P0, never NaN.
  for (const bad of [undefined, null, NaN, -1, -99, 'x', {}]) {
    assert.equal(normalizePrestige(bad), 0, 'bad tier fails closed to 0: ' + String(bad));
    assert.equal(prestigeEnemyMult(bad), 1, 'bad tier enemy mult is 1');
    assert.equal(prestigeGoldMult(bad), 1, 'bad tier gold mult is 1');
  }
  assert.equal(getPrestige({}), 0, 'a profile without the field reads P0');
  assert.equal(getPrestige(null), 0, 'a null profile reads P0');
  const prof = {};
  assert.equal(setPrestige(prof, 2), 2, 'set returns the applied tier');
  assert.equal(prof.prestige, 2, 'set writes the integer field');
  assert.equal(setPrestige(prof, -5), 0, 'set clamps negatives to 0');
}

// ---- 2. speed gates: 3x locked at P0, 7x locked below P3 --------------------
{
  assert.deepEqual(PRESTIGE.SPEEDS, [1, 3, 5, 7], 'offered ladder is 1x/3x/5x/7x');
  assert.deepEqual(prestigeAllowedSpeeds(0), [1], 'P0 runs 1x only');
  assert.deepEqual(prestigeAllowedSpeeds(1), [1, 3], 'P1 unlocks 3x');
  assert.deepEqual(prestigeAllowedSpeeds(2), [1, 3, 5], 'P2 unlocks 5x');
  assert.deepEqual(prestigeAllowedSpeeds(3), [1, 3, 5, 7], 'P3 unlocks 7x');
  assert.deepEqual(prestigeAllowedSpeeds(9), [1, 3, 5, 7], 'P3+ keeps 7x');
  assert.equal(prestigeCanUseSpeed(0, 3), false, '3x is LOCKED at P0');
  assert.equal(prestigeCanUseSpeed(0, 1), true, '1x is live at P0');
  assert.equal(prestigeCanUseSpeed(1, 3), true, '3x opens at P1');
  assert.equal(prestigeCanUseSpeed(1, 5), false, '5x stays locked at P1');
  assert.equal(prestigeCanUseSpeed(2, 5), true, '5x opens at P2');
  assert.equal(prestigeCanUseSpeed(2, 7), false, '7x is LOCKED below P3');
  assert.equal(prestigeCanUseSpeed(3, 7), true, '7x opens at P3');
  assert.equal(prestigeNormSpeed(0, 3), 1, 'a locked speed fails closed to 1x');
  assert.equal(prestigeNormSpeed(0, 99), 1, 'a wild speed fails closed to 1x');
  assert.equal(prestigeNormSpeed(2, 5), 5, 'an unlocked speed passes through');
  assert.deepEqual([1, 3].map((c) => prestigeNextSpeed(1, c)), [3, 1],
    'P1 cycles 1x->3x->1x');
  assert.deepEqual([1, 3, 5, 7].map((c) => prestigeNextSpeed(9, c)), [3, 5, 7, 1],
    'P3+ cycles the full ladder');
  assert.equal(prestigeNextSpeed(0, 3), 1, 'cycling from a locked speed lands on 1x');
  // The offer predicate: survival only, never death-shaped input.
  assert.equal(prestigeOfferForRun(true), true, 'a won run is offered prestige');
  for (const notWon of [false, undefined, null, 0, 1, 'yes']) {
    assert.equal(prestigeOfferForRun(notWon), false, 'no offer without a true win: ' + String(notWon));
  }
}

// ---- 3. enemy HP mults apply end-to-end (P0/P1/P2, same seed) ---------------
async function spawnedHpAt(tier, variant) {
  const h = await boot({ variant });
  h.setFrameMs(16);
  Math.random = mulberry32(0x1E57);
  try {
    const T = h.T;
    assert.equal(T.prestige.set(tier), tier, 'seam sets tier P' + tier);
    T.startRun();
    h.pump(2);   // spawnTimer opens at 0: the first tick spawns the ring
    const s = h.state;
    assert.ok(s.enemies.length > 0, 'P' + tier + ' spawned enemies');
    const e = s.enemies[0];
    return { hp: e.maxHp, pre: e.preStageMaxHp, n: s.enemies.length };
  } finally {
    Math.random = realRandom;
  }
}
{
  const p0 = await spawnedHpAt(0, 'pr_hp0');
  const p1 = await spawnedHpAt(1, 'pr_hp1');
  const p2 = await spawnedHpAt(2, 'pr_hp2');
  assert.equal(p1.n, p0.n, 'same seed spawns the same bodies');
  const r1 = p1.hp / p0.hp, r2 = p2.hp / p0.hp;
  assert.ok(Math.abs(r1 - 1.5) < 1e-9, 'P1 foe hp is 1.5x P0 (got ' + r1 + ')');
  assert.ok(Math.abs(r2 - 2.25) < 1e-9, 'P2 foe hp is 2.25x P0 (got ' + r2 + ')');
  assert.equal(p1.pre, p0.pre, 'chest eligibility reads the prestige-invariant body');
  console.log('  info - foe hp P0=' + p0.hp + ' P1=' + p1.hp + ' P2=' + p2.hp);
}

// ---- 4. enemy DAMAGE mult applies end-to-end (spitter shot, linear path) ----
async function spitterShotAt(tier, variant) {
  const h = await boot({ variant });
  h.setFrameMs(16);
  const DT = 16 / 1000;
  Math.random = mulberry32(0xD4A6E);
  try {
    const T = h.T;
    T.prestige.set(tier);
    T.startRun();
    h.pump(1);
    const s = h.state, p = s.player;
    s.enemies.length = 0;   // a clean range: only the ranged foe below
    const e = makeTypedEnemy('SPITTER', p.x + 150, p.y, 0, { variant: 0 });
    e.age = 1.15 - DT;      // the fire interval wraps on the next substep
    s.enemies.push(e);
    h.pump(1);
    const shot = s.enemyShots.find((x) => x.kind === 'spit');
    assert.ok(shot, 'P' + tier + ' spitter fired its shot');
    return shot.damage;
  } finally {
    Math.random = realRandom;
  }
}
{
  const d0 = await spitterShotAt(0, 'pr_dmg0');
  const d1 = await spitterShotAt(1, 'pr_dmg1');
  const d2 = await spitterShotAt(2, 'pr_dmg2');
  assert.equal(d0, 10, 'P0 spit is the base 10 (got ' + d0 + ')');
  assert.equal(d1, 15, 'P1 spit is 1.5x (got ' + d1 + ')');
  assert.equal(d2, 22.5, 'P2 spit is 2.25x (got ' + d2 + ')');
}

// ---- 5. gold income mult applies end-to-end (per-kill purse, same seam) -----
async function purseForKillAt(tier, variant) {
  const h = await boot({ variant });
  h.setFrameMs(16);
  Math.random = mulberry32(0xB00B5);
  try {
    const T = h.T;
    T.prestige.set(tier);
    T.startRun();
    h.pump(1);
    const s = h.state;
    // A CHASER corpse pays the GRUNT tier (1g): kill it through the REAL
    // death pass so the purse credit path is the live one.
    s.enemies.push({
      typeId: 'CHASER', x: s.player.x + 200, y: s.player.y,
      hp: 0, maxHp: 10, w: 10, h: 10, age: 1, flash: 0, slow: 0,
      speed: 0, xp: 0, contactDamageMult: 1,
    });
    h.pump(1);
    return { purse: s.runPurse, earned: s.runCounts.gold.earned };
  } finally {
    Math.random = realRandom;
  }
}
{
  const g0 = await purseForKillAt(0, 'pr_gold0');
  const g1 = await purseForKillAt(1, 'pr_gold1');
  const g2 = await purseForKillAt(2, 'pr_gold2');
  assert.equal(g0.purse, 1, 'P0 chaser pays 1g (got ' + g0.purse + ')');
  assert.equal(g1.purse, 2, 'P1 chaser pays 2g (got ' + g1.purse + ')');
  assert.equal(g2.purse, 4, 'P2 chaser pays 4g (got ' + g2.purse + ')');
  assert.equal(g1.earned, 2, 'the ledger matches the wallet');
}

// ---- 6. speed gate enforced on the live seam ---------------------------------
{
  const h = await boot({ variant: 'pr_gate' });
  const T = h.T;
  assert.equal(T.prestige.get(), 0, 'a fresh profile opens at P0');
  T.startRun();
  assert.equal(T.prestige.speed, 1, 'a fresh run opens at 1x');
  assert.equal(T.prestige.setSpeed(3), 1, '3x is refused at P0 (fails closed)');
  assert.equal(T.prestige.speed, 1, 'the refused speed never applies');
  T.prestige.set(1);
  assert.equal(T.prestige.setSpeed(3), 3, '3x applies at P1');
  assert.equal(T.prestige.setSpeed(7), 1, '7x is refused below P3');
  assert.equal(T.prestige.setSpeed(3), 3, 're-arm 3x on the P1 ladder');
  T.prestige.act();
  assert.equal(T.prestige.speed, 1, 'the speed act cycles the P1 ladder back to 1x');
  T.prestige.set(3);
  assert.equal(T.prestige.setSpeed(7), 7, '7x applies at P3');
  assert.ok(T.hudTextBlock(T.state.player).includes('SPD 7x'),
    'the HUD names the live speed');
  T.startRun();
  assert.equal(T.prestige.speed, 1, 'a new run re-opens at 1x');
}

// ---- 7. persistence roundtrip (profile survives a session boundary) ---------
{
  const h = await boot({ variant: 'pr_save1' });
  const T = h.T;
  T.prestige.set(2);
  T.save.autosave();
  const raw = h.storage.get(STORAGE_KEY);
  assert.ok(raw, 'the profile persisted to storage');
  assert.equal(JSON.parse(raw).prestige, 2, 'the stored payload carries tier 2');
  const h2 = await boot({ variant: 'pr_save2', storage: [...h.storage] });
  assert.equal(h2.T.prestige.get(), 2, 'a new session loads tier 2');
  h2.T.prestige.set(0);
  h2.T.save.autosave();
  assert.equal(JSON.parse(h2.storage.get(STORAGE_KEY)).prestige, 0,
    'tier 0 round-trips too (no missing-field special case)');
}

// ---- 8. the offer fires on 30:00 survival, never on death -------------------
function prestigeCards(h) {
  const cards = h.elements['ov-cards'];
  const kids = (cards && cards.children) || [];
  return kids.filter((c) => (c.innerHTML || '').includes('PRESTIGE'));
}
{
  // Survival: the REAL win path composes the offer card; taking it ascends
  // and resets the run at the new tier.
  const h = await boot({ variant: 'pr_offer' });
  const T = h.T;
  T.startRun();
  h.pump(2);
  assert.equal(T.prestige.offer(), false, 'no offer mid-run');
  T.run.runSurvived();
  assert.equal(h.state.mode, 'dead', 'the win parks on the end screen');
  assert.equal(T.prestige.offer(), true, 'the won run is offered prestige');
  const cards = prestigeCards(h);
  assert.equal(cards.length, 1, 'exactly one PRESTIGE card is composed');
  assert.ok(cards[0].innerHTML.includes('PRESTIGE 1'), 'the card names tier 1');
  cards[0].click();
  assert.equal(T.prestige.get(), 1, 'taking the offer ascends to P1');
  assert.equal(h.state.mode, 'playing', 'the ascent resets the run');
  assert.equal(h.state.time, 0, 'the new run restarts the clock');
}
{
  // Death: the REAL death path composes no offer, and the ascent refuses.
  const h = await boot({ variant: 'pr_death' });
  h.setFrameMs(16);
  const T = h.T;
  T.startRun();
  h.pump(1);
  const s = h.state;
  s.player.hp = 1;
  s.enemies.push({
    typeId: 'CHASER', x: s.player.x, y: s.player.y,
    hp: 10, maxHp: 10, w: 10, h: 10, age: 1, flash: 0, slow: 0,
    speed: 0, xp: 5, contactDamageMult: 10,
  });
  h.pump(2);
  assert.equal(s.mode, 'death-cine', 'the lethal touch starts the death movie');
  T.deathCine.end();
  assert.equal(s.mode, 'dead', 'the movie hands back to the end screen');
  assert.equal(T.prestige.offer(), false, 'a dead run is never offered prestige');
  assert.equal(prestigeCards(h).length, 0, 'no PRESTIGE card on the death screen');
  assert.equal(T.prestige.ascend(), false, 'the ascent refuses a dead run');
  assert.equal(T.prestige.get(), 0, 'death ascends nothing');
}

// ---- 9. substep determinism: a seeded fast run matches 1x -------------------
// Tolerance (stated): integer counters (sim-time in ms, kills, gold, wave,
// enemy count) match EXACTLY; float positions / hp sums match within 1e-6
// (same op order — the epsilon is the statement, not a fudge).
async function determinismArm({ tier, speed, frames, variant }) {
  const h = await boot({ variant });
  h.setFrameMs(16);
  Math.random = mulberry32(0xDE7);
  try {
    const T = h.T;
    T.prestige.set(tier);
    T.startRun();
    // A fixed ring of trash inside the engagement radius: real combat (fire,
    // hits, kills, purse, gems) in both arms from the same scripted field.
    // SWARMERs (thin bodies) guarantee real kills inside the horizon; the
    // deep test pool only buys SIM-TIME (more steps compared) — every hit,
    // kill and credit still runs the live P2 numbers.
    const s = h.state, p = s.player;
    p.stats.maxHp = 10000; p.hp = 10000;
    const ring = ['CHASER', 'SWARMER'];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const e = makeTypedEnemy(ring[i % 2], p.x + Math.cos(a) * 95, p.y + Math.sin(a) * 95, 0,
        { variant: 0 });
      s.enemies.push(e);
    }
    assert.equal(T.prestige.setSpeed(speed), speed, 'arm runs at ' + speed + 'x');
    h.pump(frames);
    const st = h.state;
    let foeHp = 0;
    for (const e of st.enemies) foeHp += e.hp;
    return {
      ms: Math.round(st.time * 1000),
      kills: st.player.kills,
      earned: st.runCounts.gold.earned,
      wave: st.wave.num,
      foes: st.enemies.length,
      px: st.player.x, py: st.player.y,
      php: st.player.hp,
      foeHp,
      mode: st.mode,
      steps: frames * speed,
    };
  } finally {
    Math.random = realRandom;
  }
}
{
  // Same sim-time both arms: 360 frames at 1x == 72 frames at 5x (P2 unlocks
  // 5x, and the tier mults are LIVE — determinism must hold under scaling).
  const SIM_FRAMES_1X = 360, SPEED = 5;
  const a = await determinismArm({ tier: 2, speed: 1, frames: SIM_FRAMES_1X, variant: 'pr_det1' });
  const b = await determinismArm({
    tier: 2, speed: SPEED, frames: SIM_FRAMES_1X / SPEED, variant: 'pr_det5',
  });
  console.log('  info - 1x: ' + JSON.stringify(a));
  console.log('  info - 5x: ' + JSON.stringify(b));
  assert.equal(b.ms, a.ms, 'same sim-time (' + a.ms + 'ms)');
  assert.equal(b.steps, a.steps, 'same substep count (' + a.steps + ')');
  assert.equal(b.mode, a.mode, 'same mode (' + a.mode + ')');
  assert.equal(b.kills, a.kills, 'same kills (' + a.kills + ')');
  assert.equal(b.earned, a.earned, 'same gold earned (' + a.earned + ')');
  assert.equal(b.wave, a.wave, 'same wave (' + a.wave + ')');
  assert.equal(b.foes, a.foes, 'same foe count (' + a.foes + ')');
  for (const [k, av, bv] of [['px', a.px, b.px], ['py', a.py, b.py],
    ['php', a.php, b.php], ['foeHp', a.foeHp, b.foeHp]]) {
    assert.ok(Math.abs(av - bv) < 1e-6, k + ' within 1e-6 (1x=' + av + ' 5x=' + bv + ')');
  }
}

console.log('test_prestige: all checks passed');
