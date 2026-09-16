#!/usr/bin/env node
// HORDES — TUTORIAL_OVERLAY verifier (2026-09-16 owner-relayed player
// feedback: "the popups go away too easily when they try to push other
// things").
//
// Drives REAL taps in real Chrome (tools/browser.mjs, CDP touch emulation):
//   - portrait 390x844 @dpr3 (the owner's phone form factor)
//   - landscape 844x390 @dpr2
// and asserts against the LIVE page:
//   1. a REAL tap on the shade (outside the card, off every menu card so the
//      WAVE-31 pass-through cannot fire) is INERT — the tour stays up on the
//      same step;
//   2. NEXT advances (counter increments), BACK returns (counter decrements);
//   3. every button (.tour-back / .tour-next) is >= 44px on BOTH axes and
//      FULLY inside the viewport (no chrome off-screen) — the mobile rule:
//      overlap is the acceptable failure mode, never an unusable control;
//   4. the final step's primary reads GOT IT, carries the replay note, and a
//      REAL tap on it completes the tour (root unmounts, stage1 flag set);
//   5. REPLAY TOUR (SETUP -> SETTINGS -> REPLAY TOUR) clears the flags and
//      RE-ARMS the tour through the real menu path;
//   6. Escape (dispatched at document, where the tour listens) still skips.
// PNGs of a multi-step card are captured at every asserted moment.
//
// Run: node tools/verify_tour_overlay.mjs   (rc=0 verified, rc=1 could not run)
import { withPage } from './browser.mjs';
import { copyFileSync, mkdirSync } from 'node:fs';
import { TOUR_KEYS } from '../src/tour.js';

const ART = 'docs/art/tutorial-overlay-2026-09-16';
mkdirSync(ART, { recursive: true });
const T = `(await import('./src/main.js')).__TEST`;

// The tour stays ARMED (skipTour:false) but HOW TO PLAY must not auto-pop
// over the title — the onboarding flag only.
const STARTUP = `try { localStorage.setItem('hordes_onboarded', '1'); } catch (e) {}`;

const tourActive = `(() => { const r = document.getElementById('tour-root'); return !!(r && r.isConnected); })()`;
const readCard = `(() => {
  const tip = document.getElementById('tour-tip');
  if (!tip) return null;
  const num = tip.querySelector('.tour-count');
  const back = tip.querySelector('.tour-back'), next = tip.querySelector('.tour-next');
  const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect();
    return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
  return {
    counter: num ? num.textContent.trim() : null,
    back: back ? { label: back.textContent.trim(), rect: rect(back) } : null,
    next: next ? { label: next.textContent.trim(), rect: rect(next) } : null,
    replayNote: !!tip.querySelector('.tour-replay'),
    tipRect: rect(tip),
  };
})()`;
const center = (r) => [Math.round(r.x + r.w / 2), Math.round(r.y + r.h / 2)];
// A REAL tap point on the shade: outside the tip card AND with NO menu card
// under it (elementsFromPoint) so the WAVE-31 pass-through cannot fire there.
const shadePoint = `(() => {
  const tip = document.getElementById('tour-tip');
  const tr = tip ? tip.getBoundingClientRect() : null;
  const cands = [[20, 20], [innerWidth - 20, 20], [20, innerHeight - 20],
                 [innerWidth - 20, innerHeight - 20], [Math.round(innerWidth / 2), 12]];
  for (const [x, y] of cands) {
    if (tr && x >= tr.left - 6 && x <= tr.right + 6 && y >= tr.top - 6 && y <= tr.bottom + 6) continue;
    let stack = [];
    try { stack = document.elementsFromPoint(x, y) || []; } catch (e) {}
    if (stack.some(el => el && el.closest && el.closest('#ov-cards > .card'))) continue;
    return [x, y];
  }
  return null;
})()`;

function assertButtonsOnScreen(card, vw, vh, where) {
  const bad = [];
  for (const b of [card.back, card.next].filter(Boolean)) {
    if (b.rect.w < 44 || b.rect.h < 44) bad.push(`${b.label} ${b.rect.w}x${b.rect.h} < 44px`);
    if (b.rect.x < 0 || b.rect.y < 0 || b.rect.x + b.rect.w > vw + 0.5 || b.rect.y + b.rect.h > vh + 0.5)
      bad.push(`${b.label} off-viewport (${b.rect.x},${b.rect.y},${b.rect.w}x${b.rect.h} in ${vw}x${vh})`);
  }
  if (bad.length) throw new Error(`${where}: button contract broken — ${bad.join('; ')}`);
}

async function shot(p, name) {
  const f = await p.shot(name);
  copyFileSync(f, `${ART}/${name}.png`);
  return `${ART}/${name}.png`;
}
async function tapControl(p, which, where) {
  const r = await p.evaluate(`(() => { const b = document.querySelector('#tour-tip .${'tour-' + which}'); if (!b) return null; const r = b.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })()`);
  if (!r) throw new Error(`${where}: .tour-${which} missing`);
  const [x, y] = center({ x: r[0], y: r[1], w: r[2], h: r[3] });
  await p.tap(x, y);
}
async function skipIntroToTitle(p) {
  await p.evaluate("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }))");
  await p.waitFor(`(async () => ${T}.state.mode !== 'intro')()`, 15000);
  await p.waitFor(`(async () => { const rv = ${T}.state.titleReveal; return !rv || rv.phase === 'settled'; })()`, 10000);
}

const pngs = [];
const lines = [];

async function portrait() {
  return await withPage({ w: 390, h: 844, dpr: 3, mobile: true, skipTour: false,
    startupScript: STARTUP, timeoutMs: 90000 }, async (p) => {
    await skipIntroToTitle(p);
    if (!await p.waitFor(tourActive, 10000, 150)) throw new Error('stage-1 tour never fired');
    // Step 1: counter, no BACK, NEXT primary, buttons >=44px and on-screen.
    let card = await p.evaluate(readCard);
    if (!card.counter || !/^1 OF \d+$/.test(card.counter)) throw new Error('no 1 OF N counter: ' + JSON.stringify(card));
    if (card.back) throw new Error('BACK must be absent on step 1');
    if (card.next.label !== 'NEXT') throw new Error('step-1 primary is ' + card.next.label + ', not NEXT');
    assertButtonsOnScreen(card, 390, 844, 'portrait step 1');
    pngs.push(await shot(p, 'portrait-step1'));
    const firstCounter = card.counter;

    // Shade tap = INERT (same step, tour stays up).
    const sp = await p.evaluate(shadePoint);
    if (!sp) throw new Error('no safe shade point found');
    await p.tap(sp[0], sp[1]);
    await p.sleep(350);
    card = await p.evaluate(readCard);
    if (!card || card.counter !== firstCounter) throw new Error(`shade tap changed the card: ${firstCounter} -> ${card && card.counter}`);
    if (!await p.evaluate(tourActive)) throw new Error('shade tap dismissed the tour');

    // NEXT advances; BACK appears and returns.
    await tapControl(p, 'next', 'portrait');
    await p.waitFor(`(() => { const c = document.querySelector('#tour-tip .tour-count'); return c && c.textContent.trim() !== ${JSON.stringify(firstCounter)}; })()`, 3000);
    card = await p.evaluate(readCard);
    if (card.counter === firstCounter) throw new Error('NEXT did not advance');
    if (!card.back || card.back.label !== 'BACK') throw new Error('BACK missing on step 2');
    assertButtonsOnScreen(card, 390, 844, 'portrait step 2');
    pngs.push(await shot(p, 'portrait-step2-multistep'));
    const secondCounter = card.counter;
    await tapControl(p, 'back', 'portrait');
    await p.waitFor(`(() => { const c = document.querySelector('#tour-tip .tour-count'); return c && c.textContent.trim() === ${JSON.stringify(firstCounter)}; })()`, 3000);
    card = await p.evaluate(readCard);
    if (card.counter !== firstCounter) throw new Error(`BACK did not return: ${secondCounter} -> ${card.counter}`);

    // Walk to the final step: primary reads GOT IT + replay note, completes.
    for (let i = 0; i < 12; i++) {
      card = await p.evaluate(readCard);
      if (card.next.label === 'GOT IT') break;
      await tapControl(p, 'next', 'portrait walk');
      await p.sleep(180);
    }
    card = await p.evaluate(readCard);
    if (card.next.label !== 'GOT IT') throw new Error('final primary is ' + card.next.label + ', not GOT IT');
    if (!card.replayNote) throw new Error('final card carries no replay note');
    assertButtonsOnScreen(card, 390, 844, 'portrait final');
    pngs.push(await shot(p, 'portrait-final-gotit'));
    await tapControl(p, 'next', 'portrait GOT IT');
    await p.waitFor(`!${tourActive}`, 4000);
    const stage1 = await p.evaluate(`localStorage.getItem(${JSON.stringify(TOUR_KEYS.stage1)})`);
    if (stage1 !== '1') throw new Error('GOT IT completed the tour but the stage1 flag is ' + stage1);
    lines.push(`portrait: shade tap inert @ ${sp}; ${firstCounter} -> NEXT -> ${secondCounter} -> BACK -> ${firstCounter}; final GOT IT + replay note completes (flag set); buttons >=44px on-screen`);

    // Replay discoverability: SETUP -> SETTINGS -> REPLAY TOUR re-arms.
    const cardAt = async (t) => p.evaluate(`(() => { const el = [...document.getElementById('ov-cards').children].find(c => (c.textContent || '').toUpperCase().includes(${JSON.stringify(t)})); if (!el) return null; const r = el.getBoundingClientRect(); return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)]; })()`);
    const setup = await cardAt('SETUP');
    if (!setup) throw new Error('no SETUP card at title');
    await p.tap(setup[0], setup[1]);
    await p.waitFor(`document.getElementById('ov-title').textContent === 'SETUP'`, 5000);
    const settings = await cardAt('SETTINGS');
    if (!settings) throw new Error('no SETTINGS card in SETUP');
    await p.tap(settings[0], settings[1]);
    await p.waitFor(`document.getElementById('ov-title').textContent === 'SETTINGS'`, 5000);
    const replay = await cardAt('REPLAY TOUR');
    if (!replay) throw new Error('no REPLAY TOUR card in SETTINGS');
    await p.tap(replay[0], replay[1]);
    await p.sleep(300);
    if (!await p.waitFor(tourActive, 8000, 150)) throw new Error('REPLAY TOUR did not re-arm the tour');
    card = await p.evaluate(readCard);
    if (!card.counter || !/^1 OF \d+$/.test(card.counter)) throw new Error('replayed tour not on step 1: ' + JSON.stringify(card.counter));
    pngs.push(await shot(p, 'portrait-replay-reamed'));
    lines.push(`replay: SETUP -> SETTINGS -> REPLAY TOUR (real taps) re-armed the tour (${card.counter})`);

    // Escape still skips (dispatched at document, where the tour listens).
    await p.evaluate("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
    if (!await p.waitFor(`!${tourActive}`, 4000)) throw new Error('Escape no longer skips');
    lines.push('escape: document-level Escape still skips the live tour');
    if (p.errors.length) throw new Error('page errors: ' + JSON.stringify(p.errors));
  });
}

async function landscape() {
  return await withPage({ w: 844, h: 390, dpr: 2, mobile: true, skipTour: false,
    startupScript: STARTUP, timeoutMs: 90000 }, async (p) => {
    await skipIntroToTitle(p);
    if (!await p.waitFor(tourActive, 10000, 150)) throw new Error('stage-1 tour never fired (landscape)');
    let card = await p.evaluate(readCard);
    if (!card.counter || !/^1 OF \d+$/.test(card.counter)) throw new Error('landscape: no counter');
    if (card.back) throw new Error('landscape: BACK must be absent on step 1');
    assertButtonsOnScreen(card, 844, 390, 'landscape step 1');
    const sp = await p.evaluate(shadePoint);
    if (!sp) throw new Error('landscape: no safe shade point');
    await p.tap(sp[0], sp[1]);
    await p.sleep(350);
    if (!await p.evaluate(tourActive)) throw new Error('landscape: shade tap dismissed the tour');
    card = await p.evaluate(readCard);
    if (!/^1 OF /.test(card.counter)) throw new Error('landscape: shade tap advanced the card');
    await tapControl(p, 'next', 'landscape');
    await p.waitFor(`(() => { const c = document.querySelector('#tour-tip .tour-count'); return c && !/^1 OF /.test(c.textContent.trim()); })()`, 3000);
    card = await p.evaluate(readCard);
    if (!card.back) throw new Error('landscape: BACK missing on step 2');
    assertButtonsOnScreen(card, 844, 390, 'landscape step 2');
    await tapControl(p, 'back', 'landscape');
    await p.waitFor(`(() => { const c = document.querySelector('#tour-tip .tour-count'); return c && /^1 OF /.test(c.textContent.trim()); })()`, 3000);
    pngs.push(await shot(p, 'landscape-step1'));
    lines.push(`landscape 844x390: shade tap inert @ ${sp}; NEXT/BACK round-trip; buttons >=44px on-screen`);
    if (p.errors.length) throw new Error('page errors: ' + JSON.stringify(p.errors));
  });
}

await portrait();
await landscape();
console.log(lines.join('\n'));
console.log(`TOUR OVERLAY VERIFIED | shade inert | NEXT/BACK | buttons >=44px fully on-screen | GOT IT completes | REPLAY TOUR re-arms | pngs: ${pngs.map(x => x.replace(ART + '/', '')).join(', ')}`);
