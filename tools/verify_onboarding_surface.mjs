// ONBOARDING SURFACE + REPLAY TOUR — REAL-BROWSER ACCEPTANCE (owner 2026-09-18).
//
// The onboarding-surface brief (tooltips/tour) plus its addenda, and the
// TUTORIAL REMAINDER's replay leg, verified in a real browser at phone size:
//
//   LEG A (390x844 + 320x568, FRESH profile, kill switch UNTOUCHED):
//     the AUTOMATIC prologue path stays parked (C.PROLOGUE.ENABLED is false
//     in the shipped config — a fresh run #1 opens an ordinary run), and no
//     hint-strip element ever mounts during live play (the in-run tour layer
//     is RETIRED — a tutorial belongs before gameplay).
//   LEG B (390x844, RETURNING profile): the manual's REPLAY TOUR card is the
//     deliberate path back in — clicking it STARTS THE SPECIAL LEVEL right
//     there (inert world, frozen clock, potion on screen, ASSISTED stamp)
//     even though the automatic gate is off. The SKIP corner is TWO-TAP:
//     one tap arms (TAP AGAIN?), the arm expires on its own, two taps skip
//     ("stop explaining" — the potion sequence still runs to its drink).
//   LEG C (390x844): the kept coach cards FORM IN PLACE — the settings
//     coachmark's first visible frame already carries its final rect (no
//     slide-in, no repositioning; the 120ms tracker only watches for the
//     target vanishing), and no CSS transition/animation is involved.
//
// Run: node tools/verify_onboarding_surface.mjs
import { withPage } from './browser.mjs';
import { copyFileSync, mkdirSync } from 'node:fs';

const ART = '/home/claude/projects/hordes/docs/art/onboarding-2026-09-18/shots';
mkdirSync(ART, { recursive: true });

let fails = 0;
function ok(cond, label) {
  console.log((cond ? '  ok - ' : '  FAIL - ') + label);
  if (!cond) fails++;
}

const tx = (expr) => `(async () => { const t = (await import('./src/main.js')).__TEST; return (${expr}); })()`;

async function clickCard(p, text) {
  await p.evaluate(`(() => {
    const el = [...document.getElementById('ov-cards').children]
      .find(k => (k.textContent || '').toUpperCase().includes(${JSON.stringify(text)}) && !k.hidden);
    if (el) el.click(); })()`);
}

// LEG A — fresh profile, gate untouched: no automatic prologue, no hint layer.
async function legA(w, h, tag) {
  await withPage({ w, h, dpr: 3, mobile: true, skipPrologue: false, skipTour: false,
    startupScript: `try { localStorage.clear(); } catch (e) {}` },
  async (p) => {
    await p.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
    await p.waitFor(tx("t.state.mode !== 'intro'"), 15000);
    await p.sleep(300);
    // The shipped default: the kill switch is OFF and nothing flips it here.
    const flag = await p.evaluate(`(async () => (await import('./src/config.js')).CONFIG.PROLOGUE.ENABLED)()`);
    ok(flag === false, '[' + tag + '] the shipped kill switch reads OFF (the automatic path stays parked)');
    await clickCard(p, 'START GAME');
    await p.sleep(300);
    await clickCard(p, 'GOT IT');
    await p.waitFor(tx("t.state.mode === 'playing'"), 20000);
    const t0 = await p.evaluate(tx('t'));
    ok(t0.prologue.active === false && t0.state.assistedRun === false,
      '[' + tag + '] fresh run #1 is an ORDINARY run (no prologue, not assisted — the gate holds)');
    // ~8s of live AUTO play, sampling for the retired layer every 200ms.
    let stripSeen = 0;
    for (let i = 0; i < 40; i++) {
      stripSeen += await p.evaluate(`document.querySelectorAll('#hint-strip').length`);
      await p.sleep(200);
    }
    ok(stripSeen === 0, '[' + tag + '] RETIREMENT: no #hint-strip mounts across ~8s of live play');
    ok(await p.evaluate(tx('t.state.time > 1.0')), '[' + tag + '] the run is live and advancing (not paused)');
    const shot = await p.shot('onboarding-nohints-' + tag);
    copyFileSync(shot, ART + '/onboarding-nohints-' + tag + '.png');
    ok(true, '[' + tag + '] shot: live run, no tooltip layer (controls uncovered)');
    const errors = p.errors;
    if (errors.length) { console.log('[' + tag + '] PAGE ERRORS: ' + errors.join(' | ').slice(0, 300)); fails++; }
  });
}

// LEG B — the deliberate replay: the special level from the manual's card.
async function legB() {
  const tag = '390x844-replay';
  await withPage({ w: 390, h: 844, dpr: 3, mobile: true },   // skipPrologue seeds runs=1 (returning player)
  async (p) => {
    await p.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
    await p.waitFor(tx("t.state.mode !== 'intro'"), 15000);
    await p.sleep(300);
    // Title -> HOW TO PLAY -> REPLAY TOUR (the deliberate opt-in).
    await clickCard(p, 'HOW TO PLAY');
    await p.sleep(300);
    const manualUp = await p.evaluate(`(() => {
      const t = document.getElementById('ov-title');
      return t && /HOW TO PLAY/.test(t.textContent || ''); })()`);
    ok(manualUp, '[' + tag + '] the manual opened from the title');
    const replayThere = await p.evaluate(`(() => {
      return [...document.getElementById('ov-cards').children]
        .some(k => (k.textContent || '').toUpperCase().includes('REPLAY TOUR')); })()`);
    ok(replayThere, '[' + tag + '] the REPLAY TOUR card is present for a returning player');
    await clickCard(p, 'REPLAY TOUR');
    await p.waitFor(tx("t.state.mode === 'playing'"), 20000);
    const t0 = await p.evaluate(tx('t'));
    ok(t0.prologue.active === true,
      '[' + tag + '] REPLAY TOUR starts THE SPECIAL LEVEL (the inert prologue run), not just flags');
    ok(t0.state.assistedRun === true, '[' + tag + '] the replayed run is flagged ASSISTED');
    ok(t0.state.time === 0 && t0.state.enemies.length === 0,
      '[' + tag + '] the replayed level is INERT (clock 0, no spawns)');
    ok(t0.prologue.potion && t0.prologue.potion.x >= 0 && t0.prologue.potion.x <= 480,
      '[' + tag + '] the potion exists on screen (the assist survives the replay)');
    const shotPro = await p.shot('onboarding-replay-prologue-' + tag);
    copyFileSync(shotPro, ART + '/onboarding-replay-prologue-' + tag + '.png');
    ok(true, '[' + tag + '] shot: the replayed special level (banner, potion, SKIP corner)');

    // THE TWO-TAP SKIP: one tap arms, nothing skips.
    const skCss = await p.evaluate(`(async () => {
      const T2 = (await import('./src/main.js')).__TEST;
      const r = T2.prologue.skipRect();
      const b = document.getElementById('game').getBoundingClientRect();
      return { x: b.left + (r.x + r.w / 2) * (b.width / 480),
               y: b.top + (r.y + r.h / 2) * (b.height / 300) }; })()`);
    await p.tap(skCss.x, skCss.y, 1);
    await p.sleep(250);
    const armed = await p.evaluate(tx('t'));
    ok(armed.state.prologue && armed.state.prologue.skipped === false && armed.state.prologue.skipArmT > 0,
      '[' + tag + '] ONE tap on SKIP only ARMS it (skipped=false, arm window open)');
    const shotArm = await p.shot('onboarding-skip-armed-' + tag);
    copyFileSync(shotArm, ART + '/onboarding-skip-armed-' + tag + '.png');
    ok(true, '[' + tag + '] shot: the armed SKIP reads TAP AGAIN?');
    // A normal play press cannot trip it: steer the field mid-arm — no skip.
    const cv = await p.evaluate(`(() => { const b = document.getElementById('game').getBoundingClientRect();
      return [b.left + b.width * 0.4, b.top + b.height * 0.6]; })()`);
    await p.tap(cv[0], cv[1], 1);
    await p.sleep(2600);   // let the arm window (2s) expire
    const decayed = await p.evaluate(tx('t'));
    ok(decayed.state.prologue && decayed.state.prologue.skipped === false && !(decayed.state.prologue.skipArmT > 0),
      '[' + tag + '] a steering tap did NOT skip, and the arm expired on its own');
    // Two taps inside the window: the deliberate skip.
    await p.tap(skCss.x, skCss.y, 1);
    await p.sleep(150);
    await p.tap(skCss.x, skCss.y, 1);
    await p.sleep(300);
    const skipped = await p.evaluate(tx('t'));
    ok(skipped.state.prologue && skipped.state.prologue.skipped === true,
      '[' + tag + '] TWO taps inside the window skip (stop explaining)');
    ok(skipped.prologue.buttonsLocked === false,
      '[' + tag + '] the skip restores the FULL control set at the press');
    // The potion sequence still runs to its drink (the owner's ruling).
    const drank = await p.waitFor(tx('t.prologue.active === false'), 20000, 250);
    ok(drank, '[' + tag + '] the potion sequence ran on after the skip');
    const afterDrink = await p.evaluate(tx('t'));
    ok(afterDrink.state.player.invuln > 40,
      '[' + tag + '] the 45s shield was granted at the post-skip drink (invuln ' +
      afterDrink.state.player.invuln.toFixed(1) + 's)');
    const shotShield = await p.shot('onboarding-replay-shield-' + tag);
    copyFileSync(shotShield, ART + '/onboarding-replay-shield-' + tag + '.png');
    ok(true, '[' + tag + '] shot: the rainbow shield on the live run');
    const stripAfter = await p.evaluate(`document.querySelectorAll('#hint-strip').length`);
    ok(stripAfter === 0, '[' + tag + '] no hint strip after the phase either (nothing resumes)');
    const errors = p.errors;
    if (errors.length) { console.log('[' + tag + '] PAGE ERRORS: ' + errors.join(' | ').slice(0, 300)); fails++; }
  });
}

// LEG C — the coach mark FORMS IN PLACE (first visible frame = final rect).
async function legC() {
  const tag = '390x844-coach';
  await withPage({ w: 390, h: 844, dpr: 3, mobile: true },   // hordes_tour_settings unset: the cog coach fires
  async (p) => {
    await p.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
    await p.waitFor(tx("t.state.mode !== 'intro'"), 15000);
    await p.sleep(300);
    await clickCard(p, 'START GAME');
    await p.sleep(300);
    await clickCard(p, 'GOT IT');   // the fresh-profile gate, if it opened
    await p.waitFor(tx("t.state.mode === 'playing'"), 20000);
    // First in-run pause opens SETTINGS with the coach mark on the END RUN
    // card. The REAL keyboard path (ESC opens the in-run settings) — the
    // touch buttons listen on pointerdown, which a synthetic DOM click()
    // does not fire.
    await p.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
    const coachUp = await p.waitFor(`(() => !!document.getElementById('tour-tip'))()`, 5000);
    ok(coachUp, '[' + tag + '] the settings coach mark fired on the first in-run settings visit');
    if (!coachUp) { fails++; return; }
    const first = await p.evaluate(`(() => {
      const el = document.getElementById('tour-tip');
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return { left: r.left, top: r.top, w: r.width, h: r.height,
        transition: cs.transitionDuration, animation: cs.animationName }; })()`);
    await p.sleep(700);   // the old 120ms tracker would have re-placed by now
    const settled = await p.evaluate(`(() => {
      const r = document.getElementById('tour-tip').getBoundingClientRect();
      return { left: r.left, top: r.top, w: r.width, h: r.height }; })()`);
    ok(first.left === settled.left && first.top === settled.top &&
       first.w === settled.w && first.h === settled.h,
      '[' + tag + '] FORM IN PLACE: the mark\'s first visible rect IS the settled rect (' +
      JSON.stringify(first) + ' vs ' + JSON.stringify(settled) + ')');
    ok((first.transition === '0s' || first.transition === '') &&
       (first.animation === 'none' || first.animation === ''),
      '[' + tag + '] no CSS transition/animation on the mark (nothing to slide)');
    const shot = await p.shot('onboarding-coach-' + tag);
    copyFileSync(shot, ART + '/onboarding-coach-' + tag + '.png');
    ok(true, '[' + tag + '] shot: the settings coach mark in place');
    const errors = p.errors;
    if (errors.length) { console.log('[' + tag + '] PAGE ERRORS: ' + errors.join(' | ').slice(0, 300)); fails++; }
  });
}

await legA(390, 844, '390x844');
await legA(320, 568, '320x568');
await legB();
await legC();
console.log(fails ? 'FAILURES: ' + fails : 'verify_onboarding_surface: ALL CHECKS PASSED');
process.exit(fails ? 1 : 0);
