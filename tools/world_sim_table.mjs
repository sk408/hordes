// M5b slice 3: summarize progression_sim --json files into the WORLD.md
// tables (survival, gold, quests, vault opens, stalls), before vs after.
//   node tools/world_sim_table.mjs fixed|career <label=file.jsonl> ...
import fs from 'node:fs';

const [mode, ...arms] = process.argv.slice(2);
const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); if (!s.length) return NaN; const i = (s.length - 1) * p, lo = Math.floor(i); return s[lo] + (s[Math.min(s.length - 1, lo + 1)] - s[lo]) * (i - lo); };
const band = (xs) => `${Math.round(q(xs, 0.5))} [${Math.round(q(xs, 0.25))}-${Math.round(q(xs, 0.75))}]`;
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const ci = (xs) => { const m = mean(xs); const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1)); return `${Math.round(m)} ±${Math.round(1.96 * sd / Math.sqrt(Math.max(1, xs.length)))}`; };
const rows = [];
for (const a of arms) {
  const [label, file] = a.split('=');
  const recs = fs.readFileSync(file, 'utf8').trim().split('\n').map(l => JSON.parse(l)).filter(r => r.kind === (mode === 'fixed' ? 'fixed' : 'run'));
  const groups = mode === 'fixed' ? [...new Set(recs.map(r => r.budget))].map(b => [b, recs.filter(r => r.budget === b)]) : [['career', recs]];
  for (const [g, rs] of groups) {
    const w = rs.map(r => r.world).filter(Boolean);
    const late = rs.filter(r => r.run >= 11);
    rows.push([g, label, rs.length, band(rs.map(r => r.t)), ci(rs.map(r => r.t)), band(rs.map(r => r.gold)), ci(rs.map(r => r.gold)),
      w.length ? (mean(w.map(x => x.quests))).toFixed(2) : '-',
      w.length ? Math.round(100 * mean(rs.map(r => (r.world ? r.world.questGold : 0))) / Math.max(1, mean(rs.map(r => r.gold)))) + '%' : '-',
      w.length ? (100 * mean(w.map(x => (x.vault ? 1 : 0)))).toFixed(0) + '%' : '-',
      w.length ? (100 * mean(w.map(x => (x.yard ? 1 : 0)))).toFixed(0) + '%' : '-',
      w.length ? mean(w.map(x => x.cracks)).toFixed(2) : '-',
      `${rs.reduce((a, r) => a + (r.stalls || 0), 0)} (${rs.filter(r => r.stalls > 0).length} runs)`,
      rs.filter(r => String(r.end).startsWith('stuck')).length,
      mode === 'career' ? `${band(late.map(r => r.t))} / ${band(late.map(r => r.gold))}` : '']);
  }
}
const head = ['group', 'arm', 'n', 'survival s', 'mean', 'gold/run', 'mean', 'quests/run', 'quest gold share', 'vault opens', 'yard looted', 'cracks/run', 'stall windows', 'stuck', mode === 'career' ? 'runs 11-15 surv / gold' : ''];
console.log('| ' + head.join(' | ') + ' |');
console.log('|' + head.map(() => '---').join('|') + '|');
for (const r of rows) console.log('| ' + r.join(' | ') + ' |');
