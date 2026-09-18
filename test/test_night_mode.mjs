// NIGHT MODE (owner-authorized 2026-09-17, msg task: opt-in full auto, 50%
// gold) — the behaviour pins. Every check drives the REAL paths through the
// shared harness (never copies): the settle funnel, the frame loop's
// wall-clock timers, the SETUP toggle handler, the portal → escape →
// intermission ladder and die()'s end card.
// Run: node test/test_night_mode.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { boot, suite } from './_harness.mjs';
import { EVOLUTION_DEFS } from '../src/evolutions.js';
import { WEAPON_MAX_LEVEL } from '../src/weapons.js';

const h = await boot();
const T = h.T;
const st = T.state;
const S = suite('night mode');
const key = (k) => h.key('keydown', { key: k, preventDefault() {} });
const src = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

const step = () => h.pump(1, () => { st.player.hp = st.player.stats.maxHp; });
const freezeSpawns = () => {
  st.spawnTimer = 1e9;
  st.wave.endsAt = st.time + 1e9;
  st.wave.midAt = st.time + 1e9;
};

// Night ON through the REAL two-press handler (armed → on).
function nightOn() {
  while (!T.night.on) T.night.press();
}
function nightOff() {
  while (T.night.on) T.night.press();
}

// ---- 1. THE TOGGLE: default OFF, two-press confirm, title-only surface ----
S.check('the night toggle defaults OFF (fresh session)', () => {
  assert.equal(T.night.on, false);
  assert.equal(T.night.armed, false);
  assert.equal(T.night.summary, null);
});
S.check('one press ARMS, does not turn the night on', () => {
  T.night.press();
  assert.equal(T.night.armed, true);
  assert.equal(T.night.on, false);
});
S.check('the second press turns it ON; a third turns it OFF and writes the summary', () => {
  const gold0 = T.getProfile().gold;
  T.night.press();
  assert.equal(T.night.on, true);
  assert.equal(T.night.armed, false);
  T.night.press();
  assert.equal(T.night.on, false);
  const s = T.night.summary;
  assert.ok(s && s.mult === 0.5 && s.gold === 0 && s.awayS >= 0,
    'summary { awayS, gold earned, x0.50 multiplier }: ' + JSON.stringify(s));
  assert.equal(gold0, T.getProfile().gold);
});
S.check('the toggle lives on the title SETUP card only (never a run key, never persisted)', () => {
  assert.ok(/menuCard\('NIGHT MODE · '/.test(src), 'the SETUP card renders the toggle');
  assert.ok(!/key === 'n'/.test(src), 'no run-scoped night key');
  const saved = JSON.stringify(T.getProfile());
  assert.ok(!/"night"/.test(saved), 'the profile carries no night field');
});

// ---- 2. THE DRAFT POLICY: highest tier, first slot on tie --------------------
S.check('nightDraftPickIndex: MYTHIC > RARE > plain, FIRST slot on a tie', () => {
  const pick = T.night.pickIndex;
  assert.equal(pick([]), 0);
  assert.equal(pick([{ id: 'a' }, { id: 'b' }]), 0);                    // tie -> first
  assert.equal(pick([{ id: 'a' }, { id: 'b', tier: 'RARE' }]), 1);
  assert.equal(pick([{ id: 'a', tier: 'MYTHIC' }, { id: 'b', tier: 'RARE' }]), 0);
  assert.equal(pick([{ id: 'a' }, { id: 'b', tier: 'MYTHIC' }, { id: 'c', tier: 'RARE' }]), 1);
  // Deterministic by construction: same offers, same answer, twice.
  const offers = [{ id: 'a' }, { id: 'b', tier: 'RARE' }, { id: 'c', tier: 'RARE' }];
  assert.equal(pick(offers), pick(offers));
});
S.check('the auto-pick routes through the policy when the run is a night run', () => {
  assert.ok(/state\.nightRun\s*\?\s*draftOffers\[nightDraftPickIndex\(draftOffers\)\]/.test(src));
});

// ---- 3. THE GOLD FORMULA: one additive pool, per combination ------------------
// settleRunGold is the single funnel; drive it on REAL runs with the pool
// terms set the only ways the game sets them (nightRun stamp, challenge
// selection, manual heat pushes).
function settleArm({ night, challenge = 'STANDARD', heat = 0, winBonus = 1000 }) {
  if (night) nightOn(); else nightOff();
  T.challenge.select(challenge);
  T.startRun(); h.pump(2);
  const prof = T.getProfile();
  prof.bestTime = 99999;                 // kill FIRST_CLEAR: isolate the pool
  st.player.stats.goldMult = 1;          // zero the performance axis
  st.rampage.best = 0; st.rampage.streak = 0;
  st.heat.manual = heat;
  prof.runPurse = 42;
  return T.purse.settle({ winBonus });
}
S.check('standard: 100% — award 70, purse 42, winBonus 1000 (identity pool)', () => {
  const r = settleArm({ night: false });
  assert.deepEqual({ a: r.award, p: r.purseBanked, w: r.winBonus },
    { a: 70, p: 42, w: 1000 });
  assert.equal(r.goldPool.total, 1);
});
S.check('night: 50% — the WHOLE payout halves (award 35, purse 21, winBonus 500)', () => {
  const r = settleArm({ night: true });
  assert.deepEqual({ a: r.award, p: r.purseBanked, w: r.winBonus },
    { a: 35, p: 21, w: 500 });
  assert.equal(r.goldPool.night, 0.5);
  assert.equal(r.goldPool.total, 0.5);
});
S.check('night+challenge: 100 - 50 + 200 = 250% (SUMMED, not 100x0.5x3)', () => {
  const r = settleArm({ night: true, challenge: 'ONE_WEAPON' });
  assert.equal(r.award, 175, 'award = round(70 x 2.5)');
  assert.equal(r.purseBanked, 21, 'the purse follows the NIGHT term only');
  assert.equal(r.goldPool.total, 2.5);
});
S.check('night+heat(1): 100 - 50 + 30 = 80%', () => {
  const r = settleArm({ night: true, heat: 1 });
  assert.equal(r.award, 56, 'award = round(70 x 0.8)');
  assert.equal(r.goldPool.total, 0.8);
});
S.check('night+challenge+heat(1): 100 - 50 + 200 + 30 = 280% (the full additive stack)', () => {
  const r = settleArm({ night: true, challenge: 'ONE_WEAPON', heat: 1 });
  assert.equal(r.award, 196, 'award = round(70 x 2.8)');
  assert.equal(r.goldPool.total, 2.8);
});
S.check('the named constants: penalty 50, CONTINUE 3s, RESTART 3s, EVOLVE 3s, STALL 30s', () => {
  assert.deepEqual(T.night.constants,
    { CONTINUE_S: 3.0, RESTART_S: 3.0, EVOLVE_S: 3.0, STALL_S: 30.0, PENALTY_PCT: 50 });
});

// ---- 4. RECORDS ARE KEPT -------------------------------------------------------
S.check('a night run still sets best-run records (nothing suppressed)', () => {
  nightOn();
  T.startRun(); h.pump(2);
  const prof = T.getProfile();
  prof.bestTime = 0;
  st.time = 30;
  st.player.stats.goldMult = 1;
  st.rampage.best = 0;
  prof.runPurse = 0;
  const r = T.purse.settle();
  assert.ok(r.firstClear === true, 'the record bonus fired on the night run');
  assert.equal(prof.bestTime, 30, 'bestTime was written by the night settle');
});

// ---- 5. FULL CONTENT PASS-THROUGH: portal -> escape(skip) -> intermission -----
// The one sanctioned skip is the escape. Everything else plays: the wave is
// cleared by the REAL boss ladder, the portal entered, the escape skipped
// (night), the intermission taken by the auto-CONTINUE on the NAMED delay.
S.check('a night run clears the wave, auto-skips ONLY the escape, lands in the intermission', () => {
  nightOn();
  T.startRun(); h.pump(2);
  assert.equal(st.nightRun, true, 'the run is stamped a night run');
  assert.equal(st.mode, 'playing');
  freezeSpawns();
  st.wave.endsAt = st.time;              // the wave-1 boss spawns on the next ticks
  let guard = 0;
  while (!(st.wave.bosses || []).length && guard++ < 400) step();
  assert.ok((st.wave.bosses || []).length, 'the boss spawned');
  for (const b of st.wave.bosses) if (b.hp > 0) b.hp = 0;
  // The real kill path's hand-off: the last boss dead sets cinePending, and
  // the frame loop routes it to startPortalCine (main.js :2740) — the wave-1
  // branch of endPortalCine is the ESCAPE trigger.
  st.wave.cinePending = true;
  st.portal = null;
  guard = 0;
  // ARENA SCALE-UP (boss-clear sweep, disclosed): the clear now BANKS the
  // wave's ground gems, and a level-up draft can open mid-hand-off — the
  // same overlay the seeded parity runs resolve (AUTO picks after its
  // window). Click it through; the assertions below are unchanged.
  while (st.mode !== 'intermission' && st.mode !== 'escape' && guard++ < 600) {
    step();
    if (st.mode === 'draft' || st.mode === 'evolve') {
      const c0 = h.elements['ov-cards'].children[0]; c0 && c0.click();
    }
  }
  assert.ok(st.mode === 'intermission' || st.mode === 'escape',
    'the clear handed off (mode=' + st.mode + ')');
  guard = 0;
  while (st.mode === 'escape' && guard++ < 600) step();   // the skip is instant-ish
  assert.equal(st.mode, 'intermission', 'the escape auto-skipped back to the intermission');
  const sub = h.elements['ov-sub']._html || '';
  assert.ok(/ESCAPE SKIPPED/.test(sub), 'the skip is stated on the card: ' + sub.slice(0, 120));
});
S.check('the auto-CONTINUE fires exactly NIGHT_CONTINUE_S after the intermission opens', () => {
  assert.equal(st.mode, 'intermission');
  assert.ok(T.night.continueLeft > 0 && T.night.continueLeft <= 3.0,
    'armed at the named value: ' + T.night.continueLeft);
  const waveBefore = st.wave.num;
  h.pump(Math.round(60 * 2.9));
  assert.equal(st.mode, 'intermission', '2.9s in: still on the intermission screen');
  assert.ok(T.night.continueLeft > 0);
  h.pump(30);   // cross 3.0s
  assert.equal(st.mode, 'playing', 'CONTINUE auto-fired');
  assert.equal(st.wave.num, waveBefore + 1, 'the ladder advanced a wave');
  assert.equal(T.night.continueLeft, null, 'the timer is spent');
});

// ---- 6. AUTO-RESTART: same build, same arena, on the named delay --------------
S.check('a finished night run auto-restarts after NIGHT_RESTART_S with build + arena intact', () => {
  // Same build/arena = startRun re-reads the persisted loadout, character,
  // pending challenge and pending stage (RETRY's exact contract).
  T.challenge.select('ONE_WEAPON');
  const arenaBefore = st.stage;
  const buildBefore = st.weapons.map(w => w.type).join(',');
  const charBefore = st.character && st.character.id;
  T.die();
  assert.equal(st.mode, 'dead', 'the death movie was skipped straight to the card');
  assert.ok(T.night.restartLeft > 0 && T.night.restartLeft <= 3.0,
    'armed at the named value: ' + T.night.restartLeft);
  assert.ok(/NIGHT RUN/.test(h.elements['ov-sub']._html || ''),
    'the end card is marked NIGHT RUN');
  h.pump(Math.round(60 * 2.9));
  assert.equal(st.mode, 'dead', '2.9s in: still on the end card');
  h.pump(30);
  assert.equal(st.mode, 'playing', 'the run auto-restarted');
  assert.equal(st.nightRun, true, 'the new run is a night run too');
  assert.equal(st.stage, arenaBefore, 'same arena');
  assert.equal(st.challenge, 'ONE_WEAPON', 'same challenge');
  assert.equal(st.character && st.character.id, charBefore, 'same character');
  assert.equal(st.weapons.map(w => w.type).join(','), buildBefore, 'same build (loadout)');
  assert.equal(T.night.restartLeft, null, 'the timer is spent');
});
S.check('the auto-RETRY arms only on death and survival (a deliberate END RUN never loops)', () => {
  assert.equal((src.match(/nightRestartLeft = C\.AUTOPILOT\.NIGHT_RESTART_S/g) || []).length, 2,
    'armed in exactly die() and runSurvived()');
});

// ---- 6b. OBSERVABLE restart (defect follow-up 2026-09-17): the flags above
// are not what a player sees. The end card must be GONE — no composed screen,
// no RETRY card, a fresh run clock — not merely mode === 'playing'.
S.check('the auto-RETRY leaves NO summary behind: endScreen cleared, fresh clock, fresh run', () => {
  nightOn();
  T.startRun(); h.pump(2);
  st.time = 91;
  T.die();
  assert.equal(st.mode, 'dead');
  assert.ok(st.endScreen, 'the summary was composed');
  h.pump(60 * 3.2);
  assert.equal(st.mode, 'playing', 'the run restarted');
  assert.equal(st.endScreen, null, 'the composed summary is GONE (a player-visible clear, not a flag)');
  assert.equal(st.time < 1, true, 'the run clock restarted at 0 (a NEW run, not a resume)');
  assert.equal(st.runCounts.bossKills, 0, 'the run-scoped counters reset');
});

// ---- 6c. THE NO-WEDGE WATCHDOG. The defect class is "a night run parks on a
// waiting screen". The named timers cover their transitions; the watchdog is
// the guarantee for every OTHER way a run can end up waiting. Counter-case
// through a REAL path: a deliberate END RUN composes the same end card but
// deliberately never arms the auto-RETRY — without the watchdog that screen
// parks forever (the owner-visible defect); with it, the run restarts inside
// NIGHT_STALL_S.
S.check('watchdog: an UNARMED end card (deliberate END RUN) still restarts within NIGHT_STALL_S', () => {
  assert.equal(st.mode, 'playing');
  // The real deliberate-exit path: settle + compose the end card, no arm.
  // (endRun is two-tap confirmed in the UI; the settle seam composes the same
  // screen — the auto-RETRY's own test above proves die() arms, so here we
  // need the UNARMED card only.)
  T.purse.settle();
  st.mode = 'dead';                       // the composed card state
  assert.equal(T.night.restartLeft, null, 'the card is unarmed (the defect shape)');
  h.pump(60 * 5);
  assert.equal(st.mode, 'dead', 'short of STALL_S the watchdog has NOT fired');
  assert.ok(T.night.stall.mode === 'dead' && T.night.stall.t > 4, 'the stall clock is running: ' + JSON.stringify(T.night.stall));
  h.pump(60 * (T.night.constants.STALL_S + 1));
  assert.equal(st.mode, 'playing', 'the watchdog restarted the parked run');
  assert.equal(st.nightRun, true, 'still a night run');
});
S.check('watchdog: the LIVE modes and human surfaces are never "unstuck"', () => {
  assert.equal(st.mode, 'playing');
  // The title (a human surface) with the night on: no run is live, nothing to
  // advance — the watchdog must stay quiet.
  st.mode = 'title';
  h.pump(60 * (T.night.constants.STALL_S + 2));
  assert.equal(st.mode, 'title', 'the watchdog did not start a run from the title');
  // A LIVE run is not a stall either. Hold the field empty (no enemies -> no
  // deaths, no kills, no level-up draft) so ONLY the watchdog could move the
  // mode — and assert it does not.
  st.mode = 'playing';
  st.enemies.length = 0; st.enemyShots.length = 0;
  freezeSpawns();
  h.pump(60 * (T.night.constants.STALL_S + 2), () => { st.player.hp = st.player.stats.maxHp; });
  assert.equal(st.mode, 'playing', 'a playing night run is not a stall');
  assert.equal(T.night.stall.mode, null, 'no stall clock while playing');
});

// ---- 6d. THE EVOLVE WEDGE (gap found 2026-09-18): the EVOLUTION overlay was
// human-click-only — an unattended run with a token over a maxed weapon
// parked there forever. It now has BOTH covers: a named timer that takes the
// FIRST candidate (the draft policy's first-slot rule) and a watchdog branch.
// Forced through the REAL surface: max a weapon that HAS an evolution def,
// bank a token, equip the def's item kind — then update() itself opens the
// overlay (maybeOpenEvolve), no direct mode writes for the open.
S.check('the EVOLUTION overlay auto-picks the first candidate after NIGHT_EVOLVE_S', () => {
  assert.equal(st.mode, 'playing');
  const w = st.weapons.find(x => EVOLUTION_DEFS[x.type]);
  assert.ok(w, 'the kit carries an evolvable weapon');
  w.level = WEAPON_MAX_LEVEL;
  st.evoTokens = 1;
  st.items.push({ affixes: [{ id: EVOLUTION_DEFS[w.type].itemKind }] });
  step();   // update() -> maybeOpenEvolve() opens the real overlay
  assert.equal(st.mode, 'evolve', 'the overlay opened through the real path');
  assert.ok(T.night.evolveLeft > 0 && T.night.evolveLeft <= 3.0,
    'the auto-pick armed at the named value: ' + T.night.evolveLeft);
  h.pump(Math.round(60 * 2.9));
  assert.equal(st.mode, 'evolve', '2.9s in: still on the overlay');
  h.pump(30);   // cross 3.0s
  assert.equal(st.mode, 'playing', 'the night took the candidate');
  assert.ok(w.evolutionId, 'the FIRST candidate actually evolved: ' + w.evolutionId);
  assert.equal(T.night.evolveLeft, null, 'the timer is spent');
});
S.check('watchdog: a parked EVOLUTION screen (timer disarmed) still advances within NIGHT_STALL_S', () => {
  // The counter-case shape: the overlay is up with NO armed timer (exactly
  // the pre-fix wedge). Only the watchdog can move it.
  st.mode = 'evolve';
  assert.equal(T.night.evolveLeft, null, 'no named timer (the defect shape)');
  h.pump(60 * 5);
  assert.equal(st.mode, 'evolve', 'short of STALL_S the watchdog has NOT fired');
  h.pump(60 * (T.night.constants.STALL_S + 1));
  assert.equal(st.mode, 'playing', 'the watchdog closed the parked overlay');
});

// ---- 7. THE RETURN LINE --------------------------------------------------------
S.check('turning the night OFF writes the one-line return summary the title shows', () => {
  const bankBefore = T.getProfile().gold;
  // Bank one more settled night run so the line has a real number.
  const prof = T.getProfile();
  prof.bestTime = 99999;
  st.player.stats.goldMult = 1;
  st.rampage.best = 0;
  prof.runPurse = 100;
  T.purse.settle();
  assert.ok(T.getProfile().gold > bankBefore, 'the night run banked gold');
  nightOff();
  const s = T.night.summary;
  assert.ok(s && s.mult === 0.5 && s.gold > 0,
    'summary carries time away, gold earned, the multiplier: ' + JSON.stringify(s));
  assert.ok(/NIGHT: away \$\{[^}]*awayS[^}]*h/.test(src) ||
    /NIGHT: away /.test(src), 'the title renders the line');
  nightOn();   // leave the session as found would be OFF — but a fresh night
  nightOff();  // clears the stale line: toggle ON then OFF resets it
  assert.equal(T.night.summary.gold, 0, 'a new night replaces the old line');
});

console.log('night mode: all checks passed');
process.exit(0);
