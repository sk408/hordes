// HORDES — tools/run_curve.mjs — G18 SLICE 1: THE RUN-LENGTH CURVE REPORTER.
//
// Instrumentation ONLY (the G18 slice 1 charter: nothing is tuned here). Two
// modes:
//
//   node tools/run_curve.mjs [logfile ...]
//       The reporter. NO sims, deterministic, finishes in milliseconds. Reads
//       the MEASURED baseline from tools/economy_ledger.mjs AND any per-run
//       logs produced by --run below, and prints per stage (fresh|partial|
//       maxed): n, the seeds, goldMean/goldMedian, lenMeanS/lenMedianS, GOLD
//       PER HOUR with the divisor printed out loud, the GOLD_MODEL tier, the
//       ratio lines against the stage below (length AND gold/hour), and the
//       OWNER'S MODEL comparison (fresh dies 3-6 min, developed ~20h
//       occasionally reaches 30:00, maxed reaches it regularly).
//
//   node tools/run_curve.mjs --run <stage> --seed <s> --out <log>
//       EXACTLY ONE run through the EXISTING tools/real_loop.mjs seams
//       (runRealCohort — the same overlay auto-play policy, the same record
//       shape; never a second harness), one run per process under the owner's
//       60-second cap: Math.random is replaced by a seeded mulberry32 (the
//       whole loop reproduces from (stage, seed)), progress lines stream to
//       the log so the run is never silent, and a 55s wall guard aborts the
//       process honestly (cause 'WALL CAP') rather than letting it wedge.
//
// Log format: '#' comment/progress lines are ignored by the reporter; each
// finished run appends one 'REC <json>' line carrying the real_loop record
// plus stage/seed/source.
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { MEASURED, goldPerHour } from './economy_ledger.mjs';
import { mean, median } from './real_loop.mjs';
import { GOLD_MODEL } from '../src/meta.js';

const HB = '/tmp/g18_curve_progress.log';
const hb = (line) => { try { appendFileSync(HB, `${new Date().toISOString()} ${line}\n`); } catch { /* /tmp hiccup must not kill a run */ } };

// ---- --run: ONE run per process, through the existing harness ----------------
async function singleRun(stage, seed, outPath) {
  mkdirSync(dirname(outPath), { recursive: true });
  const t0 = Date.now();
  hb(`--run START stage=${stage} seed=${seed} out=${outPath}`);
  appendFileSync(outPath, `# run_curve --run stage=${stage} seed=${seed} started=${new Date().toISOString()}\n`);
  const { mulberry32 } = await import('../src/weather.js');
  const rand = Math.random;
  Math.random = mulberry32(seed);          // the WHOLE loop reproduces from this seed
  let recs = null;
  try {
    const { runRealCohort } = await import('./real_loop.mjs');
    recs = await runRealCohort(stage, 1, {
      maxSeconds: 1860,                    // RUN.LIMIT + 60: a limit run is COMPLETE, not censored
      onRun: () => {},
      onProgress: (r, line) => {
        if (Date.now() - t0 > 55000) throw new Error('WALL CAP 55s (owner 60s measurement directive)');
        appendFileSync(outPath, line + '\n');
      },
    });
  } catch (e) {
    Math.random = rand;
    appendFileSync(outPath, `# ABORTED: ${e.message}\n`);
    hb(`--run ABORT stage=${stage} seed=${seed} wall=${Date.now() - t0}ms (${e.message})`);
    console.error(`run_curve --run ${stage} seed=${seed}: ${e.message}`);
    process.exit(2);
  }
  Math.random = rand;
  const r = recs[0];
  const rec = { ...r, stage, seed, source: 'g18_slice1', wallMs: Date.now() - t0 };
  appendFileSync(outPath,
    `run 1/1: time=${rec.time}s wave=${rec.wave} cause=${rec.cause} killer=${rec.killer} ` +
    `kills=${rec.kills} level=${rec.level} gold=${rec.gold} hp=${rec.hp}${rec.won ? ' WON' : ''}\n`);
  appendFileSync(outPath, `REC ${JSON.stringify(rec)}\n`);
  hb(`--run DONE stage=${stage} seed=${seed} wall=${rec.wallMs}ms time=${rec.time}s cause=${rec.cause}`);
  console.log(`run 1/1: time=${rec.time}s wave=${rec.wave} cause=${rec.cause} killer=${rec.killer} ` +
    `kills=${rec.kills} level=${rec.level} gold=${rec.gold}${rec.won ? ' WON' : ''}`);
  console.log(`log: ${outPath} (wall ${rec.wallMs}ms)`);
}

// ---- the reporter ------------------------------------------------------------
const STAGES = ['fresh', 'partial', 'maxed'];
const MODEL = {
  fresh: 'owner model: dies 3-6 min (180-360s)',
  partial: 'owner model: developed (~20h) occasionally reaches the 30:00 limit',
  maxed: 'owner model: reaches the 30:00 limit regularly',
};

function parseLogs(files) {
  const recs = [];
  for (const f of files) {
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      if (line.startsWith('REC ')) {
        try { recs.push(JSON.parse(line.slice(4))); } catch { /* torn tail line: never fatal */ }
      }
    }
  }
  return recs;
}

function stageLine(label, stage, n, seeds, goldMean, goldMedian, lenMeanS, lenMedianS) {
  const tier = MEASURED[stage].tier;
  const tierGold = GOLD_MODEL.INCOME_TIERS[tier] ? GOLD_MODEL.INCOME_TIERS[tier].gold : '?';
  const gph = lenMeanS > 0 ? goldMean / (lenMeanS / 3600) : NaN;
  const lenS = lenMedianS !== undefined && lenMedianS !== null ? lenMedianS.toFixed(1) : 'n/a';
  console.log(`${label}: n=${n} seeds=${seeds.join(',')} goldMean=${goldMean.toFixed(1)} goldMedian=${goldMedian} ` +
    `lenMeanS=${lenMeanS.toFixed(1)} lenMedianS=${lenS}`);
  console.log(`         gold/hour=${Math.round(gph)} (DIVISOR: goldMean ${goldMean.toFixed(1)} / lenMeanS ` +
    `${lenMeanS.toFixed(1)}s -- the MEASURED run length, never the 30:00 limit)  tier=${tier} ` +
    `(INCOME_TIERS[${tier}] = ${tierGold}g/run)`);
  return { gph, lenMeanS };
}

function report(files) {
  const newRecs = parseLogs(files);
  console.log('HORDES RUN-LENGTH CURVE (G18 slice 1, instrumentation only — nothing tuned)');
  console.log(`baseline source: tools/economy_ledger.mjs MEASURED (G17 slice 1, 2026-09-15)` +
    (files.length ? `; new runs: ${files.length} logs, ${newRecs.length} records` : '; no new logs given'));
  const agg = {};
  for (const s of STAGES) {
    console.log(`\n[${s}]  ${MODEL[s]}`);
    const base = MEASURED[s];
    const b = stageLine('  baseline', s, base.n, [base.seed], base.goldMean, base.goldMedian, base.lenMeanS, null);
    // MEASURED predates this slice and carries no per-run records, so its
    // lenMedianS is not derivable — printed 'n/a', never invented.
    const recs = newRecs.filter(r => r.stage === s);
    agg[s] = { base: b, recs };
    if (recs.length) {
      const seeds = recs.map(r => r.seed);
      const lenA = recs.map(r => r.time), goldA = recs.map(r => r.gold);
      agg[s].nw = stageLine('  NEW     ', s, recs.length, seeds,
        mean(goldA), median(goldA), mean(lenA), median(lenA));
      const modelBand = s === 'fresh' ? [180, 360] : null;
      if (modelBand) {
        const m = mean(lenA);
        const verdict = m < modelBand[0] ? `MISMATCH: mean ${m.toFixed(1)}s is BELOW the 3-6 min band` : 'matches';
        console.log(`         model check: fresh re-measured mean ${m.toFixed(1)}s vs band ` +
          `${modelBand[0]}-${modelBand[1]}s -> ${verdict} (FINDING, not fixed here)`);
      }
    } else if (s === 'maxed') {
      console.log('  NEW     : none — maxed (1800s wall) is NOT re-run under the 60s cap; quote MEASURED.maxed');
    }
  }
  // Ratio lines, stage against the stage below (partial vs fresh, maxed vs
  // partial), on the NEW cohort when it exists, else the baseline.
  console.log('\nratios (stage / stage below):');
  for (const [a, below] of [['partial', 'fresh'], ['maxed', 'partial']]) {
    const src = (x) => (agg[x].nw ? { set: 'NEW', d: agg[x].nw } : { set: 'baseline', d: agg[x].base });
    const A = src(a), B = src(below);
    console.log(`  ${a} vs ${below} (${A.set} vs ${B.set}): length x${(A.d.lenMeanS / B.d.lenMeanS).toFixed(2)} ` +
      `(divisors: ${A.d.lenMeanS.toFixed(1)}s / ${B.d.lenMeanS.toFixed(1)}s), ` +
      `gold/hour x${(A.d.gph / B.d.gph).toFixed(2)} (${Math.round(A.d.gph)} / ${Math.round(B.d.gph)})`);
  }
}

const isMain = process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href;
if (isMain) {
  const args = process.argv.slice(2);
  if (args[0] === '--run') {
    const stage = args[args.indexOf('--run') + 1] || 'fresh';
    const seed = Number(args[args.indexOf('--seed') + 1]) || 101;
    const outIdx = args.indexOf('--out');
    const out = outIdx >= 0 ? args[outIdx + 1] : `/tmp/g18_curve/${stage}_${seed}.log`;
    if (!STAGES.includes(stage)) { console.error('stage must be fresh|partial|maxed'); process.exit(1); }
    singleRun(stage, seed, out).catch(e => { console.error(e); process.exit(1); });
  } else {
    report(args.filter(a => !a.startsWith('-')));
  }
}
