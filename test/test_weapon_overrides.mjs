// HORDES — per-level weapon damage overrides (slice 6 dev-editor weapons).
// weaponLevelParams() consults `WEAPON_DMG_OVERRIDES[weaponId]?.[level] ??
// formula`. Also pins the slice-5 live-template rule for weapon ladders:
// every level label quoting a step number is built from WEAPON_STEPS, so
// editing the step moves the card text with it.
// Run: node test/test_weapon_overrides.mjs
import { WEAPONS, WEAPON_LEVELS, WEAPON_MAX_LEVEL, WEAPON_NAMES,
  WEAPON_STEPS, WEAPON_DMG_OVERRIDES, weaponLevelParams,
  describeWeaponLevel, rebuildWeaponTable } from '../src/weapons.js';

let failed = 0;
function ok(cond, msg) {
  if (cond) { console.log('  PASS ' + msg); }
  else { failed++; console.error('  FAIL ' + msg); }
}

console.log('WEAPON OVERRIDES:');
{
  // No shipped weapon carries overrides (byte-identical behaviour).
  const SEEKER_LADDER = { 1: 1, 2: 1.2, 3: 1.4, 4: 1.6, 5: 1.8, 6: 2, 7: 2.2, 8: 2.4 };
  const shipped = () => JSON.stringify(WEAPON_DMG_OVERRIDES) === JSON.stringify({ SEEKER: SEEKER_LADDER });
  ok(shipped(), 'the only shipped dmg override is the SEEKER ladder (+20%/level)');
  ok(weaponLevelParams('SEEKER', 5).dmgMult === 1.8, 'SEEKER L5 pays its override');

  // Formula default: unlisted levels pay the WEAPON_LEVELS ladder.
  const zapAt = (L) => 1 + WEAPON_STEPS.ZAP.DMG * (L - 1);
  ok(WEAPON_STEPS.ZAP.DMG === 0.17 && weaponLevelParams('ZAP', 8).dmgMult === zapAt(8),
    'formula default at L8 (ZAP ladder untouched)');
  ok(weaponLevelParams('NOVA_PULSE', 3).radius === WEAPONS.NOVA_PULSE.RADIUS + 6 * 2,
    'non-damage params never consult the dmg table');

  // Override hit: a listed level pays the table dmgMult, nothing else moves.
  WEAPON_DMG_OVERRIDES.ZAP = { 8: 9.99 };
  const hit = weaponLevelParams('ZAP', 8);
  ok(hit.dmgMult === 9.99, 'override hit at L8 pays table dmgMult (formula would be 2.19)');
  // Override miss: unlisted levels fall back to the formula.
  ok(weaponLevelParams('ZAP', 7).dmgMult === zapAt(7),
    'override miss at L7 falls back to formula');
  ok(weaponLevelParams('ORBIT', 8).dmgMult === 1 + WEAPON_STEPS.ORBIT.DMG * 7,
    'override on one weapon never leaks into another');
  delete WEAPON_DMG_OVERRIDES.ZAP;

  // Restored: empty again, formula back.
  ok(shipped() && weaponLevelParams('ZAP', 8).dmgMult === zapAt(8),
    'override table removed cleanly (formula restored)');

  // Unknown ids stay neutral.
  ok(weaponLevelParams('NOPE', 4).dmgMult === 1, 'unknown weapon id -> neutral params');
  ok(rebuildWeaponTable('NOPE') === false, 'rebuild refuses unknown ids');
}

console.log('WEAPON LABELS (live step templates):');
{
  // Every label quoting a step number renders from WEAPON_STEPS — the pin
  // builds the expectation from the constant, so a step edit moves both.
  const pct = (v) => String(Math.round(Number(v) * 100));
  ok(describeWeaponLevel('ZAP', 2) ===
     `${WEAPON_NAMES.ZAP} Lv2 — +${pct(WEAPON_STEPS.ZAP.DMG)}% damage`,
    'ZAP label reads the live DMG step');
  ok(describeWeaponLevel('NOVA_PULSE', 3) ===
     `${WEAPON_NAMES.NOVA_PULSE} Lv3 — +${WEAPON_STEPS.NOVA_PULSE.RADIUS} radius, +${pct(WEAPON_STEPS.NOVA_PULSE.DMG)}% damage`,
    'NOVA label reads the live RADIUS + DMG steps');
  ok(describeWeaponLevel('BEAM', 5) ===
     `${WEAPON_NAMES.BEAM} Lv5 — +${WEAPON_STEPS.BEAM.WIDTH} width, +${pct(WEAPON_STEPS.BEAM.DMG)}% damage`,
    'BEAM label reads the live WIDTH + DMG steps');
  ok(describeWeaponLevel('MINE', 3) ===
     `${WEAPON_NAMES.MINE} Lv3 — +${pct(WEAPON_STEPS.MINE.DMG)}% damage, +${WEAPON_STEPS.MINE.BLAST} blast radius`,
    'MINE label reads the live DMG + BLAST steps');

  // A step edit re-runs the game's own ladder builder: curve AND label move,
  // then the restore puts both back (proves the pipe, leaves no retune).
  const keep = WEAPON_STEPS.SCYTHE.DMG;
  WEAPON_STEPS.SCYTHE.DMG = 0.25;
  ok(rebuildWeaponTable('SCYTHE') === true, 'rebuild accepts a known id');
  ok(weaponLevelParams('SCYTHE', 8).dmgMult === 1 + 0.25 * 7,
    'edited step moves the damage curve');
  ok(describeWeaponLevel('SCYTHE', 2).includes('+' + pct(0.25) + '% damage'),
    'edited step moves the draft label with it');
  WEAPON_STEPS.SCYTHE.DMG = keep;
  rebuildWeaponTable('SCYTHE');
  ok(weaponLevelParams('SCYTHE', 8).dmgMult === 1 + keep * 7 &&
     describeWeaponLevel('SCYTHE', 2).includes('+' + pct(keep) + '% damage'),
    'restored step puts curve and label back (no retune left behind)');

  // Tables keep their shape: every id has MAX rows with effects objects.
  for (const id of Object.keys(WEAPON_LEVELS)) {
    ok(WEAPON_LEVELS[id].length === WEAPON_MAX_LEVEL &&
       WEAPON_LEVELS[id].every(r => r.effects && typeof r.effects === 'object'),
      `table ${id}: ${WEAPON_MAX_LEVEL} rows with cumulative effects`);
  }
}

if (failed) { console.error('WEAPON OVERRIDES: ' + failed + ' failure(s)'); process.exit(1); }
console.log('WEAPON OVERRIDES: all green.');
