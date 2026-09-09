// HORDES — headless tests for src/portal_cine.js (node, no DOM).
// Run: node test/test_portal_cine.mjs
import {
  render, isDone, phaseAt, PHASES, CINE_DURATION, CINE_TEST,
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

console.log('TIMELINE:');
{
  ok(CINE_DURATION === 3800, 'CINE_DURATION is 3800ms');
  ok(PHASES.KILL[0] === 0 && PHASES.KILL[1] === 1200, 'KILL: 0-1200');
  ok(PHASES.WALK[0] === 1200 && PHASES.WALK[1] === 2000, 'WALK: 1200-2000');
  ok(PHASES.DISSOLVE[0] === 2000 && PHASES.DISSOLVE[1] === 3200, 'DISSOLVE: 2000-3200');
  ok(PHASES.FADE[0] === 3200 && PHASES.FADE[1] === 3800, 'FADE: 3200-3800');
  ok(phaseAt(-50) === 'KILL' && phaseAt(600) === 'KILL' && phaseAt(1500) === 'WALK' &&
     phaseAt(2500) === 'DISSOLVE' && phaseAt(3400) === 'FADE' && phaseAt(99999) === 'DONE',
    'phaseAt walks the beats');
}

console.log('KILL (boss falls):');
{
  // Zoomed boss pixels on screen through the strike (flash overlays, never
  // replaces, the grid).
  const hideEarly = countAt(300, C.BOSS_HIDE);
  const hideLate = countAt(600, C.BOSS_HIDE);
  ok(hideEarly > 0 && hideLate > 0,
    `boss pixels present in KILL (t=300: ${hideEarly}, t=600: ${hideLate} rects)`);
  ok(countAt(600, C.HERO_BODY) > 0, 'hero pixels present in KILL');

  // Hit-flash: a translucent white rect over the boss box on flash frames.
  {
    const { ctx, calls } = makeCtx();
    render(ctx, 260);   // floor(260/130)%3 === 2 -> flash frame
    const flash = calls.find(c => c.style === C.FLASH && c.w < 480);
    ok(!!flash, 'boss hit-flash overlay on a flash frame (t=260)');
  }
  // Slash leads into the blow; impact burst follows it.
  ok(countAt(500, C.SLASH) > 0, 'killing slash visible at t=500');
  ok(countAt(500, C.SLASH) === 0 || countAt(900, C.SLASH) === 0,
    'slash gone after the blow window');

  // Collapse: dust pile grows as the boss folds down.
  const pileMid = countAt(900, C.PILE);
  const pileFull = countAt(1400, C.PILE);
  ok(pileMid > 0, `pixel pile forming at t=900 (${pileMid} rects)`);
  ok(pileFull > pileMid, `pile grows 900->1400ms (${pileMid} -> ${pileFull})`);
  ok(countAt(2600, C.PILE) === pileFull, 'pile persists into DISSOLVE');
  // Boss body pixels vanish as it collapses (hide color drops hard).
  ok(countAt(1900, C.BOSS_HIDE) < hideEarly,
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
  const early = ring(1250), mid = ring(1600), late = ring(1950);
  ok(early.length > 0, `portal ring dots present at t=1250 (${early.length})`);
  ok(late.length > early.length, `ring dots reveal 1250->1950 (${early.length} -> ${late.length})`);
  const alpha = (s) => Number(s.match(/,\s*([\d.]+)\)$/)[1]);
  ok(alpha(mid[0].style) > alpha(early[0].style),
    `ring alpha rises as it fades in (${alpha(early[0].style)} -> ${alpha(mid[0].style)})`);
  ok(countAt(1150, C.HERO_BODY) > 0 && countAt(1900, C.HERO_BODY) > 0,
    'hero walking (visible across WALK)');
}

console.log('DISSOLVE (hero -> rising pixels):');
{
  // Hero pixel count strictly drops across the phase (dropout + shrink).
  const c1 = countAt(2050, C.HERO_BODY);
  const c2 = countAt(2600, C.HERO_BODY);
  const c3 = countAt(3150, C.HERO_BODY);
  ok(c1 > c2 && c2 > c3,
    `hero pixel count drops across DISSOLVE (${c1} -> ${c2} -> ${c3})`);
  ok(countAt(3199, C.HERO_BODY) === 0 || countAt(3199, C.HERO_BODY) < c1,
    'hero nearly gone by end of DISSOLVE');
  // Pixel SIZE also shrinks (8px zoom -> smaller as he dissolves).
  const heroRects = (t) => {
    const { ctx, calls } = makeCtx();
    render(ctx, t);
    return calls.filter(c => c.style === C.HERO_BODY);
  };
  const maxW = (rs) => Math.max(...rs.map(r => r.w));
  ok(heroRects(2050).length > 0 && heroRects(3150).length > 0 &&
     maxW(heroRects(3150)) < maxW(heroRects(2050)),
    `hero pixels shrink (${maxW(heroRects(2050))}px -> ${maxW(heroRects(3150))}px)`);
  // Rising dissolve motes take over (count grows with the phase).
  const riseEarly = countAt(2100, C.RISE);
  const riseLate = countAt(3100, C.RISE);
  ok(riseLate > riseEarly, `rising motes grow through DISSOLVE (${riseEarly} -> ${riseLate})`);
  // Portal core brightens (glow rects appear/grow).
  ok(countAt(3100, C.GLOW) > countAt(2100, C.GLOW), 'portal core glow brightens');
}

console.log('FADE (white-out -> black):');
{
  {
    const { ctx, calls } = makeCtx();
    render(ctx, 3350);
    const white = calls.find(c => typeof c.style === 'string' &&
      c.style.startsWith('rgba(255,255,255,') && c.w === 480 && c.h === 300);
    ok(!!white, 'white-out covers the screen at t=3350');
  }
  {
    const { ctx, calls } = makeCtx();
    render(ctx, 3650);
    const black = calls.find(c => typeof c.style === 'string' &&
      c.style.startsWith('rgba(0,0,0,') && c.w === 480 && c.h === 300);
    ok(!!black, 'black fade covers the screen at t=3650');
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
  ok(isDone(-100) === false && isDone(0) === false && isDone(3799) === false,
    'isDone false before CINE_DURATION');
  ok(isDone(3800) === true && isDone(20000) === true,
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
  for (const t of [0, 600, 1500, 2731, 3350, 3800]) {
    ok(stream(t) === stream(t), `t=${t}: identical fillRect stream across renders`);
  }
  ok(stream(600) !== stream(2600), 'different t produces different scenes');
}

console.log('NO-DOM / SKIP-SAFETY:');
{
  // fillRect is the ONLY ctx method touched; rendering outside [0, duration]
  // must never throw (skip mid-cinematic, over-run hold frame).
  for (const t of [-500, -1, 0, 1234, 3850, 1e9]) {
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
