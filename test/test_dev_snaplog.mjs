// HORDES — SLICE 11 snapshot log download + editor viewer proof (node).
// Run: node test/test_dev_snaplog.mjs
//
// Covers the slice without a browser:
//   A. pure log helpers (parse / filter / date / fetch against a stub)
//   B. the REAL saver roundtrip (spawned tools/editor_server.py, in-tree only):
//      3 scripted runs (distinct modes/test flags) POSTed through the real
//      /snapshot gate, read back through GET /snapshots, byte-compared with
//      the log file; the log file is restored byte-identical afterwards
//      (history is never deleted — the proof leaves no rows behind)
//   C. the REAL main-menu path (?dev=1 boot -> showTitle -> DEV LOG card;
//      gate-off boot carries no such card) and the untouched end-screen
//      single-run DEV SNAPSHOT card.
import assert from 'node:assert';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildSnapshot, validateSnapshot, parseSnapshotLog, filterSnapshots,
  snapshotLogDate, fetchSnapshots,
} from '../src/dev_telemetry.js';
import { boot } from './_harness.mjs';

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SNAP_FILE = path.join(REPO, 'tools', '.snapshots', 'runs.jsonl');

// 3 scripted runs: distinct modes + test flags (the viewer proof cohort).
function scripted() {
  const base = {
    schema_v: 2,
    game_rev: 'abc123:dirty',
    upgrades: { purchased: { dmg: 1 } },
    shrines: { used: 0, blessings: [] },
    items: [],
    speed: 1,
  };
  return [
    buildSnapshot({ ...base, seed: 111, gold_earned: 100, gold_spent: 25,
      damage: 1000, wave: 3, test: false, mode: 'standard', modifiers: [] }),
    buildSnapshot({ ...base, seed: 222, gold_earned: 50, gold_spent: 60,
      damage: 400, wave: 2, test: false, mode: 'night',
      modifiers: ['banking-penalty-50'] }),
    buildSnapshot({ ...base, seed: 333, gold_earned: 10, gold_spent: 0,
      damage: 0, wave: 1, test: true, mode: 'standard', modifiers: [] }),
  ];
}

// ---- A. pure helpers ---------------------------------------------------------
{
  const [r1, r2, r3] = scripted();
  for (const s of [r1, r2, r3]) assert.equal(validateSnapshot(s).ok, true, 'scripted run validates');
  const raw = [r1, r2, r3].map((s) => JSON.stringify(s)).join('\n') + '\n';
  const p = parseSnapshotLog(raw);
  assert.equal(p.rows.length, 3, '3 scripted lines parse to 3 rows');
  assert.deepEqual(p.rows.map((r) => r.index), [1, 2, 3], 'log order indexes 1..3');
  assert.equal(p.skipped, 1, 'the trailing newline is one skipped blank, not an error row');
  assert.equal(p.rows[0].snap.seed, 111, 'row 1 is the standard non-test run');
  assert.deepEqual(parseSnapshotLog('').rows, [], 'missing log parses to zero rows');
  assert.deepEqual(parseSnapshotLog(null).rows, [], 'non-string parses to zero rows');

  // Bad lines are KEPT as flagged error rows, never dropped.
  const badRaw = raw + 'this is not json\n' + JSON.stringify({ schema_v: 999 }) + '\n';
  const pb = parseSnapshotLog(badRaw);
  assert.equal(pb.rows.length, 5, 'bad lines kept: 3 valid + 2 error rows');
  assert.ok(pb.rows[3].error && !pb.rows[3].snap, 'the non-JSON line is an error row');
  assert.match(pb.rows[4].error, /schema_v/, 'the schema_v 999 line names its refusal');

  // Filters: mode + test flag; error rows always pass (flagged, never hidden).
  assert.equal(filterSnapshots(pb.rows, {}).length, 5, 'no filter shows everything');
  const night = filterSnapshots(pb.rows, { mode: 'night' });
  assert.equal(night.length, 3, 'night filter: the night run + the 2 error rows');
  assert.equal(night[0].snap.seed, 222, 'night filter keeps the night run');
  const std = filterSnapshots(pb.rows, { mode: 'standard' });
  assert.equal(std.length, 4, 'standard filter: 2 standard runs + 2 error rows');
  assert.equal(filterSnapshots(pb.rows, { test: 'test' }).length, 3, 'test-only: run 333 + errors');
  assert.equal(filterSnapshots(pb.rows, { test: 'nontest' }).length, 4, 'non-test: runs 111+222 + errors');
  const combo = filterSnapshots(pb.rows, { mode: 'night', test: 'test' });
  assert.equal(combo.length, 2, 'night+test: no valid run matches, errors still shown');
  assert.ok(combo.every((r) => !r.snap), 'the combo survivors are the error rows');

  // Dates: the log mtime, never a per-run claim.
  assert.equal(snapshotLogDate('2026-09-22T12:00:00+00:00'), '2026-09-22', 'ISO mtime -> date');
  for (const bad of [null, undefined, '', 'x', 7]) {
    assert.equal(snapshotLogDate(bad), 'n/a', 'missing/garbled mtime reads n/a');
  }

  // fetchSnapshots against a stub fetch (URL contract + failure arm).
  let seenUrl = null;
  const stubEnv = {
    __DEV_API_BASE: 'http://proof.invalid:1',
    fetch: async (url) => {
      seenUrl = url;
      return { ok: true, status: 200,
        json: async () => ({ ok: true, mtime: '2026-09-22T00:00:00+00:00', count: 3, raw }) };
    },
  };
  const f = await fetchSnapshots(stubEnv);
  assert.equal(f.ok, true, 'stub fetch resolves ok');
  assert.equal(seenUrl, 'http://proof.invalid:1/snapshots', 'the log read hits GET /snapshots');
  assert.equal(f.rows.length, 3, 'stub rows parse');
  assert.equal(f.raw, raw, 'raw passes through untouched');
  const ff = await fetchSnapshots({ __DEV_API_BASE: 'http://proof.invalid:1',
    fetch: async () => { throw new Error('down'); } });
  assert.equal(ff.ok, false, 'a dead backend resolves ok:false, never throws');
}

// ---- B. real saver roundtrip (spawned server, log restored after) ------------
const PYTHON = ['python3', 'python'].find((c) => {
  try { return spawnSync(c, ['--version']).status === 0; } catch { return false; }
});
if (!PYTHON) {
  console.log('SKIP B (saver roundtrip): no python3/python on PATH');
} else {
  const PORT = 8931;
  const BASE = 'http://127.0.0.1:' + PORT;
  const original = fs.existsSync(SNAP_FILE) ? fs.readFileSync(SNAP_FILE) : Buffer.alloc(0);
  const proc = spawn(PYTHON, ['tools/editor_server.py', String(PORT)],
    { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] });
  const kill = () => { try { proc.kill(); } catch { /* already gone */ } };
  try {
    let healthy = false;
    for (let i = 0; i < 100 && !healthy; i++) {
      try {
        const r = await fetch(BASE + '/health');
        healthy = r.ok;
      } catch { /* not up yet */ }
      if (!healthy) await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(healthy, 'proof saver booted on ' + PORT);

    const runs = scripted();
    for (const s of runs) {
      const r = await fetch(BASE + '/snapshot', { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) });
      assert.equal(r.status, 200, 'scripted run POSTs clean (seed ' + s.seed + ')');
    }
    // The schema gate still refuses (verbatim slice-11 scope: no schema change).
    {
      const r = await fetch(BASE + '/snapshot', { method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...runs[0], schema_v: 999 }) });
      assert.equal(r.status, 400, 'unknown schema_v still refused on POST');
    }

    const r = await fetch(BASE + '/snapshots');
    assert.equal(r.status, 200, 'GET /snapshots resolves 200');
    const body = await r.json();
    assert.equal(body.ok, true, 'log payload ok');
    assert.ok(typeof body.mtime === 'string' && body.mtime.length >= 10, 'mtime stamped');
    const fileText = fs.readFileSync(SNAP_FILE, 'utf-8');
    assert.equal(body.raw, fileText, 'served raw byte-matches the log file');
    const tail = body.raw.trimEnd().split('\n').slice(-3).map((l) => JSON.parse(l));
    assert.deepEqual(tail.map((t) => t.seed), [111, 222, 333], 'our 3 runs land last, in order');
    const live = parseSnapshotLog(body.raw);
    assert.equal(filterSnapshots(live.rows, { mode: 'night' })
      .filter((x) => x.snap).length >= 1, true, 'live log filters by mode');
    assert.equal(filterSnapshots(live.rows, { test: 'test' })
      .filter((x) => x.snap && x.snap.seed === 333).length, 1, 'live log filters by test flag');

    // Download-all through the REAL game seam: byte-matches the log file.
    const h = await boot({ locationSearch: '?dev=1', variant: 'slice11log' });
    const text = await h.T.dev.downloadLog({ __DEV_API_BASE: BASE, fetch: (...a) => fetch(...a) });
    assert.equal(text, fileText, 'download-all byte-matches runs.jsonl');
    assert.equal(h.T.dev.lastLog, fileText, 'the seam stashes the exact bytes');
  } finally {
    fs.writeFileSync(SNAP_FILE, original);   // history kept: proof rows leave no trace
    kill();
  }
  assert.equal(fs.readFileSync(SNAP_FILE).equals(original), true, 'log file restored byte-identical');
}

// ---- C. main-menu card (gate on) vs gate off + end screen intact -------------
{
  const cardsOf = (h) => (h.elements['ov-cards'] ? h.elements['ov-cards'].children : [])
    .map((c) => c._html || '');
  const h = await boot({ locationSearch: '?dev=1', variant: 'slice11menu' });
  h.T.showTitle();
  const on = cardsOf(h);
  assert.ok(on.some((x) => x.includes('DEV LOG')), 'the dev-gated title carries the DEV LOG card');
  assert.ok(on.some((x) => x.includes('>PLAY<')) && on.some((x) => x.includes('>SETTINGS<')), 'the player cards still render beside it');

  const g = await boot({ variant: 'slice11menuoff' });
  g.T.showTitle();
  const off = cardsOf(g);
  assert.ok(!off.some((x) => x.includes('DEV LOG')), 'gate off: no DEV LOG card anywhere');
  assert.ok(!off.some((x) => x.includes('DEV SNAPSHOT')), 'gate off: no dev snapshot card either');

  // The end-screen single-run download is untouched: the DEV SNAPSHOT card
  // still composes (current run only), and no whole-log card rides along.
  // (A FRESH boot: a second boot() swaps the globals, so the frame chain of
  // an older boot reschedules into the wrong rAF queue — each boot is driven
  // before the next one starts.)
  const e = await boot({ locationSearch: '?dev=1', variant: 'slice11end' });
  e.T.startRun();
  e.pump(2);
  e.T.dev.onRunEnd();
  const end = cardsOf(e);
  assert.ok(end.some((x) => x.includes('DEV SNAPSHOT')), 'end screen keeps its single-run card');
  assert.ok(!end.some((x) => x.includes('DEV LOG')), 'no download-all on the end screen');
  const single = e.T.dev.download();
  assert.ok(typeof single === 'string' && single.includes('"seed"'), 'single-run download still stashes JSON');
}

console.log('test_dev_snaplog: all checks passed');
