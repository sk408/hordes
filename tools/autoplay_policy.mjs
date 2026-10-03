// HORDES — STEP 3: dev autoplay policy runner (headless, in-tree).
//
// Real-loop autoplay is the ground-truth instrument: this tool boots the REAL
// src/main.js behind ?dev=1, arms the REAL toggle path (AUTO + DNIGHT +
// SPEED 8x through the dev seams), plays whole runs unattended under
// dev-night rules (nightmare auto-continue/restart/draft-picks, NO banking
// cut), buys BETWEEN runs through the REAL meta.js buyer per policy, and
// appends one snapshot row per run (speed 8 + policy tag) to the existing
// telemetry log tools/.snapshots/runs.jsonl through the REAL snapshot
// builder (schema v2; `policy` is the additive optional field).
//
// Paired seeds: run i uses seed (base + i) in EVERY policy arm, and the
// seedable streams (choice offers, shrines, ground decor, non-night draft
// draws) are re-seeded identically post-startRun. Spawn/combat Math.random
// stays unseeded — deterministic where the sim allows, documented limit.
//
// Usage (from the repo root):
//   node tools/autoplay_policy.mjs --policy both --runs 2 --seed 4242
//
// SIM BUDGET: declares its process budget up front; each run is its own
// measured arm (60s machine cap). Short arms by design (fresh builds die
// fast); a run that outlives its frame cap is reported TRUNCATED with no
// row (never a faked snapshot).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot } from '../test/_harness.mjs';
import { declareSimBudget, markArm } from '../test/_sim_budget.mjs';
import { mulberry32 } from '../src/weather.js';
// M5b: the pay shrine is gone; the run's sites seed in startRun.
import { buyUpgrade, devFreeBuild } from '../src/meta.js';
import {
  requireAutoplay, estimateRunIncome, smartNextBuy, impulsiveNextBuy,
} from '../src/dev_autoplay.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.dirname(HERE);
const SNAP_FILE = path.join(REPO, 'tools', '.snapshots', 'runs.jsonl');

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}

const POLICY_ARG = arg('policy', 'both');
const RUNS = Math.max(1, Number(arg('runs', '2')) || 2);
const SEED_BASE = (Number(arg('seed', '4242')) || 4242) | 0;
// Wall-clock pumped frames per run. At 8x each frame advances 8/60 sim-s, so
// 1200 frames = 20 wall-s = 160 sim-s per run (fresh builds die far sooner).
const MAX_FRAMES = Math.max(60, Number(arg('frames', '1200')) || 1200);

const POLICIES = POLICY_ARG === 'both' ? ['smart', 'impulsive']
  : POLICY_ARG === 'smart' ? ['smart']
  : POLICY_ARG === 'impulsive' ? ['impulsive']
  : null;
if (!POLICIES) {
  console.error('autoplay_policy: --policy must be smart|impulsive|both');
  process.exit(2);
}

function pairSeed(runIdx) {
  return (SEED_BASE + runIdx) | 0;
}

function seedStreams(T, seed) {
  const st = T.state;
  st.choiceSeed = seed | 0;
  st.choiceRng = mulberry32(seed);
  st.shrineRng = mulberry32(seed ^ 0x5eed);
  // (sites are placed by startRun from the world seed)
  st.groundSeed = seed | 0;
  // Non-night auto-picks draw here (dev-night uses the deterministic
  // tier-first rule instead); seeded so the arm is replayable.
  T.draftAuto.rng = mulberry32(seed ^ 0x9e37);
}

function buyPhase(T, policy, est) {
  const profile = T.getProfile();
  const next = policy === 'smart'
    ? () => smartNextBuy(profile, est)
    : () => impulsiveNextBuy(profile);
  const bought = [];
  for (let guard = 0; guard < 100; guard++) {
    const id = next();
    if (!id) break;
    if (!buyUpgrade(profile, id)) break;   // gold moved under us: stop, never force
    bought.push(id);
  }
  return bought;
}

async function runArm(policy) {
  const h = await boot({
    locationSearch: '?dev=1',
    variant: 'autoplay-' + policy + '-' + SEED_BASE,
  });
  // Arm the REAL toggle path (persisted pref + live session, same writes the
  // overlay AUTO/DNIGHT buttons make). The runner refuses while AUTO is OFF.
  h.T.dev.setAutoplay(true);
  h.T.dev.setDevNight(true);
  h.T.dev.setSpeed(8);
  h.T.startRun();
  requireAutoplay(h.T.dev.session);
  if (devFreeBuild()) throw new Error('autoplay_policy: free-build must stay OFF');
  const sess = h.T.dev.session;
  // K5: the ban-list arm + ids ride the run's log line (and the snapshot row's
  // additive draft_ban field) so a cohort proves which ids were excluded.
  console.log(`autoplay_policy: arm=${policy} autoplay=${sess.autoplay} ` +
    `devNight=${sess.devNight} speed=${sess.speed} ` +
    `draftBan=${sess.draftBan ? (sess.draftBanIds || []).join(',') || '(empty)' : 'off'}`);
  if (sess.speed !== 8) throw new Error('autoplay_policy: speed did not latch 8x');

  const history = [];
  const rows = [];
  for (let r = 0; r < RUNS; r++) {
    const seed = pairSeed(r);
    markArm(`autoplay:${policy}:run${r + 1}`);
    if (r > 0) h.T.startRun();
    seedStreams(h.T, seed);
    h.T.dev.setPolicy(policy);
    if (h.T.dev.session.speed !== 8) h.T.dev.setSpeed(8);

    let frames = 0;
    while (!h.T.dev.session.snapshot && frames < MAX_FRAMES) {
      h.pump(1);
      frames++;
      if (frames % 600 === 0) {
        const st = h.T.state;
        console.log(`  [${policy} run ${r + 1}] f=${frames} t=${Math.floor(st.time)}s ` +
          `wave=${st.wave.num} mode=${st.mode} earned=${st.runCounts.gold.earned}`);
      }
    }
    const pre = h.T.dev.session.snapshot;
    if (!pre) {
      console.log(`  [${policy} run ${r + 1}] TRUNCATED after ${frames} frames (no row)`);
      continue;
    }
    // Buy BETWEEN runs, then snapshot the post-buy build through the REAL
    // builder (upgrades + gold_spent at full price, investment rule intact).
    // The settle tick lets the session's async game_rev fetch land first, so
    // the row carries the documented 'unavailable' fallback (never 'pending')
    // when no saver backend is present.
    const est = estimateRunIncome(history);
    const bought = buyPhase(h.T, policy, est);
    await new Promise((r) => setTimeout(r, 50));
    const snap = h.T.dev.rebuildSnapshot();
    history.push(snap.gold_earned);
    rows.push({ snap, bought, seed, frames });
    console.log(`  [${policy} run ${r + 1}] seed=${seed} wave=${snap.wave} ` +
      `earned=${snap.gold_earned} spent=${snap.gold_spent} dmg=${snap.damage} ` +
      `buys=[${bought.join(',') || 'hold'}] mode=${snap.mode} speed=${snap.speed}`);
  }
  return rows;
}

const linesBefore = fs.existsSync(SNAP_FILE)
  ? fs.readFileSync(SNAP_FILE, 'utf-8').split('\n').filter((l) => l.trim() !== '').length
  : 0;
declareSimBudget(POLICIES.length * RUNS * 25);
let appended = 0;
let firstRow = null;
for (const policy of POLICIES) {
  const rows = await runArm(policy);
  for (const { snap } of rows) {
    fs.appendFileSync(SNAP_FILE, JSON.stringify(snap) + '\n');
    appended++;
    if (!firstRow) firstRow = snap;
  }
}
const linesAfter = fs.readFileSync(SNAP_FILE, 'utf-8')
  .split('\n').filter((l) => l.trim() !== '').length;
console.log(`autoplay_policy: log lines ${linesBefore} -> ${linesAfter} (+${appended})`);
if (firstRow) console.log('autoplay_policy: sample row: ' + JSON.stringify(firstRow));
if (appended === 0) {
  console.error('autoplay_policy: no snapshot rows produced');
  process.exit(1);
}
