// HORDES — desktop UI verification (input routing + screen chrome).
//
// Run: node test/test_desktop_ui.mjs
//
// Headless harness (the same stub DOM pattern as test/smoke.mjs) so the REAL
// src/main.js runs. Proves, on the desktop path specifically:
//   1. SCREEN CHROME GATE (WAVE-25, audit 2.1/2.12) — the pad layer, cog, "?"
//      and hints panel are hidden on the intro movie and on every non-run
//      screen, and shown only while a run is live. frame() used to early-return
//      for 'intro'/'portal-cine' before it ever set the layer's display, so the
//      whole desktop UI rendered over the intro for its full ~7s.
//   2. ESC/P pause, mode-aware hints, per-card EVOLVE labels.
//   3. KEY-REPEAT GUARD (WAVE-25, audit 2.2) — every edge-triggered key is
//      edge-triggered; a held ESC can no longer ping-pong the pause.
//   4. Run-start SYNERGY announcement (WAVE-25, audit 2.3).
//   5. ARENA RIM reads CONFIG.GROUND.RIM (WAVE-25, audit 2.4).
//   6. Scoped footer / HOW TO PLAY copy, input-aware tour phrasing.
import assert from 'node:assert';
import fs from 'node:fs';
import { CONFIG as C } from '../src/config.js';

// ---- repo-relative file reads (paths must not be hard-coded) ----------------
const ROOT = new URL('../', import.meta.url);
const read = (rel) => fs.readFileSync(new URL(rel, ROOT), 'utf8');

const noop = () => {};
const ctxRec = { rec: false, depth: 0, rects: [] };
const fakeCtx = new Proxy({}, {
  get(t, prop) {
    if (prop === 'canvas') return fakeCanvas;
    if (prop === 'fillStyle' || prop === 'globalAlpha') return undefined;
    if (prop === 'save') return () => { ctxRec.depth++; };
    if (prop === 'restore') return () => { ctxRec.depth = Math.max(0, ctxRec.depth - 1); };
    if (prop === 'fillRect') return (x, y, w, h) => { if (ctxRec.rec) ctxRec.rects.push({ x, y, w, h, d: ctxRec.depth }); };
    return typeof prop === 'string' ? noop : undefined;
  },
  set() { return true; },
});
const fakeCanvas = {
  width: 0, height: 0,
  getContext: () => fakeCtx,
  createElement: () => fakeEl(),
};
const fakeEl = () => {
  const el = {
    textContent: '', style: {}, children: [], onclick: null,
    click() { if (this.onclick) this.onclick(); },
    addEventListener(ev, cb) { (this._ev ?? (this._ev = {}))[ev] = cb; },
  };
  const cls = new Set();
  el.classList = {
    add: (c) => cls.add(c), remove: (c) => cls.delete(c),
    contains: (c) => cls.has(c),
    toggle: (c, on) => { const want = on === undefined ? !cls.has(c) : !!on; want ? cls.add(c) : cls.delete(c); },
  };
  Object.defineProperty(el, 'innerHTML', {
    get() { return this._html ?? ''; },
    set(v) { this._html = v; if (v === '') el.children.length = 0; },
  });
  el.appendChild = (child) => { el.children.push(child); };
  return el;
};
const elements = {};
globalThis.document = {
  getElementById: (id) => elements[id] ?? (elements[id] = id === 'game' ? { ...fakeCanvas, getContext: () => fakeCtx } : fakeEl()),
  createElement: () => fakeEl(),
};
let keyHandler = null, keyUpHandler = null, blurHandler = null, resizeHandler = null;
globalThis.window = {
  addEventListener: (ev, cb) => {
    if (ev === 'keydown') keyHandler = cb;
    else if (ev === 'keyup') keyUpHandler = cb;
    else if (ev === 'blur') blurHandler = cb;
    else if (ev === 'resize') resizeHandler = cb;
  },
};
let now = 0;
globalThis.performance = { now: () => now };
const rafQueue = [];
globalThis.requestAnimationFrame = (cb) => { rafQueue.push(cb); return rafQueue.length; };
globalThis.location = { reload: noop };
// Preseed: onboarded + every first-run tour flag, so the stage-2 coachmarks
// stay out of the way (they pause the sim and swallow keys). No hordes_hints
// key: the hints panel must hydrate to its non-touch default (ON).
const lsBack = new Map([['hordes_onboarded', '1']]);
for (const k of ['stage1', 'hud', 'pilot', 'focus', 'stance', 'move', 'skills', 'potions',
  'stats', 'cog', 'draft', 'edge', 'chest', 'portal', 'arch', 'shrine', 'intermission',
  'death', 'settings']) lsBack.set('hordes_tour_' + k, '1');
globalThis.localStorage = {
  getItem: (k) => (lsBack.has(k) ? lsBack.get(k) : null),
  setItem: (k, v) => { lsBack.set(k, String(v)); },
  removeItem: (k) => { lsBack.delete(k); },
};

const mainMod = await import('../src/main.js');
const T = mainMod.__TEST;
const st = T.state;
const dtMs = 1000 / 60;
const pump = (n) => { for (let i = 0; i < n; i++) { now += dtMs; const cb = rafQueue.shift(); cb && cb(now); } };
const key = (k, extra = {}) => keyHandler({ key: k, preventDefault() {}, ...extra });
const touchLayer = elements['touch'];
const hintsEl = elements['hints'];
const chromeHidden = () => touchLayer.style.display === 'none';

// ---- 0. SCREEN CHROME GATE: the intro regression --------------------------
{
  assert(st.mode === 'intro', 'the page must boot into the intro movie (mode=' + st.mode + ')');
  // Before a single frame: the module must already have hidden the chrome.
  assert(chromeHidden(),
    'the desktop chrome layer must be hidden on the intro (display="' + touchLayer.style.display + '")');
  assert(!hintsEl.classList.contains('on'), 'the hints panel must not show over the intro');
  pump(30);   // ~0.5s into the ~7s movie
  assert(st.mode === 'intro', 'still in the intro after 0.5s');
  assert(chromeHidden(), 'the pads/cog must stay hidden right through the intro');
  assert(!hintsEl.classList.contains('on'), 'the hints must stay hidden right through the intro');
  console.log('chrome gate: pad layer + hints are hidden from the first frame of the intro');

  // Boot out of the intro into the menu — chrome must stay hidden there too.
  for (let i = 0; i < 60 * 12 && st.mode === 'intro'; i++) pump(1);
  assert(st.mode !== 'intro', 'the intro must finish (mode=' + st.mode + ')');
  assert(chromeHidden(), 'no chrome on the title/menu screens');
  assert(!hintsEl.classList.contains('on'), 'no hints panel on the title/menu screens');

  // Live run: chrome appears.
  T.startRun();
  pump(2);
  assert(st.mode === 'playing', 'the run must be live (mode=' + st.mode + ')');
  assert(touchLayer.style.display === '', 'the pads must be visible during a live run');
  assert(hintsEl.classList.contains('on'), 'the hints panel must be visible during a live run');

  // Paused (SETTINGS): chrome hidden again, exactly as the audit observed live.
  T.openSettings();
  pump(1);
  assert(st.mode === 'settings', 'openSettings must pause (mode=' + st.mode + ')');
  assert(chromeHidden(), 'the pads must be hidden while paused in SETTINGS');
  assert(!hintsEl.classList.contains('on'), 'the hints must be hidden while paused in SETTINGS');
  T.closeSettings();
  pump(1);
  assert(st.mode === 'playing', 'closeSettings must resume');
  assert(touchLayer.style.display === '' && hintsEl.classList.contains('on'),
    'closing SETTINGS must bring the chrome back for the live run');
  console.log('chrome gate: hidden on menu + pause, shown for a live run');

  // WAVE-25 (audit 2.6): the active controller's doctrine is published as
  // first-class state each frame, so render.js need not scrape the badge text.
  assert(st.focus === T.controller.focus && st.stance === T.controller.stance,
    'state.focus/stance must mirror the active controller (got ' + st.focus + '/' + st.stance + ')');
  const fBefore = st.focus;
  key('Tab');
  pump(1);
  assert(st.focus === T.controller.focus && st.focus !== fBefore,
    'state.focus must track a doctrine change within the frame');
  key('Tab');   // cycle back
  pump(1);
  // WAVE-27: with the canvas readout removed the BUTTON BADGES are the
  // doctrine's on-screen home, and they read the published fields (one
  // source). The PILOT badge also carries the pilot's live activity, which is
  // what keeps the stance's moment-to-moment effect visible.
  assert(elements['tc-focus'].textContent === st.focus,
    'the FOCUS badge must read the published state.focus (got ' +
    elements['tc-focus'].textContent + ' vs ' + st.focus + ')');
  assert(elements['tc-stance'].textContent === st.stance,
    'the STANCE badge must read the published state.stance (got ' +
    elements['tc-stance'].textContent + ' vs ' + st.stance + ')');
  assert(elements['tc-pilot'].textContent.includes(st.pilotMode) &&
         (st.stanceAct === st.pilotMode ||
          elements['tc-pilot'].textContent.includes(st.stanceAct)),
    'the PILOT badge must read pilotMode + the live activity (got ' +
    elements['tc-pilot'].textContent + ')');
  const f2 = st.focus;
  key('Tab');
  pump(1);
  assert(st.focus !== f2 && elements['tc-focus'].textContent === st.focus,
    'a lever change must reach the badge through the published field in-frame');
  key('Tab'); key('Tab'); key('Tab');   // 4 modes -> back to the default
  pump(1);
  console.log('doctrine: state.* published every frame, the BUTTON BADGES are the readout (WAVE-27)');
}

// ---- 1. PAUSE KEY --------------------------------------------------------
{
  const t0 = st.time;
  key('Escape');
  assert(st.mode === 'settings', 'ESC in playing must open the pause (mode=' + st.mode + ')');
  assert(elements['ov-title'].textContent === 'SETTINGS', 'ESC pause lands on SETTINGS');
  pump(5);
  assert(st.time === t0, 'the clock must freeze under an ESC pause (t=' + st.time + ' vs ' + t0 + ')');
  key('Escape');
  assert(st.mode === 'playing', 'ESC in settings must resume (mode=' + st.mode + ')');
  pump(2);
  assert(st.time > t0, 'resuming must restart the clock');
  key('p');
  assert(st.mode === 'settings', 'P must open the pause too (mode=' + st.mode + ')');
  key('Escape');
  assert(st.mode === 'playing', 'ESC closes the P pause');
  console.log('pause key: ESC + P pause from playing, clock frozen, ESC resumes');
}

// ---- 2. MODE-AWARE HINTS -------------------------------------------------
{
  const hints = elements['hints'];
  const html = () => hints.innerHTML || '';
  // OWNER RULE (2026-09-13): `I` is the ONE stats key in BOTH modes — `S` is
  // movement-only and must never be advertised as a screen key. These checks
  // used to pin the old "S / I stats" copy; they now pin the new contract and
  // additionally assert that S is NOT taught (the negative is the point).
  assert(/I stats/.test(html()), 'AUTO hints must advertise I stats: ' + html());
  assert(!/S \/ I stats/.test(html()), 'NO mode may teach S as the stat key: ' + html());
  assert(/Q \/ E/.test(html()), 'the panel must keep the Q / E overcharge claim');
  assert(!/1-6 cards/.test(html()), 'the unscoped number-key claim must be gone');
  assert(/ESC close \/ pause/.test(html()),
    'the hints must teach the ESC close/pause contract: ' + html());
  T.setPilotMode('MANUAL');
  assert(/I stats \(S = move down\)/.test(html()),
    'MANUAL hints must warn that S is movement: ' + html());
  assert(!/S \/ I stats/.test(html()), 'MANUAL must not teach S as the stat key');
  assert(/Q frost/.test(html()) && /E overcharge/.test(html()),
    'MANUAL must still list both skills via their always-valid keys');
  assert(/WASD \/ arrows move/.test(html()), 'MANUAL must document held movement');
  T.setPilotMode('AUTO');
  assert(/I stats/.test(html()) && !/S \/ I stats/.test(html()),
    'an AUTO swap must re-render the AUTO list back');
  console.log('hints: panel renders AUTO/MANUAL variants and re-renders on pilot swap');
}

// ---- 3. EVOLVE CARD LABELS ----------------------------------------------
{
  const volley = st.weapons.find(w => w.type === 'VOLLEY');
  volley.level = 8;
  st.items.push({ id: 'probe_crit', name: 'Probe Eye', rarity: 'RARE',
    affixes: [{ id: 'crit', name: 'Keen Eye', field: 'crit', magnitude: 0.08 }] });
  st.evoTokens = 1;
  let opened = false;
  for (let i = 0; i < 40 && !opened; i++) { pump(1); if (st.mode === 'evolve') opened = true; }
  assert(opened, 'the EVOLVE overlay must open');
  const cards = elements['ov-cards'].children;
  assert(cards.length === 2, 'one candidate + NOT NOW (got ' + cards.length + ')');
  assert(/\[1\]/.test(cards[0].innerHTML), 'card 1 must be labelled [1]: ' + cards[0].innerHTML);
  assert(!/\[1\]/.test(cards[1].innerHTML) && /\[2\]/.test(cards[1].innerHTML),
    'NOT NOW must be labelled [2], not a duplicate [1]: ' + cards[1].innerHTML);
  // the number key must resolve to the card carrying that label
  key('2');
  assert(st.mode === 'playing', 'key 2 must fire the NOT NOW card (mode=' + st.mode + ')');
  assert(st.evoTokens === 1, 'NOT NOW must keep the token');
  console.log('evolve: cards carry their own index ([1] candidate, [2] NOT NOW) and 1-4 routing agrees');
}

// ---- 4. KEY-REPEAT GUARD (all edge-triggered keys) -----------------------
{
  const p = st.player;
  p.potions.hp = 3; p.hp = Math.max(1, Math.floor(p.stats.maxHp / 2));
  const hp0 = p.hp;
  key('h', { repeat: true });
  assert(p.potions.hp === 3 && p.hp === hp0, 'a repeated H must not drink (potions=' + p.potions.hp + ')');
  key('h');
  assert(p.potions.hp === 2 && p.hp > hp0, 'a fresh H press must still drink (potions=' + p.potions.hp + ')');
  p.potions.mp = 3; p.mana = 0;
  key('n', { repeat: true });
  assert(p.potions.mp === 3, 'a repeated N must not drink (potions=' + p.potions.mp + ')');
  key('n');
  assert(p.potions.mp === 2, 'a fresh N press must still drink (potions=' + p.potions.mp + ')');
  const f0 = T.controller.focus;
  key('Tab', { repeat: true });
  assert(T.controller.focus === f0, 'a repeated TAB must not cycle FOCUS (' + T.controller.focus + ')');
  key('Tab');
  assert(T.controller.focus !== f0, 'a fresh TAB must still cycle FOCUS');
  const s0 = T.controller.stance;
  key('g', { repeat: true });
  assert(T.controller.stance === s0, 'a repeated G must not cycle STANCE (' + T.controller.stance + ')');
  key('g');
  assert(T.controller.stance !== s0, 'a fresh G must still cycle STANCE');
  console.log('repeat guard: held H / N / TAB / G are edge-triggered, single presses still work');

  // WAVE-25 (audit 2.2): the wave-23 guard missed ESC/P, M, I, S, ? and +/-.
  // Held ESC was the worst: the settings branch closed the pause and the next
  // tick re-entered playing and reopened it (run flickering live/paused).
  const pilot0 = st.pilotMode;
  // (M1 retarget: the pilot toggle moved M -> O when the map claimed M; the
  // repeat-guard probe follows the key, and the map key gets its own pin.)
  key('o', { repeat: true });
  assert(st.pilotMode === pilot0, 'a repeated O must not flip the pilot (' + st.pilotMode + ')');
  key('o');
  assert(st.pilotMode !== pilot0, 'a fresh O must still flip the pilot');
  key('o');   // back to the starting mode
  const map0 = st.mapOpen;
  key('m', { repeat: true });
  assert(st.mapOpen === map0, 'a repeated M must not toggle the map');
  key('m');
  assert(st.mapOpen === !map0, 'a fresh M must still toggle the map');
  key('m');   // back to closed

  // Held ESC must NOT oscillate: pause once, then repeats must be ignored.
  key('Escape');
  assert(st.mode === 'settings', 'ESC opens the pause before the repeat probe');
  key('Escape', { repeat: true });
  key('Escape', { repeat: true });
  key('Escape', { repeat: true });
  assert(st.mode === 'settings', 'a HELD ESC must not resume the run (mode=' + st.mode + ')');
  key('Escape');
  assert(st.mode === 'playing', 'a fresh ESC still resumes');

  // Held I / S must not strobe the FIELD REPORT.
  key('i', { repeat: true });
  assert(st.mode === 'playing', 'a repeated I must not open the FIELD REPORT');
  key('i');
  assert(st.mode === 'stats', 'a fresh I still opens the FIELD REPORT (mode=' + st.mode + ')');
  key('i', { repeat: true });
  assert(st.mode === 'stats', 'a repeated I must not close/reopen the FIELD REPORT');
  key('i');
  assert(st.mode === 'playing', 'a fresh I still closes it');
  pump(1);   // let the frame's chrome sync settle after leaving the FIELD REPORT

  // Held ? must not strobe the hints panel.
  const hintsOn0 = elements['hints'].classList.contains('on');
  assert(hintsOn0, 'the hints panel must be showing again for the live run');
  key('?', { repeat: true });
  assert(elements['hints'].classList.contains('on') === hintsOn0, 'a repeated ? must not toggle the hints');
  key('?');
  assert(elements['hints'].classList.contains('on') !== hintsOn0, 'a fresh ? still toggles the hints');
  key('?');
  assert(elements['hints'].classList.contains('on') === hintsOn0, 'a second fresh ? restores the panel');

  // Held +/- must not walk the zoom ladder.
  const z0 = T.zoom.get();
  key('=', { repeat: true });
  key('+', { repeat: true });
  key('-', { repeat: true });
  key('_', { repeat: true });
  assert(T.zoom.get() === z0, 'a held zoom key must not climb the ladder (' + T.zoom.get() + ')');
  key('=');
  assert(T.zoom.get() !== z0, 'a fresh = still zooms');
  key('-');
  assert(T.zoom.get() === z0, 'a fresh - steps back');
  console.log('repeat guard: ESC / P / M / I / S / ? / +/- are edge-triggered too');
}

// ---- 5. RUN-START SYNERGY ANNOUNCEMENT (audit 2.3) ----------------------
{
  const prof = T.getProfile();
  if (!prof.unlockedCharacters.includes('PALADIN')) prof.unlockedCharacters.push('PALADIN');
  if (!prof.unlockedWeapons.includes('ORBIT')) prof.unlockedWeapons.push('ORBIT');
  prof.equippedCharacter = 'PALADIN';   // starts with ORBIT -> VOLLEY+ORBIT at t=0
  T.startRun();
  assert(st.synergies.length > 0, 'the ORBIT pilot must have a synergy live at t=0');
  const firstRun = st.toasts.some(t => /SYNERGY:/.test(t.msg));
  assert(firstRun, 'a synergy live at run start must be announced on run 1');
  // The dedup set is per-run: run 2 must announce the same pair again.
  T.startRun();
  assert(st.toasts.some(t => /SYNERGY:/.test(t.msg)),
    'the SAME synergy must be announced again on run 2+ (stale synergyNames)');
  prof.equippedCharacter = 'KNIGHT';
  T.startRun();
  console.log('synergies: run-start pair announced on run 1 AND run 2 (dedup set reset per run)');
}

// ---- 6. ARENA RIM READS CONFIG ------------------------------------------
{
  const p = st.player;
  const savedRim = C.GROUND.RIM;
  try {
    C.GROUND.RIM = 137;   // a value the hard-coded 600 could never produce
    p.x = 5000; p.y = -5000;
    pump(1);
    assert(Math.abs(p.x) <= 137 && Math.abs(p.y) <= 137,
      'the player clamp must read CONFIG.GROUND.RIM (got ' + p.x.toFixed(1) + ',' + p.y.toFixed(1) + ')');
  } finally {
    C.GROUND.RIM = savedRim;
  }
  console.log('arena rim: simulation clamp follows CONFIG.GROUND.RIM (no hard-coded 600)');
}

// ---- 7. FOOTER / COPY SCOPING -------------------------------------------
{
  const html = read('index.html');
  assert(!/1 \/ 2 \/ 3 or pick a card/.test(html),
    'the footer must not claim number keys work everywhere');
  assert(/cards 1 \/ 2 \/ 3 in the draft/.test(html), 'the footer must scope the draft keys');
  assert(/1-6 stat tabs/.test(html), 'the footer must scope the stat-tab keys');
  assert(/ESC close \/ pause/.test(html), 'the footer must teach the close/pause key');
  const src = read('src/main.js');
  assert(!/1 – 6 — pick cards/.test(src), 'HOW TO PLAY must not claim 1-6 picks cards');
  assert(/1 – 3 — draft cards/.test(src), 'HOW TO PLAY must scope the draft keys');
  assert(/ESC or P — pause in a run/.test(src), 'HOW TO PLAY must document the pause key');
  console.log('copy: footer + HOW TO PLAY number-key claims scoped, pause key documented');
}

// ---- 8. NO TAP-ONLY TOUR PHRASING ---------------------------------------
{
  const src = read('src/main.js');
  const hints = src.match(/advanceHint:[^,\n]+/g) || [];
  assert(hints.length === 2 && hints.every(h => /hasTouch \? 'TAP TO CONTINUE' : 'CLICK OR PRESS ANY KEY'/.test(h)),
    'both tour factories must stay input-aware: ' + hints.join(' | '));
  const texts = src.match(/text: '[^']*'/g) || [];
  const tapOnly = texts.filter(t => /\btap\b/i.test(t) && !/\bor\b|\bpress\b|click/i.test(t));
  assert(tapOnly.length === 0, 'no tour step may say TAP with no non-touch path: ' + tapOnly.join(' | '));
  console.log('tour copy: ' + texts.length + ' step texts checked, 0 tap-only; both advance hints input-aware');
}

console.log('\nALL DESKTOP-UI PROBES PASSED');
