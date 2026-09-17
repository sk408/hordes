// HORDES — N1 slice 3: the three non-Witch ults (EARTHSHATTER / AFTERIMAGE /
// CONSECRATION), docs/briefs/N1_SLICE3_THREE_ULTS.md + N1_ULTS_SPECS.md (the
// pilot's AUTHORITATIVE content — numbers are pinned, not chosen here).
//
// The contract under test, PER ULT:
//   - charge accrues from REAL kills (the death pass), READY at exactly KILLS
//     and not before, and a cast banks exactly KILLS (leftover carries);
//   - the cooldown floor: a dense window (kills flooding in) cannot cast more
//     often than COOLDOWN allows — cast counts printed, exact at 60Hz/120Hz;
//   - MANA (RETARGET 2026-09-17, owner directive "player ults must cost a
//     significant amount of mana" — supersedes N1's NON-mana clause): every
//     ult costs MANA 60; a short pool REFUSES the cast with the pool
//     byte-identical, a paid cast spends exactly 60 (test_ult_mana.mjs owns
//     the full refusal/payout contract; this file keeps the live-run side);
//   - a wave roll-over (state.wave.startKills advancing, main.js:952) does
//     NOT reset the charge (it reads p.kills - p.ultSpent, never startKills);
//   - the effect is REAL per spec: Earthshatter hits inside RADIUS 240 only
//     and its FORTIFY halves a real contact hit; Afterimage detonates on the
//     move through the ONE blast path and its x1.5 speed is live;
//     Consecration ticks its full 6s, heals on kills inside only, capped at
//     the tick rate (DPS*TICK = 9 HP/tick, excess dropped);
//   - the readout is live: #q-skill label, the tc-q badge and the text-HUD Q
//     line show charging (n/KILLS) / RDY / cooling (12.0s).
// Run: node test/test_ults.mjs
import { suite, boot } from './_harness.mjs';
import { CONFIG as C } from '../src/config.js';
import { CHARACTERS } from '../src/meta.js';
import { useSkill, ultCharge, isUlt } from '../src/skills.js';
// G21 slice 1 (C2): the ult cooldown FLOOR rolls on through skillCooldown's
// one read, so it pays the empty-rewrite-slot mult too — the floor-bound
// cast expectation below computes it live (the KILL count never moves).
import { emptySlotCooldownMult } from '../src/rewrites.js';

const s = suite('test_ults');

// ---------------------------------------------------------------------------
// 1. Pure pins: the spec blocks, the meta rows, the helper shape.
// ---------------------------------------------------------------------------
s.check('the three spec blocks are byte-exact (the pilot\'s numbers, MANA 60)', () => {
  const want = {
    EARTHSHATTER: { KEY: 'q', NAME: 'Earthshatter', LABEL: 'EARTH', KILLS: 40, MANA: 60, COOLDOWN: 12,
      RADIUS: 240, DAMAGE: 40, DAMAGE_MAXHP: 1.2, FORTIFY_TIME: 3, FORTIFY_MULT: 0.5 },
    AFTERIMAGE: { KEY: 'q', NAME: 'Afterimage', LABEL: 'AFTER', KILLS: 30, MANA: 60, COOLDOWN: 10,
      DURATION: 3, SPEED_MULT: 1.5, TICK: 0.25, RADIUS: 70, DAMAGE: 30, DAMAGE_WEAPON: 0.6 },
    CONSECRATION: { KEY: 'q', NAME: 'Consecration', LABEL: 'ALTAR', KILLS: 40, MANA: 60, COOLDOWN: 15,
      RADIUS: 140, DURATION: 6, DPS: 18, TICK: 0.5, HEAL_PER_KILL: 2 },
  };
  for (const id of Object.keys(want)) {
    const def = C.SKILLS[id];
    if (!def) throw new Error(id + ' missing from CONFIG.SKILLS');
    for (const k of Object.keys(want[id])) {
      if (def[k] !== want[id][k]) throw new Error(id + '.' + k + ' = ' + def[k] + ' (spec ' + want[id][k] + ')');
    }
    if (def.LABEL.length > 5) throw new Error(id + '.LABEL must fit the fixed 96px H1 button: ' + def.LABEL);
  }
});

s.check('the meta rows point at the ults; the Witch row is untouched', () => {
  const want = { KNIGHT: 'EARTHSHATTER', ROGUE: 'AFTERIMAGE', PALADIN: 'CONSECRATION', WITCH: 'CHAIN_REACTION' };
  for (const id of Object.keys(want)) {
    if (CHARACTERS[id].skill !== want[id]) throw new Error(id + '.skill = ' + CHARACTERS[id].skill);
  }
});

s.check('isUlt / ultCharge: null for mana skills, a live charge shape for ults', () => {
  if (isUlt('FROST_NOVA') || isUlt('OVERCHARGE') || isUlt('CHAIN_REACTION') || isUlt('NOPE')) {
    throw new Error('a mana skill (or an unknown id) reads as an ult');
  }
  for (const id of ['EARTHSHATTER', 'AFTERIMAGE', 'CONSECRATION']) {
    if (!isUlt(id)) throw new Error(id + ' not recognised as an ult');
  }
  if (ultCharge({ player: {} }, 'FROST_NOVA') !== null) throw new Error('ultCharge on a mana skill');
  const u = ultCharge({ player: { kills: 17, skillCd: {} } }, 'EARTHSHATTER');
  if (!u || u.charge !== 17 || u.need !== 40 || u.ready !== false) {
    throw new Error('ultCharge shape: ' + JSON.stringify(u));
  }
});

// ---------------------------------------------------------------------------
// 2. Live runs. One boot; a fresh run per class through the REAL startRun.
// ---------------------------------------------------------------------------
const h = await boot({ storage: [['hordes_onboarded', '1']] });
const T = h.T, st = T.state;
T.banners.suppressAll();
const prof = T.getProfile();
const savedEq = prof.equippedCharacter;

// Keep a window in 'playing': no spawns, no bosses, no portal, no wave end.
const pinWorld = () => {
  st.spawnTimer = 999;
  st.portal = null;
  st.wave.midAt = st.time + 1e9;
  st.wave.endsAt = st.time + 1e9;
  st.wave.midBossDone = true;
};
const clearFoes = () => { st.enemies.length = 0; st.effects.length = 0; };
// A stationary, effectively unkillable planted foe (the death pass still
// reaps it normally if it ever dies).
const foe = (x, y, hp = 1e6) => {
  const e = { typeId: 'GRUNT', x, y, hp, maxHp: hp, speed: 0, damage: 0,
    flash: 0, slow: 0, elite: false, r: 8, w: 10, h: 10, age: 0, xp: 0 };
  st.enemies.push(e);
  return e;
};
// Kill a planted foe through the REAL death pass (hp drained, then one frame
// of the live loop splices it and pays p.kills++): this is "real kills".
const reap = (e) => { e.hp = 0; };
const pump = (n, perFrame) => {
  for (let i = 0; i < n; i++) {
    pinWorld();
    if (perFrame) perFrame(i);
    h.pump(1);
    if (st.mode !== 'playing') throw new Error('left playing at t=' + st.time.toFixed(2) + ' mode=' + st.mode);
  }
};
const resetUlt = (p, id) => {
  p.ultSpent = {};
  p.skillCd[id] = 0;
  p.fortify = 0;
  p.buffs.afterimage = 0;
  p.afterimageAcc = 0;
  p.afterimageTicks = 0;
  p.consecField = null;
  p.invuln = 1e9;
};
const runAs = (charId) => {
  prof.equippedCharacter = charId;
  st.mode = 'menu';
  h.elements['ov-cards'].innerHTML = '';
  T.startRun();
  h.pump(2);
  T.hudText.set(true);
  T.setPilotMode('MANUAL');   // planted-foe geometry must not drift
  h.pump(1);
  pinWorld();
  return st.player;
};

const CLASSES = [
  ['KNIGHT', 'EARTHSHATTER'],
  ['ROGUE', 'AFTERIMAGE'],
  ['PALADIN', 'CONSECRATION'],
];

for (const [charId, ultId] of CLASSES) {
  const def = C.SKILLS[ultId];
  console.log('  -- ' + charId + ' / ' + ultId + ' (KILLS ' + def.KILLS + ', floor ' + def.COOLDOWN + 's)');

  s.check(charId + ': the readout shows the label and the charging state', () => {
    const p = runAs(charId);
    resetUlt(p, ultId);
    clearFoes();
    pump(2);
    const lbl = h.elements['q-skill'].textContent;
    if (lbl !== def.LABEL) throw new Error('#q-skill = ' + JSON.stringify(lbl) + ' (want ' + def.LABEL + ')');
    const badge = h.elements['tc-q'].textContent;
    if (badge !== '0/' + def.KILLS) throw new Error('tc-q at rest = ' + JSON.stringify(badge));
    const hud = h.elements['hud'].textContent || '';
    const qLine = hud.split('\n').find(l => /^Q /.test(l)) || '';
    if (!new RegExp('^Q ' + def.LABEL + ' 0/' + def.KILLS + '(\\s|$)').test(qLine)) {
      throw new Error('text-HUD Q line: ' + JSON.stringify(qLine));
    }
    console.log('    measured: label=' + lbl + ' badge=' + JSON.stringify(badge) + ' hud=' + JSON.stringify(qLine));
  });

  s.check(charId + ': charge accrues from REAL kills; READY at exactly KILLS; leftover carries', () => {
    const p = runAs(charId);
    resetUlt(p, ultId);
    clearFoes();
    // KILLS - 1 real kills through the death pass: NOT ready, cast refused.
    const victims = [];
    for (let i = 0; i < def.KILLS - 1; i++) victims.push(foe(p.x + 500 + i, p.y + 500, 1));
    for (const v of victims) reap(v);
    pump(1);
    console.log('    measured: kills=' + p.kills + ' charge=' + ultCharge(st, ultId).charge + '/' + def.KILLS);
    if (p.kills !== def.KILLS - 1) throw new Error('death pass paid ' + p.kills + ' kills');
    if (ultCharge(st, ultId).ready) throw new Error('READY one kill early');
    if (useSkill(st, ultId) !== false) throw new Error('cast landed a kill early');
    // The KILLS-th kill plus 7 over: READY, the cast banks exactly KILLS.
    const more = [];
    for (let i = 0; i < 8; i++) more.push(foe(p.x + 500 + i, p.y + 520, 1));
    for (const v of more) reap(v);
    pump(1);
    if (!ultCharge(st, ultId).ready) throw new Error('not READY at ' + p.kills + ' kills');
    pump(1);
    const badgeRdy = h.elements['tc-q'].textContent;
    if (badgeRdy !== 'RDY') throw new Error('badge at full charge = ' + JSON.stringify(badgeRdy));
    if (useSkill(st, ultId) !== true) throw new Error('the READY cast was refused');
    const u = ultCharge(st, ultId);
    console.log('    measured: after cast charge=' + u.charge + ' (leftover) cd=' + u.cooldown.toFixed(2) +
      ' badge=' + JSON.stringify(h.elements['tc-q'].textContent));
    if (u.charge !== 7) throw new Error('leftover charge = ' + u.charge + ' (want 7: the cast banked exactly ' + def.KILLS + ')');
    if (u.cooldown <= 0) throw new Error('the floor was not armed');
    if (useSkill(st, ultId) !== false) throw new Error('a second cast chained inside the floor');
  });

  s.check(charId + ': MANA — a short pool REFUSES byte-identical; a paid cast spends exactly 60', () => {
    const p = runAs(charId);
    resetUlt(p, ultId);
    clearFoes();
    p.mana = 37.25;                       // an odd, non-round pool value, short of 60
    p.kills = def.KILLS;
    const before = p.mana;
    if (useSkill(st, ultId) !== false) throw new Error('cast landed on a short pool');
    console.log('    measured: refused at ' + before + ' -> ' + p.mana + ' (nothing spent)');
    if (p.mana !== before) throw new Error('the pool moved on refusal: ' + before + ' -> ' + p.mana);
    if (ultCharge(st, ultId).charge !== def.KILLS) throw new Error('a refusal banked charge');
    p.mana = 100;
    if (useSkill(st, ultId) !== true) throw new Error('cast refused at full charge + full pool');
    console.log('    measured: mana 100 -> ' + p.mana + ' (paid cast)');
    if (p.mana !== 100 - def.MANA) throw new Error('the pool moved by ' + (100 - p.mana) + ' (want ' + def.MANA + ')');
    p.mana = 0;
    if (useSkill(st, ultId) !== false) throw new Error('cast landed at mana 0');
    if (p.mana !== 0) throw new Error('the pool moved at 0: ' + p.mana);
  });

  s.check(charId + ': a wave roll-over (startKills advancing) does NOT reset the charge', () => {
    const p = runAs(charId);
    resetUlt(p, ultId);
    clearFoes();
    p.kills = def.KILLS - 5;
    st.wave.startKills = p.kills;         // the wave roll-over write (main.js:952)
    pump(30);                             // half a second of real frames
    const u1 = ultCharge(st, ultId);
    console.log('    measured: after roll-over charge=' + u1.charge + '/' + u1.need + ' ready=' + u1.ready);
    if (u1.charge !== def.KILLS - 5 || u1.ready) {
      throw new Error('the roll-over leaked/reset the charge: ' + JSON.stringify(u1));
    }
    const victims = [];
    for (let i = 0; i < 5; i++) victims.push(foe(p.x + 500 + i, p.y + 500, 1));
    for (const v of victims) reap(v);
    pump(1);
    if (!ultCharge(st, ultId).ready) throw new Error('not READY after the 5 post-roll-over kills');
  });

  s.check(charId + ': the cooldown floor — a dense window cannot chain it (60Hz == 120Hz)', () => {
    const p = runAs(charId);
    T.setPilotMode('AUTO_ALL');           // the pilot's cast hand is the gate under test
    // RETARGET (G21 slice 1, C2): the floor itself pays the empty-slot mult
    // (x0.80 on this zero-rewrite fixture), so the floor-bound count is read
    // off def.COOLDOWN x emptySlotCooldownMult(st) — the chain-prevention
    // mechanism under test is unchanged, only the armed number moved.
    const floor = def.COOLDOWN * emptySlotCooldownMult(st);
    const expected = 1 + Math.floor((40 - 1e-6) / floor);
    const arm = (dt) => {
      resetUlt(p, ultId);
      clearFoes();
      const anchor = foe(p.x + 10, p.y);  // the lands gate's legal target
      p.kills = 1000;                     // a dense window: charge floods in
      p.mana = p.stats.maxMana;
      h.setFrameMs(dt * 1000);
      let casts = 0;
      let prevCd = p.skillCd[ultId] || 0;
      const frames = Math.round(40 / dt);
      for (let i = 0; i < frames; i++) {
        pinWorld();
        p.invuln = 1e9;
        anchor.x = p.x + 10; anchor.y = p.y;   // the pilot kites; the target follows
        if (i === Math.round(10 / dt)) p.kills += 500;   // mid-window kill flood
        // 2026-09-17 ult mana: the pool is topped EVERY frame so this check
        // still measures ONLY the cooldown floor (the mana dimension has its
        // own contract in test_ult_mana.mjs — refill cost is not this test).
        p.mana = p.stats.maxMana;
        T.autoCast(st);
        const cd = p.skillCd[ultId] || 0;
        if (cd > prevCd + 1e-9) casts++;
        prevCd = cd;
        h.pump(1);
        if (st.mode !== 'playing') throw new Error('left playing at t=' + st.time.toFixed(2));
      }
      h.setFrameMs(1000 / 60);
      return casts;
    };
    const at60 = arm(1 / 60);
    const at120 = arm(1 / 120);
    console.log('    measured: casts@60Hz=' + at60 + ' casts@120Hz=' + at120 +
      ' over 40s with 1500 kills flooded in (floor ' + floor.toFixed(1) + 's -> ' + expected + ' expected)');
    if (at60 !== expected) throw new Error('60Hz casts ' + at60 + ' != floor-bound ' + expected);
    if (at120 !== expected) throw new Error('120Hz casts ' + at120 + ' != floor-bound ' + expected);
    if (at60 !== at120) throw new Error('dt dependence: ' + at60 + ' vs ' + at120);
    T.setPilotMode('MANUAL');
  });
}

// ---------------------------------------------------------------------------
// 3. The effects are REAL, per spec.
// ---------------------------------------------------------------------------
s.check('EARTHSHATTER: damages every enemy inside RADIUS 240 and none outside; FORTIFY halves a real hit', () => {
  const p = runAs('KNIGHT');
  const def = C.SKILLS.EARTHSHATTER;
  resetUlt(p, 'EARTHSHATTER');
  clearFoes();
  const inside = foe(p.x + 239, p.y);
  const edge = foe(p.x, p.y + 240);
  const outside = foe(p.x + 241, p.y);
  p.kills = def.KILLS;
  const want = def.DAMAGE + def.DAMAGE_MAXHP * p.stats.maxHp;
  if (useSkill(st, 'EARTHSHATTER') !== true) throw new Error('cast refused');
  const dIn = 1e6 - inside.hp, dEdge = 1e6 - edge.hp, dOut = 1e6 - outside.hp;
  console.log('    measured: dmg=' + want.toFixed(1) + ' (40 + 1.2x' + p.stats.maxHp + ') inside=' +
    dIn.toFixed(2) + ' edge=' + dEdge.toFixed(2) + ' outside=' + dOut.toFixed(2) + ' fortify=' + p.fortify);
  if (Math.abs(dIn - want) > 1e-3 || Math.abs(dEdge - want) > 1e-3) throw new Error('inside damage drifted');
  if (dOut !== 0) throw new Error('an enemy OUTSIDE the radius took ' + dOut);
  if (p.fortify !== def.FORTIFY_TIME) throw new Error('FORTIFY window = ' + p.fortify);
  const fx = st.effects.find(e => e.kind === 'nova' && e.radius === def.RADIUS);
  if (!fx) throw new Error('no nova draw effect at RADIUS 240');
  // FORTIFY: the SAME planted contact hit, through the live loop, with and
  // without the window. touchDmg is identical both arms (same frame, same
  // foe) — only the FORTIFY multiplier differs.
  clearFoes();
  const toucher = foe(p.x + 5, p.y);
  p.invuln = 0; p.fortify = 0;
  const hpA = p.hp;
  pump(1);
  const dropA = hpA - p.hp;
  if (!(dropA > 0)) throw new Error('fixture: the planted contact hit did not land');
  p.hp = hpA; p.invuln = 0; p.fortify = def.FORTIFY_TIME;
  pump(1);
  const dropB = hpA - p.hp;
  console.log('    measured: contact hit ' + dropA.toFixed(3) + ' unfortified vs ' +
    dropB.toFixed(3) + ' fortified (x' + def.FORTIFY_MULT + ')');
  if (Math.abs(dropB - dropA * def.FORTIFY_MULT) > 1e-6) {
    throw new Error('FORTIFY did not halve the hit: ' + dropA + ' -> ' + dropB);
  }
  if (!(p.fortify < def.FORTIFY_TIME && p.fortify > 0)) throw new Error('FORTIFY did not tick with dt: ' + p.fortify);
  resetUlt(p, 'EARTHSHATTER');
});

s.check('AFTERIMAGE: detonations on the move through the ONE blast path; the x1.5 speed is live; 60/120 parity', () => {
  const p = runAs('ROGUE');
  const def = C.SKILLS.AFTERIMAGE;
  resetUlt(p, 'AFTERIMAGE');
  clearFoes();
  // Speed: MANUAL pilot, held ArrowRight, one second unbuffed vs one second
  // inside the window. Same controller seam, only SPEED_MULT differs.
  // ARENA SCALE-UP FIXTURE RETARGET (2026-09-17, 2nd fix): the relief grade
  // multiplies movement speed by up to ±0.36 per level, and the two windows
  // sample different ground (the buffed window also covers ~1.5x the distance,
  // so even rewinding to the same start leaves a different average grade —
  // measured x1.4777 vs spec x1.5 on ~1/6 runs). The probe now pins the run's
  // groundSeed to 1, whose VERDANT corridor (x -200..-20 at y=0, level 1
  // throughout — verified against reliefLevel directly) is grade-flat, so the
  // ratio measures ONLY the ult's speed. The ratio assertion is unchanged.
  st.groundSeed = 1;
  p.x = -200; p.y = 0;
  h.key('keydown', { key: 'ArrowRight' });
  let x0 = p.x;
  pump(60);
  const dxBase = p.x - x0;
  p.kills = def.KILLS;
  if (useSkill(st, 'AFTERIMAGE') !== true) throw new Error('cast refused');
  x0 = p.x;
  pump(60);
  const dxUlt = p.x - x0;
  h.key('keyup', { key: 'ArrowRight' });
  const ratio = dxUlt / dxBase;
  console.log('    measured: 1s move ' + dxBase.toFixed(2) + 'px unbuffed vs ' + dxUlt.toFixed(2) +
    'px in-window -> x' + ratio.toFixed(4) + ' (spec x' + def.SPEED_MULT + ')');
  if (Math.abs(ratio - def.SPEED_MULT) > 0.02) throw new Error('speed multiplier not live: x' + ratio);
  // Detonations: a pinned foe, ALL weapon fire suppressed (granted weapons
  // removed AND the base volley's attackTimer pinned — it fires from
  // runController, not from st.weapons), 3s window at both rates. The frame
  // loop REPLACES state.effects every frame, so a push-wrap dies — count by
  // identity-scanning the live array instead.
  const detArm = (dt) => {
    resetUlt(p, 'AFTERIMAGE');
    clearFoes();
    const target = foe(p.x, p.y);
    p.kills = def.KILLS;
    st.weapons.length = 0;
    const seen = new Set();
    let booms = 0;
    h.setFrameMs(dt * 1000);
    // 2026-09-17 ult mana: top the pool (the speed-measurement cast earlier in
    // this check already spent 60; detonations are what is measured here —
    // the mana contract lives in test_ult_mana.mjs).
    p.mana = p.stats.maxMana;
    useSkill(st, 'AFTERIMAGE');
    const per = def.DAMAGE + def.DAMAGE_WEAPON * (p.stats.damage || 0);
    const frames = Math.round(def.DURATION / dt) + Math.round(0.2 / dt);   // window + settle
    for (let i = 0; i < frames; i++) {
      pinWorld();
      p.invuln = 1e9;
      target.x = p.x; target.y = p.y;                       // she detonates where she IS
      p.attackTimer = 999;   // the BASE volley fires from runController's own
      h.pump(1);             // attackTimer, not from st.weapons — pin it here
      if (st.mode !== 'playing') throw new Error('left playing');
      for (const e of st.effects) {
        if (e.kind === 'rewrite_boom' && !seen.has(e)) { seen.add(e); booms++; }
      }
    }
    h.setFrameMs(1000 / 60);
    return { booms, drop: 1e6 - target.hp, per };
  };
  const a = detArm(1 / 60);
  const b = detArm(1 / 120);
  const wantTicks = Math.round(def.DURATION / def.TICK);   // 12
  console.log('    measured: detonations@60Hz=' + a.booms + ' @120Hz=' + b.booms +
    ' (TICK ' + def.TICK + 's over ' + def.DURATION + 's -> ' + wantTicks + '), damage/blast=' +
    a.per.toFixed(1) + ' foe drop ' + a.drop.toFixed(3) + ' vs ' + b.drop.toFixed(3));
  if (a.booms !== wantTicks || b.booms !== wantTicks) throw new Error('detonation count drifted');
  if (Math.abs(a.drop - wantTicks * a.per) > 1e-3) throw new Error('blast damage drifted: ' + a.drop);
  if (Math.abs(a.drop - b.drop) > 1e-3) throw new Error('60/120Hz damage mismatch');
  resetUlt(p, 'AFTERIMAGE');
});

s.check('CONSECRATION: densest-cluster placement, full 6s of ticks, inside-only capped heals; 60/120 parity', () => {
  const p = runAs('PALADIN');
  const def = C.SKILLS.CONSECRATION;
  resetUlt(p, 'CONSECRATION');
  clearFoes();
  // Placement: a 3-strong cluster beats a loner; the field lands on it.
  foe(p.x + 180, p.y);
  foe(p.x + 200, p.y + 10);
  foe(p.x + 220, p.y);
  foe(p.x - 320, p.y);
  p.kills = def.KILLS;
  if (useSkill(st, 'CONSECRATION') !== true) throw new Error('cast refused');
  const f = p.consecField;
  console.log('    measured: field at (' + f.x.toFixed(0) + ',' + f.y.toFixed(0) + ') player at (' +
    p.x.toFixed(0) + ',' + p.y.toFixed(0) + ') — cluster was ~+200');
  if (Math.abs(f.x - (p.x + 200)) > 30 || Math.abs(f.y - p.y) > 30) {
    throw new Error('the field missed the densest cluster: ' + f.x + ',' + f.y);
  }
  const fxNova = st.effects.find(e => e.kind === 'nova' && e.radius === def.RADIUS && e.ttl === def.DURATION);
  if (!fxNova) throw new Error('no 6s field draw effect at RADIUS 140');
  // Ticks: one foe pinned inside, one outside, weapons suppressed, 6.5s.
  const tickArm = (dt) => {
    resetUlt(p, 'CONSECRATION');
    clearFoes();
    p.kills = def.KILLS;
    p.mana = p.stats.maxMana;       // 2026-09-17: the placement cast above spent 60
    useSkill(st, 'CONSECRATION');   // empty field -> placed AT the player (the fallback)
    const fld = p.consecField;
    if (Math.hypot(fld.x - p.x, fld.y - p.y) > 1e-9) throw new Error('empty-field fallback missed the player');
    const inside = foe(fld.x, fld.y);
    const outside = foe(fld.x + 200, fld.y);
    st.weapons.length = 0;   // granted weapons out; the base volley is pinned below
    h.setFrameMs(dt * 1000);
    const frames = Math.round((def.DURATION + 0.5) / dt);
    for (let i = 0; i < frames; i++) {
      pinWorld();
      p.invuln = 1e9;
      inside.x = fld.x; inside.y = fld.y;
      p.attackTimer = 999;   // the base volley fires from runController, not st.weapons
      h.pump(1);
      if (st.mode !== 'playing') throw new Error('left playing');
    }
    h.setFrameMs(1000 / 60);
    return { dIn: 1e6 - inside.hp, dOut: 1e6 - outside.hp, cleared: p.consecField === null };
  };
  const t60 = tickArm(1 / 60);
  const t120 = tickArm(1 / 120);
  const wantTotal = def.DPS * def.DURATION;   // 108 over the full 6s
  console.log('    measured: tick damage over the field life inside=' + t60.dIn.toFixed(3) +
    ' (@120Hz ' + t120.dIn.toFixed(3) + ', spec ' + wantTotal + ') outside=' + t60.dOut +
    ' field cleared=' + t60.cleared);
  if (Math.abs(t60.dIn - wantTotal) > 1e-3 || Math.abs(t120.dIn - wantTotal) > 1e-3) {
    throw new Error('tick total drifted: ' + t60.dIn + ' / ' + t120.dIn);
  }
  if (t60.dOut !== 0) throw new Error('an enemy OUTSIDE the field took ' + t60.dOut);
  if (!t60.cleared || !t120.cleared) throw new Error('the field outlived its 6s');
  // Heals: kills INSIDE bank HEAL_PER_KILL each, paid at the tick, capped at
  // DPS*TICK (9) with the excess dropped; kills OUTSIDE pay nothing.
  resetUlt(p, 'CONSECRATION');
  clearFoes();
  p.kills = def.KILLS;
  p.hp = p.stats.maxHp - 100;
  st.weapons.length = 0;   // no weapon may kill near the field mid-measurement
  p.mana = p.stats.maxMana;   // 2026-09-17: this check's earlier casts spent 60 each
  useSkill(st, 'CONSECRATION');
  const fld2 = { x: p.consecField.x, y: p.consecField.y };
  const hp0 = p.hp;
  // 3 kills inside -> +6 at the first tick.
  for (let i = 0; i < 3; i++) { const v = foe(fld2.x + 10 * i, fld2.y, 1); reap(v); }
  pump(1);                                    // the death pass banks them
  pump(Math.round(def.TICK * 60));            // the first tick lands
  const heal1 = p.hp - hp0;
  // 10 kills inside -> the cap bites: +9, and the excess is DROPPED (tick 2: +0).
  const hp1 = p.hp;
  for (let i = 0; i < 10; i++) { const v = foe(fld2.x + 10 * i, fld2.y + 5, 1); reap(v); }
  pump(1);
  pump(Math.round(def.TICK * 60));
  const heal2 = p.hp - hp1;
  const hp2 = p.hp;
  pump(Math.round(def.TICK * 60));            // a third tick, no new kills
  const heal3 = p.hp - hp2;
  // 4 kills OUTSIDE the field -> nothing.
  const hp3 = p.hp;
  for (let i = 0; i < 4; i++) { const v = foe(fld2.x + 300 + 10 * i, fld2.y, 1); reap(v); }
  pump(1);
  pump(Math.round(def.TICK * 60));
  const heal4 = p.hp - hp3;
  console.log('    measured: heals ' + heal1.toFixed(1) + ' (3 inside kills), ' + heal2.toFixed(1) +
    ' (10 inside, cap 9), ' + heal3.toFixed(1) + ' (excess dropped), ' + heal4.toFixed(1) + ' (4 outside)');
  if (Math.abs(heal1 - 3 * def.HEAL_PER_KILL) > 1e-6) throw new Error('inside-kill heal drifted: ' + heal1);
  if (Math.abs(heal2 - def.DPS * def.TICK) > 1e-6) throw new Error('the tick-rate cap did not bite: ' + heal2);
  if (heal3 !== 0) throw new Error('the over-cap bank was not dropped: +' + heal3);
  if (heal4 !== 0) throw new Error('outside kills healed: +' + heal4);
  resetUlt(p, 'CONSECRATION');
});

prof.equippedCharacter = savedEq;
s.done();
