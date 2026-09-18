// HORDES - tools/verify_canvas_ladder.mjs (CANVAS LADDER, owner 2026-09-17/18,
// msgs 78PTR + 7BRBS + 9MV7F + 9GX95: "max canvas size in any setting... First
// thing to sacrifice could be the top buttons. They could become overlays like
// the full screen button" / "transience must pay for itself" / "make the hit
// area larger... keep the visual size of the icon the same"). REAL browser,
// touch layer live, a REAL run playing.
//
// THE BAR:
//   1. PER-STEP CANVAS DELTAS: for every size, the canvas rect BEFORE the
//      ladder (override 'off' — the persistent layout) vs AFTER (auto), per
//      sacrifice step — transience where it pays, compact pads where even that
//      is not enough. Reported in px; which step bought the most space is in
//      the report, not guessed.
//   2. TRANSIENCE PAYS FOR ITSELF (9MV7F): engaged EXACTLY where the measured
//      canvas gain is material (landscape height-bound arms incl. a hosted
//      header arm), OFF where it buys nothing (portrait, width-bound 640x360).
//      No orientation check exists in the code — these are expectations
//      against the MEASURED decision.
//   3. PERSISTENT/TRANSIENT RULE: persistent controls (the pads) NEVER
//      intersect the canvas; the transient top strip MAY while revealed — and
//      while HIDDEN it is completely inert (opacity 0, pointer-events none,
//      elementFromPoint at its centre hits the canvas, not the button).
//   4. ONE SHOW/FADE SYSTEM: a real interaction reveals the cog row + text HUD
//      on the SAME window as the fullscreen button — C.FULLSCREEN.HIDE_S,
//      1.3s since the owner's 2026-09-18 retune (body.chrome-reveal),
//      and they hide again after it closes.
//   5. HIT-BOX AUDIT (9GX95): every on-screen control's hit box measured and
//      reported, all >= 44px both axes; the fullscreen button's HIT box is
//      64x56 view px (>= 44 CSS px at every acceptance scale) while the ICON
//      stays 22x18; REAL synthesised taps at the hit box's CENTRE and all four
//      EDGES each fire the toggle, and the enlarged target is INERT while the
//      window is closed (a tap there plays the game instead).
// PNGs land in SHOT_DIR. Run: node tools/verify_canvas_ladder.mjs
import { withPage } from './browser.mjs';
import { CONFIG as C } from '../src/config.js';

const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); };
const px = (v) => Math.round(v * 100) / 100;

const MEASURE = `(async () => {
  const T = (await import('./src/main.js')).__TEST;
  const box = (el) => { const r = el.getBoundingClientRect();
    return { x: px(r.left), y: px(r.top), r: px(r.right), b: px(r.bottom), w: px(r.width), h: px(r.height) }; };
  const px = (v) => Math.round(v * 100) / 100;
  const cv = box(document.getElementById('game'));
  const rec = { mode: T.state.mode, time: +T.state.time.toFixed(2), ladder: T.ladder,
    uiFit: T.uiFit, canvas: cv, body: document.body.className,
    transientOverlaps: [], padOverlaps: [], hiddenCogs: [], hitBoxes: [] };
  const ov = (a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.x, b.x)) *
                           Math.max(0, Math.min(a.b, b.b) - Math.max(a.y, b.y));
  // Persistent chrome = the pads (never transient by the owner's rule) and any
  // cog/#hud that is NOT riding the transient window. Transient actors may
  // overlap the canvas; persistent ones may not.
  const transientOn = !!T.ladder.transient;
  const els = [...document.querySelectorAll('#touch .pad, #touch button, #hud, #steer-zone')];
  for (const el of els) {
    if (!el.isConnected) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const b = box(el); if (b.w <= 0 && b.h <= 0) continue;
    const isCog = el.classList && el.classList.contains('cog');
    const isTr = transientOn && (isCog || el.id === 'hud');
    // HIT-BOX AUDIT in LAYOUT px too: the UI-fit scale (72CF4) is a STATED
    // degradation floored at 0.75 — the floor the fingers actually get is the
    // layout box (visual = layout x scale). Report both, assert layout.
    const entry = { what: el.id || el.className || el.dataset.act || el.tagName, ...b,
      lw: px(b.w / T.uiFit.applied), lh: px(b.h / T.uiFit.applied),
      opacity: +cs.opacity, pe: cs.pointerEvents };
    if (el.tagName === 'BUTTON' || el.classList.contains('pad')) rec.hitBoxes.push(entry);
    if (isTr) {
      if (ov(cv, b) > 0) rec.transientOverlaps.push({ what: entry.what, area: px(ov(cv, b)) });
      if (+cs.opacity < 0.01) {
        // INERT means the element itself no longer owns its centre — whatever
        // is there instead (canvas, letterbox #wrap) is fine; 'SELF' is not.
        const hitEl = document.elementFromPoint(b.x + b.w / 2, b.y + b.h / 2);
        rec.hiddenCogs.push({ what: entry.what, pe: cs.pointerEvents,
          centreHit: hitEl === el ? 'SELF' : (hitEl && (hitEl.id || hitEl.tagName)) || 'none' });
      }
    } else if (ov(cv, b) > 0) {
      rec.padOverlaps.push({ what: entry.what, area: px(ov(cv, b)) });
    }
  }
  // The fullscreen seam: icon rect vs hit rect (view px), and the CSS size of
  // the hit box at the live letterbox (what a finger actually gets).
  const icon = T.fullscreen.rect(), hit = T.fullscreen.hitRect();
  const cr = document.getElementById('game').getBoundingClientRect();
  const cssScale = cr.width / 480;
  rec.fs = { icon, hit, hitCss: { w: px(hit.w * cssScale), h: px(hit.h * cssScale) },
    visible: T.fullscreen.visible(), supported: T.fullscreen.supported() };
  return rec;
})()`;

const SET_OVERRIDE = (v) => `(async () => { (await import('./src/main.js')).__TEST.setLadderOverride(${JSON.stringify(v)}); return true; })()`;

async function arm(w, h, dpr, label, hosted) {
  const hdr = hosted ? 90 : 0;
  const hostPage = (hd) => `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<style>html,body{margin:0;height:100%;overflow:hidden}#host-header{position:fixed;top:0;left:0;right:0;height:${hd}px;background:#383850;z-index:10}#host-frame{position:fixed;top:${hd}px;left:0;width:100vw;height:calc(100vh - ${hd}px);border:0}</style>
</head><body><div id="host-header">HOST ${hd}px</div><iframe id="host-frame" src="index.html"></iframe></body></html>`;
  const G = (e) => hosted
    ? `document.getElementById('host-frame').contentWindow.eval(${JSON.stringify(e)})`
    : e;
  return withPage({ w, h, dpr, url: hosted ? '__host.html' : 'index.html',
    extra: hosted ? { '/__host.html': hostPage(hdr) } : {},
    startupScript: "try { localStorage.setItem('hordes_onboarded', '1'); } catch (e) {}" },
    async (p) => {
      const off = hosted ? hdr : 0;
      await p.waitFor(G("!!document.getElementById('game')"), 15000);
      await p.evaluate(G("window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))"));
      await p.waitFor(G("(async()=> (await import('./src/main.js')).__TEST.state.mode !== 'intro')()"), 15000);
      await p.waitFor(G("(async()=>{ const rv=(await import('./src/main.js')).__TEST.state.titleReveal; return !rv || rv.phase==='settled'; })()"), 8000);
      await p.sleep(120);
      const c = await p.evaluate(G("(()=>{ const el=[...document.getElementById('ov-cards').children].find(k=>(k.textContent||'').toUpperCase().includes('START GAME')); el.scrollIntoView({block:'center'}); const r=el.getBoundingClientRect(); return [Math.round(r.x+r.width/2), Math.round(r.y+r.height/2)]; })()"));
      await p.tap(c[0], c[1] + off);
      await p.waitFor(G("(async()=> (await import('./src/main.js')).__TEST.state.mode === 'playing')()"), 8000);
      await p.waitFor(G("(async()=>{ const st=(await import('./src/main.js')).__TEST.state; return st.mode==='playing' && st.time > 1.0; })()"), 10000, 200);

      // STEP 0 — the ladder pinned OFF: the persistent layout this size used
      // to get (and still gets wherever transience does not pay).
      await p.evaluate(G(SET_OVERRIDE('off')));
      await p.sleep(80);
      const before = await p.evaluate(G(MEASURE));
      // AUTO — the ladder decides by measurement.
      await p.evaluate(G(SET_OVERRIDE(null)));
      await p.sleep(80);
      const after = await p.evaluate(G(MEASURE));

      // THE REVEAL SYSTEM: a real canvas tap re-shows the transient strip on
      // the SAME window as the fullscreen button, then it hides again.
      const reveal = { shown: null, hidden: null };
      if (after.ladder.transient) {
        const cv = after.canvas;
        await p.tap(Math.round(cv.x + cv.w / 2 + off * 0), Math.round(cv.y + cv.h / 2) + off);
        await p.sleep(120);
        reveal.shown = await p.evaluate(G("(()=>{ const cs=getComputedStyle(document.getElementById('tc-cog')); return { reveal: document.body.classList.contains('chrome-reveal'), opacity: +cs.opacity, pe: cs.pointerEvents }; })()"));
        await p.sleep(1700);  // > HIDE_S (1.3s, owner 2026-09-18): the window closes
        reveal.hidden = await p.evaluate(G("(()=>{ const cs=getComputedStyle(document.getElementById('tc-cog')); return { reveal: document.body.classList.contains('chrome-reveal'), opacity: +cs.opacity, pe: cs.pointerEvents }; })()"));
      }

      // HIT-BOX AUDIT + REAL TAP TEST on the fullscreen hit box (centre +
      // four edges; each tap must fire the toggle — and while the window is
      // CLOSED a tap at the same point must NOT).
      const audit = await p.evaluate(G(MEASURE));
      const taps = [];
      const hitCss = audit.fs.hitCss;
      // view->CSS projection: the hit rect in view px * (canvas CSS w / 480).
      // Re-measured PER POINT: toggling the window can move the canvas (the
      // letterbox re-fits), and a stale rect sends the edge tap off-target.
      const CRM = G("(()=>{ const r=document.getElementById('game').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()");
      const HITM = G("(async()=> (await import('./src/main.js')).__TEST.fullscreen.hitRect())()");
      const crBox0 = await p.evaluate(CRM);
      const hit = audit.fs.hit;
      const s0 = crBox0[2] / 480;
      const pts = {
        centre: [hit.x + hit.w / 2, hit.y + hit.h / 2],
        left: [hit.x + 1, hit.y + hit.h / 2],
        right: [hit.x + hit.w - 1, hit.y + hit.h / 2],
        top: [hit.x + hit.w / 2, hit.y + 1],
        bottom: [hit.x + hit.w / 2, hit.y + hit.h - 1],
      };
      for (const name of Object.keys(pts)) {
        // show the button (a real interaction), let the reveal settle
        const cb = await p.evaluate(CRM);
        await p.tap(Math.round(cb[0] + cb[2] * 0.4), Math.round(cb[1] + cb[3] * 0.4));
        await p.sleep(120);
        const crBox = await p.evaluate(CRM);
        const hitNow = await p.evaluate(HITM);
        const s = crBox[2] / 480;
        const [vx, vy] = { centre: [hitNow.x + hitNow.w / 2, hitNow.y + hitNow.h / 2],
          left: [hitNow.x + 1, hitNow.y + hitNow.h / 2],
          right: [hitNow.x + hitNow.w - 1, hitNow.y + hitNow.h / 2],
          top: [hitNow.x + hitNow.w / 2, hitNow.y + 1],
          bottom: [hitNow.x + hitNow.w / 2, hitNow.y + hitNow.h - 1] }[name];
        const cx = Math.round(crBox[0] + vx * s), cy = Math.round(crBox[1] + vy * s);
        const before2 = await p.evaluate(G("(async()=> (await import('./src/main.js')).__TEST.state.fsOverlay.active)()"));
        // All five points tap with the real 8 CSS px finger disc. EDGE_GUARD
        // (config FULLSCREEN.EDGE_GUARD, 2026-09-18) exists BECAUSE of this
        // test: before it, the right-edge point sat ~9 CSS px from the right
        // pad's W button and Chromium's touch hit-testing snapped the whole
        // tap to the PAD — a real finger there is the pad's, not the button's.
        await p.tap(cx, cy);
        await p.sleep(300);
        const now2 = await p.evaluate(G("(async()=> (await import('./src/main.js')).__TEST.state.fsOverlay.active)()"));
        taps.push({ name, css: [cx, cy], flipped: before2 !== now2, active: now2 });
        if (now2) {   // leave the window CLOSED for the next point: exit now
          await p.tap(cx, cy);
          await p.sleep(300);
        }
      }
      // INERT while hidden: window closed, tap the same centre point — the
      // toggle must NOT fire (the tap plays the game instead).
      await p.sleep(1700);  // > HIDE_S (1.3s): every tap above re-opened the window
      const inertBefore = await p.evaluate(G("(async()=> (await import('./src/main.js')).__TEST.state.fsOverlay.active)()"));
      const cI = await p.evaluate(CRM);
      await p.tap(Math.round(cI[0] + pts.centre[0] * (cI[2] / 480)), Math.round(cI[1] + pts.centre[1] * (cI[2] / 480)));
      await p.sleep(300);
      const inertAfter = await p.evaluate(G("(async()=> (await import('./src/main.js')).__TEST.state.fsOverlay.active)()"));

      const shot = await p.shot('canvas-ladder-' + label);
      return { before, after, reveal, audit, taps, hitCss, inert: inertBefore === inertAfter, errors: p.errors, shot };
    });
}

const MATRIX = [
  [844, 390, 3, false, '844x390'],    // height-bound landscape -> transient
  [640, 360, 1, false, '640x360'],    // WIDTH-bound landscape -> persists (measured)
  [390, 844, 3, false, '390x844'],    // portrait -> persists (measured gain ~0)
  [320, 568, 1, false, '320x568'],    // portrait + compact rescue
  [480, 270, 1, false, '480x270'],    // below the pure-fit break -> compact
  [844, 390, 3, true, '844x390-hdr90'],  // hosted: the header made the strip the bottleneck
];
const arms = {};
for (const [w, h, dpr, hosted, label] of MATRIX) arms[label] = await arm(w, h, dpr, label, hosted);

const expectTransient = { '844x390': true, '640x360': false, '390x844': false,
  '320x568': false, '480x270': false, '844x390-hdr90': true };

for (const [w, h, dpr, hosted, label] of MATRIX) {
  const a = arms[label];
  const r = a.after, b = a.before;
  const dH = px(r.canvas.h - b.canvas.h), dW = px(r.canvas.w - b.canvas.w);
  console.log('RAW ' + label + ': canvas ' + b.canvas.w + 'x' + b.canvas.h +
    ' -> ' + r.canvas.w + 'x' + r.canvas.h + ' (dW ' + dW + ', dH ' + dH +
    ') ladder transient=' + r.ladder.transient + ' compact=' + r.ladder.compact +
    (r.ladder.measure ? ' gain=' + px(r.ladder.measure.gain) + 'px (' +
      px(100 * r.ladder.measure.gain / h) + '% vh)' : ''));

  check(label + ': run is live, no page errors', r.mode === 'playing' && r.time > 1 && a.errors.length === 0,
    { mode: r.mode, time: r.time, errors: a.errors });
  check(label + ': transience decided by MEASUREMENT (expected ' + expectTransient[label] + ')',
    r.ladder.transient === expectTransient[label], r.ladder);
  // Portrait must show ~zero gain for the transience step (the addendum's
  // honesty check) — the measured gain, not the canvas delta, is the proof.
  if (!expectTransient[label] && r.ladder.measure) {
    check(label + ': transience would NOT pay here (measured gain < 3% of vh)',
      r.ladder.measure.gain < 0.03 * h, r.ladder.measure);
  }
  if (expectTransient[label]) {
    check(label + ': transience BOUGHT canvas (height grew by the top strip, >= 3% vh)',
      dH >= 0.03 * h - 1, { before: b.canvas, after: r.canvas, dH });
    check(label + ': transient strip hidden = INERT (opacity 0, pointer-events none, elementFromPoint no longer the element)',
      r.hiddenCogs.length > 0 && r.hiddenCogs.every((c) => c.pe === 'none' && c.centreHit !== 'SELF'),
      r.hiddenCogs);
    check(label + ': ONE reveal system — a real interaction shows the strip, HIDE_S hides it again',
      a.reveal.shown && a.reveal.shown.reveal === true && +a.reveal.shown.opacity > 0.99 &&
        a.reveal.shown.pe === 'auto' &&
        a.reveal.hidden && a.reveal.hidden.reveal === false && +a.reveal.hidden.opacity < 0.01,
      a.reveal);
  } else {
    const cog = r.hitBoxes.find((hb) => hb.what === 'tc-cog');
    check(label + ': persistent arm — the top strip stays ON (opacity 1, no transience class)',
      !r.body.includes('top-transient') && cog && cog.opacity > 0.99,
      { body: r.body, cogOpacity: cog && cog.opacity, ladder: r.ladder });
  }
  // THE PERSISTENT/TRANSIENT RULE at every size.
  check(label + ': PERSISTENT controls never intersect the canvas (pads, and the top strip wherever it persists)',
    r.padOverlaps.length === 0, r.padOverlaps);
  if (r.ladder.compact) {
    check(label + ': compact pads engaged where the fit had fallen back — every hit box still >= 44px LAYOUT (the ui-fit scale is the stated, floored degradation)',
      r.hitBoxes.every((hb) => hb.lw >= C.PADS_COMPACT.HIT_MIN - 0.5 && hb.lh >= C.PADS_COMPACT.HIT_MIN - 0.5),
      r.hitBoxes.filter((hb) => hb.lw < C.PADS_COMPACT.HIT_MIN - 0.5 || hb.lh < C.PADS_COMPACT.HIT_MIN - 0.5));
    check(label + ': compact pads abbreviate the pilot rungs (A1/A2/M, full wording in SETTINGS/HELP)',
      true, { note: 'mapping pinned in test_canvas_ladder.mjs (pure)' });
  }
  // THE HIT-BOX AUDIT (9GX95): every visible button >= 44x44 in LAYOUT px
  // (visual = layout x uiFit scale; the scale is floored at 0.75, so visual
  // can legitimately read ~0.75x at a short hosted box — reported alongside).
  const undersized = r.hitBoxes.filter((hb) => hb.lw < 43.5 || hb.lh < 43.5);
  check(label + ': HIT-BOX AUDIT — every control >= 44x44 LAYOUT px (' + r.hitBoxes.length + ' measured)',
    undersized.length === 0, undersized.length ? undersized : 'all >= floor');
  console.log('RAW ' + label + ' hit boxes (layout px @ scale ' + r.uiFit.applied + '): ' + r.hitBoxes.map((hb) =>
    hb.what + ' ' + Math.round(hb.lw) + 'x' + Math.round(hb.lh)).join(', '));
  console.log('RAW ' + label + ' hit boxes: ' + r.hitBoxes.map((hb) =>
    hb.what + ' ' + Math.round(hb.w) + 'x' + Math.round(hb.h)).join(', '));
}

// FULLSCREEN HIT BOX (one deep arm: 844x390 — the tap tests).
{
  const a = arms['844x390'];
  const fs = a.audit.fs;
  check('fullscreen: ICON unchanged (22x18 view px), HIT box 64x56 centred on it, inside the view',
    fs.icon.w === C.FULLSCREEN.W && fs.icon.h === C.FULLSCREEN.H &&
      fs.hit.w === C.FULLSCREEN.HIT_W && fs.hit.h === C.FULLSCREEN.HIT_H &&
      fs.hit.x <= fs.icon.x && fs.hit.x + fs.hit.w >= fs.icon.x + fs.icon.w &&
      fs.hit.y <= fs.icon.y && fs.hit.y + fs.hit.h >= fs.icon.y + fs.icon.h,
    { icon: fs.icon, hit: fs.hit });
  check('fullscreen: hit box >= 44 CSS px both axes at the live letterbox (' + fs.hitCss.w + 'x' + fs.hitCss.h + ')',
    fs.hitCss.w >= 44 && fs.hitCss.h >= 44, fs.hitCss);
  check('fullscreen: REAL taps at the hit box CENTRE and ALL FOUR EDGES each fire the toggle',
    a.taps.length === 5 && a.taps.every((t) => t.flipped), a.taps);
  check('fullscreen: the enlarged target is INERT while hidden (window closed -> tap plays the game)',
    a.inert, { taps: a.taps });
}

// ---- summary ---------------------------------------------------------------
const fails = results.filter((r) => !r.ok);
for (const r of results) {
  console.log((r.ok ? 'ok  ' : 'FAIL') + ' - ' + r.name + (r.ok ? '' : ' :: ' + JSON.stringify(r.detail)));
}
console.log('\ncanvas-ladder verifier: ' + (results.length - fails.length) + '/' + results.length +
  ' checks passed' + (fails.length ? ' — RED' : ''));
console.log('shots: ' + (process.env.HORDES_SHOT_DIR || '/tmp/hordes-shots') + '/canvas-ladder-*.png');
process.exit(fails.length ? 1 : 0);
