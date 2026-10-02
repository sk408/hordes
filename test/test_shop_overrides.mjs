// HORDES — per-level cost overrides (slice 3 dev-editor graphs).
// upgradeCost() consults `def.overrides[currentLevel] ?? formula`.
// No shipped row carries a table; the mechanism is proven on a synthetic row.
// Run: node test/test_shop_overrides.mjs
import { SHOP_BY_ID, upgradeCost } from '../src/meta.js';

let failed = 0;
function ok(cond, msg) {
  if (cond) { console.log('  PASS ' + msg); }
  else { failed++; console.error('  FAIL ' + msg); }
}

console.log('OVERRIDES:');
{
  // Formula default: a row with no overrides pays the growth formula.
  const pot = SHOP_BY_ID.potions;
  ok(pot.overrides === undefined, 'a shipped row carries no overrides');
  ok(upgradeCost(pot, 0) === Math.round(pot.baseCost * Math.pow(pot.costGrowth, 0)), 'formula default at L0');
  ok(upgradeCost(pot, 2) === Math.round(pot.baseCost * Math.pow(pot.costGrowth, 2)), 'formula default at L2');

  // Override hit: listed levels pay the table price, not the formula.
  const shaped = { baseCost: 150, costGrowth: 1.6, overrides: { 0: 50, 3: 9999 } };
  ok(upgradeCost(shaped, 0) === 50, 'override hit at L0 pays table price (formula would be 150)');
  ok(upgradeCost(shaped, 3) === 9999, 'override hit at L3 pays table price');

  // Override miss: unlisted levels fall back to the formula.
  ok(upgradeCost(shaped, 1) === Math.round(150 * Math.pow(1.6, 1)),
     'override miss at L1 falls back to formula');
  ok(upgradeCost(shaped, 4) === Math.round(150 * Math.pow(1.6, 4)),
     'override miss at L4 falls back to formula');

  // Empty table behaves as no table.
  ok(upgradeCost({ baseCost: 150, costGrowth: 1.6, overrides: {} }, 2)
     === Math.round(150 * Math.pow(1.6, 2)), 'empty overrides table falls back to formula');
}

if (failed) { console.error('OVERRIDES: ' + failed + ' failure(s)'); process.exit(1); }
console.log('OVERRIDES: all green.');
