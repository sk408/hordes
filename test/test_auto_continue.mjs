// AUTO-CONTINUE and the AWAY SUMMARY: the setting, who started the run and
// what it pays, the timers that keep an unattended run moving, the run limit,
// the end-card hold, and the card shown when the player comes back.
// Run: node test/test_auto_continue.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { boot, suite } from './_harness.mjs';
import { EVOLUTION_DEFS } from '../src/evolutions.js';
import { WEAPON_MAX_LEVEL } from '../src/weapons.js';
import { mulberry32 } from '../src/weather.js';
import { campBuy } from '../src/camp.js';

// A fixed run: startRun rolls the field and the arches from Math.random.
Math.random = mulberry32(20260923);

const h = await boot({ storage: [['hordes_onboarded', '1']] });
const T = h.T;
const st = T.state;
const S = suite('auto-continue');
const src = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
T.banners.suppressAll();

// The away card reads a wall clock; the test owns it.
let wall = 1_800_000_000_000;
T.auto.clock = () => wall;
const later = (s) => { wall += s * 1000; };

const step = () => h.pump(1, () => { st.player.hp = st.player.stats.maxHp; });
const freezeSpawns = () => {
  st.spawnTimer = 1e9;
  st.wave.endsAt = st.time + 1e9;
  st.wave.midAt = st.time + 1e9;
};
const sub = () => {
  const e = h.elements['ov-sub'];
  return (e._html || e.innerHTML || '') + (e.children || []).map(c => (c.innerHTML || '') + (c.textContent || '')).join('');
};
const cardNames = () => [...h.elements['ov-cards'].children]
  .map(c => ((c.innerHTML || '').match(/class="name">([^<]*)</) || [])[1] || '');

// ---- 1. the setting ----
S.check('the setting defaults OFF; one press turns it on and it is saved', () => {
  assert.equal(T.auto.on, false);
  T.auto.press();
  assert.equal(T.auto.on, true);
  assert.equal(h.storage.get('hordes_auto_continue'), '1');
  T.auto.press();
  assert.equal(T.auto.on, false);
  assert.equal(h.storage.get('hordes_auto_continue'), '0');
});
S.check('the setting is a Settings card, never a profile field', () => {
  assert.ok(/menuCard\('AUTO-CONTINUE'/.test(src));
  assert.ok(!/"autoContinue"/.test(JSON.stringify(T.getProfile())));
});
S.check('MANUAL pilot: a run with the setting on is not unattended', () => {
  T.auto.on = true;
  T.setPilotMode('MANUAL');
  T.startRun(); h.pump(2);
  assert.equal(st.unattended, false);
  T.setPilotMode('AUTO_ALL');
  T.startRun(); h.pump(2);
  assert.equal(st.unattended, true);
  assert.equal(st.autoStarted, false, 'the player pressed PLAY');
});

// ---- 2. the draft policy ----
S.check('autoDraftPickIndex: JOKER > RARE > plain, first slot on a tie; a joker is last with a full row', () => {
  const pick = T.auto.pickIndex;
  st.player.jokers = [];
  st.jokerSlots = 2;
  assert.equal(pick([]), 0);
  assert.equal(pick([{ id: 'a' }, { id: 'b' }]), 0);
  assert.equal(pick([{ id: 'a' }, { id: 'b', tier: 'RARE' }]), 1);
  assert.equal(pick([{ id: 'a', tier: 'JOKER' }, { id: 'b', tier: 'RARE' }]), 0);
  st.player.jokers = ['rime', 'ignite'];
  assert.equal(pick([{ id: 'a', tier: 'JOKER' }, { id: 'b' }]), 1);
  st.player.jokers = [];
});

// ---- 3. pay: full when the player starts the run, 50% when auto-continue does ----
function settleArm(byAuto) {
  T.auto.on = true;
  if (byAuto) { T.auto.runsInRow = 0; T.auto.restart(); } else T.startRun();
  h.pump(2);
  const prof = T.getProfile();
  prof.bestTime = 99999;              // no record bonus
  st.player.stats.goldMult = 1;
  st.rampage.best = 0; st.rampage.streak = 0;
  prof.runPurse = 42;
  return T.purse.settle({ winBonus: 1000 });
}
S.check('a run the player starts pays in full, even with the setting on', () => {
  const r = settleArm(false);
  assert.equal(st.unattended, true);
  assert.equal(st.autoStarted, false);
  assert.deepEqual({ a: r.award, p: r.purseBanked, w: r.winBonus }, { a: 70, p: 42, w: 1000 });
  assert.equal(r.goldPool.auto, 0);
});
S.check('a run auto-continue starts pays 50%: award, purse and completion bonus', () => {
  const r = settleArm(true);
  assert.equal(st.autoStarted, true);
  assert.deepEqual({ a: r.award, p: r.purseBanked, w: r.winBonus }, { a: 35, p: 21, w: 500 });
  assert.equal(r.goldPool.total, 0.5);
});
S.check('the cut is the only term of the run award pool', () => {
  const r = settleArm(true);
  assert.deepEqual(Object.keys(r.goldPool).sort(), ['auto', 'base', 'total']);
  assert.deepEqual([r.goldPool.base, r.goldPool.auto, r.goldPool.total], [1, 0.5, 0.5]);
});
S.check('the constants: penalty 50, continue 3 s, restart 5 s, evolve 3 s, stall 30 s, 20 runs, away 60 s', () => {
  assert.deepEqual(T.auto.constants, { RUN_LIMIT: 20, AWAY_S: 60, CONTINUE_S: 3, RESTART_S: 5,
    EVOLVE_S: 3, STALL_S: 30, PENALTY_PCT: 50 });
});

// ---- 4. the run moves itself: escape passed, intermission continued ----
S.check('an unattended run clears the wave, passes the escape, lands in the intermission', () => {
  T.auto.on = true;
  T.startRun(); h.pump(2);
  assert.equal(st.unattended, true);
  freezeSpawns();
  st.wave.endsAt = st.time;
  let guard = 0;
  while (!(st.wave.bosses || []).length && guard++ < 400) step();
  assert.ok((st.wave.bosses || []).length, 'the boss spawned');
  for (const b of st.wave.bosses) if (b.hp > 0) b.hp = 0;
  st.wave.cinePending = true;
  st.portal = null;
  guard = 0;
  while (st.mode !== 'intermission' && st.mode !== 'escape' && guard++ < 600) {
    step();
    if (st.mode === 'draft' || st.mode === 'evolve') {
      const c0 = h.elements['ov-cards'].children[0]; c0 && c0.click();
    }
  }
  guard = 0;
  while (st.mode === 'escape' && guard++ < 600) step();
  assert.equal(st.mode, 'intermission');
  assert.ok(/ESCAPED/.test(sub()), 'the escape is stated on the card');
});
S.check('the intermission continues by itself after AUTO_CONTINUE_S', () => {
  assert.ok(T.auto.continueLeft > 0 && T.auto.continueLeft <= 3);
  const wave0 = st.wave.num;
  h.pump(Math.round(60 * 2.9));
  assert.equal(st.mode, 'intermission');
  h.pump(30);
  assert.equal(st.mode, 'playing');
  assert.equal(st.wave.num, wave0 + 1);
  assert.equal(T.auto.continueLeft, null);
});

// ---- 5. the restart: same build, after AUTO_RESTART_S ----
S.check('a finished unattended run restarts after 5 s with the same build and stage, at 50%', () => {
  const stage0 = st.stage;
  const lead0 = st.weapons[0].type;   // the loadout's lead (the old run drafted more)
  T.auto.runsInRow = 0;
  T.die();
  assert.equal(st.mode, 'dead');
  assert.ok(T.auto.restartLeft > 4.9 && T.auto.restartLeft <= 5, 'armed: ' + T.auto.restartLeft);
  h.pump(Math.round(60 * 4.9));
  assert.equal(st.mode, 'dead');
  h.pump(30);
  assert.equal(st.mode, 'playing');
  assert.equal(st.autoStarted, true);
  assert.equal(st.stage, stage0);
  assert.equal(st.weapons[0].type, lead0);
  assert.equal(st.endScreen, null, 'the end card is gone');
  assert.ok(st.time < 1, 'a new run');
});
S.check('the end card of an auto-started run is tagged AUTO-CONTINUE', () => {
  T.die();
  assert.ok(/AUTO-CONTINUE/.test(sub()), sub().slice(0, 200));
});
S.check('the hold: an input on the end card pushes the restart out to 30 s', () => {
  assert.equal(st.mode, 'dead');
  h.pump(60);
  T.auto.input();
  assert.equal(T.auto.restartLeft, 30);
  h.pump(60 * 20);
  assert.equal(st.mode, 'dead', '20 s after the input: still on the card');
  h.pump(60 * 11);
  assert.equal(st.mode, 'playing', 'restarted 30 s after the input');
});
// END RUN through the real cards: Settings, END RUN, CONFIRM END RUN?.
const endRunByHand = () => {
  T.openSettings();
  const card = (t) => [...h.elements['ov-cards'].children].find(c => (c.innerHTML || '').includes(t));
  card('END RUN').click();
  card('CONFIRM END RUN?').click();
  assert.equal(st.mode, 'dead');
  assert.equal(h.elements['ov-title'].textContent, 'RUN ENDED');
};
S.check('a deliberate END RUN is never armed and stays on its end card: no restart, input or not', () => {
  assert.equal((src.match(/autoRestartLeft = C\.AUTOPILOT\.AUTO_RESTART_S/g) || []).length, 1, 'armed in one place');
  assert.equal(st.unattended, true);
  endRunByHand();
  assert.equal(T.auto.restartLeft, null);
  h.pump(60 * 6);
  assert.equal(st.mode, 'dead', 'past the 5 s restart');
  h.pump(60 * 31);
  assert.equal(st.mode, 'dead', 'past the 30 s watchdog');
  T.auto.input();
  h.pump(60 * 31);
  assert.equal(st.mode, 'dead', '30 s after an input: still parked');
  T.auto.unstick('dead');
  assert.equal(st.mode, 'dead', 'the watchdog action itself leaves an unarmed card alone');
  assert.equal(h.elements['ov-title'].textContent, 'RUN ENDED');
});
S.check('END RUN after a held end card stays parked too; the next death is armed as usual', () => {
  const retry = () => [...h.elements['ov-cards'].children].find(c => (c.innerHTML || '').includes('RETRY')).click();
  retry(); h.pump(2);
  assert.equal(st.mode, 'playing');
  assert.equal(st.autoStarted, false, 'RETRY starts a run the player owns');
  T.die();
  let guard = 0;
  while (st.mode !== 'dead' && guard++ < 600) h.pump(1);
  T.auto.input();
  assert.equal(T.auto.restartLeft, 30, 'the hold is armed');
  retry(); h.pump(2);
  assert.equal(st.mode, 'playing');
  endRunByHand();
  assert.equal(T.auto.restartLeft, null, 'the old hold did not cross into this run');
  h.pump(60 * 31);
  assert.equal(st.mode, 'dead');
  retry(); h.pump(2);
  assert.equal(st.unattended, true);
  T.die();
  assert.ok(T.auto.restartLeft > 4.9, 'armed again: ' + T.auto.restartLeft);
  h.pump(60 * 6);
  assert.equal(st.mode, 'playing');
  assert.equal(st.autoStarted, true);
});
S.check('the watchdog leaves the title and a live run alone', () => {
  st.mode = 'title';
  h.pump(60 * 32);
  assert.equal(st.mode, 'title');
  st.mode = 'playing';
  st.enemies.length = 0; st.enemyShots.length = 0;
  freezeSpawns();
  h.pump(60 * 32, () => { st.player.hp = st.player.stats.maxHp; });
  assert.equal(st.mode, 'playing');
  assert.equal(T.auto.stall.mode, null);
});
S.check('the evolve offer is taken after AUTO_EVOLVE_S', () => {
  const w = st.weapons.find(x => EVOLUTION_DEFS[x.type]);
  assert.ok(w);
  w.level = WEAPON_MAX_LEVEL;
  st.player.takenStats = { [EVOLUTION_DEFS[w.type].partner]: 1 };
  step();
  assert.equal(st.mode, 'evolve');
  assert.ok(T.auto.evolveLeft > 0 && T.auto.evolveLeft <= 3);
  h.pump(Math.round(60 * 2.9));
  assert.equal(st.mode, 'evolve');
  h.pump(30);
  assert.equal(st.mode, 'playing');
  assert.ok(w.evolutionId);
});
S.check('turned off during a run: the rest of the run waits for the player and nothing restarts', () => {
  T.auto.on = true;
  T.startRun(); h.pump(2);
  assert.equal(st.unattended, true);
  T.auto.press();   // the AUTO-CONTINUE card in the in-run Settings
  assert.equal(T.auto.on, false);
  assert.equal(h.storage.get('hordes_auto_continue'), '0');
  assert.equal(st.unattended, false, 'the run is attended from the press on');
  T.die();
  assert.equal(T.auto.restartLeft, null, 'no restart armed');
  h.pump(60 * 36);
  assert.equal(st.mode, 'dead', 'still on the end card after 36 s');
  assert.equal(st.autoStarted, false);
  T.auto.on = true;
});

// ---- 6. the run limit ----
S.check('after 20 auto-started runs with no input the game stops on the title', () => {
  T.auto.runsInRow = 19;
  T.auto.restart();
  assert.equal(st.mode, 'playing', 'run 20 starts');
  assert.equal(T.auto.runsInRow, 20);
  T.die();
  assert.equal(st.mode, 'dead');
  h.pump(60 * 6);
  assert.equal(st.mode, 'title', 'stopped on the title');
  assert.equal(T.auto.away.stopped, true);
  h.pump(60 * 40);
  assert.equal(st.mode, 'title', 'and stays there');
});

// ---- 7. the away summary ----
S.check('back after AWAY_S: the card lists the runs and why it stopped; COLLECT closes it', () => {
  later(3600);
  T.auto.input();
  const p = T.auto.pending;
  assert.ok(p, 'a summary is waiting');
  assert.ok(p.runs >= 2, 'runs counted: ' + p.runs);
  assert.equal(p.stopped, true);
  h.pump(1);
  assert.ok(T.auto.card, 'the card opened on the title');
  assert.ok(/WHILE YOU WERE AWAY/.test(h.elements['ov-title'].textContent));
  assert.ok(/away 1\.0 h/.test(sub()), sub());
  assert.ok(/stopped after 20 runs/.test(sub()), sub());
  assert.deepEqual(cardNames(), ['COLLECT']);
  h.pump(100);
  assert.equal(T.auto.card.el.textContent, '+' + T.auto.card.total.toLocaleString('en-US') + ' gold', 'the gold counted up');
  T.auto.collect();
  assert.equal(T.auto.card, null);
  assert.equal(st.mode, 'title');
});
S.check('an input within AWAY_S shows nothing (the player was here)', () => {
  later(30);
  T.auto.input();
  assert.equal(T.auto.pending, null);
});
S.check('a player-started run with the setting off is not an absence: no card', () => {
  T.auto.on = false;
  T.startRun(); h.pump(2);
  T.purse.settle();
  later(600);
  T.auto.input();
  assert.equal(T.auto.pending, null);
});
S.check('the camp alone shows the card only after the tab was hidden; COLLECT banks it', () => {
  const prof = T.getProfile();
  prof.gold = 10_000;
  campBuy(prof, 'mine', wall);
  T.showTitle();
  later(120); T.auto.input();
  assert.equal(T.auto.pending, null, 'idle on screen: the title strip shows it, no card');
  document.visibilityState = 'hidden'; document.hidden = true; T.onVisibilityChange();
  document.visibilityState = 'visible'; document.hidden = false; T.onVisibilityChange();
  later(2 * 3600);
  T.auto.input();
  assert.ok(T.auto.pending && T.auto.pending.camp.gold > 0, 'camp stock on the card');
  h.pump(1);
  assert.ok(/Gold Mine/.test(sub()), sub());
  const gold0 = prof.gold, made = T.auto.card.summary.camp.gold;
  T.auto.collect();
  assert.ok(prof.gold - gold0 >= made, 'COLLECT banked the mine: ' + (prof.gold - gold0) + ' vs ' + made);
});
// The tab hides and shows the way the browser reports it.
const hide = () => { document.visibilityState = 'hidden'; document.hidden = true; T.onVisibilityChange(); };
const show = () => { document.visibilityState = 'visible'; document.hidden = false; T.onVisibilityChange(); };
const tapCard = (name) => {
  const c = [...h.elements['ov-cards'].children].find(e => (e.innerHTML || '').includes('class="name">' + name + '<'));
  assert.ok(c, name + ' card: ' + cardNames().join(', '));
  c.click();
};
S.check('camp gold collected in the camp before the card opens is not shown again', () => {
  const prof = T.getProfile();
  T.showTitle();
  hide(); show();
  later(8 * 3600);
  tapCard('CAMP');                     // the first input back opens the camp
  assert.ok(T.auto.pending && T.auto.pending.camp.gold > 0, 'a summary is waiting');
  const gold0 = prof.gold;
  tapCard('COLLECT');
  assert.ok(prof.gold > gold0, 'the camp banked the mine');
  tapCard('BACK');
  h.pump(1);
  assert.equal(T.auto.card, null, 'nothing left to show: ' + sub());
  assert.equal(T.auto.pending, null);
  assert.equal(st.mode, 'title');
});
// Two hours hidden: the mine has gold, so the next input arms a card.
const campAbsence = () => { hide(); show(); later(2 * 3600); T.auto.input(); h.pump(1); };
S.check('ESC on the title card collects it; the next absence shows a new card', () => {
  const prof = T.getProfile();
  T.showTitle();
  campAbsence();
  assert.ok(T.auto.card, 'the card is open');
  const gold0 = prof.gold;
  h.key('keydown', { key: 'Escape' });
  assert.equal(T.auto.card, null, 'ESC cleared the card');
  assert.equal(st.mode, 'title');
  assert.ok(prof.gold > gold0, 'ESC banked the camp like COLLECT');
  campAbsence();
  assert.ok(T.auto.card, 'a second absence opens a new card');
  T.menus.showShop();
  assert.equal(T.auto.card, null, 'another screen over the card replaces it');
  T.showTitle();
  campAbsence();
  assert.ok(T.auto.card, 'and the next absence opens a new card');
  T.auto.collect();
});
S.check('in a run, ESC and the touch cog close the card and resume', () => {
  T.auto.on = false;
  T.startRun(); h.pump(2);
  const presses = { ESC: () => h.key('keydown', { key: 'Escape' }), cog: () => T.runAction('settings') };
  for (const [name, press] of Object.entries(presses)) {
    campAbsence();
    assert.ok(T.auto.card && T.auto.card.inRun, 'the card paused the run');
    assert.equal(st.mode, 'settings');
    press();
    assert.equal(T.auto.card, null, name + ' cleared the card');
    assert.equal(st.mode, 'playing');
  }
});
S.check('a card armed on the end screen waits: the PRESTIGE offer stays, the card opens in the next run', () => {
  T.auto.on = false;
  T.startRun(); h.pump(2);
  hide();
  T.run.runSurvived();                 // the 30:00 win lands while the tab is hidden
  show();
  assert.equal(st.mode, 'dead');
  later(90);
  h.key('keydown', { key: 'ArrowDown' });
  assert.ok(T.auto.pending, 'a summary is waiting');
  h.pump(30);
  assert.equal(st.mode, 'dead', 'still on the end screen');
  assert.equal(T.auto.card, null);
  assert.ok(cardNames().includes('PRESTIGE 1'), cardNames().join(', '));
  h.key('keydown', { key: 'p' });
  assert.equal(T.prestige.get(), 1, 'P ascends');
  h.pump(1);
  assert.ok(T.auto.card && T.auto.card.inRun, 'the card opened in the new run');
  assert.equal(T.auto.card.summary.runs, 1);
  T.auto.collect();
  assert.equal(st.mode, 'playing');
  T.prestige.set(0);
  hide(); T.run.runSurvived(); show();
  later(90); T.auto.input();
  h.pump(1);
  assert.equal(st.mode, 'dead');
  h.key('keydown', { key: 't' });
  h.pump(1);
  assert.ok(T.auto.card && !T.auto.card.inRun, 'TITLE: the card opens on the title');
  T.auto.collect();
});
// Hidden time runs on the background ticker, the way the Worker drives it.
const bgFor = (sec, onTick) => {
  for (let t = 0; t < sec * 1000; t += 100) {
    h.advanceClock(100); later(0.1);
    T.bg.tick(performance.now());
    if (onTick) onTick();
  }
};
const keepAlive = () => { st.player.invuln = 1e6; };
// Back on a visible tab: the card opens on the first frame of play (a draft
// that is up resolves itself first).
const untilCard = () => { for (let i = 0; i < 900 && !T.auto.card; i++) h.pump(1, keepAlive); };
S.check('a card waiting on a draft stays shut while the tab is hidden; the run plays on', () => {
  T.auto.on = true;
  T.startRun(); h.pump(2);
  assert.equal(st.unattended, true);
  hide(); show();
  later(3600);
  T.openDraft();
  assert.equal(st.mode, 'draft');
  T.auto.input();                      // back, while the draft holds the screen
  assert.ok(T.auto.pending, 'a summary is waiting');
  hide();
  const t0 = st.time;
  bgFor(20, keepAlive);
  assert.equal(T.auto.card, null, 'no card while hidden');
  assert.ok(T.auto.pending, 'still waiting');
  assert.ok(st.time - t0 > 3, 'the hidden run played: ' + (st.time - t0).toFixed(1) + ' s, mode ' + st.mode);
  show();
  untilCard();
  assert.ok(T.auto.card && T.auto.card.inRun, 'the card opens once the tab shows');
});
S.check('a card open in a run when the tab hides goes back to waiting; runs played hidden join it', () => {
  assert.equal(st.mode, 'settings');
  const a = T.auto.card.summary, runs0 = a.runs, awayS0 = a.awayS;
  hide();
  const t0 = st.time;
  bgFor(1, keepAlive);
  assert.equal(T.auto.card, null, 'the card closed');
  assert.equal(T.auto.pending, a, 'and waits again');
  assert.notEqual(st.mode, 'settings');
  assert.ok(st.time > t0, 'the hidden run plays on');
  T.auto.runsInRow = 0;
  st.player.invuln = 0;
  T.die();                             // a run ends while hidden
  assert.equal(st.autoStarted, false);
  bgFor(10, () => { if (st.mode === 'playing') keepAlive(); });
  assert.equal(st.autoStarted, true, 'the next run started');
  assert.equal(T.auto.card, null);
  show();
  untilCard();
  assert.ok(T.auto.card && T.auto.card.inRun, 'the card opens again');
  assert.equal(T.auto.card.summary.runs, runs0 + 1, 'the hidden run is on the card');
  assert.ok(T.auto.card.summary.awayS >= awayS0 + 10, 'the hidden time is on the card');
  T.auto.collect();
  assert.equal(st.mode, 'playing');
});
S.check('a card open on the title when the tab hides waits there too', () => {
  T.showTitle();
  campAbsence();
  assert.ok(T.auto.card && !T.auto.card.inRun, 'the card is open on the title');
  hide();
  bgFor(1);
  assert.equal(T.auto.card, null, 'the card closed');
  assert.ok(T.auto.pending, 'and waits again');
  assert.equal(st.mode, 'title');
  show();
  h.pump(1);
  assert.ok(T.auto.card && !T.auto.card.inRun, 'the card opens again');
  T.auto.collect();
  assert.equal(st.mode, 'title');
});

S.done();
process.exit(0);
