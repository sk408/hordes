// INCOME RE-MEASUREMENT (msg_01M2R0RAH5SYCK2MMM09R743X1 + refinements
// 01M2R12SW / 01M2R16J): the §1 60s arms were a BOT FLOOR (the AUTO_ALL
// pilot died at 10-23s). This tool measures SURVIVABLE arms — the SAME
// player-facing levers a human player has, no cheats:
//   * stance SAFE  (the shipped AUTOPILOT.STANCES dial, config.js:417 —
//     a persisted player preference applied through the REAL seam)
//   * the real_loop cohort overlay policy (draft: NEW WEAPON else card 1;
//     intermission: CONTINUE/PLAY)
//   * q+e at bosses (the established "sims should use q and e against
//     bosses" policy, tools/real_loop.mjs)
// NO hp inflation, NO refill, NO stat cheats: a run that dies, dies.
//
// Arms (all real profiles through the REAL meta API):
//   fresh    makeProfile()                                  — tier 0
//   couple   + hp L1 (120g) + dmg L1 (150g)                 — "a couple
//            upgrades" (owner anchor ~2000g), 270g spent
//   partial  stageProfile('partial')  dmg2/hp3 + 4 weapons  — tier 1-2
//   maxed    stageProfile('maxed')    full catalogue        — tier 3
//
// Per arm: N seeded runs (mulberry32 patch of Math.random), 60s sim cap.
// Income = the REAL settlement: at death the game settles itself; at cap
// T.purse.settle() banks exactly what a run ending there banks (run-once
// guard, main.js settleRunGold). A run is a PAIR (length, gold) — a bare
// per-run figure is never published (refinement 01M2R12SW).
import { boot } from '../test/_harness.mjs';
import { declareSimBudget, simStats, ARM_CAP_S } from '../test/_sim_budget.mjs';
import { makeProfile, buyUpgrade, SHOP_UPGRADES } from '../src/meta.js';
import { CONFIG as C } from '../src/config.js';

const CAP_S = 60;
// R16JD addition (2026-09-18): the battery is FIXED AND SMALL — four arms
// max (fresh / couple / partial=mid / maxed=late), runs capped at 60s each,
// known budget in advance, never dozens of runs. Default 3 runs/arm = 12
// capped runs worst case (~12 sim-minutes; early arms die in seconds so the
// real cost is far lower). Override: node tools/measure_income_stages.mjs
// [arms,comma-separated] — 'half' (the 6.8M diagnostic build) is available
// there but NOT part of the standing battery (it is 'late', and maxed is
// the late reference).
const N_RUNS = 3;

// mulberry32 — same generator family the potion-tune chassis used, so seeds
// are reproducible across invocations.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const realRandom = Math.random;

function buildProfile(name) {
  const prof = makeProfile();
  if (name === 'couple') {
    prof.gold = 1000;                       // a few runs' savings — no cheat
    if (!buyUpgrade(prof, 'hp')) throw new Error('hp L1 buy failed');
    if (!buyUpgrade(prof, 'dmg')) throw new Error('dmg L1 buy failed');
    prof.gold = 0;
  } else if (name === 'partial') {
    prof.gold = 0;
    prof.purchased = { dmg: 2, hp: 3 };
    prof.unlockedWeapons = ['VOLLEY', 'BOOMERANG', 'ORBIT', 'ZAP'];
    prof.unlockedCharacters = ['KNIGHT'];
    prof.equippedCharacter = 'KNIGHT';
  } else if (name === 'half') {
    // tier-2 stage (E1's "half-maxed build"): full-buy the CHEAPEST HALF of
    // the catalogue rows by full-buy cost (base * growth^... is the row's own
    // ladder; approximate the full-buy with def-driven purchase loop against
    // a 1e9 grant — price-independent by headroom). Definition stated here
    // because real_loop's three stages do not express it.
    prof.gold = 1_000_000_000;
    const rows = SHOP_UPGRADES.map(def => {
      let full = 0;
      const probe = makeProfile(); probe.gold = 1e12;
      for (let i = 0; i < def.maxLevel; i++) { if (!buyUpgrade(probe, def.id)) break; }
      full = 1e12 - probe.gold;
      return { def, full };
    }).sort((a, b) => a.full - b.full);
    for (const row of rows.slice(0, Math.ceil(rows.length / 2))) {
      for (let i = 0; i < row.def.maxLevel; i++) if (!buyUpgrade(prof, row.def.id)) break;
    }
    prof.gold = 0;
  } else if (name === 'maxed') {
    prof.gold = 1_000_000_000;
    for (const def of SHOP_UPGRADES) {
      for (let i = 0; i < def.maxLevel; i++) if (!buyUpgrade(prof, def.id)) break;
    }
  }
  return prof;
}

const arms = process.argv[2] ? process.argv[2].split(',') : ['fresh', 'couple', 'partial', 'maxed'];

async function main() {
  // SIM BUDGET: declared, not guidance — 4 arms x N_RUNS x the 60s cap is
  // the worst-case ceiling (real cost is far lower: dying arms end early).
  // Each RUN is marked as its own arm so the cap prices one run.
  declareSimBudget(arms.length * N_RUNS * ARM_CAP_S);
  for (const arm of arms) {
    // one boot per arm (variant busts the ESM cache — profile is seeded via
    // localStorage at boot, so each arm needs its own main.js evaluation)
    const h = await boot({ variant: 'income-' + arm });
    const T = h.T, st = T.state;
    const prof = T.getProfile();
    const want = buildProfile(arm);
    // overwrite the live profile with the arm's build (same fields makeProfile
    // owns; the harness booted with a default fresh save)
    Object.assign(prof, want);
    // PLAYER-REAL levers: AUTO_ALL pilot + SAFE stance through the REAL
    // persisted-pref seam (exactly what the settings card does).
    T.setPilotMode('AUTO_ALL');
    T.pilotPrefs.storage.setItem(T.pilotPrefs.KEY_STANCE, 'SAFE');
    T.pilotPrefs.applyStance();

    const runs = [];
    for (let r = 1; r <= N_RUNS; r++) {
      Math.random = mulberry32(4000 + r * 97 + arms.indexOf(arm) * 7919);
      const goldBefore = prof.gold;
      T.startRun();
      h.markArm(arm + ':run' + r);
      h.pump(2);
      let end = null;               // { kind, t }
      for (let i = 0; i < CAP_S * 60; i++) {
        h.pump(1);
        if (st.mode === 'dead' || st.mode === 'death-cine') {
          end = { kind: 'died', t: Math.round(st.time) }; break;
        }
        if (st.runWon) { end = { kind: 'won', t: Math.round(st.time) }; break; }
        // overlay auto-play (real_loop policy, verbatim shape)
        const ov = h.elements['overlay'];
        const cards = h.elements['ov-cards'] ? h.elements['ov-cards'].children : [];
        const key = h.key;
        if (ov && ov.style.display === 'flex' && cards.length > 0) {
          if (st.mode === 'draft' || st.mode === 'evolve') {
            let k = '1';
            for (const c of cards) {
              if ((c.innerHTML || '').includes('NEW WEAPON')) { k = String(cards.indexOf(c) + 1); break; }
            }
            h.key('keydown', { key: k });
          } else {
            const titled = (t) => cards.find(c => (c.innerHTML || '').includes(t));
            const cont = titled('CONTINUE');
            if (cont) cont.click();
            else { const play = titled('PLAY'); if (play) play.click(); }
          }
        }
        // q+e at bosses (real_loop policy)
        if (st.mode === 'playing' || st.mode === 'finale') {
          const bossUp = (st.wave.bosses || []).some(b => b && b.hp > 0)
            || (st.wave.midBosses || []).some(b => b && b.hp > 0)
            || !!(st.finalBoss && st.finalBoss.hp > 0);
          if (bossUp) { h.key('keydown', { key: 'q' }); h.key('keydown', { key: 'e' }); }
        }
      }
      if (!end) end = { kind: 'capped', t: CAP_S };
      // the REAL settlement through the run-once seam — a death mid-cine and
      // a deliberate end-at-cap bank the SAME numbers a player ending there
      // banks (settleRunGold guards double-pay itself)
      try { T.purse.settle(); } catch { /* already settled (maw milestone) */ }
      const gold = prof.gold - goldBefore;
      runs.push({ ...end, kills: st.player.kills, level: st.player.level, wave: st.wave.num, purse: T.purse.get(), gold });
      console.log(`ARM=${arm} run=${r}/${N_RUNS} ${end.kind} t=${end.t}s wave=${st.wave.num} kills=${st.player.kills} level=${st.player.level} purse=${T.purse.get()} banked=+${gold}`);
    }
    const survived = runs.filter(x => x.kind !== 'died');
    const g = runs.map(x => x.gold);
    const t = runs.map(x => x.t);
    const gps = runs.map(x => x.gold / Math.max(1, x.t));
    const med = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
    console.log(`SUMMARY arm=${arm} survivedFullCap=${survived.length}/${N_RUNS} medianT=${med(t)}s medianGold=${med(g)}g medianGoldPerSec=${med(gps).toFixed(2)}g/s`);
    console.log('---');
    Math.random = realRandom;
  }
  // The report line every measurement must carry (PACING.md §0).
  const st = simStats();
  console.log(`SIM: ${st.totalS.toFixed(1)}s across ${st.arms.length} arms (budget ${st.budgetS}s declared; sources: [ARM] for all figures above).`);
}

await main();
process.exit(0);
