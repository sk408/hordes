// HORDES — N1 slice 1: the Witch's Q = CHAIN REACTION (goals doc N1b item 3,
// owner-confirmed; docs/briefs/N1_CHAIN_REACTION_Q.md).
//
// The contract under test: the Q EXCEEDS her gun (WEAPONS.ZAP) on jumps and
// reach with GENTLER falloff, FROST_NOVA's slow rides the chain with its
// constants unchanged, every enemy the chain KILLS detonates through the ONE
// existing blast (rewrites.js boomBlast: 6 mana funded / dry fallback, never
// a second blast), the draftable Chain Reaction card and her gun are
// untouched, and the per-class routing (classSkillId) lands the new skill on
// the Witch alone. Every number is MEASURED through the real seams — useSkill,
// the live death pass, startRun's Q label — never asserted from a copy.
import { suite, boot } from './_harness.mjs';
import { CONFIG as C } from '../src/config.js';
import { WEAPONS } from '../src/weapons.js';
import { CHARACTERS } from '../src/meta.js';
import { skillManaCost } from '../src/perks.js';
import { useSkill } from '../src/skills.js';
import { boomBlast, grantRewrite, rewriteCards } from '../src/rewrites.js';

const s = suite('test_chain_q');
const Q = C.SKILLS.CHAIN_REACTION, ZAP = WEAPONS.ZAP, FN = C.SKILLS.FROST_NOVA;

// ---------------------------------------------------------------------------
// 1. Pure pins: the exceed-on-every-axis rule, and everything that must NOT
//    move (the gun, FROST_NOVA, the draftable card, the class rows).
// ---------------------------------------------------------------------------
s.check('the Q exceeds the gun on jumps and reach, with GENTLER falloff', () => {
  if (!(Q.JUMPS > ZAP.JUMPS)) throw new Error('jumps ' + Q.JUMPS + ' <= gun ' + ZAP.JUMPS);
  if (!(Q.CHAIN_RANGE > ZAP.CHAIN_RANGE)) throw new Error('range ' + Q.CHAIN_RANGE + ' <= gun ' + ZAP.CHAIN_RANGE);
  // GENTLER falloff = damage decays SLOWER per jump: a HIGHER multiplier,
  // still below 1 (it must decay).
  if (!(Q.FALLOFF > ZAP.FALLOFF && Q.FALLOFF < 1)) {
    throw new Error('falloff ' + Q.FALLOFF + ' not gentler than the gun\'s ' + ZAP.FALLOFF);
  }
  // It must read as the deliberate burst: far slower cadence than the gun.
  if (!(Q.COOLDOWN > ZAP.COOLDOWN * 2)) throw new Error('cooldown ' + Q.COOLDOWN + ' is gun cadence, not a burst');
});

s.check('WEAPONS.ZAP is untouched (the shipped literals, pinned)', () => {
  const want = { NAME: 'Chain Zap', COOLDOWN: 1.4, DAMAGE_MULT: 1.0, JUMPS: 3, CHAIN_RANGE: 90, FALLOFF: 0.75, MANA: 4 };
  for (const k of Object.keys(want)) {
    if (ZAP[k] !== want[k]) throw new Error('ZAP.' + k + ' = ' + ZAP[k] + ' (pinned ' + want[k] + ')');
  }
});

s.check('FROST_NOVA is untouched (balance + shape) and the Q carries ITS slow', () => {
  const want = { KEY: 'q', NAME: 'Frost Nova', MANA: 30, COOLDOWN: 8, RADIUS: 85, DAMAGE: 15, SLOW: 2.5, SLOW_FACTOR: 0.45 };
  for (const k of Object.keys(want)) {
    if (FN[k] !== want[k]) throw new Error('FROST_NOVA.' + k + ' = ' + FN[k] + ' (pinned ' + want[k] + ')');
  }
  if (Q.SLOW !== FN.SLOW || Q.SLOW_FACTOR !== FN.SLOW_FACTOR) {
    throw new Error('the slow moved with different constants: Q ' + Q.SLOW + '/' + Q.SLOW_FACTOR +
      ' vs FROST_NOVA ' + FN.SLOW + '/' + FN.SLOW_FACTOR);
  }
});

s.check('the Witch row points at the Q; the other three classes keep FROST_NOVA', () => {
  if (CHARACTERS.WITCH.skill !== 'CHAIN_REACTION') {
    throw new Error('WITCH.skill = ' + CHARACTERS.WITCH.skill);
  }
  for (const id of ['KNIGHT', 'ROGUE', 'PALADIN']) {
    if (CHARACTERS[id].skill !== 'FROST_NOVA') {
      throw new Error(id + '.skill = ' + CHARACTERS[id].skill + ' (must keep FROST_NOVA)');
    }
  }
  // The gun stays her starting weapon.
  if (CHARACTERS.WITCH.startingWeapon !== 'ZAP') throw new Error('WITCH lost her starting ZAP');
});

s.check('the draftable Chain Reaction card is still in the pool, un-nerfed', () => {
  const cards = rewriteCards({ player: {} });   // a run holding nothing
  const boom = cards.find(c => c.rewrite === 'onkillboom');
  if (!boom) throw new Error('the onkillboom card left the draft pool');
  if (boom.weight !== 0.02) throw new Error('card weight ' + boom.weight + ' (pinned 0.02)');
  // The ONE blast: the card's helper and the Q's detonations read the same
  // pure function, so there cannot be a second blast implementation.
  const p = { mana: 100, stats: { damage: 10 } };
  const b = boomBlast(p);
  if (b.radius !== 40 || b.manaCost !== 6 || b.damage !== 4 + 0.5 * 10) {
    throw new Error('boomBlast drifted: ' + JSON.stringify(b));
  }
});

// ---------------------------------------------------------------------------
// 2. Live behavior: a real Witch run, planted fields, measured through
//    useSkill and the real death pass.
// ---------------------------------------------------------------------------
const h = await boot({ storage: [['hordes_onboarded', '1']] });
const T = h.T, st = T.state;
T.banners.suppressAll();
const prof = T.getProfile();
const savedEq = prof.equippedCharacter;
prof.equippedCharacter = 'WITCH';
st.mode = 'menu';
h.elements['ov-cards'].innerHTML = '';
T.startRun();
h.pump(2);
const p = st.player;
const plant = (x, y, hp) => ({ typeId: 'CHASER', x, y, w: 10, hp, maxHp: hp,
  speed: 30, mx: 0, my: 0, age: 0, elite: false });
// The live spawner must not add bodies mid-measurement.
const quiet = () => { st.spawnTimer = 999; st.enemies.length = 0; st.effects.length = 0; };

s.check('the Q label is runtime-owned: startRun writes CHAIN on the Witch', () => {
  T.hudText.set(true);                         // the ASCII HUD seam (test_skill_key_letters)
  h.pump(1);
  if (h.elements['q-skill'].textContent !== 'CHAIN') {
    throw new Error('q-skill label = ' + JSON.stringify(h.elements['q-skill'].textContent));
  }
  const hudLine = (h.elements['hud'].textContent || '').split('\n').find(l => /Q /.test(l)) || '';
  if (!/Q ChainReaction/.test(hudLine)) throw new Error('the text HUD names the wrong Q: ' + hudLine);
});

s.check('the chain walks primary + JUMPS at a spacing the GUN cannot jump', () => {
  quiet();
  // 110px apart: beyond ZAP.CHAIN_RANGE (90), inside Q.CHAIN_RANGE (130).
  const SP = 110;
  for (let i = 0; i < 8; i++) st.enemies.push(plant(p.x + SP * (i + 1), p.y, 1000));
  p.mana = 150; p.skillCd.CHAIN_REACTION = 0;
  if (useSkill(st, 'CHAIN_REACTION') !== true) throw new Error('the cast returned false');
  const touched = st.enemies.filter(e => e.hp < 1000);
  if (touched.length !== 1 + Q.JUMPS) {
    throw new Error('touched ' + touched.length + ' (want primary + ' + Q.JUMPS + ' jumps)');
  }
  const cost = skillManaCost('CHAIN_REACTION', st);
  if (cost !== Q.MANA * 0.5) throw new Error('Witch pays ' + cost + ' (manaCostMult 0.5 x ' + Q.MANA + ')');
  if (150 - p.mana !== cost) throw new Error('the cast spent ' + (150 - p.mana) + ' (want ' + cost + ')');
  // Nothing died (hp 1000): no detonation flags, no boom effects.
  if (st.enemies.some(e => e.chainBoom)) throw new Error('a surviving enemy was flagged chainBoom');
  if (st.effects.some(e => e.kind === 'rewrite_boom')) throw new Error('no-kill cast detonated');
});

s.check('FROST_NOVA\'s slow lands on every enemy the chain TOUCHES', () => {
  const touched = st.enemies.filter(e => e.hp < 1000);
  if (touched.length === 0) throw new Error('no touched enemies to inspect');
  for (const e of touched) {
    if (e.slow !== FN.SLOW) throw new Error('touched enemy slow ' + e.slow + ' (want ' + FN.SLOW + ')');
  }
  const untouched = st.enemies.filter(e => e.hp === 1000);
  for (const e of untouched) {
    if (e.slow > 0) throw new Error('an untouched enemy was slowed');
    if (!e.chainBoom && e.flash) throw new Error('an untouched enemy was flashed');
  }
  // The damage ladder: strike j pays (DAMAGE + FRAC*dmg) * FALLOFF^j exactly.
  const perHit = Q.DAMAGE + Q.DAMAGE_FRAC * p.stats.damage;
  const sorted = touched.slice().sort((a, b) => a.x - b.x);
  for (let j = 0; j < sorted.length; j++) {
    const want = perHit * Math.pow(Q.FALLOFF, j);
    if (Math.abs(1000 - sorted[j].hp - want) > 1e-9) {
      throw new Error('strike ' + j + ' dealt ' + (1000 - sorted[j].hp) + ' (want ' + want + ')');
    }
  }
});

s.check('every enemy the chain KILLS detonates through the ONE blast (funded: 6 mana)', () => {
  quiet();
  p.potions.mp = 0;                            // AUTO_DRINK must not refuel mid-measurement
  p.skillCd.OVERCHARGE = 99;
  for (let i = 0; i < 7; i++) st.enemies.push(plant(p.x + 30 + i * 25, p.y, 5));   // all die
  const witness = { ...plant(p.x + 30 + 7 * 25, p.y, 1000), elite: true };        // beyond jump 6
  // FIXTURE RETARGET (not an assertion change): the witness must not be plain
  // trash. Each of the 7 corpse kills rolls FLASH DROP (loot.js
  // shouldFlashDrop), and a hit erases EVERY flash-eligible CHASER on the
  // field — the witness included, at hp 0 — which made this check red ~12% of
  // runs for a reason it does not measure. `elite` is the loot.js:325
  // flash-exempt flag, so the witness is now hit by the corpse blasts alone.
  st.enemies.push(witness);
  p.mana = 150; p.skillCd.CHAIN_REACTION = 0;
  useSkill(st, 'CHAIN_REACTION');
  const flagged = st.enemies.filter(e => e.chainBoom).length;
  if (flagged !== 7) throw new Error(flagged + ' corpses flagged (want 7: every chain kill)');
  h.pump(2);                                   // the real death pass runs here
  const booms = st.effects.filter(e => e.kind === 'rewrite_boom');
  if (booms.length !== 7) throw new Error(booms.length + ' detonations (want 7)');
  for (const b of booms) {
    if (b.radius !== 40) throw new Error('funded detonation radius ' + b.radius + ' (want BOOM_RADIUS 40)');
  }
  if (Math.abs(p.mana - (150 - skillManaCost('CHAIN_REACTION', st) - 7 * 6)) > 0.1) {
    throw new Error('mana after 7 funded detonations = ' + p.mana.toFixed(2) +
      ' (want 150 - 15 cast - 42 blasts = 93 + regen)');
  }
  // The witness: not chained (jumps exhausted), hit by exactly the corpses
  // within BOOM_RADIUS — measured against the same pure blast helper.
  const blast = boomBlast(p);
  let nearCorpses = 0;
  for (let i = 0; i < 7; i++) {
    if (Math.hypot((p.x + 30 + i * 25) - witness.x, 0) <= 40) nearCorpses++;
  }
  if (nearCorpses !== 1) throw new Error('fixture drift: ' + nearCorpses + ' corpses in blast range of the witness');
  if (Math.abs(1000 - witness.hp - nearCorpses * blast.damage) > 1e-9) {
    throw new Error('witness took ' + (1000 - witness.hp) + ' (want ' + nearCorpses + ' x ' + blast.damage + ')');
  }
});

s.check('a DRY pool still detonates: smaller, free (the soft gate, never dark)', () => {
  quiet();
  p.potions.mp = 0;
  p.skillCd.OVERCHARGE = 99;
  st.enemies.push(plant(p.x + 30, p.y, 5), plant(p.x + 55, p.y, 5));
  p.mana = 16; p.skillCd.CHAIN_REACTION = 0;
  useSkill(st, 'CHAIN_REACTION');              // spends 15, leaves 1 (< 6: dry)
  if (p.mana !== 1) throw new Error('post-cast mana ' + p.mana + ' (want exactly 1)');
  h.pump(2);
  const booms = st.effects.filter(e => e.kind === 'rewrite_boom');
  if (booms.length !== 2) throw new Error(booms.length + ' dry detonations (want 2)');
  for (const b of booms) {
    if (b.radius !== 40 * 0.6) throw new Error('dry detonation radius ' + b.radius + ' (want 24 = 40 x 0.6)');
  }
  if (p.mana > 1.1) throw new Error('dry detonations spent mana: pool now ' + p.mana.toFixed(2));
});

s.check('an aimed cast into an EMPTY field never happens (no spend, no cooldown)', () => {
  quiet();
  p.mana = 150; p.skillCd.CHAIN_REACTION = 0;
  if (useSkill(st, 'CHAIN_REACTION') !== false) throw new Error('empty-field cast returned true');
  if (p.mana !== 150) throw new Error('empty-field cast spent ' + (150 - p.mana) + ' mana');
  if (p.skillCd.CHAIN_REACTION !== 0) throw new Error('empty-field cast armed the cooldown');
});

s.check('a rewrite-holding Witch detonates each corpse exactly ONCE (no double blast)', () => {
  quiet();
  grantRewrite(st, 'onkillboom');              // the draftable card, real seam
  p.potions.mp = 0; p.skillCd.OVERCHARGE = 99;
  st.enemies.push(plant(p.x + 30, p.y, 5));
  p.mana = 150; p.skillCd.CHAIN_REACTION = 0;
  useSkill(st, 'CHAIN_REACTION');
  h.pump(2);
  const booms = st.effects.filter(e => e.kind === 'rewrite_boom');
  if (booms.length !== 1) {
    throw new Error(booms.length + ' detonations for one corpse (the Q flag + the card must not stack)');
  }
  if (Math.abs(p.mana - (150 - skillManaCost('CHAIN_REACTION', st) - 6)) > 0.1) {
    throw new Error('double-charged: mana ' + p.mana.toFixed(2) + ' (want one 6-mana detonation)');
  }
});

s.check('the autopilot casts the Q with no RADIUS gate: any live enemy lands it', () => {
  quiet();
  p.rewrites = {};                             // drop the card from the probe above
  p.potions.mp = 0; p.skillCd.OVERCHARGE = 99;
  // 300px away: beyond every skill RADIUS in the game — only the RADIUS-less
  // fallback ("any live enemy") can justify this cast.
  st.enemies.push(plant(p.x + 300, p.y, 1000));
  p.mana = 150;
  p.skillCd.CHAIN_REACTION = 0;                // ready: the pilot's own gate
  h.pump(1);
  // A cast through the LIVE loop (autoCastSkills -> useSkill) re-arms the full
  // cooldown AND strikes the target; a no-cast frame leaves cd at 0.
  if (!(p.skillCd.CHAIN_REACTION > 7.9)) {
    throw new Error('the pilot did not cast (cd ' + p.skillCd.CHAIN_REACTION.toFixed(2) + ')');
  }
  if (!st.enemies.some(e => e.hp < 1000)) throw new Error('the pilot cast struck nothing at 300px');
});

s.check('60Hz and 120Hz: strikes and detonations pay identically per EVENT (dt-free)', () => {
  for (const [dt, hz] of [[1 / 60, '60Hz'], [1 / 120, '120Hz']]) {
    quiet();
    st.enemies.push(plant(p.x + 30, p.y, 5), plant(p.x + 80, p.y, 5));   // both die -> detonate
    p.potions.mp = 0; p.skillCd.OVERCHARGE = 99;
    p.mana = 150; p.skillCd.CHAIN_REACTION = 0;
    h.setFrameMs(dt * 1000);
    useSkill(st, 'CHAIN_REACTION');
    const manaAtCast = p.mana;
    h.pump(2);                                 // the death pass detonates at THIS rate
    h.setFrameMs(1000 / 60);
    const booms = st.effects.filter(e => e.kind === 'rewrite_boom');
    if (booms.length !== 2) throw new Error(hz + ': ' + booms.length + ' detonations (want 2)');
    const spent = manaAtCast - p.mana;         // regen is dt-scaled; 2 blasts are events
    if (Math.abs(spent - 12) > 0.05) {
      throw new Error(hz + ': detonations spent ' + spent.toFixed(3) + ' mana (want 2 x 6 = 12)');
    }
  }
});

// ---------------------------------------------------------------------------
// 3. The other classes are untouched by the routing: KNIGHT keeps the nova.
// ---------------------------------------------------------------------------
s.check('KNIGHT keeps FROST_NOVA in the Q slot (routing changed the Witch alone)', () => {
  prof.equippedCharacter = 'KNIGHT';
  st.mode = 'menu';
  h.elements['ov-cards'].innerHTML = '';
  T.startRun();
  h.pump(2);
  T.hudText.set(true);
  h.pump(1);
  if (h.elements['q-skill'].textContent !== 'FROST') {
    throw new Error('KNIGHT Q label = ' + JSON.stringify(h.elements['q-skill'].textContent));
  }
  const hudLine = (h.elements['hud'].textContent || '').split('\n').find(l => /Q /.test(l)) || '';
  if (!/Q FrostNova/.test(hudLine)) throw new Error('KNIGHT HUD Q line: ' + hudLine);
  // And the nova still novas (its own branch, unchanged).
  st.spawnTimer = 999; st.enemies.length = 0; st.effects.length = 0;
  st.enemies.push(plant(st.player.x + 40, st.player.y, 1000));
  st.player.mana = 150; st.player.skillCd.FROST_NOVA = 0;
  if (useSkill(st, 'FROST_NOVA') !== true) throw new Error('FROST_NOVA failed to fire');
  const e = st.enemies.find(x => x.hp < 1000);
  if (!e || Math.abs(1000 - e.hp - FN.DAMAGE) > 1e-9) throw new Error('nova damage drifted');
  prof.equippedCharacter = savedEq;
});

s.done();
