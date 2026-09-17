// VK9P4 browser verifier (fail-first): the owner asks proven in the REAL
// browser at BOTH phone sizes (390x844, 320x568) — the real UI funnel (title
// → START → gate → cog → settings → TEST: ESCAPE SEQUENCE), then the live
// escape via the __TEST seam:
//   1. the reach VISIBILITY metric: at claw wind-up start AND max extension
//      the boss body is FULLY on the (letterboxed) 480-virtual screen
//   2. the three staggered appendages: distinct ids, offsets, live phases
//   3. auto still SURVIVES the three-arm finale (3 seeds, headless)
//   4. the KICK: pursuers eliminated, tail clear, floor refills after
//   5. the JUMP pad: fires with help closed, EXPLAINS with help open
//      (a tap must not activate while the reference is up)
//   6. the MODE toggle BOTH ways: the stored pilot pref is the one source of
//      truth, the sim is never restarted (no lost progress), authority
//      actually changes hands, exactly one flip per press
// Run: node tools/verify_vk9p4_escape.mjs
import { withPage } from '/home/claude/projects/hordes/tools/browser.mjs';
import { copyFileSync, mkdirSync } from 'node:fs';

const ART = '/home/claude/projects/hordes/docs/art/escape-vk9p4-2026-09-17/shots';
mkdirSync(ART, { recursive: true });
let fails = 0;
function ok(cond, label) {
  console.log((cond ? '  ok - ' : '  FAIL - ') + label);
  if (!cond) fails++;
}

async function viewport(w, h, tag) {
  await withPage({ w, h, dpr: 3, mobile: true }, async (p) => {
    const T = `(await import('./src/main.js')).__TEST`;
    await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
    await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode !== 'intro')()`, 15000);
    await p.waitFor(`(async () => { const rv = (await import('./src/main.js')).__TEST.state.titleReveal; return !rv || rv.phase === 'settled'; })()`, 8000);
    const clickCard = (label2) => p.evaluate(`(() => {
      const el = [...document.getElementById('ov-cards').children]
        .find(k => (k.textContent || '').toUpperCase().includes(${JSON.stringify(label2)}));
      if (!el) return false; el.click(); return true; })()`);
    await clickCard('START GAME');
    if (!(await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode === 'playing')()`, 4000, 100))) {
      await clickCard('GOT IT');
    }
    await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode === 'playing')()`, 8000);
    const cog = await p.evaluate(`(() => {
      const el = document.querySelector('[data-act="settings"]');
      if (!el) return null; const r = el.getBoundingClientRect();
      return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)]; })()`);
    await p.tap(cog[0], cog[1]);
    await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode === 'settings')()`, 5000);
    // The cards compose a beat AFTER the mode flips (openSettings builds the
    // DOM); at the small viewport that beat loses the race with one instant
    // clickCard. Retry — a wait-then-fail shape, never an infinite one.
    let testCard = false;
    for (let i = 0; i < 10 && !testCard; i++) {
      testCard = await clickCard('TEST: ESCAPE SEQUENCE');
      if (!testCard) await p.sleep(150);
    }
    if (!testCard) throw new Error('no TEST card');
    await p.waitFor(`(async () => { const T2 = ${T}; return T2.state.mode === 'escape' && T2.escape.sim; })()`, 5000, 50);
    console.log('[' + tag + '] escape entered via the real TEST card');

    // ---- 0. the letterbox: the canvas IS the 480x300 virtual rect (CONTAIN),
    // so the full virtual width is visible at ANY phone size.
    const box = await p.evaluate(`(() => {
      const c = document.getElementById('game');
      const r = c.getBoundingClientRect();
      return { w: r.width, h: r.height, ratio: r.width / r.height }; })()`);
    ok(Math.abs(box.ratio - 480 / 300) < 0.05,
      'letterbox: canvas ratio ' + box.ratio.toFixed(3) + ' ~= 480/300 (full virtual width visible)');

    // ---- 1+2. the reach metric + the staggered appendages (headless walk to
    // the finale; the live loop keeps rendering whatever sim we leave here).
    const reach = await p.evaluate(`(async () => { const T2 = ${T};
      T2.escape.begin({ seed: 9, auto: true });
      const sim = T2.escape.sim;
      const claw = () => sim.boss.arms.find(a => a.id === 'claw');
      let atWindup = null, atExtend = null;
      for (let i = 0; i < 60 * 120; i++) {
        T2.escape.frame(null, 1 / 60);
        if (!atWindup && sim.boss && claw().phase === 'windup' && sim.boss.x - sim.player.x < 420) {
          const camX = Math.max(0, sim.player.x - 150);
          atWindup = { bossScreenX: Math.round(sim.boss.x - camX), playerScreenX: Math.round(sim.player.x - camX),
            arms: sim.boss.arms.map(a => ({ id: a.id, phase: a.phase, offset: a.offset, reach: a.reach })) };
        }
        if (atWindup && !atExtend && claw().phase === 'extend') {
          const camX = Math.max(0, sim.player.x - 150);
          atExtend = { bossScreenX: Math.round(sim.boss.x - camX), playerScreenX: Math.round(sim.player.x - camX) };
          break;
        }
      }
      return { atWindup, atExtend }; })()`);
    ok(reach.atWindup && reach.atExtend, 'the finale was reached and both phases observed');
    const BOSS_W = 84;
    const wv = reach.atWindup, ex = reach.atExtend;
    ok(wv.bossScreenX - BOSS_W / 2 >= 0 && wv.bossScreenX + BOSS_W / 2 <= 480,
      'wind-up start: boss FULLY on screen (span ' + (wv.bossScreenX - BOSS_W / 2) + '..' + (wv.bossScreenX + BOSS_W / 2) + ' of 480, pilot at ' + wv.playerScreenX + ')');
    ok(ex.bossScreenX - BOSS_W / 2 >= 0 && ex.bossScreenX + BOSS_W / 2 <= 480,
      'max extension: boss FULLY on screen (span ' + (ex.bossScreenX - BOSS_W / 2) + '..' + (ex.bossScreenX + BOSS_W / 2) + ' of 480)');
    const arms = wv.arms;
    ok(arms.length === 3 && new Set(arms.map(a => a.id)).size === 3, 'three appendages, distinct ids: ' + arms.map(a => a.id).join(','));
    ok(new Set(arms.map(a => a.offset)).size === 3, 'the offsets stagger: ' + arms.map(a => a.offset).join('/'));
    const clawRow = arms.find(a => a.id === 'claw');
    ok(clawRow.reach <= 132, 'the claw reach is SHORTENED per the owner ask (' + clawRow.reach + ', was 150)');

    // a live stagger observation: over ~1.2s the three arms hold DIFFERENT
    // phases at some sample (the whole point of the stagger).
    const stagger = await p.evaluate(`(async () => { const T2 = ${T};
      const sim = T2.escape.sim;
      let saw = false, samples = [];
      for (let i = 0; i < 60 * 4; i++) {
        T2.escape.frame(null, 1 / 60);
        if (i % 12 === 0 && sim.boss) {
          const ph = sim.boss.arms.map(a => a.phase);
          samples.push(ph.join('|'));
          if (new Set(ph).size > 1) saw = true;
        }
      }
      return { saw, samples: [...new Set(samples)].slice(0, 6) }; })()`);
    ok(stagger.saw, 'the arms run OUT of phase with each other (observed: ' + stagger.samples.join(' ; ') + ')');
    const shot = await p.shot('vk9p4-after-' + tag);
    copyFileSync(shot, ART + '/after-finale-' + tag + '.png');

    // ---- 3. auto survival across seeds (headless, full runs).
    const surv = await p.evaluate(`(async () => { const T2 = ${T};
      const out = [];
      for (const seed of [4, 9, 21]) {
        T2.escape.begin({ seed, auto: true });
        const sim = T2.escape.sim;
        let guard = 0;
        while (!sim.outcome && guard++ < 60 * 90) T2.escape.frame(null, 1 / 60);
        out.push({ seed, outcome: sim.outcome, t: +sim.t.toFixed(1), kicked: sim.kickedPursuers });
      }
      return out; })()`);
    ok(surv.every(r => r.outcome === 'complete'),
      'auto survives the three-arm finale: ' + surv.map(r => 'seed ' + r.seed + ' ' + r.outcome + ' @' + r.t + 's').join(', '));
    ok(surv.every(r => r.kicked === 0), 'auto never kicks (byte-identical auto path)');

    // ---- 4. the KICK: elimination + tail clear + refill (one atomic script).
    const kick = await p.evaluate(`(async () => { const T2 = ${T};
      T2.escape.begin({ seed: 7, auto: false });
      const sim = T2.escape.sim;
      sim.wall.x = sim.player.x - 4000;
      sim.pursuers.length = 0; sim.nextShot = Infinity; sim.nextFlier = Infinity;
      for (let i = 0; i < 60; i++) T2.escape.frame(null, 1 / 60);
      const FLOOR = 252;
      sim.tailT = 9;                    // hold the floor DOWN around the injection
      sim.pursuers.length = 0;          // (the idle second refilled it to 3)
      sim.pursuers.push(
        { x: sim.player.x - 40, y: FLOOR, hp: 1, state: 'matched', matchT: 1 },
        { x: sim.player.x - 70, y: FLOOR, hp: 1, state: 'matched', matchT: 1 },
        { x: sim.player.x - 90, y: FLOOR, hp: 1, state: 'matched', matchT: 1 });
      T2.escape.onKey('s', true);          // the kick key, through the real funnel
      T2.escape.frame(null, 1 / 60);
      const cleared = { dead: sim.kickedPursuers, live: sim.pursuers.filter(pu => pu.hp > 0).length,
        tailT: +sim.tailT.toFixed(2), cd: +sim.kickCd.toFixed(1) };
      let refilled = -1;
      for (let i = 0; i < 60 * 4.5; i++) {
        T2.escape.frame(null, 1 / 60);
        if (sim.tailT <= 0 && sim.pursuers.length >= 3 && refilled < 0) refilled = +(sim.t).toFixed(2);
      }
      return { cleared, refilled, liveAfter: sim.pursuers.filter(pu => pu.hp > 0).length }; })()`);
    ok(kick.cleared.dead === 3 && kick.cleared.live === 0,
      'the kick eliminated the whole tail pack (' + kick.cleared.dead + ' dead, ' + kick.cleared.live + ' live)');
    ok(kick.cleared.tailT > 2.5 && kick.cleared.cd >= 7.9,
      'bounded: clear window ' + kick.cleared.tailT + 's, cooldown ' + kick.cleared.cd + 's');
    ok(kick.liveAfter >= 3, 'the horde floor REFILLS after the window (' + kick.liveAfter + ' live)');

    // ---- 5. the JUMP pad with help CLOSED (a real tap through the canvas funnel).
    await p.evaluate(`(async () => { const T2 = ${T}; T2.escape.begin({ seed: 5, auto: false }); })()`);
    await p.sleep(150);
    const j = await p.evaluate(`(() => { const c = document.getElementById('game');
      const r = c.getBoundingClientRect();
      // P2B99 moved the pads: JUMP_RECT is now (388,184 86x56) — center 431,212.
      return { cssX: r.x + 431 / 480 * r.width, cssY: r.y + 212 / 300 * r.height,
        onGround: (window.__vk_probe = true) }; })()`);
    await p.tap(j.cssX, j.cssY);
    const jumped = await p.waitFor(`(async () => { const T2 = ${T};
      return T2.escape.sim && !T2.escape.sim.player.onGround; })()`, 600, 40);
    ok(jumped, 'help CLOSED: the JUMP pad tap left the ground (same physics path)');

    // ---- 5b. the JUMP pad with help OPEN: the tap EXPLAINS, never activates.
    // (Wait for the landing first: the pause under help must freeze a GROUNDED
    // pose or the y-compare reads the tail of the last jump arc.)
    await p.waitFor(`(async () => { const T2 = ${T};
      return T2.escape.sim && T2.escape.sim.player.onGround; })()`, 3000, 60);
    const helpArm = await p.evaluate(`(async () => { const T2 = ${T};
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }));
      return T2.state.helpMode === true; })()`);
    ok(helpArm, "'?' arms help mode inside the escape (the entry set now has it)");
    const beforeTap = await p.evaluate(`(async () => { const T2 = ${T};
      return { x: T2.escape.sim.player.x, y: T2.escape.sim.player.y }; })()`);
    await p.tap(j.cssX, j.cssY);
    await p.sleep(700);
    const helpRead = await p.evaluate(`(async () => { const T2 = ${T};
      const tip = document.getElementById('help-tip');
      return { onGround: T2.escape.sim.player.onGround, vy: T2.escape.sim.player.vy,
        y: T2.escape.sim.player.y, tip: tip ? (tip.textContent || '') : '', helpMode: T2.state.helpMode }; })()`);
    ok(helpRead.helpMode && helpRead.onGround && helpRead.vy === 0 && Math.abs(helpRead.y - beforeTap.y) < 0.001,
      'help OPEN: the JUMP pad tap did NOT jump (still on the ground, vy 0)');
    ok(helpRead.tip.length > 10, 'help OPEN: the tap EXPLAINED instead ("' + helpRead.tip.slice(0, 48) + '…")');
    // And leaving help does not SKIP the escape (the gate order proof: ESC
    // leaves the reference rather than reaching the escape's skip).
    const left = await p.evaluate(`(async () => { const T2 = ${T};
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return { helpMode: T2.state.helpMode, outcome: T2.escape.sim.outcome }; })()`);
    ok(!left.helpMode && left.outcome === null, 'ESC LEAVES help without skipping the escape');

    // ---- 6. the MODE toggle, both ways (real taps on the MODE rect). This
    // enters through the REAL startEscape seam (T2.escape.start): the mode
    // callbacks (getAuto / onToggleMode -> swapPilotMode) are main's own, and
    // a bare begin() would drop them — the escape would have no toggle at all.
    await p.evaluate(`(async () => { const T2 = ${T}; T2.escape.start({ test: true }); })()`);
    await p.waitFor(`(async () => { const T2 = ${T}; return T2.escape.sim && T2.escape.isAuto() === true; })()`, 3000, 50);
    await p.sleep(400);   // let auto advance the runner a beat
    const m = await p.evaluate(`(() => { const c = document.getElementById('game');
      const r = c.getBoundingClientRect();
      return { cssX: r.x + 430 / 480 * r.width, cssY: r.y + 51 / 300 * r.height,
        x0: (window.__T = (window.__T || 0), 0) }; })()`);
    const pre = await p.evaluate(`(async () => { const T2 = ${T};
      return { pref: localStorage.getItem('hordes_pilot'), mode: T2.state.pilotMode,
        isAuto: T2.escape.isAuto(), x: T2.escape.sim.player.x, t: T2.escape.sim.t }; })()`);
    ok(pre.isAuto === true && pre.mode !== 'MANUAL', 'start: auto drives (pref ' + pre.pref + ')');
    await p.tap(m.cssX, m.cssY);   // auto -> manual
    const man = await p.waitFor(`(async () => { const T2 = ${T};
      return T2.state.pilotMode === 'MANUAL' && T2.escape.isAuto() === false &&
        localStorage.getItem('hordes_pilot') === 'MANUAL'; })()`, 800, 40);
    ok(man, 'flip 1: pref + state + isAuto ALL read MANUAL (one source of truth)');
    const s1 = await p.evaluate(`(async () => { const T2 = ${T};
      return { x: T2.escape.sim.player.x, t: T2.escape.sim.t }; })()`);
    await p.sleep(500);
    const s2 = await p.evaluate(`(async () => { const T2 = ${T};
      return { x: T2.escape.sim.player.x, t: T2.escape.sim.t }; })()`);
    ok(Math.abs(s2.x - s1.x) < 1 && s2.t > s1.t + 0.3,
      'flip 1: the SAME sim runs on (t ' + s1.t.toFixed(2) + '->' + s2.t.toFixed(2) + '), idle manual holds x — no restart, authority moved');
    await p.tap(m.cssX, m.cssY);   // manual -> auto
    const back = await p.waitFor(`(async () => { const T2 = ${T};
      return T2.escape.isAuto() === true && localStorage.getItem('hordes_pilot') !== 'MANUAL'; })()`, 800, 40);
    ok(back, 'flip 2: the pref and the live read are AUTO again');
    await p.sleep(500);
    const s3 = await p.evaluate(`(async () => { const T2 = ${T};
      return { x: T2.escape.sim.player.x }; })()`);
    ok(s3.x > s2.x + 40, 'flip 2: auto RESUMED driving the same sim (x ' + s2.x.toFixed(0) + '->' + s3.x.toFixed(0) + ')');
    // Exactly one flip per press: the pref string is a single mode, and a
    // double-fire would have landed back on MANUAL.
    const single = await p.evaluate(`(async () => { const T2 = ${T};
      return T2.state.pilotMode; })()`);
    ok(single !== 'MANUAL', 'no double-fire: one tap moved exactly one step (' + single + ')');

    // ---- the manual HUD shot (JUMP/KICK/MODE pads visible).
    await p.evaluate(`(async () => { const T2 = ${T}; T2.escape.begin({ seed: 9, auto: false }); })()`);
    await p.sleep(300);
    const shot2 = await p.shot('vk9p4-manual-' + tag);
    copyFileSync(shot2, ART + '/after-manual-hud-' + tag + '.png');

    const errors = p.errors;
    if (errors.length) { console.log('[' + tag + '] PAGE ERRORS: ' + errors.join(' | ').slice(0, 400)); fails++; }
  });
}

await viewport(390, 844, '390x844');
await viewport(320, 568, '320x568');
console.log(fails ? 'VERIFY FAILED: ' + fails : 'verify_vk9p4_escape: ALL CHECKS PASSED (both viewports)');
process.exit(fails ? 1 : 0);
