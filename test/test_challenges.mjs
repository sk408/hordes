// HORDES — G11 PART B: challenge modes.
//
// The contract under test: the modes are RULE changes (not difficulty — heat
// owns that), applied at ONE seam per rule in the REAL startRun(), visible in
// the HUD and on the end screen, and PERSIST NOTHING. A STANDARD run must be
// byte-for-byte today's numbers; a challenge run must mutate nothing the same
// standard run would not have mutated.
import { suite, boot } from './_harness.mjs';
import {
  CHALLENGES, CHALLENGE_IDS, CHALLENGE_BY_ID, DEFAULT_CHALLENGE_ID,
  challengeOf, isStandard, challengeRules, nextChallengeId, prevChallengeId,
  describeChallenge,
} from '../src/challenges.js';
import { CONFIG as C } from '../src/config.js';
import { startWeaponSlots, startPotionCount } from '../src/meta.js';

const s = suite('test_challenges');

// ---------------------------------------------------------------------------
// 1. Catalog integrity (pure — no boot needed).
// ---------------------------------------------------------------------------
s.check('the catalog has unique ids, STANDARD first, and the declared slice', () => {
  if (CHALLENGE_IDS.length !== 3) throw new Error('expected 3 modes, got ' + CHALLENGE_IDS.length);
  if (CHALLENGE_IDS[0] !== 'STANDARD') throw new Error('STANDARD is not first');
  if (new Set(CHALLENGE_IDS).size !== CHALLENGE_IDS.length) throw new Error('duplicate ids');
  if (DEFAULT_CHALLENGE_ID !== 'STANDARD') throw new Error('default id drifted');
  for (const c of CHALLENGES) {
    if (!c.name || !c.blurb) throw new Error(c.id + ' lacks name/blurb');
    if (typeof c.rules !== 'object') throw new Error(c.id + ' rules is not an object');
  }
});

s.check('challengeOf is TOTAL over garbage input (unknown -> STANDARD)', () => {
  // (No array case: CHALLENGE_BY_ID[arrr] coerces to its joined string, so
  // ['ONE_WEAPON'] IS the string 'ONE_WEAPON' as a key — a JS quirk, not an
  // unknown id.)
  for (const junk of [undefined, null, '', 'NOPE', 7, {}]) {
    if (challengeOf(junk).id !== 'STANDARD') throw new Error('garbage ' + JSON.stringify(junk) + ' did not degrade');
    if (!isStandard(junk)) throw new Error('isStandard false for ' + JSON.stringify(junk));
  }
  if (!isStandard('STANDARD')) throw new Error('isStandard false for STANDARD itself');
  if (isStandard('ONE_WEAPON')) throw new Error('isStandard true for ONE_WEAPON');
});

s.check('nextChallengeId wraps both ways through the whole ring', () => {
  // forward: STANDARD -> ONE_WEAPON -> NO_POTIONS -> STANDARD
  let id = 'STANDARD';
  const fwd = [];
  for (let i = 0; i < 4; i++) { id = nextChallengeId(id); fwd.push(id); }
  if (fwd.join(',') !== 'ONE_WEAPON,NO_POTIONS,STANDARD,ONE_WEAPON') throw new Error('fwd: ' + fwd.join(','));
  // backward: STANDARD -> NO_POTIONS -> ONE_WEAPON -> STANDARD
  let back = 'STANDARD';
  const rev = [];
  for (let i = 0; i < 4; i++) { back = prevChallengeId(back); rev.push(back); }
  if (rev.join(',') !== 'NO_POTIONS,ONE_WEAPON,STANDARD,NO_POTIONS') throw new Error('rev: ' + rev.join(','));
  // garbage input wraps from STANDARD's position, it does not throw.
  if (nextChallengeId('GARBAGE') !== 'ONE_WEAPON') throw new Error('garbage forward');
});

s.check('challengeRules returns {} for standard and cannot be mutated into the catalog', () => {
  if (Object.keys(challengeRules('STANDARD')).length !== 0) throw new Error('standard applies rules');
  if (Object.keys(challengeRules('GARBAGE')).length !== 0) throw new Error('garbage applies rules');
  const r = challengeRules('ONE_WEAPON');
  if (r.weaponSlots !== 1) throw new Error('ONE_WEAPON rules: ' + JSON.stringify(r));
  r.weaponSlots = 99;                                  // mutate the returned copy
  if (CHALLENGE_BY_ID.ONE_WEAPON.rules.weaponSlots !== 1) throw new Error('the catalog was mutated through the return');
  if (challengeRules('NO_POTIONS').potions !== 0) throw new Error('NO_POTIONS rules drifted');
});

s.check('describeChallenge names the mode (the one sanctioned phrasing surface)', () => {
  if (!describeChallenge('ONE_WEAPON').includes('ONE WEAPON')) throw new Error(describeChallenge('ONE_WEAPON'));
  if (!describeChallenge('NO_POTIONS').includes('NO POTIONS')) throw new Error(describeChallenge('NO_POTIONS'));
  if (!describeChallenge('STANDARD').includes('STANDARD RUN')) throw new Error(describeChallenge('STANDARD'));
});

// ---------------------------------------------------------------------------
// 2. Application at the REAL startRun seam (booted harness).
// ---------------------------------------------------------------------------
const h = await boot();
const T = h.T, st = T.state;
const profile = T.getProfile();
const key = (k) => h.key('keydown', { key: k, preventDefault() {} });
const cardsNow = () => [...h.elements['ov-cards'].children].map(c => c.innerHTML || '');

s.check('the pending selection starts at STANDARD (session default, not persisted)', () => {
  if (T.challenge.pending !== 'STANDARD') throw new Error('pending is ' + T.challenge.pending);
  for (const k of h.storage.keys()) {
    if (/challeng/i.test(k)) throw new Error('a challenge-shaped storage key exists: ' + k);
  }
});

s.check('a STANDARD run keeps today\'s numbers exactly', () => {
  T.challenge.select('STANDARD');
  T.startRun();
  h.pump(1);
  const wantSlots = startWeaponSlots(profile);
  const wantPots = startPotionCount(profile);
  if (st.challenge !== 'STANDARD') throw new Error('stamp is ' + st.challenge);
  if (st.weaponCap !== C.WEAPON_SLOTS) throw new Error('weaponCap ' + st.weaponCap);
  if (st.potionCap !== C.POTIONS.MAX_CARRIED) throw new Error('potionCap ' + st.potionCap);
  if (st.weaponSlots !== wantSlots || st.baseWeaponSlots !== wantSlots) {
    throw new Error('slots ' + st.weaponSlots + '/' + st.baseWeaponSlots + ', want ' + wantSlots);
  }
  if (st.player.potions.hp !== wantPots || st.player.potions.mp !== wantPots) {
    throw new Error('potions ' + JSON.stringify(st.player.potions) + ', want ' + wantPots);
  }
});

s.check('ONE_WEAPON: exactly 1 weapon slot through the real seam', () => {
  T.challenge.select('ONE_WEAPON');
  T.startRun();
  h.pump(1);
  if (st.challenge !== 'ONE_WEAPON') throw new Error('stamp is ' + st.challenge);
  if (st.weaponCap !== 1) throw new Error('weaponCap ' + st.weaponCap);
  if (st.weaponSlots !== 1 || st.baseWeaponSlots !== 1) {
    throw new Error('slots ' + st.weaponSlots + '/' + st.baseWeaponSlots);
  }
  // The mode constrains ONLY slots: potions keep the standard numbers.
  const wantPots = startPotionCount(profile);
  if (st.player.potions.hp !== wantPots) throw new Error('potions moved: ' + st.player.potions.hp);
  if (st.potionCap !== C.POTIONS.MAX_CARRIED) throw new Error('potionCap moved');
});

s.check('NO_POTIONS: zero potions, forced at the seam and held by the pickup', () => {
  T.challenge.select('NO_POTIONS');
  T.startRun();
  h.pump(1);
  if (st.challenge !== 'NO_POTIONS') throw new Error('stamp is ' + st.challenge);
  if (st.potionCap !== 0) throw new Error('potionCap ' + st.potionCap);
  if (st.player.potions.hp !== 0 || st.player.potions.mp !== 0) {
    throw new Error('potions ' + JSON.stringify(st.player.potions));
  }
  // The mode constrains ONLY potions: slots keep the standard numbers.
  if (st.weaponSlots !== startWeaponSlots(profile)) throw new Error('slots moved: ' + st.weaponSlots);
  // The REAL pickup consumer honours the ceiling: a potion drop at the
  // player's feet stays on the ground.
  const p = st.player;
  st.drops.push({ kind: 'hp', x: p.x, y: p.y });
  h.pump(2);
  if (p.potions.hp !== 0) throw new Error('a forbidden potion was picked up: ' + p.potions.hp);
  if (!st.drops.some(d => d.kind === 'hp')) throw new Error('the drop vanished without a pickup');
});

s.check('the rules hold across the run: a draft offers no new weapon at 1 slot', () => {
  T.challenge.select('ONE_WEAPON');
  T.startRun();
  h.pump(1);
  T.openDraft();
  if (st.mode !== 'draft') throw new Error('mode is ' + st.mode);
  const texts = [...h.elements['ov-cards'].children].map(c => c.innerHTML || '');
  if (texts.some(t => t.includes('NEW WEAPON'))) throw new Error('a 1-slot run was offered a second weapon');
  // G26 RETARGET (2026-09-15, owner: "Replaces in run cards"): this half used
  // to prove the pool was "constrained, not broken" by requiring a NEW WEAPON
  // grant at STANDARD — but wpn_* grants LEFT the draft pool by design (the
  // pre-run LOADOUT screen owns weapon choice now), so "STANDARD offers NEW
  // WEAPON" is wrong BY DESIGN for every mode. The proof the pool is alive
  // moves to what the pool still serves: at STANDARD the draft offers lvl_*
  // weapon-level cards for the armed kit (read through the _draftOffer seam,
  // the exact card openDraft built — never a restated copy of the pool).
  st.mode = 'playing';
  h.elements['ov-cards'].innerHTML = '';
  T.challenge.select('STANDARD');
  T.startRun();
  h.pump(1);
  let offered = false;
  for (let i = 0; i < 25 && !offered; i++) {
    T.openDraft();
    const cards2 = [...h.elements['ov-cards'].children];
    offered = cards2.some(c => c._draftOffer && String(c._draftOffer.id).startsWith('lvl_'));
    st.mode = 'playing';
    h.elements['ov-cards'].innerHTML = '';
  }
  if (!offered) throw new Error('STANDARD never offered a weapon-level card in 25 drafts (pool broken?)');
});

// ---------------------------------------------------------------------------
// 3. Progression integrity: nothing persisted, nothing leaked.
// ---------------------------------------------------------------------------
s.check('a challenge run mutates NOTHING persistent (deep compare)', () => {
  // Leave any live run without the death screen (bestiary-test precedent).
  st.mode = 'menu';
  h.elements['ov-cards'].innerHTML = '';
  const before = JSON.parse(JSON.stringify(profile));
  const keysBefore = [...h.storage.keys()].sort();
  T.challenge.select('ONE_WEAPON');
  T.startRun();
  h.pump(30);                                          // half a second of real run
  const after = JSON.parse(JSON.stringify(profile));
  // A live run's ONLY profile mutation is the bestiary encounter log — the
  // exact surface a STANDARD run writes too (recorded at spawn). Anything
  // else (gold, achievements, purchased, new keys) would be the challenge
  // leaking persistence; the settle funnel owns the legit mutations.
  const changed = Object.keys(after).filter(k => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  for (const k of changed) {
    if (k !== 'encounters') throw new Error('the challenge run mutated profile.' + k);
  }
  for (const k of Object.keys(after)) {
    if (!Object.prototype.hasOwnProperty.call(before, k)) throw new Error('new profile key: ' + k);
  }
  if (/challeng/i.test(JSON.stringify(after))) throw new Error('challenge data leaked into the profile');
  const keysAfter = [...h.storage.keys()].sort();
  if (JSON.stringify(keysAfter) !== JSON.stringify(keysBefore)) {
    throw new Error('storage keys changed: ' + JSON.stringify(keysAfter));
  }
});

s.check('no leakage across two consecutive runs: the mode is per-run state', () => {
  // Run A: ONE_WEAPON (already selected above).
  st.mode = 'menu';
  h.elements['ov-cards'].innerHTML = '';
  T.challenge.select('ONE_WEAPON');
  T.startRun();
  h.pump(1);
  if (st.challenge !== 'ONE_WEAPON' || st.weaponSlots !== 1) throw new Error('run A lost the mode');
  // Run B: STANDARD.
  st.mode = 'menu';
  h.elements['ov-cards'].innerHTML = '';
  T.challenge.select('STANDARD');
  T.startRun();
  h.pump(1);
  if (st.challenge !== 'STANDARD') throw new Error('run B stamped ' + st.challenge);
  if (st.weaponSlots !== startWeaponSlots(profile)) throw new Error('run B slots ' + st.weaponSlots);
  if (st.player.potions.hp !== startPotionCount(profile)) throw new Error('run B potions moved');
  if (st.weaponCap !== C.WEAPON_SLOTS || st.potionCap !== C.POTIONS.MAX_CARRIED) {
    throw new Error('run B ceilings ' + st.weaponCap + '/' + st.potionCap);
  }
});

// ---------------------------------------------------------------------------
// 4. Presentation: title card, HUD badge, end screen.
// ---------------------------------------------------------------------------
s.check('the title screen offers a CHALLENGE card naming the selection; a press cycles', () => {
  st.mode = 'menu';
  h.elements['ov-cards'].innerHTML = '';
  // Reach the title the real way: leave the run, then ESC re-renders it.
  st.mode = 'menu';
  T.challenge.select('STANDARD');
  key('escape');
  // U1: the CHALLENGE card lives behind the SETUP door now, so walk to it.
  const door = [...h.elements['ov-cards'].children].find(c => (c.innerHTML || '').includes('>SETUP<'));
  if (!door) throw new Error('no SETUP door on the title (U1)');
  door.click();
  const cards = cardsNow();
  const card = cards.find(t => t.includes('>CHALLENGE<'));
  if (!card) throw new Error('no CHALLENGE card: ' + JSON.stringify(cards.map(c => c.slice(0, 40))));
  if (!card.includes('STANDARD RUN')) throw new Error('the card does not name the selection: ' + card);
  // Click it: the selection cycles and the card re-renders with the new one.
  const el = [...h.elements['ov-cards'].children].find(c => (c.innerHTML || '').includes('>CHALLENGE<'));
  el.click();
  if (T.challenge.pending !== 'ONE_WEAPON') throw new Error('press did not cycle: ' + T.challenge.pending);
  const card2 = cardsNow().find(t => t.includes('>CHALLENGE<'));
  if (!card2 || !card2.includes('ONE WEAPON')) throw new Error('the card did not re-render the new selection');
});

s.check('the in-run HUD badge exists only for a non-standard mode', () => {
  T.challenge.select('ONE_WEAPON');
  T.startRun();
  h.pump(2);
  if (st.mode !== 'playing') throw new Error('mode is ' + st.mode);
  // Canvas half: the chrome seam records the badge.
  if (!T.renderer.hudChrome || !T.renderer.hudChrome.challenge ||
      T.renderer.hudChrome.challenge.name !== 'ONE WEAPON') {
    throw new Error('no challenge badge in the HUD chrome seam: ' +
      JSON.stringify(T.renderer.hudChrome && T.renderer.hudChrome.challenge));
  }
  // Text-HUD half: opt-in (the pref the SETTINGS screen toggles), then the
  // MODE line appears only for the live mode.
  T.hudText.set(true);
  h.pump(2);
  const txt = h.elements['hud'].textContent || '';
  T.hudText.set(false);
  if (!txt.includes('MODE ONE WEAPON')) throw new Error('the text HUD lacks the MODE line');
  // STANDARD: byte-identical — no badge, no MODE line.
  st.mode = 'menu';
  h.elements['ov-cards'].innerHTML = '';
  T.challenge.select('STANDARD');
  T.startRun();
  h.pump(2);
  if (T.renderer.hudChrome && T.renderer.hudChrome.challenge !== null) {
    throw new Error('a STANDARD run drew a challenge badge');
  }
  T.hudText.set(true);
  h.pump(2);
  const stdTxt = h.elements['hud'].textContent || '';
  T.hudText.set(false);
  if (stdTxt.includes('MODE ')) {
    throw new Error('a STANDARD run printed a MODE line');
  }
});

s.check('the end screen lead line names the mode; STANDARD renders without it', () => {
  st.challenge = 'ONE_WEAPON';                         // the run-scoped stamp is what the screen reads
  const withMode = T.endScreenBody({ lead: 'RUN OVER', gold: 25 });
  if (!withMode.includes('ONE WEAPON RUN')) throw new Error('the end screen omits the mode: ' + withMode);
  st.challenge = 'STANDARD';
  const std = T.endScreenBody({ lead: 'RUN OVER', gold: 25 });
  if (std.includes('RUN</span><br>RUN OVER') && std.includes('WEAPON')) throw new Error('unexpected mode text');
  if (!std.startsWith('RUN OVER')) throw new Error('the STANDARD lead is not first: ' + std);
});

s.check('HOW TO PLAY documents the challenge selection', () => {
  // The card copy lives in showHowToPlay; assert on its presence through the
  // real screen render (reach it from the title).
  st.mode = 'menu';
  h.elements['ov-cards'].innerHTML = '';
  key('escape');                                       // title
  // U1: HOW TO PLAY is behind the SETUP door now.
  const door = [...h.elements['ov-cards'].children].find(c => (c.innerHTML || '').includes('>SETUP<'));
  if (!door) throw new Error('no SETUP door on the title (U1)');
  door.click();
  const howTo = [...h.elements['ov-cards'].children].find(c => (c.innerHTML || '').includes('>HOW TO PLAY<'));
  howTo.click();
  const field = cardsNow().find(t => t.includes('CHALLENGE'));
  if (!field || !field.includes('ONE WEAPON')) throw new Error('THE FIELD card does not document CHALLENGE');
});

s.done();
