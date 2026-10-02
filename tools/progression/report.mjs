// HORDES progression simulator — REPORT (pure: records in, text out).
//
// House rule for every figure printed here: a median is never shown without
// its min-max band and the n it was taken over.

export const median = (a) => {
  const s = a.filter((x) => x !== null && x !== undefined && !Number.isNaN(x)).sort((x, y) => x - y);
  if (!s.length) return NaN;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const lo = (a) => Math.min(...a), hi = (a) => Math.max(...a);

function num(v, d = 0) {
  if (v === Infinity) return 'never';
  if (!Number.isFinite(v)) return '-';
  const a = Math.abs(v);
  if (a >= 1e6) return (v / 1e6).toFixed(a >= 1e7 ? 1 : 2) + 'M';
  if (a >= 1e4) return (v / 1e3).toFixed(a >= 1e5 ? 0 : 1) + 'k';
  return v.toFixed(d);
}
// "median [min-max]"
export function band(a, d = 0) {
  if (!a.length) return '-';
  return `${num(median(a), d)} [${num(lo(a), d)}-${num(hi(a), d)}]`;
}

function table(head, rows) {
  const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const line = (r) => r.map((c, i) => String(c).padEnd(w[i])).join('  ').trimEnd();
  return [line(head), w.map((n) => '-'.repeat(n)).join('  '), ...rows.map(line)].join('\n');
}

// Run-index windows for the curve: fine early, coarse late.
export function windows(n) {
  const edges = [1, 2, 3, 5, 10, 15, 20, 30, 40, 60, 80, 100, 150, 200, 300, 400, 500];
  const out = []; let a = 1;
  for (const e of edges) { if (a > n) break; const b = Math.min(e, n); out.push([a, b]); a = b + 1; }
  if (a <= n) out.push([a, n]);
  return out;
}
const wname = ([a, b]) => (a === b ? `run ${a}` : `runs ${a}-${b}`);

// records -> Map(policy -> Map(seed -> runs sorted by run index))
export function groupCareers(records) {
  const g = new Map();
  for (const r of records) {
    if (r.kind !== 'run') continue;
    if (!g.has(r.policy)) g.set(r.policy, new Map());
    const s = g.get(r.policy);
    if (!s.has(r.seed)) s.set(r.seed, []);
    s.get(r.seed).push(r);
  }
  for (const s of g.values()) for (const runs of s.values()) runs.sort((a, b) => a.run - b.run);
  return g;
}

// First run index (per seed) satisfying pred; Infinity when never.
const firstRun = (runs, pred) => { const r = runs.find(pred); return r ? r.run : Infinity; };

// Median / band of first-run indices where Infinity = never reached.
function runBand(v, nRuns) {
  const f = (x) => (Number.isFinite(x) ? (x % 1 ? x.toFixed(1) : String(x)) : '>' + nRuns);
  const s = [...v].sort((a, b) => a - b), m = s.length >> 1;
  const med = s.length % 2 ? s[m] : (Number.isFinite(s[m]) ? (s[m - 1] + s[m]) / 2 : Infinity);
  return `${f(med)} [${f(s[0])}-${f(s[s.length - 1])}]`;
}

function firstBand(seeds, pred, nRuns) {
  const v = [...seeds.values()].map((runs) => firstRun(runs, pred));
  return `${runBand(v, nRuns)} ${v.filter((x) => x !== Infinity).length}/${v.length}`;
}

// Longest stretch of consecutive runs whose value never beats the best before it.
export function flatStretch(series) {
  let best = series[0], cur = 0, start = 2, out = { len: 0, from: 0, to: 0 };
  for (let i = 1; i < series.length; i++) {
    if (series[i] > best) { best = series[i]; cur = 0; start = i + 2; } else {
      cur++;
      if (cur > out.len) out = { len: cur, from: start, to: i + 1 };
    }
  }
  return out;
}

function maxJump(series) {
  let out = { ratio: NaN, run: 0 };
  for (let i = 1; i < series.length; i++) {
    if (!(series[i - 1] > 0)) continue;
    const r = series[i] / series[i - 1];
    if (!(out.ratio >= r)) out = { ratio: r, run: i + 1 };
  }
  return out;
}

export function analysePolicy(seeds, nRuns) {
  const careers = [...seeds.values()];
  const n = careers.length;
  const at = (i, f) => careers.map((c) => c[i]).filter(Boolean).map(f);
  const medT = [], medG = [];
  for (let i = 0; i < nRuns; i++) { medT.push(median(at(i, (r) => r.t))); medG.push(median(at(i, (r) => r.gold))); }
  const third = Math.ceil(nRuns / 3);
  const phases = [['early', 1, third], ['mid', third + 1, 2 * third], ['late', 2 * third + 1, nRuns]].filter((p) => p[1] <= p[2]);
  const rpp = phases.map(([name, a, b]) => {
    const v = careers.map((c) => {
      const w = c.filter((r) => r.run >= a && r.run <= b);
      const buys = w.reduce((s, r) => s + r.bought.length, 0);
      return buys ? w.length / buys : Infinity;
    });
    return { name, a, b, v };
  });
  const reach = (field) => [25, 50, 100].map((p) => {
    const hits = careers.map((c) => c.find((r) => r[field] >= p - 1e-9) || null);
    return { p, runs: hits.map((r) => (r ? r.run : Infinity)), hours: hits.filter(Boolean).map((r) => r.playHours) };
  });
  const cat = reach('catPct'), catSteps = reach('itemsPct');
  const last = careers.map((c) => c[c.length - 1]);
  return {
    n, nRuns, medT, medG, careers, phases: rpp, cat, catSteps,
    flat: flatStretch(medT), flatSeeds: careers.map((c) => flatStretch(c.map((r) => r.t)).len),
    jump: maxJump(medG), jumpSeeds: careers.map((c) => maxJump(c.map((r) => r.gold)).ratio).filter(Number.isFinite),
    first: {
      s60: firstBand(seeds, (r) => r.t >= 60, nRuns), s120: firstBand(seeds, (r) => r.t >= 120, nRuns),
      w2: firstBand(seeds, (r) => r.wave >= 2, nRuns), w5: firstBand(seeds, (r) => r.wave >= 5, nRuns),
    },
    totalGold: last.map((r) => r.cumGold), totalSpent: last.map((r) => r.cumSpent),
    endCatPct: last.map((r) => r.catPct), endItemsPct: last.map((r) => r.itemsPct), endHours: last.map((r) => r.playHours),
    purchases: careers.map((c) => c.reduce((s, r) => s + r.bought.length, 0)),
  };
}

const pool = (A, [a, b], f) => A.careers.flatMap((c) => c.filter((r) => r.run >= a && r.run <= b).map(f));

function causes(A, w) {
  const m = {};
  for (const c of pool(A, w, (r) => r.cause)) m[c] = (m[c] || 0) + 1;
  const top = Object.entries(m).sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1))[0];
  const total = Object.values(m).reduce((a, b) => a + b, 0);
  return top ? `${top[0]} ${top[1]}/${total}` : '-';
}

function detail(key, A) {
  const ws = windows(A.nRuns);
  const rows = ws.map((w) => [
    wname(w), pool(A, w, (r) => r.t).length,
    band(pool(A, w, (r) => r.t)), band(pool(A, w, (r) => r.wave)), band(pool(A, w, (r) => r.level)),
    band(pool(A, w, (r) => r.drafts)), band(pool(A, w, (r) => r.kills)), band(pool(A, w, (r) => r.gold)),
    band(pool(A, w, (r) => r.bought.length)), band(pool(A, w, (r) => r.cumSpent)), band(pool(A, w, (r) => r.catPct), 2),
    causes(A, w),
  ]);
  return `POLICY ${key}   (${A.n} seeds x ${A.nRuns} runs; cells = median [min-max] over the n runs in the window)\n` +
    table(['window', 'n', 'survival s', 'wave', 'level', 'drafts', 'kills', 'gold banked', 'buys/run', 'cum spend', 'catalogue %', 'top cause of death'], rows);
}

function headline(key, A) {
  const cat = (list) => {
    if (list.every((c) => c.runs.every((x) => x === Infinity))) return `25% / 50% / 100%: none reached in ${A.nRuns} runs (0/${A.n} seeds)`;
    return list.map((c) => {
      const hit = c.runs.filter((x) => x !== Infinity).length;
      return hit ? `${c.p}%: run ${runBand(c.runs, A.nRuns)}, ${band(c.hours, 2)} h (${hit}/${A.n} seeds)` : `${c.p}%: not reached (0/${A.n})`;
    }).join('   ');
  };
  const L = [];
  L.push(`HEADLINES ${key}   (n = ${A.n} seeds; "run a [b-c] k/n" = median first run [min-max], k of n seeds got there)`);
  L.push(`  first run >=60s: ${A.first.s60}   >=120s: ${A.first.s120}   wave 2: ${A.first.w2}   wave 5: ${A.first.w5}`);
  L.push(`  longest flat stretch (median survival, no new best): ${A.flat.len} runs` +
    (A.flat.len ? ` (runs ${A.flat.from}-${A.flat.to})` : '') + `; per-seed ${band(A.flatSeeds)} n=${A.n}`);
  L.push('  runs per purchase: ' + A.phases.map((p) => {
    const fin = p.v.filter(Number.isFinite);
    return `${p.name} (runs ${p.a}-${p.b}) ${fin.length ? band(fin, 2) : 'no purchases'}` + (fin.length < p.v.length && fin.length ? ` (${p.v.length - fin.length}/${p.v.length} seeds bought nothing)` : '');
  }).join('   '));
  L.push(`  largest run-to-run income jump: x${num(A.jump.ratio, 1)} at run ${A.jump.run} (median income series); per-seed x${band(A.jumpSeeds, 1)} n=${A.jumpSeeds.length}`);
  L.push(`  catalogue bought, by gold cost: ${cat(A.cat)}`);
  L.push(`  catalogue bought, by purchase steps: ${cat(A.catSteps)}`);
  L.push(`  after ${A.nRuns} runs: catalogue ${band(A.endCatPct, 2)} % by cost, ${band(A.endItemsPct, 1)} % by purchase steps; ` +
    `${band(A.purchases)} purchases; gold banked ${band(A.totalGold)}; play time ${band(A.endHours, 2)} h`);
  return L.join('\n');
}

function comparison(an) {
  const keys = [...an.keys()];
  const nRuns = an.get(keys[0]).nRuns;
  const ws = windows(nRuns);
  const surv = table(['policy', 'n seeds', ...ws.map(wname)],
    keys.map((k) => [k, an.get(k).n, ...ws.map((w) => band(pool(an.get(k), w, (r) => r.t)))]));
  const gold = table(['policy', 'n seeds', ...ws.map(wname)],
    keys.map((k) => [k, an.get(k).n, ...ws.map((w) => band(pool(an.get(k), w, (r) => r.gold)))]));
  const head = table(['policy', '>=60s', '>=120s', 'wave 2', 'wave 5', 'flat', 'max income jump', 'cat % at end', 'buys', 'play h'],
    keys.map((k) => { const A = an.get(k); return [k, A.first.s60, A.first.s120, A.first.w2, A.first.w5,
      `${A.flat.len} runs`, `x${num(A.jump.ratio, 1)} @${A.jump.run}`, band(A.endCatPct, 2), band(A.purchases), band(A.endHours, 2)]; }));
  const out = [
    `SURVIVAL SECONDS by run window — median [min-max] over (seeds x runs in window)`, surv, '',
    `GOLD BANKED PER RUN by run window — median [min-max]`, gold, '',
    `MILESTONES — first run reaching each mark: median [min-max] k/n seeds; flat = longest stretch with no new best median survival`, head,
  ];
  if (keys.length > 1) {
    const lastW = ws[ws.length - 1];
    const spread = (label, f, d = 0) => {
      const v = keys.map((k) => ({ k, m: median(f(an.get(k))) })).filter((x) => Number.isFinite(x.m)).sort((a, b) => b.m - a.m);
      if (v.length < 2) return `  ${label}: -`;
      const b = v[0], w = v[v.length - 1];
      return `  ${label}: best ${num(b.m, d)} (${b.k}) vs worst ${num(w.m, d)} (${w.k})` + (w.m > 0 ? ` = x${(b.m / w.m).toFixed(2)}` : '');
    };
    out.push('', `SPREAD best vs worst policy (policy medians; n = ${an.get(keys[0]).n} seeds each)`,
      spread(`median survival, ${wname(lastW)}`, (A) => pool(A, lastW, (r) => r.t)),
      spread(`total gold banked over ${nRuns} runs`, (A) => A.totalGold),
      spread('catalogue % (by cost) at end', (A) => A.endCatPct, 2));
  }
  return out.join('\n');
}

export function careerReport(records, { detailAll = false } = {}) {
  const g = groupCareers(records);
  if (!g.size) return 'no run records';
  const an = new Map();
  for (const [k, seeds] of g) an.set(k, analysePolicy(seeds, Math.max(...[...seeds.values()].map((c) => c.length))));
  const out = [];
  if (g.size > 1) out.push(comparison(an), '');
  for (const [k, A] of an) {
    if (g.size === 1 || detailAll) out.push(detail(k, A), '');
    out.push(headline(k, A), '');
  }
  return out.join('\n').trimEnd();
}

export function fixedReport(records) {
  const g = new Map();
  for (const r of records) {
    if (r.kind !== 'fixed') continue;
    const k = r.policy + '\u0000' + r.budget;
    if (!g.has(k)) g.set(k, []);
    g.get(k).push(r);
  }
  const rows = [];
  let prev = null; const cliffs = [];
  for (const rs of g.values()) {
    const t = rs.map((r) => r.t), gold = rs.map((r) => r.gold);
    const pct = (f) => Math.round(100 * rs.filter(f).length / rs.length) + '%';
    const evo = rs.filter((r) => r.firstEvo != null).map((r) => r.firstEvo);
    rows.push([rs[0].policy, rs[0].budget, band(rs.map((r) => r.spent)), band(rs.map((r) => r.catPct), 2), rs.length,
      band(t), band(gold), band(rs.map((r) => r.wave)), band(rs.map((r) => r.level)),
      pct((r) => r.t >= 60), pct((r) => r.t >= 120),
      evo.length ? band(evo) + ' ' + pct((r) => r.firstEvo != null) : '-']);
    if (prev && prev.policy === rs[0].policy && median(prev.t) > 0) {
      cliffs.push({ policy: rs[0].policy, from: prev.budget, to: rs[0].budget, ratio: median(t) / median(prev.t), a: prev.t, b: t });
    }
    prev = { policy: rs[0].policy, budget: rs[0].budget, t };
  }
  const out = [
    'FIXED BUILD — K independent runs per build; cells = median [min-max] over n runs (no FIRST_CLEAR bonus: steady-state income)',
    table(['policy', 'budget', 'spent', 'catalogue %', 'n', 'survival s', 'gold/run', 'wave', 'level', '>=60s', '>=120s', 'first evolution s'], rows),
  ];
  if (cliffs.length) {
    const c = cliffs.sort((a, b) => b.ratio - a.ratio)[0];
    out.push('', `Steepest step in median survival: x${c.ratio.toFixed(2)} between budget ${c.from} (${band(c.a)}, n=${c.a.length}) ` +
      `and ${c.to} (${band(c.b)}, n=${c.b.length}) [${c.policy}]`);
  }
  return out.join('\n');
}
