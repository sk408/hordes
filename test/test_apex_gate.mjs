// Apex gate stickiness: once unlocked (or once an apex item is owned) the
// panel and its ON/OFF toggle stay reachable when the catalogue grows.
// Run: node test/test_apex_gate.mjs
import assert from 'node:assert/strict';
import { boot, suite } from './_harness.mjs';
import * as meta from '../src/meta.js';

const s = suite('test_apex_gate');
function complete(p) {
  p.gold = 1e12;
  for (const def of meta.SHOP_UPGRADES) {
    let guard = 0;
    while (!meta.shopRowOwned(p, def) && meta.buyUpgrade(p, def.id)) {
      if (++guard > 100) throw new Error('runaway buy loop on ' + def.id);
    }
  }
}
// Simulates a catalogue row added after the player finished: un-own one row.
function growCatalogue(p) {
  const def = meta.SHOP_UPGRADES.find(d => !d.kind && p.purchased[d.id] > 0);
  p.purchased[def.id] = 0;
  assert.equal(meta.apexCatalogueComplete(p), false, 'fixture: catalogue incomplete again');
}

s.check('fresh profile: gate closed, nothing latches', () => {
  const p = meta.makeProfile();
  assert.equal(meta.apexUnlocked(p), false);
  assert.equal(meta.latchApexUnlock(p), false);
  assert.equal(p.apex.unlocked, undefined);
});

s.check('a latched unlock survives new catalogue rows', () => {
  const p = meta.makeProfile();
  complete(p);
  assert.equal(meta.latchApexUnlock(p), true, 'first latch reports true');
  assert.equal(meta.latchApexUnlock(p), false, 'second latch is a no-op');
  growCatalogue(p);
  assert.equal(meta.apexUnlocked(p), true);
  assert.equal(meta.buyApex(p, 'apex_mark'), true, 'buying still works');
});

s.check('owning an apex item keeps the gate open without the latch', () => {
  const p = meta.makeProfile();
  p.apex.owned.push('apex_mark');
  assert.equal(meta.apexUnlocked(p), true);
  const q = meta.makeProfile();
  q.apex.owned.push('not_a_real_apex_id');
  assert.equal(meta.apexUnlocked(q), false, 'unknown ids do not open it');
});

const h = await boot({ storage: [['hordes_onboarded', '1']] });
const { T, elements } = h;
const cards = () => (elements['ov-cards'].children || []);
const text = (c) => String(c._html || '').replace(/<[^>]*>/g, ' ');

s.check('the shop latches the unlock and save validation keeps it', () => {
  const p = T.getProfile();
  complete(p);
  T.shop.open();   // renders the shop, which latches
  assert.equal(p.apex.unlocked, true);
  const v = meta.validateProfile(JSON.parse(JSON.stringify(p)));
  assert.ok(!v.repairs.some(r => r.startsWith('apex')), 'no apex repair');
  assert.equal(v.profile.apex.unlocked, true);
  assert.equal(meta.validateProfile(meta.makeProfile()).profile.apex.unlocked, undefined);
  growCatalogue(p);
  T.shop.open();
  assert.ok(cards().some(c => /^\s*APEX\b/.test(text(c))), 'APEX door still rendered');
});

s.check('real UI: an apex owner with an incomplete catalogue reaches the toggle', () => {
  const p = T.getProfile();
  delete p.apex.unlocked;
  p.apex.owned = ['apex_mark'];
  p.apex.enabled = true;
  T.shop.open();
  const door = cards().find(c => /^\s*APEX\b/.test(text(c)));
  assert.ok(door, 'APEX door rendered for an owner');
  door.click();
  const toggle = cards().find(c => /APEX ON/.test(text(c)));
  assert.ok(toggle, 'the toggle card is present and reads ON');
  toggle.click();
  assert.equal(meta.apexEnabled(p), false, 'one click turns apex OFF');
});
s.done();
