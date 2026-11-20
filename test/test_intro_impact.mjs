// HORDES — INTRO TITLE STINGER TIMING (agent F, wave-25).
//
// Defect: PHASES.TITLE starts at 4000ms, but the title only LANDS 300ms later
// (titlePose's drop-in; TITLE_IMPACT = TITLE[0] + 300 = 4300ms). hb1 fires the
// TITLE_SLAM stinger off phaseAt(), so the impact sound played ~300ms before
// the stamp it scores — audio.js's own comment already says the stamp lands at
// ~4300ms.
//
// Fix: phaseAt() reports 'TITLE' from the STAMP (TITLE_IMPACT = 4300ms), while
// the visual drop-in still starts at PHASES.TITLE[0] (4000ms). The PHASES
// window is unchanged, so every existing timeline assertion holds.
//
// Run: node test/test_intro_impact.mjs   (exit 0 = pass)
import { render, phaseAt, PHASES, INTRO_DURATION } from '../src/intro.js';

let failed = 0;
function ok(cond, msg) {
  if (cond) { console.log('  PASS ' + msg); }
  else { failed++; console.error('  FAIL ' + msg); }
}

// Minimal ctx stub recording fillRects with their style (test_intro.mjs shape).
function draw(t) {
  const calls = [];
  const ctx = new Proxy({}, {
    get(target, prop) {
      if (prop === 'fillRect') {
        return (x, y, w, h) => calls.push({ style: target.fillStyle, x, y, w, h });
      }
      return target[prop];
    },
    set(target, prop, v) { target[prop] = v; return true; },
  });
  render(ctx, t);
  return calls;
}
const goldRects = (t) => draw(t).filter(c => c.style === '#ffd75e');
const topGoldY = (t) => Math.min(...goldRects(t).map(c => c.y));

const DROP = 300;                        // the title's drop-in duration
const STAMP = PHASES.TITLE[0] + DROP;    // 4300ms: the impact / stinger moment

console.log('TIMELINE is unchanged:');
{
  ok(PHASES.TITLE[0] === 4000 && PHASES.TITLE[1] === 6000, 'TITLE window still 4000-6000');
  ok(PHASES.FADE[0] === 6000 && INTRO_DURATION === 7000, 'FADE + duration unchanged');
}

console.log('STINGER keys on the VISUAL IMPACT:');
{
  ok(phaseAt(STAMP) === 'TITLE', `phaseAt(${STAMP}) is TITLE (the stamp frame)`);
  ok(phaseAt(STAMP - 1) === 'OVERTAKE',
    `phaseAt(${STAMP - 1}) is still OVERTAKE — the slam cannot fire before the stamp`);
  ok(phaseAt(4500) === 'TITLE' && phaseAt(6500) === 'FADE' && phaseAt(7000) === 'DONE',
    'the rest of the phase ladder still walks (4500 TITLE / 6500 FADE / 7000 DONE)');
  ok(phaseAt(1000) === 'CHASE' && phaseAt(3000) === 'OVERTAKE', 'early beats unchanged');
}

console.log('the title actually LANDS at that instant:');
{
  const before = goldRects(STAMP - 1), at = goldRects(STAMP);
  ok(before.length > 0 && at.length > 0, 'the title is on screen either side of the stamp');
  ok(topGoldY(STAMP) > topGoldY(STAMP - 1),
    `the title is still descending one frame earlier (${topGoldY(STAMP - 1)} -> ${topGoldY(STAMP)})`);
  ok(Math.abs(topGoldY(STAMP + 1) - topGoldY(STAMP)) < 1e-9,
    'and it is at rest one frame after the stamp (the impact frame is the landing)');
  ok(goldRects(3999).length === 0, 'no title pixels before the drop-in starts');
  ok(goldRects(STAMP + 10).length >= 60, 'all six letters are landed at the stamp');
}

if (failed) { console.error(`\n${failed} FAILURES`); process.exit(1); }
console.log('\nALL INTRO IMPACT TESTS PASSED');
