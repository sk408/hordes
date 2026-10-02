// M3 "first minutes and menus": the pieces that have no other home.
//   1. THE PRE-RUN SCREEN: the defaults let Enter go straight through; the
//      stage, modifier and loadout cards each say what they change and pay.
//   2. THE END SCREEN: time, wave, level, kills; gold with a breakdown whose
//      four parts sum to the gold actually banked; the best next purchase;
//      RETRY as the default action.
//   3. LATER TIPS: Focus (first death to an enemy shot) and Stance (first boss)
//      get one line each, once, and never in run 1.
//   4. THE ESCAPE: 25-30 s, the payout stated up front, the skip states what
//      it passes up, the Escape Writ keeps the payout.
//   5. THE DESKTOP HUD: pads stay hidden until a touch is seen.
// Run: node test/test_m3_first_minutes.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { boot, suite } from './_harness.mjs';
import { RUN_GOLD, SHOP_BY_ID, upgradeCost } from '../src/meta.js';
import { makeTypedEnemy } from '../src/enemy_types.js';
import * as ESC from '../src/escape/index.js';
import { createSim, step } from '../src/escape/sim.js';
import { inputFor } from '../src/escape/auto.js';
import { PACING } from '../src/escape/config.js';
import { payoutFor } from '../src/escape/payout.js';

const S = suite('test_m3_first_minutes');
const h = await boot({ storage: [['hordes_onboarded', '1']] });
const T = h.T, st = h.state, el = h.elements;
const cards = () => [...el['ov-cards'].children];
const names = () => cards().map(c => ((c.innerHTML || '').match(/class="name">([^<]*)</) || [])[1] || '');
const card = (t) => cards().find(c => (c.innerHTML || '').includes('>' + t));
const kdown = (k) => h.key('keydown', { key: k, preventDefault() {} });
const sub = () => el['ov-sub'].innerHTML || '';
const quiet = () => { st.enemies.length = 0; st.gems.length = 0; st.spawnTimer = 999; st.wave.endsAt = st.time + 9999; };
const toDead = () => {
  for (let i = 0; i < 20 && st.mode !== 'dead'; i++) { if (st.mode === 'death-cine') kdown('x'); h.pump(1); }
  assert.equal(st.mode, 'dead', 'on the end screen');
};

h.pump(3);
if (st.mode === 'intro') { kdown('x'); h.pump(2); }
T.showTitle();

// ---- 1. the pre-run screen ----------------------------------------------------
S.check('pre-run defaults: first stage, no modifier, the starting kit; START is the default card', () => {
  T.menus.showPreRun();
  assert.equal(st.mode, 'setup');
  assert.equal(el['ov-title'].textContent, 'NEXT RUN');
  const n = names();
  assert.equal(n[0], 'START', 'START is the first card');
  assert.equal(T.menus.pendingStage, 'VERDANT_HOLLOW', 'the default stage');
  assert.equal(T.menus.pendingChallenge, 'STANDARD', 'the default modifier');
  assert.ok(n[1] === 'STAGE: VERDANT HOLLOW' && n[2] === 'MODIFIER: STANDARD RUN' && n[3] === 'LOADOUT' && n[4] === 'BACK', n.join(' | '));
  assert.equal(T.menuFocus(), -1, 'no cursor: Enter takes the first card');
  kdown('Enter');
  assert.equal(st.mode, 'playing', 'Enter starts the run with the defaults');
  assert.equal(st.stage, 'VERDANT_HOLLOW');
  assert.equal(st.challenge, 'STANDARD');
  assert.deepEqual(st.weapons.map(w => w.type), ['VOLLEY', 'BOOMERANG'], 'the starting kit');
});

S.check('each pre-run card is one plain line: what it changes and what it pays', () => {
  T.die(); toDead(); kdown('t'); h.pump(2);
  T.menus.showPreRun();
  const desc = (i) => ((cards()[i].innerHTML || '').match(/class="desc">([\s\S]*?)<\/div>/) || [])[1] || '';
  assert.match(desc(1), /^The first arena: a mixed horde\. Pays normal gold\./, desc(1));
  assert.match(desc(2), /^No extra rules\. Pays normal gold\./, desc(2));
  assert.match(desc(3), /^Volley \+ Boomerang\. Weapons start at Lv 1\./, desc(3));
  // Every modifier states its pay as a number.
  const award = RUN_GOLD.AWARD, big = Math.round(award * (1 + RUN_GOLD.CHALLENGE_BONUS_PCT / 100));
  for (const id of ['ONE_WEAPON', 'NO_POTIONS']) {
    const line = T.menus.challengeLine(id);
    assert.ok(line.includes('Pays +' + RUN_GOLD.CHALLENGE_BONUS_PCT + '% run award (' + award + ' to ' + big + ' gold).'), line);
    assert.ok(line.split('. ').length === 2, 'one sentence of change, one of pay: ' + line);
  }
  // No internal words on the screen.
  const all = cards().map(c => c.innerHTML || '').join(' ');
  assert.ok(!/G\d\d|U1|REWARD:|foe hp|relief|x1\b/.test(all), 'no ticket tags or table jargon: ' + all.slice(0, 200));
  T.showTitle();
});

// ---- 2. the end screen ----------------------------------------------------------
const breakdownOf = (html) => {
  const m = html.match(/run award (\d+) · survival (\d+) · kills (\d+)(?: · bonuses (\d+))?/);
  assert.ok(m, 'the breakdown line is on the card: ' + html);
  return { award: +m[1], survival: +m[2], kills: +m[3], bonuses: +(m[4] || 0) };
};
const earnedOf = (html) => +html.match(/GOLD EARNED: \+(\d+)/)[1];

S.check('a death: the four parts on the card sum to the gold actually banked', () => {
  T.startRun(); h.pump(2); quiet();
  const prof = T.getProfile();
  prof.bestTime = 99999;                       // no record bonus: bonuses must be absent
  st.player.stats.maxHp = 1e9; st.player.hp = 1e9;
  // Real income: 95 seconds survived (three survival ticks) and real kills.
  for (let i = 0; i < 60 * 95; i++) {
    if (i % 30 === 0 && st.mode === 'playing') {
      const e = makeTypedEnemy('CHASER', st.player.x + 20, st.player.y, st.time);
      e.hp = e.maxHp = 1; st.enemies.push(e);
    }
    h.pump(1);
    st.spawnTimer = 999; st.wave.endsAt = st.time + 9999;
    if (st.mode === 'draft' || st.mode === 'evolve') cards()[0].click();
    st.bannerHold = 0;
  }
  assert.ok(st.time > 90 && st.player.kills > 20, 'fixture: a real run (t=' + st.time.toFixed(0) + ', kills ' + st.player.kills + ')');
  const before = prof.gold, level = st.player.level, kills = st.player.kills;
  T.die(); toDead();
  const banked = prof.gold - before;
  const html = sub();
  const b = breakdownOf(html);
  assert.equal(earnedOf(html), banked, 'GOLD EARNED is what the bank gained');
  assert.equal(b.award + b.survival + b.kills + b.bonuses, banked, 'award + survival + kills + bonuses = banked (' + JSON.stringify(b) + ' vs ' + banked + ')');
  assert.ok(b.award >= RUN_GOLD.AWARD && b.award <= RUN_GOLD.AWARD * 2, 'the run award is the flat award (times the kill-streak bonus): ' + b.award);
  assert.ok(b.survival >= 3 * RUN_GOLD.SURVIVAL_BASE, 'three survival ticks paid (' + b.survival + ')');
  assert.ok(b.kills > 0, 'kills paid (' + b.kills + ')');
  assert.equal(b.bonuses, 0, 'no bonus on a run that set no record');
  assert.ok(!/bonuses/.test(html), 'and no empty bonuses clause');
  assert.ok(html.includes('BANK ' + prof.gold), 'the bank total is on the card');
  // The run's shape: time, wave, level, kills.
  assert.match(html, new RegExp('TIME 01:3\\d · WAVE 1 · LEVEL ' + level + ' · ' + kills + ' KILLS'), html);
  assert.match(html, /KILLED BY /, 'the killer line');
});

S.check('the best next purchase is named with its price, and RETRY is the default action', () => {
  const prof = T.getProfile();
  const html = sub();
  const m = html.match(/BUY NEXT: ([^,]+), (\d+) gold · (you can afford it|\d+ more to go)/);
  assert.ok(m, 'the next purchase line: ' + html);
  const goal = T.menus.bestNextPurchase();
  assert.equal(m[1], goal.name); assert.equal(+m[2], goal.cost);
  assert.equal(m[3] === 'you can afford it', prof.gold >= goal.cost, 'the afford clause is true');
  // It is one of the three core steps while any is left: Vitality, Forged Edge or the cheapest weapon.
  assert.ok(goal.id === 'hp' || goal.id === 'dmg' || /^weapon_/.test(goal.id), 'a core step: ' + goal.id);
  assert.deepEqual(names(), ['RETRY', 'SHOP', 'TITLE'], 'three cards, RETRY first');
  assert.equal(T.menuFocus(), -1, 'no cursor');
  kdown('Enter');
  assert.equal(st.mode, 'playing', 'Enter retries');
});

S.check('bestNextPurchase prefers what the player can afford, and never an owned or maxed row', () => {
  const prof = T.getProfile();
  const saved = { gold: prof.gold, hp: prof.purchased.hp, dmg: prof.purchased.dmg, w: [...prof.unlockedWeapons] };
  prof.purchased.hp = 0; prof.purchased.dmg = 0;
  prof.gold = 0;
  assert.equal(T.menus.bestNextPurchase().id, 'hp', 'broke: the cheapest core step (Vitality)');
  prof.purchased.hp = SHOP_BY_ID.hp.maxLevel;
  prof.gold = upgradeCost(SHOP_BY_ID.dmg, 0);
  assert.equal(T.menus.bestNextPurchase().id, 'dmg', 'Vitality maxed: never offered again');
  prof.purchased.dmg = SHOP_BY_ID.dmg.maxLevel;
  prof.unlockedWeapons = ['VOLLEY', 'BOOMERANG'];
  prof.gold = 150;
  assert.equal(T.menus.bestNextPurchase().id, 'weapon_orbit', 'then the cheapest locked weapon');
  prof.unlockedWeapons.push('ORBIT');
  assert.equal(T.menus.bestNextPurchase().id, 'weapon_scythe', 'an owned weapon is skipped');
  Object.assign(prof, { gold: saved.gold, unlockedWeapons: saved.w });
  prof.purchased.hp = saved.hp; prof.purchased.dmg = saved.dmg;
});

S.check('a win with a modifier: bonuses carry the completion bonus and the parts still sum', () => {
  T.challenge.select('ONE_WEAPON');
  T.startRun(); h.pump(2); quiet();
  const prof = T.getProfile();
  prof.bestTime = 0;                           // this run sets a record
  const before = prof.gold;
  h.pump(60 * 31, quiet);
  T.run.runSurvived();
  assert.equal(st.mode, 'dead'); assert.equal(el['ov-title'].textContent, 'RUN SURVIVED');
  const banked = prof.gold - before;
  const html = sub();
  const b = breakdownOf(html);
  assert.equal(b.award + b.survival + b.kills + b.bonuses, banked, JSON.stringify(b) + ' vs ' + banked);
  assert.equal(earnedOf(html), banked);
  assert.equal(b.award, Math.round(RUN_GOLD.AWARD * (1 + RUN_GOLD.CHALLENGE_BONUS_PCT / 100)), 'the modifier multiplies the run award');
  assert.ok(b.bonuses >= RUN_GOLD.NEW_BEST, 'record + completion bonus in bonuses (' + b.bonuses + ')');
  assert.match(html, /run award x3\.00 \(modifier \+200%\)/, 'the bigger award is explained in plain words');
  assert.match(html, /ONE WEAPON RUN/, 'the run kind is tagged');
  T.challenge.select('STANDARD');
});

S.check('gold spent in the run comes out of the kills part; the parts still sum', () => {
  T.startRun(); h.pump(2); quiet();
  const prof = T.getProfile();
  prof.bestTime = 99999;
  h.pump(60 * 61, quiet);                      // two survival ticks
  const purse = T.purse.get();
  assert.ok(purse >= 60, 'fixture: survival income in the purse (' + purse + ')');
  assert.ok(T.purse.spend(25, 'shrine'), 'a shrine purchase');
  const before = prof.gold;
  T.die(); toDead();
  const banked = prof.gold - before;
  const b = breakdownOf(sub());
  assert.equal(b.award + b.survival + b.kills + b.bonuses, banked, JSON.stringify(b) + ' vs ' + banked);
  assert.ok(b.survival + b.kills === purse - 25, 'the purse part is what was left after spending');
  assert.ok(b.survival >= 0 && b.kills >= 0, 'no negative part: ' + JSON.stringify(b));
  kdown('t'); h.pump(2);
});

// ---- 3. the later tips ------------------------------------------------------------
S.check('FOCUS tip: one line on the end screen after a death to an enemy shot, once, never before run 2', () => {
  const store = T.pilotPrefs.storage;
  store.removeItem(T.tips.KEY_TIP_FOCUS);
  const prof = T.getProfile();
  const dieToShot = () => {
    T.startRun(); h.pump(2); quiet();
    const e = makeTypedEnemy('SPITTER', st.player.x + 400, st.player.y, st.time);
    e.speed = 0; st.enemies.push(e);
    T.hurtBy({ cause: 'shot', typeId: 'SPITTER' });
    T.die(); toDead();
    return sub();
  };
  prof.achievements.totals.runs = 0;
  assert.ok(!/TIP:/.test(dieToShot()), 'no tip on the first run');
  assert.equal(store.getItem(T.tips.KEY_TIP_FOCUS), null, 'and it is not spent');
  prof.achievements.totals.runs = 5;
  const html = dieToShot();
  assert.match(html, /KILLED BY SPITTER at range/, 'fixture: a death to a shot');
  assert.match(html, /TIP: shot from range\. FOCUS \(TAB\) set to RANGED kills the shooters first\./, html);
  assert.equal((html.match(/TIP:/g) || []).length, 1, 'one line');
  assert.ok(!/TIP:/.test(dieToShot()), 'never twice');
  kdown('t'); h.pump(2);
});

S.check('STANCE tip: one toast at the first boss, once, and not in the tutorial run', () => {
  const store = T.pilotPrefs.storage;
  store.removeItem(T.tips.KEY_TIP_STANCE);
  T.getProfile().achievements.totals.runs = 4;
  T.startRun(); h.pump(2); quiet();
  st.toasts.length = 0;
  T.tips.stance();
  const tips = st.toasts.filter(t => /^TIP: STANCE \(G\)/.test(t.msg));
  assert.equal(tips.length, 1, 'one stance tip: ' + st.toasts.map(t => t.msg).join(' | '));
  assert.ok(tips[0].msg.split('. ').length <= 2 && tips[0].msg.length <= 80, 'one short line: ' + tips[0].msg);
  T.tips.stance();
  assert.equal(st.toasts.filter(t => /^TIP: STANCE/.test(t.msg)).length, 1, 'never twice');
  store.removeItem(T.tips.KEY_TIP_STANCE);
  T.getProfile().achievements.totals.runs = 0;
  st.toasts.length = 0;
  T.tips.stance();
  assert.equal(st.toasts.length, 0, 'not before a first run is finished');
  T.getProfile().achievements.totals.runs = 4;
  T.die(); toDead(); kdown('t'); h.pump(2);
});

// ---- 4. the escape -------------------------------------------------------------------
// A recording 2D context: every fillText the escape draws.
function recCtx() {
  const texts = [];
  const ctx = new Proxy({}, {
    get(t, p) {
      if (p === 'fillText') return (s) => { texts.push(String(s)); };
      if (p === 'measureText') return () => ({ width: 0 });
      if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (p === 'canvas') return { width: 480, height: 300 };
      return typeof p === 'string' ? () => {} : undefined;
    },
    set() { return true; },
  });
  return { ctx, texts };
}
const profileWith = (bestGold, writ) => ({ gold: 0, purchased: writ ? { escapeskip: 1 } : {},
  achievements: { totals: { bestGold } } });

S.check('the escape is 25-30 s: the corridor bound and the auto pilot\'s real time', () => {
  assert.equal(PACING.MIN_SECONDS, 25); assert.equal(PACING.MAX_SECONDS, 30);
  const secs = [];
  for (let seed = 1; seed <= 40; seed++) {
    const sim = createSim(seed);
    const nominal = sim.corridor.length / PACING.NOMINAL_SPEED;
    assert.ok(nominal >= 25 && nominal <= 30 + 4, 'seed ' + seed + ': nominal ' + nominal.toFixed(1) + 's');
    let n = 0;
    while (!sim.outcome && n < 60 * 90) { step(sim, 1 / 60, inputFor(sim)); n++; }
    assert.equal(sim.outcome, 'complete', 'seed ' + seed + ': the auto pilot finishes');
    secs.push(sim.t);
  }
  secs.sort((a, b) => a - b);
  const med = secs[secs.length >> 1];
  assert.ok(med >= 23 && med <= 30, 'median real time ' + med.toFixed(1) + 's');
  assert.ok(secs[secs.length - 1] <= 34, 'longest ' + secs[secs.length - 1].toFixed(1) + 's');
  console.log('  MEASURED escape (auto, 40 seeds): ' + secs[0].toFixed(1) + '-' + secs[secs.length - 1].toFixed(1) + ' s, median ' + med.toFixed(1) + ' s');
});

S.check('the payout is stated up front, and the skip states what it passes up', () => {
  const prof = profileWith(1500, false);
  const worth = payoutFor(1500);
  assert.ok(worth > 0);
  let ended = null;
  ESC.begin({ seed: 7, profile: prof, auto: true, onEnd: (r) => { ended = r; } });
  const r = recCtx();
  ESC.frame(r.ctx, 1 / 60);
  assert.ok(r.texts.includes('ESCAPE: +' + worth + ' gold'), 'the first frame names the payout: ' + r.texts.join(' | '));
  assert.ok(r.texts.includes('SKIP: lose ' + worth + 'g'), 'the skip names the gold it passes up: ' + r.texts.join(' | '));
  assert.match(ESC.explain(480 - 60, 20), /You lose its gold unless you own the Escape Writ/, 'help mode says the same');
  ESC.skip();
  const r2 = recCtx();
  for (let i = 0; i < 120 && !ended; i++) ESC.frame(r2.ctx, 1 / 60);
  assert.ok(ended && ended.result === 'skip', 'the skip ends the escape');
  assert.equal(ended.payout, 0, 'no payout without the writ');
  assert.equal(ended.forgone, worth, 'the hand-back carries the passed-up amount');
  assert.equal(prof.gold, 0, 'nothing banked');
  assert.ok(r2.texts.includes(worth + ' gold passed up'), 'the outcome card says so: ' + r2.texts.join(' | '));
});

S.check('the Escape Writ: a skip keeps the payout, and the button says so', () => {
  const prof = profileWith(1500, true);
  const worth = payoutFor(1500);
  let ended = null;
  ESC.begin({ seed: 7, profile: prof, auto: true, onEnd: (r) => { ended = r; } });
  const r = recCtx();
  ESC.frame(r.ctx, 1 / 60);
  assert.ok(r.texts.includes('SKIP: keep ' + worth + 'g'), r.texts.join(' | '));
  ESC.skip();
  for (let i = 0; i < 120 && !ended; i++) ESC.frame(r.ctx, 1 / 60);
  assert.equal(ended.payout, worth); assert.equal(ended.forgone, 0); assert.equal(ended.paidSkipUsed, true);
  assert.equal(prof.gold, worth, 'the payout was banked');
  assert.match(SHOP_BY_ID.escapeskip.desc, /Skipping the escape still pays its gold/, 'the shop row says what it does');
});

S.check('finishing the escape banks the stated amount', () => {
  const prof = profileWith(900, false);
  const worth = payoutFor(900);
  let ended = null;
  ESC.begin({ seed: 4, profile: prof, auto: true, onEnd: (r) => { ended = r; } });
  for (let i = 0; i < 60 * 60 && !ended; i++) ESC.frame(null, 1 / 60);
  assert.ok(ended && ended.result === 'complete', 'the auto pilot completes (got ' + (ended && ended.result) + ')');
  assert.equal(ended.payout, worth); assert.equal(prof.gold, worth);
  assert.ok(ended.seconds >= 20 && ended.seconds <= 34, 'in ' + ended.seconds.toFixed(1) + 's');
});

// ---- 5. the desktop HUD ------------------------------------------------------------
S.check('desktop: the layer starts as the key bar layout; the first touch brings the pads', () => {
  const layer = el['touch'];
  assert.ok(layer.classList.contains('cog-only') && !layer.classList.contains('on'), 'a desktop boot hides the pads');
  assert.equal(T.onboarding.touchPath(), false);
  h.key('touchstart', {});
  assert.ok(layer.classList.contains('on') && !layer.classList.contains('cog-only'), 'the first touch event switches to the pads');
  assert.equal(T.onboarding.touchPath(), true, 'and copy now names touch controls');
  h.key('touchstart', {});
  assert.ok(layer.classList.contains('on'), 'a second touch changes nothing');
  layer.classList.remove('on'); layer.classList.add('cog-only');
});

S.check('index.html: on desktop the pads, the top button row and the stick are hidden; the key bar shows', () => {
  const css = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(css, /#touch\.cog-only \.pad, #touch\.cog-only button\.cog, #touch\.cog-only #joy \{ display: none !important; \}/);
  assert.match(css, /#touch \.keybar \{ display: none; \}/, 'the key bar is hidden on touch layouts');
  assert.match(css, /#touch\.cog-only \.keybar \{[^}]*height: 26px;[^}]*display: flex;/, 'and shown, 26px tall, on desktop');
});

S.check('the run clock steps down by state.clockInset (0 by default) and reports its box', () => {
  T.startRun(); h.pump(2); quiet();
  st.clockInset = 0; h.pump(1);
  const c0 = T.renderer.hudChrome.clock;
  assert.ok(c0 && c0.y === 13 && c0.w > 0, 'the clock box is published: ' + JSON.stringify(c0));
  // syncChrome re-measures every few frames; with no DOM row over the canvas it stays 0.
  h.pump(12);
  assert.equal(st.clockInset, 0, 'nothing covers the clock in the stub layout');
  assert.equal(T.renderer.hudChrome.clock.y, 13);
  T.die(); toDead(); kdown('t'); h.pump(2);
});

S.done();
process.exit(0);
