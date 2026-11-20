// HORDES - the intro's slam lands WITH the logo (agent F, wave-25; kept
// through the R2 rebuild). main.js fires audio.playIntroCue on each change of
// phaseAt(); the slam is the TITLE phase, so TITLE must begin on the frame
// the logo comes to rest, never while it is still falling. Both cuts that
// drop the logo are checked: the road (a new player) and the stamp (a
// returning player).
// Run: node test/test_intro_impact.mjs   (exit 0 = pass)
import { render, phaseAt, PHASES, STAMP_PHASES, TITLE_IMPACT, STAMP_IMPACT, INTRO_TEST } from '../src/intro.js';
import { TITLE_LAYERS } from '../src/art/title.js';

let failed = 0;
function ok(cond, msg) {
  if (cond) { console.log('  PASS ' + msg); }
  else { failed++; console.error('  FAIL ' + msg); }
}

// The wordmark's own colours (no other layer of the painting uses them).
const WORD = TITLE_LAYERS.find(L => L.id === 'WORDMARK');
const others = new Set(TITLE_LAYERS.filter(L => L.id !== 'WORDMARK').flatMap(L => L.grid.flat().filter(Boolean).map(v => L.palette[v])));
const wordCols = new Set(WORD.grid.flat().filter(Boolean).map(v => WORD.palette[v]).filter(c => !others.has(c)));
// The top of the wordmark on screen at t (Infinity when it is not drawn).
function wordTop(t, opts) {
  let top = Infinity, st = '';
  const g = new Proxy({}, {
    get(_, p) {
      if (p === 'fillRect') return (x, y, w, h) => { if (wordCols.has(st) && y + h > 0) top = Math.min(top, y); };
      if (p === 'fillStyle') return st;
      if (p === 'measureText') return () => ({ width: 0 });
      return () => {};
    },
    set(_, p, v) { if (p === 'fillStyle') st = v; return true; },
  });
  render(g, t, opts);
  return top;
}

for (const [name, opts, drop, impact] of [
  ['the road', {}, PHASES.TITLE[0], TITLE_IMPACT],
  ['the stamp', { returning: true }, STAMP_PHASES.DROP[0], STAMP_IMPACT],
]) {
  console.log(name.toUpperCase() + ':');
  ok(wordCols.size > 0, 'the wordmark has colours of its own');
  ok(phaseAt(impact, opts) === 'TITLE' && phaseAt(impact - 1, opts) !== 'TITLE',
    `TITLE (the slam) begins at ${impact} ms, not a frame before`);
  ok(wordTop(drop - 1, opts) === Infinity || wordTop(drop - 1, opts) < 0, 'the wordmark is not on screen before the drop');
  const rest = wordTop(impact + 400, opts);
  ok(rest > 0 && rest < 300, `it comes to rest on the painting (top at y=${rest})`);
  ok(wordTop(impact - 1, opts) < rest, 'one frame before the slam it is still above its place');
  ok(wordTop(impact, opts) === rest, 'at the slam it is in its place (the landing frame)');
  ok(wordTop(drop + (impact - drop) / 2, opts) < wordTop(impact - 20, opts), 'it falls (higher halfway through the drop)');
}
console.log('THE DROP is fixed by the logo\'s box:');
{
  const b = INTRO_TEST.logoBox();
  ok(b.w > 0 && b.h > 0 && b.y >= 0 && b.y + b.h <= 300, `the logo box sits inside the picture (${JSON.stringify(b)})`);
}

if (failed) { console.error(`\n${failed} FAILURES`); process.exit(1); }
console.log('\nALL INTRO IMPACT TESTS PASSED');
