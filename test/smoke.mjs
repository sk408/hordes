// HORDES — headless logic smoke test. Runs the real game loop with a stubbed
// DOM and simulates ~90s of play, asserting the core loop works:
// auto-attack kills enemies, gems are collected, levels are gained,
// drafts appear and picks apply.
import assert from 'node:assert';
import { CONFIG as CFG } from '../src/config.js';

// ---- DOM stubs ----
const noop = () => {};
const fakeCtx = new Proxy({}, {
  get(t, prop) {
    if (prop === 'canvas') return fakeCanvas;
    if (prop === 'fillStyle' || prop === 'globalAlpha') return undefined;
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
    textContent: '', style: {},
    children: [], onclick: null,
    click() { if (this.onclick) this.onclick(); },
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
// Simulate keydown handlers registered by the game.
let keyHandler = null;
globalThis.window = { addEventListener: (_ev, cb) => { keyHandler = cb; } };
let now = 0;
globalThis.performance = { now: () => now };
const rafQueue = [];
globalThis.requestAnimationFrame = (cb) => { rafQueue.push(cb); return rafQueue.length; };
globalThis.location = { reload: noop };

// Import the game (module-level code runs immediately).
await import('../src/main.js');

// Title-mode boot: the game now boots to the title screen; click PLAY to
// start the run (menu buttons are overlay cards, same as draft picks).
{
  const cards = elements['ov-cards'];
  assert(cards && cards.children.length >= 4,
    'title screen should show PLAY/SHOP/CHARACTERS/SETTINGS cards');
  assert(elements['ov-title'] && elements['ov-title'].textContent === 'HORDES',
    'should boot to the HORDES title screen');
  cards.children[0].click();   // PLAY -> startRun()
  const ov = elements['overlay'];
  assert(ov && ov.style.display === 'none', 'PLAY should start the run (hide overlay)');
}

// Simulate 90 seconds at 60fps, auto-picking draft cards (press "1").
const dtMs = 1000 / 60;
const frames = 90 * 60;
let drafts = 0;

// HUD parsers for the skills/potions engagement layer.
const hudText = () => (elements['hud'] ? elements['hud'].textContent : '');
const manaOf = (t) => parseInt(t.match(/MAN \[[#-]+\] (\d+)\/\d+/)[1], 10);
const hpOf = (t) => parseInt(t.match(/HP +\[[#-]+\] (\d+)\/\d+/)[1], 10);
const potOf = (t, k) => parseInt(t.match(new RegExp(k + ':(\\d+)'))[1], 10);
const focusOf = (t) => t.match(/Focus:(?: ?)(\w+)/)[1];
const stanceOf = (t) => t.match(/G:(?: ?)(\w+)/)[1];
const playing = () => {
  const ov = elements['overlay'];
  return !ov || ov.style.display !== 'flex';
};

// Skill/potion interaction checks, driven through the real keydown handler.
let qFrame = -1, manaBeforeQ = -1, manaBeforeN = -1;
let nChecked = false, healChecked = false, healVerified = false, healRetries = 0, healAttempts = 0, healHpBefore = -1;
let doctrineChecked = false;
// Wave-1 integration probe: typed enemies on the field (FOES census line).
let sawTypedEnemy = false;
// Slot-economy + draft probes: fresh profile = 3 weapon slots; grants must
// stop at the cap while level-up cards keep flowing.
let grantCardSeen = false, grantAtCap = false, slotCapSeen = 0;
// Wave-5 enemy probes (soft — spawn gates + behaviors).
let sawTick = false, sawWarlock = false, sawColossus = false;
// Best-run metrics across retries (the sim auto-retries on death; the final
// run may be a short one, so asserts use the BEST run observed live).
let bestKills = 0, bestLevel = 0, bestTime = 0;
// IDLE-PLAYER BUG probe (Sk408): while >10 enemies live, the player must
// never sit at zero velocity for more than 2s (120 frames) — HUD POS probe.
let lastPos = null, stillFrames = 0, maxStillFrames = 0;
const wpnLine = (t) => t.match(/WPN (\d)\/(\d)/) || null;
const isDeathScreen = (cards) => {
  for (let c = 0; c < cards.length; c++) {
    if ((cards[c].innerHTML || '').includes('RETRY')) return true;
  }
  return false;
};
for (let i = 0; i < frames; i++) {
  now += dtMs;
  const cb = rafQueue.shift();
  if (!cb) throw new Error('animation loop died at frame ' + i);
  cb(now);
  const ov = elements['overlay'];
  if (ov && ov.style.display === 'flex' && elements['ov-cards'] &&
      elements['ov-cards'].children.length > 0 && keyHandler) {
    const cards = elements['ov-cards'].children;
    // Death screen: retry (R) so the sim keeps playing; NOT a draft.
    if (isDeathScreen(cards)) { keyHandler({ key: 'r' }); continue; }
    drafts++;
    // Prefer weapon cards (coverage for the megabonk draft wiring): grants
    // first, then level-up cards ('UP ... Lv n/8').
    let key = '1';
    let draftHasGrant = false;
    for (let c = 0; c < cards.length; c++) {
      const html = cards[c].innerHTML || '';
      if (html.includes('NEW WEAPON')) { draftHasGrant = true; break; }
    }
    if (draftHasGrant) grantCardSeen = true;
    // Slot-cap rule: at WPN n/n NO grant card may appear.
    const wl = wpnLine(hudText());
    if (wl) {
      slotCapSeen = +wl[2];
      if (+wl[1] >= +wl[2] && draftHasGrant) grantAtCap = true;
    }
    for (let c = 0; c < cards.length; c++) {
      const html = cards[c].innerHTML || '';
      if (html.includes('NEW WEAPON')) { key = String(c + 1); break; }
      if (/UP<\/div>.*Lv \d\/8/.test(html)) key = String(c + 1);  // keep looking for a grant
    }
    keyHandler({ key });
    continue;
  }

  // Wave probes: typed enemies + the wave-5 trio on the FOES census line.
  {
    const t = hudText();
    const k = t.match(/KILLS (\d+)/), l = t.match(/LVL (\d+)/), s = t.match(/TIME (\d+)s/);
    if (k) bestKills = Math.max(bestKills, +k[1]);
    if (l) bestLevel = Math.max(bestLevel, +l[1]);
    if (s) bestTime = Math.max(bestTime, +s[1]);
    // Velocity-stall probe: zero movement while a real horde is on screen.
    // POS is sub-pixel (x.y) because BERSERK arch drops move speed to 45px/s
    // (0.75px/frame) — integer rounding there made moving players look
    // stalled. Threshold 0.4: any real movement ticks; jitter stays under.
    const pos = t.match(/POS (-?\d+\.\d),(-?\d+\.\d)/);
    const foes = t.match(/FOES (C:\d+ .*?)\n/);
    if (pos && foes) {
      const x = +pos[1], y = +pos[2];
      const total = (foes[1].match(/(\d+)/g) || []).reduce((s2, v) => s2 + +v, 0);
      const moved = lastPos === null ? true : (Math.abs(x - lastPos[0]) + Math.abs(y - lastPos[1])) >= 0.4;
      if (!moved && total > 10) {
        stillFrames++;
        maxStillFrames = Math.max(maxStillFrames, stillFrames);
      } else {
        stillFrames = 0;
      }
      lastPos = [x, y];
    }
  }
  if (!sawTypedEnemy) {
    const m = hudText().match(/FOES C:\d+ S:(\d+) B:(\d+) P:(\d+)/);
    if (m && (+m[1] > 0 || +m[2] > 0 || +m[3] > 0)) sawTypedEnemy = true;
  }
  if (!sawTick || !sawWarlock || !sawColossus) {
    // FOES census order: ... D:n W:n T:n X:n E:n (W=warlock T=tick X=colossus).
    const m = hudText().match(/FOES .*W:(\d+) T:(\d+) X:(\d+)/);
    if (m) {
      if (+m[1] > 0) sawWarlock = true;
      if (+m[2] > 0) sawTick = true;
      if (+m[3] > 0) sawColossus = true;
    }
  }

  // ~1.5s in: cycle the doctrine levers — TAB focus policy (NEAREST ->
  // TOUGHEST -> SWARM -> RANGED -> NEAREST), G stance dial. HUD lags one
  // frame, so assert on the frame after each press.
  if (!doctrineChecked && i === 90 && playing()) {
    const t = hudText();
    assert(focusOf(t) === 'NEAREST', 'default focus should be NEAREST: ' + t);
    assert(stanceOf(t) === 'BALANCED', 'default stance should be BALANCED: ' + t);
    keyHandler({ key: 'Tab', preventDefault: () => {} });
    keyHandler({ key: 'g' });
  } else if (!doctrineChecked && i === 91) {
    const t = hudText();
    assert(focusOf(t) === 'TOUGHEST', 'TAB should cycle focus NEAREST->TOUGHEST: ' + t);
    assert(stanceOf(t) === 'GREEDY', 'G should cycle stance BALANCED->GREEDY: ' + t);
    keyHandler({ key: 'Tab', preventDefault: () => {} });
    keyHandler({ key: 'g' });
  } else if (!doctrineChecked && i === 92) {
    const t = hudText();
    assert(focusOf(t) === 'SWARM', 'TAB should cycle focus TOUGHEST->SWARM: ' + t);
    assert(stanceOf(t) === 'SAFE', 'G should cycle stance GREEDY->SAFE: ' + t);
    keyHandler({ key: 'Tab', preventDefault: () => {} });   // SWARM -> RANGED
  } else if (!doctrineChecked && i === 93) {
    const t = hudText();
    assert(focusOf(t) === 'RANGED', 'TAB should cycle focus SWARM->RANGED: ' + t);
    // Cycle back to defaults so the rest of the run measures base balance.
    keyHandler({ key: 'Tab', preventDefault: () => {} });
    keyHandler({ key: 'g' });
    doctrineChecked = true;
  } else if (doctrineChecked && i === 94) {
    const t = hudText();
    assert(focusOf(t) === 'NEAREST' && stanceOf(t) === 'BALANCED',
      'doctrine should cycle back to defaults: ' + t);
  }

  // ~2s in: fire Frost Nova (Q) — mana must drop and cooldown must show.
  if (qFrame === -1 && i >= 120 && playing()) {
    manaBeforeQ = manaOf(hudText());
    keyHandler({ key: 'q' });
    qFrame = i;
  } else if (qFrame !== -1 && i === qFrame + 1) {
    const t = hudText();
    const m = manaOf(t);
    assert(m <= manaBeforeQ - 29, `Frost Nova should cost ~30 mana (${manaBeforeQ} -> ${m})`);
    assert(/FrostNova \d+\.\d+s/.test(t), 'Frost Nova cooldown should show after use: ' + t);
    // Follow with a mana potion (N) — verified next frame (HUD lags one frame).
    manaBeforeN = m;
    keyHandler({ key: 'n' });
  } else if (qFrame !== -1 && i === qFrame + 2) {
    const t = hudText();
    assert(potOf(t, 'N') === 0, 'mana potion count should drop to 0: ' + t);
    assert(manaOf(t) >= manaBeforeN, 'mana potion should restore mana: ' + t);
    nChecked = true;
  }

  // First time the player is hurt enough that a heal can't cap: drink it (H).
  // Flake fix: prefer hp < max - HP_HEAL (the full heal amount) so the heal
  // can't be capped by max HP; after 70s relax to any hp < max so a
  // well-played run still exercises the potion.
  if (!healChecked && nChecked && i > qFrame + 2 && playing() && !healVerified) {
    const t = hudText();
    const m = t.match(/HP +\[[#-]+\] (\d+)\/(\d+)/);
    const hp = hpOf(t), maxHp = parseInt(m[2], 10);
    const window = i < 70 * 60 ? maxHp - CFG.POTIONS.HP_HEAL : maxHp - 1;
    if (hp < window && potOf(t, 'H') > 0) {
      healHpBefore = hp;
      healAttempts++;
      keyHandler({ key: 'h' });
      healChecked = true; // verify next frame below
    }
  } else if (healChecked && healHpBefore >= 0 && i < frames - 1) {
    const t = hudText();
    // Verify the heal landed. A same-frame contact hit can mask the +50 —
    // retry in a later window instead of failing (bounded).
    if (hpOf(t) > healHpBefore) {
      healVerified = true;
    } else if (++healRetries > 5) {
      assert.fail(`health potion should heal (${healHpBefore} -> ${hpOf(t)})`);
    }
    healChecked = false;
    healHpBefore = -1;
  }
}

// Pull state back out through the HUD text (the loop keeps running in the bg).
const hudAfter = hudText();
assert(hudAfter.includes('KILLS'), 'HUD should render: ' + hudAfter);
console.log('HUD after 90s:', JSON.stringify(hudAfter));

// Skills/potions layer must have been exercised.
assert(qFrame !== -1, 'Frost Nova (Q) should have been fired during the run');
assert(nChecked, 'mana potion (N) should have been used during the run');
// H needs a damage window the player can survive — stochastic. If one never
// opened, skip (log); if it did, the heal MUST have verified.
if (healAttempts > 0) {
  assert(healVerified, 'health potion (H) should have healed the player');
} else {
  console.log('heal check SKIPPED: no survivable damage window opened (H)');
}
assert(doctrineChecked, 'TAB/G doctrine cycling should have been exercised');

// Wave timer must be in the HUD (WAVE n - m:ss, or BOSS!).
assert(/WAVE \d+ - (\d+:\d\d|BOSS!)/.test(hudAfter), 'HUD should show the wave timer: ' + hudAfter);

// IDLE-PLAYER BUG regression: never zero-velocity >2s with a horde alive.
assert(maxStillFrames < 120,
  `player must not idle while enemies swarm (stalled ${maxStillFrames} frames = ` +
  (maxStillFrames / 60).toFixed(1) + 's)');

// RANGED doctrine reach: a 400px-away warlock must be targetable (Sk408
// bug: the 260px FOCUS_RANGE left off-screen warlocks free-firing).
{
  const { AutoPilotController } = await import('../src/controllers.js');
  const ctl = new AutoPilotController();
  ctl.focus = 'RANGED';
  const p = { x: 0, y: 0 };
  const warlock = { typeId: 'WARLOCK', x: 400, y: 0, hp: 10, maxHp: 10 };
  const chaser = { typeId: 'CHASER', x: 20, y: 0, hp: 10, maxHp: 10 };
  const st = { enemies: [warlock, chaser], gems: [] };
  const t = ctl.pickTarget(p, st, null, chaser);
  assert(t === warlock, 'RANGED focus must target a 400px warlock over a 20px chaser');
  // Other doctrines keep the 260 cap: NEAREST still picks the close chaser.
  ctl.focus = 'NEAREST';
  assert(ctl.pickTarget(p, st, null, chaser) === chaser, 'NEAREST keeps the close target');
}

// Weather system: every run rolls one; the HUD must show it.
{
  const m = hudAfter.match(/WEATHER: (\w+)/);
  assert(m, 'HUD should show a WEATHER line: ' + hudAfter);
  console.log('weather rolled: ' + m[1]);
}

// Loot layer (wave-6): the ITEMS line must always render (0/4 when nothing
// is equipped yet).
assert(/ITM \d\/4/.test(hudAfter), 'HUD should show the ITEMS line: ' + hudAfter);

// ESCALATION: keep simulating up to 180s — the wave-1 boss spawns at 120s.
// Opportunistic (the player may die first): observe BOSS! + boss resolution.
// Wave-6 portal progression: boss death opens the portal; walking in shows
// the WAVE CLEARED intermission (key 1 = CONTINUE, same seam as drafts).
let bossSeen = false, waveTwoSeen = false, intermissionSeen = false;
for (let i = frames; i < 180 * 60; i++) {
  now += dtMs;
  const cb = rafQueue.shift();
  if (!cb) break;
  cb(now);
  const t = hudText();
  if (/WAVE 1 - BOSS!/.test(t)) bossSeen = true;
  if (/WAVE 2 - /.test(t)) { waveTwoSeen = true; break; }
  // Wave-5 trio probes during the extension (soft — the player may die).
  const fm = t.match(/FOES .*W:(\d+) T:(\d+) X:(\d+)/);
  if (fm) {
    if (+fm[1] > 0) sawWarlock = true;
    if (+fm[2] > 0) sawTick = true;
    if (+fm[3] > 0) sawColossus = true;
  }
  const ov = elements['overlay'];
  if (ov && ov.style.display === 'flex' && elements['ov-cards'] &&
      elements['ov-cards'].children.length > 0) {
    // Death screen (RETRY/TITLE): retry. Intermission ('CLEARED' title):
    // press 1 = CONTINUE into wave 2. Otherwise a draft — pick card 1.
    const cards = elements['ov-cards'].children;
    let death = false;
    for (let c = 0; c < cards.length; c++) {
      if ((cards[c].innerHTML || '').includes('RETRY')) death = true;
    }
    const inter = /CLEARED/.test((elements['ov-title'] || {}).textContent || '');
    if (death && keyHandler) keyHandler({ key: 'r' });
    else if (keyHandler) {
      keyHandler({ key: '1' });
      if (inter) intermissionSeen = true;
    }
  }
}
console.log(`boss seen=${bossSeen} wave2 seen=${waveTwoSeen}`);
console.log(`portal progression (soft): intermissionSeen=${intermissionSeen}`);

// Wave-1 integration: typed enemies in the mix, or a weapon beyond the base
// volley acquired via the draft (weapons appear as draft cards).
const wpnCount = parseInt(hudAfter.match(/WPN (\d)/)[1], 10);
assert(sawTypedEnemy || wpnCount > 1,
  'wave-1 content should be live (typed enemies seen=' + sawTypedEnemy +
  ', weapons=' + wpnCount + ')');
console.log(`wave-1: typedEnemiesSeen=${sawTypedEnemy} weapons=${wpnCount}`);
console.log(`wave-5 trio (soft): tick=${sawTick} warlock=${sawWarlock} colossus=${sawColossus}`);

// Slot economy: fresh profile => 3 slots (WEAPON_SLOT_START). The run must
// respect the cap and never offer a grant card once WPN n/n is showing.
assert(slotCapSeen === 3, `fresh profile should start with 3 weapon slots (saw ${slotCapSeen})`);
assert(!grantAtCap, 'grant cards must NOT appear once the weapon slots are full');
assert(grantCardSeen, 'a NEW WEAPON grant card should appear while slots are free');
assert(wpnCount <= 3, `weapon count must respect the slot cap (${wpnCount}/3)`);

// Megabonk probe (soft): any weapon leveled past 1 shows as 'Name·N' in the
// WPN line. Gems (1 XP each) + boss kills (30 XP) + level-up draft cards make
// this near-certain by 90s, but it stays a log line, not an assert.
const leveled = (hudAfter.match(/WPN \d\/\d+ ([^\n]*)/)[1] || '').match(/\u00b7\d/g);
console.log(`megabonk: leveled-weapon markers=${leveled ? leveled.length : 0}`);

// After 90s of auto-play the best run must have killed things and leveled.
const kills = bestKills, level = bestLevel, time = bestTime;
console.log(`best run: kills=${kills} level=${level} time=${time}s drafts=${drafts}`);
assert(drafts >= 1, 'draft overlay should have appeared (drafts=' + drafts + ')');
assert(kills > 10, 'auto-attack should be killing enemies (kills=' + kills + ')');
assert(level >= 2, 'player should have leveled at least once (level=' + level + ')');
assert(time >= 45, 'auto-mover should survive a meaningful run (time=' + time + 's; balance TODO if low)');

console.log('SMOKE TEST PASSED');
