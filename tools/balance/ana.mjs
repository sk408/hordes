// Tables from tools/balance/batch.mjs records (JSONL).
//   node tools/balance/ana.mjs <file.jsonl...> [cellA=cellB ...] [--run1]
// One row per cell: survival median [p10-p90], wins, gold, level, first evolution,
// the Maw (reached, slain, withdrawn, fight length, deaths with it up), and gold per
// hour attended and unattended (the review's time model, at 1x speed):
//   attended   = gold / (survival + 2 s per draft + 20 s of menus)
//   unattended = 0.80 x gold / (survival + 6 s per draft + 5 s end card)
// (0.80 = the auto-continue chain's pay over a whole chain: src/meta.js RUN_GOLD.)
// cellA=cellB prints B against A on paired seeds: survival ratio median and
// quartiles, seeds longer / tie / shorter (2% band), gold ratio.
// --run1: run-1 table (died before the first wave-1 boss fell; time).
import fs from 'node:fs';
const args = process.argv.slice(2);
const files = args.filter((a) => a.endsWith('.jsonl'));
const pairs = args.filter((a) => a.includes('=') && !a.startsWith('--')).map((a) => a.split('='));
const R = files.flatMap((f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.kind !== 'meta'));
const q = (a, p) => { const s = a.filter((x) => x != null && !Number.isNaN(x)).sort((x, y) => x - y); if (!s.length) return NaN; const i = (s.length - 1) * p; const lo = Math.floor(i); return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo); };
const ms = (t) => { if (Number.isNaN(t)) return '-'; const r = Math.round(t); return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`; };
const k = (x) => Number.isNaN(x) ? '-' : (x / 1000).toFixed(1) + 'k';
const cells = [...new Set(R.map((r) => r.cell))];
const mawOf = (r) => ((r.bal && r.bal.bosses) || []).find((b) => b.id === 'MAW');
export const attH = (r) => 3600 * r.gold / (r.t + 2 * r.drafts + 20);
export const unaH = (r) => 3600 * 0.8 * r.gold / (r.t + 6 * r.drafts + 5);

if (args.includes('--run1')) {
  console.log('| cell | n | died | won | died before the wave-1 boss fell | survival med [p10-p90] max | gold med |');
  console.log('|---|---|---|---|---|---|---|');
  for (const c of cells) {
    const rs = R.filter((r) => r.cell === c);
    const bossDown = (r) => ((r.bal && r.bal.bosses) || []).some((b) => b.w === 1 && b.id !== 'HERALD' && b.id !== 'MAW' && b.dead !== null && (r.end !== 'died' || b.dead <= r.t));
    const before = rs.filter((r) => r.end === 'died' && !bossDown(r)).length;
    const t = rs.map((r) => r.t);
    console.log(`| ${c} | ${rs.length} | ${rs.filter((r) => r.end === 'died').length} | ${rs.filter((r) => r.end === 'won').length} | ${before} | ${ms(q(t, 0.5))} [${ms(q(t, 0.1))}-${ms(q(t, 0.9))}] ${ms(Math.max(...t))} | ${Math.round(q(rs.map((r) => r.gold), 0.5))} |`);
  }
  process.exit(0);
}

console.log('| cell | n | survival med [p10-p90] | won | gold med | level | 1st evo s (runs) | Maw reached / slain / withdrew | Maw fight s med [min-max] | died with Maw up | gold/h attended | gold/h unattended |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const c of cells) {
  const rs = R.filter((r) => r.cell === c);
  const t = rs.map((r) => r.t);
  const maw = rs.map(mawOf).filter(Boolean);
  const life = maw.filter((m) => m.dead !== null).map((m) => m.dead - m.at);
  const slain = rs.filter((r) => r.mawCleared).length;
  const diedMaw = rs.filter((r) => { const m = mawOf(r); return r.end === 'died' && m && m.dead === null && r.t - m.at <= 95; }).length;
  const withdrew = rs.filter((r) => { const m = mawOf(r); return m && !r.mawCleared && r.t - m.at > 95; }).length;
  const evo = rs.map((r) => r.firstEvo).filter((x) => x != null);
  console.log(`| ${c} | ${rs.length} | ${ms(q(t, 0.5))} [${ms(q(t, 0.1))}-${ms(q(t, 0.9))}] | ${rs.filter((r) => r.end === 'won').length} | ${Math.round(q(rs.map((r) => r.gold), 0.5))} | ${q(rs.map((r) => r.level), 0.5)} | ${evo.length ? Math.round(q(evo, 0.5)) + ' (' + evo.length + '/' + rs.length + ')' : '-'} | ${maw.length} / ${slain} / ${withdrew} | ${life.length ? q(life, 0.5) + ' [' + Math.min(...life) + '-' + Math.max(...life) + ']' : '-'} | ${diedMaw} | ${k(q(rs.map(attH), 0.5))} | ${k(q(rs.map(unaH), 0.5))} |`);
}
for (const [a, b] of pairs) {
  const A = new Map(R.filter((r) => r.cell === a).map((r) => [r.seed, r]));
  const Bs = R.filter((r) => r.cell === b && A.has(r.seed));
  const rat = Bs.map((r) => r.t / A.get(r.seed).t);
  const g = Bs.map((r) => r.gold / Math.max(1, A.get(r.seed).gold));
  let L = 0, T = 0, S = 0; for (const x of rat) { if (x > 1.02) L++; else if (x < 0.98) S++; else T++; }
  console.log(`\n${b} vs ${a}: n ${Bs.length}, survival x${q(rat, 0.5).toFixed(2)} [p25 ${q(rat, 0.25).toFixed(2)} - p75 ${q(rat, 0.75).toFixed(2)}], longer/tie/shorter ${L}/${T}/${S}, gold x${q(g, 0.5).toFixed(2)}`);
}
