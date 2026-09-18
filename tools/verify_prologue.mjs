// FIRST-RUN PROLOGUE (owner 2026-09-18): "a potion seen on screen and the
// pilot walks towards it... no enemies spawn and the timer hasn't started...
// dismissible (with an ok button) banners explaining some of the basics."
//
// ADDENDUM 2 — STAGED INTRODUCTION (owner 2026-09-18): "if we hide the
// controls, then we would need to introduce the buttons one at a time with
// the tooltip explaining what they do." The lock is now HIDDEN, not greyed
// (body.prologue-locked #touch button { visibility: hidden }, .pr-on
// reveals), so this verifier photographs and drives the staged path too:
// MOVE revealed by banner 1's OK with the tooltip up, a REAL touch drag
// steering the pilot and clearing the tooltip on first use, PILOT/STATS
// revealed at banners 2/3 with their buttons becoming visible and live, and
// the SKIP exception through the real canvas rect. Plus the original brief:
// the potion + banner in the inert world, the seeded field, the rainbow
// shield after the drink, and the cleared field (on-screen gone, off-screen
// alive). The OK button is driven by a real finger tap throughout.
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

async function viewport(w, h, tag) {
  // hordes_onboarded skips the HOW-TO-PLAY gate so START GAME starts the run;
  // everything else stays FRESH (totals.runs absent) so run #1 arms the
  // prologue for real.
  await withPage({ w, h, dpr: 3, mobile: true, skipPrologue: false,
    startupScript: "try { localStorage.setItem('hordes_onboarded', '1'); } catch (e) {}" },
  async (p) => {
    await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
    await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode !== 'intro')()`, 15000);
    await p.sleep(400);
    const T = () => p.evaluate(`(async () => (await import('./src/main.js')).__TEST)()`);
    await p.evaluate(`(async () => { const T2 = (await import('./src/main.js')).__TEST; T2.showTitle(); })()`);
    await p.sleep(150);
    await p.evaluate(`(() => {
      const el = [...document.getElementById('ov-cards').children]
        .find(k => (k.textContent || '').toUpperCase().includes('START GAME'));
      if (el) el.click(); })()`);
    await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode === 'playing')()`, 20000);

    // 0. THE CHOREOGRAPHY (addendum 2026-09-18: the pilot PAUSES for
    //    banners): the AUTO pilot walks, banner #1 goes up after
    //    BANNER_WALK_S of unpaused walking — and the pilot HOLDS while it
    //    is up (the withdrawn "the pilot can keep walking" line).
    await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.prologue.paused === true)()`, 5000);
    const posA = await p.evaluate(`(async () => { const s = (await import('./src/main.js')).__TEST.state;
      return [s.player.x, s.player.y]; })()`);
    await p.sleep(600);
    const posB = await p.evaluate(`(async () => { const s = (await import('./src/main.js')).__TEST.state;
      return [s.player.x, s.player.y]; })()`);
    ok(Math.hypot(posB[0] - posA[0], posB[1] - posA[1]) < 0.5,
      '[' + tag + '] the pilot PAUSES while a banner is up (moved ' +
      Math.hypot(posB[0] - posA[0], posB[1] - posA[1]).toFixed(2) + 'wu in 600ms)');

    // 1. THE PHASE IS ARMED: inert world, frozen clock, potion on screen,
    //    banner up. Park the pilot (MANUAL, nothing held) so the shot holds
    //    the walk-back moment steady.
    const t0 = await T();
    ok(t0.prologue && t0.prologue.active === true,
      '[' + tag + '] run #1 of a fresh profile arms the prologue');
    ok(t0.state.time === 0, '[' + tag + '] the run clock reads 0 during the phase');
    await p.evaluate(`(async () => {
      const T2 = (await import('./src/main.js')).__TEST;
      const st = T2.state;
      // The REAL seam: setting st.pilotMode alone does not rebind the
      // controller, and the AUTO pilot would walk to the potion and drink
      // (~1.4s) — which is EXIT 1 working, not this shot.
      T2.setPilotMode('MANUAL');
      st.spawnTimer = 999; st.wave.endsAt = st.time + 9999;
      return true; })()`);
    await p.sleep(1200);   // the smoothed camera settles; the banner paints
    const t1 = await T();
    ok(t1.state.enemies.length === 0, '[' + tag + '] the prologue world is INERT (no spawns)');
    ok(t1.prologue.potion.x >= 0 && t1.prologue.potion.x <= 480 &&
       t1.prologue.potion.y >= 0 && t1.prologue.potion.y <= 300,
      '[' + tag + '] the potion is ON SCREEN (' + JSON.stringify(t1.prologue.potion) + ')');
    const b1 = t1.prologue.banners[t1.prologue.bannerIdx];
    ok(b1 && b1.title, '[' + tag + '] a banner is up (' + (b1 && b1.title) + ')');
    const shotBanner = await p.shot('prologue-banner-' + tag);
    copyFileSync(shotBanner, ART + '/prologue-banner-' + tag + '.png');
    ok(true, '[' + tag + '] banner shot (potion visible + banner up, touch layer GREYED)');

    // 1b. THE LOCKOUT (addendum 2026-09-18: "all buttons should be disabled
    //     during this initial period"; addendum 2: hidden beats greyed): the
    //     REAL DOM state — every touch button VISIBILITY-HIDDEN and
    //     pointer-inert, nothing staged yet — and the REAL keydown funnel
    //     swallows everything.
    const lock = await p.evaluate(`(() => {
      const vis = (id) => { const b = document.getElementById(id);
        return b ? getComputedStyle(b).visibility : 'missing'; };
      const cog = document.getElementById('tc-cog');
      return { locked: document.body.classList.contains('prologue-locked'),
        pe: cog ? getComputedStyle(cog).pointerEvents : 'n/a',
        cog: vis('tc-cog'), pilot: vis('tc-pilotbtn'), stats: vis('tc-stats'),
        tip: (() => { const t = document.getElementById('prologue-tip');
          return t ? t.hidden : 'missing'; })() }; })()`);
    ok(lock.locked, '[' + tag + '] body.prologue-locked is ON through the phase');
    ok(lock.pe === 'none',
      '[' + tag + '] the touch buttons are pointer-inert (pointer-events: ' + lock.pe + ')');
    ok(lock.cog === 'hidden' && lock.pilot === 'hidden' && lock.stats === 'hidden',
      '[' + tag + '] every touch button is HIDDEN at arm time (cog ' + lock.cog +
      ', pilot ' + lock.pilot + ', stats ' + lock.stats + ')');
    ok(lock.tip === true, '[' + tag + '] no tooltip is up at arm time');
    // (Escape is deliberately NOT probed here: since addendum 2 it is the
    // SKIP twin — a LIVE key by design, exercised in step 6b below.)
    await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'i', bubbles: true }))");
    await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', bubbles: true }))");
    await p.sleep(150);
    const modeMid = await p.evaluate(`(async () => (await import('./src/main.js')).__TEST.state.mode)()`);
    const mapMid = await p.evaluate(`(async () => (await import('./src/main.js')).__TEST.state.mapOpen)()`);
    ok(modeMid === 'playing' && mapMid === false,
      '[' + tag + '] keys are inert through the phase (I/M did nothing; mode ' + modeMid + ')');

    // 2. THE OK BUTTON, through a REAL finger tap at the canvas hit-region.
    //    The OK rect lives in 480x300 view coords; map it to CSS in-page.
    const okCss = await p.evaluate(`(async () => {
      const T2 = (await import('./src/main.js')).__TEST;
      const r = T2.prologue.okRect();
      const b = document.getElementById('game').getBoundingClientRect();
      return { x: b.left + (r.x + r.w / 2) * (b.width / 480),
               y: b.top + (r.y + r.h / 2) * (b.height / 300) }; })()`);
    const t2before = await T();
    await p.tap(okCss.x, okCss.y, 1);
    const t2after = await T();
    ok(t2after.prologue.bannerIdx === t2before.prologue.bannerIdx + 1,
      '[' + tag + '] the real OK tap advanced the banner (' +
      t2before.prologue.bannerIdx + ' -> ' + t2after.prologue.bannerIdx + ')');

    // 2a. STAGE 1 — MOVE (addendum 2): banner 1's OK reveals the movement
    //     control: the tooltip is UP with it, and the staged buttons stay
    //     hidden. Park the potion far off so the fallback choreography cannot
    //     drink it mid-staging, and go AUTO_ALL at once — an idle AUTO pilot
    //     does not walk, so banner 2 cannot rise while the MOVE stage is being
    //     photographed and practised (a held banner would correctly gate the
    //     drag; MANUAL is restored below to walk banner 2 up).
    await p.evaluate(`(async () => {
      const T2 = (await import('./src/main.js')).__TEST;
      const st = T2.state;
      st.prologue.potion.x = -3900; st.prologue.potion.y = st.player.y;
      T2.setPilotMode('AUTO_ALL');
      return true; })()`);
    const stage1 = await p.evaluate(`(() => ({
      tipHidden: document.getElementById('prologue-tip').hidden,
      tipCls: document.getElementById('prologue-tip').className,
      tipTxt: (document.getElementById('prologue-tip').textContent || '').trim() }))()`);
    const rev1 = await p.evaluate(`(async () => (await import('./src/main.js')).__TEST.prologue.revealed)()`);
    ok(rev1.move === true && rev1.pilot === false && rev1.stats === false,
      '[' + tag + '] banner 1\'s OK revealed MOVE only (' + JSON.stringify(rev1) + ')');
    ok(stage1.tipHidden === false && /tip-move/.test(stage1.tipCls) && stage1.tipTxt.length > 0,
      '[' + tag + '] the MOVE tooltip is up with its control ("' + stage1.tipTxt + '")');
    const visMid = await p.evaluate(`(() => ({
      pilot: getComputedStyle(document.getElementById('tc-pilotbtn')).visibility,
      stats: getComputedStyle(document.getElementById('tc-stats')).visibility }))()`);
    ok(visMid.pilot === 'hidden' && visMid.stats === 'hidden',
      '[' + tag + '] PILOT/STATS stay hidden before their banners');
    const shotTip = await p.shot('prologue-staged-' + tag);
    copyFileSync(shotTip, ART + '/prologue-staged-' + tag + '.png');
    ok(true, '[' + tag + '] staged tooltip shot (MOVE revealed, tooltip up)');

    // 2b. LEARN BY DOING: a REAL touch drag on the canvas steers the pilot
    //     (the floating stick arms once MOVE is revealed, in any pilot mode)
    //     and the FIRST USE clears the tooltip. walkT is zeroed with the
    //     sample: movement itself accrues the banner cadence, so a pre-drifted
    //     clock would raise banner 2 mid-drag and (correctly) freeze the
    //     pilot before the drag had steered anywhere.
    await p.sleep(150);
    const dragBefore = await p.evaluate(`(async () => { const T2 = (await import('./src/main.js')).__TEST;
      const s = T2.state; s.prologue.walkT = 0; return [s.player.x, s.player.y]; })()`);
    const cv = await p.evaluate(`(() => { const b = document.getElementById('game').getBoundingClientRect();
      return [b.left + b.width / 2, b.top + b.height / 2]; })()`);
    await p.swipe(cv[0], cv[1], 80, 0, 8);
    const dragAfter = await p.evaluate(`(async () => (await import('./src/main.js')).__TEST.state.player.x)()`);
    const tipAfterDrag = await p.evaluate(`(async () => (await import('./src/main.js')).__TEST.prologue.tip)()`);
    ok(dragAfter - dragBefore[0] > 3,
      '[' + tag + '] the real touch drag STEERED the pilot (' +
      (dragAfter - dragBefore[0]).toFixed(1) + 'wu along the drag)');
    ok(tipAfterDrag === null,
      '[' + tag + '] the MOVE tooltip cleared on first use (drag), not on an OK');
    await p.evaluate(`(async () => {
      const T2 = (await import('./src/main.js')).__TEST;
      T2.setPilotMode('MANUAL'); return true; })()`);

    // 2c. STAGE 2 — PILOT (banner 2): the fallback walk brings the banner up;
    //     its OK reveals the button (visibility visible) with the tooltip, and
    //     a REAL tap on the now-live button toggles the pilot + clears the tip.
    await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.prologue.paused === true)()`, 8000);
    await p.evaluate(`(async () => { (await import('./src/main.js')).__TEST.prologue.ok(); return true; })()`);
    const rev2 = await p.evaluate(`(async () => (await import('./src/main.js')).__TEST.prologue)()`);
    ok(rev2.revealed.pilot === true,
      '[' + tag + '] banner 2\'s OK revealed PILOT');
    const visPilot = await p.evaluate(`(() => ({
      vis: getComputedStyle(document.getElementById('tc-pilotbtn')).visibility,
      pe: getComputedStyle(document.getElementById('tc-pilotbtn')).pointerEvents,
      tip: (document.getElementById('prologue-tip').textContent || '').trim() }))()`);
    ok(visPilot.vis === 'visible' && visPilot.pe === 'auto',
      '[' + tag + '] the PILOT button is visible and live at its reveal (visibility ' +
      visPilot.vis + ', pointer-events ' + visPilot.pe + ')');
    ok(/AUTO/.test(visPilot.tip), '[' + tag + '] the PILOT tooltip says what it does ("' + visPilot.tip + '")');
    const modeBefore = await p.evaluate(`(async () => (await import('./src/main.js')).__TEST.state.pilotMode)()`);
    const pb = await p.rectOf('#tc-pilotbtn');
    await p.tap(pb[0], pb[1], 1);
    const modeAfter = await p.evaluate(`(async () => (await import('./src/main.js')).__TEST.state.pilotMode)()`);
    const tipAfterPilot = await p.evaluate(`(async () => (await import('./src/main.js')).__TEST.prologue.tip)()`);
    ok(modeAfter !== modeBefore,
      '[' + tag + '] a REAL tap on the revealed PILOT button toggled it (' + modeBefore + ' -> ' + modeAfter + ')');
    ok(tipAfterPilot === null, '[' + tag + '] the PILOT tooltip cleared on first use');

    // 2d. STAGE 3 — STATS (banner 3): reveal, then the very 'i' key that was
    //     inert in 1b opens the FIELD REPORT — and the phase clock holds
    //     under it (menu-like); ESC resumes.
    await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.prologue.paused === true)()`, 8000);
    await p.evaluate(`(async () => { (await import('./src/main.js')).__TEST.prologue.ok(); return true; })()`);
    const rev3 = await p.evaluate(`(async () => (await import('./src/main.js')).__TEST.prologue)()`);
    ok(rev3.revealed.stats === true, '[' + tag + '] banner 3\'s OK revealed STATS');
    ok(await p.evaluate(`getComputedStyle(document.getElementById('tc-stats')).visibility`) === 'visible',
      '[' + tag + '] the STATS button is visible at its reveal');
    await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'i', bubbles: true }))");
    await p.sleep(200);
    const modeStats = await p.evaluate(`(async () => (await import('./src/main.js')).__TEST.state.mode)()`);
    ok(modeStats === 'stats',
      '[' + tag + '] the FIELD REPORT key WORKS once revealed (mode ' + modeStats + ')');
    ok(await p.evaluate(`(async () => (await import('./src/main.js')).__TEST.prologue.tip)()`) === null,
      '[' + tag + '] the STATS tooltip cleared on first use');
    await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
    await p.sleep(200);

    // 3. THE SEEDED FIELD: three parked walkers inside the view + margin, one
    //    far outside — the clear's before picture.
    const field = await p.evaluate(`(async () => {
      const T2 = (await import('./src/main.js')).__TEST;
      const st = T2.state, pl = st.player;
      st.enemies.length = 0;
      const mk = (x, y) => ({ typeId: 'CHASER', x: pl.x + x, y: pl.y + y, w: 10,
        hp: 500, maxHp: 500, speed: 0, mx: 0, my: 0, age: 0, elite: false });
      st.enemies.push(mk(70, 30), mk(-60, -50), mk(-30, 70));       // on-screen
      const far = mk(2000, 2000); far.x = 2000; far.y = 2000;       // off-screen
      st.enemies.push(far);
      return { kills: pl.kills, n: st.enemies.length }; })()`);
    await p.sleep(900);   // they are parked (speed 0); let the camera settle
    const shotField = await p.shot('prologue-field-' + tag);
    copyFileSync(shotField, ART + '/prologue-field-' + tag + '.png');
    ok(true, '[' + tag + '] seeded field shot (3 on-screen walkers)');

    // 4. THE DRINK: through the real prologueDrink — shield granted, clock
    //    starts, on-screen walkers reaped with credit, the far one left.
    await p.evaluate(`(async () => {
      const T2 = (await import('./src/main.js')).__TEST;
      T2.prologue.drink(); return true; })()`);
    await p.sleep(500);
    const t3 = await T();
    ok(t3.prologue.active === false && t3.state.prologue === null,
      '[' + tag + '] the drink ended the phase');
    ok(t3.state.prologueShieldT > 40,
      '[' + tag + '] the rainbow shield is live (' + t3.state.prologueShieldT.toFixed(1) + 's)');
    ok(t3.state.player.invuln > 40,
      '[' + tag + '] the named 45s shield was granted (invuln ' +
      t3.state.player.invuln.toFixed(1) + 's)');
    ok(t3.state.player.kills === field.kills + 3,
      '[' + tag + '] the 3 ON-SCREEN walkers died with normal credit (' +
      t3.state.player.kills + ' vs ' + field.kills + ')');
    ok(t3.state.enemies.length === 1 && t3.state.enemies[0].hp > 0,
      '[' + tag + '] the OFF-SCREEN walker survived the clear');
    ok(t3.state.time > 0, '[' + tag + '] the run clock started at phase end');

    // 4b. THE GUARD (addendum 2: "at prologue end the control set must
    //     EXACTLY equal a normal run's"): the lock drops at phase end, EVERY
    //     touch button is visible again with no staging marks, no tooltip —
    //     and the very keys that were inert in 1b now act.
    const lock2 = await p.evaluate(`(() => {
      const btns = [...document.querySelectorAll('#touch button')];
      const vis = btns.map((b) => getComputedStyle(b).visibility);
      const marks = [...document.querySelectorAll('#touch button.pr-on')].length;
      return { locked: document.body.classList.contains('prologue-locked'),
        allVis: vis.every((v) => v === 'visible'), n: btns.length,
        marks, tip: document.getElementById('prologue-tip').hidden }; })()`);
    ok(lock2.locked === false && lock2.allVis && lock2.n > 0,
      '[' + tag + '] the lock lifted: ALL ' + lock2.n + ' touch buttons visible again');
    ok(lock2.marks === 0 && lock2.tip === true,
      '[' + tag + '] no staging marks or tooltip survive the phase');
    await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'i', bubbles: true }))");
    await p.sleep(150);
    const liftMode = await p.evaluate(`(async () => (await import('./src/main.js')).__TEST.state.mode)()`);
    ok(liftMode === 'stats',
      '[' + tag + '] buttons WORK again after the phase (I opened the FIELD REPORT)');
    await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
    await p.sleep(150);

    // 5. THE RAINBOW + THE CLEARED FIELD: same camera, the ring around the
    //    pilot, the near field empty.
    await p.sleep(700);
    const shotRainbow = await p.shot('prologue-rainbow-' + tag);
    copyFileSync(shotRainbow, ART + '/prologue-rainbow-' + tag + '.png');
    ok(true, '[' + tag + '] rainbow + cleared field shot');

    // 6. THE SKIP (APPROVED 2026-09-18, CLARIFIED: "No, potion exists for the
    //    skipped tutorial too") — "stop explaining", NOT "start the run
    //    instantly": one real tap on the canvas SKIP rect from a LIVE phase
    //    (banner #1 up, nothing revealed) enters SKIPPED MODE — the phase
    //    stays armed, no banner and no tooltip will appear again, and the
    //    FULL control set is live from the press. The potion sequence then
    //    runs as normal: the AUTO pilot walks to the visible potion, drinks,
    //    and the effect is granted with the run clock starting at the drink.
    await p.evaluate(`(async () => {
      const T2 = (await import('./src/main.js')).__TEST;
      T2.getProfile().achievements.totals.runs = 0;
      T2.startRun(); return true; })()`);
    await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.prologue.paused === true)()`, 8000);
    const skCss = await p.evaluate(`(async () => {
      const T2 = (await import('./src/main.js')).__TEST;
      const r = T2.prologue.skipRect();
      const b = document.getElementById('game').getBoundingClientRect();
      return { x: b.left + (r.x + r.w / 2) * (b.width / 480),
               y: b.top + (r.y + r.h / 2) * (b.height / 300) }; })()`);
    await p.tap(skCss.x, skCss.y, 1);
    await p.sleep(250);
    const afterSkip = await p.evaluate(`(async () => {
      const T2 = (await import('./src/main.js')).__TEST;
      const btns = [...document.querySelectorAll('#touch button')];
      return { active: T2.prologue.active, skipped: T2.state.prologue && T2.state.prologue.skipped,
        locked: T2.prologue.buttonsLocked, paused: T2.prologue.paused,
        tip: document.getElementById('prologue-tip').hidden,
        allVis: btns.every((b) => getComputedStyle(b).visibility === 'visible') }; })()`);
    ok(afterSkip.active === true && afterSkip.skipped === true,
      '[' + tag + '] the skip did NOT end the phase - skipped mode ("stop explaining")');
    ok(afterSkip.locked === false && afterSkip.allVis && afterSkip.tip === true,
      '[' + tag + '] the FULL control set is live from the skip press');
    await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'i', bubbles: true }))");
    await p.sleep(200);
    ok(await p.evaluate(`(async () => (await import('./src/main.js')).__TEST.state.mode)()`) === 'stats',
      '[' + tag + '] buttons WORK mid-skipped-phase (FIELD REPORT opened)');
    await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
    await p.sleep(150);
    // The potion sequence runs as normal; no banner interrupts it now.
    const drank = await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.prologue.active === false)()`, 12000, 250);
    const afterDrink = await p.evaluate(`(async () => {
      const T2 = (await import('./src/main.js')).__TEST;
      return { invuln: T2.state.player.invuln, shield: T2.state.prologueShieldT,
        time: T2.state.time }; })()`);
    ok(drank, '[' + tag + '] the pilot walked to the potion and drank it after the skip');
    ok(afterDrink.invuln > 40 && afterDrink.shield > 40,
      '[' + tag + '] the effect was granted at the post-skip drink (invuln ' +
      afterDrink.invuln.toFixed(1) + 's, shield ' + afterDrink.shield.toFixed(1) + 's)');
    ok(afterDrink.time > 0, '[' + tag + '] the run clock started at the drink');

    // 6b. The ESCAPE twin, from a fresh live phase: same skipped mode, then
    //     the same run-as-normal ending.
    await p.evaluate(`(async () => {
      const T2 = (await import('./src/main.js')).__TEST;
      T2.getProfile().achievements.totals.runs = 0;
      T2.startRun(); return true; })()`);
    await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.prologue.paused === true)()`, 8000);
    await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
    await p.sleep(250);
    const afterEsc = await p.evaluate(`(async () => {
      const T2 = (await import('./src/main.js')).__TEST;
      return { active: T2.prologue.active, skipped: T2.state.prologue && T2.state.prologue.skipped,
        locked: T2.prologue.buttonsLocked }; })()`);
    ok(afterEsc.active === true && afterEsc.skipped === true && afterEsc.locked === false,
      '[' + tag + '] the Escape twin entered skipped mode too');
    await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.prologue.active === false)()`, 12000);
    ok(await p.evaluate(`(async () => (await import('./src/main.js')).__TEST.state.player.invuln)()`) > 40,
      '[' + tag + '] the Escape-twin phase ended at the drink with the effect granted');

    const errors = p.errors;
    if (errors.length) { console.log('[' + tag + '] PAGE ERRORS: ' + errors.join(' | ').slice(0, 300)); fails++; }
  });
}

await viewport(390, 844, '390x844');
await viewport(320, 568, '320x568');
console.log(fails ? 'FAILURES: ' + fails : 'ALL OK');
process.exit(fails ? 1 : 0);
