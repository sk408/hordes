// HORDES — WAVE-26 FEATURE 1: DEATH AS PAYOFF.
// Run: node test/test_death_screen.mjs
//
// The death screen is the most-seen screen in a game where players lose most
// runs, so it must carry, in one 3-second read: how far they got, what killed
// them, what the run earned, and the shop row the run brought within reach.
// This test drives a REAL death through the real frame loop (a typed enemy
// parked on the hero) and asserts the rendered end screen, then checks the
// pure helpers, including the anti-fabrication rule (the "next unlock" is
// derived from the real SHOP_UPGRADES catalogue, never invented).
import assert from 'node:assert/strict';
import { SHOP_UPGRADES, upgradeCost, shopRowOwned } from '../src/meta.js';
import { boot, suite } from './_harness.mjs';
import { makeTypedEnemy } from '../src/enemy_types.js';

const S = suite('wave-26 death as payoff');
const h = await boot({
  storage: [['hordes_onboarded', '1']],
});
const { T, state, elements, pump } = h;

const ovSub = () => elements['ov-sub'].innerHTML;

// ---- pure: the CAUSE line ----------------------------------------------------
S.check('deathCauseLabel names the enemy type and how it killed you', () => {
  assert.equal(T.deathCauseLabel({ typeId: 'SPITTER', cause: 'shot' }), 'SPITTER at range');
  assert.equal(T.deathCauseLabel({ typeId: 'BRUTE', cause: 'contact' }), 'BRUTE in melee');
  assert.equal(T.deathCauseLabel({ typeId: 'TICK', cause: 'drain' }), 'TICK latched on and drained you');
});
S.check('a boss keeps its proper name', () => {
  assert.equal(T.deathCauseLabel({ name: 'VYRN, THE HERALD', cause: 'contact' }),
    'VYRN, THE HERALD in melee');
  assert.equal(T.deathCauseLabel({ bossId: 'MAW', cause: 'shot' }), 'MAW at range');
});
S.check('an unknown source degrades honestly instead of inventing one', () => {
  assert.equal(T.deathCauseLabel({ cause: 'unknown' }), 'THE HORDE');
  assert.equal(T.deathCauseLabel(null), 'THE HORDE');
});

// ---- pure: the goal line uses REAL shop data ---------------------------------
S.check('nextUnlockWithinReach is the cheapest NOT-OWNED row in SHOP_UPGRADES', () => {
  const profile = T.getProfile();
  const goal = T.nextUnlockWithinReach(profile);
  assert.ok(goal, 'a fresh profile has an unowned row');
  // Independent recomputation from the real catalogue.
  let cheapest = null;
  for (const def of SHOP_UPGRADES) {
    if (shopRowOwned(profile, def)) continue;
    const cost = def.kind ? def.baseCost : upgradeCost(def, profile.purchased[def.id] || 0);
    if (!cheapest || cost < cheapest.cost) cheapest = { id: def.id, name: def.name, cost };
  }
  assert.deepEqual(goal, cheapest, 'the helper matches the catalogue exactly');
  assert.ok(goal.name && goal.cost > 0, 'it carries a real name + price');
});
S.check('the goal advances as the player earns (never a static number)', () => {
  const profile = T.getProfile();
  const before = T.nextUnlockWithinReach(profile);
  const saved = profile.gold;
  profile.gold = before.cost + 1;                 // afford the current target
  const after = T.nextUnlockWithinReach(profile);
  assert.ok(after.cost >= before.cost, 'the target moves up, never down');
  profile.gold = saved;
});
S.check('a fully-owned catalogue yields NO goal line (no filler)', () => {
  const profile = T.getProfile();
  const snapshot = JSON.parse(JSON.stringify(profile.purchased));
  const wSnapshot = [...profile.unlockedWeapons];
  const eSnapshot = [...profile.unlockedElites];
  for (const def of SHOP_UPGRADES) {
    profile.purchased[def.id] = def.maxLevel;
    if (def.kind === 'weapon' && !profile.unlockedWeapons.includes(def.weaponId)) profile.unlockedWeapons.push(def.weaponId);
  }
  assert.equal(T.nextUnlockWithinReach(profile), null, 'nothing left to point at');
  profile.purchased = snapshot;
  profile.unlockedWeapons = wSnapshot;
  profile.unlockedElites = eSnapshot;
  assert.ok(T.nextUnlockWithinReach(profile), 'restored');
});

// ---- composition -------------------------------------------------------------
S.check('endScreenBody carries progress + cause + earnings + the next unlock', () => {
  const html = T.endScreenBody({
    lead: 'WAVE 5 · survived 151s · level 7 · 132 kills',
    cause: 'SPITTER at range', gold: 184, firstClear: false,
  });
  assert.ok(/WAVE 5/.test(html), 'wave reached');
  assert.ok(/survived 151s/.test(html), 'time survived');
  assert.ok(/KILLED BY SPITTER at range/.test(html), 'the legible cause');
  assert.ok(/GOLD EARNED: \+184/.test(html), 'gold earned');
  assert.ok(/BUY NEXT: /.test(html), 'the next purchase');
  // Still a short read, not a wall: lead, cause, gold, next.
  assert.ok(html.split('<br>').length <= 4, 'at most four lines without a breakdown');
});
S.check('a deliberate exit omits the killer line but keeps the payoff', () => {
  const html = T.endScreenBody({ lead: 'you called it at wave 2', cause: null, gold: 12, firstClear: false });
  assert.ok(!/KILLED BY/.test(html), 'no cause on a deliberate exit');
  assert.ok(/GOLD EARNED: \+12/.test(html) && /BUY NEXT: /.test(html), 'payoff intact');
});

// ---- integration: a REAL death through the real loop -------------------------
S.check('a real death shows the cause, the earnings and the next unlock', () => {
  T.startRun();
  pump(3);
  assert.equal(state.mode, 'playing', 'run live');
  const p = state.player;
  p.hp = 1;                 // one contact hit is fatal
  p.invuln = 0;
  // WAVE-28: the AUTO pilot auto-drinks below CONFIG.AUTOPILOT.AUTO_DRINK.
  // HP_FRACTION, so a charge in inventory would legitimately save this dip —
  // and this check is about the DEATH funnel, not about the pilot's potions.
  // Empty the inventory; every assertion below is unchanged.
  p.potions.hp = 0;
  state.spawnTimer = 999;   // no ambient spawns
  state.wave.endsAt = state.time + 9999;
  state.enemies.length = 0;
  state.gems.length = 0;
  // A real typed enemy parked exactly on the hero (speed 0: it cannot drift).
  const killer = makeTypedEnemy('SPITTER', p.x, p.y, state.time);
  killer.hp = killer.maxHp = 1e6;   // survives the hero's own volley
  killer.speed = 0;
  state.enemies.push(killer);

  pump(30, () => { state.enemies.forEach(e => { e.speed = 0; e.x = p.x; e.y = p.y; }); });
  // RETARGETED 2026-09-15 (G15 death movie): death no longer lands DIRECTLY
  // in 'dead' — it plays the short cinematic first, with the payoff overlay
  // composed by die() but HIDDEN. Same strength, new invariant: the movie is
  // up (mode + hidden overlay), then any key hands back and EVERY payoff
  // assertion below runs unchanged against the identical composed DOM.
  assert.equal(state.mode, 'death-cine', 'the hero died (the movie is playing)');
  assert.equal(elements.overlay.style.display, 'none', 'the payoff overlay is hidden during the movie');
  h.key('keydown', { key: 'x', preventDefault() {} });   // the skip contract
  assert.equal(state.mode, 'dead', 'the skip hands back to the payoff screen');
  assert.equal(elements.overlay.style.display, 'flex', 'the payoff overlay is revealed by the hand-off');
  assert.equal(state.deathBy.cause, 'contact', 'the damage source was recorded');
  assert.equal(state.deathBy.typeId, 'SPITTER', 'the killer was recorded');
  assert.equal(state.deathBy.wave, state.wave.num, 'the wave was recorded');

  const html = ovSub();
  assert.ok(/KILLED BY SPITTER in melee/.test(html), 'cause on screen (' + html + ')');
  assert.ok(/GOLD EARNED: \+\d+/.test(html), 'earnings on screen');
  assert.ok(/BUY NEXT: /.test(html), 'the next purchase on screen');
  assert.ok(/WAVE \d+/.test(html) && /TIME \d\d:\d\d/.test(html) && /LEVEL \d+/.test(html) && /\d+ KILLS/.test(html), 'progress on screen');
  assert.ok(/run award \d+ · survival \d+ · kills \d+/.test(html), 'the gold breakdown on screen');
  assert.ok(/\u00b7/.test(html) || /·/.test(html), 'single-line scannable layout');
  // RETRY is the first card (the default action); SHOP and TITLE follow.
  const cards = elements['ov-cards'].children;
  assert.ok((cards[0].innerHTML || '').includes('RETRY'), 'RETRY is the FIRST card');
  assert.ok((cards[1].innerHTML || '').includes('SHOP'), 'SHOP second');
  assert.ok(cards.length === 3 && (cards[2].innerHTML || '').includes('TITLE'), 'TITLE third, and nothing else (' + cards.length + ' cards)');
  assert.ok(![...cards].some(c => (c.innerHTML || '').includes('CONFIRM')), 'no armed confirm slows RETRY');
});

S.check('R retries straight from the death screen', () => {
  T.startRun();     // deterministic: same seam the R key calls
  pump(2);
  assert.equal(state.mode, 'playing', 'straight back in');
  assert.ok(state.wave.num >= 1, 'a fresh run');
});

// A quick first death: the run starts from the title or the pre-run screen
// (both leave the 'title' class, a transparent background and a top padding
// on the overlay) and ends before a draft or any other menu reset them. The
// end card then had no scrim and its summary sat under the buttons, off the
// bottom of a phone (measured in Chrome 2026-10-03: 72-150 px cut).
S.check('a run that ends before any other menu opened: the end card does not keep the title layout', () => {
  const ov = elements['overlay'];
  T.showTitle();
  assert.ok(ov.classList.contains('title'), 'fixture: the title layout is on');
  assert.equal(ov.style.background, 'transparent', 'fixture: the title is see-through');
  ov.style.paddingTop = '140px';        // what placeTitleMenu writes in a browser
  ov.style.justifyContent = 'flex-end'; // and what the gallery screens write
  T.startRun();
  pump(3);
  assert.ok(ov.classList.contains('title'), 'nothing reset it during the run');
  T.die();
  for (let i = 0; i < 8 && state.mode !== 'dead'; i++) { h.key('keydown', { key: 'x', preventDefault() {} }); pump(2); }
  assert.equal(state.mode, 'dead');
  assert.ok(ov.classList.contains('end'), 'the summary layout');
  for (const c of ['title', 'howto', 'draft', 'compact']) assert.ok(!ov.classList.contains(c), 'no ' + c + ' layout rides in');
  assert.equal(ov.style.background, '', 'the scrim is back');
  assert.equal(ov.style.paddingTop, '', 'no menu padding');
  assert.equal(ov.style.justifyContent, '', 'no menu alignment');
  assert.equal(ov.style.display, 'flex');
});

S.done();
