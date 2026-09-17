// P2B99 browser verifier (fail-first): the owner's P0 ("manual mode doesn't
// expose the movement controls though so it's currently impossible") proven
// FIXED in the REAL browser at BOTH phone sizes (390x844, 320x568):
//   1. HOW TO PLAY names the manual escape controls (the reference CONTROLS
//      page — hold to run / LIFT to brake / JUMP / DASH / KICK / MODE / KEYS)
//   2. entry through the REAL seam, then MANUAL through the on-screen MODE
//      pad (a synthesized pointer event on the actual rect)
//   3. THE SCRIPTED MANUAL RUN: the auto-pilot as ORACLE — every frame its
//      input is translated into synthesized pointer events ON THE ACTUAL PADS
//      (a held finger with a pointerId for run, taps for jump/dash) and the
//      run completes using ONLY on-screen controls. ZERO onKey calls. If the
//      pads cannot do it, this fails.
//   4. layout at both sizes: pads on the canvas, mutually disjoint, clear of
//      the help banner; a pad tap with help OPEN explains, never activates
//   5. AFTER screenshots (manual HUD, pads visible, gauntlet in frame)
// Run: node tools/verify_p2b99_manual.mjs
import { withPage } from '/home/claude/projects/hordes/tools/browser.mjs';
import { copyFileSync, mkdirSync } from 'node:fs';

const ART = '/home/claude/projects/hordes/docs/art/escape-p2b99-2026-09-17/shots';
mkdirSync(ART, { recursive: true });
let fails = 0;
function ok(cond, label) {
  console.log((cond ? '  ok - ' : '  FAIL - ') + label);
  if (!cond) fails++;
}

// The virtual pad rects (src/escape/render.js) — read LIVE in the page so a
// layout change can not silently outrun this tool.
const PAD_JS = `const R = await import('./src/escape/render.js');
const pads = { LEFT: R.LEFT_RECT, RIGHT: R.RIGHT_RECT, JUMP: R.JUMP_RECT,
  DASH: R.DASH_RECT, KICK: R.KICK_RECT, MODE: R.MODE_RECT, SKIP: R.SKIP_RECT };`;

async function viewport(w, h, tag) {
  await withPage({ w, h, dpr: 3, mobile: true }, async (p) => {
    const T = `(await import('./src/main.js')).__TEST`;
    await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
    await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode !== 'intro')()`, 15000);
    await p.waitFor(`(async () => { const rv = (await import('./src/main.js')).__TEST.state.titleReveal; return !rv || rv.phase === 'settled'; })()`, 8000);

    // ---- 1. HOW TO PLAY names the manual escape controls -------------------
    const clickCard = (label2) => p.evaluate(`(() => {
      const el = [...document.getElementById('ov-cards').children]
        .find(k => (k.textContent || '').toUpperCase().includes(${JSON.stringify(label2)}));
      if (!el) return false; el.click(); return true; })()`);
    await clickCard('HOW TO PLAY');
    await p.waitFor(`(async () => { const T2 = ${T}; return T2.state.manualPage === 1; })()`, 5000);
    await p.evaluate(`(async () => { const T2 = ${T}; T2.manual.goto(3); })()`);   // CONTROLS page
    const howto = await p.evaluate(`(() => {
      const t = document.getElementById('ov-cards').textContent || '';
      return { escape: t.includes('THE ESCAPE (manual)'), brake: t.includes('LIFT to brake'),
        jump: t.includes('JUMP'), dash: t.includes('DASH'), kick: t.includes('KICK'),
        mode: t.includes('MODE'), keys: t.includes('SPACE jump') }; })()`);
    ok(howto.escape && howto.brake && howto.jump && howto.dash && howto.kick && howto.mode && howto.keys,
      'HOW TO PLAY CONTROLS names the manual escape controls (subhead ' + howto.escape + ', brake ' + howto.brake +
      ', jump/dash/kick/mode ' + howto.jump + howto.dash + howto.kick + howto.mode + ', keys ' + howto.keys + ')');
    await clickCard('GOT IT');

    // ---- boot into the escape through the real UI funnel -------------------
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
    let testCard = false;
    for (let i = 0; i < 10 && !testCard; i++) {
      testCard = await clickCard('TEST: ESCAPE SEQUENCE');
      if (!testCard) await p.sleep(150);
    }
    if (!testCard) throw new Error('no TEST card');
    await p.waitFor(`(async () => { const T2 = ${T}; return T2.state.mode === 'escape' && T2.escape.sim; })()`, 5000, 50);
    console.log('[' + tag + '] escape entered via the real TEST card');

    // ---- the canvas IS the 480x300 virtual rect (letterbox CONTAIN) --------
    const canvas = await p.evaluate(`(() => {
      const c = document.getElementById('game'); const r = c.getBoundingClientRect();
      return { w: r.width, h: r.height, x: r.x, y: r.y, ratio: r.width / r.height }; })()`);
    ok(Math.abs(canvas.ratio - 480 / 300) < 0.05,
      'letterbox: canvas ratio ' + canvas.ratio.toFixed(3) + ' ~= 480/300 (pads map 1:1 onto the virtual rect)');

    // ---- 2. MANUAL through the on-screen MODE pad (a real pointer event) ---
    // Synthesized ON THE CANVAS at the pad's own virtual coordinates, exactly
    // what a finger on the drawn pad produces.
    const modeTap = await p.evaluate(`(async () => { ${PAD_JS}
      const c = document.getElementById('game'); const r = c.getBoundingClientRect();
      const cx = r.x + (pads.MODE.x + pads.MODE.w / 2) / 480 * r.width;
      const cy = r.y + (pads.MODE.y + pads.MODE.h / 2) / 300 * r.height;
      c.dispatchEvent(new PointerEvent('pointerdown', { clientX: cx, clientY: cy, bubbles: true, pointerId: 7 }));
      c.dispatchEvent(new PointerEvent('pointerup', { clientX: cx, clientY: cy, bubbles: true, pointerId: 7 }));
      return { cx: Math.round(cx), cy: Math.round(cy) }; })()`);
    await p.sleep(200);
    const manual = await p.evaluate(`(async () => { const T2 = ${T};
      return { isAuto: T2.escape.isAuto(), pref: localStorage.getItem('hordes_pilot') }; })()`);
    ok(manual.isAuto === false && manual.pref === 'MANUAL',
      'the MODE pad flipped the run to MANUAL (pref ' + manual.pref + ', live read auto=' + manual.isAuto + ')');

    // ---- 3. THE SCRIPTED MANUAL RUN — pads only, zero onKey ----------------
    // Every frame: the oracle (inputFor, the auto-pilot's own pure decision)
    // is translated into pad events — a HELD finger (its own pointerId) for
    // moveX, down+up taps for jump/dash — then ONE frame is pumped. The run
    // must reach the portal. Any pad that cannot carry its action fails this.
    const run = await p.evaluate(`(async () => { const T2 = ${T};
      ${PAD_JS}
      const auto = await import('./src/escape/auto.js');
      const c = document.getElementById('game');
      const css = (rect) => {
        const r = c.getBoundingClientRect();
        return [r.x + (rect.x + rect.w / 2) / 480 * r.width,
                r.y + (rect.y + rect.h / 2) / 300 * r.height];
      };
      const [LX, LY] = css(pads.LEFT), [RX, RY] = css(pads.RIGHT);
      const [JX, JY] = css(pads.JUMP), [DX, DY] = css(pads.DASH);
      const down = (x, y, id) => c.dispatchEvent(new PointerEvent('pointerdown',
        { clientX: x, clientY: y, bubbles: true, pointerId: id }));
      const up = (x, y, id) => c.dispatchEvent(new PointerEvent('pointerup',
        { clientX: x, clientY: y, bubbles: true, pointerId: id }));
      const RUN_FINGER = 1, ACT_FINGER = 2;
      let padDir = 0;
      const setPad = (d) => {
        if (d === padDir) return;
        if (padDir !== 0) up(padDir === 1 ? RX : LX, RY, RUN_FINGER);
        if (d === 1) down(RX, RY, RUN_FINGER);
        else if (d === -1) down(LX, LY, RUN_FINGER);
        padDir = d;
      };
      const out = [];
      for (const seed of [5, 9]) {
        T2.escape.begin({ seed, auto: false });
        const sim = T2.escape.sim;
        const ev = { jumps: 0, dashes: 0, brakes: 0, clampFires: 0, clampWaits: 0, armExtends: 0 };
        let guard = 0;
        while (!sim.outcome && guard++ < 60 * 120) {
          const inp = auto.inputFor(sim);
          if (inp.autoClamp) {
            // a SPEED WINDOW: a thumb bleeds to the window then fires — the
            // manual form of the auto's brace. (If RUN_SPEED already sits in
            // the window this fires on the first frame, like the auto.)
            const p2 = sim.player, wd = inp.autoClamp;
            if (p2.onGround) {
              if (p2.vx > wd.vMax + 0.5) { setPad(0); ev.brakes++; ev.clampWaits++; }
              else if (p2.vx >= wd.vMin) { setPad(1); up(JX, JY, ACT_FINGER); down(JX, JY, ACT_FINGER); up(JX, JY, ACT_FINGER); ev.jumps++; ev.clampFires++; }
              else setPad(1);
            } else setPad(1);
          } else {
            setPad(inp.moveX);
            if (inp.jump) { up(JX, JY, ACT_FINGER); down(JX, JY, ACT_FINGER); up(JX, JY, ACT_FINGER); ev.jumps++; }
            if (inp.dash) { up(DX, DY, ACT_FINGER); down(DX, DY, ACT_FINGER); up(DX, DY, ACT_FINGER); ev.dashes++; }
          }
          if (sim.boss && sim.boss.arms.some(a => a.phase === 'extend' || a.phase === 'hold')) ev.armExtends++;
          T2.escape.frame(null, 1 / 60);
        }
        setPad(0);
        out.push({ seed, outcome: sim.outcome, t: +sim.t.toFixed(1), x: Math.round(sim.player.x), ev });
      }
      return out; })()`);
    for (const r of run) {
      ok(r.outcome === 'complete',
        'SCRIPTED MANUAL RUN seed ' + r.seed + ': ' + (r.outcome || 'TIMEOUT') + ' @' + r.t + 's, x=' + r.x +
        ' (' + r.ev.jumps + ' jumps, ' + r.ev.dashes + ' dashes, ' + r.ev.brakes + ' brakes — ALL through the pads)');
    }
    ok(run.every(r => r.ev.armExtends > 0),
      'the run cleared the appendage gauntlet (arms out ' + run.map(r => r.ev.armExtends).join('/') + ' frames while passing)');
    ok(run.every(r => r.ev.clampWaits === 0),
      'every authored speed window brackets run speed (manual fired them without bleeding: ' +
      run.map(r => r.ev.clampFires + 'f/' + r.ev.clampWaits + 'w').join(', ') + ')');

    // ---- 4. layout: on-canvas, disjoint, clear of the help banner ----------
    // (A FRESH live manual run first — the scripted runs above ended theirs,
    // and the help-tap probe needs a live sim to be meaningful.)
    const layout = await p.evaluate(`(async () => { ${PAD_JS}
      const T3 = (await import('./src/main.js')).__TEST;
      T3.escape.begin({ seed: 5, auto: false });
      const c = document.getElementById('game'); const r = c.getBoundingClientRect();
      const names = Object.keys(pads);
      const css = {}; let onCanvas = true;
      for (const n of names) {
        const q = pads[n];
        css[n] = { x: r.x + q.x / 480 * r.width, y: r.y + q.y / 300 * r.height,
          w: q.w / 480 * r.width, h: q.h / 300 * r.height };
        if (css[n].x < r.x - 0.5 || css[n].y < r.y - 0.5 ||
            css[n].x + css[n].w > r.x + r.width + 0.5 || css[n].y + css[n].h > r.y + r.height + 0.5) onCanvas = false;
      }
      const overlaps = [];
      for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
        const a = css[names[i]], b = css[names[j]];
        if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) overlaps.push(names[i] + '~' + names[j]);
      }
      // The help banner (#help-hud): the escape is chrome-OFF by name, so
      // armed help in the escape must keep the banner DOWN (its in-escape
      // surface is the anchored #help-tip instead — checked below). If the
      // banner were ever up, it must still clear every pad.
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }));
      await new Promise(res => setTimeout(res, 250));
      const hud = document.getElementById('help-hud');
      const hudShown = hud ? !(getComputedStyle(hud).display === 'none') : false;
      const hr = hud ? hud.getBoundingClientRect() : null;
      let hudClash = [];
      if (hudShown && hr && hr.width) {
        for (const n of ['LEFT', 'RIGHT', 'JUMP', 'DASH', 'KICK', 'MODE']) {
          const a = css[n];
          if (a.x < hr.x + hr.width && hr.x < a.x + a.w && a.y < hr.y + hr.height && hr.y < a.y + a.h) hudClash.push(n);
        }
      }
      // A pad tap with help OPEN: explains, never activates.
      const sim = (await import('./src/main.js')).__TEST.escape.sim;
      const pre = { x: sim.player.x, vx: sim.player.vx };
      c.dispatchEvent(new PointerEvent('pointerdown',
        { clientX: css.RIGHT.x + 2, clientY: css.RIGHT.y + 2, bubbles: true, pointerId: 9 }));
      await new Promise(res => setTimeout(res, 350));
      const tip = document.getElementById('help-tip');
      const post = { x: sim.player.x, vx: sim.player.vx,
        tip: tip ? (tip.textContent || '') : '', helpMode: (await import('./src/main.js')).__TEST.state.helpMode };
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return { onCanvas, overlaps, hudShown, hudClash, pre, post }; })()`);
    ok(layout.onCanvas, 'every pad rect lands on the canvas (letterboxed, both sizes show the whole set)');
    ok(layout.overlaps.length === 0, 'the pads are mutually disjoint in CSS space' +
      (layout.overlaps.length ? ' — CLASH: ' + layout.overlaps.join(',') : ''));
    ok(layout.hudClash.length === 0,
      'the help banner clears every pad (shown=' + layout.hudShown +
      (layout.hudClash.length ? ', CLASH: ' + layout.hudClash.join(',') : '') + ')');
    ok(layout.post.helpMode && layout.post.tip.length > 10 && Math.abs(layout.post.x - layout.pre.x) < 0.001,
      'help OPEN: the RIGHT pad tap EXPLAINED ("' + layout.post.tip.slice(0, 44) + '…") and did NOT run');

    // ---- 5. AFTER screenshots: the manual HUD, pads drawn, gauntlet in frame
    await p.evaluate(`(async () => { const T2 = ${T};
      T2.escape.begin({ seed: 9, auto: false });
      const sim = T2.escape.sim;
      let guard = 0;
      while (guard++ < 60 * 120) {
        T2.escape.frame(null, 1 / 60);
        if (sim.boss && sim.boss.x - sim.player.x < 300 && sim.boss.arms.some(a => a.phase === 'windup')) break;
      } })()`);
    // Shoot AT that frame (no live idle: an unattended manual runner brakes,
    // the wall arrives, and the shot lands under a CAUGHT card).
    const shot = await p.shot('p2b99-after-' + tag);
    copyFileSync(shot, ART + '/after-manual-' + tag + '.png');
    console.log('[' + tag + '] AFTER shot saved (manual HUD, pads drawn, boss tell in frame)');

    const errs = p.errors;
    ok(errs.length === 0, 'no page errors (' + errs.length + ')');
  });
}

await viewport(390, 844, '390x844');
await viewport(320, 568, '320x568');
if (fails) { console.log('verify_p2b99_manual: ' + fails + ' FAILURES'); process.exit(1); }
console.log('verify_p2b99_manual: ALL CHECKS PASSED (both viewports)');
