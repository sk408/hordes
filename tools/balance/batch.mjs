// HORDES balance batches (the balance review of 2026-11; docs/PROGRESSION_SIM.md,
// "Balance batches"). One batch = a named list of progression_sim worker jobs,
// run 6 at a time; every record is appended to a JSONL file as it lands, with
// its cell label and env added. Read the file with tools/balance/ana.mjs.
//
//   node tools/balance/batch.mjs <batch> <out.jsonl> [part]
//
// BAL_TREE=<dir> plays another checkout (default: this one). Run a batch through
// the CPU lock when other agents share the machine. Keep a batch under about
// 8 minutes: a late (400k) run takes about 25 s of wall time per worker slot,
// a mid (30k) run about 6 s, an early (3k) run about 3 s.
//
// The env switches each job may set are listed in tools/progression/engine.mjs
// (BAL_MAW_HP, BAL_PRESTIGE, BAL_CHAR_NOWEAPON, BAL_NOHAND). The draft policy
// 'auto-v1' and the shop policy 'buy-next-v1' are the game's rules before the
// review, for paired before/after on one tree.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TREE = process.env.BAL_TREE || path.resolve(HERE, '../..');
const SIM = path.join(TREE, 'tools/progression_sim.mjs');
const CONC = Math.max(1, Math.min(6, Number(process.env.BAL_CONC || 6)));
const [batch, out, partArg] = process.argv.slice(2);
const part = Number(partArg || 0);
if (!batch || !out) { console.error('usage: node tools/balance/batch.mjs <batch> <out.jsonl> [part]'); process.exit(2); }

const base = { shop: 'stats-first', loadout: 'default', draft: 'auto', once: 'asis', stance: 'BALANCED', character: 'KNIGHT',
  pilot: 'AUTO', damageRow: 'dmg', weaponLine: ['split', 'slots'], onceRule: 'once' };
const common = { speed: 8, maxRunSeconds: 1800, overheadSeconds: 20, verbose: false, traceEvery: 0 };
const J = [];
const fixed = (cell, pol, budget, seeds, env = {}) => { for (const s of seeds) J.push({ ...common, mode: 'fixed', policy: { ...base, ...pol }, budget, seed: s, cell, env, label: cell + ' s' + s }); };
const career = (cell, pol, runs, seeds, env = {}) => { for (const s of seeds) J.push({ ...common, mode: 'career', policy: { ...base, ...pol }, runs, seed: s, cell, env, label: cell + ' s' + s }); };
const rng = (a, n) => Array.from({ length: n }, (_, i) => a + i);
// BAL_SEEDS=<first>x<n> widens or moves the seed set (a bimodal cell needs more than 16).
// (Not <first>:<n> from Git Bash: it rewrites a colon in an env value.)
const S16 = process.env.BAL_SEEDS ? rng(...process.env.BAL_SEEDS.split(/[x:]/).map(Number)) : rng(2001, 16);          // the run lens's seeds (late0.jsonl and friends pair with these)
const FULL = 504298;                // every shop row at the time of the review

const B = {
  // ---- the review's own batches (balance_run / designer) ----
  run1: () => { for (const pilot of ['AUTO', 'EXPLORE']) career('run1/' + pilot, { pilot }, 1, rng(1, 200)); },
  early: () => { for (const pilot of ['AUTO', 'EXPLORE']) for (const draft of ['auto', 'evolution-first', 'hand-first', 'stats-first']) fixed(`early/${pilot}/${draft}/KNIGHT`, { pilot, draft }, 3000, S16); },
  mid: () => { const pilot = part ? 'EXPLORE' : 'AUTO'; for (const draft of ['auto', 'evolution-first', 'hand-first', 'stats-first']) fixed(`mid/${pilot}/${draft}/KNIGHT`, { pilot, draft }, 30000, S16); },
  late: () => { const draft = ['auto', 'evolution-first', 'hand-first'][part] || 'auto'; fixed(`late/AUTO/${draft}/KNIGHT`, { draft }, 400000, S16); },
  career: () => { const draft = process.env.BAL_CDRAFT || 'auto'; for (const shop of ['stats-first', 'weapons-first', 'cheapest']) career(`career/${shop}/${draft}`, { shop, draft }, Number(process.env.BAL_CRUNS || 30), rng(3001 + part * 2, 2)); },

  // ---- A1: the Maw at 7.5M (late, prestige 1); before = BAL_MAW_HP=250000 ----
  a1late: () => {   // part 0 = the auto-pick, 1 = evolution-first; plus two 250k seeds to check reuse of the review's late0
    const draft = part ? 'evolution-first' : 'auto';
    fixed(`late/AUTO/${draft}/KNIGHT/maw7.5M`, { draft }, 400000, S16);
    fixed(`late/AUTO/${draft}/KNIGHT/maw250k`, { draft }, 400000, S16.slice(0, 2), { BAL_MAW_HP: '250000' });
  },
  a1p1: () => {     // prestige 1 on the full shop, evolution-first; part 0 = 250k, 1 = 7.5M
    const hp = part ? '7500000' : '250000';
    fixed(`p1/AUTO/evolution-first/KNIGHT/maw${part ? '7.5M' : '250k'}`, { shop: 'cheapest', draft: 'evolution-first' }, FULL, S16, { BAL_PRESTIGE: '1', BAL_MAW_HP: hp });
  },

  // ---- A2: the auto-pick drafts for evolutions; before = auto-v1 ----
  a2early: () => {  // part 0 = AUTO pilot, 1 = EXPLORE
    const pilot = part ? 'EXPLORE' : 'AUTO';
    for (const shop of ['cheapest', 'stats-first']) for (const draft of ['auto-v1', 'auto', 'evolution-first']) fixed(`early/${pilot}/${shop}/${draft}`, { pilot, shop, draft }, 3000, S16);
  },
  a2mid: () => {    // part 0 = AUTO stats-first, 1 = AUTO cheapest, 2 = EXPLORE stats-first
    const [pilot, shop] = [['AUTO', 'stats-first'], ['AUTO', 'cheapest'], ['EXPLORE', 'stats-first']][part];
    // part 0 also runs stats-first drafting: the weakest mid build, to see whether the Maw withdraws
    for (const draft of ['auto-v1', 'auto', 'evolution-first', ...(part === 0 ? ['stats-first'] : [])]) fixed(`mid/${pilot}/${shop}/${draft}`, { pilot, shop, draft }, 30000, S16);
  },
  a2late: () => {   // part 0 = AUTO auto (v1 and evolution-first come from a1late), 1 = EXPLORE auto-v1, 2 = EXPLORE auto
    const [pilot, draft] = [['AUTO', 'auto'], ['EXPLORE', 'auto-v1'], ['EXPLORE', 'auto']][part];
    fixed(`late/${pilot}/stats-first/${draft}`, { pilot, draft }, 400000, S16);
  },

  // ---- A3: a character brings its starting weapon; before = BAL_CHAR_NOWEAPON=1 ----
  // The stats-first shop owns no Zap at 3000 or 30000 and no Orbit at 3000; the
  // Rogue's Boomerang is a starter. So "without" is run only where it differs.
  // The Knight's cells are a2early part 0 and a2mid part 0 (same seeds, same shop).
  a3: () => {       // part 0 = 3000, 1 = 30000 Witch with/without, 2 = 30000 Paladin and Rogue
    const budget = part ? 30000 : 3000;
    const list = [[['WITCH', 'PALADIN'], true], [['ROGUE'], false], [['WITCH'], true], [['PALADIN', 'ROGUE'], false]];
    const use = part === 0 ? list.slice(0, 2) : part === 1 ? [list[2]] : [list[3]];
    for (const draft of ['auto', 'evolution-first']) for (const [chars, both] of use) for (const character of chars) {
      fixed(`chars/${budget}/${draft}/${character}/with`, { draft, character }, budget, S16);
      if (both) fixed(`chars/${budget}/${draft}/${character}/without`, { draft, character }, budget, S16, { BAL_CHAR_NOWEAPON: '1' });
    }
  },

  // ---- A4: BUY NEXT points at damage before more weapons; before = buy-next-v1 ----
  a4: () => {       // part 0 = 10000, 1 = 30000
    const budget = part ? 30000 : 10000;
    for (const draft of ['evolution-first', 'hand-first']) for (const shop of ['buy-next-v1', 'buy-next', 'cheapest']) fixed(`shop/${budget}/${draft}/${shop}`, { shop, draft }, budget, S16);
  },

  smoke: () => { fixed('smoke', { draft: 'auto-v1' }, 3000, [2001]); fixed('smoke', { shop: 'buy-next' }, 3000, [2001], { BAL_MAW_HP: '250000' }); },
};
if (!B[batch]) { console.error('unknown batch ' + batch + '; have: ' + Object.keys(B).join(', ')); process.exit(2); }
B[batch]();
if (process.env.BAL_ONLY) { const re = new RegExp(process.env.BAL_ONLY); for (let i = J.length - 1; i >= 0; i--) if (!re.test(J[i].cell)) J.splice(i, 1); }

fs.writeFileSync(out, JSON.stringify({ kind: 'meta', batch, part, jobs: J.length, tree: TREE, at: new Date().toISOString() }) + '\n');
const t0 = Date.now();
function runJob(job) {
  return new Promise((resolve) => {
    const arg = Buffer.from(JSON.stringify({ ...job, tree: TREE })).toString('base64');
    const child = spawn(process.execPath, [SIM, '--worker', arg], { cwd: TREE, env: { ...process.env, ...job.env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let buf = '', err = '';
    child.stdout.on('data', (d) => {
      buf += d; let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
        if (line.startsWith('@@R ')) { const r = JSON.parse(line.slice(4)); if (r.kind !== 'done') fs.appendFileSync(out, JSON.stringify({ cell: job.cell, env: job.env, ...r }) + '\n'); }
      }
    });
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', (code) => { if (code) process.stderr.write(`FAIL ${job.label} ${code} ${err.slice(-500)}\n`); resolve(); });
  });
}
let next = 0;
await Promise.all(Array.from({ length: CONC }, async () => { while (next < J.length) await runJob(J[next++]); }));
process.stderr.write(`${batch} ${partArg || ''}: ${J.length} jobs, ${((Date.now() - t0) / 1000).toFixed(0)}s wall\n`);
