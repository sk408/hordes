#!/usr/bin/env node
// HORDES — PROGRESSION SIMULATOR (the rebalance measuring stick).
//
// Simulates whole CAREERS through the real game: fresh profile -> run (real
// loop, real AUTO pilot) -> real gold settlement -> shop policy spending
// through the real buy functions -> next run. Seeded and reproducible.
//
//   node tools/progression_sim.mjs --runs 40 --seeds 3 --shop stats-first
//   node tools/progression_sim.mjs --matrix --runs 15 --seeds 2
//   node tools/progression_sim.mjs --fixed-build 2500,10000,30000 --k 6
//   node tools/progression_sim.mjs --list
//
// Full flag reference and how to read the report: docs/PROGRESSION_SIM.md.
// Layout: tools/progression/{catalogue,policies,engine,report}.mjs.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadCatalogue, requireRule, treeRoot, treeUrl, SimConfigError } from './progression/catalogue.mjs';
import { SHOP_POLICIES, makeShopper, SAVE_UP_RUNS } from './progression/policies.mjs';
import { careerReport, fixedReport } from './progression/report.mjs';

const SELF = fileURLToPath(import.meta.url);
const DRAFTS = ['random', 'weapons-first', 'stats-first'];
const ONCE = ['asis', 'take', 'never'];
const LOADOUTS = ['default', 'all-owned'];
const AXES = ['shop', 'loadout', 'draft', 'once', 'stance', 'character'];

const HELP = `HORDES progression simulator

MODES
  (default)            career simulation for ONE policy
  --matrix [axes]      cross the listed axes (default: shop,loadout) and print one comparison table.
                       axes: ${AXES.join(',')}; or 'oat' = vary each axis one at a time around the base policy
  --fixed-build X[,Y]  grant X gold, spend it with --shop (no saving up), then --k independent runs per budget
  --list               print the live catalogue and how each shop row is classified, then exit

POLICY (each independent)
  --shop       ${SHOP_POLICIES.join(' | ')}            (default stats-first)
  --loadout    ${LOADOUTS.join(' | ')}                              (default default)
  --draft      ${DRAFTS.join(' | ')}             (default random = the game's uniform auto-pick)
  --once       ${ONCE.join(' | ')}  ONE OF EACH card: asis = no special handling  (default asis)
  --stance     a key of CONFIG.AUTOPILOT.STANCES (SAFE | BALANCED | GREEDY)  (default BALANCED)
  --character  a key of CHARACTERS; granted free at career start         (default: the free one)

SIZE / SPEED
  --runs N             runs per career                      (default 20)
  --seeds N            careers per policy, seeds base+1..N  (default 3)
  --seed-base N        (default 1000)
  --k N                fixed-build: runs per budget         (default 6)
  --speed N            sim substeps per frame (state.gameSpeed)  (default 8)
  --max-run-seconds N  cap a run at N sim seconds           (default 1800)
  --concurrency N      worker processes                     (default: cores - 1)
  --overhead-seconds N menu/shop time added per run for the play-hours estimate (default 20)

OUTPUT
  --json FILE          write every record as JSONL (deterministic order)
  --detail             matrix: also print the per-window table for every policy
  --quiet              no progress lines on stderr
  --verbose            one stderr line per finished run (with its wall time)
  --trace-every N      add a trace array to every JSONL record: one sample per N sim seconds
                       (level, drafts, kills, hp, maxHp, damage, enemies alive, purse, wave)

ADVANCED
  --tree DIR           simulate another checkout of the game (default: this repo)
  --damage-row ID      row stats-first buys (default dmg)
  --weapon-line A,B    rows weapons-first buys after unlocks (default split,slots)
  --once-rule ID       run-rule id of ONE OF EACH (default once)
  --stat-priority A,B  draft stats-first card order (default multi,rate,dmg,pierce,hp,speed,pickup)
`;

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new SimConfigError(`unexpected argument '${a}' (flags are --name value)`);
    const eq = a.indexOf('=');
    if (eq > 0) { o[a.slice(2, eq)] = a.slice(eq + 1); continue; }
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) { o[a.slice(2)] = next; i++; } else o[a.slice(2)] = true;
  }
  return o;
}
function int(o, k, d, min = 1) {
  if (o[k] === undefined) return d;
  const n = Number(o[k]);
  if (!Number.isFinite(n) || n < min) throw new SimConfigError(`--${k} must be a number >= ${min} (got '${o[k]}')`);
  return n;
}
const list = (v) => String(v).split(',').map((s) => s.trim()).filter(Boolean);

// ------------------------------------------------------------- worker side
if (process.argv[2] === '--worker') {
  const job = JSON.parse(Buffer.from(process.argv[3], 'base64').toString('utf8'));
  process.env.HORDES_TREE = job.tree;
  try {
    const E = await import('./progression/engine.mjs');
    let tPrev = Date.now();
    const emit = (rec) => {
      process.stdout.write('@@R ' + JSON.stringify(rec) + '\n');
      if (job.verbose && rec.kind !== 'done') {
        const now = Date.now();
        process.stderr.write(`    ${job.label} run ${rec.run ?? 1}: ${rec.end} t=${rec.t}s wave ${rec.wave} lvl ${rec.level} gold ${rec.gold}` +
          `${rec.bought ? ' buys ' + rec.bought.map((b) => b.id).join(',') : ''}  (${((now - tPrev) / 1000).toFixed(1)}s wall)\n`);
        tPrev = now;
      }
    };
    if (job.mode === 'fixed') await E.runFixed(job, emit); else await E.runCareer(job, emit);
    emit({ kind: 'done', draftTimeoutS: E.draftTimeoutS() });
    process.exit(0);
  } catch (e) {
    process.stderr.write(`progression_sim worker failed (${job.label}): ${e instanceof SimConfigError ? e.message : e.stack}\n`);
    process.exit(e instanceof SimConfigError ? 2 : 1);
  }
}

// ------------------------------------------------------------- parent side
function runJob(job, quiet) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const arg = Buffer.from(JSON.stringify(job)).toString('base64');
    const child = spawn(process.execPath, [SELF, '--worker', arg], { stdio: ['ignore', 'pipe', 'inherit'] });
    const recs = []; let buf = '';
    child.stdout.on('data', (d) => {
      buf += d;
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
        if (line.startsWith('@@R ')) recs.push(JSON.parse(line.slice(4)));
      }
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0 || !recs.some((r) => r.kind === 'done')) return reject(new SimConfigError(`worker for ${job.label} failed (exit code ${code}); see its message above`));
      if (!quiet) process.stderr.write(`  done ${job.label}  ${((Date.now() - t0) / 1000).toFixed(1)}s wall\n`);
      resolve(recs);
    });
  });
}

async function runAll(jobs, concurrency, quiet) {
  const results = new Array(jobs.length);
  let next = 0, failed = null;
  async function lane() {
    while (next < jobs.length && !failed) {
      const i = next++;
      try { results[i] = await runJob(jobs[i], quiet); } catch (e) { failed = failed || e; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, lane));
  if (failed) throw failed;
  return results;
}

function expandMatrix(spec, base, cat, stances) {
  const values = {
    shop: SHOP_POLICIES, loadout: LOADOUTS, draft: DRAFTS, once: ONCE,
    stance: stances, character: cat.characters,
  };
  if (spec === 'oat') {
    const out = [base];
    for (const ax of AXES) for (const v of values[ax]) if (v !== base[ax]) out.push({ ...base, [ax]: v });
    return out;
  }
  const axes = spec === true ? ['shop', 'loadout'] : list(spec);
  for (const ax of axes) if (!AXES.includes(ax)) throw new SimConfigError(`--matrix axis '${ax}' unknown. Axes: ${AXES.join(', ')} (or 'oat')`);
  let out = [base];
  for (const ax of axes) out = out.flatMap((p) => values[ax].map((v) => ({ ...p, [ax]: v })));
  return out;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.help || o.h) { process.stdout.write(HELP); return; }
  if (o.tree) process.env.HORDES_TREE = path.resolve(String(o.tree));
  const tree = treeRoot();
  const cat = await loadCatalogue();
  const CFG = (await import(new URL('file:///' + path.join(tree, 'src/config.js').replace(/\\/g, '/')).href)).CONFIG;
  const stances = Object.keys((CFG.AUTOPILOT && CFG.AUTOPILOT.STANCES) || {});

  const base = {
    shop: o.shop || 'stats-first', loadout: o.loadout || 'default', draft: o.draft || 'random', once: o.once || 'asis',
    stance: o.stance || 'BALANCED', character: o.character || cat.defaultCharacter,
    damageRow: o['damage-row'] || 'dmg', weaponLine: o['weapon-line'] ? list(o['weapon-line']) : ['split', 'slots'],
    onceRule: o['once-rule'] || 'once',
    ...(o['stat-priority'] ? { statPriority: list(o['stat-priority']) } : {}),
  };

  if (o.list) {
    const rows = cat.rows.map((d) => {
      const first = cat.offers({ purchased: {}, unlockedWeapons: [], unlockedElites: [] }).find((x) => x.id === d.id);
      return `  ${d.id.padEnd(22)} ${(d.kind || 'stat').padEnd(7)} ${cat.combat.has(d.id) ? 'combat ' : 'economy'} first step ${first ? first.cost : '-'}`;
    });
    process.stdout.write(`tree ${tree}\n${cat.rows.length} shop rows, ${cat.totalItems} purchase steps, ${cat.totalCost} gold total\n` +
      rows.join('\n') + `\ncharacters: ${cat.characters.join(', ')}\nstances: ${stances.join(', ')}\n` +
      cat.notes.map((n) => 'NOTE: ' + n + '\n').join(''));
    return;
  }

  const policies = o.matrix ? expandMatrix(o.matrix, base, cat, stances) : [base];
  // Fail fast, in the parent, on anything a tuning change may have removed.
  for (const p of policies) {
    if (!DRAFTS.includes(p.draft)) throw new SimConfigError(`unknown draft policy '${p.draft}'. Choose one of: ${DRAFTS.join(', ')}`);
    if (!ONCE.includes(p.once)) throw new SimConfigError(`unknown --once '${p.once}'. Choose one of: ${ONCE.join(', ')}`);
    if (!LOADOUTS.includes(p.loadout)) throw new SimConfigError(`unknown loadout policy '${p.loadout}'. Choose one of: ${LOADOUTS.join(', ')}`);
    if (!stances.includes(p.stance)) throw new SimConfigError(`stance '${p.stance}' is not in CONFIG.AUTOPILOT.STANCES (have: ${stances.join(', ')})`);
    cat.requireCharacter(p.character);
    makeShopper(p.shop, cat, p);
    if (p.once !== 'asis') await requireRule(p.onceRule);
  }

  const runs = int(o, 'runs', 20), nSeeds = int(o, 'seeds', 3), seedBase = int(o, 'seed-base', 1000, 0);
  const speed = int(o, 'speed', 8), maxRunSeconds = int(o, 'max-run-seconds', 1800);
  const overheadSeconds = int(o, 'overhead-seconds', 20, 0), k = int(o, 'k', 6);
  const concurrency = int(o, 'concurrency', Math.max(1, os.availableParallelism() - 1));
  const quiet = !!o.quiet;
  const common = { tree, speed, maxRunSeconds, overheadSeconds, verbose: !!o.verbose, traceEvery: int(o, 'trace-every', 0, 0) };
  const key = (p) => [p.shop, p.loadout, p.draft, p.once, p.stance, p.character].join('/');

  const jobs = [];
  const fixed = o['fixed-build'];
  if (fixed) {
    const budgets = list(fixed).map(Number);
    if (!budgets.length || budgets.some((b) => !Number.isFinite(b) || b < 0)) throw new SimConfigError(`--fixed-build wants gold amounts, e.g. --fixed-build 2500,10000,30000`);
    for (const p of policies) for (const budget of budgets) for (let s = 1; s <= k; s++) {
      jobs.push({ ...common, mode: 'fixed', policy: p, budget, seed: seedBase + s, label: `${key(p)} budget=${budget} seed=${seedBase + s}` });
    }
  } else {
    for (const p of policies) for (let s = 1; s <= nSeeds; s++) {
      jobs.push({ ...common, mode: 'career', policy: p, runs, seed: seedBase + s, label: `${key(p)} seed=${seedBase + s}` });
    }
  }

  if (!quiet) process.stderr.write(`progression_sim: ${jobs.length} worker jobs, concurrency ${Math.min(concurrency, jobs.length)}\n`);
  const t0 = Date.now();
  const results = await runAll(jobs, concurrency, quiet);
  const wall = (Date.now() - t0) / 1000;
  const done = results.flat().find((r) => r.kind === 'done');
  const records = results.flat().filter((r) => r.kind !== 'done');   // job order = policy, (budget), seed; run order within

  const L = [];
  L.push('HORDES PROGRESSION SIMULATOR' + (fixed ? ' — fixed build' : o.matrix ? ' — policy matrix' : ' — career'));
  L.push(`tree: ${tree}`);
  L.push(`catalogue (live from src/meta.js): ${cat.rows.length} shop rows, ${cat.totalItems} purchase steps, ${cat.totalCost} gold; ` +
    `${cat.combat.size} combat rows, ${cat.rows.length - cat.combat.size} economy rows`);
  L.push(fixed
    ? `setup: budgets ${list(fixed).join(', ')} x ${k} runs (seeds ${seedBase + 1}..${seedBase + k}), speed ${speed}x, run cap ${maxRunSeconds}s`
    : `setup: ${policies.length} polic${policies.length === 1 ? 'y' : 'ies'} x ${nSeeds} seeds (${seedBase + 1}..${seedBase + nSeeds}) x ${runs} runs, speed ${speed}x, run cap ${maxRunSeconds}s`);
  L.push(`policy key: shop/loadout/draft/once/stance/character; shop policies save up when a target is within ${SAVE_UP_RUNS} runs of recent income`);
  L.push(`play hours = survival seconds + drafts x ${done.draftTimeoutS}s auto-pick wait + ${overheadSeconds}s per run of menu time, at 1x game speed`);
  L.push('CAVEAT: the game\'s AUTO pilot plays worse than a person, so every survival, income and pace figure here is a FLOOR.');
  L.push('CAVEAT: results depend on --speed (substep count changes pilot timing); compare runs made at the same speed only.');
  for (const n of cat.notes) L.push('NOTE: ' + n);
  L.push('');
  L.push(fixed ? fixedReport(records) : careerReport(records, { detailAll: !!o.detail }));
  process.stdout.write(L.join('\n') + '\n');

  if (o.json && o.json !== true) {
    const meta = { kind: 'meta', tree, mode: fixed ? 'fixed' : 'career', runs, seeds: nSeeds, seedBase, speed, maxRunSeconds, overheadSeconds,
      policies: policies.map(key), catalogue: { rows: cat.rows.length, steps: cat.totalItems, cost: cat.totalCost } };
    fs.writeFileSync(String(o.json), [meta, ...records].map((r) => JSON.stringify(r)).join('\n') + '\n');
    if (!quiet) process.stderr.write(`wrote ${records.length} records to ${o.json}\n`);
  }
  if (!quiet) {
    const simS = records.reduce((s, r) => s + (r.t || 0), 0);
    process.stderr.write(`wall ${wall.toFixed(1)}s for ${records.length} runs, ${Math.round(simS)} sim-seconds (${(simS / wall).toFixed(0)}x real time overall)\n`);
  }
}

main().catch((e) => {
  process.stderr.write((e instanceof SimConfigError ? 'progression_sim: ' + e.message : e.stack) + '\n');
  process.exit(e instanceof SimConfigError ? 2 : 1);
});
