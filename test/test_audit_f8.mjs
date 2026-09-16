// F8 (audit 2026-09-16): the HUD GOLD badge clamped the purse at 99999 — a
// maxed run banks 754,689g, so the on-screen wallet saturated mid-run. fmtGold
// (render.js, pure) keeps the 5-char fixed field: byte-identical under 100000,
// compact k/M above, TRUNCATED (never rounded up), never wider than 5 chars.
import { fmtGold } from '../src/render.js';
import { boot } from './_harness.mjs';
import assert from 'node:assert/strict';

// --- 1. Byte-identical inside the old clamp (incl. every width) ------------
assert.equal(fmtGold(0),     '    0');
assert.equal(fmtGold(9),     '    9');
assert.equal(fmtGold(99),    '   99');
assert.equal(fmtGold(999),   '  999');
assert.equal(fmtGold(9999),  ' 9999');
assert.equal(fmtGold(99999), '99999');
assert.equal(fmtGold(12345), '12345');
assert.equal(fmtGold(10000), '10000');

// --- 2. The compact ladder: truncate, never round up, <=5 chars always ------
assert.equal(fmtGold(100000),  ' 100k');   // first value past the old clamp
assert.equal(fmtGold(123456),  ' 123k');
assert.equal(fmtGold(999999),  ' 999k');   // NOT '1000k'
assert.equal(fmtGold(1000000), ' 1.0M');
assert.equal(fmtGold(1234567), ' 1.2M');   // 1.234 -> truncate -> 1.2
assert.equal(fmtGold(1549999), ' 1.5M');   // floor, not round-up-to-1.6
assert.equal(fmtGold(9499999), ' 9.4M');   // NOT '9.5M' (9.499 -> 9.4)
assert.equal(fmtGold(9999999), ' 9.9M');   // NOT '10M'
assert.equal(fmtGold(10000000), '  10M');
assert.equal(fmtGold(754689),  ' 754k');   // the measured maxed-run purse
assert.equal(fmtGold(123456789), ' 123M');
assert.equal(fmtGold(999999999), ' 999M');
assert.equal(fmtGold(1200000000), ' 1.2B');
for (const v of [0, 1, 99999, 100000, 999999, 1000000, 9999999, 1e9, 123456789012]) {
  const s = fmtGold(v);
  assert.ok(s.length === 5 && s.length <= 5, `fmtGold(${v}) = '${s}' must be exactly the 5-char field`);
}

// --- 3. Hostile inputs read as the zero field, never 'NaN'/'undefined' ------
assert.equal(fmtGold(-5), '    0');
assert.equal(fmtGold(NaN), '    0');
assert.equal(fmtGold(undefined), '    0');
assert.equal(fmtGold(null), '    0');

// --- 4. Through the real render loop: the badge paints the compact form and
//        the geometry does NOT reflow between a small and a huge purse.
{
  const h = await boot();
  const st = h.state, T = h.T;
  T.startRun(); h.pump(2);
  // The badge publishes profile.runPurse through state.runPurse each frame —
  // write the PROFILE wallet, not just the state mirror.
  T.getProfile().runPurse = 99999; st.runPurse = 99999;
  h.pump(2);
  const small = T.renderer.hudChrome.purse;
  assert.ok(small, 'purse chrome seam exists');
  assert.equal(small.text, 'GOLD 99999', 'under the clamp the badge is byte-identical');
  T.getProfile().runPurse = 754689; st.runPurse = 754689;   // past the old 99999 saturation
  h.pump(2);
  const big = T.renderer.hudChrome.purse;
  assert.equal(big.text, 'GOLD  754k', 'purse above the old clamp shows the compact form');
  assert.equal(big.w, small.w, 'no HUD reflow: badge width is identical at 99999 and 754689');
  assert.equal(big.h, small.h, 'no HUD reflow: badge height identical');
  assert.equal(big.digitW, small.digitW, 'reserved digit column unchanged');
  assert.equal(big.value, 754689, 'the chrome records the TRUE value (clamp is display-only)');
}

console.log('test_audit_f8: all checks passed');
