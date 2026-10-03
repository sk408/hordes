// HORDES — M5b sites, map waypoint, EXPLORE pilot, hands-on bonus.
//   placement: deterministic per (seed, stage), clear of buildings, spaced,
//              reachable by the pilot's planner
//   rules:     each site's effect and state changes (sites.js tickSites)
//   live:      altar -> boss -> extra chest -> portal -> next wave; the
//              statue's curse and reward; waypoint set/clear and override;
//              EXPLORE's calm rule and site routing; hands-on paid once
// Run: node test/test_sites.mjs
import assert from 'node:assert';
import { suite, boot } from './_harness.mjs';
import { placeSites, tickSites, rollBreakDrops, SITES, CURSES, siteOpen, sitesUsed } from '../src/sites.js';
import { exploreCalm, exploreGoal, exploreWants, altarReady, EXPLORE, detourCap, bossFight, gemsNear } from '../src/explore.js';
import { buildingRects, buildingFootprints } from '../src/stage_buildings.js';
import { planPath } from '../src/pilot_nav.js';
import { STAGE_IDS } from '../src/stages.js';
import { mulberry32 } from '../src/weather.js';
import { CONFIG as C } from '../src/config.js';

const s = suite('test_sites');
// px from the hero's start (startRun: the view's centre)
const fromStart = (o) => Math.hypot(o.x - C.VIEW_W / 2, o.y - C.VIEW_H / 2);

// ------------------------------------------------------------- placement
s.check('placement is a pure function of (seed, stage)', () => {
  for (const st of STAGE_IDS.slice(0, 3)) {
    const r = buildingRects(4242, st);
    const a = placeSites(4242, st, r, 900), b = placeSites(4242, st, r, 900);
    assert.deepEqual(a, b, st + ': same seed, same sites');
  }
  const r1 = buildingRects(4242, STAGE_IDS[0]), r2 = buildingRects(4242, STAGE_IDS[1]);
  assert.notDeepEqual(placeSites(4242, STAGE_IDS[0], r1, 900).map(x => [x.x, x.y]),
    placeSites(4242, STAGE_IDS[1], r2, 900).map(x => [x.x, x.y]), 'another stage, another layout');
});

s.check('every run has a shrine close to the start: 170-300 px away, on every stage', () => {
  const sx = C.VIEW_W / 2, sy = C.VIEW_H / 2;
  for (const st of STAGE_IDS) {
    for (const seed of [1, 2, 3, 7919, 4242]) {
      const sites = placeSites(seed, st, buildingRects(seed, st), 900);
      const d = sites.filter(x => x.kind === 'shrine').map(x => Math.hypot(x.x - sx, x.y - sy));
      assert.ok(d.length > 0, st + '/' + seed + ': shrines placed');
      const near = Math.min(...d);
      assert.ok(near >= SITES.SPAWN_CLEAR && near <= SITES.WELCOME_MAX,
        st + '/' + seed + ': nearest shrine at ' + near.toFixed(0) + ' px');
    }
  }
});

s.check('every site stands clear of buildings, apart, in bounds and reachable', () => {
  for (const st of STAGE_IDS) {
    for (const seed of [1, 77, 9001]) {
      const rects = buildingRects(seed, st);
      const sites = placeSites(seed, st, rects, 900);
      const majors = sites.filter(x => x.kind !== 'brazier');
      const counts = sitesUsed([]);
      void counts;
      for (const k of ['shrine', 'altar', 'fountain', 'statue']) {
        assert.equal(majors.filter(x => x.kind === k).length, SITES.COUNTS[k], `${st}/${seed}: ${k} count`);
      }
      assert.ok(sites.filter(x => x.kind === 'brazier').length >= 9, `${st}/${seed}: braziers placed`);
      for (const x of sites) {
        const m = x.kind === 'brazier' ? 12 : SITES.BUILDING_MARGIN;
        for (const q of rects) {
          assert.ok(!(x.x > q.x - m && x.x < q.x + q.w + m && x.y > q.y - m && x.y < q.y + q.h + m),
            `${st}/${seed}: ${x.kind} inside a building`);
        }
        assert.ok(Math.abs(x.x) <= 900 - 40 && Math.abs(x.y) <= 900 - 40, 'in bounds');
        assert.ok(fromStart(x) >= SITES.SPAWN_CLEAR, `${st}/${seed}: ${x.kind} out of the spawn clearing`);
      }
      for (let i = 0; i < majors.length; i++) {
        assert.ok(planPath(rects, 0, 0, majors[i].x, majors[i].y), `${st}/${seed}: ${majors[i].kind} reachable`);
        for (let j = i + 1; j < majors.length; j++) {
          assert.ok(Math.hypot(majors[i].x - majors[j].x, majors[i].y - majors[j].y) >= SITES.MIN_GAP, 'spaced apart');
        }
      }
    }
  }
});

s.check('the spawn clearing is around the hero start: no site within SPAWN_CLEAR of it, on any stage', () => {
  for (const st of STAGE_IDS) {
    for (let seed = 1; seed <= 24; seed++) {
      for (const x of placeSites(seed, st, buildingRects(seed, st), 900)) {
        assert.ok(fromStart(x) >= SITES.SPAWN_CLEAR,
          `${st}/${seed}: ${x.kind} at ${x.x},${x.y} is ${Math.round(fromStart(x))} px from the start`);
      }
    }
  }
});

// ------------------------------------------------------------- rules
const P = (x, y, hp = 100, maxHp = 100) => ({ x, y, hp, maxHp });
s.check('shrine: charges while you stand in it, pauses when you leave, spends once', () => {
  const sh = { id: 1, kind: 'shrine', x: 0, y: 0, state: 'unused', charge: 0, handsOn: false };
  let ev = tickSites([sh], { player: P(0, 0), dt: 1, handsOn: false });
  assert.equal(sh.state, 'active');
  assert.ok(Math.abs(sh.charge - 1 / SITES.SHRINE_CHARGE_S) < 1e-9);
  tickSites([sh], { player: P(200, 0), dt: 1, handsOn: false });
  assert.ok(Math.abs(sh.charge - 1 / SITES.SHRINE_CHARGE_S) < 1e-9, 'leaving pauses the charge');
  for (let i = 0; i < 10 && !ev.length; i++) ev = tickSites([sh], { player: P(0, 0), dt: 1, handsOn: false });
  assert.equal(ev.length, 1); assert.equal(ev[0].kind, 'shrineDone'); assert.equal(ev[0].handsOn, false);
  assert.equal(sh.state, 'spent');
  assert.equal(tickSites([sh], { player: P(0, 0), dt: 1 }).length, 0, 'spent shrines do nothing');
});

s.check('hands-on: the shrine charges 40% faster; braziers drop 50% more', () => {
  const a = { id: 1, kind: 'shrine', x: 0, y: 0, state: 'unused', charge: 0 };
  const b = { id: 2, kind: 'shrine', x: 0, y: 0, state: 'unused', charge: 0 };
  tickSites([a], { player: P(0, 0), dt: 1, handsOn: false });
  tickSites([b], { player: P(0, 0), dt: 1, handsOn: true });
  assert.ok(Math.abs(b.charge / a.charge - SITES.HANDS_ON_CHARGE) < 1e-9);
  assert.equal(SITES.HANDS_ON_CHARGE, 1.4); assert.equal(SITES.HANDS_ON_DROPS, 1.5);
  const off = rollBreakDrops(mulberry32(5), false), on = rollBreakDrops(mulberry32(5), true);
  assert.equal(on[0].amount, Math.round(off[0].amount * 1.5), 'hands-on gold x1.5');
  // Chances: at rng = 0.12 the potion only drops hands-on (0.10 vs 0.15).
  const seq = (v) => { const a = [...v]; return () => a.shift(); };
  assert.equal(rollBreakDrops(seq([0, 0.12, 0.9]), false).length, 1);
  assert.equal(rollBreakDrops(seq([0, 0.12, 0.9]), true).filter(d => d.kind === 'potion').length, 1);
});

s.check('brazier: a projectile or the hero breaks it, once, with drops', () => {
  const b = { id: 3, kind: 'brazier', x: 50, y: 0, state: 'unused' };
  assert.equal(tickSites([b], { player: P(0, 0), dt: 1 / 60, projectiles: [{ x: 20, y: 0 }] }).length, 0, 'a far shot misses');
  const ev = tickSites([b], { player: P(0, 0), dt: 1 / 60, projectiles: [{ x: 48, y: 2 }], rng: mulberry32(1) });
  assert.equal(ev.length, 1); assert.equal(ev[0].kind, 'break'); assert.equal(b.state, 'spent');
  assert.ok(ev[0].drops[0].kind === 'gold' && ev[0].drops[0].amount >= SITES.GOLD_MIN);
  const c = { id: 4, kind: 'brazier', x: 5, y: 0, state: 'unused' };
  assert.equal(tickSites([c], { player: P(0, 0), dt: 1 / 60, projectiles: [], rng: mulberry32(1) })[0].kind, 'break', 'walking into it');
  assert.equal(tickSites([b, c], { player: P(0, 0), dt: 1 / 60, projectiles: [{ x: 50, y: 0 }] }).length, 0, 'spent: no second break');
});

s.check('fountain: heals once, only while hurt, after a short stand', () => {
  const f = { id: 5, kind: 'fountain', x: 0, y: 0, state: 'unused', stand: 0 };
  assert.equal(tickSites([f], { player: P(0, 0, 100, 100), dt: 2 }).length, 0, 'full HP: nothing');
  assert.equal(f.state, 'unused');
  assert.equal(tickSites([f], { player: P(0, 0, 40, 100), dt: 0.5 }).length, 0, 'not yet');
  const ev = tickSites([f], { player: P(0, 0, 40, 100), dt: 0.6 });
  assert.equal(ev[0].kind, 'fountain'); assert.equal(ev[0].heal, SITES.FOUNTAIN_HEAL * 100);
  assert.equal(f.state, 'spent');
});

s.check('statue: touch takes the curse; it stays active until paid', () => {
  const st = { id: 6, kind: 'statue', x: 0, y: 0, state: 'unused', deal: CURSES[0] };
  assert.equal(tickSites([st], { player: P(60, 0), dt: 1, handsOn: true }).length, 0, 'the prompt range does not accept');
  assert.equal(tickSites([st], { player: P(0, 0), dt: 1 }).length, 0, 'a pilot walking over it by accident does not accept');
  const ev = tickSites([st], { player: P(0, 0), dt: 1, handsOn: true });
  assert.equal(ev[0].kind, 'curse'); assert.equal(st.state, 'active');
  assert.equal(siteOpen(st), false, 'a taken statue is no longer a target');
  assert.equal(tickSites([st], { player: P(0, 0), dt: 1, handsOn: true }).length, 0, 'once');
  for (const c of CURSES) assert.ok(c.curse && c.reward, 'every deal states its curse and reward');
});

s.check('altar: summons only when allowed; otherwise says why once', () => {
  const a = { id: 7, kind: 'altar', x: 0, y: 0, state: 'unused' };
  assert.equal(tickSites([a], { player: P(0, 0), dt: 1, canSummon: () => true }).length, 0, 'no accidental summon');
  assert.equal(a.state, 'unused');
  let ev = tickSites([a], { player: P(0, 0), dt: 1, canSummon: () => false, manual: true });
  assert.equal(ev[0].kind, 'altarQuiet'); assert.equal(a.state, 'unused');
  assert.equal(tickSites([a], { player: P(0, 0), dt: 1, canSummon: () => false, manual: true }).length, 0, 'said once');
  ev = tickSites([a], { player: P(0, 0), dt: 1, canSummon: () => true, goalSite: a });
  assert.equal(ev[0].kind, 'altar'); assert.equal(a.state, 'spent');
});

// ------------------------------------------------------------- EXPLORE rules
const fakeP = (hp = 100, level = 1) => ({ x: 0, y: 0, hp, level, stats: { maxHp: 100 } });
s.check('EXPLORE calm rule: no enemy within CALM_R, a thin crowd within CROWD_R, HP at or above CALM_HP', () => {
  const st = { enemies: [] };
  assert.equal(exploreCalm(st, fakeP()), true);
  assert.equal(exploreCalm(st, fakeP(EXPLORE.CALM_HP * 100 - 1)), false, 'below CALM_HP');
  st.enemies = Array.from({ length: EXPLORE.CROWD_MAX }, () => ({ x: EXPLORE.CROWD_R - 5, y: 0, hp: 5 }));
  assert.equal(exploreCalm(st, fakeP()), true, 'CROWD_MAX enemies in the wider ring: still calm');
  st.enemies.push({ x: 0, y: EXPLORE.CROWD_R - 5, hp: 5 });
  assert.equal(exploreCalm(st, fakeP()), false, 'one more in the wider ring: not calm');
  st.enemies = [{ x: EXPLORE.CALM_R - 1, y: 0, hp: 5 }];
  assert.equal(exploreCalm(st, fakeP()), false, 'an enemy inside the radius');
  st.enemies = [{ x: EXPLORE.CALM_R + 1, y: 0, hp: 5 }, { x: 1, y: 0, hp: 0 }];
  assert.equal(exploreCalm(st, fakeP()), true, 'outside, or dead, does not count');
});

s.check('EXPLORE picks the nearest wanted site; never a statue; fountain only when hurt', () => {
  const sites = [
    { id: 1, kind: 'statue', x: 30, y: 0, state: 'unused' },
    { id: 2, kind: 'fountain', x: 40, y: 0, state: 'unused' },
    { id: 3, kind: 'brazier', x: 300, y: 0, state: 'unused' },
    { id: 4, kind: 'shrine', x: 200, y: 0, state: 'unused' },
  ];
  const st = { enemies: [], sites, wave: { num: 1 }, time: 0 };
  let g = exploreGoal(st, fakeP(100), 'EXPLORE');
  assert.equal(g.site.id, 4, 'healthy: the shrine (statue and fountain skipped)');
  assert.ok(g.hold > 0, 'the shrine is a stand-in site');
  g = exploreGoal(st, fakeP(60), 'EXPLORE');
  assert.equal(g.site.id, 2, 'hurt: the fountain');
  assert.equal(exploreGoal(st, fakeP(100), 'AUTO'), null, 'AUTO walks to nothing on its own');
  assert.equal(exploreGoal(st, fakeP(100), 'EXPLORE', new Set([4])).site.id, 3, 'a skipped site is passed over');
  st.enemies = [{ x: 10, y: 0, hp: 5 }];
  assert.equal(exploreGoal(st, fakeP(100), 'EXPLORE'), null, 'threatened: back to fighting');
});

s.check('EXPLORE threat abort: a goal drops the frame a threat, a boss, or a pile of gems shows up', () => {
  const sites = [{ id: 4, kind: 'shrine', x: 200, y: 0, state: 'unused' }];
  const st = { enemies: [], sites, wave: { num: 1 }, time: 0, gems: [] };
  assert.equal(exploreGoal(st, fakeP(), 'EXPLORE').site.id, 4);
  st.enemies = [{ x: 0, y: EXPLORE.CALM_R - 1, hp: 5 }];
  assert.equal(exploreGoal(st, fakeP(), 'EXPLORE'), null, 'an enemy inside CALM_R: back to fighting');
  st.enemies = [];
  st.wave.boss = { hp: 10 };
  assert.equal(bossFight(st), true);
  assert.equal(exploreGoal(st, fakeP(), 'EXPLORE'), null, 'a live boss: no detour');
  st.wave.boss = null; st.wave.midBosses = [{ hp: 3 }];
  assert.equal(exploreGoal(st, fakeP(), 'EXPLORE'), null, 'a live herald: no detour');
  st.wave.midBosses = [{ hp: 0 }];
  st.gems = Array.from({ length: EXPLORE.GEM_MAX + 1 }, (_v, i) => ({ x: i, y: 10 }));
  assert.equal(gemsNear(st, fakeP()), true);
  assert.equal(exploreGoal(st, fakeP(), 'EXPLORE'), null, 'gems at its feet are banked first');
  st.gems.pop();
  assert.equal(exploreGoal(st, fakeP(), 'EXPLORE').site.id, 4, 'a few gems do not hold it');
  // The key carrier hunt (a build ahead of the curve only) is gated the same way.
  st.poi = { carrier: { x: 100, y: 0, hp: 50 }, carrierSeen: true };
  assert.notEqual((exploreGoal(st, fakeP(), 'EXPLORE') || {}).carrier, true, 'level 1: no hunt');
  assert.equal(exploreGoal(st, fakeP(100, 30), 'EXPLORE').carrier, true);
  st.wave.boss = { hp: 1 };
  assert.equal(exploreGoal(st, fakeP(100, 30), 'EXPLORE'), null, 'no carrier hunt during a boss fight');
});

s.check('EXPLORE: a build ahead of the curve keeps the looser look (nearest enemy, half HP, full reach, no gem or crowd rule)', () => {
  const lvl = EXPLORE.ALTAR_LEVEL_BASE + EXPLORE.ALTAR_LEVEL_PER_WAVE * 3;
  const st = { enemies: Array.from({ length: 10 }, () => ({ x: EXPLORE.STRONG.CALM_R + 20, y: 0, hp: 5 })), wave: { num: 3 }, time: 0,
    gems: Array.from({ length: 10 }, () => ({ x: 5, y: 5 })), sites: [{ id: 1, kind: 'brazier', x: 0, y: 800, state: 'unused' }] };
  assert.equal(exploreCalm(st, fakeP(100, 1)), false, 'behind the curve: a crowd is not calm');
  assert.equal(exploreCalm(st, fakeP(55, lvl)), true, 'ahead: only the nearest enemy and half HP count');
  assert.equal(detourCap(st, fakeP(100, lvl)), EXPLORE.STRONG.DETOUR);
  assert.equal(exploreGoal(st, fakeP(100, lvl), 'EXPLORE').site.id, 1, 'ahead: walks 800 px past gems and a crowd');
  assert.equal(exploreGoal(st, fakeP(100, 1), 'EXPLORE'), null, 'behind: stays and fights');
  assert.equal(exploreCalm(st, fakeP(EXPLORE.STRONG.CALM_HP * 100 - 1, lvl)), false, 'ahead: under STRONG.CALM_HP is not calm');
  st.enemies.push({ x: EXPLORE.STRONG.CALM_R - 10, y: 0, hp: 5 });
  assert.equal(exploreCalm(st, fakeP(100, lvl)), false, 'ahead: an enemy inside STRONG.CALM_R is not calm');
});

s.check('EXPLORE detour cap shrinks with the wave; sites past it wait', () => {
  const caps = [1, 2, 3, 4, 6, 10].map(n => detourCap({ wave: { num: n } }));
  for (let i = 1; i < caps.length; i++) assert.ok(caps[i] <= caps[i - 1], 'non-increasing');
  assert.equal(caps[0], EXPLORE.DETOUR_BASE);
  assert.equal(caps[caps.length - 1], EXPLORE.DETOUR_MIN, 'floored');
  assert.ok(EXPLORE.DETOUR_BASE < EXPLORE.MAX_DIST);
  const far = { id: 5, kind: 'brazier', x: EXPLORE.DETOUR_MIN + 40, y: 0, state: 'unused' };
  const st = { enemies: [], sites: [far], wave: { num: 1 }, time: 0, gems: [] };
  assert.equal(exploreGoal(st, fakeP(), 'EXPLORE').site.id, 5, 'wave 1: inside the cap');
  st.wave.num = 10;
  assert.equal(exploreGoal(st, fakeP(), 'EXPLORE'), null, 'wave 10: past the cap, it waits');
});

s.check('EXPLORE never walks into the walled yard with enemies near', () => {
  const yard = { id: 6, kind: 'yard', x: 150, y: 0, state: 'unused', open: true };
  const st = { enemies: [], sites: [yard], wave: { num: 1 }, time: 0, gems: [] };
  assert.equal(exploreWants(st, fakeP(), yard), true, 'open yard, empty field');
  st.enemies = [{ x: -(EXPLORE.YARD_CLEAR_R - 10), y: 0, hp: 5 }];
  assert.equal(exploreCalm(st, fakeP()), true, 'the field is calm by the general rule...');
  assert.equal(exploreWants(st, fakeP(), yard), false, '...but one enemy within YARD_CLEAR_R keeps it out of the dead end');
  assert.equal(exploreGoal(st, fakeP(), 'EXPLORE'), null);
  // Ahead of the curve only STRONG.YARD_CLEAR_R has to be clear.
  const lvl = EXPLORE.ALTAR_LEVEL_BASE + EXPLORE.ALTAR_LEVEL_PER_WAVE;
  st.enemies = [{ x: -(EXPLORE.STRONG.YARD_CLEAR_R + 10), y: 0, hp: 5 }];
  assert.equal(exploreWants(st, fakeP(100, lvl), yard), true, 'ahead: an enemy past STRONG.YARD_CLEAR_R does not keep it out');
  assert.equal(exploreWants(st, fakeP(100, 1), yard), false, 'behind: the same enemy does');
  st.enemies = [{ x: -(EXPLORE.STRONG.YARD_CLEAR_R - 10), y: 0, hp: 5 }];
  assert.equal(exploreWants(st, fakeP(100, lvl), yard), false, 'ahead: one inside STRONG.YARD_CLEAR_R does');
  yard.open = false; st.enemies = [];
  assert.equal(exploreWants(st, fakeP(), yard), false, 'a shut yard is never a goal');
});

s.check('EXPLORE altar rule: strong build, healthy, wave part-way through', () => {
  const p = fakeP(100);
  const st = { wave: { num: 1, endsAt: 10 }, time: 0, enemies: [] };
  p.level = EXPLORE.ALTAR_LEVEL_BASE + EXPLORE.ALTAR_LEVEL_PER_WAVE;
  assert.equal(altarReady(st, p), true);
  p.level -= 1;
  assert.equal(altarReady(st, p), false, 'level too low');
  p.level += 1; p.hp = 70;
  assert.equal(altarReady(st, p), false, 'HP too low');
  p.hp = 100; st.wave.boss = {};
  assert.equal(altarReady(st, p), false, 'a boss is already up');
  assert.equal(exploreWants(st, p, { kind: 'statue', state: 'unused' }), false);
  // The same gates as the altar itself (main.js altarCanSummon): no walk to a quiet altar.
  delete st.wave.boss;
  st.wave.bosses = [{ hp: 5 }];
  assert.equal(altarReady(st, p), false, 'a wave boss is alive');
  st.wave.bosses = [{ hp: 0 }]; st.wave.pendingClear = true;
  assert.equal(altarReady(st, p), false, 'the boss is down and the portal is coming');
  st.wave.pendingClear = false; st.time = 8;
  assert.equal(altarReady(st, p), false, 'the boss comes in under 3 s anyway');
  st.time = 0;
  assert.equal(altarReady(st, p), true, 'clear again');
  const end = C.ESCALATION.END_WAVE;
  st.wave.num = end; p.level = EXPLORE.ALTAR_LEVEL_BASE + EXPLORE.ALTAR_LEVEL_PER_WAVE * end;
  assert.equal(altarReady(st, p), false, "the altar is quiet on the maw's wave");
});

s.check('a waypoint overrides the pick in AUTO and EXPLORE, never in MANUAL', () => {
  const site = { id: 9, kind: 'brazier', x: 500, y: 0, state: 'unused' };
  const st = { enemies: [{ x: 5, y: 0, hp: 1 }], sites: [site], waypoint: { x: 500, y: 0, site }, wave: { num: 1 }, time: 0 };
  assert.equal(exploreGoal(st, fakeP(), 'AUTO').site, site, 'AUTO follows the waypoint, calm or not');
  assert.equal(exploreGoal(st, fakeP(), 'EXPLORE').site, site);
  assert.equal(exploreGoal(st, fakeP(), 'MANUAL'), null);
});

// ------------------------------------------------------------- live
const h = await boot({ storage: [['hordes_onboarded', '1']] });
const T = h.T, st = T.state;
T.banners.suppressAll();
const quiet = () => {
  st.enemies.length = 0; st.gems.length = 0; st.drops.length = 0;
  st.spawnTimer = 999;
};
const fresh = () => { st.mode = 'menu'; T.startRun(); quiet(); };

s.check('live: startRun places the sites and registers them on the map', () => {
  fresh();
  assert.equal(fromStart(st.player), 0, 'the hero starts where the spawn clearings are measured from');
  assert.ok(st.sites.every(x => fromStart(x) >= SITES.SPAWN_CLEAR), 'no site in the spawn clearing');
  assert.ok(st.sites.length >= 15, 'sites placed');
  // M5b slice 3: the vault, lever and yard follow the pure placement; the
  // yard's walls join buildingRects, so place against the bare footprints.
  const rects = buildingFootprints(st.groundSeed, st.stage);
  assert.deepEqual(st.sites.filter(x => !['vault', 'lever', 'yard'].includes(x.kind)).map(x => [x.kind, x.x, x.y]),
    placeSites(st.groundSeed, st.stage, rects, 900).map(x => [x.kind, x.x, x.y]), 'the pure placement, unchanged');
  assert.equal(st.atlas.landmarks.length, st.sites.length);
});

s.check('live: altar -> boss now -> beat it -> extra chest -> portal -> next wave', () => {
  fresh();
  const altar = st.sites.find(x => x.kind === 'altar');
  st.wave.endsAt = st.time + 60;
  const wave0 = st.wave.num;
  for (let i = 0; i < 10 && altar.state !== 'spent'; i++) {
    st.player.x = altar.x; st.player.y = altar.y; st.lastSteerT = st.time; quiet(); h.pump(1);
  }
  assert.equal(altar.state, 'spent', 'the altar fired');
  h.pump(2);
  const bosses = (st.wave.bosses || []).filter(b => b.hp > 0);
  assert.ok(bosses.length >= 1, 'the wave boss is up now');
  assert.equal(st.wave.altar, true);
  const chests0 = st.chests.length;
  // Killed between frames: hold the wave clock so the next frame's wave check
  // (which runs before the death pass) does not call a fresh boss.
  st.wave.endsAt = st.time + 999;
  for (const b of bosses) b.hp = 0;
  for (let i = 0; i < 5; i++) h.pump(1);
  assert.ok(st.chests.length >= chests0 + 1, 'the boss paid chests (with the altar extra)');
  assert.equal(st.wave.altar, false, 'the altar chest paid once');
  assert.ok(st.portal, 'the portal opened');
  // Walk into the portal; any cinematic or intermission resolves to the next wave.
  for (let i = 0; i < 60 * 20 && st.wave.num === wave0; i++) {
    if (st.portal) { st.player.x = st.portal.x; st.player.y = st.portal.y; }
    if (st.mode === 'chest') h.key('keydown', { key: 'Enter' });
    if (st.mode === 'escape') { try { T.escape.skip(); } catch { /* optional */ } }
    if (st.mode === 'intermission') {
      const c = h.elements['ov-cards'].children.find(x => (x.innerHTML || '').includes('CONTINUE'));
      if (c) c.click();
    }
    if (st.mode === 'portal-cine') h.key('keydown', { key: 'Escape' });
    // Boss gems can level the hero: take the first card so the walk goes on.
    if (st.mode === 'draft' || st.mode === 'evolve') {
      const c0 = h.elements['ov-cards'].children[0];
      if (c0 && c0.click) c0.click();
    }
    st.player.hp = st.player.stats.maxHp;   // this check is about the wave flow, not survival
    h.pump(1);
  }
  assert.equal(st.wave.num, wave0 + 1, 'the run moved on to the next wave (mode ' + st.mode + ', portal ' + !!st.portal + ', bosses up ' + (st.wave.bosses || []).filter(x => x.hp > 0).length + ', hold ' + JSON.stringify({ hint: !!(T.tut && T.tut.model), banner: st.bannerHold || 0, po: st.portal && [Math.round(st.portal.x), Math.round(st.portal.y), st.portal.entering, st.portal.enterT, st.portal.age], pl: [Math.round(st.player.x), Math.round(st.player.y)], hp: st.player.hp, dead: st.player.dead, t: st.time, cine: st.cine && st.cine.kind, dil: st.dilation, paused: st.paused, mode: st.mode, sub: st.subMode }) + ')');
});

s.check('live: a quiet altar says why; a waypoint on an altar that cannot wake again is dropped', () => {
  fresh();
  T.setPilotMode('AUTO_ALL');
  const altar = st.sites.find(x => x.kind === 'altar');
  const end = C.ESCALATION.END_WAVE;
  const said = () => {
    st.toasts.length = 0;
    T.sites.event({ kind: 'altarQuiet', site: altar }, st.player);
    return st.toasts.map(t => t.msg).join(' | ');
  };
  st.wave.endsAt = st.time + 60;
  st.wave.bosses = [{ hp: 10 }];
  assert.equal(said(), 'THE ALTAR IS QUIET: FINISH THIS BOSS FIRST');
  st.wave.bosses = [{ hp: 0 }]; st.wave.pendingClear = true;
  assert.equal(said(), 'THE ALTAR WAKES NEXT WAVE', 'the boss is down: no boss to finish');
  st.wave.num = end - 1;
  assert.equal(said(), "THE ALTAR IS QUIET: THIS WAVE'S BOSS IS DOWN", "the next wave is the maw's: the altar will not wake again");
  st.wave.num = 1; st.wave.pendingClear = false;
  st.wave.endsAt = st.time + 2;
  assert.equal(said(), 'THE ALTAR IS QUIET: THE BOSS IS ALMOST HERE');
  // The maw's wave, through the frame's own tick: the pilot was sent there.
  st.wave.endsAt = st.time + 60;
  st.wave.num = end;
  T.sites.setWaypoint(altar);
  st.toasts.length = 0;
  st.player.x = altar.x; st.player.y = altar.y;
  for (let i = 0; i < 3 && st.waypoint; i++) T.sites.tick(st.player, 1 / 60);
  assert.equal(altar.state, 'unused', 'no boss call on the maw\'s wave');
  assert.ok(st.toasts.some(t => t.msg === 'THE ALTAR ONLY WAKES ON WAVES 1-' + (end - 1)),
    'it says when it wakes: ' + st.toasts.map(t => t.msg).join(' | '));
  assert.equal(st.waypoint, null, 'the waypoint comes off: the altar cannot finish it');
});

s.check('live: the statue curses new spawns and pays its reward when the boss falls', () => {
  fresh();
  const statue = st.sites.find(x => x.kind === 'statue');
  statue.deal = CURSES.find(c => c.pay === 'chests');
  st.player.x = statue.x; st.player.y = statue.y;
  st.lastSteerT = st.time;   // steering: a deliberate touch
  h.pump(1);
  assert.equal(statue.state, 'active');
  assert.equal(st.siteCurse, statue.deal);
  const e = { x: 0, y: 0, hp: 10, maxHp: 10, speed: 20 };
  T.sites.curseEnemy(e);
  assert.equal(e.hp, 10 * statue.deal.hpMult, 'the stated curse applies');
  T.sites.curseEnemy(e);
  assert.equal(e.hp, 10 * statue.deal.hpMult, 'once per enemy');
  const chests0 = st.chests.length;
  T.sites.bossPayout(0, 0);
  assert.equal(statue.state, 'spent'); assert.equal(st.siteCurse, null);
  assert.equal(st.chests.length, chests0 + 2, 'two chests');
});

s.check('live: waypoint set / clear (map tap and toggle) and the pilot goal', () => {
  fresh();
  T.setPilotMode('AUTO_ALL');
  const site = st.sites.find(x => x.kind === 'shrine');
  T.sites.setWaypoint(site);
  assert.equal(st.waypoint.site, site);
  quiet(); h.pump(1);
  assert.equal(st.pilotGoal && st.pilotGoal.site, site, 'AUTO: the waypoint is the goal');
  T.sites.setWaypoint(site);
  assert.equal(st.waypoint, null, 'the same site again clears it');
  // Through the map: discover the site, open the map, tap its icon.
  const lm = st.atlas.landmarks.find(l => l.site === site);
  lm.discovered = true;
  T.map.toggle(); h.pump(1);
  const mk = T.renderer.atlasMap.landmarks.find(m => m.site === site);
  assert.ok(mk, 'the discovered site has a map icon');
  assert.equal(T.sites.mapTap(mk.x, mk.y), true);
  assert.equal(st.waypoint && st.waypoint.site, site, 'tap sets it');
  h.pump(1);
  const b = T.renderer.atlasMap.clearBtn;
  assert.ok(b, 'a CLEAR button shows while a waypoint is set');
  T.sites.mapTap(b.x + 2, b.y + 2);
  assert.equal(st.waypoint, null, 'CLEAR clears it');
  T.map.toggle();
  T.setPilotMode('MANUAL');
  T.sites.setWaypoint(site); quiet(); h.pump(1);
  assert.equal(st.pilotGoal, null, 'MANUAL: no pilot goal (the arrow guides you)');
  T.setPilotMode('AUTO_ALL');
});

s.check('live: EXPLORE walks to a site when calm and stands in the shrine', () => {
  fresh();
  T.setPilotMode('EXPLORE');
  st.waypoint = null;
  // Keep only one shrine, near the hero, so the route is short.
  const sh = st.sites.find(x => x.kind === 'shrine');
  st.sites = [sh];
  sh.x = Math.round(st.player.x + 120); sh.y = Math.round(st.player.y);
  const rects = buildingRects(st.groundSeed, st.stage);
  for (const q of rects) {
    if (sh.x > q.x - 40 && sh.x < q.x + q.w + 40 && sh.y > q.y - 40 && sh.y < q.y + q.h + 40) { sh.x = st.player.x; sh.y = st.player.y + 1; }
  }
  for (let i = 0; i < 60 * 15 && sh.state !== 'spent'; i++) { quiet(); h.pump(1); if (st.mode === 'draft') break; }
  assert.equal(sh.state, 'spent', 'EXPLORE reached and charged the shrine');
  assert.equal(st.draftKind, 'shrine');
  T.sites.pickCard(st.shrineOffer[0]);
  T.setPilotMode('AUTO_ALL');
});

s.check('live: the hands-on bonus is paid once per interaction', () => {
  fresh();
  const br = st.sites.find(x => x.kind === 'brazier');
  // Only this brazier: a neighbour in its cluster, or a cracked wall, breaking
  // in the next frames is another interaction with its own bonus.
  st.sites = [br];
  st.secrets = [];
  st.lastSteerT = st.time;   // steering just now
  const pays0 = st.handsOnPays;
  st.player.x = br.x; st.player.y = br.y;
  h.pump(1);
  assert.equal(br.state, 'spent');
  assert.equal(st.handsOnPays, pays0 + 1, 'one HANDS-ON pop for one break');
  h.pump(3);
  assert.equal(st.handsOnPays, pays0 + 1, 'and never again');
  assert.ok(st.sitePops.some(q => q.text === 'HANDS-ON'));
  st.lastSteerT = -99;
  assert.equal(T.sites.handsOn(), false, 'no steering: no bonus');
});

s.done();
