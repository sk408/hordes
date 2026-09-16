// REMOVE THE IN-RUN OBJECT LABELS (owner 2026-09-16, msg_01M2NYWC5P6306AFR8ND4TV71S):
// "The on screen labels for arch and shrine are a bit annoying, and sometimes
// they persist after the run.. let's get rid of them."
//
// The ObjectTags layer (chest / portal / arch / shrine floating labels + edge
// arrows + fade timers + per-run seen-state) is REMOVED, not flagged off —
// nothing object-related is drawn over the field during play, and nothing can
// resurrect it. This file pins:
//   1. NEVER MOUNTED: with every object type present around the player, not
//      one frame of real play mounts any tag element (the old layer mounted
//      on first sighting — this assertion was RED against it);
//   2. NO SURVIVORS: after DEATH, after VICTORY (RUN SURVIVED), after RETURN
//      TO TITLE, after a RESTART, and across MODE CHANGES, no tag element
//      exists in the document — the reported persistence fault, now
//      structurally impossible (the layer that created the elements is gone);
//   3. NO RESURRECTION: updateOnboarding keeps ticking through all of it and
//      cannot re-create a label (its arming — TAG_SOURCES / maybeTags /
//      objTags — is deleted from the shipped source, pinned here);
//   4. THE FIELD reference page SURVIVES: object knowledge stays documented
//      (chests, portal, arches, shrines) — that page is the single teaching
//      surface for objects now.
// Run: node test/test_notags.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { boot, suite } from './_harness.mjs';

const s = suite('test_notags');
const { T, state: st, elements, pump, key } = await boot({ storage: [['hordes_onboarded', '1']] });
const body = globalThis.document.body;
const tagEls = () => (body.children || []).filter(c =>
  typeof c.id === 'string' && c.id.startsWith('tag-'));

function step(n = 1) {
  for (let i = 0; i < n; i++) {
    pump(1);
    if (st.mode === 'draft') { const card = (elements['ov-cards'].children || [])[0]; if (card && card.click) card.click(); }
  }
}
function leg() {
  T.startRun();
  T.setPilotMode('MANUAL');
  st.player.stats.xpMult = 0;
  st.player.stats.maxHp = 1e9; st.player.hp = 1e9;   // nothing ends the leg early
}

// ---- 1. NEVER MOUNTED, NOT ONE FRAME ---------------------------------------------
leg();
st.chests.push({ x: st.player.x + 40, y: st.player.y, age: 0 });   // in view
st.portal = { x: st.player.x + 80, y: st.player.y, age: 0 };       // in view
// shrines/arches seed with the run (the world's own, off-view); every object
// type the old layer labeled is either pushed above or already live.
{
  let mounted = 0;
  for (let i = 0; i < 60 * 12; i++) {   // 12s of real play, every frame read
    step(1);
    mounted += tagEls().length;
  }
  s.check('no object label EVER mounts during play (chest+portal present, 12s)', () => {
    assert.equal(mounted, 0, mounted + ' tag-element frames mounted');
  });
  // updateOnboarding keeps ticking through the objects being there: the
  // arming itself is gone, not merely the timing.
  s.check('updateOnboarding cannot re-create a label (objects present, strip live)', () => {
    assert.equal(tagEls().length, 0);
    assert.ok(st.time > 10, 'the sim ran the whole leg');
  });
}

// ---- 2. NO SURVIVORS across every way a run ends ----------------------------------
// DEATH (T.die — the run's real ending seam, test_audit_fixes precedent; a
// contact death is not used because the leg's forced portal stops spawning).
{
  T.die();
  step(5);
  s.check('after DEATH no tag element exists in the document', () => {
    assert.ok(st.mode === 'death-cine' || st.mode === 'dead', st.mode);
    assert.equal(tagEls().length, 0, tagEls().map(e => e.id));
  });
  if (st.mode === 'death-cine') key('keydown', { key: 'x', preventDefault() {} });   // skip the movie
  step(5);
  step(60 * 8);   // park on the death screen a while — nothing fades in late
  s.check('the death screen stays label-free over time', () => {
    assert.equal(tagEls().length, 0);
  });
  // RETURN TO TITLE (the 't' key on the dead screen — the real path).
  key('keydown', { key: 't', preventDefault() {} });
  step(5);
  s.check('after RETURN TO TITLE no tag element exists', () => {
    assert.equal(st.mode, 'title', st.mode);
    assert.equal(tagEls().length, 0, tagEls().map(e => e.id));
  });
}
// RESTART + VICTORY + MODE CHANGES.
{
  leg();
  st.chests.push({ x: st.player.x + 40, y: st.player.y, age: 0 });
  step(60);   // play resumes around the objects
  s.check('after a RESTART no tag element exists (fresh run, objects present)', () => {
    assert.equal(tagEls().length, 0);
  });
  // VICTORY: the run's own survived ending (RUN SURVIVED).
  T.run.runSurvived();
  step(5);
  s.check('after VICTORY (RUN SURVIVED) no tag element exists', () => {
    assert.equal(st.mode, 'dead', st.mode);
    assert.ok(st.runWon, 'the victory ending fired');
    assert.equal(tagEls().length, 0, tagEls().map(e => e.id));
  });
  // MODE CHANGES: pause (settings) and portal entry (intermission) — real,
  // deterministic paths; the frame loop ticks updateOnboarding throughout
  // and nothing mounts anywhere.
  T.showTitle();
  leg();
  const modes = new Set([st.mode]);
  step(60 * 5);   // plain play
  modes.add(st.mode);
  key('keydown', { key: 'escape', preventDefault() {} });   // pause mid-run
  step(5);
  modes.add(st.mode);
  assert.equal(tagEls().length, 0, 'a tag mounted in mode ' + st.mode);
  key('keydown', { key: 'escape', preventDefault() {} });   // resume
  step(5);
  modes.add(st.mode);
  st.portal = { x: st.player.x + 5, y: st.player.y, age: 0 };   // walk-in range
  for (let i = 0; i < 60 * 5 && st.mode === 'playing'; i++) {
    step(1);
    assert.equal(tagEls().length, 0, 'a tag mounted in mode ' + st.mode);
  }
  modes.add(st.mode);
  s.check('across MODE CHANGES (playing/settings/intermission) no tag element ever appears', () => {
    assert.ok(modes.has('settings') || modes.has('paused') || modes.size >= 2, [...modes].join(','));
    assert.ok(modes.has('intermission'), 'the portal was entered: ' + [...modes].join(','));
    assert.equal(tagEls().length, 0);
  });
}

// ---- 3. NO RESURRECTION at the source ---------------------------------------------
s.check('the shipped source carries no object-label machinery (gone, not flagged off)', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  for (const sym of ['objTags', 'TAG_SOURCES', 'maybeTags', 'tagSeenRun']) {
    assert.ok(!main.includes(sym), 'main.js still references ' + sym);
  }
  const ob = readFileSync(new URL('../src/onboarding.js', import.meta.url), 'utf8');
  assert.ok(!ob.includes('class ObjectTags'), 'the ObjectTags class still exists');
  assert.ok(!ob.includes('TAG_FADE_S'), 'the tag fade timer still exists');
});

// ---- 4. THE FIELD reference page survives -----------------------------------------
// RETARGETED 2026-09-16 (help mode): the object copy moved into the
// OBJECT_HELP table so the reference's THE FIELD card and the help-mode
// world-object picks read ONE source. The card now renders FROM the table,
// so the pin walks the table (same words, same guarantee: the objects stay
// documented in the reference).
s.check('object knowledge stays in the reference: THE FIELD still documents the objects', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const t = main.indexOf('const OBJECT_HELP = [');
  assert.ok(t > 0, 'the OBJECT_HELP table exists');
  const table = main.slice(t, main.indexOf('\n];', t));
  for (const word of ['chests', 'portal', 'arches', 'shrines']) {
    assert.ok(table.includes(word), 'OBJECT_HELP no longer documents ' + word);
  }
  const i = main.indexOf("menuCard('THE FIELD'");
  assert.ok(i > 0, 'the THE FIELD card exists');
  const card = main.slice(i, main.indexOf('menuCard', i + 10));
  assert.ok(card.includes('OBJECT_HELP'),
    'the THE FIELD card must render FROM the table (no forked strings)');
});

s.done();
