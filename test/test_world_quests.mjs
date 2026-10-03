// HORDES — M5b slice 3: the vault and key, the lever-and-gate yard, secrets
// (cracked walls, the mimic, glyphs), quests and quest chains, schema v13.
// Run: node test/test_world_quests.mjs
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { suite, boot } from './_harness.mjs';
import { placeSites } from '../src/sites.js';
import { placeVaultYard, yardRects, gateOutside, tickVaultYard, wantsCarrier, VAULT } from '../src/vault.js';
import { placeSecrets, tickSecrets, rollMimic, recordGlyph, sanitizeWorld, emptyWorld, SECRETS, glyphsAll } from '../src/secrets.js';
import { rollBoard, swapQuest, startQuests, questEvent, closeQuests, questLine, questGold, advanceChains, QUESTS, CHAINS, chainStep } from '../src/quests.js';
import { exploreGoal } from '../src/explore.js';
import { placeClear } from '../src/world_cards.js';
import { buildingFootprints, buildingRects } from '../src/stage_buildings.js';
import { planPath } from '../src/pilot_nav.js';
import { terrainFor, flatSpot } from '../src/terrain.js';
import { STAGE_IDS } from '../src/stages.js';
import { mulberry32 } from '../src/weather.js';
import * as META from '../src/meta.js';
import { PROFILE_VERSION } from '../src/save.js';
import { CONFIG as C } from '../src/config.js';

const s = suite('test_world_quests');
// px from the hero's start (startRun: the view's centre)
const fromStart = (o) => Math.hypot(o.x - C.VIEW_W / 2, o.y - C.VIEW_H / 2);

// ------------------------------------------------------------- placement
s.check('vault, yard, lever and secrets: deterministic, reachable, all stages x 3 seeds', () => {
  let high = 0, glyphs = 0, cracks = 0, n = 0;
  for (const st of STAGE_IDS) {
    for (const seed of [1, 77, 9001]) {
      n++;
      const rects = buildingFootprints(seed, st);
      const sites = placeSites(seed, st, rects, 900);
      const a = placeVaultYard(seed, st, rects, sites, 900);
      assert.deepEqual(a, placeVaultYard(seed, st, rects, sites, 900), 'pure');
      const { vault, lever, yard } = a;
      assert.ok(vault && lever && yard, `${st}/${seed}: vault, lever and yard placed`);
      const T = terrainFor(seed, st);
      const closed = rects.concat(yardRects(yard, false)), open = rects.concat(yardRects(yard, true));
      for (const o of [vault, lever]) {
        assert.ok(flatSpot(T, o.x, o.y), `${st}/${seed}: ${o.kind} on reachable flat ground`);
        assert.ok(planPath(closed, 0, 0, o.x, o.y), `${st}/${seed}: ${o.kind} reachable with the gate shut`);
      }
      const [gx, gy] = gateOutside(yard);
      assert.ok(planPath(closed, 0, 0, gx, gy), 'the gate is reachable');
      assert.equal(planPath(closed, gx, gy, yard.x, yard.y), null, 'the shut gate blocks the yard');
      assert.ok(planPath(open, 0, 0, yard.x, yard.y), 'the open gate lets you in');
      assert.ok(Math.hypot(lever.x - yard.x, lever.y - yard.y) >= VAULT.LEVER_MIN_D, 'the lever is elsewhere');
      assert.ok(fromStart(vault) >= VAULT.SPAWN_KEEP && fromStart(yard) >= VAULT.SPAWN_KEEP, `${st}/${seed}: vault and yard away from the start`);
      assert.ok(fromStart(lever) >= VAULT.LEVER_SPAWN_KEEP, `${st}/${seed}: the lever is ${Math.round(fromStart(lever))} px from the start`);
      if (vault.high) high++;
      const sec = placeSecrets(seed, st, rects, sites.concat([vault, lever, yard]), 900, false);
      assert.deepEqual(sec, placeSecrets(seed, st, rects, sites.concat([vault, lever, yard]), 900, false));
      const g = sec.find(x => x.kind === 'glyph');
      if (g) {
        glyphs++;
        assert.ok(flatSpot(T, g.x, g.y) && planPath(rects, 0, 0, g.x, g.y), 'the glyph is reachable');
        assert.ok(fromStart(g) >= SECRETS.GLYPH_MIN_SPAWN, `${st}/${seed}: the glyph is ${Math.round(fromStart(g))} px from the start`);
      }
      cracks += sec.filter(x => x.kind === 'crack').length;
      for (const c of sec.filter(x => x.kind === 'crack')) {
        assert.ok(fromStart(c) > SECRETS.CRACK_SEEN_R, `${st}/${seed}: a crack ${Math.round(fromStart(c))} px from the start is seen on the first frame`);
      }
      assert.equal(placeSecrets(seed, st, rects, sites, 900, true).filter(x => x.kind === 'glyph').length, 0,
        'a found glyph is not placed again');
    }
  }
  assert.equal(glyphs, n, 'every stage x seed hides a glyph');
  assert.ok(high >= n * 0.75, `the vault prefers high ground (${high}/${n})`);
  assert.ok(cracks >= n, `cracked walls placed (${cracks} in ${n} layouts)`);
});

// ------------------------------------------------------------- rules
const P = (x, y) => ({ x, y });
s.check('key: carrier marked after 2:00 only; its death drops the key; key opens the vault once', () => {
  const vault = { id: 900, kind: 'vault', x: 300, y: 0, state: 'unused', reward: 'joker' };
  const w = { vault, hasKey: false, keyDrop: null, carrier: null };
  assert.equal(wantsCarrier(w, 60), false, 'not before 2:00');
  assert.equal(wantsCarrier(w, 151), true);
  w.carrier = { x: 50, y: 0, hp: 10 };
  assert.equal(wantsCarrier(w, 200), false, 'one carrier at a time');
  let ev = tickVaultYard(w, { player: P(300, 0) });
  assert.deepEqual(ev.map(e => e.kind), ['vaultLocked'], 'locked without the key');
  w.carrier.hp = 0;
  ev = tickVaultYard(w, { player: P(0, 0) });
  assert.equal(ev[0].kind, 'keyDropped'); assert.ok(w.keyDrop);
  ev = tickVaultYard(w, { player: P(50, 0) });
  assert.equal(ev[0].kind, 'keyPicked'); assert.equal(w.hasKey, true);
  ev = tickVaultYard(w, { player: P(300, 0) });
  assert.equal(ev[0].kind, 'vaultOpen'); assert.equal(vault.state, 'spent'); assert.equal(w.hasKey, false);
  assert.equal(tickVaultYard(w, { player: P(300, 0) }).length, 0, 'once');
});

s.check('lever: opens the yard for the run; the yard pays once when open', () => {
  const yard = { id: 901, kind: 'yard', x: 500, y: 0, gateSide: 'w', state: 'unused', open: false };
  const lever = { id: 902, kind: 'lever', x: -500, y: 0, state: 'unused' };
  const w = { yard, lever };
  assert.equal(tickVaultYard(w, { player: P(500, 0) }).length, 0, 'a shut yard pays nothing');
  assert.equal(tickVaultYard(w, { player: P(-500, 0) })[0].kind, 'leverPulled');
  assert.equal(yard.open, true);
  assert.equal(yardRects(yard, true).filter(r => r.gate).length, 0, 'no gate rect once open');
  assert.equal(yardRects(yard, false).filter(r => r.gate).length, 1);
  assert.equal(tickVaultYard(w, { player: P(500, 0) })[0].kind, 'yardLoot');
  assert.equal(tickVaultYard(w, { player: P(500, 0) }).length, 0, 'once');
});

s.check('cracked wall: hits break it; steering counts double; each projectile once', () => {
  const mk = () => ({ id: 950, kind: 'crack', x: 0, y: 10, wallY: 0, hits: 0, state: 'unused', seen: false });
  const c = mk();
  const shots = [{ x: 0, y: -4 }];
  let ev = tickSecrets([c], { player: P(200, 0), dt: 1 / 60, projectiles: shots });
  assert.ok(ev.some(e => e.kind === 'crackHit')); assert.equal(c.hits, 1);
  tickSecrets([c], { player: P(200, 0), dt: 1 / 60, projectiles: shots });
  assert.equal(c.hits, 1, 'the same projectile counts once');
  let frames = 0;
  while (c.state !== 'spent' && frames < 100) { tickSecrets([c], { player: P(200, 0), dt: 1 / 60, projectiles: [{ x: 0, y: -4 }] }); frames++; }
  assert.equal(frames, SECRETS.CRACK_HITS - 1, 'breaks at CRACK_HITS');
  const d = mk(); frames = 0;
  while (d.state !== 'spent' && frames < 100) {
    ev = tickSecrets([d], { player: P(200, 0), dt: 1 / 60, handsOn: true, projectiles: [{ x: 0, y: -4 }] }); frames++;
  }
  assert.equal(frames, Math.ceil(SECRETS.CRACK_HITS / SECRETS.HANDS_ON_HITS), 'steering breaks it twice as fast');
  assert.equal(ev.at(-1).kind, 'crackBroken'); assert.equal(ev.at(-1).handsOn, true);
  const e = mk(); frames = 0;   // standing at it chips it too (melee and idle builds)
  while (e.state !== 'spent' && frames < 60 * 20) { tickSecrets([e], { player: P(0, 12), dt: 1 / 60 }); frames++; }
  assert.equal(e.state, 'spent');
});

s.check('glyph: noticed farther while steering; collected on touch', () => {
  const g = () => ({ id: 960, kind: 'glyph', x: 0, y: 0, state: 'unused', seen: false });
  const a = g(), b = g();
  tickSecrets([a], { player: P(120, 0), dt: 0.1 });
  tickSecrets([b], { player: P(120, 0), dt: 0.1, handsOn: true });
  assert.equal(a.seen, false); assert.equal(b.seen, true, 'the shimmer: seen at 120 px only while steering');
  const ev = tickSecrets([a], { player: P(5, 0), dt: 0.1 });
  assert.ok(ev.some(e => e.kind === 'glyph')); assert.equal(a.state, 'spent');
});

s.check('mimic: rare, one per run, never before 3:00; the feast modifier makes it common', () => {
  const r = mulberry32(5);
  let n = 0;
  for (let i = 0; i < 20000; i++) if (rollMimic(r, 200, false)) n++;
  assert.ok(n > 40 && n < 130, 'about 0.4% of chests (' + n + ')');
  assert.equal(rollMimic(() => 0, 170, false), false, 'not before 3:00');
  assert.equal(rollMimic(() => 0, 300, true), false, 'one per run');
  assert.equal(rollMimic(() => 0.1, 30, true, true), true, 'MIMIC FEAST');
});

s.check('glyphs persist by stage; all eight complete the set', () => {
  const p = { world: emptyWorld() };
  STAGE_IDS.slice(0, 7).forEach(id => assert.equal(recordGlyph(p, id).fresh, true));
  assert.equal(recordGlyph(p, STAGE_IDS[0]).fresh, false, 'a stage counts once');
  assert.equal(glyphsAll(p), false);
  assert.deepEqual(recordGlyph(p, STAGE_IDS[7]), { fresh: true, all: true });
  assert.equal(glyphsAll(p), true); assert.equal(p.world.secrets.glyphs, true);
});

// ------------------------------------------------------------- quests
s.check('quests: board of 3 (chain steps first), swap, progress, gold once', () => {
  const w = emptyWorld();
  const ids = rollBoard(mulberry32(3), w);
  assert.equal(ids.length, 3); assert.equal(new Set(ids).size, 3);
  assert.ok(ids.includes(chainStep(w, 'warden')) && ids.includes(chainStep(w, 'seeker')), 'open chain steps are offered');
  const sw = swapQuest(mulberry32(4), ids, 2);
  assert.notEqual(sw[2], ids[2]); assert.equal(new Set(sw).size, 3);
  const qs = startQuests(['shrines2', 'braziers10', 'vault']);
  assert.equal(questEvent(qs, 'shrine').length, 0);
  assert.equal(questEvent(qs, 'shrine')[0].id, 'shrines2');
  assert.equal(questEvent(qs, 'shrine').length, 0, 'done once');
  assert.equal(questGold(qs), 80);
  questEvent(qs, 'vault');
  assert.equal(questGold(qs), 80, 'the joker quest pays no gold');
  // Rewards stay modest: the three richest gold quests add at most ~300 gold.
  const top = QUESTS.filter(q => q.gold).map(q => q.gold).sort((a, b) => b - a).slice(0, 3);
  assert.ok(top.reduce((a, b) => a + b, 0) <= 300);
});

s.check('quests that can no longer be finished close: world quests at the maw, the wave-1 race at 2:30', () => {
  const qs = startQuests(['shrines2', 'elites5', 'boss1Fast']);
  questEvent(qs, 'shrine');
  assert.equal(closeQuests(qs, { worldClosed: false, time: 100, wave: 1 }).length, 0, 'nothing closes in an open world');
  assert.deepEqual(closeQuests(qs, { worldClosed: false, time: 151, wave: 1 }).map(q => q.id), ['boss1Fast']);
  assert.deepEqual(closeQuests(qs, { worldClosed: true, time: 900, wave: 5 }).map(q => q.id), ['shrines2']);
  assert.equal(closeQuests(qs, { worldClosed: true, time: 900, wave: 5 }).length, 0, 'closed once');
  assert.equal(questLine(qs[0]), 'Charge 2 shrines - CLOSED');
  assert.equal(questEvent(qs, 'shrine').length, 0, 'a closed quest counts nothing');
  assert.equal(qs[0].done, false);
  assert.equal(qs[1].closed, undefined, 'a quest the field can still finish stays open');
  assert.equal(questEvent(qs, 'elite', 5)[0].id, 'elites5');
  assert.equal(questGold(qs), 70, 'only done quests pay');
  // A quest done before the maw stays done; the race won in time stays won.
  const won = startQuests(['fountain', 'boss1Fast']);
  questEvent(won, 'fountain'); questEvent(won, 'boss1Fast');
  assert.equal(closeQuests(won, { worldClosed: true, time: 900, wave: 5 }).length, 0);
  assert.ok(won.every(q => q.done && !q.closed));
  // The race also closes when the wave moves on without it.
  const late = startQuests(['boss1Fast']);
  assert.equal(closeQuests(late, { worldClosed: false, time: 140, wave: 2 }).length, 1);
});

s.check('quest chains advance one step per run and finish once', () => {
  const w = emptyWorld();
  const c = CHAINS.find(x => x.id === 'warden');
  for (let i = 0; i < c.steps.length; i++) {
    const qs = startQuests([c.steps[i]]); questEvent(qs, QUESTS.find(q => q.id === c.steps[i]).ev, 99);
    const fin = advanceChains(w, qs);
    assert.equal(fin.length, i === c.steps.length - 1 ? 1 : 0);
  }
  assert.equal(w.chains.warden, c.steps.length);
  assert.equal(chainStep(w, 'warden'), null);
  const qs = startQuests(['carrier']); questEvent(qs, 'carrier');
  assert.equal(advanceChains(w, qs).length, 0, 'a done chain stays done');
});

// ------------------------------------------------------------- save
const store = (init = {}) => ({ m: { ...init }, getItem(k) { return this.m[k] ?? null; },
  setItem(k, v) { this.m[k] = String(v); }, removeItem(k) { delete this.m[k]; } });
s.check('schema 13: a v12 save (written by the v12 build) migrates with an empty world', () => {
  assert.equal(PROFILE_VERSION, 13);
  const raw = readFileSync(new URL('./fixtures/profile_v12_written_by_v12_build.json', import.meta.url), 'utf8');
  const r = META.loadProfileResult(store({ [META.STORAGE_KEY]: raw }));
  assert.equal(r.profile.version, 13);
  assert.deepEqual(r.migrations, [12]);
  assert.deepEqual(r.profile.world, emptyWorld());
  assert.equal(r.profile.gold, 4321); assert.equal(r.profile.camp.levels.mine, 1);
  assert.deepEqual(r.profile.unlockedCharacters, ['KNIGHT', 'ROGUE']);
  // The v11 fixture walks the whole tail of the chain.
  const raw11 = readFileSync(new URL('./fixtures/profile_v11_written_by_v11_build.json', import.meta.url), 'utf8');
  const r11 = META.loadProfileResult(store({ [META.STORAGE_KEY]: raw11 }));
  assert.deepEqual(r11.migrations, [11, 12]); assert.deepEqual(r11.profile.world, emptyWorld());
});
s.check('the world block round-trips and repairs garbage', () => {
  const p = META.makeProfile();
  p.world = { glyphs: ['VERDANT_HOLLOW', 'VERDANT_HOLLOW', 7], secrets: { crack: true, x: 1 }, chains: { warden: 2.7, bad: -1 }, questsDone: 5 };
  const s1 = store(); META.saveProfile(p, s1);
  const back = META.loadProfile(s1);
  assert.deepEqual(back.world, { glyphs: ['VERDANT_HOLLOW'], secrets: { crack: true }, chains: { warden: 2 }, questsDone: 5 });
  assert.equal(sanitizeWorld('junk').dirty, true);
  assert.deepEqual(sanitizeWorld(undefined), { world: emptyWorld(), dirty: false });
});

// ------------------------------------------------------------- live
const h = await boot({ storage: [['hordes_onboarded', '1']] });
const T = h.T, st = T.state;
T.banners.suppressAll();
const quiet = () => { st.enemies.length = 0; st.gems.length = 0; st.drops.length = 0; st.spawnTimer = 999; };
const fresh = () => { st.mode = 'menu'; T.startRun(); quiet(); };

s.check('live: startRun places the vault, yard and lever on the map; the yard walls block', () => {
  fresh();
  const w = st.poi;
  assert.ok(w.vault && w.yard && w.lever);
  for (const o of [w.vault, w.yard, w.lever]) {
    assert.ok(st.sites.includes(o)); assert.ok(st.atlas.landmarks.some(l => l.site === o), o.kind + ' on the atlas');
  }
  const rects = buildingRects(st.groundSeed, st.stage);
  assert.ok(rects.some(r => r.gate), 'the shut gate is a wall');
  assert.equal(st.quests.length, 3, 'three quests, picked for you');
  assert.ok(!st.atlas.landmarks.some(l => l.kind === 'glyph' || l.kind === 'crack'), 'secrets stay off the map');
});

s.check('live: carrier -> key -> vault pays; the vault quest counts', () => {
  fresh();
  const w = st.poi;
  st.quests = [{ id: 'vault', n: 0, done: false, paid: false }, { id: 'carrier', n: 0, done: false, paid: false }];
  st.time = Math.max(st.time, 155);
  const e = { x: st.player.x + 40, y: st.player.y, hp: 50, maxHp: 50, elite: true, w: 16, h: 16 };
  T.world.markCarrier(e);
  assert.equal(e.keyCarrier, true); assert.equal(w.carrier, e);
  st.enemies.push(e);
  e.hp = 0; T.world.onDeath(e);
  T.world.tick(st.player, 1 / 60);
  assert.ok(w.keyDrop, 'the key fell');
  st.player.x = w.keyDrop.x; st.player.y = w.keyDrop.y;
  T.world.tick(st.player, 1 / 60);
  assert.equal(w.hasKey, true);
  st.player.x = w.vault.x; st.player.y = w.vault.y;
  const jokers0 = st.pendingDrafts, chests0 = st.chests.length;
  T.world.tick(st.player, 1 / 60);
  assert.equal(w.vault.state, 'spent');
  if (w.vault.reward === 'joker') assert.ok(st.pendingDrafts > jokers0 || st.mode === 'draft', 'a joker offer');
  else assert.equal(st.chests.length, chests0 + 1);
  assert.ok(st.quests.every(q => q.done), 'carrier and vault quests done');
});

s.check('live: lever -> gate opens -> EXPLORE routes into the yard', () => {
  fresh();
  const w = st.poi;
  st.player.x = w.lever.x; st.player.y = w.lever.y;
  T.world.tick(st.player, 1 / 60);
  assert.equal(w.yard.open, true);
  assert.ok(!buildingRects(st.groundSeed, st.stage).some(r => r.gate), 'the gate wall is gone');
  // Put the hero outside the gate, on EXPLORE: it walks in and loots.
  const [gx, gy] = gateOutside(w.yard);
  st.player.x = gx; st.player.y = gy;
  st.sites = [w.yard];
  T.setPilotMode('EXPLORE');
  for (let i = 0; i < 60 * 12 && w.yard.state !== 'spent'; i++) { quiet(); h.pump(1); if (st.mode !== 'playing') break; }
  assert.equal(w.yard.state, 'spent', 'EXPLORE walked in through the open gate');
  T.setPilotMode('AUTO_ALL');
});

s.check('live: the closed gate is a wall to the pilot (no route in)', () => {
  fresh();
  const w = st.poi;
  const [gx, gy] = gateOutside(w.yard);
  assert.equal(planPath(buildingRects(st.groundSeed, st.stage), gx, gy, w.yard.x, w.yard.y), null);
});

s.check('live: mimic wakes into an elite and pays a rare chest; a cracked wall pays a niche', () => {
  fresh();
  const n0 = st.enemies.length;
  T.world.wakeMimic(st.player.x + 30, st.player.y);
  const m = st.enemies[n0];
  assert.ok(m && m.mimic && m.elite);
  m.hp = 0; T.world.onDeath(m);
  assert.ok(st.chests.some(c => c.band === 'rare' && c.mimic === false), 'a rare band chest, never a mimic');
  assert.equal(T.getProfile().world.secrets.mimic, true);
  const c = (st.secrets || []).find(x => x.kind === 'crack');
  if (c) {
    const purse0 = T.getProfile().runPurse;
    c.hits = SECRETS.CRACK_HITS - 1;
    st.projectiles.push({ x: c.x, y: c.wallY - 4, vx: 0, vy: 0, age: 0, hit: new Set() });
    T.world.tick(st.player, 1 / 60);
    if (c.state !== 'spent') { st.player.x = c.x; st.player.y = c.y; for (let i = 0; i < 60; i++) T.world.tick(st.player, 1 / 60); }
    assert.equal(c.state, 'spent');
    assert.ok(T.getProfile().runPurse > purse0, 'the niche paid gold');
  }
});

s.check('live: a glyph saves by stage; quest gold joins the settlement once', () => {
  fresh();
  const g = (st.secrets || []).find(x => x.kind === 'glyph');
  const pr = T.getProfile();
  if (g) {
    st.player.x = g.x; st.player.y = g.y;
    T.world.tick(st.player, 1 / 60);
    assert.ok(pr.world.glyphs.includes(st.stage));
    fresh();
    assert.ok(!(st.secrets || []).some(x => x.kind === 'glyph'), 'found: not placed again');
  }
  st.quests = [{ id: 'shrines2', n: 2, done: true, paid: false }, { id: 'vault', n: 1, done: true, paid: true }];
  const done0 = pr.world.questsDone;
  const r = T.purse.settle();
  assert.equal(r.breakdown.quests, 80, 'the gold quest pays; the joker quest does not');
  const again = T.purse.settle();
  assert.equal(again.gold, r.gold, 'settled once');
  assert.equal(pr.world.questsDone, done0 + 2);
});

s.check('live: Greed (the shop row) raises quest gold, and the board shows what will be paid', () => {
  const pr = T.getProfile();
  const greed0 = pr.purchased.greed;
  pr.purchased.greed = 2;   // +16% gold from runs
  fresh();
  st.quests = [{ id: 'shrines2', n: 2, done: true, paid: false }];
  const r = T.purse.settle();
  assert.equal(r.breakdown.quests, Math.round(80 * 1.16));
  // The board prices each gold quest with the same multiplier.
  T.menus.showQuestBoard();
  const board = h.elements['ov-cards'].children.map(c => c.innerHTML || '').join(' ');
  const prices = [...board.matchAll(/pays (\d+)g/g)].map(m => Number(m[1]));
  assert.ok(prices.length > 0, board.slice(0, 200));
  const priced = QUESTS.filter(q => q.gold).map(q => Math.round(q.gold * 1.16));
  for (const n of prices) assert.ok(priced.includes(n), n + ' is a Greed price');
  if (greed0 === undefined) delete pr.purchased.greed; else pr.purchased.greed = greed0;
});

s.check('live: shrines, braziers and a fountain count for their quests; the gold settles; SEEKER moves on', () => {
  fresh();
  const pr = T.getProfile();
  pr.world.chains.seeker = 0;   // SEEKER'S ROAD at its first step: braziers10
  st.quests = startQuests(['shrines2', 'braziers10', 'fountain']);
  st.wave.endsAt = st.time + 9999;
  st.projectiles.length = 0;
  st.lastSteerT = -99;   // hands-off
  const q = (id) => st.quests.find(x => x.id === id);
  const tick = (dt = 1 / 60) => T.sites.tick(st.player, dt);
  // Braziers: walk into ten of them (the layout's, topped up off to the side).
  const brs = st.sites.filter(x => x.kind === 'brazier').slice(0, 10);
  for (let i = brs.length; i < 10; i++) {
    const b = { id: 700 + i, kind: 'brazier', x: st.player.x + 60 * i, y: st.player.y - 400, state: 'unused' };
    st.sites.push(b); brs.push(b);
  }
  for (const b of brs) { st.player.x = b.x; st.player.y = b.y; tick(); assert.equal(b.state, 'spent'); }
  assert.equal(q('braziers10').n, 10, 'every break counts');
  assert.equal(q('braziers10').done, true);
  // Shrines: stand in two rings until each charges.
  const shs = st.sites.filter(x => x.kind === 'shrine').slice(0, 2);
  assert.equal(shs.length, 2, 'the layout has two shrines');
  for (const sh of shs) {
    st.player.x = sh.x; st.player.y = sh.y;
    for (let i = 0; i < 12 && sh.state !== 'spent'; i++) tick(0.5);
    assert.equal(sh.state, 'spent');
    if (st.shrineOffer) T.sites.pickCard(st.shrineOffer[0]);
  }
  assert.equal(q('shrines2').n, 2);
  assert.equal(q('shrines2').done, true);
  // The fountain: stand in it while hurt.
  const fo = st.sites.find(x => x.kind === 'fountain');
  st.player.hp = st.player.stats.maxHp * 0.5;
  st.player.x = fo.x; st.player.y = fo.y;
  for (let i = 0; i < 6 && fo.state !== 'spent'; i++) tick(0.5);
  assert.equal(fo.state, 'spent');
  assert.equal(q('fountain').done, true);
  st.autoStarted = false;
  const r = T.purse.settle();
  assert.equal(r.breakdown.quests, 80 + 60 + 50, 'the three quests pay at settlement');
  assert.equal(pr.world.chains.seeker, 1, "SEEKER'S ROAD moves past braziers10");
});

s.check('layout: placeClear moves a card off a box (below or left, the smaller move, on screen)', () => {
  const T0 = { x: 380, y: 40, w: 90, h: 30 };
  const ov = (a, b) => a.x < b.x + b.w + 2 && a.x + a.w + 2 > b.x && a.y < b.y + b.h + 2 && a.y + a.h + 2 > b.y;
  for (const c of [{ x: 360, y: 50, w: 100, h: 20 }, { x: 300, y: 30, w: 120, h: 29 }, { x: 420, y: 60, w: 50, h: 20 }, { x: 200, y: 200, w: 60, h: 20 }]) {
    const at = placeClear(c, [T0], 480, 300);
    const b = { ...c, ...at };
    assert.ok(!ov(b, T0), `card ${JSON.stringify(c)} -> ${JSON.stringify(at)} clears the tracker`);
    assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= 480 && b.y + b.h <= 300, 'on screen');
  }
  assert.deepEqual(placeClear({ x: 10, y: 10, w: 20, h: 10 }, [T0], 480, 300), { x: 10, y: 10 }, 'no overlap: no move');
});

s.check('live: the vault card never overlaps the quest tracker (vault anywhere near the top right)', () => {
  fresh();
  const w = st.poi;
  T.setPilotMode('MANUAL');
  st.wave.endsAt = st.time + 9999;
  st.player.x = w.vault.x - 40; st.player.y = w.vault.y + 40;
  quiet(); h.pump(1);
  let moved = 0, n = 0;
  for (const auto of [false, true]) {
    st.autoStarted = auto;   // the AUTO 50% badge pushes the tracker down
    // Put the vault (by the camera) at spots around the tracker, render, check.
    for (const [sx, sy] of [[300, 30], [340, 40], [380, 50], [420, 60], [460, 45], [360, 80], [250, 50], [200, 150]]) {
      const cam = { ...st.cam, x: w.vault.x - sx, y: w.vault.y - sy };
      T.renderer.render(st, cam);
      const tr = T.renderer.hudChrome && T.renderer.hudChrome.quests;
      const cards = T.renderer.worldCards || [];
      assert.ok(tr, 'the tracker is drawn');
      assert.equal(cards.length, 1, 'the vault card is drawn');
      for (const c of cards) {
        n++;
        const hit = c.x < tr.x + tr.w && c.x + c.w > tr.x && c.y < tr.y + tr.h && c.y + c.h > tr.y;
        assert.ok(!hit, `card ${JSON.stringify(c)} overlaps the tracker ${JSON.stringify(tr)}`);
        assert.ok(c.x >= 0 && c.y >= 0 && c.x + c.w <= 480 && c.y + c.h <= 300, 'on screen');
        if (c.moved) moved++;
      }
    }
  }
  assert.ok(moved > 0, 'some spots needed the move (the case the rule exists for); moved ' + moved + ' of ' + n);
  st.autoStarted = false;
  T.setPilotMode('AUTO_ALL');
});

s.check('menus: where the title art (with its wordmark) shows, the DOM heading hides (no second HORDES)', () => {
  const t = h.elements['ov-title'];
  assert.ok(t, 'the overlay heading exists');
  for (const [name, open] of [['title', () => T.menus.showTitle()], ['run setup', () => T.menus.showPreRun()], ['quest board', () => T.menus.showQuestBoard()]]) {
    open();
    assert.ok(st.mode === 'title' || st.mode === 'setup', name + ': the title art is up (mode ' + st.mode + ')');
    assert.equal(t.style.display, 'none', name + ': the DOM heading is hidden under the logo art');
  }
  T.menus.showTitle();
});

s.check('live: map markers: lever-yard link once both are known; secrets hidden until found', () => {
  fresh();
  const w = st.poi;
  for (const l of st.atlas.landmarks) if (l.site === w.lever || l.site === w.yard) l.seen = true;
  T.map.toggle(); h.pump(1);
  const m = T.renderer.atlasMap;
  assert.ok(m, 'the map is open');
  if (m) {
    assert.ok(m.poi && m.poi.link, 'the dotted link is drawn');
    assert.ok(!(m.poi.secrets || []).length, 'no secret marks before they are found');
    assert.ok(m.landmarks.some(x => x.kind === 'yard') && m.landmarks.some(x => x.kind === 'lever'));
  }
  T.map.toggle();
  // The pilot goes to the carrier only when healthy, and to the vault only with the key.
  const p = { x: w.vault.x - 100, y: w.vault.y, hp: 100, level: 9, stats: { maxHp: 100 } };
  const fake = { enemies: [], sites: [w.vault], wave: { num: 1, bosses: [] }, time: 200,
    poi: { vault: w.vault, carrier: { x: w.vault.x, y: w.vault.y + 50, hp: 5 }, carrierSeen: true, hasKey: false } };
  assert.equal(exploreGoal(fake, p, 'EXPLORE').carrier, true);
  p.hp = 50;
  assert.equal(exploreGoal(fake, p, 'EXPLORE'), null, 'hurt: no hunt (and not calm)');
  p.hp = 100; fake.poi.carrier = null; fake.poi.hasKey = true;
  assert.equal(exploreGoal(fake, p, 'EXPLORE').site, w.vault, 'the key held: to the vault');
});

s.done();
