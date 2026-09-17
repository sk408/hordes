// CONDENSE IMPLEMENT AFTER-SHOTS (task msg_01M2RJZF, 2026-09-17): photographs
// the NOW-LIVE condensed title + settings screens at both phone sizes, next
// to the BEFORE (current-*) and PROPOSED (proposed-*) shots the same folder
// already carries. No injection — these are the real screens the shipped
// showTitle/showSettings render after the condense. Also asserts the counts
// the task pins: title 7 (D4 keeps CHARACTERS), settings 6 in both contexts.
// Run: node tools/verify_condense_after.mjs
import { withPage } from './browser.mjs';
import { copyFileSync } from 'node:fs';

const ART = '/home/claude/projects/hordes/docs/art/condense-trim-2026-09-17/shots';

let fails = 0;
function ok(cond, label) {
  console.log((cond ? '  ok - ' : '  FAIL - ') + label);
  if (!cond) fails++;
}

async function viewport(w, h, tag) {
  await withPage({ w, h, dpr: 3, mobile: true,
    startupScript: "try { localStorage.setItem('hordes_onboarded', '1'); } catch (e) {}" },
  async (p) => {
    await p.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
    await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode !== 'intro')()`, 15000);
    await p.sleep(400);

    const clickCard = (label2) => p.evaluate(`(() => {
      const el = [...document.getElementById('ov-cards').children]
        .find(k => (k.textContent || '').toUpperCase().includes(${JSON.stringify(label2)}));
      if (!el) return false; el.click(); return true; })()`);
    const count = () => p.evaluate(`document.querySelectorAll('#ov-cards .card').length`);
    const titles = () => p.evaluate(`[...document.getElementById('ov-cards').children]
      .map(k => (k.querySelector('.name') || {}).textContent || '')`);

    // ---- AFTER title (the live seven-card screen).
    let shot = await p.shot('after-title-' + tag);
    copyFileSync(shot, ART + '/after-title-' + tag + '.png');
    const afterTitle = await count();
    const titleNames = await titles();
    ok(afterTitle === 7, '[' + tag + '] the live title is SEVEN cards (D4 keeps CHARACTERS): ' + afterTitle);
    ok(titleNames[titleNames.length - 1] === 'HOW TO PLAY', '[' + tag + '] HOW TO PLAY is last');
    ok(!titleNames.includes('EXIT GAME') && !titleNames.includes('LOAD FROM DISK'),
      '[' + tag + '] D3/M5 removals hold on the live screen');

    // ---- AFTER settings, title context.
    ok(await clickCard('SETUP'), '[' + tag + '] SETUP opened');
    await p.sleep(150);
    ok(await clickCard('SETTINGS'), '[' + tag + '] SETTINGS opened');
    await p.sleep(150);
    shot = await p.shot('after-settings-' + tag);
    copyFileSync(shot, ART + '/after-settings-' + tag + '.png');
    const afterSettings = await count();
    const setNames = await titles();
    ok(afterSettings === 6, '[' + tag + '] the live title settings is SIX cards: ' + afterSettings);
    ok(setNames.includes('SAVE DATA') && setNames.includes('AUDIO') && setNames.includes('DISPLAY'),
      '[' + tag + '] the three doors are present');

    // ---- AFTER settings, in-run context (END RUN instead of SAVE DATA).
    await p.evaluate(`(async () => { const T2 = (await import('./src/main.js')).__TEST; T2.showTitle(); })()`);
    await p.sleep(150);
    ok(await clickCard('START GAME'), '[' + tag + '] START GAME pressed');
    // The fresh gate (if any) resolves through GOT IT; then hold -> run.
    await p.waitFor(`(async () => (await import('./src/main.js')).__TEST.state.mode === 'playing')()`, 20000);
    await p.sleep(300);
    await p.evaluate(`(async () => { const T2 = (await import('./src/main.js')).__TEST; T2.openSettings(); })()`);
    await p.sleep(200);
    shot = await p.shot('after-settings-run-' + tag);
    copyFileSync(shot, ART + '/after-settings-run-' + tag + '.png');
    const runNames = await titles();
    ok(runNames.length === 6, '[' + tag + '] the live in-run settings is SIX cards: ' + runNames.length);
    ok(runNames.includes('END RUN') && !runNames.includes('SAVE DATA'),
      '[' + tag + '] E1: END RUN in-run, SAVE DATA title-only');
    ok(!runNames.some(n => n.includes('TEST: ESCAPE')),
      '[' + tag + '] D1: the escape test card is off the surface without the debug flag');

    const errors = p.errors;
    if (errors.length) { console.log('[' + tag + '] PAGE ERRORS: ' + errors.join(' | ').slice(0, 300)); fails++; }
  });
}

await viewport(390, 844, '390x844');
await viewport(320, 568, '320x568');
console.log(fails ? 'VERIFY FAILED: ' + fails : 'verify_condense_after: ALL AFTER-SHOTS CAPTURED (both viewports)');
process.exit(fails ? 1 : 0);
