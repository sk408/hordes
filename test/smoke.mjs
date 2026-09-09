// HORDES — headless logic smoke test. Runs the real game loop with a stubbed
// DOM and simulates ~90s of play, asserting the core loop works:
// auto-attack kills enemies, gems are collected, levels are gained,
// drafts appear and picks apply.
import assert from 'node:assert';
import { CONFIG as CFG } from '../src/config.js';
import { heatOf, manualPushes, heatMultipliers, addHeat } from '../src/heat.js';
import { groundTheme } from '../src/render.js';
import { CINE_DURATION } from '../src/portal_cine.js';   // hb8: wall-clock (CINE_SPEED)
import { makeWeapon } from '../src/weapons.js';
import { rollEliteModifier, applyEliteModifier } from '../src/elite_mods.js';

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

// Import the game (module-level code runs immediately). __TEST is the
// headless state seam (see main.js) — integration probes below use it.
const mainMod = await import('../src/main.js');
const st = mainMod.__TEST.state;

// ---- WAVE-7/D intro movie: plays BEFORE the title menu on page load ----
// Pump rAF frames until the 7s movie finishes and the menu lands. Skipping
// is exercised separately at the end of the file (fresh module re-import).
const dtMs = 1000 / 60;
{
  let introFrames = 0;
  for (; introFrames < 60 * 10; introFrames++) {
    now += dtMs;
    const cb = rafQueue.shift();
    if (!cb) break;
    cb(now);
    if (elements['ov-title'] && elements['ov-title'].textContent === 'HORDES' &&
        elements['ov-cards'] && elements['ov-cards'].children.length >= 4) break;
  }
  assert(elements['ov-title'] && elements['ov-title'].textContent === 'HORDES',
    'intro should hand off to the HORDES title screen');
  assert(elements['ov-cards'] && elements['ov-cards'].children.length >= 4,
    'title screen should show PLAY/SHOP/CHARACTERS/SETTINGS cards after intro');
  assert(introFrames > 60 * 6, `intro movie should run most of its 7s (frames=${introFrames})`);
  console.log(`intro: played ${introFrames} frames before the menu`);
}

// Sk408 bug regression: RESET PROFILE must actually wipe. The arm flag used
// to be cleared by its own re-render, so the confirm click never fired.
{
  const gp = mainMod.__TEST.getProfile;
  if (gp) {
    gp().gold = 777;   // dirty the profile so the wipe is observable
    const cards = elements['ov-cards'];
    const byTitle = (t) => Array.from(cards.children)
      .find(c => (c.innerHTML || '').includes(t));
    byTitle('SETTINGS').click();
    const r1 = byTitle('RESET PROFILE');
    assert(r1, 'settings should show a RESET PROFILE card');
    r1.click();
    const confirm = byTitle('CONFIRM RESET?');
    assert(confirm, 'first reset click should ARM the CONFIRM RESET? card');
    confirm.click();
    assert(gp().gold === 0, `RESET should wipe gold (got ${gp().gold})`);
    console.log('settings probe: RESET PROFILE armed + wiped gold');
    byTitle('BACK').click();
  }
}

// Title-mode boot: click PLAY to start the run (menu buttons are overlay
// cards, same as draft picks).
{
  const cards = elements['ov-cards'];
  cards.children[0].click();   // PLAY -> startRun()
  const ov = elements['overlay'];
  assert(ov && ov.style.display === 'none', 'PLAY should start the run (hide overlay)');
}

// Simulate 90 seconds at 60fps, auto-picking draft cards (press "1").
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
    // WAVE-8/9: intended freezes (portal cine, overlays) are not stalls —
    // only count frames while the loop is actually simulating play.
    if (st.mode !== 'playing') { stillFrames = 0; lastPos = null; }
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
// WAVE-7: capture the NAMED boss announce (GRAVELMAW/CHOIR/PYRAXIS) and, at
// the first intermission, take one blessing/curse card before continuing.
let bossSeen = false, waveTwoSeen = false, intermissionSeen = false;
let bossNamesSeen = '', choiceTaken = false;
for (let i = frames; i < 180 * 60; i++) {
  now += dtMs;
  const cb = rafQueue.shift();
  if (!cb) break;
  cb(now);
  const t = hudText();
  if (/WAVE 1 - BOSS!/.test(t)) bossSeen = true;
  if (/WAVE 2 - /.test(t)) { waveTwoSeen = true; break; }
  if (!bossNamesSeen) {
    const names = (st.wave.bosses || []).map(b => b.name).filter(Boolean).join('+');
    if (names) bossNamesSeen = names;
  }
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
      if (inter && !choiceTaken) {
        // WAVE-7/C: take the first blessing/curse card (applyChoice mutates
        // the run-scoped player; the overlay re-renders without it).
        for (let c = 0; c < cards.length; c++) {
          if ((cards[c].innerHTML || '').includes('BLESSING')) { cards[c].click(); choiceTaken = true; break; }
        }
      }
      keyHandler({ key: '1' });
      if (inter) intermissionSeen = true;
    }
  }
}
console.log(`boss seen=${bossSeen} wave2 seen=${waveTwoSeen}`);
console.log(`portal progression (soft): intermissionSeen=${intermissionSeen}`);
if (choiceTaken) {
  assert(st.takenChoices.length === 1 && st.player.choices,
    'blessing card should applyChoice onto the run-scoped player');
  console.log(`choice taken: ${st.takenChoices[0]} fields=${Object.keys(st.player.choices).join(',')}`);
} else {
  console.log('choice card check SKIPPED: no intermission opened (soft)');
}
if (bossSeen) {
  assert(/GRAVELMAW|CHOIR|PYRAXIS/.test(bossNamesSeen),
    `a seen boss must be NAMED (got '${bossNamesSeen}')`);
  console.log('named boss announce (HUD probes): ' + bossNamesSeen);
}

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

// ---- WAVE-7 forced probes (through the real loop) ----
// (1) NAMED BOSS: force the wave-1 boss spawn (wave timer expiry) and verify
// the named cast + intents wiring through live state.
{
  // Reset to a clean playing run (the sim may be dead / on the title menu).
  mainMod.__TEST.startRun();
  for (let i = 0; i < 5; i++) { now += dtMs; const cb = rafQueue.shift(); cb && cb(now); }
  // Wave 1 boss fires when the wave timer expires with no portal open.
  st.wave.endsAt = st.time;   // expire NOW: the boss spawns on the next tick
  let named = '', intents = 0;
  for (let i = 0; i < 60 * 60; i++) {   // up to 60s of boss fight
    now += dtMs;
    const cb = rafQueue.shift();
    if (!cb) throw new Error('raf died in boss probe');
    cb(now);
    if (!named) {
      const names = (st.wave.bosses || []).map(b => b.name).filter(Boolean).join('+');
      if (names) named = names;
    }
    // Any of the extra boss intent flags firing (telegraph/charge/nova/...).
    if (st.enemies.some(e => e.boss && (e.telegraph || e.charging || e.recovering))) intents++;
    if (named && intents > 30) break;   // boss cast + pattern brain exercised
  }
  assert(/GRAVELMAW|CHOIR|PYRAXIS/.test(named), 'boss probe must see a NAMED boss (got ' + named + ')');
  assert(intents > 30, 'boss pattern brain must fire intents (' + intents + ' frames)');
  console.log(`boss probe: ${named} (intent frames: ${intents})`);
}

// (2) EVOLUTION: Lv8 VOLLEY + crit item + token via the real evolve overlay.
{
  mainMod.__TEST.startRun();
  for (let i = 0; i < 5; i++) { now += dtMs; const cb = rafQueue.shift(); cb && cb(now); }
  const volley = st.weapons.find(w => w.type === 'VOLLEY');
  volley.level = 8;   // maxed
  // Equip an item whose affix id is the NOVA_SHOT item kind ('crit').
  st.items.push({
    id: 'probe_crit', name: 'Probe Eye', rarity: 'RARE',
    affixes: [{ id: 'crit', name: 'Keen Eye', field: 'crit', magnitude: 0.08 }],
  });
  st.evoTokens = 1;
  let evolved = false;
  for (let i = 0; i < 30 && !evolved; i++) {
    now += dtMs;
    const cb = rafQueue.shift();
    if (!cb) throw new Error('raf died in evolve probe');
    cb(now);
    if (st.mode === 'evolve') {
      const cards = elements['ov-cards'].children;
      assert(cards.length >= 1, 'evolve overlay must offer the EVOLVE card');
      assert((cards[0].innerHTML || '').includes('Nova Shot'),
        'evolve card should offer Nova Shot: ' + cards[0].innerHTML);
      cards[0].click();
      evolved = true;
    }
  }
  assert(evolved, 'the EVOLVE overlay must open (Lv8 + crit item + token)');
  assert(volley.evolutionId === 'NOVA_SHOT', 'volley must be NOVA_SHOT after evolving');
  assert(st.evoTokens === 0, 'evolution must spend the token');
  // WAVE-9: a weapon EVOLUTION charges +2 heat, and the HUD carries the line.
  assert(heatOf(st) === 2, 'an evolution must charge +2 heat (got ' + heatOf(st) + ')');
  assert(manualPushes(st) === 0, 'built-in heat must NOT touch the manual gold dial');
  for (let i = 0; i < 10; i++) { now += dtMs; const cb = rafQueue.shift(); cb && cb(now); }
  assert(/Nova Shot/.test(hudText()), 'HUD must show the evolved weapon name');
  assert(/HEAT 2 /.test(hudText()), 'HUD must carry the HEAT line near WEATHER');
  console.log('evolution probe: VOLLEY -> Nova Shot (token spent, +2 heat, HUD updated)');
}

// (3) RUN-SCOPE RESET: a fresh run must drop every WAVE-7 run-scoped field.
{
  mainMod.__TEST.startRun();
  assert(st.evoTokens === 0, 'run reset must clear evoTokens');
  assert(!st.player.choices, 'run reset must drop player.choices');
  assert(st.takenChoices.length === 0, 'run reset must clear takenChoices');
  assert(st.pendingChoiceOffers === null, 'run reset must clear pendingChoiceOffers');
  const volley = st.weapons.find(w => w.type === 'VOLLEY');
  assert(volley && !volley.evolutionId, 'fresh run VOLLEY must be un-evolved');
  assert(heatOf(st) === 0 && manualPushes(st) === 0, 'run reset must clear the heat ledger');
  // WAVE-11 run-scoped companions reset too.
  assert(st.lastFlashAt === null, 'run reset must clear lastFlashAt');
  assert(st.rampage.streak === 0 && st.rampage.best === 0, 'run reset must clear the rampage meter');
  assert(st.shrineRng && st.shrine !== undefined, 'run must seed the shrine rng stream');
  console.log('run-scope reset: choices/tokens/evolutions/heat/rampage/flash/shrine all cleared');
}

// ---- WAVE-8/A portal-entry cinematic ----
// Force the wave-1 boss, slay the cast, and verify the movie plays between
// the kill and the intermission; then the skip path, then the natural end.
{
  // Click through draft/evolve overlays the boss-XP payout may open, until
  // the predicate holds (or the loop gives up). Never mutates game state.
  function pumpUntil(pred, maxFrames, onFrame) {
    for (let i = 0; i < maxFrames; i++) {
      now += dtMs;
      const cb = rafQueue.shift();
      if (!cb) throw new Error('raf died in cine pump');
      cb(now);
      if (st.mode === 'draft') {
        const c0 = elements['ov-cards'].children[0]; c0 && c0.click(); continue;
      }
      if (st.mode === 'evolve') {
        const kids = elements['ov-cards'].children;
        kids[kids.length - 1] && kids[kids.length - 1].click();   // NOT NOW
        continue;
      }
      if (onFrame) onFrame(i);
      if (pred()) return i;
    }
    return -1;
  }
  function forceBossDeath() {
    st.wave.endsAt = st.time;   // boss spawns on the next tick
    pumpUntil(() => (st.wave.bosses || []).some(b => b.hp > 0), 60 * 30);
    assert(st.wave.bosses && st.wave.bosses.some(b => b.hp > 0),
      'cine probe needs a live boss cast');
    // Push the expiry forward BEFORE slaying: with endsAt still in the past,
    // spawnBoss would re-fire next frame (its !wave.boss guard reads hp>0)
    // and a fresh live boss would block the final-death detection.
    st.wave.endsAt = st.time + 60 * 60;
    for (const b of st.wave.bosses) if (b.hp > 0) b.hp = 0;   // slay them all
  }

  // (a) SKIP PATH: movie renders frames, a keypress jumps to the intermission.
  mainMod.__TEST.startRun();
  for (let i = 0; i < 5; i++) { now += dtMs; const cb = rafQueue.shift(); cb && cb(now); }
  forceBossDeath();
  let cineFrames = 0, skipped = false;
  pumpUntil(() => st.mode === 'intermission', 60 * 20, () => {
    if (st.mode === 'portal-cine' && ++cineFrames === 31) {
      keyHandler({ key: 'x' });   // any key skips straight to the end
      skipped = true;
    }
  });
  assert(skipped, 'cine skip path must be exercised');
  assert(cineFrames >= 31, `the movie must render before the skip (${cineFrames} frames)`);
  assert(st.mode === 'intermission', 'skip must land in the intermission (mode=' + st.mode + ')');
  assert(elements['ov-title'].textContent.includes('CLEARED'),
    'intermission title after the cine (got ' + elements['ov-title'].textContent + ')');
  console.log(`portal cine: ${cineFrames} frames then key-skip -> intermission`);

  // (b) NATURAL END: let the 3.8s movie run out on its own -> intermission.
  keyHandler({ key: 'c' });   // CONTINUE into wave 2
  assert(st.mode === 'playing', 'CONTINUE should resume play (mode=' + st.mode + ')');
  // WAVE-9B/2: the wave-2 announce toast names the new AREA (HUD lags a frame).
  now += dtMs; const cbT = rafQueue.shift(); cbT && cbT(now);
  assert(/WAVE 2 - THE ASHEN WASTE/.test(hudText()),
    'the wave toast must announce the theme: ' + hudText());
  forceBossDeath();
  cineFrames = 0;
  const took = pumpUntil(() => st.mode === 'intermission', 60 * 20,
    () => { if (st.mode === 'portal-cine') cineFrames++; });
  assert(took >= 0, 'the movie must hand off to the intermission on its own');
  assert(cineFrames >= Math.ceil(CINE_DURATION / dtMs) - 2,
    `the 3.8s movie should run to isDone (${cineFrames} frames)`);
  console.log(`portal cine: natural end after ${cineFrames} frames -> intermission`);

  // (c) WAVE-9 RAISE THE STAKES: manual push +1 heat, +30% gold per push,
  // card re-renders with the NEXT gold mult and hides at HEAT_CAP.
  {
    const findStakes = () => elements['ov-cards'].children
      .find(c => (c.innerHTML || '').includes('RAISE THE STAKES'));
    const stakes = findStakes();
    assert(stakes, 'the intermission must offer the RAISE THE STAKES card');
    assert((stakes.innerHTML || '').includes('gold x1.3'),
      'the card must sell the NEXT gold mult (x1.3): ' + stakes.innerHTML);
    const heatBefore = heatOf(st);
    stakes.click();
    assert(heatOf(st) === heatBefore + 1 && manualPushes(st) === 1,
      'a manual push must add +1 heat and manual=1');
    const again = findStakes();
    assert(again && (again.innerHTML || '').includes('gold x1.6'),
      'the re-rendered card must pitch the NEXT push (x1.6)');
    // Clamp: keep clicking the card (each click re-renders) — it must
    // disappear once the ledger sits at HEAT_CAP.
    let clicks = 0;
    for (let i = 0; i < 25 && findStakes(); i++) { findStakes().click(); clicks++; }
    assert(!findStakes(), 'RAISE THE STAKES must be hidden at HEAT_CAP');
    assert(heatOf(st) === 20, `heat must clamp at HEAT_CAP (got ${heatOf(st)})`);
    assert(manualPushes(st) === 1 + clicks,
      `every card click is one manual push (manual ${manualPushes(st)}, clicks ${1 + clicks})`);
    console.log('heat dial: +1 heat per push, gold x1.3 -> x1.6 pitched, card clamped at cap');
  }
}

// ---- WAVE-9 heat + WAVE-11 best-case equip: EXCHANGE is free (in-place ----
// REPLACE of the weakest), IGNORE leaves the drop, EMPTY-slot equip +1 heat.
{
  mainMod.__TEST.startRun();
  for (let i = 0; i < 5; i++) { now += dtMs; const cb = rafQueue.shift(); cb && cb(now); }
  // Belt to 4/4 with dummy items (all COMMON, score 1 — first-weakest wins
  // ties at slot 0), then drop a strictly better newcomer on the player.
  st.items.length = 0;
  for (let i = 0; i < 4; i++) {
    st.items.push({ id: 'old' + i, name: 'Old ' + i, rarity: 'COMMON', affixes: [] });
  }
  const newcomer = { id: 'newcomer', name: 'Newcomer', rarity: 'RARE', affixes: [] };
  st.itemDrops.push({ x: st.player.x, y: st.player.y, item: newcomer, age: 0 });
  for (let i = 0; i < 10; i++) { now += dtMs; const cb = rafQueue.shift(); cb && cb(now); }
  assert(st.items.length === 4, 'the exchange keeps the belt at 4/4');
  assert(st.items[0] === newcomer && !st.items.some(it => it.id === 'old0'),
    'a strictly better drop REPLACES the weakest slot IN PLACE (slot 0)');
  assert(heatOf(st) === 0, 'an item EXCHANGE at 4/4 must add NO heat (got ' + heatOf(st) + ')');
  // IGNORE: an equal-score drop is left on the ground (no churn, no heat).
  const junk = { id: 'junk', name: 'Junk', rarity: 'COMMON', affixes: [] };
  st.itemDrops.push({ x: st.player.x, y: st.player.y, item: junk, age: 0 });
  for (let i = 0; i < 10; i++) { now += dtMs; const cb = rafQueue.shift(); cb && cb(now); }
  assert(st.itemDrops.some(d => d.item === junk),
    'an equal-score drop must stay on the ground (IGNORE)');
  assert(!st.items.some(it => it.id === 'junk'), 'the ignored drop must NOT equip');
  assert(heatOf(st) === 0, 'an ignored drop adds no heat');
  // Free the last slot and drop another: an empty-slot equip charges +1.
  st.items.pop();
  const second = { id: 'second', name: 'Second', rarity: 'RARE', affixes: [] };
  st.itemDrops.push({ x: st.player.x, y: st.player.y, item: second, age: 0 });
  for (let i = 0; i < 10; i++) { now += dtMs; const cb = rafQueue.shift(); cb && cb(now); }
  assert(st.items[st.items.length - 1] === second, 'the free-slot drop must equip');
  assert(heatOf(st) === 1, 'an equip into an EMPTY slot must charge +1 heat (got ' + heatOf(st) + ')');
  console.log('heat charges: in-place REPLACE +0, IGNORE stays on the ground, empty-slot equip +1 — verified');
}

// ---- WAVE-9 heat: enemy HP visibly scales at spawn -------------------------
// Fresh run (t~0: no elites, variants are palette-only) — same typeId spawns
// carry identical base hp, so the only delta between the two windows is heat.
{
  mainMod.__TEST.startRun();
  for (let i = 0; i < 5; i++) { now += dtMs; const cb = rafQueue.shift(); cb && cb(now); }
  const spawnOnce = (typeId) => {
    st.enemies.length = 0; st.itemDrops.length = 0;
    st.spawnTimer = 0;
    now += dtMs; const cb = rafQueue.shift(); cb && cb(now);
    return st.enemies.find(e => e.typeId === typeId) || null;
  };
  // Baseline: whatever type spawns first at heat 0.
  st.enemies.length = 0; st.spawnTimer = 0;
  now += dtMs; const cb0 = rafQueue.shift(); cb0 && cb0(now);
  const T = st.enemies[0].typeId;
  const base = st.enemies[0].maxHp;
  // Force heat to 10 (+120% foe hp), re-spawn until the same type shows up.
  for (let i = 0; i < 10; i++) addHeat(st, 'MANUAL_PUSH');
  assert(heatOf(st) === 10, 'forced heat 10 for the spawn probe');
  let hot = null;
  for (let i = 0; i < 40 && !hot; i++) hot = spawnOnce(T);
  assert(hot, 'a ' + T + ' must respawn within the probe window');
  const want = heatMultipliers(10, 10).hp / heatMultipliers(0, 0).hp;   // 2.2
  assert(Math.abs(hot.maxHp / base - want) < 0.01,
    `heat 10 must scale foe hp x${want} (base ${base}, hot ${hot.maxHp})`);
  console.log(`heat scaling: ${T} hp ${base} -> ${hot.maxHp} (x${(hot.maxHp / base).toFixed(2)} at heat 10)`);
}

// ---- WAVE-11 probes (through the real loop) ----
// (a) SHRINE PURCHASE: proximity + gold buys one blessing; purse debited via
// the real update() shrine block (paid-chest precedent — profile-side gold).
{
  mainMod.__TEST.startRun();
  for (let i = 0; i < 5; i++) { now += dtMs; const cb = rafQueue.shift(); cb && cb(now); }
  mainMod.__TEST.getProfile().gold = 100;
  const choicesBefore = st.takenChoices.length;
  st.shrine = { x: st.player.x, y: st.player.y, used: false };
  for (let i = 0; i < 30 && !st.shrine.used; i++) {
    now += dtMs; const cb = rafQueue.shift(); cb && cb(now);
  }
  assert(st.shrine.used === true, 'the shrine must complete the purchase (used flag)');
  assert(mainMod.__TEST.getProfile().gold === 40,
    `the shrine must debit its cost from the purse (got ${mainMod.__TEST.getProfile().gold}, want 40)`);
  assert(st.takenChoices.length === choicesBefore + 1,
    'the shrine blessing must be recorded repeat-free in takenChoices');
  assert(st.player.choices, 'the shrine blessing must applyChoice onto the run player');
  console.log('shrine: proximity purchase — 60 gold, blessing applied, altar marked used');
}

// (b) ELITE MODS: strict unlock gating (pure roll) + the death split + the
// guaranteed item drop, through the real death loop.
{
  // Gating: locked modifiers NEVER roll (empty unlock set -> plain elite).
  assert.strictEqual(rollEliteModifier(() => 0, []), null,
    'no unlocked elite mods => the roll must fail');
  assert.strictEqual(rollEliteModifier(() => 0.9, ['SWIFT']), null,
    'the 0.5 chance roll can fail => plain elite');
  const rolled = rollEliteModifier(() => 0, ['SPLITTING']);
  assert(rolled && rolled.id === 'SPLITTING', 'an unlocked mod rolls when the flip lands');

  mainMod.__TEST.startRun();
  for (let i = 0; i < 5; i++) { now += dtMs; const cb = rafQueue.shift(); cb && cb(now); }
  // Craft a SPLITTING elite near (not on) the player and slay it.
  const px = st.player.x, py = st.player.y - 80;
  const parent = { typeId: 'CHASER', x: px, y: py, hp: 100, maxHp: 100, w: 10, h: 10,
    speed: 0, xp: 1, age: 0, elite: true, splitSpent: false };
  Object.assign(parent, applyEliteModifier(parent, 'SPLITTING'));
  assert(parent.eliteMod === 'SPLITTING' && parent.split && !parent.split.spent,
    'the SPLITTING stamp carries the once-only split plan');
  st.enemies.push(parent);
  const dropsBefore = st.itemDrops.length;
  parent.hp = 0;   // reaped by the next death pass
  for (let i = 0; i < 3; i++) { now += dtMs; const cb = rafQueue.shift(); cb && cb(now); }
  const kids = st.enemies.filter(e => e !== parent &&
    Math.abs(e.x - px) <= 13 && Math.abs(e.y - py) <= 8);
  assert(kids.length === 2, `a slain SPLITTING elite must divide into TWO children (got ${kids.length})`);
  for (const k of kids) {
    assert(k.eliteMod === null && k.elite === false, 'split children are PLAIN (no recursion)');
    assert(Math.abs(k.maxHp - parent.maxHp * 0.3) < 1e-9,
      `children carry 30% of the parent hp (got ${k.maxHp})`);
  }
  assert(!st.enemies.includes(parent), 'the parent must be gone after the split');
  assert(st.itemDrops.length > dropsBefore,
    'an elite-mod kill must guarantee an item drop');
  console.log('elite mods: gating strict, split into 2 plain children @30% hp, guaranteed drop');
}

// (c) SYNERGIES: refreshSynergies detects the pair, announces it, and the
// orbital flag tags real volley projectiles in flight.
{
  mainMod.__TEST.startRun();
  for (let i = 0; i < 5; i++) { now += dtMs; const cb = rafQueue.shift(); cb && cb(now); }
  st.weapons.push(makeWeapon('ORBIT'));
  mainMod.__TEST.refreshSynergies();
  const orb = st.synergies.find(s => 'orbitVolley' in (s.flags || {}));
  assert(orb, 'VOLLEY+ORBIT must detect the Orbital Volley synergy');
  assert(st.toasts.some(t => /SYNERGY:/.test(t.msg)),
    'a newly detected synergy must toast its announce');
  // A target in range makes the controller fire volley shots — they must now
  // carry the orbit flight state for their first ~0.55s.
  st.enemies.push({ typeId: 'CHASER', x: st.player.x + 40, y: st.player.y,
    hp: 500, maxHp: 500, w: 10, h: 10, speed: 0, xp: 1, age: 0 });
  let tagged = false;
  // The volley cooldown (~0.5s) means the first post-synergy shot can take
  // ~30 frames — pump well past it (a stray pre-synergy shot may persist).
  for (let i = 0; i < 75 && !tagged; i++) {
    now += dtMs; const cb = rafQueue.shift(); cb && cb(now);
    tagged = st.projectiles.some(pr => pr.orbit);
  }
  assert(tagged, 'fired volley shots must be orbit-tagged while Orbital Volley is live');
  console.log('synergies: Orbital Volley detected + announced + volley shots orbit-tagged');
}

// (d) RAMPAGE METER: kills extend the streak; ANY hp loss resets it.
{
  mainMod.__TEST.startRun();
  for (let i = 0; i < 5; i++) { now += dtMs; const cb = rafQueue.shift(); cb && cb(now); }
  st.rampage.streak = 10; st.rampage.best = 10;
  st.player.invuln = 0;
  st.enemies.push({ typeId: 'CHASER', x: st.player.x, y: st.player.y,
    hp: 500, maxHp: 500, w: 10, h: 10, speed: 0, xp: 1, age: 0 });
  now += dtMs; const cb1 = rafQueue.shift(); cb1(now);
  assert(st.rampage.streak === 0,
    `a contact hit must reset the rampage streak (got ${st.rampage.streak})`);
  assert(st.rampage.best === 10, 'the reset must NOT touch the run-best streak');
  // A kill bumps the streak back up through the real death pass.
  const victim = st.enemies.find(e => e.hp > 0 && e.typeId === 'CHASER');
  victim.hp = 0;
  now += dtMs; const cb2 = rafQueue.shift(); cb2(now);
  assert(st.rampage.streak === 1, 'a kill must extend the fresh streak (+1)');
  assert(/RP \d+ \(x1\.0\d\)/.test(hudText()) || /RP \d/.test(hudText()),
    'the HUD must carry the rampage readout: ' + hudText());
  console.log('rampage: hit resets the streak (best kept), kill re-extends, HUD reads out');
}

// (e) FLASH DROPS: a flash-eligible kill erases EXACTLY the weakest trash
// tier present — elites/typed-beyond-trash untouched, cooldown stamped.
{
  mainMod.__TEST.startRun();
  for (let i = 0; i < 5; i++) { now += dtMs; const cb = rafQueue.shift(); cb && cb(now); }
  st.lastFlashAt = null;
  const mkE = (typeId, elite, dx, dy) => ({ typeId, x: st.player.x + dx, y: st.player.y + dy,
    hp: 50, maxHp: 50, w: 10, h: 10, speed: 0, xp: 1, age: 0, elite: !!elite });
  const sw1 = mkE('SWARMER', false, -120, -60);
  const sw2 = mkE('SWARMER', false, -140, -60);
  const brute = mkE('BRUTE', false, 120, 60);
  const eliteSw = mkE('SWARMER', true, 140, 60);
  st.enemies.push(sw1, sw2, brute, eliteSw);
  // The eligible CHASER kill lands LAST so this frame's death pass reaches it.
  const chaser = mkE('CHASER', false, 0, -100);
  chaser.hp = 0;
  st.enemies.push(chaser);
  const realRandom = Math.random;
  Math.random = () => 0;   // the flash roll always succeeds; cooldown clear
  now += dtMs; const cbF = rafQueue.shift(); cbF(now);
  Math.random = realRandom;
  assert(st.lastFlashAt !== null, 'the flash must stamp the cooldown (lastFlashAt)');
  assert(st.effects.some(fx => fx.kind === 'flash'), 'the flash must push its screen moment fx');
  assert(!st.enemies.includes(sw1) && !st.enemies.includes(sw2) && !st.enemies.includes(chaser),
    'the flash must reap BOTH plain swarmers + the triggering chaser');
  assert(st.enemies.includes(brute) && brute.hp > 0,
    'typed-beyond-trash (BRUTE) must be UNTOUCHED by the flash');
  assert(st.enemies.includes(eliteSw) && eliteSw.hp > 0,
    'an ELITE swarmer must be UNTOUCHED by the flash');
  console.log('flash drop: weakest trash tier reaped, brute + elite swarmer untouched, cooldown stamped');
}

// ---- WAVE-10 FINALE: force the END_WAVE boss, ride the portal cine into ----
// the finale, then verify the field sweep, the silent spawner, the volley
// mercy rule, the 3-hit rule and the distinct end screen.
{
  const pump = (pred, maxFrames, onFrame) => {
    for (let i = 0; i < maxFrames; i++) {
      now += dtMs;
      const cb = rafQueue.shift();
      if (!cb) throw new Error('raf died in finale pump');
      cb(now);
      if (st.mode === 'draft') {
        const c0 = elements['ov-cards'].children[0]; c0 && c0.click(); continue;
      }
      if (st.mode === 'evolve') {
        const kids = elements['ov-cards'].children;
        kids[kids.length - 1] && kids[kids.length - 1].click(); continue;
      }
      if (onFrame) onFrame(i);
      if (pred()) return i;
    }
    return -1;
  };

  mainMod.__TEST.startRun();
  for (let i = 0; i < 5; i++) { now += dtMs; const cb = rafQueue.shift(); cb && cb(now); }
  // Jump straight to the END_WAVE fight and slay the cast.
  st.wave.num = CFG.ESCALATION.END_WAVE;
  st.wave.endsAt = st.time;   // boss spawns on the next tick
  pump(() => (st.wave.bosses || []).some(b => b.hp > 0), 60 * 30);
  assert(st.wave.bosses && st.wave.bosses.some(b => b.hp > 0),
    'finale probe needs a live END_WAVE cast');
  st.wave.endsAt = st.time + 120 * 60;   // block spawnBoss re-fire
  for (const b of st.wave.bosses) if (b.hp > 0) b.hp = 0;

  // Death -> (boss-XP drafts, auto-picked) -> portal cine -> FINALE (the
  // cine runs ~5.4s wall-clock on its own).
  const reached = pump(() => st.mode === 'finale', 60 * 40);
  assert(reached >= 0, 'END_WAVE boss death must hand off to the finale (mode=' + st.mode + ')');

  // (1) The sweep: ONLY the maw remains; no portal; the HUD announces it.
  pump(() => false, 2);   // HUD lags a frame
  assert(st.enemies.length === 1 && st.enemies[0].finalBoss,
    'the finale field must hold ONLY the maw (enemies=' + st.enemies.length + ')');
  assert(st.finalBoss === st.enemies[0], 'state.finalBoss must alias the enemies entry');
  assert(!st.portal, 'no portal once the finale starts');
  assert(st.chests.length === 0 && st.arches.length === 0, 'chests/arches must be swept');
  assert(/THE MAW OF THE HORDE 2\.50M/.test(hudText()),
    'HUD must announce the maw with an M-formatted hp: ' + hudText());

  // (2) The spawner stays silent; the hero's volley drains the display hp
  // (topping hp each frame keeps the probe's pilot alive through barrages).
  const maw = st.finalBoss;
  pump(() => false, 60 * 5, () => { st.player.hp = st.player.stats.maxHp; });
  assert(st.enemies.length === 1 && st.enemies[0] === maw,
    'no spawns during the finale (enemies=' + st.enemies.length + ')');
  assert(maw.hp < maw.maxHp && maw.hp >= 1,
    `the maw bar must drain but respect the floor (${maw.hp}/${maw.maxHp})`);

  // (3) A tagged barrage fires within GRACE + CYCLE (~6.5s from finale start).
  let sawVolley = false;
  pump(() => { sawVolley = st.enemyShots.some(s => s.volleyId !== undefined); return sawVolley; },
    60 * 12, () => { st.player.hp = st.player.stats.maxHp; });
  assert(sawVolley, 'the maw must fire a volleyId-tagged barrage');

  // (4)+(5) Mercy rule + 3-hit rule, deterministically: park frozen maw
  // rounds on the hero (maw teleported away so body contact can't interfere).
  {
    st.finalBoss.x = -600; st.finalBoss.y = -600;
    st.enemyShots.length = 0;
    const full = st.player.stats.maxHp;
    const third = Math.ceil(full / 3);
    const shot = (id) => st.enemyShots.push({
      x: st.player.x, y: st.player.y, vx: 0, vy: 0, damage: 0, age: 0, kind: 'maw', volleyId: id,
    });
    st.player.hp = full; st.player.invuln = 0; st.volleyMask = null;
    shot(77);
    now += dtMs; let cb = rafQueue.shift(); cb(now);
    assert(st.player.hp === full - third,
      `a volley's first hit must cost exactly ceil(maxHp/3) (${full} -> ${st.player.hp})`);
    st.player.invuln = 0;
    shot(77);   // SAME volleyId again
    now += dtMs; cb = rafQueue.shift(); cb(now);
    assert(st.player.hp === full - third,
      'the second hit of the SAME volley must pass harmlessly (mercy rule)');
    st.player.invuln = 0;
    shot(78);   // fresh volleyId
    now += dtMs; cb = rafQueue.shift(); cb(now);
    assert(st.player.hp === full - 2 * third, 'a NEW volleyId must bite again');
    st.player.invuln = 0;
    shot(79);
    now += dtMs; cb = rafQueue.shift(); cb(now);
    assert(st.mode === 'dead', 'three volley hits must kill the hero (mode=' + st.mode + ')');
    assert(elements['ov-title'].textContent === 'THE HORDE CLAIMS ALL',
      'finale death must show the distinct end card (got ' +
      elements['ov-title'].textContent + ')');
    let hasRetry = false;
    for (const c of elements['ov-cards'].children) {
      if ((c.innerHTML || '').includes('RETRY')) hasRetry = true;
    }
    assert(hasRetry, 'the finale end card must offer RETRY');
  }
  console.log('finale: sweep + silent spawner + mercy rule + 3-hit rule + end card verified');
}

// (4) INTRO SKIP: any key during the movie jumps straight to the title menu.
// Runs LAST on purpose: the fresh module re-import overwrites the shared
// keyHandler stub with a handler bound to the SECOND module's state.
{
  const m2 = await import(/* fresh instance */ '../src/main.js?skipintro');
  for (let i = 0; i < 3; i++) { now += dtMs; const cb = rafQueue.shift(); cb && cb(now); }
  assert(m2.__TEST.state.mode !== 'menu', 'fresh module should boot into the intro');
  keyHandler({ key: 'x' });
  for (let i = 0; i < 3; i++) { now += dtMs; const cb = rafQueue.shift(); cb && cb(now); }
  assert(m2.__TEST.state.mode === 'menu', 'any key must skip the intro to the menu');
  console.log('intro skip: keypress jumps straight to the HORDES menu');
}

// ---- WAVE-9B/2 area identity: ground theme ladder cycles by wave ----------
{
  const t1 = groundTheme(1), t2 = groundTheme(2), t3 = groundTheme(3), t7 = groundTheme(7);
  assert(t1.name === 'THE VERDANT HOLLOW' && t2.name === 'THE ASHEN WASTE' &&
    t3.name === 'THE SNOWFIELD', 'wave 1/2/3 must map to the first three themes');
  assert(t7.name === t1.name, 'the theme ladder must cycle (wave 7 == wave 1)');
  assert(groundTheme(4).name === 'THE BLOOD RUST' &&
    groundTheme(5).name === 'THE BONE DESERT' && groundTheme(6).name === 'THE VOID REACH',
    'themes 4/5/6 must complete the ladder');
  assert(new Set([1, 2, 3, 4, 5, 6].map(w => groundTheme(w).base)).size === 6,
    'every theme must have a distinct ground tone');
  // SNOWFIELD is Sk408's example: clearly the LIGHTEST area, but muted
  // grey (v2: the white version washed out the sprites).
  const lum = (hex) => parseInt(hex.slice(1, 3), 16);   // red channel is enough
  assert(lum(t3.base) > 70 && lum(t3.base) < 130 && lum(t1.base) < 40,
    'the snow theme base must be light grey vs the dark verdant base (not white)');
  console.log('ground themes: ' + [1, 2, 3, 4, 5, 6].map(w => groundTheme(w).name).join(' | '));
}

console.log('SMOKE TEST PASSED');
