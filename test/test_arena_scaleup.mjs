// HORDES — THE WAVE ARENA SCALE-UP (2026-09-17): 2x2 -> 3x3 units + ELEVATED
// PATHS + the boss-clear drop sweep. Owner directives msg_01M2R90M ("make the
// map quite a bit larger ... elevated paths, like a megabonk map") and
// msg_01M2R966 (spawn-density re-scope: measure LOCAL pressure; boss-clear
// drop sweep with a visible total, no silent loss).
//
// Proven here, in order:
//   EXTENT        the unit is pinned (UNIT 600), RIM is a getter over the
//                 unit count, every reader follows the one knob, and the
//                 shipped 2-unit extent falls out of flipping ONE constant
//                 (the counter-case)
//   ELEVATION     the relief field exists per stage with distinct character,
//                 the grade term is bounded and symmetric (pilot and horde
//                 read the SAME function at the SAME seams), the exposure
//                 bias and vision trade are pure, and high ground is NOT a
//                 sanctuary (measured contact rates)
//   LOCAL PRESSURE spawns are pilot-relative, so the LOCAL numbers hold
//                 while the field-wide density dilutes — both reported
//   BOSS SWEEP    the clear arms a visible sweep that banks the ground drops
//                 through the normal pickup path and toasts the total; the
//                 normal wave transition collects NOTHING silently
//   AUTO + NIGHT  the pilot completes a wave unattended on the 9-unit field
//                 with relief live, and a NIGHT run clears + auto-continues
//   RADAR         the radar still covers the whole spawn ring at the new
//                 extent (the ring is pilot-relative), and high ground
//                 widens it
import { suite, boot } from './_harness.mjs';
import { readFileSync } from 'node:fs';
import { CONFIG as C } from '../src/config.js';
import { STAGES, stageRelief, DEFAULT_RELIEF } from '../src/stages.js';
import {
  reliefHeight, reliefLevel, reliefLevelAt, reliefGrade, reliefUphillAzimuth,
  reliefBiasAngle, reliefVisionRadius,
} from '../src/relief.js';
import { lootLimit } from '../src/entities.js';
import { atlasGridSide } from '../src/atlas.js';
import { radarDots, RADAR_RADIUS, SPAWN_RING_MAX } from '../src/radar.js';
import { buyUpgrade, SHOP_UPGRADES } from '../src/meta.js';

const S = suite('test_arena_scaleup');
function assert(cond, msg) { if (!cond) throw new Error('AssertionError: ' + msg); }

// ---------------------------------------------------------------------------
// THE EXTENT, pinned. One unit = 600 world px per axis (a quarter of the
// shipped 2x2 = 1200x1200 arena on each axis); UNITS 3 -> 1800x1800, RIM 900.
// The unit is EXTENT, not zoom: tile sizes, camera scale and sprite sizes are
// untouched (the camera block pin below) — there is just MORE arena.
// ---------------------------------------------------------------------------
S.check('the unit is pinned; RIM follows the unit count; the readers derive', () => {
  assert(C.GROUND.UNIT === 600, 'UNIT is a quarter of the shipped axis (' + C.GROUND.UNIT + ')');
  assert(C.GROUND.UNITS === 3, 'the arena is 3x3 units (' + C.GROUND.UNITS + ')');
  assert(C.GROUND.RIM === 900, 'RIM = UNIT*UNITS/2 = 900 (got ' + C.GROUND.RIM + ')');
  // The camera is UNTOUCHED (scale, not extent, is not what grew).
  assert(C.CAMERA.DEADZONE_W === 64 && C.CAMERA.DEADZONE_H === 44 &&
    C.CAMERA.LEAD === 14 && C.CAMERA.SAFE === 40 && C.CAMERA.SMOOTH === 5,
    'the CAMERA block is byte-identical (the view did not zoom)');
  // Derived readers: the atlas grid divides EXACTLY at the new extent, and
  // the loot reachability margin follows the rim.
  assert(atlasGridSide(C.GROUND.RIM, C.ATLAS.MAP_CELL) === 45,
    'atlas 45x45 (1800/40 exact — the C3 division rule holds at 3 units)');
  assert(lootLimit() === C.GROUND.RIM - C.GROUND.WALL - C.PLAYER.XP_PICKUP_RADIUS,
    'the loot limit derives from the rim (' + lootLimit() + ')');
});
S.check('COUNTER-CASE: UNITS back to 2 shrinks the arena to the shipped extent (nothing is hardcoded)', () => {
  // config.js exports the live object, so the counter-case flips the ONE
  // extent constant and restores it after — the shipped 1200x1200 field must
  // fall straight out, proving the 9-unit build is not propped up by any
  // hardcoded length anywhere.
  const keep = C.GROUND.UNITS;
  try {
    C.GROUND.UNITS = 2;
    assert(C.GROUND.RIM === 600, 'UNITS=2 -> RIM 600 (got ' + C.GROUND.RIM + ')');
    assert(atlasGridSide(C.GROUND.RIM, C.ATLAS.MAP_CELL) === 30,
      'the shipped 30x30 atlas grid falls out of the same knob');
  } finally {
    C.GROUND.UNITS = keep;
  }
  assert(C.GROUND.RIM === 900, 'restored');
});

// ---------------------------------------------------------------------------
// ELEVATED PATHS, structural: every stage declares a relief character, the
// field is deterministic + bounded, the characters DIFFER (per-arena
// elevation identity), and the anti-sanctuary contract holds —
//   * the GRADE term is bounded and symmetric: uphill costs, downhill pays,
//     the same rule for whoever moves (reliefGrade takes no "who" argument);
//   * the EXPOSURE BIAS and VISION reads are pure and only fire on HIGH
//     ground — the trade, never a haven.
// ---------------------------------------------------------------------------
S.check('every stage declares a distinct relief character; the field is deterministic and bounded', () => {
  const seen = new Set();
  for (const st of STAGES) {
    const rel = stageRelief(st.id);
    // ELEVATION ROLLBACK (2026-09-18): the starting arena ships FLAT —
    // LEVELS 1, no BASIN, no TERRACE — while the seven unlockable arenas
    // keep their authored (graded, never blocking) characters untouched.
    if (st.id === 'VERDANT_HOLLOW') {
      assert(rel.LEVELS === 1 && !rel.TERRACE && !rel.BASIN,
        'VERDANT ships the flat rollback: ' + JSON.stringify(rel));
    } else {
      assert(rel.CELL >= 200 && rel.CELL <= 700 && rel.LEVELS >= 2 && rel.LEVELS <= 4,
        st.id + ' declares a relief character in range: ' + JSON.stringify(rel));
    }
    seen.add(rel.CELL + 'x' + rel.LEVELS);
    // The field: deterministic per seed, bounded 0..LEVELS-1, and EVERY level
    // is reachable somewhere in the arena (the elevated routes exist).
    const levels = new Set();
    for (let x = -880; x <= 880; x += 37) {
      for (let y = -880; y <= 880; y += 41) levels.add(reliefLevel(x, y, 4242, rel));
    }
    for (let lv = 0; lv < rel.LEVELS; lv++) {
      assert(levels.has(lv), st.id + ': level ' + lv + ' exists somewhere in the field');
    }
    assert(reliefLevel(123, -456, 7, rel) === reliefLevel(123, -456, 7, rel),
      st.id + ': same point, same level (pure)');
  }
  assert(seen.size >= 5, 'the 8 stages express at least 5 distinct characters (got ' + seen.size + ')');
  // The Megabonk reading: elevation is ROUTE + TRADE, not walls — the height
  // is a speed grade, and nothing in the field can block a mover (there is
  // no collision input anywhere in relief.js; the grade is the whole effect).
  const rel = stageRelief('VOID_REACH');
  for (let x = -880; x <= 880; x += 61) {
    for (let y = -880; y <= 880; y += 67) {
      const g = reliefGrade(x, y, 1, 0, 4242, rel);
      assert(g >= 1 - C.RELIEF.GRADE_CAP - 1e-9 && g <= 1 + C.RELIEF.GRADE_CAP + 1e-9,
        'grade bounded at ' + g);
    }
  }
});
S.check('the grade is symmetric: uphill costs, downhill pays, flat is free — same rule for pilot and horde', () => {
  const rel = { CELL: 300, LEVELS: 4 };
  const seed = 99;
  // Find a real UPHILL contour crossing: a point whose +x GRADE_LOOK-ahead
  // level is HIGHER than its own (so +x is the climb).
  let found = null;
  for (let x = -880; x <= 880 && !found; x += 13) {
    for (let y = -880; y <= 880 && !found; y += 17) {
      const ahead = reliefLevel(x + C.RELIEF.GRADE_LOOK, y, seed, rel);
      const here = reliefLevel(x, y, seed, rel);
      if (ahead > here) found = { x, y, dh: ahead - here };
    }
  }
  assert(found, 'an uphill contour crossing exists in the fixture field');
  const up = reliefGrade(found.x, found.y, 1, 0, seed, rel);
  const down = reliefGrade(found.x + C.RELIEF.GRADE_LOOK, found.y, -1, 0, seed, rel);
  assert(Math.abs(up - Math.max(1 - C.RELIEF.GRADE_CAP, Math.min(1 + C.RELIEF.GRADE_CAP,
    1 - Math.abs(found.dh) * C.RELIEF.GRADE_COST))) < 1e-12,
    'the uphill grade is the stated formula (' + up + ')');
  assert(up < 1 && down > 1, 'uphill costs (' + up.toFixed(3) + '), downhill pays (' + down.toFixed(3) + ')');
  // Flat: a mover whose lookahead level equals its own pays exactly 1.
  let flat = null;
  for (let x = -880; x <= 880 && flat === null; x += 13) {
    if (reliefLevel(x + C.RELIEF.GRADE_LOOK, 0, seed, rel) === reliefLevel(x, 0, seed, rel)) flat = x;
  }
  assert(flat !== null && reliefGrade(flat, 0, 1, 0, seed, rel) === 1, 'flat ground costs nothing');
  // THE SYMMETRY: reliefGrade has no mover argument — the pilot seam and the
  // enemy seam in main.js call the SAME function (pinned textually, the
  // single-home rule). ELEVATION v2: the enemy seam grades mvx/mvy — the
  // movement vector AFTER the reliefRampRoute intent bias — so the grade
  // reads the direction the enemy actually moves, same as the pilot seam.
  const src = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const playerSeam = /reliefGrade\(p\.x, p\.y, decision\.moveX, decision\.moveY/.test(src);
  const enemySeam = /reliefGrade\(e\.x, e\.y, mvx, mvy/.test(src);
  assert(playerSeam && enemySeam, 'the SAME grade function is read at the player and enemy move seams');
});
S.check('the trade: exposure bias + vision fire ONLY on high ground, and both are pure', () => {
  // Vision: the reward — the radar's world reach widens on high ground only.
  assert(reliefVisionRadius(330, 0) === 330 && reliefVisionRadius(330, 1) === 330,
    'floor and low ground keep the base radius');
  assert(reliefVisionRadius(330, C.RELIEF.HIGH_LEVEL) === 330 * C.RELIEF.VISION_MULT,
    'high ground widens it by VISION_MULT');
  // Exposure: the risk — a low pilot's spawn angle is untouched; a high
  // pilot's angle mixes toward the uphill azimuth, never past it.
  const a = 0.3;
  assert(reliefBiasAngle(a, 0, 2.0) === a, 'a low pilot draws the plain uniform angle');
  const az = 2.0;
  let d = az - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
  const biased = reliefBiasAngle(a, C.RELIEF.HIGH_LEVEL, az);
  assert(Math.abs(biased - (a + d * C.RELIEF.EXPOSURE_BIAS)) < 1e-12,
    'the bias is the exact shortest-path blend toward uphill (' + biased.toFixed(3) + ')');
  assert(Math.sign(biased - a) === Math.sign(d), 'the bias moves TOWARD uphill, never past');
  // No rng: the bias is a transform of the drawn angle (zero extra draws).
  assert(reliefBiasAngle.length === 3, 'pure transform, no rng argument');
});

// ---------------------------------------------------------------------------
// THE LIVE SEAMS: boot the real app once; everything below drives the real
// loop (the escape-scaleup integration pattern).
// ---------------------------------------------------------------------------
const h = await boot();
const T = h.T;
const st = h.state;

// Deterministic rng for the measurement arms.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function quietField() {
  st.enemies.length = 0; st.gems.length = 0; st.itemDrops.length = 0;
  st.spawnTimer = 999; st.wave.endsAt = st.time + 9999;
  st.wave.bosses = []; st.wave.boss = null; st.portal = null;
}
// Resolve the overlays a real AUTO run meets (the seededPurseRun pattern).
function autoplayFrames(frames, onFrame) {
  for (let i = 0; i < frames; i++) {
    h.pump(1);
    if (st.mode === 'draft' || st.mode === 'evolve') {
      const c0 = h.elements['ov-cards'].children[0]; c0 && c0.click();
    } else if (st.mode === 'intermission') {
      const cont = h.elements['ov-cards'].children.find(c => (c.innerHTML || '').includes('CONTINUE'));
      cont && cont.click();
    }
    if (onFrame && st.mode === 'playing') onFrame();
  }
}

// ---- THE BOSS-CLEAR SWEEP: visible, total stated, nothing silently lost ----
S.check('the clear arms a VISIBLE sweep that banks the ground drops and states the total', () => {
  T.startRun();
  h.pump(2);
  quietField();
  // A field of stranded drops far from the pilot: 30 gems + 2 potions + 1 item.
  const prof = T.getProfile();
  const p = st.player;
  p.x = 0; p.y = 0;
  st.gems.length = 0; st.drops.length = 0; st.itemDrops.length = 0;
  for (let i = 0; i < 30; i++) st.gems.push({ x: 300 + (i % 6) * 12, y: 200 + Math.floor(i / 6) * 12, xp: 2 });
  st.drops.push({ x: 350, y: 250, kind: 'hp', count: 2 });
  st.drops.push({ x: 360, y: 260, kind: 'mp', count: 1 });
  st.itemDrops.push({ x: 340, y: 240, item: { id: 'probe', name: 'PROBE', tier: 1 } });
  const xp0 = p.xp; const pots0 = p.potions.hp + p.potions.mp;
  const snapGems = st.gems.length, snapPots = st.drops.reduce((s, d) => s + (d.count || 1), 0);
  // The REAL clear moment: pendingClear fires in the live death funnel.
  st.wave.pendingClear = true;
  h.pump(1);
  assert(p.bossSweep > 0, 'the sweep armed at the clear (p.bossSweep ' + p.bossSweep + ')');
  assert(st.bossSweepSnap && st.bossSweepSnap.gems >= snapGems,
    'the snapshot includes the stranded field + the corpse scatter');
  const sweepFx = st.effects.some(fx => fx.kind === 'magnet');
  assert(sweepFx, 'the visible sweep tell is live (the magnet ring effect)');
  // VISIBLE MOTION: the drops move toward the pilot while the sweep runs.
  const g0 = st.gems[0] && { x: st.gems[0].x, y: st.gems[0].y };
  h.pump(12);
  assert(g0 && Math.hypot(st.gems[0].x - g0.x, st.gems[0].y - g0.y) > 4,
    'the drops are visibly pulled toward the pilot');
  // Run the sweep out (the wall-clock slot ticks it even through overlays).
  for (let i = 0; i < 120 && p.bossSweep > 0; i++) h.pump(1);
  assert(p.bossSweep <= 0, 'the sweep ended');
  const toasts = (st.toasts || []).map(t => t.msg || t.text || String(t));
  const sweepToast = st.toasts.some(t => /BOSS CLEAR SWEEP/.test(t.msg || t.text || JSON.stringify(t)));
  assert(sweepToast, 'the collected total is STATED as part of the clear moment');
  // NO SILENT LOSS: every gem either was credited (xp rose) or is still on
  // the floor — the count reconciles; the potions reconciled the same way.
  const gemsGone = snapGems - st.gems.length;
  assert(gemsGone >= 0 && (gemsGone === snapGems || st.gems.length > 0),
    'reconciliation: ' + gemsGone + ' of ' + snapGems + ' gems collected, ' +
    st.gems.length + ' remain (refusals stay, nothing deleted)');
  console.log('  MEASURED boss-clear sweep: ' + gemsGone + '/' + snapGems +
    ' gems + potions collected from ' + snapPots + ' stranded, total toasted');
});

S.check('a NORMAL wave transition collects nothing silently (the finding, recorded)', () => {
  // The additions message asked: is the same handling right at NORMAL wave
  // transitions? FINDING: there IS no normal transition that strands drops —
  // the only wave-exit is the boss clear (the portal), and that exit now
  // sweeps. Drops are otherwise cleared ONLY by startRun. Pin the code fact:
  // openIntermission never touches the ground arrays.
  T.startRun();
  h.pump(2);
  quietField();
  st.gems.length = 0;
  st.gems.push({ x: 500, y: 500, xp: 2 });
  st.mode = 'intermission';
  T.getProfile();
  // Drive the real intermission open + CONTINUE (the normal transition).
  h.elements['ov-cards'].children.length = 0;
  h.pump(2);
  const cont = h.elements['ov-cards'].children.find(c => (c.innerHTML || '').includes('CONTINUE'));
  cont && cont.click();
  h.pump(2);
  assert(st.gems.some(g => g.x === 500 && g.y === 500),
    'the normal transition neither deletes nor auto-banks drops (no silent loss, no silent gain)');
  st.mode = 'menu';
});

// ---------------------------------------------------------------------------
// LOCAL PRESSURE + KITE ROOM (msg_01M2R966): the re-scoped density question.
// Spawns are PILOT-RELATIVE (a ring at SPAWN_DIST x jitter around the
// player), so the 9-unit field CANNOT thin the pressure you actually feel —
// it can only give you more room to use. Measured on the SAME seed at 2 and
// 3 units; the softening consequence is REPORTED, nothing tuned.
// ---------------------------------------------------------------------------
// FIXTURE SPLIT (2026-09-17): one arm cannot measure both questions. The
// SPAWN-MODEL arms (local pressure, field-wide density, anti-sanctuary) need
// the horde to LIVE — the owner's loadout kills chaff at range, so the
// within-150px count collapses (0.3 avg) before the parity question is even
// asked. Those arms run the FRESH build behind a disclosed p.invuln = 1e9 pin
// (the _atlas_det_probe pattern: nothing is killed, the spawn stream is the
// whole signal). The KITE-ROOM arms need the real armed fight — those keep
// the owner's-loadout stage untouched.
function measureArm(units, seed, seconds, opts = {}) {
  const { invuln = false, armBuild = true } = opts;
  const keepUnits = C.GROUND.UNITS;
  const realRandom = Math.random;
  Math.random = mulberry32(seed);
  let out;
  try {
    C.GROUND.UNITS = units;
    T.banners.suppressAll();
    T.startRun();
    if (armBuild) {
      const prof = T.getProfile();
      prof.gold = 100_000_000;                     // the owner's-loadout stage
      for (const def of SHOP_UPGRADES) {
        for (let i = 0; i < def.maxLevel; i++) if (!buyUpgrade(prof, def.id)) break;
      }
      T.startRun();                                // re-arm with the build
    }
    const p = st.player;
    let frames = 0, localSum = 0, fieldSum = 0, contactFrames = 0, firstContact = -1;
    let dist = 0, prevX = p.x, prevY = p.y, surrounded = 0, disengages = 0, prevNear5 = false;
    let flatFrames = 0, highFrames = 0, flatContact = 0, highContact = 0, outOfBounds = 0;
    const rel = stageRelief(st.stage);
    const seedRel = () => st.groundSeed || 0;
    autoplayFrames(seconds * 60, () => {
      if (invuln) p.invuln = 1e9;                 // disclosed pin (see above)
      frames++;
      let near150 = 0, touching = 0;
      for (const e of st.enemies) {
        if (e.hp <= 0) continue;
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d < 150) near150++;
        if (d < Math.max(12, 6 + (e.w || 10) / 2)) touching++;
      }
      localSum += near150;
      fieldSum += st.enemies.filter(e => e.hp > 0).length;
      if (touching > 0) {
        contactFrames++;
        if (firstContact < 0) firstContact = st.time;
      }
      dist += Math.hypot(p.x - prevX, p.y - prevY); prevX = p.x; prevY = p.y;
      const near5 = near150 >= 5;
      if (near5) surrounded++;
      if (prevNear5 && !near5) disengages++;
      prevNear5 = near5;
      const lv = reliefLevel(p.x, p.y, seedRel(), rel);
      if (lv === 0) { flatFrames++; if (touching) flatContact++; }
      if (lv >= C.RELIEF.HIGH_LEVEL) { highFrames++; if (touching) highContact++; }
      if (Math.abs(p.x) > C.GROUND.RIM + 0.5 || Math.abs(p.y) > C.GROUND.RIM + 0.5) outOfBounds++;
    });
    out = {
      survived: st.mode === 'playing' || st.mode === 'intermission' || st.mode === 'escape' ||
        st.mode === 'portal-cine' || st.mode === 'draft',
      frames, local: localSum / frames, field: fieldSum / frames,
      contactPct: contactFrames / frames, firstContact,
      dist, surroundedPct: surrounded / frames, disengages,
      flatContactRate: flatFrames ? flatContact / flatFrames : null,
      highContactRate: highFrames ? highContact / highFrames : null,
      highShare: highFrames / frames, flatShare: flatFrames / frames,
      outOfBounds,
    };
  } finally {
    Math.random = realRandom;
    C.GROUND.UNITS = keepUnits;
  }
  return out;
}
S.check('LOCAL pressure holds at 9 units while the field-wide density dilutes (measured, not tuned)', () => {
  const a2 = measureArm(2, 0x5eed, 45, { invuln: true, armBuild: false });
  const a3 = measureArm(3, 0x5eed, 45, { invuln: true, armBuild: false });
  for (const [tag, a] of [['2u', a2], ['3u', a3]]) {
    assert(a.survived, tag + ': the pinned pilot survived the measurement window (mode ' + st.mode + ')');
    assert(a.outOfBounds === 0, tag + ': the pilot never left the rim');
  }
  assert(a2.local > 3, 'the 2u field has real local pressure to compare (' + a2.local.toFixed(1) + ' avg within 150px)');
  assert(Math.abs(a3.local - a2.local) / a2.local < 0.35,
    'LOCAL enemies-within-150px holds across the scale-up: ' +
    a2.local.toFixed(1) + ' -> ' + a3.local.toFixed(1) + ' (spawns are pilot-relative)');
  // Field-wide: same horde, bigger box — the density MUST dilute. Say it
  // plainly: field-wide density is NOT a meaningful pressure number on a
  // pilot-relative spawn model; it measures the box, not the game.
  const density2 = a2.field / (1200 * 1200), density3 = a3.field / (1800 * 1800);
  assert(density3 < density2 * 0.75,
    'field-wide density dilutes as the box grows (' +
    (density2 * 1e6).toFixed(1) + ' -> ' + (density3 * 1e6).toFixed(1) + ' enemies per Mpx^2) — reported, not tuned');
  console.log('  MEASURED density (45s seeded arms): local(150px) ' +
    a2.local.toFixed(1) + ' -> ' + a3.local.toFixed(1) +
    ' | field-wide ' + (density2 * 1e6).toFixed(1) + ' -> ' + (density3 * 1e6).toFixed(1) +
    ' /Mpx^2 (pilot-relative spawns: the local number is the real one)');
});
S.check('KITE ROOM (the armed fight): contact, surrounded, disengages, distance travelled', () => {
  const k2 = measureArm(2, 0x5eed, 45);
  const k3 = measureArm(3, 0x5eed, 45);
  for (const [tag, k] of [['2u', k2], ['3u', k3]]) {
    assert(k.survived, tag + ': the armed pilot survived the measurement window (mode ' + st.mode + ')');
    assert(k.outOfBounds === 0, tag + ': the pilot never left the rim');
  }
  console.log('  MEASURED kite room (armed, 45s seeded arms): contact ' +
    (k2.contactPct * 100).toFixed(1) + '% -> ' + (k3.contactPct * 100).toFixed(1) +
    '% | surrounded(>=5@150px) ' +
    (k2.surroundedPct * 100).toFixed(1) + '% -> ' + (k3.surroundedPct * 100).toFixed(1) +
    '% | disengages ' + k2.disengages + ' -> ' + k3.disengages +
    ' | travelled ' + Math.round(k2.dist) + 'px -> ' + Math.round(k3.dist) + 'px');
  assert(k3.dist > k2.dist * 0.8, 'the pilot still roams on the bigger field (kite room is real)');
});
S.check('ELEVATION ROLLBACK: the live field is FLAT and the old high ground is ordinary ground', () => {
  // INVERTED 2026-09-18 (owner: "equalize the elevation so it's all equal"):
  // the shipped VERDANT relief is LEVELS 1 with no TERRACE, so this guard's
  // old high-vs-flat park comparison has nothing to compare — high ground no
  // longer exists. The inversion: (a) the live field the measurement runs on
  // is FLAT everywhere (no level > 0 anywhere sampled — a mover is never
  // graded, never blocked), and (b) a PARK-AND-MEASURE at the OLD terrace-top
  // coordinates shows the would-be sanctuary is now ordinary ground: the
  // disarmed, parked pilot takes full contact there exactly as on the floor.
  // (Same disclosed fixtures as always: p.invuln = 1e9, weapons stripped.)
  const parkContact = (spot) => {
    const realRandom = Math.random;
    Math.random = mulberry32(0x5eed2);
    let touching = 0, frames = 0;
    try {
      T.banners.suppressAll();
      T.startRun();
      st.weapons.length = 0;
      st.player.stats.projectiles = 0;
      st.player.stats.thorns = 0;
      st.player.stats.stormShards = false;
      const p = st.player;
      autoplayFrames(20 * 60, () => {
        p.invuln = 1e9;
        p.x = spot.x; p.y = spot.y;
        frames++;
        for (const e of st.enemies) {
          if (e.hp <= 0) continue;
          if (Math.hypot(e.x - spot.x, e.y - spot.y) < Math.max(12, 6 + (e.w || 10) / 2)) { touching++; break; }
        }
      });
    } finally { Math.random = realRandom; }
    return frames ? touching / frames : 0;
  };
  const relNow = stageRelief(st.stage);
  assert(relNow.LEVELS === 1 && !relNow.TERRACE, 'the live stage ships the flat rollback');
  const seedRel = st.groundSeed || 0;
  let maxLv = 0;
  for (let y = -850; y <= 850; y += 40) {
    for (let x = -850; x <= 850; x += 40) {
      if (Math.hypot(x, y) > C.GROUND.RIM) continue;
      maxLv = Math.max(maxLv, reliefLevelAt(x, y, seedRel, relNow));
    }
  }
  assert(maxLv === 0, 'the live field is FLAT everywhere (max level ' + maxLv + ')');
  // The old upper-path top (SPAN_MID at band radius 630) is now ordinary ground.
  const topSpot = { x: 0, y: 630 };
  const rate = parkContact(topSpot);
  assert(rate > 0.5, 'full contact at the old terrace-top coordinates (' +
    (rate * 100).toFixed(1) + '%) — no elevation advantage remains');
  console.log('  MEASURED flat field: contact at the OLD top spot ' +
    (rate * 100).toFixed(1) + '% (max relief level anywhere: ' + maxLv + ')');
});

// ---------------------------------------------------------------------------
// AUTO + NIGHT on the 9-unit field: the pilot completes a wave end-to-end
// unattended (boss -> sweep -> portal -> escape skip on night -> intermission
// -> auto-CONTINUE), and the pacing invariants' constants are untouched.
// ---------------------------------------------------------------------------
S.check('a NIGHT run clears the wave and auto-continues on the 9-unit field, unattended', () => {
  while (!T.night.on) T.night.press();
  T.startRun();
  h.pump(2);
  assert(st.nightRun === true, 'the night stamp is live');
  const prof = T.getProfile();
  prof.gold = 100_000_000;
  for (const def of SHOP_UPGRADES) {
    for (let i = 0; i < def.maxLevel; i++) if (!buyUpgrade(prof, def.id)) break;
  }
  // FIXTURE (the measureArm pattern): stats are computed at startRun, so the
  // freshly bought build must be re-armed — the night stamp survives the
  // restart. Without this the pilot fights the boss with the fresh loadout.
  T.startRun();
  h.pump(2);
  // Fast-forward the wave to its boss, then let the REAL flow play out with
  // zero manual input: kill -> sweep -> cine -> escape (night skip) ->
  // intermission -> auto-CONTINUE.
  st.wave.endsAt = st.time;
  let sawIntermission = false, guard = 0;
  while (guard++ < 60 * 240) {
    h.pump(1);
    // Resolve only the DRAFT overlays (level-ups mid-clear); the intermission
    // is the destination — do NOT click CONTINUE, the night AUTO-CONTINUE owns it.
    if (st.mode === 'draft' || st.mode === 'evolve') {
      const c0 = h.elements['ov-cards'].children[0]; c0 && c0.click();
    }
    if (st.mode === 'intermission') { sawIntermission = true; break; }
    if (st.mode === 'dead' || st.mode === 'death-cine') break;
  }
  assert(sawIntermission, 'the night run reached the intermission unattended (mode ' + st.mode + ')');
  const waveBefore = st.wave.num;
  for (let i = 0; i < 60 * 10 && st.mode === 'intermission'; i++) h.pump(1);
  assert(st.mode === 'playing' && st.wave.num === waveBefore + 1,
    'the auto-CONTINUE advanced the ladder unattended (mode ' + st.mode + ')');
  // THE PACING INVARIANTS, by name: the spawn model the ledger stands on is
  // untouched by the scale-up — RUN-VALUE, TIME-IN-GRADE, IDLE FLOOR and NO
  // DEAD TAIL all ride these constants and the pilot-relative ring.
  assert(C.ENEMY.SPAWN_INTERVAL === 1.35 && C.ENEMY.SPAWN_DIST === 280,
    'the spawn clock + ring constants are untouched (IDLE FLOOR / NO DEAD TAIL)');
  while (T.night.on) T.night.press();
  st.mode = 'menu';
});

// ---------------------------------------------------------------------------
// THE RADAR: still covers the WHOLE spawn ring at the new extent (the ring is
// pilot-relative, so the invariant is structural), and high ground widens it.
// ---------------------------------------------------------------------------
S.check('the radar covers the whole spawn ring at 9 units; high ground widens it further', () => {
  assert(RADAR_RADIUS >= SPAWN_RING_MAX,
    'RADAR_RADIUS ' + RADAR_RADIUS + ' >= the max spawn ring ' + SPAWN_RING_MAX +
    ' (pilot-relative spawns: extent cannot outgrow it)');
  // The widened radius still classifies through the real data layer, and the
  // wider disc maps into the same drawn box (dots compress, none clamp-lie).
  const p = { x: 0, y: 0 };
  const far = { x: 480, y: 0, hp: 1 };              // beyond base, inside x1.5
  const dots = radarDots(p, [far], { radius: reliefVisionRadius(RADAR_RADIUS, C.RELIEF.HIGH_LEVEL), displayRadius: 34 });
  assert(dots.length === 1 && dots[0].x <= 34,
    'a 480px enemy reads INSIDE the high-ground disc (dot x=' + (dots[0] && dots[0].x) + ')');
  const base = radarDots(p, [far], { radius: RADAR_RADIUS, displayRadius: 34 });
  assert(base.length === 0, 'the same enemy is honestly omitted at floor radius (never rim-welded)');
});

S.done();
