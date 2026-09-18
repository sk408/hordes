// THE WHEEL IS YOURS — REAL-BROWSER ACCEPTANCE (owner 2026-09-18: the steering
// copy promised "drag the field or press a move key to take the wheel", which
// was false — a move key under AUTO did nothing, and desktop users saw the
// touch-only drag instruction). With the takeover feature landed this measures,
// in a REAL browser at a desktop viewport AND a touch-emulating context:
//
//   (a) COPY: the prologue's WHO FLIES? banner body picks its variant by the
//       live touch path — desktop quotes "Press a move key to take the
//       wheel" and never the drag line; touch quotes "Drag the field to take
//       the wheel" and never the key line. (Variant source: isTouchPath(),
//       src/main.js ~5461 — reads #touch class 'on', set at boot from
//       hasTouch = ontouchstart || maxTouchPoints>0 || pointer:coarse.
//       Plain desktop reports false — the original bug was a STATIC body
//       string carrying both instructions, not the detector.)
//   (b) KEY TAKEOVER: in a live run under AUTO_ALL, a real 'a' keydown hands
//       control over — state.pilotMode flips to MANUAL and the PILOT badge
//       (#tc-pilot, updateTouchHud's published readout) reflects the switch.
//       Same from AUTO_MOVE. The way back: one 'o' press returns to AUTO_ALL
//       and the badge reflects it.
//   (c) TOUCH TAKEOVER: at 390x844 with touch emulation, a REAL swipe on the
//       field while AUTO does the same — MANUAL, badge reflects.
//   (d) no console errors in any arm. Shots at both contexts.
//
// Run: node tools/verify_takeover.mjs
import { withPage } from './browser.mjs';
import { copyFileSync, mkdirSync } from 'node:fs';

const ART = '/home/claude/projects/hordes/docs/art/takeover-2026-09-18/shots';
mkdirSync(ART, { recursive: true });

let fails = 0;
function ok(name, cond) {
  console.log((cond ? '  ok - ' : '  FAIL - ') + name);
  if (!cond) fails++;
}

const tx = (expr) => `(async () => { const t = (await import('./src/main.js')).__TEST; return (${expr}); })()`;

async function clickCard(p, text) {
  await p.evaluate(`(() => {
    const el = [...document.getElementById('ov-cards').children]
      .find(k => (k.textContent || '').toUpperCase().includes(${JSON.stringify(text)}) && !k.hidden);
    if (el) el.click(); })()`);
}

async function startRun(p) {
  await p.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await p.waitFor(tx("t.state.mode !== 'intro'"), 15000);
  await p.sleep(300);
  await clickCard(p, 'START GAME');
  // (the first-run gate would flip the run to the manual — the onboarded
  // seed above keeps it closed, but pin both conditions anyway)
  await p.waitFor(tx("t.state.mode === 'playing' && t.state.manualPage === null"), 20000);
  await p.sleep(300);
}

// The key press and the mode; the BADGE is read one frame later —
// updateTouchHud rides the run loop, so a same-tick read is always stale.
const keyProbe = (key) => tx(`(() => {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, bubbles: true }));
  window.dispatchEvent(new KeyboardEvent('keyup', { key: ${JSON.stringify(key)}, bubbles: true }));
  return t.state.pilotMode; })()`);
const badgeRead = () => tx(`document.getElementById('tc-pilot') ? document.getElementById('tc-pilot').textContent : null`);

async function arm(w, h, dpr, mobile, tag, artName) {
  await withPage({ w, h, dpr, mobile,
    startupScript: "try { localStorage.setItem('hordes_onboarded', '1'); } catch (e) {}" },
    async (p) => {
    console.log('[' + tag + '] ' + w + 'x' + h + (mobile ? ' (touch emulation)' : ' (desktop)'));

    await startRun(p);

    // (a) COPY — the banner body at THIS context, through the real getter.
    const body = await p.evaluate(tx('t.prologue.banners[0].body'));
    const touchPath = await p.evaluate(tx('!!document.getElementById("touch") && document.getElementById("touch").classList.contains("on")'));
    console.log('    [' + tag + '] touch layer .on = ' + touchPath);
    console.log('    [' + tag + '] banner body: "' + body + '"');
    if (mobile) {
      ok('[' + tag + '] copy: the DRAG takes the wheel (touch wording)', /drag the field to take the wheel/i.test(body));
      ok('[' + tag + '] copy: NO key instruction on touch', !/move key/i.test(body));
    } else {
      ok('[' + tag + '] copy: a MOVE KEY takes the wheel (desktop wording)', /press a move key to take the wheel/i.test(body));
      ok('[' + tag + '] copy: NO drag instruction on desktop — the bug the owner hit', !/drag/i.test(body));
      ok('[' + tag + '] copy: the touch layer is NOT on (plain desktop reports false)', !touchPath);
    }

    // (b/c) TAKEOVER — from every AUTO rung.
    for (const rung of ['AUTO_ALL', 'AUTO_MOVE']) {
      await p.evaluate(tx(`t.setPilotMode(${JSON.stringify(rung)})`));
      let after, badge;
      if (mobile) {
        // a REAL finger drag through the browser's own touch pipeline
        const cx = Math.round(w / 2), cy = Math.round(h / 2);
        await p.swipe(cx, cy, -60, -40, 8);
        await p.sleep(150);
        after = await p.evaluate(tx('t.state.pilotMode'));
      } else {
        after = await p.evaluate(keyProbe('a'));
      }
      await p.sleep(150);   // a frame for updateTouchHud to publish the badge
      badge = await p.evaluate(badgeRead());
      console.log('    [' + tag + '] ' + rung + ' -> ' + after + ' (badge: ' + JSON.stringify(badge) + ')');
      ok('[' + tag + '] ' + (mobile ? 'a DRAG' : 'a MOVE KEY') + ' takes the wheel from ' + rung, after === 'MANUAL');
      ok('[' + tag + '] the PILOT badge reflects the switch to MANUAL', !!badge && /MANUAL/.test(String(badge)));
    }

    // The way back — one O press returns to AUTO_ALL, badge follows.
    const backMode = await p.evaluate(keyProbe('o'));
    await p.sleep(150);
    const backBadge = await p.evaluate(badgeRead());
    ok('[' + tag + '] the way back: one O press returns to AUTO_ALL (got ' + backMode + ')', backMode === 'AUTO_ALL');
    ok('[' + tag + '] the PILOT badge reflects AUTO_ALL', !!backBadge && /AUTO_ALL/.test(String(backBadge)));

    const shotPath = await p.shot(artName + '-' + w + 'x' + h + '.png');
    copyFileSync(shotPath, ART + '/' + artName + '-' + w + 'x' + h + '.png');
    ok('[' + tag + '] no console errors' + (p.errors.length ? ' — ' + p.errors.join(' | ') : ''), p.errors.length === 0);
  });
}

await arm(1280, 720, 1, false, 'desktop', 'takeover-desktop');
await arm(390, 844, 3, true, 'touch', 'takeover-touch');

console.log(fails === 0 ? 'VERIFY TAKEOVER: ALL PASSED' : 'VERIFY TAKEOVER: ' + fails + ' FAILURES');
process.exit(fails === 0 ? 0 : 1);
