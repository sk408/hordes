// HORDES — STEP 4 readings driver (sibling of tools/autoplay_policy.mjs).
//
// Same instrument, one addition: GRANTED-PROFILE starts. The landed runner
// always starts fresh and grows by policy buys; BALANCE_PLAN items 2/4
// require fresh/couple/partial/half tier starts. Builds are granted through
// the REAL meta.js buyUpgrade path (full-price investment accounting intact)
// and EVERY figure from a granted start is labeled granted-profile — the
// granted-vs-earned split (BALANCE_PLAN item 7) does not exist yet, so no
// granted number is ever presented as earned.
//
// Everything else is the landed path verbatim: ?dev=1 boot, REAL toggle
// (AUTO + DNIGHT + SPEED 8x), paired seeds (base + runIdx, identical streams
// per run index across policies AND profiles), dev-night nightmare rules
// (auto-continue/restart, tier-first draft picks, NO banking cut), buys
// BETWEEN runs through the REAL buyer (chain mode) or tier-pure resets
// (pure mode), one snapshot row per COMPLETED run appended to
// tools/.snapshots/runs.jsonl through the REAL snapshot builder.
// A run that outlives its frame cap is TRUNCATED: no log row (never a faked
// snapshot) — its drafts/killer-alive state is reported on stdout only and
// the run counts as censored.
//
// Prologue: granted builds stamp achievements.totals.runs = 1 (the
// test/_harness.mjs convention), so runs measure ordinary-run behaviour, not
// the first-run INERT prologue (src/main.js startRun, C.PROLOGUE.ENABLED).
// Without the stamp every arm opens INERT and hits the machine cap — that is
// what broke tools/measure_income_stages.mjs on this tree (see STEP 4
// readings in docs/BALANCE_PLAN.md).
//
// Usage (from the repo root):
//   node tools/step4_cliff.mjs --profile fresh --policy smart --runs 3 --seed 4242 [--chain] [--frames 1200]
//
// Change NO balance number anywhere: this tool only reads and snapshots.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot } from '../test/_harness.mjs';
import { declareSimBudget, markArm } from '../test/_sim_budget.mjs';
import { mulberry32 } from '../src/weather.js';
// M5b: the pay shrine is gone; the run's sites seed in startRun.
import { makeProfile, buyUpgrade, SHOP_UPGRADES, devFreeBuild } from '../src/meta.js';
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
function flag(name) {
  return process.argv.includes('--' + name);
}

const PROFILE = arg('profile', 'fresh');
const POLICY_ARG = arg('policy', 'smart');
const RUNS = Math.max(1, Number(arg('runs', '3')) || 3);
const SEED_BASE = (Number(arg('seed', '4242')) || 4242) | 0;
const MAX_FRAMES = Math.max(60, Number(arg('frames', '1200')) || 1200);
const CHAIN = flag('chain');   // chain policy buys across runs (autoplay style);
                               // default (pure): re-grant the tier build each run
const GRAMS_PER_FRAME_S = 8 / 60;   // 8x substeps, frame dt unchanged

const POLICIES = POLICY_ARG === 'both' ? ['smart', 'impulsive']
  : POLICY_ARG === 'smart' ? ['smart']
  : POLICY_ARG === 'impulsive' ? ['impulsive']
  : null;
if (!POLICIES) {
  console.error('step4_cliff: --policy must be smart|impulsive|both');
  process.exit(2);
}
if (!['fresh', 'couple', 'partial', 'half'].includes(PROFILE)) {
  console.error('step4_cliff: --profile must be fresh|couple|partial|half');
  process.exit(2);
}

// Granted builds: mirror tools/measure_income_stages.mjs buildProfile()
// (same spends), then stamp runs=1 so the run is ordinary, not prologue.
// GRANTED-PROFILE: full price recorded, nothing deducted (item 7 split
// does not exist yet) — label every downstream figure as granted.
function grantedBuild(name) {
  const prof = makeProfile();
  if (name === 'couple') {
    prof.gold = 1000;
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
    prof.gold = 1_000_000_000;
    const rows = SHOP_UPGRADES.map((def) => {
      const probe = makeProfile(); probe.gold = 1e12;
      for (let i = 0; i < def.maxLevel; i++) { if (!buyUpgrade(probe, def.id)) break; }
      return { def, full: 1e12 - probe.gold };
    }).sort((a, b) => a.full - b.full);
    for (const row of rows.slice(0, Math.ceil(rows.length / 2))) {
      for (let i = 0; i < row.def.maxLevel; i++) if (!buyUpgrade(prof, row.def.id)) break;
    }
    prof.gold = 0;
  }
  prof.achievements = prof.achievements || {};
  prof.achievements.totals = prof.achievements.totals || {};
  prof.achievements.totals.runs = 1;   // ordinary run, not the INERT prologue
  return prof;
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
  T.draftAuto.rng = mulberry32(seed ^ 0x9e37);
}

// Killer binning: BOSS (bossId/endboss) or HERALD (midBoss) vs AMBIENT
// (everything else: contact/shot/drain/pillar/unknown). Mirrors
// tools/real_loop.mjs classify(); raw cause printed per run for audit.
// COLOSSUS friendly-fire ruling respected: only enemy-side stamps bin as
// BOSS/HERALD; nothing here credits the player.
function binKiller(d) {
  if (!d) return 'ALIVE';
  if (d.bossId) return 'BOSS';
  if (d.midBoss) return 'HERALD';
  return 'AMBIENT';
}
function rawCause(d) {
  if (!d) return '-';
  if (d.midBoss) return 'HERALD';
  if (d.bossId) return 'ENDBOSS:' + d.bossId;
  if (d.typeId === 'PILLAR') return 'PILLAR';
  if (d.cause === 'shot') return 'shot:' + d.typeId;
  if (d.cause === 'drain') return 'drain';
  if (d.cause) return d.cause + ':' + (d.typeId || d.name || '?');
  return 'contact:' + (d.typeId || d.name || '?');
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
    if (!buyUpgrade(profile, id)) break;
    bought.push(id);
  }
  return bought;
}

async function runArm(policy) {
  const h = await boot({
    locationSearch: '?dev=1',
    variant: 'step4-' + PROFILE + '-' + policy + '-' + SEED_BASE,
  });
  h.T.dev.setAutoplay(true);
  h.T.dev.setDevNight(true);
  h.T.dev.setSpeed(8);
  // Tier start (granted): applied before run 1; pure mode re-applies every run.
  Object.assign(h.T.getProfile(), grantedBuild(PROFILE));
  h.T.startRun();
  requireAutoplay(h.T.dev.session);
  if (devFreeBuild()) throw new Error('step4_cliff: free-build must stay OFF');
  const sess = h.T.dev.session;
  console.log(`step4_cliff: profile=${PROFILE} arm=${policy} chain=${CHAIN ? 'on' : 'pure'} ` +
    `autoplay=${sess.autoplay} devNight=${sess.devNight} speed=${sess.speed}`);
  if (sess.speed !== 8) throw new Error('step4_cliff: speed did not latch 8x');

  const history = [];
  const rows = [];
  let censored = 0;
  for (let r = 0; r < RUNS; r++) {
    const seed = pairSeed(r);
    markArm(`step4:${PROFILE}:${policy}:run${r + 1}`);
    if (r > 0) {
      if (!CHAIN) Object.assign(h.T.getProfile(), grantedBuild(PROFILE));
      h.T.startRun();
    }
    seedStreams(h.T, seed);
    h.T.dev.setPolicy(policy);
    if (h.T.dev.session.speed !== 8) h.T.dev.setSpeed(8);

    let frames = 0;
    while (!h.T.dev.session.snapshot && frames < MAX_FRAMES) {
      h.pump(1);
      frames++;
    }
    const pre = h.T.dev.session.snapshot;
    const gameS = frames * GRAMS_PER_FRAME_S;
    if (!pre) {
      // TRUNCATED: no log row. Report the live state on stdout only.
      censored++;
      let live = { wave: h.T.state.wave.num, drafts: -1 };
      try {
        const ch = h.T.dev.choices();
        live.drafts = (ch.drafts || []).length;
      } catch { /* reader absent: keep -1 */ }
      console.log(`  STEP4 profile=${PROFILE} policy=${policy} run=${r + 1}/${RUNS} ` +
        `seed=${seed} TRUNCATED f=${frames} t~${gameS.toFixed(0)}s wave=${live.wave} ` +
        `drafts=${live.drafts} killer=ALIVE earned~${Math.floor(h.T.state.runCounts.gold.earned || 0)}`);
      continue;
    }
    const deathBy = h.T.state.deathBy || null;
    const killer = binKiller(deathBy);
    const cause = rawCause(deathBy);
    const runLen = deathBy && Number.isFinite(deathBy.time) ? Math.floor(deathBy.time)
      : Math.floor(gameS);
    let bought = [];
    if (CHAIN) {
      const est = estimateRunIncome(history);
      bought = buyPhase(h.T, policy, est);
    }
    await new Promise((rr) => setTimeout(rr, 50));
    const snap = h.T.dev.rebuildSnapshot();
    history.push(snap.gold_earned);
    const drafts = (snap.choices && snap.choices.drafts) || [];
    const waves = {};
    for (const d of drafts) waves[d.wave] = (waves[d.wave] || 0) + 1;
    rows.push({ snap });
    console.log(`  STEP4 profile=${PROFILE} policy=${policy} run=${r + 1}/${RUNS} ` +
      `seed=${seed} f=${frames} t=${runLen}s wave=${snap.wave} killer=${killer} cause=${cause} ` +
      `drafts=${drafts.length} bywave=${JSON.stringify(waves)} earned=${snap.gold_earned} ` +
      `spent=${snap.gold_spent} dmg=${snap.damage} buys=[${bought.join(',') || 'hold'}] ` +
      `mode=${snap.mode} speed=${snap.speed} granted-profile`);
  }
  return { rows, censored };
}

const linesBefore = fs.existsSync(SNAP_FILE)
  ? fs.readFileSync(SNAP_FILE, 'utf-8').split('\n').filter((l) => l.trim() !== '').length
  : 0;
declareSimBudget(POLICIES.length * RUNS * 25);
let appended = 0;
let censoredTotal = 0;
for (const policy of POLICIES) {
  const { rows, censored } = await runArm(policy);
  censoredTotal += censored;
  for (const { snap } of rows) {
    fs.appendFileSync(SNAP_FILE, JSON.stringify(snap) + '\n');
    appended++;
  }
}
const linesAfter = fs.readFileSync(SNAP_FILE, 'utf-8')
  .split('\n').filter((l) => l.trim() !== '').length;
console.log(`step4_cliff: profile=${PROFILE} log lines ${linesBefore} -> ${linesAfter} (+${appended}) ` +
  `censored=${censoredTotal}/${POLICIES.length * RUNS}`);
if (appended === 0 && censoredTotal > 0) {
  console.log('step4_cliff: all runs censored (no rows appended, stdout readings only)');
}
