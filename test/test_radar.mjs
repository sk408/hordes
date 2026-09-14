// HORDES — headless tests for src/radar.js (node, no DOM, no framework).
// Run: node test/test_radar.mjs
//
// A2 THE RADAR, DATA LAYER ONLY. These tests pin the parts of the radar that a
// reviewer cannot eyeball from a screenshot: the radius covers the spawn ring,
// the dot set is exactly the enemies inside it, the mapping is player-centred
// and y-down (not silently mirrored), tiers are distinct, the order is
// deterministic, the inputs are never touched, and a 200-enemy field stays
// bounded. They do NOT assert anything about how the radar LOOKS — that is a
// renderer concern (and this host has no vision model; see hordes-project-ops).
import {
  RADAR_RADIUS, DEFAULT_RADAR, RADAR_TIERS, SPAWN_DIST, SPAWN_RING_MAX,
  classifyTier, radarDots,
} from '../src/radar.js';
import { CONFIG as C } from '../src/config.js';   // read-only: drift guard on the mirrored spawn ring

let passed = 0, failed = 0;
function ok(cond, msg) {
  if (cond) { passed++; console.log('  PASS ' + msg); }
  else { failed++; console.error('  FAIL ' + msg); }
}

// ---------------------------------------------------------------------------
// RADIUS covers the spawn ring (the mirrored constants must not drift)
// ---------------------------------------------------------------------------
console.log('RADIUS COVERS THE SPAWN RING:');
{
  ok(SPAWN_DIST === C.ENEMY.SPAWN_DIST,
    `the mirrored SPAWN_DIST must match config.js ENEMY.SPAWN_DIST ` +
    `(radar ${SPAWN_DIST}, config ${C.ENEMY.SPAWN_DIST})`);
  // 280 * 1.15 = 322 (the main.js draw is 0.85 + rand*0.3, so the ring is [238, 322]).
  ok(SPAWN_RING_MAX === 322, `the max spawn ring is 280 * 1.15 = 322 (got ${SPAWN_RING_MAX})`);
  ok(RADAR_RADIUS >= SPAWN_RING_MAX,
    `the radar radius must cover the whole ring (${RADAR_RADIUS} >= ${SPAWN_RING_MAX})`);
  ok(DEFAULT_RADAR.radius === RADAR_RADIUS && DEFAULT_RADAR.displayRadius === RADAR_RADIUS,
    'the default config draws 1 radar px per world px at the full radius');
}

// ---------------------------------------------------------------------------
// THE FIXED FIXTURE — enemies inside, outside, and exactly ON the boundary
// Player at origin so radar space reads directly as world offsets.
// ---------------------------------------------------------------------------
const player = { x: 0, y: 0 };
const fixture = [
  { typeId: 'CHASER', x: 100, y: 0, elite: false },        // inside, east (chaff)
  { typeId: 'BRUTE', x: 0, y: -200, elite: true },         // inside, north (elite)
  { typeId: 'SWARMER', x: 198, y: 264, elite: false },     // EXACTLY on 330 (hypot 198/264 = 330)
  { typeId: 'CHASER', x: 330, y: 1, elite: false },        // just OUTSIDE (330.0015)
  { typeId: 'CHASER', x: -400, y: 0, elite: false },       // OUTSIDE
  { typeId: 'CHASER', x: 300, y: 300, elite: false },      // OUTSIDE (424.3)
  { typeId: 'COLOSSUS', x: 0, y: 322, elite: false, boss: true },   // INSIDE: max spawn ring, boss
];
const EXPECTED_INSIDE = 4;   // indices 0, 1, 2, 6

console.log('\nDOT SET (fixed fixture: 3 inside-or-edge + 3 outside + 1 boss on the ring):');
const dots = radarDots(player, fixture, DEFAULT_RADAR);
{
  const counts = {};
  for (const d of dots) counts[d.tier] = (counts[d.tier] || 0) + 1;
  ok(dots.length === EXPECTED_INSIDE,
    `dot count equals the enemies within the radius (got ${dots.length}, want ${EXPECTED_INSIDE})`);
  const ids = dots.map(d => `${d.typeId}@(${d.x},${d.y})`).join(' ');
  console.log('  DOT SET:', JSON.stringify(dots));
  console.log('  readable:', ids);
  console.log('  tier counts:', JSON.stringify(counts));
}

// ---------------------------------------------------------------------------
// Containment: nothing beyond the radius, and the boundary rule is INCLUSIVE
// ---------------------------------------------------------------------------
console.log('\nCONTAINMENT + BOUNDARY RULE:');
{
  ok(dots.every(d => d.dist <= RADAR_RADIUS),
    'no dot may sit beyond the radar radius');
  ok(dots.every(d => Math.hypot(d.x, d.y) <= DEFAULT_RADAR.displayRadius + 1),
    'no dot may sit outside the drawn circle (integer-rounding slack <= 1px)');
  ok(dots.some(d => d.typeId === 'SWARMER' && d.dist === 330),
    'an enemy EXACTLY on the radius (dist 330) IS included (inclusive boundary)');
  const outsideSeen = dots.some(d => d.x === 330 || d.x === -400 || (d.x === 300 && d.y === 300));
  ok(!outsideSeen, 'an enemy beyond the radius is OMITTED, never clamped to the rim');
  // The max spawn ring (322) must be visible; one px beyond the radar must not.
  const ringDots = radarDots(player, [{ typeId: 'CHASER', x: 322, y: 0 }], DEFAULT_RADAR);
  const pastDots = radarDots(player, [{ typeId: 'CHASER', x: 331, y: 0 }], DEFAULT_RADAR);
  ok(ringDots.length === 1 && pastDots.length === 0,
    `the far spawn ring (322) is visible and 331 is not ` +
    `(ring ${ringDots.length}, past ${pastDots.length})`);
}

// ---------------------------------------------------------------------------
// Tiers: chaff vs elite vs boss are distinguishable, boss wins
// ---------------------------------------------------------------------------
console.log('\nTIERS:');
{
  const tiers = new Set(dots.map(d => d.tier));
  ok(tiers.has(RADAR_TIERS.CHAFF) && tiers.has(RADAR_TIERS.ELITE) && tiers.has(RADAR_TIERS.BOSS),
    'the fixture yields all three tags: ' + [...tiers].sort().join('/'));
  ok(tiers.size === 3, `the three tags are distinct (got ${tiers.size})`);
  ok(classifyTier({ elite: false }) === 'chaff', 'a plain enemy is chaff');
  ok(classifyTier({ elite: true }) === 'elite', 'an elite enemy is elite');
  ok(classifyTier({ boss: true }) === 'boss', 'a boss is boss');
  ok(classifyTier({ boss: true, elite: true }) === 'boss',
    'a boss stamped elite is still tagged boss (no downgrade)');
  ok(classifyTier({}) === 'chaff' && classifyTier(null) === 'chaff',
    'missing flags / a null entry fall back to chaff, not a crash');
}

// ---------------------------------------------------------------------------
// The player IS the centre, y-down, same handedness as the world (no mirror)
// ---------------------------------------------------------------------------
console.log('\nCENTRE + ORIENTATION:');
{
  const c = radarDots(player, [
    { typeId: 'NORTH', x: 0, y: -200 },
    { typeId: 'EAST', x: 200, y: 0 },
    { typeId: 'SOUTH', x: 0, y: 200 },
    { typeId: 'WEST', x: -200, y: 0 },
  ], DEFAULT_RADAR);
  const at = (id) => c.find(d => d.typeId === id);
  ok(at('NORTH').x === 0 && at('NORTH').y === -200,
    `an enemy directly north maps to radar (0,-200) — up, NOT mirrored to +y (got ` +
    `${at('NORTH').x},${at('NORTH').y})`);
  ok(at('SOUTH').y === 200, 'south maps to +y (down): ' + at('SOUTH').y);
  ok(at('EAST').x === 200 && at('EAST').y === 0, 'east maps to +x (right)');
  ok(at('WEST').x === -200 && at('WEST').y === 0, 'west maps to -x (left)');
  // The player is the origin, not the field centre: move the player and the
  // whole set must translate with them.
  const moved = radarDots({ x: 1000, y: -500 },
    [{ typeId: 'P', x: 900, y: -500 }], DEFAULT_RADAR);
  ok(moved.length === 1 && moved[0].x === -100 && moved[0].y === 0,
    'radar space is player-relative (same enemy, player moved -> (-100,0))');
  // Integer pixels only, and the display scale is honoured.
  const scaled = radarDots(player, [{ typeId: 'S', x: 165, y: 66 }],
    { radius: 330, displayRadius: 66 });
  ok(scaled[0].x === 33 && scaled[0].y === 13,
    `displayRadius 66 maps 1:5 to integer px (got ${scaled[0].x},${scaled[0].y})`);
  ok(c.every(d => Number.isInteger(d.x) && Number.isInteger(d.y)) &&
     scaled.every(d => Number.isInteger(d.x) && Number.isInteger(d.y)),
    'every emitted coordinate is an integer pixel');
}

// ---------------------------------------------------------------------------
// Deterministic order, stable across identical calls
// ---------------------------------------------------------------------------
console.log('\nORDER + DETERMINISM:');
{
  const a = radarDots(player, fixture, DEFAULT_RADAR);
  const b = radarDots(player, fixture, DEFAULT_RADAR);
  ok(JSON.stringify(a) === JSON.stringify(b),
    'two identical calls produce byte-for-byte identical output');
  ok(a.every((d, i) => i === 0 || a[i - 1].dist <= d.dist),
    'dots are ordered nearest-first: ' + a.map(d => d.dist.toFixed(1)).join(' <= '));
  // Same enemies, shuffled input: the ordering contract must still hold and
  // the SET of dots must be identical.
  const shuffled = [fixture[3], fixture[6], fixture[1], fixture[4], fixture[0], fixture[5], fixture[2]];
  const s = radarDots(player, shuffled, DEFAULT_RADAR);
  ok(s.every((d, i) => i === 0 || s[i - 1].dist <= d.dist),
    'nearest-first ordering holds for a shuffled input array');
  const key = (d) => `${d.typeId}:${d.x},${d.y}:${d.tier}`;
  ok(s.map(key).join('|') === a.map(key).join('|'),
    'a shuffled field yields the same dot set in the same order');
  // Equal distances still get a total (reproducible) order, via input index.
  const tie = [{ typeId: 'T0', x: 10, y: 0 }, { typeId: 'T1', x: 0, y: 10 }, { typeId: 'T2', x: -10, y: 0 }];
  const t1 = radarDots(player, tie, DEFAULT_RADAR).map(d => d.typeId).join(',');
  const t2 = radarDots(player, tie, DEFAULT_RADAR).map(d => d.typeId).join(',');
  ok(t1 === 'T0,T1,T2' && t2 === t1,
    `tied distances break by input index, reproducibly (got ${t1})`);
  // 60Hz AND 120Hz: no time term, no accumulated state — 240 back-to-back calls
  // must agree with the first.
  let allSame = true;
  for (let i = 0; i < 240; i++) {
    if (JSON.stringify(radarDots(player, fixture, DEFAULT_RADAR)) !== JSON.stringify(a)) { allSame = false; break; }
  }
  ok(allSame, 'the output is stateless across 240 calls (60Hz and 120Hz read the same set)');
}

// ---------------------------------------------------------------------------
// Purity: the fixture must be untouched (frozen, so a write would throw)
// ---------------------------------------------------------------------------
console.log('\nNO MUTATION:');
{
  const p = Object.freeze({ x: 12, y: -34 });
  const field = Object.freeze([
    Object.freeze({ typeId: 'CHASER', x: 40, y: -34, elite: false, hp: 10, speed: 5 }),
    Object.freeze({ typeId: 'BRUTE', x: 12, y: 100, elite: true, hp: 90 }),
    Object.freeze({ typeId: 'CHASER', x: 900, y: 0, elite: false }),
  ]);
  const before = JSON.stringify({ p, field });
  let threw = null;
  let frozenDots = null;
  try { frozenDots = radarDots(p, field, DEFAULT_RADAR); } catch (e) { threw = e; }
  ok(!threw, 'the call must not write into a FROZEN player/enemy list' +
    (threw ? ' (threw ' + threw.message + ')' : ''));
  ok(JSON.stringify({ p, field }) === before,
    'the fixture is byte-for-byte unchanged after the call');
  ok(frozenDots && frozenDots.length === 2, 'the frozen fixture still yields its 2 in-range dots');
  // The returned objects are fresh — mutating a dot must not touch the enemy.
  const mutable = [{ typeId: 'CHASER', x: 50, y: 0, elite: false }];
  const md = radarDots(player, mutable, DEFAULT_RADAR);
  md[0].x = 9999; md[0].tier = 'tampered';
  ok(mutable[0].x === 50 && mutable[0].tier === undefined,
    'dots are copies, not references into the enemy objects');
}

// ---------------------------------------------------------------------------
// BOUNDED under a large field (200 enemies)
// ---------------------------------------------------------------------------
console.log('\nBOUNDED (202-enemy field):');
{
  const big = [];
  for (let i = 0; i < 200; i++) {
    // 100 on a spiral safely inside 300px, 100 far outside at 600-900px.
    const inside = i < 100;
    const r = inside ? 20 + (i * 2.8) : 600 + (i - 100) * 3;
    const a = i * 0.7;
    big.push({ typeId: i % 7 === 0 ? 'BRUTE' : 'CHASER', x: Math.cos(a) * r, y: Math.sin(a) * r,
      elite: i % 11 === 0 });
  }
  // Two bosses, one each side of the radius: the inside one MUST dot, the
  // outside one must not (a boss is not exempt from the radius).
  big.push({ typeId: 'GRAVELMAW', x: 250, y: 0, boss: true });
  big.push({ typeId: 'CHOIR', x: -400, y: 0, boss: true });
  // Independent truth: count the field the LONG way (recompute distance).
  let truth = 0;
  for (const e of big) if (Math.hypot(e.x, e.y) <= RADAR_RADIUS) truth++;
  const bd = radarDots(player, big, DEFAULT_RADAR);
  ok(bd.length === truth,
    `the dot set equals the independently-counted in-range enemies (${bd.length} vs ${truth})`);
  ok(bd.length === 101,
    `the fixture is bounded to exactly its 101 in-range enemies, not all 202 (got ${bd.length})`);
  ok(bd.every(d => d.dist <= RADAR_RADIUS), 'every dot in the large field is within the radius');
  ok(bd.every((d, i) => i === 0 || bd[i - 1].dist <= d.dist), 'the large field is still nearest-first');
  const bosses = bd.filter(d => d.tier === RADAR_TIERS.BOSS);
  ok(bosses.length === 1 && bosses[0].typeId === 'GRAVELMAW',
    `only the IN-RANGE boss dots (${bosses.length}: ${bosses.map(d => d.typeId).join(',')})`);
  console.log(`  large field: 202 enemies -> ${bd.length} dots (all within ${RADAR_RADIUS}px)`);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\nRADAR CHECKS: ${passed} passed, ${failed} failed`);
if (failed) { console.error(`\n${failed} FAILURES`); process.exit(1); }
console.log('\nALL RADAR TESTS PASSED');
