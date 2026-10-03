// HORDES - boss rules: from wave 2 each wave boss brings one named rule for
// its fight, and beating the boss pays the rule's reward.
//   pure:  the run's order (seeded, every rule once), the rule per wave,
//          a rule that cannot do anything gives its turn away
//   live:  nothing before the boss arrives; each rule's effect while it is
//          live; the effect ends and the reward is paid when the cast is dead;
//          the banner, the HUD plate, the wave toast and the intermission line;
//          the RULEBREAKER joker; the maw; a new run
// Run: node test/test_boss_rules.mjs
import assert from 'node:assert';
import { suite, boot } from './_harness.mjs';
import {
  BOSS_RULES, BOSS_RULE_BY_ID, BOSS_RULE_REWARDS, BOSS_RULE_FIRST_WAVE, BOSS_RULE_HINT,
  rollRuleOrder, ruleForWave, ruleLine, rewardLine, ruleFx, ruleBlocks,
} from '../src/boss_rules.js';
import { mulberry32 } from '../src/sites.js';
import { HINTS } from '../src/tutorial.js';
import { useSkill, usePotion } from '../src/skills.js';
import { takeJoker, JOKERS } from '../src/jokers.js';
import { CONFIG as C } from '../src/config.js';

const s = suite('test_boss_rules');
const IDS = BOSS_RULES.map(r => r.id);

// ------------------------------------------------------------- pure
s.check('the pool: six rules, unique names, one short sentence and a stated reward each', () => {
  assert.equal(BOSS_RULES.length, 6);
  assert.equal(new Set(IDS).size, 6);
  assert.equal(new Set(BOSS_RULES.map(r => r.name)).size, 6);
  for (const r of BOSS_RULES) {
    assert.ok(/^THE [A-Z]+$/.test(r.name), r.name);
    assert.ok(r.rule.length > 0 && r.rule.length <= 34 && !/[^\x20-\x7E]/.test(r.rule), r.id + ': ' + r.rule);
    assert.ok(BOSS_RULE_REWARDS[r.reward], r.id + ' reward ' + r.reward);
    assert.ok(Object.keys(r.fx).length === 1, r.id + ' does one thing');
    assert.equal(ruleLine(r), r.name + ': ' + r.rule);
    assert.equal(rewardLine(r), 'win ' + BOSS_RULE_REWARDS[r.reward]);
    // The HUD plate (8 px type, about 5 px a character) fits its band of 208 px.
    assert.ok(ruleLine(r).length * 5 + 8 <= 208, r.id + ' plate ' + ruleLine(r).length + ' characters');
  }
});

s.check('the order is seeded: every rule once, the same for the same seed', () => {
  const a = rollRuleOrder(mulberry32(7)), b = rollRuleOrder(mulberry32(7));
  assert.deepEqual(a, b);
  assert.deepEqual(a.slice().sort(), IDS.slice().sort());
  const orders = new Set();
  for (let seed = 1; seed <= 40; seed++) orders.add(rollRuleOrder(mulberry32(seed)).join());
  assert.ok(orders.size > 20, 'seeds give different orders (' + orders.size + ')');
});

s.check('wave 1 has no rule; waves 2-7 bring each rule once; the order then repeats', () => {
  const order = rollRuleOrder(mulberry32(11));
  assert.equal(BOSS_RULE_FIRST_WAVE, 2);
  assert.equal(ruleForWave(order, 1), null);
  assert.equal(ruleForWave(order, 0), null);
  assert.equal(ruleForWave(null, 3), null);
  const six = [2, 3, 4, 5, 6, 7].map(w => ruleForWave(order, w).id);
  assert.deepEqual(six, order);
  assert.equal(ruleForWave(order, 8).id, order[0]);
});

s.check('a run without potions never draws THE DROUGHT: its turn goes to the next rule', () => {
  const order = ['drought', 'wall', 'silence', 'chorus', 'guard', 'stampede'];
  assert.equal(ruleForWave(order, 2).id, 'drought');
  assert.equal(ruleForWave(order, 2, { potions: false }).id, 'wall');
  for (let w = 2; w < 20; w++) assert.notEqual(ruleForWave(order, w, { potions: false }).id, 'drought');
});

s.check('a rule does nothing until it is live, and nothing when broken', () => {
  const st = { bossRule: { id: 'silence', live: false, broken: false } };
  assert.equal(ruleFx(st), null);
  assert.equal(ruleBlocks(st, 'skills'), false);
  st.bossRule.live = true;
  assert.equal(ruleBlocks(st, 'skills'), true);
  assert.equal(ruleBlocks(st, 'potions'), false);
  st.bossRule.broken = true;
  assert.equal(ruleBlocks(st, 'skills'), false);
  assert.equal(ruleFx({}), null);
  assert.equal(ruleBlocks({ bossRule: { id: 'drought', live: true } }, 'potions'), true);
});

s.check('the first-time hint is one sentence, the same in the hint book', () => {
  assert.equal(HINTS.bossrule.text, BOSS_RULE_HINT);
  assert.ok(!HINTS.bossrule.basic, 'new to every profile');
});

// ------------------------------------------------------------- live
const h = await boot({ storage: [['hordes_onboarded', '1']] });
const T = h.T, st = T.state;
T.banners.suppressAll();
const quiet = () => {
  st.enemies.length = 0; st.enemyShots.length = 0; st.gems.length = 0; st.drops.length = 0;
  st.spawnTimer = 1e9;
};
// A fresh run parked on `wave` with `id` as that wave's rule (null = no rule).
const fresh = (wave = 2, id = null) => {
  st.mode = 'menu'; T.startRun(); quiet();
  st.sites = [];   // nothing to wander into
  st.wave.num = wave;
  st.wave.endsAt = st.time + 1e9; st.wave.midAt = st.time + 1e9;
  if (id) T.bossRules.order = [id, ...IDS.filter(x => x !== id)];
  if (id && wave === 2) T.bossRules.setWave(2); else if (!id) st.bossRule = null;
};
const step = () => h.pump(1, () => { if (st.player) st.player.hp = Math.max(st.player.hp, 1); });
// The wave's cast, called without the frame loop (no field spawns).
const callBoss = () => { T.bossRules.spawnBoss(); return st.wave.bosses.filter(b => b.hp > 0); };
// Kill the cast and run frames until the death is settled.
const killCast = () => {
  for (const b of st.wave.bosses) b.hp = 0;
  for (let i = 0; i < 4 && st.mode === 'playing' && !st.wave.pendingClear; i++) step();
};
const hud = () => { T.renderer.render(st, st.cam); return T.renderer.hudChrome; };

s.check('a new run: an order of six, and no rule on wave 1 (the first boss is as it was)', () => {
  fresh(1);
  assert.deepEqual(st.bossRuleOrder.slice().sort(), IDS.slice().sort());
  assert.equal(st.bossRule, null);
  const cast = callBoss();
  assert.equal(st.bossRule, null);
  assert.equal(st.bossBanner.sub, cast[0].flavor.toUpperCase(), 'the banner keeps the flavour line');
  assert.equal(hud().rule, null, 'no plate');
  assert.equal(T.bossRules.nextLine().includes('NEXT BOSS RULE: '), true, 'the intermission names wave 2\'s rule');
});

s.check('the wave names its rule at the start; it is not live until the boss arrives', () => {
  fresh(2, 'silence');
  assert.deepEqual({ id: st.bossRule.id, live: st.bossRule.live }, { id: 'silence', live: false });
  assert.equal(st.bossRule.text, 'THE SILENCE: skills are sealed');
  assert.equal(st.bossRule.reward, 'win a free card');
  assert.equal(ruleBlocks(st, 'skills'), false);
  assert.equal(hud().rule, null);
  callBoss();
  assert.equal(st.bossRule.live, true);
  assert.equal(st.bossBanner.sub, 'THE SILENCE: SKILLS ARE SEALED - WIN A FREE CARD');
  const plate = hud().rule;
  assert.equal(plate.text, 'THE SILENCE: SKILLS ARE SEALED');
  assert.ok(plate.x >= 180 && plate.x + plate.w <= 388 && plate.y >= 11, 'the plate sits between the bars and the clock');
});

s.check('continueRun sets the next wave\'s rule and says so', () => {
  fresh(1);
  T.bossRules.order = ['wall', 'drought', 'silence', 'chorus', 'guard', 'stampede'];
  st.toasts.length = 0;
  T.run.nextWave();
  assert.equal(st.wave.num, 2);
  assert.equal(st.bossRule.id, 'wall');
  assert.ok(st.toasts.some(t => t.msg === 'BOSS RULE - THE WALL: THE BOSS HAS 50% MORE HEALTH'), JSON.stringify(st.toasts.map(t => t.msg)));
  assert.ok(T.bossRules.nextLine().includes('THE DROUGHT: potions do nothing (win a full heal and a potion)'));
});

s.check('THE SILENCE: skills cost nothing and do nothing while the boss lives; they work again after', () => {
  fresh(2, 'silence');
  const p = st.player;
  const qid = T.classSkillId ? T.classSkillId(st) : 'FROST_NOVA';
  p.mana = p.stats.maxMana; p.skillCd[qid] = 0;
  callBoss();
  const mana = p.mana;
  assert.equal(useSkill(st, qid), false);
  assert.equal(p.mana, mana, 'no mana spent');
  assert.ok(!(p.skillCd[qid] > 0), 'no cooldown started');
  killCast();
  assert.equal(st.bossRule, null);
  if (st.mode === 'playing') assert.equal(useSkill(st, qid), true, 'the skill fires once the rule is over');
});

s.check('THE DROUGHT: a potion stays in the bag; beating the boss heals to full and adds a potion', () => {
  fresh(2, 'drought');
  const p = st.player;
  p.potions.hp = 2; p.hp = 10;
  callBoss();
  assert.equal(usePotion(st, 'hp'), false);
  assert.equal(p.potions.hp, 2);
  assert.equal(p.hp, 10);
  killCast();
  assert.equal(p.hp, p.stats.maxHp, 'a full heal');
  assert.equal(p.potions.hp, Math.min(st.potionCap, 3), 'and a potion');
  p.hp = 10;
  assert.equal(usePotion(st, 'hp'), true, 'potions work again');
});

s.check('THE STAMPEDE: the field speeds up by a quarter, bosses keep their pace, and it ends with the boss', () => {
  fresh(2, 'stampede');
  st.enemies.push({ x: st.player.x + 400, y: st.player.y, hp: 1e9, maxHp: 1e9, speed: 40, w: 16, h: 16, typeId: 'BRUTE', xp: 1 });
  const e = st.enemies[0];
  const cast = callBoss();
  const bossSpeed = cast[0].speed;
  assert.equal(e.speed, 50);
  assert.ok(!cast[0].ruleSped, 'the boss is not sped up');
  T.bossRules.arm(cast);   // arming twice changes nothing
  assert.equal(e.speed, 50);
  assert.equal(cast[0].speed, bossSpeed);
  killCast();
  assert.equal(e.speed, 40, 'back to its own pace');
});

s.check('THE WALL: the cast has half again as much health', () => {
  fresh(2, 'silence');
  const plain = callBoss()[0].maxHp;
  fresh(2, 'wall');
  const b = callBoss()[0];
  assert.ok(Math.abs(b.maxHp / plain - 1.5) < 1e-9, b.maxHp + ' / ' + plain);
  assert.equal(b.hp, b.maxHp);
});

s.check('THE GUARD: two elites arrive beside the boss', () => {
  fresh(2, 'guard');
  const cast = callBoss();
  const guards = st.enemies.filter(e => e.elite && !e.boss);
  assert.equal(guards.length, 2);
  for (const g of guards) assert.ok(Math.hypot(g.x - cast[0].x, g.y - cast[0].y) < 60, 'beside the boss');
});

s.check('THE CHORUS: half again as many enemies arrive while the boss lives, at any spawn pace', () => {
  // Arrivals over ten seconds of a boss fight late in a run, the boss parked far away.
  // The random stream is fixed for the count, so the numbers are the same every time.
  const arrivals = (id, wrath) => {
    const real = Math.random;
    Math.random = mulberry32(4242);
    try { return count(id, wrath); } finally { Math.random = real; }
  };
  const count = (id, wrath) => {
    fresh(2, id);
    st.time = 600;
    st.wave.endsAt = st.time + 1e9; st.wave.midAt = st.time + 1e9;
    st.wrath.total = wrath;   // a build with wrath this high has the spawn tick near its floor
    callBoss();
    for (const b of st.wave.bosses) { b.hp = b.maxHp = 1e12; b.speed = 0; b.x = st.player.x + 3000; }
    const n0 = st.enemies.length;
    st.spawnTimer = 0;
    let spawned = 0, last = n0;
    for (let i = 0; i < 600; i++) {
      h.pump(1, () => { st.player.hp = st.player.stats.maxHp; });
      if (st.mode !== 'playing') { h.elements['ov-cards'].children[0].click(); continue; }
      // Count arrivals only (kills shrink the field between ticks).
      if (st.enemies.length > last) spawned += st.enemies.length - last;
      last = st.enemies.length;
    }
    return spawned;
  };
  for (const wrath of [0, 18]) {
    const plain = arrivals('silence', wrath), more = arrivals('chorus', wrath);
    assert.ok(plain > 40, 'wrath ' + wrath + ': the plain field fills (' + plain + ')');
    assert.ok(more / plain > 1.3 && more / plain < 1.7, 'wrath ' + wrath + ': ' + more + ' vs ' + plain);
    console.log('    wrath ' + wrath + ': ' + plain + ' arrivals, ' + more + ' under the chorus (x' + (more / plain).toFixed(2) + ')');
  }
});

s.check('a chest rule pays one chest more than the boss alone', () => {
  const chests = (id) => { fresh(2, id); callBoss(); killCast(); return st.chests.length; };
  const base = chests('silence');
  assert.equal(chests('stampede'), base + 1);
  assert.ok(st.toasts.some(t => t.msg === 'BOSS DOWN - THE STAMPEDE IS BEATEN: A CHEST'), JSON.stringify(st.toasts.map(t => t.msg)));
});

s.check('a card rule pays a free card: a draft without the level, after the joker offer', () => {
  fresh(2, 'wall');
  const level = st.player.level;
  callBoss(); killCast();
  assert.equal(st.ruleCards, 1);
  // The boss's joker offer opens first; taking it chains into the free card.
  let guard = 0;
  while (st.mode !== 'draft' && guard++ < 30) step();
  assert.equal(st.mode, 'draft');
  if (st.draftKind === 'joker') { h.elements['ov-cards'].children[0].click(); for (let i = 0; i < 3 && st.draftKind !== 'level'; i++) step(); }
  assert.equal(st.draftKind, 'level');
  assert.equal(h.elements['ov-title'].textContent, 'FREE CARD');
  assert.ok(/^the rule is beaten: pick 1 of \d$/.test(h.elements['ov-sub'].textContent), h.elements['ov-sub'].textContent);
  h.elements['ov-cards'].children[0].click();
  assert.equal(st.ruleCards, 0);
  assert.equal(st.player.level, level, 'no level was added');
});

s.check('RULEBREAKER: the rule does not bind, the plate stays down, the reward is still paid', () => {
  assert.ok(JOKERS.rulebreaker && /boss rules/.test(JOKERS.rulebreaker.desc));
  fresh(2, 'drought');
  assert.equal(takeJoker(st, 'rulebreaker'), true);
  const p = st.player;
  p.potions.hp = 1; p.hp = 10;
  const cast = callBoss();
  assert.deepEqual({ live: st.bossRule.live, broken: st.bossRule.broken }, { live: true, broken: true });
  assert.equal(st.bossBanner.sub, cast[0].flavor.toUpperCase());
  assert.equal(hud().rule, null);
  assert.equal(usePotion(st, 'hp'), true, 'the potion works');
  p.hp = 10;
  killCast();
  assert.equal(p.hp, p.stats.maxHp, 'the reward is paid');
});

s.check('a double wave brings one rule for both bosses; the first to fall wins the wave and the reward, once', () => {
  fresh(3, null);
  T.bossRules.order = ['wall', ...IDS.filter(x => x !== 'wall')];
  T.bossRules.setWave(2);   // wave 3 takes the order's second rule; park the first on this wave
  const cast = callBoss();
  assert.equal(cast.length, 2);
  assert.equal(st.bossRule.id, 'wall');
  assert.ok(cast.every(b => b.hp === b.maxHp), 'both bosses carry the rule');
  cast[0].hp = 0;
  step();
  assert.equal(st.bossRule, null, 'the rule ends with the wave');
  assert.equal(st.ruleCards, 1, 'the reward is paid');
  assert.ok(!st.enemies.some(e => e.boss), 'the second boss left with the cleared wave');
  assert.equal(T.bossRules.end(true), '', 'nothing is paid twice');
  assert.equal(st.ruleCards, 1);
});

s.check('a rule that is dropped pays nothing; a new run starts clean', () => {
  fresh(2, 'wall');
  callBoss();
  T.bossRules.end(false);
  assert.equal(st.bossRule, null);
  assert.equal(st.ruleCards, 0);
  fresh(2, 'wall');
  callBoss(); killCast();
  assert.equal(st.ruleCards, 1);
  st.mode = 'menu'; T.startRun();
  assert.equal(st.bossRule, null);
  assert.equal(st.ruleCards, 0);
});

s.check('a run that carries no potions skips THE DROUGHT', () => {
  fresh(1);
  T.bossRules.order = ['drought', 'wall', 'silence', 'chorus', 'guard', 'stampede'];
  st.potionCap = 0;
  assert.equal(T.bossRules.setWave(2).id, 'wall');
  st.potionCap = C.POTIONS.MAX_CARRIED;
  assert.equal(T.bossRules.setWave(2).id, 'drought');
});

s.done();
