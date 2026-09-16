// HORDES — G19 SLICE 2: SPECIALISATION (the family map, the specialty table,
// the two combat terms, the legible identity). Everything PRINTS because the
// brief's acceptance A asks for the raw figures, not a summary — including the
// hit-cap masking audit the brief flags as THE trap. Companion browser proof:
// tools/verify_g19_specialisation.mjs.
// Run: node test/test_g19_specialisation.mjs (exit 0 = pass)
import assert from 'node:assert';
import { CONFIG as C, ladderDmg } from '../src/config.js';
import {
  ENEMY_TYPES, ENEMY_FAMILY, enemyFamily,
} from '../src/enemy_types.js';
import {
  makeProfile, CHARACTERS, applyMetaBonuses, applyCharacter,
  applyCharacterUpgrades, buyCharacterUpgrade, unlockCharacter,
  buyUpgrade, SHOP_UPGRADES, getCharacterUpgradeLevel,
  CHARACTER_SPECIALTIES, SPECIALTY_TERMS,
  specialtyOutgoingMult, specialtyIncomingMult, specialtyLines,
} from '../src/meta.js';
import { makePlayer, contactHitDamage } from '../src/entities.js';
import { directHitMult } from '../src/rewrites.js';

let failed = 0;
function ok(cond, msg) {
  if (cond) { console.log('  PASS ' + msg); }
  else { failed++; console.error('  FAIL ' + msg); }
}

const baseStats = () => ({ ...makePlayer().stats });   // the run seam's own base

const CHAR_IDS = Object.keys(CHARACTERS);
const FAMILIES = ['CHAFF', 'RANGED', 'FLYING', 'HEAVY'];
// One representative type per family (a real ENEMY_TYPES member).
const FAMILY_REP = { CHAFF: 'CHASER', RANGED: 'SPITTER', FLYING: 'SHRIKE', HEAVY: 'BRUTE' };
// Where the family came from, per type — printed with the classification.
const REASON = {
  CHASER: "chaff: true (the table's own flag)",
  SWARMER: "chaff: true (the table's own flag)",
  SPITTER: 'table comment: "Ranged threat ... spits steady shots"',
  WARLOCK: 'table comment: "dedicated ranged HUNTER"',
  PILLAR: 'stationary turret that "chips the player with a steady slow shot"',
  BRUTE: "heavy: true (the table's own flag) — slow, tanky, big contact damage",
  DASHER: "heavy: true (the table's own flag) — JUDGEMENT CALL: it lunges fast, but the flag is the table's own role word",
  TICK: "heavy: true (the table's own flag) — JUDGEMENT CALL: tiny latcher, but the flag is the table's own role word",
  COLOSSUS: 'no flag; documented mini-boss tier ("massive HP, slow, huge body", main.js :856/:887)',
  SHRIKE: "flying: true — wins over its heavy: true (the more specific role)",
};

// =====================================================================
// (a) THE FULL 10-ROW FAMILY CLASSIFICATION, PRINTED WITH THE REASON.
console.log('THE FAMILY MAP (all 10 types, one line each, reason included):');
{
  const seen = new Set();
  for (const [tid, t] of Object.entries(ENEMY_TYPES)) {
    const fam = enemyFamily(tid);
    seen.add(tid);
    console.log(`    ${tid.padEnd(9)} -> ${String(fam).padEnd(7)} | ${REASON[tid]}`);
    ok(FAMILIES.includes(fam), `${tid} lands in one of the four families (${fam})`);
    ok(ENEMY_FAMILY[tid] === fam, `${tid}: ENEMY_FAMILY table and enemyFamily() agree`);
  }
  ok(Object.keys(ENEMY_TYPES).length === 10, `the type table has 10 members (got ${Object.keys(ENEMY_TYPES).length})`);
  ok(Object.keys(ENEMY_FAMILY).length === 10, `the family table covers exactly those 10 (got ${Object.keys(ENEMY_FAMILY).length})`);
  for (const tid of Object.keys(ENEMY_FAMILY)) ok(seen.has(tid), `family row ${tid} corresponds to a real type`);
  // Flag consistency: the derived table never contradicts the type table's own flags.
  for (const [tid, t] of Object.entries(ENEMY_TYPES)) {
    if (t.chaff) ok(ENEMY_FAMILY[tid] === 'CHAFF', `${tid} carries chaff:true and reads CHAFF`);
    if (t.flying) ok(ENEMY_FAMILY[tid] === 'FLYING', `${tid} carries flying:true and reads FLYING`);
  }
}

// =====================================================================
// (b) EXHAUSTIVE, PURE, NULL FOR JUNK.
console.log('PURITY: enemyFamily is a pure lookup, null for junk, never throws:');
{
  for (const junk of ['', 'JUNK', 'chaser', 'Knight', null, undefined, 0, 7, Symbol]) {
    let r;
    try { r = enemyFamily(junk); } catch (e) { r = 'THREW'; }
    ok(r === null, `enemyFamily(${String(junk).slice(0, 12)}) -> null (got ${String(r)})`);
  }
  // Same input, same output, no state touched (call twice, deep-compare).
  for (const tid of Object.keys(ENEMY_TYPES)) {
    ok(enemyFamily(tid) === enemyFamily(tid), `${tid}: repeat call is stable`);
  }
}

// =====================================================================
// (c) THE 4x4 MATRIX AS A PRINTED GRID.
console.log('THE 4x4 GRID (rows = characters, columns = families), OUTGOING term:');
{
  const hdr = '          ' + FAMILIES.map(f => f.padStart(8)).join('');
  console.log(hdr);
  for (const cid of CHAR_IDS) {
    const row = FAMILIES.map(f => {
      const m = specialtyOutgoingMult(cid, FAMILY_REP[f]);
      return ('x' + m.toFixed(2)).padStart(8);
    });
    console.log('    ' + cid.padEnd(6) + row.join(''));
  }
  // Every cell is exactly one of the three exported terms.
  for (const cid of CHAR_IDS) for (const f of FAMILIES) {
    const m = specialtyOutgoingMult(cid, FAMILY_REP[f]);
    ok(m === 1 || m === SPECIALTY_TERMS.OUT_STRONG || m === SPECIALTY_TERMS.OUT_WEAK,
      `${cid} vs ${f}: outgoing cell is x1.00/x${SPECIALTY_TERMS.OUT_STRONG}/x${SPECIALTY_TERMS.OUT_WEAK} (got x${m})`);
  }
  // Same grid shape for INCOMING.
  console.log('THE 4x4 GRID, INCOMING term (typeMult side):');
  console.log(hdr);
  for (const cid of CHAR_IDS) {
    const row = FAMILIES.map(f => {
      const m = specialtyIncomingMult(cid, FAMILY_REP[f]);
      return ('x' + m.toFixed(2)).padStart(8);
    });
    console.log('    ' + cid.padEnd(6) + row.join(''));
  }
  for (const cid of CHAR_IDS) for (const f of FAMILIES) {
    const m = specialtyIncomingMult(cid, FAMILY_REP[f]);
    ok(m === 1 || m === SPECIALTY_TERMS.IN_STRONG || m === SPECIALTY_TERMS.IN_WEAK,
      `${cid} vs ${f}: incoming cell is an exported term (got x${m})`);
  }
}

// =====================================================================
// (d) COVERAGE + NO-DOMINANCE.
console.log('COVERAGE + NO-DOMINANCE (every family: exactly one strong, one weak; every character: exactly one of each):');
{
  for (const f of FAMILIES) {
    const strong = CHAR_IDS.filter(c => CHARACTER_SPECIALTIES[c].strong === f);
    const weak = CHAR_IDS.filter(c => CHARACTER_SPECIALTIES[c].weak === f);
    ok(strong.length === 1, `${f}: exactly ONE character is strong against it (${strong.join(',') || 'NONE'})`);
    ok(weak.length === 1, `${f}: exactly ONE character is weak against it (${weak.join(',') || 'NONE'})`);
  }
  for (const c of CHAR_IDS) {
    ok(FAMILIES.includes(CHARACTER_SPECIALTIES[c].strong), `${c}: strong family is a real family`);
    ok(FAMILIES.includes(CHARACTER_SPECIALTIES[c].weak), `${c}: weak family is a real family`);
    ok(CHARACTER_SPECIALTIES[c].strong !== CHARACTER_SPECIALTIES[c].weak, `${c}: strong != weak`);
    const strongIn = FAMILIES.filter(f => specialtyOutgoingMult(c, FAMILY_REP[f]) === SPECIALTY_TERMS.OUT_STRONG);
    ok(strongIn.length === 1, `${c}: strong in exactly ONE family (${strongIn.join(',')})`);
    const weakIn = FAMILIES.filter(f => specialtyOutgoingMult(c, FAMILY_REP[f]) === SPECIALTY_TERMS.OUT_WEAK);
    ok(weakIn.length === 1, `${c}: weak in exactly ONE family (${weakIn.join(',')})`);
  }
  // The brief's exact assignment, verbatim.
  assert.deepStrictEqual(CHARACTER_SPECIALTIES, {
    KNIGHT: { strong: 'HEAVY', weak: 'RANGED' },
    WITCH: { strong: 'CHAFF', weak: 'FLYING' },
    ROGUE: { strong: 'RANGED', weak: 'HEAVY' },
    PALADIN: { strong: 'FLYING', weak: 'CHAFF' },
  });
  ok(true, 'the assignment is exactly the brief\'s (KNIGHT H/R, WITCH C/F, ROGUE R/H, PALADIN F/C)');
  // Terms inside the allowed window (spec +/- 0.03).
  ok(SPECIALTY_TERMS.OUT_STRONG === 1.15 && SPECIALTY_TERMS.OUT_WEAK === 0.92 &&
     SPECIALTY_TERMS.IN_STRONG === 0.88 && SPECIALTY_TERMS.IN_WEAK === 1.12,
    'terms are exactly the spec: out 1.15/0.92, in 0.88/1.12 (no move needed)');
}

// =====================================================================
// (e) OUTGOING BEFORE/AFTER — one known hit per character per family.
console.log('OUTGOING: a 10-point direct hit, before (neutral pilot) vs after (the real pilot), per character per family:');
{
  const HIT = 10;
  for (const cid of CHAR_IDS) {
    const parts = FAMILIES.map(f => {
      const before = HIT * specialtyOutgoingMult('NOBODY', FAMILY_REP[f]);
      const after = HIT * specialtyOutgoingMult(cid, FAMILY_REP[f]);
      return `${f} ${before}->${after.toFixed(2)}`;
    });
    console.log(`    ${cid.padEnd(7)} ${parts.join('  |  ')}`);
    // Strong family must be the OUT_STRONG multiple of the neutral hit; weak likewise.
    ok(HIT * specialtyOutgoingMult(cid, FAMILY_REP[CHARACTER_SPECIALTIES[cid].strong]) === HIT * SPECIALTY_TERMS.OUT_STRONG,
      `${cid}: strong-family hit is x${SPECIALTY_TERMS.OUT_STRONG} of neutral`);
    ok(HIT * specialtyOutgoingMult(cid, FAMILY_REP[CHARACTER_SPECIALTIES[cid].weak]) === HIT * SPECIALTY_TERMS.OUT_WEAK,
      `${cid}: weak-family hit is x${SPECIALTY_TERMS.OUT_WEAK} of neutral`);
  }
  // And through the real choke: directHitMult with a state carrying the character.
  for (const cid of CHAR_IDS) {
    const st = { character: { id: cid }, player: { rewrites: {} } };
    const e = { typeId: FAMILY_REP[CHARACTER_SPECIALTIES[cid].strong], slow: 0 };
    ok(directHitMult(st, e) === SPECIALTY_TERMS.OUT_STRONG,
      `${cid}: directHitMult carries x${SPECIALTY_TERMS.OUT_STRONG} on an UNSLOWED strong-family body (got x${directHitMult(st, e)})`);
    const w = { typeId: FAMILY_REP[CHARACTER_SPECIALTIES[cid].weak], slow: 0 };
    ok(directHitMult(st, w) === SPECIALTY_TERMS.OUT_WEAK,
      `${cid}: directHitMult carries x${SPECIALTY_TERMS.OUT_WEAK} on a weak-family body`);
  }
}

// =====================================================================
// (f) INCOMING raw / post-cap hit / hits-to-kill — WITH the cap-masking audit.
console.log('INCOMING: raw and post-cap hit, with and without the term, plus hits-to-kill at the run\'s own maxHp:');
console.log('    (contactHitDamage(BASE_CONTACT, ladderDmg(w)^CONTACT_POW, typeMult*term, 1, maxHp);');
console.log('     typeMult = the family representative\'s own contactDamageMult; w=0 and w=29 ladder arms)');
{
  const runMaxHp = (cid) => applyCharacter(applyMetaBonuses(baseStats(), makeProfile().purchased), cid).maxHp;
  let maskedCount = 0, totalWeak = 0;
  for (const cid of CHAR_IDS) {
    const maxHp = runMaxHp(cid);
    console.log(`    ${cid} (run maxHp ${maxHp}, cap ${maxHp * C.SURVIVAL.HIT_CAP_FRAC}):`);
    for (const f of FAMILIES) {
      const rep = ENEMY_TYPES[FAMILY_REP[f]];
      const typeMult = rep.contactDamageMult || 1;
      const inTerm = specialtyIncomingMult(cid, FAMILY_REP[f]);
      for (const w of [0, 29]) {
        const scaled = Math.pow(ladderDmg(w), C.SURVIVAL.CONTACT_POW);
        const cap = Math.max(1, maxHp * C.SURVIVAL.HIT_CAP_FRAC);
        const rawN = C.SURVIVAL.BASE_CONTACT * scaled * typeMult;               // raw, neutral (term 1)
        const rawT = C.SURVIVAL.BASE_CONTACT * scaled * typeMult * inTerm;      // raw WITH the term
        const hitN = contactHitDamage(C.SURVIVAL.BASE_CONTACT, ladderDmg(w), typeMult, 1, maxHp);
        const hitT = contactHitDamage(C.SURVIVAL.BASE_CONTACT, ladderDmg(w), typeMult * inTerm, 1, maxHp);
        const htkN = Math.ceil(maxHp / hitN);
        const htkT = Math.ceil(maxHp / hitT);
        const masked = inTerm !== 1 && hitT === hitN;   // term moved raw but not the capped hit
        if (f === CHARACTER_SPECIALTIES[cid].weak) {
          totalWeak++;
          if (masked) maskedCount++;
        }
        console.log(`      ${f.padEnd(7)} w=${String(w).padEnd(2)} typeMult x${typeMult} term x${inTerm}` +
          ` | raw ${rawN.toFixed(1)} -> ${rawT.toFixed(1)} | hit ${hitN.toFixed(1)} -> ${hitT.toFixed(1)} (cap ${cap.toFixed(1)})` +
          ` | hits-to-kill ${htkN} -> ${htkT}${masked ? '   [MASKED BY CAP]' : ''}`);
      }
    }
  }
  ok(true, 'per-character per-family raw/hit/hits-to-kill printed above (4 characters x 4 families x 2 ladder arms)');
  // The audit verdict, stated as a finding either way.
  if (maskedCount === totalWeak) {
    console.log(`    FINDING: the hit cap masks the INCOMING weakness in ${maskedCount}/${totalWeak} printed weak-family arms:` +
      ` raw sits far above maxHp x ${C.SURVIVAL.HIT_CAP_FRAC} at every ladder point, so the capped hit (and thus` +
      ` hits-to-kill) is byte-identical with and without the term. The incoming term is structurally unobservable` +
      ` through contact damage on this balance; reported as a finding, the cap NOT touched (owner-frozen).`);
  } else {
    ok(maskedCount === 0, `no weak-family arm is masked by the cap (${maskedCount} masked)`);
  }
}

// =====================================================================
// (g) NEUTRALITY — a regression proof, not an argument.
console.log('NEUTRALITY: every neutral case is byte-identical to the pre-slice numbers:');
{
  // OUTGOING through the real choke: state without a character (the pre-G19
  // shape every existing test uses) is exactly 1, slowed or not, rewrite or not.
  for (const tid of Object.keys(ENEMY_TYPES)) {
    const e = { typeId: tid, slow: 0 };
    ok(directHitMult({}, e) === 1, `no character on state: directHitMult(${tid}, unslowed) === 1`);
    ok(directHitMult({}, { ...e, slow: 1 }) === 1, `no character on state: directHitMult(${tid}, slowed, no rewrites) === 1`);
    ok(directHitMult({ player: { rewrites: { glacier: true } } }, { ...e, slow: 1 }) === 1.2,
      `no character + glacier: still exactly x1.20 (rewrites.js GLACIER_DAMAGE_MULT)`);
  }
  // A character with a typeId the family table does not know reads 1.
  ok(directHitMult({ character: { id: 'KNIGHT' }, player: { rewrites: {} } }, { typeId: undefined, slow: 0 }) === 1,
    'KNIGHT vs a body with NO typeId (pre-typed fixtures): exactly 1');
  ok(specialtyOutgoingMult('KNIGHT', 'JUNK') === 1 && specialtyIncomingMult('KNIGHT', 'JUNK') === 1,
    'unknown TYPE: exactly 1 both directions');
  ok(specialtyOutgoingMult('NOBODY', 'BRUTE') === 1 && specialtyIncomingMult('NOBODY', 'BRUTE') === 1,
    'unknown CHARACTER: exactly 1 both directions');
  // A neutral character x neutral family through the real pure function:
  // multiplying typeMult by 1 is byte-identical (float-exact).
  for (const f of FAMILIES) {
    const rep = ENEMY_TYPES[FAMILY_REP[f]];
    const a = contactHitDamage(C.SURVIVAL.BASE_CONTACT, 2.3, rep.contactDamageMult, 1.5, 130);
    const b = contactHitDamage(C.SURVIVAL.BASE_CONTACT, 2.3, (rep.contactDamageMult || 1) * specialtyIncomingMult('ROGUE', 'CHAFF'), 1.5, 130);
    ok(a === b, `contactHitDamage with a x1 term is float-identical (${f} rep, ROGUE/CHAFF neutral)`);
  }
  // The two term families never leak into each other's constants.
  ok(SPECIALTY_TERMS.OUT_STRONG !== SPECIALTY_TERMS.IN_STRONG &&
     SPECIALTY_TERMS.OUT_WEAK !== SPECIALTY_TERMS.IN_WEAK,
    'outgoing and incoming terms are distinct constants (no shared magic number)');
}

// =====================================================================
// (h) THE PART-(3) DEMONSTRATION — switching keeps the global floor.
console.log('PART (3): a profile with global purchases + MAXED KNIGHT rows, equipped as KNIGHT vs as WITCH:');
{
  const p = makeProfile();
  p.gold = 500000;
  // One real global purchase (the floor) via the real buy path (by id, as the UI does).
  ok(buyUpgrade(p, 'well') === true, 'global row (well) bought through buyUpgrade');
  // Every KNIGHT row maxed through the real buy path (buy by ID, as the UI does).
  unlockCharacter(p, 'WITCH');
  for (let i = 0; i < 4; i++) assert.ok(buyCharacterUpgrade(p, 'KNIGHT', 'knight_vigor'), `knight_vigor level ${i + 1}`);
  for (let i = 0; i < 3; i++) assert.ok(buyCharacterUpgrade(p, 'KNIGHT', 'knight_force'), `knight_force level ${i + 1}`);
  ok(getCharacterUpgradeLevel(p, 'KNIGHT', 'knight_vigor') === 4 &&
     getCharacterUpgradeLevel(p, 'KNIGHT', 'knight_force') === 3,
    'both KNIGHT rows are MAXED through the real buy path');
  const chain = (cid) => applyCharacterUpgrades(
    applyCharacter(applyMetaBonuses(baseStats(), p.purchased), cid), p, cid);
  const asKnight = chain('KNIGHT');
  const asWitch = chain('WITCH');
  console.log('    equipped KNIGHT:', JSON.stringify(pick(asKnight)));
  console.log('    equipped WITCH :', JSON.stringify(pick(asWitch)));
  function pick(s) { return { maxHp: s.maxHp, maxMana: s.maxMana, damageMult: s.damageMult, manaCostMult: s.manaCostMult }; }
  ok(asKnight.maxHp === 100 + 30 + 12 * 4, `KNIGHT block carries his maxed rows (100 base +30 char +48 vigor = ${asKnight.maxHp})`);
  ok(asKnight.damageMult === 1 + 0.06 * 3, `KNIGHT block carries Heavy Guard (damageMult ${asKnight.damageMult})`);
  ok(asWitch.maxHp === 100 - 25, `switching to WITCH drops the per-character portion (her own 75, got ${asWitch.maxHp})`);
  ok(asWitch.maxMana === 100 + 50 + 50, `the GLOBAL well floor survives the switch (witch mana ${asWitch.maxMana} = 150 base + 50 well)`);
  ok(asKnight.maxMana === 100 + 50, `the same global floor rides the KNIGHT too (${asKnight.maxMana})`);
  // The specialty itself never appears in the stat blocks — it is not a stat.
  ok(!('specialty' in asKnight) && !('specialtyOut' in asWitch),
    'no specialty key in either stat block (the terms live at the damage chokes, not in stats)');
  // And nothing was written to the profile for the specialty.
  ok(!p.specialties && !p.characters.KNIGHT.specialty,
    'the profile carries NO specialty data (static character identity, nothing persisted)');
}

// =====================================================================
// THE GREP-PROOF: no gate anywhere refuses anything because of a specialty.
console.log('NO-GATE GREP (run from the repo root, quoted for the report):');
console.log("    grep -rn 'CHARACTER_SPECIALTIES\\|specialty' src/ | grep -v 'specialtyOutgoingMult\\|specialtyIncomingMult\\|specialtyLines'");
{
  // Enumerate every src reference to the specialty surface and assert each file
  // is in the allowed set (the table owner, the two chokes, the two screens).
  const ALLOWED = new Set(['src/meta.js', 'src/main.js', 'src/rewrites.js', 'src/enemy_types.js']);
  const { execFileSync } = await import('node:child_process');
  const out = execFileSync('grep', ['-rn', '-E', 'CHARACTER_SPECIALTIES|specialty', 'src/'], { encoding: 'utf8' });
  const files = new Set(out.trim().split('\n').map(l => l.split(':')[0]));
  for (const f of files) ok(ALLOWED.has(f), `specialty referenced only in an owned file: ${f}`);
  // None of those references sits in a gate (unlock/stage/run refusal) — the
  // only consumers are the two multipliers, the line builder, and renders.
  const gated = out.trim().split('\n').filter(l => /unlock|refuse|gate|stage.*(denied|require)|cannot|blocked/.test(l));
  ok(gated.length === 0, `no specialty reference is inside a refusal/gate branch (${gated.length} found)`);
  console.log('    ' + out.trim().split('\n').length + ' references, all in ' + [...files].join(', '));
}

console.log(failed === 0 ? '\nspecialisation: ALL CHECKS PASSED' : `\nspecialisation: ${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
