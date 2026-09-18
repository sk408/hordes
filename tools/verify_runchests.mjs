// RUN-COUNT MILESTONE CHESTS — real-browser shots (resume task): a profile one
// run short of milestone 50 starts its 50th run; the big chest is on the field
// (never despawns), collecting fires the burst then the card. Shots at both sizes.
import { withPage } from '/home/claude/projects/hordes/tools/browser.mjs';
import { copyFileSync, mkdirSync } from 'node:fs';
const ART = '/home/claude/projects/hordes/docs/art/runchests-2026-09-18/shots';
mkdirSync(ART, { recursive: true });
const tx = (expr) => `(async () => { const t = (await import('./src/main.js')).__TEST; return (${expr}); })()`;
const PROFILE = JSON.stringify({ version: 10, gold: 5000, lastPlayed: Date.now(),
  achievements: { totals: { runs: 49, gold: 9800, kills: 0 } }, milestoneChest: 0 });

let fails = 0;
const ok = (n, c) => { console.log((c ? '  ok - ' : '  FAIL - ') + n); if (!c) fails++; };

async function leg(w, h, tag) {
  await withPage({ w, h, dpr: 3, mobile: true,
    startupScript: `try { localStorage.setItem('hordes_onboarded', '1');
      localStorage.setItem('hordes_profile_v1', '${PROFILE}'); } catch (e) {}` },
    async (p) => {
      console.log('[' + tag + '] ' + w + 'x' + h);
      await p.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
      await p.waitFor(tx("t.state.mode !== 'intro'"), 15000);
      await p.sleep(300);
      await p.evaluate(`(() => { const el = [...document.getElementById('ov-cards').children]
        .find(k => (k.textContent || '').toUpperCase().includes('START GAME') && !k.hidden); if (el) el.click(); })()`);
      await p.waitFor(tx("t.state.mode === 'playing'"), 20000);
      await p.sleep(400);
      const chest = await p.evaluate(tx('t.runChests.chest'));
      ok('[' + tag + '] run 50 spawns the milestone chest on the field', !!chest && chest.milestone === 50);
      const vw = await p.evaluate(tx('({ w: innerWidth, h: innerHeight })'));
      ok('[' + tag + '] chest clamped on-screen', chest.x >= 30 && chest.x <= 480 - 30 && chest.y >= 40 && chest.y <= 300 - 40);
      let shotPath = await p.shot('runchest-field-' + w + 'x' + h + '.png');
      copyFileSync(shotPath, ART + '/runchest-field-' + w + 'x' + h + '.png');
      const goldBefore = await p.evaluate(tx('t.getProfile().gold'));
      // no despawn: 1.5s pass; the chest is still up UNLESS the AUTO pilot
      // walked onto it and collected it (the beeline — its own evidence).
      await p.sleep(1500);
      const afterWait = await p.evaluate(tx(`{ chest: !!t.runChests.chest, burst: !!t.runChests.burst,
        mode: t.state.mode, claim: t.getProfile().milestoneChest }`));
      ok('[' + tag + '] 1.5s later: still up OR pilot-collected — never a silent despawn',
        afterWait.chest || afterWait.claim === 50 || afterWait.mode === 'burst' || afterWait.mode === 'chest');
      // collect (if the pilot has not already)
      if (!afterWait.claim || afterWait.claim !== 50) await p.evaluate(tx('t.runChests.collect()'));
      const burst = await p.evaluate(tx('!!t.runChests.burst'));
      ok('[' + tag + '] collection fires the BURST first', burst);
      shotPath = await p.shot('runchest-burst-' + w + 'x' + h + '.png');
      copyFileSync(shotPath, ART + '/runchest-burst-' + w + 'x' + h + '.png');
      await p.waitFor(tx("t.state.mode === 'chest'"), 5000);
      const card = await p.evaluate(`document.getElementById('ov-title') ? document.getElementById('ov-title').textContent : ''`);
      const prof = await p.evaluate(tx('t.getProfile()'));
      console.log('    [' + tag + '] card title: ' + JSON.stringify(card) + ', banked gold: ' + (prof.gold - goldBefore) + ', claim: ' + prof.milestoneChest);
      ok('[' + tag + '] burst expires into the card (RUN 50!)', /RUN 50/.test(String(card)));
      ok('[' + tag + '] the payoff banked 10x lifetime avg (9800/49 -> 200/run -> 2000g)', prof.gold - goldBefore === 2000);
      shotPath = await p.shot('runchest-card-' + w + 'x' + h + '.png');
      copyFileSync(shotPath, ART + '/runchest-card-' + w + 'x' + h + '.png');
      await p.evaluate(tx('t.runChests.closeCard()'));
      const mode = await p.evaluate(tx('t.state.mode'));
      ok('[' + tag + '] GOT IT resumes the run', mode === 'playing');
      ok('[' + tag + '] no console errors' + (p.errors.length ? ' — ' + p.errors.join(' | ') : ''), p.errors.length === 0);
      void vw;
    });
}
await leg(390, 844, 'phone');
await leg(320, 568, 'small');
console.log(fails === 0 ? 'VERIFY RUNCHESTS: ALL PASSED' : 'VERIFY RUNCHESTS: ' + fails + ' FAILURES');
process.exit(fails ? 1 : 0);
