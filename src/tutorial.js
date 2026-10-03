// HORDES — the new-player tutorial: the guided first run, the menu steps after
// the first death, and the first-time hints. Pure logic, no DOM: main.js feeds
// it facts each frame and src/tutorial_ui.js paints what it says.
//
// THE RULES (docs/TUTORIAL.md):
//   1. One short sentence per step, pointing at the thing it is about.
//   2. A step ends when the player DOES the thing (or, for things the pilot
//      does, when it happens). Never by a click on the play field.
//   3. A panel's own button ignores any press that started before the panel
//      appeared or within GUARD_MS of it appearing.
//   4. No timer ends the tutorial or the run. The only clocks here delay a
//      step (MIN_READ_S) or serve the idle rule below.
//   5. SKIP takes two presses and ends every guided step, menu steps included.
//   6. THE IDLE RULE: a player who never touches anything still gets through.
//      A step that needs an action waits IDLE_WAIT_S of hands-off time, then
//      the pilot performs the action and the text changes to "Watch: ...".
//      The idle clock is reset while the player steers, so a player who is
//      driving is never moved on.

export const TUT = {
  GUARD_MS: 400,        // a press this soon after a panel appears is ignored
  MIN_READ_S: 2,        // an event step stays up at least this long
  IDLE_WAIT_S: 15,      // hands-off seconds before the pilot does it for you
  WATCH_S: 3,           // how long a "Watch: ..." line stays up
  SKIP_CONFIRM_S: 4,    // the second SKIP press must land within this
  MOVE_HOLD_S: 0.5,     // steering this long counts as having tried it
  HINT_IDLE_S: 20,      // a first-time hint nobody answers closes itself
  TRAINERS: 5,          // harmless enemies kept alive during the guided part
  HURT_FRAC: 0.4,       // HP the potion step leaves the hero on
};

// Ledger ids (the profile's one-time-banner ledger, save.js).
export const LEDGER = {
  cohort: 'tut:cohort',     // this profile started the guided run
  skipped: 'tut:skipped',   // SKIP confirmed: no guided or menu step again
  guided: 'tut:guided',     // the in-run part finished
  shopBuy: 'tut:shop_buy',  // bought something in the shop step
  play: 'tut:play',         // went back to PLAY after the shop
  run2: 'tut:run2',         // saw the second-run line
  hintsInit: 'tut:hints_init',
};

const moved = (f, s) => f.level > s.level || f.xp > s.xp;

// The guided first run, in order. text(touch) is the sentence; `targets` name
// what the ring points at (main.js resolves the names); `done` is the
// completion test over the frame's facts `f`, the facts at step entry `s` and
// the Guided instance `g`; `perform` is what the pilot does under the idle
// rule; `button` is the panel's own advance control, if it has one.
export const GUIDED_STEPS = [
  { id: 'hero', kind: 'event', targets: ['hero'],
    text: () => 'Your hero fights on their own. You build them.',
    done: (f, s) => f.kills > s.kills },
  { id: 'move', kind: 'action', targets: ['hero'], button: 'JUST WATCH',
    text: (touch) => (touch ? 'Drag anywhere to steer.' : 'Hold W A S D to steer.') +
      ' Let go and the pilot takes over.',
    watch: 'Watch: the pilot steers. Take the wheel any time.',
    perform: 'none',
    done: (f, s, g) => g.steerT >= TUT.MOVE_HOLD_S && !f.steering },
  { id: 'gems', kind: 'event', targets: ['xp'],
    text: () => 'Enemies drop gems. Gems fill the XP bar.',
    done: moved },
  { id: 'draft', kind: 'action', targets: ['cards'], button: 'NEXT', enter: 'levelup',
    text: () => 'Level up! Weapon cards add attacks; stat cards make you stronger.',
    done: (f, s, g) => g.sawDraft && !f.draft },
  { id: 'evolve', kind: 'action', targets: ['cards'],
    text: () => 'Weapon cards name their evolution partner. Pick 1 card.',
    watch: 'Watch: the pilot picks a card for you.',
    perform: 'draft',
    skipIf: (f, g) => g.sawDraft && !f.draft,
    done: (f, s, g) => g.sawDraft && !f.draft },
  { id: 'skill', kind: 'action', targets: ['mana', 'skillbtn'], enter: 'mana',
    text: (touch, names) => 'Skills cost mana. ' +
      (touch ? 'Tap ' + names.skill : 'Press Q') + ' to fire yours.',
    watch: 'Watch: the pilot fires your skill.',
    perform: 'skill',
    done: (f, s) => f.casts > s.casts },
  { id: 'potion', kind: 'action', targets: ['hp', 'potionbtn'], enter: 'hurt',
    text: (touch) => 'You are hurt. ' + (touch ? 'Tap HP' : 'Press H') + ' to drink a potion.',
    watch: 'Watch: the pilot drinks a potion.',
    perform: 'potion',
    done: (f, s) => f.drinks > s.drinks },
  { id: 'gold', kind: 'event', targets: ['gold'],
    text: () => 'Kills and time survived earn gold.',
    done: (f, s) => f.purse > s.purse || f.purse > 0 },
  { id: 'handover', kind: 'ack', targets: [], button: 'BEGIN',
    text: () => 'The horde will win this time. That is expected. Gold buys upgrades that last.',
    done: () => false },
];

// The menu steps after the first death. Each is shown on its own screen and
// ends when the player uses the thing it points at.
export const MENU_STEPS = {
  end: { id: 'end', targets: ['earn', 'shopcard'],
    text: () => 'You earned gold. Spend it in the SHOP.' },
  shop_buy: { id: 'shop_buy', targets: ['buycard'],
    text: () => 'Upgrades are permanent: every run from now on. Buy one.' },
  shop_back: { id: 'shop_back', targets: ['backcard'],
    text: () => 'Bought. Now go BACK and press PLAY.' },
  play: { id: 'play', targets: ['playcard'],
    text: () => 'Press PLAY. You are stronger now.' },
};

// First-time hints: one sentence, once per profile, when the thing first
// appears. `basic` hints are pre-marked for a returning profile (they have
// met these); the rest are new to everyone.
export const HINTS = {
  run2: { text: "Aim for a weapon's evolution: level it to 8 and hold its partner card.", guided: true },
  chest: { basic: true, text: 'Walk into a chest to open it.' },
  // M5b sites (the same sentences as sites.js SITE_HINTS).
  shrine: { text: 'Stand in the ring to charge a blessing; steering charges it 40% faster.' },
  altar: { text: 'Step on the altar to call the wave boss now and win an extra chest (waves 1-4).' },
  brazier: { text: 'Break braziers for gold and the odd potion; steering finds 50% more.' },
  fountain: { text: 'Stand in a fountain while hurt to heal once.' },
  statue: { text: 'Touch the statue to take its curse for this wave and win its reward.' },
  explore: { text: 'EXPLORE fights like AUTO and walks to sites when the field is calm.' },
  waypoint: { text: 'Tap a site on the map to set a waypoint; tap it again to clear it.' },
  // M5b slice 3: the vault, the yard, secrets and quests (first time each).
  vault: { text: 'A marked elite carries the vault key: kill it, grab the key, touch the vault.' },
  lever: { text: 'Pull the lever to open the walled yard and its chest for the rest of the run.' },
  crack: { text: 'Cracked walls break under fire: keep shooting one to find the niche behind it.' },
  mimic: { text: 'Some chests bite: a mimic wakes when opened, and pays a rare chest when it dies.' },
  glyph: { text: 'Each stage hides one glyph off the beaten track; find all eight for a reward.' },
  questboard: { text: 'The quest board picks three goals for each run; tap one to swap it, or just play.' },
  questtracker: { text: 'Your three quests sit under the timer; done ones pay at the end of the run.' },
  // Travel (the same sentence as travel.js TRAVEL_HINT).
  travel: { text: 'The portal leads on to a new stage: new ground and fresh sites. Your build comes with you.' },
  // Boss rules (the same sentence as boss_rules.js BOSS_RULE_HINT).
  bossrule: { text: 'This boss brings a rule. Beat the boss to win the reward on its banner.' },
  // M5b landscape: the first time a ramp is on screen.
  highground: { text: 'High ground: you see and hit farther. Enemies climb the ramps.' },
  arch: { basic: true, text: 'Run through an arch for a short buff.' },
  elite: { basic: true, text: 'Glowing enemies are elites: tougher, with better loot.' },
  midboss: { basic: true, text: 'A mid-boss. Kill it for a chest.' },
  boss: { basic: true, text: 'The wave boss. Kill it to open the portal.' },
  portal: { basic: true, text: 'The portal is open. Walk in to end the wave.' },
  escape: { basic: true, text: 'After the boss, your hero runs for the portal and banks escape gold.' },
  evoready: { text: 'This weapon is level 8 and you hold its partner: it evolves.' },
  fusion: { text: 'Two evolved weapons can fuse into one stronger weapon.' },
  draftacts: { text: 'Reroll, skip or banish: each spends one charge.' },
  stance: { text: 'Stance: SAFE keeps away, GREEDY chases loot.' },
  focus: { text: 'Focus picks which enemy your weapons aim at first.' },
  prerun: { basic: true, text: 'Pick a stage, or just press START.' },
  loadout: { text: 'You own a new weapon. LOADOUT chooses which ones you bring.' },
  prestige: { text: 'Prestige resets the shop for a permanent gold multiplier.' },
  hand: { text: 'Your cards made a hand: a bonus for the rest of the run.' },
  joker: { text: 'A joker changes one rule for this run.' },
  jokerfull: { text: 'Joker row full: a new joker replaces one you hold.' },
  camp: { text: 'Camp buildings work while you are away. COLLECT takes what they made.' },
  bgplay: { text: 'AUTO kept playing while the tab was hidden. Settings: KEEP PLAYING.' },
};

export function wordCount(text) { return String(text).trim().split(/\s+/).length; }

// Words a new player reads before the handover ends (desktop wording), and
// the longest single step.
export function guidedWordStats(touch = false) {
  const names = { skill: 'FROST' };
  const counts = GUIDED_STEPS.map(s => wordCount(s.text(touch, names)));
  return { total: counts.reduce((a, b) => a + b, 0), longest: Math.max(...counts), counts };
}

// Rule 3: may a press that went down at `downMs` activate a panel that
// appeared at `shownMs`?
export function pressAllowed(shownMs, downMs) {
  return Number.isFinite(shownMs) && Number.isFinite(downMs) && downMs - shownMs >= TUT.GUARD_MS;
}

// ---------------------------------------------------------------------------
// The guided run. tick() is called every frame the run is live (playing or in
// the draft); `f` is { kills, level, xp, draft, casts, drinks, purse, steering }.
// `fx` receives enter(step), perform(kind) and end(why).
// ---------------------------------------------------------------------------
export class Guided {
  constructor({ touch = false, names = { skill: 'FROST' }, steps = GUIDED_STEPS } = {}) {
    this.steps = steps;
    this.touch = touch;
    this.names = names;
    this.i = 0;
    this.over = false;
    this.skipped = false;
    this.skipArmT = 0;
    this.sawDraft = false;
    this.elapsed = 0;       // wall seconds the guided part has run
    this._reset();
  }

  _reset() {
    this.entered = false;
    this.snap = null;
    this.stepT = 0;
    this.idleT = 0;
    this.steerT = 0;
    this.watch = false;
    this.watchT = 0;
    this.performed = false;
    this.shownMs = NaN;
  }

  get step() { return this.over ? null : this.steps[this.i]; }

  // What the panel shows right now, or null.
  panel() {
    const s = this.step;
    if (!s || !this.entered) return null;
    return {
      id: s.id,
      n: this.i + 1, of: this.steps.length,
      text: this.watch ? s.watch : s.text(this.touch, this.names),
      targets: s.targets,
      button: this.watch ? null : (s.button || null),
      skip: this.skipArmT > 0 ? 'TAP AGAIN TO SKIP' : 'SKIP TUTORIAL',
      shownMs: this.shownMs,
    };
  }

  tick(dt, f, nowMs, fx) {
    if (this.over) return;
    this.elapsed += dt;
    if (this.skipArmT > 0) this.skipArmT = Math.max(0, this.skipArmT - dt);
    if (f.draft) this.sawDraft = true;
    let s = this.step;
    // A step whose moment has already passed is not shown at all.
    while (!this.entered && s && s.skipIf && s.skipIf(f, this)) {
      this.i++;
      if (this.i >= this.steps.length) { this._finish('done', fx); return; }
      s = this.step;
    }
    if (!this.entered) {
      this.entered = true;
      this.snap = { ...f };
      this.shownMs = nowMs;
      if (s.enter) fx.enter(s.enter);
    }
    this.stepT += dt;
    // The idle clock runs only while the player is hands-off (rule 6).
    if (f.steering) { this.idleT = 0; this.steerT += dt; }
    else this.idleT += dt;

    if (this.watch) {
      if (!this.performed) { this.performed = true; fx.perform(s.perform); }
      this.watchT += dt;
      if (this.watchT >= TUT.WATCH_S) this._advance(fx);
      return;
    }
    const minRead = s.kind === 'event' ? TUT.MIN_READ_S : 0;
    if (this.stepT >= minRead && s.done(f, this.snap, this)) { this._advance(fx); return; }
    if (this.idleT >= TUT.IDLE_WAIT_S) {
      if (s.perform) {
        this.watch = true; this.watchT = 0; this.performed = false;
        this.shownMs = nowMs;
      } else {
        this._advance(fx);   // nothing to perform: the idle player is moved on
      }
    }
  }

  // The panel's own button. `downMs` is when the press went down.
  press(downMs, fx) {
    const s = this.step;
    if (!s || !this.entered || this.watch || !s.button) return false;
    if (!pressAllowed(this.shownMs, downMs)) return false;
    this._advance(fx);
    return true;
  }

  // SKIP: the first press arms it, the second (inside SKIP_CONFIRM_S) confirms.
  skipPress(downMs, fx) {
    if (this.over || !this.entered) return null;
    if (!pressAllowed(this.shownMs, downMs)) return null;
    if (!(this.skipArmT > 0)) { this.skipArmT = TUT.SKIP_CONFIRM_S; return 'armed'; }
    this.skipArmT = 0;
    this.skipped = true;
    this._finish('skip', fx);
    return 'skipped';
  }

  _advance(fx) {
    this.i++;
    this._reset();
    if (this.i >= this.steps.length) this._finish('done', fx);
  }

  _finish(why, fx) {
    if (this.over) return;
    this.over = true;
    fx.end(why);
  }
}

// ---------------------------------------------------------------------------
// Which menu step belongs on this screen? `seen(id)` reads the ledger.
// `canBuy` is whether the shop has a row the player can afford.
// ---------------------------------------------------------------------------
export function menuStepFor(screen, seen, { canBuy = true } = {}) {
  if (!seen(LEDGER.cohort) || seen(LEDGER.skipped) || seen(LEDGER.play)) return null;
  if (!seen(LEDGER.shopBuy)) {
    if (screen === 'end') return MENU_STEPS.end;
    if (screen === 'shop' && canBuy) return MENU_STEPS.shop_buy;
    return null;
  }
  if (screen === 'shop') return MENU_STEPS.shop_back;
  if (screen === 'title') return MENU_STEPS.play;
  return null;
}

// ---------------------------------------------------------------------------
// First-time hints. One at a time; each is marked seen the moment it shows.
// ---------------------------------------------------------------------------
export class HintBook {
  constructor({ seen, mark, enabled }) {
    this.seen = seen;
    this.mark = mark;
    this.enabled = enabled;
    this.active = null;   // { id, text, targets, shownMs, idleT }
  }

  // A returning profile has met the basics already.
  init(isReturning) {
    if (this.seen(LEDGER.hintsInit)) return;
    this.mark(LEDGER.hintsInit);
    if (!isReturning) return;
    for (const [id, h] of Object.entries(HINTS)) if (h.basic) this.mark('hint:' + id);
  }

  wants(id) {
    const h = HINTS[id];
    if (!h || this.active) return false;
    if (!h.guided && !this.enabled()) return false;
    return !this.seen('hint:' + id);
  }

  // Show hint `id` (once per profile). Returns true when it went up.
  offer(id, targets, nowMs) {
    if (!this.wants(id)) return false;
    this.mark('hint:' + id);
    this.active = { id, text: HINTS[id].text, targets: targets || [], shownMs: nowMs, idleT: 0 };
    return true;
  }

  panel() {
    const a = this.active;
    return a ? { id: 'hint:' + a.id, text: a.text, targets: a.targets, button: 'GOT IT',
      skip: null, shownMs: a.shownMs } : null;
  }

  tick(dt, steering) {
    const a = this.active;
    if (!a) return;
    a.idleT = steering ? 0 : a.idleT + dt;
    if (a.idleT >= TUT.HINT_IDLE_S) this.active = null;
  }

  press(downMs) {
    const a = this.active;
    if (!a || !pressAllowed(a.shownMs, downMs)) return false;
    this.active = null;
    return true;
  }
}

// The reference manual's first page: one short section per tutorial step.
export function manualSections(touch = false) {
  const names = { skill: 'your skill button' };
  const g = Object.fromEntries(GUIDED_STEPS.map(s => [s.id, s.text(touch, names)]));
  return [
    ['YOUR HERO', g.hero],
    ['MOVING', g.move],
    ['GEMS AND XP', g.gems],
    ['LEVEL UP', g.draft + ' ' + g.evolve],
    ['SKILLS', g.skill],
    ['POTIONS', g.potion.replace('You are hurt. ', 'When hurt: ')],
    ['GOLD', g.gold + ' ' + MENU_STEPS.shop_buy.text().replace(' Buy one.', '')],
    ['DYING', 'The horde wins most early runs. That is expected: you keep the gold.'],
    ['EVOLUTIONS', HINTS.run2.text],
  ];
}
