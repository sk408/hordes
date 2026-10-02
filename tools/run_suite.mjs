// Suite runner: node tools/run_suite.mjs [--par N] [--timeout SECONDS] [--logs DIR] [filter...]
// Runs test/test_*.mjs and test/smoke.mjs in parallel, one node process each.
// Exits 1 on any red that is not in KNOWN_RED (or on a KNOWN_RED that went green).
import { spawn } from 'node:child_process';
import { readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import os from 'node:os';

// Files allowed to be red. Keep this list short and explain each entry.
const KNOWN_RED = [
  // JAVELIN, EMBER, RICOCHET and METEOR have no evolution yet.
  'test_evolution.mjs',
];

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
function opt(name, dflt) {
  const i = args.indexOf(name);
  if (i < 0) return dflt;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
}
const PAR = Math.max(1, Number(opt('--par', Math.max(2, Math.min(8, os.cpus().length - 1)))));
const TIMEOUT_MS = Number(opt('--timeout', 180)) * 1000;
const logDir = opt('--logs', null);
if (logDir) mkdirSync(logDir, { recursive: true });

const files = readdirSync(join(repo, 'test'))
  .filter((f) => /^test_.*\.mjs$/.test(f) || f === 'smoke.mjs')
  .filter((f) => args.length === 0 || args.some((a) => f.includes(a)))
  .sort();

function firstFailLine(buf) {
  const lines = buf.split(/\r?\n/);
  const hit = lines.find((l) => /^\s*(not ok|FAIL|✗|x )|\bFAIL\b|AssertionError|Error:/.test(l));
  return (hit || lines.filter((l) => l.trim()).pop() || '').trim().slice(0, 200);
}

function runOne(f) {
  return new Promise((res) => {
    const t0 = Date.now();
    let buf = '';
    let timedOut = false;
    const p = spawn(process.execPath, [join('test', f)], { cwd: repo });
    p.stdout.on('data', (d) => { buf += d; });
    p.stderr.on('data', (d) => { buf += d; });
    const timer = setTimeout(() => { timedOut = true; p.kill('SIGKILL'); }, TIMEOUT_MS);
    p.on('close', (code) => {
      clearTimeout(timer);
      if (logDir) writeFileSync(join(logDir, f + '.log'), buf);
      res({ f, ok: code === 0 && !timedOut, code, timedOut, ms: Date.now() - t0, buf });
    });
  });
}

const t0 = Date.now();
const results = [];
let next = 0;
async function worker() {
  while (next < files.length) results.push(await runOne(files[next++]));
}
await Promise.all(Array.from({ length: PAR }, worker));
results.sort((a, b) => a.f.localeCompare(b.f));

const red = results.filter((r) => !r.ok);
const unexpected = red.filter((r) => !KNOWN_RED.includes(r.f));
const fixed = results.filter((r) => r.ok && KNOWN_RED.includes(r.f));
for (const r of red) {
  const tag = KNOWN_RED.includes(r.f) ? 'RED (known)' : 'RED';
  console.log(`${tag} ${r.f} ${r.timedOut ? 'TIMEOUT' : 'exit ' + r.code} ${r.ms}ms`);
  console.log(`    ${firstFailLine(r.buf)}`);
}
for (const r of fixed) console.log(`KNOWN_RED entry is green, remove it: ${r.f}`);
console.log(`${results.length} files: ${results.length - red.length} green, ${red.length} red ` +
  `(${red.length - unexpected.length} known) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
process.exit(unexpected.length || fixed.length ? 1 : 0);
