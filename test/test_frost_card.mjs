// HORDES — N1 slice 2: the draftable FROST_NOVA card ("Pocket Frost"),
// docs/briefs/N1_SLICE2_FROST_CARD.md.
//
// The contract under test: the card is offered exactly when the run's class Q
// is not FROST_NOVA (predicate read against the LIVE class skill id, never a
// hardcoded class list), it is taken once and leaves the pool, FROST_NOVA's
// six config constants are untouched (the owner ruled NO balance change), a
// held card fires the REAL nova through useSkill on FROST_NOVA's OWN cooldown
// (120s at cooldown 8 -> 15 casts, identical at 60Hz and 120Hz), a dry pool
// means ZERO casts and never a negative pool, and with the card not held
// there is no FROST_NOVA source at all in a Witch run. Every cast is MEASURED
// through the live loop (the p.skillCd.FROST_NOVA re-arm), never asserted
// from a copy.
import { suite, boot } from './_harness.mjs';
import { CONFIG as C } from '../src/config.js';
import { CHARACTERS } from '../src/meta.js';
import {
  FROST_CARD_ID, FROST_CARD_WEIGHT,
  frostCard, frostCardOffered, grantFrost, hasFrost, frostCardTick,
} from '../src/frostcard.js';

const s = suite('test_frost_card');
const FN = C.SKILLS.FROST_NOVA;

// ---------------------------------------------------------------------------
// 1. Pure pins: constants, card shape, the offer predicate, taken-once.
// ---------------------------------------------------------------------------
s.check('FROST_NOVA is untouched (the six pinned constants, re-asserted)', () => {
  const want = { MANA: 30, COOLDOWN: 8, RADIUS: 85, DAMAGE: 15, SLOW: 2.5, SLOW_FACTOR: 0.45 };
  for (const k of Object.keys(want)) {
    if (FN[k] !== want[k]) throw new Error('FROST_NOVA.' + k + ' = ' + FN[k] + ' (pinned ' + want[k] + ')');
  }
});

s.check('the card is shaped like the perk family (id, skill key, weight, apply)', () => {
  const c = frostCard();
  if (c.id !== FROST_CARD_ID || c.id !== 'skill_frost') throw new Error('card id = ' + c.id);
  if (c.skill !== 'frost') throw new Error('card skill key = ' + c.skill);
  if (c.weight !== FROST_CARD_WEIGHT || c.weight !== 0.04) throw new Error('card weight = ' + c.weight);
  const p = {};
  c.apply(p);
  if (!p.skills || p.skills.frost !== true) throw new Error('apply wrote ' + JSON.stringify(p.skills));
});

s.check('NOT offered while the class Q is FROST_NOVA (a synthetic row — every real row moved on)', () => {
  // RETARGET (N1 slice 3): all three non-Witch rows now carry their own ults,
  // so NO shipped class row has a FROST_NOVA Q anymore — the NOT-offered arm
  // can only be pinned on a synthetic FROST_NOVA character row, and the four
  // REAL rows all sit in the offered arm (checked below).
  const synthetic = { player: { skills: {} }, character: { skill: 'FROST_NOVA' } };
  if (frostCardOffered(synthetic)) throw new Error('offered on a synthetic FROST_NOVA Q');
});

s.check('IS offered when the class Q is something else (all four real rows, plus a synthetic)', () => {
  for (const id of ['KNIGHT', 'WITCH', 'ROGUE', 'PALADIN']) {
    const st = { player: { skills: {} }, character: CHARACTERS[id] };
    if (!frostCardOffered(st)) {
      throw new Error('not offered on ' + id + ' (Q = ' + CHARACTERS[id].skill + ')');
    }
  }
  const synthetic = { player: { skills: {} }, character: { skill: 'OVERCHARGE' } };
  if (!frostCardOffered(synthetic)) throw new Error('not offered on a synthetic non-FROST_NOVA Q');
});

s.check('taken once: after grantFrost the card leaves the pool (perk-family contract)', () => {
  const st = { player: { skills: {} }, character: CHARACTERS.WITCH };
  if (!grantFrost(st)) throw new Error('grantFrost refused a real state');
  if (!hasFrost(st)) throw new Error('grantFrost did not set the flag');
  if (frostCardOffered(st)) throw new Error('still offered after the take');
  if (grantFrost(null) || grantFrost({})) throw new Error('grantFrost accepted a non-state');
});

// ---------------------------------------------------------------------------
// 2. Live behavior: a real WITCH run, 120s fixed-dt windows, casts measured
//    through the ONE cooldown slot. The wave/boss/portal machinery is pinned
//    quiet so the window never leaves 'playing'.
// ---------------------------------------------------------------------------
const h = await boot({ storage: [['hordes_onboarded', '1']] });
const T = h.T, st = T.state;
T.banners.suppressAll();
const prof = T.getProfile();
prof.equippedCharacter = 'WITCH';                 // her Q is CHAIN_REACTION: the card is offerable
st.mode = 'menu';
h.elements['ov-cards'].innerHTML = '';
T.startRun();
h.pump(2);
const p = st.player;

// Keep the 120s window in 'playing': no spawns, no bosses, no portal, no
// deaths, no drafts (no kills -> no XP), and the wave never ends.
const pinFrame = (mana) => {
  st.spawnTimer = 999;
  st.enemies.length = 0;
  st.portal = null;
  st.wave.midAt = st.time + 1e9;
  st.wave.endsAt = st.time + 1e9;
  st.wave.midBossDone = true;
  p.invuln = 1e9;
  if (mana !== undefined) p.mana = mana;
};
// Count FROST_NOVA casts by the cooldown RE-ARM (0 -> COOLDOWN): the only
// writer of that slot is useSkill, so a jump upward IS a cast.
const simWindow = (seconds, dt, mana) => {
  h.setFrameMs(dt * 1000);
  let casts = 0, lowestMana = Infinity;
  let prevCd = p.skillCd.FROST_NOVA || 0;
  const frames = Math.round(seconds / dt);
  for (let i = 0; i < frames; i++) {
    pinFrame(mana);
    h.pump(1);
    if (st.mode !== 'playing') throw new Error('left playing at t=' + st.time.toFixed(2) + ' mode=' + st.mode);
    const cd = p.skillCd.FROST_NOVA || 0;
    if (cd > prevCd + 1e-9) casts++;
    prevCd = cd;
    if (p.mana < lowestMana) lowestMana = p.mana;
  }
  h.setFrameMs(1000 / 60);
  return { casts, lowestMana };
};

let n60 = 0, n120 = 0;
s.check('120s with the card held and mana pinned HIGH: 15 casts at BOTH 60Hz and 120Hz', () => {
  grantFrost(st);
  p.skillCd.FROST_NOVA = 0;
  const hi = () => p.stats.maxMana;
  const a = simWindow(120, 1 / 60, hi());
  const b = simWindow(120, 1 / 120, hi());
  n60 = a.casts; n120 = b.casts;
  console.log('    measured: casts@60Hz=' + n60 + ' casts@120Hz=' + n120 +
    ' (cooldown ' + FN.COOLDOWN + 's over 120s -> 15 expected, 13-17 accepted)');
  if (n60 < 13 || n60 > 17) throw new Error('60Hz casts ' + n60 + ' outside 13-17');
  if (n120 < 13 || n120 > 17) throw new Error('120Hz casts ' + n120 + ' outside 13-17');
  if (n60 !== n120) throw new Error('dt dependence: 60Hz ' + n60 + ' != 120Hz ' + n120);
});

s.check('mana pinned at 0: ZERO casts and the pool NEVER goes negative', () => {
  p.skillCd.FROST_NOVA = 0;
  p.potions.mp = 0;                             // AUTO_DRINK must not refuel mid-measurement
  const r = simWindow(120, 1 / 60, 0);
  console.log('    measured: casts=' + r.casts + ' lowestMana=' + r.lowestMana.toFixed(4));
  if (r.casts !== 0) throw new Error('cast with an empty pool: ' + r.casts + ' casts');
  if (r.lowestMana < 0) throw new Error('pool went negative: ' + r.lowestMana);
});

s.check('card NOT held: ZERO casts in the same window (the card is the only source)', () => {
  p.skills = {};                                // drop the card
  if (hasFrost(st)) throw new Error('fixture: flag still set');
  p.skillCd.FROST_NOVA = 0;
  const r = simWindow(120, 1 / 60, undefined);         // natural mana, no pin
  console.log('    measured: casts=' + r.casts);
  if (r.casts !== 0) throw new Error('FROST_NOVA fired without the card: ' + r.casts + ' casts');
});

s.check('the tick is inert outside playing and without the card', () => {
  if (frostCardTick({ player: { skills: {}, skillCd: {}, mana: 999 }, mode: 'playing' }, 1 / 60)) {
    throw new Error('fired without the card');
  }
  const held = { player: { skills: { frost: true }, skillCd: { FROST_NOVA: 0 }, mana: 999, buffs: {}, stats: {} },
    enemies: [], effects: [], mode: 'draft', character: CHARACTERS.WITCH };
  if (frostCardTick(held, 1 / 60)) throw new Error('fired outside playing');
});

s.check('the text HUD names the held card (FROST AUTO) and the Q readout stays CHAIN', () => {
  grantFrost(st);
  T.hudText.set(true);
  h.pump(1);
  const hud = h.elements['hud'].textContent || '';
  if (!/FROST AUTO/.test(hud)) throw new Error('text HUD does not name the held card:\n' + hud);
  if (h.elements['q-skill'].textContent !== 'CHAIN') {
    throw new Error('the card hijacked the Q readout: ' + JSON.stringify(h.elements['q-skill'].textContent));
  }
  p.skills = {};                                // leave the run as found
  h.pump(1);
  if (/FROST AUTO/.test(h.elements['hud'].textContent || '')) {
    throw new Error('FROST AUTO token survived dropping the card');
  }
});

s.done();
