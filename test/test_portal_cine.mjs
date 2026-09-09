// HORDES — headless tests for src/portal_cine.js (node, no DOM).
// WAVE-9B/1: playback slowed to CINE_SPEED=0.7 — PHASES/CINE_DURATION are
// WALL-CLOCK ms (scene-ms / 0.7); every beat below samples the stretched
// equivalent of the original scene time.
// Run: node test/test_portal_cine.mjs
import {
  render, isDone, phaseAt, PHASES, CINE_DURATION, CINE_SPEED, CINE_TEST,
} from '../src/portal_cine.js';

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
        return (x, y, w, h) => { calls.push({ style: t.fillStyle, x, y, w, h }); };
      }
      return t[prop];
    },
    set(t, prop, v) { t[prop] = v; return true; },
  });
  return { ctx, calls };
}

const countStyle = (calls, style) => calls.filter(c => c.style === style).length;
const C = CINE_TEST.COLORS;

// Render once and count rects of one color.
function countAt(t, style) {
  const { ctx, calls } = makeCtx();
  render(ctx, t);
  return countStyle(calls, style);
}

console.log('TIMELINE (70% speed):');
{
  ok(CINE_SPEED === 0.7, 'CINE_SPEED is 0.7');
  ok(CINE_DURATION === Math.round(3800 / 0.7) && CINE_DURATION === 5429,
    `CINE_DURATION is ${CINE_DURATION}ms (3800 scene-ms / 0.7)`);
  ok(PHASES.KILL[0] === 0 && PHASES.KILL[1] === 1714, 'KILL: 0-1714');
  ok(PHASES.WALK[0] === 1714 && PHASES.WALK[1] === 2857, 'WALK: 1714-2857');
  ok(PHASES.DISSOLVE[0] === 2857 && PHASES.DISSOLVE[1] === 4571, 'DISSOLVE: 2857-4571');
  ok(PHASES.FADE[0] === 4571 && PHASES.FADE[1] === 5429, 'FADE: 4571-5429');
  ok(CINE_TEST.SPEED === CINE_SPEED, 'test seam exposes the speed scalar');
  ok(phaseAt(-50) === 'KILL' && phaseAt(850) === 'KILL' && phaseAt(2100) === 'WALK' &&
     phaseAt(3600) === 'DISSOLVE' && phaseAt(4900) === 'FADE' && phaseAt(99999) === 'DONE',
    'phaseAt walks the stretched beats');
}

console.log('KILL (boss falls):');
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
    const { ctx, calls } = makeCtx();
    render(ctx, 530);
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
  ok(pileFull > pileMid, `pile grows 1286->2000ms (${pileMid} -> ${pileFull})`);
  ok(countAt(3714, C.PILE) === pileFull, 'pile persists into DISSOLVE');
  // Boss body pixels vanish as it collapses (hide color drops hard).
  ok(countAt(2714, C.BOSS_HIDE) < hideEarly,
    'boss body pixels collapsed away by WALK');
}

console.log('WALK (portal fades in):');
{
  const ring = (t) => {
    const { ctx, calls } = makeCtx();
    render(ctx, t);
    const rs = calls.filter(c => typeof c.style === 'string' &&
      /^rgba\(255,(154|213),/.test(c.style));
    return rs;
  };
  const early = ring(1786), mid = ring(2286), late = ring(2786);
  ok(early.length > 0, `portal ring dots present at t=1786 (${early.length})`);
  ok(late.length > early.length, `ring dots reveal 1786->2786 (${early.length} -> ${late.length})`);
  const alpha = (s) => Number(s.match(/,\s*([\d.]+)\)$/)[1]);
  ok(alpha(mid[0].style) > alpha(early[0].style),
    `ring alpha rises as it fades in (${alpha(early[0].style)} -> ${alpha(mid[0].style)})`);
  ok(countAt(1643, C.HERO_BODY) > 0 && countAt(2714, C.HERO_BODY) > 0,
    'hero walking (visible across WALK)');
}

console.log('DISSOLVE (hero -> rising pixels):');
{
  // Hero pixel count strictly drops across the phase (dropout + shrink).
  // 2929/3714/4500 wall = 2050/2600/3150 scene.
  const c1 = countAt(2929, C.HERO_BODY);
  const c2 = countAt(3714, C.HERO_BODY);
  const c3 = countAt(4500, C.HERO_BODY);
  ok(c1 > c2 && c2 > c3,
    `hero pixel count drops across DISSOLVE (${c1} -> ${c2} -> ${c3})`);
  ok(countAt(4570, C.HERO_BODY) === 0 || countAt(4570, C.HERO_BODY) < c1,
    'hero nearly gone by end of DISSOLVE');
  // Pixel SIZE also shrinks (8px zoom -> smaller as he dissolves).
  const heroRects = (t) => {
    const { ctx, calls } = makeCtx();
    render(ctx, t);
    return calls.filter(c => c.style === C.HERO_BODY);
  };
  const maxW = (rs) => Math.max(...rs.map(r => r.w));
  ok(heroRects(2929).length > 0 && heroRects(4500).length > 0 &&
     maxW(heroRects(4500)) < maxW(heroRects(2929)),
    `hero pixels shrink (${maxW(heroRects(2929))}px -> ${maxW(heroRects(4500))}px)`);
  // Rising dissolve motes take over (count grows with the phase).
  const riseEarly = countAt(3000, C.RISE);
  const riseLate = countAt(4429, C.RISE);
  ok(riseLate > riseEarly, `rising motes grow through DISSOLVE (${riseEarly} -> ${riseLate})`);
  // Portal core brightens (glow rects appear/grow).
  ok(countAt(4429, C.GLOW) > countAt(3000, C.GLOW), 'portal core glow brightens');
}

console.log('FADE (white-out -> black):');
{
  {
    const { ctx, calls } = makeCtx();
    render(ctx, 4786);   // 3350 scene: mid white-out
    const white = calls.find(c => typeof c.style === 'string' &&
      c.style.startsWith('rgba(255,255,255,') && c.w === 480 && c.h === 300);
    ok(!!white, 'white-out covers the screen at t=4786');
  }
  {
    const { ctx, calls } = makeCtx();
    render(ctx, 5214);   // 3650 scene: black fade rising
    const black = calls.find(c => typeof c.style === 'string' &&
      c.style.startsWith('rgba(0,0,0,') && c.w === 480 && c.h === 300);
    ok(!!black, 'black fade covers the screen at t=5214');
  }
  {
    const { ctx, calls } = makeCtx();
    render(ctx, CINE_DURATION + 500);
    const black = calls.filter(c => c.style === '#000000' && c.w === 480 && c.h === 300);
    ok(black.length === 1, 'fully black at t > CINE_DURATION');
  }
}

console.log('ISDONE:');
{
  ok(isDone(-100) === false && isDone(0) === false && isDone(5428) === false,
    'isDone false before CINE_DURATION');
  ok(isDone(5429) === true && isDone(20000) === true,
    'isDone flips at CINE_DURATION and stays true');
}

console.log('DETERMINISM:');
{
  // Same t -> byte-identical fillRect stream (pure function, no randomness).
  const stream = (t) => {
    const { ctx, calls } = makeCtx();
    render(ctx, t);
    return calls.map(c => `${c.style}|${c.x},${c.y},${c.w},${c.h}`).join(';');
  };
  for (const t of [0, 857, 2143, 3901, 4786, 5429]) {
    ok(stream(t) === stream(t), `t=${t}: identical fillRect stream across renders`);
  }
  ok(stream(857) !== stream(3714), 'different t produces different scenes');
}

console.log('NO-DOM / SKIP-SAFETY:');
{
  // fillRect is the ONLY ctx method touched; rendering outside [0, duration]
  // must never throw (skip mid-cinematic, over-run hold frame).
  for (const t of [-500, -1, 0, 1763, 5929, 1e9]) {
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
