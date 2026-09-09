// HORDES — headless tests for src/intro.js (node, no DOM).
// Run: node test/test_intro.mjs
import {
  render, isDone, phaseAt, PHASES, INTRO_DURATION, INTRO_TEST,
} from '../src/intro.js';

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

// Render once and count rects of one color.
function countAt(t, style) {
  const { ctx, calls } = makeCtx();
  render(ctx, t);
  return countStyle(calls, style);
}

console.log('TIMELINE:');
{
  ok(INTRO_DURATION === 7000, 'INTRO_DURATION is 7000ms');
  ok(PHASES.CHASE[0] === 0 && PHASES.CHASE[1] === 2500, 'CHASE: 0-2500');
  ok(PHASES.OVERTAKE[0] === 2500 && PHASES.OVERTAKE[1] === 5000, 'OVERTAKE: 2500-5000');
  ok(PHASES.TITLE[0] === 4000 && PHASES.TITLE[1] === 6000, 'TITLE: 4000-6000');
  ok(PHASES.FADE[0] === 6000 && PHASES.FADE[1] === 7000, 'FADE: 6000-7000');
  ok(phaseAt(1000) === 'CHASE' && phaseAt(3000) === 'OVERTAKE' &&
     phaseAt(4500) === 'TITLE' && phaseAt(6500) === 'FADE' &&
     phaseAt(7000) === 'DONE',
     'phaseAt walks the beats (TITLE wins over OVERTAKE overlap)');
}

console.log('SCENE BEATS:');
{
  // Hero: zoomed body pixels visible during the chase (distinctive blue #4).
  const heroEarly = countAt(1000, INTRO_TEST.COLORS.HERO_BODY);
  ok(heroEarly > 0, `hero pixels present at t=1000 (${heroEarly} rects)`);

  // Horde silhouette mass grows between early and mid t (count + front both
  // advance, so on-screen SIL pixels must strictly grow).
  const silEarly = countAt(1000, INTRO_TEST.COLORS.SIL);
  const silMid = countAt(3500, INTRO_TEST.COLORS.SIL);
  ok(silEarly > 0, `horde silhouette present at t=1000 (${silEarly} rects)`);
  ok(silMid > silEarly, `horde pixels grow 1000->3500ms (${silEarly} -> ${silMid})`);

  // Hero swallowed: gone by 4000 (after SWALLOW), was there at 1000.
  ok(countAt(4000, INTRO_TEST.COLORS.HERO_BODY) === 0,
    'hero pixels gone at t=4000 (engulfed)');

  // Title stamps ONLY after its phase start.
  ok(countAt(3999, INTRO_TEST.COLORS.TITLE_GOLD) === 0,
    'no title pixels before TITLE phase (t=3999)');
  const goldLate = countAt(4600, INTRO_TEST.COLORS.TITLE_GOLD);
  ok(goldLate > 0, `title stamped after impact (t=4600, ${goldLate} rects)`);
  // Every letter of HORDES contributes at least one gold rect at rest.
  ok(goldLate >= 6 * 10, `all six letters landed (>=60 rects, got ${goldLate})`);

  // Splatter accents appear with the title (red rects around the stamp).
  // Red is also used by the swallow burst, so compare counts before/after.
  const redBefore = countAt(3999, INTRO_TEST.COLORS.SPLAT);
  const redAfter = countAt(4600, INTRO_TEST.COLORS.SPLAT);
  ok(redAfter > redBefore, `red splatter accents appear with the stamp (${redBefore} -> ${redAfter})`);

  // Fade: a translucent black full-screen rect during FADE, hard black after.
  {
    const { ctx, calls } = makeCtx();
    render(ctx, 6500);
    const fade = calls.find(c => typeof c.style === 'string' &&
      c.style.startsWith('rgba(0,0,0,') && c.w === 480 && c.h === 300);
    ok(!!fade, 'fade overlay covers the screen at t=6500');
  }
  {
    const { ctx, calls } = makeCtx();
    render(ctx, INTRO_DURATION + 500);
    const black = calls.filter(c => c.style === '#000000' && c.w === 480 && c.h === 300);
    ok(black.length === 1, 'fully black at t > INTRO_DURATION');
  }
}

console.log('ISDONE:');
{
  ok(isDone(-100) === false && isDone(0) === false && isDone(6999) === false,
    'isDone false before INTRO_DURATION');
  ok(isDone(7000) === true && isDone(20000) === true,
    'isDone flips at INTRO_DURATION and stays true');
}

console.log('DETERMINISM:');
{
  // Same t -> byte-identical fillRect stream (pure function, no randomness).
  const stream = (t) => {
    const { ctx, calls } = makeCtx();
    render(ctx, t);
    return calls.map(c => `${c.style}|${c.x},${c.y},${c.w},${c.h}`).join(';');
  };
  for (const t of [0, 1000, 2731, 4123, 6500, 7000]) {
    ok(stream(t) === stream(t), `t=${t}: identical fillRect stream across renders`);
  }
  // And distinct times differ (the stream isn't accidentally constant).
  ok(stream(1000) !== stream(4000), 'different t produces different scenes');
}

console.log('NO-DOM CONTRACT:');
{
  // fillRect is the ONLY ctx method the renderer touches (get/set otherwise
  // unused) — the stub Proxy above throws on nothing, so simply verify every
  // recorded call is well-formed.
  const { ctx, calls } = makeCtx();
  render(ctx, 4250);
  ok(calls.length > 0 && calls.every(c => Number.isFinite(c.x) && Number.isFinite(c.y) &&
    Number.isFinite(c.w) && Number.isFinite(c.h) && typeof c.style === 'string'),
    `all ${calls.length} fillRect calls well-formed with a style set`);
}

// ---------- Summary ----------
if (failed) { console.error(`\n${failed} FAILURES`); process.exit(1); }
console.log('\nALL INTRO TESTS PASSED');
