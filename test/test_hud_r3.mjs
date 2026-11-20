// R3 A SMALLER HUD (docs/REVIEW_2026-11.md, R3 rows 4 and 6): one vitals
// block, gold by the clock, one 2-line message lane where a lesser line never
// pushes out a more important one, quests as a chip that opens to the tracker,
// the desktop key strip only early on (and on request), and a settings panel
// that fits. Each rule is pinned here through the real game (boot()).
import assert from 'node:assert';
import fs from 'node:fs';
import { suite, boot } from './_harness.mjs';
import { CONFIG as C } from '../src/config.js';
import { toastRank, pushToast, laneLines, LANE_LINES } from '../src/message_lane.js';
import { BOSS_RULES } from '../src/boss_rules.js';
import { QUEST_BY_ID } from '../src/quests.js';

const s = suite('test_hud_r3');
const h = await boot({ storage: [['hordes_onboarded', '1']] });
const T = h.T, st = T.state;
T.banners.suppressAll();
const quiet = () => {
  st.enemies.length = 0; st.enemyShots.length = 0; st.gems.length = 0; st.drops.length = 0;
  st.spawnTimer = 1e9;
};
const fresh = () => {
  st.mode = 'menu'; T.startRun(); quiet();
  st.wave.endsAt = st.time + 1e9; st.wave.midAt = st.time + 1e9;
  st.toasts.length = 0;
};
const step = (n = 1) => h.pump(n, () => { if (st.player) st.player.hp = st.player.stats.maxHp; });
const frame = () => {
  h.rec.rects.length = 0; h.rec.texts.length = 0; h.rec.on = true;
  step();
  h.rec.on = false;
  return { rects: h.rec.rects.slice(), texts: h.rec.texts.map(t => t.txt), ch: T.renderer.hudChrome };
};
// A context that records each rect with its fill style (the boot recorder
// keeps geometry only). measureText is absent, so text widths use the same
// monospace estimate as every headless HUD test.
const styled = () => {
  const rects = []; let fs = null;
  const ctx = new Proxy({}, {
    get(t, p) {
      if (p === 'fillRect') return (x, y, w, hh) => rects.push({ x, y, w, h: hh, style: fs });
      if (p === 'measureText') return undefined;
      if (p in t) return t[p];
      return () => {};
    },
    set(t, p, v) { if (p === 'fillStyle') fs = v; t[p] = v; return true; },
  });
  return { ctx, rects };
};
const inside = (a, b) => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

s.check('one vitals block: HP, MP and XP bars, their numbers and the level badge share one plate', () => {
  fresh();
  st.player.level = 7; st.player.xp = 30; st.player.xpNext = 120;
  const f = frame();
  const v = f.ch.vitals;
  assert.ok(v && v.w > 0 && v.h > 0, 'the block is on the chrome record');
  const sc = styled();
  T.renderer.drawHudChrome(sc.ctx, st);
  assert.ok(sc.rects.some(q => q.x === v.x && q.y === v.y && q.w === v.w && q.h === v.h &&
    q.style === (T.renderer.groundLight ? C.HUD.PLATE_ON_LIGHT : C.HUD.PLATE)),   // integ3: darker on a light floor
    'one dark plate covers the whole block');
  // The three troughs (HUD.TROUGH ink) all sit inside it.
  const troughs = sc.rects.filter(q => q.style === C.HUD.TROUGH && q.x < 200 && q.y < 60 && q.w > 40);
  assert.equal(troughs.length, 3, 'three bars in the block: ' + JSON.stringify(troughs));
  for (const t of troughs) assert.ok(inside(t, v), 'bar inside the block ' + JSON.stringify(t));
  assert.ok(inside(f.ch.lvBadge, v) && f.ch.lvBadge.text === 'LV 7', 'the level badge is in the block');
  for (const k of ['hpText', 'mpText', 'xpText']) assert.ok(f.texts.includes(f.ch[k]), k + ' painted');
  // Smaller than the corner it replaces (about 250x56 with the purse).
  assert.ok(v.w <= 200 && v.h <= 45, 'the block is compact: ' + v.w + 'x' + v.h);
});

s.check('gold sits beside the clock, on its row, without touching it', () => {
  fresh();
  const { ch } = frame();
  const g = ch.purse, c = ch.clock;
  assert.ok(g && c, 'both painted');
  assert.ok(Math.abs(g.y - c.y) <= 3, 'same row (gold y ' + g.y + ', clock y ' + c.y + ')');
  assert.ok(g.x + g.w <= c.x && c.x - (g.x + g.w) <= 8, 'just left of the clock: gold ends ' + (g.x + g.w) + ', clock starts ' + c.x);
  assert.ok(!overlap(g, ch.vitals), 'gold is clear of the vitals block');
  // The digit field is fixed: a big purse paints the same box.
  st.runPurse = 0; profile0();
  const a = frame().ch.purse;
  T.getProfile().runPurse = 987654;
  const b = frame().ch.purse;
  assert.deepEqual([a.x, a.y, a.w, a.h], [b.x, b.y, b.w, b.h], 'no reflow as the purse grows');
  T.getProfile().runPurse = 0;
});
function profile0() { T.getProfile().runPurse = 0; }

s.check('message lane rules: rank, no push-out by a lesser line, at most 2 lines', () => {
  assert.equal(toastRank('THE PORTAL OPENS - WALK THROUGH'), 2);
  assert.equal(toastRank('QUEST DONE: KILL 5 ELITES. +80 AT THE END'), 2);
  assert.equal(toastRank('BOSS RULE - THE WALL: THE BOSS HAS 50% MORE HEALTH'), 2);
  assert.equal(toastRank('WAVE 3 - VERDANT HOLLOW'), 1);
  assert.equal(toastRank('HEALTH POTION FOUND'), 0);
  assert.equal(toastRank('TIP: STANCE (G). SAFE keeps away from the boss'), 0);
  const list = [];
  pushToast(list, { msg: 'THE PORTAL LEADS ON: FROSTMARCH', ttl: 4 });
  for (let i = 0; i < 12; i++) pushToast(list, { msg: 'FOUND THING ' + i, ttl: 4 });
  assert.ok(list.some(e => /PORTAL/.test(e.msg)), 'the portal line survives a flood of pickups');
  // The lane: the portal line plus the newest pickup, never more than 2 lines.
  const lane = laneLines(list, (m) => [m]);
  assert.equal(lane.length, LANE_LINES);
  assert.ok(/PORTAL/.test(lane[0].entry.msg) && lane[1].entry.msg === 'FOUND THING 11', JSON.stringify(lane.map(l => l.entry.msg)));
  // A message longer than the lane is cut to it, with an ellipsis.
  const long = laneLines([{ msg: 'x', ttl: 4 }], () => ['a', 'b', 'c']);
  assert.equal(long[0].lines.length, 2);
  assert.ok(long[0].lines[1].endsWith('…'));
});

s.check('the lane in play: a portal line stays on screen while pickups pour in', () => {
  fresh();
  T.toast('THE PORTAL OPENS - WALK THROUGH');
  for (let i = 0; i < 5; i++) T.toast('FOUND: THING ' + i, '#4a8cff');
  const { ch } = frame();
  assert.ok(ch.lane.lines <= 2, 'at most 2 lines (' + ch.lane.lines + ')');
  assert.ok(ch.feed.some(f => /PORTAL/.test(f.msg)), 'the portal line is painted: ' + JSON.stringify(ch.feed.map(f => f.msg)));
  assert.ok(ch.lane.y >= ch.vitals.y + ch.vitals.h, 'the lane sits under the vitals block');
});

s.check('quests are a chip; J, a click or a tap on it opens the full tracker', () => {
  fresh();
  assert.ok(st.quests && st.quests.length, 'the run has quests');
  st.questsOpen = false;
  let f = frame();
  const chip = f.ch.questChip;
  assert.ok(chip && /^QUESTS \d\/\d/.test(chip.text), 'the chip is painted: ' + (chip && chip.text));
  assert.ok(!f.ch.questTracker, 'the tracker is closed');
  assert.ok(!f.texts.some(t => /0\/5|shrines|yard|elites/i.test(t) && !/^QUESTS/.test(t)), 'no quest lines on screen while closed');
  // J opens it.
  h.key('keydown', { key: 'j' });
  f = frame();
  assert.ok(st.questsOpen && f.ch.questTracker, 'J opens the tracker');
  assert.ok(f.ch.quests.h > chip.h, 'the chrome record grows to the open tracker');
  h.key('keydown', { key: 'j' });
  f = frame();
  assert.ok(!st.questsOpen && !f.ch.questTracker, 'J again closes it');
  // A tap on the chip (the harness canvas is 480x300 CSS px at 0,0: 1 view px each).
  const c = f.ch.questChip;
  const down = h.elements.game._ev.pointerdown;
  down({ clientX: c.x + c.w / 2, clientY: c.y + c.h / 2, preventDefault() {} });
  assert.ok(st.questsOpen, 'a tap on the chip opens the tracker');
  down({ clientX: c.x + c.w / 2, clientY: c.y + c.h / 2, preventDefault() {} });
  assert.ok(!st.questsOpen, 'a second tap closes it');
  // The hit box is thumb-sized and holds the chip; a tap far away does nothing.
  const hb = T.hud.questChipHitRect();
  assert.ok(inside(c, hb) && hb.w >= 64 && hb.h >= 30, 'hit box ' + JSON.stringify(hb));
  down({ clientX: 240, clientY: 200, preventDefault() {} });
  assert.ok(!st.questsOpen, 'a tap on the field does not open it');
});

s.check('a finished quest lights the chip and names itself in the lane', () => {
  fresh();
  const sc = styled();
  st.questFlashUntil = st.time + 2;
  T.renderer.drawHudChrome(sc.ctx, st);
  const c = T.renderer.hudChrome.questChip;
  assert.ok(sc.rects.some(q => q.x === c.x && q.y === c.y && q.style === '#8fe0a0'), 'green border while fresh');
  st.questFlashUntil = 0;
  const sc2 = styled();
  T.renderer.drawHudChrome(sc2.ctx, st);
  assert.ok(!sc2.rects.some(q => q.x === c.x && q.y === c.y && q.style === '#8fe0a0'), 'grey again after');
});

s.check('key strip: the first minutes of the first runs, help mode, never after', () => {
  fresh();
  const K = C.HUD.KEYSTRIP;
  st.runsBefore = 0; st.time = 10;
  assert.equal(T.hud.keyStripWanted(), true, 'run 1, early: shown');
  st.time = K.SECONDS + 1;
  assert.equal(T.hud.keyStripWanted(), false, 'run 1, past the first minutes: folded');
  st.runsBefore = K.RUNS; st.time = 5;
  assert.equal(T.hud.keyStripWanted(), false, 'a later run: folded from the start');
  st.helpMode = true;
  assert.equal(T.hud.keyStripWanted(), true, 'help mode (the ? key): shown');
  st.helpMode = false;
  // syncChrome folds the strip on the desktop layer and publishes the ready line.
  const tl = T.hud.touchLayer();
  tl.classList.add('cog-only'); tl.classList.remove('on');
  st.runsBefore = 5; st.time = 400;
  frame();   // the fold lands this frame; the HUD paints the line from the next
  let f = frame();
  assert.ok(tl.classList.contains('kb-min'), 'the strip folds into the KEYS chip');
  assert.ok(/^Q \S+  E \S+  H \d+  N \d+$/.test(st.readyRow), 'the ready line: ' + st.readyRow);
  assert.equal(f.ch.readyRow, st.readyRow, 'the vitals block paints it');
  assert.ok(f.texts.includes(st.readyRow), 'painted');
  assert.ok(inside({ x: f.ch.vitals.x, y: f.ch.vitals.y + 33, w: 10, h: 9 }, f.ch.vitals), 'inside the block');
  st.runsBefore = 0; st.time = 5;
  frame();
  f = frame();
  assert.ok(!tl.classList.contains('kb-min') && st.readyRow === '' && !f.ch.readyRow, 'early on: the full strip, no ready line');
  // On a phone (the touch layer's .on class) the strip is never shown and the
  // ready line stays off (the pads carry it).
  tl.classList.remove('cog-only'); tl.classList.add('on');
  st.runsBefore = 5; st.time = 400;
  frame();
  assert.equal(st.readyRow, '', 'no ready line on a phone');
  tl.classList.remove('on'); tl.classList.remove('kb-min');
});

s.check('index.html: the strip shows only on the desktop layer, folds to one KEYS chip', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(/#touch \.keybar \{ display: none; \}/.test(html), 'hidden by default (a phone never shows it)');
  assert.ok(/#touch\.cog-only \.keybar \{/.test(html), 'shown only on the desktop layer');
  assert.ok(/#touch\.cog-only\.kb-min \.keybar > \* \{ display: none; \}/.test(html), 'folded: every chip hides');
  assert.ok(/#touch\.cog-only\.kb-min \.keybar \.kb-more \{ display: inline-block; \}/.test(html), 'but the KEYS chip');
  assert.ok(/<button data-act="help" class="kb-more" id="kb-more"><b>\?<\/b>KEYS<\/button>/.test(html), 'the KEYS chip is the help action');
});

s.check('a boss fight: HP, the boss bar, the clock and every live rule show with no tap, clear of each other', () => {
  for (const manual of [false, true]) {
    for (const r of BOSS_RULES) {
      fresh();
      st.questsOpen = false;
      st.pilotMode = manual ? 'MANUAL' : 'AUTO_ALL';
      st.bossRule = { id: r.id, text: r.name + ': ' + r.rule, live: true, broken: false };
      st.wave.boss = { hp: 50, maxHp: 100 };
      T.getProfile().runPurse = 99999;
      st.player.hp = 1234; st.player.stats.maxHp = 1234;
      const { ch } = frame();
      assert.ok(ch.rule && ch.vitals && ch.clock && ch.purse && ch.questChip, r.id + ': all painted');
      // The boss bar owns y 3..10 across the top (render.js); nothing here may sit on it.
      for (const k of ['rule', 'vitals', 'purse']) assert.ok(ch[k].y >= 10, k + ' is below the boss bar (y ' + ch[k].y + ')');
      const manualBadge = { x: ch.vitals.x + ch.vitals.w + 3, y: ch.vitals.y, w: 14, h: 17 };
      for (const k of ['vitals', 'clock', 'purse', 'questChip']) {
        assert.ok(!overlap(ch.rule, ch[k]), r.id + (manual ? ' manual' : '') + ': the rule plate clears ' + k + ' ' + JSON.stringify([ch.rule, ch[k]]));
      }
      if (manual) assert.ok(!overlap(ch.rule, manualBadge), r.id + ': clears the MANUAL badge');
      assert.ok(ch.rule.x >= 0 && ch.rule.x + ch.rule.w <= C.VIEW_W, 'on screen');
      st.wave.boss = null; st.bossRule = null;
    }
  }
  st.pilotMode = 'AUTO_ALL';
  T.getProfile().runPurse = 0;
});

s.check('settings and ADVANCED take the compact grid; other menus drop it', () => {
  fresh();
  h.key('keydown', { key: 'Escape' });
  assert.equal(st.mode, 'settings', 'ESC pauses into settings');
  const ov = h.elements.overlay;
  assert.ok(ov.classList.contains('settings'), 'the settings page is a grid');
  const adv = h.elements['ov-cards'].children.find(c => /ADVANCED/.test(c.innerHTML));
  adv.click();
  assert.ok(ov.classList.contains('settings') && /ADVANCED/.test(h.elements['ov-title'].textContent), 'ADVANCED too');
  h.key('keydown', { key: 'Escape' });   // ADVANCED -> ESC resumes the fight
  if (st.mode === 'settings') h.key('keydown', { key: 'Escape' });
  assert.equal(st.mode, 'playing', 'back in the fight');
  assert.ok(!ov.classList.contains('settings'), 'leaving the pause drops the grid (a draft never inherits it)');
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(/#overlay\.settings \.cards \{\s*display: grid;/.test(html), 'the grid rule is in index.html');
});

// ---- Review fixes (hud review) ----------------------------------------------

s.check('a full stream of important lines drops a lesser newcomer, never one of them', () => {
  const list = [];
  for (let i = 0; i < 8; i++) pushToast(list, { msg: 'QUEST DONE: GOAL ' + i, ttl: 4 });
  assert.equal(pushToast(list, { msg: 'FOUND THING', ttl: 4 }), false, 'the pickup is dropped');
  assert.equal(pushToast(list, { msg: 'WAVE 4 - THE MARSH', ttl: 4 }), false, 'the wave line is dropped');
  assert.equal(list.length, 8);
  assert.ok(list.every(e => e.rank === 2), JSON.stringify(list.map(e => e.msg)));
  // A new important line still gets in: the oldest important line makes room.
  assert.equal(pushToast(list, { msg: 'THE PORTAL OPENS', ttl: 4 }), true);
  assert.ok(!list.some(e => e.msg === 'QUEST DONE: GOAL 0') && list.some(e => e.msg === 'QUEST DONE: GOAL 1'));
});

s.check('boss news from the altar, the statue curse and the mid-bosses ranks with the boss lines', () => {
  assert.equal(toastRank('THE ALTAR CALLS THE BOSS. BEAT IT FOR AN EXTRA CHEST'), 2);
  assert.equal(toastRank('CURSE: SLOW. BEAT THE BOSS FOR: A RARE CHEST'), 2);
  assert.equal(toastRank('COLOSSUS DOWN - SHOCKWAVE!'), 2);
  assert.equal(toastRank('HERALD DOWN'), 2);
  assert.equal(toastRank('CURSE LIFTED. REWARD: A RARE CHEST'), 2);
  assert.equal(toastRank('FOUND: CURSED RING'), 0, 'a pickup naming a curse is not boss news');
});

s.check('finishing a real quest lights the chip', () => {
  fresh();
  st.questFlashUntil = 0;
  const q = st.quests.find(x => !QUEST_BY_ID[x.id].joker) || st.quests[0];
  const d = QUEST_BY_ID[q.id];
  T.world.quest(d.ev, d.n);
  assert.ok(q.done, 'the quest is done');
  assert.ok(st.questFlashUntil > st.time, 'worldQuest sets the flash (' + st.questFlashUntil + ' at ' + st.time + ')');
  assert.ok(st.toasts.some(t => /QUEST DONE/.test(t.msg)), 'and names it in the lane');
});

s.check('J and the chip work only in a fight', () => {
  fresh();
  st.questsOpen = false;
  for (const m of ['menu', 'draft', 'settings', 'dead']) {
    st.mode = m;
    assert.equal(T.hud.toggleQuests(), false, m + ': no toggle');
    assert.equal(st.questsOpen, false, m + ': the tracker stays shut');
  }
  st.mode = 'finale';
  assert.equal(T.hud.toggleQuests(), true, 'the finale is still a fight');
  st.questsOpen = false;
  fresh();
  h.key('keydown', { key: 'Escape' });
  assert.equal(st.mode, 'settings');
  h.key('keydown', { key: 'j' });
  assert.equal(st.questsOpen, false, 'J in the pause menu does nothing');
  h.key('keydown', { key: 'Escape' });
  if (st.mode === 'settings') h.key('keydown', { key: 'Escape' });
});

s.check('the fold hands the key strip band to the canvas', () => {
  fresh();
  const tl = T.hud.touchLayer();
  const gcs = globalThis.getComputedStyle;
  const conn = Object.getOwnPropertyDescriptor(tl, 'isConnected');
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => '', display: 'block' });
  Object.defineProperty(tl, 'isConnected', { value: true, configurable: true, writable: true });
  try {
    tl.classList.add('cog-only'); tl.classList.remove('on');
    st.runsBefore = 0; st.time = 5;
    frame(); frame();
    const canvasEl = h.elements.game;
    const hUp = parseFloat(canvasEl.style.height);
    assert.ok(!tl.classList.contains('kb-min') && hUp > 0, 'strip up, canvas ' + canvasEl.style.height);
    st.runsBefore = 5; st.time = 400;
    frame(); frame();
    const hDown = parseFloat(canvasEl.style.height);
    assert.ok(tl.classList.contains('kb-min'), 'folded');
    assert.ok(hDown > hUp, 'the canvas grows into the freed band (' + hUp + ' -> ' + hDown + ')');
  } finally {
    globalThis.getComputedStyle = gcs;
    if (conn) Object.defineProperty(tl, 'isConnected', conn); else delete tl.isConnected;
    tl.classList.remove('cog-only'); tl.classList.remove('kb-min');
    T.hud.fitCanvas();
  }
});

s.check('the tutorial keeps the key strip up while it points at a key', () => {
  fresh();
  const tl = T.hud.touchLayer();
  tl.classList.add('cog-only'); tl.classList.remove('on');
  st.runsBefore = 5; st.time = 400;
  frame();
  assert.ok(tl.classList.contains('kb-min'), 'a veteran, late: folded');
  // A first-time TAB hint rings the focus chip: the strip comes back for it.
  T.tut.hints.active = { id: 'focus', text: 'x', targets: ['focusbtn'], shownMs: 0, idleT: 0 };
  assert.equal(T.hud.keyStripWanted(), true, 'a hint on a key chip wants the strip');
  st.mode = 'playing';
  T.tut.hints.active = { id: 'questtracker', text: 'x', targets: ['questchip'], shownMs: 0, idleT: 0 };
  assert.equal(T.hud.keyStripWanted(), false, 'a hint on something else does not');
  T.tut.hints.active = null;
  tl.classList.remove('cog-only'); tl.classList.remove('kb-min');
  // A veteran replaying the guided tutorial: the strip stays up for its steps.
  const prof = T.getProfile();
  prof.achievements = prof.achievements || {};
  prof.achievements.totals = Object.assign({}, prof.achievements.totals, { runs: 5 });
  st.mode = 'menu';
  T.whatsNew.arm();
  T.startRun();
  assert.ok(T.tut.live, 'the guided run is live');
  st.runsBefore = 5; st.time = 400;
  assert.equal(T.hud.keyStripWanted(), true, 'the guided run wants the strip, even for a veteran');
  T.tut.skip(0); T.tut.skip(0);
});

s.check('TAB names the new focus in the lane; O names the pilot mode', () => {
  fresh();
  st.toasts.length = 0;
  const f0 = T.controller.focus;
  h.key('keydown', { key: 'Tab' });
  assert.notEqual(T.controller.focus, f0, 'TAB cycled the focus');
  assert.ok(st.toasts.some(t => t.msg.startsWith('FOCUS ' + T.controller.focus + ':')), JSON.stringify(st.toasts.map(t => t.msg)));
  h.key('keyup', { key: 'Tab' });
  st.toasts.length = 0;
  const p0 = st.pilotMode;
  h.key('keydown', { key: 'o' });
  assert.notEqual(st.pilotMode, p0, 'O changed the pilot');
  assert.ok(st.toasts.length > 0, 'and says so: ' + JSON.stringify(st.toasts.map(t => t.msg)));
  h.key('keyup', { key: 'o' });
  T.setPilotMode('AUTO_ALL');
});

s.check('the quest hint rings the chip and names the J key', () => {
  const H = T.tut.HINTS;
  assert.ok(/J/.test(H.questtracker.text) && /chip/.test(H.questtracker.text), H.questtracker.text);
  const src = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.ok(/tutHint\('questtracker', \['questchip'\]\)/.test(src), 'the hint targets the chip');
  assert.ok(/case 'questchip':/.test(src), 'and the chip resolves to its box');
});

s.check('the settings grid shrinks its type only when the page would not fit', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(/#overlay\.settings\.tight \.card \.desc \{ font-size: 9px/.test(html), 'the small type is under .tight');
  assert.ok(!/@media \(max-height: 460px\) \{\s*#overlay\.settings/.test(html), 'not under a blanket short-screen rule');
  fresh();
  const ov = h.elements.overlay;
  // Fits: no .tight.
  ov.scrollHeight = 300; ov.clientHeight = 390;
  h.key('keydown', { key: 'Escape' });
  assert.equal(st.mode, 'settings');
  assert.ok(ov.classList.contains('settings') && !ov.classList.contains('tight'), 'a page that fits keeps its type');
  // Would overflow: .tight.
  ov.scrollHeight = 520;
  const adv = h.elements['ov-cards'].children.find(c => /ADVANCED/.test(c.innerHTML));
  adv.click();
  assert.ok(ov.classList.contains('tight'), 'a page that overflows takes the tight sizes');
  h.key('keydown', { key: 'Escape' });
  if (st.mode === 'settings') h.key('keydown', { key: 'Escape' });
  assert.ok(!ov.classList.contains('tight'), 'leaving drops it');
  delete ov.scrollHeight; delete ov.clientHeight;
});

s.done();
