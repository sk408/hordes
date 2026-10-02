// HORDES — AUTO-DRINK verification (playtest fix: "maybe a way to auto use
// potions in autopilot?").
//
// Before this, potions were reachable ONLY from the manual act handlers
// (main.js runAction 'h'/'n'), so an AUTO run carried an inventory it could
// never open. The pilot now spends it, under CONFIG.AUTOPILOT.AUTO_DRINK.
//
// What is proven here:
//   1. AUTO ONLY — a MANUAL player's potions are never drunk for them;
//   2. AT or below the line, never above it, never at 0 count;
//   3. mana is spent only when a skill is genuinely WAITING on it (off
//      cooldown AND short of its cost);
//   4. one drink per kind per COOLDOWN — a deep dip cannot chug the stack;
//   5. it touches potions ONLY — the BOSS_STANCE ease is byte-identical across
//      an auto-drink (it cannot fight the banner or the kite/retreat logic);
//   6. it is wired into the REAL frame loop, and the manual buttons still work.
// Run: node test/test_autodrink.mjs
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';
import { CONFIG as C } from '../src/config.js';

const S = suite('AUTO-DRINK');
const h = await boot();
const st = h.state;
const T = h.T;
const AD = C.AUTOPILOT.AUTO_DRINK;
// The HP line: a share of max HP (main.js autoDrinkPotions drinks AT or below it).
const hpLine = (p) => (p || st.player).stats.maxHp * AD.HP_FRACTION;

// A world with nothing in it: these checks are about the pilot's potion hand,
// so no enemy may land a hit (and no boss may re-stance the pilot) mid-pump.
// The wave clock is parked so no boss is cast either.
const quiet = () => {
  st.spawnTimer = 9999;
  st.wave.endsAt = st.time + 1e9;
  st.enemies.length = 0;
  st.gems.length = 0;
  if (st.wave.bosses) st.wave.bosses.length = 0;
  if (st.wave.midBosses) st.wave.midBosses.length = 0;
  st.wave.boss = null;
};
const live = (mode = 'AUTO') => {
  T.startRun();
  T.setPilotMode(mode);
  h.pump(2, quiet);
  quiet();
};

// ============================================================================
S.check('the knobs exist in CONFIG.AUTOPILOT and are sane', () => {
  assert.ok(AD, 'CONFIG.AUTOPILOT.AUTO_DRINK must exist');
  assert.equal(AD.ENABLED, true, 'shipped enabled');
  assert.ok(AD.HP_FRACTION > 0 && AD.HP_FRACTION < 1,
    'HP_FRACTION is a fraction of max: ' + AD.HP_FRACTION);
  // The heal lands in full when the pilot drinks at the line (no overheal).
  assert.ok(AD.HP_FRACTION + C.POTIONS.HP_HEAL_FRAC <= 1,
    'a drink at the line must not overheal: ' + AD.HP_FRACTION + ' + ' + C.POTIONS.HP_HEAL_FRAC);
  assert.ok(AD.MP_FRACTION > 0 && AD.MP_FRACTION < 1,
    'MP_FRACTION is a fraction of max: ' + AD.MP_FRACTION);
  assert.ok(AD.COOLDOWN > 0, 'COOLDOWN must be positive: ' + AD.COOLDOWN);
});

// ============================================================================
S.check('a REAL run: HP below the line drinks and recovers (live frame loop)', () => {
  live('AUTO');
  const p = st.player;
  const line = hpLine(p);
  p.potions.hp = 2;
  p.potions.mp = 0;
  p.mana = p.stats.maxMana;               // mana is not in play in this check
  p.hp = Math.max(1, line - 1);           // strictly below the line, alive
  const before = p.hp;
  assert.ok(before < line, 'fixture is below the line (' + before + ' < ' + line + ')');
  h.pump(1, quiet);
  assert.equal(p.potions.hp, 1,
    'the pilot drank ONE health potion (' + before + ' HP, line ' + line.toFixed(1) + ')');
  assert.ok(p.hp > before,
    'and the HP recovered: ' + before + ' -> ' + p.hp.toFixed(1));
});

// ============================================================================
S.check('the boundary: AT the line drinks, above it costs nothing', () => {
  live('AUTO');
  const p = st.player;
  const line = hpLine(p);
  p.potions.hp = 2;
  p.potions.mp = 0;
  p.mana = p.stats.maxMana;
  p.hp = line + 0.5;                      // just above it: not a dip
  h.pump(1, quiet);
  assert.equal(p.potions.hp, 2, 'no charge burned ABOVE the line');
  p.hp = line;                            // AT the line: drink
  h.pump(1, quiet);
  assert.equal(p.potions.hp, 1, 'the pilot drinks AT the line');
  assert.ok(Math.abs(p.hp - (line + C.POTIONS.HP_HEAL_FRAC * p.stats.maxHp)) < 1e-6,
    'and the heal lands in full: ' + p.hp);
});

// ============================================================================
S.check('an empty inventory drinks nothing (count 0 is never spent)', () => {
  live('AUTO');
  const p = st.player;
  p.potions.hp = 0;
  p.potions.mp = 0;
  p.mana = 0;
  p.hp = 1;
  const cd = p.skillCd;
  for (const id in cd) cd[id] = 0;        // a starved skill is available too
  h.pump(1, quiet);
  assert.equal(p.potions.hp, 0, 'no health charge exists, none is spent');
  assert.equal(p.potions.mp, 0, 'no mana charge exists, none is spent');
  assert.ok(p.hp <= 1 + 1e-6, 'and HP did not move by itself');
});

// ============================================================================
S.check('MANUAL drinks nothing — the player keeps 100% of the decision', () => {
  live('MANUAL');
  assert.equal(st.pilotMode, 'MANUAL', 'the manual pilot is bound');
  const p = st.player;
  const line = hpLine(p);
  p.potions.hp = 3;
  p.potions.mp = 3;
  p.hp = 1;
  p.mana = 0;
  for (const id in p.skillCd) p.skillCd[id] = 0;   // starved skills available
  assert.ok(p.hp < line, 'fixture is deep below the line');
  h.pump(30, quiet);                      // half a second of frames
  assert.equal(p.potions.hp, 3, 'MANUAL: no health potion was drunk');
  assert.equal(p.potions.mp, 3, 'MANUAL: no mana potion was drunk');
  // And the same setup in AUTO DOES drink — the mode is the only difference.
  live('AUTO');
  const q = st.player;
  q.potions.hp = 3;
  q.potions.mp = 3;
  q.hp = 1;
  q.mana = 0;
  for (const id in q.skillCd) q.skillCd[id] = 0;
  h.pump(1, quiet);
  assert.equal(q.potions.hp, 2, 'AUTO: the same dip IS drunk (control)');
});

// ============================================================================
S.check('mana is spent only when a skill is WAITING on it', () => {
  // NOTE: startRun builds a FRESH player object, so the live player must be
  // re-read after every live() — capturing it once would silently poke a dead
  // object (this bit the first draft).
  const line = () => st.player.stats.maxMana * AD.MP_FRACTION;

  // (a) low mana, every skill ON COOLDOWN -> the mana is not the blocker.
  live('AUTO');
  const a = st.player;
  a.potions.mp = 3;
  a.potions.hp = 0;
  a.mana = 0;
  for (const id in a.skillCd) a.skillCd[id] = 999;   // all recharging
  h.pump(1, quiet);
  assert.equal(a.potions.mp, 3,
    'low mana with every skill on cooldown is NOT a reason to spend a charge');

  // (b) low mana, a skill OFF cooldown and short of its cost -> spend it.
  live('AUTO');
  const b = st.player;
  b.potions.mp = 3;
  b.potions.hp = 0;
  b.mana = 0;
  for (const id in b.skillCd) b.skillCd[id] = 0;     // all ready but broke
  assert.ok(0 < line(), 'mana 0 is below the line (' + line().toFixed(1) + ')');
  h.pump(1, quiet);
  assert.equal(b.potions.mp, 2, 'a starved, off-cooldown skill drinks the mana potion');

  // (c) mana ABOVE the line -> nothing, even with skills starved.
  live('AUTO');
  const c = st.player;
  c.potions.mp = 3;
  c.potions.hp = 0;
  c.mana = Math.ceil(line());
  for (const id in c.skillCd) c.skillCd[id] = 0;
  h.pump(1, quiet);
  assert.equal(c.potions.mp, 3, 'no charge burned AT the mana line');
});

// ============================================================================
S.check('one drink per dip — a deep hole cannot chug the stack', () => {
  live('AUTO');
  const p = st.player;
  p.potions.hp = 3;
  p.potions.mp = 0;
  p.mana = p.stats.maxMana;
  p.hp = 1;                               // far below the line
  h.pump(1, quiet);
  assert.equal(p.potions.hp, 2, 'the first frame drinks once');
  // 0.5s of frames inside the COOLDOWN window: still exactly one drink.
  h.pump(29, quiet);
  assert.equal(p.potions.hp, 2,
    'inside the ' + AD.COOLDOWN + 's gate no second charge is spent');
  // Past the cooldown the pilot HOLDS while above the line and spends on the
  // next dip. Both halves asserted.
  p.hp = hpLine(p) + 1;
  h.pump(Math.ceil(AD.COOLDOWN * 60) + 2, quiet);
  assert.equal(p.potions.hp, 2,
    'past the cooldown but above the line (' + p.hp.toFixed(1) + '): still holding');
  p.hp = 1;                               // the next dip
  h.pump(1, quiet);
  assert.equal(p.potions.hp, 1, 'a fresh dip past the cooldown drinks again');
});

// ============================================================================
S.check('it cannot touch the stance — the BOSS_STANCE ease survives a drink', () => {
  live('AUTO');
  const p = st.player;
  // Arm the boss-banner ease exactly as easeToBossStance does: the pilot is
  // eased onto CONFIG.AUTOPILOT.BOSS_STANCE with the player's own pick parked.
  st.preBossStance = 'GREEDY';
  T.controller.stance = C.AUTOPILOT.BOSS_STANCE;
  const stBefore = T.controller.stance;
  p.potions.hp = 2;
  p.potions.mp = 0;
  p.mana = p.stats.maxMana;
  p.hp = 1;                               // a drink WILL happen under the banner
  h.pump(1, quiet);
  assert.equal(p.potions.hp, 1, 'the potion was drunk during the eased stance');
  assert.equal(T.controller.stance, stBefore,
    'the stance is unchanged by the drink (' + stBefore + ' -> ' + T.controller.stance + ')');
  assert.equal(st.preBossStance, 'GREEDY',
    'the parked pre-boss stance is intact for restoreBossStance');
});

// ============================================================================
S.check('the manual buttons still drink, through the same seam', () => {
  live('AUTO');
  const p = st.player;
  // Health: the act handler is the only manual route; drive it by key.
  p.potions.hp = 2;
  p.mana = p.stats.maxMana;
  p.hp = p.stats.maxHp - 5;               // above the AUTO line: only H drinks here
  const before = p.hp;
  h.key('keydown', { key: 'h' });
  assert.equal(p.potions.hp, 1, 'H still spends a health charge');
  assert.ok(p.hp > before, 'H still heals: ' + before + ' -> ' + p.hp);
  // Mana.
  p.potions.mp = 2;
  p.mana = 0;
  h.key('keydown', { key: 'n' });
  assert.equal(p.potions.mp, 1, 'N still spends a mana charge');
  assert.ok(p.mana > 0, 'N still restores mana');
});

// ============================================================================
S.check('the gates are run-scoped: a new run starts armed', () => {
  live('AUTO');
  st.autoDrinkCd.hp = 9;
  st.autoDrinkCd.mp = 9;
  T.startRun();
  assert.deepEqual(st.autoDrinkCd, { hp: 0, mp: 0 },
    'startRun re-arms both gates');
});

// ============================================================================
S.check('the finale seam drinks too (the maw fight is the pilot\'s worst case)', () => {
  live('AUTO');
  const p = st.player;
  // Drive the real finale route: the maw milestone owns updateFinale.
  st.mode = 'finale';
  st.finalBoss = st.finalBoss || {
    x: 0, y: 0, hp: 1e9, maxHp: 1e9, speed: 0, age: 0, flash: 0, slow: 0, name: 'THE MAW',
  };
  st.mawDeadline = st.time + 1e9;
  p.potions.hp = 2;
  p.potions.mp = 0;
  p.mana = p.stats.maxMana;
  p.hp = 1;
  const before = p.hp;
  h.pump(1, quiet);
  assert.equal(p.potions.hp, 1, 'the finale seam drinks (updateFinale)');
  assert.ok(p.hp > before, 'and heals through the same seam');
});

S.done();
