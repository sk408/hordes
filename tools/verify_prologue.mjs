// FIRST-RUN PROLOGUE (owner 2026-09-18): "a potion seen on screen and the
// pilot walks towards it... no enemies spawn and the timer hasn't started...
// dismissible (with an ok button) banners explaining some of the basics."
//
// Photographs the prologue at both phone sizes on a REAL fresh profile (no
// runs=1 neutralization stamp — unlike verify_blocking_elevation.mjs, the
// prologue is the subject here): the potion + a banner up in the inert world,
// the live field seeded with on-screen + off-screen walkers, the rainbow
// shield after the drink, and the SAME field after the clear (on-screen gone,
// off-screen alive). Also drives the banner OK button through a real finger
// tap (the pointer funnel's hit-region, not the __TEST seam).
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
    //     during this initial period"): the REAL DOM state — greyed +
    //     pointer-inert — and the REAL keydown funnel swallows everything.
    const lock = await p.evaluate(`(() => {
      const btn = document.getElementById('tc-cog');
      const cs = btn ? getComputedStyle(btn) : null;
      return { locked: document.body.classList.contains('prologue-locked'),
        pe: cs ? cs.pointerEvents : 'n/a', op: cs ? cs.opacity : 'n/a' }; })()`);
    ok(lock.locked, '[' + tag + '] body.prologue-locked is ON through the phase');
    ok(lock.pe === 'none',
      '[' + tag + '] the touch buttons are pointer-inert (pointer-events: ' + lock.pe + ')');
    ok(isFinite(parseFloat(lock.op)) && parseFloat(lock.op) <= 0.4,
      '[' + tag + '] the touch buttons are SHOWN BUT GREYED (opacity ' + lock.op + ')');
    await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'i', bubbles: true }))");
    await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
    await p.sleep(150);
    const modeMid = await p.evaluate(`(async () => (await import('./src/main.js')).__TEST.state.mode)()`);
    ok(modeMid === 'playing',
      '[' + tag + '] keys are inert through the phase (I/ESC did nothing; mode ' + modeMid + ')');

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
    ok(true, '[' + tag + '] seeded field shot (3 on-screen walkers + the potion)');

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

    // 4b. THE LIFT: the lock drops at phase end with the obvious difference
    //     (grey -> full opacity), and the very keys that were inert now act.
    const lock2 = await p.evaluate(`(() => ({
      locked: document.body.classList.contains('prologue-locked'),
      op: getComputedStyle(document.getElementById('tc-cog')).opacity }))()`);
    ok(lock2.locked === false && parseFloat(lock2.op) > 0.9,
      '[' + tag + '] the lock lifted at phase end (buttons visibly live again, opacity ' + lock2.op + ')');
    await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'i', bubbles: true }))");
    await p.sleep(150);
    const modeAfter = await p.evaluate(`(async () => (await import('./src/main.js')).__TEST.state.mode)()`);
    ok(modeAfter === 'stats',
      '[' + tag + '] buttons WORK again after the phase (I opened the FIELD REPORT)');
    await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
    await p.sleep(150);

    // 5. THE RAINBOW + THE CLEARED FIELD: same camera, the ring around the
    //    pilot, the near field empty.
    await p.sleep(700);
    const shotRainbow = await p.shot('prologue-rainbow-' + tag);
    copyFileSync(shotRainbow, ART + '/prologue-rainbow-' + tag + '.png');
    ok(true, '[' + tag + '] rainbow + cleared field shot');

    const errors = p.errors;
    if (errors.length) { console.log('[' + tag + '] PAGE ERRORS: ' + errors.join(' | ').slice(0, 300)); fails++; }
  });
}

await viewport(390, 844, '390x844');
await viewport(320, 568, '320x568');
console.log(fails ? 'FAILURES: ' + fails : 'ALL OK');
process.exit(fails ? 1 : 0);
