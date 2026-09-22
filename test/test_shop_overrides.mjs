// HORDES — per-level cost overrides (slice 3 dev-editor graphs).
// upgradeCost() consults `def.overrides[currentLevel] ?? formula`.
// Owner retune ships tables on dmg + hp; every other row pays the formula.
// Run: node test/test_shop_overrides.mjs
import { SHOP_BY_ID, upgradeCost } from '../src/meta.js';

let failed = 0;
function ok(cond, msg) {
  if (cond) { console.log('  PASS ' + msg); }
  else { failed++; console.error('  FAIL ' + msg); }
}

console.log('OVERRIDES:');
{
  // Shipped owner tables (early-accessibility retune): listed levels pay the
  // table price, not the formula.
  const dmg = SHOP_BY_ID.dmg;
  ok(JSON.stringify(dmg.overrides) === JSON.stringify({ 0: 125, 1: 250, 2: 325, 3: 650, 4: 1200 }),
     'dmg carries the owner override table');
  ok(upgradeCost(dmg, 0) === 125, 'dmg L0 pays table price 125 (formula would be 150)');
  ok(upgradeCost(dmg, 2) === 325, 'dmg L2 pays table price 325');
  ok(upgradeCost(dmg, 4) === 1200, 'dmg L4 pays table price 1200');
  const hp = SHOP_BY_ID.hp;
  ok(JSON.stringify(hp.overrides) === JSON.stringify({ 0: 100, 1: 250, 2: 400, 3: 600, 4: 1000 }),
     'hp carries the owner override table');
  ok(upgradeCost(hp, 0) === 100, 'hp L0 pays table price 100 (formula would be 120)');
  ok(upgradeCost(hp, 4) === 1000, 'hp L4 pays table price 1000');

  // Formula default: a row with no overrides pays the growth formula.
  const pot = SHOP_BY_ID.potions;
  ok(pot.overrides === undefined, 'untouched rows carry no overrides');
  ok(upgradeCost(pot, 0) === Math.round(250 * Math.pow(1.5, 0)), 'formula default at L0');
  ok(upgradeCost(pot, 2) === Math.round(250 * Math.pow(1.5, 2)), 'formula default at L2');

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
