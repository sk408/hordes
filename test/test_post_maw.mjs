// HORDES — the maw and the map: what the maw closes, the statue's curse and
// the wave's boss, the mimic at a wave clear, map taps, world cards and the HUD.
//   statue:  no deal once the wave's boss is down; the curse lifts and pays
//            when the wave clears (a double wave too)
//   mimic:   one alive at the wave clear, or at the maw, still pays
//   maw:     the sites, the vault, the lever, the key and its carrier, the
//            yard's chest and the unfound secrets close together: not drawn,
//            not prompted, no carrier marked, no waypoint from the map
//   help:    a tap on the open map in help mode explains the icon
//   cards:   world cards stay on screen at every zoom, clear of the HUD
// Sites and the hero are placed by the test, never by the seeded placement.
// Run: node test/test_post_maw.mjs
import assert from 'node:assert';
import { suite, boot } from './_harness.mjs';
import { CURSES } from '../src/sites.js';
import { queueWorldCard, flushWorldCards, clearWorldCards, placeClear } from '../src/world_cards.js';
import { buildingRects } from '../src/stage_buildings.js';
import { startQuests } from '../src/quests.js';
import { CONFIG as C } from '../src/config.js';

const s = suite('test_post_maw');
const END = C.ESCALATION.END_WAVE;

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
};
// One frame with the hero kept alive.
const step = () => h.pump(1, () => { if (st.player) st.player.hp = st.player.stats.maxHp; });
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const onScreen = (c) => c.x >= 0 && c.y >= 0 && c.x + c.w <= C.VIEW_W && c.y + c.h <= C.VIEW_H;
// Render one frame with the world point (wx, wy) drawn at view px (sx, sy).
const shot = (wx, wy, sx = C.VIEW_W / 2, sy = C.VIEW_H / 2) => {
  const cam = { ...st.cam, x: wx - sx, y: wy - sy };
  h.rec.rects.length = 0; h.rec.texts.length = 0; h.rec.on = true;
  T.renderer.render(st, cam);
  h.rec.on = false;
  return { rects: h.rec.rects.slice(), texts: h.rec.texts.map(t => t.txt) };
};
const drew = (r, x, y, w, hh) => r.rects.some(q => q.x === x && q.y === y && q.w === w && q.h === hh);
// The art's own first rect, with the object at the view's centre (world_art.js).
const CX = C.VIEW_W / 2, CY = C.VIEW_H / 2;
const drewVault = (r) => drew(r, CX - 11, CY - 19, 22, 20);
const drewLever = (r) => drew(r, CX - 6, CY - 5, 13, 6);
const drewGlyph = (r) => drew(r, CX - 5, CY - 3, 11, 6);
const drewYardChest = (r) => drew(r, CX - 7, CY - 9, 14, 10);
const drewKey = (r) => drew(r, CX - 5, CY - 7, 11, 7) || drew(r, CX - 5, CY - 8, 11, 7);
// The statue, moved next to the hero's start (the spawn clearing holds no site).
const statueAt = (deal) => {
  const statue = st.sites.find(x => x.kind === 'statue');
  statue.x = st.player.x + 60; statue.y = st.player.y;
  if (deal) statue.deal = CURSES.find(c => c.id === deal);
  return statue;
};
const touch = (site) => {
  st.player.x = site.x; st.player.y = site.y;
  st.lastSteerT = st.time;   // steering: a deliberate touch
  T.sites.tick(st.player, 1 / 60);
};
// A spot `d` px from the hero with no building within 24 px: a chest dropped
// there stays there (chests are nudged out of footprints, maybe onto the hero).
const openSpot = (d) => {
  const rects = buildingRects(st.groundSeed, st.stage);
  for (let k = 0; k < 16; k++) {
    const a = k * Math.PI / 8, x = Math.round(st.player.x + Math.cos(a) * d), y = Math.round(st.player.y + Math.sin(a) * d);
    if (!rects.some(q => x > q.x - 24 && x < q.x + q.w + 24 && y > q.y - 24 && y < q.y + q.h + 24)) return { x, y };
  }
  throw new Error('no open spot ' + d + ' px from the hero');
};
const clickCard = (re) => {
  for (const c of h.elements['ov-cards'].children) if (re.test(c.innerHTML || '')) { c.click(); return true; }
  return false;
};
// Call the wave's cast and return it (the real wave check spawns it).
const callBosses = (wave) => {
  st.wave.num = wave;
  st.wave.endsAt = st.time;
  let guard = 0;
  while (!(st.wave.bosses || []).some(b => b.hp > 0) && guard++ < 900) step();
  st.wave.endsAt = st.time + 1e9;   // hold the clock: no second cast
  return st.wave.bosses.filter(b => b.hp > 0);
};

// ------------------------------------------------------------- the statue
s.check('statue: no deal once the wave\'s boss is down; it wakes next wave', () => {
  fresh();
  const statue = statueAt('swift');
  st.wave.num = 2;
  st.portal = { x: statue.x + 300, y: statue.y, age: 0 };   // the boss fell: the portal is open
  touch(statue);
  assert.equal(statue.state, 'unused', 'a touch while the portal is open takes no curse');
  assert.equal(st.siteCurse, null);
  assert.ok(shot(statue.x, statue.y).texts.includes('TOUCH IT NEXT WAVE'), 'the card says when');
  // The maw's wave: the sites close behind this portal.
  st.wave.num = END;
  touch(statue);
  assert.equal(statue.state, 'unused');
  assert.ok(shot(statue.x, statue.y).texts.includes('TOO LATE: THE BOSS IS DOWN'));
  // The next wave: the portal is gone, the deal is on.
  st.portal = null; st.wave.num = 3;
  assert.ok(shot(statue.x, statue.y).texts.includes('TOUCH TO ACCEPT'));
  touch(statue);
  assert.equal(statue.state, 'active', 'no portal: the curse is taken');
  assert.equal(st.siteCurse, statue.deal);
});

s.check('statue: the curse lifts and pays when the wave clears, on a double wave too', () => {
  fresh();
  const statue = statueAt('tough');   // the reward: two chests
  touch(statue);
  assert.equal(statue.state, 'active');
  st.player.x -= 200;   // off the statue
  const cast = callBosses(3);
  assert.equal(cast.length, 2, 'wave 3 calls two bosses');
  st.chests.length = 0;
  cast[0].hp = 0;   // the first one down clears the wave
  step();
  assert.ok(st.portal, 'the portal is open');
  assert.ok(!st.enemies.some(e => e.boss), 'the other boss left with the clear');
  assert.equal(statue.state, 'spent', 'the statue is done');
  assert.equal(st.siteCurse, null, 'the curse is lifted');
  assert.equal(st.chests.length, C.ESCALATION.BOSS.CHESTS + 2, 'the boss\'s chests and the statue\'s two');
  const e = { x: 0, y: 0, hp: 10, maxHp: 10, speed: 20 };
  T.sites.curseEnemy(e);
  assert.equal(e.hp, 10, 'new spawns are not cursed');
});

// ------------------------------------------------------------- the mimic
s.check('mimic: one alive when the wave clears still pays its rare chest and the secret', () => {
  fresh();
  st.time = 400;
  st.wave.endsAt = st.time + 1e9; st.wave.midAt = st.time + 1e9;
  const pr = T.getProfile();
  pr.world.secrets.mimic = false;
  T.world.wakeMimic(st.player.x + 80, st.player.y);
  const m = st.enemies.find(e => e.mimic);
  assert.ok(m, 'the mimic is up');
  st.poi.mimicDone = true;   // the run's one mimic (set where the chest roll wakes it)
  m.hp = m.maxHp = 1e9; m.speed = 0;
  Object.assign(m, openSpot(150));   // away from the hero and from any building
  st.chests.length = 0;
  st.wave.pendingClear = true;   // the wave's boss fell this frame
  st.wave.portalX = st.player.x + 200; st.wave.portalY = st.player.y;
  step();
  assert.ok(!st.enemies.includes(m), 'the clear took the mimic');
  assert.equal(st.chests.filter(c => c.band === 'rare').length, 1, 'its rare chest is on the field');
  assert.equal(pr.world.secrets.mimic, true, 'the secret is found');
});

// ------------------------------------------------------------- the maw
let w = null;
s.check('the maw closes the world: a live mimic is paid after the clears; carrier, key and curse are gone', () => {
  fresh();
  st.time = 400;
  w = st.poi;
  const pr = T.getProfile();
  pr.world.secrets.mimic = false;
  // Before the maw the world art is there (the checks below read the same rects).
  st.player.x = w.vault.x - 30; st.player.y = w.vault.y + 30;
  let r = shot(w.vault.x, w.vault.y);
  assert.ok(drewVault(r), 'before: the vault is drawn');
  assert.ok(r.texts.some(t => /^VAULT: /.test(t)), 'before: the vault card shows');
  assert.ok(drewLever(shot(w.lever.x, w.lever.y)), 'before: the lever is drawn');
  assert.ok(drewYardChest(shot(w.yard.x, w.yard.y)), 'before: the yard chest is drawn');
  const glyph = st.secrets.find(x => x.kind === 'glyph');
  assert.ok(glyph && drewGlyph(shot(glyph.x, glyph.y)), 'before: the glyph is drawn');
  st.player.x = C.VIEW_W / 2; st.player.y = C.VIEW_H / 2;
  // The maw's wave: its boss falls, the portal opens.
  for (const b of callBosses(END)) b.hp = 0;
  step();
  assert.ok(st.portal, 'the portal is open');
  // Still on the field when the hero walks in: a mimic, the key carrier, a key.
  T.world.wakeMimic(st.player.x + 300, st.player.y);
  const m = st.enemies.find(e => e.mimic);
  w.mimicDone = true;   // the run's one mimic: the boss's chests on the way are plain
  m.hp = m.maxHp = 1e9; m.speed = 0;
  Object.assign(m, openSpot(200));
  const carrier = { x: st.player.x - 300, y: st.player.y, hp: 1e9, maxHp: 1e9, elite: true, w: 16, h: 16, typeId: 'BRUTE', xp: 1, speed: 0 };
  st.enemies.push(carrier);
  T.world.markCarrier(carrier);
  assert.equal(w.carrier, carrier, 'before the maw an elite carries the key');
  w.keyDrop = { x: st.player.x, y: st.player.y + 400 };
  st.siteCurse = CURSES[0];
  // Two quests that need the world's sites, one the field can still finish.
  st.quests = startQuests(['shrines2', 'yard', 'elites5']);
  let guard = 0;
  while (st.mode !== 'finale' && guard++ < 6000) {
    if (st.mode === 'draft' || st.mode === 'evolve') { const c = h.elements['ov-cards'].children[0]; if (c) { c.click(); continue; } }
    if (st.mode === 'playing' && st.portal) { st.player.x = st.portal.x; st.player.y = st.portal.y; st.spawnTimer = 1e9; }
    step();
  }
  assert.equal(st.mode, 'finale', 'the maw starts');
  assert.equal(st.sites.length, 0, 'the sites are closed');
  assert.deepEqual(st.enemies.map(e => !!e.finalBoss), [true], 'only the maw is on the field');
  assert.equal(st.chests.filter(c => c.band === 'rare').length, 1, 'the mimic\'s rare chest survived the clears');
  assert.equal(pr.world.secrets.mimic, true, 'the mimic secret is found');
  assert.equal(w.carrier, null, 'no carrier is left marked');
  assert.equal(w.keyDrop, null, 'no key lies on the ground');
  assert.equal(st.siteCurse, null, 'no curse outlives the statue');
  assert.ok(st.secrets.every(x => x.state === 'spent'), 'unfound secrets are closed');
  assert.equal(w.closed, true, 'the vault, lever and yard are closed with the sites');
  assert.deepEqual(st.quests.map(q => !!q.closed), [true, true, false], 'the quests that need a closed site are closed');
  const tracker = shot(st.player.x, st.player.y).texts.filter(t => /shrines|yard|elites/.test(t));
  assert.deepEqual(tracker, ['Charge 2 shrines - CLOSED', 'Loot the walled yard - CLOSED', 'Kill 5 elites 0/5'], 'the tracker says so');
  // The maw withdraws; the run goes on.
  st.mawDeadline = st.time;
  step();
  assert.ok(clickCard(/CONTINUE/), 'the intermission offers CONTINUE');
  for (let i = 0; i < 3; i++) step();
  assert.equal(st.mode, 'playing');
  assert.ok(st.wave.num > END, 'wave ' + st.wave.num + ' after the maw');
});

s.check('after the maw: no key carrier is marked', () => {
  quiet(); st.wave.endsAt = st.time + 1e9; st.wave.midAt = st.time + 1e9;
  assert.ok(st.time >= 150 && w.vault.state !== 'spent', 'an elite would carry the key before the maw');
  const e = { x: st.player.x + 60, y: st.player.y, hp: 50, maxHp: 50, elite: true, w: 16, h: 16, typeId: 'BRUTE', xp: 1 };
  T.world.markCarrier(e);
  assert.ok(!e.keyCarrier, 'the elite is not marked');
  assert.equal(w.carrier, null);
});

s.check('after the maw: the vault, lever, key, yard chest and glyph are not drawn or prompted', () => {
  quiet();
  st.player.x = w.vault.x - 30; st.player.y = w.vault.y + 30;
  let r = shot(w.vault.x, w.vault.y);
  assert.ok(!drewVault(r), 'the vault is gone');
  assert.ok(!r.texts.some(t => /VAULT|KEY/.test(t)), 'no vault card: ' + JSON.stringify(r.texts.filter(t => /VAULT|KEY/.test(t))));
  assert.ok(!drewLever(shot(w.lever.x, w.lever.y)), 'the lever is gone');
  assert.ok(!drewYardChest(shot(w.yard.x, w.yard.y)), 'the yard chest is gone');
  assert.ok(!st.secrets.some(x => x.kind === 'glyph' && x.state !== 'spent'), 'no glyph left to find');
  assert.ok(!drewKey(shot(st.player.x, st.player.y + 4)), 'no key on the ground');
  // The radar shows no closed site either.
  st.player.x = w.lever.x + 20; st.player.y = w.lever.y;
  step();
  const rd = T.renderer.radar;
  assert.ok(!rd || !rd.landmarks.length, 'no site on the radar: ' + JSON.stringify(rd && rd.landmarks));
});

s.check('after the maw: a map tap on a closed site sets no waypoint', () => {
  quiet();
  for (const l of st.atlas.landmarks) { l.seen = true; l.discovered = true; }
  if (!st.mapOpen) T.map.toggle();
  step();
  const m = T.renderer.atlasMap;
  assert.ok(m, 'the map is open');
  const marks = m.landmarks.filter(x => x.site);
  assert.ok(marks.length >= 10, 'the old sites are still on the map');
  const mk = marks.find(x => x.kind === 'altar') || marks[0];
  assert.equal(T.sites.mapTap(mk.x, mk.y), true, 'the tap is the map\'s');
  assert.equal(st.waypoint, null, 'no waypoint is set');
  assert.equal(st.pilotGoal, null);
  assert.ok(marks.every(x => x.state === 'closed' || x.state === 'spent'), 'every site reads as closed: ' + [...new Set(marks.map(x => x.state))]);
  h.rec.texts.length = 0; h.rec.on = true; step(); h.rec.on = false;
  assert.ok(h.rec.texts.some(t => t.txt === 'MAP: THE SITES ARE CLOSED'), 'the header says so');
  assert.ok(!h.rec.texts.some(t => /TAP A SITE/.test(t.txt)), 'and offers no waypoint');
  // In help mode the tap says the site is closed.
  T.helpmode.enter();
  h.elements.game._ev.pointerdown({ clientX: mk.x, clientY: mk.y, pointerId: 1, preventDefault() {} });
  assert.ok(/^CLOSED SITE/.test(h.elements['help-tip'].innerHTML), 'help: ' + h.elements['help-tip'].innerHTML);
  T.helpmode.leave();
  // A site only seen on the radar is off the map now: nobody can reach it.
  st.atlas.landmarks.find(l => l.site === mk.site).discovered = false;
  step();
  assert.ok(!T.renderer.atlasMap.landmarks.some(x => x.site === mk.site), 'no "?" for a closed site');
  T.map.toggle();
});

// ------------------------------------------------------------- help mode
s.check('help mode: a tap on the open map explains the icon and sets no waypoint', () => {
  fresh();
  const site = st.sites.find(x => x.kind === 'altar');
  const lm = st.atlas.landmarks.find(l => l.site === site);
  lm.discovered = true;
  T.map.toggle(); step();
  const mk = T.renderer.atlasMap.landmarks.find(x => x.site === site);
  assert.ok(mk, 'the altar has a map icon');
  const tap = h.elements.game._ev.pointerdown;
  const ev = { clientX: mk.x, clientY: mk.y, pointerId: 1, preventDefault() {} };   // the stub canvas is 480x300 at 0,0
  assert.equal(T.helpmode.enter(), true, 'help mode is armed');
  tap(ev);
  assert.equal(st.waypoint, null, 'help mode: no waypoint');
  assert.equal(h.elements['help-tip'].innerHTML, T.helpmode.objectText('altar'), 'the tip explains the altar');
  // A site only seen on the radar keeps its secret.
  const other = st.sites.find(x => x.kind === 'statue');
  const lm2 = st.atlas.landmarks.find(l => l.site === other);
  lm2.seen = true; lm2.discovered = false;
  step();
  const mk2 = T.renderer.atlasMap.landmarks.find(x => x.site === other);
  tap({ ...ev, clientX: mk2.x, clientY: mk2.y });
  assert.equal(st.waypoint, null);
  assert.ok(/^\? /.test(h.elements['help-tip'].innerHTML) && !/STATUE/.test(h.elements['help-tip'].innerHTML), 'a "?" stays a "?"');
  T.helpmode.leave();
  // Out of help mode the same tap sets the waypoint, as before.
  tap(ev);
  assert.equal(st.waypoint && st.waypoint.site, site, 'a plain tap still sets it');
  T.sites.setWaypoint(null);
  T.map.toggle();
});

// ------------------------------------------------------------- world cards
s.check('cards: a card is clamped on screen after the zoom', () => {
  for (const Z of [1, 1.23, 1.39, 2]) {
    for (const box of [{ x: 4, y: 22, w: 100, h: 29 }, { x: 376, y: 267, w: 100, h: 29 }, { x: 200, y: 120, w: 100, h: 29 }]) {
      clearWorldCards();
      queueWorldCard(box, () => {});
      const [c] = flushWorldCards(h.ctx, { Z, vw: C.VIEW_W, vh: C.VIEW_H });
      assert.ok(onScreen(c), `Z ${Z}: card ${JSON.stringify(box)} lands at ${JSON.stringify(c)}`);
    }
  }
});

s.check('cards: placeClear steps past a second box when the first move lands on it', () => {
  const bars = { x: 4, y: 11, w: 200, h: 37 }, purse = { x: 6, y: 52, w: 66, h: 15 };
  const c = { x: 20, y: 5, w: 150, h: 30 };   // on the bars only; below them sits the purse
  const at = placeClear(c, [bars, purse], 480, 300);
  const b = { ...c, ...at };
  assert.ok(!overlap(b, bars) && !overlap(b, purse), 'clear of both: ' + JSON.stringify(at));
  assert.ok(onScreen(b), 'on screen');
});

s.check('live: the statue card never covers the HUD, at any zoom', () => {
  fresh();
  const statue = statueAt();
  st.player.x = statue.x + 20; st.player.y = statue.y + 20;
  let n = 0;
  for (const [Z, deal] of [[1, 'swift'], [1.23, 'tough'], [1.39, 'swift']]) {
    st.zoomScale = Z;
    statue.deal = CURSES.find(c => c.id === deal);   // the two deals: two card widths
    for (const [sx, sy] of [[100, 80], [140, 100], [200, 70], [240, 150], [330, 75], [380, 90], [400, 120]]) {
      shot(statue.x, statue.y, sx, sy);
      const ch = T.renderer.hudChrome;
      const cards = T.renderer.worldCards || [];
      assert.ok(ch && ch.purse && ch.clock && ch.quests, 'the HUD is drawn');
      assert.equal(cards.length, 1, `Z ${Z} at ${sx},${sy}: the statue card is drawn`);
      for (const c of cards) {
        n++;
        const at = `Z ${Z} at ${sx},${sy}: card ${JSON.stringify(c)}`;
        assert.ok(onScreen(c), at + ' is on screen');
        // The HP, MP and XP rows as drawn (labels from x 4, the XP bar to x 156).
        assert.ok(!overlap(c, { x: 4, y: 13, w: 152, h: 32 }), at + ' covers the bars');
        for (const k of ['purse', 'clock', 'quests']) {
          assert.ok(!overlap(c, ch[k]), at + ` covers the HUD's ${k} ${JSON.stringify(ch[k])}`);
        }
        // The chrome's own record of that block reaches past the LV badge.
        assert.ok(ch.bars && ch.bars.x <= 4 && ch.bars.y <= 13 && ch.bars.x + ch.bars.w >= 186 && ch.bars.y + ch.bars.h >= 45,
          'the bars block is on the chrome record: ' + JSON.stringify(ch.bars));
        assert.ok(!overlap(c, ch.bars), at + ` covers the bars block ${JSON.stringify(ch.bars)}`);
      }
    }
  }
  assert.ok(n >= 21);
});

s.done();
