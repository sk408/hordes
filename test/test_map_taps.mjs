// THE MAP'S TAP TARGETS: a site icon and the CLEAR WAYPOINT button are both
// at least 44 CSS px across on a phone (390 px wide portrait), the nearest
// icon wins, and a tap away from every icon sets nothing.
// Run: node test/test_map_taps.mjs
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';
import { mulberry32 } from '../src/weather.js';
import { CONFIG as C } from '../src/config.js';

Math.random = mulberry32(20261002);

const h = await boot({ storage: [['hordes_onboarded', '1']] });
const T = h.T;
const st = T.state;
const S = suite('test_map_taps');
T.banners.suppressAll();
T.tut.setHintsEnabled(false);

// The common phone letterbox: the 480 px view drawn 390 CSS px wide.
const PHONE_SCALE = 390 / C.VIEW_W;
const FLOOR = 44;
const quiet = () => { st.enemies.length = 0; st.gems.length = 0; st.drops.length = 0; st.spawnTimer = 999; };
const map = () => T.renderer.atlasMap;

// A run with the map open and only two site icons on it, both discovered,
// 40 view px apart.
let a, b, mkA, mkB;
function openMap() {
  st.mode = 'menu';
  T.startRun(); quiet();
  T.setPilotMode('AUTO_ALL');
  [a, b] = st.sites.filter(x => x.kind === 'shrine');
  const lmA = st.atlas.landmarks.find(l => l.site === a), lmB = st.atlas.landmarks.find(l => l.site === b);
  st.atlas.landmarks.length = 0;
  st.atlas.landmarks.push(lmA, lmB);
  const span = 2 * st.atlas.rim;                    // world px across the map box
  lmA.x = 0; lmA.y = 0; lmB.x = 0; lmB.y = 0;
  lmA.discovered = lmB.discovered = true;
  T.map.toggle(); h.pump(1);
  // 40 view px to the right of A, whatever the box's scale.
  lmB.x = lmA.x + 40 * span / map().size;
  h.pump(1);
  mkA = map().landmarks.find(m => m.site === a);
  mkB = map().landmarks.find(m => m.site === b);
  assert.ok(mkA && mkB, 'both icons are on the map');
  assert.equal(mkB.x - mkA.x, 40);
  st.waypoint = null;
}

S.check('the constants put both targets over the 44 px floor at the phone letterbox', () => {
  assert.ok(2 * C.ATLAS.TAP_R * PHONE_SCALE >= FLOOR, 'site: ' + 2 * C.ATLAS.TAP_R * PHONE_SCALE + ' CSS px');
  assert.ok(C.ATLAS.CLEAR_HIT_H * PHONE_SCALE >= FLOOR, 'CLEAR: ' + C.ATLAS.CLEAR_HIT_H * PHONE_SCALE + ' CSS px tall');
});
S.check('a tap 22 CSS px from a site icon (27 view px) sets the waypoint', () => {
  openMap();
  const d = Math.floor(FLOOR / 2 / PHONE_SCALE);    // 27 view px
  assert.equal(T.sites.mapTap(mkA.x - d, mkA.y), true);
  assert.equal(st.waypoint && st.waypoint.site, a, 'a tap left of the icon');
  st.waypoint = null;
  assert.equal(T.sites.mapTap(mkA.x, mkA.y + d), true);
  assert.equal(st.waypoint && st.waypoint.site, a, 'a tap below the icon');
  T.map.toggle();
});
S.check('between two icons the nearer one wins', () => {
  openMap();
  T.sites.mapTap(mkA.x + 15, mkA.y);
  assert.equal(st.waypoint && st.waypoint.site, a);
  T.sites.mapTap(mkA.x + 25, mkA.y);
  assert.equal(st.waypoint && st.waypoint.site, b);
  T.map.toggle();
});
S.check('a tap on the map away from every icon sets nothing, and stays with the map', () => {
  openMap();
  const far = C.ATLAS.TAP_R + 6;
  assert.equal(T.sites.mapTap(mkA.x - far, mkA.y), true, 'inside the map box: the tap is used');
  assert.equal(st.waypoint, null);
  T.map.toggle();
});
S.check('CLEAR WAYPOINT: the tap target is 44 CSS px tall, round the painted plate, inside the view', () => {
  openMap();
  T.sites.setWaypoint(a);
  h.pump(1);
  const m = map(), hit = m.clearBtn;
  assert.ok(hit && hit.plate, 'the button shows while a waypoint is set');
  assert.ok(hit.h * PHONE_SCALE >= FLOOR && hit.w * PHONE_SCALE >= FLOOR, hit.w + 'x' + hit.h + ' view px');
  assert.deepEqual([hit.plate.w, hit.plate.h], [92, 14], 'the painted plate keeps its size');
  assert.ok(hit.x <= hit.plate.x && hit.x + hit.w >= hit.plate.x + hit.plate.w &&
    hit.y <= hit.plate.y && hit.y + hit.h >= hit.plate.y + hit.plate.h, 'the target covers the plate');
  assert.ok(hit.x >= 0 && hit.y >= 0 && hit.x + hit.w <= C.VIEW_W && hit.y + hit.h <= C.VIEW_H, 'inside the view');
  assert.ok(hit.x > m.x + m.size, 'clear of the map box');
  T.map.toggle();
});
S.check('a tap just above or below the painted CLEAR plate clears the waypoint', () => {
  openMap();
  for (const dy of [-12, 12 + 14]) {
    T.sites.setWaypoint(a);
    h.pump(1);
    const p = map().clearBtn.plate;
    assert.equal(T.sites.mapTap(p.x + p.w / 2, p.y + dy), true, 'the tap is used (dy ' + dy + ')');
    assert.equal(st.waypoint, null, 'cleared (dy ' + dy + ')');
  }
  T.map.toggle();
});

S.done();
process.exit(0);
