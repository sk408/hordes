// HORDES - tools/verify_h1_pad_reflow.mjs (H1 slice acceptance bar item 1,
// docs/briefs/H1_PAD_REFLOW.md).
//
// The owner-reported bug: the on-screen control pads REFLOW mid-run — the
// left pad swung 74.97px -> 147.22px as updateTouchHud's live badge text set
// the pad's max-content width. The fix is CSS-only (fixed 96px pad, buttons
// width:100% + border-box + fixed 64px height, badge min-height 28.6px with
// wrapping). This tool PROVES the geometry is now text-independent in a REAL
// headless Chrome at PHONE size (390x844 @dpr3):
//   getBoundingClientRect() (x, y, width, height) for BOTH pads, EVERY pad
//   button and #joy, captured across the mid-run states the bug report is
//   about — pilot AUTO_ALL/AUTO_MOVE/MANUAL (cycled through the REAL seam,
//   runAction('pilot')), live acts PATROL/FLEE/LOOT, focus NEAREST->TOUGHEST,
//   stance BALANCED->GREEDY, badge RDY->8.0s cooldown, potion 1->12 — with
//   EXACT-EQUALITY asserted across every state (byte-identical dimensions is
//   the bar; "looks the same" cannot distinguish 74.97 from 147.22).
//
// House rules honored:
//   * all 19 TOUR_KEYS set (tools/browser.mjs's own startup sets only 7, and
//     frame() gates the sim on !coachActive() — the tick-38 lesson);
//   * state.time > 1.0 ASSERTED before anything is measured (a run reached
//     with the coach gate active is frozen);
//   * the run is started via __TEST.startRun() with the transition asserted —
//     the tick's harness note measured a real tap on START GAME missing 4/4
//     on a fresh profile;
//   * states that cannot be reached through the real seam are set on the
//     PUBLISHED fields the HUD reads (controller.act, state.player.skillCd,
//     state.player.potions), one wrapped decide() away from the live loop;
//   * NO badge text is clipped or shortened anywhere in this slice — the
//     pilot badge is the doctrine's only on-screen home for FLEE/LOOT/PATROL.
// EVIDENCE DISCLOSURE: no vision model on this host. The verdict is DOM rects
// + badge text + PNG dimensions, not a "looks right" judgement.
// Run: node tools/verify_h1_pad_reflow.mjs
import { withPage } from './browser.mjs';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ART = 'docs/art/browser-verify-2026-09-12';
mkdirSync(ART, { recursive: true });
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); };

const TOUR19 = ['stage1', 'hud', 'pilot', 'focus', 'stance', 'move', 'skills', 'potions',
  'stats', 'cog', 'draft', 'edge', 'chest', 'portal', 'arch', 'shrine',
  'intermission', 'death', 'settings'];

const PAGE = `(async () => {
  const T = (await import('./src/main.js')).__TEST;
  const st = T.state;
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
  const px = (n) => Math.round(n * 100) / 100;
  const box = (el) => { const r = el.getBoundingClientRect(); return { x: px(r.left), y: px(r.top), w: px(r.width), h: px(r.height) }; };

  // The PUBLISHED-act seam: syncChrome copies controller.act -> state.stanceAct
  // -> the tc-pilot badge every frame. Wrap the LIVE controller's decide so
  // the act the HUD publishes is the one under test (re-wrapped after every
  // pilot swap — a swap builds a new controller instance).
  let wantedAct = null;
  const wrapCtl = () => {
    const c = T.controller;
    if (c && !c.__h1wrapped) {
      const orig = c.decide.bind(c);
      c.decide = (p, s, cfg) => { const d = orig(p, s, cfg); if (wantedAct) c.act = wantedAct; return d; };
      c.__h1wrapped = true;
    }
  };
  wrapCtl();

  const readAll = (label) => ({
    label,
    padL: box(document.querySelector('#touch .pad.left')),
    padR: box(document.querySelector('#touch .pad.right')),
    joy: box(document.getElementById('joy')),
    joyDisplay: getComputedStyle(document.getElementById('joy')).display,
    buttons: [...document.querySelectorAll('#touch .pad button')]
      .map((b) => ({ act: b.dataset.act, ...box(b) })),
    badges: {
      pilot: document.getElementById('tc-pilot').textContent,
      focus: document.getElementById('tc-focus').textContent,
      stance: document.getElementById('tc-stance').textContent,
      q: document.getElementById('tc-q').textContent,
      w: document.getElementById('tc-w').textContent,
      h: document.getElementById('tc-h').textContent,
      n: document.getElementById('tc-n').textContent,
    },
  });
  const settle = async (label) => { await frame(); await frame(); return readAll(label); };
  const pilotTo = async (want) => {
    for (let i = 0; i < 3 && st.pilotMode !== want; i++) { T.runAction('pilot'); await frame(); }
    wrapCtl();
    if (st.pilotMode !== want) throw new Error('could not reach pilot mode ' + want + ' (at ' + st.pilotMode + ')');
  };
  const focusTo = async (want) => {
    for (let i = 0; i < 4 && st.focus !== want; i++) { T.runAction('focus'); await frame(); }
    if (st.focus !== want) throw new Error('could not reach focus ' + want + ' (at ' + st.focus + ')');
  };
  const stanceTo = async (want) => {
    for (let i = 0; i < 4 && st.stance !== want; i++) { T.runAction('stance'); await frame(); }
    if (st.stance !== want) throw new Error('could not reach stance ' + want + ' (at ' + st.stance + ')');
  };
  const qId = T.classSkillId(st);
  const resetSkills = () => { st.player.skillCd[qId] = 0; st.player.skillCd.OVERCHARGE = 0; st.player.mana = st.player.stats.maxMana; };

  const rows = [];
  // S1 base: AUTO_ALL / PATROL / NEAREST / BALANCED / RDY / 1 potion.
  await pilotTo('AUTO_ALL'); wantedAct = 'PATROL'; await focusTo('NEAREST'); await stanceTo('BALANCED');
  resetSkills(); st.player.potions.hp = 1; st.player.potions.mp = 1;
  rows.push(await settle('AUTO_ALL/PATROL/NEAREST/BALANCED/RDY/hp1'));
  // S2 the measured worst case: AUTO_MOVE (badge 'AUTO_MOVE · PATROL', 17ch).
  await pilotTo('AUTO_MOVE');
  rows.push(await settle('AUTO_MOVE/PATROL (worst-case badge)'));
  // S3 MANUAL (badge 'MANUAL'; #joy display:block).
  await pilotTo('MANUAL'); wantedAct = null;
  rows.push(await settle('MANUAL (joy visible)'));
  // S4/S5 back to AUTO_ALL, live acts FLEE / LOOT.
  await pilotTo('AUTO_ALL'); wantedAct = 'FLEE';
  rows.push(await settle('AUTO_ALL/FLEE'));
  wantedAct = 'LOOT';
  rows.push(await settle('AUTO_ALL/LOOT'));
  // S6 focus NEAREST -> TOUGHEST. S7 stance BALANCED -> GREEDY.
  wantedAct = 'PATROL'; await focusTo('TOUGHEST');
  rows.push(await settle('focus TOUGHEST'));
  await stanceTo('GREEDY');
  rows.push(await settle('stance GREEDY'));
  // S8 badge RDY -> cooldown: skillCd 8.0 -> '8.0s'.
  st.player.skillCd[qId] = 8.0;
  rows.push(await settle('cooldown 8.0s'));
  // S9 potion count 1 -> 12.
  resetSkills(); st.player.potions.hp = 12; st.player.potions.mp = 12;
  rows.push(await settle('potions 12'));
  // S10-S12 MANUAL with EVERYTHING moved at once: #joy must not twitch.
  await pilotTo('MANUAL'); wantedAct = 'FLEE'; await focusTo('RANGED'); await stanceTo('SAFE');
  st.player.skillCd[qId] = 8.0; st.player.potions.hp = 12;
  rows.push(await settle('MANUAL/FLEE/RANGED/SAFE/8.0s/hp12 (joy)'));
  wantedAct = 'LOOT'; await focusTo('SWARM'); await stanceTo('GREEDY'); resetSkills(); st.player.potions.hp = 1;
  rows.push(await settle('MANUAL/LOOT/SWARM/GREEDY/RDY/hp1 (joy)'));
  wantedAct = null;
  rows.push(await settle('MANUAL natural (joy)'));
  return { qId, rows };
})()`;

const out = await withPage({ w: 390, h: 844, dpr: 3,
  startupScript: "try { localStorage.setItem('hordes_onboarded', '1'); } catch (e) {}" + "\n" +
    'for (const k of ' + JSON.stringify(TOUR19) + ") { try { localStorage.setItem('hordes_tour_' + k, '1'); } catch (e) {} }" },
  async (p) => {
    await p.waitFor("(async () => (await import('./src/main.js')).__TEST.state.mode !== 'intro')()", 15000);
    await p.waitFor("(async () => { const rv = (await import('./src/main.js')).__TEST.state.titleReveal; return !rv || rv.phase === 'settled'; })()", 8000);
    // The tick's harness note: a real tap on START GAME missed 4/4 on a fresh
    // profile. Start through the real seam and ASSERT the transition instead.
    await p.evaluate("(async () => (await import('./src/main.js')).__TEST.startRun())()");
    const playing = await p.waitFor("(async () => (await import('./src/main.js')).__TEST.state.mode === 'playing')()", 8000);
    // CRITICAL: the sim clock must be advancing BEFORE anything is measured —
    // a run reached with the coach gate active is a paused game.
    const advancing = await p.waitFor("(async () => { const st = (await import('./src/main.js')).__TEST.state; return st.mode === 'playing' && st.time > 1.0; })()", 10000, 200);
    check('run started and the sim clock ADVANCED past 1.0s before any measurement', playing && advancing, { playing, advancing });

    const data = await p.evaluate(PAGE, true);
    const rows = data.rows;

    // ---- per-state rect table (the AFTER table for the report) -------------
    for (const r of rows) {
      console.log('STATE ' + r.label);
      console.log('  padL ' + r.padL.w + 'x' + r.padL.h + ' @' + r.padL.x + ',' + r.padL.y +
        '  padR ' + r.padR.w + 'x' + r.padR.h + ' @' + r.padR.x + ',' + r.padR.y +
        '  joy ' + r.joy.w + 'x' + r.joy.h + ' @' + r.joy.x + ',' + r.joy.y + ' (' + r.joyDisplay + ')');
      console.log('  buttons ' + r.buttons.map((b) => b.act + ':' + b.w + 'x' + b.h + '@' + b.x + ',' + b.y).join(' '));
      console.log('  badges ' + JSON.stringify(r.badges));
    }

    // ---- exact-equality assertions ------------------------------------------
    const same = (a, b) => a && b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
    const base = rows[0];
    const eqAll = (pick) => rows.every((r) => same(pick(r), pick(base)));
    check('left pad rect byte-identical across ALL ' + rows.length + ' states', eqAll((r) => r.padL),
      rows.map((r) => r.label + '=' + JSON.stringify(r.padL)));
    check('right pad rect byte-identical across ALL states', eqAll((r) => r.padR),
      rows.map((r) => r.label + '=' + JSON.stringify(r.padR)));
    for (const act of base.buttons.map((b) => b.act)) {
      check('button [' + act + '] rect byte-identical across ALL states',
        rows.every((r) => same(r.buttons.find((b) => b.act === act), base.buttons.find((b) => b.act === act))),
        rows.map((r) => { const b = r.buttons.find((x) => x.act === act); return r.label + '=' + b.w + 'x' + b.h + '@' + b.x + ',' + b.y; }));
    }
    const manual = rows.filter((r) => r.joyDisplay === 'block');
    check('#joy is display:block in EVERY MANUAL state and only there',
      manual.length === 4 && rows.filter((r) => r.joyDisplay !== 'block').every((r) => !/MANUAL/.test(r.label)),
      rows.map((r) => r.label + '=' + r.joyDisplay));
    check('#joy rect byte-identical across the MANUAL states (nothing above may move it)',
      manual.every((r) => same(r.joy, manual[0].joy)),
      manual.map((r) => r.label + '=' + JSON.stringify(r.joy)));
    check('both pads are the FIXED 96px in every state',
      rows.every((r) => r.padL.w === 96 && r.padR.w === 96),
      rows.map((r) => r.label + '=L' + r.padL.w + '/R' + r.padR.w));

    // ---- the states were REAL: the badge text actually changed ---------------
    const at = (i) => rows[i].badges;
    check('badge text moved through the measured states (the measurement is not of a static page)',
      /AUTO_MOVE · PATROL/.test(at(1).pilot) && at(2).pilot === 'MANUAL' &&
      /FLEE/.test(at(3).pilot) && /LOOT/.test(at(4).pilot) &&
      at(5).focus === 'TOUGHEST' && at(6).stance === 'GREEDY' &&
      /^8\.0s$/.test(at(7).q) && at(8).h === '12',
      rows.map((r) => r.label + ' -> ' + JSON.stringify(r.badges)));

    // ---- the artifact ---------------------------------------------------------
    await p.evaluate("(async () => { for (let i = 0; i < 4; i++) await new Promise(r => requestAnimationFrame(r)); })()");
    const shotFile = await p.shot('h1-pad-reflow');
    const dst = join(ART, 'h1-pad-reflow-phone.png');
    copyFileSync(shotFile, dst);
    const b64 = readFileSync(dst).toString('base64');
    const dims = await p.evaluate(`(async () => {
      const img = await createImageBitmap(await (await fetch('data:image/png;base64,${b64}')).blob());
      return { w: img.width, h: img.height };
    })()`, true);
    console.log('PNG: ' + dst + '  ' + dims.w + 'x' + dims.h);
    check('PNG is 1170x2532', dims.w === 1170 && dims.h === 2532, dims);
    if (p.errors.length) console.log('PAGE ERRORS: ' + JSON.stringify(p.errors));
    return { qId: data.qId, png: dst, dims, states: rows.length };
  });

const bad = results.filter((r) => !r.ok).length;
for (const r of results) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.name}${r.ok ? '' : ' :: ' + JSON.stringify(r.detail)}`);
console.log(JSON.stringify(out));
console.log(`verify_h1_pad_reflow: ${results.length - bad}/${results.length} checks passed`);
process.exit(bad ? 1 : 0);
