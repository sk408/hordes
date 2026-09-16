#!/usr/bin/env node
// HORDES — G31 PILOT PREFERENCE PERSISTENCE verifier (owner-relayed player
// request, 2026-09-16: "The players want the selections they made for auto
// and manual to persist between runs.").
//
// Real Chrome (tools/browser.mjs, CDP touch emulation) at the owner's phone
// form factor — portrait 390x844 @dpr3. Proves the STORAGE path, not just
// in-memory state, by RELOADING the page between legs:
//   A. pre-run: SETUP -> SETTINGS carries a PILOT row; tapping it cycles and
//      persists; the next run starts in the cycled mode;
//   B. mid-run MANUAL + GREEDY stance -> a NEW run starts MANUAL, joystick
//      visible (wantJoy), stance carried;
//   C. RELOAD -> the run STILL starts MANUAL + GREEDY (the storage path);
//   D. cleared storage -> a fresh run starts AUTO_ALL / BALANCED, no joystick.
// Run: node tools/verify_pilot_pref.mjs   (rc=0 verified, rc=1 could not run)
import { withPage } from './browser.mjs';
import { copyFileSync, mkdirSync } from 'node:fs';

const ART = 'docs/art/pilot-pref-2026-09-16';
mkdirSync(ART, { recursive: true });
const T = `(await import('./src/main.js')).__TEST`;
const pngs = [];
const lines = [];

async function shot(p, name) {
  const f = await p.shot(name);
  copyFileSync(f, `${ART}/${name}.png`);
  pngs.push(`${ART}/${name}.png`);
}
const cardRect = (name) => `(() => { const cs = [...document.querySelectorAll('#ov-cards .card')];
  const c = cs.find(x => (x.querySelector('.name') || {}).textContent === ${JSON.stringify(name)});
  if (!c) return null; const r = c.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })()`;
async function tapCard(p, name) {
  await p.waitFor(`${cardRect(name)} != null`, 5000);   // screen must show it first
  const r = await p.evaluate(cardRect(name));
  if (!r) throw new Error('card not found: ' + name);
  await p.tap(r[0] + r[2] / 2, r[1] + r[3] / 2);
  await p.sleep(250);                                  // the screen swap beat
}
const mode = () => `(async () => ${T}.state.pilotMode)()`;
const stance = () => `(async () => ${T}.controller.stance)()`;
const joyShown = () => `(() => { const j = document.getElementById('joy'); return !!j && j.style.display === 'block'; })()`;
async function startRun(p) {
  await p.evaluate(`(async () => { ${T}.state.pendingDrafts = 0; ${T}.startRun(); })()`);
  await p.waitFor(`(async () => ${T}.state.mode === 'playing')()`, 8000);
}
async function skipIntro(p) {
  await p.evaluate("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }))");
  await p.waitFor(`(async () => ${T}.state.mode !== 'intro')()`, 15000);
}

await withPage({ w: 390, h: 844, dpr: 3, mobile: true, skipTour: true,
  startupScript: `try { localStorage.setItem('hordes_onboarded', '1'); } catch (e) {}`,
  timeoutMs: 120000 }, async (p) => {

  // ---- A. the pre-run SETTINGS PILOT row ---------------------------------
  await skipIntro(p);
  await p.waitFor(`(async () => ${T}.state.mode === 'title')()`, 10000);
  // The title reveal owns the screen until it settles — taps before it are
  // eaten (the G30 verifier's idiom).
  await p.waitFor(`(async () => { const rv = ${T}.state.titleReveal; return !rv || rv.phase === 'settled'; })()`, 10000);
  await p.sleep(500);
  await tapCard(p, 'SETUP');
  await tapCard(p, 'SETTINGS');
  await p.waitFor(`(async () => ${T}.state.mode === 'menu')()`, 5000);
  const row = await p.evaluate(cardRect('PILOT'));
  if (!row) throw new Error('no PILOT row in (pre-run) SETTINGS');
  await shot(p, 'settings-pilot-row-prerun');
  await tapCard(p, 'PILOT');                       // AUTO ALL -> AUTO MOVE
  const stored1 = await p.evaluate(`localStorage.getItem('hordes_pilot')`);
  if (stored1 !== 'AUTO_MOVE') throw new Error('PILOT row did not persist AUTO_MOVE (saw ' + stored1 + ')');
  lines.push(`A: pre-run SETTINGS PILOT row tapped -> stored hordes_pilot=${stored1} (AUTO_MOVE)`);
  await tapCard(p, 'BACK');                        // title settings' BACK -> title

  // The next run starts in the PRE-RUN choice.
  await startRun(p);
  const aMode = await p.evaluate(mode());
  if (aMode !== 'AUTO_MOVE') throw new Error('run after pre-run row tap: expected AUTO_MOVE, saw ' + aMode);
  lines.push(`A: the next run starts in the pre-run choice (${aMode})`);

  // ---- B. mid-run MANUAL + GREEDY -> a NEW run keeps them ----------------
  await p.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', bubbles: true }))`);   // ->MANUAL
  await p.waitFor(`(async () => ${T}.state.pilotMode === 'MANUAL')()`, 4000);
  await p.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true }))`);   // stance cycle
  await p.waitFor(`(async () => ${T}.controller.stance === 'GREEDY')()`, 4000);
  // waitFor, not a point check: a level-up draft can hold the screen for its
  // 6s AUTO window (G30) with the joystick parked — it returns with the run.
  if (!(await p.waitFor(joyShown(), 9000))) throw new Error('joystick not shown during a MANUAL run');
  await shot(p, 'manual-run-joystick');
  await startRun(p);                               // a NEW run
  const bMode = await p.evaluate(mode());
  const bStance = await p.evaluate(stance());
  if (bMode !== 'MANUAL') throw new Error('new run after MANUAL: saw ' + bMode);
  if (!(await p.evaluate(joyShown()))) throw new Error('joystick not shown on the persisted-MANUAL run');
  if (bStance !== 'GREEDY') throw new Error('stance did not persist into the new run: ' + bStance);
  lines.push(`B: new run starts ${bMode} (joystick shown), stance ${bStance}`);

  // ---- C. RELOAD: the storage path, not in-memory state -------------------
  await p.evaluate(`(async () => { ${T}.state.pendingDrafts = 0; })()`);
  await p.evaluate('location.reload()');
  await p.sleep(1200);
  await skipIntro(p);
  await p.waitFor(`(async () => ${T}.state.mode === 'title')()`, 15000);
  await startRun(p);
  const cMode = await p.evaluate(mode());
  const cStance = await p.evaluate(stance());
  if (cMode !== 'MANUAL') throw new Error('after RELOAD: saw ' + cMode + ' (storage path broken)');
  if (!(await p.waitFor(joyShown(), 3000))) throw new Error('after RELOAD: joystick not shown');
  if (cStance !== 'GREEDY') throw new Error('after RELOAD: stance ' + cStance);
  await shot(p, 'after-reload-manual-run');
  lines.push(`C: after a full page RELOAD the run starts ${cMode} (joystick shown), stance ${cStance}`);

  // ---- D. cleared storage -> the fresh-player default ----------------------
  await p.evaluate(`localStorage.removeItem('hordes_pilot'); localStorage.removeItem('hordes_stance');`);
  await p.evaluate('location.reload()');
  await p.sleep(1200);
  await skipIntro(p);
  await p.waitFor(`(async () => ${T}.state.mode === 'title')()`, 15000);
  await startRun(p);
  const dMode = await p.evaluate(mode());
  const dStance = await p.evaluate(stance());
  if (dMode !== 'AUTO_ALL') throw new Error('cleared storage: expected AUTO_ALL, saw ' + dMode);
  if (dStance !== 'BALANCED') throw new Error('cleared storage: stance ' + dStance);
  if (await p.evaluate(joyShown())) throw new Error('cleared storage: joystick visible in AUTO_ALL');
  lines.push(`D: cleared storage -> fresh run starts ${dMode}, stance ${dStance}, joystick hidden`);

  if (p.errors.length) throw new Error('page errors: ' + JSON.stringify(p.errors));
});

console.log(lines.join('\n'));
console.log(`PILOT PREF PERSISTENCE VERIFIED | modes observed: pre-run row AUTO_MOVE -> mid-run MANUAL kept -> reload MANUAL -> cleared AUTO_ALL | stance GREEDY round-tripped, BALANCED on clear | pngs: ${pngs.map(x => x.replace(ART + '/', '')).join(', ')}`);
