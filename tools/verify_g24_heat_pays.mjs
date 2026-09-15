// HORDES - tools/verify_g24_heat_pays.mjs (G24 slice 1, R8: the heat payout
// is REAL in the browser at phone size, on the readouts the player reads).
//
// REAL Chrome, PHONE viewport 390x844 @dpr3, real finger taps. Proves:
//   1. the run boots through the game's OWN title and a REAL tap on START
//      GAME; the sim clock is ASSERTED past 1.0s BEFORE anything is measured
//      (the frozen-game trap: a harness that skips this measures a paused
//      game).
//   2. the TEXT HUD line the player reads states BOTH halves: the byte-
//      identical cost string `HEAT 0 (+0% foe HP)` AND the payout
//      `PAYS GOLD x1 · XP x1`.
//   3. a REAL tap on the RAISE THE STAKES intermission card advances the
//      manual count (measured through the real addHeat ledger), and after
//      three pushes the HUD states `HEAT 3 ... PAYS GOLD x1.9 · XP x1.36`.
//   4. XP PER KILL rises with manual heat: two equal-kill live windows
//      (>=100 kills each), one at manual 0 and one at manual 3, the second
//      strictly richer per kill.
//   5. ONE PNG at 1170x2532 of the live HUD, READ BACK from the COPIED
//      ARTIFACT (not the tmp capture): dimensions + bright-ink count inside
//      the HUD element's screen box.
// EVIDENCE DISCLOSURE: the verdict is live-DOM measurement + PNG dimensions
// and ink read back off the committed file - there is NO vision model in this
// job, so "looks right" is never claimed; ink and state are the evidence.
// FIXTURE DISCLOSURE: the same owner-approved probe buff the suite uses
// (smoke.mjs:326 - "the test character might need a buff, just for that test
// scenario"; maxHp x80, damage x60) keeps the hero alive long enough to cross
// three wave-end intermissions; it is applied identically and touches no heat
// or payout code path.
// Run: node tools/verify_g24_heat_pays.mjs
import { withPage } from './browser.mjs';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ART = 'docs/art/browser-verify-2026-09-12';
mkdirSync(ART, { recursive: true });
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok, detail });
  console.log((ok ? '  PASS ' : '  FAIL ') + name + (detail !== undefined ? ' :: ' + JSON.stringify(detail) : ''));
};

const TOUR19 = ['stage1', 'hud', 'pilot', 'focus', 'stance', 'move', 'skills', 'potions',
  'stats', 'cog', 'draft', 'edge', 'chest', 'portal', 'arch', 'shrine',
  'intermission', 'death', 'settings'];
const KILLS_PER_WINDOW = 100;

// Count bright-ink pixels inside a viewport-CSS-space box of a PNG file.
async function readBack(p, file, box) {
  const b64 = readFileSync(file).toString('base64');
  return p.evaluate(`(async () => {
    const img = await createImageBitmap(await (await fetch('data:image/png;base64,${b64}')).blob());
    const c = new OffscreenCanvas(img.width, img.height); const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const sx = img.width / innerWidth, sy = img.height / innerHeight;
    const x = Math.round(${box[0]} * sx), y = Math.round(${box[1]} * sy);
    const w = Math.round(${box[2]} * sx), h = Math.round(${box[3]} * sy);
    const d = g.getImageData(x, y, w, h).data;
    let ink = 0, bright = [0, 0, 0];
    for (let i = 0; i < d.length; i += 4) {
      const mx = Math.max(d[i], d[i + 1], d[i + 2]);
      if (mx > 110) { ink++; bright[0] += d[i]; bright[1] += d[i + 1]; bright[2] += d[i + 2]; }
    }
    if (ink) bright = bright.map(v => Math.round(v / ink));
    return { imgW: img.width, imgH: img.height, ink, meanInk: bright };
  })()`, true);
}

// Page-side probe state: a positive-delta xp trap on the live player (grants
// count; the level-up subtraction does not) plus the reads the checks assert.
const PROBE = `(() => {
  const T = window.__G24_T;
  const g = window.__G24 || (window.__G24 = { xp: 0, cur: 0, pRef: null, minted: 0, gemsRef: null });
  const p = T.state.player;
  if (g.pRef !== p) {
    g.cur = p.xp;
    Object.defineProperty(p, 'xp', { configurable: true,
      get: () => g.cur,
      set: (v) => { if (v > g.cur) g.xp += v - g.cur; g.cur = v; } });
    g.pRef = p;
    // Fixture buff re-armed per fresh player (a RETRY resets stats).
    p.stats.maxHp *= 80; p.hp = p.stats.maxHp; p.stats.damage *= 60;
  }
  // Gem-mint counter: Σ gem.xp of everything pushed into the live gems array.
  // The per-kill XP ESCALATES with the wave, so the honest cross-window
  // comparison is Δ(collected xp) / Δ(minted gem xp) - the escalation cancels
  // and what remains is the effective multiplier stack (heat included).
  if (g.gemsRef !== T.state.gems) {
    const arr = T.state.gems; const orig = arr.push.bind(arr);
    arr.push = (...items) => { for (const it of items) g.minted += (it && it.xp) || 0; return orig(...items); };
    g.gemsRef = arr;
  }
  return { xp: g.xp, minted: g.minted, kills: p.kills | 0, mode: T.state.mode, time: T.state.time };
})()`;

const out = await withPage({ w: 390, h: 844, dpr: 3,
  startupScript: "try { localStorage.setItem('hordes_onboarded', '1'); } catch (e) {}\n" +
    'for (const k of ' + JSON.stringify(TOUR19) + ") { try { localStorage.setItem('hordes_tour_' + k, '1'); } catch (e) {} }",
}, async (p) => {
  await p.waitFor("(async () => (await import('./src/main.js')).__TEST.state.mode !== 'intro')()", 15000);
  await p.waitFor("(async () => { const rv = (await import('./src/main.js')).__TEST.state.titleReveal; return !rv || rv.phase === 'settled'; })()", 8000);
  const c = await p.evaluate(`(() => {
    const el = [...document.getElementById('ov-cards').children]
      .find(k => (k.textContent || '').toUpperCase().includes('START GAME'));
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
  })()`);
  if (!c) throw new Error('no START GAME card on the title');
  await p.tap(c[0], c[1]);
  const playing = await p.waitFor("(async () => (await import('./src/main.js')).__TEST.state.mode === 'playing')()", 8000);
  // THE FROZEN-GAME ASSERTION: nothing below is measured until the sim clock
  // has actually advanced past one second.
  const advancing = await p.waitFor("(async () => { const st = (await import('./src/main.js')).__TEST.state; return st.mode === 'playing' && st.time > 1.0; })()", 10000, 200);
  check('run started via a REAL tap and the sim clock ADVANCED past 1.0s (not a frozen game)',
    playing && advancing, { playing, advancing });

  // The probe seam + the owner-precedent fixture buff (see header disclosure).
  const boot0 = await p.evaluate(`(async () => {
    const T = (await import('./src/main.js')).__TEST;
    window.__G24_T = T;
    T.hudText.set(true);
    T.banners.suppressAll();
    const p = T.state.player;
    p.stats.maxHp *= 80; p.hp = p.stats.maxHp; p.stats.damage *= 60;
    return { time: T.state.time, mode: T.state.mode };
  })()`, true);
  check('probe seam armed AFTER the frozen-game assertion (fixture buff disclosed)',
    boot0.mode === 'playing' && boot0.time > 1.0, boot0);

  // ---- the HUD states cost AND payout at manual 0 ----
  const hud0 = await p.waitFor(`(async () => {
    const T = window.__G24_T; const t = document.getElementById('hud').textContent || '';
    return /HEAT 0 \\(\\+0% foe HP\\)/.test(t) && t.includes('PAYS GOLD x1 · XP x1');
  })()`, 10000, 250);
  const hud0line = await p.evaluate(`(() => (document.getElementById('hud').textContent || '').split('\\n').find(l => l.includes('HEAT')) || '')()`);
  check('the HUD line states BOTH halves at manual 0: byte-identical cost + PAYS GOLD x1 · XP x1',
    !!hud0, { hud: hud0line });

  // ---- the live loop: drive overlays with REAL taps while the game plays ---
  // Returns { probe, tapped } after one step. Overlays pause the sim, so every
  // wait below runs through this loop.
  const centerOf = (sel) => p.evaluate(`(() => {
    const el = [...document.getElementById('ov-cards').children]
      .find(k => (k.textContent || '').toUpperCase().includes(${JSON.stringify(sel)}));
    if (!el) return null;
    let r = el.getBoundingClientRect();
    // The overlay scrolls on a phone; bring an off-screen card into view the
    // way a finger would (scrollTop), then tap its real center.
    const ov = document.getElementById('overlay');
    if (ov) {
      if (r.bottom > innerHeight - 8) { ov.scrollTop += r.bottom - innerHeight + 24; r = el.getBoundingClientRect(); }
      else if (r.top < 8) { ov.scrollTop += r.top - 24; r = el.getBoundingClientRect(); }
    }
    if (r.bottom > innerHeight + 40 || r.top < -40 || r.right < 0 || r.left > innerWidth) return null;
    return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
  })()`);
  async function stepLive(overlayPolicy) {
    const probe = await p.evaluate(PROBE, true);
    if (probe.mode === 'draft') {
      const c0 = await p.evaluate(`(() => { const el = document.getElementById('ov-cards').children[0];
        if (!el) return null; const r = el.getBoundingClientRect();
        return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)]; })()`);
      if (c0) { await p.tap(c0[0], c0[1]); return { probe, tapped: 'draft' }; }
    } else if (probe.mode === 'evolve') {
      const cl = await p.evaluate(`(() => { const ks = document.getElementById('ov-cards').children;
        const el = ks[ks.length - 1]; if (!el) return null; const r = el.getBoundingClientRect();
        return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)]; })()`);
      if (cl) { await p.tap(cl[0], cl[1]); return { probe, tapped: 'evolve' }; }
    } else if (probe.mode === 'intermission') {
      if (overlayPolicy) {
        const c = await centerOf(overlayPolicy);
        if (c) { await p.tap(c[0], c[1]); return { probe, tapped: overlayPolicy }; }
      }
      return { probe, tapped: null };
    } else if (probe.mode === 'dead') {
      const c = await centerOf('RETRY');
      if (c) { await p.tap(c[0], c[1]); return { probe, tapped: 'RETRY' }; }
    }
    return { probe, tapped: null };
  }
  async function windowOfKills(from, timeoutMs) {
    const t0 = Date.now();
    for (;;) {
      const { probe } = await stepLive('CONTINUE');
      if (probe.kills - from >= KILLS_PER_WINDOW) return { probe, waitedMs: Date.now() - t0 };
      if (Date.now() - t0 > timeoutMs) return { probe, waitedMs: Date.now() - t0, short: true };
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  // ---- window A: XP per kill at manual 0 ----
  const a0 = await p.evaluate(PROBE, true);
  const winA = await windowOfKills(a0.kills, 90000);
  const xpA = winA.probe.xp - a0.xp, killsA = winA.probe.kills - a0.kills;
  const mintedA = winA.probe.minted - a0.minted;   // escalation control
  check(`window A (manual 0): >=${KILLS_PER_WINDOW} kills measured live`,
    killsA >= KILLS_PER_WINDOW && !winA.short,
    { kills: killsA, xp: Math.round(xpA), mintedGemXp: Math.round(mintedA),
      perKill: +(xpA / Math.max(1, killsA)).toFixed(2),
      effMult: +(xpA / Math.max(1, mintedA)).toFixed(3),
      simClock: +winA.probe.time.toFixed(1), waitedMs: winA.waitedMs });
  const effA = xpA / Math.max(1, mintedA);

  // ---- advance the dial with REAL taps on RAISE THE STAKES (x3) ----
  // NOTE: built-in heat (new-slot draft picks, evolutions) ALSO moves the HEAT
  // number - by design it never touches the payout - so the assertions below
  // pin the PAYOUT strings and the manual ledger, not the total heat value.
  const manBefore = await p.evaluate(`(async () => (await import('./src/heat.js')).manualPushes(window.__G24_T.state))()`, true);
  const stakesTaps = [];
  const deadline = Date.now() + 240000;   // three waves, generously
  while (Date.now() < deadline) {
    const { probe, tapped } = await stepLive(null);   // NEVER auto-continue here
    const man = await p.evaluate(`(async () => (await import('./src/heat.js')).manualPushes(window.__G24_T.state))()`, true);
    if (man >= 3) break;
    if (probe.mode === 'intermission' && !tapped) {
      const s = await centerOf('RAISE THE STAKES');
      if (s) {
        await p.tap(s[0], s[1]);
        const manAfter = await p.evaluate(`(async () => (await import('./src/heat.js')).manualPushes(window.__G24_T.state))()`, true);
        stakesTaps.push(manAfter);
        // the tap re-renders the intermission; continue into the next wave so
        // the run keeps living (another REAL tap, on CONTINUE)
        const c = await centerOf('CONTINUE');
        if (c) await p.tap(c[0], c[1]);
      } else {
        const c = await centerOf('CONTINUE');   // stakes hidden (cap): just go on
        if (c) await p.tap(c[0], c[1]);
      }
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  const man3 = await p.evaluate(`(async () => (await import('./src/heat.js')).manualPushes(window.__G24_T.state))()`, true);
  check('three REAL taps on RAISE THE STAKES advanced the manual ledger 0 -> 3',
    man3 === 3 && manBefore === 0, { before: manBefore, after: man3, taps: stakesTaps });

  // ---- the HUD now states the raised payout (cost number may also carry ----
  // built-in heat from draft picks; only the payout is manual-driven)
  const hud3 = await p.waitFor(`(async () => {
    const T = window.__G24_T; const t = document.getElementById('hud').textContent || '';
    return /HEAT \\d+ \\(\\+\\d+% foe HP\\)/.test(t) && t.includes('PAYS GOLD x1.9 · XP x1.36');
  })()`, 10000, 250);
  const hud3line = await p.evaluate(`(() => (document.getElementById('hud').textContent || '').split('\\n').find(l => l.includes('HEAT')) || '')()`);
  check('after 3 pushes the HUD states the cost format AND PAYS GOLD x1.9 · XP x1.36',
    !!hud3, { hud: hud3line });

  // ---- window B: XP per kill at manual 3, same kill budget ----
  const b0 = await p.evaluate(PROBE, true);
  const winB = await windowOfKills(b0.kills, 90000);
  const xpB = winB.probe.xp - b0.xp, killsB = winB.probe.kills - b0.kills;
  const mintedB = winB.probe.minted - b0.minted;
  const effB = xpB / Math.max(1, mintedB);
  check(`window B (manual 3): >=${KILLS_PER_WINDOW} kills measured live`,
    killsB >= KILLS_PER_WINDOW && !winB.short,
    { kills: killsB, xp: Math.round(xpB), mintedGemXp: Math.round(mintedB),
      perKill: +(xpB / Math.max(1, killsB)).toFixed(2), effMult: +effB.toFixed(3),
      simClock: +winB.probe.time.toFixed(1), waitedMs: winB.waitedMs });
  check('XP PER KILL strictly rises with manual heat (0 -> 3 pushes; escalation-normalized)',
    effB > effA,
    { effMultManual0: +effA.toFixed(3), effMultManual3: +effB.toFixed(3),
      ratio: +(effB / effA).toFixed(3),
      note: 'effMult = collected xp / minted gem xp; the wave escalation cancels' });

  // ---- ONE PNG of the live HUD, then READ THE COPIED ARTIFACT BACK ----
  const hudBox = await p.evaluate(`(() => { const r = document.getElementById('hud').getBoundingClientRect();
    return [r.left, r.top, r.width, r.height]; })()`);
  const shotFile = await p.shot('g24-heat-pays-phone');
  const dest = join(ART, 'g24-heat-pays-phone.png');
  copyFileSync(shotFile, dest);
  const ink = await readBack(p, dest, hudBox);
  check('PNG is 1170x2532 (390x844 @dpr3)',
    ink.imgW === 1170 && ink.imgH === 2532, { imgW: ink.imgW, imgH: ink.imgH });
  check('ink read back (NO vision model - ink/state only): the HUD box paints bright ink',
    ink.ink > 50, { ink: ink.ink, meanInk: ink.meanInk,
      box: hudBox.map(v => +v.toFixed(1)) });
  return { dest };
});

const bad = results.filter(r => !r.ok);
console.log('PNG: ' + out.dest);
console.log(bad.length ? `VERIFY G24 HEAT PAYS: ${bad.length} FAILURES` : 'VERIFY G24 HEAT PAYS: ALL ' + results.length + ' CHECKS PASSED');
process.exit(bad.length ? 1 : 0);
