// F1 (audit 2026-09-16): the VAMPIRIC elite mod's contact heal must be
// ATTRIBUTED (only the elite whose touch landed heals) and RATE-CAPPED
// (token bucket at CONFIG.SURVIVAL.ELITE_VAMP_CAP_FRAC of the ELITE'S OWN
// maxHp per second — the G36 pattern, per-elite). Red-proved against the old
// proximity scan (<13px healed every lifesteal enemy near the player, uncapped).
import { boot } from './_harness.mjs';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';

const h = await boot();
const st = h.state;
const T = h.T;

function makeVamp(dx, dy, maxHp = 300, hpFrac = 0.2, lifesteal = 0.5) {
  return { typeId: 'CHASER', x: 0, y: 0, hp: maxHp * hpFrac, maxHp, w: 10, h: 10,
    speed: 0, xp: 1, age: 0, lifesteal, _dx: dx, _dy: dy };
}
function makePlain(dx, dy) {
  return { typeId: 'CHASER', x: 0, y: 0, hp: 300, maxHp: 300, w: 10, h: 10,
    speed: 0, xp: 1, age: 0, lifesteal: 0, _dx: dx, _dy: dy };
}
// A run with the player's offense neutralized: elite hp moves ONLY by the
// vampiric heal. Every frame re-pins the fixtures around the player (the
// pinned offsets survive), tops the player up (hits still land — invuln
// forced to 0 each frame = max contact pressure), and clears spawns/fire.
function fixtureRun(seconds, es, keepWeapons = false) {
  T.startRun(); h.pump(2);
  if (!keepWeapons) {
    st.player.stats.damage = 0;
    st.weapons.length = 0;
  }
  es.forEach(e => st.enemies.push(e));
  // Anchor the PLAYER too (not just the enemies): the pilot flees ~1px/frame,
  // which is the same order as the 12px-touch vs 13px-old-scan gap the
  // attribution check rides on. Frozen player = exact, reproducible offsets.
  const ax = st.player.x, ay = st.player.y;
  const pin = () => {
    const p = st.player;
    p.x = ax; p.y = ay;
    p.hp = p.stats.maxHp;
    p.invuln = Math.min(p.invuln, 0);
    for (let i = st.enemies.length - 1; i >= 0; i--) {
      const e = st.enemies[i];
      if (es.includes(e)) { e.x = p.x + e._dx; e.y = p.y + e._dy; }
      else st.enemies.splice(i, 1);   // clear ambient spawns
    }
    st.projectiles.length = 0;
  };
  es.forEach(e => { e.x = ax + e._dx; e.y = ay + e._dy; });
  const hp0 = es.map(e => e.hp);
  h.pump(Math.round(seconds * 60), pin);
  return es.map((e, i) => e.hp - hp0[i]);   // healed per fixture (hp GAINED)
}

// --- 1. Lone vampiric elite heals from its own contact (the fantasy intact) ---
{
  const cap = CONFIG.SURVIVAL.ELITE_VAMP_CAP_FRAC;
  const e = makeVamp(0.5, 0);
  const [healed] = fixtureRun(5, [e]);
  assert.ok(healed > 0, `lone vampiric elite should heal from contact (healed ${healed})`);
  // and inside the cap: <= 1s-start bucket + 5s of refill, +1 HP slack
  assert.ok(healed <= cap * e.maxHp * 6 + 1,
    `lone-elite heal ${healed} must respect the ${cap * e.maxHp}/s cap over 5s`);
}

// --- 2. ATTRIBUTION: a nearby-but-not-touching vampiric elite heals NOTHING
//        while a plain dealer lands the hits (old code: <13px proximity scan
//        healed it anyway — 12.5px is inside 13, outside the 12px touch radius).
{
  // Pinned 11.5px off the anchor: the pilot's ~1px/frame in-frame flee puts
  // the check-time distance at ~12.5px — OUTSIDE the 12px touch radius (no
  // contact hit from the vamp) but INSIDE the old code's 13px heal scan.
  const vamp = makeVamp(11.5, 0);
  const dealer = makePlain(0.5, 0);          // the actual toucher, no lifesteal
  const [, healedVamp] = fixtureRun(5, [dealer, vamp]);
  assert.equal(healedVamp, 0,
    'non-touching vampiric elite must not heal off a plain dealer\'s hits (attribution)');
}

// --- 3. STACKING: two stacked vampiric elites heal at 1x, not 2x (only the
//        touch that landed heals; old code healed BOTH per hit).
{
  const lone = makeVamp(0.5, 0);
  const [loneHealed] = fixtureRun(10, [lone]);
  const a = makeVamp(0.5, 0), b = makeVamp(1.5, 0);
  const [ha, hb] = fixtureRun(10, [a, b]);
  const total = ha + hb;
  assert.ok(total <= loneHealed * 1.05 + 1,
    `2 stacked vampiric elites healed ${total} vs lone ${loneHealed} — must not multiply`);
  assert.ok(ha === 0 || hb === 0 || (ha < loneHealed && hb < loneHealed),
    'per hit only the toucher heals; neither elite may run at the full lone rate');
}

// --- 4. RATE CAP: max contact pressure (hit every frame, touchDmg at the
//        player-side hit cap) is bounded at CAP_FRAC of the ELITE'S OWN maxHp/s.
{
  const e = makeVamp(0.5, 0, 300, 0.01);     // near-empty hp: bucket-limited, not hp-limited
  const cap = CONFIG.SURVIVAL.ELITE_VAMP_CAP_FRAC;
  const [healed] = fixtureRun(10, [e]);
  const bound = cap * e.maxHp * 11 + 1;      // full 1s start bucket + 10s refill
  assert.ok(healed <= bound,
    `uncapped-pressure heal ${healed} over 10s exceeds the ${cap}/s elite-maxHp cap (bound ${bound})`);
  assert.ok(e.hp <= e.maxHp, 'heal may never exceed the elite\'s maxHp');
}

// --- 5. CONTROL: non-vampiric toucher heals nothing.
{
  const e = makePlain(0.5, 0);
  const [healed] = fixtureRun(5, [e]);
  assert.equal(healed, 0, 'plain elite must not heal');
}

// --- 6. CONTROL: a vampiric elite NOT in contact (60px away, no dealer) heals
//        nothing even with i-frames open.
{
  const e = makeVamp(60, 0);
  const [healed] = fixtureRun(5, [e]);
  assert.equal(healed, 0, 'out-of-contact vampiric elite must not heal');
}

// --- 7. BOUNDED EXCHANGE: a competent build out-damages the capped heal —
//        the elite's net HP falls and it dies inside a 20s duel.
{
  T.startRun(); h.pump(2);
  st.player.stats.damage *= 6;               // a built save's volley, still stock weapons
  const e = makeVamp(0.5, 0, 300, 1.0);      // FULL hp: worst case for the player
  st.enemies.push(e);
  e.x = st.player.x + e._dx; e.y = st.player.y + e._dy;
  const hp0 = e.hp;
  h.pump(20 * 60, () => {
    st.player.hp = st.player.stats.maxHp;    // survive; the duel is DPS vs the heal cap
    e.x = st.player.x + e._dx; e.y = st.player.y + e._dy;
  });
  assert.ok(e.hp < hp0 || e.hp <= 0 || !st.enemies.includes(e),
    `competent build must out-damage the capped heal (hp ${e.hp} vs ${hp0})`);
  assert.ok(e.hp <= 0 || !st.enemies.includes(e),
    'the vampiric elite should DIE inside the 20s duel (net HP falling to zero)');
}

console.log('test_audit_f1: all checks passed');
