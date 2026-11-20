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
  // R9: the corner chip shows the strip (it no longer opens help mode), and a
  // HIDE chip ends the strip. Neither is ever shed on a narrow window.
  assert.ok(/<button data-act="kbshow" class="kb-more" id="kb-more"[^>]*><span class="kb-arrow up" aria-hidden="true"><\/span>KEYS<\/button>/.test(html), 'the KEYS chip shows the strip, with an up arrow');
  assert.ok(!/data-act="help" class="kb-more"/.test(html), 'the KEYS chip is not the help action any more');
  const bar = /<div class="keybar" id="keybar">([\s\S]*?)<\/div>/.exec(html)[1];
  const acts = [...bar.matchAll(/<button data-act="([a-z]+)"/g)].map(m => m[1]);
  assert.deepEqual(acts.slice(-3), ['help', 'kbhide', 'kbshow'], 'HIDE comes after HELP, last before the corner chip: ' + acts);
  assert.ok(/<button data-act="kbhide" class="kb-hide" id="kb-hide"[^>]*><span class="kb-arrow dn" aria-hidden="true"><\/span><span class="kb-w">HIDE<\/span><\/button>/.test(bar), 'the HIDE chip, with a down arrow');
  // No narrow-window rule ever hides the HIDE chip itself (below 800 px it
  // keeps its arrow and drops only the word).
  const mediaBlocks = [];
  for (const m of html.matchAll(/@media \(max-width: (\d+)px\) \{/g)) {
    let i = m.index + m[0].length, depth = 1;
    while (depth && i < html.length) { if (html[i] === '{') depth++; else if (html[i] === '}') depth--; i++; }
    mediaBlocks.push({ w: +m[1], body: html.slice(m.index + m[0].length, i - 1) });
  }
  assert.ok(mediaBlocks.length >= 4, 'found the width rules');
  for (const b of mediaBlocks) {
    assert.ok(!/\.kb-hide\s*(,[^{]*)?\{[^}]*display:\s*none/.test(b.body), 'max-width ' + b.w + ' must not hide the HIDE chip');
  }
  assert.ok(!/data-act="kbhide" class="[^"]*\bopt/.test(bar), 'the HIDE chip has no shedding class');
  const narrow = mediaBlocks.find(b => b.w === 799);
  assert.ok(narrow && /#touch \.keybar \.kb-hide \.kb-w \{ display: none; \}/.test(narrow.body), 'below 800 px HIDE drops only its word');
  assert.ok(/#touch \.keybar \.kb-hide \{\s*position: relative; margin-left: 16px;/.test(html), 'set apart from PAUSE and HELP');
  assert.ok(/@media \(prefers-reduced-motion: reduce\) \{ #touch \.keybar \.kb-more\.kb-pulse \{ animation: none; \} \}/.test(html), 'no pulse under reduced motion');
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

// ---- R9: the desktop key strip, shown or hidden (TASKS9 "keys") --------------
// A click on a strip chip, the way the touch layer's pointerdown sees it.
const chipEl = (act) => ({
  dataset: { act },
  getBoundingClientRect: () => ({ left: 400, top: 280, right: 440, bottom: 296, width: 40, height: 16 }),
});
const press = (H, act, x = 420, y = 288) => {
  const b = chipEl(act);
  H.T.hud.touchLayer()._ev.pointerdown({
    target: { closest: (sel) => (sel === '[data-act]' ? b : null) }, clientX: x, clientY: y, preventDefault() {},
  });
};
const desk = (H) => {
  const tl = H.T.hud.touchLayer();
  tl.classList.add('cog-only'); tl.classList.remove('on');
  return tl;
};
// A between-runs lesson line (from earlier checks) takes the next key; clear
// it so the key reaches the help gate.
const helpKey = (k) => { T.tut.hints.active = null; h.key('keydown', { key: k, preventDefault() {} }); };
const deskDone = (H) => {
  const tl = H.T.hud.touchLayer();
  tl.classList.remove('cog-only'); tl.classList.remove('kb-min');
  H.T.hud.setKeyStripChoice(null);
};

s.check('R9: the corner chip shows the strip with the game running; the HIDE chip folds it; both are kept', () => {
  fresh();
  const tl = desk(h);
  try {
    assert.equal(T.hud.keyStripChoice(), null, 'no choice on a new device');
    st.runsBefore = 5; st.time = 400;
    step();
    assert.ok(tl.classList.contains('kb-min'), 'a veteran, late: folded into the corner chip');
    press(h, 'kbshow');
    assert.ok(!tl.classList.contains('kb-min'), 'one click and the strip is up, at once');
    assert.equal(st.helpMode, false, 'not help mode');
    assert.equal(st.mode, 'playing', 'not paused');
    assert.equal(h.storage.get('hordes_keystrip'), 'shown', 'remembered on this device');
    assert.equal(st.readyRow, '', 'the ready line goes in the same click, not a frame later');
    // A double click: the second press lands on HIDE (narrow window) and is ignored.
    press(h, 'kbhide');
    assert.ok(!tl.classList.contains('kb-min') && h.storage.get('hordes_keystrip') === 'shown', 'a double click does not hide it again');
    // A slow double click (Windows allows 500 ms between the two clicks), even
    // with the mouse moved off the KEYS spot.
    h.advanceClock(520);
    press(h, 'kbhide', 520, 288);
    assert.ok(!tl.classList.contains('kb-min'), 'a slow double click (520 ms) does not hide it either');
    // A third click on the same spot a little later: still taken as a repeat of KEYS.
    h.advanceClock(400);
    press(h, 'kbhide');
    assert.ok(!tl.classList.contains('kb-min') && h.storage.get('hordes_keystrip') === 'shown', 'HIDE on the KEYS spot within 1.5 s is ignored');
    // (A between-runs lesson line from an earlier check holds the sim; clear it.)
    T.tut.hints.active = null;
    const t0 = st.time;
    step(30);   // half a second: past the double-click guard
    assert.ok(st.time > t0, 'the clock runs (' + t0 + ' -> ' + st.time + ')');
    assert.ok(!tl.classList.contains('kb-min') && st.readyRow === '', 'still up; no ready line while it is up');
    // Every chip works: PILOT changes the pilot, no help tip.
    const p0 = st.pilotMode;
    press(h, 'pilot');
    assert.notEqual(st.pilotMode, p0, 'the PILOT chip works');
    T.setPilotMode('AUTO_ALL');
    h.advanceClock(1000);   // past the same-spot window
    press(h, 'kbhide');
    assert.ok(tl.classList.contains('kb-min'), 'HIDE folds it at once');
    assert.equal(h.storage.get('hordes_keystrip'), 'hidden', 'and remembers that');
    assert.ok(/^Q \S+  E \S+  H \d+  N \d+$/.test(st.readyRow), 'the ready line is back in the same click: ' + st.readyRow);
    step();
    assert.ok(/^Q \S+  E \S+  H \d+  N \d+$/.test(st.readyRow), 'the ready line is back: ' + st.readyRow);
  } finally { deskDone(h); }
});

s.check('R9: KEYS and HIDE refit the canvas at once (the band comes and goes)', () => {
  fresh();
  const tl = T.hud.touchLayer();
  const gcs = globalThis.getComputedStyle;
  const conn = Object.getOwnPropertyDescriptor(tl, 'isConnected');
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => '', display: 'block' });
  Object.defineProperty(tl, 'isConnected', { value: true, configurable: true, writable: true });
  try {
    tl.classList.add('cog-only'); tl.classList.remove('on');
    T.hud.setKeyStripChoice('hidden');
    st.runsBefore = 5; st.time = 400;
    frame(); frame();
    const canvasEl = h.elements.game;
    const hDown = parseFloat(canvasEl.style.height);
    assert.ok(tl.classList.contains('kb-min') && hDown > 0, 'folded, canvas ' + canvasEl.style.height);
    h.advanceClock(2000);
    press(h, 'kbshow');
    const hUp = parseFloat(canvasEl.style.height);
    assert.ok(!tl.classList.contains('kb-min'), 'KEYS: up');
    assert.ok(hUp < hDown, 'KEYS: the canvas makes room for the strip at once (' + hDown + ' -> ' + hUp + ')');
    h.advanceClock(2000);
    press(h, 'kbhide');
    assert.ok(tl.classList.contains('kb-min'), 'HIDE: folded');
    assert.equal(parseFloat(canvasEl.style.height), hDown, 'HIDE: the canvas takes the band back at once');
  } finally {
    globalThis.getComputedStyle = gcs;
    if (conn) Object.defineProperty(tl, 'isConnected', conn); else delete tl.isConnected;
    tl.classList.remove('cog-only'); tl.classList.remove('kb-min');
    T.hud.setKeyStripChoice(null);
    T.hud.fitCanvas();
  }
});

s.check('R9: a choice made in another tab reaches this one (the storage event)', () => {
  fresh();
  const tl = desk(h);
  try {
    T.hud.setKeyStripChoice('shown');
    st.runsBefore = 5; st.time = 400;
    step();
    assert.ok(!tl.classList.contains('kb-min'), 'shown here');
    h.storage.set('hordes_keystrip', 'hidden');   // the other tab hid it
    h.handlers.storage({ key: 'hordes_keystrip', oldValue: 'shown', newValue: 'hidden' });
    assert.equal(T.hud.keyStripChoice(), 'hidden', 'this tab reads the new choice');
    step();
    assert.ok(tl.classList.contains('kb-min'), 'and folds its strip');
  } finally { deskDone(h); }
});

s.check('R9: a stored SHOWN keeps the strip up in a later run and past the first minutes', () => {
  fresh();
  const K = C.HUD.KEYSTRIP;
  T.hud.setKeyStripChoice('shown');
  try {
    st.runsBefore = K.RUNS + 4; st.time = 900;
    assert.equal(T.hud.keyStripWanted(), true, 'a later run, late: shown');
    st.runsBefore = 0; st.time = K.SECONDS + 1;
    assert.equal(T.hud.keyStripWanted(), true, 'run 1 past the first minutes: shown');
  } finally { T.hud.setKeyStripChoice(null); }
});

s.check('R9: a stored HIDDEN folds run 1 from the start, but the guided run and a chip hint still raise it', () => {
  fresh();
  T.hud.setKeyStripChoice('hidden');
  try {
    st.runsBefore = 0; st.time = 5;
    assert.equal(T.hud.keyStripWanted(), false, 'run 1, early: folded');
    T.tut.hints.active = { id: 'focus', text: 'x', targets: ['focusbtn'], shownMs: 0, idleT: 0 };
    assert.equal(T.hud.keyStripWanted(), true, 'a hint on the TAB chip raises it');
    T.tut.hints.active = null;
    assert.equal(T.hud.keyStripWanted(), false, 'and it goes back to the choice');
    const prof = T.getProfile();
    prof.achievements = prof.achievements || {};
    prof.achievements.totals = Object.assign({}, prof.achievements.totals, { runs: 5 });
    st.mode = 'menu';
    T.whatsNew.arm();
    T.startRun();
    assert.ok(T.tut.live, 'the guided run is live');
    assert.equal(T.hud.keyStripWanted(), true, 'the guided run raises it');
    T.tut.guided.over = true;   // the guided run has ended
    assert.ok(!T.tut.live, 'the guided run is over');
    assert.equal(T.hud.keyStripWanted(), false, 'then the choice again');
  } finally { T.tut.hints.active = null; T.hud.setKeyStripChoice(null); }
});

s.check('R9: help mode raises the strip and leaving it returns to the choice', () => {
  fresh();
  const tl = desk(h);
  try {
    T.hud.setKeyStripChoice('hidden');
    st.runsBefore = 5; st.time = 400;
    step();
    assert.ok(tl.classList.contains('kb-min'), 'hidden');
    helpKey('?');
    assert.ok(st.helpMode, '? arms help mode ');
    step();
    assert.ok(!tl.classList.contains('kb-min'), 'help mode shows the strip so the chips can be explained');
    // In help mode a click on HIDE explains it and never uses it.
    press(h, 'kbhide');
    assert.ok(st.helpMode && !tl.classList.contains('kb-min') && T.hud.keyStripChoice() === 'hidden', 'HIDE explained, not used');
    assert.ok(/HIDE CHIP: fold this strip/.test(globalThis.document.getElementById('help-tip').innerHTML), 'the tip says what HIDE does: ' + globalThis.document.getElementById('help-tip').innerHTML);
    helpKey('?');
    assert.ok(!st.helpMode, '? leaves');
    step();
    assert.ok(tl.classList.contains('kb-min'), 'back to HIDDEN');
    T.hud.setKeyStripChoice('shown');
    step();
    assert.ok(!tl.classList.contains('kb-min'), 'SHOWN');
    helpKey('F1');
    step();
    helpKey('F1');
    step();
    assert.ok(!st.helpMode && !tl.classList.contains('kb-min'), 'help on and off with F1: still SHOWN');
  } finally { deskDone(h); }
});

s.check('R9: the first fold by itself (an early run, no choice) pulses the corner chip once', () => {
  fresh();
  const tl = desk(h);
  const K = C.HUD.KEYSTRIP;
  const chip = globalThis.document.getElementById('kb-more');
  try {
    chip.classList.remove('kb-pulse');
    h.storage.delete('hordes_keystrip_pulsed');
    st.runsBefore = 1; st.time = K.SECONDS - 2;
    step();
    assert.ok(!tl.classList.contains('kb-min') && !chip.classList.contains('kb-pulse'), 'early: up, no pulse');
    st.time = K.SECONDS + 0.5;
    step();
    assert.ok(tl.classList.contains('kb-min'), 'the 180 s mark folds it');
    assert.ok(chip.classList.contains('kb-pulse'), 'and the corner chip pulses');
    chip.classList.remove('kb-pulse');
    helpKey('?'); step();
    helpKey('?'); step();
    assert.ok(tl.classList.contains('kb-min') && !chip.classList.contains('kb-pulse'), 'folding again in the same run: no second pulse');
    assert.equal(h.storage.get('hordes_keystrip_pulsed'), '1', 'kept on this device');
    // The next early run folds at 180 s too: no pulse, it was shown once.
    tl.classList.remove('kb-min');
    st.runsBefore = 2; st.time = K.SECONDS - 2;
    step();
    assert.ok(!tl.classList.contains('kb-min'), 'run 3, early: up');
    st.time = K.SECONDS + 0.5;
    step();
    assert.ok(tl.classList.contains('kb-min') && !chip.classList.contains('kb-pulse'), 'run 3 at 180 s: folded, no second pulse');
    // A veteran's run folds from the start: no pulse; nor a fold the player asked for.
    // The "pulsed once" flag is taken away first, or it alone would hide a
    // pulse here and these two checks would pass whatever the rule did.
    h.storage.delete('hordes_keystrip_pulsed');
    tl.classList.remove('kb-min');
    st.runsBefore = K.RUNS + 1; st.time = 5;
    step();
    assert.ok(tl.classList.contains('kb-min') && !chip.classList.contains('kb-pulse'), 'a veteran: no pulse');
    assert.ok(!h.storage.get('hordes_keystrip_pulsed'), 'a veteran: the one pulse is not spent');
    T.hud.setKeyStripChoice('shown'); step();
    st.runsBefore = 2; st.time = K.SECONDS + 1;
    h.advanceClock(1000);   // past the double-click guard
    h.storage.delete('hordes_keystrip_pulsed');
    press(h, 'kbhide');
    assert.ok(tl.classList.contains('kb-min') && !chip.classList.contains('kb-pulse'), 'the HIDE chip: no pulse');
    assert.ok(!h.storage.get('hordes_keystrip_pulsed'), 'the HIDE chip: the one pulse is not spent');
  } finally { chip.classList.remove('kb-pulse'); deskDone(h); }
});

s.check('R9: SETTINGS has a KEY STRIP row on the first page that cycles the choice', () => {
  fresh();
  desk(h);
  const cards = () => h.elements['ov-cards'].children;
  const row = () => cards().find(c => /KEY STRIP/.test(c.innerHTML));
  try {
    h.key('keydown', { key: 'Escape' });
    assert.equal(st.mode, 'settings');
    assert.ok(row(), 'the row is on the first settings page');
    assert.ok(/KEY STRIP: AUTO/.test(row().innerHTML) && /first runs/.test(row().innerHTML), 'no choice: AUTO, in plain words');
    row().click();
    assert.ok(/KEY STRIP: SHOWN/.test(row().innerHTML) && /along the bottom/.test(row().innerHTML), row().innerHTML);
    assert.equal(h.storage.get('hordes_keystrip'), 'shown');
    row().click();
    assert.ok(/KEY STRIP: HIDDEN/.test(row().innerHTML) && /in the corner/.test(row().innerHTML), row().innerHTML);
    assert.equal(h.storage.get('hordes_keystrip'), 'hidden');
    row().click();
    assert.ok(/KEY STRIP: SHOWN/.test(row().innerHTML), 'and back');
    h.key('keydown', { key: 'Escape' });
    if (st.mode === 'settings') h.key('keydown', { key: 'Escape' });
    assert.equal(st.mode, 'playing');
    // A phone or tablet (the pads): no row.
    const tl = T.hud.touchLayer();
    tl.classList.remove('cog-only'); tl.classList.add('on');
    h.key('keydown', { key: 'Escape' });
    assert.equal(st.mode, 'settings');
    assert.ok(!row(), 'no KEY STRIP row on the touch layer');
    h.key('keydown', { key: 'Escape' });
    if (st.mode === 'settings') h.key('keydown', { key: 'Escape' });
    tl.classList.remove('on');
  } finally { deskDone(h); }
});

// A reload is a second boot with the same storage (top-level awaits: the
// checks themselves are synchronous).
const H2 = await boot({ variant: 'ks-reload', storage: [['hordes_onboarded', '1'], ['hordes_keystrip', 'hidden']] });
s.check('R9: a stored HIDDEN is read back after a reload and folds run 1 from the start', () => {
  const S2 = H2.T.state;
  assert.equal(H2.T.hud.keyStripChoice(), 'hidden', 'read back from storage');
  H2.T.banners.suppressAll();
  const tl = desk(H2);
  S2.mode = 'menu'; H2.T.startRun(); H2.skipMovie();
  S2.runsBefore = 0; S2.time = 1;
  H2.pump(1);
  assert.equal(S2.mode, 'playing');
  assert.ok(tl.classList.contains('kb-min'), 'run 1, second 1: folded');
  press(H2, 'kbshow');
  assert.ok(!tl.classList.contains('kb-min'), 'the corner chip raises it');
  assert.equal(H2.storage.get('hordes_keystrip'), 'shown');
});
const H3 = await boot({ variant: 'ks-reload2', storage: [...H2.storage] });
s.check('R9: a SHOWN made by the corner chip survives the next reload', () => {
  assert.equal(H3.T.hud.keyStripChoice(), 'shown', 'SHOWN read back');
});

const H6 = await boot({ variant: 'ks-pulsed', storage: [['hordes_onboarded', '1'], ['hordes_keystrip_pulsed', '1']] });
s.check('R9: after a reload the corner chip does not pulse again', () => {
  const S6 = H6.T.state;
  H6.T.banners.suppressAll();
  const tl = desk(H6);
  S6.mode = 'menu'; H6.T.startRun(); H6.skipMovie();
  S6.runsBefore = 1; S6.time = 5;
  H6.pump(1);
  assert.ok(!tl.classList.contains('kb-min'), 'early: up');
  S6.time = C.HUD.KEYSTRIP.SECONDS + 1;
  H6.pump(1);
  assert.ok(tl.classList.contains('kb-min'), 'folded');
  assert.ok(!globalThis.document.getElementById('kb-more').classList.contains('kb-pulse'), 'no pulse: it already pulsed on this device');
});

const H4 = await boot({ variant: 'ks-rm', reducedMotion: true, storage: [['hordes_onboarded', '1']] });
s.check('R9: under reduced motion the first fold does not pulse', () => {
  const S4 = H4.T.state;
  H4.T.banners.suppressAll();
  const tl = desk(H4);
  S4.mode = 'menu'; H4.T.startRun(); H4.skipMovie();
  S4.runsBefore = 0; S4.time = 5;
  H4.pump(1);
  assert.ok(!tl.classList.contains('kb-min'), 'early: up');
  S4.time = C.HUD.KEYSTRIP.SECONDS + 1;
  H4.pump(1);
  assert.ok(tl.classList.contains('kb-min'), 'folded');
  assert.ok(!globalThis.document.getElementById('kb-more').classList.contains('kb-pulse'), 'no pulse');
});

const H5 = await boot({ variant: 'ks-touch', device: 'touch', storage: [['hordes_onboarded', '1']] });
s.check('R9: a touch device keeps its pads and has no KEY STRIP row', () => {
  H5.T.banners.suppressAll();
  assert.ok(H5.T.hud.touchLayer().classList.contains('on'), 'the pads');
  H5.state.mode = 'menu'; H5.T.startRun(); H5.skipMovie();
  H5.key('keydown', { key: 'Escape' });
  assert.equal(H5.state.mode, 'settings');
  assert.ok(!H5.elements['ov-cards'].children.some(c => /KEY STRIP/.test(c.innerHTML)), 'no row on a phone');
});

s.done();
