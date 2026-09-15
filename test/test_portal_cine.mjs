// HORDES — headless tests for src/portal_cine.js (node, no DOM).
// WAVE-9B/1: playback slowed to CINE_SPEED=0.7 — PHASES/CINE_DURATION are
// WALL-CLOCK ms (scene-ms / 0.7); every beat below samples the stretched
// equivalent of the scene time.
// G16 (2026-09-15): the timeline gained PAUSE (the hero HELD at the gate,
// >=600 scene-ms, rect frozen, one 2-frame idle tell) and LINGER (the portal
// ALONE, animated, >=500 wall-ms) and the dotted ring became the DETAILED
// portal art (src/art/portal.js). Wall times below are RETARGETED to the new
// 4800 scene-ms / 6857 wall-ms map — same assertions, new beats; nothing
// weakened (the old 3800/5429 pins are replaced by the exact new pins).
// Run: node test/test_portal_cine.mjs
import {
  render, isDone, phaseAt, PHASES, CINE_DURATION, CINE_SPEED, CINE_TEST,
} from '../src/portal_cine.js';
import { PORTAL_CUES } from '../src/audio.js';

let failed = 0;
function ok(cond, msg) {
  if (cond) { console.log('  PASS ' + msg); }
  else { failed++; console.error('  FAIL ' + msg); }
}

// ---------- stub ctx: Proxy recording every fillRect (with active style) ----
function makeCtx() {
  const calls = [];
  const target = {};
  const ctx = new Proxy(target, {
    get(t, prop) {
      if (prop === 'fillRect') {
        return (x, y, w, h) => { calls.push({ style: t.fillStyle, alpha: t.globalAlpha, x, y, w, h }); };
      }
      return t[prop];
    },
    set(t, prop, v) { t[prop] = v; return true; },
  });
  return { ctx, calls };
}

const countStyle = (calls, style) => calls.filter(c => c.style === style).length;
const C = CINE_TEST.COLORS;
const PORTAL_COLORS = Object.values(CINE_TEST.PORTAL.PALETTE);
const portalRects = (calls) => calls.filter(c => PORTAL_COLORS.includes(c.style));

// Render once and count rects of one color.
function countAt(t, style) {
  const { ctx, calls } = makeCtx();
  render(ctx, t);
  return countStyle(calls, style);
}
function renderAt(t) {
  const { ctx, calls } = makeCtx();
  render(ctx, t);
  return calls;
}

console.log('TIMELINE (70% speed, G16 six beats):');
{
  ok(CINE_SPEED === 0.7, 'CINE_SPEED is 0.7');
  // The exported arithmetic must hold exactly on the NEW design duration.
  ok(CINE_DURATION === Math.round(CINE_TEST.SCENE.FADE[1] / CINE_SPEED) && CINE_DURATION === 6857,
    `CINE_DURATION is ${CINE_DURATION}ms (4800 scene-ms / 0.7)`);
  ok(CINE_DURATION <= 7000, 'CINE_DURATION stays under the 7000ms smoke-pump budget');
  // PHASES monotone, non-overlapping, covering [0, CINE_DURATION).
  const names = Object.keys(PHASES);
  let mono = true, cover = PHASes_cover();
  function PHASes_cover() {
    let prev = 0;
    for (const n of names) {
      const [a, b] = PHASES[n];
      if (a !== prev || b <= a) { mono = false; return false; }
      prev = b;
    }
    return prev === CINE_DURATION;
  }
  ok(mono && cover,
    `PHASES monotone + non-overlapping + covering [0,${CINE_DURATION}): ` +
    names.map(n => `${n} ${PHASES[n][0]}-${PHASES[n][1]}`).join(' '));
  ok(PHASES.KILL[0] === 0 && PHASES.KILL[1] === 1714, 'KILL: 0-1714');
  ok(PHASES.WALK[0] === 1714 && PHASES.WALK[1] === 2857, 'WALK: 1714-2857');
  ok(PHASES.PAUSE[0] === 2857 && PHASES.PAUSE[1] === 3857, 'PAUSE: 2857-3857');
  ok(PHASES.DISSOLVE[0] === 3857 && PHASES.DISSOLVE[1] === 5286, 'DISSOLVE: 3857-5286');
  ok(PHASES.LINGER[0] === 5286 && PHASES.LINGER[1] === 6143, 'LINGER: 5286-6143');
  ok(PHASES.FADE[0] === 6143 && PHASES.FADE[1] === 6857, 'FADE: 6143-6857');
  ok(CINE_TEST.SPEED === CINE_SPEED, 'test seam exposes the speed scalar');
  ok(phaseAt(-50) === 'KILL' && phaseAt(850) === 'KILL' && phaseAt(2100) === 'WALK' &&
     phaseAt(3300) === 'PAUSE' && phaseAt(4500) === 'DISSOLVE' && phaseAt(5700) === 'LINGER' &&
     phaseAt(6500) === 'FADE' && phaseAt(99999) === 'DONE',
    'phaseAt walks the six stretched beats');
}

console.log('KILL (boss falls — content unchanged):');
{
  // Zoomed boss pixels on screen through the strike (flash overlays, never
  // replaces, the grid). 429/857 wall = 300/600 scene.
  const hideEarly = countAt(429, C.BOSS_HIDE);
  const hideLate = countAt(857, C.BOSS_HIDE);
  ok(hideEarly > 0 && hideLate > 0,
    `boss pixels present in KILL (t=429: ${hideEarly}, t=857: ${hideLate} rects)`);
  ok(countAt(857, C.HERO_BODY) > 0, 'hero pixels present in KILL');

  // Hit-flash: a translucent white rect over the boss box on flash frames
  // (530 wall = 371 scene; floor(371/130)%3 === 2 -> flash frame).
  {
    const calls = renderAt(530);
    const flash = calls.find(c => c.style === C.FLASH && c.w < 480);
    ok(!!flash, 'boss hit-flash overlay on a flash frame (t=530)');
  }
  // Slash leads into the blow; impact burst follows it.
  ok(countAt(714, C.SLASH) > 0, 'killing slash visible at t=714 (500 scene)');
  ok(countAt(1286, C.SLASH) === 0, 'slash gone after the blow window');

  // Collapse: dust pile grows as the boss folds down (1286/2000 wall = 900/1400 scene).
  const pileMid = countAt(1286, C.PILE);
  const pileFull = countAt(2000, C.PILE);
  ok(pileMid > 0, `pixel pile forming at t=1286 (${pileMid} rects)`);
  ok(pileFull > pileMid, `pile grows 1286->1714ms (${pileMid} -> ${pileFull})`);
  ok(countAt(4000, C.PILE) === pileFull, 'pile persists into DISSOLVE');
  // Boss body pixels vanish as it collapses (hide color drops hard).
  ok(countAt(2714, C.BOSS_HIDE) < hideEarly,
    'boss body pixels collapsed away by WALK');
}

console.log('WALK (the DETAILED portal fades in; hero approaches):');
{
  // 1786/2786 wall = 1250/1950 scene: alpha ramps off the wall clock.
  const early = renderAt(1786).filter(c => PORTAL_COLORS.includes(c.style));
  const mid = renderAt(2286).filter(c => PORTAL_COLORS.includes(c.style));
  const late = renderAt(2786).filter(c => PORTAL_COLORS.includes(c.style));
  ok(early.length > 0, `detailed portal pixels present at t=1786 (${early.length} rects)`);
  ok(late.length > 4 * 28,
    `portal rect count ${late.length} beats the old 28-dot ring by >4x (needs >112)`);
  const aEarly = early[0].alpha, aMid = mid[0].alpha, aLate = late[0].alpha;
  ok(aEarly !== undefined && aLate > aEarly,
    `portal alpha ramps in (${aEarly} -> ${aMid} -> ${aLate})`);
  // The vortex really is the art's rotating frames: two wall times one
  // VORTEX_FRAME_MS apart draw DIFFERENT rect streams inside the gate.
  const f1 = renderAt(2400).filter(c => PORTAL_COLORS.includes(c.style));
  const f2 = renderAt(2400 + CINE_TEST.PORTAL.FRAME_MS).filter(c => PORTAL_COLORS.includes(c.style));
  const sig = (rs) => rs.map(r => `${r.x},${r.y}`).join(';');
  ok(sig(f1) !== sig(f2),
    `vortex rotates (frame streams differ ${CINE_TEST.PORTAL.FRAME_MS}ms apart)`);
  ok(countAt(1800, C.HERO_BODY) > 0 && countAt(2714, C.HERO_BODY) > 0,
    'hero walking (visible across WALK)');
}

console.log('PAUSE (G16 NEW — the hero HOLDS at the threshold):');
{
  // The beat exists and is long enough: >=600 scene-ms.
  const scenePause = (PHASES.PAUSE[1] - PHASES.PAUSE[0]) * CINE_SPEED;
  ok(scenePause >= 600,
    `PAUSE window is ${Math.round(scenePause)} scene-ms (>= 600)`);
  // The hero's rect trace is BYTE-IDENTICAL at >=3 sampled times inside one
  // tell half-cycle (3000/3100/3200 wall = 2100/2170/2240 scene, all inside
  // scene [2080,2340) — the SAME tell frame): not one pixel moves.
  const heroSig = (t) => {
    const calls = renderAt(t);
    const heroPal = ['#ffe9a8', '#e8b04a', '#7a4a1e', '#3a6fd8'];
    return calls.filter(c => heroPal.includes(c.style))
      .map(c => `${c.style}|${c.x},${c.y},${c.w},${c.h}`).join(';');
  };
  const s1 = heroSig(3000), s2 = heroSig(3100), s3 = heroSig(3200);
  ok(s1.length > 0 && s1 === s2 && s2 === s3,
    `hero rect trace BYTE-IDENTICAL at 3 sampled times in PAUSE (${s1.length} chars)`);
  // ...and the rect never moves across the WHOLE window (every hero rect
  // starts at the same left edge).
  let allSameX = true;
  const x0 = Math.min(...renderAt(3300).filter(c => c.style === C.HERO_BODY).map(r => r.x));
  for (let t = PHASES.PAUSE[0] + 20; t < PHASES.PAUSE[1] - 20; t += 50) {
    const rects = renderAt(t).filter(c => c.style === C.HERO_BODY);
    if (rects.length === 0 || Math.min(...rects.map(r => r.x)) !== x0) { allSameX = false; break; }
  }
  ok(allSameX, `hero left edge frozen at x=${x0} across the whole PAUSE window`);
  // ONE 2-frame idle tell: a single extra hero-palette rect at the leading
  // edge, present on one tell frame, gone on the next.
  const tellOn = renderAt(3100).filter(c => c.style === C.TELL);
  const tellOff = renderAt(3572);   // scene 2500: floor(2500/260)%2 === 1 -> off
  const tellRect = tellOn.find(r => r.x === CINE_TEST.PAUSE_X + 96 && r.y === 136 + 40);
  ok(!!tellRect, 'idle tell present on a tell frame (one forward-lean pixel)');
  ok(!tellOff.some(r => r.x === CINE_TEST.PAUSE_X + 96 && r.y === 136 + 40),
    'idle tell absent on the alternate frame (a real 2-frame flicker)');
  // The vortex KEEPS ANIMATING while he holds (portal changes, hero does not).
  const p1 = renderAt(3000).filter(c => PORTAL_COLORS.includes(c.style)).map(r => `${r.x},${r.y}`).join(';');
  const p2 = renderAt(3160).filter(c => PORTAL_COLORS.includes(c.style)).map(r => `${r.x},${r.y}`).join(';');
  ok(p1 !== p2, 'portal animates during the PAUSE (vortex frame advanced)');
}

console.log('DISSOLVE (hero fades INTO the gate; vortex takes him):');
{
  // Hero pixel count strictly drops across the phase (dropout + shrink).
  // 4000/4500/5200 wall = 2800/3150/3640 scene.
  const c1 = countAt(4000, C.HERO_BODY);
  const c2 = countAt(4500, C.HERO_BODY);
  const c3 = countAt(5200, C.HERO_BODY);
  ok(c1 > c2 && c2 > c3,
    `hero pixel count drops across DISSOLVE (${c1} -> ${c2} -> ${c3})`);
  ok(countAt(5280, C.HERO_BODY) === 0,
    'hero fully gone by end of DISSOLVE');
  // Pixel SIZE also shrinks (8px zoom -> smaller as he dissolves).
  const heroRects = (t) => renderAt(t).filter(c => c.style === C.HERO_BODY);
  const maxW = (rs) => Math.max(...rs.map(r => r.w));
  ok(heroRects(4000).length > 0 && heroRects(5180).length > 0 &&
     maxW(heroRects(5180)) < maxW(heroRects(4000)),
    `hero pixels shrink (${maxW(heroRects(4000))}px -> ${maxW(heroRects(5180))}px)`);
  // Rising dissolve motes take over (count grows with the phase).
  const riseEarly = countAt(4200, C.RISE);
  const riseLate = countAt(5100, C.RISE);
  ok(riseLate > riseEarly, `rising motes grow through DISSOLVE (${riseEarly} -> ${riseLate})`);
  // Portal core brightens (glow rects appear/grow).
  ok(countAt(5100, C.GLOW) > countAt(4100, C.GLOW), 'portal core glow brightens');
}

console.log('LINGER (G16 NEW — the portal ALONE, still alive):');
{
  const wallMs = PHASES.LINGER[1] - PHASES.LINGER[0];
  ok(wallMs >= 500, `LINGER window is ${wallMs} wall-ms (>= 500)`);
  ok(countAt(5700, C.HERO_BODY) === 0 && countAt(6000, C.HERO_BODY) === 0,
    'no hero pixels during LINGER (the gate holds the frame alone)');
  // Still ANIMATED, not a still frame: vortex + drifting embers.
  const l1 = renderAt(5700).filter(c => PORTAL_COLORS.includes(c.style)).map(r => `${r.x},${r.y}`).join(';');
  const l2 = renderAt(5850).filter(c => PORTAL_COLORS.includes(c.style)).map(r => `${r.x},${r.y}`).join(';');
  ok(l1 !== l2, 'portal animates through LINGER (vortex frame advanced)');
  // The fade has NOT started yet (no full-screen white before FADE[0]).
  ok(!renderAt(5700).some(c => c.w === 480 && c.h === 300 &&
     typeof c.style === 'string' && c.style.startsWith('rgba(255,255,255,')),
    'white-out waits for FADE — LINGER is its own beat');
}

console.log('FADE (white-out -> black):');
{
  {
    const calls = renderAt(6300);   // 4410 scene: mid white-out
    const white = calls.find(c => typeof c.style === 'string' &&
      c.style.startsWith('rgba(255,255,255,') && c.w === 480 && c.h === 300);
    ok(!!white, 'white-out covers the screen at t=6300');
  }
  {
    const calls = renderAt(6600);   // 4620 scene: black fade rising
    const black = calls.find(c => typeof c.style === 'string' &&
      c.style.startsWith('rgba(0,0,0,') && c.w === 480 && c.h === 300);
    ok(!!black, 'black fade covers the screen at t=6600');
  }
  {
    const calls = renderAt(CINE_DURATION + 500);
    const black = calls.filter(c => c.style === '#000000' && c.w === 480 && c.h === 300);
    ok(black.length === 1, 'fully black at t > CINE_DURATION');
  }
}

console.log('ISDONE (flips exactly once):');
{
  ok(isDone(-100) === false && isDone(0) === false && isDone(6856) === false,
    'isDone false before CINE_DURATION');
  ok(isDone(6857) === true && isDone(20000) === true,
    'isDone flips at CINE_DURATION and stays true');
  let flips = 0, prev = isDone(0);
  for (let t = 1; t <= 8000; t += 7) {
    const now = isDone(t);
    if (now !== prev) { flips++; prev = now; }
  }
  ok(flips === 1, `isDone flips EXACTLY once across [0,8000] (${flips} flips)`);
}

console.log('AUDIO CUES (a silent phase is a defect):');
{
  const missing = Object.keys(PHASES).filter(n => !PORTAL_CUES[n]);
  ok(missing.length === 0,
    `every PHASES name has a PORTAL_CUES entry (${Object.keys(PHASES).join(',')}): missing [${missing}]`);
}

console.log('DETERMINISM + 60/120Hz PARITY:');
{
  // Same t -> byte-identical fillRect stream (pure function, no randomness).
  const stream = (t) => renderAt(t)
    .map(c => `${c.style}|${c.x},${c.y},${c.w},${c.h}`).join(';');
  for (const t of [0, 857, 2143, 3300, 4700, 5800, 6857]) {
    ok(stream(t) === stream(t), `t=${t}: identical fillRect stream across renders`);
  }
  ok(stream(857) !== stream(4700), 'different t produces different scenes');
  // PARITY: stepping a 60Hz clock and a 120Hz clock to the SAME elapsed
  // wall time lands on the SAME phase AND the SAME vortex frame (the frame
  // index is floor(t / FRAME_MS), never an accumulated dt).
  const FRAME_MS = CINE_TEST.PORTAL.FRAME_MS;
  let mismatches = 0, checked = 0;
  for (let frames60 = 1; frames60 <= 420; frames60 += 7) {
    const t60 = Math.floor(frames60 * (1000 / 60));       // accumulated 60Hz
    const frames120 = Math.round(t60 / (1000 / 120));     // same elapsed at 120Hz
    const t120 = Math.floor(frames120 * (1000 / 120));
    checked++;
    if (phaseAt(t60) !== phaseAt(t120)) mismatches++;
    if (Math.floor(t60 / FRAME_MS) % 4 !== Math.floor(t120 / FRAME_MS) % 4) mismatches++;
  }
  ok(mismatches === 0,
    `60Hz and 120Hz agree on phase AND vortex frame (${checked} sampled clock points, ${mismatches} mismatches)`);
}

console.log('NO-DOM / SKIP-SAFETY:');
{
  // fillRect + globalAlpha are the ONLY ctx methods touched; rendering
  // outside [0, duration] must never throw (skip mid-cinematic, over-run
  // hold frame).
  for (const t of [-500, -1, 0, 2500, 6857, 1e9]) {
    let calls = null;
    try {
      const made = makeCtx();
      render(made.ctx, t);
      calls = made.calls;
    } catch (e) {
      ok(false, `render(${t}) threw: ${e.message}`);
      continue;
    }
    ok(calls.length > 0 && calls.every(c => Number.isFinite(c.x) && Number.isFinite(c.y) &&
      Number.isFinite(c.w) && Number.isFinite(c.h) && typeof c.style === 'string'),
      `t=${t}: all ${calls.length} fillRect calls well-formed with a style set`);
  }
}

// ---------- Summary ----------
if (failed) { console.error(`\n${failed} FAILURES`); process.exit(1); }
console.log('\nALL PORTAL CINEMATIC TESTS PASSED');
