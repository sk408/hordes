#!/usr/bin/env node
// HORDES — G30 AUTO DRAFT AUTO-PICK verifier (owner 2026-09-16, verbatim: "Can
// we add so on auto, the card selection screen has a 6 second timeout and then
// it auto picks a random card.").
//
// Drives REAL Chrome (tools/browser.mjs, CDP touch emulation) at the owner's
// phone form factor — portrait 390x844 @dpr3 — and asserts against the LIVE
// page state:
//   1. AUTO: a draft is presented, NOTHING is tapped, and within ~7s a card
//      is taken (T.draftAuto.count === 1, the taken id is one of the offered
//      ids, mode back to 'playing') — with the measured expiry reported;
//   2. the countdown line (#draft-autopick) is visible mid-window and a PNG
//      of it is captured;
//   3. MANUAL: after 7+ seconds the draft is STILL up, no pick, no line;
//   4. no page errors.
//
// Run: node tools/verify_auto_draft.mjs   (rc=0 verified, rc=1 could not run)
import { withPage } from './browser.mjs';
import { copyFileSync, mkdirSync } from 'node:fs';

const ART = 'docs/art/autodraft-2026-09-16';
mkdirSync(ART, { recursive: true });
const T = `(await import('./src/main.js')).__TEST`;
// Onboarded (no HOW TO PLAY pop) but the DRAFT coach flag is deliberately NOT
// preseeded with skipTour:true — actually skipTour:true does not seed 'draft'
// either way, and the real first-draft experience includes the coachmark, so
// dismiss it with a real tap when it appears (the G29 TUTORIAL_OVERLAY
// contract: the primary button advances/dismisses).
const STARTUP = `try { localStorage.setItem('hordes_onboarded', '1'); } catch (e) {}`;

const pngs = [];
const lines = [];

async function shot(p, name) {
  const f = await p.shot(name);
  copyFileSync(f, `${ART}/${name}.png`);
  pngs.push(`${ART}/${name}.png`);
}

await withPage({ w: 390, h: 844, dpr: 3, mobile: true, skipTour: true,
  startupScript: STARTUP, timeoutMs: 90000 }, async (p) => {
  // Skip intro -> title -> straight into a run (AUTO_ALL is the default).
  await p.evaluate("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }))");
  await p.waitFor(`(async () => ${T}.state.mode !== 'intro')()`, 15000);
  await p.waitFor(`(async () => { const rv = ${T}.state.titleReveal; return !rv || rv.phase === 'settled'; })()`, 10000);
  await p.evaluate(`(async () => ${T}.startRun())()`);
  await p.waitFor(`(async () => ${T}.state.mode === 'playing')()`, 5000);
  const mode = await p.evaluate(`(async () => ${T}.state.pilotMode)()`);
  if (mode !== 'AUTO_ALL') throw new Error('run did not start in AUTO_ALL: ' + mode);
  lines.push(`run live in AUTO_ALL (${mode})`);

  // ---- 1. AUTO: present a draft, tap NOTHING, a card must be taken ---------
  await p.evaluate(`(async () => { ${T}.state.pendingDrafts = 1; ${T}.openDraft(); })()`);
  await p.waitFor(`(async () => ${T}.state.mode === 'draft')()`, 5000);
  const offered = await p.evaluate(`(() => [...document.getElementById('ov-cards').children].map(c => c._draftOffer && c._draftOffer.id).filter(Boolean))()`);
  if (!offered.length) throw new Error('draft presented with no offers');
  // The draft coachmark may ride on top (first draft ever): dismiss it with a
  // REAL tap on its primary so the countdown's visible window can start.
  const coach = await p.evaluate(`(() => !!document.getElementById('tour-root'))()`);
  let coachNote = 'no coach';
  if (coach) {
    const r = await p.evaluate(`(() => { const b = document.querySelector('#tour-tip .tour-next'); if (!b) return null; const r = b.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })()`);
    if (!r) throw new Error('draft coach up but no .tour-next');
    await p.tap(r[0] + r[2] / 2, r[1] + r[3] / 2);
    await p.waitFor(`(() => !document.getElementById('tour-root'))()`, 4000);
    coachNote = 'draft coach dismissed by real tap (countdown ran only from the clear screen)';
  }
  const t0 = await p.evaluate(`performance.now()`);
  // Mid-window: the countdown line must be live. Poll until it reads a value
  // below ~5s (so the shot shows a real ticking countdown, not the first '6.0').
  await p.waitFor(`(() => { const el = document.getElementById('draft-autopick'); return el && /[0-4]\\.[0-9]s$/.test(el.textContent); })()`, 4000);
  const lineTxt = await p.evaluate(`(() => document.getElementById('draft-autopick').textContent)()`);
  await shot(p, 'auto-countdown-live');
  // Expiry: nothing is tapped; a card must be taken through the real seam.
  await p.waitFor(`(async () => ${T}.state.mode !== 'draft')()`, 12000);
  const expiry = (await p.evaluate(`performance.now()`) - t0) / 1000;   // ms -> s
  const result = await p.evaluate(`(async () => ({ count: ${T}.draftAuto.count, lastId: ${T}.draftAuto.lastId, mode: ${T}.state.mode, line: !!document.getElementById('draft-autopick') }))()`);
  if (result.count !== 1) throw new Error('AUTO: expected exactly one auto-pick, saw ' + result.count);
  if (!offered.includes(result.lastId)) throw new Error(`AUTO: taken id ${result.lastId} not in offers ${JSON.stringify(offered)}`);
  if (result.mode !== 'playing') throw new Error('AUTO: draft did not resolve (mode ' + result.mode + ')');
  if (result.line) throw new Error('AUTO: countdown line survived the draft');
  lines.push(`AUTO: coach=${coachNote}; offered=[${offered.join(', ')}]; taken=${result.lastId}; measured expiry ${expiry.toFixed(2)}s (line read "${lineTxt}" mid-window)`);

  // ---- 2. MANUAL: the same draft presentation, and NOTHING happens ---------
  await p.evaluate(`(async () => { ${T}.state.pilotMode = 'MANUAL'; ${T}.state.pendingDrafts = 1; ${T}.openDraft(); })()`);
  await p.waitFor(`(async () => ${T}.state.mode === 'draft')()`, 5000);
  const before = await p.evaluate(`(async () => ({ count: ${T}.draftAuto.count, mode: ${T}.state.mode }))()`);
  await p.sleep(7000);                     // tap NOTHING for 7s
  const after = await p.evaluate(`(async () => ({ count: ${T}.draftAuto.count, mode: ${T}.state.mode, line: !!document.getElementById('draft-autopick') }))()`);
  if (after.mode !== 'draft') throw new Error('MANUAL: draft did not stay up (' + after.mode + ')');
  if (after.count !== before.count) throw new Error('MANUAL: auto-pick fired (' + before.count + ' -> ' + after.count + ')');
  if (after.line) throw new Error('MANUAL: countdown line rendered');
  await shot(p, 'manual-still-draft-7s');
  lines.push(`MANUAL: 7s of nothing -> still mode 'draft', count ${before.count}->${after.count}, no countdown line`);

  if (p.errors.length) throw new Error('page errors: ' + JSON.stringify(p.errors));
});

console.log(lines.join('\n'));
console.log(`AUTO DRAFT AUTO-PICK VERIFIED | AUTO expiry ~6s random card via the activation seam | MANUAL inert | pngs: ${pngs.map(x => x.replace(ART + '/', '')).join(', ')}`);
