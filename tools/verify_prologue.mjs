// FIRST-RUN PROLOGUE — THE RE-ENABLE ACCEPTANCE (owner addendum 2026-09-18).
//
// "I deleted all cookies and site data and reset my profile and it doesn't
// give me the first assisted run." The test that matters is the owner's own:
// a profile with NO saved data at all, the flag ON, run #1 gives the
// assisted run end-to-end. This verifier performs EXACTLY that, in a real
// browser, per phone size:
//
//   LEG A (390x844 + 320x568) — THE OWNER'S OWN TEST, played for real:
//     fresh temp profile (no hordes_* keys in storage at boot — nothing
//     seeded by the harness), C.PROLOGUE.ENABLED flipped ON in-page before
//     START GAME (the kill switch is OFF in the shipped default until the
//     acceptance passes), first START GAME meets the HOW TO PLAY gate
//     (fresh path), GOT IT starts the run, and run #1 must arm the
//     assisted run: the inert opening (clock 0, no spawns), the banners
//     ACTION-GATED (defect c: nothing advances until the player DOES the
//     thing — real touch drag steers, the real O key pilots, the real I
//     key opens STATS), the lesson telling the truth of the mode (defect
//     b: banner 1 opens "The pilot flies for you" while pilotMode reads
//     AUTO), the ALWAYS-VISIBLE canvas SKIP (defect a: on screen during
//     walk AND banner — geometry pinned, and tapped for real in LEG B),
//     then the potion walk-in, the 45s shield, the clock starting at the
//     drink, and the lock lifting to exactly a normal run's control set.
//
//   LEG B (390x844) — THE OPT-OUT, through a REAL finger tap at the
//     canvas SKIP rect from a live phase: skipped mode ("stop explaining"),
//     full control set live from the press, and the potion sequence still
//     running to its drink (the owner's clarified ruling).
//
// Run: node tools/verify_prologue.mjs
import { withPage } from './browser.mjs';
import { copyFileSync, mkdirSync } from 'node:fs';

const ART = '/home/claude/projects/hordes/docs/art/prologue-2026-09-18/shots';
mkdirSync(ART, { recursive: true });

let fails = 0;
function ok(cond, label) {
  console.log((cond ? '  ok - ' : '  FAIL - ') + label);
  if (!cond) fails++;
}

// The page-side expression helper: tx(expr) evaluates expr against the live
// __TEST seam (t.state is the run state) and returns its value.
const tx = (expr) => `(async () => { const t = (await import('./src/main.js')).__TEST; return (${expr}); })()`;

// Boot a COMPLETELY FRESH profile to the moment before START GAME, with the
// kill switch flipped ON in-page. skipPrologue:false (no seeded runs=1) and
// skipTour:false (no seeded tour marks) — storage starts EMPTY, exactly the
// owner's cleared-cookies state; the flag flip rides a startup script so it
// lands before any game script reads it.
async function freshToTitle(p) {
  // THE FRESH STATE ITSELF is asserted in legA (before any click).
  await p.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode !== 'intro')()`, 15000);
  await p.sleep(400);
  await p.evaluate(`(async () => {
    // THE KILL SWITCH, flipped ON in-page — the same object main.js reads
    // (CONFIG as C), BEFORE START GAME evaluates the arm.
    (await import('./src/config.js')).CONFIG.PROLOGUE.ENABLED = true;
    (await import('./src/main.js')).__TEST.showTitle(); })()`);
  await p.sleep(150);
}

async function clickCard(p, text) {
  await p.evaluate(`(() => {
    const el = [...document.getElementById('ov-cards').children]
      .find(k => (k.textContent || '').toUpperCase().includes(${JSON.stringify(text)}) && !k.hidden);
    if (el) el.click(); })()`);
}

// LEG A — the owner's own test, played through the real action gates.
async function legA(w, h, tag) {
  await withPage({ w, h, dpr: 3, mobile: true, skipPrologue: false, skipTour: false,
    startupScript: `try { localStorage.clear(); } catch (e) {}` },
  async (p) => {
    await freshToTitle(p);

    // 0. THE PRECONDITION — no saved data at all (the owner's cleared
    //    cookies/site data), and the flag reads ON in-page.
    const boot = await p.evaluate(`(() => {
      const keys = []; for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
      return { keys }; })()`);
    ok(boot.keys.filter(k => /^hordes_/.test(k)).length === 0,
      '[' + tag + '] storage is EMPTY of hordes_* at boot (' + boot.keys.length + ' other keys)');
    const flag = await p.evaluate(`(async () => (await import('./src/config.js')).CONFIG.PROLOGUE.ENABLED)()`);
    ok(flag === true, '[' + tag + '] the kill switch reads ON in-page before START GAME');

    // 1. FIRST START GAME — the fresh profile meets the HOW TO PLAY gate;
    //    GOT IT starts the run. (The gate is the fresh path by design; the
    //    prologue arms under it, not instead of it.)
    await clickCard(p, 'START GAME');
    await p.sleep(300);
    const gate = await p.evaluate(`(() => {
      const el = [...document.getElementById('ov-cards').children]
        .find(k => (k.textContent || '').toUpperCase().includes('GOT IT') && !k.hidden);
      return { up: !!el }; })()`);
    ok(gate.up, '[' + tag + '] first START GAME opened the HOW TO PLAY gate (fresh path)');
    await clickCard(p, 'GOT IT');
    await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode === 'playing')()`, 20000);

    // 2. RUN #1 ARMS THE ASSISTED RUN — the owner's exact complaint
    //    ("doesn't give me the first assisted run"): inert world, frozen
    //    clock, potion on screen.
    const t0 = await p.evaluate(tx('t'));
    ok(t0.prologue.active === true,
      '[' + tag + '] run #1 of a CLEARED profile gives the assisted run');
    ok(t0.state.time === 0, '[' + tag + '] the run clock reads 0 during the phase');
    ok(t0.state.enemies.length === 0, '[' + tag + '] the prologue world is INERT (no spawns)');
    ok(t0.prologue.potion.x >= 0 && t0.prologue.potion.x <= 480 &&
       t0.prologue.potion.y >= 0 && t0.prologue.potion.y <= 300,
      '[' + tag + '] the potion is ON SCREEN (' + JSON.stringify(t0.prologue.potion) + ')');

    // 3. THE OPT-OUT'S GEOMETRY (defect a) — on screen for the WHOLE phase:
    //    inside the 480x300 view, clear of the banner card plate, during the
    //    walk (no banner) AND under a banner. LEG B taps it for real.
    const skipGeom = await p.evaluate(`(async () => {
      const T2 = (await import('./src/main.js')).__TEST;
      const r = T2.prologue.skipRect();
      const live = T2.prologue.active && !T2.state.prologue.skipped && !T2.state.prologue.drunk;
      return { r, live, view: [480, 300] }; })()`);
    ok(skipGeom.r.x >= 0 && skipGeom.r.y >= 0 &&
       skipGeom.r.x + skipGeom.r.w <= 480 && skipGeom.r.y + skipGeom.r.h <= 300,
      '[' + tag + '] the SKIP rect sits inside the view (' + JSON.stringify(skipGeom.r) + ')');
    ok(skipGeom.r.x >= 390, '[' + tag + '] the SKIP rect clears the banner card plate (x ' + skipGeom.r.x + ')');
    ok(skipGeom.live, '[' + tag + '] the SKIP is painted during the WALK (no banner up)');

    // 4. BANNER 1 RISES (the AUTO pilot walks BANNER_WALK_S, then the card)
    //    — and the LESSON tells the truth of the MODE (defect b): the phase
    //    runs in the default AUTO, and banner 1 OPENS with "The pilot flies
    //    for you" — steering is taught as the opt-in, never the default.
    await p.waitFor(tx('t.prologue.paused === true'), 6000);
    const t1 = await p.evaluate(tx('t'));
    const b1 = t1.prologue.banners[0];
    ok(t1.prologue.paused === true, '[' + tag + '] banner 1 is up (walk cadence met)');
    ok(/pilot flies for you/i.test(b1.body),
      '[' + tag + '] defect b: banner 1 opens "The pilot flies for you"');
    ok(/AUTO/.test(String(t1.state.pilotMode)),
      '[' + tag + '] defect b: the phase runs in the default AUTO (mode ' + t1.state.pilotMode + ')');
    ok(skipGeom.live, '[' + tag + '] the SKIP is painted UNDER the banner too (always-visible)');
    const shotBanner = await p.shot('prologue-banner-' + tag);
    copyFileSync(shotBanner, ART + '/prologue-banner-' + tag + '.png');
    ok(true, '[' + tag + '] banner shot (banner up, SKIP visible top-right, potion on screen)');

    // 5. THE PILOT HOLDS while the card is up (the addendum choreography).
    const posA = await p.evaluate(tx("t.state.player.x + ',' + t.state.player.y"));
    await p.sleep(600);
    const posB = await p.evaluate(tx("t.state.player.x + ',' + t.state.player.y"));
    ok(posA === posB, '[' + tag + '] the pilot PAUSES while a banner is up (' + posA + ' -> ' + posB + ')');

    // 6. ACTION-GATING (defect c) — nothing advances until the player DOES
    //    the thing. An idle 1.2s on banner 1 must NOT advance it...
    await p.sleep(1200);
    const idxStill = await p.evaluate(tx('t.prologue.bannerIdx'));
    ok(idxStill === 0,
      '[' + tag + '] defect c: 1.2s idle on banner 1 advanced NOTHING (idx ' + idxStill + ')');
    // ...and a WRONG action (the stats key, banner 3's action) must not
    // advance it either.
    await p.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'i', bubbles: true }))`);
    await p.sleep(300);
    const idxWrong = await p.evaluate(tx('t.prologue.bannerIdx'));
    const modeWrong = await p.evaluate(tx('t.state.mode'));
    ok(idxWrong === 0 && modeWrong === 'playing',
      '[' + tag + '] defect c: a WRONG action did not advance or open anything (idx ' + idxWrong + ')');
    // ...but the ASKED-FOR action does: a REAL touch drag steers (the move
    // stage is revealed under its own banner) and banner 1 advances on it.
    const cv = await p.evaluate(`(() => { const b = document.getElementById('game').getBoundingClientRect();
      return [b.left + b.width / 2, b.top + b.height / 2]; })()`);
    const pxBefore = await p.evaluate(tx('t.state.player.x'));
    await p.swipe(cv[0], cv[1], -80, 0, 8);   // LEFT: away from the potion (+DX)
    const afterMove = await p.evaluate(tx('t'));
    ok(afterMove.state.player.x < pxBefore,
      '[' + tag + '] defect c: the real touch drag STEERED the pilot (' +
      (pxBefore - afterMove.state.player.x).toFixed(1) + 'wu left)');
    ok(afterMove.prologue.bannerIdx === 1,
      '[' + tag + '] defect c: DOING the asked action advanced banner 1 (0 -> 1)');

    // 7. BANNER 2 — THE PILOT BUTTON, action 'pilot': the real O key is the
    //    continue (and it actually toggles the pilot).
    await p.waitFor(tx('t.prologue.paused === true'), 8000);
    await p.sleep(1000);
    ok(await p.evaluate(tx('t.prologue.bannerIdx')) === 1,
      '[' + tag + '] idle on banner 2 advanced NOTHING (still waiting for the action)');
    const modeBefore = await p.evaluate(tx('t.state.pilotMode'));
    await p.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', bubbles: true }))`);
    await p.sleep(400);
    const afterO = await p.evaluate(tx('t'));
    ok(afterO.state.pilotMode !== modeBefore,
      '[' + tag + '] defect c: the real O key TOGGLED the pilot (' + modeBefore + ' -> ' + afterO.state.pilotMode + ')');
    ok(afterO.prologue.bannerIdx === 2,
      '[' + tag + '] defect c: the pilot action advanced banner 2 (1 -> 2)');

    // 8. BANNER 3 — FOCUS (owner addendum 2026-09-18: "it should give a
    //    message about focus and stance also"), action 'focus': the real Tab
    //    key cycles the targeting doctrine and is the continue.
    await p.waitFor(tx('t.prologue.paused === true'), 8000);
    await p.sleep(600);
    ok(await p.evaluate(tx('t.prologue.bannerIdx')) === 2,
      '[' + tag + '] idle on banner 3 (FOCUS) advanced NOTHING (still waiting for the action)');
    const focusBefore = await p.evaluate(tx('t.controller.focus'));
    await p.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))`);
    await p.sleep(400);
    const afterTab = await p.evaluate(tx('t'));
    ok(afterTab.controller.focus !== focusBefore,
      '[' + tag + '] the real Tab key CYCLED the focus doctrine (' + focusBefore + ' -> ' + afterTab.controller.focus + ')');
    ok(afterTab.prologue.bannerIdx === 3,
      '[' + tag + '] the focus action advanced banner 3 (2 -> 3)');

    // 8b. BANNER 4 — STANCE, action 'stance': the real G key turns the risk
    //     dial and is the continue.
    await p.waitFor(tx('t.prologue.paused === true'), 8000);
    const stanceBefore = await p.evaluate(tx('t.controller.stance'));
    await p.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true }))`);
    await p.sleep(400);
    const afterG = await p.evaluate(tx('t'));
    ok(afterG.controller.stance !== stanceBefore,
      '[' + tag + '] the real G key TURNED the stance dial (' + stanceBefore + ' -> ' + afterG.controller.stance + ')');
    ok(afterG.prologue.bannerIdx === 4,
      '[' + tag + '] the stance action advanced banner 4 (3 -> 4)');

    // 8c. BANNER 5 — LEVEL UP, action 'stats': the real I key opens the
    //     FIELD REPORT and is the continue.
    await p.waitFor(tx('t.prologue.paused === true'), 8000);
    await p.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'i', bubbles: true }))`);
    await p.sleep(300);
    const modeStats = await p.evaluate(tx('t.state.mode'));
    ok(modeStats === 'stats',
      '[' + tag + '] defect c: the real I key opened the FIELD REPORT (mode ' + modeStats + ')');
    await p.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
    await p.sleep(500);
    ok(await p.evaluate(tx('t.prologue.bannerIdx')) === 5,
      '[' + tag + '] defect c: the stats action advanced banner 5 (4 -> 5)');

    // 8d. BANNER 6 — THE DRAFT (owner addendum: "maybe even trigger a level
    //     up and tell the player about the card selections"): the banner walks
    //     into view and the phase grants ONE FREE level — scripted, not
    //     earned — opening the REAL draft with the explanation riding its
    //     subtitle. The PICK is the continue; the auto-pick pacing (6.0s
    //     DRAFT_TIMEOUT) is untouched.
    await p.waitFor(tx("t.state.mode === 'draft' && t.prologue.bannerIdx === 5"), 8000);
    const draftInfo = await p.evaluate(`(async () => {
      const T2 = (await import('./src/main.js')).__TEST;
      const CFG = await import('./src/config.js');
      const cards = [...document.getElementById('ov-cards').children].filter(c => !c.hidden);
      return { level: T2.state.player.level, fired: T2.state.prologue.draftFired,
        sub: document.getElementById('ov-sub').textContent,
        n: cards.length, timeout: CFG.CONFIG.AUTOPILOT.DRAFT_TIMEOUT,
        enemies: T2.state.enemies.length, time: T2.state.time }; })()`);
    ok(draftInfo.fired === true && draftInfo.level === 2,
      '[' + tag + '] the draft banner fired ONE free scripted level-up (level ' + draftInfo.level + ')');
    ok(draftInfo.enemies === 0 && draftInfo.time === 0,
      '[' + tag + '] the opening stayed INERT through the scripted level (no enemies, clock 0)');
    ok(/pick 1 of the 3 cards/i.test(draftInfo.sub),
      '[' + tag + '] the draft screen EXPLAINS the card selection (subtitle: "' + draftInfo.sub + '")');
    ok(draftInfo.n === 3, '[' + tag + '] the real draft shows 3 cards (' + draftInfo.n + ')');
    ok(draftInfo.timeout === 6.0,
      '[' + tag + '] PACING GUARD: the auto-pick delay stays 6.0s (' + draftInfo.timeout + ')');
    const shotDraft = await p.shot('prologue-draft-' + tag);
    copyFileSync(shotDraft, ART + '/prologue-draft-' + tag + '.png');
    ok(true, '[' + tag + '] scripted-draft shot (the free level-up + its explanation)');
    await p.evaluate(`(() => {
      const c = [...document.getElementById('ov-cards').children].filter(k => !k.hidden)[0];
      if (c) c.click(); })()`);
    await p.sleep(500);
    ok(await p.evaluate(tx('t.prologue.bannerIdx')) === 6,
      '[' + tag + '] the PICK advanced banner 6 (5 -> 6)');

    // 9. BANNER 7 — THE POTION, action 'drink': the banner's cue is WALK
    //    INTO THE POTION and the phase ends AT the drink — clock starts,
    //    45s shield, control set restored. Steer into it for real.
    await p.waitFor(tx('t.prologue.paused === true'), 8000);
    const shotPotion = await p.shot('prologue-potion-' + tag);
    copyFileSync(shotPotion, ART + '/prologue-potion-' + tag + '.png');
    ok(true, '[' + tag + '] potion-banner shot (cue: WALK INTO THE POTION)');
    const walked = await p.waitFor(`(async () => {
      const T2 = (await import('./src/main.js')).__TEST;
      if (!T2.prologue.active) return true;
      const s = T2.state, pl = s.player, po = s.prologue.potion;
      // steer TOWARD the potion with the real key twins (revealed.move is
      // live by banner 4), one nudge per poll.
      const dx = po.x - pl.x, dy = po.y - pl.y;
      const kx = Math.abs(dx) > 4 ? (dx > 0 ? 'd' : 'a') : null;
      const ky = Math.abs(dy) > 4 ? (dy > 0 ? 's' : 'w') : null;
      window.__proKeys = window.__proKeys || [];
      for (const k of window.__proKeys) window.dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true }));
      window.__proKeys = [kx, ky].filter(Boolean);
      for (const k of window.__proKeys) window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
      return false; })()`, 20000, 200);
    await p.evaluate(`for (const k of (window.__proKeys || [])) window.dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true }))`);
    ok(walked, '[' + tag + '] the player WALKED INTO THE POTION and drank it');
    await p.sleep(400);
    const tEnd = await p.evaluate(tx('t'));
    ok(tEnd.prologue.active === false && tEnd.state.prologue === null,
      '[' + tag + '] the drink ended the phase');
    ok(tEnd.state.player.invuln > 40 && tEnd.state.prologueShieldT > 40,
      '[' + tag + '] the 45s shield was granted (invuln ' +
      tEnd.state.player.invuln.toFixed(1) + 's, ring ' + tEnd.state.prologueShieldT.toFixed(1) + 's)');
    ok(tEnd.state.time > 0, '[' + tag + '] the run clock started at phase end');

    // 10. THE GUARD — at phase end the control set is EXACTLY a normal
    //     run's: lock lifted, every touch button visible, no staging marks,
    //     no tooltip — and the keys act again.
    const lock2 = await p.evaluate(`(() => {
      const btns = [...document.querySelectorAll('#touch button')];
      return { locked: document.body.classList.contains('prologue-locked'),
        allVis: btns.every((b) => getComputedStyle(b).visibility === 'visible'), n: btns.length,
        marks: [...document.querySelectorAll('#touch button.pr-on')].length,
        tip: document.getElementById('prologue-tip').hidden }; })()`);
    ok(lock2.locked === false && lock2.allVis && lock2.n > 0,
      '[' + tag + '] the lock lifted: ALL ' + lock2.n + ' touch buttons visible again');
    ok(lock2.marks === 0 && lock2.tip === true,
      '[' + tag + '] no staging marks or tooltip survive the phase');
    await p.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'i', bubbles: true }))`);
    await p.sleep(150);
    ok(await p.evaluate(tx('t.state.mode')) === 'stats',
      '[' + tag + '] buttons WORK again after the phase (FIELD REPORT opened)');
    await p.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
    await p.sleep(150);
    await p.sleep(400);
    const shotShield = await p.shot('prologue-shield-' + tag);
    copyFileSync(shotShield, ART + '/prologue-shield-' + tag + '.png');
    ok(true, '[' + tag + '] shield shot (rainbow ring, live run)');

    const errors = p.errors;
    if (errors.length) { console.log('[' + tag + '] PAGE ERRORS: ' + errors.join(' | ').slice(0, 300)); fails++; }
  });
}

// LEG B — the opt-out through a REAL finger tap at the canvas SKIP rect.
async function legB() {
  const tag = '390x844-skip';
  await withPage({ w: 390, h: 844, dpr: 3, mobile: true, skipPrologue: false, skipTour: false,
    startupScript: `try { localStorage.clear(); } catch (e) {}` },
  async (p) => {
    await freshToTitle(p);
    await clickCard(p, 'START GAME');
    await p.sleep(300);
    await clickCard(p, 'GOT IT');
    await p.waitFor(tx("t.state.mode === 'playing'"), 20000);
    await p.waitFor(tx('t.prologue.paused === true'), 8000);

    // The tap: the SKIP rect in 480x300 view coords -> CSS in-page.
    // TWO-TAP CONFIRM (owner 2026-09-18): the FIRST tap only arms the button.
    const skCss = await p.evaluate(`(async () => {
      const T2 = (await import('./src/main.js')).__TEST;
      const r = T2.prologue.skipRect();
      const b = document.getElementById('game').getBoundingClientRect();
      return { x: b.left + (r.x + r.w / 2) * (b.width / 480),
               y: b.top + (r.y + r.h / 2) * (b.height / 300) }; })()`);
    await p.tap(skCss.x, skCss.y, 1);
    await p.sleep(250);
    const armOnly = await p.evaluate(`(async () => {
      const T2 = (await import('./src/main.js')).__TEST;
      return { skipped: T2.state.prologue && T2.state.prologue.skipped,
        armT: T2.state.prologue && T2.state.prologue.skipArmT }; })()`);
    ok(armOnly.skipped === false && armOnly.armT > 0,
      '[' + tag + '] one tap only ARMS the skip (the deliberate opt-out, arm ' +
      (armOnly.armT == null ? 'n/a' : Number(armOnly.armT).toFixed(1)) + 's)');
    await p.tap(skCss.x, skCss.y, 1);
    await p.sleep(300);
    const afterSkip = await p.evaluate(`(async () => {
      const T2 = (await import('./src/main.js')).__TEST;
      const btns = [...document.querySelectorAll('#touch button')];
      return { active: T2.prologue.active, skipped: T2.state.prologue && T2.state.prologue.skipped,
        locked: T2.prologue.buttonsLocked, paused: T2.prologue.paused,
        allVis: btns.every((b) => getComputedStyle(b).visibility === 'visible') }; })()`);
    ok(afterSkip.active === true && afterSkip.skipped === true,
      '[' + tag + '] defect a: the REAL second tap on the armed SKIP entered skipped mode');
    ok(afterSkip.locked === false && afterSkip.allVis && afterSkip.paused === false,
      '[' + tag + '] defect a: the FULL control set is live from the skip press, no banner up');

    // The potion sequence still runs to its drink (the owner's ruling).
    const drank = await p.waitFor(tx('t.prologue.active === false'), 15000, 250);
    ok(drank, '[' + tag + '] the potion sequence ran on after the skip');
    const afterDrink = await p.evaluate(`(async () => {
      const T2 = (await import('./src/main.js')).__TEST;
      return { invuln: T2.state.player.invuln, time: T2.state.time }; })()`);
    ok(afterDrink.invuln > 40,
      '[' + tag + '] the effect was granted at the post-skip drink (invuln ' + afterDrink.invuln.toFixed(1) + 's)');
    ok(afterDrink.time > 0, '[' + tag + '] the run clock started at the drink');

    const errors = p.errors;
    if (errors.length) { console.log('[' + tag + '] PAGE ERRORS: ' + errors.join(' | ').slice(0, 300)); fails++; }
  });
}

await legA(390, 844, '390x844');
await legA(320, 568, '320x568');
await legB();
console.log(fails ? 'FAILURES: ' + fails : 'verify_prologue: ALL CHECKS PASSED');
process.exit(fails ? 1 : 0);
