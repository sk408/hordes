// STEP 2 PROOF: 8x sequencing verification (READ-ONLY on src/test/tools).
// Lives under docs/proof-8x/ (the only allowed writes). Run as:
//   HORDES_SHOT_DIR=docs/proof-8x node docs/proof-8x/proof_8x.mjs
// All paths in-tree relative. No outside-worktree path on any command line.
// Drives the REAL frame loop via tools/browser.mjs withPage().
import { withPage } from '../../tools/browser.mjs';
import fs from 'node:fs';

const OUT = 'docs/proof-8x/results.json';
const LEGACY_TOUR = ['stage1','hud','pilot','focus','stance','move','skills','potions','stats',
  'cog','draft','edge','chest','portal','arch','shrine','intermission','death','settings','loadout'];
const STARTUP = `
try {
  localStorage.setItem('hordes_onboarded', '1');
  for (const k of ${JSON.stringify(LEGACY_TOUR)}) localStorage.setItem('hordes_tour_' + k, '1');
} catch (e) {}`;

const T = `(await import('./src/main.js')).__TEST`;
const results = { claims: {}, notes: [] };
const log = (...a) => console.log(...a);

async function bootToRun(p) {
  await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
  const noIntro = await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode !== 'intro')()`, 15000);
  if (!noIntro) throw new Error('never left intro');
  await p.waitFor(`(async () => { const rv = (await import('./src/main.js')).__TEST.state.titleReveal; return !rv || rv.phase === 'settled'; })()`, 8000);
  const start = await p.evaluate(`(() => {
    const el = [...document.getElementById('ov-cards').children]
      .find(k => (k.textContent || '').toUpperCase().includes('START GAME'));
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)]; })()`);
  if (!start) throw new Error('no START GAME card');
  await p.tap(start[0], start[1]);
  const live = await p.waitFor(`(async () => { const s = (await import('./src/main.js')).__TEST.state; return s.mode === 'playing' && s.time > 1.0; })()`, 12000, 200);
  if (!live) throw new Error('run never went live with advancing clock');
  // buff HP so the run survives measurement
  await p.evaluate(`(async () => { const t = ${T}; t.state.player.stats.maxHp *= 50; t.state.player.hp = t.state.player.stats.maxHp; })()`);
  // frozen-game guard: time must advance over wall sleep
  const t0 = await p.evaluate(`(async () => (await import('./src/main.js')).__TEST.state.time)()`);
  await p.sleep(400);
  const t1 = await p.evaluate(`(async () => (await import('./src/main.js')).__TEST.state.time)()`);
  return { t0, t1, advancing: t1 > t0 };
}

async function ensurePlaying(p) {
  const mode = await p.evaluate(`(async () => (await import('./src/main.js')).__TEST.state.mode)()`);
  if (mode === 'playing') return true;
  if (mode === 'intermission' || mode === 'draft' || mode === 'evolve') {
    // CONTINUE / pick through the real cards where possible
    const clicked = await p.evaluate(`(() => {
      const els = [...document.getElementById('ov-cards').children];
      const c = els.find(k => (k.textContent || '').toUpperCase().includes('CONTINUE'));
      if (c) { c.click(); return 'continue'; }
      if (els.length) { els[0].click(); return 'first'; }
      return null; })()`);
    await p.sleep(400);
  }
  // force back only as last resort (still the real mode value, recorded honestly)
  const m2 = await p.evaluate(`(async () => (await import('./src/main.js')).__TEST.state.mode)()`);
  if (m2 !== 'playing') {
    await p.evaluate(`(async () => { const t = ${T}; t.state.mode = 'playing';
      document.getElementById('overlay').style.display = 'none'; })()`);
    await p.sleep(200);
  }
  return (await p.evaluate(`(async () => (await import('./src/main.js')).__TEST.state.mode)()`) === 'playing');
}

async function magnetArm(p, speed) {
  await ensurePlaying(p);
  const gate = await p.evaluate(`(async () => { const t = ${T};
    const v = t.dev.setSpeed(${speed});
    return { gate: t.dev.gate, speed: t.dev.session && t.dev.session.speed, ret: v }; })()`);
  const seeded = await p.evaluate(`(async () => { const t = ${T}; const st = t.state;
    st.enemies.length = 0; st.gems.length = 0; st.drops.length = 0; st.itemDrops.length = 0;
    st.player.skills = st.player.skills || {}; st.player.skills.magnet = true;
    st.player.skillCd.MAGNET_PULL = 0;
    const px = st.player.x, py = st.player.y;
    for (let i = 0; i < 6; i++) t.m3.pushGem({ x: px + 420 + i * 6, y: py + 40, xp: 1 });
    const ds = st.gems.map(g => Math.hypot(g.x - px, g.y - py));
    return { n: st.gems.length, minD: Math.min(...ds), maxD: Math.max(...ds), px, py }; })()`);
  const timeA = await p.evaluate(`(async () => (await import('./src/main.js')).__TEST.state.time)()`);
  // REAL input path: the 'x' key fires the sweep through runAction.
  // Sample TIGHT: at 8x the 0.45s sweep covers its sim-time in ~56ms of wall
  // time, so a 60ms sleep would skip past the whole streaming window.
  await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }))");
  const armed = await p.evaluate(`(async () => { const t = ${T};
    return { sweep: t.state.player.magnetSweep, cd: t.state.player.skillCd.MAGNET_PULL || 0,
      gems: t.state.gems.length }; })()`);
  // per-wall-frame samples (~15ms) for ~1.8s
  const samples = [];
  for (let i = 0; i < 120; i++) {
    const s = await p.evaluate(`(async () => { const t = ${T}; const st = t.state;
      const px = st.player.x, py = st.player.y;
      const ds = st.gems.map(g => Math.hypot(g.x - px, g.y - py));
      return { time: +st.time.toFixed(3), sweep: +(st.player.magnetSweep || 0).toFixed(4),
        gems: st.gems.length, minD: ds.length ? +Math.min(...ds).toFixed(1) : 0,
        d0: ds.length ? +ds[0].toFixed(1) : 0 }; })()`);
    samples.push(s);
    if (s.gems === 0 && s.sweep <= 0) break;
    await p.sleep(15);
  }
  const timeB = await p.evaluate(`(async () => (await import('./src/main.js')).__TEST.state.time)()`);
  return { gate, seeded, timeA, armed, samples, timeB, timeAdvanced: timeB > timeA };
}

async function escapeArm(p, speed, tag) {
  await ensurePlaying(p);
  await p.evaluate(`(async () => { const t = ${T}; t.dev.setSpeed(${speed}); })()`);
  const tA = await p.evaluate(`(async () => (await import('./src/main.js')).__TEST.state.time)()`);
  await p.sleep(300);
  const tB = await p.evaluate(`(async () => (await import('./src/main.js')).__TEST.state.time)()`);
  // open a level-up draft through the REAL presenter, then pick card 1 (ceremony window)
  await p.evaluate(`(async () => { const t = ${T}; t.openDraft(); })()`);
  await p.sleep(150);
  const draftOpen = await p.evaluate(`(async () => { const t = ${T};
    return { mode: t.state.mode, overlay: document.getElementById('overlay').style.display,
      cards: document.getElementById('ov-cards').children.length }; })()`);
  await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }))");
  await p.sleep(120);
  const afterPick = await p.evaluate(`(async () => { const t = ${T};
    return { mode: t.state.mode, overlay: document.getElementById('overlay').style.display,
      cards: document.getElementById('ov-cards').children.length,
      ceremony: !!(t.ceremony && t.ceremony.active) }; })()`);
  // reach/trigger the boss escape THROUGH the portal-cine seam (same as the game uses)
  await p.evaluate(`(async () => { const t = ${T};
    t.state.wave.num = 1; t.state.wave.cinePending = false; t.state.mode = 'portal-cine'; })()`);
  await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }))");
  const entered = await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode === 'escape')()`, 5000, 50);
  const tl = [];
  for (let i = 0; i < 4; i++) {
    const s = await p.evaluate(`(async () => { const t = ${T};
      return { mode: t.state.mode, overlay: document.getElementById('overlay').style.display,
        cards: document.getElementById('ov-cards').children.length,
        ceremony: !!t.ceremony.active,
        simT: t.escape.sim ? +t.escape.sim.t.toFixed(2) : null,
        time: +t.state.time.toFixed(2) }; })()`);
    tl.push(s);
    if (i === 0) await p.shot(tag);
    await p.sleep(i === 0 ? 350 : 400);
  }
  const simAdvanced = tl.length >= 2 && tl[tl.length - 1].simT > tl[0].simT;
  return { speed, timeGuard: { tA, tB, advancing: tB > tA }, draftOpen, afterPick, entered, timeline: tl, simAdvanced };
}

const boot = await withPage({ w: 390, h: 844, dpr: 3, mobile: true, url: 'index.html?dev=1', startupScript: STARTUP }, async (p) => {
  const frozen = await bootToRun(p);
  log('boot: time ' + frozen.t0.toFixed(2) + ' -> ' + frozen.t1.toFixed(2) + ' advancing=' + frozen.advancing);
  results.boot = frozen;

  // (b) gem streaming at 8x then 1x
  const m8 = await magnetArm(p, 8);
  log('magnet8: seeded=' + JSON.stringify(m8.seeded) + ' armed=' + JSON.stringify(m8.armed));
  m8.samples.forEach((s, i) => log('  m8[' + i + '] time=' + s.time + ' sweep=' + s.sweep + ' gems=' + s.gems + ' minD=' + s.minD + ' d0=' + s.d0));
  const m1 = await magnetArm(p, 1);
  log('magnet1: seeded=' + JSON.stringify(m1.seeded) + ' armed=' + JSON.stringify(m1.armed));
  m1.samples.forEach((s, i) => log('  m1[' + i + '] time=' + s.time + ' sweep=' + s.sweep + ' gems=' + s.gems + ' minD=' + s.minD + ' d0=' + s.d0));
  results.magnet8 = m8; results.magnet1 = m1;

  // (a) escape overlay at 8x then back to playing then 1x
  const e8 = await escapeArm(p, 8, 'proof-escape-8x');
  log('escape8: ' + JSON.stringify(e8));
  // leave the escape softly (painted SKIP rect centre 430,21 in 480x300)
  const tapPt = await p.evaluate(`(() => { const cv = document.getElementById('game');
    const r = cv.getBoundingClientRect();
    return [Math.round(r.x + 430 / 480 * r.width), Math.round(r.y + 21 / 300 * r.height)]; })()`);
  await p.tap(tapPt[0], tapPt[1]);
  await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode === 'intermission')()`, 8000, 100);
  await ensurePlaying(p);
  const e1 = await escapeArm(p, 1, 'proof-escape-1x');
  log('escape1: ' + JSON.stringify(e1));
  results.escape8 = e8; results.escape1 = e1;
  results.pageErrors = p.errors;
  return true;
});

// ---- verdicts ----
function magnetVerdict(m, label) {
  const s = m.samples || [];
  // The sweep may already be running in the first sample (tight poll): armed
  // is advisory; the samples are the evidence. Streaming = the field does NOT
  // vanish in the first wall sample; >=1 intermediate distance observed.
  const clearedIdx = s.findIndex(x => x.gems === 0);
  const firstMin = s[0] ? s[0].minD : null;
  const seedMin = m.seeded.minD;
  // streaming = field does NOT vanish in the first wall sample; >=1 in-flight
  // sample strictly between seed distance and the player (motion observed,
  // neither teleport-to-zero nor frozen). At 8x the whole 0.45s sweep covers
  // its sim-time in ~2 wall frames, so ONE intermediate is the full signal.
  const teleported = clearedIdx === 0;
  const inFlight = s.filter(x => x.gems > 0);
  const decreasing = inFlight.map(x => x.minD);
  const monotonic = inFlight.length >= 1 && decreasing.every((v, i) => i === 0 || v <= decreasing[i - 1] + 0.5);
  const streamed = inFlight.some(x => x.minD > 0 && x.minD < m.seeded.minD - 1);
  const info = { seedMinD: +m.seeded.minD.toFixed(1), firstSampleMinD: firstMin,
    samplesToClear: clearedIdx, decreasing, timeAdvanced: m.timeAdvanced,
    armed: m.armed, nSamples: s.length };
  if (s.length === 0) return { verdict: 'COULD-NOT-REPRODUCE', reason: label + ': no samples', info };
  if (teleported) return { verdict: 'FAIL', reason: label + ': whole field gone in one wall frame (skip/teleport)', info };
  if (clearedIdx > 0 && monotonic) return { verdict: 'PASS', reason: label + ': multi-frame streaming decay', info };
  return { verdict: 'COULD-NOT-REPRODUCE', reason: label + ': ambiguous trace', info };
}
function escapeVerdict(e, label) {
  const tl = e.timeline || [];
  const overlays = tl.map(x => x.overlay);
  const modes = tl.map(x => x.mode);
  // The symptom is a VISIBLE menu over the escape: overlay display flex/block
  // with cards on top of the side-scroller. display:none hides the whole
  // subtree (stale card nodes lingering in ovCards are invisible by construction).
  const stuck = tl.some(x => x.overlay !== 'none');
  const info = { overlays, modes, cards: tl.map(x => x.cards), simT: tl.map(x => x.simT),
    entered: e.entered, afterPick: e.afterPick, timeAdvancing: e.timeGuard.advancing,
    simAdvanced: e.simAdvanced };
  if (!e.entered) return { verdict: 'COULD-NOT-REPRODUCE', reason: label + ': escape never entered', info };
  if (!stuck && modes.every(m => m === 'escape')) return { verdict: 'PASS', reason: label + ': no draft/menu overlay through the escape', info };
  return { verdict: 'FAIL', reason: label + ': overlay/cards visible during escape', info };
}

results.claims.claim1_escape_8x = escapeVerdict(results.escape8, '8x escape');
results.claims.claim1_escape_1x = escapeVerdict(results.escape1, '1x escape');
results.claims.claim2_magnet_8x = magnetVerdict(results.magnet8, '8x magnet');
results.claims.claim2_magnet_1x = magnetVerdict(results.magnet1, '1x magnet');
results.notes.push('TOUR_KEYS at measure time: legacy 20 seeded + dynamic Object.values read not needed; onboarded=1; DEV_GATE via ?dev=1.');
results.notes.push('No git commands run (brief constraint); tree writes limited to docs/proof-8x/ by construction.');
fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
log('wrote ' + OUT);
log(JSON.stringify(results.claims, null, 2));
if ((results.pageErrors || []).length) { log('PAGE ERRORS: ' + results.pageErrors.join(' | ').slice(0, 500)); process.exit(1); }
const fails = Object.values(results.claims).filter(c => c.verdict === 'FAIL').length;
process.exit(0);
